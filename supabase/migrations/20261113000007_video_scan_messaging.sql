-- Video adverts, automatic media scanning, and buyer-seller messaging.

-- ================================================================ video adverts
-- get_ads now also says whether the creative is an image or a video.
drop function public.get_ads(text, text, text, integer);
create function public.get_ads(p_placement text, p_city text, p_viewer_key text, p_limit integer default 1)
returns table (campaign_id uuid, headline text, description text, cta text, media_path text,
               target_type text, target_id uuid, placement text, sponsored boolean, format text)
language sql stable security definer set search_path = public as $$
  select c.id, r.headline, r.description, r.cta, r.media_path, c.target_type, c.target_id, c.placement, true, c.format
  from public.campaigns c
  join public.campaign_revisions r on r.campaign_id = c.id and r.is_live and r.review = 'approved'
  where c.status = 'live'
    and current_date between c.start_date and c.end_date
    and c.placement = p_placement
    and c.impressions_delivered < c.impressions_bought
    and (c.city is null or c.city = p_city)
    and coalesce((select f.shown from public.ad_frequency f
                   where f.campaign_id = c.id and f.viewer_key = p_viewer_key and f.day = current_date), 0) < c.frequency_cap
  order by (c.impressions_delivered::numeric / c.impressions_bought)
           - ((current_date - c.start_date + 1)::numeric / (c.end_date - c.start_date + 1)) asc,
           random()
  limit greatest(1, least(coalesce(p_limit, 1), 5));
$$;
grant execute on function public.get_ads(text, text, text, integer) to anon, authenticated;

-- A creative may only point at a file in the advertiser's own folder (or the HQ user's, for managed campaigns),
-- and a video campaign must have a video.
create function public._check_revision_media() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_format text; v_owner uuid; v_folder text;
begin
  select c.format, a.owner_id into v_format, v_owner
    from public.campaigns c join public.ad_accounts a on a.id = c.account_id where c.id = new.campaign_id;
  if v_format = 'video' and new.media_path is null then raise exception 'video_required'; end if;
  if new.media_path is not null then
    v_folder := split_part(new.media_path, '/', 1);
    if v_folder is distinct from v_owner::text and v_folder is distinct from auth.uid()::text then
      raise exception 'media_not_yours' using errcode = '42501';
    end if;
    if new.media_path !~* '\.(jpg|jpeg|png|webp|mp4|mov)$' then raise exception 'media_type_not_allowed'; end if;
    if v_format = 'video' and new.media_path !~* '\.(mp4|mov)$' then raise exception 'video_required'; end if;
    if v_format = 'image' and new.media_path !~* '\.(jpg|jpeg|png|webp)$' then raise exception 'image_required'; end if;
  end if;
  return new;
end $$;
create trigger campaign_revisions_media_check before insert on public.campaign_revisions
  for each row execute function public._check_revision_media();

-- Size and type limits on the public bucket (Supabase only).
do $$
begin
  if to_regnamespace('storage') is not null and to_regclass('storage.buckets') is not null then
    update storage.buckets set file_size_limit = 26214400,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
      where id = 'ad-media';
    update storage.buckets set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
      where id = 'payment-proofs';
  end if;
end $$;

-- ================================================================ automatic media scanning
alter table public.promote_settings add column require_media_scan boolean not null default false;

create table public.media_scans (
  id           uuid primary key default gen_random_uuid(),
  revision_id  uuid not null unique references public.campaign_revisions(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  media_path   text not null,
  status       text not null default 'pending' check (status in ('pending', 'passed', 'flagged', 'error')),
  reasons      text[] not null default '{}',
  sha256       text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  detail       jsonb not null default '{}'::jsonb,
  scanned_at   timestamptz,
  cleared_by   uuid references public.profiles(id),
  cleared_reason text,
  created_at   timestamptz not null default now()
);
create index media_scans_campaign_idx on public.media_scans (campaign_id);

-- Files HQ has decided must never be advertised again (matched by SHA-256 of the file).
create table public.blocked_media (
  sha256       text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  reason       text not null,
  blocked_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create function public._queue_media_scan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.media_path is not null then
    insert into public.media_scans (revision_id, campaign_id, media_path) values (new.id, new.campaign_id, new.media_path);
  end if;
  return new;
end $$;
create trigger campaign_revisions_queue_scan after insert on public.campaign_revisions
  for each row execute function public._queue_media_scan();

-- Called only by the scan-media function with the service key.
create function public.record_media_scan(p_revision uuid, p_status text, p_sha256 text, p_reasons text[], p_detail jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text := p_status; v_reasons text[] := coalesce(p_reasons, '{}'); s public.media_scans;
begin
  if p_status not in ('passed', 'flagged', 'error') then raise exception 'invalid_status'; end if;
  select * into s from public.media_scans where revision_id = p_revision for update;
  if not found then raise exception 'scan_not_found'; end if;
  if p_sha256 is not null and exists (select 1 from public.blocked_media where sha256 = p_sha256) then
    v_status := 'flagged';
    v_reasons := array_append(v_reasons, 'blocked_file');
  end if;
  if v_status = 'flagged' and cardinality(v_reasons) = 0 then v_reasons := array['flagged']; end if;
  update public.media_scans set status = v_status, reasons = v_reasons, sha256 = p_sha256,
         detail = coalesce(p_detail, '{}'::jsonb), scanned_at = now(), cleared_by = null, cleared_reason = null
   where id = s.id;
  return v_status;
end $$;
revoke all on function public.record_media_scan(uuid, text, text, text[], jsonb) from public, anon, authenticated;
grant execute on function public.record_media_scan(uuid, text, text, text[], jsonb) to service_role;

-- HQ overrides a flag after looking at the file themselves.
create function public.hq_clear_media_scan(p_campaign uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found then raise exception 'campaign_not_found'; end if;
  if not public.is_staff(c.country_code, array['ops']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update public.media_scans set status = 'passed', cleared_by = auth.uid(), cleared_reason = trim(p_reason)
   where campaign_id = c.id and revision_id in (select id from public.campaign_revisions where campaign_id = c.id and is_live);
  if not found then raise exception 'scan_not_found'; end if;
  perform public.write_audit('media.clear', 'campaign', c.id::text, c.country_code, '{}'::jsonb, p_reason);
end $$;

-- HQ bans a file: it is flagged now and any future upload of the same file is flagged automatically.
create function public.hq_block_media(p_campaign uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.campaigns; s public.media_scans;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found then raise exception 'campaign_not_found'; end if;
  if not public.is_staff(c.country_code, array['ops']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select s2.* into s from public.media_scans s2
    join public.campaign_revisions r on r.id = s2.revision_id and r.is_live
   where s2.campaign_id = c.id;
  if not found then raise exception 'scan_not_found'; end if;
  if s.sha256 is null then raise exception 'media_not_scanned_yet'; end if;
  insert into public.blocked_media (sha256, reason, blocked_by) values (s.sha256, trim(p_reason), auth.uid())
    on conflict (sha256) do nothing;
  update public.media_scans set status = 'flagged', reasons = array_append(reasons, 'blocked_file'), cleared_by = null, cleared_reason = null
   where id = s.id;
  perform public.write_audit('media.block', 'campaign', c.id::text, c.country_code, jsonb_build_object('sha256', s.sha256), p_reason);
end $$;

-- Approval is refused while the live creative is flagged, and (if the country requires it) until it has passed.
create or replace function public.hq_review_campaign(p_campaign uuid, p_decision text, p_policy_rule text default null, p_reason text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare c public.campaigns; i public.invoices; v_new text; v_dec text; v_scan text; v_require boolean;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if not public.is_staff(c.country_code, array['ops']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if c.status <> 'pending_review' then raise exception 'not_pending_review'; end if;
  select * into i from public.invoices where campaign_id = c.id;

  if p_decision = 'approve' then
    select s.status into v_scan from public.media_scans s
      join public.campaign_revisions r on r.id = s.revision_id and r.is_live where s.campaign_id = c.id;
    select coalesce(ps.require_media_scan, false) into v_require from public.promote_settings ps where ps.country_code = c.country_code;
    if v_scan = 'flagged' then raise exception 'media_flagged'; end if;
    if v_scan is not null and coalesce(v_require, false) and v_scan <> 'passed' then raise exception 'media_scan_not_passed'; end if;
    v_new := case when i.status = 'verified' then 'scheduled' else 'approved_awaiting_payment' end;
    v_dec := 'approved';
    update public.campaign_revisions set review = 'approved' where campaign_id = c.id and is_live;
  elsif p_decision = 'reject' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
    v_new := 'rejected'; v_dec := 'rejected';
    update public.campaign_revisions set review = 'rejected' where campaign_id = c.id and is_live;
  elsif p_decision = 'changes' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
    v_new := 'changes_requested'; v_dec := 'changes_requested';
    update public.campaign_revisions set review = 'changes_requested' where campaign_id = c.id and is_live;
  else
    raise exception 'invalid_decision';
  end if;

  insert into public.moderation_cases (campaign_id, reviewer_id, decision, policy_rule, reason)
  values (c.id, auth.uid(), v_dec, p_policy_rule, p_reason);
  update public.campaigns set status = v_new, updated_at = now() where id = c.id;
  if v_new = 'rejected' then perform public._release_unused(c.id); end if;
  if v_new = 'scheduled' then
    perform public._maybe_go_live(c.id);
    select status into v_new from public.campaigns where id = c.id;
  end if;
  perform public.write_audit('campaign.review', 'campaign', c.id::text, c.country_code,
    jsonb_build_object('decision', p_decision, 'rule', p_policy_rule), p_reason);
  return v_new;
end $$;

revoke all on table public.media_scans, public.blocked_media from public, anon, authenticated;
alter table public.media_scans enable row level security;
alter table public.blocked_media enable row level security;
grant select on public.media_scans to authenticated;
create policy media_scans_read on public.media_scans for select to authenticated
  using (exists (select 1 from public.campaigns c join public.ad_accounts a on a.id = c.account_id
                  where c.id = campaign_id and (a.owner_id = auth.uid() or public.is_staff(c.country_code, array['ops', 'support']))));
revoke all on function public.hq_clear_media_scan(uuid, text), public.hq_block_media(uuid, text) from public, anon;
grant execute on function public.hq_clear_media_scan(uuid, text), public.hq_block_media(uuid, text) to authenticated;
grant execute on function public.hq_review_campaign(uuid, text, text, text) to authenticated;

-- ================================================================ buyer-seller messaging
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  listing_type    text not null check (listing_type in ('product', 'service')),
  listing_id      uuid not null,
  listing_title   text not null,
  country_code    text not null references public.countries(code),
  buyer_id        uuid not null references public.profiles(id) on delete cascade,
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  buyer_name      text not null default '',
  seller_name     text not null default '',
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_sender_id  uuid references public.profiles(id),
  last_preview    text not null default '',
  buyer_read_at   timestamptz not null default now(),
  seller_read_at  timestamptz not null default now(),
  unique (listing_type, listing_id, buyer_id),
  check (buyer_id <> seller_id)
);
create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at, id);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.message_reports (
  id               uuid primary key default gen_random_uuid(),
  message_id       uuid not null references public.messages(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  country_code     text not null,
  reporter_id      uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reporter_name    text not null default '',
  reported_name    text not null default '',
  reason           text not null check (char_length(reason) between 3 and 500),
  context          jsonb not null default '[]'::jsonb,
  status           text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolution       text,
  resolved_by      uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  unique (message_id, reporter_id)
);

alter table public.notifications add column conversation_id uuid references public.conversations(id) on delete cascade;

create function public._blocked_between(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
revoke all on function public._blocked_between(uuid, uuid) from public, anon, authenticated;

create function public._send_message(p_conv uuid, p_sender uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c public.conversations; v_body text := trim(coalesce(p_body, '')); v_id uuid; v_to uuid; v_name text;
begin
  select * into c from public.conversations where id = p_conv for update;
  if not found or p_sender not in (c.buyer_id, c.seller_id) then raise exception 'conversation_not_found'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'invalid_message'; end if;
  v_to := case when p_sender = c.buyer_id then c.seller_id else c.buyer_id end;
  if public._blocked_between(p_sender, v_to) then raise exception 'blocked'; end if;
  if (select count(*) from public.messages where sender_id = p_sender and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limited';
  end if;

  insert into public.messages (conversation_id, sender_id, body) values (c.id, p_sender, v_body) returning id into v_id;
  update public.conversations set last_message_at = now(), last_sender_id = p_sender, last_preview = left(v_body, 80),
         buyer_read_at = case when p_sender = buyer_id then now() else buyer_read_at end,
         seller_read_at = case when p_sender = seller_id then now() else seller_read_at end
   where id = c.id;

  -- one unread alert per conversation, so a burst of messages is not a burst of pushes and emails
  if not exists (select 1 from public.notifications where user_id = v_to and conversation_id = c.id and not read) then
    select coalesce(nullif(full_name, ''), 'Someone') into v_name from public.profiles where id = p_sender;
    insert into public.notifications (user_id, title, body, conversation_id)
    values (v_to, 'New message', v_name || ' sent you a message about "' || left(c.listing_title, 60) || '".', c.id);
  end if;
  return v_id;
end $$;
revoke all on function public._send_message(uuid, uuid, text) from public, anon, authenticated;

create function public.start_conversation(p_type text, p_listing uuid, p_first text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_title text; v_status text; v_country text; v_conv uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_type = 'product' then
    select owner_id, title, status, country_code into v_owner, v_title, v_status, v_country from public.products where id = p_listing;
  elsif p_type = 'service' then
    select owner_id, title, status, country_code into v_owner, v_title, v_status, v_country from public.services where id = p_listing;
  else
    raise exception 'invalid_target';
  end if;
  if not found or v_status <> 'active' then raise exception 'listing_not_found'; end if;
  if v_owner is null then raise exception 'listing_has_no_owner'; end if;
  if v_owner = v_uid then raise exception 'cannot_message_yourself'; end if;
  if public._blocked_between(v_uid, v_owner) then raise exception 'blocked'; end if;

  insert into public.conversations (listing_type, listing_id, listing_title, country_code, buyer_id, seller_id, buyer_name, seller_name)
  values (p_type, p_listing, v_title, v_country, v_uid, v_owner,
          coalesce((select nullif(full_name, '') from public.profiles where id = v_uid), 'Buyer'),
          coalesce((select nullif(full_name, '') from public.profiles where id = v_owner), 'Seller'))
  on conflict (listing_type, listing_id, buyer_id) do update set listing_title = excluded.listing_title
  returning id into v_conv;
  if p_first is not null and trim(p_first) <> '' then perform public._send_message(v_conv, v_uid, p_first); end if;
  return v_conv;
end $$;

create function public.send_message(p_conv uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  return public._send_message(p_conv, auth.uid(), p_body);
end $$;

create function public.mark_conversation_read(p_conv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  update public.conversations set
    buyer_read_at = case when buyer_id = auth.uid() then now() else buyer_read_at end,
    seller_read_at = case when seller_id = auth.uid() then now() else seller_read_at end
   where id = p_conv and auth.uid() in (buyer_id, seller_id);
  update public.notifications set read = true where user_id = auth.uid() and conversation_id = p_conv and not read;
end $$;

create function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_user = auth.uid() then raise exception 'cannot_message_yourself'; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
end $$;

create function public.unblock_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
end $$;

create function public.report_message(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages; c public.conversations; v_ctx jsonb;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message;
  if not found then raise exception 'message_not_found'; end if;
  select * into c from public.conversations where id = m.conversation_id;
  if auth.uid() not in (c.buyer_id, c.seller_id) then raise exception 'message_not_found'; end if;
  if m.sender_id = auth.uid() then raise exception 'cannot_report_own_message'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('from_reported', x.sender_id = m.sender_id, 'body', x.body, 'at', x.created_at) order by x.created_at), '[]'::jsonb)
    into v_ctx from (select * from public.messages where conversation_id = c.id and created_at <= m.created_at
                      order by created_at desc, id desc limit 6) x;
  insert into public.message_reports (message_id, conversation_id, country_code, reporter_id, reported_user_id, reporter_name, reported_name, reason, context)
  values (m.id, c.id, c.country_code, auth.uid(), m.sender_id,
          case when auth.uid() = c.buyer_id then c.buyer_name else c.seller_name end,
          case when m.sender_id = c.buyer_id then c.buyer_name else c.seller_name end, trim(p_reason), v_ctx)
  on conflict (message_id, reporter_id) do nothing;
end $$;

create function public.hq_resolve_message_report(p_report uuid, p_status text, p_resolution text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.message_reports;
begin
  select * into r from public.message_reports where id = p_report for update;
  if not found then raise exception 'report_not_found'; end if;
  if not public.is_staff(r.country_code, array['ops', 'support']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_status not in ('actioned', 'dismissed') then raise exception 'invalid_status'; end if;
  if coalesce(trim(p_resolution), '') = '' then raise exception 'reason_required'; end if;
  update public.message_reports set status = p_status, resolution = trim(p_resolution), resolved_by = auth.uid() where id = r.id;
  perform public.write_audit('message_report.resolve', 'message_report', r.id::text, r.country_code,
    jsonb_build_object('status', p_status), p_resolution);
end $$;

revoke all on table public.conversations, public.messages, public.user_blocks, public.message_reports from public, anon, authenticated;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.message_reports enable row level security;
grant select on public.conversations, public.messages, public.user_blocks, public.message_reports to authenticated;
create policy conversations_own on public.conversations for select to authenticated
  using (auth.uid() in (buyer_id, seller_id));
create policy messages_own on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.buyer_id, c.seller_id)));
create policy blocks_own on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
create policy message_reports_read on public.message_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_staff(country_code, array['ops', 'support']));

revoke all on function public.start_conversation(text, uuid, text), public.send_message(uuid, text), public.mark_conversation_read(uuid),
  public.block_user(uuid), public.unblock_user(uuid), public.report_message(uuid, text), public.hq_resolve_message_report(uuid, text, text)
  from public, anon;
grant execute on function public.start_conversation(text, uuid, text), public.send_message(uuid, text), public.mark_conversation_read(uuid),
  public.block_user(uuid), public.unblock_user(uuid), public.report_message(uuid, text), public.hq_resolve_message_report(uuid, text, text)
  to authenticated;

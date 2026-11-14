-- Two-person rule for large refunds, and in-app notifications for advertisers.

-- ================================================================ refunds
alter table public.promote_settings
  add column refund_approval_limit numeric(12, 2) not null default 500 check (refund_approval_limit >= 0);

create table public.refund_requests (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  amount       numeric(12, 2) not null check (amount > 0),
  reason       text not null,
  revoke_credit boolean not null default true,
  status       text not null default 'pending' check (status in ('pending', 'executed', 'rejected')),
  requested_by uuid not null,
  decided_by   uuid,
  decision_reason text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
alter table public.refund_requests enable row level security;

create function public._execute_refund(p_invoice uuid, p_amount numeric, p_reason text, p_revoke_credit boolean) returns void
language plpgsql security definer set search_path = public as $$
-- Cash refund or credit note. By default an equal amount of released credit is revoked so the money is not returned twice.
declare i public.invoices; c public.campaigns; v_refunded numeric; v_revoke numeric;
begin
  select * into i from public.invoices where id = p_invoice for update;
  select * into c from public.campaigns where id = i.campaign_id;
  if i.status not in ('verified', 'refund_due') then raise exception 'invoice_not_refundable'; end if;
  select coalesce(sum(amount), 0) into v_refunded from public.payment_records where invoice_id = i.id and kind = 'refund';
  if v_refunded + p_amount > i.total then raise exception 'refund_exceeds_invoice'; end if;

  insert into public.payment_records (invoice_id, kind, amount, status, reference, created_by)
  values (i.id, 'refund', p_amount, 'verified', p_reason, auth.uid());
  if v_refunded + p_amount >= i.total then update public.invoices set status = 'refunded' where id = i.id; end if;

  if p_revoke_credit then
    v_revoke := least(p_amount, public._ad_balance(c.account_id));
    if v_revoke > 0 then
      insert into public.ad_credits (account_id, amount, kind, campaign_id, reason, created_by)
      values (c.account_id, -v_revoke, 'revoke', c.id, 'Refunded in cash: ' || p_reason, auth.uid());
    end if;
  end if;
  perform public.write_audit('invoice.refund', 'invoice', i.id::text, c.country_code, jsonb_build_object('amount', p_amount), p_reason);
end $$;
revoke all on function public._execute_refund(uuid, numeric, text, boolean) from public, anon, authenticated;

create function public.hq_refund(p_invoice uuid, p_amount numeric, p_reason text, p_revoke_credit boolean default true) returns text
language plpgsql security definer set search_path = public as $$
-- Refunds up to the country's approval limit happen at once. Larger ones wait for a second finance user.
declare i public.invoices; c public.campaigns; s public.promote_settings; v_refunded numeric; v_pending numeric; v_req uuid;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice_not_found'; end if;
  select * into c from public.campaigns where id = i.campaign_id;
  if not public.is_staff(c.country_code, array['finance']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if i.status not in ('verified', 'refund_due') then raise exception 'invoice_not_refundable'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select coalesce(sum(amount), 0) into v_refunded from public.payment_records where invoice_id = i.id and kind = 'refund';
  select coalesce(sum(amount), 0) into v_pending from public.refund_requests where invoice_id = i.id and status = 'pending';
  if v_refunded + v_pending + p_amount > i.total then raise exception 'refund_exceeds_invoice'; end if;

  select * into s from public.promote_settings where country_code = c.country_code;
  if p_amount <= s.refund_approval_limit then
    perform public._execute_refund(i.id, p_amount, p_reason, p_revoke_credit);
    return 'refunded';
  end if;

  insert into public.refund_requests (invoice_id, amount, reason, revoke_credit, requested_by)
  values (i.id, p_amount, p_reason, p_revoke_credit, auth.uid()) returning id into v_req;
  perform public.write_audit('refund.request', 'refund_request', v_req::text, c.country_code, jsonb_build_object('amount', p_amount), p_reason);
  return 'pending_approval';
end $$;

create function public.hq_decide_refund(p_request uuid, p_approve boolean, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare r public.refund_requests; c public.campaigns;
begin
  select * into r from public.refund_requests where id = p_request for update;
  if not found then raise exception 'request_not_found'; end if;
  select c2.* into c from public.campaigns c2 join public.invoices i on i.campaign_id = c2.id where i.id = r.invoice_id;
  if not public.is_staff(c.country_code, array['finance']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'request_already_decided'; end if;
  if r.requested_by = auth.uid() then raise exception 'second_approver_required'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  if p_approve then
    perform public._execute_refund(r.invoice_id, r.amount, r.reason, r.revoke_credit);
    update public.refund_requests set status = 'executed', decided_by = auth.uid(), decision_reason = p_reason, decided_at = now() where id = r.id;
  else
    update public.refund_requests set status = 'rejected', decided_by = auth.uid(), decision_reason = p_reason, decided_at = now() where id = r.id;
    perform public.write_audit('refund.reject', 'refund_request', r.id::text, c.country_code, '{}'::jsonb, p_reason);
  end if;
  return case when p_approve then 'refunded' else 'rejected' end;
end $$;

grant select on public.refund_requests to authenticated;
create policy refund_requests_read on public.refund_requests for select to authenticated
  using (exists (select 1 from public.invoices i join public.campaigns c on c.id = i.campaign_id
                  where i.id = invoice_id and public.is_staff(c.country_code, array['finance'])));
grant execute on function public.hq_refund(uuid, numeric, text, boolean) to authenticated;
grant execute on function public.hq_decide_refund(uuid, boolean, text) to authenticated;

-- ================================================================ notifications
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  campaign_id uuid references public.campaigns(id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

-- Tells an advertiser when HQ or the schedule changes the state of their campaign.
-- Actions the advertiser takes themselves (pause, resume, cancel) do not notify them.
create function public.notify_campaign_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_title text; v_body text; v_reason text; v_inv text;
begin
  select owner_id into v_owner from public.ad_accounts where id = new.account_id;
  select reason into v_reason from public.moderation_cases where campaign_id = new.id order by seq desc limit 1;
  select number into v_inv from public.invoices where campaign_id = new.id;

  if new.status = 'approved_awaiting_payment' then
    v_title := 'Campaign approved'; v_body := 'Please pay invoice ' || coalesce(v_inv, '') || ' so it can go live.';
  elsif new.status = 'scheduled' then
    v_title := 'Payment received'; v_body := 'Your campaign starts on ' || new.start_date || '.';
  elsif new.status = 'live' and old.status = 'scheduled' then
    v_title := 'Your campaign is live'; v_body := 'Impressions are now being delivered.';
  elsif new.status = 'rejected' then
    v_title := 'Campaign rejected'; v_body := coalesce(v_reason, 'It did not meet the advertising policy.');
  elsif new.status = 'changes_requested' then
    v_title := 'Changes needed'; v_body := coalesce(v_reason, 'Please update your advert and resubmit.');
  elsif new.status = 'paused' and new.paused_by_hq then
    v_title := 'Campaign paused by Loka'; v_body := coalesce(v_reason, 'We are reviewing it.');
  elsif new.status = 'terminated' then
    v_title := 'Campaign stopped'; v_body := coalesce(v_reason, 'It was stopped for a policy reason.');
  elsif new.status = 'completed' then
    v_title := 'Campaign finished'; v_body := 'All purchased impressions were delivered or the end date was reached.';
  else
    return new;
  end if;

  if v_owner is not null then
    insert into public.notifications (user_id, title, body, campaign_id) values (v_owner, v_title, v_body, new.id);
  end if;
  return new;
end $$;

create trigger campaigns_notify after update of status on public.campaigns
  for each row when (old.status is distinct from new.status) execute function public.notify_campaign_status();

grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ================================================================ media storage (Supabase only)
-- Buckets: ad-media (public read, approved adverts), payment-proofs (private). Skipped where storage does not exist.
do $$
begin
  if to_regnamespace('storage') is not null and to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('ad-media', 'ad-media', true) on conflict (id) do nothing;
    insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false) on conflict (id) do nothing;

    -- Users upload only into a folder named after their own user id.
    execute $p$create policy ad_media_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'ad-media' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy proofs_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy proofs_read_own on storage.objects for select to authenticated
      using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_any_staff()))$p$;
  end if;
end $$;

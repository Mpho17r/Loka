-- LOKA PROMOTE business logic. All writes to campaigns, billing and credits go through these
-- functions (security definer); the tables themselves are read-only for app users (see RLS migration).

alter table public.campaigns add column paused_by_hq boolean not null default false;

-- ================================================================ credits
create function public._ad_balance(p_account uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(greatest(0::numeric, coalesce(sum(amount), 0)), 2)
  from public.ad_credits
  where account_id = p_account and (expires_at is null or expires_at > now());
$$;
revoke all on function public._ad_balance(uuid) from public, anon, authenticated;

create function public.ad_balance(p_account uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v_owner uuid; v_country text;
begin
  select owner_id, country_code into v_owner, v_country from public.ad_accounts where id = p_account;
  if not found then return 0; end if;
  if v_owner <> auth.uid() and not public.is_staff(v_country, array['finance', 'ops', 'support']) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return public._ad_balance(p_account);
end $$;

-- ================================================================ pricing
-- One function prices every campaign, so the screen, the invoice and the report always agree.
create function public.compute_quote(
  p_country text, p_placement text, p_format text, p_city text, p_impressions integer,
  p_is_premium boolean, p_credit numeric, p_fee numeric default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_set    public.promote_settings;
  v_pb     uuid;
  v_cpm    numeric;
  v_cur    text;
  v_tname  text;
  v_trate  numeric;
  v_geo    numeric;
  v_gross  numeric;
  v_disc   numeric;
  v_after  numeric;
  v_credit numeric;
  v_net    numeric;
  v_vat    numeric;
begin
  select * into v_set from public.promote_settings where country_code = p_country;
  if not found then raise exception 'promote_not_configured'; end if;
  if p_impressions < v_set.min_impressions or p_impressions > v_set.max_impressions then
    raise exception 'impressions_out_of_range';
  end if;

  select pb.id, pb.cpm into v_pb, v_cpm from public.price_books pb
   where pb.country_code = p_country and pb.placement = p_placement and pb.format = p_format
     and pb.effective_from <= current_date and (pb.effective_to is null or pb.effective_to >= current_date)
   order by pb.effective_from desc limit 1;
  if v_pb is null then raise exception 'no_price_for_placement'; end if;

  select currency into v_cur from public.countries where code = p_country;
  select name, rate into v_tname, v_trate from public.tax_rules
   where country_code = p_country and effective_from <= current_date
   order by effective_from desc limit 1;
  if v_tname is null then v_tname := 'No tax'; v_trate := 0; end if;

  v_geo    := case when p_city is null then 1 else v_set.local_multiplier end;
  v_gross  := round(p_impressions / 1000.0 * v_cpm * v_geo, 2);
  v_disc   := case when p_is_premium then round(v_gross * v_set.premium_discount, 2) else 0 end;
  v_after  := v_gross - v_disc;
  v_credit := round(least(greatest(coalesce(p_credit, 0), 0), v_after), 2);
  v_net    := v_after - v_credit + greatest(coalesce(p_fee, 0), 0);
  v_vat    := round(v_net * v_trate, 2);

  return jsonb_build_object(
    'price_book_id', v_pb, 'cpm', v_cpm, 'geo_multiplier', v_geo, 'gross', v_gross,
    'premium_discount', v_disc, 'credit_applied', v_credit, 'management_fee', greatest(coalesce(p_fee, 0), 0),
    'net', v_net, 'tax_name', v_tname, 'tax_rate', v_trate, 'vat', v_vat,
    'total', v_net + v_vat, 'currency', v_cur);
end $$;

-- ================================================================ internal helpers
create function public._release_unused(p_campaign uuid) returns numeric
language plpgsql security definer set search_path = public as $$
-- Gives the unused share of a campaign back as advertising credit (expires per country setting).
-- VAT on cash already paid for the unused share needs a credit note from Finance (hq_refund).
declare c public.campaigns; q public.quotes; i public.invoices; s public.promote_settings; f numeric; back numeric := 0;
begin
  select * into c from public.campaigns where id = p_campaign;
  select * into q from public.quotes where campaign_id = p_campaign;
  select * into i from public.invoices where campaign_id = p_campaign;
  select * into s from public.promote_settings where country_code = c.country_code;
  f := (c.impressions_bought - c.impressions_delivered)::numeric / c.impressions_bought;
  if f <= 0 then return 0; end if;
  back := round(f * q.credit_applied, 2);
  if i.status = 'verified' then back := back + round(f * q.net, 2); end if;
  if back > 0 then
    insert into public.ad_credits (account_id, amount, kind, campaign_id, expires_at, reason)
    values (c.account_id, back, 'release', c.id, now() + make_interval(days => s.credit_expiry_days), 'Unused impressions');
  end if;
  return back;
end $$;
revoke all on function public._release_unused(uuid) from public, anon, authenticated;

create function public._maybe_go_live(p_campaign uuid) returns void
language sql security definer set search_path = public as $$
  update public.campaigns set status = 'live', updated_at = now()
  where id = p_campaign and status = 'scheduled' and start_date <= current_date and end_date >= current_date;
$$;
revoke all on function public._maybe_go_live(uuid) from public, anon, authenticated;

-- ================================================================ advertiser actions
create function public.create_campaign(
  p_target_type text, p_target_id uuid, p_headline text, p_description text, p_cta text,
  p_placement text, p_format text, p_city text, p_impressions integer,
  p_start date, p_end date,
  p_use_credit boolean default true, p_accept_terms boolean default false,
  p_on_behalf_of uuid default null, p_management_fee numeric default 0, p_media_path text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_prof public.profiles;
  v_set public.promote_settings;
  v_acct uuid;
  v_country text;
  v_target_owner uuid;
  v_target_status text;
  v_avail numeric := 0;
  v_q jsonb;
  v_cid uuid;
  v_qid uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not p_accept_terms then raise exception 'terms_not_accepted'; end if;

  v_owner := coalesce(p_on_behalf_of, v_uid);
  select * into v_prof from public.profiles where id = v_owner;
  if not found then raise exception 'unknown_account'; end if;
  v_country := v_prof.country_code;

  if v_owner <> v_uid then
    if not public.is_staff(v_country, array['ops']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  else
    p_management_fee := 0;  -- only HQ staff can add a management fee
  end if;

  if v_prof.verification = 'unverified' then raise exception 'account_not_verified'; end if;
  if not exists (select 1 from public.countries where code = v_country and promote_enabled) then
    raise exception 'promote_not_available';
  end if;
  select * into v_set from public.promote_settings where country_code = v_country;
  if not found then raise exception 'promote_not_configured'; end if;
  if not exists (select 1 from public.placement_availability
                 where country_code = v_country and placement = p_placement and enabled) then
    raise exception 'placement_not_available';
  end if;
  if p_format not in ('image', 'video') then raise exception 'invalid_format'; end if;
  if char_length(trim(coalesce(p_headline, ''))) not between 5 and 60 then raise exception 'invalid_headline'; end if;
  if p_start is null or p_end is null or p_start < current_date or p_end < p_start
     or (p_end - p_start + 1) > v_set.max_campaign_days then
    raise exception 'invalid_dates';
  end if;
  if p_city is not null and not exists (select 1 from public.cities where country_code = v_country and name = p_city) then
    raise exception 'unknown_city';
  end if;

  if p_target_type = 'product' then
    select owner_id, status into v_target_owner, v_target_status from public.products
     where id = p_target_id and country_code = v_country;
  elsif p_target_type = 'service' then
    select owner_id, status into v_target_owner, v_target_status from public.services
     where id = p_target_id and country_code = v_country;
  else
    raise exception 'invalid_target';
  end if;
  if not found then raise exception 'listing_not_found'; end if;
  if v_target_owner is distinct from v_owner then raise exception 'not_your_listing' using errcode = '42501'; end if;
  if v_target_status <> 'active' then raise exception 'listing_not_active'; end if;

  insert into public.ad_accounts (owner_id, country_code) values (v_owner, v_country)
    on conflict (owner_id) do nothing;
  select id into v_acct from public.ad_accounts where owner_id = v_owner;
  if p_use_credit then v_avail := public._ad_balance(v_acct); end if;

  v_q := public.compute_quote(v_country, p_placement, p_format, p_city, p_impressions,
                              v_prof.is_premium, v_avail, p_management_fee);

  insert into public.campaigns (account_id, country_code, target_type, target_id, placement, format, city,
                                impressions_bought, frequency_cap, start_date, end_date, managed_by)
  values (v_acct, v_country, p_target_type, p_target_id, p_placement, p_format, p_city,
          p_impressions, v_set.max_frequency_cap, p_start, p_end, case when v_owner <> v_uid then v_uid end)
  returning id into v_cid;

  insert into public.campaign_revisions (campaign_id, version, headline, description, cta, media_path)
  values (v_cid, 1, trim(p_headline), coalesce(p_description, ''), coalesce(p_cta, 'View'), p_media_path);

  insert into public.quotes (campaign_id, price_book_id, cpm, geo_multiplier, gross, premium_discount, credit_applied,
                             management_fee, net, tax_name, tax_rate, vat, total, currency)
  values (v_cid, (v_q ->> 'price_book_id')::uuid, (v_q ->> 'cpm')::numeric, (v_q ->> 'geo_multiplier')::numeric,
          (v_q ->> 'gross')::numeric, (v_q ->> 'premium_discount')::numeric, (v_q ->> 'credit_applied')::numeric,
          (v_q ->> 'management_fee')::numeric, (v_q ->> 'net')::numeric, v_q ->> 'tax_name',
          (v_q ->> 'tax_rate')::numeric, (v_q ->> 'vat')::numeric, (v_q ->> 'total')::numeric, v_q ->> 'currency')
  returning id into v_qid;

  insert into public.invoices (campaign_id, quote_id, total, currency, status, method, verified_at)
  values (v_cid, v_qid, (v_q ->> 'total')::numeric, v_q ->> 'currency',
          case when (v_q ->> 'total')::numeric = 0 then 'verified' else 'issued' end,
          case when (v_q ->> 'total')::numeric = 0 then 'credit' end,
          case when (v_q ->> 'total')::numeric = 0 then now() end);

  if (v_q ->> 'credit_applied')::numeric > 0 then
    insert into public.ad_credits (account_id, amount, kind, campaign_id, reason)
    values (v_acct, -(v_q ->> 'credit_applied')::numeric, 'applied', v_cid, 'Applied to campaign');
  end if;

  perform public.write_audit('campaign.create', 'campaign', v_cid::text, v_country, v_q, null);
  return v_cid;
end $$;

create function public.update_campaign_creative(
  p_campaign uuid, p_headline text, p_description text, p_cta text, p_media_path text default null
) returns void
language plpgsql security definer set search_path = public as $$
-- A change to wording or creative is a new revision. The campaign stops serving until it is moderated again.
declare c public.campaigns; v_owner uuid; v_next int;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then raise exception 'campaign_not_found'; end if;
  select owner_id into v_owner from public.ad_accounts where id = c.account_id;
  if v_owner is distinct from auth.uid() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if c.status not in ('pending_review', 'changes_requested', 'approved_awaiting_payment', 'scheduled', 'live', 'paused') then
    raise exception 'cannot_edit_in_status';
  end if;
  if char_length(trim(coalesce(p_headline, ''))) not between 5 and 60 then raise exception 'invalid_headline'; end if;

  select coalesce(max(version), 0) + 1 into v_next from public.campaign_revisions where campaign_id = c.id;
  update public.campaign_revisions set is_live = false where campaign_id = c.id;
  insert into public.campaign_revisions (campaign_id, version, headline, description, cta, media_path)
  values (c.id, v_next, trim(p_headline), coalesce(p_description, ''), coalesce(p_cta, 'View'), p_media_path);
  update public.campaigns set status = 'pending_review', updated_at = now() where id = c.id;
  perform public.write_audit('campaign.revise', 'campaign', c.id::text, c.country_code, jsonb_build_object('version', v_next), null);
end $$;

create function public.advertiser_declare_payment(p_invoice uuid, p_proof_path text, p_reference text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare i public.invoices; v_owner uuid; v_country text;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice_not_found'; end if;
  select a.owner_id, a.country_code into v_owner, v_country
    from public.campaigns c join public.ad_accounts a on a.id = c.account_id where c.id = i.campaign_id;
  if v_owner is distinct from auth.uid() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if i.status <> 'issued' then raise exception 'invoice_not_awaiting_payment'; end if;
  update public.invoices set status = 'paid_declared', method = 'manual', proof_path = p_proof_path where id = i.id;
  insert into public.payment_records (invoice_id, kind, amount, status, reference, created_by)
  values (i.id, 'payment', i.total, 'declared', p_reference, auth.uid());
  perform public.write_audit('invoice.declare_payment', 'invoice', i.id::text, v_country, jsonb_build_object('proof', p_proof_path), null);
end $$;

create function public.advertiser_set_state(p_campaign uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.campaigns; v_owner uuid; v_new text;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then raise exception 'campaign_not_found'; end if;
  select owner_id into v_owner from public.ad_accounts where id = c.account_id;
  if v_owner is distinct from auth.uid() then raise exception 'not_allowed' using errcode = '42501'; end if;

  if p_action = 'pause' and c.status = 'live' then
    v_new := 'paused';
    update public.campaigns set status = v_new, paused_by_hq = false, updated_at = now() where id = c.id;
  elsif p_action = 'resume' and c.status = 'paused' and not c.paused_by_hq and c.end_date >= current_date then
    v_new := 'live';
    update public.campaigns set status = v_new, updated_at = now() where id = c.id;
  elsif p_action = 'cancel' and c.status in ('pending_review', 'changes_requested', 'approved_awaiting_payment', 'scheduled', 'live', 'paused') then
    v_new := 'cancelled';
    update public.campaigns set status = v_new, updated_at = now() where id = c.id;
    perform public._release_unused(c.id);
  else
    raise exception 'action_not_allowed_in_status';
  end if;
  perform public.write_audit('campaign.' || p_action, 'campaign', c.id::text, c.country_code, jsonb_build_object('by', 'advertiser'), null);
  return v_new;
end $$;

-- ================================================================ HQ actions
create function public.hq_review_campaign(p_campaign uuid, p_decision text, p_policy_rule text default null, p_reason text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare c public.campaigns; i public.invoices; v_new text; v_dec text;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if not public.is_staff(c.country_code, array['ops']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if c.status <> 'pending_review' then raise exception 'not_pending_review'; end if;
  select * into i from public.invoices where campaign_id = c.id;

  if p_decision = 'approve' then
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

  update public.campaigns set status = v_new, updated_at = now() where id = c.id;
  insert into public.moderation_cases (campaign_id, reviewer_id, decision, policy_rule, reason)
  values (c.id, auth.uid(), v_dec, p_policy_rule, p_reason);
  if v_new = 'rejected' then perform public._release_unused(c.id); end if;
  if v_new = 'scheduled' then
    perform public._maybe_go_live(c.id);
    select status into v_new from public.campaigns where id = c.id;
  end if;
  perform public.write_audit('campaign.review', 'campaign', c.id::text, c.country_code,
    jsonb_build_object('decision', p_decision, 'rule', p_policy_rule), p_reason);
  return v_new;
end $$;

create function public.hq_verify_payment(p_invoice uuid, p_reference text default null) returns text
language plpgsql security definer set search_path = public as $$
declare i public.invoices; c public.campaigns; v_new text;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice_not_found'; end if;
  select * into c from public.campaigns where id = i.campaign_id for update;
  if not public.is_staff(c.country_code, array['finance']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if i.status not in ('issued', 'paid_declared') then raise exception 'invoice_not_payable'; end if;

  update public.invoices set status = 'verified', method = coalesce(method, 'manual'),
         verified_by = auth.uid(), verified_at = now() where id = i.id;
  insert into public.payment_records (invoice_id, kind, amount, status, reference, created_by)
  values (i.id, 'payment', i.total, 'verified', p_reference, auth.uid());

  v_new := c.status;
  if c.status = 'approved_awaiting_payment' then
    update public.campaigns set status = 'scheduled', updated_at = now() where id = c.id;
    perform public._maybe_go_live(c.id);
    select status into v_new from public.campaigns where id = c.id;
  end if;
  perform public.write_audit('invoice.verify', 'invoice', i.id::text, c.country_code, jsonb_build_object('reference', p_reference), null);
  return v_new;
end $$;

create function public.hq_set_state(p_campaign uuid, p_action text, p_reason text, p_forfeit boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare c public.campaigns; v_new text;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if not public.is_staff(c.country_code, array['ops']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  if p_action = 'pause' and c.status in ('live', 'scheduled') then
    v_new := 'paused';
    update public.campaigns set status = v_new, paused_by_hq = true, updated_at = now() where id = c.id;
  elsif p_action = 'resume' and c.status = 'paused' and c.end_date >= current_date then
    v_new := 'live';
    update public.campaigns set status = v_new, paused_by_hq = false, updated_at = now() where id = c.id;
  elsif p_action = 'terminate' and c.status in ('pending_review', 'changes_requested', 'approved_awaiting_payment', 'scheduled', 'live', 'paused') then
    v_new := 'terminated';
    update public.campaigns set status = v_new, updated_at = now() where id = c.id;
    if not p_forfeit then perform public._release_unused(c.id); end if;
  else
    raise exception 'action_not_allowed_in_status';
  end if;

  insert into public.moderation_cases (campaign_id, reviewer_id, decision, reason)
  values (c.id, auth.uid(), case p_action when 'pause' then 'paused' when 'terminate' then 'terminated' else 'approved' end, p_reason);
  perform public.write_audit('campaign.' || p_action, 'campaign', c.id::text, c.country_code,
    jsonb_build_object('by', 'hq', 'forfeit', p_forfeit), p_reason);
  return v_new;
end $$;

create function public.hq_refund(p_invoice uuid, p_amount numeric, p_reason text, p_revoke_credit boolean default true) returns void
language plpgsql security definer set search_path = public as $$
-- Cash refund or credit note. By default an equal amount of released credit is revoked so the money is not returned twice.
declare i public.invoices; c public.campaigns; v_refunded numeric; v_balance numeric; v_revoke numeric;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice_not_found'; end if;
  select * into c from public.campaigns where id = i.campaign_id;
  if not public.is_staff(c.country_code, array['finance']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if i.status not in ('verified', 'refund_due') then raise exception 'invoice_not_refundable'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select coalesce(sum(amount), 0) into v_refunded from public.payment_records where invoice_id = i.id and kind = 'refund';
  if v_refunded + p_amount > i.total then raise exception 'refund_exceeds_invoice'; end if;

  insert into public.payment_records (invoice_id, kind, amount, status, reference, created_by)
  values (i.id, 'refund', p_amount, 'verified', p_reason, auth.uid());
  if v_refunded + p_amount >= i.total then update public.invoices set status = 'refunded' where id = i.id; end if;

  if p_revoke_credit then
    v_balance := public._ad_balance(c.account_id);
    v_revoke := least(p_amount, v_balance);
    if v_revoke > 0 then
      insert into public.ad_credits (account_id, amount, kind, campaign_id, reason, created_by)
      values (c.account_id, -v_revoke, 'revoke', c.id, 'Refunded in cash: ' || p_reason, auth.uid());
    end if;
  end if;
  perform public.write_audit('invoice.refund', 'invoice', i.id::text, c.country_code, jsonb_build_object('amount', p_amount), p_reason);
end $$;

create function public.hq_adjust_credit(p_account uuid, p_amount numeric, p_reason text) returns numeric
language plpgsql security definer set search_path = public as $$
-- Positive amount grants credit (expires per country setting). Negative amount revokes up to the current balance.
declare a public.ad_accounts; s public.promote_settings; v_balance numeric;
begin
  select * into a from public.ad_accounts where id = p_account;
  if not found then raise exception 'account_not_found'; end if;
  if not public.is_staff(a.country_code, array['finance']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;
  select * into s from public.promote_settings where country_code = a.country_code;

  v_balance := public._ad_balance(a.id);
  if p_amount > 0 then
    insert into public.ad_credits (account_id, amount, kind, expires_at, reason, created_by)
    values (a.id, p_amount, 'grant', now() + make_interval(days => s.credit_expiry_days), p_reason, auth.uid());
  else
    if -p_amount > v_balance then raise exception 'revoke_exceeds_balance'; end if;
    insert into public.ad_credits (account_id, amount, kind, reason, created_by)
    values (a.id, p_amount, 'revoke', p_reason, auth.uid());
  end if;
  perform public.write_audit('credit.adjust', 'ad_account', a.id::text, a.country_code, jsonb_build_object('amount', p_amount), p_reason);
  return public._ad_balance(a.id);
end $$;

create function public.hq_set_profile_flags(p_user uuid, p_verification text default null, p_premium boolean default null, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'unknown_account'; end if;
  if not public.is_staff(p.country_code, array['ops', 'finance']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_verification is not null and p_verification not in ('unverified', 'identity', 'business') then raise exception 'invalid_verification'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update public.profiles set verification = coalesce(p_verification, verification), is_premium = coalesce(p_premium, is_premium) where id = p.id;
  perform public.write_audit('profile.flags', 'profile', p.id::text, p.country_code,
    jsonb_build_object('verification', p_verification, 'premium', p_premium), p_reason);
end $$;

create function public.hq_resolve_report(p_report uuid, p_status text, p_resolution text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.ad_reports; v_country text;
begin
  select * into r from public.ad_reports where id = p_report for update;
  if not found then raise exception 'report_not_found'; end if;
  select country_code into v_country from public.campaigns where id = r.campaign_id;
  if not public.is_staff(v_country, array['ops', 'support']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_status not in ('investigating', 'actioned', 'dismissed') then raise exception 'invalid_status'; end if;
  update public.ad_reports set status = p_status, resolution = p_resolution, handled_by = auth.uid() where id = r.id;
  perform public.write_audit('report.' || p_status, 'ad_report', r.id::text, v_country, '{}'::jsonb, p_resolution);
end $$;

create function public.hq_update_managed_request(p_request uuid, p_status text, p_assigned_to uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare m public.managed_requests;
begin
  select * into m from public.managed_requests where id = p_request for update;
  if not found then raise exception 'request_not_found'; end if;
  if not public.is_staff(m.country_code, array['ops']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_status not in ('new', 'in_progress', 'campaign_created', 'declined') then raise exception 'invalid_status'; end if;
  update public.managed_requests set status = p_status, assigned_to = coalesce(p_assigned_to, assigned_to) where id = m.id;
  perform public.write_audit('managed.update', 'managed_request', m.id::text, m.country_code, jsonb_build_object('status', p_status), null);
end $$;

create function public.hq_revenue(p_country text, p_from date, p_to date)
returns table (placement text, campaigns bigint, impressions bigint, clicks bigint, billed_net numeric, billed_total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff(p_country, array['finance']) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
    select c.placement, count(*), coalesce(sum(c.impressions_delivered), 0)::bigint, coalesce(sum(c.clicks), 0)::bigint,
           coalesce(sum(q.net), 0), coalesce(sum(i.total), 0)
    from public.campaigns c
    join public.quotes q on q.campaign_id = c.id
    join public.invoices i on i.campaign_id = c.id and i.status in ('verified', 'refunded')
    where c.country_code = p_country and i.verified_at::date between p_from and p_to
    group by c.placement order by c.placement;
end $$;

-- ================================================================ scheduled jobs (run from pg_cron, not callable by app users)
create function public.run_campaign_jobs() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update public.campaigns set status = 'live', updated_at = now()
   where status = 'scheduled' and start_date <= current_date and end_date >= current_date;
  for r in select id, status from public.campaigns
            where status in ('live', 'paused', 'scheduled', 'approved_awaiting_payment', 'pending_review', 'changes_requested')
              and end_date < current_date loop
    if r.status in ('live', 'paused', 'scheduled') then
      update public.campaigns set status = 'completed', updated_at = now() where id = r.id;
    else
      update public.campaigns set status = 'cancelled', updated_at = now() where id = r.id;
    end if;
    perform public._release_unused(r.id);
  end loop;
end $$;
revoke all on function public.run_campaign_jobs() from public, anon, authenticated;

create function public.grant_monthly_premium_credits() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer := 0; r record; v_acct uuid; v_key text := to_char(now(), 'YYYY-MM');
begin
  for r in select p.id as uid, p.country_code, s.monthly_premium_credit as amt, s.credit_expiry_days as days
             from public.profiles p join public.promote_settings s on s.country_code = p.country_code
            where p.is_premium and s.monthly_premium_credit > 0 loop
    insert into public.ad_accounts (owner_id, country_code) values (r.uid, r.country_code) on conflict (owner_id) do nothing;
    select id into v_acct from public.ad_accounts where owner_id = r.uid;
    insert into public.ad_credits (account_id, amount, kind, month_key, expires_at, reason)
    values (v_acct, r.amt, 'premium_monthly', v_key, now() + make_interval(days => r.days), 'Premium monthly advertising credit')
    on conflict do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.grant_monthly_premium_credits() from public, anon, authenticated;

-- ================================================================ serving and tracking (callable by visitors)
create function public.get_ads(p_placement text, p_city text, p_viewer_key text, p_limit integer default 1)
returns table (campaign_id uuid, headline text, description text, cta text, media_path text,
               target_type text, target_id uuid, placement text, sponsored boolean)
language sql stable security definer set search_path = public as $$
  select c.id, r.headline, r.description, r.cta, r.media_path, c.target_type, c.target_id, c.placement, true
  from public.campaigns c
  join public.campaign_revisions r on r.campaign_id = c.id and r.is_live and r.review = 'approved'
  where c.status = 'live'
    and current_date between c.start_date and c.end_date
    and c.placement = p_placement
    and c.impressions_delivered < c.impressions_bought
    and (c.city is null or c.city = p_city)
    and coalesce((select f.shown from public.ad_frequency f
                   where f.campaign_id = c.id and f.viewer_key = p_viewer_key and f.day = current_date), 0) < c.frequency_cap
  -- pacing: campaigns furthest behind schedule first, then rotate
  order by (c.impressions_delivered::numeric / c.impressions_bought)
           - ((current_date - c.start_date + 1)::numeric / (c.end_date - c.start_date + 1)) asc,
           random()
  limit greatest(1, least(coalesce(p_limit, 1), 5));
$$;

create function public.record_impression(p_campaign uuid, p_viewer_key text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.campaigns; v_total integer; v_shown integer;
begin
  if p_viewer_key is null or char_length(p_viewer_key) not between 8 and 64 then return false; end if;

  -- crude abuse limit: no viewer key counts more than 300 impressions a day across all campaigns
  select coalesce(sum(shown), 0) into v_total from public.ad_frequency where viewer_key = p_viewer_key and day = current_date;
  if v_total >= 300 then return false; end if;

  -- claim one impression atomically so concurrent requests can never oversell the purchased total
  update public.campaigns set impressions_delivered = impressions_delivered + 1, updated_at = now()
   where id = p_campaign and status = 'live' and current_date between start_date and end_date
     and impressions_delivered < impressions_bought
  returning * into c;
  if not found then return false; end if;

  insert into public.ad_frequency (campaign_id, viewer_key, day, shown)
  values (p_campaign, p_viewer_key, current_date, 1)
  on conflict (campaign_id, viewer_key, day) do update set shown = public.ad_frequency.shown + 1
   where public.ad_frequency.shown < c.frequency_cap
  returning shown into v_shown;

  if v_shown is null then  -- frequency cap reached: give the claimed impression back
    update public.campaigns set impressions_delivered = impressions_delivered - 1 where id = p_campaign;
    return false;
  end if;

  insert into public.ad_impressions (campaign_id, placement, viewer_key) values (p_campaign, c.placement, p_viewer_key);
  insert into public.campaign_stats_daily (campaign_id, day, placement, impressions)
  values (p_campaign, current_date, c.placement, 1)
  on conflict (campaign_id, day) do update set impressions = public.campaign_stats_daily.impressions + 1;

  if c.impressions_delivered >= c.impressions_bought then
    update public.campaigns set status = 'completed', updated_at = now() where id = p_campaign;
  end if;
  return true;
end $$;

create function public.record_click(p_campaign uuid, p_viewer_key text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.campaigns;
begin
  if p_viewer_key is null or char_length(p_viewer_key) not between 8 and 64 then return false; end if;
  select * into c from public.campaigns where id = p_campaign and status in ('live', 'completed', 'paused');
  if not found then return false; end if;
  -- only viewers who were actually shown the advert can click it
  if not exists (select 1 from public.ad_frequency where campaign_id = p_campaign and viewer_key = p_viewer_key and day = current_date) then
    return false;
  end if;
  -- repeat clicks by the same viewer within 30 seconds count once
  if exists (select 1 from public.ad_clicks where campaign_id = p_campaign and viewer_key = p_viewer_key
               and created_at > now() - interval '30 seconds') then
    return false;
  end if;
  insert into public.ad_clicks (campaign_id, viewer_key) values (p_campaign, p_viewer_key);
  update public.campaigns set clicks = clicks + 1 where id = p_campaign;
  insert into public.campaign_stats_daily (campaign_id, day, placement, clicks)
  values (p_campaign, current_date, c.placement, 1)
  on conflict (campaign_id, day) do update set clicks = public.campaign_stats_daily.clicks + 1;
  return true;
end $$;

-- ================================================================ advertiser report (respects row-level security)
create view public.campaign_report with (security_invoker = on) as
select c.id as campaign_id, c.account_id, c.status,
       c.impressions_bought, c.impressions_delivered,
       greatest(c.impressions_bought - c.impressions_delivered, 0) as impressions_remaining,
       c.clicks,
       case when c.impressions_delivered > 0 then round(c.clicks * 100.0 / c.impressions_delivered, 2) else 0 end as ctr_percent,
       round((q.gross - q.premium_discount) * c.impressions_delivered / c.impressions_bought, 2) as spend_before_tax,
       q.currency
from public.campaigns c join public.quotes q on q.campaign_id = c.id;

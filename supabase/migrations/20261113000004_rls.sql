-- Row-level security. Principle: app users READ what they are entitled to; every WRITE to campaigns,
-- billing, credits, prices and moderation goes through the security-definer functions in the previous migration.

-- Start from no privileges, then grant exactly what is needed.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'countries','cities','profiles','user_roles','products','services','service_requests','audit_logs',
    'placements','placement_availability','price_books','tax_rules','promote_settings','ad_accounts','campaigns',
    'campaign_revisions','quotes','invoices','payment_records','ad_credits','moderation_cases','ad_reports',
    'managed_requests','ad_impressions','ad_clicks','ad_frequency','campaign_stats_daily']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- reference data: readable by signed-in users, written by HQ
grant select on public.countries, public.cities, public.placements to anon, authenticated;
create policy countries_read on public.countries for select using (true);
create policy cities_read on public.cities for select using (true);
create policy placements_read on public.placements for select using (true);

grant select on public.placement_availability, public.price_books, public.tax_rules, public.promote_settings to authenticated;
create policy availability_read on public.placement_availability for select to authenticated using (true);
create policy price_books_read on public.price_books for select to authenticated using (true);
create policy tax_rules_read on public.tax_rules for select to authenticated using (true);
create policy promote_settings_read on public.promote_settings for select to authenticated using (true);

-- HQ price management: owner and country admins only (finance can read, not change).
grant insert, update on public.price_books, public.tax_rules, public.promote_settings, public.placement_availability to authenticated;
grant update on public.countries to authenticated;
create policy price_books_write on public.price_books for insert to authenticated
  with check (public.is_staff(country_code, array[]::text[]));
create policy price_books_update on public.price_books for update to authenticated
  using (public.is_staff(country_code, array[]::text[])) with check (public.is_staff(country_code, array[]::text[]));
create policy tax_rules_write on public.tax_rules for insert to authenticated
  with check (public.is_staff(country_code, array[]::text[]));
create policy promote_settings_write on public.promote_settings for insert to authenticated
  with check (public.is_staff(country_code, array[]::text[]));
create policy promote_settings_update on public.promote_settings for update to authenticated
  using (public.is_staff(country_code, array[]::text[])) with check (public.is_staff(country_code, array[]::text[]));
create policy availability_write on public.placement_availability for insert to authenticated
  with check (public.is_staff(country_code, array[]::text[]));
create policy availability_update on public.placement_availability for update to authenticated
  using (public.is_staff(country_code, array[]::text[])) with check (public.is_staff(country_code, array[]::text[]));
create policy countries_update on public.countries for update to authenticated
  using (public.is_staff(code, array[]::text[])) with check (public.is_staff(code, array[]::text[]));

-- ---------------------------------------------------------------- profiles and roles
grant select on public.profiles to authenticated;
-- Users may edit only these columns; verification and premium are changed by HQ through hq_set_profile_flags.
grant update (full_name, phone, city, country_code) on public.profiles to authenticated;
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_staff_read on public.profiles for select to authenticated
  using (public.is_staff(country_code, array['ops', 'finance', 'support']));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

grant select on public.user_roles to authenticated;
create policy roles_self_read on public.user_roles for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- listings
grant select on public.products, public.services to anon, authenticated;
grant insert, update, delete on public.products, public.services to authenticated;

create policy products_public_read on public.products for select using (status = 'active' or owner_id = auth.uid());
create policy products_staff_read on public.products for select to authenticated using (public.is_staff(country_code, array['ops', 'support']));
create policy products_owner_insert on public.products for insert to authenticated with check (owner_id = auth.uid());
create policy products_owner_update on public.products for update to authenticated
  using (owner_id = auth.uid() or public.is_staff(country_code, array['ops']))
  with check (owner_id = auth.uid() or public.is_staff(country_code, array['ops']));
create policy products_owner_delete on public.products for delete to authenticated using (owner_id = auth.uid());

create policy services_public_read on public.services for select using (status = 'active' or owner_id = auth.uid());
create policy services_staff_read on public.services for select to authenticated using (public.is_staff(country_code, array['ops', 'support']));
create policy services_owner_insert on public.services for insert to authenticated
  with check (owner_id = auth.uid() and provided_by_loka = false);
create policy services_owner_update on public.services for update to authenticated
  using (owner_id = auth.uid() or public.is_staff(country_code, array['ops']))
  with check (owner_id = auth.uid() or public.is_staff(country_code, array['ops']));
create policy services_owner_delete on public.services for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------- service requests
grant select, insert, update on public.service_requests to authenticated;
create policy requests_requester_read on public.service_requests for select to authenticated using (requester_id = auth.uid());
create policy requests_provider_read on public.service_requests for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and s.owner_id = auth.uid()));
create policy requests_staff_read on public.service_requests for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and public.is_staff(s.country_code, array['ops', 'support'])));
create policy requests_insert on public.service_requests for insert to authenticated
  with check (requester_id = auth.uid() and status = 'Submitted');
create policy requests_requester_update on public.service_requests for update to authenticated
  using (requester_id = auth.uid()) with check (requester_id = auth.uid() and status = 'Cancelled');
create policy requests_provider_update on public.service_requests for update to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and s.owner_id = auth.uid()))
  with check (status in ('Under review', 'Quoted', 'Accepted', 'Completed'));

-- ---------------------------------------------------------------- Promote: advertiser-visible data (read only)
grant select on public.ad_accounts, public.campaigns, public.campaign_revisions, public.quotes, public.invoices,
                public.payment_records, public.ad_credits, public.moderation_cases, public.campaign_stats_daily to authenticated;
grant select on public.campaign_report to authenticated;

create policy accounts_read on public.ad_accounts for select to authenticated
  using (owner_id = auth.uid() or public.is_staff(country_code, array['ops', 'finance', 'support']));

create policy campaigns_read on public.campaigns for select to authenticated
  using (exists (select 1 from public.ad_accounts a where a.id = account_id and a.owner_id = auth.uid())
         or public.is_staff(country_code, array['ops', 'finance', 'support']));

create policy revisions_read on public.campaign_revisions for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));   -- inherits campaigns_read
create policy quotes_read on public.quotes for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));
create policy invoices_read on public.invoices for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));
create policy payments_read on public.payment_records for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy moderation_read on public.moderation_cases for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));
create policy stats_read on public.campaign_stats_daily for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));

create policy credits_read on public.ad_credits for select to authenticated
  using (exists (select 1 from public.ad_accounts a where a.id = account_id));

-- ---------------------------------------------------------------- complaints and managed requests
grant select, insert on public.ad_reports, public.managed_requests to authenticated;
create policy reports_insert on public.ad_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
create policy reports_read on public.ad_reports for select to authenticated
  using (reporter_id = auth.uid()
         or exists (select 1 from public.campaigns c where c.id = campaign_id and public.is_staff(c.country_code, array['ops', 'support'])));

create policy managed_insert on public.managed_requests for insert to authenticated
  with check (requester_id = auth.uid() and status = 'new'
              and country_code = (select p.country_code from public.profiles p where p.id = auth.uid()));
create policy managed_read on public.managed_requests for select to authenticated
  using (requester_id = auth.uid() or public.is_staff(country_code, array['ops']));

-- ---------------------------------------------------------------- audit log and raw events: HQ read only
grant select on public.audit_logs to authenticated;
create policy audit_read on public.audit_logs for select to authenticated
  using (country_code is not null and public.is_staff(country_code, array['finance', 'ops']));
-- ad_impressions, ad_clicks, ad_frequency: no policies and no grants. Only the security-definer functions touch them.

-- ---------------------------------------------------------------- function access
-- Visitors (not signed in) can be served adverts and have impressions and clicks counted.
grant execute on function public.get_ads(text, text, text, integer) to anon, authenticated;
grant execute on function public.record_impression(uuid, text) to anon, authenticated;
grant execute on function public.record_click(uuid, text) to anon, authenticated;

-- Signed-in users.
grant execute on function public.is_staff(text, text[]) to authenticated;
grant execute on function public.is_any_staff() to authenticated;
grant execute on function public.compute_quote(text, text, text, text, integer, boolean, numeric, numeric) to authenticated;
grant execute on function public.ad_balance(uuid) to authenticated;
grant execute on function public.create_campaign(text, uuid, text, text, text, text, text, text, integer, date, date, boolean, boolean, uuid, numeric, text) to authenticated;
grant execute on function public.update_campaign_creative(uuid, text, text, text, text) to authenticated;
grant execute on function public.advertiser_declare_payment(uuid, text, text) to authenticated;
grant execute on function public.advertiser_set_state(uuid, text) to authenticated;

-- HQ (each function re-checks the caller's staff role and country).
grant execute on function public.hq_review_campaign(uuid, text, text, text) to authenticated;
grant execute on function public.hq_verify_payment(uuid, text) to authenticated;
grant execute on function public.hq_set_state(uuid, text, text, boolean) to authenticated;
grant execute on function public.hq_refund(uuid, numeric, text, boolean) to authenticated;
grant execute on function public.hq_adjust_credit(uuid, numeric, text) to authenticated;
grant execute on function public.hq_set_profile_flags(uuid, text, boolean, text) to authenticated;
grant execute on function public.hq_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.hq_update_managed_request(uuid, text, uuid) to authenticated;
grant execute on function public.hq_revenue(text, date, date) to authenticated;

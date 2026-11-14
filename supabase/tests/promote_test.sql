-- End-to-end tests for Loka Promote on Postgres. Run with:  psql -v ON_ERROR_STOP=1 -f supabase/tests/promote_test.sql
-- Expects the shim, all migrations and seed.sql to be applied first (see supabase/tests/run.sh).
begin;

create schema t;
grant usage on schema t to public;
create table t.ids (name text primary key, id uuid not null);
grant all on t.ids to public;

create function t.id(p_name text) returns uuid language sql stable as $$ select id from t.ids where name = p_name $$;
create function t.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', t.id(p_name)::text, true);
  execute 'reset role'; execute 'set local role authenticated';
end $$;
create function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'reset role'; execute 'set local role anon';
end $$;
create function t.root() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); execute 'reset role'; end $$;

create function t.q(p_sql text) returns text language plpgsql as $$
declare r text; begin execute p_sql into r; return r; end $$;
create function t.eq(p_label text, p_actual text, p_expected text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (expected %, got %)', p_label, p_expected, p_actual;
  end if;
  raise notice 'PASS: %', p_label;
end $$;
create function t.fails(p_label text, p_sql text, p_needle text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_needle || '%' then raise notice 'PASS: % (%)', p_label, sqlerrm; return; end if;
    raise exception 'FAIL: % (wrong error: %)', p_label, sqlerrm;
  end;
  raise exception 'FAIL: % (expected an error containing "%", got none)', p_label, p_needle;
end $$;

-- ------------------------------------------------------------------ fixtures
insert into auth.users (id, email, raw_user_meta_data) values
  (gen_random_uuid(), 'alice@t', '{"full_name":"Alice Seller"}'),
  (gen_random_uuid(), 'bob@t', '{"full_name":"Bob Unverified"}'),
  (gen_random_uuid(), 'mallory@t', '{"full_name":"Mallory Other"}'),
  (gen_random_uuid(), 'carol@t', '{"full_name":"Carol Ops"}'),
  (gen_random_uuid(), 'dave@t', '{"full_name":"Dave Finance"}'),
  (gen_random_uuid(), 'erin@t', '{"full_name":"Erin Owner"}'),
  (gen_random_uuid(), 'frank@t', '{"full_name":"Frank US Ops"}');
insert into t.ids select split_part(email, '@', 1), id from auth.users;

insert into public.countries (code, name, currency, active, promote_enabled) values ('US', 'United States', 'USD', false, false);
update public.profiles set verification = 'business', is_premium = true where id = t.id('alice');
update public.profiles set verification = 'identity' where id = t.id('mallory');
insert into public.user_roles (user_id, role, country_code) values
  (t.id('carol'), 'ops', 'ZA'), (t.id('dave'), 'finance', 'ZA'), (t.id('frank'), 'ops', 'US');
insert into public.user_roles (user_id, role) values (t.id('erin'), 'owner');

insert into public.products (owner_id, seller_name, title, price, condition, category, city)
values (t.id('alice'), 'Alice Seller', 'Fresh mangoes, 10kg box', 280, 'New', 'Food & Farm', 'Thohoyandou');
insert into t.ids select 'alice_product', id from public.products where owner_id = t.id('alice');
insert into public.products (owner_id, seller_name, title, price, condition, category, city)
values (t.id('mallory'), 'Mallory Other', 'Cordless drill, 18V', 1250, 'Second-hand', 'Tools', 'Johannesburg');
insert into t.ids select 'mallory_product', id from public.products where owner_id = t.id('mallory');

select t.eq('trigger copies seller verification onto the listing',
  t.q('select seller_verification from public.products where id = t.id(''alice_product'')'), 'business');

-- ------------------------------------------------------------------ pricing
select t.login('alice');
select t.eq('spec worked example: 20,000 search impressions, premium, R100 credit = R713.00',
  t.q($$select (public.compute_quote('ZA','search','image',null,20000,true,100) ->> 'total')$$), '713.00');
select t.eq('worked example: net before VAT',
  t.q($$select (public.compute_quote('ZA','search','image',null,20000,true,100) ->> 'net')$$), '620.00');
select t.eq('local city targeting is 30% cheaper (gross for 10,000 at R40 CPM)',
  t.q($$select (public.compute_quote('ZA','search','image','Thohoyandou',10000,false,0) ->> 'gross')$$), '280.00');
select t.eq('credit never exceeds the amount payable',
  t.q($$select (public.compute_quote('ZA','listing','image',null,1000,false,500) ->> 'credit_applied')$$), '20.00');
select t.fails('below minimum impressions is rejected',
  $$select public.compute_quote('ZA','search','image',null,500,false,0)$$, 'impressions_out_of_range');
select t.fails('no price for an unpriced placement/format',
  $$select public.compute_quote('ZA','search','video',null,1000,false,0)$$, 'no_price_for_placement');

-- ------------------------------------------------------------------ creating campaigns: who is allowed
select t.login('bob');
select t.fails('unverified accounts cannot advertise',
  format($$select public.create_campaign('product', %L, 'Anything to promote', '', 'View', 'search', 'image', null, 1000, current_date, current_date + 7, true, true)$$, t.id('alice_product')),
  'account_not_verified');

select t.login('alice');
select t.fails('cannot promote someone else''s listing',
  format($$select public.create_campaign('product', %L, 'Not my listing here', '', 'View', 'search', 'image', null, 1000, current_date, current_date + 7, true, true)$$, t.id('mallory_product')),
  'not_your_listing');
select t.fails('terms must be accepted',
  format($$select public.create_campaign('product', %L, 'Fresh mangoes today', '', 'View', 'search', 'image', null, 1000, current_date, current_date + 7, true, false)$$, t.id('alice_product')),
  'terms_not_accepted');
select t.fails('headline too short',
  format($$select public.create_campaign('product', %L, 'Hi', '', 'View', 'search', 'image', null, 1000, current_date, current_date + 7, true, true)$$, t.id('alice_product')),
  'invalid_headline');
select t.fails('start date in the past',
  format($$select public.create_campaign('product', %L, 'Fresh mangoes today', '', 'View', 'search', 'image', null, 1000, current_date - 1, current_date + 7, true, true)$$, t.id('alice_product')),
  'invalid_dates');
select t.fails('unknown city',
  format($$select public.create_campaign('product', %L, 'Fresh mangoes today', '', 'View', 'search', 'image', 'Atlantis', 1000, current_date, current_date + 7, true, true)$$, t.id('alice_product')),
  'unknown_city');

-- credit for alice from finance
select t.root();
insert into public.ad_accounts (owner_id, country_code) values (t.id('alice'), 'ZA');
insert into t.ids select 'alice_account', id from public.ad_accounts where owner_id = t.id('alice');
select t.login('alice');
select t.fails('advertiser cannot grant themselves credit',
  format($$select public.hq_adjust_credit(%L, 100, 'please')$$, t.id('alice_account')), 'not_allowed');
select t.login('dave');
select t.eq('finance grants R100 credit', t.q(format($$select public.hq_adjust_credit(%L, 100, 'Launch promotion')$$, t.id('alice_account'))), '100.00');

-- ------------------------------------------------------------------ happy path
select t.login('alice');
select t.eq('alice sees her R100 balance', t.q(format($$select public.ad_balance(%L)$$, t.id('alice_account'))), '100.00');
select t.login('alice');
do $$
declare v uuid;
begin
  v := public.create_campaign('product', t.id('alice_product'), 'Fresh mangoes in season', 'Picked to order', 'View',
                              'search', 'image', null, 20000, current_date, current_date + 13, true, true);
  insert into t.ids values ('c1', v);
end $$;
select t.eq('campaign starts as pending_review', t.q(format($$select status from public.campaigns where id = %L$$, t.id('c1'))), 'pending_review');
select t.eq('invoice total matches the quote (R713.00)', t.q(format($$select total from public.invoices where campaign_id = %L$$, t.id('c1'))), '713.00');
select t.eq('invoice is issued, not verified', t.q(format($$select status from public.invoices where campaign_id = %L$$, t.id('c1'))), 'issued');
select t.eq('credit was reserved: balance now 0', t.q(format($$select public.ad_balance(%L)$$, t.id('alice_account'))), '0.00');

select t.fails('advertiser cannot write to campaigns directly',
  format($$update public.campaigns set status = 'live' where id = %L$$, t.id('c1')), 'permission denied');
select t.fails('advertiser cannot insert campaigns directly',
  format($$insert into public.campaigns (account_id, country_code, target_type, target_id, placement, impressions_bought, start_date, end_date) values (%L,'ZA','product',%L,'search',1000,current_date,current_date)$$, t.id('alice_account'), t.id('alice_product')),
  'permission denied');
select t.fails('advertiser cannot edit invoices', format($$update public.invoices set status = 'verified' where campaign_id = %L$$, t.id('c1')), 'permission denied');
select t.fails('advertiser cannot approve their own campaign',
  format($$select public.hq_review_campaign(%L, 'approve')$$, t.id('c1')), 'not_allowed');
select t.fails('advertiser cannot verify their own payment',
  format($$select public.hq_verify_payment(%L)$$, (select id from public.invoices where campaign_id = t.id('c1'))), 'not_allowed');
select t.fails('users cannot give themselves premium or verification',
  format($$update public.profiles set verification = 'business' where id = %L$$, t.id('alice')), 'permission denied');

select t.login('mallory');
select t.eq('another advertiser cannot see the campaign', t.q($$select count(*) from public.campaigns$$), '0');
select t.eq('another advertiser cannot see the invoice', t.q($$select count(*) from public.invoices$$), '0');
select t.eq('another advertiser cannot see the quote', t.q($$select count(*) from public.quotes$$), '0');

select t.anon();
select t.eq('nothing is served before approval and payment', t.q($$select count(*) from public.get_ads('search', 'Thohoyandou', 'viewer-aaaa-0001', 3)$$), '0');
select t.fails('visitors cannot read raw events', $$select * from public.ad_impressions$$, 'permission denied');

select t.login('frank');
select t.fails('ops from another country cannot review a ZA campaign',
  format($$select public.hq_review_campaign(%L, 'approve')$$, t.id('c1')), 'not_allowed');
select t.login('dave');
select t.fails('finance cannot moderate content',
  format($$select public.hq_review_campaign(%L, 'approve')$$, t.id('c1')), 'not_allowed');
select t.login('carol');
select t.eq('ops sees the campaign in the review queue', t.q($$select count(*) from public.campaigns where status = 'pending_review'$$), '1');
select t.eq('ops approves: waits for payment', t.q(format($$select public.hq_review_campaign(%L, 'approve', 'policy-ok')$$, t.id('c1'))), 'approved_awaiting_payment');
select t.eq('moderation decision is recorded', t.q(format($$select decision from public.moderation_cases where campaign_id = %L$$, t.id('c1'))), 'approved');

select t.anon();
select t.eq('approved but unpaid campaigns do not serve', t.q($$select count(*) from public.get_ads('search', 'Thohoyandou', 'viewer-aaaa-0001', 3)$$), '0');

select t.login('alice');
select t.q(format($$select public.advertiser_declare_payment(%L, 'proofs/alice-eft.pdf', 'EFT-9912')$$, (select id from public.invoices where campaign_id = t.id('c1')))) ;
select t.eq('declared payment is not yet verified', t.q(format($$select status from public.invoices where campaign_id = %L$$, t.id('c1'))), 'paid_declared');
select t.eq('declared payment does not publish the campaign', t.q(format($$select status from public.campaigns where id = %L$$, t.id('c1'))), 'approved_awaiting_payment');

select t.login('dave');
select t.eq('finance verifies payment: campaign goes live (starts today)',
  t.q(format($$select public.hq_verify_payment(%L, 'bank-line-1')$$, (select id from public.invoices where campaign_id = t.id('c1')))), 'live');

-- ------------------------------------------------------------------ serving, frequency caps, tracking
select t.anon();
select t.eq('live campaign is served in the targeted placement', t.q($$select count(*) from public.get_ads('search', 'Thohoyandou', 'viewer-aaaa-0001', 3)$$), '1');
select t.eq('not served in a different placement', t.q($$select count(*) from public.get_ads('homepage', 'Thohoyandou', 'viewer-aaaa-0001', 3)$$), '0');
select t.eq('served is always labelled sponsored', t.q($$select sponsored from public.get_ads('search', 'Thohoyandou', 'viewer-aaaa-0001', 1)$$), 'true');

select t.eq('impression 1 counted', t.q(format($$select public.record_impression(%L, 'viewer-aaaa-0001')$$, t.id('c1'))), 'true');
select t.eq('impression 2 counted', t.q(format($$select public.record_impression(%L, 'viewer-aaaa-0001')$$, t.id('c1'))), 'true');
select t.eq('impression 3 counted', t.q(format($$select public.record_impression(%L, 'viewer-aaaa-0001')$$, t.id('c1'))), 'true');
select t.eq('4th display to the same viewer today is refused (cap of 3)', t.q(format($$select public.record_impression(%L, 'viewer-aaaa-0001')$$, t.id('c1'))), 'false');
select t.root();
select t.eq('the refused impression was not billed', t.q(format($$select impressions_delivered from public.campaigns where id = %L$$, t.id('c1'))) , '3');
select t.anon();
select t.eq('a capped viewer is no longer served that advert', t.q($$select count(*) from public.get_ads('search', 'Thohoyandou', 'viewer-aaaa-0001', 3)$$), '0');
select t.eq('a different viewer is still served', t.q($$select count(*) from public.get_ads('search', 'Thohoyandou', 'viewer-bbbb-0002', 3)$$), '1');
select t.eq('invalid viewer keys are ignored', t.q(format($$select public.record_impression(%L, 'x')$$, t.id('c1'))), 'false');

select t.eq('click from a viewer who saw the advert counts', t.q(format($$select public.record_click(%L, 'viewer-aaaa-0001')$$, t.id('c1'))), 'true');
select t.eq('repeat click within 30 seconds counts once', t.q(format($$select public.record_click(%L, 'viewer-aaaa-0001')$$, t.id('c1'))), 'false');
select t.eq('click from a viewer who never saw it is ignored', t.q(format($$select public.record_click(%L, 'viewer-zzzz-9999')$$, t.id('c1'))), 'false');

select t.login('alice');
select t.eq('report: impressions', t.q(format($$select impressions_delivered from public.campaign_report where campaign_id = %L$$, t.id('c1'))), '3');
select t.eq('report: clicks', t.q(format($$select clicks from public.campaign_report where campaign_id = %L$$, t.id('c1'))), '1');
select t.eq('report: CTR percent', t.q(format($$select ctr_percent from public.campaign_report where campaign_id = %L$$, t.id('c1'))), '33.33');
select t.eq('report: remaining delivery', t.q(format($$select impressions_remaining from public.campaign_report where campaign_id = %L$$, t.id('c1'))), '19997');
select t.eq('report: spend before tax = (800 - 80) * 3 / 20000', t.q(format($$select spend_before_tax from public.campaign_report where campaign_id = %L$$, t.id('c1'))), '0.11');

-- ------------------------------------------------------------------ pause, resume, HQ pause
select t.eq('advertiser pauses', t.q(format($$select public.advertiser_set_state(%L, 'pause')$$, t.id('c1'))), 'paused');
select t.anon();
select t.eq('paused campaigns do not serve', t.q($$select count(*) from public.get_ads('search', 'Thohoyandou', 'viewer-bbbb-0002', 3)$$), '0');
select t.login('alice');
select t.eq('advertiser resumes', t.q(format($$select public.advertiser_set_state(%L, 'resume')$$, t.id('c1'))), 'live');
select t.login('carol');
select t.fails('HQ pause needs a reason', format($$select public.hq_set_state(%L, 'pause', '')$$, t.id('c1')), 'reason_required');
select t.eq('HQ pauses on complaint', t.q(format($$select public.hq_set_state(%L, 'pause', 'Complaint 17 under investigation')$$, t.id('c1'))), 'paused');
select t.login('alice');
select t.fails('advertiser cannot override an HQ pause', format($$select public.advertiser_set_state(%L, 'resume')$$, t.id('c1')), 'action_not_allowed_in_status');
select t.login('carol');
select t.eq('HQ resumes', t.q(format($$select public.hq_set_state(%L, 'resume', 'Complaint dismissed')$$, t.id('c1'))), 'live');

-- ------------------------------------------------------------------ complaints
select t.login('mallory');
insert into public.ad_reports (campaign_id, reporter_id, reason) values (t.id('c1'), t.id('mallory'), 'Looks misleading to me');
select t.fails('cannot file a complaint as someone else',
  format($$insert into public.ad_reports (campaign_id, reporter_id, reason) values (%L, %L, 'spoofed reporter')$$, t.id('c1'), t.id('alice')), 'row-level security');
select t.login('carol');
select t.eq('ops sees the complaint', t.q($$select count(*) from public.ad_reports where status = 'open'$$), '1');
select t.q(format($$select public.hq_resolve_report(%L, 'dismissed', 'Claims are accurate')$$, (select id from public.ad_reports limit 1))) ;
select t.eq('complaint resolved', t.q($$select status from public.ad_reports$$), 'dismissed');

-- ------------------------------------------------------------------ cancelling: unused impressions come back as credit
select t.login('alice');
select t.eq('advertiser cancels live campaign', t.q(format($$select public.advertiser_set_state(%L, 'cancel')$$, t.id('c1'))), 'cancelled');
-- unused share = 19997/20000 of (R100 credit applied + R620 cash net) = 99.99 + 619.91
select t.eq('unused share is credited back (R99.99 credit + R619.91 cash share)', t.q(format($$select public.ad_balance(%L)$$, t.id('alice_account'))), '719.90');

-- ------------------------------------------------------------------ rejection returns credit; reason mandatory
select t.login('alice');
do $$
declare v uuid;
begin
  v := public.create_campaign('product', t.id('alice_product'), 'Mango special this week', '', 'Shop',
                              'category', 'image', 'Thohoyandou', 5000, current_date + 1, current_date + 8, true, true);
  insert into t.ids values ('c2', v);
end $$;
select t.eq('second campaign used credit: balance reduced', t.q(format($$select (public.ad_balance(%L) < 719.90)$$, t.id('alice_account'))), 'true');
select t.login('carol');
select t.fails('rejection needs a reason', format($$select public.hq_review_campaign(%L, 'reject')$$, t.id('c2')), 'reason_required');
select t.eq('ops rejects with a policy reason', t.q(format($$select public.hq_review_campaign(%L, 'reject', 'misleading-claims', 'Price not shown')$$, t.id('c2'))), 'rejected');
select t.login('alice');
select t.eq('credit returned after rejection', t.q(format($$select public.ad_balance(%L)$$, t.id('alice_account'))), '719.90');
select t.fails('a rejected campaign cannot be cancelled again', format($$select public.advertiser_set_state(%L, 'cancel')$$, t.id('c2')), 'action_not_allowed_in_status');

-- ------------------------------------------------------------------ never oversell
select t.login('alice');
do $$
declare v uuid;
begin
  v := public.create_campaign('product', t.id('alice_product'), 'Tiny campaign test', '', 'View',
                              'listing', 'image', null, 1000, current_date, current_date + 3, false, true);
  insert into t.ids values ('c3', v);
end $$;
select t.root();
update public.campaigns set status = 'live', impressions_delivered = 999 where id = t.id('c3');
select t.anon();
select t.eq('last purchased impression is delivered', t.q(format($$select public.record_impression(%L, 'viewer-cccc-0003')$$, t.id('c3'))), 'true');
select t.eq('no impression beyond the purchased total', t.q(format($$select public.record_impression(%L, 'viewer-dddd-0004')$$, t.id('c3'))), 'false');
select t.root();
select t.eq('campaign completes when fully delivered', t.q(format($$select status from public.campaigns where id = %L$$, t.id('c3'))), 'completed');
select t.eq('delivered never exceeds bought', t.q(format($$select impressions_delivered from public.campaigns where id = %L$$, t.id('c3'))), '1000');

-- ------------------------------------------------------------------ refunds and revenue (finance)
select t.login('dave');
select t.fails('refund cannot exceed the invoice',
  format($$select public.hq_refund(%L, 99999, 'too much')$$, (select id from public.invoices where campaign_id = t.id('c1'))), 'refund_exceeds_invoice');
select t.q(format($$select public.hq_refund(%L, 100, 'Goodwill refund')$$, (select id from public.invoices where campaign_id = t.id('c1'))));
select t.eq('refund recorded', t.q($$select count(*) from public.payment_records where kind = 'refund'$$), '1');
select t.eq('refund revoked an equal amount of credit (no double return)', t.q(format($$select public.ad_balance(%L)$$, t.id('alice_account'))), '619.90');
select t.eq('revenue report groups verified invoices by placement', t.q($$select count(*) from public.hq_revenue('ZA', current_date - 1, current_date + 1)$$), '2');
select t.login('carol');
select t.fails('ops cannot read revenue', $$select * from public.hq_revenue('ZA', current_date - 1, current_date + 1)$$, 'not_allowed');
select t.login('alice');
select t.eq('advertisers see no audit rows', t.q($$select count(*) from public.audit_logs$$), '0');
select t.login('dave');
select t.eq('finance sees audit rows', t.q($$select (count(*) > 0) from public.audit_logs$$), 'true');

-- ------------------------------------------------------------------ price books: owner only, history kept
select t.login('dave');
select t.fails('finance cannot change prices',
  $$insert into public.price_books (country_code, placement, format, cpm) values ('ZA','search','image',99)$$, 'row-level security');
select t.login('carol');
select t.fails('ops cannot change prices',
  $$insert into public.price_books (country_code, placement, format, cpm) values ('ZA','search','image',99)$$, 'row-level security');
select t.login('erin');
select t.q($$insert into public.price_books (country_code, placement, format, cpm, effective_from) values ('ZA','search','image',50, current_date + 30) returning id::text$$);
select t.eq('a future price does not change today''s quotes',
  t.q($$select (public.compute_quote('ZA','search','image',null,10000,false,0) ->> 'gross')$$), '400.00');
select t.login('frank');
select t.fails('country admins of another country cannot change ZA prices',
  $$insert into public.price_books (country_code, placement, format, cpm) values ('ZA','search','image',1)$$, 'row-level security');

-- ------------------------------------------------------------------ scheduled jobs
select t.root();
update public.campaigns set status = 'live', start_date = current_date - 10, end_date = current_date - 1, impressions_delivered = 10 where id = t.id('c3');
update public.campaigns set status = 'scheduled', start_date = current_date, end_date = current_date + 5 where id = t.id('c2');
select public.run_campaign_jobs();
select t.eq('scheduled campaign starting today goes live', t.q(format($$select status from public.campaigns where id = %L$$, t.id('c2'))), 'live');
select t.eq('expired live campaign is completed', t.q(format($$select status from public.campaigns where id = %L$$, t.id('c3'))), 'completed');

select t.eq('premium monthly credit granted once', t.q($$select public.grant_monthly_premium_credits()$$), '1');
select t.eq('premium monthly credit is not granted twice in a month', t.q($$select public.grant_monthly_premium_credits()$$), '0');

select t.login('alice');
select t.fails('app users cannot run scheduled jobs', 'select public.run_campaign_jobs()', 'permission denied');

select t.root();
rollback;

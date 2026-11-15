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
create function t.plan(p_sql text) returns text language plpgsql as $$
declare r record; v text := '';
begin for r in execute 'explain ' || p_sql loop v := v || (r."QUERY PLAN") || ' '; end loop; return v; end $$;
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


-- ------------------------------------------------------------------ notifications
select t.login('alice');
select t.eq('advertiser was told the campaign was approved',
  t.q($$select count(*) from public.notifications where title = 'Campaign approved' and campaign_id = $$ || quote_literal(t.id('c1'))), '1');
select t.eq('advertiser was told payment was received',
  t.q($$select count(*) from public.notifications where title = 'Payment received' and campaign_id = $$ || quote_literal(t.id('c1'))), '1');
select t.eq('advertiser was told the campaign went live',
  t.q($$select count(*) from public.notifications where title = 'Your campaign is live' and campaign_id = $$ || quote_literal(t.id('c1'))), '1');
select t.eq('rejection notification quotes the HQ reason',
  t.q($$select body from public.notifications where title = 'Campaign rejected'$$), 'Price not shown');
select t.eq('HQ pause notification quotes the reason',
  t.q($$select body from public.notifications where title = 'Campaign paused by Loka'$$), 'Complaint 17 under investigation');
select t.eq('only the HQ pause notified the advertiser, not their own pause, resume or cancel',
  t.q($$select count(*) from public.notifications where campaign_id = $$ || quote_literal(t.id('c1')) || $$ and title in ('Campaign paused by Loka', 'Campaign cancelled', 'Campaign paused')$$), '1');
select t.fails('notifications cannot be forged by the user',
  $$insert into public.notifications (user_id, title) values (auth.uid(), 'You won')$$, 'permission denied');
select t.fails('users cannot rewrite notification text',
  $$update public.notifications set title = 'x'$$, 'permission denied');
update public.notifications set read = true;
select t.eq('user can mark their notifications read', t.q($$select count(*) from public.notifications where not read$$), '0');
select t.login('mallory');
select t.eq('other users cannot see them', t.q($$select count(*) from public.notifications$$), '0');

-- ------------------------------------------------------------------ two-person rule for large refunds (limit R500)
select t.login('dave');
select t.eq('refund of R600 needs a second approver',
  t.q(format($$select public.hq_refund(%L, 600, 'Large goodwill refund')$$, (select id from public.invoices where campaign_id = t.id('c1')))), 'pending_approval');
select t.eq('nothing is refunded until approved', t.q($$select count(*) from public.payment_records where kind = 'refund'$$), '1');
select t.eq('pending request is visible to finance', t.q($$select count(*) from public.refund_requests where status = 'pending'$$), '1');
select t.root();
insert into t.ids select 'refund_req', id from public.refund_requests;
select t.login('dave');
select t.fails('requester cannot approve their own refund',
  format($$select public.hq_decide_refund(%L, true)$$, t.id('refund_req')), 'second_approver_required');
select t.fails('the request cannot push total refunds above the invoice',
  format($$select public.hq_refund(%L, 100, 'too much in total')$$, (select id from public.invoices where campaign_id = t.id('c1'))), 'refund_exceeds_invoice');
select t.login('carol');
select t.fails('ops cannot decide refunds',
  format($$select public.hq_decide_refund(%L, true)$$, t.id('refund_req')), 'not_allowed');
select t.login('erin');
select t.eq('a second finance user (owner) approves', t.q(format($$select public.hq_decide_refund(%L, true)$$, t.id('refund_req'))), 'refunded');
select t.eq('refund is now recorded', t.q($$select count(*) from public.payment_records where kind = 'refund'$$), '2');
select t.eq('request is marked executed', t.q($$select status from public.refund_requests$$), 'executed');
select t.fails('a decided request cannot be decided again',
  format($$select public.hq_decide_refund(%L, true)$$, t.id('refund_req')), 'request_already_decided');
select t.login('alice');
select t.eq('advertisers cannot see refund requests', t.q($$select count(*) from public.refund_requests$$), '0');
select t.fails('advertisers cannot request refunds',
  format($$select public.hq_refund(%L, 10, 'give me money')$$, (select id from public.invoices where campaign_id = t.id('c1'))), 'not_allowed');


-- ------------------------------------------------------------------ push tokens and delivery preferences
select t.login('alice');
insert into public.push_tokens (user_id, token, platform) values (t.id('alice'), 'ExponentPushToken[alice-device-1]', 'android');
select t.eq('user can register a push token', t.q($$select count(*) from public.push_tokens$$), '1');
select t.fails('user cannot register a token for someone else',
  format($$insert into public.push_tokens (user_id, token) values (%L, 'ExponentPushToken[evil-token-x]')$$, t.id('mallory')), 'row-level security');
select t.fails('the same token cannot be registered twice for one user',
  format($$insert into public.push_tokens (user_id, token) values (%L, 'ExponentPushToken[alice-device-1]')$$, t.id('alice')), 'duplicate key');
select t.login('mallory');
select t.eq('other users cannot see her tokens', t.q($$select count(*) from public.push_tokens$$), '0');
select t.login('alice');
update public.profiles set email_enabled = false, push_enabled = false where id = auth.uid();
select t.eq('user can switch off email', t.q($$select email_enabled from public.profiles where id = auth.uid()$$), 'false');
select t.fails('delivery marker cannot be set by users',
  $$update public.notifications set delivered_at = now()$$, 'permission denied');

-- ------------------------------------------------------------------ search indexes are used for partial-text search
select t.root();
set local enable_seqscan = off;
select t.eq('partial text search on title uses the trigram index',
  t.q($$select (t.plan($q$select 1 from public.products where title ilike '%mango%'$q$) like '%products_title_trgm%')::text$$), 'true');
select t.eq('partial text search on services uses the trigram index',
  t.q($$select (t.plan($q$select 1 from public.services where description ilike '%plumb%'$q$) like '%services_description_trgm%')::text$$), 'true');
select t.eq('search finds the listing', t.q($$select count(*) from public.products where title ilike '%mango%' or description ilike '%mango%'$$), '1');
set local enable_seqscan = on;

-- ------------------------------------------------------------------ video adverts
select t.login('alice');
select t.fails('a video campaign needs a video',
  $$select public.create_campaign('product', t.id('alice_product'), 'Mango video advert', '', 'View', 'homepage', 'video', null, 1000, current_date, current_date + 3, false, true)$$, 'video_required');
select t.fails('a creative cannot use another user''s file',
  format($$select public.create_campaign('product', %L, 'Mango video advert', '', 'View', 'homepage', 'video', null, 1000, current_date, current_date + 3, false, true, null, 0, %L)$$,
         t.id('alice_product'), t.id('mallory')::text || '/clip.mp4'), 'media_not_yours');
select t.fails('an image campaign cannot carry a video file',
  format($$select public.create_campaign('product', %L, 'Mango image advert', '', 'View', 'search', 'image', null, 1000, current_date, current_date + 3, false, true, null, 0, %L)$$,
         t.id('alice_product'), t.id('alice')::text || '/clip.mp4'), 'image_required');
select t.fails('a video campaign cannot carry an image file',
  format($$select public.create_campaign('product', %L, 'Mango video advert', '', 'View', 'homepage', 'video', null, 1000, current_date, current_date + 3, false, true, null, 0, %L)$$,
         t.id('alice_product'), t.id('alice')::text || '/pic.jpg'), 'video_required');
select t.fails('file types outside the allow-list are refused',
  format($$select public.create_campaign('product', %L, 'Mango image advert', '', 'View', 'search', 'image', null, 1000, current_date, current_date + 3, false, true, null, 0, %L)$$,
         t.id('alice_product'), t.id('alice')::text || '/run.exe'), 'media_type_not_allowed');
insert into t.ids select 'v1', public.create_campaign('product', t.id('alice_product'), 'Mango video advert', '', 'View', 'homepage', 'video', null, 1000,
  current_date, current_date + 3, false, true, null, 0, t.id('alice')::text || '/v1.mp4');
insert into t.ids select 'v2', public.create_campaign('product', t.id('alice_product'), 'Mango video advert 2', '', 'View', 'homepage', 'video', null, 1000,
  current_date, current_date + 3, false, true, null, 0, t.id('alice')::text || '/v2.mp4');
insert into t.ids select 'v3', public.create_campaign('product', t.id('alice_product'), 'Mango video advert 3', '', 'View', 'category', 'video', null, 1000,
  current_date, current_date + 3, false, true, null, 0, t.id('alice')::text || '/v3.mp4');
insert into t.ids select 'v4', public.create_campaign('product', t.id('alice_product'), 'Mango video advert 4', '', 'View', 'category', 'video', null, 1000,
  current_date, current_date + 3, false, true, null, 0, t.id('alice')::text || '/v4.mp4');
select t.eq('a video campaign is priced from the video price book (homepage video R90 per 1,000)',
  t.q(format($$select cpm from public.quotes where campaign_id = %L$$, t.id('v1'))), '90.00');

-- ------------------------------------------------------------------ automatic media scanning
select t.eq('every creative with a file is queued for scanning',
  t.q(format($$select status from public.media_scans where campaign_id = %L$$, t.id('v1'))), 'pending');
select t.login('mallory');
select t.eq('other users cannot see the scan', t.q(format($$select count(*) from public.media_scans where campaign_id = %L$$, t.id('v1'))), '0');
select t.fails('users cannot record scan results',
  format($$select public.record_media_scan(%L, 'passed', null, null)$$, t.id('v1')), 'permission denied');
select t.login('alice');
select t.eq('the advertiser can see their own scan', t.q(format($$select count(*) from public.media_scans where campaign_id = %L$$, t.id('v1'))), '1');

-- the scanner (service key) flags v1
select t.root();
insert into t.ids select n || 'r', (select r.id from public.campaign_revisions r where r.campaign_id = t.id(n)) from unnest(array['v1','v2','v3','v4']) n;
set local role service_role;
select t.eq('scanner records a flag',
  t.q(format($$select public.record_media_scan(%L, 'flagged', %L, array['adult_content'])$$,
    t.id('v1r'), encode(sha256('file-one'::bytea), 'hex'))), 'flagged');
select t.root();
select t.login('carol');
select t.fails('a flagged creative cannot be approved', format($$select public.hq_review_campaign(%L, 'approve')$$, t.id('v1')), 'media_flagged');
select t.fails('clearing a flag needs a reason', format($$select public.hq_clear_media_scan(%L, '')$$, t.id('v1')), 'reason_required');
select public.hq_clear_media_scan(t.id('v1'), 'Reviewed by eye: ordinary produce video');
select t.eq('after HQ clears it, the creative can be approved',
  t.q(format($$select public.hq_review_campaign(%L, 'approve')$$, t.id('v1'))), 'approved_awaiting_payment');
select t.eq('the clear is audited', t.q($$select count(*) from public.audit_logs where action = 'media.clear'$$), '1');
select t.login('mallory');
select t.fails('other users cannot clear flags', format($$select public.hq_clear_media_scan(%L, 'x')$$, t.id('v1')), 'not_allowed');

-- a country can require a passed scan before approval
select t.root();
update public.promote_settings set require_media_scan = true where country_code = 'ZA';
select t.login('carol');
select t.fails('with scans required, a pending scan blocks approval', format($$select public.hq_review_campaign(%L, 'approve')$$, t.id('v2')), 'media_scan_not_passed');
select t.root(); set local role service_role;
select t.eq('scanner passes v2', t.q(format($$select public.record_media_scan(%L, 'passed', %L, '{}')$$,
  t.id('v2r'), encode(sha256('file-two'::bytea), 'hex'))), 'passed');
select t.root();
select t.login('carol');
select t.eq('with scans required, a passed scan allows approval', t.q(format($$select public.hq_review_campaign(%L, 'approve')$$, t.id('v2'))), 'approved_awaiting_payment');
select t.root();
update public.promote_settings set require_media_scan = false where country_code = 'ZA';

-- HQ bans a file; the same file is flagged on any later upload
select t.root(); set local role service_role;
select t.eq('scanner passes v3', t.q(format($$select public.record_media_scan(%L, 'passed', %L, '{}')$$,
  t.id('v3r'), encode(sha256('file-three'::bytea), 'hex'))), 'passed');
select t.root();
select t.login('carol');
select public.hq_block_media(t.id('v3'), 'Misleading product claim');
select t.eq('a blocked file is flagged', t.q(format($$select status from public.media_scans where campaign_id = %L$$, t.id('v3'))), 'flagged');
select t.root(); set local role service_role;
select t.eq('the same file uploaded again is flagged even if the scanner says passed',
  t.q(format($$select public.record_media_scan(%L, 'passed', %L, '{}')$$,
    t.id('v4r'), encode(sha256('file-three'::bytea), 'hex'))), 'flagged');
select t.root();
select t.eq('...with the reason recorded', t.q(format($$select reasons::text from public.media_scans where campaign_id = %L$$, t.id('v4'))), '{blocked_file}');
select t.anon();
select t.eq('adverts can be fetched with their format by signed-out visitors', t.q($$select count(*) >= 0 from public.get_ads('homepage', null, 'viewer-x')$$), 'true');

-- ------------------------------------------------------------------ messaging
select t.root();
insert into public.products (owner_id, seller_name, title, price, condition, category, city)
values (null, 'Loka stock', 'Demo item with no owner', 10, 'New', 'Tools', 'Thohoyandou');
insert into t.ids select 'orphan_product', id from public.products where owner_id is null;

select t.login('mallory');
select t.fails('listings without an owner cannot be messaged', format($$select public.start_conversation('product', %L)$$, t.id('orphan_product')), 'listing_has_no_owner');
insert into t.ids select 'conv1', public.start_conversation('product', t.id('alice_product'), 'Is the box still available?');
select t.eq('starting again returns the same conversation',
  t.q(format($$select (public.start_conversation('product', %L) = %L)::text$$, t.id('alice_product'), t.id('conv1'))), 'true');
select t.eq('buyer sees the first message', t.q(format($$select count(*) from public.messages where conversation_id = %L$$, t.id('conv1'))), '1');
select t.fails('messages cannot be written directly',
  format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'hi')$$, t.id('conv1'), t.id('mallory')), 'permission denied');
select t.fails('an empty message is refused', format($$select public.send_message(%L, '   ')$$, t.id('conv1')), 'invalid_message');
select t.fails('a very long message is refused', format($$select public.send_message(%L, %L)$$, t.id('conv1'), repeat('x', 2001)), 'invalid_message');
select public.send_message(t.id('conv1'), 'I can collect today.');

select t.login('alice');
select t.fails('you cannot message yourself', format($$select public.start_conversation('product', %L)$$, t.id('alice_product')), 'cannot_message_yourself');
select t.eq('seller sees the conversation', t.q($$select count(*) from public.conversations$$), '1');
select t.eq('seller sees both messages', t.q(format($$select count(*) from public.messages where conversation_id = %L$$, t.id('conv1'))), '2');
select t.eq('seller gets exactly one unread alert for a burst of messages',
  t.q($$select count(*) from public.notifications where conversation_id is not null and not read$$), '1');
select t.eq('the inbox preview shows the last message', t.q($$select last_preview from public.conversations$$), 'I can collect today.');
select public.mark_conversation_read(t.id('conv1'));
select t.eq('opening the conversation clears the alert', t.q($$select count(*) from public.notifications where conversation_id is not null and not read$$), '0');
select public.send_message(t.id('conv1'), 'Yes, come after 4pm.');
select t.login('mallory');
select t.eq('the buyer is alerted to the reply', t.q($$select count(*) from public.notifications where conversation_id is not null and not read$$), '1');

select t.login('bob');
select t.eq('strangers see no conversations', t.q($$select count(*) from public.conversations$$), '0');
select t.eq('strangers see no messages', t.q($$select count(*) from public.messages$$), '0');
select t.fails('strangers cannot send into a conversation', format($$select public.send_message(%L, 'hello')$$, t.id('conv1')), 'conversation_not_found');
select t.anon();
select t.fails('anonymous users cannot call send_message', format($$select public.send_message(%L, 'x')$$, t.id('conv1')), 'permission denied');

select t.login('mallory');
select t.fails('flooding is rate limited',
  format($f$do $x$ begin for i in 1..25 loop perform public.send_message(%L, 'spam ' || i); end loop; end $x$$f$, t.id('conv1')), 'rate_limited');

-- blocking
select t.login('alice');
select public.block_user(t.id('mallory'));
select t.login('mallory');
select t.fails('a blocked user cannot send', format($$select public.send_message(%L, 'please?')$$, t.id('conv1')), 'blocked');
select t.login('alice');
select t.fails('the blocker cannot send either until they unblock', format($$select public.send_message(%L, 'hi')$$, t.id('conv1')), 'blocked');
select public.unblock_user(t.id('mallory'));
select t.eq('after unblocking, messages work again', t.q(format($$select (public.send_message(%L, 'Sorry about that.') is not null)::text$$, t.id('conv1'))), 'true');

-- reporting
select t.login('mallory');
select t.q(format($$select public.send_message(%L, 'Send me your bank PIN')$$, t.id('conv1')));
insert into t.ids select 'bad_msg', id from public.messages where body = 'Send me your bank PIN';
select t.login('alice');
select t.fails('you cannot report your own message',
  format($$select public.report_message(%L, 'oops')$$, (select id from public.messages where body = 'Sorry about that.')), 'cannot_report_own_message');
select public.report_message(t.id('bad_msg'), 'Asking for my PIN');
insert into t.ids select 'rep1', id from public.message_reports;
select t.login('mallory');
select t.eq('the reported user cannot see the report', t.q($$select count(*) from public.message_reports$$), '0');
select t.fails('only staff can resolve reports',
  format($$select public.hq_resolve_message_report(%L, 'dismissed', 'x')$$, t.id('rep1')), 'not_allowed');
select t.login('frank');
select t.eq('staff of another country cannot see it', t.q($$select count(*) from public.message_reports$$), '0');
select t.login('carol');
select t.eq('ops staff see the report', t.q($$select count(*) from public.message_reports where status = 'open'$$), '1');
select t.eq('the report carries recent context', t.q($$select (jsonb_array_length(context) >= 2)::text from public.message_reports$$), 'true');
select public.hq_resolve_message_report(t.id('rep1'), 'actioned', 'Seller warned');
select t.eq('resolution is audited', t.q($$select count(*) from public.audit_logs where action = 'message_report.resolve'$$), '1');

select t.root();
rollback;

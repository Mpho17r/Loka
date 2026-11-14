-- Fixture for the parallel overselling test: one live campaign with 50 impressions to sell and no frequency limit.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'conc@t');
update public.profiles set verification = 'business' where id = '00000000-0000-0000-0000-0000000000a1';
insert into public.ad_accounts (id, owner_id, country_code) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'ZA');
insert into public.campaigns (id, account_id, country_code, target_type, target_id, placement, status, impressions_bought, frequency_cap, start_date, end_date)
values ('00000000-0000-0000-0000-00000000c0c0', '00000000-0000-0000-0000-0000000000b1', 'ZA', 'product', gen_random_uuid(), 'search', 'live', 50, 1000, current_date, current_date + 5);

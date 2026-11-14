-- Reference data for South Africa. Prices and VAT are ILLUSTRATIVE TEST VALUES: confirm with an accountant
-- and replace via the HQ price book before enabling Promote for real customers.

insert into public.countries (code, name, currency, active, promote_enabled) values
  ('ZA', 'South Africa', 'ZAR', true, true)
on conflict (code) do nothing;

insert into public.cities (country_code, name) values
  ('ZA', 'Thohoyandou'), ('ZA', 'Polokwane'), ('ZA', 'Johannesburg'),
  ('ZA', 'Pretoria'), ('ZA', 'Cape Town'), ('ZA', 'Durban')
on conflict do nothing;

insert into public.placements (code, name, note, formats) values
  ('homepage', 'Homepage banner', 'Top of the home page', array['image', 'video']),
  ('search',   'Search results',  'Sponsored card among results', array['image']),
  ('category', 'Category page',   'Banner on category pages', array['image', 'video']),
  ('listing',  'Listing detail',  'Related strip on listing pages', array['image'])
on conflict (code) do nothing;

insert into public.placement_availability (country_code, placement) values
  ('ZA', 'homepage'), ('ZA', 'search'), ('ZA', 'category'), ('ZA', 'listing')
on conflict do nothing;

insert into public.price_books (country_code, placement, format, cpm) values
  ('ZA', 'homepage', 'image', 60), ('ZA', 'search', 'image', 40),
  ('ZA', 'category', 'image', 30), ('ZA', 'listing', 'image', 20),
  ('ZA', 'homepage', 'video', 90), ('ZA', 'category', 'video', 45);

insert into public.tax_rules (country_code, name, rate) values ('ZA', 'VAT', 0.1500);

insert into public.promote_settings (country_code, local_multiplier, premium_discount, monthly_premium_credit, credit_expiry_days)
values ('ZA', 0.700, 0.100, 50, 90)
on conflict (country_code) do nothing;

-- To make yourself HQ owner after signing up (run in the Supabase SQL editor, replace the email):
--   insert into public.user_roles (user_id, role)
--   select id, 'owner' from auth.users where email = 'you@example.com';

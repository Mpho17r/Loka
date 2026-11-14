-- Loka core schema: countries, profiles, staff roles, listings, service requests, audit log.
-- Targets Supabase (Postgres 15+). Uses auth.users and auth.uid() provided by Supabase.

-- ---------------------------------------------------------------- countries and cities
create table public.countries (
  code            text primary key check (code ~ '^[A-Z]{2}$'),
  name            text not null,
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  active          boolean not null default false,
  promote_enabled boolean not null default false  -- Promote is switched on per country after readiness review
);

create table public.cities (
  id           uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  name         text not null,
  unique (country_code, name)
);

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null default '',
  phone        text,
  country_code text not null default 'ZA' references public.countries(code),
  city         text,
  verification text not null default 'unverified' check (verification in ('unverified', 'identity', 'business')),
  is_premium   boolean not null default false,
  created_at   timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- staff roles (Saccharum HQ)
create table public.user_roles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'country_admin', 'ops', 'finance', 'support')),
  country_code text references public.countries(code),   -- null = all countries (owner only)
  created_at   timestamptz not null default now(),
  check (role = 'owner' or country_code is not null)
);
create unique index user_roles_unique on public.user_roles (user_id, role, coalesce(country_code, '--'));

-- True when the signed-in user is HQ staff allowed to act for a country with one of the given roles.
-- owner: everything everywhere. country_admin: every role inside their country.
create function public.is_staff(p_country text, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid()
      and (r.role = 'owner'
        or (r.country_code = p_country and (r.role = 'country_admin' or r.role = any (p_roles))))
  );
$$;

create function public.is_any_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- listings
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references public.profiles(id) on delete set null,  -- null = Loka-owned listing
  seller_name       text not null,
  seller_verification text not null default 'unverified' check (seller_verification in ('unverified', 'identity', 'business')),
  title             text not null check (char_length(title) between 3 and 120),
  description       text not null default '',
  price             numeric(12, 2) not null check (price >= 0),
  condition         text not null check (condition in ('New', 'Second-hand')),
  category          text not null,
  city              text not null,
  country_code      text not null default 'ZA' references public.countries(code),
  status            text not null default 'active' check (status in ('active', 'sold', 'removed')),
  created_at        timestamptz not null default now()
);
create index products_listing_idx on public.products (country_code, status, category, city);

create table public.services (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references public.profiles(id) on delete set null,
  provider_name     text not null,
  provider_verification text not null default 'unverified' check (provider_verification in ('unverified', 'identity', 'business')),
  title             text not null check (char_length(title) between 3 and 120),
  description       text not null default '',
  category          text not null,
  city              text not null,
  country_code      text not null default 'ZA' references public.countries(code),
  pricing_model     text not null check (pricing_model in ('Fixed price', 'Hourly', 'Quotation', 'Free consultation')),
  from_price        numeric(12, 2) check (from_price is null or from_price >= 0),
  delivery          text not null check (delivery in ('On-site', 'Remote', 'Both')),
  provided_by_loka  boolean not null default false,  -- Loka is the provider (plan section 3.3)
  rating            numeric(2, 1) not null default 0,
  jobs_done         integer not null default 0,
  status            text not null default 'active' check (status in ('active', 'paused', 'removed')),
  created_at        timestamptz not null default now()
);
create index services_listing_idx on public.services (country_code, status, category, city);

create table public.service_requests (
  id             uuid primary key default gen_random_uuid(),
  service_id     uuid not null references public.services(id) on delete cascade,
  requester_id   uuid not null references public.profiles(id) on delete cascade,
  details        text not null check (char_length(trim(details)) >= 10),
  city           text not null,
  budget         numeric(12, 2) check (budget is null or budget >= 0),
  preferred_date date,
  status         text not null default 'Submitted'
                   check (status in ('Submitted', 'Under review', 'Quoted', 'Accepted', 'Completed', 'Cancelled')),
  created_at     timestamptz not null default now()
);
create index service_requests_requester_idx on public.service_requests (requester_id);

-- Keep the verification label on listings in step with the owner's real verification level,
-- so an advert or listing can never show a higher level than the account holds.
create function public.sync_listing_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verification is distinct from old.verification then
    update public.products set seller_verification = new.verification where owner_id = new.id;
    update public.services set provider_verification = new.verification where owner_id = new.id;
  end if;
  return new;
end $$;
create trigger profiles_sync_verification after update of verification on public.profiles
  for each row execute function public.sync_listing_verification();

create function public.set_listing_verification() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if new.owner_id is not null then
    select verification into v from public.profiles where id = new.owner_id;
    if tg_table_name = 'products' then new.seller_verification := coalesce(v, 'unverified');
    else new.provider_verification := coalesce(v, 'unverified'); end if;
  end if;
  return new;
end $$;
create trigger products_set_verification before insert on public.products
  for each row execute function public.set_listing_verification();
create trigger services_set_verification before insert on public.services
  for each row execute function public.set_listing_verification();

-- ---------------------------------------------------------------- audit log
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  action       text not null,
  entity       text not null,
  entity_id    text,
  country_code text,
  detail       jsonb not null default '{}'::jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create function public.write_audit(p_action text, p_entity text, p_entity_id text, p_country text, p_detail jsonb, p_reason text)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity, entity_id, country_code, detail, reason)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_country, coalesce(p_detail, '{}'::jsonb), p_reason);
$$;
revoke all on function public.write_audit(text, text, text, text, jsonb, text) from public, anon, authenticated;

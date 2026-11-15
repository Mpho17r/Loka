-- Fast partial-text search for listings, and what is needed to deliver notifications by push and email.

-- ================================================================ search
-- The app searches with ILIKE '%text%' and pages with offset/limit. Trigram indexes keep that fast as listings grow.
create extension if not exists pg_trgm;

create index products_title_trgm on public.products using gin (title gin_trgm_ops);
create index products_description_trgm on public.products using gin (description gin_trgm_ops);
create index products_seller_trgm on public.products using gin (seller_name gin_trgm_ops);
create index products_created_idx on public.products (created_at desc, id desc);
create index services_title_trgm on public.services using gin (title gin_trgm_ops);
create index services_description_trgm on public.services using gin (description gin_trgm_ops);
create index services_provider_trgm on public.services using gin (provider_name gin_trgm_ops);
create index services_created_idx on public.services (created_at desc, id desc);

-- ================================================================ notification delivery
alter table public.profiles
  add column push_enabled  boolean not null default true,
  add column email_enabled boolean not null default true;
grant update (push_enabled, email_enabled) on public.profiles to authenticated;

create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token      text not null check (char_length(token) between 10 and 300),
  platform   text,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
alter table public.push_tokens enable row level security;
grant select, insert, delete on public.push_tokens to authenticated;
create policy push_tokens_own_read on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy push_tokens_own_insert on public.push_tokens for insert to authenticated with check (user_id = auth.uid());
create policy push_tokens_own_delete on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- Set by the send-notifications function (service role) once push and email have been attempted.
alter table public.notifications add column delivered_at timestamptz;

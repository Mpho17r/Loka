-- LOKA PROMOTE tables (see the LOKA PROMOTE specification, sections 3 to 8).

-- ---------------------------------------------------------------- configuration owned by HQ
create table public.placements (
  code    text primary key check (code in ('homepage', 'search', 'category', 'listing')),
  name    text not null,
  note    text not null default '',
  formats text[] not null default array['image']
);

create table public.placement_availability (
  country_code text not null references public.countries(code),
  placement    text not null references public.placements(code),
  enabled      boolean not null default true,
  primary key (country_code, placement)
);

create table public.price_books (
  id             uuid primary key default gen_random_uuid(),
  country_code   text not null references public.countries(code),
  placement      text not null references public.placements(code),
  format         text not null default 'image' check (format in ('image', 'video')),
  cpm            numeric(12, 2) not null check (cpm > 0),  -- price per 1,000 impressions, excluding tax
  effective_from date not null default current_date,
  effective_to   date,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index price_books_lookup_idx on public.price_books (country_code, placement, format, effective_from desc);

create table public.tax_rules (
  id             uuid primary key default gen_random_uuid(),
  country_code   text not null references public.countries(code),
  name           text not null,
  rate           numeric(6, 4) not null check (rate >= 0 and rate < 1),
  effective_from date not null default current_date,
  created_at     timestamptz not null default now()
);

create table public.promote_settings (
  country_code           text primary key references public.countries(code),
  local_multiplier       numeric(4, 3) not null default 0.700 check (local_multiplier > 0 and local_multiplier <= 1),
  premium_discount       numeric(4, 3) not null default 0.100 check (premium_discount >= 0 and premium_discount < 1),
  monthly_premium_credit numeric(12, 2) not null default 0 check (monthly_premium_credit >= 0),
  credit_expiry_days     integer not null default 90 check (credit_expiry_days > 0),
  max_frequency_cap      integer not null default 3 check (max_frequency_cap > 0),
  min_impressions        integer not null default 1000 check (min_impressions > 0),
  max_impressions        integer not null default 1000000,
  max_campaign_days      integer not null default 90
);

-- ---------------------------------------------------------------- advertisers and campaigns
create table public.ad_accounts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null unique references public.profiles(id) on delete cascade,
  country_code text not null references public.countries(code),
  status       text not null default 'active' check (status in ('active', 'suspended')),
  created_at   timestamptz not null default now()
);

create table public.campaigns (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references public.ad_accounts(id),
  country_code          text not null references public.countries(code),
  target_type           text not null check (target_type in ('product', 'service')),
  target_id             uuid not null,
  placement             text not null references public.placements(code),
  format                text not null default 'image' check (format in ('image', 'video')),
  city                  text,                       -- null = national within the country
  status                text not null default 'pending_review' check (status in (
                          'draft', 'pending_review', 'changes_requested', 'rejected',
                          'approved_awaiting_payment', 'scheduled', 'live', 'paused',
                          'completed', 'terminated', 'cancelled')),
  impressions_bought    integer not null check (impressions_bought > 0),
  impressions_delivered integer not null default 0 check (impressions_delivered >= 0),
  clicks                integer not null default 0 check (clicks >= 0),
  frequency_cap         integer not null default 3 check (frequency_cap > 0),
  start_date            date not null,
  end_date              date not null,
  managed_by            uuid,                       -- HQ user, for managed advertising
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (end_date >= start_date),
  check (impressions_delivered <= impressions_bought)
);
create index campaigns_serving_idx on public.campaigns (placement, status) where status = 'live';
create index campaigns_account_idx on public.campaigns (account_id);

-- Creative and wording are versioned: a change to a live campaign is a new revision that is moderated again.
create table public.campaign_revisions (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version     integer not null,
  headline    text not null check (char_length(headline) between 5 and 60),
  description text not null default '' check (char_length(description) <= 120),
  cta         text not null default 'View' check (cta in ('View', 'Request quote', 'Message', 'Shop')),
  media_path  text,
  is_live     boolean not null default true,
  review      text not null default 'pending' check (review in ('pending', 'approved', 'rejected', 'changes_requested')),
  created_at  timestamptz not null default now(),
  unique (campaign_id, version)
);

-- ---------------------------------------------------------------- pricing record, billing and credits
create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null unique references public.campaigns(id) on delete cascade,
  price_book_id    uuid references public.price_books(id),
  cpm              numeric(12, 2) not null,
  geo_multiplier   numeric(4, 3) not null,
  gross            numeric(12, 2) not null,
  premium_discount numeric(12, 2) not null default 0,
  credit_applied   numeric(12, 2) not null default 0,
  management_fee   numeric(12, 2) not null default 0,
  net              numeric(12, 2) not null,
  tax_name         text not null,
  tax_rate         numeric(6, 4) not null,
  vat              numeric(12, 2) not null,
  total            numeric(12, 2) not null,
  currency         text not null,
  created_at       timestamptz not null default now()
);

create sequence public.invoice_number_seq;

create table public.invoices (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique default ('LK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  quote_id    uuid not null references public.quotes(id),
  total       numeric(12, 2) not null check (total >= 0),
  currency    text not null,
  -- paid_declared = advertiser says they paid; verified = HQ confirmed it. Never conflate the two.
  status      text not null default 'issued' check (status in ('issued', 'paid_declared', 'verified', 'refund_due', 'refunded')),
  method      text check (method in ('manual', 'credit', 'gateway')),
  proof_path  text,
  verified_by uuid,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

create table public.payment_records (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  kind       text not null check (kind in ('payment', 'refund')),
  amount     numeric(12, 2) not null check (amount > 0),
  status     text not null check (status in ('declared', 'verified')),
  reference  text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.ad_credits (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.ad_accounts(id) on delete cascade,
  amount      numeric(12, 2) not null check (amount <> 0),  -- positive = granted or released, negative = applied
  kind        text not null check (kind in ('grant', 'premium_monthly', 'applied', 'release', 'revoke')),
  campaign_id uuid references public.campaigns(id),
  month_key   text,
  expires_at  timestamptz,
  reason      text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create unique index ad_credits_monthly_once on public.ad_credits (account_id, month_key) where kind = 'premium_monthly';

-- ---------------------------------------------------------------- moderation, complaints, managed requests
create table public.moderation_cases (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  reviewer_id uuid,
  decision    text not null check (decision in ('approved', 'rejected', 'changes_requested', 'paused', 'terminated')),
  policy_rule text,
  reason      text,
  created_at  timestamptz not null default now()
);

create table public.ad_reports (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason      text not null check (char_length(trim(reason)) >= 5),
  status      text not null default 'open' check (status in ('open', 'investigating', 'actioned', 'dismissed')),
  resolution  text,
  handled_by  uuid,
  created_at  timestamptz not null default now()
);

create table public.managed_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  country_code text not null references public.countries(code),
  brief        text not null check (char_length(trim(brief)) >= 10),
  budget       numeric(12, 2) check (budget is null or budget >= 0),
  status       text not null default 'new' check (status in ('new', 'in_progress', 'campaign_created', 'declined')),
  assigned_to  uuid,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- events and reporting
create table public.ad_impressions (
  id          bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  placement   text not null,
  viewer_key  text not null,
  created_at  timestamptz not null default now()
);
create index ad_impressions_campaign_idx on public.ad_impressions (campaign_id, created_at);

create table public.ad_clicks (
  id          bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  viewer_key  text not null,
  created_at  timestamptz not null default now()
);
create index ad_clicks_dedupe_idx on public.ad_clicks (campaign_id, viewer_key, created_at desc);

-- Per viewer, per campaign, per day: enforces the frequency cap atomically.
create table public.ad_frequency (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  viewer_key  text not null,
  day         date not null default current_date,
  shown       integer not null default 0,
  primary key (campaign_id, viewer_key, day)
);
create index ad_frequency_viewer_idx on public.ad_frequency (viewer_key, day);

create table public.campaign_stats_daily (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  day         date not null,
  placement   text not null,
  impressions integer not null default 0,
  clicks      integer not null default 0,
  primary key (campaign_id, day)
);

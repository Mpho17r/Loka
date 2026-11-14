# Loka

Mobile app by Saccharum Technologies: **Loka Market**, **Loka Services** and **Loka Promote** (advertising).
React Native (Expo) + TypeScript front end, Supabase (Postgres) back end.

The app runs in two modes:

| Mode | When | Data |
| --- | --- | --- |
| **Demo** | No Supabase keys set | In-memory sample data. Every flow works, nothing is saved. |
| **Live** | `.env` has your Supabase URL and anon key | Real accounts, listings, campaigns, billing and HQ actions. |

## Run the app

```bash
npm install
npx expo install --fix      # aligns library versions with your Expo SDK
npx expo start              # scan the QR code with Expo Go
npm run typecheck && npm test
```

## Connect a back end (Live mode)

1. Create a project at supabase.com (or use the one behind Lovable Cloud).
2. In the SQL editor run, in order, every file in `supabase/migrations/`, then `supabase/seed.sql`.
   Or with the Supabase CLI: `supabase db push`.
3. Copy `.env.example` to `.env` and fill in the project URL and **anon** key (Project Settings, API).
   Never put the `service_role` key in the app.
4. Sign up in the app, then make yourself HQ owner (SQL editor):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'owner' from auth.users where email = 'you@example.com';
   ```
5. An **HQ** tab appears. Verify your own account there (advertisers must be verified), then promote a listing.
6. Schedule the two jobs (Database, Cron): `select public.run_campaign_jobs();` every 15 minutes and
   `select public.grant_monthly_premium_credits();` once a month.

Seed data is for South Africa. Prices (CPM) and 15% VAT are **illustrative test values**: confirm tax with an
accountant and set real prices in the HQ price book before real customers pay anything.

## What is built

- **Market and Services:** listings, search and filters, quotation requests, "who provides this service" notice,
  add your own product or service, verification badges that can never exceed the account's real level.
- **Promote (advertisers):** promote an existing listing, choose placement, city or national, impressions and
  duration, see the full price including VAT before submitting, use advertising credit and premium discount,
  declare payment, pause, resume or cancel, performance report (impressions, clicks, CTR, spend, remaining).
- **Sponsored slots:** labelled "Sponsored" on Home, Market and Services. Targeting, pacing and the
  3-per-viewer-per-day frequency cap are enforced in the database. Impressions are counted after 1 second on screen.
- **Saccharum HQ tab (staff only):** review queue (approve, reject or request changes with a reason), payment
  verification, pause or terminate, complaints, revenue, account verification and premium flags, credits, refunds,
  managed-advertising requests. Refunds above the country limit (R500 in the seed) need a **second finance user**
  to approve; nobody can approve their own request.
- **Notifications:** advertisers are told when a campaign is approved, paid, live, rejected, needs changes, paused or
  stopped by HQ, finished (with the HQ reason). Shown in the Account tab with an unread badge. Their own
  pause, resume and cancel do not notify them.
- **Security:** row-level security on every table. App users cannot write campaigns, invoices, credits or prices
  directly; they call database functions that re-check who they are. HQ roles are limited by country.

## Tests

- `npm test`: pricing engine and the demo back end (12 tests).
- `npm run test:db`: applies every migration to a throwaway Postgres and runs 118 checks: the R713.00 worked
  example, who may do what, payment and approval gates, frequency caps, credit return on cancel and reject,
  refunds and the two-person rule, notifications, price-book permissions, scheduled jobs, and a parallel test where
  20 sessions make 200 simultaneous attempts against 50 remaining impressions and exactly 50 are sold.

## Not built yet

- Image and video upload in the app. The `ad-media` and `payment-proofs` storage buckets and their access rules
  are in the migrations (they apply on Supabase); the app screens and the media scan are not built.
- Payment gateway. Payments are declared by the advertiser and verified by HQ, as in the plan. The
  `payment_records` table and `invoices.method` are ready for a gateway adapter.
- Automated content scanning; email and push notifications (in-app ones are built); messaging.
- Server-side search and paging (the app loads up to 500 active listings per type); partitioning of the raw
  impression tables for high traffic.
- Real-device testing. The app type-checks and bundles for Android, but has not been run on a phone.
- Lint: `npx expo lint` needs to download its config; run it once on your machine.

See `docs/` and the LOKA PROMOTE specification for the full design.

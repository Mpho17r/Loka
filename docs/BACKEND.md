# Back end reference

Migrations are in `supabase/migrations/` and run in order.

| File | Contents |
| --- | --- |
| `...01_core.sql` | countries, cities, profiles, staff roles, products, services, service requests, audit log |
| `...02_promote_tables.sql` | placements, price books, tax rules, settings, ad accounts, campaigns and revisions, quotes, invoices, payments, credits, moderation, complaints, managed requests, impressions, clicks, frequency, daily stats |
| `...03_promote_functions.sql` | pricing, campaign lifecycle, HQ actions, ad serving and tracking, scheduled jobs, advertiser report view |
| `...04_rls.sql` | row-level security and grants |
| `...05_refunds_notifications.sql` | two-person refund rule, advertiser notifications, storage buckets and rules |

## Campaign lifecycle

`pending_review` -> HQ approves -> `approved_awaiting_payment` -> payment verified -> `scheduled` -> `live` (on the
start date) -> `completed`. A campaign never serves until it is both approved and payment-verified. A campaign whose
total is R0 (fully covered by credit) counts as paid. Side exits: `changes_requested`, `rejected`, `paused`,
`terminated` (HQ), `cancelled` (advertiser). Unused impressions come back as advertising credit.

## Who can call what

| Role | Can |
| --- | --- |
| Visitor | read listings; be served adverts; count impressions and clicks |
| Signed-in user | manage own listings and requests; quote and create campaigns for own listings (verified accounts only); pay, pause, resume, cancel own campaigns; file complaints |
| `ops` | review and moderate campaigns, pause or terminate, handle complaints, set verification and premium |
| `finance` | verify payments, refunds, credits, revenue report |
| `country_admin` | all of the above for one country, plus price books and settings |
| `owner` | everything, all countries |

Every sensitive action requires a reason and is written to `audit_logs`.

## Adding a country

Insert the country, cities, `placement_availability`, `price_books`, `tax_rules` and `promote_settings`, then set
`countries.promote_enabled = true`. No code release is needed.

## After adding tables

`20261113000004_rls.sql` revokes default privileges and grants access explicitly. New tables need `enable row level
security` plus policies, and new functions need an explicit `grant execute`.

## Refunds

Up to `promote_settings.refund_approval_limit` (R500 in the seed) a finance user refunds immediately. Above it,
`hq_refund` creates a `refund_requests` row and returns `pending_approval`; a different finance user (or the owner)
calls `hq_decide_refund`. Cash refunds revoke an equal amount of released credit by default so money is not returned
twice. VAT on the unused share needs a credit note from Finance.

## Delivering notifications by push and email

`supabase/functions/send-notifications` sends a row from `notifications` to the user's phones (Expo push) and inbox
(Resend), respecting `profiles.push_enabled` and `email_enabled`, then stamps `delivered_at` so a replay never sends twice.
Unregistered phones are removed from `push_tokens`.

1. `supabase functions deploy send-notifications --no-verify-jwt`
2. `supabase secrets set WEBHOOK_SECRET=<long random text> RESEND_API_KEY=<key> EMAIL_FROM="Loka <no-reply@your-domain>"`
3. In the dashboard, Database > Webhooks: new webhook on table `notifications`, event Insert, type Supabase Edge Function,
   add the header `x-webhook-secret` with the same value as `WEBHOOK_SECRET`.
4. For push, build the app with EAS (`eas init` adds `extra.eas.projectId` to `app.json`). Push tokens do not work in Expo Go
   on recent SDKs and need a real device.

## Images

Adverts upload to the public `ad-media` bucket and payment proofs to the private `payment-proofs` bucket, always under a
folder named after the user's id. HQ opens proofs through signed links that expire after 5 minutes. Advert images are
publicly readable by address from the moment of upload, before review; the addresses are random and unlisted.

## Notifications

A trigger on `campaigns.status` writes to `notifications`, quoting the latest moderation reason. Users can read their
own rows and flip `read`; they cannot create or edit them.

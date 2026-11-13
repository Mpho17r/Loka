# Loka app (prototype)

React Native (Expo, TypeScript) prototype of the Loka mobile app by Saccharum Technologies.
Includes **Loka Market**, **Loka Services** and **Loka Promote**, running on sample data.

## Run
```bash
npm install
npx expo install --fix   # aligns library versions with your Expo SDK
npx expo start           # scan the QR code with Expo Go, or press a / i
npm test                 # pricing engine tests
npm run typecheck
```

## What works
- **Market:** search, category and city filters, product details, verification badges, enquiry (stub).
- **Services:** search and filters, provider details, a clear "who provides this service" notice, quotation requests with validation, "My requests".
- **Promote:** "Promote this product/service" from any listing, campaign builder (placement, city, impressions, duration), live price preview with premium discount, advertising credit and 15% VAT, submit for review, campaign list and performance report.
- **Sponsored slots:** once a campaign is Live it appears, labelled "Sponsored", on Home, Market or Services without changing organic order.
- **Demo HQ actions** on the campaign screen simulate Saccharum HQ: approve, verify payment, start delivery, reject, terminate. In production these belong in the HQ control centre.

## Not built yet (needs a backend)
Accounts and roles, real database and storage, image/video upload, messaging, payment records, moderation queue, real impression and click tracking, push notifications, multi-country price books. See the LOKA PROMOTE specification and the Implementation Plan for the build order.

## Notes
- Rates in `src/lib/pricing.ts` are illustrative test rates, not approved prices. VAT at 15% must be confirmed with an accountant.
- State is in memory (`src/store/AppState.tsx`); restarting the app resets it.
- Replace `src/data/sample.ts` with backend queries when the Lovable Cloud project has been audited.

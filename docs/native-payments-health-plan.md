# Arc90 Native, Payments, and Health Plan

## Stripe

Do not store Stripe secret keys in `js/app.js`, localStorage, or any shipped frontend asset.

Safe flow:
1. App calls `POST /api/create-checkout-session`.
2. Backend reads `STRIPE_SECRET_KEY` from environment variables.
3. Backend creates a Stripe Checkout Session for Arc90 Premium.
4. App redirects to the returned Checkout URL.
5. Stripe webhook marks the user premium in the real account database.

For the current static prototype, `stripe-checkout` intentionally shows a setup message instead of accepting a secret key.

## HealthKit

The web layer is ready for a native bridge:

```js
window.__arc90HealthSync({
  date: '2026-06-11',
  steps: 8421,
  weight: '181.4',
  water: 7
});
```

When steps meet the configured goal, Arc90 auto-completes a matching steps or walking habit.

SwiftUI path:
- Best for HealthKit, widgets, real local notifications, Live Activities, and App Store polish.
- Use `WKWebView` for the existing app or port screens to native SwiftUI over time.

Capacitor path:
- Fastest App Store path from the current PWA.
- Add native plugins for HealthKit, notifications, widgets, and StoreKit/Stripe handoff.

## Recommendation

Ship Capacitor first if speed matters. Move to SwiftUI when HealthKit, widgets, and notification reliability become product-critical.

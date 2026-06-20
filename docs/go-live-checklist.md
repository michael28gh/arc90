# Arc90 Go-Live Checklist

## Production PWA

- Log in once on this machine with `npx vercel login`.
- Deploy to Vercel with `npm run deploy:prod`.
- Set `SITE_URL` to the production HTTPS URL.
- Confirm `/api/health` returns `{ "ok": true }`.
- Open the production URL on iPhone Safari and add it to the Home Screen.
- Verify onboarding, dark mode, tab transitions, saved data, export, and offline reload.

## Stripe

- Create a recurring Stripe Price for Arc90 Premium.
- Add `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` as production environment variables.
- In Vercel, add env vars in Project Settings → Environment Variables, or use:
  - `npx vercel env add SITE_URL production`
  - `npx vercel env add STRIPE_SECRET_KEY production`
  - `npx vercel env add STRIPE_PRICE_ID production`
- Use test mode first, then switch the variables to live mode.
- Keep all Stripe secret keys out of frontend files.
- Before serious scale, add a user/account layer plus webhook-backed subscription verification.

## Current Deploy Status

No current PWA deploy blocker. Production is live at `https://arc90.vercel.app`.

## Legal And Trust

- Privacy/Terms beta contact is set to `michael28gh@gmail.com`.
- Have a lawyer review the wellness, supplement, peptide, and no-medical-advice language.
- Add a branded support email and business/entity name before broad public launch.

## App Store Path

- PWA launch is live.
- Capacitor iOS wrapper builds, signs, installs, and launches on a real iPhone.
- First release is iPhone-only and portrait-first.
- Next App Store Connect blocker: paid Apple Developer Program membership / App Store Connect app record for TestFlight.
- Native SwiftUI later for HealthKit, Screen Time APIs, notifications, widgets, and Apple-grade polish.

## Launch Test

- Invite 10-20 testers.
- Watch Day 1 onboarding completion, Day 2 return, and Day 7 retention.
- Ask where the app feels saturated, confusing, or motivating.
- Fix only the highest-friction points before a larger launch.

# ARC90 App Store Launch Plan

## Goal
Launch ARC90 on the iOS App Store as a free app first, using the existing Capacitor iOS wrapper.

## Current State
- Live PWA app: https://arc90.vercel.app/
- Landing page: https://arc90.vercel.app/landing
- Bundle ID: `com.arc90.app`
- App name: `Arc90`
- Version: `1.0`
- Build: `1`
- Platform: iPhone
- Orientation: portrait
- Category: Health & Fitness
- Secondary category: Productivity

## Developer Account Path
- Enroll in the Apple Developer Program as an Individual.
- Annual membership is handled through Apple.
- Individual enrollment is the fastest path.
- App Store seller name will show the personal legal name on the Apple account.
- Organization enrollment can come later if ARC90 moves under a company name.

## First iOS Release Scope
Ship a free app first.

Include:
- Onboarding.
- Daily habit tracking.
- Momentum score.
- Progress view.
- Focus tools.
- Protocol tracking as tracking-only.
- Profile/settings.
- Export and privacy/terms links.

Do not include:
- Stripe checkout inside the iOS app.
- Digital Premium purchase through web checkout.
- Medical advice, dosing, treatment recommendations, or body-change claims.

StoreKit can be added after the free app is approved.

## App Store Connect Metadata
Use the existing metadata file:
`/Users/michael28gh/Projects/arc90/docs/app-store-connect-metadata.md`

Core copy:
- Subtitle: Build your next 90 days.
- Promotional text: Turn one important goal into daily reps, focus blocks, momentum tracking, and AI-guided weekly reflection.
- Support URL: https://arc90.vercel.app/
- Privacy URL: https://arc90.vercel.app/privacy.html

## Submission Flow
1. Complete Apple Developer Program enrollment.
2. Open App Store Connect.
3. Create the iOS app record.
4. Select bundle ID `com.arc90.app`.
5. Enter metadata, category, pricing, privacy URL, and support URL.
6. Open Xcode and select the paid Apple Developer Team.
7. Archive the app.
8. Upload the build to App Store Connect.
9. Wait for build processing.
10. Attach the build to the app version.
11. Complete privacy questionnaire.
12. Submit for public App Review.

## Review Notes
Use plain language:

```text
Arc90 is a habit, focus, and wellness tracking app. The app stores user-entered goals, habits, wellness logs, and settings locally on device. Arc90 does not provide medical advice, diagnosis, treatment, dosing recommendations, or emergency services. Wellness and protocol tracking are for personal organization only.
```

## Screenshots
Use iPhone portrait screenshots. Prioritize:
- Onboarding or Today.
- Momentum score.
- Habit library.
- Progress dashboard.
- Focus or weekly review.
- Profile/settings or privacy/local-first.


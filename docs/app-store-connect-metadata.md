# Arc90 App Store Connect Metadata

## App Identity

- App name: Arc90
- Bundle ID: `com.arc90.app`
- SKU: `arc90-ios`
- Version: `1.0`
- Build: `1`
- Platform: iOS
- Device support: iPhone
- Orientation: Portrait
- Category: Health & Fitness
- Secondary category: Productivity

## Subtitle

Build your next 90 days.

## Promotional Text

Turn one important goal into daily reps, focus blocks, momentum tracking, and AI-guided weekly reflection.

## Description

Arc90 helps you turn one meaningful 90-day goal into a daily operating system.

Track the habits that actually move your goal forward, see your momentum score, protect focus time, log wellness routines, and review your week with guided reflection.

Arc90 is built for people who want fewer scattered trackers and a clearer daily rhythm:

- Daily habit reps tied to one 90-day arc
- Momentum score and progress rings
- Focus system for reducing distracting apps and sites
- Protocol tracker for supplements, wellness routines, and observations
- Water, weight, and step logs
- Morning intention and evening reflection prompts
- Weekly AI review and next-week focus

Arc90 is not a medical device and does not provide medical advice. Wellness and protocol tracking are for personal organization only.

## Keywords

habit tracker, goals, focus, streaks, wellness, productivity, routine, 90 days, reflection, supplements

## Support URL

https://arc90.vercel.app/

## Privacy URL

https://arc90.vercel.app/privacy.html

## TestFlight What To Test

Please test the first-run onboarding, daily habit completion, tab transitions, focus setup, progress view, protocol tracker, and profile/settings flows. Report any confusing copy, visual clutter, layout issues, or places where the app feels too heavy.

## Beta App Review Notes

Arc90 is a habit, focus, and wellness tracking app. The current TestFlight build stores data locally on device. The Stripe web checkout exists for the PWA/web version only; native iOS digital premium access will use Apple In-App Purchase/StoreKit before public paid App Store distribution.

## Privacy Nutrition Draft

- Data collection: currently local-first. User-entered goals, habits, wellness logs, protocol notes, focus entries, and AI keys are stored on device.
- Data used to track users: No.
- Third-party advertising: No.
- Linked to user: Not by Arc90 in the current local-first build.
- Optional third-party data transfer: If a user connects an AI provider key and sends a coach message, that prompt is sent to the selected provider.
- Payments: Web/PWA checkout uses Stripe. iOS App Store premium should use StoreKit.

## Current Upload Blocker

The local Release archive succeeds at:

`/Users/michael28gh/Projects/arc90/build/Arc90.xcarchive`

App Store Connect export fails because the current account is `michael arellano (Personal Team)`, which has no App Store Connect provider and cannot create iOS Distribution certificates or App Store provisioning profiles. Enroll in the paid Apple Developer Program, then reopen Xcode Settings > Accounts and refresh the team.

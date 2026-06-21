# ARC90 Apple Developer Checklist

## Apple Developer Enrollment
- [ ] Use an Apple ID with two-factor authentication enabled.
- [ ] Enroll as Individual at https://developer.apple.com/programs/enroll/
- [ ] Pay Apple Developer Program membership.
- [ ] Wait for Apple approval.
- [ ] Confirm App Store Connect access works.

## App Store Connect Setup
- [ ] Create new app.
- [ ] Platform: iOS.
- [ ] Name: Arc90.
- [ ] Bundle ID: `com.arc90.app`.
- [ ] SKU: `arc90-ios`.
- [ ] User access: full access for the owner account.
- [ ] Category: Health & Fitness.
- [ ] Secondary category: Productivity.
- [ ] Pricing: Free.

## Xcode Upload
- [ ] Open `/Users/michael28gh/Projects/arc90/ios/App/App.xcworkspace`.
- [ ] Select the `App` target.
- [ ] Set the paid Apple Developer Team.
- [ ] Confirm bundle identifier is `com.arc90.app`.
- [ ] Confirm version is `1.0`.
- [ ] Confirm build is `1`.
- [ ] Run on a real iPhone.
- [ ] Archive.
- [ ] Upload to App Store Connect.

## Pre-Review Product Checks
- [ ] Fresh install opens correctly.
- [ ] Onboarding completes.
- [ ] User can create a goal.
- [ ] User can add habits.
- [ ] User can complete habits.
- [ ] Progress screen works.
- [ ] Focus screen works.
- [ ] Profile/settings works.
- [ ] Privacy link opens.
- [ ] Terms link opens.
- [ ] App works after closing and reopening.
- [ ] App does not expose Stripe checkout in the iOS build.
- [ ] App does not make medical, dosing, treatment, or body-change claims.

## App Review Submission
- [ ] Upload screenshots.
- [ ] Fill description and keywords.
- [ ] Fill privacy questionnaire.
- [ ] Add review contact information.
- [ ] Add review notes.
- [ ] Attach processed build.
- [ ] Submit for review.


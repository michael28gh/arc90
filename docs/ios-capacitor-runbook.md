# Arc90 iOS Capacitor Runbook

## What This Is

This is the fast App Store path: Arc90's production PWA is bundled inside a native iOS shell with Capacitor. It lets you test the app on an iPhone through Xcode and later prepare TestFlight.

## Commands

```bash
cd /Users/michael28gh/Projects/arc90
npm run ios:sync
npm run ios:open
```

## Xcode Setup

1. Install Xcode from the Mac App Store if `xcodebuild -version` does not work.
2. Open the generated iOS workspace through `npm run ios:open`.
3. In Xcode, select the `App` target.
4. Set your Apple Developer Team under Signing & Capabilities.
5. Confirm the bundle identifier is `com.arc90.app`.
6. Select your iPhone as the run destination and press Run.

## App Store Notes

- First iOS release is iPhone-only. The app is portrait-first and targets `TARGETED_DEVICE_FAMILY = 1`.
- Real-device development install passed on `iPhone de Michael` with bundle identifier `com.arc90.app`.
- Use StoreKit for native iOS Premium subscriptions. Do not use Stripe for digital premium unlocks inside the iOS App Store build.
- The current PWA Stripe backend remains useful for the web/PWA version.
- Privacy/Terms beta contact is `michael28gh@gmail.com`; replace with a branded support address before broad public launch.
- Final app icon and launch screen assets are in `ios/App/App/Assets.xcassets`.

## Native Features Roadmap

- HealthKit steps and weight sync.
- Local notifications.
- Home screen widgets.
- Screen Time / Family Controls style focus shielding.
- StoreKit 2 subscriptions.

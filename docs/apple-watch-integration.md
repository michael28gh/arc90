# Arc90 Apple Watch Integration

Arc90 now has the iPhone-side WatchConnectivity bridge in `ios/App/App/AppDelegate.swift` and a watchOS SwiftUI app source at `ios/Watch/Arc90WatchApp.swift`.

## What Is Wired

- The iPhone app registers `window.webkit.messageHandlers.arc90Watch`.
- The web app publishes a compact snapshot after render and from Profile:
  - Day number and date
  - Momentum score
  - Completed / total reps
  - Today habits and status
  - Water, steps, sleep
  - Protocol count and next unlogged protocol
- The Watch app can send actions back:
  - `toggleHabit`
  - `water`
  - `requestSnapshot`

## How To Attach The Watch Target In Xcode

1. Open `ios/App/App.xcodeproj`.
2. File > New > Target.
3. Choose `watchOS` > `Watch App`.
4. Product Name: `Arc90 Watch`.
5. Interface: `SwiftUI`.
6. Language: `Swift`.
7. Uncheck notifications for now.
8. Replace the generated watch app Swift file with `ios/Watch/Arc90WatchApp.swift`.
9. In the iPhone target, confirm `WatchConnectivity.framework` is available. The Swift import in `AppDelegate.swift` should auto-link it during build.
10. Build the iPhone app and the Watch app on a paired Apple Watch.

## Interaction Model

The Watch is intentionally lightweight:

- Top: ARC90 status, date, iPhone reachability.
- Main card: momentum ring, Day N, completed reps, goal.
- List: first six due habits, tap check to mark done/minimum.
- Signals: water, sleep, next protocol.

This keeps the Watch as a fast input surface, while the iPhone remains the full planning and review surface.

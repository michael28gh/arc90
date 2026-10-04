# Adaptive Today

User-approved direction: one organized Today flow, not three new dashboards.

## Presentation

1. Today's Arc remains first.
2. A compact day-mode button sits beside the Day X of 90 badge. It opens Full / Busy / Recovery and Essentials; there is no separate Your day section below the arc.
3. Habits are grouped into Essentials and Optional only in Recovery; other modes keep a compact grid with existing category labels. User explicitly chooses essentials. Never select them silently.
4. Water and mood share the first row; Capacity and Friction share the second. Answered controls collapse into summaries with one relevant action.
5. Reflection closes the page. A compact readiness row in Today's Arc opens the full breakdown; Progress retains deeper insights.

## Behavior Contract

- Full uses normal habit targets. Busy uses existing minimum versions; minimum completion remains `min`, never silently promoted to `done`.
- Recovery uses user-selected essentials. Optional does not mean skipped or completed. Keep original denominators in historical/full-goal progress, with an explicitly separate adapted-day summary.
- Modes are date-scoped and reset to Full on the next local calendar day. Switching modes must not rewrite previous completion records.
- Best Window uses actual recorded completion times only. No suggestions from legacy date-only logs. Minimum six distinct days, with four days and 60% support in one three-hour window. Allow dismissal and optional reminder confirmation.
- Focus Ritual opens a compact sheet from a relevant habit: habit, duration, supported restriction toggle, Start. Use existing focus session/native bridge APIs; never claim web mode blocks other apps.
- Active session becomes a slim persistent timer. Finishing offers an explicit habit check-off, never auto-completes from elapsed time. Retain the target mode captured when starting.

## Current Status

Implemented: date-scoped modes, explicit essentials, compact categorized habits, separate water/mood controls, evidence-based timing hints, and Focus Ritual with a persistent timer and explicit completion. Main navigation is Today, Progress, Habits, Tools, Profile. Tools groups Focus and AI Guidance under Mind & focus, and Protocols, Sleep and Health signals under Health & recovery. Scoped Today styles live in `css/adaptive-day.css`; helper and stylesheet are included in the build and offline shell.

## Verification and Limits

- `npm run check:adaptive` covers helper modes, rollover, target ID types, history thresholds and actual completion-time persistence, including legacy logs.
- Local browser checks cover Busy check-offs, mode changes preserving reduced completion, essentials selection, water/mood controls, duration validation, disabled native restriction control, timer reload and explicit reduced completion.
- Responsive checks at 320px and 1440px found no horizontal overflow. Screenshots are in `artifacts/adaptive-today`.
- Timing hints require newly recorded completion hours; historical date-only records are never assigned invented times. A suggested reminder explicitly replaces the existing app-wide reminder schedule and still requires notification permission.
- App restriction availability depends on the native bridge. This web build offers a working timer, not cross-app blocking.
- Web release deployed September 9; not installed on an iPhone in this pass. Physical-device notifications and native restrictions require separate device verification.

## Release Attempt

Vercel sign-in restored with user approval. Published to the existing `arc90` project on September 9, 2026: deployment `dpl_9N5sUfg1rDzLx5vJnBqouN77oNqK`, status Ready, alias https://arc90.vercel.app. No temporary project was created. Deployment includes single-surface 240ms tab motion, synchronous navigation and reduced-motion support. Browser and `check:navigation` checks passed. Hosted AI provider/quota settings are absent; no claim of working live AI, billing or native integration verification.

## Capacity and Friction Release

Published September 9, 2026: `dpl_4ooVndGDQuJ5ieUUsVz2geXaFwcQ`, Vercel Ready, alias https://arc90.vercel.app.

- Answers and picks are local and date-scoped. No AI service or new analytics events are used.
- Capacity offers 5/15/30/60-minute budgets and previews up to three pending, scheduled small targets. Unknown durations are explicitly estimated at five minutes; abstinence and bedtime constraints are excluded from timed plans. Estimates are not guarantees.
- Applying a plan requires approval, turns on Busy mode and prioritizes the picks. It never completes, skips or deletes habits. Changed previews and cross-midnight approvals require fresh confirmation.
- Friction offers Time, Energy, Distracted and Unsure. Follow-up actions explicitly enable Busy mode, choose Recovery essentials, open a Focus Ritual, or pin one next habit. Recovery suggestions prioritize pending essentials.
- `npm run check:support` covers helper normalization, parsing, budget bounds, history preservation, date rollover, stale preview approval and action integration. Launch, adaptive and navigation checks also passed.
- Browser checks cover collapsed state persistence, all four follow-up actions, focus-session creation/cancellation, keyboard focus restoration and 320/390/1440px layouts. Final controls have no horizontal overflow and retain 44px minimum tap height. Screenshots: `artifacts/day-support/`.
- Web deployment only. The Xcode-installed iPhone build was not updated.

## Navigation and Day Selector Release

Published September 10, 2026: `dpl_AjrqUM38Bm3KdiTnqb2t6JqJD9cM`, Vercel Ready, alias https://arc90.vercel.app. Offline shell version: v106.

- Day-mode selection moved beside the day counter. Choosing a mode closes the sheet; Essentials, Recovery approval and date-scoped history rules remain intact.
- Bottom tabs follow Today, Progress, Habits, Tools, Profile. Tools retains selection for all five child destinations. Plan belongs to Habits. Page titles match the tool labels.
- Grouped Tools menu has 48px rows, focus restoration, Escape dismissal, current-page indicators and bounded scrolling on shorter screens.
- Adaptive, support, navigation, syntax and launch checks passed; scoped code review found no substantive issues.
- Browser checks covered all tool destinations, same-page dismissal, rapid main-tab changes, day-mode changes, reduced motion, 320/390/1440px layouts and light/dark appearance. No horizontal overflow or clipped tab labels. Screenshots: `artifacts/navigation/` and `artifacts/day-mode/`.
- Web deployment only; no native iPhone installation in this release.

## Device Preview Access

Published September 10, 2026: `dpl_297fYdRdGFZttHNuZ3sfpqj7wCW9`, Vercel Ready, alias https://arc90.vercel.app. Offline shell version: v107.

- Opening `/app?preview=1` opts that browser into the temporary preview and removes the query flag from the address. Normal visitors remain on their existing plan. This link is not private authentication; anyone intentionally using it can opt in during the testing window.
- Preference is isolated under `arc90.preview-access.v1`; preview never writes `S.premium`, modifies tracking data, calls purchase verification, or grants server entitlements. Preview access prevents unnecessary checkout requests.
- Profile has a Preview access switch for enrolled browsers. Turning it off restores Free gates without deleting habits, logs or actual paid state. The preview cutoff is October 31 at 00:00 Pacific, with open-app refresh when access changes.
- Disable `BUILD_ENABLED` in `js/preview-access.js` and rebuild before commercial launch. The clock-based cutoff is a convenience, not a security boundary. Hosted AI, native health and app restrictions still need their existing service configuration and permissions.
- `check:preview`, `check:adaptive`, `check:support`, `check:navigation`, syntax checks and `check:launch` passed. Browser checks confirmed Free gates before opt-in, unlocked Focus/Sleep/Progress, reload persistence, Profile relock/re-enable and unchanged app data. Narrow-phone screenshot: `artifacts/preview-access/profile-320.png`.
- Independent reviewer was unavailable for this release; integration and helper checks were completed locally. This was a web update, not a new Xcode installation.

# Arc90 — Production-Hardening + Signature Polish + Trackers

**Date:** 2026-06-11 · **Status:** Approved by Michael
**Scope:** one implementation plan, three parts, built in order C → layout → A → B.

## Context & constraints

Arc90 is a vanilla-JS PWA at `~/Projects/arc90` (no build step, localStorage state, service worker, obsidian design, cobalt→teal→gold palette). Two AIs (Claude and Codex) edit the same `js/app.js` (~124 KB) and `css/styles.css`. Therefore:

- **New capability ships in new files** (`js/scoring.js`, `js/trackers.js`, `js/sound.js`, `tests.html`, `release.sh`) to avoid collisions.
- **In-place edits to `app.js`/`styles.css` stay small and surgical**, one concern per commit.
- Script load order in `index.html`: `data.js` → `scoring.js` → `trackers.js` → `sound.js` → `app.js`.
- Service-worker cache version must be bumped on every release (automated by Part A3).

---

## Part C — Trackers (water + weight)

A second data type beside binary habits: **metrics** — quantities over time. Enabled per-tracker from a new **Trackers** section in Profile.

### Data model (stored in base units, always)

```js
S.settings = { units: 'metric' | 'imperial' }   // default from device locale
                                                // (en-US/LR/MM → imperial, else metric)
S.trackers = {
  water:  { enabled: false, goalMl: 2000 },
  weight: { enabled: false },
}
S.metrics = {
  water:  { 'YYYY-MM-DD': ml },    // one number per day, additive via quick-adds
  weight: { 'YYYY-MM-DD': kg },    // sparse; last write of a day wins
}
```

Conversions (display only — storage never changes): 1 oz = 29.5735 ml, 1 lb = 0.453592 kg. Quick-adds: metric **+250 ml / +500 ml**; imperial **+8 oz / +16 oz**. Default goal 2000 ml ≈ 64 oz. Unit toggle lives in Profile → Trackers; switching units re-renders displays and goal labels, data is untouched.

### Water (daily ritual)

- **Today tab:** a Water card placed directly after the daily-plan card — fill bar toward goal, current total ("1.25 / 2 L" or "40 / 64 oz"), two quick-add buttons, an undo (subtract last add). Resets naturally at midnight (keyed by date).
- **Habit link (one-way latch):** if the user also has library habit #23 "Drink 2L of water" active and the day's water total crosses the goal, auto-`setStatus(23, 'done')` for today (unless already done/skipped). Editing water back down never un-completes the habit.
- **Progress tab:** "Water · last 7 days" section — 7 bars (ml vs goal), goal line, count of goal-hit days.

### Weight (sparse trend, compliance-safe)

- **Logging:** Today tab shows a slim "Log weight" row (only when tracker enabled, and only if not yet logged today); tapping opens a number-entry sheet → saved for today. Never nags, no reminders.
- **Progress tab:** "Weight" section — glowing trend line (reuse the area-chart visual language) across the challenge window, sparse points connected; header shows neutral **start → now delta** with sign ("−2.4 kg" / "+1.1 lb").
- **Compliance guardrails:** the word is **"Weight"**, never "weight loss"; no targets, no goal-weight, no body commentary, no projections. Pure neutral measurement, same posture as Protocol Tracker. The Protocol Tracker's optional-weight note points here instead of duplicating.

### Where the code lives

`js/trackers.js` exports: state defaults/migration, conversion helpers, `waterCard()`, `weightRow()`, `waterProgressSection()`, `weightProgressSection()`, `trackersProfileSection()`, and an `handleTrackerAction(act, id, el)` dispatcher. `app.js` gets only: 4 insertion calls (Today ×2, Progress ×1, Profile ×1) + one delegation hook in the click handler + `normalizeState` defaults. CSS appended as a new section.

---

## Layout pass

- **Today hierarchy:** consistent card rhythm and section order — hero → quick pills → daily plan → **Water** → **Log weight** → stat tiles → journey → needs-attention → coach tip → task list. Section headers use the existing eyebrow style; spacing normalized (one spacing scale, no ad-hoc margins).
- **Progress = home of every chart**, stacked sections in order: **Habits (7-day) → Water → Weight → Axis → Per-habit → 90-day grid → achievements**. Each section a card with an eyebrow title; premium gating unchanged.

---

## Part A — Production-hardening

- **A1 · Extract & test the scoring brain.** Move pure functions (`rateFor`, `avgRate`, `momentum`, `habitRate`, `streak`, `bestStreak`, `perfectDays`, `recoveryRate`, status/rest-day logic) into `js/scoring.js` (plain script, attaches to `window.Scoring`, `app.js` delegates). Add **`tests.html`**: zero-dependency assertion page (fixture state injected, ~25 cases: day-1 edges, rest days don't break streaks, min counts as done, one missed day can't tank momentum, recovery math, water conversions, weight delta). Green/red summary; run by opening the page.
- **A2 · Data durability.** Auto-backup: on milestone days (7/30/60/90) and on "Start over", silently download `arc90-backup-YYYY-MM-DD.json` (existing `download()` helper). Profile gains **Import backup** (file picker → validate shape → confirm → replace state). Protects weight history too.
- **A3 · Release script.** `release.sh`: content-hash `js/* css/* index.html` → write `arc90-<hash8>` into `sw.js` CACHE const → print deploy reminder. Kills the manual version-bump failure mode.
- **A4 · Harden AI coach calls.** `callAI` gets `AbortController` + 30 s timeout, friendly error bubbles (timeout vs auth vs network), and a 4 000-char response clamp. Surgical edit confined to the AI section of `app.js`.

## Part B — Signature polish

- **B1 · The ring moment.** Completing the **last** habit of the day: gold ring pulse (CSS class, 1.2 s), existing confetti, synthesized two-note chime, haptic. One function `celebrateDayComplete()` triggered where `allDoneToday()` flips true.
- **B2 · Sound.** `js/sound.js` — Web Audio oscillator synths: `tick` (habit complete), `chime` (day complete), `pop` (water goal). No audio files. **Default OFF**; toggle in Profile → Appearance row. Respects toggle everywhere.
- **B3 · Time-of-day ambient.** One function sets `data-daypart` (morning/day/evening/night) on `<html>` at render; CSS shifts the body ambient glow hue/intensity per daypart (cool cobalt morning → warm gold evening, subtler at night). Dark theme only.

---

## Build order & commits

1. C data model + water (commit) → 2. weight (commit) → 3. units + Profile section (commit) → 4. layout pass (commit) → 5. A2 backup/import (commit) → 6. A1 scoring extraction + tests (commit) → 7. A3 release.sh (commit) → 8. A4 AI hardening (commit) → 9. B1+B2 ring moment + sound (commit) → 10. B3 ambient (commit). Verify in preview after each part; bump SW via release.sh from step 7 on.

## Out of scope (explicit)

Payments/Stripe (designed separately, parked), full `app.js` ES-module split (collision risk while Codex is active), accounts/cloud sync, native/App Store, new reminders, any "weight loss" framing or goals.

## Success criteria

1. Water quick-adds fill toward goal, reset daily, undo works; crossing goal auto-completes the water habit (one-way).
2. Weight logs draw a trend line on Progress with a neutral signed start→now delta.
3. Unit toggle flips L↔oz / kg↔lb without altering stored data.
4. Progress shows clean stacked sections: Habits / Water / Weight / Axis / Per-habit / Grid.
5. `tests.html` all green (scoring + conversions); a deliberate scoring change turns it red.
6. Import-backup restores a full challenge including metrics.
7. `./release.sh` produces a new SW cache id with zero manual editing.
8. A hung AI provider shows a friendly error bubble within 30 s; UI never freezes.
9. Finishing the day's last habit triggers gold pulse + chime (when sound on) + confetti.
10. Ambient glow visibly differs morning vs evening (dark theme).

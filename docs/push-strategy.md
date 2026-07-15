# Arc90 Push Strategy

Notifications exist to protect the user's arc, not our DAU chart. One useful message at the right moment beats five clever ones. This doc is the implementable spec — infra already in place: web push (`api/push-cron.js`, once daily 14:00 UTC on the Hobby-plan cron, 20h dedup; `api/push-subscribe.js` stores endpoint + mode + `remind_time` + `tz_offset_min` in Supabase) and the Capacitor iOS shell, where **local notifications scheduled on-device are the real opportunity**: full knowledge of user state (`dayStreak()`, pending count via `actionable(todayKey())`, `momentum()`, readiness from `vitality().score`, `windDown`, `alarmTime`) with zero server, zero privacy tradeoff.

## 1. Principles

1. **Useful > frequent.** A notification must either save today's arc or close a loop. If it does neither, it doesn't send.
2. **No shame, ever.** Loss-aversion that motivates ("2 reps keep day 14 alive"), never guilt ("you failed again"). This is design principle #4; it applies doubly on the lock screen.
3. **Every message is actionable.** Tapping it lands on the exact screen where the action happens. No "just checking in."
4. **Hard caps.** Frequency limits are enforced in code, not policy. No category can exceed its cap; no day exceeds the global cap.
5. **Silent by default.** Nothing is enabled until the user has seen value and opted in. No auto-enable, no pre-checked boxes.

## 2. Permission timing

**Never ask at first launch.** iOS gives one shot at the system prompt; a cold ask converts poorly and a denial is nearly permanent. Ask after the aha moment — whichever comes first:

- User completes their **first full day** (all pending habits done), or
- User **sets a reminder time, wind-down hour, or alarm** (they just told us timing matters to them).

Always precede the system prompt with a **soft ask** (custom in-app sheet). If they decline the soft ask, the system prompt is never shown — we can ask again later. Copy:

> **Protect the streak you just started.**
> Arc90 can nudge you at the moments that matter — a morning plan, a heads-up when the day's about to slip. Two a day, max. Everything stays on your phone.
> **[ Turn on reminders ]  [ Not now ]**

"Not now" is a first-class button, same size. Re-offer the soft ask at most once more, at day 7.

## 3. Notification categories

| Category | Type | Trigger | Timing | Cap | Toggle |
|---|---|---|---|---|---|
| Morning plan | **LOCAL** | Pending habits > 0 today | 30 min after `alarmTime` (fallback 8:30 local) | 1/day | `notify.morning` |
| Streak at risk | **LOCAL** | `dayStreak() >= 3` AND pending > 0 at schedule time | 19:30 local, never inside quiet hours | 1/day | `notify.streak` |
| Comeback | **LOCAL** | 2 consecutive missed days | Next morning, 9:00 local | **1/week** | `notify.comeback` |
| Wind-down | **LOCAL** | `windDown` set | At `windDown` hour | 1/day | `notify.winddown` |
| Weekly recap | **LOCAL** | Always (if enabled) | Sunday 18:00 local | 1/week | `notify.recap` |
| Milestones | **LOCAL** | Streak hits 30 / 60 / 90 | On the morning of the milestone day | 3/arc | `notify.milestone` |
| Daily nudge (web) | **SERVER** | Existing `push-cron.js` subscribers | Nearest run to `remind_time` (cron fires 14:00 UTC) | 1/day (20h dedup) | mode `off` deletes the row |

Example copy, in Arc90's voice (confident, no exclamation-mark cheerleading, no shame):

- **Morning plan:** "3 reps on the board today. Start with the easiest — momentum does the rest."
- **Streak at risk:** "Day 14 is still open. Two reps before wind-down keeps the arc alive." *(Never "don't lose your streak!" — state what keeps it alive, not what they'd lose.)*
- **Comeback:** "Two quiet days. The arc doesn't care — it cares what you do next. One rep restarts it."
- **Wind-down:** "Wind-down. Log the day, set tomorrow's alarm, lights out."
- **Milestone (30):** "Day 30. A third of the arc, built one rep at a time. Keep the standard."
- **Weekly recap:** "Week closed: 18 reps, momentum up 12%. Sunday is for looking once, then moving."

## 4. Frequency governance

- **Global cap: 2 notifications/day**, all categories combined. Priority when over cap: streak-at-risk > morning plan > wind-down > everything else.
- **Quiet hours: 22:00–07:00 local**, and never after the user's `windDown` hour if it's earlier. Anything that would land there is dropped, not delayed into a morning pile-up.
- **Per-category caps** as in the table — enforced at scheduling time, on-device.
- **Automatic back-off:** track opens locally (`localStorage` counter per category: scheduled vs. tapped). If a category is ignored **5 consecutive times**, halve its frequency (daily → every other day). Ignored 10 times, silence it and surface a one-line note in Profile: "Morning nudges paused — they weren't landing. Turn back on anytime." Respecting inattention is how we keep permission long-term.

## 5. Preference center

A **Notifications** section in Profile:

- **Master toggle** — off kills all local scheduling and calls `push-subscribe` with `mode: 'off'`, which deletes the Supabase row (handler already exists).
- **Per-category toggles** — the six `notify.*` keys above, each with its one-line description and cap ("max 1/week") stated inline. No hidden frequencies.
- **Quiet hours** — start/end pickers, default 22:00–07:00, pre-filled from `windDown` if set.
- **Defaults: everything OFF** except what the user explicitly enabled during the soft ask (soft ask enables morning plan + streak-at-risk only; the rest are discoverable, not presumed).
- Disabling web reminders or deleting the account removes the server subscription row — no orphaned endpoints.

## 6. Implementation plan

**Phase 1 — Native local notifications (next session).**
- Add `@capacitor/local-notifications` (not yet in `package.json`); `checkPermissions`/`requestPermissions` wired to the soft ask; under the hood this is `UNUserNotificationCenter` + `UNCalendarNotificationTrigger`.
- **Scheduler:** a pure function `buildNotificationQueue(state) -> next-24h queue` computed from `dayStreak()`, pending count, `momentum()`, readiness, `windDown`, `alarmTime`, applying caps + quiet hours + back-off.
- **Lifecycle:** on app `pause`/background, `cancel()` all pending and schedule the fresh queue; on every app open (`resume`), cancel and recompute — completed habits silently kill today's streak-at-risk nudge. Stale notifications never fire.
- Deep-link each notification's `extra` to its target screen; log the open locally.

**Phase 2 — Smarter server copy (web).** The once-daily cron stays one generic nudge (it knows nothing personal — keep it that way). Improve it: rotate 5–6 copy variants, respect a server-side quiet-hours check against `tz_offset_min`, and honestly deprecate the `4h`/`2h` modes in the UI — a daily cron cannot deliver them (`push-cron.js` already documents this).

**Phase 3 — Measurement.** Local-only: per-category scheduled/opened counters in `localStorage`, a tiny "which nudges land" readout in the preference center. **No server analytics of personal state** — no streaks, readiness, or open rates leave the device.

## 7. Compliance

- **iOS consent:** notifications only after explicit `requestPermissions` grant, triggered by user action (the soft ask). Never auto-enable, never re-prompt via system dialog after denial — link to Settings instead.
- **App Store 4.5.4:** no spam, no marketing pushes without separate consent, every notification user-serving and individually disableable. The caps + preference center are the evidence.
- **Privacy:** `privacy.html` already discloses web push (endpoint + rhythm + time + tz only, deletion on opt-out). Add one line for native: *"On iOS, reminders are scheduled entirely on your device; no notification data is sent to any server."* That's not just compliance — it's the pitch.

The bar for every future notification idea: would a disciplined user, mid-arc, thank us for this exact message at this exact moment? If the answer needs an argument, the answer is no.

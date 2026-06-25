# Agent 4 — Retention & Product

> First read `docs/agents/HOUSE-RULES.md`. Work in worktree `../arc90-retention` on branch `agent/retention`.

**ROLE:** Own the daily loop — the reason users come back. This is the #1 driver of the business.

**OWN:** the engagement view functions in `app.js`: `viewToday`, `streakBannerCard`, `comebackBtn`/`sheetComeback`, `weakSpotCard`, `dailyReflectionCard`, the onboarding flow, and reminders/notifications.

**DO NOT TOUCH:** `/api`, `css/styles.css`, `landing.html`. (Need a style change? Ask Agent 3.)

**CONTEXT:** The loop is morning (reps + momentum) → act (Comeback catches lapses) → night (reflection + streak secured). Retention is currently unmeasured — coordinate with Agent 2 on activation/retention events. iOS PWA web-push is restricted; design around that.

**BACKLOG (in order):**
1. **Day-1: time-to-first-rep under 60 seconds.** Onboarding must land on a dashboard that begs for one tap. Instrument activation (with Agent 2).
2. **Lifecycle/notifications** within iOS-PWA limits — lean on streak loss-aversion + a morning/night prompt; design for a future native (Capacitor) wrapper.
3. **Tighten the night ritual** ("did you keep the day?" + reflection) to close the loop and feed the Proof Wall.

**DONE =** walk the Day-1 and a returning-day flow in the preview; confirm first-rep < 60s. No logic changed outside your owned functions.

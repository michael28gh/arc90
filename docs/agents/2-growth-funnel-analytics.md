---
name: arc90-growth-funnel-analytics
description: Turns ARC90 into a measured funnel — event tracking, funnel dashboard, email capture, and landing page conversion optimization.
model: sonnet
tools: ["Read","Write","Bash","Edit","WebSearch"]
worktree: /Users/michael28gh/Projects/arc90-growth
---
# Agent 2 — Growth, Funnel & Analytics

> First read `docs/agents/HOUSE-RULES.md`. Work in worktree `../arc90-growth` on branch `agent/growth`.

**ROLE:** Turn ARC90 into a measured funnel and grow the top of it.

**OWN:** `landing.html`, a NEW module `js/analytics.js` (centralize the existing `track()` events), `docs/` growth content, and ONLY the email-capture placement calls + `track()` call sites in `app.js`.

**DO NOT TOUCH:** `css/styles.css`, unrelated views, `/api` internals (coordinate with Agent 1 on any shared table).

**CONTEXT:** `track()` already fires: `onboarding_completed`, `paywall_viewed`, `checkout_clicked`, `premium_activated`, `comeback_done`, `proof_added`, `share_opened/sent`, `subscribed`. Vercel Web Analytics is live. North Star = **Weekly Retained Reps**. See `docs/arc90-operating-system.md`.

**BACKLOG (in order):**
1. **Funnel view.** Pipe `track()` events into a Supabase `events` table (coordinate the schema with Agent 1) or Vercel custom events, then a simple dashboard: activation, D1/D7/D30, free→paid, K-factor.
2. **Email-capture placement.** Add a skippable opt-in to the onboarding finish step + a dismissible dashboard prompt (reuse `emailCaptureCard()`). Don't gate the app behind it.
3. **Landing conversion pass** (`landing.html`): above-the-fold clarity, social proof, one primary CTA, fast load (don't regress Core Web Vitals).

**DONE =** events visible in the dashboard, capture verified end-to-end, landing CWV not regressed. Report the metrics you can now see.

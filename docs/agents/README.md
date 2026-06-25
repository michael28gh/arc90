# ARC90 — 5-Agent Parallel Setup

Five agents working ARC90 in parallel without stepping on each other.

> **The #1 risk:** multiple agents editing one `js/app.js` + `css/styles.css` = constant merge conflicts.
> **The fix:** one git worktree/branch per agent, and a single **Release agent** that owns all merges, the cache-version bump, and deploys.

## How to launch (run once)

```bash
cd ~/Projects/arc90
git worktree add ../arc90-backend   -b agent/backend
git worktree add ../arc90-growth    -b agent/growth
git worktree add ../arc90-design    -b agent/design
git worktree add ../arc90-retention -b agent/retention
# Release agent works in the main checkout (~/Projects/arc90) on `main`
```

Open each folder as its own workspace/session in VS Code. In each session:
1. Tell the agent to **read `docs/agents/HOUSE-RULES.md`** (shared, non-negotiable).
2. Then tell it to **read and follow its own brief** (e.g. `docs/agents/4-retention-product.md`).

## Lanes (who owns what — never cross these)

| Agent | Branch | Owns | Never touches |
|-------|--------|------|---------------|
| **1 · Backend & Revenue** | `agent/backend` | `/api/*.js`, Supabase, 4 named checkout/email fns in app.js | views, css, landing |
| **2 · Growth & Analytics** | `agent/growth` | `landing.html`, new `js/analytics.js`, `docs/`, track() call sites | css, views, /api internals |
| **3 · Design & UI** | `agent/design` | `css/styles.css` (sole owner), visual-only attrs | JS logic, /api |
| **4 · Retention & Product** | `agent/retention` | engagement view fns in app.js | /api, css, landing |
| **5 · QA, Release & Integrator** | `main` | merges, cache bump, build, deploy, `scripts/smoke.mjs` | feature logic (only merges it) |

## Marketing automation lane

These agents operate inside the Jarvis console for Arc90 growth automation. They draft content, research, outreach, and paid-media recommendations, but live posting and DMs stay gated behind official platform credentials and explicit approval.

| Agent | Owns | Live action policy |
|-------|------|--------------------|
| **6 · Marketing Automation Orchestrator** | Daily marketing packet and routing across all growth agents | Drafts only until approved |
| **7 · Instagram UGC & Carousel** | UGC image brief, 5-slide carousel, caption, hashtags | Needs Meta OAuth + approval |
| **8 · Instagram Competitor Research** | Public competitor scan and improvement recommendations | Public research only |
| **9 · TikTok Creator Outreach** | Three creator targets and personalized DM drafts/day | Manual send only |
| **10 · TikTok Organic Video** | Higgsfield prompt, TikTok caption, video checklist | Needs TikTok OAuth + approval |
| **11 · TikTok Ads** | Paid test plan, UTMs, budget gates, kill rules | Paused until pixel + approval |

## The cardinal rule
Only the **Release agent** pushes to `main`, bumps the cache version (`index.html ?v=` + `sw.js CACHE`), and runs `deploy:prod`. Everyone else commits to their own branch and stays in their lane.

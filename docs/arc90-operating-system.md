# ARC90 Operating System

A decision system for the app: the questions that matter, the metrics that decide,
the funnel, the sell-vs-keep math, and the backend that unlocks both.

_Last updated: 2026-06-24. Status: pre-launch, ~0 real users, premium live (honor-system), Supabase connected._

---

## 0. The one hard truth that frames everything

**You cannot sell, scale-with-ads, or even decide the app's future without traction data —
and right now ARC90 produces none you can prove.** Revenue is honor-system (no server record),
retention is unmeasured, and there are ~0 real users. Every path below (sell / ads / keep) is
gated on the same foundation: **instrument the funnel + verify revenue server-side.** That is the
linchpin. Do it first; everything else compounds on it.

So the sequence is not "sell or ads." It's: **instrument → organic launch → read the data (60–90 days) → THEN choose.**

---

## 1. The right questions (answer these before spending a dollar or a month)

| # | Question | Why it decides things | Default if unsure |
|---|----------|----------------------|-------------------|
| 1 | Lifestyle business or venture swing? | Lifestyle → keep + optimize cash. Swing → raise/scale or sell. | Lifestyle-first; keep optionality. |
| 2 | What is the ONE metric? | Without a North Star you optimize noise. | **Weekly Retained Reps** (users who logged ≥1 rep in each of the last 2 weeks). |
| 3 | Who exactly is the user? | "Everyone" = no channel, no message. | The 18–30 self-improver chasing one 90-day goal (gym/study/discipline). |
| 4 | What is the wedge channel? | One channel mastered beats five dabbled. | TikTok organic (discipline / 90-day-challenge) + the in-app share loop. |
| 5 | What does success at Day 90 look like? | Defines the bar for keep/sell/kill. | 1,000 installs, 35% D7 retention, 3% free→paid, verifiable MRR. |
| 6 | Sell or build? | The big fork. | **Cannot answer yet** — you'd sell for scraps today. Re-ask after #5's data exists. |

Questions 1, 5, and the risk appetite behind 6 are genuinely yours. The rest I've answered above; override as needed.

---

## 2. The metric system (instrument these NOW)

**North Star:** Weekly Retained Reps. Everything serves it.

**Input funnel (the only 5 numbers that matter early):**
1. **Activation** — % of new users who complete their first rep on day 1. Target ≥ 60%.
2. **D1 / D7 / D30 retention** — % returning. Habit apps live or die here. Target D7 ≥ 35%, D30 ≥ 20%.
3. **Free → Paid conversion** — % who buy premium. Freemium norm 1–5%. Target ≥ 3%.
4. **K-factor (virality)** — shares per user × install rate per share. The Proof/Quote/Story cards feed this. Any K > 0 lowers CAC.
5. **Churn / renewal** — for a $49/yr product, renewal rate sets LTV.

You already fire `track()` events (onboarding_completed, paywall_viewed, checkout_clicked, premium_activated, comeback_done, proof_added, share_opened/sent, share-quote). **Next: pipe these into a funnel view** (Vercel Analytics custom events → a simple dashboard, or Supabase events table). You're 80% instrumented; you just can't *see* it yet.

---

## 3. Process optimization

**Build process**
- **Freeze net-new features.** The app is already feature-rich and unvalidated. Every new feature now is procrastination dressed as progress. Exceptions: anything that instruments or converts.
- **Two-AI hygiene** (you + Codex on `main`): pull before each session, small commits, bump the SW cache version every CSS/JS change. (This has already bitten twice — stale cache + a domain bug.)
- **One ship loop:** edit → `node --check` → build → preview-verify the changed surface → deploy → commit → push.

**User process (activation is the product)**
- Time-to-first-rep must be < 60s from first open. Onboarding → land on a dashboard that begs for one tap.
- The daily loop is the retention engine: **morning** (today's reps + momentum) → **act** (comeback button catches lapses) → **night** (reflection + streak secured). Make each friction-free.
- The share loop (Proof / Quote / Story cards) is your only free acquisition. Prompt it at peak emotion (milestones, new streak, day 90).

---

## 4. Pre-mortem — what kills ARC90, ranked, with the antidote

1. **No retention (the #1 killer of all habit apps).** Antidote: measure D1/D7/D30 immediately; the comeback loop + reflection + (real) notifications exist — now prove they work.
2. **Honor-system revenue leak.** Premium is granted client-side on `?checkout=success` — anyone can fake it, and you have no server record of who paid. Antidote: Stripe webhook → Supabase entitlement (Backend Phase 1). This also creates the *verifiable revenue* a buyer pays for.
3. **Local-first = device-locked = data loss = churn + ungrowable.** No accounts means: lose your phone → lose your 90 days; no email; no cross-device; no cohort analysis. Antidote: optional cloud accounts/sync (Backend Phase 2) while keeping local-first as the default privacy story.
4. **iOS PWA push limits.** Web push on iOS is restricted/flaky — and notifications are core to a habit app's retention. Antidote: lean on home-screen install + (later) a thin native wrapper (Capacitor) for real push; meanwhile use streak loss-aversion + email.
5. **No App Store presence.** Caps discoverability and resale value. Antidote: a Capacitor/PWA-store wrapper is a known, cheap path when traction justifies it.
6. **Solo founder bandwidth.** Antidote: freeze features, automate the content engine, let the share loop do acquisition.
7. **Health-claims compliance.** Already handled (track-only Protocol, no dosing advice) — keep that discipline; it protects App Store + ad approval.

---

## 5. Marketing funnel + plan (AARRR, ARC90-specific)

```
ACQUISITION  → TikTok organic (discipline/75-hard-style 90-day challenge), the landing page,
                in-app share cards (Proof / Quote / Story) seeding Instagram & Messages.
ACTIVATION   → onboarding → first rep < 60s → daily splash quote → streak started.
RETENTION    → streak loss-aversion + Comeback button + Daily Reflection + morning/night ritual.
REVENUE      → Paywall 2.0, $49/yr Founding, surfaced at value moments (weak-spot, day 30/60/90, unlimited).
REFERRAL     → every share card is branded (arc90.vercel.app) = a free ad; prompt at emotional peaks.
```

**The 30 / 60 / 90 plan**
- **Days 1–30 — Instrument + soft launch.** Ship the funnel dashboard + Stripe webhook. Post 1 TikTok/day (build-in-public + the 90-day-challenge angle). Get the first 100 real users. Read activation + D7.
- **Days 31–60 — Optimize the funnel.** Fix the worst funnel step (usually activation or D7). Turn on the email capture + a simple lifecycle nudge. Push the share loop hard. Goal: D7 ≥ 35%, conversion ≥ 3%.
- **Days 61–90 — Decide with data.** Now the numbers exist. If retention + conversion are healthy → keep + consider *measured* paid tests. If flat after honest effort → sell or pivot.

**Content engine (the cheap growth):** one format, repeated — "Day X of my 90-day arc" using the Story share card; pair with discipline hooks. The product literally generates the content.

---

## 6. Sell vs Keep — the decision and the money

### How app valuation actually works
Micro-SaaS / app businesses sell on a **multiple of profit or recurring revenue**, weighted by
growth, churn, and how *verifiable* the revenue is. Typical bands (general market, not a guarantee):
- **Profitable, growing micro-SaaS:** ~**3–5× ARR** (annual recurring revenue).
- **Content/app w/ less recurring:** ~2.5–4× annual profit (SDE).
- **Pre-revenue / ~0 users:** sells as an **asset** (code + design + brand), realistically **$0–$5k**, and many never sell at all.

### What ARC90 would fetch, by traction tier (illustrative ranges, gross of ~5–15% marketplace fees)
| Traction | ARR | Est. sale range | Notes |
|---|---|---|---|
| **Today (pre-rev, ~0 users)** | $0 | **~$0–$5k** | Asset sale only. Don't. You'd give away the work. |
| $500 MRR | $6k | ~$18k–$30k | Needs ~3+ mo verified history. |
| $1k MRR | $12k | ~$36k–$60k | Where it gets interesting. |
| $3k MRR | $36k | ~$110k–$180k | Real exit territory for a solo build. |
| $5k MRR | $60k | ~$180k–$300k | Strong outcome; depends on growth + churn. |

Discounts apply: PWA (no App Store), solo operator, honor-system revenue (un-provable → buyers slash or walk). **The webhook/backend is worth more in valuation than it costs to build** — it converts un-provable revenue into a verifiable multiple.

**Where to sell (when you have history):** Acquire.com (best for SaaS), Flippa (broad), Empire Flippers (premium, needs ~$1k+/mo + history), Tiny Acquisitions / IndieMaker (small indie apps).

### The ads path — the honest math
- $49/yr. With ~40% renewal, **LTV ≈ $50–$82**.
- Freemium **free→paid ≈ 2–5%**; TikTok/Meta **CPI ≈ $3–$15** for wellness.
- To net one payer at 3% conversion + $8 CPI: ~33 installs × $8 = **~$264 CAC** for a ≤$82 customer → **~3× underwater.**
- **Conclusion:** paid ads are *premature*. They only work after (a) conversion is optimized and (b) you have retention to amortize CAC. Turn ads on as small ROAS-tested experiments *after* Day 60, never as the launch channel. Organic is the only sane early acquisition.

### Recommendation
**Don't sell now** (scraps). **Don't run paid ads now** (you'd burn cash at ~3× loss).
**Do** spend the next 60–90 days turning ARC90 from "a finished app" into "a measured business":
instrument the funnel, ship the revenue backend, launch organically, and read the data.
That single move makes *both* doors real — a sellable asset with a verifiable multiple, **or** a
keep-and-scale business with unit economics that can eventually support ads. Same foundation, both options preserved.

---

## 7. Backend improvement — yes, and it's the linchpin

The backend is the highest-leverage work because it unblocks revenue proof, retention measurement,
email, sync, AND resale value simultaneously. Supabase is already connected (`agnnqsqjcobfmfyijsrs`).

**Phase 1 — Verified revenue (do first).**
Stripe webhook → Supabase `entitlements` table → app checks server-side entitlement instead of a URL param.
Closes the leak, creates the revenue records buyers/ad-platforms require. ~1 focused build.

**Phase 2 — Lightweight accounts + sync (the growth unlock).**
Optional Supabase Auth (magic link) → cloud sync of `S` state. Keeps local-first as default (privacy),
adds: cross-device, "lose-your-phone" safety, an email list, and a real user table for cohort/retention
analysis. This is what turns retention from a guess into a number.

**Phase 3 — Events pipeline + dashboard.**
Route existing `track()` events to a Supabase `events` table (or Vercel Analytics custom events) →
a simple funnel dashboard (activation, D7, conversion, K-factor). Now the metric system in §2 is live.

**Plus the queued, already-agreed:** email capture (`subscribers`, RLS insert-only) — a Phase-1.5 quick win.

Net: every backend phase raises the valuation *and* the keep-it viability. There is no version of the
future (sell or scale) where the backend isn't the next dollar best spent.

---

## TL;DR
1. The fork (sell vs ads) is unanswerable today — you have no provable traction.
2. Both paths need the same foundation: **instrument the funnel + verify revenue server-side.**
3. North Star = Weekly Retained Reps; watch activation, D7/D30, conversion, K-factor, churn.
4. Selling now = ~$0–5k (don't). Ads now = ~3× underwater (don't). Organic + measure for 60–90 days.
5. Backend Phase 1 (Stripe webhook → Supabase) is the single highest-leverage next build — it makes the app both sellable *and* scalable.

# Arc90 — 1-Week Launch Plan (Mark 2)

**Goal of the week:** prove that strangers will (a) start, (b) come back on Day 7, and (c) pay $49. Spend $0 on ads until that's proven. Validation first, scale second.

**Current state:** PWA live — landing at `arc90.vercel.app`, app at `arc90.vercel.app/app`. Stripe in **TEST mode** (must flip to live before Day 1). Local-first, no account. Mark 2 adds: Command Center, Vitals tab, daily streak loop, paywall 2.0, clean icon system.

---

## The one rule
**Don't pay for anything (ads, Apple's $99) until the funnel converts organically.** Ads amplify a working funnel; they don't create one.

## North-star metrics (track daily)
- **Activation:** % of visitors who finish onboarding + log their first rep
- **D1 / D7 return:** % who come back next day / after a week
- **Free → Paid:** % who buy Founding Premium
- **Streak depth:** avg streak length (the retention engine)
- Targets for week 1: 100+ landing visits, 30+ activations, 40%+ D1, 3–10 paying founders

---

## Day 0 — Pre-flight (before you tell anyone)
- [ ] **Stripe LIVE:** create the live $49/yr recurring price, set `STRIPE_SECRET_KEY` (live) + `STRIPE_PRICE_ID` in Vercel, redeploy, complete one real test purchase, then refund it.
- [ ] **Analytics:** enable Vercel Web Analytics (free) so you can see visits/funnel.
- [ ] **QA pass** on a real iPhone: onboarding → log a rep → streak → paywall → checkout → "Add to Home Screen."
- [ ] **Content bank:** cut 5–10 short videos from the Higgsfield assets in `marketing/` (90-day challenge / discipline / "track everything" angles). Write 10 hooks.
- [ ] Rotate the old test Stripe key that was exposed.

## Day 1 (Mon) — Soft launch to your circle
- DM the link to 10–20 people who fit the user (discipline / fitness / founders).
- Ask 3 questions: did onboarding make sense? what's confusing? would you pay $49/yr?
- Watch activation + collect the first 5 pieces of feedback. Fix the #1 friction same day.

## Day 2 (Tue) — Turn on the content engine
- Post your best hook as a TikTok + Reel + Short. Post an X/Threads thread: "I built a 90-day system to actually keep my habits."
- Reply to every comment within the first hour (the algorithm rewards it).
- Drive all traffic to `arc90.vercel.app` (landing → free funnel).

## Day 3 (Wed) — Founding-offer push
- Post the money angle: "Founding Premium — $49/yr, locked in for early members" (real scarcity: price goes up after launch).
- Personally follow up with warm leads from Day 1–2. Aim for your **first sales**.

## Day 4 (Thu) — Double down on what worked
- Re-cut the best-performing hook into 3 variants. Kill what flopped.
- Add social proof to the landing: real screenshots, first testimonials, "X people started their 90 days."

## Day 5 (Fri) — Retention check + ship one fix
- Measure D1/D7 return and streak depth. Find where users drop.
- Ship the single highest-impact retention fix (e.g., a reminder time prompt, an easier first habit).
- Prep a Product Hunt / r/SideProject / relevant subreddit post.

## Day 6 (Sat) — Community + UGC
- Ask users to screenshot their streak and share; reshare every one.
- Small founding-member push ("first 100 founders" framing).

## Day 7 (Sun) — Review & decide
- Tally: visits, activations, paid conversions, D7 retention.
- **Decision gate:**
  - Funnel converts (people pay + return)? → start a *small* paid-ads test ($10–20/day, one channel) and begin App Store submission.
  - Not converting? → fix the funnel, don't spend. Re-run the week.

---

## After week 1 (the real moat)
1. **Server-verified subscriptions** — Supabase + Stripe webhooks so Premium is enforced, not honor-system (today anyone can unlock it). This is the #1 revenue-integrity upgrade.
2. **App Store** — Apple Developer Program ($99/yr) → Capacitor build → TestFlight → review. StoreKit converts far better than web checkout on iPhone.
3. **Wearable sync** — auto-fill Vitals (HRV, RHR, VO2, sleep) from Apple Health / Oura / Whoop. This is what makes "track everything" effortless and sticky.

> Arc90 is a habit, focus, and wellness **tracking** tool. No medical advice, dosing, or treatment claims in any marketing.

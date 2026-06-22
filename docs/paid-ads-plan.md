# Arc90 — Paid Ads Plan (Google · Meta · TikTok)

> **Gate first.** Only turn these on **after** organic (Week 1) proves people *pay* and *come back* on Day 7. Ads amplify a working funnel — they don't fix a broken one. If organic isn't converting, fix the funnel before spending a dollar here.

---

## 0. The economics (know your numbers before you spend)
- **Price:** $49/yr. **Stripe fee:** ~$1.72/sale → ~$47 net.
- **Target CAC (cost to acquire a paying customer):** **under $25** for a healthy first-year payback; **never above $49** (you'd lose money on year one).
- **Funnel math to watch:** clicks → /app visits → onboarding_completed → paywall_viewed → checkout_clicked → premium_activated. A 2–4% visitor→paid rate is a reasonable early target.
- **Test budget:** start at **$10–20/day per platform** for 5–7 days each (~$300–400 total test). Kill losers fast, pour into winners.

## 1. Tracking foundation (set up BEFORE spending)
1. **UTMs on every ad link** so Vercel Analytics shows what's working:
   `https://arc90.vercel.app/?utm_source=tiktok&utm_medium=cpc&utm_campaign=launch&utm_content=hook1`
   (swap `utm_source` = tiktok | meta | google; `utm_content` = which creative/hook)
2. **Conversion pixels** (needed for the platforms to *optimize* toward buyers, not just clicks):
   - Meta Pixel, TikTok Pixel, Google Ads tag / GA4 — each is a script on the site + a "Purchase" event on checkout success.
   - **I can wire these in** once you give me the pixel IDs (Meta Pixel ID, TikTok Pixel ID, Google tag ID). Until then, run **Traffic** campaigns and read results from Vercel Analytics referrers + the custom funnel events already live (`paywall_viewed`, `checkout_clicked`, `premium_activated`).
3. **One landing per campaign:** send all ad traffic to the upgraded landing (`/` ) — it routes to `/app`.

## 2. TikTok Ads — *start here* (best fit)
Why first: the 90-day-challenge / discipline angle is native to TikTok, and your Higgsfield creatives + content-pack scripts are ready.
- **Campaign objective:** Traffic (then Website Conversions once the pixel has data).
- **Format:** **Spark Ads** — boost the organic posts that already performed (authentic > polished).
- **Audience:** 18–34, US first; interests: self-improvement, fitness, productivity, journaling. Start broad, let the algorithm find them.
- **Creatives:** Scripts A/B/C from `launch-content-pack.md` (UGC, talk-to-camera + screen recording). Run 3–4 hooks, 1 ad group each.
- **Budget:** $20/day. **Kill** a creative under 1% CTR or CPC > $1 after ~$30 spend.

## 3. Meta Ads (Instagram + Facebook)
- **Objective:** Traffic → switch to **Sales/Conversions** once the Pixel has ~50 events.
- **Placements:** Advantage+ placements (Reels + Stories carry this content well).
- **Audience:** broad / Advantage+ Audience; seed interests: Habits, *Atomic Habits*, productivity, fitness, meditation. Build **lookalikes** off purchasers later.
- **Creatives:** the short videos + a static **value-stack carousel** (the Free-vs-Premium comparison from the paywall). 3–5 variations.
- **Budget:** $20/day. ⚠️ **Policy:** keep copy to *habits / focus / discipline* — **no** body, health, weight, or "before/after" claims (Meta restricts health & "personal attributes").

## 4. Google Ads (high-intent search)
- **Campaign:** Search, exact + phrase match. Intent buyers convert best.
- **Keywords:** `habit tracker app`, `90 day challenge app`, `discipline app`, `daily habit tracker`, `routine tracker`, `streak app`, `[competitor] alternative`.
- **Negatives:** `free`, `pdf`, `template`, `printable` (filter freebie-seekers).
- **Ad copy:** "Build your next 90 days," "One goal. A daily system that sticks," "Track habits, focus & recovery — free to start."
- **Brand defense:** a cheap exact-match campaign on `arc90` so you own your name.
- **Budget:** $15/day, tight keyword list. Skip Performance Max until you have conversion data.

## 5. Weekly run-of-show (once the gate is passed)
- **Day 1–2:** launch TikTok ($20/day) + Google Search ($15/day). UTMs on everything.
- **Day 3:** check Vercel Analytics + funnel events. Kill any creative with CTR <1% or zero `paywall_viewed`.
- **Day 4–5:** add Meta ($20/day) with the 2 best-performing video hooks. 
- **Day 6:** double the budget on the single best ad set; pause the rest.
- **Day 7:** compute CAC = spend ÷ `premium_activated`. **Scale** what's under $25; **cut** anything over $49.

## 6. Scale / kill rules (tape them to your monitor)
- **Kill** a creative: CTR < 1% **or** CPC > $1 after ~$30, **or** 100+ clicks with 0 `checkout_clicked`.
- **Scale** an ad set: CAC < $25 → raise budget ~20%/day (don't 2× overnight, it resets learning).
- **Stop the channel** if blended CAC > $49 after $150 spend and won't improve — go back to organic.

> All ad copy stays in the habit / focus / discipline / 90-day lane. No medical, dosing, weight-loss, or supplement claims — those get accounts banned on all three platforms.

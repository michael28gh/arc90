# Unified Growth Operating System (Arc90 · Vitals Scrubs · Desert Decans)

One OS, three projects, one weekly rhythm, one approval inbox. Agents draft; you approve; the system publishes within hard gates. Target: **~90 minutes of your time per week.**

---

## 1. Executive summary

You have three products that exist but don't yet sell/distribute. The failure mode for a solo founder is three chaotic workflows. The fix is **one loop, run weekly, across all three**:

**Generate → Approve → Publish → Measure.**

- Every Sunday night, agents generate **one Weekly Growth Packet per project** (newsletter, social posts, UGC concepts, creator targets, competitor notes, store/app tasks, one experiment).
- Everything lands in **one unified Approval Queue** in your Jarvis dashboard (localhost:3000).
- Monday you spend ~45 min approving/editing in batches. Nothing goes live without you.
- The week runs semi-automatically; Friday you spend ~30 min on an agent-prepared analytics review and pick next week's experiment.

The unit of work is the **Weekly Growth Packet** (a markdown file in each repo). The control plane is the **Approval Queue**. Build those two first; every agent plugs into them.

**Pilot on Vitals Scrubs** (Shopify, can sell today, email = fastest ROI), prove the loop in 2 weeks, then replicate to Desert Decans and Arc90.

---

## 2. Unified Growth Operating System

### The loop
`Generate (agents) → Review/Approve (you, batched) → Publish (gated) → Measure (agents) → next experiment`

### Control plane — Jarvis dashboard (localhost:3000)
Tabs:
- **Dashboard** — KPIs per project (one row each), this week's experiment, queue count.
- **Approval Queue** — unified inbox of typed, approvable items across all 3 projects.
- **Calendar** — scheduled content/email per project.
- **Packets** — the week's generated packets (rendered from each repo's `growth/`).
- **Agents / Logs** — agent runs, status, errors.
- **Settings** — per-project config + which external accounts are connected (OAuth).

### Data layer — one `growth/` folder per project repo (single source of truth)
```
growth/
  brand.md          # voice, do/don't, palette, taglines, anti-references
  icp.md            # ideal customer, pains, triggers, objections
  offers.md         # products, prices, hooks, bundles
  competitors.md    # tracked competitors + notes (agent-updated)
  kpis.md           # the 5 numbers that matter for this project
  calendar.md       # scheduled posts/emails
  packets/YYYY-WW.md# the weekly growth packet
  drafts/           # agent output awaiting approval
  approved/         # human-approved, ready to publish
  published/        # shipped (archive + perf notes)
  analytics/        # weekly metric pulls + reviews
```
Agents READ existing project files (brand assets, product pages, copy, docs) and WRITE drafts into `growth/drafts/`. Approval moves a draft to `approved/`; publishing moves it to `published/`. The dashboard just renders these folders.

### The Weekly Growth Packet (the unit of work)
One file per project per week containing, as discrete approvable items:
1. Newsletter/email campaign (subject + body)
2. 5–7 social posts (hooks + captions + format)
3. 1–2 UGC/ad concepts (brief + shot list + AI-gen prompt)
4. 3 creator outreach targets + personalized DM drafts
5. Competitor notes + 1 thing to copy/beat
6. Shopify flow change (stores) / App Store task (Arc90)
7. **The one experiment** for the week (hypothesis + metric)

### Approval Queue (the spine)
Each item is typed by the action it will trigger, and carries its gate:

| Item type | Gate (never auto) |
|---|---|
| `email_send` | ✋ human approve |
| `social_post` | ✋ human approve |
| `creator_dm` | ✋ human approve + manual send |
| `ad_spend` | ✋ human approve (budget cap) |
| `store_publish` | ✋ human approve |
| `app_publish` | ✋ human approve |
| `doc_update` (brand/competitor/calendar) | auto-OK (reversible, in-repo) |

You approve / edit / reject in batches. Approved + API-connected items can be scheduled by the system; everything outward-facing waits for your tap.

### Hard human gates (the only rules that never bend)
Sending emails · posting to social · contacting creators · spending ad budget · publishing app/store changes. Agents draft all of these; **you** release them.

---

## 3. Project-specific workflows

### Arc90 — habit/focus app (pre-revenue; goal = installs + retention + list)
- **Channels:** TikTok + IG organic (build-in-public + "90-day challenge/discipline"), the in-app share loop (Story/Quote/Proof cards), email capture → newsletter (sending deferred), App Store launch track.
- **Weekly outputs:** 5 short-form video concepts (the app generates the content — "Day X of my arc"), 1 newsletter draft (held), 3 creator targets (discipline/productivity), App Store task.
- **Data needed:** `docs/arc90-operating-system.md` (already exists), funnel events (activation, D7, conversion), share assets.
- **Special track — App Store:** PWA today → Capacitor wrapper → ASO (title, subtitle, keywords, screenshots, preview video) → submit. Treat as a checklist, not a campaign.
- **Don't:** run paid ads yet (≈3× underwater pre-conversion, per the operating-system doc). Organic + list only.

### Vitals Scrubs — Shopify apparel (revenue NOW — pilot here)
- **Channels:** email flows (highest ROI), UGC ads, creator outreach (nurses/med students), organic IG/TikTok, conversion on the store.
- **Email flows (build these first):** Welcome (3 emails), Abandoned Cart (3), Browse Abandon (1–2), Post-Purchase (2 + review request), Win-back (2). Plus a weekly campaign.
- **UGC:** real scrubs on real nurses (fit, pockets, 12-hr-shift comfort). Hooks: "POV: your scrubs survived a 12-hour shift."
- **Creators:** nurse/healthcare TikTok + IG creators; gifting → affiliate.
- **Conversion:** PDP (fit guide, reviews, size confidence), bundles, free-ship threshold, urgency on restocks.
- **Data needed:** product catalog, current store copy, brand assets, Shopify/Klaviyo data (orders, AOV, top products), reviews.

### Desert Decans — Shopify fragrance decants (revenue NOW)
- **Channels:** same ecom engine + fragrance-community content (FragTok is huge), sample→full-bottle upsell.
- **Email flows:** same set, plus a **scent-discovery** welcome (quiz → recommendation) and a **"loved your sample? get the bottle"** upsell flow.
- **UGC/content:** scent storytelling, "smells like ___", layering guides, blind-buy-avoidance.
- **Creators:** fragrance reviewers/decant community.
- **Conversion:** scent quiz, discovery sets/bundles, sample-credit-toward-bottle.
- **Data needed:** catalog (which houses/scents), current copy, brand assets, Shopify data.
- ⚠️ **Compliance flag:** decanting/reselling designer fragrances carries trademark/authenticity nuance, and fragrance shipping is restricted (flammable/air). Get a human/legal pass before scaling claims or ads. (See §8.)

---

## 4. AI agent roles

Shared roster, parameterized per project. Each agent: **inputs (data) → outputs (files in `growth/drafts/`) → gate.** All draft-only.

| Agent | Inputs | Outputs | Gate |
|---|---|---|---|
| **Orchestrator** | all `growth/` files, KPIs | builds the Weekly Packet, routes sub-agents, populates the queue | auto |
| **Email / Newsletter** | brand, icp, offers, calendar, store data | campaign + flow copy → `drafts/email/` | `email_send` |
| **Social Content** | brand, calendar, recent winners | 5–7 posts + calendar → `drafts/social/` | `social_post` |
| **UGC / Creative** | offers, brand, product imagery | ad/UGC briefs + AI-gen prompts (Higgsfield/Arcads) → `drafts/ugc/` | `social_post`/`ad_spend` |
| **Creator Outreach** | icp, competitors | 3 targets + personalized DM drafts → `drafts/outreach/` | `creator_dm` (manual send) |
| **Competitor Research** | competitors.md, public web | scan + 1 move to copy/beat → updates `competitors.md` | auto (public only) |
| **Shopify Flow** (stores) | catalog, store data, brand | Klaviyo/Shopify-Email flow specs + copy → `drafts/flows/` | `store_publish`/`email_send` |
| **App Store** (Arc90) | app docs, ASO data | listing copy, keywords, screenshot specs, launch checklist → `drafts/appstore/` | `app_publish` |
| **Analytics** | platform/store metrics | weekly review + next experiment → `analytics/` | auto |

> These extend the Arc90 `docs/agents/` roster (agents 6–11 already exist for Arc90 marketing). The Growth OS generalizes them to all three projects.

---

## 5. Weekly operating cadence (~90 min of your time)

| When | Who | What |
|---|---|---|
| **Sun 9pm** | 🤖 auto | Orchestrator generates 3 Weekly Packets + fills the Approval Queue + Analytics pulls last week's numbers |
| **Mon 9–9:45am** | 🧑 you (45m) | Batch-approve: newsletter, week's social, creator DMs, flow/store changes, the one experiment. Edit or reject inline. |
| **Tue–Sat** | 🤖 + 🧑 (5m/day) | Approved posts/emails publish on schedule; you tap-send creator DMs; quick phone check of the queue |
| **Fri 4–4:30pm** | 🧑 you (30m) | Read the agent's analytics review across all 3 → choose next week's experiment per project |
| **Anytime** | 🧑 | Anything in the queue waits for you; nothing outward-facing auto-sends |

Two calendar blocks (Mon 45m, Fri 30m) + daily 5-min queue checks = the whole job.

---

## 6. Automation priority roadmap

- **Phase 0 — Backbone (week 1):** `growth/` scaffolding + Approval Queue + Orchestrator + one Packet generator. Pilot: **Vitals Scrubs.**
- **Phase 1 — Money (week 1–2):** Email/Newsletter + Shopify Flow agents → welcome + abandoned-cart flows + first weekly campaign for both stores. (Fastest ROI, lowest API friction.)
- **Phase 2 — Reach (week 2–3):** Social Content + Competitor Research, all 3.
- **Phase 3 — Trust (week 3–4):** UGC/Creative + Creator Outreach, all 3.
- **Phase 4 — Measure + App (week 4+):** Analytics agent (closes the loop) + Arc90 App Store track.
- **Phase 5 — Paid (only after pixels + proven conversion):** Ads agent, gated by budget caps + kill rules. Arc90 stays organic-only until conversion is proven.

---

## 7. What to build first

**The unified Approval Queue + Weekly Packet generator, piloted with the Email/Newsletter + Shopify Flow agent on Vitals Scrubs.**

Why this exact thing:
1. The queue + packet **is** the OS — every other agent plugs into it. Build the backbone once.
2. Email on a ready-to-sell Shopify store is the **highest, fastest ROI** in all three projects (abandoned-cart + welcome flows routinely recover 5–15% of revenue) and the **lowest API friction** (Klaviyo/Shopify Email is automatable; TikTok/IG posting is not).
3. It proves the Generate→Approve→Publish→Measure loop on real money in ~2 weeks before you scale to 3 projects × 9 agents.

First build, concretely:
1. Scaffold `growth/` in the Vitals Scrubs repo.
2. Orchestrator drafts `brand.md` / `icp.md` / `offers.md` from existing store files; you correct.
3. Email agent drafts welcome (3) + abandoned-cart (3) flows + this week's campaign → `drafts/`.
4. Approval Queue renders them; you approve.
5. You connect Klaviyo/Shopify (OAuth) + verify SPF/DKIM/DMARC; publish the approved flows.
6. Analytics agent reports opens/clicks/recovered revenue Friday.

---

## 8. Risks and constraints

- **Platform automation limits:** IG/TikTok do not allow full unattended posting via API for most accounts → semi-manual (draft + schedule + you post). Design for "draft + you tap," not "auto-post."
- **Creator outreach = spam/ban risk:** keep DMs personalized, low-volume (≤3/day/project), manual send. No mass blasting.
- **Ad spend:** gated by budget caps + kill rules; do not run paid until pixels are firing and conversion is proven. Arc90 paid is premature (≈3× underwater pre-optimization).
- **Email deliverability:** warm the sending domain, use double opt-in, set SPF/DKIM/DMARC before any newsletter send. A cold domain blasting = spam folder.
- **Brand divergence:** three very different brands (clinical app, healthcare apparel, luxury fragrance) → strict per-project `brand.md` or everything drifts to generic AI voice.
- **Desert Decans legal:** reselling/decanting trademarked designer fragrances has authenticity + trademark nuance, and fragrance is hazmat for shipping (flammable/air-freight restrictions). Human/legal review before scaling claims or ads. Do not let agents invent authenticity or health claims.
- **Arc90 health-claims compliance:** track-only language, no medical/dosing claims (already enforced in-app).
- **Solo-founder over-build trap:** the temptation is to perfect the dashboard instead of shipping growth. The packet + queue is enough — resist scope creep.
- **Credentials:** agents cannot connect Klaviyo/Shopify/Meta/TikTok/ESP for you — those need your OAuth/API keys (set in env, never pasted in chat).

---

## 9. Exact next 10 actions

1. **Confirm the pilot = Vitals Scrubs** and give me its local repo path (and Desert Decans' path) so agents can read its files.
2. **Scaffold `growth/`** in all three repos (folders + empty `brand.md`/`icp.md`/`offers.md`/`competitors.md`/`kpis.md`/`calendar.md`).
3. **Auto-draft `brand.md` + `icp.md` + `offers.md`** for Vitals Scrubs from its existing store files; you spend 20 min correcting.
4. **Stand up the Approval Queue + Orchestrator** in the Jarvis dashboard (localhost:3000), reading each repo's `growth/drafts/`.
5. **Build the Email/Newsletter agent** → generate Vitals' welcome (3) + abandoned-cart (3) flows + week-1 campaign into `drafts/`.
6. **Connect Klaviyo/Shopify** (your OAuth) and verify SPF/DKIM/DMARC.
7. **Approve flow #1 in the queue → publish** (your first real Generate→Approve→Publish).
8. **Add Competitor + Social agents** → first content calendar for all three projects.
9. **Set the cadence:** calendar blocks Mon 9:00 (45m review) + Fri 4:00 (30m analytics).
10. **Build the Analytics agent** → first Friday review → pick week-2 experiments per project.

---

*Companion docs: `docs/arc90-operating-system.md` (Arc90 strategy), `docs/agents/` (the in-repo agent briefs). This Growth OS governs all three projects; each project keeps its own `growth/` folder as the source of truth.*

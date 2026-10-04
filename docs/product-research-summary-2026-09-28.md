# Arc90: Product Research and Protocol Audit

September 28, 2026. Local build v139. Research and recommendations only; no application code or live deployment changed.

## The Verdict

**Arc90's strongest opportunity is to turn a person's real-life constraints into a manageable day, then connect those actions to a meaningful 90-day outcome.**

A proposed promise: **A day you can keep. A change you can see.**

Readiness scores, AI health coaches, habit correlations and supplement catalogs are not new. Bevel now lists calendar integrations, while WHOOP released custom journal behaviors on September 18, 2026. A feature-count race would be expensive and difficult to win. [Bevel feature ledger](https://help.bevel.health/en/articles/11194113), [WHOOP release](https://www.whoop.com/us/en/thelocker/custom-journal-behaviors-are-here/).

We can compete on a more specific repeated job: **help me choose the next useful action, record it once, and understand my progress without spending my day managing an app.** This is a hypothesis to test, not a claim that no competitor offers anything similar.

The detailed [interactive research report](/Users/michael28gh/Projects/arc90/docs/product-research-2026-09-28.html) includes 15 competitor briefs, source links, implementation variables, risk boundaries, validation tasks and the complete Protocol audit.

## What the Competition Already Does

These are verified first-party feature descriptions, not independent evidence of effectiveness or a recommendation to follow their health advice.

| Product | Relevant benchmark | What Arc90 must do better for a specific user |
| --- | --- | --- |
| [Bevel](https://www.bevel.health/) | Broad connected-health experience and AI coaching | Fewer decisions between understanding today and doing the next useful thing |
| [Oura](https://support.ouraring.com/hc/en-us/articles/39512345699219-Oura-Advisor) | Biometric context and personalized Advisor conversations | Remain useful without required hardware; connect context to a concrete goal action |
| [WHOOP](https://www.whoop.com/us/en/thelocker/custom-journal-behaviors-are-here/) | Behavior logging and associations with recovery | Turn observations into modest, user-approved decisions, not more metrics |
| [Gentler Streak](https://docs.gentler.app/understanding-your-activity-path/what-is-the-activity-path) | Flexible activity and recovery guidance | Bring that supportive approach to broader life goals |
| [RISE](https://help.risescience.com/hc/en-us/articles/40672503374871-How-does-RISE-predict-my-Energy-Schedule) | Daily energy-window predictions | Make the window useful for a real task, with a manual fallback |
| [Sleep Cycle](https://sleepcycle.com/) | Sleep-focused trends and scoring | Use sleep as context without rebuilding a specialist sleep product |
| [Bearable](https://bearable.app/support/tips/health-experiments-a-guide-to-learning-how-your-habits-impact-your-health/) | Tracking and personal experiments | Reach a useful review with less extra logging |
| [Guava](https://guavahealth.com/health-insights) | Connected records, lifestyle data and correlations | Be a focused daily companion rather than another full health-record system |
| [Apple Medications](https://support.apple.com/en-us/105064) | Native schedules, reminders, recording and archive | Meet this reliability baseline before claiming better design |
| [Streaks](https://streaksapp.com/) | Fast habit tracking, schedules and Watch interactions | Show meaningful outcomes without losing speed |
| [Sunsama](https://www.sunsama.com/features/timeboxing) | Realistic calendar-based work planning | Connect daily constraints to a broader personal 90-day goal |
| [Opal](https://opalapp.com/) | Blocking rules and focus timers | Show what protected time produced, not only minutes saved |
| [SuppCo](https://supp.co/) | Supplement catalog, stack analysis and intake tracking | Prioritize clear, trustworthy existing-plan records over more products |
| [Peptide Tracker](https://peptidetracker.ai/help/protocols-and-schedules/editing-a-schedule) | Detailed schedules and preserved dose history | Integrate reliable records into the whole day without gamifying consumption |
| [Medisafe](https://medisafe.com/download-the-app) | Medication reminders, reports and caregiver support | Complement established medication tools with goal context, not imitate their entire product |

The closest broad comparator is **Bevel**. The most relevant Protocol benchmarks are **Apple Medications, SuppCo, Peptide Tracker and Medisafe**. That assessment reflects feature overlap, not market-share data.

## Protocol: Findings First

Four high-priority problems should be fixed before adding health insights:

1. **The daily count ignores frequency.** One completed daily item plus an unlogged weekly item and an as-needed item is reported as 1/3. Weekly items not due and optional items should not lower today's scheduled completion. [protocolStats](/Users/michael28gh/Projects/arc90/js/app.js:2042).
2. **Day and night overwrite each other.** `upsertProtocolLog` keeps only one entry per date. An isolated morning/evening test retained only the evening entry. [upsertProtocolLog](/Users/michael28gh/Projects/arc90/js/app.js:2082).
3. **A quick tap invents symptom information.** It saves `symptoms: ['none']` without asking. Tapping again removes all logs for today, potentially including detailed notes. Intake and symptoms must be independent. [Quick-log handler](/Users/michael28gh/Projects/arc90/js/app.js:9126).
4. **Adding an item can rewrite the apparent past.** Yesterday's score changed from 100% to 50% when an unlogged item was added today because historical percentages use the current item count. [protocolPulseRows](/Users/michael28gh/Projects/arc90/js/app.js:2087).

These were confirmed from current source; the count, overwrite and historical-score behaviors were also reproduced with isolated test data. The audit did not modify real health records.

## Ten Protocol Improvements

1. **A due-now list.** Show Now, Later, Logged and Optional. Count scheduled occurrences, not every product in the library. Unlogged is not the same as not taken.
2. **Independent day/night records.** Every occurrence gets its own time, amount/unit snapshot, status and source. Support multiple records without losing earlier ones.
3. **Safe correction and optional symptom logging.** One tap records intake only. Offer an Undo for that action, preserve separate symptoms, and default symptom status to "Not assessed."
4. **Reminders users can verify.** Show permission status and next reminder. The current form stores a time, but no per-protocol reminder scheduler was found. Physical iPhone delivery still needs testing; until then, label it "Planned time." [Reminder field](/Users/michael28gh/Projects/arc90/js/app.js:7533).
5. **Review, edit and archive.** Templates should open a short setup review instead of instantly creating a generic plan. Let users edit future schedules and archive without erasing history. Also fix the current Close button, which leaves the add form open. [Handler](/Users/michael28gh/Projects/arc90/js/app.js:9071).
6. **A smaller, calmer layout.** Compact rows with product, recorded amount, time and status. Use consistent small icons and at least 44px interactive targets. Put the collapsed Library below the active plan; leave full Sleep analysis in its own destination.
7. **A truthful history graph.** Use the schedule active on each date. Separate taken, skipped, unlogged and not scheduled. Zero should not be drawn as an 8%-height bar. Include accessible dates and counts. [Current chart](/Users/michael28gh/Projects/arc90/js/app.js:7369).
8. **An evidence-aware library.** Identify exact products and ingredients, separate label serving from personal instructions, and show dated sources. Do not treat "popular" as "right for you." Regulatory status, evidence and product quality are different questions.
9. **Record once, reuse across screens.** Link water and sleep records to their existing counters rather than create independent checkboxes for the same activity. Add permissioned medication imports and Watch dose actions only after deduplication and offline behavior work reliably.
10. **Useful history and export.** Offer editable records, accessible form labels, a date-filtered CSV and a readable print/PDF view with timestamps, units, source and missing-data labels. The current export says it excludes dosing information while printing recorded amounts. [Export](/Users/michael28gh/Projects/arc90/js/app.js:10039).

**Peptide boundary:** recording an existing professionally directed plan is different from generating a regimen. Do not assign every peptide a daily schedule or publish generic doses/cycles. Some compounded substances have significant safety concerns and limited evidence; product-specific review matters. [FDA safety reference](https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks).

For vitamins and supplements, labels, combined ingredients and medication interactions matter. A duplicate-ingredient notice would not be a complete interaction check or a declaration that a stack is safe. [NIH supplement guidance](https://ods.od.nih.gov/factsheets/WYNTK-Consumer/).

## Five Differentiating Ideas

### 1. A Day That Actually Fits

Upgrade Adaptive Day into a realistic plan linked to the 90-day goal.

**Example:** "You have 25 minutes free. One study block moves this week's milestone forward."

- **Design:** One compact next-action row in Today's Arc, not another large panel. Tap for alternatives and an explanation.
- **Variables/connections:** Available time, user-reported energy, structured habit duration, milestone priority, session history; optional calendar and HealthKit context.
- **New work:** Arc90 already has Full/Busy/Recovery, capacity choices and best-window logic. Add conflict-aware scheduling and learned duration rather than rename those features.
- **First test:** Start with manually entered available time. Measure time to first meaningful action, realistic-plan ratings and successful completion. Never change medical schedules to fit the calendar.

This is the **main product feature I would lead with**. Calendar planning itself is not new; the opportunity is a simpler default workflow tied to the user's chosen outcome.

### 2. Protocol Passport

Each tracked item has a clear identity, instruction source and honest history. Daily interaction remains one tap.

- **Design:** A compact daily timeline. Item detail contains Plan, History and Evidence.
- **Variables/connections:** Product, ingredient, amount/unit, schedule version, actual time, source and optional inventory. Label scanning must require user review.
- **New work:** Replace daily toggles with occurrence-level records, source provenance, corrections and a useful report.
- **First test:** Prove that two daily occurrences, repeated taps, offline sync and corrections never corrupt the record. Inventory and scanning come after this.

Apple provides APIs to **read authorized medications and dose events**. That is a possible native connection, not a feature already implemented in Arc90's current bridge and not permission to assume two-way medication editing. [Apple developer session](https://developer.apple.com/videos/play/wwdc2025/321/).

### 3. One Question at a Time

Help users learn about one low-risk behavior and one outcome without adding a long daily questionnaire.

**Example:** "Do my phone-free study blocks lead to more practice questions completed?"

- **Design:** One active question in Arc. A small Today action, then a review with raw observations, coverage and possible confounders.
- **Variables/connections:** Focus sessions, habits, workload, weekday, optional sleep context, one outcome metric and missing data.
- **New work:** Add a question-to-action-to-review workflow, not another correlations page. Bearable and other apps already offer experiments or associations.
- **First test:** Descriptive review only. Allow "not enough comparable data." No causal claims from ordinary tracking and no experiments that change medications or peptides.

### 4. A Personal Friction Playbook

Remember the practical responses the user found helpful on difficult days.

**Example:** "Last time work ran late, you chose a 5-minute review. Use that version today?"

- **Design:** Optional Time / Energy / Distracted / Unclear choices, followed by a short editable if-then plan.
- **Variables/connections:** Obstacle, chosen response, whether it helped, journal context only with permission, existing comeback and Focus tools.
- **New work:** Arc90 already has comeback micro-actions and recovery rate. Add context-specific memory and feedback instead of another score.
- **First test:** Explicit rules without an LLM. Track useful acceptance and return after disruption, alongside dismissal and perceived pressure. Cloud journal analysis requires explicit consent.

### 5. An Outcome-Linked Arc

Make the 90-day view show the difference between checking boxes and achieving a goal.

**Example:** "You kept five study sessions. Your recorded practice score moved from 62 to 70." That is a joint observation, not proof of causation.

- **Design:** Keep the visual Arc, add a restrained outcome line and milestone markers, then one useful weekly review.
- **Variables/connections:** Baseline, target, units, milestone dates, actual outcome measurements, existing Proof Wall notes/photos and Focus sessions.
- **New work:** Proof Wall already exists. Link evidence to a specific goal and milestone; do not build a second photo gallery.
- **First test:** One outcome metric, three milestones and manual evidence selection. Never infer an outcome from habit checkmarks or publish health details by default.

## Recommended Build Order

1. Fix Protocol's schedule, record and history integrity.
2. Make Today produce a useful next action with explicit available time.
3. Add the compact Protocol Passport and reliable native reminders.
4. Connect goal outcomes and evidence; add the friction playbook.
5. Add the one-question learning loop only when the underlying records are dependable.

Keep the current Today / Arc / Habits / Lab / You structure. These ideas should make it more coherent, not add five tabs.

Charge for useful synthesis and richer planning, not access to basic correction, export or essential safety information. Pricing needs willingness-to-pay testing. This research did not exhaustively compare regional subscription offers.

## Research Limits

This was primary-source desk research, current-source inspection and a browser audit of Arc90's phone-sized Protocol flow. It was **not** completed user fieldwork, paid competitor testing, a native notification audit or clinical validation.

Next, test the current and proposed flows with actual users: plan a disrupted day, record an occurrence, correct a mistake, find a past entry and explain their weekly progress. Observe task success, effort and trust. A small qualitative sample can guide design, not prove market dominance.

The interactive HTML report passed JavaScript syntax and structural checks. Its local-file browser preview was blocked by the browser's URL policy, so visual rendering of that report was not browser-verified. This Markdown summary is provided for direct reading.

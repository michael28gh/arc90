# Arc90: A Product People Choose Every Day

Strategy proposals, October 3, 2026. No app changes or marketing campaigns were executed. This document does not replace Claude's active implementation instructions.

## The proposition

**Arc90 helps you choose the right next move for a life you actually want.**

The 90-day arc supplies a meaningful chapter. The daily experience supplies one achievable action. The weekly review asks whether those actions are producing the result the user wanted. Difficult days improve a user-owned playbook rather than generate guilt.

Make the app useful enough to return to, not emotionally difficult to leave. Success can mean less time in the app and more meaningful activity outside it.

This develops the September 28 product research rather than claiming its adaptive-day, friction-playbook, and outcome-linking ideas are new inventions. The proposed new emphasis is a decision loop that catches ineffective consistency, remembers practical adjustments, and preserves concrete evidence of change.

## What research does and does not establish

AI guidance already exists in [Oura Advisor](https://ouraring.com/blog/oura-advisor/). Guided daily planning and shutdown are central to [Sunsama](https://www.sunsama.com/features/daily-planning-and-shutdown). Automatic scheduling and reprioritization are offered by [Motion](https://www.usemotion.com/features/ai-task-manager). Morning/evening reflection, mood history and insights are present in [Stoic](https://www.getstoic.com/features).

Obstacle-and-plan thinking also predates Arc90; [WOOP](https://woopmylife.org/en/practice) is one explicit example. Do not market a familiar behavioral technique as proprietary science.

These are first-party feature descriptions, not independent evidence of effectiveness. The differentiation below is a product hypothesis. No customer interviews, competitor paid-account trials, or market-wide novelty investigation were performed for this brief. Historical repository documents are context, not verification of current revenue, users, backend configuration, or competitor pricing.

## Three signature experiences

### 1. Direction Check: consistency is not the same as progress

This is the most interesting new product bet.

At setup, choose an outcome, one measure of that outcome, and a few supporting actions. A study goal could use a comparable practice-test score; a creator goal could use finished, published work. Different goals need different units.

The weekly review displays effort and outcome side by side. Example with illustrative data: "You kept 10 study sessions. Your last three comparable practice scores were 62, 63, and 62. Keep the routine, change the method, or revisit the measure?"

The app should not claim the routine caused the scores or that lack of recorded improvement proves failure. It should show dates, missing measurements, source, and known differences between measurements. Some goals have long delays before an outcome changes.

First implementation: one manually recorded outcome metric, a small goal-linked evidence history, and user-triggered review. No automated causal inference. Let the user select an adjustment, then compare observations at the next review.

### 2. A personal playbook, not another recovery score

Extend the existing comeback and journal work. Save the obstacle, response, context, and the user's later judgment of whether it helped.

Illustrative example: "On your last three late-shift days, you tried a short review twice and said it helped both times. Use that version today?"

Separate actions completed from responses the user actually found useful. Show the underlying examples; never imply two observations prove a rule. Provide editable memory, forget/delete controls, and private export. Use structured choices first; cloud analysis of journal text must be explicitly opted into.

First implementation: simple user-approved if-then rules. Do not build a large general chatbot. With no history, offer a clearly labeled suggestion rather than pretending to know the user.

### 3. A living 90-day story

Extend existing Proof Wall and goal records rather than building a duplicate gallery. A chapter combines a starting point, milestones, selected evidence, decisions, and reflections.

Record an optional short voice note on day one. At a user-chosen milestone, pair it with actual evidence of what changed. Offer a restrained private recap with editable captions, not AI-generated memories or guaranteed transformations.

The daily habit animation can place a small mark on the chapter timeline. The real reward is recognizing meaningful change, not collecting unrelated badges.

First implementation: text baseline, milestone evidence, and a day-30 review. Voice transcription and video export come later. Photos, health records, journal excerpts, and audio are never public by default.

## Additional ideas worth testing

| Idea | Concrete experience | First version and constraint |
| --- | --- | --- |
| Rehearse today | Before approving a 45-minute plan, preview the 15-minute version and see exactly what would move or be dropped. | Extend Full/Busy/Recovery with transparent time budgets and undo; do not silently change the goal or medical schedule. |
| An intentional stop list | Pause a task or habit with a reason and review date. The app distinguishes a conscious decision from missing data. | Preserve prior history; never reward quitting or piling up obligations indiscriminately. |
| Tomorrow is already prepared | A night entry leaves one specific starting instruction: "Open the saved deck and answer five questions." | Reuse the morning/night entry, focus task, and deep links instead of adding another planning form. |
| An idea nursery | A voice/text capture becomes a proposed task, goal, or parked idea. Parked ideas stay out of today's obligations. | Extend Capture; review before saving. No surprise task creation or artificial expiry pressure. |
| One safe personal experiment | Ask one practical question, such as whether preparing study materials the night before makes starting easier. | Descriptive observations, missing-data labels, no causal claim; exclude medication, peptide, and other risky regimen changes. |
| A private witness | Choose one milestone and one person to share it with. Ask for encouragement, not public ranking. | Manually reviewed share first. Journals and health records excluded unless deliberately selected. |
| Quiet mode for established habits | Once a routine feels automatic, the user can reduce reminders and move to occasional check-ins. | Never infer unlogged completions. Graduation reduces app burden rather than erasing history. |
| One next-action widget | Show only the chosen next move, its goal, and a start/log action outside the app. | A native-extension project later, not something to promise from PWA CSS; assess iOS support and data synchronization first. |
| One record, several useful views | Finishing a goal-linked focus session can propose updating its task and habit without repeated entry. | Explicit mappings, user confirmation where ambiguous, idempotent event IDs, offline retry safety, and undo. |

## Daily experience

Morning: confirm available time and today's priority. Suggest one main action and up to two supporting habits. Do not make a full journal entry mandatory. Planning should be optional when the existing plan still fits.

During the day: one obvious Start action, with a smaller alternative available. After an interruption, preserve completed work and offer a revised plan for approval.

Night: record the actual outcome, what helped, and an optional sentence. Unfinished items get Tomorrow / Make smaller / Drop rather than accumulating overdue guilt.

Weekly: one useful finding, its supporting observations, and one proposed adjustment. Users can reject it. Fewer repeat questions should be needed as explicit preferences accumulate.

## Premium design direction

Aim for precision and confidence, not extra ornament. Use the existing charcoal/light neutrals, readable fixed typography, disciplined spacing, and a few stable functional colors. Dark mode is a theme, not proof of premium quality.

Proposed navigation for evaluation: Today / Arc / Progress / Lab / You, with Lab adjacent to profile. Habit editing remains readily available within Today and Arc. Do not switch navigation again without validating the click paths.

- Today answers: what matters now? One primary action, not six competing scores.
- Arc answers: what am I building? Goals, capture, tasks, journal and the purpose map have a shared context.
- Progress answers: is it working? Outcomes, effort, and a review appear before the chart library.
- Lab holds optional health records and tools. It must not obscure the product's central purpose or imply treatment advice.
- You holds settings, account, data controls and preferences.

Use the Sankey as a functional visual signature: tapping an action reveals the goal it supports. Its completion-share percentage is not a percentage of life-goal attainment. Use both a compact overview and a readable full-path view; data must remain available as an accessible list.

Motion should explain a state change. Examples: a logged action connects to its goal; a revised plan smoothly removes deferred items; selecting a milestone reveals its evidence. Respect reduced motion. Keep the requested two-second logo for a cold launch, but propose immediate return from background for quick logging rather than repeatedly blocking action.

Premium release gates include no clipped labels or safe-area collisions, reliable offline saves with visible status, correct undo, keyboard/screen-reader access, restrained haptics where supported, and honest empty states. Never fill a new user's charts with fake personal history.

## Marketing concepts

Lead with a recognizable moment in someone's life, not a list of trackers.

### Campaign A: Consistent, but stuck

Hook: "What if your routine is consistent, but your goal isn't moving?"

Show a real, consented example of the effort/outcome review and the user's chosen adjustment. Do not invent before/after results. This tests the Direction Check proposition.

### Campaign B: Your day changed. Your goal didn't.

Show a plan disrupted by a late shift, a deliberately smaller next action, and its connection to the same meaningful goal. Use an actual working screen recording, or clearly label a prototype.

### Campaign C: My next 90

Michael documents one real chapter alongside a small founding group. Show imperfect weeks, changed plans, and real evidence, not staged perfection. Begin with a reachable audience such as people studying while working or building a project alongside a job; treat this as an audience hypothesis.

### Product-led sharing

Create a tasteful optional chapter recap and a "Use this plan" link. Share the structure of a plan without sharing its author's records. Referrals should follow a meaningful result, not interrupt the first launch.

A seven-day introduction can help someone try the daily experience before committing emotionally to a 90-day chapter. A 90-day goal is a planning frame, not a promise that every habit or outcome takes exactly 90 days.

## What to build first

1. Finish and verify the current Arc/Progress redesign and protect existing records. No additional tabs or disconnected trackers during this pass.
2. Prototype Direction Check with one goal type, one outcome measure, and a user-approved adjustment. Reuse the goal, journal, focus, and Proof Wall data.
3. Add the structured personal playbook. Test the combined flow with a small group, suggested 10-15 participants for qualitative learning, over two weeks. That sample cannot establish market-wide retention or effectiveness.
4. Build chapter recap and the best-performing marketing demonstration after the corresponding product flow works. Reserve native widgets, broad imports and expensive AI features for later validation.

Recruit people who have a current goal and experience interrupted days. Observe whether they can choose the next action, explain the map, correct a record, and identify what changed without assistance. Ask whether the app reduced planning burden, not merely whether they liked its colors.

Suggested pilot measures: first goal-linked action, time to choose it, meaningful day-7 reuse, useful/annoying adjustment ratings, outcome-measure coverage, and missing/duplicate-record incidents. Define each measure before collecting it. Targets should be project decisions, not unsupported industry benchmarks. Do not send journal text or health details as analytics events.

## Commercial guardrails

Test payment for useful planning, review and optional advanced synthesis. Basic access to the user's own records, correction, deletion and export should not be hostage to an upsell. Estimate actual AI and synchronization costs before promising unlimited usage. Preserve prelaunch access until an explicit launch decision.

Avoid peptide recommendations, inferred medical readiness, a public social feed, speculative success probabilities, mandatory streak-saving notifications, and cosmetic scores without a clear interpretation. Those increase risk or complexity without proving the core promise.

**Decision:** make Arc90 memorable because it helps users choose, adapt, and recognize real progress. The first test is whether a user returns because yesterday's advice or workflow genuinely helped, not because the app threatened to take something away.

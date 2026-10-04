# Arc and Progress audit

Date: 2026-09-30. Scope: local v153 code, live browser navigation, phone-width layout, focused automated checks and isolated selector reproduction. No account records changed. No production deployment or physical-iPhone verification in this audit.

## Verdict

The foundation works, but the tabs are not yet one coherent product. Prioritize trustworthy calculations and complete action paths before adding more charts or animation. Arc should answer "What matters, and what will I do?" Progress should answer "What happened, and what should I change?"

## Verified findings

### P1: Unlink can leave the habit connected

`js/brain-dump.js:418` clears `habit.goal_id` without clearing `habit.task_id`. `js/brain-core.js:223` then follows the task's goal when the direct goal is null. Isolated reproduction retained the exact same three links after applying the UI's unlink mutation.

Fix: remove the selected relationship explicitly, distinguishing task-to-habit from direct goal-to-habit. The goal picker must also support a genuine unlinked state. Acceptance: unlink each supported edge type, reload, and verify both map and list lose that edge without deleting another relationship.

### P1: The same activity has different totals

`js/progress-dashboard.js:81` counts full and minimum completions, including historical removed habits. `js/brain-core.js:154` and `:163` count only full completions belonging to currently present habits. Reproduction: a minimum completion contributes zero to alignment. Deleting a habit can also remove its old activity from alignment while Progress preserves it.

Fix: define one activity ledger and shared selector. If full and minimum reps deliberately differ, label and expose that distinction rather than presenting both as interchangeable completions. Preserve historical attribution when habits are removed or reassigned.

### P2: Open Arc map opens the last Arc workspace instead

Browser reproduction: Arc > Journal > Progress > More diagrams > Open Arc map returns to Journal. The shortcut at `js/progress-dashboard.js:265` calls the generic tab route, and `js/app.js:3133` does not select the map workspace. Review goals has the same routing pattern.

Fix: explicit destinations, such as Arc/map or Arc/goals, independent of remembered navigation. Test every cross-tab CTA from every Arc workspace.

### P2: Saved relationships disappear visually before activity

`js/brain-dump.js:181` removes all zero-value links from the rendered graph. The core retains those relationships. Therefore a correctly linked plan with no full completions can appear disconnected.

Fix: thin dashed planned connections, solid proportional activity ribbons, and separate "No links yet" from "No activity in this period." Do not invent completion values.

### P2: Tasks created from Ideas are excluded from the alignment model

`js/daily-workspace.js:241` creates tasks without a horizon or goal. `js/brain-core.js:156` excludes tasks without a valid horizon entirely. The user can create a real task that never becomes a map node. Additionally, task completion itself does not generate map effort: only habit completions do.

Fix: normalize every task entry path to one schema, provide an optional goal picker and a visible unassigned inbox. Keep task outcomes distinct from habit reps unless an explicit effort model is introduced.

### P2: Week does not mean the same thing in both tabs

`js/brain-dump.js:132` uses Monday through today. `js/progress-dashboard.js:9` uses the trailing seven days. On September 30, Arc starts September 28 while Progress starts September 24. Numbers are not directly comparable.

Fix: shared date-window selector, consistent labels and visible date bounds. Define what happens after day 90: the current dashboard treats later days as in-arc (`:74`) while its 90-day heatmap ends at the cycle boundary.

### P2: Chart details and tables are not equivalent

`js/progress-dashboard.js:102` limits habit consistency to the last 14 days, while its detail table at `:295` counts the full selected period. The 90-day heatmap uses the full arc but the detail heading at `:299` prints the selected window. Momentum's table falls through to daily completion rows instead of momentum values. Arc comparison tables show sample sizes, not the percentages in the chart.

Fix: each chart returns its own data, exact range, units and accessible table. Acceptance: selecting Chart or Table must not change the measurement or period.

### P2: Insights can praise a day with no completed activity

Browser displayed "Mon was your strongest day: 0 of 5 planned reps." `js/progress-dashboard.js:232` gates this fallback on planned days, not positive observed activity.

Fix: require meaningful evidence, handle all-zero ties, and show an honest next action when no pattern exists. Do not imply a reliable behavioral pattern from a single occurrence of a weekday.

### P2: Arc comparisons can use unequal samples

`js/progress-dashboard.js:168` independently drops missing dates from each cycle before averaging. This can compare different day positions and different sample counts despite the dashboard's matched-day framing.

Fix: compare identical relative day positions with records in both cycles, or clearly label an unmatched comparison and disclose both sample sizes. Do not classify missing records as failures.

### P2: Night review and task completion are separate truths

`js/daily-workspace.js:205` saves a priority's "completed" outcome and routes carry-forward entries, but does not update the underlying task's done state or habit check-in. A completed review can coexist with an open task.

Fix: show actual completion status when reviewing, and explicitly offer "Also mark task complete" or use a single completion action with undo. Retrospective habit changes require the selected journal date, not today's date.

### P2: Unsubmitted journal writing is memory-only

`js/daily-workspace.js:6`, `:22` and `:292` keep morning/night drafts in runtime memory until Save. The interface labels this unsaved, so it is not a false save confirmation, but a reload or app termination can lose writing.

Fix: persist local drafts separately from submitted entries, recover them on reopen, and retain explicit submission for journal outcomes and analytics.

### P3: Four Arc tabs occupy a three-column grid

`css/daily-planning.css:34` declares three columns for four buttons in `js/daily-workspace.js:104`. Phone-width DOM measurements confirmed Ideas alone on the next row. This makes the section look unfinished and hides tasks behind an unrelated label.

Fix: a deliberate single-row scrollable tab strip with clear labels, or a balanced layout. Prefer Map / Capture / Tasks / Journal. Keep ideas within Capture instead of a second brain dump implementation.

## Product and visual recommendations

1. Arc: Map, Capture, Tasks, Journal. One capture inbox, editable AI suggestions, explicit goal assignment, and a direct Add goal action.
2. Progress: current-state summary followed by trends, habit consistency and a short evidence-based weekly review. Keep advanced diagrams behind one optional section.
3. Remove duplicate analytics from Arc history once equivalent history is accessible from Progress. Preserve access to old cycles.
4. Separate current metrics from period metrics. Label Momentum and Readiness as current; selected-period completion should not look like an explanation of the momentum score.
5. Distinguish "no data," "no plan," "minimum completed," "missed," and "rest." A radar axis with no assigned habits should not visually claim poor performance.
6. Make charts actionable: tap a date for that day's records, a habit for its history, a goal for linked tasks and habits. SVG title text alone is insufficient for touch inspection.
7. Keep the purpose map useful before it looks impressive: visible planned links, readable labels, touch-accessible details, no fake activity, and a clear repair action for each unassigned item.
8. Make journal lessons useful in planning: surface a previously helpful response only when its obstacle recurs, with a direct action to apply it to tomorrow's plan.
9. Give Arc and Progress distinct navigation icons. Health and Focus tools currently at the bottom of Progress deserve an explicit Lab destination or clearly labeled tool launcher.
10. Use restrained motion for state changes: new connections, completed tasks, period changes. Never make animation delay input or obscure the numerical result; retain reduced-motion behavior.

## What is already worth keeping

- Goal hierarchy cycle and missing-ancestor guards.
- Accessible list alternative to the map.
- Focus-dialog Escape handling, focus restoration and keyboard containment.
- Explicit confirmation before committing sorted items.
- Planned-schedule snapshots preserve historical totals in parts of Progress.
- Empty radar scaffold rather than fabricated scores.

## Verification and remaining coverage

Passed: brain-core (33 checks), brain-map, progress-dashboard, progress-insights (10 checks), and check:planning. Existing tests passing does not cover the failures above.

Browser checked: Arc empty state, Journal navigation, Progress overview, expanded diagrams, wrong map shortcut destination, misleading zero-activity insight, and phone-width tab geometry. Isolated core reproduction checked task-backed unlink and minimum-completion counting. Remaining findings are source-verified, not all end-to-end exercised.

Not verified in this pass: physical iPhone/PWA touch and safe areas, screen-reader use, authenticated cross-device synchronization, AI provider failure and rate limits, live RLS, production deployment equivalence, or destructive/editing workflows on real account data. These remain release gates, not assumed passes.

## Recommended delivery order

1. Data integrity: relationship mutations, shared completion policy, normalized task creation, journal/task reconciliation, draft recovery.
2. Navigation and meaning: explicit routes, shared periods, equivalent chart/table datasets, evidence thresholds, day-90 lifecycle.
3. Information architecture and polish: Arc workspace strip, unified capture, deliberate Lab access, touch drill-downs and restrained motion.
4. Release verification: deterministic populated/empty fixtures, 375/390px light/dark and reduced-motion checks, offline reload, auth isolation, phone verification. Publish only after these pass.

Acceptance target: capture an idea, turn it into a task or habit, link it to a goal, complete it, review it at night, and see the same result in Arc and Progress without duplicated entry, lost writing, or contradictory totals.

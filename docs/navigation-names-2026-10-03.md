# Arc90 Navigation Naming Decision

October 3, 2026. User-selected labels, in this exact order:

**Today / Plan / Status / Vitals / Me**

This replaces earlier naming proposals such as Arc, Progress, Lab, Wellbeing, and You for the main navigation. Arc90 remains the product name. The user's selection approves the labels; the responsibilities below are the proposed implementation mapping, not a shipped navigation change.

| Label | Primary question | Proposed contents |
| --- | --- | --- |
| Today | What matters now? | Selected daily actions, habit logging, next action, quick journal access. |
| Plan | What am I working toward? | Goals, tasks, habit management, capture, purpose map, journal history. |
| Status | How is it going? | Progress, results, charts, weekly review, future Direction Check integration. |
| Vitals | How am I doing, and what support is available? | Body/mind records, sleep, focus, meditation, protocols, guidance. |
| Me | What is personal to my account? | Profile, preferences, account, privacy, export and support. |

## Boundaries

- Status reviews goal activity and outcomes. Vitals holds personal signals and tools. Do not create two competing score dashboards.
- Vitals stays immediately beside Me, on the right of the bottom navigation.
- Preserve easy habit editing in Today and habit management in Plan. Do not remove habit access just to make room for Vitals.
- Focus and guidance are not medical measurements; group them clearly within Vitals if this mapping is implemented. The broader Vitals scope should be checked with users.
- Keep charts accessible in Status and the goal relationship map in Plan. No data or feature deletion is implied by the naming choice.

## Integration Notes

At the source review, the shell used Today / Arc / Habits / Progress / You. Do not simply rename the third button to Status: it currently opens Habits, not the progress dashboard.

Map by behavior: existing Today -> Today; Arc workspace -> Plan; progress dashboard -> Status; grouped tools -> Vitals; profile -> Me. The existing internal `vitals` route is specifically Health signals, not a ready-made hub for all tools. Avoid accidentally narrowing the new Vitals tab to that one screen or creating an ID collision. Internal route IDs can remain stable where practical.

Coordinate with Claude's current shell work before editing shared app files. Update accessible names, selected states, deep links and navigation tests together when implementing. Verify mobile label fit, safe areas and keyboard focus.

Only documentation changed for this decision. No shared application files, deployments or database changes were made.

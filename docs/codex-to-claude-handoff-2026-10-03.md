# Arc90: Codex to Claude handoff

Prepared 2026-10-03 at Michael's request. This is a status handoff, not a claim that the latest redesign is complete.

## Workspace and ownership

- Work directly in `/Users/michael28gh/Projects/arc90`. The latest Codex edits are in this checkout. Codex did not create another worktree for the current redesign; this chat has no attached worktrees. Earlier branches cannot be ruled out while Git is unavailable.
- Preserve existing edits. The checkout already contained substantial work. Do not reset, clean, overwrite it wholesale, or assume every uncommitted file belongs to this change.
- Apple Git commands were failing because the Xcode license was not accepted. That does not prevent reading, editing, building, or testing the app. Do not accept the license or use sudo on Michael's behalf without his explicit approval.
- This is a vanilla JavaScript PWA, not React Native. Main state is `S` in `js/app.js`, primarily localStorage-backed. Supabase handles purpose-map backup/categorization and related metadata. Use the existing styles, helper APIs, and bundled d3-sankey. No new UI framework is needed.

## What Michael wants next

Michael rejected the tall vertical map with thin glowing curves crossing habit names. He wants a real horizontal Sankey resembling his Pinterest references: broad proportional smooth ribbons, aligned vertical node bars, restrained distinct colors, legible labels outside the paths, and useful phone interactions.

His most recent reference files are:

- Rejected layout: `/tmp/codex-remote-attachments/019eb520-6ad1-76f2-9f2d-dadb6afb6604/11AE1415-B8C3-4E46-A958-06395E93BFD3/1-Photo-1.jpg`
- Desired single-source-to-many Sankey: same directory, `2-Photo-2.jpg`.
- Desired multi-column Sankey dashboard: same directory, `3-Photo-3.jpg`.

Maintain real goal/habit relationships and actual activity. Do not fabricate long-term goals or completions to make the chart attractive. His sparse data can have no long-term goal, two mid/short goals, and several unlinked habits.

## Last verified live release

- Last release verified by Codex: v158, published 2026-10-01 at `https://arc90.vercel.app/app?v=158`.
- Deployment: `dpl_A4og3kcnhXGQh9JvSLDPdWecGee6`, verified Ready and aliased at the time. Check current production before deploying; Michael may have made changes elsewhere since then.
- Last verified live signed bundle: `arc90-b9d1c03651dba142`.
- See `docs/arc-progress-delivery-status.md` for the complete v158 release record, tests, and known limitations. Those passing results apply to v158, NOT the unfinished redesign below.

Preserve v158 functional fixes: inline Arc Tasks; goal editing and return-to-picker; manual Capture review; late-AI draft protection; minimum completions; storage rollback; local task deadlines; reminder preservation; and cloud task deletion/deadline metadata. Supabase migration 006 was already applied and tested with rolled-back synthetic data. No database migration is needed for this visual redesign.

## Unfinished changes now on disk

Only `js/brain-dump.js` and `css/brain-dump.css` were manually edited in the latest redesign phase. The build was regenerated, but nothing from this phase was deployed or version-bumped.

- Removed `brainVerticalLayout` and its tall stacked diagram.
- Added `brainMapMode`, `brainOverview`, and `brainRibbon`.
- Default Overview: total completed effort flows into root goals and a gray unassigned/no-purpose node. This is an effort distribution, not an invented goal hierarchy.
- Full path: four horizontal horizon columns with reserved label lanes. Layout-only relay nodes carry direct links across skipped horizons; these must never become saved goals or user-facing fake goals.
- Added filled proportional gradient ribbons, a 480 ms entry reveal, reduced-motion support, and Overview / Full path controls.
- Retained List view, node/link actions, grouping, range controls, and updated zoom/pinch sizing.
- `npm run build` succeeded. A local 390px sample-data screenshot confirmed the Overview ribbons appear after entry animation. This was only an initial visual check, not full verification.

### Known unfinished work and risks

1. `node scripts/brain-map-check.cjs` currently FAILS with `ReferenceError: brainMapMode is not defined`. Its VM extraction starts at `brainGraph`, omitting the new `brainOverview` helper, and it still asserts the removed `brainVerticalLayout`. Update the harness and replace old assertions with meaningful horizontal geometry/data tests. Do not simply remove failing checks.
2. Overview root goals at the same horizon currently share one color. Improve distinct root/category colors without reverting to dominant purple or decorative glow.
3. Verify root distribution sums to total without double-counting, including orphan/removed-habit activity, invalid/cyclic/archived goal paths, zero activity, and many collapsed roots.
4. Check all-zero input geometry and sparse/no-long-term data. Invisible anchors, minimum visual node size, and relay spacing must not imply completed activity.
5. Full path at 375px, horizontal pan, pinch/button zoom, long labels, expand/group, selected-path highlighting (including collapsed members/relays), and node/link sheets have NOT been fully tested after this rewrite.
6. Inspect actual label bounding boxes and ribbon geometry for collisions. Existing character-count truncation still needs scrutiny. Don't split words across lines or shrink text into illegibility.
7. Verify full-path source/target actions after relay insertion and grouping. The raw data-link index must still reach the right unlink action. Overview ribbons should open destination details, not unlink a synthetic effort connection.
8. Recheck reduced motion, light/dark contrast, keyboard/List access, zoom bounds, and no document-level horizontal overflow.
9. Versions remain at v158 for this phase. Do not tell Michael the new map is live until a verified deployment is actually Ready.

## Reproduce and verify safely

The existing preview server is `http://127.0.0.1:5180` and serves `dist`, so rebuild source changes. Check the server before starting another. Each build clears generated fixtures; regenerate them afterward:

```sh
npm run build
node scripts/preview-brain-map-gallery.mjs
node scripts/preview-arc-workspace.mjs
```

- Map gallery: `http://127.0.0.1:5180/__dev/brain-map.html`. Template: `scripts/fixtures/brain-map-gallery.html`. Has Connected / Planned / Unlinked and light/dark sample states. The gallery does not render real detail modals.
- Full-app isolated workflow: `http://127.0.0.1:5180/__dev/arc-workspace.html`. Separate storage key, synthetic data, no account auth script. Use this for edits and interaction tests, not Michael's real records.
- `scripts/seed-purpose-demo.cjs` activity dates are July/August 2026; current-date windows may show zero. The gallery uses a fixed demo date. Never add demo activity to production to fix an empty test graph.
- Add a sparse fixture matching the rejected screenshot, then verify desktop and 375/390px screenshots before claiming visual completion.

Run focused checks and then the release checks:

```sh
npm run check:arc
npm run check:planning
npm run check:navigation
npm run check:design
node scripts/progress-dashboard-check.cjs
node scripts/progress-insights-check.cjs
npm run check
npm run check:launch
```

Keep changes scoped to the map. Existing physical-iPhone behavior, historical attribution, and authenticated cross-device synchronization limitations remain documented; do not call those solved based solely on local tests.

## Deployment context, only after verification

The project is already linked in `.vercel/project.json` to Arc90. The last working CLI was `npx --yes vercel@62.0.0`, scope `arc90-s-projects`. Reuse the existing project, do not create another one. A production rollout should bump the touched asset versions and service-worker cache (v159 if still unused), build the signed bundle through the existing build script, deploy, then inspect until Ready and verify the production alias in a browser. Do not claim a Git push happened while Git is unavailable. No secrets belong in this handoff.

Codex is handing off now and will not concurrently edit the app. Read the current files first, summarize your next focused step to Michael, and continue the redesign he requested while preserving his existing work.

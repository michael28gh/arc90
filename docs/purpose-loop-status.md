# Purpose Loop: Delivery Status

Updated 2026-09-30. Production deployment `dpl_8J1U8UmUtprmepYtfamDHA1hExL1` is ready at `https://arc90.vercel.app/app` (app asset v151).

## Delivered

- Five tabs: Today, Arc, Habits, Progress, You. Existing Lab tools are reachable from Progress.
- Arc Map, Brain Dump, Journal, and Ideas. Drafts persist locally; offline/manual sorting works.
- Supabase migrations 004 and 005 applied to Arc90's project. Owner-only RLS is enabled for dumps, goals, habits, tasks, and quota records. Batch map saves use one SQL transaction.
- `categorize-brain-dump` Edge Function deployed with JWT verification and a per-user daily quota. AI sorting still requires Supabase secrets `ANTHROPIC_API_KEY` and `BRAIN_DUMP_MODEL`.
- Brain Dump first-run draft, first goal, and linked suggested habits; habit goal and life-area editing; Today purpose tags and Purpose Pulse.
- Progress dashboard: Momentum, Life balance, Purpose flow, Goal progress, 90-day heatmap, Arc vs Arc, weekly rhythm, completion trend, habit consistency, completion hour, Feel after, and actionable insight rules.
- Six-card Story with 4:5 PNG export. Goal/habit names and life-area scores are excluded from exports by default.
- Day-start hour (default 04:00), reduced-motion and share-detail settings in You.
- Startup restores older Focus sessions without resetting saved user data. Retired appearance names migrate consistently to the current dark palette.
- Cloud map backup uses bounded batches and preserves the unsynced state when an edit happens during upload.
- A real 7/14/30/60/90-day streak earns a one-time per-arc milestone moment, integrated into the feel-after check-in.
- Isolated 60-day sample gallery. Its data never writes to a user's account.

## Verified

- `npm run check:launch` and focused checks for Brain Core, Progress, Story, day boundary, navigation, purpose chart, privacy, auth, daily planning, adaptive day and focus.
- Mobile-width dark and light Progress views, Story, clean first-run onboarding, offline Brain Dump review and Arc Map inspected in the in-app browser.
- Supabase catalog confirms RLS on all five new tables, anonymous RPC execution denied, authenticated RPC execution granted.
- Legacy Focus startup, 101-dump cloud backup, and streak-milestone regression checks pass. The public app returns HTTP 200 and serves the latest assets; Arc Map navigation was inspected on a phone-sized viewport.

## Remaining before calling the full prompt complete

- Set the two Supabase AI secrets and verify a real signed-in Claude sort. Without them, sorting falls back to manual review.
- Run the integration RLS script against a disposable Supabase database; current production catalog checks do not replace that test.
- Weekly recap notification scheduling and device/background delivery.
- Remaining signature-animation refinement, 60 fps measurement on a mid-range physical iPhone, and a short animation recording.
- Full Arc-versus-Arc radar comparison requires two cycles of recorded data; current card shows an honest empty state and compares saved daily rates when both exist.
- Physical iPhone verification of the production PWA and native shell. No native binary was installed by this deployment.

## Local checks

Run `npm run check:launch`, then `node scripts/brain-core-check.cjs`, `node scripts/brain-cloud-check.cjs`, `node scripts/startup-state-check.cjs`, `node scripts/streak-milestone-check.cjs`, `node scripts/progress-dashboard-check.cjs`, `node scripts/progress-insights-check.cjs`, `node scripts/story-mode-check.cjs`, `node scripts/day-boundary-check.cjs`, `node scripts/purpose-flow-check.cjs`, and `node supabase/tests/brain_dump_edge.test.cjs`.

After a build, `node scripts/preview-progress-gallery.mjs` recreates the development-only gallery at `/__dev/progress.html`. Normal deployments omit it.

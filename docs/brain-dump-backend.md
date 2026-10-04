# Brain dump backend

## Save contract (frontend integration)

Call authenticated `rpc('save_brain_map', { payload })`. IDs are generated once
on the client and reused on retries. No `user_id` fields are accepted.

```json
{
  "dump": { "id": "UUID", "raw_text": "Original text", "status": "saved", "review": null },
  "goals": [{ "id": "UUID", "title": "Goal", "horizon": "mid", "parent_goal_id": null, "status": "active", "source_dump_id": "UUID" }],
  "habits": [{ "id": "legacy-string-id", "name": "Habit", "goal_id": "UUID", "rhythm": "daily", "emoji": "", "cat": "custom", "min": "2-minute version" }],
  "tasks": [{ "id": "local-string-id", "title": "Task", "goal_id": "UUID", "horizon": "short", "done": false, "due": null, "source_dump_id": "UUID" }]
}
```

All four top-level keys are required; arrays may be empty. Each row is a full
snapshot, not a general partial patch. The server stamps ownership. Optional
`source_dump_id` on goals/habits/tasks defaults to this dump; explicit null is allowed.
Non-null source IDs must reference an owned dump. Optional goal fields: `target_date`
(ISO date or null), `color` (`#RRGGBB` or null). Optional habit fields: `emoji`, `cat`, `min`.
Omitted optional scalar values use defaults; send the current full row to retain them.
Acknowledgement: `{ "ok": true, "dump_id": "UUID", "goals": 1, "habits": 1, "tasks": 1 }`.
Missing rows are never deleted. Explicit `parent_goal_id: null` / `goal_id: null`
unlinks through this same RPC; omitting a link field retains the existing link.
Only selected habit definitions are uploaded by explicit cloud save. Habit logs,
health data, check-ins and journals remain local; this is not general app sync.
The RPC is atomic per payload. The current frontend separately pre-uploads dump
rows and calls the RPC for each dump, so a multi-dump cloud save is not atomic
as a whole; a failed later RPC can leave earlier dump rows in the cloud.

Limits: 256 KiB JSON, 20,000 characters raw text, 200 goals/habits/tasks per save,
200-character titles/names, 100-character legacy IDs. Goal chains contain at most
five nodes. Horizons are `long`, `mid`, `short`. Goal/task parents must be exactly
one horizon higher; long goals/tasks have no parent. Habits may link to mid/short
goals only. Goal statuses: `active`, `done`, `archived`; dump statuses: `draft`,
`review`, `saved`. Rhythms: `daily`, `weekdays`, `weekends`, `mwf`, `tuethu`, `weekly`.
Review is an optional object, max 128 KiB. SQL rejects unknown fields and wrong types.
Cloud loading uses authenticated selects on `brain_dumps`, `goals`, `arc_habits`,
`arc_tasks`; RLS filters all rows to the caller. Merge by IDs only after explicit Load
cloud, preserving unrelated local records. Offline queued saves reuse all IDs.

## Operations

No remote migration or deployment is performed by this change. Review and apply
`supabase/migrations/004_brain_dump.sql` after migrations 001-003. Use a disposable
Supabase database to run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/brain_dump_rls.sql`.
The test rolls back its fixtures. Run `node --test supabase/tests/brain_dump_edge.test.cjs`
(Node 22+) for mocked Edge authentication, quota, and response checks, and
`deno check --no-config --no-lock supabase/functions/categorize-brain-dump/index.ts`
for TypeScript validation. Without a database, SQL/RLS behavior is unverified.

Configure Edge Function secrets `ANTHROPIC_API_KEY` and `BRAIN_DUMP_MODEL` (a model
your Anthropic account supports; no fallback). Supabase provides `SUPABASE_URL`
and `SUPABASE_ANON_KEY`. Never expose the Anthropic key in browser code. The function
uses the caller's JWT, not a service key, for reads and its atomic 20/day UTC quota.
Deployment, when explicitly approved: `supabase functions deploy categorize-brain-dump --no-verify-jwt`.
The function verifies every bearer token via Supabase `auth.getUser` itself.
Ensure the deployment bundle includes its side-effect import of `js/brain-core.js`.

The endpoint accepts `{ text, existing_goals: [{ id, title, horizon }] }` (text max
20,000 characters, goals max 200), but loads authoritative goal rows for the signed-in
user (including ancestor links; accounts over 200 goals return 409). Client titles
and IDs are never used as authority. Categorization does not save data. Strict JSON is validated by
`Arc90Brain.validateResponse`; no code-fence stripping. Malformed JSON or schema
gets one retry. The Edge function also requires every nonempty excerpt to occur
verbatim in the submitted text, temporary IDs to be at most 100 characters, and
titles to be at most 200 characters. Each model call has a 12-second timeout and the request is bounded.
Quota is consumed once per categorization, including model failures; it resets at
UTC midnight. CORS permits `https://arc90.vercel.app`, `capacitor://localhost`, and
HTTP(S) localhost/127.0.0.1 with optional port. No wildcard or credential cookies.

API reference: [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/brain-dump.js'), 'utf8');
const start = source.indexOf('function brainEnsureCloudAnchor()');
const end = source.indexOf("document.addEventListener('input'", start);
assert.ok(start >= 0 && end > start);

const dumps = Array.from({ length: 101 }, (_, i) => ({ id: `dump-${i}`, raw_text: 'Review my week', status: 'sorted', items: [] }));
const S = { brain: { drafts: dumps, goals: [{ id: 'goal-1', title: 'Finish school', horizon: 'long', status: 'active' }], dirty: true }, habits: [], tasks: [] };
const context = {
  S, TextEncoder, AbortSignal, brainBusy: false, brainMessage: '', tab: 'brain',
  render() {}, brainPersist() {},
  brainConnection: async () => ({ url: 'https://example.test', headers: {}, userId: 'user-1' }),
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const data = context.brainCloudData();
const batches = context.brainCloudBatches(data);
assert.equal(batches.slice(0, 3).flat().length, 101, 'all dumps are sent in bounded batches');
assert.ok(batches.every(batch => batch.length <= 50 && new TextEncoder().encode(JSON.stringify(batch)).length <= 800000));
assert.ok(batches.flat().every(payload => new TextEncoder().encode(JSON.stringify([payload])).length <= 220000));
assert.ok(batches.flat().every(payload => ['goals', 'habits', 'tasks'].every(key => payload[key].length <= 200)));
assert.ok(batches.flat().some(payload => payload.goals.length === 1), 'goals follow their source dumps');

let calls = 0;
context.fetch = async () => {
  calls += 1;
  if (calls === 1) S.brain.goals[0].title = 'Finish school with honors';
  return { ok: true };
};
(async () => {
  await context.brainSync();
  assert.equal(calls, batches.length);
  assert.equal(S.brain.dirty, true, 'an edit made while saving remains unsynced');
  assert.match(context.brainMessage, /newer edits/);

  await context.brainSync();
  assert.equal(S.brain.dirty, false, 'a retry backs up the latest edit');
  S.tasks = [{ id: 't1', title: 'Review cards', horizon: 'short', goal_id: 'goal-1', done: false, due: '2026-10-04T18:30' }];
  S.brain.deletedTaskIds = ['removed-task'];
  const snapshot = context.brainCloudData();
  assert.equal(snapshot.tasks[0].due, '2026-10-04');
  assert.equal(snapshot.taskStates[0].due_local, '2026-10-04T18:30');
  assert.equal(snapshot.taskStates[1].deleted, true);
  const requests = [];
  context.fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true }; };
  await context.brainSync();
  assert.ok(requests.some(r => r.url.endsWith('/save_brain_task_state') && r.body.states[0].due_local === '2026-10-04T18:30'));
  S.brain.dirty = true;
  context.fetch = async url => ({ ok: !url.endsWith('/save_brain_task_state') });
  await context.brainSync();
  assert.equal(S.brain.dirty, true, 'partial backup cannot claim success');
  assert.match(context.brainMessage, /incomplete/);

  context.brainAtomic = change => { change(); return true; };
  context.fetch = async url => ({ ok: true, json: async () => url.includes('/arc_tasks?') ? [
    { id: 't2', title: 'Evening review', due: '2026-10-04', due_local: '2026-10-04T18:30:00', deleted: false },
    { id: 'removed-task', title: 'Removed locally', deleted: false },
    { id: 'remote-deleted', title: 'Removed elsewhere', deleted: true },
  ] : [] });
  S.tasks.push({ id: 'remote-deleted', title: 'Old copy' });
  await context.brainSync(true);
  assert.equal(S.tasks.find(t => t.id === 't2').due, '2026-10-04T18:30');
  assert.equal(S.tasks.some(t => ['removed-task', 'remote-deleted'].includes(t.id)), false, 'local and remote tombstones both survive load');
  assert.ok(S.brain.deletedTaskIds.includes('remote-deleted'));
  console.log('Brain cloud passed: batching, concurrent edits, complete deadlines, deletions, and partial-failure recovery.');
})().catch(error => { console.error(error); process.exitCode = 1; });

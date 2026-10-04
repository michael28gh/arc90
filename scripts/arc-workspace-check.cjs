const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const core = require('../js/brain-core.js');
const planning = require('../js/daily-planning.js');
const root = require('node:path').join(__dirname, '..');
const elements = {}, events = {}, notices = [];
let saves = 0, renders = 0;
const c = {
  crypto, structuredClone, TextEncoder, AbortSignal, console,
  Arc90Brain: core, Arc90Planning: planning,
  S: { brain: core.normalize(), tasks: [], habits: [], log: {}, planning: planning.normalize(), taskSeq: 0 },
  sheet: null, tab: 'progress', window: {}, navigator: {},
  document: { addEventListener(type, fn) { (events[type] ||= []).push(fn); }, getElementById(id) { return elements[id]; } },
  save() { saves++; }, render() { renders++; }, showNudge(message) { notices.push(message); },
  esc: value => String(value ?? '').replaceAll('<', '&lt;'),
  todayKey: () => '2026-10-01',
};
vm.createContext(c);
vm.runInContext(fs.readFileSync(root + '/js/daily-workspace.js', 'utf8'), c);
vm.runInContext(fs.readFileSync(root + '/js/brain-dump.js', 'utf8'), c);
const run = code => vm.runInContext(code, c);
const click = (prefix, action, id) => events.click.forEach(fn => fn({ target: { closest(selector) { return selector === `[data-${prefix}-act]` ? { dataset: { [prefix + 'Act']: action, id } } : null; } } }));
const field = (id, value) => { elements[id] = { value, validity: { badInput: false } }; };
const app = fs.readFileSync(root + '/js/app.js', 'utf8');
vm.runInContext(`function taskAction(action, id) { switch(action) { ${app.slice(app.indexOf("case 'task-add':"), app.indexOf("case 'feel-set':"))} } }`, c);
vm.runInContext(app.slice(app.indexOf('function fmtTaskDue('), app.indexOf('function journalStreak(')), c);

async function test() {
  click('brain', 'goal-new');
  field('brainGoalTitle', 'Become a nurse practitioner'); field('brainGoalHorizon', 'long'); field('brainGoalParent', '');
  click('brain', 'goal-save');
  const vision = c.S.brain.goals[0];
  assert.equal(vision.horizon, 'long');
  assert.equal(c.sheet, null);
  assert.equal(c.brainCloudData().dumps.length, 1, 'manual goals get a cloud-compatible source dump');
  assert.ok(c.brainCloudBatches(c.brainCloudData()).length);
  click('brain', 'goal-new');
  field('brainGoalTitle', 'Pass nursing boards'); field('brainGoalHorizon', 'mid'); field('brainGoalParent', vision.id);
  click('brain', 'goal-save');
  const goal = c.S.brain.goals[1];
  assert.equal(goal.parent_goal_id, vision.id);
  c.S.habits.push({ id: 'study', name: 'Study', goal_id: goal.id });
  click('brain', 'goal-edit', goal.id);
  field('brainGoalTitle', 'Pass the boards'); field('brainGoalHorizon', 'long'); field('brainGoalParent', '');
  click('brain', 'goal-save');
  assert.equal(goal.horizon, 'mid', 'cannot invalidate linked habits by changing horizon');
  field('brainGoalHorizon', 'mid'); field('brainGoalParent', vision.id);
  click('brain', 'goal-save');
  assert.equal(goal.title, 'Pass the boards');

  c.S.tasks.push({ id: 42, title: 'Finish a deck', horizon: 'short', done: false, due: '2026-10-03' });
  click('brain', 'link-task', '42'); click('brain', 'goal-new');
  field('brainGoalTitle', 'Complete pharmacology'); field('brainGoalHorizon', 'mid'); field('brainGoalParent', vision.id);
  click('brain', 'goal-save');
  assert.equal(c.sheet.type, 'brain-link', 'new goal returns to the original link picker');
  field('brainGoalPicker', c.sheet.selectedGoalId); click('brain', 'confirm-link');
  assert.equal(c.S.tasks[0].goal_id, c.S.brain.goals[2].id);

  click('planning', 'task-edit', '42');
  assert.match(c.planningTaskSheet(), /2026-10-03T09:00/, 'cloud date-only deadlines stay editable');
  field('editTaskTitle', 'Finish the first deck'); field('editTaskDue', '2026-10-04T12:00');
  click('planning', 'task-save', '42');
  assert.equal(c.S.tasks[0].title, 'Finish the first deck');
  assert.equal(c.S.tasks[0].due, '2026-10-04T12:00');
  assert.equal(c.sheet, null);
  c.S.tasks[0].notified = true;
  click('planning', 'task-edit', '42'); field('editTaskTitle', 'Only rename this task');
  click('planning', 'task-save', '42');
  assert.equal(c.S.tasks[0].notified, true, 'renaming cannot repeat an already delivered reminder');
  assert.equal(c.taskDeadline('2026-10-04').getDate(), 4, 'date-only deadline uses the local day');
  assert.equal(c.taskDeadline('2026-10-04').getHours(), 23);
  c.taskAction('task-toggle', '42'); assert.equal(c.S.tasks[0].done, true);
  c.taskAction('task-toggle', '42'); assert.equal(c.S.tasks[0].done, false);
  const goodSave = c.save;
  c.S.brain.dirty = false;
  click('planning', 'task-edit', '42'); field('editTaskTitle', 'Unsaved change');
  const before = JSON.stringify(c.S);
  c.save = () => { throw new Error('Storage full'); };
  click('planning', 'task-save', '42');
  assert.equal(JSON.stringify(c.S), before, 'failed task save rolls back values and sync state');
  assert.equal(c.sheet.type, 'planning-task');
  c.save = goodSave;
  c.S.tasks.push({ id: 'delete-me', title: 'Delete sample task' });
  c.taskAction('task-del', 'delete-me');
  assert.equal(c.S.tasks.some(t => t.id === 'delete-me'), false);
  assert.ok(c.S.brain.deletedTaskIds.includes('delete-me'));
  assert.ok(core.normalize(c.S.brain).deletedTaskIds.includes('delete-me'), 'deletion markers survive reload');

  c.sheet = null;
  let draft = c.brainNewDraft(); draft.raw_text = 'Finish my deck\nReview ten questions';
  await c.brainSort(true);
  assert.equal(draft.items.length, 2);
  assert.notEqual(draft.items[0].horizon, 'unsorted', 'manual review starts from on-device guesses');
  draft.items[0].horizon = 'unsorted'; c.brainCommitReview(); assert.equal(draft.status, 'draft', 'an unsorted item still blocks saving');
  draft.items.forEach(item => { item.horizon = 'short'; item.parent_goal_id = goal.id; });
  c.brainCommitReview();
  assert.equal(draft.status, 'sorted');
  const count = c.S.tasks.length; c.brainCommitReview(); assert.equal(c.S.tasks.length, count, 'save is idempotent');

  let release;
  c.brainConnection = async () => ({ url: 'https://test.invalid', headers: {} });
  c.fetch = () => new Promise(resolve => { release = resolve; });
  draft = c.brainNewDraft(); draft.raw_text = 'Plan the week';
  let work = c.brainSort(); await new Promise(setImmediate);
  const other = c.brainNewDraft(); other.raw_text = 'A separate capture';
  release({ ok: true, json: async () => ({ items: [{ temp_id: '1', title: 'Plan the week', type: 'task', horizon: 'short', parent_temp_id: null, parent_goal_id: null, frequency: null, confidence: .9, excerpt: 'Plan the week' }] }) });
  await work;
  assert.equal(c.brainDraft(), other);
  assert.equal(other.items.length, 0, 'AI results never overwrite the newly opened capture');
  assert.equal(draft.items.length, 1);
  assert.equal(run('brainStage'), 'dump');
  work = c.brainSort(); await new Promise(setImmediate);
  other.raw_text = 'Changed during sorting'; const renderCount = renders;
  release({ ok: false }); await work;
  assert.equal(other.items.length, 0, 'stale sort cannot overwrite newer text');
  assert.equal(run('brainBusy'), false);
  assert.ok(renders > renderCount, 'controls re-enable after discarded sort');
  assert.ok(saves > 0);
  c.S.brain.drafts = [];
  c.brainEnsureCloudAnchor();
  assert.equal(c.brainCloudData().dumps.length, 1, 'onboarding goals can be backed up without a reviewed capture');
  console.log('Arc workspace: goal creation/editing/linking, cloud payloads, task editing/rollback, manual review and async races passed.');
}
test().catch(error => { console.error(error); process.exitCode = 1; });

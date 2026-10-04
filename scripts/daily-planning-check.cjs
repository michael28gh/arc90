const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const P = require('../js/daily-planning.js');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const workspace = fs.readFileSync(path.join(__dirname, '../js/daily-workspace.js'), 'utf8');
const json = (x) => JSON.parse(JSON.stringify(x));
function between(first, last) {
  const start = source.indexOf(first), end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start, first);
  return source.slice(start, end);
}
const p = { key: 'habit:1', kind: 'habit', id: '1', title: 'Read a page' };
assert.deepEqual(P.normalize(null), P.normalize([]));
assert.deepEqual(P.normalize({ days: [], ideas: 'bad', responses: 2 }), P.normalize());
assert.equal(P.validDate('2026-02-30'), false);
assert.equal(P.nextDate('2026-12-31'), '2027-01-01');
assert.equal(P.nextDate('2026-03-08'), '2026-03-09');
assert.equal(P.nextDate('2026-11-01'), '2026-11-02');
assert.equal(P.weekStart('2026-09-27'), '2026-09-21');
assert.throws(() => P.nextDate('bad'));
const capped = P.normalize({ days: { '2026-09-28': { morning: { priorities: [p, p, ...[2, 3, 4].map((id) => ({ ...p, key: 'habit:' + id, id }))] } } } });
assert.equal(capped.days['2026-09-28'].morning.priorities.length, 3);
const plan = P.normalize();
P.routePriority(plan, '2026-09-28', p, 'tomorrow');
P.routePriority(plan, '2026-09-28', p, 'tomorrow');
assert.equal(plan.carry['2026-09-29'].length, 1);
P.routePriority(plan, '2026-09-28', p, 'smaller', 'Read a sentence');
assert.equal(plan.carry['2026-09-29'][0].title, 'Read a sentence');
assert.throws(() => P.routePriority(plan, '2026-09-28', p, 'smaller', ''));
P.routePriority(plan, '2026-09-28', { ...p, key: 'habit:2', id: '2' }, 'tomorrow');
P.routePriority(plan, '2026-09-28', p, 'drop');
assert.equal(plan.carry['2026-09-29'].length, 1);
assert.equal(plan.carry['2026-09-29'][0].id, '2');
P.rememberResponse(plan, '  Low   ENERGY ', 'Read sitting down');
assert.equal(plan.responses['low energy'].response, 'Read sitting down');
assert.throws(() => P.rememberResponse(plan, '__proto__', 'no'));
P.addIdeas(plan, '  First idea\n\n<script>alert(1)</script>\r\n Last idea  ');
assert.equal(plan.ideas.length, 3);
assert.equal(plan.ideas[2].title, 'Last idea');
assert.throws(() => P.addIdeas(plan, 'x'.repeat(201)));
assert.throws(() => P.addIdeas(plan, Array(51).fill('line').join('\n')));
assert.deepEqual(P.normalize(json(plan)), plan);

const listeners = {}, elements = {}, notices = [];
let persisted = '', exported = '';
const c = {
  Arc90Planning: P, Arc90DaySupport: require('../js/day-support.js'), Arc90Brain: require('../js/brain-core.js'),
  normalizeFocusState: (x) => x, inferDoseSlot: () => 'morning',
  todayKey: () => c.currentDate, currentDate: '2026-09-28',
  document: { addEventListener: (event, callback) => { (listeners[event] ||= []).push(callback); }, getElementById: (id) => elements[id] || null },
  localStorage: { getItem: () => persisted, setItem: (_key, value) => { persisted = value; } },
  captureTodaySchedule() {}, render() {},
  showNudge: (message) => notices.push(message),
  scheduledFor: () => true,
  esc: (text) => String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  practiceDate: null, practiceSaveFailed: false, tab: 'today',
  ICONS: {}, taskRow: () => '', brandbar: () => '',
  confirm: () => true, ob: null, sheet: null, protoOpen: null, protoAddOpen: false, protoUrgent: false,
  download: (_name, text) => { exported = text; },
};
vm.createContext(c);
vm.runInContext(between('const KEY =', 'let S = load();'), c);
vm.runInContext(between('function load()', 'function captureTodaySchedule()'), c);
vm.runInContext(between('function dlog(k)', 'function setStatus('), c);
vm.runInContext(between('const JOURNAL_PROMPTS =', 'function meditationPanel()'), c);
vm.runInContext(workspace, c);
const run = (code) => vm.runInContext(code, c);
c.S = c.normalizeState({ onboarded: true, profile: { name: 'QA', start: '2026-09-01' },
  tasks: [{ id: 't1', title: 'Existing task', done: true }], taskSeq: 0,
  habits: [{ id: 1, name: 'Read a page' }, { id: 2, name: 'Walk' }, { id: 3, name: 'Stretch' }, { id: 4, name: 'Work' }],
  journal: { '2026-09-28': 'QA legacy reflection: protect one quiet hour and leave room for rest.', '2026-09-01': 'Old words\nunchanged.' },
  practices: { '2026-09-01': { prompt: 'Original prompt', gratitude: 'Legacy only' } },
  log: { '2026-09-28': { intention: 'QA: Finish one meaningful page.', done: [1], min: [], skip: [] }, '2026-09-01': [2] },
});
c.S = c.normalizeState(json(c.S));
const legacy = JSON.stringify({ journal: c.S.journal, practices: c.S.practices, log: c.S.log });
const originalTasks = JSON.stringify(c.S.tasks);
assert.equal(c.planningDraft('morning', c.currentDate).win, 'QA: Finish one meaningful page.');
assert.equal(c.savePlanningMorning(c.currentDate), false, 'explicit validation does not hide console');
Object.assign(c.planningDraft('morning', c.currentDate), { feeling: 'Steady', win: 'One meaningful page', priorities: [p] });
assert.equal(c.savePlanningMorning(c.currentDate), true);
assert.match(c.morningConsole(c.currentDate), /Reopen morning/);
assert.doesNotMatch(c.morningConsole(c.currentDate), /id="morningWin"/);
const day = c.currentDate;
c.S = c.load();
assert.equal(c.S.planning.days[day].morning.win, 'One meaningful page', 'reload preserves explicit save');
assert.match(c.morningConsole(day), /Morning saved/);
c.S.habits = [];
assert.match(c.planningNight(day), /Read a page/, 'removed source retains name');
assert.match(c.planningNight(day), /Habit log on 2026-09-28: complete/, 'numeric legacy IDs match snapshot string IDs');
Object.assign(c.planningDraft('night', day), { feeling: 'Low energy', helped: 'Short breaks', friction: 'Low energy', response: 'Read sitting down', remember: false,
  outcomes: { 'habit:1': { status: 'partial', next: 'tomorrow' } } });
assert.equal(c.savePlanningNight(day), true);
assert.equal(c.savePlanningNight(day), true);
assert.equal(c.S.planning.carry['2026-09-29'].length, 1);
assert.equal(Object.keys(c.S.planning.responses).length, 0, 'response memory requires explicit choice');
const night = c.planningDraft('night', day);
night.remember = true;
night.outcomes[p.key] = { status: 'partial', next: 'smaller', smaller: 'One sentence' };
assert.equal(c.savePlanningNight(day), true);
assert.equal(c.S.planning.carry['2026-09-29'][0].title, 'One sentence');
assert.match(c.planningRemembered(' LOW  ENERGY '), /Read sitting down/);
assert.equal(c.S.planning.days[day].morning.priorities[0].title, 'Read a page');
assert.equal(JSON.stringify(c.S.tasks), originalTasks, 'night never changes task completions or creates overdue tasks');
assert.equal(JSON.stringify({ journal: c.S.journal, practices: c.S.practices, log: c.S.log }), legacy);
const weekly = P.weekly(c.S.planning, day);
assert.equal(weekly.accomplishments[0].title, 'Read a page');
assert.equal(weekly.accomplishments[0].status, 'partial');
assert.equal(weekly.obstacles[0].count, 1);
assert.equal(weekly.helpful[0].text, 'Short breaks');
c.currentDate = '2026-09-29';
assert.equal(c.planningOptions(c.currentDate)[0].title, 'One sentence');
assert.match(c.planningNight(day), /Habit log on 2026-09-28: complete/);
assert.doesNotMatch(c.planningNight(c.currentDate), /Habit log on 2026-09-28/);
assert.equal(c.planningDraft('morning', c.currentDate).priorities.length, 0, 'carry is available, not committed automatically');
Object.assign(c.planningDraft('night', c.currentDate), { feeling: 'Steady', helped: 'Rest' });
assert.equal(c.savePlanningNight(c.currentDate), true, 'night works without morning');
assert.equal(c.S.planning.days[c.currentDate].morning, undefined);
c.currentDate = '2026-09-30';
assert.equal(c.planningOptions(c.currentDate).length, 0, 'no automatic overdue carry pile');
P.addIdeas(c.S.planning, '<img src=x onerror=alert(1)>\nA useful task');
assert.equal(c.S.tasks.length, 1, 'brain dump is not a commitment');
assert.match(c.planningIdeas(), /&lt;img/);
assert.doesNotMatch(c.planningIdeas(), /<img/);
run('selectedIdeas.add(2)');
assert.equal(c.convertPlanningIdeas(), true);
assert.equal(c.S.tasks.length, 2);
assert.equal(c.S.tasks[1].title, 'A useful task');
assert.equal(c.S.tasks[1].due, '');
assert.equal(c.S.tasks[1].remind, false);
assert.notEqual(c.S.tasks[1].id, 't1', 'imported task ID cannot collide');
run('selectedIdeas.add(2)');
assert.equal(c.convertPlanningIdeas(), false, 'repeated conversion is idempotent');
const convertedTask = c.S.tasks.pop();
assert.match(c.planningIdeas(), /Return to idea/, 'deleted task offers explicit recovery, not silent recreation');
listeners.click[0]({ target: { closest: () => ({ dataset: { planningAct: 'idea-reopen', id: '2' } }) } });
c.S.taskSeq = Infinity;
run('selectedIdeas.add(2)');
assert.equal(c.convertPlanningIdeas(), true);
assert.ok(Number.isSafeInteger(c.S.taskSeq));
assert.equal(c.S.tasks.length, 2);
assert.equal(c.normalizeState({ taskSeq: Infinity }).taskSeq, 0);
const savedPlan = JSON.stringify(c.S.planning);
const realSave = c.save;
c.save = () => { throw new Error('Storage full'); };
Object.assign(c.planningDraft('morning', c.currentDate), { feeling: 'Steady', win: 'Keep this draft' });
assert.equal(c.savePlanningMorning(c.currentDate), false);
assert.equal(JSON.stringify(c.S.planning), savedPlan);
assert.equal(c.planningDraft('morning', c.currentDate).win, 'Keep this draft');
assert.match(c.morningConsole(c.currentDate), /id="morningWin"/);
c.save = realSave;
c.practiceDate = '2026-09-01';
assert.match(c.dailyPracticePanel(), /Original prompt/);
assert.match(c.dailyPracticePanel(), /Old words\nunchanged/);
assert.doesNotMatch(c.dailyPracticePanel(), /Legacy only/, 'gratitude stays preserved, not reintroduced');
assert.match(c.planningJournal(), /2026-09-01/);

vm.runInContext(between('async function exportData()', 'function compactText('), c);
vm.runInContext(between('async function importDataFile(', 'function exportWeeklyReport('), c);
(async () => {
  c.S.planning.weeks['2026-09-28'] = { change: 'Start smaller next week' };
  const expected = json(c.S.planning);
  await c.exportData();
  assert.deepEqual(JSON.parse(exported).planning, expected);
  c.S.planning = P.normalize();
  await c.importDataFile({ text: async () => exported });
  assert.deepEqual(json(c.S.planning), expected, 'real export/restore retains all planning fields');
  assert.equal(c.practiceDate, null, 'restore resets transient date and drafts');
  assert.equal(JSON.stringify({ journal: c.S.journal, practices: c.S.practices, log: c.S.log }), legacy);
  c.S = c.load();
  assert.deepEqual(json(c.S.planning), expected, 'restored state survives reload');
  assert.match(c.planningRemembered('Low energy'), /Read sitting down/);
  c.resetPlanningWorkspace();
  Object.assign(c.planningDraft('morning', day), { feeling: 'Steady', win: 'Recover this draft', priorities: [p] });
  c.planningDraft('night', day);
  assert.equal(c.persistPlanningDrafts('morning', day), true);
  assert.equal(c.S.planning.drafts.night[day], undefined, 'saving morning must not create an untouched night draft');
  c.S = c.load(); c.resetPlanningWorkspace();
  assert.equal(c.planningDraft('morning', day).win, 'Recover this draft');
  assert.equal(c.savePlanningMorning(day), true);
  assert.equal(c.S.planning.drafts.morning[day], undefined);
  c.S.habits = [{ id: 1, name: 'Read a page' }];
  c.S.tasks = [{ id: 'night-task', title: 'Task', done: false }];
  delete c.S.planning.days[day].night;
  c.S.planning.days[day].morning.priorities.push({ key: 'task:night-task', kind: 'task', id: 'night-task', title: 'Task' });
  Object.assign(c.planningDraft('night', day), { feeling: 'Steady', outcomes: { 'habit:1': { status: 'partial', next: 'drop' }, 'task:night-task': { status: 'completed' } } });
  assert.equal(c.savePlanningNight(day), true);
  assert.equal(c.S.tasks[0].done, true);
  assert.deepEqual(json(c.S.log[day].min), [1]);
  assert.equal(c.S.log[day].done.includes(1), false);
  c.S.tasks[0].done = false;
  c.S.log[day].done = [1]; c.S.log[day].min = [];
  c.planningDraft('night', day).reflection = 'Only changing my reflection';
  assert.equal(c.savePlanningNight(day), true);
  assert.equal(c.S.tasks[0].done, false, 'reflection-only edits preserve newer task state');
  assert.deepEqual(json(c.S.log[day].done), [1], 'reflection-only edits preserve newer habit state');
  c.planningDraft('night', day).remember = true;
  assert.equal(c.persistPlanningDrafts('night', day), true);
  c.S = c.load(); c.resetPlanningWorkspace();
  assert.equal(c.planningDraft('night', day).remember, true, 'remember checkbox survives draft recovery');
  const oldDate = '2026-09-20';
  Object.assign(c.planningDraft('morning', oldDate), { feeling: 'Steady', win: 'Yesterday draft', priorities: [] });
  assert.equal(c.persistPlanningDrafts('morning', oldDate), true);
  assert.match(c.morningConsole(oldDate), /Yesterday draft/, 'past unsubmitted morning drafts remain recoverable');
  c.localStorage.setItem = () => { throw new Error('Full storage'); };
  const beforeFailure = JSON.stringify(c.S);
  c.planningDraft('night', day).outcomes['habit:1'] = { status: 'completed' };
  assert.equal(c.savePlanningNight(day), false);
  assert.equal(JSON.stringify(c.S), beforeFailure, 'failed night save rolls back habit and task records');
  console.log('Daily planning passed: normalization, dates/DST, snapshots, explicit save/reload, carry idempotency, selected tasks, legacy writing, storage rollback, weekly evidence, actual export/restore.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

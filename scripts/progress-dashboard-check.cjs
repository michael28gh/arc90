const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/progress-dashboard.js'), 'utf8');
const habits = [
  { id: 'h1', life_area: 'health' },
  { id: 'h2', life_area: 'money' },
];
const context = {
  document: { addEventListener() {} },
  S: { habits, log: {} },
  LIFE_AREAS: { health: 'Health', money: 'Money' },
  habitPurpose: () => [],
  scheduledFor: () => true,
  statusOf: () => null,
  isCompleted: (id, date) => id === 'h1' && date === '2026-09-29',
  esc: value => String(value),
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'progress-dashboard.js' });

assert.equal(context.dashboardFeelScore({ feels: {} }), null);
assert.equal(new Set(context.dashboardStats([]).weekday.map(day => day.label)).size, 7, 'weekday labels must distinguish Tuesday/Thursday and Saturday/Sunday');
assert.equal(context.dashboardFeelScore({ feels: { h1: 'energized', h2: 'drained' } }), 3);
assert.equal(context.dashboardFeelScore({ feels: { h1: 'unknown' } }), null);
const rows = [{ key: '2026-09-29', inArc: true }, { key: '2026-09-30', inArc: true }];
const areas = context.dashboardAreaScores(rows);
assert.equal(areas.find(item => item.area === 'health').rate, .5);
assert.equal(areas.find(item => item.area === 'money').rate, 0);
assert.match(context.dashboardLine([{ key: 'a', pct: 0 }, { key: 'b', pct: .5 }], 'pct'), /2026|0%|a: 0%/);
assert.match(context.dashboardRadar(areas, areas), /role="img"/);
assert.doesNotMatch(context.dashboardRadar([{ area: 'health', planned: 0 }, { area: 'money', planned: 0 }], []), /<p>/,
  'the empty radar must not repeat the card insight');
context.Arc90Insights = { generate: () => [] };
const insight = context.dashboardInsights([], [], {
  known: [{ planned: 2 }, { planned: 3 }, { planned: 2 }],
  weekday: [{ label: 'Mon', due: 2, done: 1, rate: .5 }, { label: 'Tue', due: 3, done: 3, rate: 1 }],
  hours: Array(24).fill(0),
}, []);
assert.match(insight, /Tue was your strongest day: 3 of 3 planned reps/,
  'insights should use recorded activity before showing a waiting state');
context.todayKey = () => '2026-09-02';
context.startDate = () => new Date('2026-09-01T12:00:00Z');
context.addDays = (date, days) => new Date(date.getTime() + days * 86400000);
context.dkey = date => date.toISOString().slice(0, 10);
context.S.log['2026-09-01'] = { scheduledIds: ['h1', 'removed'], done: ['h1', 'removed'], min: [], skip: [], feels: {}, completionHours: {} };
context.dlog = key => context.S.log[key] || { done: [], min: [], skip: [], feels: {}, completionHours: {} };
const historical = context.dashboardDay(new Date('2026-09-01T12:00:00Z'));
assert.equal(historical.planned, 2, 'past planned count uses the saved schedule, including removed habits');
assert.equal(historical.completed, 2, 'past completions survive removal from the current habit list');
assert.equal(context.dashboardHabitDue(habits[1], '2026-09-01'), false, 'new habits are not due in a saved historical schedule');
context.S.habits = [];
assert.equal(context.dashboardDay(new Date('2026-09-02T12:00:00Z')).planned, 0, 'empty first-day logs render without arrays');
context.dashboardDay = () => ({ planned: 1, completed: 0, pct: 0 });
const heatmap = context.dashboardHeatmap([]);
assert.equal((heatmap.match(/class="pd-missed-dot"/g) || []).length, 1, 'only yesterday is missed; today and future dates are not');
console.log('Progress dashboard checks passed: feelings, life areas, saved schedules, zero data, radar.');
context.dayNumber = () => 10;
context.historicalRateFor = key => context.S.log[key].rate;
context.S.log = {};
for (let i = 0; i < 10; i++) {
  const current = context.dkey(context.addDays(context.startDate(), i));
  const previous = context.dkey(context.addDays(context.startDate(), i - 90));
  if (i < 9) context.S.log[current] = { scheduledIds: ['h1'], rate: i < 7 ? 1 : 0 };
  if (i < 7 || i === 9) context.S.log[previous] = { scheduledIds: ['h1'], rate: .5 };
}
const comparison = context.dashboardArcCompare();
assert.equal(comparison.current.length, 7);
assert.equal(comparison.previous.length, 7);
assert.equal(comparison.scores[0].value, 100);
assert.equal(comparison.scores[1].value, 50);
context.momentum = () => 42;
vm.runInContext("dashboardFocus = 'momentum'; dashboardFocusMode = 'table';", context);
const momentumDetail = context.dashboardFocusView([{ key: '2026-09-01' }, { key: '2026-09-02' }], {});
assert.match(momentumDetail, /Current momentum/);
assert.match(momentumDetail, /42 \/ 100/);
assert.doesNotMatch(momentumDetail, /2026-09-01 to 2026-09-02/);
console.log('Detail checks passed: matched cycle samples and current momentum table.');

// Arc-only spans and the day drill-down.
assert.deepEqual(context.dashboardSpan([{ key: 'a', inArc: false }, { key: 'b', inArc: true }]).map(r => r.key), ['b'], '90-day views ignore days before the arc');
assert.equal(context.dashboardSpan([{ key: 'a', inArc: false }]).length, 1, 'a span never comes back empty');
context.S.habits = [{ id: 'h1', name: 'Study' }, { id: 'h2', name: 'Run' }];
context.S.log = { '2026-09-01': { done: ['h1'], min: [], skip: [] } };
context.dlog = key => context.S.log[key] || { done: [], min: [], skip: [] };
context.todayKey = () => '2026-09-02';
context.isCompleted = (id, key) => (context.S.log[key]?.done || []).includes(id);
vm.runInContext("dashboardDayKey = '2026-09-01';", context);
const detail = context.dashboardDayDetail([{ key: '2026-09-01', planned: 2, completed: 1, inArc: true }]);
assert.match(detail, /1 of 2 reps/);
assert.match(detail, /Study<\/span><b>Kept/);
assert.match(detail, /Run<\/span><b>Missed/);
vm.runInContext("dashboardDayKey = '';", context);
assert.match(context.dashboardDayDetail([{ key: '2026-09-01', planned: 2, completed: 1 }]), /Tap a day/);
console.log('Drill-down checks passed: arc-only spans and per-day habit states.');

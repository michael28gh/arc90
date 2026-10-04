const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing source section: ${from}`);
  return source.slice(start, end);
}
const keys = Array.from({ length: 8 }, (_, i) => `2026-09-${12 + i}`);
let habits = [{ id: 'read', name: 'Read', min: 'One page' }];
let log = {};
let rest = false;
const context = {
  S: { habits },
  todayKey: () => keys.at(-1), recentKeys: () => keys,
  statusOf: (id, key) => log[key]?.[id] || null,
  scheduledFor: () => !rest,
  actionable: () => habits,
  momentum: () => 0, dayStreak: () => 0, dayNumber: () => 8,
  esc: text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  strongestHabit: () => ({ habit: habits[0], rate: 0 }),
  weakestHabit: () => ({ habit: habits[0], rate: 0 }),
  currentTip: () => ({ icon: '', title: 'Small steps', body: '' }),
  tipTarget: () => habits[0], renderTipBody: () => '',
};
vm.createContext(context);
vm.runInContext(section('function habitRateForKeys(', 'function weeklyReviewData()'), context);
if (source.includes('function guidanceHabitPattern()')) {
  vm.runInContext(section('function guidanceHabitPattern()', 'function coachOverviewCard()'), context);
}
vm.runInContext(section('function coachOverviewCard()', 'function viewCoach()'), context);
vm.runInContext(section('function guidanceSignalCard()', 'function weeklyAiReviewCard()'), context);
assert.doesNotMatch(context.guidanceSignalCard(), /Move Read after read/i, 'A habit must never be its own anchor');
assert.doesNotMatch(context.coachOverviewCard(), /most reliable rep|weak point|At risk|willpower/);
assert.match(context.coachOverviewCard(), /Building your baseline/);
assert.doesNotMatch(context.coachPrompts(), /keep missing/);
vm.runInContext(section('function weeklyCoachReview()', 'function healthDay('), context);
assert.doesNotMatch(context.weeklyCoachReview().summary, /reset week|0\/0|excellent/);
assert.match(context.weeklyCoachReview().summary, /still taking shape/);

function setHabits(next) { habits = next; context.S.habits = next; }
const read = habits[0];
const train = { id: 'train', name: 'Train', min: 'Two minutes' };
setHabits([read, train]);
log = { [keys.at(-1)]: { read: 'done', train: 'min' } };
assert.equal(context.guidanceHabitPattern().ready, false, 'Today cannot establish a historical baseline');
assert.equal(context.guidanceHabitPattern().loggedDays, 0);
for (const key of keys.slice(0, 2)) log[key] = { read: 'done' };
assert.equal(context.guidanceHabitPattern().ready, false);
for (const key of keys.slice(0, 7)) log[key] = { read: 'done' };
log[keys[0]].train = 'min';
const before = JSON.stringify({ habits, log });
const pattern = context.guidanceHabitPattern();
assert.equal(pattern.ready, true);
assert.equal(pattern.anchor.habit.id, 'read');
assert.equal(pattern.anchor.stats.hit, 7);
assert.equal(pattern.focus.habit.id, 'train');
assert.equal(pattern.focus.stats.hit, 1, 'A minimum version counts as a check-in');
assert.match(context.guidanceSignalCard(), /Train.*after.*Read/);
assert.match(context.coachOverviewCard(), /7 of 7/);
assert.match(context.guidancePlaybookAnswer({ id: 'priority' }), /Read.*Train/);
assert.equal(JSON.stringify({ habits, log }), before, 'Suggestions must not alter tracking history');

setHabits([read]);
assert.equal(context.guidanceHabitPattern().focus, null);
assert.doesNotMatch(context.guidanceSignalCard(), /Read.*after.*Read/);
assert.doesNotMatch(context.guidancePlaybookAnswer({ id: 'priority' }), /Read.*after.*Read/);
setHabits([read, train]);
for (const key of keys.slice(0, 7)) log[key] = { read: 'min', train: 'done' };
assert.equal(context.guidanceHabitPattern().focus, null, 'Equal strong habits are not weaknesses');
assert.doesNotMatch(context.coachOverviewCard(), /weak point|needs a smaller/);
for (const key of keys.slice(0, 7)) log[key] = { read: 'skip', train: 'skip' };
assert.equal(context.guidanceHabitPattern().anchor, null, 'Rest days are not successful habit evidence');
assert.equal(context.guidanceHabitPattern().focus, null, 'Rest days are not misses');
rest = true; log = {};
assert.equal(context.guidanceHabitPattern().anchor, null, 'Never-scheduled habits cannot be anchors');
rest = false;
setHabits([]);
assert.equal(context.guidanceHabitPattern().target, null);
assert.match(context.guidanceSignalCard(), /Choose one habit/);
assert.equal(context.weeklyCoachReview().focus, 'Choose one habit');

vm.runInContext(section('function guidancePlaybookAnswer(', 'function viewCoach()'), context);
for (const id of ['behind', 'priority', 'toomuch', 'easier']) {
  assert.doesNotMatch(context.guidancePlaybookAnswer({ id }), /undefined|null|\{weak|\{strong/);
}
setHabits([{ id: 'unsafe', name: '<img onerror="alert(1)">', min: '<script>bad</script>' }]);
const safe = context.guidanceSignalCard() + context.coachOverviewCard() + context.guidancePlaybookAnswer({ id: 'priority' });
assert.doesNotMatch(safe, /<img|<script>/);
assert.match(safe, /&lt;img/);
console.log('Guidance checks passed: no self-stacking, baseline gating, completed-day evidence, ties, rest, empty states and escaped names.');

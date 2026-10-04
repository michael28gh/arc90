const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const api = require('../js/adaptive-day.js');
const { modeForDay, targetForHabit, bestWindow, chooseNextMove, recommendMode, countRecentDifficultDays } = api;
const source = fs.readFileSync(path.join(__dirname, '../js/adaptive-day.js'), 'utf8');
const browser = { window: {} };
vm.runInNewContext(source, browser);
assert.deepEqual(Object.keys(browser.window.Arc90Adaptive), Object.keys(api));
assert.equal(browser.window.Arc90Adaptive.modeForDay(null, '2026-09-08'), 'full');
const both = { window: {}, module: { exports: {} } };
vm.runInNewContext(source, both);
assert.equal(both.window.Arc90Adaptive, both.module.exports);

const date = '2026-09-08';
for (const mode of ['full', 'busy', 'recovery']) {
  const plan = Object.freeze({ date, mode });
  assert.equal(modeForDay(plan, date), mode);
  assert.equal(modeForDay(plan, '2026-09-09'), 'full');
  assert.equal(modeForDay(plan, '2026-09-07'), 'full');
}
for (const plan of [null, undefined, false, 4, 'busy', {}, { date, mode: 'other' }]) {
  assert.equal(modeForDay(plan, date), 'full');
}
const habit = Object.freeze({ id: 7, name: 'Read 20 pages', min: '  Read 1 page  ' });
const essentials = Object.freeze(['7']);
const full = { label: habit.name, status: 'done', optional: false };
const min = { label: 'Read 1 page', status: 'min', optional: false };
assert.deepEqual(targetForHabit(habit, 'full', essentials), full);
assert.deepEqual(targetForHabit(habit, 'busy', []), min);
assert.deepEqual(targetForHabit(habit, 'recovery', essentials), min);
assert.deepEqual(targetForHabit(habit, 'recovery', Object.freeze([7])), min);
assert.deepEqual(targetForHabit(Object.freeze({ ...habit, id: '7' }), 'recovery', [7]), min);
assert.deepEqual(targetForHabit(habit, 'recovery', ['8']), { ...min, optional: true });
assert.deepEqual(targetForHabit(habit, 'unknown', essentials), full);
for (const value of [undefined, null, '', ' \t ', 2, {}]) {
  const h = Object.freeze({ ...habit, min: value });
  assert.deepEqual(targetForHabit(h, 'busy'), full);
  assert.deepEqual(targetForHabit(h, 'recovery', null), { ...full, optional: true });
}
for (const h of [null, undefined, false, 'bad', {}]) {
  assert.deepEqual(targetForHabit(h, 'full'), { label: '', status: 'done', optional: false });
}

const samples = hours => hours.map((hour, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, hour }));
const base = samples([9, 10, 11, 9, 0, 23]);
const expected = { startHour: 9, endHour: 12, days: 4, totalDays: 6 };
assert.deepEqual(bestWindow(base), expected);
for (const bad of [null, undefined, {}, 'bad', 7, []]) assert.equal(bestWindow(bad), null);
assert.equal(bestWindow(samples([9, 9, 9, 9, 9])), null);
assert.equal(bestWindow(samples([9, 9, 9, 0, 3, 6])), null);
assert.equal(bestWindow(samples([9, 9, 9, 0, 0, 0])), null);
assert.equal(bestWindow(samples([9, 9, 9, 9, 0, 3, 6])), null);
assert.deepEqual(bestWindow(samples([9, 9, 9, 9, 9, 9, 0, 3, 6, 12])),
  { startHour: 9, endHour: 12, days: 6, totalDays: 10 });
assert.deepEqual(bestWindow(samples([21, 22, 23, 21, 0, 3])),
  { startHour: 21, endHour: 24, days: 4, totalDays: 6 });
assert.deepEqual(bestWindow(samples([0, 1, 2, 0, 3, 23])),
  { startHour: 0, endHour: 3, days: 4, totalDays: 6 });
assert.deepEqual(bestWindow([...base, ...base, { date: base[0].date, hour: 11 }]), expected);
assert.equal(bestWindow([...base, { date: base[0].date, hour: 12 }, base[0]]), null);
assert.deepEqual(bestWindow([...base, { date: '2026-02-01', hour: 0 },
  { date: '2026-02-01', hour: 3 }, { date: '2026-02-01', hour: 0 }]), expected);

const invalidDates = ['2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01',
  '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', '26-01-01',
  '2026-01-01T00:00:00Z', '2026-01-01\n', '', null, 20260101];
const malformed = [null, undefined, {}, false, 'bad', ...invalidDates.map(date => ({ date, hour: 0 })),
  ...[-1, 24, 1.5, '9', null, undefined, NaN, Infinity].map(hour => ({ date: base[0].date, hour }))];
assert.deepEqual(bestWindow([...base, ...malformed]), expected);
for (const date of ['2024-02-29', '2000-02-29', '0096-02-29', '2026-04-30']) {
  assert.deepEqual(bestWindow([...base.slice(0, 5), { date, hour: 23 }]), expected);
}
const frozen = Object.freeze(base.map(sample => Object.freeze({ ...sample })));
const before = JSON.stringify({ habit, essentials, frozen });
assert.deepEqual(bestWindow(frozen), expected);
targetForHabit(habit, 'recovery', essentials);
assert.equal(JSON.stringify({ habit, essentials, frozen }), before);

const moves = Object.freeze([
  Object.freeze({ id: 'first', done: false, optional: false, picked: false, inWindow: false }),
  Object.freeze({ id: 'window', done: false, optional: false, picked: false, inWindow: true }),
  Object.freeze({ id: 'pick', done: false, optional: false, picked: true, inWindow: false }),
  Object.freeze({ id: 'done', done: true, optional: false, picked: true, inWindow: true }),
  Object.freeze({ id: 'optional', done: false, optional: true, picked: true, inWindow: true }),
  Object.freeze({ id: 'skipped', done: false, skipped: true, optional: false, picked: true, inWindow: true }),
]);
assert.equal(chooseNextMove(moves, true).id, 'optional');
assert.equal(chooseNextMove(moves, false).id, 'pick');
assert.equal(chooseNextMove(moves.slice(0, 2), true).id, 'window');
assert.equal(chooseNextMove([moves[0]], true).id, 'first');
assert.equal(chooseNextMove([moves[3]], true), null);
assert.equal(chooseNextMove([moves[5]], true), null);
assert.equal(chooseNextMove([moves[4]], false), null);
for (const value of [null, undefined, false, {}, 'bad']) assert.equal(chooseNextMove(value), null);
assert.equal(JSON.stringify(moves), JSON.stringify([
  { id: 'first', done: false, optional: false, picked: false, inWindow: false },
  { id: 'window', done: false, optional: false, picked: false, inWindow: true },
  { id: 'pick', done: false, optional: false, picked: true, inWindow: false },
  { id: 'done', done: true, optional: false, picked: true, inWindow: true },
  { id: 'optional', done: false, optional: true, picked: true, inWindow: true },
  { id: 'skipped', done: false, skipped: true, optional: false, picked: true, inWindow: true },
]));

const covered = { readinessCount: 2, coreSignals: 1 };
assert.deepEqual(recommendMode({ ...covered, readiness: 45, recentMisses: 0 }), {
  mode: 'recovery', reason: 'Readiness is 45. Protect one essential and recover.'
});
assert.equal(recommendMode({ ...covered, readiness: 46 }).mode, 'busy');
assert.equal(recommendMode({ ...covered, readiness: 68 }).mode, 'busy');
assert.equal(recommendMode({ ...covered, readiness: 69 }).mode, 'full');
assert.equal(recommendMode({ ...covered, readiness: 95, recentMisses: 3 }).mode, 'recovery');
assert.equal(recommendMode({ ...covered, readiness: 95, recentMisses: 2 }).mode, 'busy');
assert.equal(recommendMode({ readiness: null, recentMisses: 0 }).mode, 'full');
for (const value of [undefined, null, {}, false, '45', NaN, Infinity]) {
  assert.equal(recommendMode({ ...covered, readiness: value }).mode, 'full');
}
assert.equal(recommendMode({ ...covered, readiness: -8 }).mode, 'recovery');
assert.equal(recommendMode({ ...covered, readiness: 120 }).mode, 'full');
assert.equal(recommendMode({ readiness: 20, readinessCount: 1, coreSignals: 1 }).mode, 'full');
assert.equal(recommendMode({ readiness: 20, readinessCount: 2, coreSignals: 0 }).mode, 'full');
assert.equal(recommendMode({ recentMisses: -1 }).mode, 'full');
assert.equal(recommendMode({ recentMisses: 2.5 }).mode, 'full');
assert.equal(countRecentDifficultDays([0.2, 0.4, 0.1]), 3);
assert.equal(countRecentDifficultDays([0.2, null, 0.4]), 2);
assert.equal(countRecentDifficultDays([0.2, undefined, 0.1]), 1);
assert.equal(countRecentDifficultDays([0.2, 0.5, 0.1]), 1);
assert.equal(countRecentDifficultDays([0.2, 0.3, 0.4], 2), 2);
for (const rates of [null, {}, 'bad']) assert.equal(countRecentDifficultDays(rates), 0);
console.log('Adaptive day checks passed: exports, modes, targets, timing, recommendations, next move priority, and no mutation.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const api = require('../js/day-support.js');
const { normalize, forDay, plan } = api;
const defaults = { date: '', capacity: null, friction: '', picks: [] };
const date = '2026-09-09';
const source = fs.readFileSync(path.join(__dirname, '../js/day-support.js'), 'utf8');
const browser = { window: {} };
vm.runInNewContext(source, browser);
assert.deepEqual(Object.keys(browser.window.Arc90DaySupport), Object.keys(api));
assert.equal(JSON.stringify(browser.window.Arc90DaySupport.normalize(null)), JSON.stringify(defaults));
const both = { window: {}, module: { exports: {} } };
vm.runInNewContext(source, both);
assert.equal(both.window.Arc90DaySupport, both.module.exports);

for (const raw of [null, undefined, 4, false, 'bad', [], {}]) assert.deepEqual(normalize(raw), defaults);
for (const capacity of [5, 15, 30, 60]) assert.equal(normalize({ capacity }).capacity, capacity);
for (const capacity of [0, -5, 10, '15', NaN, Infinity, {}, null]) assert.equal(normalize({ capacity }).capacity, null);
for (const friction of ['time', 'energy', 'distractions', 'unsure']) assert.equal(normalize({ friction }).friction, friction);
assert.equal(normalize({ friction: 'other' }).friction, '');
for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01',
  '2026-00-01', '2026-01-00', '2026-9-09', '2026-09-09\n', null, 20260909]) {
  assert.equal(normalize({ date }).date, '');
}
for (const date of ['2024-02-29', '2000-02-29', '0096-02-29', '2026-09-09']) {
  assert.equal(normalize({ date }).date, date);
}
assert.deepEqual(normalize({ picks: [1, '1', ' 2 ', 2, null, {}, '', false, NaN, 0] }).picks, ['1', '2', '0']);
assert.deepEqual(normalize({ picks: 'bad' }).picks, []);
assert.equal(normalize({ picks: Array.from({ length: 120 }, (_, i) => i) }).picks.length, 100);
const raw = Object.freeze({ date, capacity: 15, friction: 'energy', picks: Object.freeze([1, '1', '2']) });
assert.deepEqual(forDay(raw, date), { date, capacity: 15, friction: 'energy', picks: ['1', '2'] });
assert.deepEqual(forDay(raw, '2026-09-10'), { ...defaults, date: '2026-09-10' });
assert.deepEqual(forDay(null, date), { ...defaults, date });
assert.deepEqual(forDay(raw, null), defaults);
assert.deepEqual(forDay({ picks: [1] }, undefined), defaults);

const habit = (id, name, min) => ({ id, name, min });
const task = (label, budget = 60) => plan([habit(1, label)], budget);
for (const budget of [undefined, null, '5', 0, -5, 10, NaN, Infinity, {}]) {
  assert.deepEqual(task('Walk', budget === undefined ? null : budget), { items: [], total: 0, budget: 0 });
}
assert.deepEqual(plan([], undefined), { items: [], total: 0, budget: 0 });
for (const malformed of [null, undefined, {}, false, 'bad']) {
  assert.deepEqual(plan(malformed, 5), { items: [], total: 0, budget: 5 });
}
assert.equal(plan([null, {}, false, { id: {} }, habit(1, null)], 15).items.length, 0);
for (const [label, minutes] of [['5-minute walk', 5], ['Walk 3 min', 3], ['Study 1 hour', 60],
  ['Stretch 0.5 hours', 30], ['Walk 3-5 minutes', 5], ['Walk 3 - 5-minute route', 5],
  ['Study .5 hr and 5 mins', 35], ['Walk 1.2 minutes', 2]]) {
  assert.deepEqual(task(label).items[0], { id: '1', label, minutes, estimated: false });
}
assert.deepEqual(task('Read 1 page', 5).items[0], { id: '1', label: 'Read 1 page', minutes: 5, estimated: true });
for (const label of ['Walk 0 minutes', 'Walk -5 minutes', '-1-hour walk', 'Walk 0-5 minutes',
  'Walk 2 hours', 'Walk 61 minutes', 'Walk 1e309 hours', 'Walk 1e1 minutes',
  'Walk 1,005 minutes', 'Walk ' + '9'.repeat(400) + ' minutes']) {
  assert.equal(task(label).items.length, 0, label);
}
for (const name of ['No spending', 'No-spend day', 'Avoid sugar', 'Eat without screens',
  'Screens off before bed', 'Finish before sunset']) {
  assert.equal(plan([habit(1, name, 'Just once')], 60).items.length, 0, name);
}
assert.equal(task('Avoid screens for 5 minutes').items.length, 0);
assert.deepEqual(plan([habit(1, 'Walk 60 minutes', '  Walk 5 minutes  ')], 5).items[0],
  { id: '1', label: 'Walk 5 minutes', minutes: 5, estimated: false });
assert.equal(plan([habit(1, 'Walk 5 minutes', '  ')], 5).total, 5);
assert.equal(plan([habit(1, 'Walk 5 minutes', 3)], 5).total, 5);
for (const budget of [5, 15, 30, 60]) assert.equal(task(`Walk ${budget} minutes`, budget).total, budget);
const habits = Object.freeze([habit(1, 'Study 1 hour'), habit(2, 'Walk 3 minutes'),
  habit('2', 'Walk 1 minute'), habit(3, 'Stretch 2 minutes'), habit(4, 'Read'),
  habit(5, 'Write')].map(Object.freeze));
const before = JSON.stringify({ raw, habits });
assert.deepEqual(plan(habits, 5).items.map(h => h.id), ['2', '3']);
assert.deepEqual(plan(habits, 15).items.map(h => h.id), ['2', '3', '4']);
assert.equal(plan(habits, 15).total, 10);
const normalized = normalize(raw);
normalized.picks.push('new');
plan(habits, 60);
assert.equal(JSON.stringify({ raw, habits }), before);
console.log('Day support checks passed: UMD, normalization, rollover, budgets, durations, exclusions, duplicates, and no mutation.');

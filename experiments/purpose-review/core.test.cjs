'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('./core.js');
const TODAY = '2026-10-03';
const metric = (changes = {}) => ({ id: 'm', title: 'Focus', goalId: 'g', goalTitle: 'Write', unit: 'minutes', direction: 'up', context: 'Morning', ...changes });
const observation = (changes = {}) => ({ id: 'o', metricId: 'm', date: TODAY, value: 0, context: 'Morning', note: '', ...changes });
const adjustment = (changes = {}) => ({ id: 'a', metricId: 'm', date: TODAY, reviewDate: '2026-10-10', choice: 'change', text: 'Try earlier', status: 'open', ...changes });
const rule = (changes = {}) => ({ id: 'r', obstacle: 'Distracted', context: 'Desk', response: 'Close tabs', ...changes });
const attempt = (changes = {}) => ({ id: 't', ruleId: 'r', date: TODAY, rating: 'helped', note: '', ...changes });
const save = (state, type, record) => core.transact(state, { type: `${type}.save`, record }, { today: TODAY });

test('CommonJS and browser UMD expose the same pure API', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), sandbox);
  const expected = ['empty', 'normalize', 'transact', 'direction', 'playbook', 'effortForGoal'];
  assert.deepEqual(Object.keys(core), expected);
  assert.deepEqual(Object.keys(sandbox.Arc90PurposeReview), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.Arc90PurposeReview.empty())), core.empty());
});

test('empty, normalize and transactions clone without mutating their inputs', () => {
  const raw = core.empty();
  Object.freeze(raw.metrics);
  Object.freeze(raw);
  const one = save(raw, 'metric', metric({ title: ' Focus ', context: ' MORNING ' }));
  assert.deepEqual(raw.metrics, []);
  assert.equal(one.metrics[0].title, 'Focus');
  assert.equal(one.metrics[0].context, 'MORNING');
  const clone = core.normalize(one);
  clone.metrics[0].title = 'Changed';
  assert.equal(one.metrics[0].title, 'Focus');
  assert.deepEqual(core.normalize(one), one);
});

test('malformed or incompatible snapshots fail rather than dropping records', () => {
  const base = core.empty();
  for (const raw of [null, 4, [], { ...base, version: 2 }, { ...base, observations: {} },
    { ...base, extra: true }, { ...base, metrics: [metric(), metric()] },
    { ...base, observations: [observation()] },
    { ...base, metrics: [metric()], adjustments: [adjustment({ metricId: 'missing' })] },
    { ...base, attempts: [attempt()] },
    { ...base, metrics: [metric({ direction: 'sideways' })] },
    { ...base, metrics: [metric({ title: '' })] },
    { ...base, metrics: [metric({ title: 'x'.repeat(161) })] },
    { ...base, metrics: [{ ...metric(), unexpected: 1 }] },
    { ...base, metrics: [metric()], observations: [observation({ value: Infinity })] },
    { ...base, metrics: [metric()], observations: [observation({ date: '2026-02-30' })] }]) {
    assert.throws(() => core.normalize(raw), Error);
  }
  assert.deepEqual(core.normalize(), base);
});

test('invalid actions and foreign references roll back the original state', () => {
  const state = save(core.empty(), 'metric', metric());
  const before = JSON.stringify(state);
  const bad = [
    { type: 'metric.delete', id: 'm' },
    { type: 'observation.save', record: observation({ metricId: 'missing' }) },
    { type: 'adjustment.save', record: adjustment({ metricId: 'missing' }) },
    { type: 'attempt.save', record: attempt() },
    { type: 'observation.save', record: observation({ date: '2026-10-04' }) },
    { type: 'observation.save', record: observation({ value: NaN }) },
    { type: 'observation.delete', id: 'absent' },
    { type: '__proto__', id: 'm' },
    { type: 'metric.save', record: metric(), extra: true },
  ];
  for (const action of bad) assert.throws(() => core.transact(state, action, { today: TODAY }), Error);
  assert.throws(() => save(save(state, 'rule', rule()), 'attempt', attempt({ date: '2026-10-04' })), /after today/);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => core.transact(state, { type: 'metric.save', record: metric() }, { today: '2026-02-30' }), /Today/);
});

test('hostile IDs remain data and prototype keys cannot enter a snapshot', () => {
  const hostile = save(core.empty(), 'metric', metric({ id: '__proto__' }));
  const withObservation = save(hostile, 'observation', observation({ metricId: '__proto__', id: 'constructor' }));
  assert.equal(core.direction(withObservation, '__proto__', { today: TODAY }).count, 1);
  assert.equal({}.polluted, undefined);
  const injected = JSON.parse('{"id":"x","title":"X","goalId":null,"goalTitle":"","unit":"count","direction":"up","context":"","__proto__":{"polluted":true}}');
  assert.throws(() => core.normalize({ ...core.empty(), metrics: [injected] }), /unknown fields/);
  assert.equal({}.polluted, undefined);
});

test('CRUD upserts in place and deletes the requested records', () => {
  let state = save(core.empty(), 'metric', metric());
  state = save(state, 'metric', metric({ title: 'Deep focus' }));
  assert.equal(state.metrics.length, 1);
  assert.equal(state.metrics[0].title, 'Deep focus');
  state = save(state, 'observation', observation());
  state = save(state, 'adjustment', adjustment());
  state = save(state, 'rule', rule());
  state = save(state, 'attempt', attempt());
  assert.deepEqual(state.observations.map(x => x.value), [0]);
  state = core.transact(state, { type: 'observation.delete', id: 'o' }, { today: TODAY });
  state = core.transact(state, { type: 'adjustment.delete', id: 'a' }, { today: TODAY });
  state = core.transact(state, { type: 'attempt.delete', id: 't' }, { today: TODAY });
  assert.deepEqual([state.observations.length, state.adjustments.length, state.attempts.length], [0, 0, 0]);
});

test('metric history locks measurement unit and goal identity, but not its title', () => {
  let state = save(core.empty(), 'metric', metric());
  state = save(state, 'metric', metric({ unit: 'hours', goalId: 'new-goal', goalTitle: 'New goal' }));
  state = save(state, 'observation', observation());
  const before = JSON.stringify(state);
  for (const changes of [{ unit: 'seconds' }, { goalId: 'another' }, { goalTitle: 'Renamed goal' }]) {
    assert.throws(() => save(state, 'metric', metric({ unit: 'hours', goalId: 'new-goal', goalTitle: 'New goal', ...changes })), /cannot change its unit or goal/);
    assert.equal(JSON.stringify(state), before);
  }
  state = save(state, 'metric', metric({ unit: 'hours', goalId: 'new-goal', goalTitle: 'New goal', title: 'Focused writing' }));
  assert.equal(state.metrics[0].title, 'Focused writing');
  assert.equal(state.observations[0].value, 0);
});

test('rule history locks obstacle, context and response with the exact user-facing error', () => {
  let state = save(core.empty(), 'rule', rule());
  state = save(state, 'rule', rule({ response: 'Take a walk' }));
  state = save(state, 'attempt', attempt());
  const before = JSON.stringify(state);
  for (const changes of [{ obstacle: 'Tired' }, { context: 'Kitchen' }, { response: 'Close tabs' }]) {
    assert.throws(() => save(state, 'rule', rule({ response: 'Take a walk', ...changes })),
      error => error.message === 'Save a new response to keep earlier feedback with the original.');
    assert.equal(JSON.stringify(state), before);
  }
  assert.deepEqual(save(state, 'rule', rule({ response: ' Take a walk ' })), state);
  const next = save(state, 'rule', rule({ id: 'new', response: 'Close tabs' }));
  assert.equal(next.attempts[0].ruleId, 'r');
});

test('adjustment chronology is validated in snapshots and future adjustment dates are rejected', () => {
  const state = save(core.empty(), 'metric', metric());
  const before = JSON.stringify(state);
  assert.throws(() => save(state, 'adjustment', adjustment({ date: '2026-10-04' })), /after today/);
  assert.throws(() => save(state, 'adjustment', adjustment({ reviewDate: '2026-10-02' })), /Review date cannot be before/);
  assert.throws(() => core.normalize({ ...state, adjustments: [adjustment({ reviewDate: '2026-10-02' })] }), /Review date cannot be before/);
  assert.equal(JSON.stringify(state), before);
  const sameDay = save(state, 'adjustment', adjustment({ reviewDate: TODAY }));
  assert.equal(sameDay.adjustments[0].reviewDate, TODAY);
});

test('deleting a rule cascades only its attempts', () => {
  let state = save(core.empty(), 'rule', rule());
  state = save(state, 'rule', rule({ id: 'r2' }));
  state = save(state, 'attempt', attempt());
  state = save(state, 'attempt', attempt({ id: 't2', ruleId: 'r2' }));
  const original = state;
  state = core.transact(state, { type: 'rule.delete', id: 'r' }, { today: TODAY });
  assert.deepEqual(state.rules.map(x => x.id), ['r2']);
  assert.deepEqual(state.attempts.map(x => x.id), ['t2']);
  assert.equal(original.attempts.length, 2);
});

test('direction uses inclusive last 30 days, matching context, zero and stable same-day order', () => {
  let state = save(core.empty(), 'metric', metric());
  for (const item of [
    observation({ id: 'old', date: '2026-09-03', value: 100 }),
    observation({ id: 'edge', date: '2026-09-04', value: 0, context: ' morning ' }),
    observation({ id: 'other', date: '2026-10-01', value: 50, context: 'Evening' }),
    observation({ id: 'first', date: TODAY, value: 7, context: 'MORNING' }),
    observation({ id: 'second', date: TODAY, value: 9, context: 'Morning' }),
  ]) state = save(state, 'observation', item);
  const result = core.direction(state, 'm', { today: TODAY });
  assert.deepEqual(result.observations.map(x => x.id), ['edge', 'first', 'second']);
  assert.equal(result.count, 3);
  assert.equal(result.latest.id, 'second');
  assert.equal(result.previous.id, 'first');
  assert.equal(result.delta, 2);
  assert.equal(state.observations.length, 5);
  assert.throws(() => core.direction(state, 'missing', { today: TODAY }), /Metric not found/);
});

test('direction handles empty, single and leap-day windows', () => {
  let state = save(core.empty(), 'metric', metric());
  assert.deepEqual(core.direction(state, 'm', { today: TODAY }), { observations: [], latest: null, previous: null, delta: null, count: 0 });
  state = save(state, 'observation', observation({ date: '2024-02-29', value: 0 }));
  const result = core.direction(state, 'm', { today: '2024-03-01' });
  assert.equal(result.latest.value, 0);
  assert.equal(result.previous, null);
  assert.equal(result.delta, null);
});

test('playbook counts explicit ratings only and keeps attempts scoped', () => {
  let state = save(core.empty(), 'rule', rule());
  state = save(state, 'rule', rule({ id: 'other' }));
  for (const item of [attempt(), attempt({ id: 'n', rating: 'not-helped' }),
    attempt({ id: 'u', rating: 'unsure' }), attempt({ id: 'x', ruleId: 'other' })]) state = save(state, 'attempt', item);
  const result = core.playbook(state, 'r');
  assert.deepEqual([result.helped, result.notHelped, result.unsure], [1, 1, 1]);
  assert.deepEqual(result.attempts.map(x => x.id), ['t', 'n', 'u']);
  assert.throws(() => save(state, 'attempt', attempt({ id: 'bad', rating: 'maybe' })), /rating/);
});

test('effort counts done or min once per habit and distinct active days, inclusive', () => {
  const input = { goalId: 'root', start: '2026-10-01', end: TODAY,
    goals: [{ id: 'root', status: 'active' }, { id: 'child', parent_goal_id: 'root', status: 'done' }],
    habits: [{ id: 1, goal_id: 'child' }, { id: '2', task_id: 'task' }, { id: 3, goal_id: 'else' }],
    tasks: [{ id: 'task', goal_id: 'child' }],
    log: { '2026-09-30': { done: [1] }, '2026-10-01': { done: [1, '2', 3], min: [1, 2] },
      '2026-10-02': { done: [1, 2], skip: [1] }, '2026-10-03': { min: [1] }, '2026-10-04': { done: [1] } } };
  const before = JSON.stringify(input);
  assert.deepEqual(core.effortForGoal(input), { count: 4, days: 3 });
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(core.effortForGoal({ ...input, goalId: 'child' }), { count: 4, days: 3 });
});

test('effort refuses explicit-goal fallback, broken, archived, cyclic and overdeep paths', () => {
  const base = { goalId: 'root', start: TODAY, end: TODAY,
    goals: [{ id: 'root' }, { id: 'child', parent_goal_id: 'root' }, { id: 'archived', parent_goal_id: 'root', status: 'archived' },
      { id: 'broken', parent_goal_id: 'missing' }, { id: 'cycle1', parent_goal_id: 'cycle2' }, { id: 'cycle2', parent_goal_id: 'cycle1' },
      { id: 'd1', parent_goal_id: 'root' }, { id: 'd2', parent_goal_id: 'd1' }, { id: 'd3', parent_goal_id: 'd2' },
      { id: 'd4', parent_goal_id: 'd3' }, { id: 'd5', parent_goal_id: 'd4' }],
    tasks: [{ id: 'task', goal_id: 'child' }],
    habits: [{ id: 'valid', task_id: 'task' }, { id: 'explicit', goal_id: 'missing', task_id: 'task' },
      { id: 'archived', goal_id: 'archived' }, { id: 'broken', goal_id: 'broken' },
      { id: 'cycle', goal_id: 'cycle1' }, { id: 'deep', goal_id: 'd5' }],
    log: { [TODAY]: { done: ['valid', 'explicit', 'archived', 'broken', 'cycle', 'deep'] } } };
  assert.deepEqual(core.effortForGoal(base), { count: 1, days: 1 });
  assert.throws(() => core.effortForGoal({ ...base, start: '2026-10-04' }), /Start/);
  assert.throws(() => core.effortForGoal({ ...base, end: '2026-02-30' }), /End/);
});

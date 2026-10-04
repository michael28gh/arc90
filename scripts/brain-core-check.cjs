'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const brain = require('../js/brain-core.js');
let passed = 0;
function test(name, run) {
  try { run(); passed++; }
  catch (error) { error.message = name + ': ' + error.message; throw error; }
}
const L = '11111111-1111-4111-8111-111111111111';
const M = '22222222-2222-4222-8222-222222222222';
const S = '33333333-3333-4333-8333-333333333333';
const X = '44444444-4444-4444-8444-444444444444';
const goals = [
  { id: L, title: 'Long goal', horizon: 'long', parent_goal_id: null, status: 'active' },
  { id: M, title: 'Mid goal', horizon: 'mid', parent_goal_id: L, status: 'active' },
  { id: S, title: 'Short goal', horizon: 'short', parent_goal_id: M, status: 'active' },
];
const habit = (id, goal_id = S, extra = {}) => ({ id, name: id, goal_id, ...extra });
const item = (extra = {}) => ({ temp_id: 'one', type: 'task', title: 'Do a thing', horizon: 'short', parent_temp_id: null, parent_goal_id: null, frequency: null, confidence: 0.8, excerpt: 'Do a thing', ...extra });
const validate = (items, existing = goals) => brain.validateResponse({ items }, existing);
const rejects = (items, existing) => assert.throws(() => validate(items, existing), /Invalid brain response/);
const node = (result, id) => result.nodes.find((x) => x.id === id);
const edge = (result, source, target) => result.links.find((x) => x.source === source && x.target === target);
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function graphChecks(result) {
  const ids = new Set(result.nodes.map((x) => x.id));
  assert.equal(ids.size, result.nodes.length);
  const edges = new Set();
  for (const link of result.links) {
    assert(ids.has(link.source) && ids.has(link.target));
    assert(node(result, link.source).column < node(result, link.target).column);
    const key = JSON.stringify([link.source, link.target]);
    assert(!edges.has(key));
    edges.add(key);
    assert(Number.isFinite(link.value) && link.value >= 0);
  }
  assert.equal(result.total, result.aligned + (node(result, 'no-purpose')?.value || 0));
}

test('CommonJS and standalone UMD', () => {
  assert.deepEqual(Object.keys(brain).sort(), ['alignment', 'fallback', 'normalize', 'suggest', 'validateResponse']);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/brain-core.js'), 'utf8'), context);
  assert.equal(typeof context.Arc90Brain.alignment, 'function');
  assert.equal(JSON.stringify(context.Arc90Brain.normalize()), JSON.stringify(brain.normalize()));
});

test('normalize malformed roots', () => {
  for (const raw of [undefined, null, 1, 'text', [], { drafts: {}, goals: {} }]) {
    assert.deepEqual(brain.normalize(raw), { drafts: [], goals: [], activeDraftId: null, cloudOwner: null, deletedTaskIds: [], dirty: false });
  }
});
test('normalize clones UI drafts and sanitizes goals without mutation', () => {
  const input = frozen({ drafts: [{ id: 'd1', text: 'notes', review: { items: [item()] } }, { id: 'd1' }, null], goals: [...goals, goals[0], { id: 'bad', title: 'Bad', horizon: 'short' }], activeDraftId: 'd1' });
  const result = brain.normalize(input);
  assert.equal(result.drafts.length, 1);
  assert.deepEqual(result.goals, goals);
  assert.equal(result.activeDraftId, 'd1');
  result.drafts[0].review.items[0].title = 'Edited';
  assert.equal(input.drafts[0].review.items[0].title, 'Do a thing');
  assert.equal(brain.normalize({ ...input, activeDraftId: 'missing' }).activeDraftId, null);
});
test('normalize removes invalid parent edges, defaults status, is idempotent', () => {
  const result = brain.normalize({ goals: [
    { ...goals[0], parent_goal_id: S },
    { ...goals[1], parent_goal_id: X, status: 'nonsense' },
    { ...goals[2], parent_goal_id: S },
  ] });
  assert(result.goals.every((x) => x.parent_goal_id === null));
  assert.equal(result.goals[1].status, 'active');
  assert.deepEqual(brain.normalize(result), result);
});
test('normalize hostile draft keys and circular content', () => {
  const draft = JSON.parse('{"id":"draft","__proto__":{"polluted":true}}');
  draft.self = draft;
  const result = brain.normalize({ drafts: [draft] });
  assert.equal(Object.hasOwn(result.drafts[0], '__proto__'), false);
  assert.equal(result.drafts[0].self, null);
  assert.equal({}.polluted, undefined);
});
test('frontend draft fields and sync metadata survive a detached round trip', () => {
  for (const status of ['draft', 'sorted']) {
    const input = frozen({
      drafts: [{ id: X, raw_text: '  Original\ntext  ', status, created_at: '2026-09-29T12:00:00Z', items: [item({ horizon: 'unsorted', includeHabit: true }), item({ temp_id: 'two', includeHabit: false })], ids: { one: S, two: M } }],
      goals, activeDraftId: X, cloudOwner: 'owner-1', deletedTaskIds: ['old-task'], dirty: true,
    });
    const result = brain.normalize(input);
    assert.deepEqual(result, input);
    assert.deepEqual(brain.normalize(result), result);
    assert.notEqual(result.drafts, input.drafts);
    assert.notEqual(result.drafts[0].items, input.drafts[0].items);
    result.drafts[0].items[0].includeHabit = false;
    result.drafts[0].ids.one = L;
    assert.equal(input.drafts[0].items[0].includeHabit, true);
    assert.equal(input.drafts[0].ids.one, S);
  }
  assert.equal(brain.normalize({ cloudOwner: null, dirty: false }).cloudOwner, null);
  assert.equal(brain.normalize({ cloudOwner: 42, dirty: 'true' }).dirty, false);
});

test('fallback lines, sentences, bullets, word limit and dedupe', () => {
  const result = brain.fallback(' - Buy milk. Call mum!\nBUY MILK\n1. one two three four five six seven eight nine ten\n* Call mum');
  assert.deepEqual(result.items.map((x) => x.title), ['Buy milk', 'Call mum', 'one two three four five six seven eight']);
  assert(result.items[2].excerpt.endsWith('nine ten'));
  assert.equal(new Set(result.items.map((x) => x.temp_id)).size, 3);
  for (const x of result.items) {
    assert.equal(x.type, 'task'); assert.equal(x.horizon, 'unsorted');
    assert.equal(x.parent_temp_id, null); assert.equal(x.parent_goal_id, null);
    assert.equal(x.frequency, null); assert.equal(x.confidence, 0);
  }
});
test('suggest splits a comma-joined capture into typed ideas', () => {
  const text = 'I want to start uploading video on YouTube about my journey, mi life and projects, I want to improve Arc90 social media traffic before the launch, I want to sell my audi tt at 9,500 Dlls, I want to be more healthy and go to the gym, I need to be leaner and with a good skin care for graduation, I want to make more money and be financially stable';
  const items = brain.suggest(text).items;
  assert.deepEqual(items.map((i) => [i.type, i.horizon, i.title]), [
    ['goal', 'mid', 'Start uploading video on YouTube about my journey'],
    ['goal', 'short', 'Improve Arc90 social media traffic before the launch'],
    ['task', 'short', 'Sell my audi tt at 9,500 Dlls'],
    ['goal', 'long', 'Be more healthy'],
    ['habit', 'short', 'Go to the gym'],
    ['goal', 'short', 'Be leaner and with a good skin care'],
    ['goal', 'long', 'Make more money and be financially stable'],
  ]);
  assert.equal(items.find((i) => i.type === 'habit').frequency, 'daily');
  assert.doesNotThrow(() => brain.validateResponse({ items }), 'suggestions are valid review items');
  assert.deepEqual(brain.suggest('Run a marathon someday').items.map((i) => [i.type, i.horizon]), [['goal', 'long']]);
  assert.equal(brain.suggest('I want to go to the gym every morning to get healthier').items[0].title, 'Go to the gym every morning');
  for (const value of [null, '', ' , . ']) assert.deepEqual(brain.suggest(value), { items: [] });
});

test('fallback limits and determinism', () => {
  const text = Array.from({ length: 90 }, (_, i) => 'Task ' + i).join('\n');
  assert.equal(brain.fallback(text).items.length, 60);
  assert.deepEqual(brain.fallback(text), brain.fallback(text));
  for (const value of [null, undefined, {}, '', ' \n.!?']) assert.deepEqual(brain.fallback(value), { items: [] });
});

test('response accepts and sanitizes exact JSON schema', () => {
  const value = frozen({ items: [item({ title: '  Do   a thing  ', excerpt: '  original  ' })] });
  const result = brain.validateResponse(JSON.stringify(value));
  assert.equal(result.items[0].title, 'Do a thing');
  assert.equal(result.items[0].excerpt, 'original');
  assert.deepEqual(validate([]), { items: [] });
});
test('invalid JSONs and envelopes', () => {
  for (const value of ['{', '```json\n{"items":[]}\n```', 'null', '[]', '{}', '{"items":null}', null, [], { items: [], extra: true }, { other: [] }]) {
    assert.throws(() => brain.validateResponse(value));
  }
  rejects(Array.from({ length: 61 }, (_, i) => item({ temp_id: '' + i })));
});
test('exact item fields are required with no extras', () => {
  for (const key of Object.keys(item())) { const x = item(); delete x[key]; rejects([x]); }
  rejects([item({ extra: true })]);
  rejects([null]); rejects([[]]);
});
test('invalid field types, enums, titles and finite confidence', () => {
  for (const patch of [
    { temp_id: '' }, { temp_id: 1 }, { type: 'project' }, { type: null },
    { title: '' }, { title: 7 }, { title: 'one two three four five six seven eight nine' },
    { horizon: 'unsorted' }, { horizon: null }, { frequency: 'sometimes' }, { frequency: 'daily' },
    { confidence: -1 }, { confidence: 1.01 }, { confidence: NaN }, { confidence: Infinity }, { confidence: '0.5' },
    { parent_goal_id: 'not-uuid' }, { parent_temp_id: 1 }, { excerpt: null },
  ]) rejects([item(patch)]);
  for (const frequency of [null, 'daily', 'weekdays', 'weekends', 'weekly']) validate([item({ type: 'habit', frequency })]);
  for (const confidence of [0, 1]) validate([item({ confidence })]);
});
test('forward references and existing UUID references', () => {
  const items = [item({ parent_temp_id: 'mid' }), item({ temp_id: 'mid', type: 'goal', horizon: 'mid', parent_goal_id: L })];
  assert.deepEqual(validate(items).items, items);
  validate([item({ parent_goal_id: M })]);
  validate([item({ type: 'habit', parent_goal_id: S })]);
  validate([item({ type: 'habit', parent_goal_id: M })]);
});
test('existing goal summaries do not require parent fields', () => {
  const existing = frozen(goals.map(({ id, title, horizon }) => ({ id, title, horizon })));
  const items = frozen([item({ parent_goal_id: M }), item({ temp_id: 'habit', type: 'habit', parent_goal_id: S })]);
  const result = validate(items, existing);
  assert.deepEqual(result.items, items);
  result.items[0].title = 'Edited';
  assert.equal(items[0].title, 'Do a thing');
});
test('unknown, ambiguous, archived and wrong-type parents', () => {
  rejects([item({ parent_goal_id: X })]);
  rejects([item({ parent_goal_id: M })], [...goals, goals[1]]);
  rejects([item({ parent_goal_id: M })], goals.map((x) => ({ ...x, status: 'archived' })));
  rejects([item({ parent_temp_id: 'missing' })]);
  rejects([item({ parent_temp_id: 'two' }), item({ temp_id: 'two', horizon: 'mid' })]);
  rejects([item({ parent_temp_id: 'two', parent_goal_id: M }), item({ temp_id: 'two', type: 'goal', horizon: 'mid' })]);
});
test('duplicates, self links, cycles and hierarchy checks', () => {
  rejects([item(), item()]);
  rejects([item({ type: 'goal', parent_temp_id: 'one' })]);
  rejects([item({ type: 'goal', parent_temp_id: 'two' }), item({ temp_id: 'two', type: 'goal', horizon: 'mid', parent_temp_id: 'one' })]);
  rejects([item({ parent_goal_id: L })]);
  rejects([item({ horizon: 'long', parent_goal_id: M })]);
  rejects([item({ type: 'habit', parent_goal_id: L })]);
  rejects([item({ parent_goal_id: M })], goals.map((x) => x.id === L ? { ...x, parent_goal_id: S } : x));
  rejects([item({ parent_goal_id: M })], goals.map((x) => x.id === L ? { ...x, parent_goal_id: X } : x));
  const deep = Array.from({ length: 8 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, title: 'Deep', horizon: 'mid', status: 'active' }));
  deep.forEach((x, i) => { x.parent_goal_id = deep[i + 1]?.id || null; });
  rejects([item({ parent_goal_id: deep[0].id })], deep);
});
test('unparented items remain unparented; fallback must be reviewed', () => {
  assert.equal(validate([item()]).items[0].parent_goal_id, null);
  assert.throws(() => brain.validateResponse(brain.fallback('Do something')));
});

test('empty and no-completion alignment retains all goals and tasks', () => {
  const empty = brain.alignment();
  assert.equal(empty.score, null); assert.equal(empty.total, 0);
  const result = brain.alignment({ goals, habits: [habit('h')], tasks: [{ id: 't', title: 'Task', horizon: 'short', goal_id: M }], log: { '2026-09-01': { min: ['h'], skip: ['h'], done: ['t'] } } });
  assert.equal(result.nodes.length, 5); assert.equal(result.activeGoals, 0);
  assert.equal(result.neglectedGoals, 3); assert.equal(result.score, null);
  assert(result.nodes.every((x) => x.value === 0 && x.percent === 0));
  assert.deepEqual(result.activity.h, []);
  graphChecks(result);
});
test('unique full and minimum reps, skipped exclusion, inclusive ranges and unknown IDs', () => {
  const result = brain.alignment({ goals, habits: [habit('h'), habit('o', null)], start: '2026-09-01', end: '2026-09-02', log: {
    '2026-08-31': { done: ['h'] }, '2026-09-03': { done: ['h'] },
    '2026-09-01': { done: ['h', 'h', 'unknown'], min: ['o'] },
    '2026-09-02': { done: ['h', 'o', 'o'], skip: ['o'] },
    '2026-02-30': { done: ['h'] }, 'invalid': { done: ['h'] },
  } });
  assert.equal(result.total, 3); assert.equal(result.aligned, 2);
  assert(Math.abs(result.score - 200 / 3) < 1e-10); assert.equal(result.neglectedGoals, 0);
  for (const goal of goals) assert.equal(node(result, 'goal:' + goal.id).value, 2);
  assert.equal(edge(result, 'goal:' + L, 'goal:' + M).value, 2);
  assert.deepEqual(result.activity.h, [{ date: '2026-09-01', count: 1 }, { date: '2026-09-02', count: 1 }]);
  assert.deepEqual(result.orphans, ['o']);
  assert.deepEqual(node(result, 'no-purpose').ids, ['o']);
  assert(!result.links.some((x) => x.target === 'no-purpose'));
  graphChecks(result);
});
test('date validation and single-day/one-sided ranges', () => {
  for (const range of [{ start: 'bad' }, { end: '2026-02-30' }, { start: '2026-09-02', end: '2026-09-01' }]) assert.throws(() => brain.alignment(range));
  const base = { goals, habits: [habit('h')], log: { '2026-09-01': { done: ['h'] }, '2026-09-02': { done: ['h'] } } };
  assert.equal(brain.alignment({ ...base, start: '2026-09-02' }).total, 1);
  assert.equal(brain.alignment({ ...base, end: '2026-09-01' }).total, 1);
  assert.equal(brain.alignment({ ...base, start: '2026-09-01', end: '2026-09-01' }).total, 1);
});
test('dangling links, archived ancestors, invalid hierarchy and cycles become orphans', () => {
  const variants = [
    goals.filter((x) => x.id !== M),
    goals.map((x) => x.id === M ? { ...x, status: 'archived' } : x),
    goals.map((x) => x.id === L ? { ...x, parent_goal_id: S } : x),
    goals.map((x) => x.id === S ? { ...x, parent_goal_id: L } : x),
    goals.map((x) => x.id === S ? { ...x, parent_goal_id: S } : x),
  ];
  for (const variant of variants) {
    const result = brain.alignment({ goals: variant, habits: [habit('h')], log: { '2026-09-01': { done: ['h'] } } });
    assert.equal(result.total, 1); assert.equal(result.aligned, 0); assert.equal(result.score, 0);
    assert.equal(result.orphanHabits, 1); assert.equal(result.nodes.filter((x) => x.kind === 'goal').length, variant.length);
    graphChecks(result);
  }
});
test('direct mid-goal habit skips a column; long-goal habit is orphan', () => {
  const result = brain.alignment({ goals, habits: [habit('h', M), habit('o', L)], log: { '2026-09-01': { done: ['h', 'o'] } } });
  assert.equal(edge(result, 'goal:' + M, 'habit:h').value, 1);
  assert.equal(node(result, 'goal:' + S).value, 0);
  assert.equal(result.neglectedGoals, 1); assert.deepEqual(result.orphans, ['o']);
  graphChecks(result);
});
test('tasks do not imply effort or capture unrelated habit effort', () => {
  const result = brain.alignment({ goals, habits: [habit('h', M)], tasks: [{ id: 't', title: 'Task', horizon: 'short', goal_id: M }], log: { '2026-09-01': { done: ['h', 't'] } } });
  assert.equal(node(result, 'task:t').value, 0);
  assert.equal(edge(result, 'goal:' + M, 'task:t').value, 0);
  assert.equal(result.total, 1); graphChecks(result);
});
test('explicit task path routes effort exactly once', () => {
  const result = brain.alignment({ goals, habits: [habit('a', M, { task_id: 't' }), habit('b', null, { task_id: 't' })], tasks: [{ id: 't', title: 'Task', horizon: 'short', goal_id: M }], log: { '2026-09-01': { done: ['a', 'b'] } } });
  assert.equal(result.total, 2); assert.equal(result.aligned, 2);
  assert.equal(node(result, 'task:t').value, 2);
  assert.equal(edge(result, 'goal:' + M, 'task:t').value, 2);
  assert.equal(edge(result, 'task:t', 'habit:a').value, 1);
  assert.equal(edge(result, 'goal:' + M, 'habit:a'), undefined);
  assert.equal(node(result, 'goal:' + L).value, 2); graphChecks(result);
  for (const id of ['a', 'b']) {
    const habitNode = node(result, 'habit:' + id);
    assert.equal(habitNode.habitId, id);
    assert.equal(habitNode.goalId, M);
    assert.equal(habitNode.taskId, 't');
  }
});
test('all nodes expose nullable identity metadata; direct habits have no task', () => {
  const result = brain.alignment({ goals, habits: [habit('h'), habit('o', null)], tasks: [{ id: 't', title: 'Task', horizon: 'short', goal_id: M }] });
  for (const entry of result.nodes) {
    for (const key of ['habitId', 'goalId', 'taskId']) {
      assert(Object.hasOwn(entry, key));
      assert(entry[key] === null || typeof entry[key] === 'string');
    }
  }
  assert.equal(node(result, 'habit:h').goalId, S);
  assert.equal(node(result, 'habit:h').taskId, null);
  assert.equal(node(result, 'task:t').goalId, M);
  assert.equal(node(result, 'goal:' + S).goalId, S);
  assert.deepEqual(result.orphans, ['o']);
});
test('invalid or conflicting task path falls back to explicit valid goal only', () => {
  const tasks = [{ id: 't', title: 'Task', horizon: 'short', goal_id: L }];
  const result = brain.alignment({ goals, tasks, habits: [habit('h', S, { task_id: 't' }), habit('o', null, { task_id: 't' })], log: { '2026-09-01': { done: ['h', 'o'] } } });
  assert.equal(node(result, 'task:t').value, 0); assert.equal(result.aligned, 1);
  const conflict = brain.alignment({ goals, tasks: [{ ...tasks[0], goal_id: M }], habits: [habit('h', S, { task_id: 't' })], log: { '2026-09-01': { done: ['h'] } } });
  assert.equal(node(conflict, 'task:t').value, 0);
  assert.equal(edge(conflict, 'goal:' + S, 'habit:h').value, 1);
  graphChecks(result); graphChecks(conflict);
});
test('done goals align but only active goals count as neglected', () => {
  const result = brain.alignment({ goals: goals.map((x) => x.id === S ? { ...x, status: 'done' } : x), habits: [habit('h')], log: {} });
  assert.equal(result.activeGoals, 0); assert.equal(result.neglectedGoals, 2);
});
test('legacy numeric habit IDs are counted and orphaned correctly', () => {
  const result = brain.alignment({ goals, habits: [habit(23, null), habit(24, S)], log: { '2026-09-01': { done: [23, 24] } } });
  assert.equal(result.total, 2);
  assert.deepEqual(result.orphans, ['23']);
  assert.equal(result.activeGoals, 3);
  assert.equal(result.score, 50);
});
test('a linked mid-term goal without a long-term root does not raise alignment score', () => {
  const mid = { ...goals.find(g => g.id === M), parent_goal_id: null };
  const result = brain.alignment({ goals: [mid], habits: [habit('h', M)], log: { '2026-09-01': { done: ['h'] } } });
  assert.equal(result.aligned, 1);
  assert.equal(result.orphanHabits, 0);
  assert.equal(result.score, 0);
});
test('deduplicated IDs, cross-kind collisions, prototype keys, immutability', () => {
  const input = frozen({ goals: [...goals, goals[0]], habits: [habit('same'), habit('same'), habit('__proto__'), habit('no-purpose', null)], tasks: [{ id: 'same', title: 'Same', horizon: 'short', goal_id: M }], log: { '2026-09-01': { done: ['same', '__proto__', 'no-purpose'] } } });
  const result = brain.alignment(input);
  assert.equal(result.total, 3); assert.equal(result.aligned, 2);
  assert(Object.hasOwn(result.activity, '__proto__'));
  assert.deepEqual(result.activity.__proto__, [{ date: '2026-09-01', count: 1 }]);
  assert(node(result, 'task:same') && node(result, 'habit:same'));
  assert.equal(node(result, 'task:same').value, 0);
  assert.deepEqual(brain.alignment(input), result); graphChecks(result);
});
test('malformed collections and log entries are safe', () => {
  const result = brain.alignment({ goals: [null, {}, ...goals], habits: [null, {}, habit('h')], tasks: {}, log: { '2026-09-01': null, '2026-09-02': { done: 'h' } } });
  assert.equal(result.total, 0); graphChecks(result);
});
test('selected-window neglect excludes activity outside the window', () => {
  const input = { goals, habits: [habit('h')], log: { '2026-09-01': { done: ['h'] } } };
  assert.equal(brain.alignment({ ...input, start: '2026-09-02', end: '2026-09-08' }).neglectedGoals, 3);
  assert.equal(brain.alignment({ ...input, start: '2026-09-01', end: '2026-09-08' }).neglectedGoals, 0);
});
test('mixed graph conserves effort across deterministic duplicate-heavy logs', () => {
  const habits = Array.from({ length: 40 }, (_, i) => habit('h' + i, i % 4 === 0 ? null : i % 4 === 1 ? M : S));
  for (let seed = 0; seed < 20; seed++) {
    const log = {};
    let total = 0, aligned = 0;
    for (let day = 1; day <= 10; day++) {
      const done = habits.filter((_, i) => (i * 3 + day + seed) % 7 < 3).map((x) => x.id);
      total += habits.length;
      aligned += habits.filter(x => x.goal_id !== null).length;
      log['2026-09-' + String(day).padStart(2, '0')] = { done: [...done, ...done, 'unknown'], min: habits.map((x) => x.id) };
    }
    const result = brain.alignment({ goals, habits, log });
    assert.equal(result.total, total); assert.equal(result.aligned, aligned);
    assert.equal(node(result, 'goal:' + L).value, aligned);
    assert.equal(node(result, 'goal:' + M).value, aligned);
    for (const item of result.nodes.filter((x) => x.kind === 'habit')) {
      assert.equal(item.value, result.activity[item.habitId].length);
      assert.equal(result.links.filter((x) => x.target === item.id).reduce((sum, x) => sum + x.value, 0), item.value);
    }
    graphChecks(result);
  }
});

test('removed scheduled habits retain effort without inventing goal attribution', () => {
  const result = brain.alignment({ habits: [], log: { '2026-09-30': { scheduledIds: ['removed'], done: ['removed'], min: ['removed'] } } });
  assert.equal(result.total, 1);
  assert.equal(result.aligned, 0);
  assert.equal(result.orphanHabits, 0);
  assert.equal(node(result, 'no-purpose').value, 1);
});
test('legacy tasks without horizon remain visible', () => {
  const result = brain.alignment({ tasks: [{ id: 'legacy', title: 'Buy groceries' }] });
  assert.equal(node(result, 'task:legacy').column, 2);
});
console.log(`brain-core: ${passed} checks passed`);

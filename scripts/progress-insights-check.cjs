const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { generate } = require('../js/progress-insights.js');
let checks = 0;
function test(name, run) {
  try { run(); checks++; } catch (error) { error.message = name + ': ' + error.message; throw error; }
}
const habit = overrides => ({ id: 'read', name: 'Read', currentRate: 0.5,
  previousRate: 0.75, currentPlanned: 7, previousPlanned: 7, streak: 0, ...overrides });
const weekdays = () => [{ label: 'Monday', due: 10, done: 4, rate: 0.4 },
  { label: 'Friday', due: 10, done: 7, rate: 0.7 }];
const area = overrides => ({ area: 'learning', label: 'Learning', planned: 7, completed: 0, ...overrides });
const hours = (early, late) => Array.from({ length: 24 }, (_, i) => i === 19 ? early : i === 20 ? late : 0);
const has = (input, id) => generate(input).some(x => x.id.startsWith(id));

test('no data and malformed top levels', () => {
  for (const input of [undefined, null, false, 1, 'x', [], {}, { days: 90 },
    { weekday: {}, habits: 'bad', areas: 2, hours: null },
    { weekday: [null, 1, {}], habits: [null, 1, {}], areas: [null, 1, {}] }]) {
    assert.deepEqual(generate(input), []);
  }
});
test('weekday inclusive gap and observation window', () => {
  assert.ok(has({ days: 14, weekday: weekdays() }, 'weekday-gap'));
  assert.ok(!has({ days: 13, weekday: weekdays() }, 'weekday-gap'));
  const data = weekdays(); data[1].rate = 0.699999;
  assert.deepEqual(generate({ days: 14, weekday: data }), []);
});
test('both weekdays require four planned reps', () => {
  for (const index of [0, 1]) {
    const data = weekdays(); data[index] = { ...data[index], due: 4, done: 2 };
    assert.ok(has({ days: 14, weekday: data }, 'weekday-gap'));
    data[index].due = 3;
    assert.deepEqual(generate({ days: 14, weekday: data }), []);
  }
});
test('habit inclusive drop and both sample sizes', () => {
  assert.ok(has({ habits: [habit()] }, 'habit-drop:read'));
  for (const patch of [{ currentRate: 0.500001 }, { currentPlanned: 6 },
    { previousPlanned: 6 }, { previousRate: 0.4 }]) {
    assert.deepEqual(generate({ habits: [habit(patch)] }), []);
  }
});
test('area requires a tracked plan and full window', () => {
  assert.ok(has({ days: 7, areas: [area()] }, 'area-empty:learning'));
  assert.deepEqual(generate({ days: 6, areas: [area()] }), []);
  for (const patch of [{ planned: 6 }, { planned: 0 }, { completed: 1 },
    { completed: null }, ...['', ' ', 'unassigned', 'Uncategorized', 'none', null].map(value => ({ area: value }))]) {
    assert.deepEqual(generate({ days: 7, areas: [area(patch)] }), []);
  }
});
test('late logging includes hour 20, needs 70 percent and ten checkoffs', () => {
  assert.ok(has({ hours: hours(3, 7) }, 'late-checkoffs'));
  assert.deepEqual(generate({ hours: hours(4, 6) }), []);
  assert.deepEqual(generate({ hours: hours(2, 7) }), []);
  assert.deepEqual(generate({ hours: hours(10, 0) }), []);
  const data = hours(3, 0); data[23] = 7;
  assert.ok(has({ hours: data }, 'late-checkoffs'));
});
test('milestones are exact habit streaks, not observed days', () => {
  for (const streak of [7, 14, 30, 60, 90]) {
    const result = generate({ habits: [habit({ previousRate: 0.5, streak })] });
    assert.equal(result[0].severity, 'good');
    assert.match(result[0].text, new RegExp(streak + '-day streak'));
  }
  for (const streak of [0, 6, 8, 13, 15, 29, 31, 59, 61, 89, 91, '7', NaN]) {
    assert.deepEqual(generate({ habits: [habit({ previousRate: 0.5, streak })] }), []);
  }
});
test('invalid rates, counts, days and histograms are ignored', () => {
  for (const value of [null, undefined, NaN, Infinity, -1, '7', {}, []]) {
    for (const key of ['currentRate', 'previousRate', 'currentPlanned', 'previousPlanned']) {
      assert.deepEqual(generate({ habits: [habit({ [key]: value })] }), []);
    }
    assert.deepEqual(generate({ days: value, areas: [area()], weekday: weekdays() }), []);
    const data = hours(3, 7); data[0] = value;
    assert.deepEqual(generate({ hours: data }), []);
  }
  for (const key of ['currentRate', 'previousRate']) {
    assert.deepEqual(generate({ habits: [habit({ [key]: 2 })] }), []);
  }
  for (const data of [[], new Array(24), hours(3, 7).slice(1), [...hours(3, 7), 0]]) {
    assert.deepEqual(generate({ hours: data }), []);
  }
  const data = weekdays(); data[0].done = 11;
  assert.deepEqual(generate({ days: 14, weekday: data }), []);
});
test('warn first, maximum three, unique IDs and valid actions', () => {
  const input = { days: 14, weekday: weekdays(), habits: [habit({ streak: 7 }), habit({ streak: 7 })],
    areas: [area()], hours: hours(3, 7) };
  const output = generate(input);
  assert.equal(output.length, 3);
  assert.ok(output.every(x => x.severity === 'warn'));
  assert.equal(new Set(output.map(x => x.id)).size, 3);
  const mixed = generate({ habits: [habit({ streak: 7 })], hours: hours(3, 7) });
  assert.deepEqual(mixed.map(x => x.severity), ['warn', 'good', 'info']);
  for (const item of [...output, ...mixed]) {
    assert.deepEqual(Object.keys(item).sort(), ['action', 'id', 'severity', 'text']);
    assert.ok(['habits', 'today', 'progress'].includes(item.action.tab));
    assert.ok(item.action.label.length > 0);
  }
});
test('pure, deterministic and browser-compatible', () => {
  const input = { days: 14, weekday: weekdays(), habits: [habit()], areas: [area()], hours: hours(3, 7) };
  const before = JSON.stringify(input);
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  }
  freeze(input);
  assert.deepEqual(generate(input), generate(input));
  assert.equal(JSON.stringify(input), before);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/progress-insights.js'), 'utf8'), context);
  assert.equal(typeof context.window.Arc90Insights.generate, 'function');
  assert.equal(JSON.stringify(context.window.Arc90Insights.generate(input)), JSON.stringify(generate(input)));
});
console.log('Progress insights: ' + checks + ' checks passed.');

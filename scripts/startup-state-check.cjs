const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, from);
  return source.slice(start, end);
}
const saved = {
  onboarded: true, theme: 'mono', profile: { name: 'Existing user', start: '2026-09-01' },
  preferences: { dayStartHour: 4 },
  habits: [{ id: 'study', name: 'Study' }],
  log: { '2026-09-29': { done: ['study'], min: [], skip: [] } },
  focus: { sessions: [{ id: 'session-1', minutes: 25 }], active: { start: '2026-09-29T23:00:00Z', minutes: 25 }, unlocks: [{ id: 'unlock-1' }] },
};
const context = {
  localStorage: { getItem: () => JSON.stringify(saved), setItem() {} },
  Arc90Planning: { normalize: value => value || {} },
  Arc90Brain: { normalize: value => value || {} },
  Arc90DaySupport: { normalize: value => value || {} },
  inferDoseSlot: () => 'morning',
};
vm.createContext(context);
vm.runInContext(section('const KEY =', 'let S = load();'), context);
vm.runInContext(section('function load()', 'function captureTodaySchedule()'), context);
vm.runInContext(section('function dkey(', 'function atMidnight('), context);
vm.runInContext(section('function focusEntry(', 'function rhythmOf('), context);
const restored = context.load();
assert.equal(restored.onboarded, true, 'existing onboarding must survive startup');
assert.equal(restored.profile.name, 'Existing user');
assert.equal(restored.habits.length, 1);
assert.equal(restored.log['2026-09-29'].done[0], 'study');
assert.equal(restored.focus.sessions.length, 1);
assert.match(restored.focus.active.goalDate, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(restored.theme, 'dark', 'retired themes migrate consistently');
assert.equal(context.normalizeState(restored).theme, 'dark', 'appearance stays stable on the next reload');
console.log('Startup state passed: legacy Focus data and appearance preserve the saved account.');

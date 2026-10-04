const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
function between(first, last) {
  const start = source.indexOf(first);
  const end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const adaptive = require('../js/adaptive-day.js');
const support = require('../js/day-support.js');
const context = {
  currentDay: '2026-09-09', sheet: null, formIds: ['2'], notices: [],
  S: {
    daySupport: support.normalize(null),
    adaptive: { date: '2026-09-09', mode: 'full', essentialIds: ['2'] },
    habits: [
      { id: 1, name: 'Read 10 pages', min: 'Read 1 page', cat: 'learn' },
      { id: 2, name: 'Walk 20 minutes', min: 'Walk 3 minutes', cat: 'body' },
      { id: 3, name: 'Work 30 minutes', min: 'Work 5 minutes', cat: 'work' },
      { id: 4, name: 'Already kept', min: '1 minute', cat: 'learn' },
      { id: 5, name: 'Skipped', min: '1 minute', cat: 'learn' },
      { id: 6, name: 'Off schedule', min: '1 minute', cat: 'learn' },
    ],
    log: { '2026-09-09': { done: [4], min: [], skip: [5] } },
    focus: { active: null, pendingCompletion: null },
  },
  Arc90DaySupport: support,
  todayKey: () => context.currentDay,
  scheduledFor: h => h.id !== 6,
  statusOf: (id, date) => ['done', 'min', 'skip'].find(key => context.S.log[date]?.[key]?.includes(id)) || null,
  adaptiveMode: () => adaptive.modeForDay(context.S.adaptive, context.currentDay),
  adaptiveTarget: h => adaptive.targetForHabit(h, context.adaptiveMode(), context.S.adaptive.essentialIds),
  render() {}, save() {}, closeSheet() { context.sheet = null; },
  showNudge(message) { context.notices.push(message); },
  document: {
    querySelector: () => ({ scrollIntoView() {}, focus() {} }),
    querySelectorAll: () => context.formIds.map(value => ({ value })),
  },
};
vm.createContext(context);
vm.runInContext(between('function daySupport()', 'function daySupportPanels()'), context);
vm.runInContext(`function dispatch(act, id) { switch (act) {
  ${between("    case 'support-capacity':", "    case 'adaptive-mode':")}
  ${between("    case 'adaptive-save':", "    case 'adaptive-reset-hints':")}
} }`, context);
const act = context.dispatch;
const history = JSON.stringify(context.S.log);
act('support-capacity', '7');
assert.equal(context.daySupport().capacity, null);
act('support-capacity', '15');
assert.equal(context.daySupport().capacity, 15);
assert.equal(context.adaptiveMode(), 'full');
assert.deepEqual(context.supportPlan().items.map(item => item.id), ['1', '2', '3']);
act('support-plan');
context.S.log[context.currentDay].done.push(1);
act('support-apply');
assert.equal(context.adaptiveMode(), 'full', 'changed preview requires another confirmation');
assert.match(context.notices.at(-1), /Review the updated/);
act('support-apply');
assert.equal(context.adaptiveMode(), 'busy');
assert.deepEqual(Array.from(context.daySupport().picks), ['2', '3']);
context.S.log[context.currentDay].done.pop();
assert.equal(JSON.stringify(context.S.log), history);

act('support-friction', 'energy');
act('support-help');
assert.equal(context.adaptiveMode(), 'busy');
context.currentDay = '2026-09-10';
act('adaptive-save');
assert.equal(context.adaptiveMode(), 'full', 'yesterday\'s energy choice cannot apply Recovery today');
assert.equal(context.daySupport().capacity, null);
assert.equal(context.daySupport().friction, '');
act('support-friction', 'energy');
act('support-help');
act('adaptive-save');
assert.equal(context.adaptiveMode(), 'recovery');
assert.equal(context.supportFocusHabit().id, 2, 'a pending essential comes before optional focus habits');
act('support-friction', 'distractions');
act('support-help');
assert.equal(context.sheet.type, 'ritual');
assert.equal(context.S.focus.active, null, 'opening the ritual does not start a timer');
act('support-friction', 'unsure');
act('support-help');
act('support-pick', '2');
assert.deepEqual(Array.from(context.daySupport().picks), ['2']);
act('support-capacity', '5');
act('support-plan');
context.currentDay = '2026-09-11';
act('support-apply');
assert.equal(context.adaptiveMode(), 'full');
assert.equal(context.daySupport().picks.length, 0);
assert.equal(JSON.stringify(context.S.log), history);
act('support-friction', 'time');
act('support-help');
assert.equal(context.adaptiveMode(), 'busy');
act('support-capacity', '30');
act('support-reset', 'capacity');
assert.equal(context.daySupport().capacity, null);
assert.equal(context.daySupport().friction, 'time');
console.log('Day support flows passed: explicit approval, stale previews, rollover, essentials, focus, and unchanged history.');

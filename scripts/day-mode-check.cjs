const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const adaptive = require('../js/adaptive-day.js');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
function between(first, last) {
  const start = source.indexOf(first);
  const end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const todayView = between('function viewToday()', 'function adaptiveMode()');
assert.match(todayView, /class="today-meta"/);
assert.match(todayView, /data-act="daymode-open"/);
assert.equal((todayView.match(/adaptiveNextMovePanel\(total, scheduled\.length\)/g) || []).length, 1,
  'Today renders exactly one next-move decision');
assert.ok(!todayView.includes('adaptiveDayPanel()'), 'day options no longer occupy a standalone section');
assert.match(between('function viewSheet()', 'function sheetPaywall()'), /sheet.type === 'daymode'.*adaptiveDayPanel\(\)/);
assert.match(between('function adaptiveDayPanel()', 'function bestHabitWindow('), /adaptive-support-grid.*daySupportPanels\(\)/,
  'capacity and friction stay available inside the day-mode sheet');
assert.match(between('function adaptiveDayPanel()', 'function bestHabitWindow('), /adaptiveRecommendation\(\).*Suggested.*adaptive-recommend/s,
  'the day-mode sheet explains and applies one recommendation');
const rollover = between('let lastAdaptiveDay = todayKey()', '/* sticky glass header');
assert.match(rollover, /function closeStaleAdaptiveSheet\(\).*sheet\?\.type === 'daymode'.*sheet\?\.type === 'adaptive'/s,
  'midnight only dismisses stale Adaptive Day sheets');
assert.doesNotMatch(rollover, /lastAdaptiveDay = day;\s*sheet = null/,
  'midnight preserves unrelated editors');
const nextMoveView = between('function adaptiveNextMovePanel(', 'function adaptiveDayPanel()');
assert.match(nextMoveView, /needsEssential.*Choose today’s essential/s);
assert.match(nextMoveView, /data-act="adaptive-window"/, 'best-window evidence remains actionable');

const context = {
  currentDay: '2026-09-09', sheet: null, saves: 0, notices: [], formIds: [],
  recommendationMode: 'busy',
  S: {
    habits: [{ id: 1 }, { id: 2 }],
    adaptive: { date: '2026-09-09', mode: 'full', essentialIds: ['1'] },
    log: { '2026-09-09': { done: [1], min: [], skip: [] } },
  },
  todayKey: () => context.currentDay,
  render() {}, save() { context.saves++; },
  closeSheet() { context.sheet = null; },
  showNudge(message) { context.notices.push(message); },
  adaptiveRecommendation() { return { mode: context.recommendationMode }; },
  document: { querySelectorAll: () => context.formIds.map(value => ({ value })) },
};
vm.createContext(context);
vm.runInContext(`function dispatch(act, id) { switch (act) {
  ${between("    case 'daymode-open':", "    case 'adaptive-reset-hints':")}
} }`, context);
const act = context.dispatch;
const history = JSON.stringify(context.S.log);
const mode = () => adaptive.modeForDay(context.S.adaptive, context.currentDay);
for (const id of ['busy', 'full', 'recovery']) {
  act('daymode-open');
  assert.equal(context.sheet.type, 'daymode');
  act('adaptive-mode', id);
  assert.equal(mode(), id);
  assert.equal(context.sheet, null, 'choosing a mode closes the compact selector');
}
act('daymode-open');
act('adaptive-mode', 'invalid');
assert.equal(context.sheet.type, 'daymode');
assert.equal(context.saves, 3);
act('adaptive-essentials');
assert.equal(context.sheet.type, 'adaptive');
context.closeSheet();
assert.equal(mode(), 'recovery', 'cancelling essentials preserves the selected mode');

act('adaptive-mode', 'busy');
context.S.adaptive.essentialIds = [];
act('daymode-open');
act('adaptive-mode', 'recovery');
assert.equal(context.sheet.type, 'adaptive');
assert.equal(context.sheet.pendingMode, 'recovery');
assert.equal(mode(), 'busy', 'Recovery requires an essential before it is applied');
act('adaptive-save');
assert.equal(context.sheet.type, 'adaptive', 'empty essentials cannot be saved');
context.formIds = ['2'];
act('adaptive-save');
assert.equal(mode(), 'recovery');
assert.equal(context.sheet, null);
assert.deepEqual(Array.from(context.S.adaptive.essentialIds), ['2']);

context.S.adaptive.essentialIds = [];
act('daymode-open');
act('adaptive-mode', 'recovery');
context.currentDay = '2026-09-10';
act('adaptive-save');
assert.equal(context.sheet, null);
assert.equal(mode(), 'full', 'a stale Recovery sheet cannot change the new day');
assert.match(context.notices.at(-1), /new day/);
assert.equal(JSON.stringify(context.S.log), history, 'mode changes never rewrite check-offs');

context.currentDay = '2026-09-11';
context.S.adaptive.essentialIds = ['1'];
act('daymode-open');
act('adaptive-recommend', 'busy');
assert.equal(mode(), 'busy');
assert.equal(context.sheet, null);
assert.match(context.notices.at(-1), /check-offs are unchanged/);

act('daymode-open');
context.currentDay = '2026-09-12';
act('adaptive-recommend', 'busy');
assert.equal(context.sheet, null);
assert.match(context.notices.at(-1), /new day/);

act('daymode-open');
context.recommendationMode = 'full';
act('adaptive-recommend', 'busy');
assert.equal(context.sheet.type, 'daymode');
assert.match(context.notices.at(-1), /signals changed/);
console.log('Day mode passed: compact placement, mode selection, essentials, cancellation, rollover and unchanged check-offs.');

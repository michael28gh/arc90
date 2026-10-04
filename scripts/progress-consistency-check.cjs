const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const between = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));
let mode = 'full';
let habits = Array.from({ length: 8 }, (_, id) => ({ id, optional: id > 1 }));
const context = {
  todayKey: () => '2026-09-19', actionable: () => habits,
  adaptiveMode: () => mode, adaptiveTarget: h => h,
  isCompleted: id => id < 6,
};
vm.createContext(context);
vm.runInContext(between('function todayCompletion()', 'function buildTodayCanvas()'), context);
const before = JSON.stringify(habits);
assert.equal(context.todayCompletion().pct, 75);
mode = 'busy';
assert.equal(context.todayCompletion().pct, 75);
mode = 'recovery';
assert.equal(context.todayCompletion().total, 2);
assert.equal(context.todayCompletion().pct, 100);
assert.equal(context.todayCompletion().scheduled.length, 8);
assert.equal(JSON.stringify(habits), before, 'Counting must never alter habits');
habits = [];
assert.equal(context.todayCompletion().total, 0);
assert.equal(context.todayCompletion().frac, 0);
for (const [from, to] of [
  ['function buildTodayCanvas()', '// Shared inputs for the alternate'],
  ['function cardCommon()', 'function cardFittedText('],
  ['function viewToday()', 'const JOURNAL_PROMPTS'],
]) assert.match(between(from, to), /todayCompletion\(\)/);

vm.runInContext(between('function storyTruncate(', 'function storyWrapLines('), context);
vm.runInContext(between('function cardFittedText(', 'function cardBg('), context);
let result;
const ctx = {
  font: '',
  measureText(text) { return { width: text.length * parseFloat(this.font.match(/(\d+)px/)[1]) * .6 }; },
  fillText(text) { result = text; },
};
context.cardFittedText(ctx, 'A very long name and attribution '.repeat(12), 540, 100, 840, 36, 'Arial');
assert.ok(ctx.measureText(result).width <= 840);
assert.match(result, /…$/);
context.cardFittedText(ctx, 'Short source', 540, 100, 840, 36, 'Arial');
assert.equal(result, 'Short source');
assert.match(ctx.font, /36px/);

const NativeDate = Date;
context.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-09-19T12:00:00Z'])); }
};
let rate = 0;
Object.assign(context, {
  startDate: () => new NativeDate('2026-09-18T00:00:00Z'),
  atMidnight: date => new NativeDate(date.toISOString().slice(0, 10) + 'T00:00:00Z'),
  addDays: (date, n) => new NativeDate(+date + n * 86400000),
  dkey: date => date.toISOString().slice(0, 10), niceDate: date => date,
  rateFor: () => rate,
});
vm.runInContext(between('function arcHistoryCells(', '/* ============================================================\n   COACH'), context);
let grid = context.grid90();
assert.match(grid, /Day 1, 2026-09-18: Missed/);
assert.match(grid, /Day 2, 2026-09-19: Not started yet/);
assert.equal((grid.match(/aria-current="date"/g) || []).length, 1);
assert.match(grid, /disabled aria-label="Day 3, future"/);
rate = 1;
assert.match(context.grid90(), /Day 2, 2026-09-19: Complete/);
rate = null;
assert.match(context.grid90(), /Day 2, 2026-09-19: Rest day/);
console.log('Progress consistency passed: Full/Busy/Recovery counts, empty days, fitted export text and pending-today calendar state.');

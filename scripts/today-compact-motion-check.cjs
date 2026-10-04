const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/approved-design.css'), 'utf8');
const between = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
};
const NativeDate = Date;
const now = new NativeDate(2026, 8, 22, 12);
let arcStart = new NativeDate(2026, 8, 22);
const dkey = date => date.toLocaleDateString('en-CA');
const addDays = (date, n) => { const d = new NativeDate(date); d.setDate(d.getDate() + n); return d; };
const rates = new Map();
const context = {
  Date: class extends NativeDate { constructor(...args) { super(...(args.length ? args : [+now])); } },
  DAY_MS: 86400000, dkey, addDays, todayKey: () => dkey(now), niceDate: date => date,
  startDate: () => arcStart,
  operationalDate: () => new NativeDate(now),
  atMidnight: date => new NativeDate(date.getFullYear(), date.getMonth(), date.getDate()),
  dayNumber: () => Math.max(1, Math.min(90, Math.round((now - arcStart) / 86400000) + 1)),
  rateFor: date => rates.has(date) ? rates.get(date) : 0,
};
vm.createContext(context);
vm.runInContext('let todayHistoryExpanded = false;\n' +
  between('function todayHistoryPanel()', 'function viewToday()') +
  between('function arcHistoryCells(', '/* ============================================================\n   COACH'), context);
const recent = () => context.todayHistoryPanel().split('class="grid90 history-recent">')[1].split('</div>')[0];
assert.equal((recent().match(/<button/g) || []).length, 7);
assert.equal((recent().match(/disabled/g) || []).length, 6, 'Day one shows upcoming dates, not invented history');
for (const age of [6, 89, 103]) {
  arcStart = addDays(context.atMidnight(now), -age);
  const row = recent();
  assert.equal((row.match(/<button/g) || []).length, 7);
  assert.equal((row.match(/aria-current="date"/g) || []).length, 1, 'Recent days must include today, even after day 90');
  assert.ok(row.includes(`data-id="${dkey(now)}"`));
  assert.ok(row.includes(`data-id="${dkey(addDays(now, -6))}"`));
  assert.doesNotMatch(row, /disabled/);
  assert.equal((context.grid90().match(/<button/g) || []).length, 90, 'The full arc always contains 90 dates');
}
rates.set(dkey(now), 1);
assert.match(recent(), /class="cell l3 now"/);
rates.set(dkey(now), .5);
assert.match(recent(), /class="cell l2 now"/);
rates.set(dkey(now), null);
assert.match(recent(), /class="cell rest now"/);

const attributes = {}, label = {}, content = { inert: true, setAttribute: (key, value) => { attributes[key] = value; } };
const button = { setAttribute: (key, value) => { attributes[key] = value; }, querySelector: () => label };
const panel = { dataset: {}, querySelector: selector => selector === '.history-disclosure' ? content : button };
context.document = { querySelector: () => panel };
context.toggleTodayHistory();
assert.equal(attributes['aria-expanded'], 'true');
assert.equal(attributes['aria-hidden'], 'false');
assert.equal(content.inert, false);
assert.equal(label.textContent, 'Less');
assert.match(context.todayHistoryPanel(), /data-expanded="true"/, 'Expansion survives habit and signal rerenders');
context.toggleTodayHistory();
assert.equal(attributes['aria-expanded'], 'false');
assert.equal(content.inert, true);
assert.equal(label.textContent, '90 days');
context.document.querySelector = () => null;
context.toggleTodayHistory();

let reduced = false, classes = [];
context.Arc90Motion = { reduced: () => reduced };
context.window = { matchMedia: () => ({ matches: reduced }) };
context.document = {
  hidden: false,
  querySelectorAll: () => [false, true].map(full => ({ classList: {
    contains: name => name === 'l3' && full, add: name => classes.push(name),
  } })),
};
vm.runInContext(between('function animateHistoryProgress(', 'function animateHabitProgress('), context);
context.animateHistoryProgress(true);
assert.deepEqual(classes, ['history-updated', 'history-fulfilled']);
classes = [];
context.animateHistoryProgress(false);
reduced = true;
context.animateHistoryProgress(true);
reduced = false; context.document.hidden = true;
context.animateHistoryProgress(true);
assert.deepEqual(classes, [], 'Undo, hidden tabs and Reduce Motion do not celebrate');

const tile = between('function adaptiveHabitTile(', 'function adaptiveHabitsPanel(');
assert.doesNotMatch(tile, /adaptive-habit-icon|h\.emoji|shortHabitName/);
assert.match(tile, /esc\(h.name\)/);
assert.match(css, /\.adaptive-habit-item\.just-completed \{ animation:habit-confirm 220ms/);
assert.match(css, /\.history-disclosure \{[^}]*grid-template-rows:0fr/);
assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.history-disclosure[\s\S]*transition:none/);
assert.match(css, /\.water-stepper button \{ width:44px; height:44px/);
assert.match(css, /@media \(max-width: 350px\)[\s\S]*\.today-signals \{ grid-template-columns:1fr; \}/);
assert.match(css, /\.today-mood > \* \{ grid-column:var\(--mood-position\); grid-row:1; \}/);
assert.match(source, /--mood-position:\$\{selected \+ 1\}/);
assert.match(css, /\.history-updated,[\s\S]*animation: none !important/);
console.log('Compact Today passed: seven-day boundaries, 90-day expansion, persistent disclosure, small text-first controls and reduced motion.');

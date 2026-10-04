const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/approved-design.css'), 'utf8');
const between = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
};
const context = { S: { theme: 'light' }, mqLight: { matches: true } };
vm.createContext(context);
vm.runInContext(between('function cardTheme()', 'function buildTodayCanvas()'), context);
const layout = context.todayShareLayout();
assert.ok(layout.statsY > layout.ringY + layout.ringRadius + layout.ringStroke / 2 + 30);
assert.ok(layout.reflectionLabelY > layout.statsY + layout.statsHeight + 22);
assert.ok(layout.quoteY > layout.reflectionLabelY + 42);
assert.equal(context.cardTheme().accent, '#28613c');
context.S.theme = 'auto';
assert.equal(context.cardTheme().accent, '#28613c');
context.mqLight.matches = false;
assert.equal(context.cardTheme().accent, '#b3dfbd');
context.S.theme = 'mono';
assert.equal(context.cardTheme().accent, '#b3dfbd');

// Execute the production renderer, checking 75% / 100%, long quotes and 8 habits.
const draws = [];
const ctx = new Proxy({
  fillText(text, x, y) { draws.push({ text, x, y, font: this.font }); },
  measureText: text => ({ width: text.length * 18 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
}, { get(target, key) { return key in target ? target[key] : () => {}; } });
const canvas = { getContext: () => ctx };
let completed = 6;
Object.assign(context, {
  document: { createElement: () => canvas },
  todayKey: () => '2026-09-14',
  adaptiveMode: () => 'full', adaptiveTarget: () => ({ optional: false }),
  actionable: () => Array.from({ length: 8 }, (_, id) => ({ id, name: `Habit ${id}` })),
  isCompleted: id => id < completed,
  reflectionQuote: () => ({ quote: 'Long reflection', source: 'Test source' }),
  storyWrapLines: () => ['First line', 'Second line', 'Third line'],
  storyRoundRect() {}, storyTruncate: (_, text) => text,
  dayStreak: () => 2, dayNumber: () => 83, vitality: () => ({ score: 86 }), momentum: () => 33,
  startDate: () => new Date('2026-06-24T12:00:00Z'), atMidnight: d => d,
  addDays: (d, i) => new Date(d.getTime() + i * 86400000),
  dkey: d => d.toISOString().slice(0, 10), rateFor: () => 0.75,
});
context.S.profile = { name: 'Michael' };
vm.runInContext(between('function buildTodayCanvas()', '// Shared inputs for the alternate'), context);
vm.runInContext(between('function cardFittedText(', 'function cardBg('), context);
for (completed of [6, 8]) {
  draws.length = 0;
  const output = context.buildTodayCanvas();
  assert.ok(draws.some(d => d.text === (completed === 6 ? '75%' : '100%')));
  const readiness = draws.find(d => d.text === '86');
  assert.ok(readiness.y - 42 > layout.ringY + layout.ringRadius + layout.ringStroke / 2);
  const habit = draws.find(d => d.text === 'Habit 0');
  const credit = draws.find(d => d.text === '\u2014 Test source');
  assert.ok(habit.y - 34 > credit.y + 40);
  assert.ok(draws.every(d => d.y < output.height));
}

let available = true, enrolled = false;
Object.assign(context, {
  esc: s => s,
  window: { Arc90PreviewAccess: { available: () => available, enrolled: () => enrolled, active: () => false, endsAt: '2026-10-31T00:00:00-07:00' } },
});
vm.runInContext(between('function previewAccessPanel()', 'function productReadinessCard()'), context);
assert.match(context.previewAccessPanel(), /previewAccessSwitch/, 'new devices must be able to opt in');
available = false;
assert.equal(context.previewAccessPanel(), '');
enrolled = true;
assert.match(context.previewAccessPanel(), /disabled/);
assert.match(source, /<details class="profile-updates">/);
assert.doesNotMatch(source, /<details class="profile-updates" open/);
assert.match(css, /\.hero-card \.ring-center \.big-num \{ font-size:24px/);
assert.match(css, /\.hero-card \.ring-center \.of \{ margin:0; font-size:9px/);
console.log('Share/Profile checks passed: ring clearance, palette, 75% and 100% exports, 8 habits, long quotes, preview enrollment and collapsed newsletter.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/approved-design.css'), 'utf8');
const today = app.slice(app.indexOf('function viewToday()'), app.indexOf('const JOURNAL_PROMPTS'));
// Goal-first Today: one check-in row, the arc, the next move, habits by goal, tasks.
const order = ['${planningQuickAccess()}', 'hero-card', '${adaptiveNextMovePanel(', '${adaptiveHabitsPanel()}', '${todayTasksPanel()}', '${todaySignalsPanel()}'];
order.reduce((last, marker) => { const at = today.indexOf(marker); assert.ok(at > last, `${marker} keeps its place`); return at; }, -1);
for (const gone of ['${todayHistoryPanel()}', '${dailyReflectionCard()}', '${morningConsole(', 'readiness']) assert.ok(!today.includes(gone), `${gone} is not on Today`);
assert.equal((today.match(/S.profile.goal/g) || []).length, 1);
assert.match(today, /class="metric-context">\$\{weekTone\}/);
assert.match(app, /const byGoal = \(habits\) =>/, 'today essentials are grouped by goal');

// Trackers: saved choice wins; older data opts in only with recent use; new users start off.
const vm = require('node:vm');
const fn = app.slice(app.indexOf('function normalizeTrackers('), app.indexOf('function normalizeState('));
const ctx = {}; vm.createContext(ctx); vm.runInContext(fn, ctx);
const recent = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
const old = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
assert.deepEqual({ ...ctx.normalizeTrackers({ preferences: { trackers: { water: true, mood: false } } }) }, { water: true, mood: false });
assert.deepEqual({ ...ctx.normalizeTrackers({ health: { water: { [recent]: 3 } }, log: { [old]: { mood: 'steady' } } }) }, { water: true, mood: false });
assert.deepEqual({ ...ctx.normalizeTrackers({}) }, { water: false, mood: false });
assert.match(app, /if \(!trackers.water && !trackers.mood\) return '';/, 'signals panel hides when both trackers are off');
assert.match(app, /focusable \? 'Start' : 'Complete'/);
assert.match(css, /\.cell\.missed::after \{ content:none; \}/);
assert.match(css, /\.cell\.now \{ outline: 2px solid/);
assert.match(css, /\[data-theme="light"\] \.tabbar,[\s\S]*?background:transparent; box-shadow:none/);
assert.match(css, /\.today-header h1 \{ font-size:23px/);
console.log('Today hierarchy passed: goal-first order, removed clutter, grouped habits, opt-in trackers.');

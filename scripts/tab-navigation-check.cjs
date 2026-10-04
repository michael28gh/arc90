const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(__dirname, '../js/progress-dashboard.js'), 'utf8');
const workspace = fs.readFileSync(path.join(__dirname, '../js/daily-workspace.js'), 'utf8');
function section(from, to) {
  const a = source.indexOf(from), b = source.indexOf(to, a);
  assert(a >= 0 && b > a, `Missing section ${from}`);
  return source.slice(a, b);
}

const renders = [], focuses = [], scrolls = [];
const context = {
  tab: 'today', tabDirection: 'next', navOpen: true, moreOpen: false, openQA: 'fixture', appRoom: 'fixture',
  S: { premium: true }, ICONS: Object.fromEntries(['today', 'habits', 'progress', 'profile', 'focus', 'coach', 'protocol', 'sleep', 'vitals'].map(x => [x, `[${x}]`])),
  app: { querySelector() { return { focus(options) { focuses.push(options.preventScroll); } }; } },
  window: { scrollTo(options) { scrolls.push(options); } },
  render() { renders.push(context.tab); },
  requestAnimationFrame() {}, animateTodayArc() {}, esc: x => x,
  document: {},
};
vm.createContext(context);
vm.runInContext([
  section('function previewAccessActive()', 'function isDevHost()'),
  section('const TAB_ORDER =', 'let lastRenderedTab'),
  section('function tabBtn(', 'function sideNavBtn('),
  section('function switchTab(next)', 'function logoMarkSvg('),
].join('\n'), context);

const config = JSON.parse(vm.runInContext('JSON.stringify({ TAB_ORDER, TOOL_GROUPS })', context));
assert.deepEqual(config.TAB_ORDER, ['today', 'progress', 'habits', 'dashboard', 'profile']);
assert.equal(config.TAB_ORDER.length, 5);
assert.deepEqual(config.TOOL_GROUPS.flatMap(group => group.items.map(item => item.id)), ['focus', 'coach', 'protocol', 'sleep', 'vitals']);
for (const id of ['focus', 'coach', 'protocol', 'sleep', 'vitals']) assert.equal(context.mainTabOf(id), 'dashboard');
for (const id of ['plan', 'brain']) assert.equal(context.mainTabOf(id), 'progress');
for (const id of config.TAB_ORDER) assert.equal(context.mainTabOf(id), id);
assert.equal(context.mainTabOf('unknown'), 'today');
assert.match(source, /tabBtn\('dashboard', 'Progress', ICONS\.progress\)/);
assert.match(dashboard, /function dashboardTools\(\)/);
assert.match(dashboard, /data-act="more-toggle" aria-label="Open Lab"/);
assert.match(workspace, /\['map','Map'\]/);
assert.match(workspace, /\['brain','Capture'\]/);
assert.match(workspace, /\['ideas','Tasks'\]/);

const taps = ['progress', 'habits', 'dashboard', 'focus', 'coach', 'protocol', 'sleep', 'vitals', 'profile', 'plan', 'brain', 'today'];
for (const id of taps) {
  context.switchTab(id);
  assert.equal(context.tab, id);
  assert.equal(context.navOpen, false);
  assert.equal(context.moreOpen, false);
  assert.equal(focuses.at(-1), true);
}
assert.deepEqual(renders, taps);
assert.equal(scrolls.length, taps.length);
assert(scrolls.every(x => x.top === 0 && x.left === 0));
const unchanged = JSON.stringify([context.tab, renders, scrolls]);
context.switchTab(context.tab);
for (const bad of ['invalid', 'tools', null, {}, 0]) context.switchTab(bad);
assert.equal(JSON.stringify([context.tab, renders, scrolls]), unchanged);
console.log('Tab navigation checks passed: five tabs, Arc workspace, Progress tools, and route transitions.');

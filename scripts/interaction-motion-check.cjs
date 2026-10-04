const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/approved-design.css'), 'utf8');
const start = source.indexOf('function animateSignalFeedback(');
const end = source.indexOf('let todayArcMotion =', start);
assert.ok(start >= 0 && end > start);
const makeNode = (act, id) => ({
  dataset: { act, id }, disabled: false, focused: false, classes: [], styles: {},
  classList: { add(name) { this.owner.classes.push(name); } },
  style: { setProperty(key, value) { this.owner.styles[key] = value; } },
  focus(options) { assert.equal(options.preventScroll, true); this.focused = true; },
  getAttribute: () => '91.10625',
});
const nodes = [makeNode('water-add'), makeNode('water-sub'), makeNode('mood-quick', 'steady'), makeNode(), makeNode()];
for (const node of nodes) { node.classList.owner = node; node.style.owner = node; }
const [add, sub, mood, count, ring] = nodes;
const context = {
  reduced: false,
  Arc90Motion: { reduced: () => context.reduced },
  S: { health: { settings: { waterGoal: 8 } } },
  window: { matchMedia: () => ({ matches: context.reduced }) },
  document: {
    querySelectorAll: () => nodes.slice(0, 3),
    querySelector: selector => ({ '[data-act="water-add"]': add, '.water-stepper strong': count, '.hero-card .ring-fill': ring })[selector],
  },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
context.animateSignalFeedback('water-add');
assert.equal(add.focused, true);
assert.ok(add.classes.includes('signal-confirm'));
assert.equal(count.styles['--signal-travel'], '6px');
assert.ok(count.classes.includes('signal-count-tick'));
sub.disabled = true; add.focused = false;
context.animateSignalFeedback('water-sub');
assert.equal(add.focused, true, 'At zero, focus returns to the enabled plus button');
assert.equal(sub.focused, false);
assert.equal(count.styles['--signal-travel'], '-6px');
context.animateSignalFeedback('mood-quick', 'steady');
assert.equal(mood.focused, true);
assert.ok(mood.classes.includes('signal-confirm'));
const animated = [];
const record = (frames, options) => { animated.push({ frames, options }); return { finished: Promise.resolve() }; };
const fill = { style: { getPropertyValue: () => '.375' }, animate: record };
const cursor = { animate: record, getBoundingClientRect: () => ({ left: 40, top: 80, width: 50, height: 44 }) };
const originalQuery = context.document.querySelector;
context.document.querySelector = selector => ({ '.water-progress > span': fill, '.today-mood .mood-cursor': cursor })[selector] || originalQuery(selector);
context.animateSignalFeedback('water-add', undefined, { water: 2 });
assert.equal(animated[0].frames[0].transform, 'scaleX(0.25)');
assert.equal(animated[0].frames[1].transform, 'scaleX(.375)');
context.animateSignalFeedback('mood-quick', 'steady', { moodRect: { left: 10, top: 30, width: 50, height: 44 } });
assert.equal(animated[1].frames[0].transform, 'translate(-30px, -50px) scale(1, 1)');
assert.equal(animated[1].options.duration, 220);
context.animateSignalFeedback('mood-quick', 'steady');
assert.equal(animated[2].frames[0].opacity, 0, 'First selection fades in without a fabricated starting position');
const outgoing = { setAttribute(key, value) { this[key] = value; }, animate: record, remove() {} };
context.document.createElement = () => outgoing;
count.querySelector = () => ({ textContent: '3', animate: record });
count.appendChild = node => { count.child = node; };
count.classList.remove = () => {};
context.animateSignalFeedback('water-add', undefined, { water: 2 });
assert.equal(animated[3].frames[0].transform, 'translateY(100%)');
assert.equal(animated[4].frames[1].transform, 'translateY(-100%)');
assert.equal(outgoing['aria-hidden'], 'true');
assert.equal(outgoing.textContent, '2');
assert.equal(count.child, outgoing);
count.querySelector = () => ({ textContent: '2', animate: record });
context.animateSignalFeedback('water-sub', undefined, { water: 3 });
assert.equal(animated[6].frames[0].transform, 'translateY(-100%)');
assert.equal(animated[7].frames[1].transform, 'translateY(100%)');
for (const previous of [0, 364.425, 182.2125]) {
  context.animateHabitProgress(previous);
  assert.equal(ring.styles['--previous-arc-offset'], String(previous));
  assert.equal(ring.styles['--next-arc-offset'], '91.10625');
}
const before = ring.classes.length;
context.animateHabitProgress(NaN);
assert.equal(ring.classes.length, before);
context.reduced = true;
const animationCount = animated.length;
nodes.forEach(node => { node.classes.length = 0; node.focused = false; });
context.animateSignalFeedback('mood-quick', 'steady');
context.animateSignalFeedback('water-sub');
context.animateHabitProgress(0);
assert.equal(mood.focused, true, 'Reduced motion does not remove keyboard focus');
assert.equal(add.focused, true);
assert.ok(nodes.every(node => node.classes.length === 0));
assert.equal(animated.length, animationCount, 'Reduce Motion suppresses number rolling and selection gliding');
context.document.querySelector = () => null;
context.document.querySelectorAll = () => [];
context.reduced = false;
context.animateSignalFeedback('water-add');
context.animateHabitProgress(100);
assert.match(source, /range === progressRange/);
assert.match(source, /getComputedStyle\(activeArcRing\)\.strokeDashoffset/);
assert.match(source, /path pathLength="1"/);
assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
assert.match(css, /\.chart-refresh \.approved-bar/);
assert.match(css, /\.signal-count-tick,[\s\S]*animation: none !important/);
console.log('Interaction motion passed: directional feedback, focus, precise ring updates, missing elements and reduced motion.');

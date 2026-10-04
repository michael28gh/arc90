const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'story-mode.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'story-mode.css'), 'utf8');
assert.match(css, /aspect-ratio:\s*4\s*\/\s*5/);

let now = 100;
let rafId = 0;
const frames = new Map();
const painted = [];
const downloads = [];

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.disabled = false;
    this.classList = { add: (value) => { this.className += ` ${value}`; } };
  }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) { this.children.push(node); node.parent = this; return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  get firstChild() { return this.children[0]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  removeEventListener(name, callback) { this.listeners[name] = (this.listeners[name] || []).filter((item) => item !== callback); }
  dispatch(name, event = {}) { (this.listeners[name] || []).forEach((callback) => callback(event)); }
  click() { if (this.tagName === 'A') downloads.push(this.download); this.dispatch('click'); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  focus() { document.activeElement = this; }
  getBoundingClientRect() { return { left: 0, width: 400 }; }
  setPointerCapture() {}
  getContext() {
    const calls = [];
    painted.push({ canvas: this, calls });
    return {
      fillRect: (...args) => calls.push(['rect', ...args]),
      fillText: (...args) => calls.push(['text', ...args]),
      measureText: (value) => ({ width: value.length * 15 }),
      set fillStyle(value) {}, set font(value) {}, set textAlign(value) {}, set textBaseline(value) {},
    };
  }
  toBlob(callback) { callback({ type: 'image/png' }); }
}

const document = {
  body: new FakeElement('body'),
  activeElement: null,
  hidden: false,
  listeners: {},
  createElement: (tag) => new FakeElement(tag),
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
  removeEventListener(name, callback) { this.listeners[name] = (this.listeners[name] || []).filter((item) => item !== callback); },
  dispatch(name, event = {}) { (this.listeners[name] || []).forEach((callback) => callback(event)); },
};
const context = {
  document,
  window: { matchMedia: () => ({ matches: false }) },
  navigator: {},
  performance: { now: () => now },
  requestAnimationFrame(callback) { const id = ++rafId; frames.set(id, callback); return id; },
  cancelAnimationFrame(id) { frames.delete(id); },
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  setTimeout() {},
};
vm.runInNewContext(source, context, { filename: 'story-mode.js' });
const { open } = context.window.Arc90Story;

function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
function byLabel(label) { return find(document.body, (node) => node.attributes['aria-label'] === label); }
function textOf(node) { return [node.textContent, ...node.children.map(textOf)].join(' '); }
function advance(time) {
  now = time;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(now));
}

assert.throws(() => open(), /plain data object/);
assert.throws(() => open({ data: [] }), /plain data object/);
const prior = new FakeElement('button');
prior.focus();
document.body.style.overflow = 'auto';
let closes = 0;
const controller = open({
  data: {
    title: 'My progress', period: 'This week', day: 12, done: 4, due: 5,
    rows: [{ label: 'Mon', done: 2, due: 3 }, { label: 'Tue', rest: true }],
    habits: [{ name: 'Walk', done: 3, due: 4 }],
  },
  onClose: () => closes++,
});
assert.match(textOf(document.body), /4 \/ 5/);
assert.doesNotMatch(textOf(document.body), /momentum|readiness|streak/i);
assert.equal(document.body.style.overflow, 'hidden');
advance(101);
advance(5101);
assert.match(textOf(document.body), /The timeline/);
assert.match(textOf(document.body), /2 \/ 3/);
byLabel('Share current card').click();
assert.equal(painted.at(-1).canvas.width, 1080);
assert.equal(painted.at(-1).canvas.height, 1350);
assert.ok(painted.at(-1).calls.some((call) => call[0] === 'text' && call[1] === '2 / 3'));
assert.equal(downloads.at(-1), 'arc90-progress-2.png');
byLabel('Next card').click();
assert.match(textOf(document.body), /Habits/);
const stage = find(document.body, (node) => node.className === 'arc90-story-stage');
stage.dispatch('pointerdown', { button: 0, pointerId: 1 });
advance(11000);
assert.match(textOf(document.body), /Habits/);
now = 12000;
stage.dispatch('pointerup', { clientX: 100, pointerId: 1 });
assert.match(textOf(document.body), /Habits/);
stage.dispatch('pointerdown', { button: 0, pointerId: 2 });
now = 12100;
stage.dispatch('pointerup', { clientX: 100, pointerId: 2 });
assert.match(textOf(document.body), /The timeline/);
controller.close();
assert.equal(closes, 1);
assert.equal(document.body.style.overflow, 'auto');
assert.equal(document.activeElement, prior);
assert.equal(frames.size, 0);

const reduced = open({ data: { title: 'Quiet', rows: [{ label: 'Today', pct: 50 }] }, reducedMotion: true });
assert.equal(frames.size, 0);
advance(20000);
assert.match(textOf(document.body), /Quiet/);
byLabel('Next card').click();
assert.match(textOf(document.body), /The timeline/);
assert.equal(frames.size, 0);
reduced.close();

const empty = open({ data: {} });
assert.match(textOf(document.body), /No activity data yet/);
assert.doesNotMatch(textOf(document.body), /0%|0 \/ 0/);
empty.close();

const timed = open({ data: { pct: 40, rows: [{ label: 'Today', detail: 'Sep 29', pct: 40 }] } });
assert.match(textOf(document.body), /Completion/);
const timedStage = find(document.body, (node) => node.className === 'arc90-story-stage');
advance(20100);
now = 20200;
timedStage.dispatch('pointerdown', { button: 0, pointerId: 3 });
advance(27000);
assert.doesNotMatch(textOf(document.body), /The timeline/);
now = 27100;
timedStage.dispatch('pointerup', { clientX: 300, pointerId: 3 });
assert.doesNotMatch(textOf(document.body), /The timeline/);
advance(27200);
advance(32200);
assert.match(textOf(document.body), /The timeline/);
now = 32300;
timedStage.dispatch('pointerdown', { button: 0, pointerId: 4 });
now = 32400;
timedStage.dispatch('pointerup', { clientX: 50, pointerId: 4 });
assert.match(textOf(document.body), /Progress/);
timed.close();

const complete = open({ data: {
  title: 'My arc', day: 60, done: 15, due: 26,
  areas: [{ name: 'Health', done: 4, due: 5 }],
  rhythm: { best: { name: 'Tue', done: 3, due: 4 }, worst: { name: 'Mon', done: 1, due: 4 } },
  habits: [{ name: 'Habit 1', done: 6, due: 7 }],
  purpose: { score: 60, activeGoals: 2, orphanHabits: 1 },
  insight: { text: 'One habit is not linked to a goal.', action: 'Link one in Arc' },
  shareSensitive: false,
}, reducedMotion: true });
assert.equal(byLabel('6 story cards').attributes['aria-label'], '6 story cards');
byLabel('Next card').click();
assert.match(textOf(document.body), /Life balance/);
byLabel('Save current card as PNG').click();
assert.ok(painted.at(-1).calls.some(call => call[0] === 'text' && call[1] === 'Area details hidden for sharing'));
assert.ok(!painted.at(-1).calls.some(call => call[0] === 'text' && call[1] === 'Health'));
for (let i = 0; i < 4; i++) byLabel('Next card').click();
assert.match(textOf(document.body), /Your next move/);
complete.close();
console.log('Story mode checks passed: data fidelity, six cards, private export, 4:5 PNG, timing, hold, navigation, reduced motion, cleanup.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const start = source.indexOf('function captureShellMotion()');
const end = source.indexOf('function animateSignalFeedback(', start);
assert.ok(start >= 0 && end > start);

function fixture() {
  const calls = [];
  const element = (left = 0, width = 24) => ({
    dataset: {}, style: {}, isConnected: true, classes: [],
    getBoundingClientRect: () => ({ left, width, height: 320 }),
    classList: { add(name) { this.owner.classes.push(name); } },
    animate(frames, options) {
      let finish, cancel;
      const finished = new Promise((resolve, reject) => { finish = resolve; cancel = reject; });
      const call = { target: this, frames, options, finished, finish, cancel };
      calls.push(call); return call;
    },
  });
  const nav = element(20, 350), cursor = element(45), active = element(90, 70), icon = element();
  active.dataset.id = 'progress'; active.querySelector = () => icon;
  nav.querySelector = selector => selector === '.tab-cursor' ? cursor : selector === '.tab-btn.active' ? active : null;
  const dialog = element(), backdrop = element(), hero = element();
  dialog.dataset.sheetType = 'daymode';
  hero.classList.owner = hero;
  const context = {
    sheet: { type: 'daymode' }, reduced: false, hasDialog: true, hasHero: true, closed: 0, confettiCount: 0,
    Arc90Motion: { reduced: () => context.reduced },
    completion: { total: 3, done: 3 },
    todayCompletion: () => context.completion,
    closeSheet: () => { context.closed++; context.sheet = null; },
    confetti: () => { context.confettiCount++; },
    getComputedStyle: () => ({ transform: 'matrix(1,0,0,1,0,80)', opacity: '.8' }),
    window: { matchMedia: () => ({ matches: context.reduced }) },
    document: {
      hidden: false,
      querySelector: selector => ({ '.tabbar': nav, '.tab-cursor': cursor,
        '.sheet': context.hasDialog ? dialog : null, '.sheet-bg': backdrop,
        '.hero-card': context.hasHero ? hero : null })[selector],
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, calls, nav, cursor, active, icon, dialog, backdrop, hero };
}

(async () => {
  const f = fixture();
  const previous = f.context.captureShellMotion();
  assert.equal(previous.cursorLeft, 45);
  assert.equal(previous.activeKey, 'progress');
  assert.equal(previous.sheetType, 'daymode');
  f.context.playShellMotion({ cursorLeft: 45, activeKey: 'today', sheetType: 'daymode' });
  assert.equal(f.cursor.style.left, '93px');
  assert.equal(f.calls.length, 2, 'Only the moving cursor and selected icon animate');
  assert.equal(f.calls[0].frames[0].transform, 'translateX(-68px) scaleX(1)');
  assert.equal(f.calls[0].options.duration, 340);
  f.calls.length = 0;
  f.context.playShellMotion({ cursorLeft: 113, activeKey: 'progress', sheetType: undefined });
  assert.equal(f.calls.length, 2, 'A new sheet and backdrop enter once');
  assert.equal(f.calls[0].target, f.dialog);
  f.calls.length = 0;
  f.context.playShellMotion({ cursorLeft: 113, activeKey: 'progress', sheetType: 'daymode' });
  assert.equal(f.calls.length, 0, 'Editing the same sheet does not replay its entrance');
  f.context.reduced = true;
  f.context.playShellMotion({ cursorLeft: 0, activeKey: 'today' });
  assert.equal(f.cursor.style.left, '93px'); assert.equal(f.calls.length, 0);

  const close = fixture();
  close.context.dismissSheet(); close.context.dismissSheet();
  assert.equal(close.calls.length, 2, 'Repeated dismissals share one sheet/backdrop exit');
  assert.equal(close.context.closed, 0);
  assert.equal(close.calls[0].frames[0].transform, 'matrix(1,0,0,1,0,80)', 'Continue from the current drag position');
  close.calls[0].finish(); await Promise.resolve();
  assert.equal(close.context.closed, 1);
  for (const interrupt of [f => { f.context.sheet = { type: 'edit' }; }, f => { f.dialog.isConnected = false; }]) {
    const stale = fixture(); stale.context.dismissSheet(); interrupt(stale);
    stale.calls[0].finish(); await Promise.resolve();
    assert.equal(stale.context.closed, 0, 'An old exit must never close a newer dialog');
  }
  for (const fallback of [f => { f.context.reduced = true; }, f => { f.context.document.hidden = true; }, f => { f.dialog.animate = undefined; }, f => { f.context.hasDialog = false; }]) {
    const instant = fixture(); fallback(instant); instant.context.dismissSheet();
    assert.equal(instant.context.closed, 1); assert.equal(instant.calls.length, 0);
  }
  const cancelled = fixture(); cancelled.context.dismissSheet();
  cancelled.calls[0].cancel(); await Promise.resolve();
  assert.equal(cancelled.context.closed, 1, 'A cancelled animation cannot trap the sheet');

  const win = fixture(); win.context.sheet = null;
  win.context.celebrateTodayCompletion({ total: 3, done: 2 });
  assert.deepEqual(win.hero.classes, ['arc-fulfilled']);
  for (const previous of [{ total: 0, done: 0 }, { total: 3, done: 3 }]) win.context.celebrateTodayCompletion(previous);
  assert.equal(win.hero.classes.length, 1, 'Rest days and already-complete days do not celebrate');
  win.context.completion.done = 2;
  win.context.celebrateTodayCompletion({ total: 3, done: 1 });
  assert.equal(win.hero.classes.length, 1);
  win.context.completion.done = 3; win.context.reduced = true;
  win.context.celebrateTodayCompletion({ total: 3, done: 2 });
  assert.equal(win.hero.classes.length, 1); assert.equal(win.context.confettiCount, 0);

  const events = {}, styles = {};
  let dismissals = 0;
  const sheetEl = { dataset: {}, style: styles, scrollTop: 0,
    addEventListener: (name, callback) => { events[name] = callback; }, getAnimations: () => [] };
  const swipeContext = { document: { querySelector: () => sheetEl }, dismissSheet: () => { dismissals++; } };
  vm.createContext(swipeContext);
  const swipeStart = source.indexOf("  const sheetEl = document.querySelector('.sheet');", source.indexOf('function wireAfterRender()'));
  vm.runInContext(source.slice(swipeStart, source.indexOf('  // Pre-render sleep sounds', swipeStart)), swipeContext);
  const touch = (y, interactive = false) => ({ touches: [{ clientY: y }], target: { closest: () => interactive } });
  events.touchstart(touch(0)); events.touchmove(touch(180)); events.touchcancel();
  assert.equal(dismissals, 0); assert.equal(styles.transform, '');
  events.touchstart(touch(0, true)); events.touchmove(touch(180)); events.touchend();
  assert.equal(dismissals, 0, 'Form controls are not drag handles');
  events.touchstart(touch(0)); events.touchmove(touch(180)); events.touchend();
  assert.equal(dismissals, 1);
  console.log('Shell motion passed: tracking cursor, one-time sheet entry, safe dismissal, cancelled swipes and earned celebration.');
})().catch(error => { console.error(error); process.exitCode = 1; });

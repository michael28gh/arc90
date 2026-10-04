const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const start = source.indexOf('let todayArcMotion =');
const end = source.indexOf('function wireAfterRender()', start);
assert.ok(start >= 0 && end > start);

function fixture(percent = 75) {
  const animations = [], frames = new Map();
  let id = 0, now = 0;
  const node = (attrs = {}) => ({
    dataset: {}, textContent: '',
    getAttribute: key => attrs[key],
    animate(keyframes, options) {
      const animation = { el: this, keyframes, options, cancelled: false,
        cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    },
  });
  const fill = node({ 'stroke-dasharray': '364.425', 'stroke-dashoffset': String(364.425 * (1 - percent / 100)) });
  const selectors = Object.fromEntries(['.hero-topline', '.hero-ring svg', '.arc-intro-trace', '.next-move'].map(key => [key, node()]));
  selectors['.ring-fill'] = fill;
  const counters = [percent, 33].map(target => Object.assign(node(), {
    dataset: { countup: String(target), suffix: '%' }, textContent: target + '%',
  }));
  const metrics = [node(), node(), node()];
  const hero = Object.assign(node(), {
    isConnected: true,
    querySelector: key => selectors[key],
    querySelectorAll: key => key === '[data-countup]' ? counters : metrics,
  });
  const context = {
    tab: 'today', appRoom: null, sheet: null, moreOpen: false,
    reduced: false, quote: false,
    Arc90Motion: { reduced: () => context.reduced },
    performance: { now: () => now },
    window: { matchMedia: () => ({ matches: context.reduced }) },
    document: { hidden: false, querySelector: () => hero, getElementById: () => context.quote },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, hero, fill, counters, selectors, animations, frames,
    tick(time) {
      now = time;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach(callback => callback(now));
    },
  };
}

for (const percent of [0, 75, 100]) {
  const f = fixture(percent);
  f.context.animateTodayArc();
  assert.equal(f.counters[0].textContent, '0%', 'Counters start with the ring, without a one-frame flash');
  const count = f.animations.length;
  assert.equal(count, 8, 'Ring, trace, headline, metrics and next action animate');
  const fillMotion = f.animations.find(a => a.el === f.fill);
  assert.equal(fillMotion.keyframes[0].strokeDashoffset, '364.425');
  assert.equal(fillMotion.keyframes[1].strokeDashoffset, f.fill.getAttribute('stroke-dashoffset'));
  assert.ok(f.animations.every(a => a.options.fill === 'backwards'));
  f.context.animateTodayArc();
  assert.equal(f.animations.length, count, 'Repeated taps do not stack motion');
  f.tick(120);
  assert.equal(f.counters[0].textContent, '0%');
  f.tick(580);
  assert.equal(f.counters[0].textContent, Math.round(percent * .875) + '%');
  f.tick(1200);
  assert.equal(f.counters[0].textContent, percent + '%');
  assert.equal(f.counters[1].textContent, '33%');
  assert.equal(f.frames.size, 0);
  assert.ok(f.animations.every(a => a.cancelled));
  f.context.animateTodayArc();
  assert.equal(f.animations.length, count * 2, 'Each fresh entry can replay');
  f.context.cancelTodayArcAnimation();
}

for (const [key, value] of [['tab', 'focus'], ['appRoom', 'insights'], ['sheet', {}], ['moreOpen', true], ['reduced', true], ['quote', true]]) {
  const f = fixture(); f.context[key] = value;
  f.context.animateTodayArc();
  assert.equal(f.animations.length, 0, `Do not animate with ${key}`);
  assert.equal(f.counters[0].textContent, '75%');
}
for (const stop of [
  f => { f.hero.isConnected = false; },
  f => { f.context.document.hidden = true; },
  f => { f.context.reduced = true; },
  f => { f.context.cancelTodayArcAnimation(); },
]) {
  const f = fixture(); f.context.animateTodayArc(); f.tick(300); stop(f); f.tick(400);
  assert.equal(f.frames.size, 0);
  assert.equal(f.counters[0].textContent, '75%');
  assert.ok(f.animations.every(a => a.cancelled));
}
const fallback = fixture(); fallback.hero.animate = undefined;
fallback.context.animateTodayArc(); assert.equal(fallback.animations.length, 0);
const hidden = fixture(); hidden.context.document.hidden = true;
hidden.context.animateTodayArc(); assert.equal(hidden.animations.length, 0);
const rest = fixture(); rest.hero.querySelectorAll = () => [];
rest.context.animateTodayArc(); rest.tick(1200); assert.equal(rest.frames.size, 0);

assert.match(source, /function render\(\)\s*\{\s*cancelTodayArcAnimation\(\)/);
assert.match(source, /if \(animate && tab === 'today' && !appRoom\) requestAnimationFrame\(animateTodayArc\)/);
assert.match(source, /if \(!animating \|\| el\.closest\('\.hero-card'\)\)/);
assert.match(source, /if \(!wasWriting\) requestAnimationFrame\(animateTodayArc\)/);
console.log('Today entrance passed: true progress, replay, cancellation, modal guards, reduced motion and fallback.');

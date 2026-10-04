const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const start = source.indexOf('function animateLaunchLogo(');
const end = source.indexOf('function showLaunchQuote()', start);
assert.ok(start >= 0 && end > start);

function fixture({ reduced = false, supported = true, fail = false } = {}) {
  const calls = [], listeners = new Map();
  const preference = { matches: reduced,
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event),
  };
  const nodes = new Map();
  const dialog = { querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { animate: supported ? (frames, options) => {
      if (fail && calls.length === 2) throw new Error('Animation unavailable');
      const call = { selector, frames, options, cancelled: false, cancel() { this.cancelled = true; } };
      calls.push(call); return call;
    } : undefined });
    return nodes.get(selector);
  } };
  const context = {
    window: { matchMedia: () => preference },
    Arc90Motion: { reduced: () => preference.matches },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { calls, listeners, dialog, context };
}

const f = fixture();
const intro = f.context.animateLaunchLogo(f.dialog);
assert.equal(intro.duration, 4000);
assert.equal(f.calls.length, 9);
assert.ok(f.calls.every(call => call.options.duration + call.options.delay <= intro.duration));
assert.ok(f.calls.every(call => call.options.fill === 'backwards'));
const stage = f.calls.find(call => call.selector === '.launch-logo-stage');
const logoParts = f.calls.filter(call => call.selector.startsWith('.launch-logo-') && call !== stage);
const revealEnd = Math.max(...logoParts.map(call => call.options.delay + call.options.duration));
const fadeStart = stage.frames[1].offset * stage.options.duration;
assert.equal(stage.options.easing, 'linear', 'Hold timing must not be warped by global easing');
assert.equal(fadeStart - revealEnd, 2000, 'The fully revealed logo stays visible for two seconds');
assert.equal(stage.frames[1].opacity, 1);
assert.ok(f.calls.filter(call => call.selector.startsWith('.launch-quote-')).every(call => call.options.delay >= fadeStart));
const arc = f.calls.find(call => call.selector.endsWith('.arc90-logo-arc'));
assert.equal(arc.frames[0].strokeDashoffset, '1');
assert.equal(arc.frames[1].strokeDashoffset, '0');
const quote = f.calls.find(call => call.selector === '.launch-quote-content');
assert.equal(quote.options.delay, 3500);
assert.equal(quote.options.delay + quote.options.duration, 4000);
assert.equal(quote.frames[0].opacity, 0);
assert.equal(quote.frames[1].opacity, 1);
assert.equal(f.listeners.size, 1);
intro.cancel();
assert.ok(f.calls.every(call => call.cancelled));
assert.equal(f.listeners.size, 0);
for (const options of [{ reduced: true }, { supported: false }]) {
  const skipped = fixture(options);
  assert.equal(skipped.context.animateLaunchLogo(skipped.dialog).duration, 0);
  assert.equal(skipped.calls.length, 0);
  assert.equal(skipped.listeners.size, 0);
}
const interrupted = fixture();
interrupted.context.animateLaunchLogo(interrupted.dialog);
interrupted.listeners.get('change')({ matches: true });
assert.ok(interrupted.calls.every(call => call.cancelled));
assert.equal(interrupted.listeners.size, 0);
const failure = fixture({ fail: true });
assert.equal(failure.context.animateLaunchLogo(failure.dialog).duration, 0);
assert.ok(failure.calls.every(call => call.cancelled), 'A partial animation failure leaves the quote visible');
assert.match(source, /launch-logo-stage" aria-hidden="true"/);
assert.match(source, /4000 \+ intro.duration/);
assert.match(source, /class="arc90-logo-arc" pathLength="1"/);
console.log('Launch logo passed: choreography, complete reading time, early dismissal, reduced motion and safe fallback.');

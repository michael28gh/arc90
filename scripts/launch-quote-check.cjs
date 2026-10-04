const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const start = source.indexOf('function showLaunchQuote()');
assert.ok(start >= 0, 'The opening reflection must be restored');
let current = null, timeout = null, fieldFocused = false, introQueued = 0, logoDuration = 4000, logoCancelled = 0;
const state = { focus: {}, onboarded: false };
const context = {
  S: state, sheet: null,
  animateLaunchLogo: () => ({ duration: logoDuration, cancel: () => { logoCancelled++; } }),
  requestAnimationFrame: callback => {
    assert.equal(current, null, 'The quote must close before queuing the Today entrance');
    assert.equal(callback, context.animateTodayArc); introQueued++;
  }, animateTodayArc: () => {},
  reflectionQuote: () => ({ quote: 'A <quiet> moment.', source: 'Author & book' }),
  logoMarkSvg: () => '<svg aria-hidden="true"></svg>',
  esc: text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  setTimeout: (callback, ms) => { assert.equal(ms, 4000 + logoDuration); timeout = callback; return 1; },
  clearTimeout: () => { timeout = null; },
  document: {
    hidden: false, activeElement: { matches: () => fieldFocused },
    getElementById: () => current,
    body: { appendChild: dialog => { current = dialog; } },
    createElement: tag => {
      assert.equal(tag, 'dialog');
      return {
        open: false, events: {}, attrs: {},
        setAttribute(key, value) { this.attrs[key] = value; },
        showModal() { this.open = true; },
        close() { this.open = false; this.events.close(); },
        remove() { current = null; },
        addEventListener(event, callback) { this.events[event] = callback; },
      };
    },
  },
};
vm.createContext(context);
vm.runInContext(source.slice(start, source.indexOf('function dailyReflectionCard()', start)), context);
context.showLaunchQuote(); assert.equal(current, null, 'no launch quote before onboarding');
state.onboarded = true;
context.showLaunchQuote();
assert.equal(current.open, true);
assert.match(current.innerHTML, /A &lt;quiet&gt; moment/);
assert.match(current.innerHTML, /Author &amp; book/);
assert.doesNotMatch(current.innerHTML, /Continue|<button/);
assert.equal(current.tabIndex, -1);
assert.equal(current.attrs['aria-describedby'], 'launchQuoteText launchQuoteSource');
const first = current;
context.showLaunchQuote();
assert.equal(current, first, 'Do not stack launch screens');
current.events.click();
assert.equal(current, null); assert.equal(timeout, null);
assert.equal(introQueued, 1);
assert.equal(logoCancelled, 1, 'Skipping the quote also cancels the logo entrance');
logoDuration = 0;
context.showLaunchQuote(); timeout();
assert.equal(current, null, 'Auto-dismiss releases the app');
context.showLaunchQuote();
current.events.keydown({ key: 'Tab', stopPropagation() {} });
assert.equal(timeout, null, 'Keyboard readers control their reading time');
current.events.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
assert.equal(current, null);
for (const key of ['Enter', ' ']) {
  context.showLaunchQuote();
  current.events.keydown({ key, preventDefault() {}, stopPropagation() {} });
  assert.equal(current, null);
}
context.showLaunchQuote();
current.events.cancel({ preventDefault() {} });
assert.equal(current, null);
for (const key of ['active', 'pendingCompletion']) {
  state.focus[key] = {};
  context.showLaunchQuote(); assert.equal(current, null);
  state.focus[key] = null;
}
fieldFocused = true; context.showLaunchQuote(); assert.equal(current, null);
fieldFocused = false; context.document.hidden = true;
context.showLaunchQuote(); assert.equal(current, null);
context.document.hidden = false; context.sheet = { type: 'edit' };
context.showLaunchQuote(); assert.equal(current, null);
assert.match(source, /if \(!bootNudge\) showLaunchQuote\(\)/);
assert.match(source, /Date\.now\(\) - quoteHiddenAt >= 60000/);
assert.match(source, /if \(showWelcome && !wasWriting && S\.onboarded\) showLaunchQuote\(\)/);
console.log('Opening quote passed: shared daily quote, escaping, native modal, tap/Escape/auto dismissal, duplicates and uninterrupted focus/writing.');

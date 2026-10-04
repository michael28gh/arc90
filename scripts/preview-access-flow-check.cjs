const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const create = require('../js/preview-access.js');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
function between(first, last) {
  const start = source.indexOf(first);
  const end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const values = new Map();
let now = Date.parse('2026-09-10T12:00:00-07:00');
const preview = create({
  now: () => now,
  storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
});
const original = { premium: false, onboarded: true, habits: [{ id: 1 }], log: { '2026-09-10': { done: [1] } } };
const context = {
  S: structuredClone(original), sheet: null, renders: 0, notices: [],
  URLSearchParams,
  window: {
    Arc90PreviewAccess: preview,
    location: { search: '?preview=1&checkout=success&session_id=test', pathname: '/app', hash: '#day' },
    history: { state: { route: 'app' }, replaceState(state, unused, url) { context.cleanURL = url; } },
  },
  render() { context.renders++; },
  showNudge(message) { context.notices.push(message); },
  fetch() { throw new Error('Preview must not contact checkout'); },
  track() { throw new Error('Preview must not report a purchase'); },
};
vm.createContext(context);
vm.runInContext(between('function previewAccessActive()', 'function isDevHost()'), context);
vm.runInContext(between('function safeStripeCheckout()', 'function consumeCheckoutReturn()'), context);
vm.runInContext(between('function premiumCard(', 'function axisInner()'), context);
assert.equal(context.hasPremiumAccess(), false);
assert.equal(context.gate('focus'), false);
assert.equal(context.sheet.type, 'paywall');
context.sheet = null;
assert.match(context.consumePreviewLink(), /unlocked on this device/);
assert.equal(context.cleanURL, '/app?checkout=success&session_id=test#day');
assert.equal(context.hasPremiumAccess(), true);
assert.equal(context.gate('sleep'), true);
assert.equal(context.sheet, null);
assert.ok(!context.premiumCard('axis', 'Axis', 'Locked', '<p>Chart</p>').includes('locked-cover'));
context.safeStripeCheckout();
assert.match(context.notices.at(-1), /No purchase/);
assert.deepEqual(context.S, original);

preview.setEnabled(false);
assert.equal(context.hasPremiumAccess(), false);
assert.ok(context.premiumCard('axis', 'Axis', 'Locked', '<p>Chart</p>').includes('locked-cover'));
context.S.premium = true;
assert.equal(context.hasPremiumAccess(), true, 'relocking preview must not revoke an existing paid state');
context.S.premium = false;
preview.setEnabled(true);

context.setInterval = callback => { context.tick = callback; };
context.document = { hidden: false };
vm.runInContext(between('let lastPreviewAccess =', "document.addEventListener('visibilitychange', () => {"), context);
const beforeExpiry = context.renders;
now = Date.parse('2026-10-31T00:00:00-07:00');
context.tick();
assert.equal(context.renders, beforeExpiry + 1, 'expiration refreshes an already-open app');
assert.equal(context.hasPremiumAccess(), false);
assert.match(context.consumePreviewLink(), /ended/);
assert.equal(context.gate('focus'), false);
assert.deepEqual(context.S, original, 'preview expiry must leave habits, history and paid status unchanged');
console.log('Preview integration passed: opt-in link, clean URL, feature gates, no checkout, relocking, cutoff refresh and unchanged data.');

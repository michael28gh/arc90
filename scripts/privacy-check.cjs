const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/privacy-controls.js'), 'utf8');

// Exercise the real consent module without loading any third-party script.
function fixture({ choice, blockedStorage = false, native = false, local = false, app = false } = {}) {
  const nodes = [], scripts = [], events = {}, values = new Map();
  if (choice) values.set('arc90.analytics-consent.v1', choice);
  const element = () => ({
    listeners: {}, attributes: {}, dataset: {}, hidden: false,
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(k, fn) { this.listeners[k] = fn; },
    focus() { this.focused = true; },
    querySelector() { return this; },
  });
  const trigger = element();
  trigger.isConnected = true;
  const context = {
    URL, location: { protocol: local ? 'http:' : 'https:', hostname: local ? 'localhost' : 'arc90.vercel.app', origin: 'https://arc90.vercel.app' },
    window: { addEventListener(k, fn) { events[k] = fn; }, Capacitor: native ? { isNativePlatform: () => true } : undefined },
    localStorage: {
      getItem(k) { if (blockedStorage) throw Error('unavailable'); return values.get(k); },
      setItem(k, v) { if (blockedStorage) throw Error('unavailable'); values.set(k, v); },
    },
    document: { readyState: 'complete', createElement: element,
      getElementById: id => id === 'app' && app ? {} : null,
      querySelectorAll: () => app ? [trigger] : [],
      querySelector: () => app ? trigger : null,
      addEventListener(k, fn) { events['document-' + k] = fn; },
      body: { appendChild(n) { nodes.push(n); } }, head: { appendChild(n) { scripts.push(n); } } },
  };
  vm.runInNewContext(source, context);
  return {
    nodes, scripts, context, events, trigger,
    choose(value) { nodes[0].listeners.click({ target: { getAttribute: () => value } }); },
    filter(event) { return context.window.vaq[0][1](event); },
  };
}

test('analytics defaults off and decline loads nothing', () => {
  const f = fixture();
  assert.equal(f.scripts.length, 0);
  assert.equal(f.nodes[0].hidden, false);
  f.choose('declined');
  assert.equal(f.scripts.length, 0);
  assert.equal(f.nodes[0].hidden, true);
});
test('acceptance loads once and strips query and fragment; custom events are rejected', () => {
  const f = fixture();
  f.choose('accepted'); f.choose('accepted');
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, '/_vercel/insights/script.js');
  assert.equal(f.filter({ type: 'pageview', url: 'https://arc90.vercel.app/app?session_id=private#secret' }).url, 'https://arc90.vercel.app/app');
  assert.equal(f.filter({ type: 'event', name: 'habit', data: { text: 'private' } }), null);
});
test('withdrawal and cross-tab withdrawal reject future events', () => {
  const f = fixture({ choice: 'accepted' });
  f.choose('declined');
  assert.equal(f.filter({ type: 'pageview', url: '/app' }), null);
  f.choose('accepted');
  f.events.storage({ key: 'arc90.analytics-consent.v1', newValue: 'declined' });
  assert.equal(f.filter({ type: 'pageview', url: '/app' }), null);
  f.events.storage({ key: null, newValue: null });
  assert.equal(f.nodes[0].hidden, false);
});
test('unavailable storage defaults off and reports page-only consent', () => {
  const f = fixture({ blockedStorage: true });
  assert.equal(f.scripts.length, 0);
  f.choose('accepted');
  assert.equal(f.scripts.length, 1);
  assert.match(f.nodes[0].textContent, /page only/);
});
test('local and native builds never load analytics', () => {
  for (const options of [{ local: true }, { native: true }]) {
    const f = fixture({ ...options, choice: 'accepted' });
    assert.equal(f.scripts.length, 0);
    assert.equal(f.nodes.length, 0);
  }
});
test('app keeps choices in Profile without a floating launcher; withdrawal still works', () => {
  const f = fixture({ app: true, choice: 'declined' });
  assert.equal(f.nodes.length, 1);
  assert.equal(f.nodes[0].id, 'privacy-consent');
  assert.equal(f.nodes[0].hidden, true);
  f.events['document-click']({ target: { closest: () => f.trigger } });
  assert.equal(f.nodes[0].hidden, false);
  assert.equal(f.trigger.attributes['aria-expanded'], 'true');
  f.choose('accepted');
  assert.equal(f.scripts.length, 1);
  assert.equal(f.trigger.focused, true);
  f.events['document-click']({ target: { closest: () => f.trigger } });
  f.choose('declined');
  assert.equal(f.filter({ type: 'pageview', url: '/app' }), null);
  assert.equal(f.nodes[0].hidden, true);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const create = require('../js/preview-access.js');
const KEY = 'arc90.preview-access.v1';
const cutoff = Date.parse('2026-10-31T00:00:00-07:00');
const now = () => cutoff - 1;
function memory(value) {
  const data = new Map([['arc90.v1', '{"premium":true}']]);
  if (value !== undefined) data.set(KEY, value);
  return {
    data,
    getItem(key) { assert.equal(key, KEY); return data.get(key) ?? null; },
    setItem(key, value) { assert.equal(key, KEY); data.set(key, value); }
  };
}
const storage = memory();
const api = create({ storage, now });
assert.equal(api.endsAt, '2026-10-31T00:00:00-07:00');
assert.equal(Reflect.set(api, 'endsAt', '2099-01-01T00:00:00Z'), false);
assert.equal(Reflect.deleteProperty(api, 'endsAt'), false);
assert.equal(api.endsAt, '2026-10-31T00:00:00-07:00');
assert.equal(create({ endsAt: '2026-10-01T00:00:00Z' }).endsAt, '2026-10-01T00:00:00Z');
assert.equal(create({ endsAt: null }).endsAt, '');
assert.equal(api.available(), true);
assert.equal(api.enrolled(), false);
assert.equal(api.active(), false);
assert.equal(api.setEnabled(true), true);
assert.equal(storage.data.get(KEY), 'true');
assert.equal(api.enrolled(), true);
assert.equal(api.active(), true);
assert.equal(api.setEnabled(false), true);
assert.equal(api.enrolled(), true);
assert.equal(api.active(), false);
storage.data.set(KEY, 'true');
assert.equal(api.active(), true, 'Other-tab changes are read immediately');
storage.data.delete(KEY);
assert.equal(api.active(), false);
assert.equal(api.enrolled(), false);
assert.equal(storage.data.get('arc90.v1'), '{"premium":true}');
assert.equal(storage.data.size, 1);
for (const value of [undefined, null, '', 'null', '1', '0', '"true"', '{}', '{"enabled":true}', 'TRUE', 'bad', true, false]) {
  const instance = create({ storage: memory(value), now });
  assert.equal(instance.enrolled(), false, String(value));
  assert.equal(instance.active(), false, String(value));
}
for (const value of [true, false]) {
  const instance = create({ storage: memory(String(value)), now });
  assert.equal(instance.enrolled(), true);
  assert.equal(instance.active(), value);
}
for (const value of [undefined, null, 1, 0, 'true', 'false', {}, []]) {
  assert.equal(api.setEnabled(value), false);
  assert.equal(storage.data.has(KEY), false);
}
for (const options of [
  { enabled: false }, { enabled: 'true' }, { enabled: 1 },
  { now: () => cutoff }, { now: () => cutoff + 1 },
  { now: () => NaN }, { now: () => Infinity }, { now: () => -Infinity },
  { now: () => String(cutoff - 1) }, { now: null },
  { now() { throw new Error('clock'); } },
  { endsAt: 'invalid' }, { endsAt: '' }, { endsAt: null }, { endsAt: Infinity }
]) {
  const saved = memory('true');
  const instance = create({ storage: saved, now, ...options });
  assert.equal(instance.available(), false);
  assert.equal(instance.enrolled(), true);
  assert.equal(instance.active(), false);
  assert.equal(instance.setEnabled(true), false);
  assert.equal(saved.data.get(KEY), 'true');
  assert.equal(instance.setEnabled(false), true);
  assert.equal(saved.data.get(KEY), 'false');
}
let time = cutoff - 1;
const expiring = create({ storage: memory('true'), now: () => time });
assert.equal(expiring.active(), true);
time = cutoff;
assert.equal(expiring.active(), false);
assert.equal(create({ storage, now: () => 0, endsAt: '1970-01-01T00:00:01Z' }).available(), true);
const fail = () => { throw new Error('storage blocked'); };
for (const broken of [null, undefined, {}, { getItem: fail, setItem: fail },
  { getItem: () => null, setItem: fail }, { getItem: fail, setItem() {} },
  { getItem: () => null, setItem() {} }]) {
  const instance = create({ storage: broken, now });
  assert.equal(instance.enrolled(), false);
  assert.equal(instance.active(), false);
  assert.equal(instance.setEnabled(true), false);
  assert.equal(instance.setEnabled(false), false);
}
const writeBlocked = create({ storage: { getItem: () => 'true', setItem: fail }, now });
assert.equal(writeBlocked.setEnabled(true), false, 'A thrown write is never success');
assert.equal(writeBlocked.setEnabled(false), false);

const source = fs.readFileSync(path.join(__dirname, '../js/preview-access.js'), 'utf8');
class Clock extends Date { static now() { return cutoff - 1; } }
function browser(window) {
  Object.defineProperty(window, 'S', { get: fail });
  Object.defineProperty(window, 'location', { get: fail });
  vm.runInNewContext(source, { window, Date: Clock });
  return window.Arc90PreviewAccess;
}
const browserStorage = memory();
const ready = browser({ localStorage: browserStorage });
assert.equal(typeof ready, 'object');
assert.equal(ready.endsAt, api.endsAt);
assert.equal(Reflect.set(ready, 'endsAt', ''), false);
assert.equal(ready.available(), true);
assert.equal(ready.active(), false);
assert.equal(ready.setEnabled(true), true);
assert.equal(ready.active(), true);
assert.equal(browserStorage.data.get('arc90.v1'), '{"premium":true}');
assert.equal(browser({ localStorage: memory() }).active(), false, 'No cross-device default enrollment');
for (const window of [{}, Object.defineProperty({}, 'localStorage', { get: fail })]) {
  const blocked = browser(window);
  assert.equal(blocked.active(), false);
  assert.equal(blocked.setEnabled(true), false);
  assert.equal(blocked.setEnabled(false), false);
}
console.log('Preview access checks passed: defaults, preferences, cutoff, build switch, storage failures, live reads, and paid-state isolation.');

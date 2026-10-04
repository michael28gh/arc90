const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const core = require('./core.js');
const { open } = require('./storage.js');
function fakeStorage() {
  const data = new Map();
  return {getItem:key => data.has(key) ? data.get(key) : null, setItem:(key,value) => data.set(key,value)};
}
test('first read does not seed or mutate browser storage', () => {
  const storage = fakeStorage();
  const store = open(storage,'test',core.normalize,core.empty());
  assert.deepEqual(store.read(),core.empty());
  assert.equal(storage.getItem('test'),null);
});
test('saved records round-trip and read snapshots are detached', () => {
  const storage = fakeStorage();
  const store = open(storage,'test',core.normalize,core.empty());
  const state = core.transact(core.empty(),{type:'rule.save',record:{id:'r',obstacle:'Late shift',context:'Work',response:'Five questions'}},{today:'2026-10-03'});
  store.save(state);
  state.rules[0].response = 'Changed outside store';
  assert.equal(store.read().rules[0].response,'Five questions');
  assert.equal(open(storage,'test',core.normalize,core.empty()).read().rules[0].response,'Five questions');
});
test('quota failures leave last saved state and raw data unchanged', () => {
  const storage = fakeStorage();
  const store = open(storage,'test',core.normalize,core.empty());
  store.save(core.empty());
  const raw = storage.getItem('test');
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  const next = core.transact(core.empty(),{type:'rule.save',record:{id:'r',obstacle:'Tired',context:'Work',response:'Rest'}},{today:'2026-10-03'});
  assert.throws(() => store.save(next),/Quota/);
  assert.deepEqual(store.read(),core.empty());
  assert.equal(storage.getItem('test'),raw);
});
test('another tab cannot be silently overwritten', () => {
  const storage = fakeStorage();
  const first = open(storage,'test',core.normalize,core.empty());
  const second = open(storage,'test',core.normalize,core.empty());
  first.save(core.empty());
  assert.throws(() => second.save(core.empty()),/another window/);
});
test('invalid JSON and incompatible snapshots remain untouched', () => {
  for (const raw of ['broken', '{"version":10}', '{"version":1,"metrics":[]}']) {
    const storage = fakeStorage(); storage.setItem('test',raw);
    assert.throws(() => open(storage,'test',core.normalize,core.empty()));
    assert.equal(storage.getItem('test'),raw);
  }
});
test('sample and sandbox are isolated keys', () => {
  const storage = fakeStorage();
  open(storage,'sample',core.normalize,core.empty()).save(core.empty());
  assert.equal(storage.getItem('sandbox'),null);
});
test('sample is valid and effort comes from the goal-linked log', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'sample.js'),'utf8'),context);
  const sample = context.Arc90ReviewSample('2026-10-03');
  const normalized = core.normalize(sample.state);
  assert.equal(core.direction(normalized,'sample-score',{today:'2026-10-03'}).count,4);
  assert.equal(core.effortForGoal({...sample.source,goalId:'sample-boards',start:'2026-09-27',end:'2026-10-03'}).count,10);
  assert.equal(core.playbook(normalized,'late-shift').helped,2);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../js/brain-core.js');
const handlers = {};
const c = {
  structuredClone, render() {}, save() {},
  S: { brain: { goals: [{ id: 'g', title: 'Goal', horizon: 'mid', status: 'active' }], drafts: [] },
    habits: [{ id: 'h', name: 'Study', goal_id: 'g', task_id: 't' }],
    tasks: [{ id: 't', title: 'Deck', horizon: 'short', goal_id: 'g' }], log: { '2026-09-30': { done: ['h'] } } },
  sheet: null,
  document: { addEventListener(name, fn) { (handlers[name] ||= []).push(fn); }, getElementById() { return { value: '' }; } },
};
vm.createContext(c);
vm.runInContext(fs.readFileSync(require.resolve('../js/brain-dump.js'), 'utf8'), c);
c.brainData = () => core.alignment({ goals: c.S.brain.goals, ...c.S });
const click = (action, id) => handlers.click.forEach(fn => fn({ target: { closest: () => ({ dataset: { brainAct: action, id } }) } }));
const link = c.brainData().links.findIndex(l => l.target === 'habit:h');
assert(link >= 0);
click('unlink', String(link));
assert.equal(c.S.habits[0].task_id, null);
assert.equal(c.brainData().orphans[0], 'h');
c.S.habits[0].task_id = 't';
c.sheet = { kind: 'habit', itemId: 'h' };
click('confirm-link');
assert.equal(c.brainData().orphans[0], 'h');
c.S.habits[0].goal_id = 'g';
c.S.habits[0].task_id = 't';
const before = JSON.stringify(c.S);
c.save = () => { throw new Error('Storage unavailable'); };
click('unlink', String(c.brainData().links.findIndex(l => l.target === 'habit:h')));
assert.equal(JSON.stringify(c.S), before);
console.log('Brain links: task-backed unlink, unassigned picker and storage rollback passed.');

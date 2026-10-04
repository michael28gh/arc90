const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));
const code = slice('function activeArcGoal()', 'function removeHabit(') + slice('function addCustom(', 'function applyTemplate(');
const store = {};
const make = state => {
  const c = { S: state, KEY: 'arc90.v1', saved: 0, save() { c.saved++; }, hasPremiumAccess: () => true, gate: () => false, customCount: () => 0,
    FREE_HABITS: 8, FREE_CUSTOM: 2, HABIT_LIBRARY: [{ id: 1, emoji: '📖', name: 'Read 10 pages', cat: 'learn', min: 'Read 1 page' }],
    localStorage: { setItem: (k, v) => { store[k] = v; } }, console };
  vm.createContext(c); vm.runInContext(code, c); return c;
};
const base = goals => ({ onboarded: true, product: {}, profile: { goal: 'Finish LVN school', arcGoalId: null }, brain: { goals, dirty: false }, habits: [], tasks: [], customSeq: 0 });

// Older onboarding: parentless 'short' goal matching the profile goal becomes the mid-term arc goal.
let c = make(base([{ id: 'g1', title: 'Finish LVN school', horizon: 'short', parent_goal_id: null, status: 'active' }]));
c.migrateGoalModelV2();
assert.equal(c.S.brain.goals[0].horizon, 'mid');
assert.equal(c.S.profile.arcGoalId, 'g1');
assert.equal(c.S.brain.dirty, true, 'the change syncs to the cloud on next backup');
assert.ok(store['arc90.v1.pre-goalv2'], 'a backup is kept before changing anything');
assert.equal(c.S.product.goalModelV2, true);
c.S.brain.goals[0].horizon = 'short'; c.migrateGoalModelV2();
assert.equal(c.S.brain.goals[0].horizon, 'short', 'runs only once');

// A short goal that already has children is left alone.
c = make(base([{ id: 'g1', title: 'Finish LVN school', horizon: 'short', parent_goal_id: null, status: 'active' }, { id: 'g2', title: 'x', horizon: 'short', parent_goal_id: 'g1', status: 'active' }]));
c.migrateGoalModelV2();
assert.equal(c.S.brain.goals[0].horizon, 'short');
assert.equal(c.S.profile.arcGoalId, null);

// An existing mid goal with the same title is adopted; unrelated goals are untouched.
c = make(base([{ id: 'm1', title: 'finish lvn school', horizon: 'mid', parent_goal_id: null, status: 'active' }, { id: 's1', title: 'Other', horizon: 'short', parent_goal_id: null, status: 'active' }]));
c.migrateGoalModelV2();
assert.equal(c.S.profile.arcGoalId, 'm1');
assert.equal(c.S.brain.goals[1].horizon, 'short');

// New habits link to the active arc goal by default; nothing links when there is none.
c.addHabit(1); c.addCustom('Stretch');
assert.deepEqual(c.S.habits.map(h => h.goal_id), ['m1', 'm1']);
c = make(base([])); c.addHabit(1);
assert.equal(c.S.habits[0].goal_id, null);

// Onboarding creates the 90-day goal as mid-term and remembers it; tasks and You edits stay connected.
assert.match(app, /title: ob\.goal\.trim\(\), horizon: 'mid'[\s\S]{0,200}S\.profile\.arcGoalId = firstGoalId;/);
assert.match(app, /horizon: 'short', goal_id: arcGoalLink\(\),/, 'new tasks link to the arc goal');
assert.match(app, /const arc = activeArcGoal\(\); if \(arc && arc\.title !== S\.profile\.goal\)/, 'editing the goal on You updates Arc');
// Onboarding: name, vision (focus areas + optional long-term vision), 90-day goal, habits; no brain dump step.
assert.match(app, /const steps = \[obWelcome, obAbout, obVision, obGoal, obHabits, obReminders,/);
assert.doesNotMatch(app, /function obBrain\(/, 'capture lives in Arc, not onboarding');
assert.match(app, /if \(visionId\) S\.brain\.goals\.push\(\{ id: visionId, title: ob\.vision\.trim\(\), horizon: 'long'/);
assert.match(app, /horizon: 'mid', parent_goal_id: visionId/, 'the 90-day goal rolls up to the vision when one is given');
assert.match(app, /if \(key === 'goal'\) btn\.disabled = !ob\.goal\.trim\(\);/, 'the goal step only needs a goal');
console.log('Goal model passed: mid-term arc goal, one-time safe migration, default links, synced titles, connected onboarding.');

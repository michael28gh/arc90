const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const d3 = require('d3-sankey');
const brain = require('../js/brain-core.js');
const demo = require('./seed-purpose-demo.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/brain-dump.js'), 'utf8');
const start = source.indexOf('function brainOverview(');
const end = source.indexOf('function brainWireMap(', start);
assert.ok(start >= 0 && end > start);
const context = {
  d3, S: demo, brainExpanded: false, brainLayoutCache: null, brainSelected: null, brainMapMode: 'overview',
  brainScrollKey: '', brainScrollLeft: null, brainZoom: 1, brainRevealKey: '',
  esc: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const helperStart = source.indexOf('// Display-only goal label');
vm.runInContext(source.slice(helperStart, source.indexOf('// A single allocation bar', helperStart)), context);
const fresh = () => { context.brainLayoutCache = null; context.brainSelected = null; };
const clean = markup => assert.doesNotMatch(markup, /NaN|Infinity|undefined/);

// Flow: all effort -> top-level purpose -> habits, sized only by completed reps.
const data = brain.alignment({ ...demo, goals: demo.brain.goals, start: '2026-07-01', end: '2026-08-29' });
const before = JSON.stringify(data);
const flow = context.brainFlow(data);
const roots = data.nodes.filter(n => n.kind === 'goal' && !data.links.some(l => l.target === n.id));
assert.equal(flow.purpose.filter(p => p.id !== 'no-purpose').length, roots.length, 'one purpose node per top-level goal');
assert.equal(flow.purpose.reduce((sum, p) => sum + p.value, 0), data.total, 'purpose column sums to total without double counting');
assert.equal(flow.leaves.reduce((sum, l) => sum + l.value, 0), data.total, 'habit column sums to total');
for (const p of flow.purpose) assert.equal(flow.leaves.filter(l => l.root === p.id).reduce((sum, l) => sum + l.value, 0), p.value, `${p.title} equals its habits`);
assert.equal(new Set(flow.purpose.filter(p => p.id !== 'no-purpose').map(p => p.tone)).size, roots.length, 'each top-level goal has its own color');
assert.ok(flow.leaves.filter(l => l.root === 'no-purpose').every(l => l.act === 'link-habit'), 'unlinked habits open the link picker');

fresh();
const graph = context.brainFlowGraph(data);
for (const n of graph.nodes) {
  assert.ok(n.x0 >= 0 && n.x1 <= graph.width && n.y0 >= 0 && n.y1 <= graph.height, `${n.title} stays inside the chart`);
  assert.equal(n.x0, n.column * (graph.width - 8) / 2, `${n.title} sits on its column`);
}
for (const column of [1, 2]) {
  const nodes = graph.nodes.filter(n => n.column === column).sort((a, b) => a.y0 - b.y0);
  for (let i = 1; i < nodes.length; i++) {
    const gap = (nodes[i].y0 + nodes[i].y1) / 2 - (nodes[i - 1].y0 + nodes[i - 1].y1) / 2;
    assert.ok(gap >= 42, `labels in column ${column} do not overlap (${gap}px)`);
  }
}
const total = graph.nodes.find(n => n.id === 'effort-total');
const leaving = graph.links.filter(l => !l.planned && l.source.id === 'effort-total').reduce((s, l) => s + l.width, 0);
assert.ok(Math.abs(leaving - (total.y1 - total.y0)) < 1.5, 'ribbons leaving effort fill its bar');
const markup = context.brainMap(data);
clean(markup);
assert.match(markup, /brain-map-flow/);
assert.match(markup, /Become a nurse/);
assert.match(markup, /No purpose/);
assert.match(markup, /No reps yet/, 'a goal with no reps says so instead of showing a tiny fake value');
assert.doesNotMatch(markup, /0\.\d+ reps/);
assert.equal(JSON.stringify(data), before, 'rendering must not change saved alignment data');

assert.doesNotMatch(context.brainMap(data), /brain-map-animate/, 'the entry animation plays once per layout, not on every tap');
assert.match(markup, /fill="url\(#brainHatch\)"/, 'unassigned effort uses the hatched style');
assert.match(markup, /class="brain-node-pct"/);
context.brainSelected = roots[0].id;
const highlighted = context.brainFlowMap(data);
assert.match(highlighted, /Clear highlight/);
assert.match(highlighted, /opacity="0\.28"/, 'other purposes dim when one is selected');

// Planned: structure without completions must not look like activity.
fresh();
const planned = brain.alignment({ ...demo, goals: demo.brain.goals, log: {} });
const plannedMarkup = context.brainMap(planned);
clean(plannedMarkup);
assert.equal(planned.total, 0, 'planned links must not fabricate activity');
assert.match(plannedMarkup, /brain-ribbon-planned/);
assert.doesNotMatch(plannedMarkup, /fill="url\(#brainFlow/);
assert.match(plannedMarkup, /Dashed lines show your plan/);

// Sparse: no long-term goal, two mid/short goals, several unlinked habits.
fresh();
const sparseGoals = [
  { id: 'm1', title: 'I want to start uploading video on YouTube', horizon: 'mid', status: 'active' },
  { id: 's1', title: 'I want to finish LVN school', horizon: 'short', status: 'active' },
];
const sparseHabits = [
  { id: 'a', name: 'Study 1 focused hour', goal_id: 's1' }, { id: 'b', name: 'Plan tomorrow\'s top 3 tasks', goal_id: 'm1' },
  { id: 'c', name: 'Say your affirmation out loud' }, { id: 'd', name: 'Stretch' }, { id: 'e', name: 'Read 10 pages' },
];
context.S = { brain: { goals: sparseGoals }, habits: sparseHabits };
const sparse = brain.alignment({ goals: sparseGoals, habits: sparseHabits, tasks: [], log: { '2026-08-29': { done: ['a', 'b', 'c'] }, '2026-08-28': { done: ['a', 'd'] } }, start: '2026-08-23', end: '2026-08-29' });
const sparseMarkup = context.brainMap(sparse);
clean(sparseMarkup);
assert.match(sparseMarkup, /Finish LVN school/, "charts use the short display label");
assert.doesNotMatch(sparseMarkup, /I want to finish LVN/);
assert.match(sparseMarkup, /Read 10 pages/);
assert.ok(context.brainFlowGraph(sparse).height < 600, 'sparse data stays phone sized');

// Unlinked-only and empty states.
fresh();
context.S = { brain: { goals: [] }, habits: [{ id: 'h1', name: 'A daily rep' }] };
const unlinked = brain.alignment({ goals: [], habits: context.S.habits, tasks: [], log: { '2026-08-29': { done: ['h1'] } }, start: '2026-08-29', end: '2026-08-29' });
const unlinkedMarkup = context.brainMap(unlinked);
clean(unlinkedMarkup);
assert.match(unlinkedMarkup, /A daily rep/);
fresh();
assert.match(context.brainMap(brain.alignment({ goals: [], habits: [], tasks: [], log: {} })), /brain-empty/);

// Levels view keeps the horizon layout and real link indexes for unlink actions.
fresh();
context.S = demo;
context.brainMapMode = 'path';
const levels = context.brainMap(data);
clean(levels);
assert.match(levels, /Long term/);
assert.match(levels, /data-brain-act="link" data-id="\d+"/);
assert.match(source.slice(source.indexOf('function brainAlignment('), start), /data-brain-act="goal-new"/);
const allocStart = source.indexOf('function brainAllocation(');
vm.runInContext(source.slice(allocStart, source.indexOf('function brainAlignment(', allocStart)), context);
const alloc = context.brainAllocation(data);
assert.equal([...alloc.matchAll(/flex:(\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0), data.total, 'allocation bar segments sum to completed reps');
assert.match(alloc, /Most of your reps fed/);
assert.equal(context.brainAllocation(planned), '', 'no allocation bar without completed reps');
assert.ok(context.brainMapTitle('A purpose that deserves a longer readable label', 17).length <= 2);
// Long goal titles wrap to three readable lines without losing words.
const wrapped = context.brainMapLines('I want to start uploading video on YouTube', 22, 3);
assert.ok(wrapped.length <= 3 && wrapped.every(line => line.length <= 22));
assert.equal(wrapped.join(' '), 'I want to start uploading video on YouTube');
assert.match(context.brainMapLines('one two three four five six seven eight nine ten eleven twelve thirteen', 10, 2).at(-1), /…$/);

// Goal context: a habit's sheet knows the full path above it and its goal color.
const contextStart = source.indexOf('function brainNodeContext(');
vm.runInContext(source.slice(contextStart, source.indexOf('function brainDetailSheet(', contextStart)), context);
const habitNode = data.nodes.find(n => n.kind === 'habit');
const habitContext = context.brainNodeContext(data, habitNode.id);
assert.ok(habitContext.ancestors.length >= 1 && habitContext.ancestors.every(Boolean));
assert.equal(habitContext.tone, flow.purpose.find(p => p.id === habitContext.ancestors[0].id).tone);

// Start state: three steps, the next one carries the action.
const startStart = source.indexOf('function brainStart(');
vm.runInContext(source.slice(startStart, source.indexOf('function brainAlignment(', startStart)), context);
context.S = { brain: { goals: [] }, habits: [], log: {} };
const fresh0 = context.brainStart({ orphans: [] });
assert.match(fresh0, /class="next"[\s\S]*data-brain-act="goal-new"/);
context.S = { brain: { goals: [{ id: 'g' }] }, habits: [{ id: 'h', name: 'Read' }], log: { '2026-08-29': { done: ['h'] } } };
assert.equal((context.brainStart({ orphans: [] }).match(/class="done"/g) || []).length, 3, 'linked habit with a rep completes every step');
context.S = demo;

// Short labels are display-only and keep the meaning.
assert.equal(context.brainGoalLabel('I want to finish LVN school'), 'Finish LVN school');
assert.equal(context.brainGoalLabel("I'm going to run a half marathon"), 'Run a half marathon');
assert.equal(context.brainGoalLabel('Become a nurse practitioner'), 'Become a nurse practitioner');
assert.equal(context.brainGoalLabel(''), '');

// Suggestions: one clear match, never a guess between ties, never a match from nothing.
const youtube = { id: 'y', title: 'I want to start uploading video on YouTube', horizon: 'mid', status: 'active' };
const school = { id: 'l', title: 'I want to finish LVN school', horizon: 'short', status: 'active' };
assert.equal(context.brainSuggestGoal('Edit one YouTube clip', [youtube, school])?.id, 'y');
assert.equal(context.brainSuggestGoal('Study 1 focused hour', [youtube, school])?.id, 'l', 'related concepts match (study -> school)');
assert.equal(context.brainSuggestGoal('Drink 2L of water', [youtube, school]), null, 'no shared meaning, no suggestion');
assert.equal(context.brainSuggestGoal('Learn and record', [youtube, school]), null, 'ties are not guessed');

// Roll-up prompt: invite a vision when none exists; offer the only valid parent in one tap.
context.S = { brain: { goals: [youtube, school] }, habits: [], tasks: [] };
assert.match(context.brainRollupCard(), /Add your big-picture goal[\s\S]*data-horizon="long"/);
assert.doesNotMatch(context.brainRollupCard(), /data-brain-act="goal-parent"/, 'being the only mid goal is not a reason to connect unrelated goals');
context.S = { brain: { goals: [{ ...school, horizon: 'short' }, { id: 'n', title: 'Pass the NCLEX nursing exam', horizon: 'mid', status: 'active' }, youtube] }, habits: [], tasks: [] };
assert.match(context.brainRollupCard(), /data-brain-act="goal-parent" data-id="l" data-parent="n"/, 'related goals get a one-tap connect');
context.S = { brain: { goals: [{ ...youtube, parent_goal_id: 'v' }, { ...school, parent_goal_id: 'y' }, { id: 'v', title: 'Become an RN', horizon: 'long', status: 'active' }] }, habits: [], tasks: [] };
assert.equal(context.brainRollupCard(), '', 'nothing to prompt when everything rolls up');
context.S = demo;
console.log('Brain map checks passed: flow totals, colors, column geometry, label spacing, planned/sparse/empty states, levels view.');

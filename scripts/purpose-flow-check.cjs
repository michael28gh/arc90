const assert = require('node:assert/strict');
const chart = require('../js/charts/purpose-flow.js');
const brain = require('../js/brain-core.js');
const demo = require('./seed-purpose-demo.cjs');
const data = brain.alignment({ ...demo, goals: demo.brain.goals, start: '2026-07-01', end: '2026-08-29' });
const before = JSON.stringify(data);
const graph = chart.layout(data);
const expected = new Set(data.links.filter(link => link.value > 0).map(link => `${link.source}|${link.target}|${link.value}`));
for (const link of graph.links.filter(link => !link.hidden)) {
  assert.ok(expected.has(`${link.source.id}|${link.target.id}|${link.value}`), 'all visible ribbons must be real saved links');
  assert.ok(Number.isFinite(link.width) && link.width > 0);
}
for (const node of graph.nodes) assert.ok([node.x0,node.x1,node.y0,node.y1].every(Number.isFinite));
assert.equal(JSON.stringify(data), before, 'layout cannot mutate the alignment data');
assert.match(chart.render(data), /No purpose/);
assert.doesNotMatch(chart.render(data), /NaN|Infinity/);
assert.match(chart.render({ total:0,links:[] }), /Complete a linked habit/);
const escaped = structuredClone(data);
escaped.nodes[0].title = '<script>alert(1)</script>';
assert.doesNotMatch(chart.render(escaped), /<script>/);
console.log('Purpose chart checks passed: real links, geometry, orphans, no-data and escaping.');

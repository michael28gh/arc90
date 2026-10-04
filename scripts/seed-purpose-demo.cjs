const assert = require('node:assert/strict');
const { alignment } = require('../js/brain-core.js');

const goal = (id, title, horizon, parent_goal_id, life_area) => ({ id, title, horizon, parent_goal_id, life_area, status: 'active' });
const goals = [
  goal('g-career', 'Become a nurse practitioner', 'long', null, 'career_school'),
  goal('g-exam', 'Pass the next exam', 'mid', 'g-career', 'career_school'),
  goal('g-deck', 'Finish the pharmacology deck', 'short', 'g-exam', 'career_school'),
  goal('g-health', 'Run a half marathon', 'long', null, 'health'),
  goal('g-plan', 'Follow a training plan', 'mid', 'g-health', 'health'),
  goal('g-runs', 'Finish weekly runs', 'short', 'g-plan', 'health'),
  goal('g-money', 'Build an emergency fund', 'long', null, 'money'),
];
const ids = Object.fromEntries(goals.map((item, index) => [item.id, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]));
goals.forEach(item => { item.id = ids[item.id]; item.parent_goal_id = ids[item.parent_goal_id] || null; });
const habits = [
  { id: 'h-study', name: 'Study 45 minutes', goal_id: 'g-deck', life_area: 'career_school', rhythm: 'daily' },
  { id: 'h-run', name: 'Run after my shift', goal_id: 'g-runs', life_area: 'health', rhythm: 'weekdays' },
  { id: 'h-water', name: 'Drink water', goal_id: null, life_area: 'health', rhythm: 'daily' },
  { id: 'h-journal', name: 'Journal', goal_id: null, life_area: 'mind', rhythm: 'daily' },
];
habits.forEach(item => { item.goal_id = ids[item.goal_id] || null; });
const log = {};
const first = new Date('2026-07-01T12:00:00Z');
for (let day = 0; day < 60; day++) {
  const date = new Date(first.getTime() + day * 86400000).toISOString().slice(0, 10);
  const done = [];
  if (day % 7 !== 0) done.push('h-study');
  if (new Date(date + 'T12:00:00Z').getUTCDay() % 6 !== 0 && day % 7 < 3) done.push('h-run');
  if (day % 3 !== 0) done.push('h-water');
  if (day % 5 === 0) done.push('h-journal');
  log[date] = { done, completionHours: Object.fromEntries(done.map(id => [id, id === 'h-study' ? 2 : id === 'h-run' ? 22 : 16])), feels: done.includes('h-study') ? { 'h-study': day % 4 === 0 ? 'same' : 'better' } : {} };
}
const demo = { profile: { start: '2026-07-01' }, brain: { goals }, habits, tasks: [], log };
const map = alignment({ goals, habits, tasks: [], log, start: '2026-07-01', end: '2026-08-29' });
assert.equal(Object.keys(log).length, 60);
assert.equal(map.orphanHabits, 2);
assert.ok(map.neglectedGoals >= 1);
assert.ok(map.score > 0 && map.score < 100);

module.exports = demo;
if (require.main === module) {
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(demo, null, 2) + '\n');
  else console.log(`Isolated 60-day demo: ${map.total} completions, ${Math.round(map.score)}% aligned, ${map.orphanHabits} orphan habits, ${map.neglectedGoals} neglected goals. Use --json to inspect; this script never writes app data.`);
}

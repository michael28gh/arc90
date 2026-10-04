const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const start = source.indexOf('function claimStreakMilestone(');
const end = source.indexOf('function bestDayStreak()', start);
assert.ok(start >= 0 && end > start);
let saves = 0;
const context = { S: { profile: { start: '2026-09-01' }, firedSlots: {} }, save: () => { saves += 1; } };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
assert.equal(context.claimStreakMilestone(5, 6), 0);
for (const milestone of [7, 14, 30, 60, 90]) {
  assert.equal(context.claimStreakMilestone(milestone - 1, milestone), milestone);
  assert.equal(context.claimStreakMilestone(milestone - 1, milestone), 0, 'each milestone fires once per arc');
}
assert.equal(saves, 5);
context.S.profile.start = '2026-12-01';
assert.equal(context.claimStreakMilestone(6, 7), 7, 'a new arc can earn the first milestone again');
context.S.onboarded = true;
context.S.habits = [{ id: 'study' }];
Object.assign(context, {
  allDoneToday: () => false,
  todayKey: () => '2026-12-08',
  reminderSlots: () => ['00:00'],
  nudgeText: () => 'A small reminder',
  systemNotify() {},
  showNudge() {},
});
const reminderStart = source.indexOf('function checkReminders()');
const reminderEnd = source.indexOf('function checkTaskReminders()', reminderStart);
vm.runInContext(source.slice(reminderStart, reminderEnd), context);
context.checkReminders();
assert.equal(context.S.firedSlots['streak:2026-12-01:7'], true, 'daily reminder cleanup retains earned milestones');
console.log('Streak milestones passed: earned thresholds, once per arc, no duplicate save.');

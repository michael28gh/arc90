const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const context = {};
vm.createContext(context);
vm.runInContext(section('const JOURNAL_PROMPTS =', 'function dailyPracticePanel()'), context);
assert.equal(vm.runInContext('JOURNAL_PROMPTS.length', context), 30);
assert.equal(context.practicePrompt('2026-09-13', '2026-09-13'), 'What am I tolerating right now that I have stopped noticing?');
assert.equal(context.practicePrompt('2026-10-13', '2026-09-13'), context.practicePrompt('2026-09-13', '2026-09-13'));
assert.equal(context.practicePrompt('2026-03-09', '2026-03-08'), 'Where in my life am I performing competence I do not feel?');
assert.equal(context.practicePrompt('2026-11-02', '2026-11-01'), 'Where in my life am I performing competence I do not feel?');
assert.equal(context.practicePrompt('2026-09-12', '2026-09-13'), context.practicePrompt('invalid', 'invalid'));

const listeners = {};
const status = {};
Object.assign(context, {
  S: { practices: {}, journal: {}, log: {} },
  document: { addEventListener: (event, fn) => { listeners[event] = fn; }, getElementById: () => status },
  dlog: (date) => context.S.log[date] || { intention: '', done: ['existing'] },
  save: () => {},
});
vm.runInContext("let practiceSaveFailed = false;\n" + section("document.addEventListener('input', (e)", "document.addEventListener('change', (e)"), context);
function input(field, date, value, prompt = 'Saved prompt') {
  listeners.input({ target: { dataset: { practiceField: field, date, prompt }, value } });
}
input('journal', '2026-09-13', 'My unedited words.');
input('gratitude', '2026-09-13', 'A small moment.');
input('win', '2026-09-13', 'One important thing.');
input('journal', '2026-09-12', 'Yesterday.');
assert.equal(context.S.journal['2026-09-13'], 'My unedited words.');
assert.equal(context.S.journal['2026-09-12'], 'Yesterday.');
assert.equal(context.S.practices['2026-09-13'].prompt, 'Saved prompt');
assert.equal(context.S.practices['2026-09-13'].gratitude, 'A small moment.');
assert.equal(context.S.log['2026-09-13'].intention, 'One important thing.');
assert.deepEqual(context.S.log['2026-09-13'].done, ['existing']);
input('journal', '2026-09-13', '');
assert.equal(context.S.journal['2026-09-13'], '');
context.save = () => { throw new Error('Storage full'); };
input('journal', '2026-09-13', 'Keep my draft.');
assert.match(status.textContent, /Not saved/);
assert.equal(context.S.journal['2026-09-13'], 'Keep my draft.');
context.save = () => {};
input('journal', '2026-09-13', 'Saved again.');
assert.equal(status.textContent, 'Saved on this device.');
const meditation = section("case 'practice-meditate':", "case 'intention-save':");
assert.match(meditation, /!S.focus.active && !S.focus.pendingCompletion/);
assert.match(meditation, /'Meditation', false, \{ targets: \['Meditation'\] \}/);
assert.doesNotMatch(meditation, /habitId/);
assert.match(meditation, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'instant' \}\)/);
assert.match(meditation, /else switchTab\('focus'\)/);
const todayPractice = section('function dailyPracticePanel()', 'function meditationPanel()');
assert.doesNotMatch(todayPractice, /practice-tabs|practice-meditate|Gratitude/);
assert.match(todayPractice, /data-practice-field="journal"/);
assert.match(section('function viewFocus()', 'function focusTargetSummary()'), /meditationPanel\(\)/);
assert.match(section('function viewCoach()', 'function guidanceSignalCard()'), /meditationPanel\(\)/);
console.log('Practice checks passed: 30-day rotation, DST, separate dated entries, verbatim writing, storage failures and unlinked meditation.');

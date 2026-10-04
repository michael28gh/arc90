const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/approved-design.css'), 'utf8');

function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing production section: ${from}`);
  return source.slice(start, end);
}

const normalizationContext = {};
vm.createContext(normalizationContext);
vm.runInContext(section('function normalizeAllDayFocusLock(', 'function normalizeFocusState('), normalizationContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(normalizationContext.normalizeAllDayFocusLock({ on: true, date: '2026-09-13' }))),
  { on: false, date: '2026-09-13', status: 'off', confirmed: false, requestId: '', pendingAction: '' },
  'legacy local state must never become confirmed protection',
);
assert.equal(normalizationContext.normalizeAllDayFocusLock({ on: true, status: 'active', confirmed: true }).on, true);
assert.equal(normalizationContext.normalizeAllDayFocusLock({ on: false, status: 'requested' }).status, 'failed', 'a reload cannot leave a request pending forever');

const startupContext = {
  defaultFocusState: () => ({ sessions: [], unlocks: [], plans: [], apps: [], sites: [] }),
  focusEntry: (_kind, value) => String(value || '').trim(),
  focusEntryKey: (_kind, value) => String(value || '').trim().toLowerCase(),
  normalizeAllDayFocusLock: normalizationContext.normalizeAllDayFocusLock,
  dkey: date => date.toISOString().slice(0, 10),
};
vm.createContext(startupContext);
vm.runInContext(section('function operationalDate(', 'function todayKey()'), startupContext);
vm.runInContext(section('function normalizeFocusState(', 'function rhythmOf('), startupContext);
const legacyFocus = { sessions: [{ id: 'old-session' }], active: { start: '2026-09-13T10:00:00Z' }, unlocks: [{ id: 'old-unlock' }] };
const restoredFocus = startupContext.normalizeFocusState(legacyFocus, 4);
assert.match(restoredFocus.sessions[0].date, /^\d{4}-\d{2}-\d{2}$/);
assert.match(restoredFocus.active.goalDate, /^\d{4}-\d{2}-\d{2}$/);
assert.match(restoredFocus.unlocks[0].date, /^\d{4}-\d{2}-\d{2}$/);

const context = {
  actionable: () => [],
  todayKey: () => '2026-09-13',
  isCompleted: () => false,
  adaptiveMode: () => 'full',
  adaptiveTarget: (habit) => ({ optional: !!habit.optional }),
};
vm.createContext(context);
vm.runInContext(section('function nextFocusRep()', 'function projectedReps()'), context);

const workout = { id: 'move', name: 'Work out', cat: 'fitness' };
const study = { id: 'study', name: 'Deep work', cat: 'work' };
context.actionable = () => [workout, study];
assert.equal(context.nextFocusRep(), study, 'focus-first habits should outrank general habits');
context.actionable = () => [workout];
assert.equal(context.nextFocusRep(), workout, 'a general habit remains a valid fallback');
context.adaptiveMode = () => 'recovery';
context.actionable = () => [{ ...study, optional: true }, workout];
assert.equal(context.nextFocusRep(), workout, 'recovery should prefer an essential over an optional focus-category habit');
context.actionable = () => [{ ...study, optional: true }];
assert.equal(context.nextFocusRep(), null, 'recovery should not promote optional habits');
context.actionable = () => [];
assert.equal(context.nextFocusRep(), null, 'an empty day should render the open-focus state');

const progressContext = { focusRemainingMs: () => 25 * 60000 };
vm.createContext(progressContext);
vm.runInContext(section('function focusProgress(', 'function focusWeekPanel('), progressContext);
assert.equal(progressContext.focusProgress({ minutes: 50 }), 0.5);
progressContext.focusRemainingMs = () => 80 * 60000;
assert.equal(progressContext.focusProgress({ minutes: 50 }), 0, 'progress cannot run below zero');
progressContext.focusRemainingMs = () => 0;
assert.equal(progressContext.focusProgress({ minutes: 50 }), 1, 'completed progress is capped at one');

const view = section('function viewFocus()', 'function focusTargetSummary()');
assert.match(view, /focus-duration-grid/);
assert.match(view, /data-focus-progress/);
assert.match(view, /ritual-clock/);
assert.match(view, /focusWeekPanel\(stats\)/);
assert.match(view, /focusProtectionPanel\(stats, nativeReady\)/);
assert.doesNotMatch(view, /True Opal-style|Soft mode only right now|focus-native-note/);
assert.match(view, /protectionStatus === 'active'/);
assert.match(view, /Shield pending/);
assert.doesNotMatch(view, /nativeReady \? 'Shield on'/);

const durationContext = { adaptiveMode: () => 'full', focusLength: { mode: '', minutes: 25 } };
vm.createContext(durationContext);
vm.runInContext(section('function focusDurations(', 'function focusDurationOption('), durationContext);
assert.equal(durationContext.selectedFocusMinutes(), 25);
durationContext.focusLength = { mode: 'full', minutes: 45 };
assert.equal(durationContext.selectedFocusMinutes(), 45, 'chosen duration persists across renders');
durationContext.adaptiveMode = () => 'recovery';
assert.equal(durationContext.selectedFocusMinutes(), 5, 'Recovery resets to the gentlest block');
durationContext.focusLength = { mode: 'recovery', minutes: 60 };
assert.equal(durationContext.selectedFocusMinutes(), 5, 'unsupported durations do not leak across modes');

const bridgeMessages = [];
const bridgeContext = {
  window: {
    webkit: { messageHandlers: { arc90Focus: { postMessage: (message) => bridgeMessages.push(message) } } },
    setTimeout: () => 1,
  },
  Math,
  Date,
  S: { focus: { mode: 'soft', active: null, allDayLock: { on: false, date: '2026-09-13', status: 'off', requestId: '', pendingAction: '' } } },
  save() {},
  render() {},
};
vm.createContext(bridgeContext);
vm.runInContext(section('function focusNativeBridgeAvailable()', 'function finishFocusSession('), bridgeContext);
const requestId = bridgeContext.requestNativeFocusShield('start', { scope: 'session' });
assert.ok(requestId, 'native protection should return a trackable request id');
assert.equal(bridgeMessages[0].requestId, requestId, 'the native request should carry its acknowledgement id');
bridgeContext.S.focus.active = { protection: { status: 'requested', requestId } };
assert.equal(bridgeContext.focusNativeAcknowledgement({ requestId, status: 'active' }), true);
assert.equal(bridgeContext.S.focus.active.protection.status, 'active', 'shield state changes only after confirmation');

const allDayRequestId = bridgeContext.requestNativeFocusShield('start', { scope: 'all-day' });
bridgeContext.S.focus.allDayLock = { on: false, date: '2026-09-13', status: 'requested', confirmed: false, requestId: allDayRequestId, pendingAction: 'start' };
bridgeContext.focusNativeAcknowledgement({ requestId: allDayRequestId, status: 'active' });
assert.equal(bridgeContext.S.focus.allDayLock.on, true, 'all-day protection turns on only after confirmation');
assert.equal(bridgeContext.S.focus.allDayLock.confirmed, true);

const allDayStopId = bridgeContext.requestNativeFocusShield('stop', { scope: 'all-day' });
bridgeContext.S.focus.allDayLock = { on: true, date: '2026-09-13', status: 'requested', confirmed: true, requestId: allDayStopId, pendingAction: 'stop' };
bridgeContext.focusNativeAcknowledgement({ requestId: allDayStopId, status: 'stopped' });
assert.equal(bridgeContext.S.focus.allDayLock.on, false, 'all-day protection stays on until stop is confirmed');

bridgeContext.S.focus.pendingNativeStop = { requestId: 'cleanup-1', status: 'requested', label: 'Deep work' };
bridgeContext.focusNativeAcknowledgement({ requestId: 'cleanup-1', status: 'failed' });
assert.equal(bridgeContext.S.focus.pendingNativeStop.status, 'failed', 'failed cleanup must stay visible and retryable');
bridgeContext.S.focus.pendingNativeStop = { requestId: 'cleanup-2', status: 'requested', label: 'Deep work' };
bridgeContext.focusNativeAcknowledgement({ requestId: 'cleanup-2', status: 'stopped' });
assert.equal(bridgeContext.S.focus.pendingNativeStop, null, 'confirmed cleanup clears the pending stop');

const finishContext = {
  Date,
  S: { focus: { active: { start: new Date().toISOString(), minutes: 25, label: 'Deep work', strict: true, protection: { status: 'active' }, targets: [], unlocks: 0 }, seq: 0, sessions: [], pendingNativeStop: null, pendingCompletion: null } },
  requestNativeFocusShield: () => 'stop-request',
  dkey: () => '2026-09-13',
  save() {},
};
vm.createContext(finishContext);
vm.runInContext(section('function finishFocusSession(', 'function syncFocusState('), finishContext);
assert.equal(finishContext.finishFocusSession('ended'), true);
assert.equal(finishContext.S.focus.pendingNativeStop.requestId, 'stop-request', 'ending a protected session tracks native cleanup');
assert.equal(finishContext.S.focus.active, null);

const clicks = section("case 'focus-settings-toggle'", "case 'focus-app-toggle'");
assert.match(clicks, /focusSettingsOpen = !focusSettingsOpen/);
assert.match(clicks, /targets: \[habit\.name\]/);
assert.match(clicks, /if \(!focusNativeBridgeAvailable\(\)\)/);
assert.match(clicks, /requestNativeFocusShield\(pendingAction/);
assert.match(clicks, /focus-native-stop-retry/);

const protection = section('function focusProtectionPanel(', 'function viewFocus()');
assert.match(protection, /aria-pressed="\$\{selected\}"/);
const targetSummary = section('function focusTargetSummary()', '/\* All-day lock:');
assert.match(targetSummary, /aria-label="Remove \$\{esc\(t\.value\)\} from protection"/);

for (const selector of [
  '.focus-stage',
  '.focus-duration-grid',
  '.focus-session-ring',
  '.focus-week-bars',
  '.focus-protection-toggle',
  '.focus-protection-details',
  '@media (prefers-reduced-motion:reduce)',
]) assert.ok(css.includes(selector), `Missing Focus styling hook: ${selector}`);

console.log('Focus tab checks passed: essentials, adaptive lengths, active timer, native acknowledgements, weekly graph, accessible protection, and motion safety.');

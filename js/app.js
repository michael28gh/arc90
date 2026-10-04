/* ============================================================
   ARC90 — app logic
   Vanilla JS single-page app · localStorage persistence
   Tabs: Today · Progress · Protocol · Guidance · Profile
   Premium is SIMULATED locally (StoreKit 2 in the native build).
   ============================================================ */

'use strict';

/* ---------------- state ---------------- */

const KEY = 'arc90.v1';
const FREE_HABITS = 8;
const FREE_CUSTOM = 2;
const PREMIUM_OFFER = {
  name: 'Founding Premium',
  price: '$49',
  interval: '/year',
  cadence: 'about $4/month',
  perWeek: 'Just $0.94 / week',
  anchor: 'Less than one coffee a month for your whole 90-day system.',
  cta: 'Get Founder Premium',
  note: 'Launch price for early users. Cancel anytime.',
};

function defaultFocusState() {
  return {
    mode: 'soft',
    apps: [],
    sites: [],
    plans: [],
    sessions: [],
    active: null,
    unlocks: [],
    seq: 0,
    allDayLock: { on: false, date: '', status: 'off', confirmed: false, requestId: '', pendingAction: '' },
    pendingNativeStop: null,
    pendingCompletion: null,
  };
}

function defaultState() {
  return {
    onboarded: false,
    premium: false,
    theme: 'auto',
    preferences: { dayStartHour: 4, reducedMotion: false, shareNames: false, trackers: { water: false, mood: false } },
    profile: { name: '', occupation: '', goal: '', goalCats: [], identity: '', motivation: '', start: null, arcGoalId: null },
    ai: { provider: 'anthropic' },
    aiChat: [],                  // [{role:'user'|'assistant', content}]
    habits: [],                  // [{id, emoji, name, cat, min}]
    adaptive: { date: '', mode: 'full', essentialIds: [], dismissed: {} },
    daySupport: { date: '', capacity: null, friction: '', picks: [] },
    customSeq: 0,
    log: {},                     // { 'YYYY-MM-DD': {done:[], min:[], skip:[]} }
    health: { water: {}, weight: {}, steps: {}, sleep: {}, rhr: {}, hrv: {}, vo2: {}, settings: { waterGoal: 8, stepGoal: 8000, sleepGoal: 7, wakeTarget: '07:00', sleepOnset: 14 } },
    weeklyReviews: {},           // { 'YYYY-WW-ish': {summary, focus, action, generated} }
    product: { stripeMode: 'server-required', nativeBridge: false },
    reminders: { mode: 'daily', time: '08:00' },
    tipSeed: 0,
    firedSlots: {},
    forge: null,                 // {start, focus:[ids], anchor:id}
    focus: defaultFocusState(),  // shield list, focus sessions, schedules, unlocks
    protocols: [],               // [{id, name, type, amount, freq, time, notes, logs:[{date, symptoms, note, urgent}]}]
    protoSeq: 0,
    tasks: [],                   // [{id, title, due:'YYYY-MM-DDTHH:MM'|'', remind:bool, done:bool, notified:bool, created}]
    taskSeq: 0,
    journal: {},                 // { 'YYYY-MM-DD': text }
    planning: Arc90Planning.normalize(),
    brain: Arc90Brain.normalize(),
    pushClientId: '',            // anonymous id for the Web Push registration
    cardStyle: 'analyst',        // share-card style: analyst | certificate | quote | clear
  };
}

// Optional Today trackers. Saved choices win; older data turns a tracker on only if it was
// used in the last 14 days, so nobody loses a habit they rely on. Never reads S: it runs
// inside load(), before S exists.
function normalizeTrackers(data) {
  const saved = data.preferences?.trackers;
  if (saved && typeof saved === 'object') return { water: saved.water === true, mood: saved.mood === true };
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const water = Object.entries(data.health?.water || {}).some(([key, value]) => key >= since && Number(value) > 0);
  const mood = Object.entries(data.log || {}).some(([key, day]) => key >= since && typeof day?.mood === 'string' && day.mood !== '');
  return { water, mood };
}

function normalizeState(data) {
  if (!data || typeof data !== 'object') throw new Error('Backup is not a valid Arc90 data file.');
  const s = Object.assign(defaultState(), data);
  s.theme = ['auto', 'dark', 'light'].includes(data.theme) ? data.theme :
    ['mono', 'gold', 'green', 'red'].includes(data.theme) ? 'dark' : 'auto';
  s.preferences = {
    dayStartHour: Number.isInteger(data.preferences?.dayStartHour) && data.preferences.dayStartHour >= 0 && data.preferences.dayStartHour <= 23 ? data.preferences.dayStartHour : 4,
    reducedMotion: data.preferences?.reducedMotion === true,
    shareNames: data.preferences?.shareNames === true,
    trackers: normalizeTrackers(data),
  };
  s.profile = Object.assign(defaultState().profile, data.profile || {});
  // Never retain credentials from older local data or imported backups.
  s.ai = { provider: ['anthropic', 'openai', 'gemini'].includes(data.ai?.provider) ? data.ai.provider : 'anthropic' };
  s.reminders = Object.assign(defaultState().reminders, data.reminders || {});
  s.daySupport = Arc90DaySupport.normalize(data.daySupport);
  const adaptive = data.adaptive || {};
  s.adaptive = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(adaptive.date || '') ? adaptive.date : '',
    mode: ['full', 'busy', 'recovery'].includes(adaptive.mode) ? adaptive.mode : 'full',
    essentialIds: Array.isArray(adaptive.essentialIds) ? adaptive.essentialIds.map(String).slice(0, 100) : [],
    dismissed: adaptive.dismissed && typeof adaptive.dismissed === 'object' && !Array.isArray(adaptive.dismissed) ? adaptive.dismissed : {},
  };
  if (s.reminders.mode === '5h') s.reminders.mode = '4h';
  s.health = Object.assign(defaultState().health, data.health || {});
  s.health.settings = Object.assign(defaultState().health.settings, (data.health && data.health.settings) || {});
  if (!s.health.settings.wakeTarget) s.health.settings.wakeTarget = '07:00';
  if (!s.health.settings.sleepOnset) s.health.settings.sleepOnset = 14;
  if (!('alarmTime' in s.health.settings)) s.health.settings.alarmTime = '';
  if (!('soundTimerMin' in s.health.settings)) s.health.settings.soundTimerMin = 15;
  if (!('windDown' in s.health.settings)) s.health.settings.windDown = '';
  s.health.water = s.health.water && typeof s.health.water === 'object' ? s.health.water : {};
  s.health.weight = s.health.weight && typeof s.health.weight === 'object' ? s.health.weight : {};
  s.health.steps = s.health.steps && typeof s.health.steps === 'object' ? s.health.steps : {};
  s.health.sleep = s.health.sleep && typeof s.health.sleep === 'object' ? s.health.sleep : {};
  for (const m of ['rhr', 'hrv', 'vo2', 'kcal', 'exercise', 'distance', 'flights', 'spo2', 'resp']) s.health[m] = s.health[m] && typeof s.health[m] === 'object' ? s.health[m] : {};
  s.weeklyReviews = data.weeklyReviews && typeof data.weeklyReviews === 'object' ? data.weeklyReviews : {};
  s.product = Object.assign(defaultState().product, data.product || {});
  // Retired appearance names use the current dark palette on every load.
  s.product.themeV3 = true;
  s.log = data.log && typeof data.log === 'object' ? data.log : {};
  for (const k of Object.keys(s.log)) {
    if (Array.isArray(s.log[k])) s.log[k] = { done: s.log[k], min: [], skip: [] };
    else s.log[k] = Object.assign({ done: [], min: [], skip: [], energy: 0, mood: '', win: '', note: '', feels: {} }, s.log[k] || {});
    if (!s.log[k].feels || typeof s.log[k].feels !== 'object') s.log[k].feels = {};
  }
  s.habits = Array.isArray(data.habits) ? data.habits.map((h) => ({ rhythm: 'daily', emoji: '•', name: 'Untitled habit', cat: 'custom', min: '2-minute version', ...h })) : [];
  s.aiChat = Array.isArray(data.aiChat) ? data.aiChat : [];
  s.focus = normalizeFocusState(data.focus || {}, s.preferences.dayStartHour);
  s.protocols = Array.isArray(data.protocols) ? data.protocols.map((p) => ({
    id: p.id,
    name: p.name || 'Untitled protocol',
    type: p.type || 'supplement',
    freq: p.freq || 'Daily',
    time: p.time || '08:00',
    slot: p.slot || inferDoseSlot(p.time || '08:00'),
    amount: p.amount || p.dose || '',
    reason: p.reason || '',
    notes: p.notes || '',
    logs: Array.isArray(p.logs) ? p.logs : [],
  })) : [];
  s.firedSlots = data.firedSlots && typeof data.firedSlots === 'object' ? data.firedSlots : {};
  s.tasks = Array.isArray(data.tasks) ? data.tasks.map((t) => ({
    id: t.id,
    title: String(t.title || '').slice(0, 200),
    due: t.due || '',
    remind: t.remind !== false,
    done: !!t.done,
    notified: !!t.notified,
    created: t.created || 0,
    goal_id: typeof t.goal_id === 'string' ? t.goal_id : null,
    horizon: ['short', 'mid', 'long'].includes(t.horizon) ? t.horizon : 'short',
    source_dump_id: t.source_dump_id || null,
  })) : [];
  s.taskSeq = Number.isSafeInteger(Number(data.taskSeq)) && Number(data.taskSeq) >= 0 ? Number(data.taskSeq) : 0;
  s.journal = data.journal && typeof data.journal === 'object' ? data.journal : {};
  s.practices = data.practices && typeof data.practices === 'object' && !Array.isArray(data.practices) ? data.practices : {};
  s.planning = Arc90Planning.normalize(data.planning);
  s.brain = Arc90Brain.normalize(data.brain);
  s.cardStyle = ['analyst', 'certificate', 'quote', 'clear'].includes(data.cardStyle) ? data.cardStyle : 'analyst';
  return s;
}

let S = load();
// Ask the browser to protect localStorage/IndexedDB from eviction — critical for a
// 90-day program on iOS, which purges storage after ~7 days of non-use otherwise.
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* best effort */ }
// Refresh the Web Push registration once per launch (subscriptions rotate; prefs may change).
setTimeout(() => { try { if (S.onboarded) syncPushSubscription(); } catch (e) { /* optional */ } }, 5000);
let tab = 'today';
let sheet = null;                // {type:'paywall'|'protocol'|'task'|'edit', ...}
let libCat = 'all';
let libQuery = '';
let libraryOpen = false;
let openQA = null;
let axisMode = 'rings';          // 'rings' (donut+bars) | 'radar'
let protoOpen = null;            // protocol id with open log form
let protoDetailOpen = null;      // protocol id with open quick details
let protoAddOpen = false;
let protoUrgent = false;
let protocolTemplatesOpen = false;
let sleepEditKey = null;          // which day the sleep form is editing (null = today)
let focusSettingsOpen = false;
let focusLength = { mode: '', minutes: 25 };
let practiceDate = null;
let practiceSaveFailed = false;

let ob = null;
function freshOb() {
  return { step: 0, name: '', occs: new Set(), occCustom: '', goal: '', motivation: '', vision: '', brainDump: '', cats: new Set(), picked: new Set(), customs: [], remMode: 'daily', remTime: '08:00' };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.ai && Object.prototype.hasOwnProperty.call(parsed.ai, 'key')) {
        delete parsed.ai.key;
        localStorage.setItem(KEY, JSON.stringify(parsed));
      }
      return normalizeState(parsed);
    }
  } catch (e) { /* corrupted -> fresh */ }
  return defaultState();
}
function save() {
  captureTodaySchedule();
  if (S.ai) delete S.ai.key;
  localStorage.setItem(KEY, JSON.stringify(S));
}

function captureTodaySchedule() {
  if (!S.onboarded || !S.profile.start || !Array.isArray(S.habits) || !S.habits.length) return false;
  const k = todayKey();
  const ids = S.habits.filter((h) => scheduledFor(h, k)).map((h) => String(h.id));
  const current = Array.isArray(S.log[k]?.scheduledIds) ? S.log[k].scheduledIds.map(String) : null;
  if (current && current.length === ids.length && current.every((id, index) => id === ids[index])) return false;
  S.log[k] = { ...dlog(k), scheduledIds: ids };
  return true;
}

function invalidField(input, message) {
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.setCustomValidity(message);
    input.focus();
    input.reportValidity();
  }
  showNudge(message);
  return false;
}

function validNumberField(input, { min = 0, max = Infinity, integer = false } = {}) {
  if (!input) return false;
  input.setCustomValidity('');
  input.removeAttribute('aria-invalid');
  const raw = input.value.trim();
  if (!raw && !input.validity.badInput) return true; // Empty clears the log.
  const value = Number(raw);
  if (input.validity.badInput || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    return invalidField(input, `Enter ${integer ? 'a whole number' : 'a number'} ${Number.isFinite(max) ? `between ${min} and ${max}` : `of at least ${min}`}, or leave blank to clear.`);
  }
  return true;
}

/* ---------------- date helpers ---------------- */

const DAY_MS = 86400000;
function dkey(d) { return d.toLocaleDateString('en-CA'); }
function operationalDate(date = new Date(), dayStartHour = S.preferences?.dayStartHour || 0) {
  const at = new Date(date);
  if (at.getHours() < dayStartHour) at.setDate(at.getDate() - 1);
  return at;
}
function todayKey() { return dkey(operationalDate()); }
function atMidnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startDate() { return atMidnight(new Date(S.profile.start + 'T00:00:00')); }
function dayNumber() {
  const n = Math.round((atMidnight(operationalDate()) - startDate()) / DAY_MS) + 1;
  return Math.max(1, Math.min(90, n));
}
function elapsedDays() { return dayNumber(); }
function daysLeft() { return 90 - dayNumber(); }
function fmtDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

const RHYTHMS = {
  daily: { label: 'Daily', short: 'Daily', days: [0, 1, 2, 3, 4, 5, 6] },
  weekdays: { label: 'Weekdays', short: 'Mon-Fri', days: [1, 2, 3, 4, 5] },
  weekends: { label: 'Weekends', short: 'Sat-Sun', days: [0, 6] },
  mwf: { label: 'Mon / Wed / Fri', short: 'M/W/F', days: [1, 3, 5] },
  tuethu: { label: 'Tue / Thu', short: 'T/Th', days: [2, 4] },
  weekly: { label: 'Weekly (Sunday)', short: 'Weekly', days: [0] },
};

const FOCUS_APP_SUGGESTIONS = ['Instagram', 'TikTok', 'YouTube', 'X', 'Reddit', 'Discord', 'Safari', 'Messages'];
const FOCUS_SITE_SUGGESTIONS = ['instagram.com', 'youtube.com', 'x.com', 'reddit.com', 'news.ycombinator.com', 'netflix.com'];
const FOCUS_PLAN_TEMPLATES = [
  { id: 'morning-build', name: 'Morning build', days: [1, 2, 3, 4, 5], start: '08:30', end: '11:00', strict: true },
  { id: 'study-sprint', name: 'Study sprint', days: [1, 2, 3, 4, 5], start: '13:00', end: '15:00', strict: true },
  { id: 'evening-reset', name: 'Evening reset', days: [0, 1, 2, 3, 4, 5, 6], start: '20:30', end: '22:00', strict: false },
];

function focusEntry(kind, value) {
  let out = String(value || '').trim();
  if (!out) return '';
  if (kind === 'sites') {
    out = out.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
  } else {
    out = out.replace(/\s+/g, ' ');
  }
  return out;
}

function focusEntryKey(kind, value) {
  return focusEntry(kind, value).toLowerCase();
}

function normalizeAllDayFocusLock(value) {
  if (!value || typeof value !== 'object') {
    return { on: false, date: '', status: 'off', confirmed: false, requestId: '', pendingAction: '' };
  }
  const confirmed = value.confirmed === true;
  const on = confirmed && !!value.on;
  const status = value.status === 'requested'
    ? 'failed'
    : value.status === 'failed'
      ? 'failed'
      : on && value.status === 'active' ? 'active' : 'off';
  return {
    on,
    date: value.date || '',
    status,
    confirmed,
    requestId: '',
    pendingAction: '',
  };
}

function normalizeFocusState(data, dayStartHour = 4) {
  const base = Object.assign(defaultFocusState(), data || {});
  const fallbackDate = dkey(operationalDate(new Date(), dayStartHour));
  const normalizeList = (kind, arr) => {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(arr) ? arr : []) {
      const value = focusEntry(kind, raw);
      const key = focusEntryKey(kind, value);
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out;
  };
  return {
    mode: base.mode === 'native-ready' ? 'native-ready' : 'soft',
    apps: normalizeList('apps', base.apps),
    sites: normalizeList('sites', base.sites),
    plans: Array.isArray(base.plans) ? base.plans.map((p, i) => ({
      id: p.id || `fp${i + 1}`,
      name: p.name || 'Focus block',
      days: Array.isArray(p.days) ? p.days.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6) : [1, 2, 3, 4, 5],
      start: p.start || '09:00',
      end: p.end || '11:00',
      strict: !!p.strict,
    })) : [],
    sessions: Array.isArray(base.sessions) ? base.sessions.map((s, i) => ({
      id: s.id || `fs${i + 1}`,
      date: s.date || fallbackDate,
      startedAt: s.startedAt || new Date().toISOString(),
      label: s.label || 'Focus session',
      minutes: Math.max(1, Number(s.minutes) || 30),
      actualMinutes: Math.max(0, Number(s.actualMinutes) || Number(s.minutes) || 30),
      strict: !!s.strict,
      status: s.status || 'completed',
      unlocks: Math.max(0, Number(s.unlocks) || 0),
      targets: Array.isArray(s.targets) ? s.targets : [],
    })) : [],
    active: base.active && base.active.start ? {
      start: base.active.start,
      minutes: Math.max(1, Number(base.active.minutes) || 30),
      label: base.active.label || 'Focus session',
      strict: !!base.active.strict,
      targets: Array.isArray(base.active.targets) ? base.active.targets : [],
      unlocks: Math.max(0, Number(base.active.unlocks) || 0),
      habitId: base.active.habitId == null ? null : String(base.active.habitId),
      goalDate: /^\d{4}-\d{2}-\d{2}$/.test(base.active.goalDate || '') ? base.active.goalDate : fallbackDate,
      targetStatus: base.active.targetStatus === 'min' ? 'min' : 'done',
      protection: base.active.protection && typeof base.active.protection === 'object' ? {
        status: base.active.protection.status === 'active' ? 'active' : base.active.protection.status === 'requested' ? 'failed' : 'off',
        requestId: '',
      } : { status: 'off', requestId: '' },
    } : null,
    unlocks: Array.isArray(base.unlocks) ? base.unlocks.map((u, i) => ({
      id: u.id || `fu${i + 1}`,
      date: u.date || fallbackDate,
      reason: u.reason || 'Manual unlock',
      label: u.label || '',
    })) : [],
    seq: Math.max(0, Number(base.seq) || 0),
    pendingCompletion: base.pendingCompletion && /^\d{4}-\d{2}-\d{2}$/.test(base.pendingCompletion.date || '') ? {
      habitId: String(base.pendingCompletion.habitId), date: base.pendingCompletion.date,
      status: base.pendingCompletion.status === 'min' ? 'min' : 'done',
      label: String(base.pendingCompletion.label || 'Focus session').slice(0, 200),
    } : null,
    allDayLock: normalizeAllDayFocusLock(base.allDayLock),
    pendingNativeStop: base.pendingNativeStop && typeof base.pendingNativeStop === 'object' ? {
      requestId: '',
      status: 'failed',
      label: String(base.pendingNativeStop.label || 'Previous focus session').slice(0, 200),
    } : null,
  };
}

function rhythmOf(h) { return RHYTHMS[h.rhythm] ? h.rhythm : 'daily'; }
function rhythmLabel(h, compact = false) {
  const r = RHYTHMS[rhythmOf(h)];
  return compact ? r.short : r.label;
}
function scheduledFor(h, k) {
  const d = new Date(k + 'T00:00:00').getDay();
  return RHYTHMS[rhythmOf(h)].days.includes(d);
}

/* ---------------- habit math (forgiving scoring) ---------------- */

function dlog(k) {
  const v = S.log[k];
  const base = { done: [], min: [], skip: [], energy: 0, mood: '', win: '', note: '', intention: '', feels: {}, completedAt: {}, completionHours: {}, scheduledIds: null };
  if (!v) return base;
  if (Array.isArray(v)) return { ...base, done: v };
  return {
    ...base,
    ...v,
    done: v.done || [],
    min: v.min || [],
    skip: v.skip || [],
    energy: Number(v.energy) || 0,
    mood: v.mood || '',
    win: v.win || '',
    note: v.note || '',
    intention: v.intention || '',
    completedAt: v.completedAt && typeof v.completedAt === 'object' && !Array.isArray(v.completedAt) ? v.completedAt : {},
    completionHours: v.completionHours && typeof v.completionHours === 'object' && !Array.isArray(v.completionHours) ? v.completionHours : {},
    scheduledIds: Array.isArray(v.scheduledIds) ? v.scheduledIds.map(String) : null,
  };
}
function statusOf(id, k) {
  const l = dlog(k);
  if (l.done.includes(id)) return 'done';
  if (l.min.includes(id)) return 'min';
  if (l.skip.includes(id)) return 'skip';
  return null;
}
function setStatus(id, k, status) {
  const l = dlog(k);
  for (const key of ['done', 'min', 'skip']) l[key] = l[key].filter((x) => x !== id);
  if (status) l[status].push(id);
  // Timing hints use real check-off times, never guessed times for edited history.
  if (status === 'done' || status === 'min') {
    if (k === todayKey() && !l.completedAt[id]) {
      const now = new Date();
      l.completedAt[id] = now.toISOString();
      l.completionHours[id] = now.getHours();
    }
  } else { delete l.completedAt[id]; delete l.completionHours[id]; }
  S.log[k] = l;
  save();
}
function isCompleted(id, k) { const s = statusOf(id, k); return s === 'done' || s === 'min'; }

function toggle(id) {
  const k = todayKey();
  const wasAll = allDoneToday();
  const completing = !isCompleted(id, k);
  setStatus(id, k, completing ? 'done' : null);
  if (completing && navigator.vibrate) navigator.vibrate(12);
  render();
  if (!wasAll && allDoneToday()) confetti();
  if (completing) {
    const h = S.habits.find((x) => String(x.id) === String(id));
    if (h) showFeelNudge(h);
  }
}

function actionable(k) {
  return S.habits.filter((h) => {
    const st = statusOf(h.id, k);
    if (st === 'skip') return false;
    return scheduledFor(h, k) || st === 'done' || st === 'min';
  });
}

function allDoneToday() {
  const act = actionable(todayKey());
  if (!act.length) return false;
  return act.every((h) => isCompleted(h.id, todayKey()));
}

/* day rate: completed ÷ scheduled (skipped excluded). null = fully rested day */
function rateFor(k) {
  if (!S.habits.length) return 0;
  const act = actionable(k);
  if (!act.length) return null;
  return act.filter((h) => isCompleted(h.id, k)).length / act.length;
}

function avgRate(nDays) {
  const today = atMidnight(operationalDate());
  const span = Math.min(nDays, elapsedDays());
  let sum = 0, n = 0;
  for (let i = 0; i < span; i++) {
    const r = rateFor(dkey(addDays(today, -i)));
    if (r !== null) { sum += r; n++; }
  }
  return n ? sum / n : 0;
}

/* Momentum Score: recent consistency weighted over the whole challenge.
   60% last-7-days + 40% whole challenge. Rest days excluded, one miss can't sink it,
   and coming back the day after a miss earns a bonus — recovery is rewarded, not punished. */
function comebackBonusAsOf(back) {
  const ref = addDays(atMidnight(operationalDate()), -back);
  if (!dayCompleted(dkey(ref))) return 0;             // only rewards showing up that day
  for (let i = 1; i <= 3; i++) {                      // scan recent days for a miss to recover from
    const k = dkey(addDays(ref, -i));
    if (rateFor(k) === null) continue;                // rest day — skip
    return dayCompleted(k) ? 0 : 6;                   // missed then bounced back → +6
  }
  return 0;
}
function comebackBonus() { return comebackBonusAsOf(0); }
function momentumAsOf(back) {
  const base = 100 * (0.6 * avgRateWindow(back, 7) + 0.4 * avgRateWindow(back, 90));
  return Math.round(Math.max(0, Math.min(100, base + comebackBonusAsOf(back))));
}
function momentum() { return momentumAsOf(0); }
/* change vs yesterday — shown as a daily delta so momentum feels alive */
function momentumDelta() { return momentumAsOf(0) - momentumAsOf(1); }

function habitRate(id, n) {
  const today = atMidnight(operationalDate());
  const span = Math.min(n, elapsedDays());
  let hit = 0, sched = 0;
  for (let i = 0; i < span; i++) {
    const k = dkey(addDays(today, -i));
    const s = statusOf(id, k);
    const h = S.habits.find((x) => String(x.id) === String(id));
    if (h && !scheduledFor(h, k) && s !== 'done' && s !== 'min') continue;
    if (s === 'skip') continue;
    sched++;
    if (s === 'done' || s === 'min') hit++;
  }
  return sched ? hit / sched : 1;
}

function weakestHabit() {
  if (S.habits.length < 2 || elapsedDays() < 2) return null;
  let worst = null, worstR = Infinity;
  for (const h of S.habits) {
    const r = habitRate(h.id, 7);
    if (r < worstR) { worstR = r; worst = h; }
  }
  return worst && worstR < 0.85 ? { habit: worst, rate: worstR } : null;
}
function strongestHabit() {
  let best = null, bestR = -1;
  for (const h of S.habits) {
    const r = habitRate(h.id, 7);
    if (r > bestR) { bestR = r; best = h; }
  }
  return best ? { habit: best, rate: bestR } : null;
}

/* ---------- Weak Spot Tracker: where the user keeps slipping (by category) ---------- */
function categoryRate(catId, days, offset = 0) {
  const ids = S.habits.filter((h) => (h.cat || 'custom') === catId).map((h) => h.id);
  if (!ids.length) return null;
  const today = atMidnight(operationalDate());
  let hit = 0, sched = 0;
  for (let i = offset; i < offset + days && i < elapsedDays(); i++) {
    const k = dkey(addDays(today, -i));
    for (const id of ids) {
      const h = S.habits.find((x) => String(x.id) === String(id));
      const s = statusOf(id, k);
      if (h && !scheduledFor(h, k) && s !== 'done' && s !== 'min') continue;
      if (s === 'skip') continue;
      sched++;
      if (s === 'done' || s === 'min') hit++;
    }
  }
  return sched ? hit / sched : null;
}

function weakSpots() {
  const cats = [...new Set(S.habits.map((h) => h.cat || 'custom'))];
  const out = [];
  for (const id of cats) {
    const rate = categoryRate(id, 14);
    if (rate === null) continue;
    const recent = categoryRate(id, 7, 0), prior = categoryRate(id, 7, 7);
    let trend = 'flat';
    if (recent != null && prior != null) {
      if (recent - prior >= 0.08) trend = 'up';
      else if (prior - recent >= 0.08) trend = 'down';
    }
    out.push({ catId: id, cat: catOf(id), rate, trend });
  }
  return out.sort((a, b) => a.rate - b.rate);
}

/* which weekday/segment this category gets dropped most — for a pattern observation, not a verdict */
function worstDayLabel(catId) {
  const ids = S.habits.filter((h) => (h.cat || 'custom') === catId).map((h) => h.id);
  if (!ids.length) return null;
  const today = atMidnight(operationalDate());
  const dow = Array.from({ length: 7 }, () => ({ hit: 0, sched: 0 }));
  for (let i = 0; i < Math.min(28, elapsedDays()); i++) {
    const d = addDays(today, -i), k = dkey(d);
    for (const id of ids) {
      const h = S.habits.find((x) => String(x.id) === String(id));
      const s = statusOf(id, k);
      if (h && !scheduledFor(h, k) && s !== 'done' && s !== 'min') continue;
      if (s === 'skip') continue;
      dow[d.getDay()].sched++;
      if (s === 'done' || s === 'min') dow[d.getDay()].hit++;
    }
  }
  const rate = (arr) => { let h = 0, sc = 0; for (const x of arr) { h += x.hit; sc += x.sched; } return sc >= 2 ? h / sc : null; };
  const weekend = rate([dow[0], dow[6]]), week = rate([dow[1], dow[2], dow[3], dow[4], dow[5]]);
  if (weekend != null && week != null && week - weekend >= 0.2) return 'weekends';
  const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  let worst = null, worstR = 1;
  for (let d = 0; d < 7; d++) { const x = dow[d]; if (x.sched >= 2) { const r = x.hit / x.sched; if (r < worstR) { worstR = r; worst = d; } } }
  return worst != null && worstR <= 0.5 ? names[worst] : null;
}

function observationFor(w) {
  if (w.trend === 'up') return 'You’re clawing this one back. Keep the thread alive.';
  const day = worstDayLabel(w.catId);
  if (day) return `You tend to miss this on ${day}. Plan one small rep there.`;
  if (w.trend === 'down') return 'This slipped this week — a minimum rep still counts.';
  return 'This is your softest spot right now. One rep moves it.';
}

function catSparkDots(catId, days) {
  const ids = S.habits.filter((h) => (h.cat || 'custom') === catId).map((h) => h.id);
  const today = atMidnight(operationalDate());
  let out = '';
  for (let i = days - 1; i >= 0; i--) {
    if (i >= elapsedDays()) { out += '<i class="wsd off"></i>'; continue; }
    const k = dkey(addDays(today, -i));
    let hit = 0, sched = 0;
    for (const id of ids) {
      const h = S.habits.find((x) => String(x.id) === String(id));
      const s = statusOf(id, k);
      if (h && !scheduledFor(h, k) && s !== 'done' && s !== 'min') continue;
      if (s === 'skip') continue;
      sched++;
      if (s === 'done' || s === 'min') hit++;
    }
    const cls = sched === 0 ? 'rest' : hit === 0 ? 'miss' : hit >= sched ? 'full' : 'part';
    out += `<i class="wsd ${cls}"></i>`;
  }
  return out;
}

function weakSpotCard() {
  if (!S.habits.length || elapsedDays() < 3) return '';
  const spots = weakSpots();
  if (!spots.length) return '';
  const w = spots[0];
  if (w.rate >= 0.85) return '';   // nothing meaningfully weak — don't manufacture a problem
  const pct = Math.round(w.rate * 100);
  const arrow = w.trend === 'up' ? '↑' : w.trend === 'down' ? '↓' : '→';
  const tlabel = w.trend === 'up' ? 'improving' : w.trend === 'down' ? 'slipping' : 'holding';
  const more = !hasPremiumAccess()
    ? `<button class="ws-more locked" data-act="paywall">Unlock full pattern history →</button>`
    : (spots.length > 1 ? `<button class="ws-more" data-act="tab" data-id="progress">See all ${spots.length} patterns →</button>` : '');
  return `
    <section class="card weakspot-card">
      <div class="ws-head">
        <span class="eyebrow">Weak spot</span>
        <span class="ws-trend ${w.trend}">${arrow} ${tlabel}</span>
      </div>
      <div class="ws-body">
        <span class="ws-ico">${w.cat.emoji}</span>
        <div class="ws-main">
          <b>${esc(w.cat.name)}</b>
          <div class="ws-rate">${pct}% kept · last 14 days</div>
        </div>
      </div>
      <div class="ws-spark" aria-hidden="true">${catSparkDots(w.catId, 14)}</div>
      <p class="ws-note">${esc(observationFor(w))}</p>
      ${more}
    </section>`;
}

/* ---------- Comeback Button: the smallest next action to recover momentum ---------- */
const COMEBACK_MICROS = [
  'Drink one full glass of water', 'Walk for two minutes', 'Write one sentence',
  'Tidy one small thing', 'Take five slow breaths', 'Do five push-ups', 'Step outside for sixty seconds',
];
function comebackMicro(n = 0) { return COMEBACK_MICROS[n % COMEBACK_MICROS.length]; }

function comebackRep(n = 0) {
  const k = todayKey();
  const pending = S.habits.filter((h) => scheduledFor(h, k) && !isCompleted(h.id, k) && statusOf(h.id, k) !== 'skip');
  if (!pending.length) return null;
  const ordered = [...pending.filter((h) => h.min), ...pending.filter((h) => !h.min)];   // easiest (has a minimum) first
  return ordered[n % ordered.length];
}

function comebackBtn() {
  if (!S.habits.length) return '';
  const urgent = momentum() < 50 || !allDoneToday();
  const title = urgent ? 'Feeling off track?' : 'Want a quick win?';
  const sub = urgent ? 'Tap for your smallest next move' : 'One small rep to extend the lead';
  return `
    <button class="comeback-btn ${urgent ? 'urgent' : ''}" data-act="comeback">
      <span class="cb-ico">↻</span>
      <span class="cb-txt"><b>${title}</b><span>${sub} →</span></span>
    </button>`;
}

function sheetComeback() {
  const n = (sheet && sheet.n) || 0;
  const h = comebackRep(n);
  if (h) {
    const micro = h.min || 'Just the two-minute version';
    return `
      <div class="cb-sheet">
        <span class="eyebrow">Your comeback move</span>
        <h3 class="cb-title">One rep. Right now.</h3>
        <p class="cb-lead">Forget the streak and forget yesterday. Momentum restarts with a single action.</p>
        <div class="cb-action">
          <span class="cb-action-ico">${habitIcon(h)}</span>
          <div class="cb-action-txt"><b>${esc(h.name)}</b><span>${esc(micro)}</span></div>
        </div>
        <button class="btn cb-do" data-act="comeback-do" data-id="${h.id}">I did it →</button>
        <button class="cb-other" data-act="comeback-other">Give me a different one</button>
      </div>`;
  }
  const micro = comebackMicro(n);
  return `
    <div class="cb-sheet">
      <span class="eyebrow">Your comeback move</span>
      <h3 class="cb-title">One tiny action.</h3>
      <p class="cb-lead">You’ve cleared today’s reps — here’s a bonus to stack a little more momentum.</p>
      <div class="cb-action generic">
        <span class="cb-action-ico">↻</span>
        <div class="cb-action-txt"><b>${esc(micro)}</b><span>Do it now, then come back</span></div>
      </div>
      <button class="btn cb-do" data-act="comeback-generic-do">I did it →</button>
      <button class="cb-other" data-act="comeback-other">Give me a different one</button>
    </div>`;
}

/* ---------- Proof Wall: visual evidence of the transformation ---------- */
const PROOF_TAGS = ['Win', 'Progress', 'Milestone', 'Note'];
const PROOF_FREE_PHOTOS = 10;

/* IndexedDB blob store — localStorage is too small for images */
function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('arc90', 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('proof')) db.createObjectStore('proof'); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function idbPut(key, blob) { return idbOpen().then((db) => new Promise((res, rej) => { const tx = db.transaction('proof', 'readwrite'); tx.objectStore('proof').put(blob, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); })); }
function idbGet(key) { return idbOpen().then((db) => new Promise((res, rej) => { const tx = db.transaction('proof', 'readonly'); const r = tx.objectStore('proof').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); }
function idbDel(key) { return idbOpen().then((db) => new Promise((res, rej) => { const tx = db.transaction('proof', 'readwrite'); tx.objectStore('proof').delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); })); }

/* downscale on import so stored proof stays small and fast */
function downscaleImage(file, maxDim = 1280, quality = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
      else if (h >= w && h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => b ? res(b) : rej(new Error('encode failed')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('load failed')); };
    img.src = url;
  });
}

function proofItems() { return (S.proof || []).slice().sort((a, b) => b.ts - a.ts); }
function proofPhotoCount() { return (S.proof || []).filter((p) => p.type === 'photo').length; }
function proofId(prefix) { return prefix + Date.now().toString(36) + '-' + (proofSeq++); }

const proofUrlCache = {};
function hydrateProofImages() {
  document.querySelectorAll('img[data-proof-id]').forEach((el) => {
    if (el.dataset.hydrated) return;
    const id = el.getAttribute('data-proof-id');
    el.dataset.hydrated = '1';
    if (proofUrlCache[id]) { el.src = proofUrlCache[id]; return; }
    idbGet(id).then((blob) => { if (blob) { const u = URL.createObjectURL(blob); proofUrlCache[id] = u; el.src = u; } }).catch(() => {});
  });
}

function arcAddProofPhoto(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (!hasPremiumAccess() && proofPhotoCount() >= PROOF_FREE_PHOTOS) { gate('proof-limit'); return; }
  downscaleImage(file).then((blob) => {
    const id = proofId('p');
    return idbPut(id, blob).then(() => {
      S.proof = S.proof || [];
      S.proof.push({ id, type: 'photo', tag: 'Progress', ts: Date.now(), day: todayKey() });
      save();
      sheet = { type: 'proof', filter: 'all' };
      render();
      if (navigator.vibrate) navigator.vibrate(12);
      track('proof_added', { type: 'photo' });
    });
  }).catch(() => showNudge('Could not add that image. Try another.'));
}

function addProofNote() {
  const ta = document.getElementById('proofNote');
  const text = (ta ? ta.value : '').trim();
  if (!text) return;
  S.proof = S.proof || [];
  S.proof.push({ id: proofId('n'), type: 'note', text, tag: proofTag || 'Win', ts: Date.now(), day: todayKey() });
  save();
  sheet = { type: 'proof', filter: 'all' };
  render();
  track('proof_added', { type: 'note' });
}

function delProof(id) {
  const it = (S.proof || []).find((p) => p.id === id);
  S.proof = (S.proof || []).filter((p) => p.id !== id);
  save();
  if (it && it.type === 'photo') {
    idbDel(id).catch(() => {});
    if (proofUrlCache[id]) { URL.revokeObjectURL(proofUrlCache[id]); delete proofUrlCache[id]; }
  }
  render();
}

function proofDayLabel(p) {
  const y = dkey(addDays(atMidnight(operationalDate()), -1));
  if (p.day === todayKey()) return 'Today';
  if (p.day === y) return 'Yesterday';
  try { return fmtDate(dateFromKey(p.day)); } catch (e) { return ''; }
}

function proofCard(featured = false) {
  const items = proofItems();
  const count = items.length;
  const thumbs = items.filter((p) => p.type === 'photo').slice(0, featured ? 5 : 4);
  return `
    <section class="card proof-card${featured ? ' proof-featured' : ''}" data-act="proof-open" role="button" tabindex="0">
      <div class="ws-head">
        <span class="eyebrow">Proof wall</span>
        <span class="proof-count">${count ? count + ' entr' + (count === 1 ? 'y' : 'ies') : 'Start it'}</span>
      </div>
      ${featured ? `<div class="proof-feat-title">The receipts on who you’re becoming</div>` : ''}
      ${thumbs.length ? `<div class="proof-thumbs">${thumbs.map((p) => `<span class="pth"><img data-proof-id="${p.id}" alt=""></span>`).join('')}</div>` : ''}
      <p class="proof-sub">${count ? 'Your evidence that you’re changing. Tap to add or browse →' : 'Capture proof you’re improving — a photo, a screenshot, a small win. Tap to start your evidence file →'}</p>
    </section>`;
}

function proofTile(p) {
  const date = `<span class="pt-date">${proofDayLabel(p)}</span>`;
  const tag = p.tag ? `<span class="pt-tag ${p.tag.toLowerCase()}">${p.tag}</span>` : '';
  const del = `<button class="pt-del" data-act="proof-del" data-id="${p.id}" aria-label="Delete proof">✕</button>`;
  if (p.type === 'photo') return `<figure class="proof-tile photo"><img data-proof-id="${p.id}" alt="Progress photo">${del}<figcaption>${tag}${date}</figcaption></figure>`;
  return `<figure class="proof-tile note"><blockquote>${esc(p.text || '')}</blockquote>${del}<figcaption>${tag}${date}</figcaption></figure>`;
}

function sheetProofWall() {
  const filter = (sheet && sheet.filter) || 'all';
  const all = proofItems();
  const items = all.filter((p) => filter === 'all' || p.tag === filter);
  const compose = sheet && sheet.compose;
  // Export is never premium-gated: users always own their data ("honest & private by default")
  const exportBtn = all.length ? `<button class="proof-export" data-act="proof-export">Export</button>` : '';
  const filters = ['all', ...PROOF_TAGS].map((t) => `<button class="proof-fchip ${filter === t ? 'on' : ''}" data-act="proof-filter" data-id="${t}">${t === 'all' ? 'All' : t}</button>`).join('');
  const composer = compose ? `
      <div class="proof-composer">
        <textarea id="proofNote" class="proof-ta" rows="3" placeholder="A small win, a milestone, a note to future you…"></textarea>
        <div class="proof-tagrow">${PROOF_TAGS.map((t) => `<button class="proof-tag ${proofTag === t ? 'on' : ''}" data-act="proof-note-tag" data-id="${t}">${t}</button>`).join('')}</div>
        <div class="proof-composer-actions">
          <button class="cb-other" data-act="proof-compose-cancel">Cancel</button>
          <button class="btn" data-act="proof-save-note">Save proof</button>
        </div>
      </div>` : '';
  const grid = items.length
    ? `<div class="proof-grid">${items.map(proofTile).join('')}</div>`
    : `<div class="proof-empty"><div class="pe-ico">🧱</div><b>${all.length ? 'Nothing under this filter' : 'No proof yet'}</b><span>${all.length ? 'Try another tag.' : 'Add your first photo or win — small evidence compounds into undeniable proof.'}</span></div>`;
  const capNote = !hasPremiumAccess() ? `<div class="proof-cap">${proofPhotoCount()}/${PROOF_FREE_PHOTOS} free photos used · <button class="inline-link" data-act="paywall">unlimited with Premium</button></div>` : '';
  return `
    <div class="proof-sheet">
      <div class="proof-head">
        <div><h3 class="cb-title" style="margin:0">Proof Wall</h3><p class="proof-headsub">Evidence you’re becoming who you said.</p></div>
        ${exportBtn}
      </div>
      <div class="proof-add">
        <label class="proof-add-btn" for="proofFile">📸 Photo</label>
        <input type="file" id="proofFile" accept="image/*" hidden>
        <button class="proof-add-btn" data-act="proof-compose">✍️ Note / win</button>
      </div>
      ${composer}
      <div class="proof-filters">${filters}</div>
      ${grid}
      ${capNote}
    </div>`;
}

function blobToDataURL(blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); }); }
function dataURLToBlob(dataURL) { return fetch(dataURL).then((r) => r.blob()).catch(() => null); }
function arcExportProof() {
  const items = proofItems();
  if (!items.length) { showNudge('Add some proof first.'); return; }
  Promise.all(items.map((p) => p.type === 'photo' ? idbGet(p.id).then((b) => b ? blobToDataURL(b) : null).catch(() => null) : Promise.resolve(null)))
    .then((datas) => {
      const cards = items.map((p, i) => {
        const head = `<div class="d">${proofDayLabel(p)} · ${esc(p.tag || '')}</div>`;
        if (p.type === 'photo' && datas[i]) return `<div class="c">${head}<img src="${datas[i]}"></div>`;
        if (p.type === 'note') return `<div class="c">${head}<p>${esc(p.text || '')}</p></div>`;
        return '';
      }).join('');
      const html = `<!doctype html><meta charset="utf8"><title>ARC90 — My Proof</title><style>body{font-family:-apple-system,system-ui,sans-serif;background:#07080c;color:#e8e8f0;max-width:680px;margin:0 auto;padding:32px}h1{font-weight:800;letter-spacing:-.02em}.c{background:#12131a;border:1px solid #23242e;border-radius:14px;padding:14px;margin:12px 0}.c img{width:100%;border-radius:10px;display:block}.d{font-size:11px;color:#9aa;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}p{margin:0;line-height:1.5}</style><h1>ARC90 — My Proof</h1><p style="color:#9aa">${items.length} entries · Day ${dayNumber()} of 90</p>${cards}`;
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'arc90-proof.html'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      track('proof_exported');
    }).catch(() => showNudge('Export failed. Try again.'));
}

/* ---------- Share progress: a Strava-style 9:16 story card + native share sheet ---------- */
function storyRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function storyTruncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/* Greedy word-wrap for canvas text; last permitted line gets an ellipsis on overflow. */
function storyWrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const t = cur ? cur + ' ' + words[i] : words[i];
    if (ctx.measureText(t).width <= maxW || !cur) { cur = t; continue; }
    lines.push(cur);
    cur = words[i];
    if (lines.length === maxLines - 1) {
      const rest = [cur, ...words.slice(i + 1)].join(' ');
      lines.push(storyTruncate(ctx, rest, maxW));
      return lines;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* draws the shareable card at Instagram-Stories resolution (1080×1920) */
function buildStoryCanvas() {
  const W = 1080, H = 1920, cx = W / 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const day = dayNumber();
  const frac = Math.max(0, Math.min(1, day / 90));
  const mom = momentum(), stk = dayStreak(), reps = totalReps();
  const goal = (S.profile && S.profile.goal) || 'My next 90 days';
  const SANS = '-apple-system, "Helvetica Neue", Arial, sans-serif';

  const INK = '#f4f5ff', MUTE = 'rgba(221,225,255,0.56)', FAINT = 'rgba(221,225,255,0.40)';
  const cap = (s) => s.split('').join(' ');

  // background: vertical depth gradient + one focal glow behind the ring
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#111315'); bg.addColorStop(0.45, '#0d0f11'); bg.addColorStop(1, '#080a0b');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, 936, 0, cx, 936, 720);
  glow.addColorStop(0, 'rgba(179,223,189,0.16)'); glow.addColorStop(1, 'rgba(7,8,12,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 2;
  storyRoundRect(ctx, 40, 40, W - 80, H - 80, 54); ctx.stroke();

  ctx.textBaseline = 'alphabetic';

  // wordmark
  ctx.font = '800 86px ' + SANS;
  const wArc = ctx.measureText('ARC').width, wNine = ctx.measureText('90').width;
  const x0 = cx - (wArc + wNine) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK; ctx.fillText('ARC', x0, 230);
  const wm = ctx.createLinearGradient(x0 + wArc, 0, x0 + wArc + wNine, 0);
  wm.addColorStop(0, '#9ac9ed'); wm.addColorStop(1, '#b3dfbd');
  ctx.fillStyle = wm; ctx.fillText('90', x0 + wArc, 230);
  ctx.textAlign = 'center';

  // hairline divider
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 44, 284); ctx.lineTo(cx + 44, 284); ctx.stroke();

  // eyebrow + goal
  ctx.fillStyle = FAINT; ctx.font = '700 25px ' + SANS;
  ctx.fillText(cap('MY 90-DAY ARC'), cx, 350);
  ctx.fillStyle = INK; ctx.font = '600 56px ' + SANS;
  ctx.fillText(storyTruncate(ctx, goal, W - 280), cx, 426);

  // hero ring
  const ry = 936, r = 326;
  ctx.lineCap = 'round'; ctx.lineWidth = 36;
  ctx.strokeStyle = 'rgba(221,225,255,0.13)';
  ctx.beginPath(); ctx.arc(cx, ry, r, 0, 2 * Math.PI); ctx.stroke();
  const a0 = -Math.PI / 2, a1 = a0 + 2 * Math.PI * frac;
  const rg = ctx.createLinearGradient(cx - r, ry - r, cx + r, ry + r);
  rg.addColorStop(0, '#9ac9ed'); rg.addColorStop(1, '#b3dfbd');
  ctx.save();
  ctx.shadowColor = 'rgba(179,223,189,0.32)'; ctx.shadowBlur = 38;
  ctx.strokeStyle = rg; ctx.beginPath(); ctx.arc(cx, ry, r, a0, a1); ctx.stroke();
  ctx.restore();
  // leading "activity dot" at the arc tip
  ctx.save();
  ctx.shadowColor = 'rgba(154,201,237,0.46)'; ctx.shadowBlur = 24;
  ctx.fillStyle = '#e4f2e7';
  ctx.beginPath(); ctx.arc(cx + r * Math.cos(a1), ry + r * Math.sin(a1), 14, 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
  // ring center — measure the numeral's ink box and center it exactly on the ring middle (ry)
  ctx.fillStyle = INK; ctx.font = '800 232px ' + SANS;
  const numStr = String(day);
  const nm = ctx.measureText(numStr);
  const nAsc = nm.actualBoundingBoxAscent || 165, nDesc = nm.actualBoundingBoxDescent || 0;
  const numBase = ry + (nAsc - nDesc) / 2;
  ctx.fillText(numStr, cx, numBase);
  const numTop = numBase - nAsc, numBot = numBase + nDesc;
  ctx.fillStyle = MUTE; ctx.font = '700 30px ' + SANS; ctx.fillText(cap('DAY'), cx, numTop - 34);
  ctx.fillStyle = MUTE; ctx.font = '600 38px ' + SANS; ctx.fillText('of 90', cx, numBot + 56);

  // stats panel (glass) with hairline dividers
  const px = 96, pw = W - 192, py = 1432, ph = 226;
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  storyRoundRect(ctx, px, py, pw, ph, 40); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
  storyRoundRect(ctx, px, py, pw, ph, 40); ctx.stroke();
  for (const dvx of [px + pw / 3, px + 2 * pw / 3]) { ctx.beginPath(); ctx.moveTo(dvx, py + 48); ctx.lineTo(dvx, py + ph - 48); ctx.stroke(); }
  const col = (i) => px + pw / 6 + (pw / 3) * i;
  const stat = (i, val, lab) => {
    ctx.fillStyle = INK; ctx.font = '800 82px ' + SANS; ctx.fillText(val, col(i), py + 120);
    ctx.fillStyle = FAINT; ctx.font = '700 24px ' + SANS; ctx.fillText(cap(lab), col(i), py + 170);
  };
  stat(0, String(mom), 'MOMENTUM');
  stat(1, String(stk), 'STREAK');
  stat(2, String(reps), 'REPS');

  // motivational line
  ctx.fillStyle = 'rgba(221,225,255,0.78)'; ctx.font = 'italic 500 44px ' + SANS;
  ctx.fillText(stk > 1 ? `${stk} days. Still showing up.` : `Day ${day}. Still showing up.`, cx, 1748);

  // footer — clean brand sign-off
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b3dfbd'; ctx.font = '700 40px ' + SANS;
  ctx.fillText('arc90', cx, 1838);

  return c;
}

function wrapCanvasText(ctx, text, maxW) {
  const words = String(text).split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function buildQuoteCanvas() {
  const W = 1080, H = 1920, cx = W / 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const book = reflectionQuote();
  const SANS = '-apple-system, "Helvetica Neue", "Segoe UI", Arial, sans-serif';
  const INK = '#f4f5ff', MUTE = 'rgba(221,225,255,0.56)';
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#111315'); bg.addColorStop(0.5, '#0d0f11'); bg.addColorStop(1, '#080a0b');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, 880, 0, cx, 880, 760);
  glow.addColorStop(0, 'rgba(179,223,189,0.14)'); glow.addColorStop(1, 'rgba(7,8,12,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 2; storyRoundRect(ctx, 40, 40, W - 80, H - 80, 54); ctx.stroke();
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 60px ' + SANS;
  const wA = ctx.measureText('ARC').width, w9 = ctx.measureText('90').width, x0 = cx - (wA + w9) / 2;
  ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.fillText('ARC', x0, 200);
  const wm = ctx.createLinearGradient(x0 + wA, 0, x0 + wA + w9, 0); wm.addColorStop(0, '#9ac9ed'); wm.addColorStop(1, '#b3dfbd');
  ctx.fillStyle = wm; ctx.fillText('90', x0 + wA, 200);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(179,223,189,0.42)'; ctx.font = '800 240px Georgia, "Times New Roman", serif'; ctx.fillText('“', cx, 600);
  ctx.fillStyle = INK; ctx.font = '600 66px ' + SANS;
  const lines = wrapCanvasText(ctx, book.quote, W - 240).slice(0, 7);
  const lh = 92; let y = 940 - (lines.length - 1) * lh / 2;
  for (const ln of lines) { ctx.fillText(ln, cx, y); y += lh; }
  ctx.fillStyle = MUTE; ctx.font = 'italic 500 42px ' + SANS; ctx.fillText('— ' + book.source, cx, y + 46);
  ctx.fillStyle = '#b3dfbd'; ctx.font = '700 40px ' + SANS; ctx.fillText('arc90', cx, 1838);
  return c;
}
function openQuoteShare() {
  try {
    shareCanvas = buildQuoteCanvas();
    shareCardURL = shareCanvas.toDataURL('image/png');
    sheet = { type: 'share' };
    render();
    track('share_opened', { kind: 'quote' });
  } catch (e) { showNudge('Could not build the quote card. Try again.'); }
}
// Share-card palette per app theme, so the shared picture matches the user's appearance.
function cardTheme() {
  const t = S.theme === 'auto' ? (mqLight.matches ? 'light' : 'dark') : S.theme;
  const P = {
    mono:  { bg: ['#141414', '#0b0b0b', '#050505'], glow: 'rgba(255,255,255,0.10)', border: 'rgba(255,255,255,0.08)', ink: '#f4f4f4', mute: 'rgba(244,244,244,0.58)', faint: 'rgba(244,244,244,0.42)', track: 'rgba(255,255,255,0.10)', grad: ['#d6d6d6', '#f4f4f4', '#c8c8c8'], accent: '#f2f2f2', on: '#000000', ringGlow: 'rgba(255,255,255,0.30)', tick: '#ffffff', dim: 'rgba(255,255,255,0.07)' },
    dark:  { bg: ['#111315', '#0d0f11', '#080a0b'], glow: 'rgba(179,223,189,0.16)', border: 'rgba(255,255,255,0.07)', ink: '#f2f4f6', mute: 'rgba(242,244,246,0.62)', faint: 'rgba(242,244,246,0.44)', track: 'rgba(242,244,246,0.10)', grad: ['#9ac9ed', '#b3dfbd', '#8fc99d'], accent: '#b3dfbd', on: '#182019', ringGlow: 'rgba(179,223,189,0.32)', tick: '#e4f2e7', dim: 'rgba(242,244,246,0.08)' },
    gold:  { bg: ['#12100c', '#0a0908', '#050505'], glow: 'rgba(227,194,125,0.14)', border: 'rgba(255,255,255,0.05)', ink: '#f4f1ea', mute: 'rgba(244,241,234,0.58)', faint: 'rgba(244,241,234,0.42)', track: 'rgba(244,241,234,0.10)', grad: ['#f6ecd6', '#e9cf94', '#e3c27d'], accent: '#e3c27d', on: '#191204', ringGlow: 'rgba(227,194,125,0.45)', tick: '#f6ecd6', dim: 'rgba(244,241,234,0.09)' },
    light: { bg: ['#f7f8fa', '#f7f8fa', '#f7f8fa'], glow: 'transparent', border: '#cbd2d8', ink: '#20272c', mute: '#56616a', faint: '#66727c', track: '#cbd2d8', grad: ['#28613c', '#28613c', '#28613c'], accent: '#28613c', on: '#ffffff', ringGlow: 'transparent', tick: '#28613c', dim: '#e9edf1' },
    green: { bg: ['#08150e', '#050b08', '#030604'], glow: 'rgba(52,211,153,0.17)', border: 'rgba(180,255,214,0.08)', ink: '#eafff4', mute: 'rgba(234,255,244,0.58)', faint: 'rgba(234,255,244,0.42)', track: 'rgba(180,255,214,0.12)', grad: ['#6ee7b7', '#34d399', '#10b981'], accent: '#34d399', on: '#04140d', ringGlow: 'rgba(52,211,153,0.45)', tick: '#eafff4', dim: 'rgba(180,255,214,0.08)' },
    red:   { bg: ['#170709', '#0a0405', '#060203'], glow: 'rgba(255,93,108,0.17)', border: 'rgba(255,205,210,0.08)', ink: '#fff0f1', mute: 'rgba(255,240,241,0.58)', faint: 'rgba(255,240,241,0.42)', track: 'rgba(255,205,210,0.12)', grad: ['#ff8f7a', '#ff5d6c', '#e23950'], accent: '#ff5d6c', on: '#1a0306', ringGlow: 'rgba(255,93,108,0.45)', tick: '#fff0f1', dim: 'rgba(255,205,210,0.08)' },
  };
  return t === 'mono' ? P.dark : (P[t] || P.dark);
}

function todayShareLayout() {
  const ringY = 540, ringRadius = 175, ringStroke = 28;
  const statsY = ringY + ringRadius + ringStroke / 2 + 44;
  const statsHeight = 100;
  const reflectionLabelY = statsY + statsHeight + 44;
  return { ringY, ringRadius, ringStroke, statsY, statsHeight, reflectionLabelY, quoteY: reflectionLabelY + 64 };
}

function todayCompletion() {
  const date = todayKey();
  const scheduled = actionable(date);
  const habits = adaptiveMode() === 'recovery'
    ? scheduled.filter((habit) => !adaptiveTarget(habit).optional)
    : scheduled;
  const total = habits.length;
  const done = habits.filter((habit) => isCompleted(habit.id, date)).length;
  const frac = total ? done / total : 0;
  return { scheduled, habits, total, done, frac, pct: Math.round(frac * 100) };
}

function buildTodayCanvas() {
  const W = 1080, cx = W / 2;
  const layout = todayShareLayout();
  const P = cardTheme();
  const c = document.createElement('canvas'); c.width = W; c.height = 400;
  const ctx = c.getContext('2d');
  const k = todayKey();
  const { habits: act, total, done, pct, frac } = todayCompletion();
  const SANS = '-apple-system, "Helvetica Neue", "Segoe UI", Arial, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';
  const cap = (s) => s.split('').join(' ');
  const firstName = (S.profile.name || '').trim().split(' ')[0];
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  const book = reflectionQuote();

  // ---- measure: reflection line count + dynamic total height ----
  let qf = 42;
  ctx.font = 'italic 600 ' + qf + 'px ' + SERIF;
  let qLines = storyWrapLines(ctx, '“' + book.quote + '”', 860, 3);
  if (qLines.length === 3 && ctx.measureText(qLines[2]).width > 700) {
    qf = 37; ctx.font = 'italic 600 ' + qf + 'px ' + SERIF;
    qLines = storyWrapLines(ctx, '“' + book.quote + '”', 860, 3);
  }
  const MAXH = 20;
  const shown = act.slice(0, MAXH);
  const extra = act.length - shown.length;
  const reflBottom = layout.quoteY + qLines.length * (qf + 16);
  const sourceY = reflBottom + 14;
  const habitsLabelY = sourceY + 80;
  const habitRow0 = habitsLabelY + 58;
  const rowH = 66;
  const habitsBottom = habitRow0 + shown.length * rowH + (extra ? 44 : 0);
  const fieldLabelY = habitsBottom + 20;
  const cols = 18, gx = 110, gw = W - 220, cell = gw / cols, dot = cell - 11;
  const gy = fieldLabelY + 40;
  const fieldRows = Math.ceil(90 / cols);
  const H = Math.round(gy + fieldRows * cell + 66);
  c.height = H; // resizing clears the canvas + resets context — draw below

  // ---- background ----
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, P.bg[0]); bg.addColorStop(0.45, P.bg[1]); bg.addColorStop(1, P.bg[2]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, 560, 0, cx, 560, 760);
  glow.addColorStop(0, P.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = P.border; ctx.lineWidth = 2; storyRoundRect(ctx, 40, 40, W - 80, H - 80, 54); ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  // wordmark
  ctx.font = '800 60px ' + SANS;
  const wA = ctx.measureText('ARC').width, w9 = ctx.measureText('90').width, x0 = cx - (wA + w9) / 2;
  ctx.textAlign = 'left'; ctx.fillStyle = P.ink; ctx.fillText('ARC', x0, 168);
  const wm = ctx.createLinearGradient(x0 + wA, 0, x0 + wA + w9, 0); wm.addColorStop(0, P.grad[1]); wm.addColorStop(1, P.grad[2]);
  ctx.fillStyle = wm; ctx.fillText('90', x0 + wA, 168);
  ctx.textAlign = 'center';
  if (firstName) {
    ctx.fillStyle = P.mute; ctx.font = '600 34px ' + SANS;
    ctx.fillText(storyTruncate(ctx, firstName + '’s arc', 700), cx, 226);
    ctx.fillStyle = P.faint; ctx.font = '600 25px ' + SANS; ctx.fillText(dateStr, cx, 272);
  } else {
    ctx.fillStyle = P.faint; ctx.font = '600 25px ' + SANS; ctx.fillText(dateStr, cx, 232);
  }

  // today ring
  const ry = layout.ringY, r = layout.ringRadius;
  ctx.lineCap = 'round'; ctx.lineWidth = layout.ringStroke;
  ctx.strokeStyle = P.track; ctx.beginPath(); ctx.arc(cx, ry, r, 0, 2 * Math.PI); ctx.stroke();
  const a0 = -Math.PI / 2, a1 = a0 + 2 * Math.PI * frac;
  const rg = ctx.createLinearGradient(cx - r, ry - r, cx + r, ry + r);
  rg.addColorStop(0, P.grad[0]); rg.addColorStop(0.5, P.grad[1]); rg.addColorStop(1, P.grad[2]);
  if (frac > 0) {
    ctx.save(); ctx.shadowColor = P.ringGlow; ctx.shadowBlur = 34;
    ctx.strokeStyle = rg; ctx.beginPath(); ctx.arc(cx, ry, r, a0, a1); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.shadowColor = P.ringGlow; ctx.shadowBlur = 22; ctx.fillStyle = P.tick;
    ctx.beginPath(); ctx.arc(cx + r * Math.cos(a1), ry + r * Math.sin(a1), 11, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
  }
  const ps = total ? pct + '%' : 'Rest';
  let nf = 116;
  ctx.font = '800 ' + nf + 'px ' + SANS;
  while (ctx.measureText(ps).width > 272 && nf > 72) { nf -= 4; ctx.font = '800 ' + nf + 'px ' + SANS; }
  ctx.fillStyle = P.ink; ctx.textBaseline = 'middle';
  ctx.fillText(ps, cx, ry - 26);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = P.mute; ctx.font = '700 31px ' + SANS; ctx.fillText(total ? `${done} of ${total} today` : 'Nothing due today', cx, ry + 86);

  // stat row — streak · readiness · momentum (the full story for anyone who sees the card)
  {
    const stk = dayStreak();
    const rd = vitality().score;
    const tiles = [
      [String(stk), stk === 1 ? 'DAY STREAK' : 'DAY STREAK'],
      [rd === null ? `Day ${dayNumber()}` : String(rd), rd === null ? 'OF 90' : 'READINESS'],
      [momentum() + '%', 'MOMENTUM'],
    ];
    const tw = 280, th = layout.statsHeight, gap = 20, tx0 = cx - (tw * 3 + gap * 2) / 2, ty = layout.statsY;
    tiles.forEach(([val, lab], i) => {
      const x = tx0 + i * (tw + gap);
      ctx.fillStyle = P.dim; storyRoundRect(ctx, x, ty, tw, th, 24); ctx.fill();
      ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; storyRoundRect(ctx, x, ty, tw, th, 24); ctx.stroke();
      ctx.fillStyle = P.ink; ctx.font = '800 42px ' + SANS; ctx.fillText(val, x + tw / 2, ty + 52);
      ctx.fillStyle = P.faint; ctx.font = '700 18px ' + SANS; ctx.fillText(cap(lab), x + tw / 2, ty + 82);
    });
  }

  // daily reflection
  ctx.fillStyle = P.faint; ctx.font = '700 22px ' + SANS; ctx.fillText(cap('DAILY REFLECTION'), cx, layout.reflectionLabelY);
  ctx.fillStyle = P.ink; ctx.font = 'italic 600 ' + qf + 'px ' + SERIF;
  let qy = layout.quoteY;
  for (const line of qLines) { ctx.fillText(line, cx, qy); qy += qf + 16; }
  ctx.fillStyle = P.accent;
  cardFittedText(ctx, '— ' + book.source, cx, qy + 14, 860, 27, SANS, '600');

  // today's habits — ALL of them: completed checked, missed unchecked
  ctx.textAlign = 'left';
  ctx.fillStyle = P.faint; ctx.font = '700 22px ' + SANS; ctx.fillText(cap('TODAY’S HABITS'), 110, habitsLabelY);
  ctx.fillStyle = P.faint; ctx.textAlign = 'right'; ctx.font = '700 22px ' + SANS; ctx.fillText(`${done}/${total}`, W - 110, habitsLabelY);
  ctx.textAlign = 'left';
  let y = habitRow0;
  for (const h of shown) {
    const isDone = isCompleted(h.id, k);
    storyRoundRect(ctx, 110, y - 34, 42, 42, 13);
    if (isDone) {
      ctx.fillStyle = P.accent; ctx.fill();
      ctx.fillStyle = P.on; ctx.textAlign = 'center'; ctx.font = '700 27px ' + SANS; ctx.fillText('✓', 131, y - 5); ctx.textAlign = 'left';
    } else {
      ctx.lineWidth = 3; ctx.strokeStyle = P.track; ctx.stroke();
    }
    ctx.fillStyle = isDone ? P.ink : P.faint; ctx.font = (isDone ? '600 34px ' : '500 34px ') + SANS;
    ctx.fillText(storyTruncate(ctx, h.name, W - 320), 178, y);
    y += rowH;
  }
  if (extra > 0) { ctx.fillStyle = P.faint; ctx.font = '500 28px ' + SANS; ctx.fillText(`+${extra} more`, 178, y + 4); }

  // 90-day field
  const gpct = Math.round((dayNumber() / 90) * 100);
  ctx.fillStyle = P.faint; ctx.font = '700 22px ' + SANS; ctx.textAlign = 'left'; ctx.fillText(cap('90-DAY FIELD'), 110, fieldLabelY);
  ctx.fillStyle = P.mute; ctx.font = '600 26px ' + SANS; ctx.textAlign = 'right'; ctx.fillText(`${gpct}% of the arc`, W - 110, fieldLabelY);
  const start = startDate(), todayMid = atMidnight(operationalDate());
  for (let i = 0; i < 90; i++) {
    const d = addDays(start, i), kk = dkey(d), col = i % cols, row = Math.floor(i / cols);
    const x = gx + col * cell, yy = gy + row * cell;
    ctx.globalAlpha = 1;
    let fill = P.dim;
    if (d <= todayMid) {
      const rr = rateFor(kk);
      if (rr !== null && rr >= 1) { fill = P.accent; }
      else if (rr !== null && rr >= 0.5) { fill = P.accent; ctx.globalAlpha = 0.6; }
      else if (rr !== null && rr > 0) { fill = P.accent; ctx.globalAlpha = 0.32; }
      else { fill = P.dim; }
    }
    ctx.fillStyle = fill; storyRoundRect(ctx, x, yy, dot, dot, 7); ctx.fill();
    ctx.globalAlpha = 1;
    if (kk === todayKey()) { ctx.strokeStyle = P.tick; ctx.lineWidth = 3; storyRoundRect(ctx, x, yy, dot, dot, 7); ctx.stroke(); }
  }

  ctx.textAlign = 'center';
  return c;
}

// Shared inputs for the alternate share-card styles.
function cardCommon() {
  const { total, done, pct, frac } = todayCompletion();
  return {
    P: cardTheme(),
    SANS: '-apple-system, "Helvetica Neue", "Segoe UI", Arial, sans-serif',
    SERIF: 'Georgia, "Times New Roman", serif',
    firstName: (S.profile.name || '').trim().split(' ')[0] || 'You',
    day: dayNumber(), stk: dayStreak(),
    total, done, pct, frac,
    book: reflectionQuote(),
  };
}
function cardFittedText(ctx, text, x, y, maxWidth, size, family, weight = '600') {
  const minimum = Math.min(size, 24);
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > minimum) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillText(storyTruncate(ctx, text, maxWidth), x, y);
}
function cardBg(ctx, W, H, P, gy) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, P.bg[0]); bg.addColorStop(0.5, P.bg[1]); bg.addColorStop(1, P.bg[2]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, gy, 0, W / 2, gy, 760);
  glow.addColorStop(0, P.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
}
function cardWordmark(ctx, cx, y, P, SANS, size) {
  ctx.font = '800 ' + size + 'px ' + SANS;
  const wA = ctx.measureText('ARC').width, w9 = ctx.measureText('90').width, x0 = cx - (wA + w9) / 2;
  ctx.textAlign = 'left'; ctx.fillStyle = P.ink; ctx.fillText('ARC', x0, y);
  const wm = ctx.createLinearGradient(x0 + wA, 0, x0 + wA + w9, 0); wm.addColorStop(0, P.grad[1]); wm.addColorStop(1, P.grad[2]);
  ctx.fillStyle = wm; ctx.fillText('90', x0 + wA, y);
  ctx.textAlign = 'center';
}

// BIG & CLEAR — identity-led status card: name headline, refined ring, status pill
function cardBigClear() {
  const W = 1080, cx = W / 2, H = 1160;
  const { P, SANS, firstName, day, stk, total, done, pct, frac } = cardCommon();
  const cap = (s) => s.split('').join(' ');
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  cardBg(ctx, W, H, P, 620);
  ctx.strokeStyle = P.border; ctx.lineWidth = 2; storyRoundRect(ctx, 40, 40, W - 80, H - 80, 54); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  cardWordmark(ctx, cx, 150, P, SANS, 44);

  // identity headline + gradient accent underline
  ctx.fillStyle = P.ink; ctx.font = '800 66px ' + SANS; ctx.fillText(storyTruncate(ctx, firstName, 820), cx, 300);
  const uw = 92; const ug = ctx.createLinearGradient(cx - uw, 0, cx + uw, 0); ug.addColorStop(0, P.grad[0]); ug.addColorStop(1, P.grad[2]);
  ctx.strokeStyle = ug; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - uw, 334); ctx.lineTo(cx + uw, 334); ctx.stroke();
  ctx.fillStyle = P.mute; ctx.font = '600 30px ' + SANS; ctx.fillText(`Day ${day} of 90`, cx, 392);

  // refined ring with glowing head dot
  const ry = 662, r = 208;
  ctx.lineCap = 'round'; ctx.lineWidth = 30;
  ctx.strokeStyle = P.track; ctx.beginPath(); ctx.arc(cx, ry, r, 0, 2 * Math.PI); ctx.stroke();
  const a0 = -Math.PI / 2, a1 = a0 + 2 * Math.PI * frac;
  const rg = ctx.createLinearGradient(cx - r, ry - r, cx + r, ry + r); rg.addColorStop(0, P.grad[0]); rg.addColorStop(0.5, P.grad[1]); rg.addColorStop(1, P.grad[2]);
  if (frac > 0) {
    ctx.save(); ctx.shadowColor = P.ringGlow; ctx.shadowBlur = 38; ctx.strokeStyle = rg; ctx.beginPath(); ctx.arc(cx, ry, r, a0, a1); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.shadowColor = P.ringGlow; ctx.shadowBlur = 24; ctx.fillStyle = P.tick;
    ctx.beginPath(); ctx.arc(cx + r * Math.cos(a1), ry + r * Math.sin(a1), 13, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = P.faint; ctx.font = '700 23px ' + SANS; ctx.fillText(cap(total ? 'COMPLETE' : 'TODAY'), cx, ry - 62);
  const psv = total ? pct + '%' : 'Rest'; let nf = 128; ctx.font = '800 ' + nf + 'px ' + SANS;
  while (ctx.measureText(psv).width > 300 && nf > 82) { nf -= 4; ctx.font = '800 ' + nf + 'px ' + SANS; }
  ctx.fillStyle = P.ink; ctx.textBaseline = 'middle'; ctx.fillText(psv, cx, ry + 20); ctx.textBaseline = 'alphabetic';

  // status pill
  const rdBC = vitality().score;
  const pill = [total ? `${done} of ${total} today` : 'Nothing due today', stk > 1 ? `${stk}-day streak` : null, rdBC !== null ? `Readiness ${rdBC}` : null]
    .filter(Boolean).join('   ·   ');
  ctx.font = '700 30px ' + SANS;
  const pw = Math.min(W - 160, ctx.measureText(pill).width + 64), ph = 68, px = cx - pw / 2, py = 962;
  ctx.fillStyle = P.dim; storyRoundRect(ctx, px, py, pw, ph, 34); ctx.fill();
  ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; storyRoundRect(ctx, px, py, pw, ph, 34); ctx.stroke();
  ctx.fillStyle = P.ink; ctx.textBaseline = 'middle'; cardFittedText(ctx, pill, cx, py + ph / 2 + 2, pw - 48, 30, SANS, '700'); ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = P.faint; ctx.font = '600 24px ' + SANS;
  ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), cx, H - 84);
  return c;
}

// QUOTE — the daily reflection as the hero, built to be shared as wisdom
function cardQuote() {
  const W = 1080, cx = W / 2;
  const { P, SANS, SERIF, firstName, day, total, pct, book } = cardCommon();
  const c = document.createElement('canvas'); c.width = W; c.height = 400;
  const ctx = c.getContext('2d');
  let qf = 62; ctx.font = 'italic 600 ' + qf + 'px ' + SERIF;
  let lines = storyWrapLines(ctx, book.quote, 840, 7);
  while (lines.length > 5 && qf > 42) { qf -= 4; ctx.font = 'italic 600 ' + qf + 'px ' + SERIF; lines = storyWrapLines(ctx, book.quote, 840, 7); }
  const quoteTop = 500, lineH = qf + 22, quoteH = lines.length * lineH;
  const H = Math.round(quoteTop + quoteH + 340);
  c.height = H;
  cardBg(ctx, W, H, P, H * 0.4);
  ctx.strokeStyle = P.border; ctx.lineWidth = 2; storyRoundRect(ctx, 40, 40, W - 80, H - 80, 54); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = P.accent; ctx.font = '800 210px ' + SERIF; ctx.fillText('“', cx, 360);
  ctx.fillStyle = P.ink; ctx.font = 'italic 600 ' + qf + 'px ' + SERIF;
  let y = quoteTop; for (const ln of lines) { ctx.fillText(ln, cx, y); y += lineH; }
  ctx.fillStyle = P.accent; cardFittedText(ctx, '— ' + book.source, cx, y + 34, 840, 36, SANS);
  ctx.strokeStyle = P.border; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 90, y + 120); ctx.lineTo(cx + 90, y + 120); ctx.stroke();
  cardWordmark(ctx, cx, y + 210, P, SANS, 40);
  ctx.fillStyle = P.mute; cardFittedText(ctx, `${firstName}  ·  Day ${day} of 90  ·  ${total ? pct + '% today' : 'Rest day'}`, cx, y + 258, 840, 28, SANS);
  return c;
}

// CERTIFICATE — formal, framed, pride-worthy
function cardCertificate() {
  const W = 1080, cx = W / 2, H = 1460;
  const { P, SANS, SERIF, firstName, day, stk, total, done, pct } = cardCommon();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  cardBg(ctx, W, H, P, 700);
  ctx.strokeStyle = P.accent; ctx.lineWidth = 4; storyRoundRect(ctx, 56, 56, W - 112, H - 112, 34); ctx.stroke();
  ctx.strokeStyle = P.border; ctx.lineWidth = 2; storyRoundRect(ctx, 78, 78, W - 156, H - 156, 26); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  cardWordmark(ctx, cx, 182, P, SANS, 40);
  ctx.fillStyle = P.mute; ctx.font = '700 26px ' + SANS; ctx.fillText('C E R T I F I C A T E   O F   P R O G R E S S', cx, 264);
  ctx.strokeStyle = P.border; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 170, 302); ctx.lineTo(cx + 170, 302); ctx.stroke();
  ctx.fillStyle = P.faint; ctx.font = 'italic 400 34px ' + SERIF; ctx.fillText('A personal record for', cx, 404);
  ctx.fillStyle = P.ink; ctx.font = '700 92px ' + SERIF; ctx.fillText(storyTruncate(ctx, firstName, 820), cx, 502);
  ctx.fillStyle = P.faint; ctx.font = 'italic 400 34px ' + SERIF; ctx.fillText('on', cx, 582);
  ctx.fillStyle = P.accent; ctx.font = '800 118px ' + SERIF; ctx.fillText('Day ' + day, cx, 716);
  ctx.fillStyle = P.mute; ctx.font = '600 34px ' + SANS; ctx.fillText('of the 90-day arc', cx, 778);
  const sy = 1010, sr = 138;
  ctx.save(); ctx.shadowColor = P.ringGlow; ctx.shadowBlur = 30;
  ctx.strokeStyle = P.accent; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(cx, sy, sr, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
  ctx.fillStyle = P.ink; ctx.font = '800 74px ' + SANS; ctx.textBaseline = 'middle'; ctx.fillText(total ? pct + '%' : 'Rest', cx, sy - 4); ctx.textBaseline = 'alphabetic';
  const rdCert = vitality().score;
  ctx.fillStyle = P.mute; ctx.font = '600 30px ' + SANS;
  cardFittedText(ctx, `${total ? done + ' of ' + total + ' habits today' : 'Nothing due today'}${rdCert !== null ? `  ·  Readiness ${rdCert}` : ''}`, cx, sy + sr + 54, 840, 30, SANS);
  if (stk > 1) { ctx.fillStyle = P.accent; ctx.font = '800 32px ' + SANS; ctx.fillText(`${stk}-day streak`, cx, sy + sr + 116); }
  ctx.fillStyle = P.faint; ctx.font = '600 26px ' + SANS;
  ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), cx, H - 116);
  return c;
}

function buildShareCard() {
  const s = S.cardStyle || 'analyst';
  try {
    if (s === 'certificate') return cardCertificate();
    if (s === 'quote') return cardQuote();
    if (s === 'clear') return cardBigClear();
  } catch (e) { /* fall back to analyst */ }
  return buildTodayCanvas();
}
function rebuildShareCard() {
  try { shareCanvas = buildShareCard(); shareCardURL = shareCanvas.toDataURL('image/png'); return true; }
  catch (e) { shareCanvas = null; shareCardURL = ''; return false; }
}
function openTodayShare() {
  if (!rebuildShareCard()) { showNudge('Could not build your card. Try again.'); return; }
  sheet = { type: 'share', styled: true };
  render();
  track('share_opened', { kind: 'today' });
}

function animateLaunchLogo(dialog) {
  const logoRevealDuration = 1250;
  const logoHoldDuration = 2000;
  const logoExitAt = logoRevealDuration + logoHoldDuration;
  const introDuration = logoExitAt + 750;
  const animations = [];
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stage = dialog.querySelector('.launch-logo-stage');
  const cancel = () => {
    animations.forEach(animation => animation.cancel());
    preference.removeEventListener?.('change', onPreferenceChange);
  };
  const onPreferenceChange = event => { if (event.matches) cancel(); };
  if (Arc90Motion.reduced() || !stage || typeof stage.animate !== 'function') return { duration: 0, cancel };
  const play = (selector, frames, duration, delay = 0, easing = 'cubic-bezier(.22,1,.36,1)') => {
    const node = dialog.querySelector(selector);
    if (node) animations.push(node.animate(frames, {
      duration, delay,
      easing, fill: 'backwards',
    }));
  };
  try {
    play('.launch-logo-stage', [
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: logoExitAt / (logoExitAt + 500), easing: 'ease-in-out' },
      { opacity: 0, transform: 'translateY(-12px) scale(.96)' },
    ], logoExitAt + 500, 0, 'linear');
    play('.launch-logo-symbol', [
      { transform: 'rotate(-18deg) scale(.84)', opacity: .3 },
      { transform: 'rotate(0) scale(1)', opacity: 1 },
    ], logoRevealDuration);
    play('.launch-logo-symbol .arc90-logo-track', [{ opacity: 0 }, { opacity: 1 }], 650);
    play('.launch-logo-symbol .arc90-logo-arc', [
      { strokeDasharray: '1', strokeDashoffset: '1' },
      { strokeDasharray: '1', strokeDashoffset: '0' },
    ], 1000, 100);
    play('.launch-logo-symbol .arc90-logo-start', [{ opacity: 0 }, { opacity: 1 }], 400, 800);
    play('.launch-logo-symbol .arc90-logo-core', [
      { opacity: 0, transform: 'scale(.2)' },
      { opacity: 1, transform: 'scale(1.2)', offset: .65 },
      { opacity: 1, transform: 'scale(1)' },
    ], 600, 600);
    play('.launch-logo-wordmark', [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], 650, 500);
    play('.launch-quote-brand', [{ opacity: 0 }, { opacity: 1 }], 400, logoExitAt);
    play('.launch-quote-content', [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 500, logoExitAt + 250);
    preference.addEventListener?.('change', onPreferenceChange);
    return { duration: introDuration, cancel };
  } catch {
    cancel();
    return { duration: 0, cancel };
  }
}

function showLaunchQuote() {
  if (!S.onboarded || document.hidden || sheet || S.focus?.active || S.focus?.pendingCompletion || document.getElementById('launchQuote')) return;
  if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;
  const book = reflectionQuote();
  const dialog = document.createElement('dialog');
  dialog.id = 'launchQuote';
  dialog.className = 'launch-quote';
  dialog.tabIndex = -1;
  dialog.setAttribute('aria-labelledby', 'launchQuoteTitle');
  dialog.setAttribute('aria-describedby', 'launchQuoteText launchQuoteSource');
  dialog.innerHTML = `
    <div class="launch-logo-stage" aria-hidden="true">
      <div class="launch-logo-lockup">${logoMarkSvg('launch-logo-symbol')}<span class="launch-logo-wordmark">ARC<b>90</b></span></div>
    </div>
    <div class="launch-quote-brand">${logoMarkSvg('launch-quote-mark')}<span>ARC90</span></div>
    <div class="launch-quote-content">
      <h2 id="launchQuoteTitle">Daily reflection</h2>
      <blockquote id="launchQuoteText">${esc(book.quote)}</blockquote>
      <p id="launchQuoteSource">${esc(book.source)}</p>
    </div>`;
  document.body.appendChild(dialog);
  // Native modal behavior keeps focus and taps away from the app underneath.
  try { dialog.showModal(); } catch { dialog.remove(); return; }
  const intro = animateLaunchLogo(dialog);
  const dismiss = () => { if (dialog.open) dialog.close(); };
  const timer = setTimeout(dismiss, 4000 + intro.duration);
  dialog.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('keydown', event => {
    clearTimeout(timer);
    event.stopPropagation();
    if (['Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); dismiss(); }
  });
  dialog.addEventListener('close', () => {
    clearTimeout(timer); intro.cancel(); dialog.remove();
    requestAnimationFrame(animateTodayArc);
  }, { once: true });
}

function dailyReflectionCard() {
  const book = reflectionQuote();
  return `
    <section class="card reflection-card">
      <div class="ws-head">
        <span class="eyebrow">Daily reflection</span>
        <span class="proof-count">Day ${dayNumber()}</span>
      </div>
      <blockquote class="reflection-q">${esc(book.quote)}</blockquote>
      <div class="reflection-src">— ${esc(book.source)}</div>
      <button class="reflection-share" data-act="share-quote"><span aria-hidden="true">↗</span> Share quote</button>
    </section>`;
}

function shareCaption() {
  const stk = dayStreak();
  return `Day ${dayNumber()} of 90${stk > 1 ? ` · ${stk}-day streak` : ''}. Building my next 90 with ARC90. arc90.vercel.app`;
}
function openShare() {
  try {
    shareCanvas = buildStoryCanvas();
    shareCardURL = shareCanvas.toDataURL('image/png');
    sheet = { type: 'share' };
    render();
    track('share_opened');
  } catch (e) { showNudge('Could not build your card. Try again.'); }
}
function storySaveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function sendShare() {
  if (!shareCanvas) return;
  const name = `arc90-day${dayNumber()}.png`;
  shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: shareCaption() })
        .then(() => track('share_sent'))
        .catch(() => {})
        // Close the in-app sheet either way so returning from the OS share sheet
        // lands you back in the app cleanly instead of on a stuck modal.
        .finally(() => { sheet = null; render(); });
    } else {
      storySaveBlob(blob, name);
      showNudge('Saved your card — post it to your story.');
      track('share_saved');
      sheet = null; render();
    }
  }, 'image/png');
}
function saveShare() {
  if (!shareCanvas) return;
  const name = `arc90-day${dayNumber()}.png`;
  shareCanvas.toBlob((blob) => { if (blob) { storySaveBlob(blob, name); showNudge('Saved — post it anytime.'); track('share_saved'); } }, 'image/png');
}
function sheetShare() {
  const styled = sheet && sheet.styled;
  const cur = S.cardStyle || 'analyst';
  const styles = [['analyst', 'Progress', '◔'], ['certificate', 'Certificate', '🏅'], ['quote', 'Quote', '❝'], ['clear', 'Big &amp; Clear', '◎']];
  const picker = styled ? `
      <div class="card-style-row">
        ${styles.map(([id, name, ico]) => `
          <button class="card-style-chip${cur === id ? ' on' : ''}" data-act="card-style" data-id="${id}" aria-pressed="${cur === id}">
            <span class="csc-ico">${ico}</span><span class="csc-name">${name}</span>
          </button>`).join('')}
      </div>` : '';
  return `
    <div class="story-sheet">
      <span class="eyebrow">Share your progress</span>
      <h3 class="cb-title" style="margin:4px 0 12px">${styled ? 'Pick your card' : 'Your story card is ready'}</h3>
      ${picker}
      <div class="story-preview"><img class="story-img" src="${shareCardURL}" alt="Your ARC90 progress card"></div>
      <button class="btn story-send" data-act="share-send">Share to Instagram, Messages…</button>
      <button class="cb-other" data-act="share-save">Save image</button>
    </div>`;
}

function streak(id) {
  const today = atMidnight(operationalDate());
  let s = 0;
  let i = isCompleted(id, dkey(today)) ? 0 : 1;   // an unfinished today doesn't break it
  for (; ; i++) {
    const d = addDays(today, -i);
    if (d < startDate()) break;
    const k = dkey(d);
    const h = S.habits.find((x) => String(x.id) === String(id));
    const st = statusOf(id, k);
    if (h && !scheduledFor(h, k) && st !== 'done' && st !== 'min') continue;
    if (st === 'skip') continue;                   // rest days don't break the chain
    if (st === 'done' || st === 'min') s++;
    else break;
  }
  return s;
}

function dayCompleted(k) {
  return S.habits.some((h) => isCompleted(h.id, k));
}

/* Consecutive days (back from today) with at least one rep. An unfinished today
   doesn't break it; pure rest days (nothing scheduled) are skipped, not counted. */
function dayStreak() {
  const today = atMidnight(operationalDate());
  let s = 0;
  let i = dayCompleted(dkey(today)) ? 0 : 1;
  for (; ; i++) {
    const d = addDays(today, -i);
    if (d < startDate()) break;
    const k = dkey(d);
    if (rateFor(k) === null) continue;
    if (dayCompleted(k)) s++; else break;
  }
  return s;
}

function claimStreakMilestone(previous, current) {
  if (current <= previous || ![7, 14, 30, 60, 90].includes(current)) return 0;
  const key = `streak:${S.profile.start}:${current}`;
  if (S.firedSlots[key]) return 0;
  S.firedSlots[key] = true;
  save();
  return current;
}

function bestDayStreak() {
  const today = atMidnight(operationalDate());
  let best = 0, run = 0;
  for (let i = elapsedDays() - 1; i >= 0; i--) {
    const k = dkey(addDays(today, -i));
    if (rateFor(k) === null) continue;
    if (dayCompleted(k)) { run++; best = Math.max(best, run); } else run = 0;
  }
  return Math.max(best, dayStreak());
}

function perfectDays() {
  const today = atMidnight(operationalDate());
  let n = 0;
  for (let i = 0; i < elapsedDays(); i++) if (rateFor(dkey(addDays(today, -i))) === 1) n++;
  return n;
}

function dailyInsight() {
  return DAILY_INSIGHTS[(dayNumber() + S.tipSeed) % DAILY_INSIGHTS.length];
}

function streakBannerCard() {
  const s = dayStreak();
  const best = bestDayStreak();
  const todayDone = dayCompleted(todayKey());
  const perfect = perfectDays();
  const atRisk = s > 0 && !todayDone;
  const state = atRisk ? 'risk' : s > 0 ? 'live' : 'cold';
  const line = atRisk
    ? `Your ${s}-day streak ends at midnight — one rep keeps it alive.`
    : s > 0
      ? (todayDone ? 'Streak secured for today. 🟢 Come back tomorrow.' : '')
      : 'Log one rep today to start your streak.';
  return `
    <section class="card streak-banner ${state}">
      <button class="streak-share" data-act="share" aria-label="Share your progress">↗ Share</button>
      <div class="streak-row">
        <div class="streak-flame">✦</div>
        <div class="streak-main">
          <div class="streak-count"><b>${s}</b><span>day${s === 1 ? '' : 's'} streak</span></div>
          <div class="streak-meta">Best ${best} · ${perfect} perfect day${perfect === 1 ? '' : 's'}</div>
        </div>
      </div>
      ${line ? `<div class="streak-line">${esc(line)}</div>` : ''}
      <div class="streak-insight"><span>Today’s insight</span><p>${esc(dailyInsight())}</p></div>
    </section>`;
}

function bestStreak() {
  let best = 0;
  const today = atMidnight(operationalDate());
  for (const h of S.habits) {
    let run = 0;
    for (let i = elapsedDays() - 1; i >= 0; i--) {
      const k = dkey(addDays(today, -i));
      const st = statusOf(h.id, k);
      if (!scheduledFor(h, k) && st !== 'done' && st !== 'min') continue;
      if (st === 'skip') continue;
      if (st === 'done' || st === 'min') { run++; best = Math.max(best, run); }
      else run = 0;
    }
  }
  return best;
}

function totalReps() {
  return Object.values(S.log).reduce((a, v) => a + ((v.done || []).length + (v.min || []).length), 0);
}

function perfectDays() {
  let c = 0;
  const today = atMidnight(operationalDate());
  for (let i = 0; i < elapsedDays(); i++) {
    const r = rateFor(dkey(addDays(today, -i)));
    if (r !== null && r >= 1) c++;
  }
  return c;
}

/* how often a missed habit gets completed the very next day */
function recoveryRate() {
  const today = atMidnight(operationalDate());
  let misses = 0, recovered = 0;
  for (const h of S.habits) {
    for (let i = elapsedDays() - 1; i >= 1; i--) {
      const d = addDays(today, -i);
      const k = dkey(d);
      const st = statusOf(h.id, k);
      if (!scheduledFor(h, k) && st !== 'done' && st !== 'min') continue;
      if (st === 'skip' || st === 'done' || st === 'min') continue;
      misses++;
      if (isCompleted(h.id, dkey(addDays(d, 1)))) recovered++;
    }
  }
  return misses ? Math.round(100 * recovered / misses) : null;
}

function avgRateWindow(startBack, nDays) {
  const today = atMidnight(operationalDate());
  let sum = 0, n = 0;
  for (let i = startBack; i < startBack + nDays; i++) {
    const d = addDays(today, -i);
    if (d < startDate()) continue;
    const r = rateFor(dkey(d));
    if (r !== null) { sum += r; n++; }
  }
  return n ? sum / n : null;
}

function weeklyDelta() {
  const recent = avgRateWindow(0, 7);
  const prev = avgRateWindow(7, 7);
  if (recent === null || prev === null) return null;
  return Math.round((recent - prev) * 100);
}

function bestWeekday() {
  const today = atMidnight(operationalDate());
  const buckets = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  for (let i = 0; i < Math.min(90, elapsedDays()); i++) {
    const d = addDays(today, -i);
    const r = rateFor(dkey(d));
    if (r === null) continue;
    const b = buckets[d.getDay()];
    b.sum += r;
    b.n++;
  }
  const rows = buckets.map((b, i) => ({
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
    pct: b.n ? Math.round((b.sum / b.n) * 100) : -1,
    n: b.n,
  })).filter((b) => b.n >= 2).sort((a, b) => b.pct - a.pct);
  return rows[0] || null;
}

function reviewStats(nDays) {
  const today = atMidnight(operationalDate());
  const moods = {};
  let energy = 0, energyN = 0, reviews = 0;
  for (let i = 0; i < Math.min(nDays, elapsedDays()); i++) {
    const l = dlog(dkey(addDays(today, -i)));
    if (l.energy || l.mood || l.win || l.note) reviews++;
    if (l.energy) { energy += l.energy; energyN++; }
    if (l.mood) moods[l.mood] = (moods[l.mood] || 0) + 1;
  }
  const topMood = Object.entries(moods).sort((a, b) => b[1] - a[1])[0];
  return {
    reviews,
    avgEnergy: energyN ? energy / energyN : null,
    topMood: topMood ? topMood[0] : '',
  };
}

function recentKeys(nDays = 7) {
  const today = atMidnight(operationalDate());
  const start = startDate();
  const keys = [];
  for (let i = nDays - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    if (d >= start) keys.push(dkey(d));
  }
  return keys;
}

function habitRateForKeys(h, keys) {
  let hit = 0, sched = 0;
  for (const k of keys) {
    const st = statusOf(h.id, k);
    if (!scheduledFor(h, k) && st !== 'done' && st !== 'min') continue;
    if (st === 'skip') continue;
    sched++;
    if (st === 'done' || st === 'min') hit++;
  }
  return sched ? { pct: Math.round((hit / sched) * 100), hit, sched } : null;
}

function weeklyReviewData() {
  const keys = recentKeys(7);
  const rows = keys.map((k) => ({ key: k, ...dayStats(k) }));
  let scheduled = 0, completed = 0, full = 0, min = 0, skipped = 0, missed = 0;
  for (const k of keys) {
    for (const h of S.habits) {
      const st = statusOf(h.id, k);
      const due = scheduledFor(h, k) || st === 'done' || st === 'min' || st === 'skip';
      if (!due) continue;
      if (st === 'skip') { skipped++; continue; }
      scheduled++;
      if (st === 'done') { completed++; full++; }
      else if (st === 'min') { completed++; min++; }
      else missed++;
    }
  }
  const rates = S.habits.map((h) => ({ h, stats: habitRateForKeys(h, keys) })).filter((x) => x.stats);
  const best = [...rates].sort((a, b) => b.stats.pct - a.stats.pct)[0] || null;
  const focus = [...rates].sort((a, b) => a.stats.pct - b.stats.pct)[0] || null;
  const reviews = reviewStats(7);
  const recentWin = [...keys].reverse().map((k) => dlog(k).win).find((w) => w && w.trim()) || '';
  const pct = scheduled ? Math.round((completed / scheduled) * 100) : 0;
  const delta = weeklyDelta();
  return { keys, rows, scheduled, completed, full, min, skipped, missed, pct, best, focus, reviews, recentWin, delta };
}

function straightMissHabit(days = 3) {
  const today = atMidnight(operationalDate());
  for (const h of S.habits) {
    let misses = 0;
    for (let i = 1; i <= Math.min(14, elapsedDays() - 1); i++) {
      const k = dkey(addDays(today, -i));
      const st = statusOf(h.id, k);
      if (!scheduledFor(h, k) && st !== 'done' && st !== 'min') continue;
      if (st === 'skip') continue;
      if (st === 'done' || st === 'min') break;
      misses++;
      if (misses >= days) return { habit: h, misses };
    }
  }
  return null;
}

function comebackSignal() {
  if (elapsedDays() < 2) return null;
  const yesterday = dkey(addDays(atMidnight(operationalDate()), -1));
  for (const h of S.habits) {
    const st = statusOf(h.id, yesterday);
    const due = scheduledFor(h, yesterday) || st === 'done' || st === 'min' || st === 'skip';
    if (due && st !== 'skip' && st !== 'done' && st !== 'min' && isCompleted(h.id, todayKey())) return h;
  }
  return null;
}

function milestoneMoment() {
  const d = dayNumber();
  if (![7, 30, 60, 90].includes(d)) return null;
  const copy = {
    7: ['First 7 locked in', 'The first week is proof that the system can live in real life.'],
    30: ['Month marker', 'Thirty days is no longer a burst of motivation. It is evidence.'],
    60: ['Two-thirds through', 'This is the section where identity beats mood. Keep the line moving.'],
    90: ['Arc complete', 'The 90-day arc is full. Export the proof and choose the next mountain.'],
  }[d];
  return { day: d, title: copy[0], body: copy[1] };
}

function weekReviewKey() {
  const today = atMidnight(operationalDate());
  const mondayOffset = (today.getDay() + 6) % 7;
  return dkey(addDays(today, -mondayOffset));
}

function weeklyCoachReview() {
  const pattern = guidanceHabitPattern();
  if (!pattern.ready) return {
    generated: new Date().toISOString(),
    summary: 'Your pattern is still taking shape. A few completed days of check-ins will make this review more useful.',
    focus: pattern.target ? pattern.target.name : 'Choose one habit',
    action: pattern.target ? `Start with ${pattern.target.min || 'a two-minute version'}. Keep the next step manageable.` : 'Start with one habit that matters to you.',
  };
  const w = weeklyReviewData();
  const focus = w.focus ? w.focus.h : nextBestRep();
  const grade = w.pct >= 85 ? 'excellent' : w.pct >= 65 ? 'solid' : w.pct >= 40 ? 'uneven' : 'a reset week';
  const delta = w.delta === null ? 'no prior-week baseline yet' : w.delta > 0 ? `${w.delta}% better than last week` : w.delta < 0 ? `${Math.abs(w.delta)}% below last week` : 'even with last week';
  const focusText = focus ? `${focus.emoji} ${focus.name}` : 'one tiny rep';
  return {
    generated: new Date().toISOString(),
    summary: `This was ${grade}: ${w.completed}/${w.scheduled || 0} scheduled reps kept, ${delta}.`,
    focus: focusText,
    action: focus ? `Next week, protect one thing: ${focus.name}. Minimum version first: ${focus.min || '2-minute version'}.` : 'Next week, keep the system tiny enough to repeat.',
  };
}

function healthDay(k = todayKey()) {
  return {
    water: Number(S.health.water[k]) || 0,
    weight: S.health.weight[k] || '',
    steps: Number(S.health.steps[k]) || 0,
  };
}

function sleepDay(k = todayKey()) {
  const raw = (S.health.sleep && S.health.sleep[k]) || {};
  return {
    hours: raw.hours === '' || raw.hours === undefined ? '' : Number(raw.hours),
    quality: raw.quality || 'steady',
    note: raw.note || '',
    wakeMood: raw.wakeMood || '',
    lightsOut: raw.lightsOut || '',
  };
}

function setSleepDay(k, patch) {
  S.health.sleep[k] = Object.assign({}, sleepDay(k), patch);
  const d = S.health.sleep[k];
  if (d.hours === '' && !d.note && !d.wakeMood && !d.lightsOut) delete S.health.sleep[k];
  save();
}

function setHealthDay(k, patch) {
  if (patch.water !== undefined) S.health.water[k] = Math.max(0, Number(patch.water) || 0);
  if (patch.weight !== undefined) {
    const n = String(patch.weight || '').trim();
    if (n) S.health.weight[k] = n;
    else delete S.health.weight[k];
  }
  if (patch.steps !== undefined) S.health.steps[k] = Math.max(0, Number(patch.steps) || 0);
  save();
  maybeAutoCompleteSteps(k);
}

function maybeAutoCompleteSteps(k = todayKey()) {
  const steps = Number(S.health.steps[k]) || 0;
  if (steps < S.health.settings.stepGoal) return false;
  const stepHabit = S.habits.find((h) => /step|walk/i.test(h.name));
  if (!stepHabit || isCompleted(stepHabit.id, k)) return false;
  setStatus(stepHabit.id, k, 'done');
  return true;
}

function applyNativeHealthSync(payload = {}) {
  const applyDay = (row) => {
    const k = row.date;
    if (!k) return 0;
    let touched = 0;
    // Sensor data wins for steps/weight/vitals; water keeps the higher of
    // in-app taps vs HealthKit; sleep NEVER clobbers a manual log.
    if (row.steps !== undefined && row.steps !== null) { S.health.steps[k] = Math.max(0, Number(row.steps) || 0); touched++; }
    if (row.weight !== undefined && row.weight !== null && String(row.weight).trim()) { S.health.weight[k] = String(row.weight); touched++; }
    if (row.water !== undefined && row.water !== null) {
      const w = Math.max(Number(S.health.water[k]) || 0, Number(row.water) || 0);
      if (w > 0) { S.health.water[k] = w; touched++; }
    }
    ['rhr', 'hrv', 'vo2', 'kcal', 'exercise', 'distance', 'flights', 'spo2', 'resp'].forEach((key) => {
      if (row[key] !== undefined && row[key] !== null && S.health[key]) { S.health[key][k] = Number(row[key]); touched++; }
    });
    if (row.sleepHours !== undefined && row.sleepHours !== null) {
      const existing = sleepDay(k);
      if (existing.hours === '') {
        S.health.sleep[k] = Object.assign({}, existing, { hours: Number(row.sleepHours), quality: row.sleepQuality || existing.quality || 'steady' });
        touched++;
      }
    }
    return touched;
  };

  let touched = 0, daysWithData = 0;
  const history = Array.isArray(payload.history) ? payload.history : [];
  for (const row of history) {
    const t = applyDay(row);
    touched += t;
    if (t) daysWithData++;
  }
  // Single-day payloads (older bridge shape) still apply.
  if (!history.length) {
    touched = applyDay({ ...payload, date: payload.date || todayKey() });
    daysWithData = touched ? 1 : 0;
  }
  save();
  maybeAutoCompleteSteps(todayKey());
  render();
  showNudge(touched
    ? `Apple Health synced — ${daysWithData} day${daysWithData === 1 ? '' : 's'} of signals imported. Steps can auto-complete matching habits.`
    : 'Apple Health connected, but no readable data yet. Check Settings → Health → Data Access.');
}

function sleepStats(nDays = 7) {
  const today = atMidnight(operationalDate());
  const rows = [];
  for (let i = Math.min(nDays, elapsedDays()) - 1; i >= 0; i--) {
    const k = dkey(addDays(today, -i));
    const s = sleepDay(k);
    if (s.hours !== '' && Number.isFinite(Number(s.hours))) rows.push({ key: k, hours: Number(s.hours), quality: s.quality });
  }
  const avg = rows.length ? rows.reduce((sum, r) => sum + r.hours, 0) / rows.length : 0;
  const goal = Number(S.health.settings.sleepGoal) || 7;
  const kept = rows.filter((r) => r.hours >= goal).length;
  const spread = rows.length ? Math.max(...rows.map((r) => r.hours)) - Math.min(...rows.map((r) => r.hours)) : 0;
  const consistency = !rows.length ? 'No sleep baseline yet'
    : spread <= 1 ? 'consistent window'
    : spread <= 2 ? 'slightly irregular'
    : 'irregular sleep window';
  const copy = !rows.length
    ? 'Log sleep for a few days and Arc90 will compare duration, consistency, and next-day routine quality.'
    : avg >= goal
      ? `${avg.toFixed(1)}h average this week. Protect the same sleep window so recovery stays predictable.`
      : `${avg.toFixed(1)}h average this week. Your first lever is a realistic bedtime, not more willpower tomorrow.`;
  return { rows, avg, goal, kept, consistency, copy };
}

function protocolStats() {
  const total = S.protocols.length;
  const today = todayKey();
  let loggedToday = 0, flags = 0, logs = 0;
  const typeCounts = {};
  for (const p of S.protocols) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
    if (p.logs.some((l) => l.date === today)) loggedToday++;
    for (const l of p.logs) {
      logs++;
      if (l.urgent) flags++;
    }
  }
  const dominant = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
  return { total, loggedToday, flags, logs, dominant: dominant ? dominant[0] : '' };
}

function protocolInsight() {
  const stats = protocolStats();
  if (!stats.total) return 'Add your vitamins, supplements, peptides, medication, nutrition, or training routines. Arc90 tracks adherence and body signals, not dosing advice.';
  const consistency = Math.round((stats.loggedToday / stats.total) * 100);
  const type = PROTOCOL_TYPES.find((t) => t.id === stats.dominant);
  return `${stats.loggedToday}/${stats.total} protocols logged today (${consistency}%). ${type ? `Most of your stack is ${type.label.toLowerCase()}-focused. ` : ''}${stats.flags ? 'Urgent symptoms were flagged in your history — export this for a clinician.' : 'No urgent symptom flags logged.'}`;
}

function protocolLoggedOn(p, k = todayKey()) {
  return Array.isArray(p.logs) && p.logs.some((l) => l.date === k);
}

function inferDoseSlot(time = '') {
  const hour = Number(String(time).split(':')[0]);
  if (!Number.isFinite(hour)) return 'flex';
  if (hour >= 17 || hour < 5) return 'night';
  return 'day';
}

function doseSlotLabel(slot) {
  return ({ day: 'Day dose', night: 'Night dose', both: 'Day + night', flex: 'Flexible' })[slot] || 'Flexible';
}

function upsertProtocolLog(p, log) {
  p.logs = Array.isArray(p.logs) ? p.logs.filter((l) => l.date !== log.date) : [];
  p.logs.push(log);
}

function protocolPulseRows(days = 7) {
  const today = atMidnight(operationalDate());
  const total = Math.max(1, S.protocols.length);
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - (days - 1));
    const key = dkey(d);
    const kept = S.protocols.filter((p) => protocolLoggedOn(p, key)).length;
    return {
      key,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      kept,
      pct: Math.round((kept / total) * 100),
      today: key === todayKey(),
    };
  });
}

function focusSessionEndsAt(session) {
  return new Date(session.start).getTime() + session.minutes * 60000;
}

function focusRemainingMs(session) {
  return Math.max(0, focusSessionEndsAt(session) - Date.now());
}

function focusNativeBridgeAvailable() {
  return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.arc90Focus);
}

function requestNativeFocusShield(action, payload = {}) {
  if (!focusNativeBridgeAvailable()) return '';
  const requestId = `focus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    window.webkit.messageHandlers.arc90Focus.postMessage({ action, requestId, ...payload });
    window.setTimeout(() => focusNativeAcknowledgement({ requestId, status: 'failed' }), 5000);
    return requestId;
  } catch (e) {
    return '';
  }
}

function focusNativeAcknowledgement(detail = {}) {
  const requestId = String(detail.requestId || '');
  if (!requestId) return false;
  const failed = detail.status === 'failed' || !!detail.error;
  const confirmedActive = detail.status === 'active' || detail.active === true;
  const confirmedStopped = detail.status === 'stopped' || detail.active === false;
  let changed = false;

  const active = S.focus.active;
  if (active?.protection?.requestId === requestId && (failed || confirmedActive)) {
    active.protection = { status: confirmedActive && !failed ? 'active' : 'failed', requestId: '' };
    S.focus.mode = active.protection.status === 'active' ? 'native-ready' : 'soft';
    changed = true;
  }

  const lock = S.focus.allDayLock;
  if (lock?.requestId === requestId) {
    if (failed) {
      lock.status = 'failed';
    } else if (lock.pendingAction === 'start' && confirmedActive) {
      lock.on = true;
      lock.status = 'active';
      lock.confirmed = true;
    } else if (lock.pendingAction === 'stop' && confirmedStopped) {
      lock.on = false;
      lock.status = 'off';
      lock.confirmed = false;
    } else {
      return changed;
    }
    lock.requestId = '';
    lock.pendingAction = '';
    changed = true;
  }

  const pendingStop = S.focus.pendingNativeStop;
  if (pendingStop?.requestId === requestId && (failed || confirmedStopped || confirmedActive)) {
    S.focus.pendingNativeStop = confirmedStopped && !failed
      ? null
      : { requestId: '', status: 'failed', label: pendingStop.label };
    changed = true;
  }

  if (changed) {
    save();
    render();
  }
  return changed;
}

window.arc90FocusDidUpdate = focusNativeAcknowledgement;

function finishFocusSession(status = 'completed') {
  const active = S.focus.active;
  if (!active) return false;
  if (['requested', 'active'].includes(active.protection?.status)) {
    const requestId = requestNativeFocusShield('stop', { status, scope: 'session' });
    S.focus.pendingNativeStop = requestId
      ? { requestId, status: 'requested', label: active.label }
      : { requestId: '', status: 'failed', label: active.label };
  }
  const elapsed = Math.max(1, Math.round((Date.now() - new Date(active.start).getTime()) / 60000));
  S.focus.seq++;
  S.focus.sessions.unshift({
    id: `fs${S.focus.seq}`,
    date: dkey(new Date(active.start)),
    startedAt: active.start,
    label: active.label,
    minutes: active.minutes,
    actualMinutes: status === 'completed' ? active.minutes : Math.min(active.minutes, elapsed),
    strict: !!active.strict,
    status,
    unlocks: active.unlocks || 0,
    targets: Array.isArray(active.targets) ? active.targets : [],
  });
  S.focus.active = null;
  if (status === 'completed' && active.habitId != null) {
    S.focus.pendingCompletion = { habitId: String(active.habitId), date: active.goalDate,
      status: active.targetStatus === 'min' ? 'min' : 'done', label: active.label };
  }
  save();
  return true;
}

function syncFocusState() {
  if (!S.focus.active) return false;
  if (focusRemainingMs(S.focus.active) > 0) return false;
  return finishFocusSession('completed');
}

function focusMinutesForDay(k) {
  return S.focus.sessions.filter((s) => s.date === k).reduce((sum, s) => sum + (Number(s.actualMinutes) || 0), 0);
}

function focusConsistencyDays(nDays = 7) {
  return recentKeys(nDays).filter((k) => focusMinutesForDay(k) > 0).length;
}

function focusStreak() {
  let streakDays = 0;
  const today = atMidnight(operationalDate());
  for (let i = 0; i < Math.min(90, elapsedDays()); i++) {
    const k = dkey(addDays(today, -i));
    if (focusMinutesForDay(k) > 0) streakDays++;
    else break;
  }
  return streakDays;
}

function focusStats() {
  const today = todayKey();
  const weekKeys = recentKeys(7);
  const todayMinutes = focusMinutesForDay(today);
  const weekMinutes = weekKeys.reduce((sum, k) => sum + focusMinutesForDay(k), 0);
  const totalMinutes = S.focus.sessions.reduce((sum, s) => sum + (Number(s.actualMinutes) || 0), 0);
  const weekUnlocks = S.focus.unlocks.filter((u) => weekKeys.includes(u.date)).length;
  const topPull = S.focus.apps[0] || S.focus.sites[0] || '';
  return {
    todayMinutes,
    weekMinutes,
    totalMinutes,
    weekUnlocks,
    blockedCount: S.focus.apps.length + S.focus.sites.length,
    sessions: S.focus.sessions.length,
    streak: focusStreak(),
    planCount: S.focus.plans.length,
    consistency: focusConsistencyDays(7),
    topPull,
  };
}

function formatFocusMinutes(minutes) {
  const n = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(n / 60);
  const mins = n % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatClockMinutes(ms) {
  const total = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${mins}m`;
}

function formatClockTime(hhmm) {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
}

function focusDaysLabel(days) {
  const set = [...new Set(days)].sort((a, b) => a - b);
  const all = 'Every day';
  const weekdays = 'Mon-Fri';
  const weekend = 'Weekend';
  const lookup = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (set.length === 7) return all;
  if (set.join(',') === '1,2,3,4,5') return weekdays;
  if (set.join(',') === '0,6') return weekend;
  return set.map((d) => lookup[d]).join(' / ');
}

function focusCurrentPlan() {
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  return S.focus.plans.find((p) => p.days.includes(now.getDay()) && hhmm >= p.start && hhmm <= p.end) || null;
}

function focusInsight() {
  const stats = focusStats();
  const next = nextBestRep();
  if (!stats.blockedCount) return {
    title: 'Build your shield list',
    body: 'Start with the 2 or 3 apps that steal your first 20 minutes. The goal is not perfection. It is fewer easy escapes.',
  };
  if (!stats.sessions) return {
    title: 'Turn intent into sessions',
    body: `Start with one 30-minute block and point it at ${next ? next.name : 'your next important rep'}. The streak starts with protected time, not willpower.`,
  };
  if (stats.weekUnlocks >= 3) return {
    title: 'Your unlocks are talking',
    body: `You have ${stats.weekUnlocks} unlock${stats.weekUnlocks === 1 ? '' : 's'} this week. Tighten the list or shorten the block until the friction holds.`,
  };
  if (focusCurrentPlan()) return {
    title: 'A shield window is live',
    body: `${focusCurrentPlan().name} is active right now. This is the perfect moment to stack one clear rep before the day gets noisy.`,
  };
  return {
    title: 'Protected time is compounding',
    body: `${stats.consistency}/7 days had at least one focus block. Keep pairing it with ${next ? next.name : 'your main goal'} and it turns into identity, not effort.`,
  };
}

function toggleFocusItem(kind, raw) {
  const value = focusEntry(kind, raw);
  if (!value) return false;
  const key = focusEntryKey(kind, value);
  const list = S.focus[kind];
  const index = list.findIndex((item) => focusEntryKey(kind, item) === key);
  if (index >= 0) list.splice(index, 1);
  else list.push(value);
  save();
  return index < 0;
}

function ensureFocusItem(kind, raw) {
  const value = focusEntry(kind, raw);
  if (!value) return false;
  const key = focusEntryKey(kind, value);
  if (S.focus[kind].some((item) => focusEntryKey(kind, item) === key)) return false;
  S.focus[kind].push(value);
  save();
  return true;
}

function addFocusPlanFromTemplate(id) {
  const tpl = FOCUS_PLAN_TEMPLATES.find((p) => p.id === id);
  if (!tpl) return false;
  if (S.focus.plans.some((p) => p.name === tpl.name)) return false;
  S.focus.seq++;
  S.focus.plans.push({ ...tpl, id: `fp${S.focus.seq}` });
  save();
  return true;
}

function startFocusSession(minutes, label, strict = true, ritual = null) {
  if (S.focus.active) return false;
  const target = nextBestRep();
  const session = {
    start: new Date().toISOString(),
    minutes: Math.max(1, Number(minutes) || 30),
    label: label || 'Focus session',
    strict: !!strict,
    targets: [target ? target.name : (S.profile.goal || 'Your next 90 days')],
    unlocks: 0,
    ...(ritual || {}),
  };
  S.focus.active = { ...session, protection: { status: 'off', requestId: '' } };
  const canRequestProtection = strict && focusStats().blockedCount > 0 && !S.focus.pendingNativeStop;
  const requestId = canRequestProtection ? requestNativeFocusShield('start', {
    ...session,
    apps: S.focus.apps,
    sites: S.focus.sites,
  }) : '';
  S.focus.active.protection = requestId
    ? { status: 'requested', requestId }
    : { status: 'off', requestId: '' };
  S.focus.mode = 'soft';
  save();
  return S.focus.active.protection.status;
}

function focusDisplayList(kind, suggestions) {
  const seen = new Set();
  const out = [];
  for (const value of [...suggestions, ...S.focus[kind]]) {
    const key = focusEntryKey(kind, value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(focusEntry(kind, value));
  }
  return out;
}

const MOOD_OPTIONS = [
  ['strong', 'Strong', 5],
  ['steady', 'Steady', 4],
  ['tired', 'Tired', 3],
  ['stressed', 'Stress', 2],
  ['low', 'Low', 1],
];

function moodLabel(mood) {
  const opt = MOOD_OPTIONS.find(([id]) => id === mood);
  return opt ? opt[1] : '';
}

function moodOptionChips(current, extraClass = '') {
  const compact = extraClass === 'today-mood';
  const selected = MOOD_OPTIONS.findIndex(([id]) => id === current);
  return `
    <div class="mood-choice-row ${extraClass}" role="group" aria-label="Mood choices">
      ${compact && selected >= 0 ? `<span class="mood-cursor" aria-hidden="true" style="--mood-column:${selected % 3 + 1};--mood-row:${Math.floor(selected / 3) + 1};--mood-position:${selected + 1}"></span>` : ''}
      ${MOOD_OPTIONS.map(([id, label], index) => `
        <button class="${current === id ? 'on' : ''}" ${compact ? `style="--mood-column:${index % 3 + 1};--mood-row:${Math.floor(index / 3) + 1};--mood-position:${index + 1}"` : ''} data-act="mood-quick" data-id="${id}" aria-pressed="${current === id}" aria-label="Set mood to ${esc(label)}">
          ${esc(label)}
        </button>`).join('')}
    </div>`;
}

function wakeMoodChips(current) {
  return `
    <div class="mood-choice-row wake-mood-row">
      ${MOOD_OPTIONS.map(([id, label]) => `
        <button class="${current === id ? 'on' : ''}" data-act="wake-mood" data-id="${id}" aria-label="Woke up feeling ${esc(label)}">
          ${esc(label)}
        </button>`).join('')}
    </div>`;
}

function setQuickMood(id, k = todayKey()) {
  const opt = MOOD_OPTIONS.find(([m]) => m === id);
  if (!opt) return;
  const l = dlog(k);
  l.mood = opt[0];
  if (!l.energy) l.energy = opt[2];
  S.log[k] = l;
  save();
  render();
  showNudge(`Mood logged: ${opt[1]}.`);
}

function energyOptionChips(current, extraClass = '') {
  return `
    <div class="mood-choice-row ${extraClass}">
      ${[1, 2, 3, 4, 5].map((n) => `
        <button class="${Number(current) === n ? 'on' : ''}" data-act="energy-quick" data-id="${n}" aria-label="Set energy to ${esc(energyLabel(n))}">
          ${n}
        </button>`).join('')}
    </div>`;
}
function setQuickEnergy(id, k = todayKey()) {
  const n = Math.max(1, Math.min(5, Number(id) || 0));
  if (!n) return;
  const l = dlog(k);
  l.energy = n;
  S.log[k] = l;
  save();
  render();
  showNudge(`Energy logged: ${energyLabel(n)}.`);
}

function energyLabel(value) {
  const n = Number(value) || 0;
  if (!n) return 'Not logged';
  return ['Very low', 'Low', 'Steady', 'High', 'Peak'][n - 1] || 'Logged';
}

/* Stress (1 calm → 5 maxed, scored inverted) & focus quality (1 foggy → 5 locked in) */
function stressLabel(value) {
  const n = Number(value) || 0;
  if (!n) return 'Not logged';
  return ['Calm', 'Settled', 'Tense', 'High', 'Maxed'][n - 1] || 'Logged';
}
function focusQLabel(value) {
  const n = Number(value) || 0;
  if (!n) return 'Not logged';
  return ['Foggy', 'Scattered', 'Okay', 'Clear', 'Locked in'][n - 1] || 'Logged';
}
function scaleOptionChips(act, current, labeler, extraClass = '') {
  return `
    <div class="mood-choice-row ${extraClass}">
      ${[1, 2, 3, 4, 5].map((n) => `
        <button class="${Number(current) === n ? 'on' : ''}" data-act="${act}" data-id="${n}" aria-label="${esc(labeler(n))}">
          ${n}
        </button>`).join('')}
    </div>`;
}
function setQuickScale(field, id, nudgeName, labeler, k = todayKey()) {
  const n = Math.max(1, Math.min(5, Number(id) || 0));
  if (!n) return;
  const l = dlog(k);
  l[field] = n;
  S.log[k] = l;
  save();
  render();
  showNudge(`${nudgeName} logged: ${labeler(n)}.`);
}

function nextBestRep() {
  const pending = actionable(todayKey()).filter((h) => !isCompleted(h.id, todayKey()));
  if (!pending.length) return null;
  const weak = weakestHabit();
  if (weak) {
    const match = pending.find((h) => String(h.id) === String(weak.habit.id));
    if (match) return match;
  }
  return pending[0];
}

function nextFocusRep() {
  const pending = actionable(todayKey()).filter((habit) => !isCompleted(habit.id, todayKey()));
  const eligible = adaptiveMode() === 'recovery'
    ? pending.filter((habit) => !adaptiveTarget(habit).optional)
    : pending;
  return eligible.find((habit) => ['learn', 'work', 'create', 'mind'].includes(habit.cat)) || eligible[0] || null;
}

function projectedReps() {
  const remaining = Math.max(0, daysLeft());
  const scheduled = actionable(todayKey()).length || S.habits.length;
  return Math.round(totalReps() + avgRate(7) * scheduled * remaining);
}

function reflectionCount(nDays = 90) {
  const today = atMidnight(operationalDate());
  let count = 0;
  for (let i = 0; i < Math.min(nDays, elapsedDays()); i++) {
    const l = dlog(dkey(addDays(today, -i)));
    if (l.energy || l.mood || l.win || l.note) count++;
  }
  return count;
}

function activeDaysCount() {
  const start = startDate();
  const today = atMidnight(operationalDate());
  let count = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const l = dlog(dkey(d));
    if (l.done.length || l.min.length || l.skip.length || l.energy || l.mood || l.win || l.note) count++;
  }
  return count;
}

function achievementList() {
  const rec = recoveryRate();
  const reflections = reflectionCount();
  const reps = totalReps();
  const streakBest = bestStreak();
  const perfect = perfectDays();
  const active = activeDaysCount();
  const items = [
    { id: 'first-rep', icon: '✓', title: 'First rep', desc: 'Complete any habit.', value: reps, target: 1 },
    { id: 'first-perfect', icon: '◇', title: 'Perfect day', desc: 'Finish every scheduled habit once.', value: perfect, target: 1 },
    { id: 'streak-3', icon: '3', title: 'Three-day thread', desc: 'Reach a 3-day streak on any habit.', value: streakBest, target: 3 },
    { id: 'streak-7', icon: '7', title: 'One-week chain', desc: 'Reach a 7-day streak on any habit.', value: streakBest, target: 7 },
    { id: 'hundred-reps', icon: '100', title: '100 votes', desc: 'Cast 100 habit reps.', value: reps, target: 100 },
    { id: 'reflection-1', icon: '✎', title: 'Signal logged', desc: 'Save one reflection.', value: reflections, target: 1 },
    { id: 'reflection-7', icon: '7', title: 'Pattern finder', desc: 'Log 7 reflections.', value: reflections, target: 7 },
    { id: 'momentum-70', icon: '70', title: 'Momentum lift', desc: 'Reach a 70% Momentum Score.', value: momentum(), target: 70 },
    { id: 'comeback', icon: '↗', title: 'Comeback skill', desc: 'Recover after at least half of misses.', value: rec === null ? 0 : rec, target: 50 },
    { id: 'thirty-days', icon: '30', title: 'Month marker', desc: 'Reach Day 30 of the arc.', value: dayNumber(), target: 30 },
    { id: 'data-rich', icon: '14', title: 'Data-rich', desc: 'Track something on 14 separate days.', value: active, target: 14 },
    { id: 'finish-line', icon: '90', title: 'Arc complete', desc: 'Reach Day 90.', value: dayNumber(), target: 90 },
  ];
  return items.map((a) => ({ ...a, pct: Math.max(0, Math.min(100, Math.round((a.value / a.target) * 100))), unlocked: a.value >= a.target }));
}

function nextAchievement() {
  return achievementList().filter((a) => !a.unlocked).sort((a, b) => b.pct - a.pct)[0] || null;
}

function arcLevel() {
  return Math.max(1, Math.min(10, Math.floor(totalReps() / 25) + Math.floor(perfectDays() / 3) + Math.floor(reflectionCount() / 5) + 1));
}

function nextScheduledDate(h, fromKey = todayKey()) {
  const start = dateFromKey(fromKey);
  for (let i = 0; i <= 14; i++) {
    const d = addDays(start, i);
    const k = dkey(d);
    if (scheduledFor(h, k)) return k;
  }
  return fromKey;
}

function habitMiniHeat(h, nDays = 21) {
  const today = atMidnight(operationalDate());
  let cells = '';
  for (let i = nDays - 1; i >= 0; i--) {
    const k = dkey(addDays(today, -i));
    const st = statusOf(h.id, k);
    const due = scheduledFor(h, k);
    const cls = st === 'done' ? 'done' : st === 'min' ? 'min' : st === 'skip' ? 'skip' : due ? 'miss' : 'off';
    cells += `<i class="${cls}" title="${niceDate(k)}"></i>`;
  }
  return `<div class="habit-heat">${cells}</div>`;
}

function dateFromKey(k) { return atMidnight(new Date(k + 'T00:00:00')); }
function challengeDayFor(k) {
  return Math.round((dateFromKey(k) - startDate()) / DAY_MS) + 1;
}
function dayStats(k) {
  const act = actionable(k);
  const done = act.filter((h) => isCompleted(h.id, k)).length;
  return { done, total: act.length, rate: act.length ? done / act.length : null };
}
function dayStatusClass(k) {
  const stats = dayStats(k);
  if (stats.rate === null) return 'rest';
  if (stats.rate >= 1) return 'full';
  if (stats.rate >= 0.5) return 'mid';
  if (stats.rate > 0) return 'low';
  return '';
}
function niceDate(k) {
  return dateFromKey(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ---------------- coach engine ---------------- */

function currentTip() { return COACH_TIPS[(dayNumber() + S.tipSeed) % COACH_TIPS.length]; }
function tipTarget() { const w = weakestHabit(); return w ? w.habit : (S.habits[0] || null); }

function fillTemplate(str, extraBold) {
  const w = weakestHabit() || (S.habits[0] ? { habit: S.habits[0], rate: habitRate(S.habits[0].id, 7) } : null);
  const st = strongestHabit();
  const map = {
    '{weak}': w ? esc(w.habit.name) : 'your habit',
    '{weakPct}': w ? Math.round(w.rate * 100) : 0,
    '{weakMin}': w ? esc(w.habit.min || '2-minute version') : '2-minute version',
    '{strong}': st ? esc(st.habit.name) : 'your strongest habit',
    '{strongPct}': st ? Math.round(st.rate * 100) : 0,
    '{momentum}': momentum(),
    '{count}': S.habits.length,
    '{day}': dayNumber() + 1 > 90 ? 90 : dayNumber() + 1,
  };
  let out = esc(str);
  for (const [k, v] of Object.entries(map)) {
    out = out.replaceAll(k, extraBold ? `<b>${v}</b>` : v);
  }
  return out;
}

function renderTipBody(tip, habit) {
  const name = habit ? habit.name : 'your habit';
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  return esc(tip.body).replaceAll('{habit}', `<b>${esc(name)}</b>`).replaceAll('{habitLower}', `<b>${esc(lower)}</b>`);
}

/* ---------------- utils ---------------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function catOf(id) { return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1]; }
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function customCount() { return S.habits.filter((h) => String(h.id).startsWith('c')).length; }
function forgeActive() {
  if (!S.forge) return false;
  const d = Math.round((atMidnight(operationalDate()) - atMidnight(new Date(S.forge.start + 'T00:00:00'))) / DAY_MS) + 1;
  return d >= 1 && d <= 7;
}
function forgeDay() {
  return Math.round((atMidnight(operationalDate()) - atMidnight(new Date(S.forge.start + 'T00:00:00'))) / DAY_MS) + 1;
}

const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M8.5 12.2l2.4 2.4 4.6-5"/></svg>',
  habits: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6.5h10M4 12h10M4 17.5h10"/><circle cx="19" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="17.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
  focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2"/></svg>',
  protocol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 7.5l6 6"/><path d="M7.5 10.5l6 6"/><rect x="3.5" y="11" width="17" height="6.5" rx="3.25" transform="rotate(-45 12 14.25)"/><circle cx="6.8" cy="17.2" r="1.2"/><circle cx="17.2" cy="6.8" r="1.2"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 6-8"/><path d="M16 6h3v3"/></svg>',
  coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.2-.6L3 21l1.7-5.1a8.3 8.3 0 01-1.2-4.4 8.4 8.4 0 018.5-8.4 8.4 8.4 0 019 8.4z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.6-3.4 4.5-5 8-5s6.4 1.6 8 5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  vitals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-5 3 10 2.4-6 1.6 3H21"/></svg>',
  sleep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 10 4.2 6.5 6.5 0 0 0 20 14.5z"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4.5" width="16" height="16" rx="3"/><path d="M8 3v3M16 3v3M4 9.5h16"/><path d="M8.6 14l2 2 3.8-4"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
};

/* ---- Habit icon system: clean line icons instead of emoji ---- */
const HI = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${p}</svg>`;
const HABIT_ICONS = {
  dumbbell: HI('<path d="M3 9v6M6 7.5v9M18 7.5v9M21 9v6M6 12h12"/>'),
  run: HI('<path d="M2 12h3.4l2-6 3.6 12 2.4-8 1.8 4H22"/>'),
  steps: HI('<ellipse cx="8" cy="7" rx="2.3" ry="3.2" fill="currentColor" stroke="none"/><path d="M5.7 12c0-.9.9-1.5 2.3-1.5s2.3.6 2.3 1.5c0 1.5-.5 2.3-2.3 2.3S5.7 13.5 5.7 12z" fill="currentColor" stroke="none"/><ellipse cx="16" cy="11" rx="2.3" ry="3.2" fill="currentColor" stroke="none"/><path d="M13.7 16c0-.9.9-1.5 2.3-1.5s2.3.6 2.3 1.5c0 1.5-.5 2.3-2.3 2.3s-2.3-.8-2.3-2.3z" fill="currentColor" stroke="none"/>'),
  water: HI('<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>'),
  food: HI('<path d="M6 3v8M4.5 3v4a1.5 1.5 0 0 0 3 0V3M6 11v10M17 3c-1.6 0-2.6 2.2-2.6 4.8S15.4 12 17 12v9"/>'),
  book: HI('<path d="M12 6c-2-1.2-4.6-1.5-7-1v12c2.4-.5 5-.2 7 1 2-1.2 4.6-1.5 7-1V5c-2.4-.5-5-.2-7 1z"/><path d="M12 6v13"/>'),
  leaf: HI('<path d="M12 21c0-6 3-9.5 8-11.5C19 16 16 19.5 12 21z"/><path d="M12 21c0-6-3-9.5-8-11.5C5 16 8 19.5 12 21z"/><path d="M12 21v-9"/>'),
  moon: HI('<path d="M20 14.5A8 8 0 1 1 10 4.2 6.5 6.5 0 0 0 20 14.5z"/>'),
  pen: HI('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
  money: HI('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M14.6 9.3c-.6-.8-1.6-1.1-2.6-1.1-1.4 0-2.4.8-2.4 1.9 0 2.6 5.2 1.3 5.2 4 0 1.2-1 2-2.6 2-1.1 0-2.1-.4-2.7-1.2"/>'),
  target: HI('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>'),
  phoneOff: HI('<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M10 6h4"/><path d="M4 4l16 16"/>'),
  sun: HI('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.3M12 19.2v2.3M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.4 19.6l1.6-1.6M18 6l1.6-1.6"/>'),
  pill: HI('<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M8.4 8.4l7.2 7.2"/>'),
  music: HI('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  home: HI('<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>'),
  heart: HI('<path d="M12 20S4 14.5 4 8.9A4.3 4.3 0 0 1 12 6a4.3 4.3 0 0 1 8 2.9C20 14.5 12 20 12 20z"/>'),
  coffee: HI('<path d="M5 8h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M17 9h2.2a2.3 2.3 0 0 1 0 4.6H17"/><path d="M9 3.5c-.5 1 .5 1.6 0 2.6M12.5 3.5c-.5 1 .5 1.6 0 2.6"/>'),
  cold: HI('<path d="M12 2v20M4 7l16 10M20 7L4 17"/><path d="M9 3.6L12 6l3-2.4M9 20.4L12 18l3 2.4"/>'),
  spark: HI('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  check: ICONS.check,
};

function habitIcon(h) {
  const n = (h && h.name ? h.name : '').toLowerCase();
  const has = (...ws) => ws.some((w) => n.includes(w));
  if (has('workout', 'gym', 'lift', 'strength', 'train', 'exercise', 'push-up', 'pushup', 'squat', 'weights', 'pull-up')) return HABIT_ICONS.dumbbell;
  if (has('run', 'jog', 'cardio', 'sprint', 'treadmill')) return HABIT_ICONS.run;
  if (has('walk', 'steps', '10k', 'stroll', 'hike', 'step ')) return HABIT_ICONS.steps;
  if (has('water', 'hydrate', 'drink', 'glass', 'h2o')) return HABIT_ICONS.water;
  if (has('eat', 'meal', 'veg', 'fruit', 'salad', 'protein', 'cook', 'nutrition', 'diet', 'breakfast', 'lunch', 'dinner', 'snack', 'greens', 'sugar')) return HABIT_ICONS.food;
  if (has('read', 'book', 'study', 'learn', 'pages', 'course', 'article', 'audiobook')) return HABIT_ICONS.book;
  if (has('meditat', 'mindful', 'breath', 'calm', 'zen', 'yoga', 'stretch', 'mobility', 'grateful', 'gratitude')) return HABIT_ICONS.leaf;
  if (has('sleep', 'bed', 'rest', 'nap', 'wind down', 'wind-down', 'lights out')) return HABIT_ICONS.moon;
  if (has('journal', 'write', 'plan', 'reflect', 'diary', 'note', 'affirm', 'intention')) return HABIT_ICONS.pen;
  if (has('money', 'save', 'budget', 'expense', 'invest', 'spend', 'finance', 'bill', 'subscription', 'net worth')) return HABIT_ICONS.money;
  if (has('focus', 'deep work', 'ship', 'code', 'build', 'inbox', 'email', 'priority', 'task', 'work', 'study block')) return HABIT_ICONS.target;
  if (has('phone', 'screen', 'social', 'scroll', 'digital', 'no phone', 'sunset', 'detox')) return HABIT_ICONS.phoneOff;
  if (has('morning', 'wake', 'sunrise', 'sunlight', 'sunshine')) return HABIT_ICONS.sun;
  if (has('supplement', 'vitamin', 'pill', 'medication', 'creatine', 'omega', 'magnesium')) return HABIT_ICONS.pill;
  if (has('music', 'guitar', 'piano', 'sing', 'instrument', 'practice', 'language', 'draw', 'paint', 'art', 'create', 'design')) return HABIT_ICONS.music;
  if (has('clean', 'tidy', 'declutter', 'chore', 'laundry', 'dishes', 'admin', 'organize', 'make bed')) return HABIT_ICONS.home;
  if (has('call', 'family', 'friend', 'relationship', 'connect', 'love', 'partner', 'kids', 'text', 'reach out', 'date')) return HABIT_ICONS.heart;
  if (has('coffee', 'caffeine', 'tea')) return HABIT_ICONS.coffee;
  if (has('cold', 'ice', 'shower', 'sauna', 'plunge')) return HABIT_ICONS.cold;
  if (has('nature', 'outdoor', 'garden', 'plant', 'outside', 'fresh air')) return HABIT_ICONS.leaf;
  const byCat = { learn: 'book', move: 'dumbbell', eat: 'food', money: 'money', mind: 'leaf', work: 'target', sleep: 'moon', create: 'music', connect: 'heart', home: 'home', custom: 'spark' };
  return HABIT_ICONS[byCat[h && h.cat]] || HABIT_ICONS.spark;
}

/* ---------------- theme ---------------- */

const mqLight = window.matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const resolved = S.theme === 'auto' ? (mqLight.matches ? 'light' : 'dark') : S.theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.motion = S.preferences?.reducedMotion ? 'reduced' : 'auto';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bar = { light: '#f7f8fa', dark: '#111315' };
    meta.content = bar[resolved] || '#111315';
  }
}
mqLight.addEventListener('change', () => { if (S.theme === 'auto') applyTheme(); });

function watchBridgeAvailable() {
  return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.arc90Watch);
}

function watchSummaryPayload() {
  const k = todayKey();
  const stats = dayStats(k);
  const health = healthDay(k);
  const sleep = sleepDay(k);
  return {
    day: dayNumber(),
    date: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    momentum: momentum(),
    readiness: vitality().score,
    streak: dayStreak(),
    pct: stats.total ? Math.round((stats.done / stats.total) * 100) : 0,
    quote: (reflectionQuote() || {}).quote || '',
    quoteSource: (reflectionQuote() || {}).source || '',
    completed: stats.done,
    total: stats.total || 0,
    goal: S.profile.goal || 'Arc90',
    identity: S.profile.identity || '',
    habits: actionable(k).map((h) => ({
      id: String(h.id),
      emoji: h.emoji,
      name: h.name,
      status: statusOf(h.id, k) || 'open',
      min: h.min || 'minimum version',
    })),
    health: {
      water: Number(health.water) || 0,
      waterGoal: S.health.settings.waterGoal,
      steps: Number(health.steps) || 0,
      stepGoal: S.health.settings.stepGoal,
      sleepHours: sleep.hours === '' ? null : Number(sleep.hours),
      sleepQuality: sleep.quality || '',
    },
    protocols: {
      total: S.protocols.length,
      loggedToday: protocolStats().loggedToday,
      next: S.protocols.find((p) => !p.logs.some((l) => l.date === k))?.name || S.protocols[0]?.name || '',
    },
  };
}

function sendWatchSnapshot(reason = 'update') {
  if (!watchBridgeAvailable()) return false;
  try {
    window.webkit.messageHandlers.arc90Watch.postMessage({
      action: 'snapshot',
      reason,
      summary: watchSummaryPayload(),
    });
    return true;
  } catch (e) {
    return false;
  }
}

function requestWatchSync() {
  const sent = sendWatchSnapshot('manual-sync');
  showNudge(sent ? 'Apple Watch snapshot sent.' : 'Apple Watch bridge is waiting for the native watchOS target.');
}

window.__arc90WatchMessage = function arc90WatchMessage(message) {
  const msg = message || {};
  const action = msg.action || msg.type;
  if (action === 'requestSnapshot') {
    sendWatchSnapshot('watch-request');
    return;
  }
  if (action === 'toggleHabit') {
    const id = isNaN(+msg.id) ? msg.id : +msg.id;
    const status = msg.status === 'min' ? 'min' : 'done';
    setStatus(id, todayKey(), status);
    save();
    render();
    sendWatchSnapshot('watch-toggle');
  }
  if (action === 'water') {
    const h = healthDay();
    setHealthDay(todayKey(), { water: h.water + (Number(msg.delta) || 1) });
    render();
    sendWatchSnapshot('watch-water');
  }
};

window.__arc90WatchStatus = function arc90WatchStatus(status) {
  window.__arc90WatchLastStatus = status;
};

/* ---------------- premium gate ---------------- */

function previewAccessActive() { return window.Arc90PreviewAccess?.active() === true; }
function hasPremiumAccess() { return S.premium === true || previewAccessActive(); }

// Public beta: Focus and Sleep stay open until launch monetization is enabled.
function hasToolAccess(id) {
  return id === 'focus' || id === 'sleep' || hasPremiumAccess();
}

function consumePreviewLink() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('preview')) return '';
  const requested = params.get('preview') === '1';
  params.delete('preview');
  const search = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? '?' + search : ''}${window.location.hash || ''}`);
  if (!requested) return '';
  const preview = window.Arc90PreviewAccess;
  if (!preview?.available()) return 'This preview window has ended.';
  return preview.setEnabled(true) ? 'Preview unlocked on this device. No purchase needed.' : 'Preview access could not be saved. Enable browser storage and try again.';
}

function gate(context) {
  if (hasPremiumAccess()) return true;
  sheet = { type: 'paywall', context };
  render();
  return false;
}

function isDevHost() {
  return ['localhost', '127.0.0.1', '0.0.0.0', ''].includes(window.location.hostname);
}

/* Full-tab premium lock — used to gate an entire tab (Sleep, Focus) rather
   than a single action. Renders instead of the tab's real content when
   access is locked; tapping it opens the paywall sheet with matching copy. */
function premiumTabLock(context, icon, points) {
  const copy = paywallCopy(context);
  return `
    <section class="card premium-tab-lock">
      <div class="ptl-icon">${icon}</div>
      <span class="tip-tag" style="margin:0">${esc(copy.eyebrow)}</span>
      <h2 class="ptl-title">${esc(copy.title)}</h2>
      <p class="ptl-sub">${esc(copy.sub)}</p>
      ${points ? `<ul class="ptl-points">${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      <div class="ptl-price">
        <b>${PREMIUM_OFFER.price}</b><span>${PREMIUM_OFFER.interval} · ${esc(PREMIUM_OFFER.perWeek)}</span>
      </div>
      <button class="btn ptl-cta" data-act="paywall-ctx" data-id="${context}">${esc(PREMIUM_OFFER.cta)}</button>
      <div class="seg-hint">${esc(PREMIUM_OFFER.note)}</div>
    </section>`;
}

function paywallCopy(context = '') {
  const copy = {
    'habit-limit': {
      eyebrow: 'Habit cap reached',
      title: 'Your arc is ready for more reps.',
      sub: `Arc90 Free keeps you focused at ${FREE_HABITS} active habits. Premium unlocks unlimited habits, recovery plans, and deeper progress insight when you want the full system.`,
    },
    'custom-limit': {
      eyebrow: 'Custom habit cap reached',
      title: 'Make Arc90 fit your real routine.',
      sub: `Free includes ${FREE_CUSTOM} custom habits. Premium unlocks unlimited custom routines, weekly reviews, and advanced exports.`,
    },
    protocol: {
      eyebrow: 'Protocol is Premium',
      title: 'Track wellness routines with more signal.',
      sub: 'Premium unlocks protocol tracking for supplements, medication notes, training routines, symptoms, and exports. Arc90 tracks only; it never gives dosing or medical advice.',
    },
    'proof-limit': {
      eyebrow: 'Proof Wall is filling up',
      title: 'Keep every piece of evidence.',
      sub: `Free saves up to ${PROOF_FREE_PHOTOS} progress photos. Premium unlocks unlimited proof, albums, and a 90-day export you can keep forever.`,
    },
    sleep: {
      eyebrow: 'Sleep is Premium',
      title: 'Sleep Score, Smart Alarm & sounds — one system.',
      sub: 'Premium unlocks Sleep Score, the bedtime optimizer, Smart Alarm with Night Mode, spatial sounds, guided meditations, sleep debt tracking, and Apple Health sync.',
    },
    focus: {
      eyebrow: 'Focus is Premium',
      title: 'Protect the reps that matter most.',
      sub: 'Premium unlocks the Focus timer, Focus Shield app blocking, the all-day lock, and your focus target list.',
    },
  };
  return copy[context] || {
    eyebrow: 'Arc90 Premium',
    title: 'Know the next move. Protect the moment.',
    sub: 'Premium adapts your day, protects focused work, and turns your history into clear personal patterns.',
  };
}

function premiumBenefits() {
  return [
    ['Adaptive recovery', 'Forge turns a slipping week into a smaller seven-day plan without erasing progress.'],
    ['Focus Contract', 'Start the right rep with a timer, Focus Shield, and app blocking when native access is available.'],
    ['Personal patterns', 'Unlock full history across habits, mood, sleep, readiness, and protocols.'],
    ['Unlimited system', 'Add unlimited habits, custom routines, challenge templates, and proof photos.'],
  ];
}

/* ============================================================
   RENDER ROOT
   ============================================================ */

const app = document.getElementById('app');

const TAB_ORDER = ['today', 'progress', 'habits', 'dashboard', 'profile'];
const TOOL_GROUPS = [
  { id: 'mind', label: 'Focus & guidance', items: [
    { id: 'focus', label: 'Focus', icon: 'focus', premium: true },
    { id: 'coach', label: 'AI Guidance', icon: 'coach' },
  ] },
  { id: 'health', label: 'Health lab', items: [
    { id: 'protocol', label: 'Protocols', icon: 'protocol' },
    { id: 'sleep', label: 'Sleep', icon: 'sleep', premium: true },
    { id: 'vitals', label: 'Health signals', icon: 'vitals' },
  ] },
];
function mainTabOf(id) {
  if (TOOL_GROUPS.some(group => group.items.some(item => item.id === id))) return 'dashboard';
  if (id === 'brain' || id === 'plan') return 'progress';
  return TAB_ORDER.includes(id) ? id : 'today';
}
let lastRenderedTab = null;
let tabDirection = 'next';
let navOpen = false;
let moreOpen = false;            // Grouped Tools menu anchored above the tab bar.
let proofTag = 'Win';            // selected tag in the proof note composer
let proofSeq = 0;                // disambiguates ids created in the same millisecond
let progressRange = 7;
let progressSelected = 6;
let moodSelected = 6;
let todayHistoryExpanded = true;
let shareCanvas = null;          // last-built story card (canvas) for native share / save
let shareCardURL = '';           // its dataURL for the preview sheet
let sheetReturnFocus = null;
function render() {
  cancelTodayArcAnimation();
  const shellMotion = captureShellMotion();
  const hadDialog = !!document.querySelector('.sheet[role="dialog"]');
  if (sheet && !hadDialog) {
    const active = document.activeElement;
    sheetReturnFocus = active?.dataset?.act ? { act: active.dataset.act, id: active.dataset.id } : null;
  }
  applyTheme();
  syncFocusState();
  if (!S.onboarded) { renderOnboarding(); return; }
  const animate = lastRenderedTab !== tab;
  const directionClass = animate ? ` enter-${tabDirection === 'prev' ? 'prev' : 'next'}` : '';
  lastRenderedTab = tab;
  const views = { today: viewToday, habits: viewHabits, sleep: viewSleep, focus: viewFocus, plan: viewPlan, brain: viewBrainDump, progress: viewProgress, dashboard: viewDashboard, coach: viewCoach, protocol: viewProtocol, vitals: viewVitals, profile: viewProfile };
  app.innerHTML = `
    <div class="screen${animate ? ` anim${directionClass}` : ''}">${views[tab]()}</div>
    ${moreOpen ? '<button class="dropup-scrim" data-act="more-close" aria-label="Close tools" tabindex="-1"></button>' : ''}
    <div class="tabbar-dock">
      ${moreOpen ? moreDropup() : ''}
      <nav class="tabbar" aria-label="Main navigation">
        ${tabBtn('today', 'Today', ICONS.today)}
        ${tabBtn('progress', 'Arc', ICONS.progress)}
        ${tabBtn('habits', 'Habits', ICONS.habits)}
        ${tabBtn('dashboard', 'Progress', ICONS.progress)}
        ${tabBtn('profile', 'You', ICONS.profile)}
        <span class="tab-cursor" aria-hidden="true"></span>
      </nav>
    </div>
    ${sheet ? viewSheet() : ''}
    ${ritualDock()}
    ${alarmOverlayView()}
  `;
  wireAfterRender();
  Arc90Motion.observeCharts(app, animate && tab === 'dashboard');
  playShellMotion(shellMotion);
  if (animate && tab === 'today' && !appRoom) requestAnimationFrame(animateTodayArc);
  if (!sheet && hadDialog) {
    const target = [...app.querySelectorAll('[data-act]')].find((node) => node.dataset.act === sheetReturnFocus?.act && node.dataset.id === sheetReturnFocus?.id);
    (target || app.querySelector('.tab-btn.active'))?.focus({ preventScroll: true });
    sheetReturnFocus = null;
  }
  hydrateProofImages();
  sendWatchSnapshot('render');
}

function tabBtn(id, label, icon) {
  const current = mainTabOf(tab) === id;
  return `<button class="tab-btn ${current ? 'active' : ''}" data-act="tab" data-id="${id}"${current ? ' aria-current="page"' : ''}>${icon}<span>${label}</span></button>`;
}

function moreTabBtn() {
  const current = mainTabOf(tab) === 'tools';
  const cls = [current ? 'active' : '', moreOpen ? 'open' : ''].filter(Boolean).join(' ');
  return `<button class="tab-btn tab-btn-more ${cls}" data-act="more-toggle" aria-label="${moreOpen ? 'Close' : 'Open'} Lab" aria-expanded="${moreOpen}"${moreOpen ? ' aria-controls="tools-menu"' : ''}${current ? ' aria-current="true"' : ''}>${ICONS.more}<span>Lab</span></button>`;
}

function moreDropup() {
  return `
    <nav class="dropup" id="tools-menu" aria-label="Lab">
      ${TOOL_GROUPS.map(group => `<div class="dropup-group" role="group" aria-labelledby="tools-${group.id}">
        <div class="dropup-cap" id="tools-${group.id}">${esc(group.label)}</div>
        ${group.items.map(it => `<button class="dropup-item" data-act="tab" data-id="${it.id}"${tab === it.id ? ' aria-current="page"' : ''}>
          <span class="dropup-ico" aria-hidden="true">${ICONS[it.icon]}</span>
          <span class="dropup-txt"><b>${esc(it.label)}</b></span>
          ${!hasToolAccess(it.id) && it.premium ? '<span class="dropup-lock">Pro</span>' : ''}
          <span class="dropup-arr" aria-hidden="true">›</span>
        </button>`).join('')}
      </div>`).join('')}
    </nav>`;
}

function setToolsMenu(open) {
  moreOpen = open;
  render();
  app.querySelector(open ? '#tools-menu .dropup-item' : '[data-act="more-toggle"]')?.focus({ preventScroll: true });
}

function sideNavBtn(id, label, icon, meta = '') {
  return `<button class="side-nav-btn ${tab === id || (id === 'habits' && tab === 'plan') ? 'active' : ''}" data-act="tab" data-id="${id}">
    ${icon}
    <span>${label}</span>
    ${meta ? `<em>${meta}</em>` : ''}
  </button>`;
}

function sideDrawer() {
  return `
    <div class="side-shell">
      <button class="side-scrim" data-act="side-close" aria-label="Close menu"></button>
      <aside class="side-drawer" aria-label="Arc90 menu">
        <div class="side-drawer-brand">
          <span class="side-brand-mark"></span>
          <b>ARC<span>90</span></b>
        </div>
        <div class="side-group">
          ${sideNavBtn('today', 'Dashboard', ICONS.today)}
          ${sideNavBtn('habits', 'Habits', ICONS.habits, `${S.habits.length}`)}
        </div>
        <div class="side-group">
          <div class="side-label">Operations</div>
          ${sideNavBtn('protocol', 'Protocol', ICONS.protocol, `${S.protocols.length}`)}
          ${sideNavBtn('vitals', 'Vitals', ICONS.vitals)}
        </div>
        <div class="side-group">
          <div class="side-label">General</div>
          ${sideNavBtn('progress', 'Monitoring', ICONS.progress)}
          ${sideNavBtn('focus', 'Focus', ICONS.focus, `${focusStats().blockedCount}`)}
        </div>
        <div class="side-group">
          <div class="side-label">Account</div>
          ${sideNavBtn('profile', 'Profile', ICONS.profile)}
        </div>
        ${previewAccessActive() ? '' : `<button class="side-upgrade" data-act="paywall">${S.premium ? 'Premium Active' : 'Upgrade to Pro'}</button>`}
      </aside>
    </div>`;
}

function switchTab(next) {
  if (!['today', 'habits', 'sleep', 'focus', 'plan', 'brain', 'progress', 'dashboard', 'coach', 'protocol', 'vitals', 'profile'].includes(next)) return;
  if (next === tab) {
    if (moreOpen) setToolsMenu(false);
    if (next === 'today' && !appRoom) requestAnimationFrame(animateTodayArc);
    return;
  }
  const from = TAB_ORDER.indexOf(mainTabOf(tab));
  const to = TAB_ORDER.indexOf(mainTabOf(next));
  tabDirection = to >= from ? 'next' : 'prev';
  // Commit navigation synchronously so rapid taps cannot queue stale destinations.
  tab = next;
  navOpen = false;
  moreOpen = false;
  openQA = null;
  appRoom = null;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  render();
  app.querySelector('.tab-btn.active')?.focus({ preventScroll: true });
}

function logoMarkSvg(className = '') {
  return `
    <svg class="arc90-logo-mark ${className}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle class="arc90-logo-track" cx="32" cy="32" r="24"/>
      <path class="arc90-logo-arc" pathLength="1" d="M48.97 15.03 A24 24 0 1 0 48.97 48.97"/>
      <rect class="arc90-logo-start" x="45.55" y="11.61" width="6.84" height="6.84" rx="2"/>
      <circle class="arc90-logo-core" cx="32" cy="32" r="3.8"/>
    </svg>`;
}

/* Global header: a stable mark and compact wordmark at every depth. */
function brandbar() {
  return `
    <div class="brandbar">
      ${logoMarkSvg('brand-symbol')}
      <span>ARC<b>90</b></span>
    </div>`;
}

/* ============================================================
   TODAY
   ============================================================ */

/* ── Today rooms: progressive disclosure ─────────────────────────────────────
   The Today surface stays calm (hero · habits · one contextual card · tiles);
   depth lives in "rooms" that push in from the right with a back chevron. */
let appRoom = null;   // null | 'readiness' | 'checkin' | 'insights'

function roomHead(title) {
  return `
    <div class="room-head">
      <button class="room-back" data-act="room-back" aria-label="Back to Today">‹ Today</button>
      <h2>${esc(title)}</h2>
    </div>`;
}

function appRoomView() {
  const hr = new Date().getHours();
  if (appRoom === 'readiness') return `
    ${brandbar()}
    <div class="room-view">
      ${roomHead('Readiness')}
      ${vitalityCard()}
      <button class="coach-entry" data-act="tab" data-id="vitals">
        <span class="coach-entry-ico">${ICONS.vitals}</span>
        <span class="coach-entry-txt"><b>Vitals &amp; trends</b><small>RHR, HRV, VO2, sleep — 14-day history →</small></span>
      </button>
    </div>`;
  if (appRoom === 'checkin') return `
    ${brandbar()}
    <div class="room-view">
      ${roomHead(hr >= 18 || hr < 4 ? 'Close the day' : 'Daily check-in')}
      ${todayStopCard()}
      ${hr >= 18 || hr < 4 ? `
        ${dailyReflectionCard()}
        <button class="coach-entry" data-act="tab" data-id="sleep">
          <span class="coach-entry-ico">${ICONS.sleep}</span>
          <span class="coach-entry-txt"><b>Wind down</b><small>Sounds, alarm &amp; lights-out →</small></span>
        </button>` : ''}
    </div>`;
  // insights — the deeper reads that don't need to live on the surface
  return `
    ${brandbar()}
    <div class="room-view">
      ${roomHead('Insights')}
      ${S.habits.length ? streakBannerCard() : ''}
      ${weakSpotCard()}
      ${todayFocusStrip()}
      ${comebackBtn()}
    </div>`;
}

/* One card, changes with the clock — morning check-in, midday slip-rescue,
   evening close-the-day. Same features, a third of the surface. */
function contextualCard() {
  const hr = new Date().getHours();
  const k = todayKey();
  const l = dlog(k);
  const checkinDone = !!(l.mood && l.energy && (Number(S.health.water[k]) || 0) > 0);
  const entry = (eyebrow, title, sub, act) => `
    <button class="ctx-card" ${act}>
      <span class="ctx-eyebrow">${eyebrow}</span>
      <b>${title}</b>
      <small>${sub}</small>
    </button>`;
  if (hr >= 18 || hr < 4)
    return entry('Evening', 'Close the day', 'Check-in, reflection &amp; wind-down →', 'data-act="room-open" data-id="checkin"');
  if (hr < 12)
    return checkinDone
      ? entry('Morning', 'Signals locked in', 'Check-in done — go take the first rep.', 'data-act="room-open" data-id="checkin"')
      : entry('Morning', 'Morning check-in', 'Water, mood, energy — 20 seconds →', 'data-act="room-open" data-id="checkin"');
  const pending = actionable(k).filter((h) => !isCompleted(h.id, k)).length;
  if (pending && momentum() < 50)
    return entry('Midday', 'Feeling off track?', 'Tap for your smallest next move →', 'data-act="comeback"');
  return entry('Midday', pending ? 'Keep the arc moving' : 'All reps in — strong day',
    pending ? `${pending} rep${pending === 1 ? '' : 's'} left · check in anytime →` : 'Log how it felt while it’s fresh →',
    'data-act="room-open" data-id="checkin"');
}

/* Readiness arc — its own ring on the Today surface, right below the hero.
   Tap opens the Readiness room with the full 7-signal breakdown. */
function readinessArcCard() {
  const v = vitality();
  const st = vitalityState(v.score);
  const frac = v.score === null ? 0 : v.score / 100;
  const C = 276.46; // 2π·44
  return `
    <button class="card readiness-arc-card" data-act="room-open" data-id="readiness"
      aria-label="Readiness ${v.score === null ? 'not logged yet' : `${v.score} — ${st.label}`}. Open breakdown.">
      <span class="ring-wrap rac-ring">
        <svg viewBox="0 0 104 104" width="88" height="88">
          <circle class="ring-track" cx="52" cy="52" r="44" fill="none" stroke-width="9"/>
          <circle class="ring-fill" cx="52" cy="52" r="44" fill="none" stroke-width="9"
            stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"/>
        </svg>
        <span class="ring-center">
          <b class="rac-num">${v.score === null ? '--' : `<span data-countup="${v.score}">0</span>`}</b>
        </span>
      </span>
      <span class="rac-txt">
        <span class="eyebrow">Readiness</span>
        <span class="vitality-state ${st.cls}"><span class="dot"></span>${st.label}</span>
        <small>${v.score === null ? 'Log your signals to see today’s reserve →' : `${v.count}/${v.total} signals · tap for the breakdown`}</small>
      </span>
      <span class="rac-chev" aria-hidden="true">›</span>
    </button>`;
}

/* Bento v4 helpers — themed mini ring + one-stat half cards */
function miniRing(pct, size = 40, sw = 6) {
  const r = (size - sw) / 2, C = 2 * Math.PI * r;
  const frac = pct === null ? 0 : Math.max(0, Math.min(100, pct)) / 100;
  return `
    <svg class="ms-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform:rotate(-90deg)" aria-hidden="true">
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${sw}"/>
      <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${sw}"
        stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"/>
    </svg>`;
}

function halfStat({ label, value, sub, act, aria }) {
  return `
    <button class="card bhalf mini-stat" ${act} aria-label="${esc(aria || label)}">
      <span class="ms-label">${label}</span>
      <span class="ms-value">${value}</span>
      <span class="ms-sub">${sub}</span>
    </button>`;
}

function readinessHalf() {
  const v = vitality();
  const st = vitalityState(v.score);
  return halfStat({
    label: 'Readiness',
    value: `${miniRing(v.score)}${v.score === null ? '--' : v.score}`,
    sub: `<span class="vitality-state ${st.cls}" style="font-size:11.5px"><span class="dot"></span>${st.label}</span>`,
    act: 'data-act="room-open" data-id="readiness"',
    aria: `Readiness ${v.score === null ? 'not logged' : v.score + ', ' + st.label}. Open breakdown.`,
  });
}

function streakHalf() {
  const stk = dayStreak();
  return halfStat({
    label: 'Streak',
    value: `<span class="${stk > 0 ? 'ms-amber' : ''}">${stk}</span><span style="font-size:13px;font-weight:800;color:var(--tx-2)">day${stk === 1 ? '' : 's'}</span>`,
    sub: stk > 0 ? `Best ${Math.max(stk, bestDayStreak())} · insights →` : 'One rep starts it · insights →',
    act: 'data-act="room-open" data-id="insights"',
    aria: `${stk}-day streak. Open insights.`,
  });
}

function coachHalf() {
  return halfStat({
    label: 'Coach',
    value: `<span class="ms-ico">${ICONS.coach}</span>`,
    sub: 'Your read & 7-day plan →',
    act: 'data-act="tab" data-id="coach"',
    aria: 'Open your coach',
  });
}

function insightsHalf() {
  return halfStat({
    label: 'Insights',
    value: '◈',
    sub: 'Weak spot, patterns & comeback →',
    act: 'data-act="room-open" data-id="insights"',
    aria: 'Open insights',
  });
}

/* The 90-day dot field. bare=true returns just the panel (for embedding
   inside the Today's-arc hero); otherwise a standalone card. */
function arcFieldPanel(bare = false) {
  const day = dayNumber();
  const panel = `
      <div class="arc-grid-panel" style="${bare ? '' : 'margin-top:0'}">
        <div class="arc-grid-head">
          <div>
            <span class="eyebrow">90-day history</span>
            ${bare ? '' : `<b>${esc(S.profile.goal || 'Your next 90 days')}</b>`}
          </div>
          ${bare ? '' : `<span>Day ${day} · ${90 - day} left</span>`}
        </div>
        ${grid90()}
        <div class="arc-grid-legend">
          <span><i class="l3"></i>Complete</span>
          <span><i class="l2"></i>Partial</span>
          <span><i class="missed-key"></i>Missed</span>
          <span>Rest: dashed</span>
        </div>
      </div>`;
  return bare ? panel : `<section class="card">${panel}</section>`;
}

function todayHistoryPanel() {
  const first = Math.max(0, Math.round((atMidnight(operationalDate()) - startDate()) / DAY_MS) - 6);
  return `<section class="arc-grid-panel today-history" data-expanded="${todayHistoryExpanded}" aria-label="Habit history">
    <div class="history-heading">
      <h2>Recent days</h2>
      <button data-act="history-toggle" aria-expanded="${todayHistoryExpanded}" aria-controls="today-history-full">
        <span>${todayHistoryExpanded ? 'Less' : '90 days'}</span><span class="history-chevron" aria-hidden="true">&#8964;</span>
      </button>
    </div>
    <div class="grid90 history-recent">${arcHistoryCells(first, 7, true)}</div>
    <div class="history-disclosure" id="today-history-full" aria-hidden="${!todayHistoryExpanded}" ${todayHistoryExpanded ? '' : 'inert'}>
      <div class="history-disclosure-inner">
        <div class="history-full-content">
          <div class="history-caption"><span>90-day history</span><span>Day ${dayNumber()} of 90</span></div>
          ${grid90()}
          <div class="arc-grid-legend"><span><i class="l3"></i>Complete</span><span><i class="l2"></i>Partial</span><span><i class="missed-key"></i>Missed</span><span>Rest: dashed</span></div>
        </div>
      </div>
    </div>
  </section>`;
}

function toggleTodayHistory() {
  const panel = document.querySelector('.today-history');
  const content = panel?.querySelector('.history-disclosure');
  const button = panel?.querySelector('[data-act="history-toggle"]');
  if (!content || !button) return;
  todayHistoryExpanded = !todayHistoryExpanded;
  panel.dataset.expanded = String(todayHistoryExpanded);
  button.setAttribute('aria-expanded', String(todayHistoryExpanded));
  button.querySelector('span').textContent = todayHistoryExpanded ? 'Less' : '90 days';
  content.setAttribute('aria-hidden', String(!todayHistoryExpanded));
  content.inert = !todayHistoryExpanded;
}

function viewToday() {
  if (appRoom) return appRoomView();
  const { scheduled, total, done, frac, pct: todayPct } = todayCompletion();
  const C = 364.425;
  const mom = momentum();
  const day = dayNumber();
  const weekTone = mom >= 70 ? 'Strong week' : mom >= 45 ? 'Gaining traction' : 'Needs a reset';
  const md = momentumDelta();
  const mdCls = md > 0 ? 'up' : md < 0 ? 'down' : 'flat';
  const mdTxt = md > 0 ? `▲ +${md} today` : md < 0 ? `▼ ${Math.abs(md)} today` : 'Even today';
  const modeLabel = { full: 'Full day', busy: 'Busy day', recovery: 'Recovery' }[adaptiveMode()];

  return `
    ${brandbar()}
    <header class="topbar today-header">
      <div>
        <h1>${greeting()}, ${esc(S.profile.name.split(' ')[0] || 'you')}</h1>
        <div class="sub">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div class="today-meta">
          <span class="day-chip">◔ Day ${day} of 90 · ${daysLeft()} left</span>
          <button class="day-mode-trigger" data-act="daymode-open" aria-label="Your day: ${modeLabel}. Change day mode" aria-haspopup="dialog" aria-expanded="${sheet?.type === 'daymode'}">
            <span>${modeLabel}</span><span class="day-mode-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </header>

    ${planningQuickAccess()}

    ${forgeActive() ? `<div class="forge-banner"><div>Forge Mode · Day ${forgeDay()} of 7 — minimum versions only on your focus habits. Show up small.</div></div>` : ''}

    <section class="card hero-card">
      <div class="hero-topline">
        <div class="hero-topline-label">
          <span class="eyebrow">Today’s arc</span>
          <small class="hero-goal-line">${esc(S.profile.goal || 'Choose your 90-day goal')}</small>
        </div>
        ${S.habits.length ? `<button class="hero-share" data-act="share-today" aria-label="Share today’s arc">↗</button>` : ''}
      </div>

      <div class="hero">
        <button class="ring-wrap hero-ring" data-act="today-habits-scroll" aria-label="Open today's habits — ${total ? `${done} of ${total} complete` : 'nothing due today'}">
          <svg viewBox="0 0 132 132" width="132" height="132">
            <circle class="ring-track" cx="66" cy="66" r="58" fill="none" stroke-width="12"/>
            <circle class="ring-fill" cx="66" cy="66" r="58" fill="none" stroke-width="12"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/>
            <circle class="arc-intro-trace" cx="66" cy="66" r="64" aria-hidden="true"
              stroke-dasharray="14 388.124" stroke-dashoffset="402.124"/>
          </svg>
          <div class="ring-center">
            <div class="big-num">${total ? `<span data-countup="${todayPct}" data-suffix="%">0</span>` : 'Rest'}</div>
            <div class="of">${total ? `${done}/${total} done` : 'Nothing due'}</div>
          </div>
        </button>
        <div class="hero-stats">
          <div class="approved-hero-metrics">
            <div>
              <span>Momentum</span>
              <strong><span data-countup="${mom}">0</span><small>%</small></strong>
              <small class="metric-context">${weekTone}</small>
            </div>
          </div>
          <div class="hstat-note"><span class="mom-delta ${mdCls}">${mdTxt}</span></div>
        </div>
      </div>
      ${adaptiveNextMovePanel(total, scheduled.length)}

    </section>

    ${adaptiveHabitsPanel()}
    ${todayTasksPanel()}
    ${todaySignalsPanel()}
  `;
}

const JOURNAL_PROMPTS = [
  'What am I tolerating right now that I have stopped noticing?',
  'Where in my life am I performing competence I do not feel?',
  'What would I do this year if no one would ever find out?',
  'Which of my current commitments would I not sign up for again today?',
  'What does my body know about my schedule that my plans are ignoring?',
  'Who am I still trying to prove something to?',
  'What is the story I tell about why I am busy?',
  'When did I last feel genuinely rested? What was different?',
  'What am I afraid people will think if I slow down?',
  'What is the difference between what I want and what I think I should want?',
  'What is one thing I am good at that I take no pride in?',
  'Where am I confusing motion with progress?',
  'What did I learn this week that I have not applied?',
  'What would the version of me who already has the license do differently today?',
  'What am I avoiding because it would require asking someone for something?',
  'What resentment am I carrying that is costing me more than the person it points at?',
  'What do I do when I am anxious, and does it work?',
  'Which relationship in my life gets my leftovers?',
  'What is a recent failure I have not actually processed, only moved past?',
  'What am I building, and who is it for?',
  'If I had to cut three commitments this month, which would I miss least?',
  'What is my earliest memory of being praised? How does that still drive me?',
  'What is the most honest sentence I could say about my finances?',
  'What would change if I assumed I had enough time?',
  'Where do I mistake being needed for being valued?',
  'What have I outgrown but not yet put down?',
  'What does a good day actually look like, in detail, hour by hour?',
  'What is the smallest change that would make the biggest difference?',
  'What am I pretending not to know?',
  'What do I want to carry into next month, and what am I ready to leave behind?',
];

function practicePrompt(date, start) {
  // Calendar dates use UTC arithmetic so daylight saving cannot shift the prompt.
  const elapsed = Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
  const index = Number.isFinite(elapsed) ? Math.max(0, elapsed) % JOURNAL_PROMPTS.length : 0;
  return JOURNAL_PROMPTS[index];
}

function dailyPracticePanel() {
  const date = practiceDate || todayKey();
  const entry = S.practices?.[date] || {};
  const prompt = typeof entry.prompt === 'string' ? entry.prompt : practicePrompt(date, S.profile.start || todayKey());
  const text = S.journal[date];
  return `<section class="daily-practice" aria-label="Daily practice">
    <div class="practice-heading"><h2>Writing</h2></div>
    ${dlog(date).intention ? `<p class="planning-legacy">Earlier intention: ${esc(dlog(date).intention)}</p>` : ''}
    <div class="practice-body">
        <label class="practice-prompt" for="practiceWriting">${esc(prompt)}</label>
        <p class="practice-hint">Three to eight sentences. Do not edit yourself.</p>
        <textarea id="practiceWriting" rows="5" maxlength="20000" data-practice-field="journal" data-date="${date}" data-prompt="${esc(prompt)}" placeholder="Start wherever you are.">${esc(typeof text === 'string' ? text : '')}</textarea>
    </div>
    <p class="practice-save" id="practiceSaveStatus" role="status">${practiceSaveFailed ? 'Not saved. Keep this page open and try typing again.' : 'Saved on this device as you write.'}</p>
  </section>`;
}

function meditationPanel() {
  const active = S.focus.active || S.focus.pendingCompletion;
  return `<section class="meditation-panel" aria-label="Meditation">
    <div><h2>Meditation</h2><p>A quiet moment. Breathe naturally.</p></div>
    ${active ? `<button class="btn btn-ghost" data-act="tab" data-id="focus">Open current session</button>` : `<div class="practice-minutes">${[2, 5, 10].map((m) => `<button class="btn btn-ghost" data-act="practice-meditate" data-minutes="${m}" aria-label="Meditate for ${m} minutes">${m} min</button>`).join('')}</div>`}
  </section>`;
}

function adaptiveMode() { return Arc90Adaptive.modeForDay(S.adaptive, todayKey()); }
function adaptiveTarget(h) { return Arc90Adaptive.targetForHabit(h, adaptiveMode(), S.adaptive.essentialIds); }

function historicalRateFor(k) {
  if (!S.habits.length) return undefined;
  const raw = S.log[k];
  if (!raw || !Array.isArray(raw.scheduledIds)) return undefined;
  const log = dlog(k);
  const skipped = new Set(log.skip.map(String));
  const scheduled = log.scheduledIds.filter((id) => !skipped.has(String(id)));
  if (!scheduled.length) return null;
  const completed = new Set([...log.done, ...log.min].map(String));
  return scheduled.filter((id) => completed.has(String(id))).length / scheduled.length;
}

function recentDifficultDays(limit = 3) {
  const today = atMidnight(operationalDate());
  const rates = [];
  for (let back = 1; back <= 7 && back < elapsedDays(); back++) {
    rates.push(historicalRateFor(dkey(addDays(today, -back))));
  }
  return Arc90Adaptive.countRecentDifficultDays(rates, limit);
}

function adaptiveRecommendation() {
  if (!S.habits.length) return Arc90Adaptive.recommendMode({});
  const current = vitality();
  const coreSignals = current.logged.filter((signal) => signal.key !== 'water').length;
  return Arc90Adaptive.recommendMode({
    readiness: current.score,
    readinessCount: current.count,
    coreSignals,
    recentMisses: recentDifficultDays(),
  });
}

function adaptiveNextMove() {
  const mode = adaptiveMode();
  const hour = new Date().getHours();
  const picks = daySupport().picks;
  const candidates = S.habits.filter((h) => scheduledFor(h, todayKey())).map((habit) => {
    const target = adaptiveTarget(habit);
    const timing = bestHabitWindow(habit);
    return {
      habit,
      target,
      timing,
      done: isCompleted(habit.id, todayKey()),
      skipped: statusOf(habit.id, todayKey()) === 'skip',
      optional: target.optional,
      picked: picks.includes(String(habit.id)),
      inWindow: !!timing && hour >= timing.startHour && hour < timing.endHour,
    };
  });
  return Arc90Adaptive.chooseNextMove(candidates, mode !== 'recovery');
}

function adaptiveNextMovePanel(total, scheduledTotal) {
  const next = adaptiveNextMove();
  if (!next) {
    const hasHabits = S.habits.length > 0;
    const needsEssential = adaptiveMode() === 'recovery' && scheduledTotal > 0 && total === 0;
    return `<section class="next-move ${total ? 'is-complete' : 'is-empty'}" aria-label="Next move">
      <span class="next-move-mark" aria-hidden="true">${total ? ICONS.check : '+'}</span>
      <div class="next-move-copy">
        <span class="eyebrow">Next move</span>
        <strong>${total ? 'Your Arc is protected' : needsEssential ? 'Choose today’s essential' : hasHabits ? 'Nothing is scheduled today' : 'Build your first Arc'}</strong>
        <small>${total ? 'Everything required today is complete.' : needsEssential ? 'Recovery needs one small promise to protect.' : hasHabits ? 'Your next scheduled rep will appear here.' : 'Choose up to eight habits to begin.'}</small>
      </div>
      ${needsEssential ? '<button class="next-move-action" data-act="daymode-open">Review day</button>' : hasHabits ? '' : '<button class="next-move-action" data-act="tab" data-id="habits">Choose habits</button>'}
    </section>`;
  }
  const focusable = ['learn', 'work', 'create', 'mind'].includes(next.habit.cat);
  const targetCopy = next.target.status === 'min' ? next.target.label : 'Full target';
  const contextCopy = next.timing
    ? `Best window ${windowHour(next.timing.startHour)}–${windowHour(next.timing.endHour)}`
    : ({ full: 'Ready when you are', busy: 'Busy-day target', recovery: 'Today’s essential' }[adaptiveMode()]);
  return `<section class="next-move" aria-label="Next move: ${esc(next.habit.name)}">
    <span class="next-move-mark" aria-hidden="true">${esc(next.habit.emoji || '○')}</span>
    <div class="next-move-copy">
      <span class="eyebrow">Next move</span>
      <strong>${esc(shortHabitName(next.habit.name))}</strong>
      ${next.target.status === 'min' ? `<small>${esc(targetCopy)}</small>` : ''}
      ${next.timing ? `<button class="next-move-window" data-act="adaptive-window" data-id="${esc(String(next.habit.id))}" aria-label="Open best window for ${esc(next.habit.name)}">${esc(contextCopy)}</button>` : ''}
    </div>
    <button class="next-move-action" data-act="${focusable ? 'ritual-open' : 'adaptive-check'}" data-id="${esc(String(next.habit.id))}" aria-label="${focusable ? `Start focus for ${esc(next.habit.name)}` : `Mark ${esc(next.habit.name)} complete`}">
      ${focusable ? ICONS.focus : '<span class="next-move-empty" aria-hidden="true"></span>'}<span>${focusable ? 'Start' : 'Complete'}</span>
    </button>
  </section>`;
}

function adaptiveDayPanel() {
  const mode = adaptiveMode();
  const recommendation = adaptiveRecommendation();
  const modeNames = { full: 'Full', busy: 'Busy', recovery: 'Recovery' };
  const due = S.habits.filter((h) => scheduledFor(h, todayKey()));
  const targets = mode === 'recovery' ? due.filter((h) => !adaptiveTarget(h).optional) : due;
  const kept = targets.filter((h) => isCompleted(h.id, todayKey())).length;
  const detail = mode === 'full' ? 'Your usual targets' : mode === 'busy' ? 'Reduced targets for today' : 'Your chosen essentials';
  return `<section class="adaptive-section" aria-label="Adaptive Day">
    <div class="adaptive-heading"><h2>Your day</h2><button class="mini-act" data-act="adaptive-essentials">Essentials</button></div>
    <div class="adaptive-modes" role="group" aria-label="Day mode">
      ${[['full', 'Full'], ['busy', 'Busy'], ['recovery', 'Recovery']].map(([id, label]) => `<button data-act="adaptive-mode" data-id="${id}" aria-pressed="${mode === id}">${label}${recommendation.mode === id ? '<small>Suggested</small>' : ''}</button>`).join('')}
    </div>
    <div class="adaptive-recommendation">
      <p>${esc(recommendation.reason)}</p>
      ${mode === recommendation.mode ? '' : `<button class="mini-act" data-act="adaptive-recommend" data-id="${recommendation.mode}">Use ${modeNames[recommendation.mode]}</button>`}
    </div>
    <p class="adaptive-summary" role="status">${detail} · ${kept}/${targets.length} ${mode === 'full' ? 'kept' : 'adapted targets kept'}</p>
    <div class="adaptive-support-grid">${daySupportPanels()}</div>
  </section>`;
}

function bestHabitWindow(h) {
  if (S.adaptive.dismissed[String(h.id)]) return null;
  const cutoff = dkey(addDays(atMidnight(operationalDate()), -41));
  const samples = Object.keys(S.log).filter((k) => k >= cutoff && k <= todayKey()).flatMap((date) => {
    const log = dlog(date);
    return isCompleted(h.id, date) && log.completedAt[h.id] && Number.isInteger(log.completionHours[h.id])
      ? [{ date, hour: log.completionHours[h.id] }] : [];
  });
  return Arc90Adaptive.bestWindow(samples);
}

function windowHour(hour) { return formatClockTime(`${String(hour % 24).padStart(2, '0')}:00`); }

const LIFE_AREAS = { health: 'Health', mind: 'Mind', career_school: 'Career / school', money: 'Money', build: 'Build', people: 'People', spirit: 'Spirit' };

function habitPurpose(habit) {
  const goals = S.brain?.goals || [];
  const seen = new Set();
  let goal = goals.find(item => item.id === habit.goal_id && item.status === 'active');
  const chain = [];
  while (goal && chain.length < 5 && !seen.has(goal.id)) {
    seen.add(goal.id);
    chain.push(goal);
    goal = goals.find(item => item.id === goal.parent_goal_id && item.status === 'active');
  }
  return chain;
}

function adaptiveHabitTile(h) {
  const target = adaptiveTarget(h);
  const status = statusOf(h.id, todayKey());
  const done = status === 'done' || status === 'min';
  const skipped = status === 'skip';
  const picked = daySupport().picks.includes(String(h.id));
  const category = picked ? "Today's pick" : (CATEGORIES.find((c) => c.id === h.cat) || {}).name || 'Personal';
  const sub = skipped ? 'Skipped' : status === 'min' ? 'Minimum kept' : status === 'done' ? 'Complete' : target.status === 'min' ? 'Minimum' : 'Today';
  const purpose = habitPurpose(h)[0];
  return `<div class="adaptive-habit-item">
    <button class="adaptive-check" data-act="${skipped ? 'task-sheet' : 'adaptive-check'}" data-id="${esc(String(h.id))}"${skipped ? '' : ` aria-pressed="${done}"`} aria-label="${esc(h.name)}, ${esc(sub)}${skipped ? '. Open options to restore' : ''}">
      <small class="adaptive-category">${esc(category)}</small>
      <strong class="adaptive-name">${esc(h.name)}</strong>
      ${purpose ? `<small class="adaptive-purpose" title="Supports ${esc(purpose.title)}">${esc(purpose.title)}</small>` : ''}
      ${skipped || status === 'min' || (!done && target.status === 'min') ? `<small class="adaptive-target">${esc(sub)}</small>` : ''}
      <span class="adaptive-state" aria-hidden="true">${done ? ICONS.check : skipped ? '−' : ''}</span>
    </button>
  </div>`;
}

function adaptiveHabitsPanel() {
  const skipped = S.habits.filter((h) => statusOf(h.id, todayKey()) === 'skip');
  const due = S.habits.filter((h) => statusOf(h.id, todayKey()) !== 'skip' && (scheduledFor(h, todayKey()) || isCompleted(h.id, todayKey())));
  const picks = daySupport().picks;
  due.sort((a, b) => Number(picks.includes(String(b.id))) - Number(picks.includes(String(a.id))));
  const essentials = due.filter((h) => !adaptiveTarget(h).optional);
  const optional = due.filter((h) => adaptiveTarget(h).optional);
  const rest = S.habits.filter((h) => !due.includes(h) && !skipped.includes(h));
  const grid = (habits) => `<div class="adaptive-habit-grid">${habits.map(adaptiveHabitTile).join('')}</div>`;
  const byGoal = (habits) => {
    if (typeof brainHabitGroups !== 'function') return grid(habits);
    const groups = brainHabitGroups().groups.map((g) => ({ ...g, ids: new Set(g.habits.map((h) => String(h.id))) }));
    const parts = groups.map((g) => ({ ...g, list: habits.filter((h) => g.ids.has(String(h.id))) })).filter((g) => g.list.length);
    if (!parts.length) return grid(habits);
    const other = habits.filter((h) => !parts.some((g) => g.ids.has(String(h.id))));
    const head = (title, list) => `<h3><i aria-hidden="true"></i><span>${esc(title)}</span><b>${list.filter((h) => isCompleted(h.id, todayKey())).length}/${list.length}</b></h3>`;
    return parts.map((g) => `<div class="today-goal" style="--tone:${g.tone}">${head(g.title, g.list)}${grid(g.list)}</div>`).join('')
      + (other.length ? `<div class="today-goal today-goal-none">${head('No goal yet', other)}${grid(other)}</div>` : '');
  };
  return `<section class="today-habits-section" aria-label="Today's habits">
    <div class="adaptive-heading"><h2>${adaptiveMode() === 'recovery' ? 'Essentials' : 'Your habits'}</h2><button class="mini-act" data-act="tab" data-id="habits">Edit</button></div>
    ${essentials.length ? byGoal(essentials) : `<p class="adaptive-summary">${S.habits.length ? (adaptiveMode() === 'recovery' ? 'No essentials due today.' : 'No habits due today.') : 'Choose your first habits to begin.'}</p>`}
    ${optional.length ? `<div class="adaptive-optional"><h3>Optional</h3>${grid(optional)}</div>` : ''}
    ${skipped.length ? `<details class="adaptive-optional"><summary>Skipped today · ${skipped.length}</summary>${grid(skipped)}</details>` : ''}
    ${rest.length ? `<details class="adaptive-optional"><summary>Not scheduled today · ${rest.length}</summary>${grid(rest)}</details>` : ''}
  </section>`;
}

function todaySignalsPanel() {
  const trackers = S.preferences.trackers || {};
  if (!trackers.water && !trackers.mood) return '';
  const water = healthDay().water;
  const goal = Math.max(1, Number(S.health.settings.waterGoal) || 8);
  const mood = dlog(todayKey()).mood;
  return `<div class="today-signals${trackers.water && trackers.mood ? '' : ' today-signals-single'}">
    ${trackers.water ? `<section aria-label="Water"><h2>Water</h2>
    <div class="water-stepper">
      <button data-act="water-sub" aria-label="Remove one glass of water" ${water <= 0 ? 'disabled' : ''}>−</button>
      <div class="water-reading" aria-live="polite" aria-atomic="true"><strong aria-label="${water} glasses"><span class="water-count-current">${water}</span></strong><small>/ ${goal} glasses</small></div>
      <button data-act="water-add" aria-label="Add one glass of water">+</button>
    </div><div class="water-progress" role="progressbar" aria-label="Daily water goal" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(water, goal)}" aria-valuetext="${water} of ${goal} glasses"><span style="--water-progress:${Math.min(1, water / goal)}"></span></div></section>` : ''}
    ${trackers.mood ? `<section aria-label="Mood"><h2>Mood</h2>${moodOptionChips(mood, 'today-mood')}</section>` : ''}
  </div>`;
}

function daySupport() { return Arc90DaySupport.forDay(S.daySupport, todayKey()); }
function pendingSupportHabits() {
  return S.habits.filter((h) => scheduledFor(h, todayKey()) && !statusOf(h.id, todayKey()));
}
function supportPlan() { return Arc90DaySupport.plan(pendingSupportHabits(), daySupport().capacity); }
function supportFocusHabit() {
  const pending = pendingSupportHabits();
  const essentials = adaptiveMode() === 'recovery' ? pending.filter((h) => !adaptiveTarget(h).optional) : [];
  const candidates = essentials.length ? essentials : pending;
  return candidates.find((h) => ['learn', 'work', 'create', 'mind'].includes(h.cat)) || candidates[0];
}
function daySupportPanels() {
  const support = daySupport();
  const labels = { time: 'Time', energy: 'Energy', distractions: 'Distracted', unsure: 'Unsure' };
  const pending = pendingSupportHabits().length;
  const action = { time: 'Try Busy mode', energy: 'Choose essentials', distractions: 'Start focus', unsure: 'One next step' };
  return `<section class="support-signal" aria-label="Capacity"><h2>Capacity</h2>
    ${support.capacity ? `<button class="support-answer" data-act="support-reset" data-id="capacity" aria-label="Change capacity, currently ${support.capacity} minutes">${support.capacity} min today <span aria-hidden="true">↺</span></button>
      <button class="support-action" data-act="support-plan">${support.picks.length ? 'Review picks' : 'See a small plan'}</button>`
      : `<div class="support-options" role="group" aria-label="Time available today">${[5, 15, 30, 60].map((minutes) => `<button data-act="support-capacity" data-id="${minutes}" aria-label="${minutes} minutes available">${minutes} min</button>`).join('')}</div>`}
    </section>
    <section class="support-signal" aria-label="Friction"><h2>Friction</h2>
    ${support.friction ? `<button class="support-answer" data-act="support-reset" data-id="friction" aria-label="Change friction, currently ${labels[support.friction]}">${labels[support.friction]} <span aria-hidden="true">↺</span></button>
      ${pending ? `<button class="support-action" data-act="support-help">${action[support.friction]}</button>` : '<p>Nothing left today.</p>'}`
      : `<div class="support-options" role="group" aria-label="What is making today harder">${Object.entries(labels).map(([id, label]) => `<button data-act="support-friction" data-id="${id}">${label}</button>`).join('')}</div>`}
    </section>`;
}

function sheetSupport() {
  if (sheet.kind === 'next') {
    const h = supportFocusHabit();
    return `<div class="ritual-sheet"><h2>One next step</h2>${h ? `<p>${esc(h.name)}</p><p>${esc(adaptiveTarget(h).label)}</p><button class="btn" data-act="support-pick" data-id="${esc(String(h.id))}">${adaptiveTarget(h).optional ? 'Pin this optional habit' : 'Bring this to the top'}</button>` : '<p>Nothing left today.</p>'}</div>`;
  }
  const plan = sheet.plan || supportPlan();
  return `<div class="ritual-sheet"><h2>Your ${daySupport().capacity || 0}-minute plan</h2>
    ${plan.items.length ? `<p>Small versions · ${plan.total} min estimated</p><ul class="support-plan-list">${plan.items.map((item) => `<li><span><strong>${esc(S.habits.find((h) => String(h.id) === item.id)?.name || item.label)}</strong><small>${esc(item.label)}</small></span><small>${item.estimated ? '~' : ''}${item.minutes} min</small></li>`).join('')}</ul>
    <p>Busy mode uses smaller targets. These picks move first; your other habits and past check-offs stay intact.</p><button class="btn" data-act="support-apply">Use Busy mode & these picks</button>`
    : `<p>${pendingSupportHabits().length ? 'No small targets fit this time budget. Choose another capacity or adjust a habit in your library.' : 'Nothing left today. Your time is yours.'}</p>`}
  </div>`;
}

function sheetAdaptive() {
  return `<div class="ritual-sheet"><h2>Your essentials</h2>
    <div class="essential-list">${S.habits.map((h) => `<label><input type="checkbox" name="essential" value="${esc(String(h.id))}" ${S.adaptive.essentialIds.includes(String(h.id)) ? 'checked' : ''}>${esc(h.name)}</label>`).join('')}</div>
    <button class="btn" data-act="adaptive-save">Save essentials</button>
    ${Object.keys(S.adaptive.dismissed).length ? '<button class="mini-act" data-act="adaptive-reset-hints">Show dismissed timing hints</button>' : ''}
  </div>`;
}

function sheetBestWindow() {
  const h = S.habits.find((item) => String(item.id) === String(sheet.id));
  const timing = h && bestHabitWindow(h);
  if (!timing) return '<h2>No timing pattern yet</h2>';
  return `<div class="ritual-sheet"><h2>Your best window</h2><p>${esc(h.name)}</p>
    <strong class="window-evidence">${windowHour(timing.startHour)} – ${windowHour(timing.endHour)}</strong>
    <p>${timing.days} of ${timing.totalDays} logged days fall in this window. A pattern in your check-offs, not a prediction.</p>
    <button class="btn" data-act="adaptive-remind" data-id="${esc(String(h.id))}">Daily reminder at ${windowHour(timing.startHour)}</button>
    <p class="adaptive-summary">Replaces your current app-wide reminder schedule. Delivery requires notification permission.</p>
    <button class="mini-act" data-act="adaptive-dismiss" data-id="${esc(String(h.id))}">Hide this suggestion</button></div>`;
}

function ritualClock(active) {
  const seconds = Math.max(0, Math.ceil(focusRemainingMs(active) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function ritualDock() {
  const active = S.focus.active;
  const pending = S.focus.pendingCompletion;
  if (sheet || tab === 'focus' || (!active && !pending)) return '';
  return `<aside class="ritual-dock" aria-label="Focus session">
    <button class="ritual-open" data-act="ritual-open"><span>${active ? 'Focusing' : 'Session finished'}</span><strong>${esc((active || pending).label)}</strong></button>
    ${active ? `<span class="ritual-clock">${ritualClock(active)}</span><button class="ritual-stop" data-act="ritual-stop" aria-label="End focus session" title="End session">×</button>` : '<button class="mini-act" data-act="ritual-open">Review</button>'}
  </aside>`;
}

function sheetRitual() {
  const active = S.focus.active;
  const pending = S.focus.pendingCompletion;
  if (active) return `<div class="ritual-sheet"><h2>${esc(active.label)}</h2><strong class="ritual-clock">${ritualClock(active)}</strong><button class="btn" data-act="ritual-stop">End session</button></div>`;
  if (pending) {
    const h = S.habits.find((item) => String(item.id) === pending.habitId);
    return `<div class="ritual-sheet"><h2>Time well spent</h2><p>${esc(pending.label)}</p>
      <p>${pending.status === 'min' ? 'Reduced target' : 'Full target'} · ${niceDate(pending.date)}</p><div class="ritual-finish">
      ${h && !isCompleted(h.id, pending.date) ? '<button class="btn" data-act="ritual-complete">Mark habit complete</button>' : ''}
      <button class="mini-act" data-act="ritual-dismiss">${h && isCompleted(h.id, pending.date) ? 'Done' : 'Not completed'}</button></div></div>`;
  }
  const h = S.habits.find((item) => String(item.id) === String(sheet.id));
  if (!h) return '<h2>Choose a habit to focus on</h2>';
  const target = adaptiveTarget(h);
  const suggested = Number(sheet.minutes) || Number((target.label.match(/(\d+)[\s-]*min/i) || [])[1]) || (target.status === 'min' ? 5 : 25);
  const native = focusNativeBridgeAvailable();
  return `<div class="ritual-sheet"><h2>Focus ritual</h2><p>${esc(target.label)}</p><div class="ritual-controls">
    <label for="ritualMinutes">Minutes</label><input id="ritualMinutes" type="number" min="1" max="180" step="1" value="${Math.min(180, Math.max(1, suggested))}">
    <label><input id="ritualShield" type="checkbox" ${native ? '' : 'disabled'}> Request app restrictions</label>
    ${native ? '' : '<p class="adaptive-summary">App restrictions are unavailable in this build. The timer still works.</p>'}
    </div><button class="btn" data-act="ritual-start" data-id="${esc(String(h.id))}">Start session</button></div>`;
}

function premiumLaunchCard() {
  if (hasPremiumAccess()) return '';
  const next = nextBestRep();
  const hook = next
    ? `Premium helps you rescue slips like ${next.emoji} ${next.name} before they become a lost week.`
    : 'Premium gives you the deeper dashboard, recovery mode, and exports once your daily rhythm is running.';
  return `
    <section class="premium-card premium-launch-card">
      <div class="launch-offer-copy">
        <div class="plan-kicker">Launch offer</div>
        <div class="pt">${PREMIUM_OFFER.name}</div>
        <div class="ps">${esc(hook)}</div>
      </div>
      <div class="launch-offer-action">
        <div class="launch-price"><b>${PREMIUM_OFFER.price}</b><span>${PREMIUM_OFFER.interval}</span></div>
        <button class="btn" data-act="paywall">${PREMIUM_OFFER.cta}</button>
      </div>
    </section>`;
}

function habitCheckTile(h) {
  const st = statusOf(h.id, todayKey());
  const done = st === 'done' || st === 'min';
  const off = !scheduledFor(h, todayKey()) && !done;
  const cls = st === 'done' ? 'done' : st === 'min' ? 'done min' : st === 'skip' ? 'skip' : off ? 'off' : '';
  return `
    <button class="habit-check-tile ${cls}" data-act="toggle" data-id="${h.id}" aria-pressed="${done}" aria-label="${esc(h.name)}">
      <span class="habit-check-emoji">${habitIcon(h)}</span>
      <span class="habit-check-name">${esc(shortHabitName(h.name))}</span>
      <span class="habit-check-state">${done ? '✓' : st === 'skip' ? '–' : '+'}</span>
    </button>`;
}

function shortHabitName(name) {
  return String(name || '').replace(/\s+—\s+.*/, '').replace(/\s+/g, ' ').trim();
}

/* ---------- Vitality: overall health from the day's self-reported signals ----------
   Complement to Momentum (what you DO); Vitality is how RESOURCED you are (sleep,
   energy, mood, water). Only logged signals count — weights re-normalize over them so
   the number is honest, never fabricated from missing data. Behavioral, not medical. */
function vitalitySignals(k = todayKey()) {
  const l = dlog(k);
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const sleepGoal = Math.max(4, Number(S.health.settings.sleepGoal) || 7);
  const waterGoal = Math.max(1, Number(S.health.settings.waterGoal) || 8);
  const sleepH = sleepDay(k).hours;
  const water = Number(S.health.water[k]) || 0;
  const energy = Number(l.energy) || 0;
  const moodOrd = l.mood ? ((MOOD_OPTIONS.find(([id]) => id === l.mood) || [])[2] || 0) : 0;

  // Sleep — foundation. Full credit in the goal→goal+1.5h band; ramps below, gentle
  // oversleep penalty above so "more" isn't scored as strictly better.
  let sleepScore = null, sleepVal = '';
  if (sleepH !== '' && sleepH != null) {
    const hrs = Number(sleepH);
    sleepScore = hrs >= sleepGoal
      ? clamp(hrs <= sleepGoal + 1.5 ? 100 : 100 - (hrs - (sleepGoal + 1.5)) * 12)
      : clamp((hrs / sleepGoal) * 100);
    sleepVal = `${hrs % 1 ? hrs.toFixed(1) : hrs}h`;
  }

  const stress = Number(l.stress) || 0;
  const focusQ = Number(l.focusQ) || 0;

  // Recovery — synced wearable data (RHR/HRV) vs your rolling 30-day baseline.
  // Below-baseline RHR and above-baseline HRV both read as "recovered".
  const baselineOf = (map) => {
    if (!map) return 0;
    const today = atMidnight(operationalDate());
    let sum = 0, n = 0;
    for (let i = 1; i <= 30; i++) {
      const v = Number(map[dkey(addDays(today, -i))]) || 0;
      if (v) { sum += v; n++; }
    }
    return n >= 3 ? sum / n : 0;
  };
  const rhrT = Number((S.health.rhr || {})[k]) || 0;
  const hrvT = Number((S.health.hrv || {})[k]) || 0;
  let recScore = null, recVal = '';
  if (rhrT || hrvT) {
    const rb = baselineOf(S.health.rhr), hb = baselineOf(S.health.hrv);
    const recParts = [];
    if (rhrT && rb) recParts.push(clamp(75 + (rb - rhrT) * 4));
    if (hrvT && hb) recParts.push(clamp(75 + (hrvT - hb) * 1.2));
    // First days (no baseline yet): a rough absolute read beats silence.
    if (!recParts.length && hrvT) recParts.push(hrvT >= 60 ? 80 : hrvT >= 40 ? 65 : 45);
    if (!recParts.length && rhrT) recParts.push(rhrT <= 55 ? 80 : rhrT <= 65 ? 65 : 45);
    recScore = Math.round(recParts.reduce((a, b) => a + b, 0) / recParts.length);
    recVal = hrvT ? `HRV ${hrvT}` : `RHR ${rhrT}`;
  }

  return [
    { key: 'recovery', label: 'Recovery', icon: '♥', weight: 0.14, logged: recScore !== null, score: recScore, value: recVal, act: 'data-act="tab" data-id="vitals"' },
    { key: 'sleep',  label: 'Sleep',  icon: '☾', weight: 0.28, logged: sleepScore !== null, score: sleepScore, value: sleepVal, act: 'data-act="tab" data-id="sleep"' },
    { key: 'energy', label: 'Energy', icon: '⚡', weight: 0.20, logged: !!energy, score: energy ? clamp(energy * 20) : null, value: energy ? `${energy}/5` : '', act: 'data-act="review"' },
    { key: 'mood',   label: 'Mood',   icon: '◕', weight: 0.16, logged: !!moodOrd, score: moodOrd ? clamp(moodOrd * 20) : null, value: moodOrd ? moodLabel(l.mood) : '', act: 'data-act="review"' },
    { key: 'stress', label: 'Stress', icon: '〜', weight: 0.14, logged: !!stress, score: stress ? clamp((6 - stress) * 20) : null, value: stress ? stressLabel(stress) : '', act: 'data-act="stop-scroll"' },
    { key: 'focus',  label: 'Focus',  icon: '◎', weight: 0.12, logged: !!focusQ, score: focusQ ? clamp(focusQ * 20) : null, value: focusQ ? focusQLabel(focusQ) : '', act: 'data-act="stop-scroll"' },
    { key: 'water',  label: 'Water',  icon: '💧', weight: 0.10, logged: water > 0, score: water > 0 ? clamp((water / waterGoal) * 100) : null, value: water > 0 ? `${water}/${waterGoal}` : '', act: 'data-act="water-add"' },
  ];
}

function vitality(k = todayKey()) {
  const parts = vitalitySignals(k);
  const logged = parts.filter((p) => p.logged);
  const wsum = logged.reduce((a, p) => a + p.weight, 0);
  const score = wsum ? Math.round(logged.reduce((a, p) => a + p.score * p.weight, 0) / wsum) : null;
  return { parts, logged, count: logged.length, total: parts.length, score };
}

function vitalityState(score) {
  if (score === null) return { label: 'Log your signals', cls: 'none' };
  if (score >= 80) return { label: 'Charged', cls: 'good' };
  if (score >= 60) return { label: 'Steady', cls: 'mid' };
  if (score >= 40) return { label: 'Running low', cls: 'warn' };
  return { label: 'Depleted', cls: 'low' };
}

function vitalityInsight(v) {
  if (v.score === null) return 'Log your signals — sleep, energy, mood, stress, focus, water — to see today’s readiness.';
  if (v.score >= 80) return 'Well-resourced. A strong day to push a hard rep while your reserve is high.';
  const weakest = v.logged.slice().sort((a, b) => a.score - b.score)[0];
  const tips = {
    sleep: 'Sleep is running the show today — an earlier wind-down tonight pays back tomorrow.',
    energy: 'Energy is low — protect the basics and take the minimum version of a hard rep.',
    mood: 'Mood is dipping — a short walk or one small win tends to lift it.',
    stress: 'Stress is elevated — one unhurried rep beats three rushed ones today.',
    focus: 'Focus is foggy — pick one habit, silence the rest, and take it slow.',
    water: 'You’re behind on water — one full glass now is the easiest point to reclaim.',
    recovery: 'Your body is below baseline — take the minimum versions today and bank recovery.',
  };
  if (weakest && weakest.score < 60) return tips[weakest.key];
  return 'Steady reserve. Keep the basics topped up and show up as planned.';
}

function vitalityCard() {
  const v = vitality();
  const st = vitalityState(v.score);
  const frac = v.score === null ? 0 : v.score / 100;
  const C = 326.73; // 2·π·52
  const sigs = v.parts.map((p) => {
    const pct = p.logged ? p.score : 0;
    return `
      <button class="vsig ${p.logged ? 'on' : 'off'}" ${p.act}>
        <span class="vsig-top"><i>${p.icon}</i><small>${p.label}</small></span>
        <span class="vsig-val">${p.logged ? esc(p.value) : 'Log'}</span>
        <span class="vsig-bar"><b style="width:${pct}%"></b></span>
      </button>`;
  }).join('');
  return `
    <section class="card vitality-card">
      <div class="card-head">
        <span class="eyebrow">Readiness · overall health</span>
        <span class="vitality-count">${v.count}/${v.total} signals</span>
      </div>
      <div class="vitality-main">
        <div class="ring-wrap vitality-ring">
          <svg viewBox="0 0 120 120" width="104" height="104">
            <circle class="ring-track" cx="60" cy="60" r="52" fill="none" stroke-width="11"/>
            <circle class="ring-fill" cx="60" cy="60" r="52" fill="none" stroke-width="11"
              stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"/>
          </svg>
          <div class="ring-center">
            <div class="big-num">${v.score === null ? '<span class="of">--</span>' : `<span data-countup="${v.score}">0</span>`}</div>
            <div class="of">Readiness</div>
          </div>
        </div>
        <div class="vitality-head">
          <span class="vitality-state ${st.cls}"><span class="dot"></span>${st.label}</span>
          <p class="vitality-insight">${esc(vitalityInsight(v))}</p>
        </div>
      </div>
      <div class="vitality-sigs">${sigs}</div>
    </section>`;
}

function todayStopCard() {
  const h = healthDay();
  const l = dlog(todayKey());
  const goal = Math.max(1, Number(S.health.settings.waterGoal) || 8);
  const waterPct = Math.min(100, Math.round((h.water / goal) * 100));
  const mood = l.mood ? moodLabel(l.mood) : 'Add mood';
  const energy = l.energy ? `${l.energy}/5 energy` : 'No energy yet';
  return `
    <section class="card today-stop-card">
      <div class="today-stop-head">
        <div>
          <span class="tip-tag" style="margin:0">Today’s stop</span>
          <h3>Daily check-in</h3>
        </div>
        <button class="mini-act" data-act="review">edit</button>
      </div>
      <div class="today-stop-grid">
        <div class="stop-tile water-count">
          <span>Glasses count</span>
          <b>${h.water}<em>/${goal}</em></b>
          <small>${h.water === 1 ? 'glass today' : 'glasses today'}</small>
          <div class="mini-progress"><i style="width:${waterPct}%"></i></div>
          <div class="health-actions compact">
            <button data-act="water-sub" aria-label="Remove one glass of water">−</button>
            <button data-act="water-add" aria-label="Add one glass of water">+</button>
          </div>
        </div>
        <div class="stop-tile mood-count">
          <span>Mood</span>
          <b>${esc(mood)}</b>
          ${moodOptionChips(l.mood, 'compact')}
          <div class="stop-energy">
            <span class="stop-energy-label">Energy${l.energy ? ` · ${esc(energyLabel(l.energy))}` : ''}</span>
            ${energyOptionChips(l.energy, 'compact energy-row five-up')}
          </div>
        </div>
        <div class="stop-tile mind-count">
          <span>Mind check</span>
          <div class="mind-scales">
            <div class="stop-energy">
              <span class="stop-energy-label">Stress${l.stress ? ` · ${esc(stressLabel(l.stress))}` : ''}</span>
              ${scaleOptionChips('stress-quick', l.stress, (n) => `Set stress to ${stressLabel(n)}`, 'compact energy-row five-up')}
            </div>
            <div class="stop-energy">
              <span class="stop-energy-label">Focus${l.focusQ ? ` · ${esc(focusQLabel(l.focusQ))}` : ''}</span>
              ${scaleOptionChips('focusq-quick', l.focusQ, (n) => `Set focus quality to ${focusQLabel(n)}`, 'compact energy-row five-up')}
            </div>
          </div>
          <small class="scale-hint">Stress: 1 calm → 5 maxed · Focus: 1 foggy → 5 locked in</small>
        </div>
        <div class="water-graph" aria-label="7 day water graph">
          ${waterGraphRows().map((r) => `<div class="water-day ${r.today ? 'today' : ''}"><i style="height:${Math.max(8, r.pct)}%"></i><span>${esc(r.label)}</span></div>`).join('')}
        </div>
      </div>
    </section>`;
}

function waterGraphRows(days = 7) {
  const today = atMidnight(operationalDate());
  const goal = Math.max(1, Number(S.health.settings.waterGoal) || 8);
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - (days - 1));
    const key = dkey(d);
    const value = Number(S.health.water[key]) || 0;
    return {
      key,
      value,
      pct: Math.min(100, Math.round((value / goal) * 100)),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      today: key === todayKey(),
    };
  });
}

function todayFocusStrip() {
  const stats = focusStats();
  const active = S.focus.active;
  const next = nextBestRep();
  return `
    <section class="today-focus-strip">
      <button class="focus-strip-main" data-act="${active ? 'tab' : 'focus-start'}" data-id="${active ? 'focus' : ''}" data-minutes="30" data-label="${esc(next ? next.name : 'Focus block')}">
        <span>${active ? 'Focus running' : 'Start focus'}</span>
        <b>${active ? esc(active.label) : (next ? esc(next.name) : '30-minute block')}</b>
      </button>
      <button class="focus-strip-edit" data-act="tab" data-id="focus">
        <span>${stats.blockedCount}</span>
        <small>targets</small>
      </button>
    </section>`;
}

function journeyCard() {
  const achievements = achievementList();
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const next = nextAchievement();
  const level = arcLevel();
  return `
    <section class="card journey-card">
      <div class="journey-top">
        <div>
          <div class="plan-kicker">Journey</div>
          <div class="journey-title">Level ${level} · ${unlocked}/${achievements.length} badges</div>
        </div>
        <button class="mini-act" data-act="tab" data-id="progress">view</button>
      </div>
      ${next ? `
        <div class="next-badge">
          <span class="badge-medal">${esc(next.icon)}</span>
          <div class="next-copy">
            <div class="next-meta">
              <b>${esc(next.title)}</b>
              <em>${next.pct}%</em>
            </div>
            <small>${esc(next.desc)}</small>
            <div class="mini-progress"><i style="width:${next.pct}%"></i></div>
          </div>
        </div>` : `
        <div class="next-badge complete">
          <span class="badge-medal">✓</span>
          <div><b>All badges unlocked</b><small>The arc is yours. Start the next 90 when ready.</small></div>
        </div>`}
    </section>`;
}

function winMomentCard() {
  const m = milestoneMoment();
  if (!m) return '';
  return `
    <section class="card moment-card">
      <div class="moment-orb">${m.day}</div>
      <div style="flex:1;min-width:0">
        <div class="moment-kicker">Win card ready</div>
        <div class="moment-title">${esc(m.title)}</div>
        <div class="moment-copy">${esc(m.body)}</div>
      </div>
      <button class="mini-act" data-act="share-card">export</button>
    </section>`;
}

function comebackCard() {
  const h = comebackSignal();
  if (!h) return '';
  return `
    <section class="card comeback-card">
      <div class="moment-orb">↗</div>
      <div>
        <div class="moment-kicker">Comeback</div>
        <div class="moment-title">${esc(h.name)} recovered today</div>
        <div class="moment-copy">This matters as much as a streak. You missed, returned, and kept the identity alive.</div>
      </div>
    </section>`;
}

function interventionCard() {
  const sig = straightMissHabit(3);
  if (!sig) return '';
  return `
    <section class="card intervention-card">
      <div class="tip-tag">Intervention · 3 straight misses</div>
      <div class="tip-title">${sig.habit.emoji} ${esc(sig.habit.name)}</div>
      <div class="tip-body">The system is asking for a smaller version. Make today a recovery vote: <b>${esc(sig.habit.min || '2-minute version')}</b>.</div>
      <div class="plan-actions">
        <button class="btn plan-btn" data-act="quick-min" data-id="${sig.habit.id}">Count minimum today</button>
        <button class="btn btn-ghost plan-btn" data-act="forge-start">Build reset</button>
      </div>
    </section>`;
}

function dailyPromptsCard() {
  const l = dlog(todayKey());
  return `
    <section class="card prompt-card">
      <div class="card-head">
        <span class="eyebrow">Daily prompts</span>
        <button class="mini-act" data-act="review">evening</button>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Morning intention</label>
        <input id="intentionText" type="text" maxlength="120" placeholder="One sentence for today…" value="${esc(l.intention)}"/>
      </div>
      <button class="btn btn-ghost" data-act="intention-save" style="padding:12px">${l.intention ? 'Update intention' : 'Save intention'}</button>
      <button class="review-strip" data-act="review" style="margin-top:11px">
        <span>Evening reflection</span>
        <b>${l.win ? 'Win logged' : 'Log win'}</b>
        <b>${l.mood ? moodLabel(l.mood) : 'Mood'}</b>
      </button>
    </section>`;
}


function miniMetricRing(label, pct, value) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `
    <div class="mini-ring" style="--p:${p}">
      <span>${esc(value)}</span>
      <small>${esc(label)}</small>
    </div>`;
}

function compactNumber(n) {
  const x = Number(n) || 0;
  return x >= 1000 ? `${Math.round(x / 100) / 10}k` : String(x);
}

function dayFlowBars() {
  const slots = Array.from({ length: 24 }, (_, i) => ({ h: i, cls: '' }));
  const habits = actionable(todayKey());
  habits.forEach((h, i) => {
    const slot = Math.min(23, 6 + (i * 3));
    const st = statusOf(h.id, todayKey());
    slots[slot].cls = st === 'done' ? 'done' : st === 'min' ? 'min' : 'miss';
  });
  return slots.map((s) => `<i class="${s.cls}" style="--h:${22 + ((s.h * 7) % 34)}px"></i>`).join('');
}

function latestWeightMeta() {
  const entries = Object.entries(S.health.weight || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return { value: '', unit: '', copy: 'Log manually or sync from HealthKit.' };
  const [k, value] = entries[entries.length - 1];
  const prev = entries[entries.length - 2];
  let copy = `Last logged ${niceDate(k)}.`;
  if (prev) {
    const delta = Number(value) - Number(prev[1]);
    if (Number.isFinite(delta) && delta !== 0) copy = `${delta > 0 ? '+' : ''}${delta.toFixed(1)} since previous log.`;
  }
  return { value, unit: 'kg', copy };
}

function dailyPlanCard(done, total) {
  const l = dlog(todayKey());
  const next = nextBestRep();
  const left = Math.max(0, total - done);
  const energy = l.energy ? `${energyLabel(l.energy)} · ${l.energy}/5` : 'Log energy';
  const mood = l.mood ? moodLabel(l.mood) : 'Log mood';
  if (!S.habits.length) {
    return `
      <section class="card plan-card">
        <div class="plan-kicker">Daily plan</div>
        <div class="plan-title">Build the system first</div>
        <div class="plan-copy">Pick up to 8 habits so Arc90 can start tracking your daily signal.</div>
        <button class="btn plan-btn" data-act="tab" data-id="habits">Choose habits</button>
      </section>`;
  }
  if (!next) {
    return `
      <section class="card plan-card complete">
        <div class="plan-kicker">Daily plan</div>
        <div class="plan-title">All reps are in</div>
        <div class="plan-copy">Capture what made today work while it is still fresh. That is the data future-you actually needs.</div>
        ${l.win ? `<div class="review-saved">Win: ${esc(l.win)}</div>` : ''}
        <div class="plan-actions one">
          <button class="btn plan-btn" data-act="review">Log reflection</button>
        </div>
      </section>`;
  }
  const strong = strongestHabit();
  const anchor = strong && String(strong.habit.id) !== String(next.id) ? strong.habit.name : 'a routine you already do';
  return `
    <section class="card plan-card">
      <div class="plan-head">
        <div>
          <div class="plan-kicker">Next best rep</div>
          <div class="plan-title">${next.emoji} ${esc(next.name)}</div>
        </div>
        <div class="left-pill">${left} left</div>
      </div>
      <div class="plan-copy">Do it after <b>${esc(anchor)}</b>. If the day is messy, count the minimum: <b>${esc(next.min || '2-minute version')}</b>.</div>
      <div class="plan-actions">
        <button class="btn plan-btn" data-act="toggle" data-id="${next.id}">Complete</button>
        <button class="btn btn-ghost plan-btn" data-act="quick-min" data-id="${next.id}">Minimum</button>
      </div>
      <button class="review-strip" data-act="review">
        <span>Today’s signal</span>
        <b>${esc(energy)}</b>
        <b>${esc(mood)}</b>
      </button>
    </section>`;
}

function quickPill(h) {
  const st = statusOf(h.id, todayKey());
  const on = st === 'done' || st === 'min';
  const off = !scheduledFor(h, todayKey()) && !on;
  const cls = st === 'done' ? 'done' : st === 'min' ? 'done min' : st === 'skip' ? 'skip' : off ? 'off' : '';
  return `<button class="qpill ${cls}" data-act="toggle" data-id="${h.id}" aria-label="${esc(h.name)}"><span class="qe">${habitIcon(h)}</span><span class="qn">${esc(h.name)}</span><span class="qc">${on ? ICONS.check : ''}</span></button>`;
}

function taskRow(h) {
  const st = statusOf(h.id, todayKey());
  const s = streak(h.id);
  const off = !scheduledFor(h, todayKey()) && st !== 'done' && st !== 'min';
  const cls = st === 'done' ? 'done' : st === 'min' ? 'done min' : st === 'skip' ? 'skipped' : off ? 'off' : '';
  const stateLab = st === 'min' ? 'minimum version ✓' : st === 'skip' ? 'rest day — excused' : off ? 'not scheduled today' : '';
  return `
    <div class="task-row ${cls}">
      <div class="task-main" data-act="toggle" data-id="${h.id}">
        <span class="task-check">${ICONS.check}</span>
        <span class="task-emoji">${habitIcon(h)}</span>
        <div style="flex:1;min-width:0">
          <div class="task-name">${esc(h.name)}</div>
          <div class="task-state">${stateLab || rhythmLabel(h, true)}</div>
        </div>
        <span class="task-streak">${s > 0 ? `✦ ${s}` : ''}</span>
      </div>
      <button class="task-more" data-act="task-sheet" data-id="${h.id}" aria-label="More options">⋯</button>
    </div>`;
}

/* glowing area chart — smooth catmull-rom curve, gradient fill, glowing end dot */
function chart(nDays) {
  const today = atMidnight(operationalDate());
  const start = startDate();
  const W = 320, H = 110, padX = 6, padTop = 14, padBot = 20;
  const innerW = W - padX * 2, innerH = H - padTop - padBot;
  const pts = [];
  for (let i = nDays - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const before = d < start;
    let r = before ? null : rateFor(dkey(d));
    if (r === null) r = before ? 0 : 0.5;          // rest/empty days sit mid-low, don't break the curve
    pts.push({ x: padX + innerW * ((nDays - 1 - i) / (nDays - 1)), y: padTop + innerH * (1 - r), lab: d.toLocaleDateString('en-US', { weekday: 'narrow' }) });
  }
  // smooth path via catmull-rom -> bezier
  const line = (p) => {
    let dStr = `M ${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      dStr += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return dStr;
  };
  const linePath = line(pts);
  const fillPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${H - padBot} L ${pts[0].x.toFixed(1)} ${H - padBot} Z`;
  const last = pts[pts.length - 1];
  const gridY = padTop + innerH * 0.5;
  const labels = pts.map((p) => `<text class="area-x" x="${p.x.toFixed(1)}" y="${H - 5}" text-anchor="middle">${p.lab}</text>`).join('');
  return `
    <svg class="area-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line class="area-grid" x1="${padX}" y1="${gridY}" x2="${W - padX}" y2="${gridY}"/>
      <path class="area-fill" d="${fillPath}"/>
      <path class="area-line area-anim" d="${linePath}" pathLength="1"/>
      <circle class="area-dot" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4.5"/>
      ${labels}
    </svg>`;
}

/* ============================================================
   HABITS
   ============================================================ */

/* Shared premium opener for tabs — same design language as the Today hero. */
function tabHeroCard(eyebrow, title, sub, stats) {
  return `
    <section class="card tab-hero">
      <span class="eyebrow">${eyebrow}</span>
      <div class="th-title">${title}</div>
      ${sub ? `<div class="th-sub">${sub}</div>` : ''}
      ${stats && stats.length ? `
      <div class="th-stats">
        ${stats.map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('')}
      </div>` : ''}
    </section>`;
}

function habitWeekRate(habits) {
  const ids = new Set(habits.map((h) => String(h.id)));
  const today = atMidnight(operationalDate());
  let due = 0, done = 0;
  for (let i = 0; i < 7; i++) {
    const k = dkey(addDays(today, -i));
    const a = actionable(k).filter((h) => ids.has(String(h.id)));
    due += a.length;
    done += a.filter((h) => isCompleted(h.id, k)).length;
  }
  return due ? Math.round((done / due) * 100) : null;
}

// One habit inside its goal group: the whole row opens the habit; unlinked habits get a
// small Link chip, or a one-tap suggestion when a goal clearly matches.
function habitGoalRow(h, unlinked) {
  const today = atMidnight(operationalDate());
  let dots = '', kept = 0, due = 0;
  for (let i = 6; i >= 0; i--) {
    const k = dkey(addDays(today, -i)), st = statusOf(h.id, k);
    if (st === 'done' || st === 'min') kept++;
    if (scheduledFor(h, k) || st === 'done' || st === 'min') due++;
    dots += `<i class="${st === 'done' ? 'on' : st === 'min' ? 'min' : ''}"></i>`;
  }
  const suggestion = unlinked && typeof brainSuggestGoal === 'function' ? brainSuggestGoal(h.name, brainLinkTargets('habit', h)) : null;
  return `<div class="hb-row">
      <button class="hb-open" data-act="rhythm-sheet" data-id="${h.id}" aria-label="${esc(h.name)}: ${kept} of ${due} this week. Open habit">
        <span class="lib-emoji" aria-hidden="true">${habitIcon(h)}</span>
        <span class="hb-copy"><b>${esc(h.name)}</b><small>${rhythmLabel(h)} · ${kept} of ${due} this week</small></span>
        <span class="hb-week" aria-hidden="true"><span class="dot7">${dots}</span><em>›</em></span>
      </button>
      ${unlinked && !suggestion ? `<button class="hb-link" data-brain-act="link-habit" data-id="${esc(h.id)}">Link to a goal</button>` : ''}
      ${suggestion ? `<button class="hb-suggest" data-brain-act="suggest-link" data-kind="habit" data-id="${esc(h.id)}" data-goal="${esc(suggestion.id)}"><span>Suggested</span><b>${esc(brainGoalLabel(suggestion.title))}</b><i>Link</i></button>` : ''}
    </div>`;
}

function habitGoalGroup(group, unlinked = false) {
  const rate = habitWeekRate(group.habits);
  const head = `<b>${esc(group.title)}</b><span>${group.habits.length} ${group.habits.length === 1 ? 'habit' : 'habits'}${rate === null ? '' : ` · ${rate}% this week`}</span>${rate === null ? '' : `<span class="hb-meter" aria-hidden="true"><i style="width:${rate}%"></i></span>`}`;
  return `<section class="hb-group${unlinked ? ' hb-group-none' : ''}" style="--tone:${group.tone}">
    ${unlinked ? `<header class="hb-group-head"><i aria-hidden="true"></i><div>${head}</div></header>` : `<button class="hb-group-head" data-brain-act="node" data-id="${esc(group.id)}" aria-label="${esc(group.title)}: open goal details"><i aria-hidden="true"></i><div>${head}</div><em aria-hidden="true">›</em></button>`}
    ${group.habits.map((h) => habitGoalRow(h, unlinked)).join('')}
  </section>`;
}

function viewHabits() {
  const { groups, unlinked } = typeof brainHabitGroups === 'function' ? brainHabitGroups() : { groups: [], unlinked: S.habits };
  const week = habitWeekRate(S.habits);
  let bestS = 0;
  S.habits.forEach((h) => { bestS = Math.max(bestS, streak(h.id)); });
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Habits</h1>
        <div class="sub">Every rep feeds a goal</div>
      </div>
      <button class="mini-act top-mini" data-act="habits-add-scroll">Add</button>
    </header>
    <div class="goal-shell habits-shell">
    ${S.habits.length ? `<dl class="hb-summary"><div><dd>${week === null ? '—' : week + '%'}</dd><dt>Kept this week</dt></div><div><dd>${bestS ? bestS + 'd' : '—'}</dd><dt>Best chain</dt></div><div><dd>${S.habits.length - unlinked.length}/${S.habits.length}</dd><dt>Linked to a goal</dt></div></dl>` : ''}
    ${groups.map((g) => habitGoalGroup(g)).join('')}
    ${unlinked.length ? habitGoalGroup({ title: 'No goal yet', tone: 'var(--flow-none)', habits: unlinked }, true) : ''}
    ${S.habits.length ? '' : '<div class="hb-empty"><b>No habits yet</b><p>Add one below. Small, daily, and linked to a goal works best.</p></div>'}
    <section class="hb-add" id="habitsAdd" aria-labelledby="habitsAddTitle">
      <header><h2 id="habitsAddTitle">Add a habit</h2><span>${S.habits.length}${hasPremiumAccess() ? '' : ` / ${FREE_HABITS}`}</span></header>
      ${hasPremiumAccess() ? '' : `<p class="limit-note">Base plan: ${FREE_HABITS} active habits · ${FREE_CUSTOM} custom. <b data-act="paywall" style="cursor:pointer">Premium unlocks unlimited</b></p>`}
      <div class="custom-form">
        <input id="customName" type="text" placeholder="e.g. Study 1 focused hour" maxlength="48" aria-label="New habit name"/>
        <button class="btn" data-act="add-custom" style="padding:0 20px">Add</button>
      </div>
      ${libraryPanel()}
      <details class="hb-templates"><summary>Start from a challenge template</summary>${challengeTemplatesPanel()}</details>
    </section>
    </div>
  `;
}

function libraryPanel() {
  const cat = libCat === 'all' ? `${CATEGORIES.filter((c) => c.id !== 'custom').length} categories` : (CATEGORIES.find((c) => c.id === libCat)?.name || 'Filtered');
  const query = libQuery.trim() ? ` · “${libQuery.trim()}”` : '';
  return `
    <section class="card library-card ${libraryOpen ? 'open' : ''}">
      <button class="library-toggle" data-act="library-toggle" aria-expanded="${libraryOpen ? 'true' : 'false'}">
        <span>
          <b>Library</b>
          <small>${HABIT_LIBRARY.length} habits · ${esc(cat)}${esc(query)}</small>
        </span>
        <i>${libraryOpen ? '−' : '+'}</i>
      </button>
      ${libraryOpen ? `
        <div class="library-body">
          <div class="search-bar">${ICONS.search}<input id="libSearch" type="search" placeholder="Search ${HABIT_LIBRARY.length} habits..." value="${esc(libQuery)}"/></div>
          <div class="cat-chips">
            <button class="chip ${libCat === 'all' ? 'on' : ''}" data-act="cat" data-id="all">All</button>
            ${CATEGORIES.filter((c) => c.id !== 'custom').map((c) => `<button class="chip ${libCat === c.id ? 'on' : ''}" data-act="cat" data-id="${c.id}">${c.emoji} ${c.name}</button>`).join('')}
          </div>
          <div id="libList">${libList()}</div>
        </div>` : ''}
    </section>`;
}

function challengeTemplatesPanel() {
  return `
    <section class="card templates-card minimal">
      <div class="card-head">
        <span class="eyebrow">Challenge templates</span>
      </div>
      <div class="template-grid minimal">
        ${CHALLENGE_TEMPLATES.map((t) => `
          <button class="template-tile" data-act="template-apply" data-id="${t.id}" title="${esc(t.desc)}">
            <span class="tt-emoji">${t.emoji}</span>
            <b>${esc(t.name)}</b>
          </button>`).join('')}
      </div>
    </section>`;
}

// The library, organized by category. "All" shows a short preview of each category with a
// link to the full list; a chosen category or a search shows every match, still grouped.
function libList() {
  const q = libQuery.trim().toLowerCase();
  const items = HABIT_LIBRARY.filter((h) =>
    (libCat === 'all' || h.cat === libCat) &&
    (!q || h.name.toLowerCase().includes(q) || h.min.toLowerCase().includes(q) || catOf(h.cat).name.toLowerCase().includes(q))
  );
  if (!items.length) return '<div class="empty-note">No matches — create it yourself above.</div>';
  const preview = libCat === 'all' && !q;
  const row = (h) => {
    const added = S.habits.some((x) => x.id === h.id);
    return `<button class="lrow${added ? ' added' : ''}" data-act="lib-toggle" data-id="${h.id}" aria-pressed="${added}" aria-label="${added ? 'Remove' : 'Add'} ${esc(h.name)}">
        <span class="lrow-icon" aria-hidden="true">${esc(h.emoji || '')}</span>
        <span class="lrow-copy"><b>${esc(h.name)}</b><small>Min: ${esc(h.min)}</small></span>
        <span class="lrow-add" aria-hidden="true">${added ? '✓' : '+'}</span>
      </button>`;
  };
  return `<div class="lib-groups">${CATEGORIES.filter((c) => c.id !== 'custom').map((c) => {
    const list = items.filter((h) => h.cat === c.id);
    if (!list.length) return '';
    const total = HABIT_LIBRARY.filter((h) => h.cat === c.id).length;
    const mine = HABIT_LIBRARY.filter((h) => h.cat === c.id && S.habits.some((x) => x.id === h.id)).length;
    const shown = preview ? list.slice(0, 4) : list;
    return `<section class="lib-group" aria-label="${esc(c.name)}">
      <header><span aria-hidden="true">${c.emoji}</span><h3>${esc(c.name)}</h3><small>${q ? `${list.length} ${list.length === 1 ? 'match' : 'matches'}` : `${total} habits${mine ? ` · ${mine} added` : ''}`}</small></header>
      ${shown.map(row).join('')}
      ${preview && list.length > shown.length ? `<button class="lib-more" data-act="cat" data-id="${c.id}">See all ${list.length} in ${esc(c.name)}</button>` : ''}
    </section>`;
  }).join('')}</div>`;
}

// The goal this 90-day arc is about. Everything new links here by default.
function activeArcGoal() {
  const goal = (S.brain?.goals || []).find((g) => g.id === S.profile.arcGoalId);
  return goal && goal.status === 'active' && goal.horizon === 'mid' ? goal : null;
}
function arcGoalLink() { return activeArcGoal()?.id || null; }

// Goal model v2 (one-time): older onboarding saved the 90-day goal as a parentless
// 'short' goal, which could never roll up to a vision or take tasks. Relabel it 'mid'
// and remember it as the active arc goal. A parentless short goal has no children, so
// nothing can break; a backup of the previous data is kept first.
function migrateGoalModelV2() {
  if (S.product.goalModelV2 || !S.onboarded) return;
  try {
    const title = (S.profile.goal || '').trim().toLowerCase();
    const goals = S.brain.goals.filter((g) => g.status === 'active');
    let goal = goals.find((g) => g.id === S.profile.arcGoalId);
    if (!goal && title) goal = goals.find((g) => g.horizon === 'mid' && g.title.trim().toLowerCase() === title);
    const legacy = !goal && title && goals.find((g) => g.horizon === 'short' && !g.parent_goal_id && g.title.trim().toLowerCase() === title);
    if (legacy && !S.brain.goals.some((g) => g.parent_goal_id === legacy.id)) {
      try { localStorage.setItem(KEY + '.pre-goalv2', JSON.stringify(S)); } catch {}
      legacy.horizon = 'mid';
      S.brain.dirty = true;
      goal = legacy;
    }
    if (goal && goal.horizon === 'mid') S.profile.arcGoalId = goal.id;
  } catch (error) { console.warn('Goal model update skipped', error); }
  S.product.goalModelV2 = true;
  save();
}

function addHabit(libId) {
  const h = HABIT_LIBRARY.find((x) => x.id === libId);
  if (!h || S.habits.some((x) => x.id === h.id)) return true;
  if (!hasPremiumAccess() && S.habits.length >= FREE_HABITS) return gate('habit-limit') && addHabit(libId);
  S.habits.push({ id: h.id, emoji: h.emoji, name: h.name, cat: h.cat, min: h.min, rhythm: 'daily', goal_id: arcGoalLink() });
  save();
  return true;
}
function removeHabit(id) {
  S.habits = S.habits.filter((h) => String(h.id) !== String(id));
  save();
}
function addCustom(name) {
  const n = name.trim();
  if (!n) return true;
  if (!hasPremiumAccess() && S.habits.length >= FREE_HABITS) return gate('habit-limit');
  if (!hasPremiumAccess() && customCount() >= FREE_CUSTOM) return gate('custom-limit');
  S.customSeq++;
  S.habits.push({ id: 'c' + S.customSeq, emoji: '✨', name: n, cat: 'custom', min: '2-minute version', rhythm: 'daily', goal_id: arcGoalLink() });
  save();
  return true;
}

function applyTemplate(id) {
  const tpl = CHALLENGE_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return;
  let added = 0;
  for (const habitId of tpl.habits) {
    if (S.habits.some((h) => h.id === habitId)) continue;
    if (!hasPremiumAccess() && S.habits.length >= FREE_HABITS) break;
    if (addHabit(habitId)) added++;
  }
  if (!S.profile.goal) S.profile.goal = tpl.goal;
  save();
  showNudge(added ? `${tpl.name} added ${added} habit${added === 1 ? '' : 's'}.` : `${tpl.name} is already covered, or you hit the free habit limit.`);
}

function requestHealthSync() {
  S.product.nativeBridge = true;
  save();
  const message = { type: 'health-sync-request', date: todayKey(), stepGoal: S.health.settings.stepGoal };
  try {
    const cap = window.Capacitor;
    let plugin = cap && cap.Plugins && cap.Plugins.Arc90Health;
    // Instance-registered native plugins may not be in the Plugins proxy on
    // older runtimes — registerPlugin by name is the reliable lookup.
    if ((!plugin || !plugin.sync) && cap && typeof cap.registerPlugin === 'function') {
      try { plugin = cap.registerPlugin('Arc90Health'); } catch (e) { /* keep null */ }
    }
    if (plugin && plugin.sync) {
      showNudge('Reading Apple Health…');
      plugin.sync(message)
        .then(applyNativeHealthSync)
        .catch((e) => showNudge('Health sync failed: ' + ((e && e.message) || e || 'unknown error')));
      return;
    }
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      showNudge('Bridge is up but Arc90Health is missing. Plugins: ' + Object.keys((cap.Plugins) || {}).join(', ').slice(0, 140));
      return;
    }
  } catch (e) {
    showNudge('Health bridge error: ' + ((e && e.message) || e));
    return;
  }
  showNudge('HealthKit sync works in the native iPhone app. This web layer is ready.');
}

function safeStripeCheckout() {
  if (previewAccessActive()) { showNudge('Preview access is active. No purchase is needed.'); return; }
  track('checkout_clicked');
  showNudge('Opening secure Stripe Checkout...');
  fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'arc90-pwa' })
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Checkout is not ready yet.');
      if (!data.url) throw new Error('Stripe did not return a Checkout URL.');
      window.location.href = data.url;
    })
    .catch((err) => {
      showNudge(err.message || 'Checkout backend is ready, but Stripe is not configured yet.');
    });
}

function consumeCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('checkout');
  if (!status) return '';

  const sessionId = params.get('session_id') || '';
  params.delete('checkout');
  params.delete('session_id');
  const nextSearch = params.toString();
  const cleanUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
  window.history.replaceState({}, '', cleanUrl);

  if (status === 'canceled') return 'Checkout canceled. You can keep using Arc90 Free.';
  if (status === 'success') {
    if (sessionId) { verifyPremiumSession(sessionId); return 'Verifying your purchase…'; }
    return 'Finishing checkout — if Premium doesn’t unlock, reopen the link from your Stripe receipt.';
  }
  return '';
}

/* Server-verified premium: only unlock after Stripe confirms the session was actually paid. */
function verifyPremiumSession(sessionId) {
  fetch(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`)
    .then((r) => r.json())
    .then((d) => {
      if (d && d.paid) {
        S.premium = true;
        if (d.email) S.billingEmail = d.email;
        save();
        track('premium_activated');
        render();
        confetti();
        showNudge('Premium is active. Welcome to the full Arc90.');
      } else {
        showNudge('We couldn’t confirm that purchase yet. If you were charged, reopen your receipt link or contact support.');
      }
    })
    .catch(() => showNudge('Could not verify your purchase — check your connection and reopen the receipt link.'));
}

/* ---------- Email capture (opt-in; sending deferred) ---------- */
function emailCaptureCard() {
  if (S.subscribed) {
    return `
      <section class="card subscribe-card done">
        <div class="sub-done"><span class="sub-check" aria-hidden="true">✓</span>
          <div><b>You’re on the list</b><span>We’ll only email when there’s something worth your time.</span></div>
        </div>
      </section>`;
  }
  return `
    <section class="card subscribe-card">
      <span class="eyebrow">Stay in the loop</span>
      <h3 class="sub-title">Get launch updates</h3>
      <p class="sub-copy">New features and the occasional note on building your 90. No spam — leave anytime.</p>
      <label class="sub-label" for="subEmail">Email</label>
      <input id="subEmail" class="sub-input" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" aria-describedby="subStatus" />
      <label class="sub-consent">
        <input id="subConsent" type="checkbox" />
        <span>Yes, email me ARC90 updates. I can withdraw consent by emailing <a href="mailto:michael28gh@gmail.com">the developer</a>.</span>
      </label>
      <button class="btn sub-btn" data-act="subscribe">Keep me posted</button>
      <div id="subStatus" class="sub-status" role="status" aria-live="polite"></div>
    </section>`;
}

function submitSubscribe() {
  const emailEl = document.getElementById('subEmail');
  const consentEl = document.getElementById('subConsent');
  const statusEl = document.getElementById('subStatus');
  const btn = document.querySelector('[data-act="subscribe"]');
  if (!emailEl || !consentEl) return;
  const email = emailEl.value.trim().toLowerCase();
  const setStatus = (msg, cls) => { if (statusEl) { statusEl.textContent = msg; statusEl.className = `sub-status ${cls || ''}`; } };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setStatus('Enter a valid email address.', 'err'); emailEl.focus(); return; }
  if (!consentEl.checked) { setStatus('Check the box to confirm you want updates.', 'err'); consentEl.focus(); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  setStatus('', '');
  fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, consent: true, source: 'app' }) })
    .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
      if (ok && d && d.ok) { S.subscribed = true; save(); track('subscribed'); render(); showNudge('You’re on the list. Thanks for backing ARC90.'); }
      else { setStatus('Could not save your subscription. Please try again later.', 'err'); if (btn) { btn.disabled = false; btn.textContent = 'Keep me posted'; } }
    })
    .catch(() => { setStatus('Network error. Please try again.', 'err'); if (btn) { btn.disabled = false; btn.textContent = 'Keep me posted'; } });
}

/* ============================================================
   FOCUS
   ============================================================ */

function focusDurations(mode = adaptiveMode()) {
  return ({ full: [25, 45, 60], busy: [15, 25, 45], recovery: [5, 15, 25] })[mode] || [25, 45, 60];
}

function selectedFocusMinutes() {
  const mode = adaptiveMode();
  const durations = focusDurations(mode);
  return focusLength.mode === mode && durations.includes(focusLength.minutes) ? focusLength.minutes : durations[0];
}

function focusDurationOption(minutes, selected) {
  return `
    <button class="focus-duration" data-act="focus-duration-select" data-minutes="${minutes}" aria-pressed="${minutes === selected}" aria-label="${minutes} minutes">
      ${minutes}<span> min</span>
    </button>`;
}

function focusPlanRow(plan) {
  return `
    <div class="focus-plan-row">
      <div>
        <b>${esc(plan.name)}</b>
        <small>${focusDaysLabel(plan.days)} · ${formatClockTime(plan.start)}-${formatClockTime(plan.end)} · ${plan.strict ? 'hard shield' : 'soft shield'}</small>
      </div>
      <button class="mini-act" data-act="focus-plan-del" data-id="${plan.id}">remove</button>
    </div>`;
}

function focusRecentRow(session) {
  return `
    <div class="focus-recent-row">
      <div>
        <b>${esc(session.label)}</b>
        <small>${niceDate(session.date)} · ${formatFocusMinutes(session.actualMinutes)} kept${session.unlocks ? ` · ${session.unlocks} unlock${session.unlocks === 1 ? '' : 's'}` : ''}</small>
      </div>
      <span>${session.status === 'completed' ? 'kept' : 'ended'}</span>
    </div>`;
}

function focusProgress(active) {
  if (!active) return 0;
  const total = Math.max(1, Number(active.minutes) || 1) * 60000;
  return Math.max(0, Math.min(1, 1 - (focusRemainingMs(active) / total)));
}

function focusWeekPanel(stats) {
  const keys = recentKeys(7);
  const values = keys.map((key) => focusMinutesForDay(key));
  const max = Math.max(30, ...values);
  const bars = keys.map((key, index) => {
    const minutes = values[index];
    const day = new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
    const height = minutes ? Math.max(4, Math.round((minutes / max) * 100)) : 0;
    return `<span class="focus-week-day ${key === todayKey() ? 'today' : ''} ${minutes ? 'has-session' : ''}" title="${esc(day)}: ${formatFocusMinutes(minutes)}">
      <b>${minutes ? formatFocusMinutes(minutes) : '\u2013'}</b>
      <span class="focus-week-track"><i style="--focus-bar:${height}%"></i></span><small>${esc(day)}</small>
    </span>`;
  }).join('');
  return `
    <section class="focus-week-section" aria-label="Focus over the last seven days">
      <div class="focus-section-head">
        <div><h2>Your focus rhythm</h2><span class="focus-week-caption">Last 7 days</span></div>
        <div class="focus-week-total"><strong>${formatFocusMinutes(stats.weekMinutes)}</strong><span>${stats.consistency} active ${stats.consistency === 1 ? 'day' : 'days'}</span></div>
      </div>
      <div class="focus-week-bars" role="img" aria-label="${stats.weekMinutes ? `${formatFocusMinutes(stats.weekMinutes)} focused across ${stats.consistency} of the last 7 days` : 'No focus sessions logged in the last 7 days'}">${bars}</div>
    </section>`;
}

function focusProtectionPanel(stats, nativeReady) {
  const targets = stats.blockedCount;
  const cleanup = S.focus.pendingNativeStop;
  const state = cleanup
    ? (cleanup.status === 'requested' ? 'Turning off' : 'Needs attention')
    : nativeReady ? (targets ? `${targets} selected` : 'Set up') : 'Screen Time off';
  return `
    <section class="focus-protection-section">
      <button class="focus-protection-toggle" data-act="focus-settings-toggle" aria-expanded="${focusSettingsOpen}" aria-controls="focus-protection-details">
        <span class="focus-protection-icon" aria-hidden="true">${ICONS.focus}</span>
        <span><strong>Distractions</strong><small>${targets ? `${targets} selected` : 'Apps & websites'}</small></span>
        <em>${state}</em><i aria-hidden="true">›</i>
      </button>
      ${focusSettingsOpen ? `<div class="focus-protection-details" id="focus-protection-details">
        <div class="focus-native-status ${nativeReady ? 'ready' : ''}">
          <i aria-hidden="true"></i>
          <div><b>${nativeReady ? 'Screen Time connection detected' : 'Timer mode is active'}</b><span>${nativeReady ? 'Protection starts only after your iPhone confirms it.' : 'The timer works now. App blocking will appear after Apple Screen Time access is enabled.'}</span></div>
        </div>
        ${cleanup ? `<div class="focus-native-status warning">
          <i aria-hidden="true"></i>
          <div><b>${cleanup.status === 'requested' ? 'Turning previous protection off' : 'Protection cleanup needs attention'}</b><span>${cleanup.status === 'requested' ? 'Waiting for your iPhone to confirm.' : nativeReady ? 'Retry so Screen Time can confirm it is off.' : 'Open iPhone Screen Time settings to confirm protection is off.'}</span></div>
          ${cleanup.status === 'failed' && nativeReady ? '<button class="mini-act" data-act="focus-native-stop-retry">Retry</button>' : ''}
        </div>` : ''}

        <div class="focus-detail-head"><span>Distractions</span><small>${targets ? `${targets} selected` : 'Choose two or three'}</small></div>
        ${focusTargetSummary()}
        <div class="focus-chip-row">
          ${FOCUS_APP_SUGGESTIONS.slice(0, 4).map((name) => {
            const selected = S.focus.apps.some((a) => focusEntryKey('apps', a) === focusEntryKey('apps', name));
            return `<button class="chip ${selected ? 'on' : ''}" data-act="focus-app-toggle" data-id="${esc(name)}" aria-pressed="${selected}" aria-label="${selected ? 'Remove' : 'Add'} ${esc(name)} ${selected ? 'from' : 'to'} protection">${esc(name)}</button>`;
          }).join('')}
        </div>
        <div class="focus-add-compact">
          <input id="focusAppInput" type="text" maxlength="28" placeholder="Add app" aria-label="Add an app to focus protection"/>
          <button class="btn btn-ghost" data-act="focus-app-add">Add</button>
          <input id="focusSiteInput" type="text" maxlength="48" placeholder="Add website" aria-label="Add a website to focus protection"/>
          <button class="btn btn-ghost" data-act="focus-site-add">Add</button>
        </div>
        ${focusAllDayCard(nativeReady)}
      </div>` : ''}
    </section>`;
}

function viewFocus() {
  if (!hasToolAccess('focus')) return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Focus</h1>
        <div class="sub">One clean block. Fewer exits. More attention for the rep that matters.</div>
      </div>
    </header>
    ${premiumTabLock('focus', '🎯', ['Focus timer with live session tracking', 'Focus Shield — block distracting apps', 'All-day lock for deep-work days', 'Unlimited focus targets'])}
  `;
  const stats = focusStats();
  const active = S.focus.active;
  const pending = S.focus.pendingCompletion;
  const next = nextFocusRep();
  const nativeReady = focusNativeBridgeAvailable();
  const mode = adaptiveMode();
  const durations = focusDurations(mode);
  const minutes = selectedFocusMinutes();
  const target = next ? adaptiveTarget(next) : null;
  const timing = next ? bestHabitWindow(next) : null;
  const focusLabel = next ? next.name : (S.profile.goal || 'Open focus');
  const targetLine = target
    ? (shortHabitName(target.label).toLowerCase() === shortHabitName(focusLabel).toLowerCase() ? (target.status === 'min' ? 'Minimum target' : 'Full target') : target.label)
    : 'A little space for what matters.';
  const windowLine = timing ? `Your best window: ${windowHour(timing.startHour)}-${windowHour(timing.endHour)}` : ({ full: 'One thing. Your full attention.', busy: 'A small block in a busy day.', recovery: 'A gentler pace for today.' })[mode];
  const angle = active ? Math.round(focusProgress(active) * 360) : 360;
  const protectionStatus = active?.protection?.status || 'off';
  const protectionLabel = protectionStatus === 'active' ? 'Shield on' : protectionStatus === 'requested' ? 'Shield pending' : 'Timer on';
  const protectionCopy = protectionStatus === 'active'
    ? 'Your iPhone confirmed distraction protection.'
    : protectionStatus === 'requested'
      ? 'Waiting for your iPhone to confirm protection.'
      : 'Stay with the block. The timer will keep your place.';
  const pendingHabit = pending && S.habits.find((habit) => String(habit.id) === pending.habitId);
  const canComplete = pendingHabit && !isCompleted(pendingHabit.id, pending.date);
  return `
    <div class="focus-page">
    ${brandbar()}
    <header class="topbar focus-header">
      <div>
        <h1>Focus</h1>
        <div class="sub">${esc(windowLine)}</div>
      </div>
      <div class="focus-today-total"><span>Today</span><strong>${formatFocusMinutes(stats.todayMinutes)}</strong></div>
    </header>

    <section class="focus-stage ${active ? 'is-active' : pending ? 'is-complete' : ''}" aria-label="${active ? 'Active focus session' : pending ? 'Review completed focus session' : 'Start a focus session'}">
      <div class="focus-intention">
        <span>${active ? 'In your zone' : pending ? 'Time well spent' : 'Make time for'}</span>
        <h2>${esc(shortHabitName((active || pending)?.label || focusLabel))}</h2>
      </div>
      <div class="focus-session-ring" ${active ? 'data-focus-progress' : ''} style="--focus-angle:${angle}deg">
        <div class="focus-dial-face">
          <span class="focus-dial-icon" aria-hidden="true">${pending && !active ? ICONS.check : ICONS.focus}</span>
          ${pending && !active ? '<strong class="focus-dial-done">Complete</strong>' : `<strong class="${active ? 'ritual-clock' : 'focus-dial-time'}">${active ? ritualClock(active) : `${minutes}:00`}</strong>`}
          <small>${active ? 'remaining' : pending ? 'You made the time.' : 'minutes of focus'}</small>
        </div>
      </div>
      ${active ? `
        <p class="focus-session-state" title="${esc(protectionCopy)}"><i aria-hidden="true"></i>${protectionLabel}</p>
        <div class="focus-session-actions">
          <button class="btn focus-begin" data-act="focus-end">End session</button>
          <button class="focus-adjust" data-act="focus-unlock">Log distraction</button>
        </div>
      ` : pending ? `
        <p class="focus-complete-note">${pending.status === 'min' ? 'Reduced target' : 'Full target'} &middot; ${niceDate(pending.date)}</p>
        ${canComplete ? '<button class="btn focus-begin" data-act="ritual-complete">Mark habit complete</button>' : ''}
        <button class="${canComplete ? 'focus-adjust' : 'btn focus-begin'}" data-act="ritual-dismiss">${canComplete ? 'Not completed yet' : 'Done'}</button>
      ` : `
        <div class="focus-duration-grid" role="group" aria-label="Focus session length">
          ${durations.map((value) => focusDurationOption(value, minutes)).join('')}
        </div>
        <button class="btn focus-begin" data-act="focus-start" data-minutes="${minutes}" data-label="${esc(focusLabel)}" data-strict="1"${next ? ` data-habit-id="${esc(String(next.id))}" data-target-status="${target.status}"` : ''}>Begin focus <span aria-hidden="true">&rarr;</span></button>
        ${next ? `<button class="focus-adjust" data-act="ritual-open" data-id="${esc(String(next.id))}" data-minutes="${minutes}" title="${esc(targetLine)}">Adjust session <span aria-hidden="true">&rsaquo;</span></button>` : ''}
      `}
    </section>

    ${active || pending ? '' : meditationPanel()}
    ${focusWeekPanel(stats)}
    ${focusProtectionPanel(stats, nativeReady)}
    </div>
  `;
}

function focusTargetSummary() {
  const targets = [
    ...S.focus.apps.map((value) => ({ kind: 'app', value })),
    ...S.focus.sites.map((value) => ({ kind: 'site', value })),
  ];
  if (!targets.length) {
    return '<p class="focus-empty-hint">Pick the places you open without thinking.</p>';
  }
  const hidden = Math.max(0, targets.length - 8);
  return `
    <div class="focus-target-grid">
      ${targets.slice(0, 8).map((t) => `
        <button class="focus-target-chip" data-act="focus-${t.kind === 'app' ? 'app' : 'site'}-toggle" data-id="${esc(t.value)}" aria-label="Remove ${esc(t.value)} from protection">
          <span aria-hidden="true">${t.kind === 'app' ? 'app' : 'web'}</span>
          <b>${esc(t.value)}</b>
        </button>`).join('')}
      ${hidden ? `<div class="focus-target-chip more"><span>more</span><b>+${hidden}</b></div>` : ''}
    </div>`;
}

/* All-day lock: one persistent, day-scoped shield slot for every focus target. */
function allDayLockActive() {
  const l = S.focus && S.focus.allDayLock;
  return !!(l && l.on && l.confirmed === true && l.date === todayKey());
}

function focusAllDayCard(nativeReady = focusNativeBridgeAvailable()) {
  const on = allDayLockActive();
  const lock = S.focus.allDayLock || {};
  const pending = lock.status === 'requested';
  const targets = focusStats().blockedCount;
  const detail = !nativeReady
    ? 'Requires Apple Screen Time access'
    : !targets
      ? 'Choose distractions first'
      : pending
        ? (lock.pendingAction === 'stop' ? 'Turning protection off...' : 'Waiting for iPhone confirmation...')
        : lock.status === 'failed'
          ? 'Screen Time did not confirm. Try again.'
          : on ? `${targets} selected until midnight` : 'Protect the rest of today';
  return `
    <div class="focus-allday-control ${on ? 'on' : ''}">
      <div><b>All-day shield</b><span>${detail}</span></div>
      <button class="allday-switch ${on ? 'on' : ''}" data-act="focus-allday-toggle" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${on ? 'Turn off' : 'Turn on'} all-day shield" ${nativeReady && targets && !pending ? '' : 'disabled'}><i></i></button>
    </div>`;
}

/* ============================================================
   PLAN — tasks with deadlines + reminders, and a daily journal
   ============================================================ */

function defaultTaskDue() {
  const d = new Date(); d.setHours(18, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtTaskDue(due) {
  if (!due) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(due);
  const d = taskDeadline(due);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const t = new Date(now); t.setDate(now.getDate() + 1);
  const day = d.toDateString() === now.toDateString() ? 'Today'
    : d.toDateString() === t.toDateString() ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return dateOnly ? day : `${day} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function taskDeadline(due) { return new Date(/^\d{4}-\d{2}-\d{2}$/.test(due || '') ? due + 'T23:59:59' : due); }
function taskOverdue(t) { return t.due && !t.done && taskDeadline(t.due).getTime() < Date.now(); }

function journalStreak() {
  const today = atMidnight(operationalDate());
  let s = 0;
  for (let i = 0; i < 400; i++) {
    const v = String((S.journal && S.journal[dkey(addDays(today, -i))]) || '').trim();
    if (v) s++; else if (i === 0) continue; else break;
  }
  return s;
}
function journalCount() { return Object.values(S.journal || {}).filter((v) => String(v).trim()).length; }

function taskRow(t) {
  const over = taskOverdue(t);
  const due = fmtTaskDue(t.due);
  return `
    <div class="plan-task${t.done ? ' done' : ''}${over ? ' overdue' : ''}">
      <button class="plan-task-check${t.done ? ' on' : ''}" data-act="task-toggle" data-id="${esc(t.id)}" aria-pressed="${t.done}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${t.done ? ICONS.check : ''}</button>
      <div class="plan-task-body">
        <button class="plan-task-title" data-planning-act="task-edit" data-id="${esc(t.id)}" aria-label="Edit task: ${esc(t.title)}">${esc(t.title)}</button>
        <button class="inline-link" data-brain-act="link-task" data-id="${esc(t.id)}">${esc(S.brain.goals.find(g => g.id === t.goal_id)?.title || 'Link to a goal')}</button>
        ${due ? `<div class="plan-task-due">${over ? '⚠ ' : ''}${due}${t.remind && !t.done ? ' · 🔔' : ''}</div>` : ''}
      </div>
      <button class="plan-task-del" data-act="task-del" data-id="${esc(t.id)}" aria-label="Delete task: ${esc(t.title)}">✕</button>
    </div>`;
}

function viewPlan(embedded = false) {
  const tasks = (S.tasks || []).slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.due && !b.due) return (b.created || 0) - (a.created || 0);
    if (!a.due) return 1;
    if (!b.due) return -1;
    return taskDeadline(a.due) - taskDeadline(b.due);
  });
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter(taskOverdue).length;
  return `
    ${embedded ? '' : `${brandbar()}
    <header class="topbar">
      <div>
        <h1>Tasks</h1>
        <div class="sub">${open.length} open${overdue ? ` · ${overdue} overdue` : ''}</div>
      </div>
      <button class="inline-link" data-planning-act="workspace" data-id="brain">Capture</button>
    </header>`}
    <section class="planning-section plan-add-card" aria-label="New task">
      <label for="taskTitle">New task</label>
      <input id="taskTitle" class="plan-input" type="text" placeholder="What needs to get done?" maxlength="200" autocomplete="off" />
      <div class="plan-add-row">
        <input id="taskDue" class="plan-input plan-due" type="datetime-local" value="" aria-label="Task deadline (optional)" />
        <button class="btn plan-add-btn" data-act="task-add">Add</button>
      </div>
      <label class="plan-remind" for="taskRemind">
        <input type="checkbox" id="taskRemind" />
        <span>Notify me when it’s due</span>
      </label>
    </section>

    <div class="card-head plan-list-head">
      <span class="section-title" style="margin:0">Tasks</span>
      <span class="reminder-state">${open.length} open${overdue ? ` · ${overdue} overdue` : ''}</span>
    </div>
    ${tasks.length
      ? `<div class="plan-tasks">${tasks.map(taskRow).join('')}</div>`
      : `<p class="empty-note">No tasks yet.</p>`}
  `;
}

/* ============================================================
   PROGRESS
   ============================================================ */

function viewProgress(embedded = false) {
  if (!embedded) return arcWorkspaceView();
  const data = approvedProgressData(progressRange);
  const focus = focusStats();
  const mood = approvedMoodData(7);
  const focusHabit = weeklyReviewData().focus?.h;
  return `
    ${embedded ? '' : brandbar()}
    <div class="approved-range" role="group" aria-label="Arc range">
      ${[7, 30, 90].map((n) => `<button data-act="progress-range" data-id="${n}" aria-pressed="${progressRange === n}">${n} days</button>`).join('')}
    </div>
    <div class="approved-progress-layout">
      <div>
        <section class="approved-section approved-consistency">
          <div class="approved-section-head"><h2>Consistency</h2><span>${data.period}</span></div>
          <div class="approved-statline">
            <div><strong>${data.pct}<small>%</small></strong><span>of scheduled reps kept</span></div>
            <span>${data.done} / ${data.due} reps</span>
          </div>
          ${approvedConsistencyChart(data)}
          <p class="approved-readout" role="status">${approvedProgressReadout(data)}</p>
          <div class="approved-summary">
            <div><b>${data.full}</b><span>Full ${progressRange === 7 ? 'days' : 'periods'}</span></div>
            <div><b>${data.rest}</b><span>Rest ${progressRange === 7 ? 'days' : 'periods'}</span></div>
            <div><b>${progressRange === 7 ? formatFocusMinutes(focus.weekMinutes) : '—'}</b><span>Focus time</span></div>
          </div>
        </section>
        <section class="approved-section">
          <div class="approved-section-head"><h2>Your week, by area</h2><span>kept / scheduled</span></div>
          ${approvedCategoryBars(7)}
        </section>
      </div>
      <div class="approved-progress-side">
        <section class="approved-section approved-mood">
          <div class="approved-section-head"><h2>Mood</h2><span>Last 7 days</span></div>
          <div class="approved-mood-stat"><strong>${mood.average === null ? '—' : mood.average.toFixed(1)}${mood.average === null ? '' : '<small> / 5</small>'}</strong><span>${mood.logged} check-in${mood.logged === 1 ? '' : 's'}</span></div>
          ${approvedMoodChart(mood)}
          <p class="approved-readout" id="mood-readout" role="status">${approvedMoodReadout(mood)}</p>
        </section>
        <section class="approved-section approved-next-focus">
          <div class="approved-section-head"><h2>One focus for next week</h2></div>
          <p>${focusHabit ? `Make room for ${esc(focusHabit.name)}.` : 'Keep the next rep small enough to repeat.'}</p>
          <span>${focusHabit ? `Use the minimum version — ${esc(focusHabit.min || 'two minutes')} — on busy days.` : 'Consistency grows when the next action is clear.'}</span>
        </section>
        <section class="approved-section approved-proof-link">
          <button data-act="proof-open"><span><b>Your proof</b><small>${proofItems().length} saved moment${proofItems().length === 1 ? '' : 's'}</small></span><span aria-hidden="true">›</span></button>
        </section>
      </div>
    </div>
    ${planningWeeklyPanel(todayKey())}
  `;
}

function approvedProgressDay(k, label) {
  const dueHabits = S.habits.filter((h) => {
    const status = statusOf(h.id, k);
    return status !== 'skip' && (scheduledFor(h, k) || status === 'done' || status === 'min');
  });
  const done = dueHabits.filter((h) => isCompleted(h.id, k)).length;
  return { key: k, label, due: dueHabits.length, done, pct: dueHabits.length ? Math.round(done / dueHabits.length * 100) : null };
}

function approvedProgressData(days) {
  const today = atMidnight(operationalDate());
  const start = startDate();
  const challengeEnd = addDays(start, 89);
  const daily = [];
  for (let back = days - 1; back >= 0; back--) {
    const date = addDays(today, -back);
    const key = dkey(date);
    if (date < start) daily.push({ key, label: niceDate(key), due: null, done: 0, pct: null, future: true });
    else daily.push(approvedProgressDay(key, niceDate(key)));
  }
  const groupSize = days === 7 ? 1 : days === 30 ? 5 : 15;
  const rows = [];
  for (let i = 0; i < daily.length; i += groupSize) {
    const part = daily.slice(i, i + groupSize);
    const known = part.filter((d) => d.due !== null);
    const due = known.reduce((sum, d) => sum + d.due, 0);
    const done = known.reduce((sum, d) => sum + d.done, 0);
    rows.push({
      label: days === 7 ? part[0].label.split(',')[0] : `Days ${i + 1}–${Math.min(days, i + groupSize)}`,
      detail: days === 7 ? part[0].label : `${part[0].label} – ${part[part.length - 1].label}`,
      due: known.length ? due : null,
      done,
      pct: due ? Math.round(done / due * 100) : null,
      rest: known.length > 0 && due === 0,
      future: known.length === 0,
    });
  }
  const knownDays = daily.filter((d) => d.due !== null);
  const due = knownDays.reduce((sum, d) => sum + d.due, 0);
  const done = knownDays.reduce((sum, d) => sum + d.done, 0);
  progressSelected = Math.min(Math.max(0, progressSelected), rows.length - 1);
  return {
    rows, due, done, pct: due ? Math.round(done / due * 100) : 0,
    full: rows.filter((r) => r.due > 0 && r.done === r.due).length,
    rest: rows.filter((r) => r.rest).length,
    period: days === 7 ? `${rows[0].detail.split(',').slice(1).join(',').trim()} – ${rows[rows.length - 1].detail.split(',').slice(1).join(',').trim()}` : `${fmtDate(start)} → ${fmtDate(challengeEnd)}`,
  };
}

function approvedConsistencyChart(data) {
  return `<div class="approved-chart">
    <div class="approved-axis"><span>100%</span><span>50%</span><span>0</span></div>
    <div class="approved-bars" style="--count:${data.rows.length}">
      ${data.rows.map((r, i) => `<button data-act="progress-point" data-id="${i}" aria-pressed="${progressSelected === i}" aria-label="${esc(r.detail)}: ${r.future ? 'before challenge' : r.rest ? 'rest day' : `${r.done} of ${r.due} reps kept`}">
        <span class="approved-bar-slot">${r.pct === null ? '<i class="approved-no-data">—</i>' : `<i class="approved-bar" style="height:${r.pct}%;--motion-order:${i}"></i>`}</span>
        <small>${esc(r.label)}</small>
      </button>`).join('')}
    </div>
  </div>`;
}

function approvedProgressReadout(data) {
  const r = data.rows[progressSelected];
  if (!r) return 'No progress data yet.';
  return `<b>${esc(r.detail)}</b> · ${r.future ? 'Before your challenge started' : r.rest ? 'Rest day · no scheduled habits' : `${r.done} of ${r.due} reps kept`}`;
}

function approvedCategoryBars(days) {
  const today = atMidnight(operationalDate());
  const rows = CATEGORIES.filter((c) => S.habits.some((h) => (h.cat || 'custom') === c.id)).map((cat) => {
    let due = 0, done = 0;
    for (let back = 0; back < Math.min(days, elapsedDays()); back++) {
      const key = dkey(addDays(today, -back));
      for (const h of S.habits.filter((item) => (item.cat || 'custom') === cat.id)) {
        const status = statusOf(h.id, key);
        if (status === 'skip' || (!scheduledFor(h, key) && status !== 'done' && status !== 'min')) continue;
        due++;
        if (status === 'done' || status === 'min') done++;
      }
    }
    return { cat, due, done, pct: due ? Math.round(done / due * 100) : null };
  });
  if (!rows.length) return '<p class="empty-note">Add a habit to see your areas.</p>';
  return `<div class="approved-categories">${rows.map((r) => `<div><p><span>${esc(r.cat.name)}</span><span>${r.due ? `${r.done} / ${r.due}` : 'Not scheduled'}</span></p><div><i style="width:${r.pct || 0}%"></i></div></div>`).join('')}</div>`;
}

function approvedMoodData(days) {
  const today = atMidnight(operationalDate());
  const rows = [];
  for (let back = days - 1; back >= 0; back--) {
    const date = addDays(today, -back);
    const key = dkey(date);
    const log = dlog(key);
    const value = moodScore(log);
    rows.push({ key, label: date.toLocaleDateString('en-US', { weekday: 'short' }), detail: niceDate(key), value: value || null, mood: log.mood || '' });
  }
  const values = rows.filter((r) => r.value !== null);
  moodSelected = Math.min(Math.max(0, moodSelected), rows.length - 1);
  return { rows, logged: values.length, average: values.length ? values.reduce((sum, r) => sum + r.value, 0) / values.length : null };
}

function approvedMoodChart(data) {
  const w = 320, h = 132, left = 28, right = 10, top = 10, bottom = 28;
  const x = (i) => left + (w - left - right) * i / Math.max(1, data.rows.length - 1);
  const y = (v) => top + (h - top - bottom) * (1 - (v - 1) / 4);
  const segments = [];
  let active = [];
  data.rows.forEach((row, i) => {
    if (row.value === null) { if (active.length) segments.push(active); active = []; }
    else active.push({ ...row, x: x(i), y: y(row.value) });
  });
  if (active.length) segments.push(active);
  return `<div class="approved-mood-chart">
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Mood over the last 7 days. Missing dates are shown as gaps.">
      ${[5, 3, 1].map((v) => `<line x1="${left}" x2="${w - right}" y1="${y(v)}" y2="${y(v)}"></line><text x="2" y="${y(v) + 4}">${v}</text>`).join('')}
      ${segments.map((part) => part.length > 1 ? `<path pathLength="1" d="M ${part.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}"></path>` : '').join('')}
      ${segments.flat().map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3"><title>${esc(`${p.detail}: ${moodLabel(p.mood)}`)}</title></circle>`).join('')}
    </svg>
    <div class="approved-mood-dates">${data.rows.map((r, i) => `<button data-act="mood-point" data-id="${i}" aria-pressed="${moodSelected === i}" aria-label="${esc(r.detail)}: ${r.value === null ? 'not logged' : `${moodLabel(r.mood)}, ${r.value} of 5`}">${r.label}</button>`).join('')}</div>
  </div>`;
}

function approvedMoodReadout(data) {
  const r = data.rows[moodSelected];
  if (!r) return 'No mood data yet.';
  return `<b>${esc(r.detail)}</b> · ${r.value === null ? 'Not logged' : `${esc(moodLabel(r.mood))} · ${r.value} of 5`}`;
}

/* ---- Command Center: Whoop/Oura-style biometric deck from real Arc90 data ---- */
function cmTier(pct) { return pct >= 70 ? 'good' : pct >= 45 ? 'mid' : 'low'; }

function cmRing(pct) {
  const R = 52, C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `
    <div class="cmd-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="cmd-ring-track" cx="60" cy="60" r="${R}" fill="none" stroke-width="11"/>
        <circle class="cmd-ring-fill" cx="60" cy="60" r="${R}" fill="none" stroke-width="11" stroke-linecap="round"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)"/>
      </svg>
      <div class="cmd-ring-center"><b data-countup="${Math.round(pct)}">0</b><span>%</span></div>
    </div>`;
}

function cmGauge(pct, label, value) {
  const len = Math.PI * 80; // semicircle arc length for r=80
  const fill = Math.max(0, Math.min(100, pct));
  return `
    <div class="cmd-gauge ${cmTier(fill)}">
      <svg viewBox="0 0 200 118" aria-hidden="true">
        <path class="cmd-gauge-track" d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke-width="13" stroke-linecap="round"/>
        <path class="cmd-gauge-fill" d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke-width="13" stroke-linecap="round"
          stroke-dasharray="${(len * fill / 100).toFixed(1)} ${len.toFixed(1)}"/>
      </svg>
      <div class="cmd-gauge-center"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>
    </div>`;
}

function commandCenterCard() {
  const k = todayKey();
  const rd = vitality().score;                      // real Readiness (logged signals)
  const ready = rd === null ? momentum() : rd;      // fall back to momentum pre-log
  const tier = cmTier(ready);
  const readyWord = rd === null
    ? (ready >= 70 ? 'Primed' : ready >= 45 ? 'Building' : 'Recover')
    : vitalityState(rd).label;
  const ringName = rd === null ? 'Momentum' : 'Readiness';
  const s = sleepStats(7);
  const sleepPct = s.avg ? Math.min(100, Math.round((s.avg / Math.max(1, s.goal)) * 100)) : 0;
  const f = focusStats();
  const focusPct = Math.round((f.consistency / 7) * 100);
  const keptPct = Math.round(avgRate(7) * 100);

  const act = actionable(k);
  const totalToday = Math.max(1, act.length);
  const doneToday = act.filter((h) => isCompleted(h.id, k)).length;
  const strain = Math.min(21, Math.round((doneToday * 1.6 + f.todayMinutes / 12) * 10) / 10);
  const strainPct = Math.round((strain / 21) * 100);

  const h = healthDay(k);
  const sd = sleepDay(k);
  const set = S.health.settings;
  const pctOf = (v, g) => Math.min(100, Math.round((Number(v) || 0) / Math.max(1, g) * 100));

  const metrics = [
    { label: 'Sleep performance', pct: sleepPct, c: 'm-cyan' },
    { label: 'Focus shield', pct: focusPct, c: 'm-acc' },
    { label: 'Consistency', pct: keptPct, c: 'm-mint' },
  ];
  const vitals = [
    { k: 'Habits', v: `${doneToday}/${totalToday}`, pct: Math.round((doneToday / totalToday) * 100), c: 'v-acc' },
    { k: 'Hydration', v: `${h.water}/${set.waterGoal}`, pct: pctOf(h.water, set.waterGoal), c: 'v-cyan' },
    { k: 'Steps', v: h.steps ? `${h.steps}` : '—', pct: pctOf(h.steps, set.stepGoal), c: 'v-mint' },
    { k: 'Sleep', v: sd.hours !== '' ? `${sd.hours}h` : '—', pct: sd.hours !== '' ? pctOf(sd.hours, set.sleepGoal) : 0, c: 'v-amber' },
  ];

  return `
    <section class="card cmd-center">
      <div class="card-head">
        <span class="eyebrow">Command center</span>
        <span class="cmd-live"><i></i>live</span>
      </div>
      <div class="cmd-deck">
        <div class="cmd-ring-wrap ${tier}">
          ${cmRing(ready)}
          <div class="cmd-ring-meta"><b>${ringName}</b><span>${readyWord}</span></div>
        </div>
        <div class="cmd-metrics">
          ${metrics.map((m) => `
            <div class="cmd-metric ${m.c}">
              <div class="cmd-metric-top"><span>${m.label}</span><b>${m.pct}%</b></div>
              <div class="cmd-bar"><i style="width:${Math.max(3, m.pct)}%"></i></div>
            </div>`).join('')}
        </div>
      </div>
      <div class="cmd-gauge-wrap ${cmTier(strainPct)}">
        ${cmGauge(strainPct, 'daily load', strain.toFixed(1))}
        <div class="cmd-gauge-copy">
          <b>Today’s load</b>
          <small>${doneToday} rep${doneToday === 1 ? '' : 's'} · ${formatFocusMinutes(f.todayMinutes)} focused</small>
        </div>
      </div>
      <div class="cmd-vitals">
        ${vitals.map((v) => `
          <div class="cmd-vital ${v.c}">
            <span class="cv-k">${v.k}</span>
            <span class="cv-v">${esc(v.v)}</span>
            <div class="cmd-bar sm"><i style="width:${Math.max(3, v.pct)}%"></i></div>
          </div>`).join('')}
      </div>
    </section>`;
}

function progressAnalyticsCard() {
  const w = weeklyReviewData();
  const f = focusStats();
  const rows = progressHeatRows(35);
  const heat = rows.map((r) => `<i class="${r.cls}" title="${niceDate(r.key)} · ${r.pct}%"></i>`).join('');
  const best = w.best ? `${w.best.h.emoji} ${w.best.h.name}` : 'Anchor forming';
  const focus = w.focus ? `${w.focus.h.emoji} ${w.focus.h.name}` : 'Keep logging';
  return `
    <section class="card analytics-board">
      <div class="card-head">
        <span class="eyebrow">Analytics dashboard</span>
        <span class="pro-badge">ARC90</span>
      </div>
      <div class="analytics-grid">
        <div class="analytics-heat">
          <div class="analytics-label-row">
            <b>Weekly engagement</b>
            <span>${w.pct}% kept</span>
          </div>
          <div class="heatmap35">${heat}</div>
        </div>
        <div class="analytics-stat">
          <span>Lecture</span>
          <b>${totalReps()}</b>
          <small>total votes</small>
        </div>
        <div class="analytics-stat">
          <span>GPA</span>
          <b>${(momentum() / 25).toFixed(2)}</b>
          <small>momentum index</small>
        </div>
        <div class="analytics-stat">
          <span>Session</span>
          <b>${formatFocusMinutes(f.weekMinutes)}</b>
          <small>focus this week</small>
        </div>
        <div class="analytics-stat">
          <span>Absence</span>
          <b>${Math.max(0, 7 - w.rows.filter((r) => r.rate && r.rate >= 1).length)}</b>
          <small>non-perfect days</small>
        </div>
      </div>
      <div class="analytics-foot">
        <div><span>Anchor</span><b>${esc(best)}</b></div>
        <div><span>Next focus</span><b>${esc(focus)}</b></div>
      </div>
    </section>`;
}

function progressHeatRows(days = 35) {
  const today = atMidnight(operationalDate());
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - (days - 1));
    const key = dkey(d);
    const r = d < startDate() ? null : rateFor(key);
    const pct = r === null ? 0 : Math.round((r || 0) * 100);
    const cls = r === null ? 'off' : pct >= 100 ? 'best' : pct >= 67 ? 'high' : pct >= 34 ? 'mid' : pct > 0 ? 'low' : 'miss';
    return { key, pct, cls };
  });
}

function progressArcMapCard() {
  const w = weeklyReviewData();
  const day = dayNumber();
  const pct = Math.round((day / 90) * 100);
  return `
    <section class="card progress-map-card">
      <div class="card-head">
        <span class="eyebrow">Your 90 days</span>
        <span class="progress-map-score">${pct}%</span>
      </div>
      ${grid90()}
      <div class="progress-map-foot">
        <div><b>${day}</b><span>day</span></div>
        <div><b>${momentum()}%</b><span>momentum</span></div>
        <div><b>${w.pct}%</b><span>week</span></div>
        <div><b>${totalReps()}</b><span>votes</span></div>
      </div>
    </section>`;
}

const PROGRESS_MANTRAS = [
  'The life you want is not built in the loud moment of motivation. It is built when the quiet version of you keeps the promise anyway.',
  'Progress is identity made visible. Every kept rep is proof that your future is no longer an idea; it is becoming your default.',
  'You do not need a perfect day to become the person you chose. You need one honest action that refuses to let the old pattern vote alone.',
  'A streak is not the point. The point is becoming someone who returns quickly, repairs calmly, and does not negotiate with the life they asked for.',
  'The small rep matters because it teaches your nervous system a deeper truth: you can trust yourself when the day is inconvenient.',
  'Every day is a quiet contract. You either strengthen the story that you follow through, or you make it easier to forget who you are building.',
  'Discipline is not intensity. It is remembering, again and again, that your future deserves evidence, not promises.',
  'The version of you waiting at Day 90 is not created by force. It is revealed by repetition, patience, and the refusal to disappear from yourself.',
  'When the work feels small, that is where the transformation hides. Ordinary reps become extraordinary because they survive ordinary days.',
  'Your progress is not asking you to feel ready. It is asking you to become reliable enough that readiness stops being required.',
  'The day you almost skip is the day that defines the system. Not because it is dramatic, but because it proves the habit can live under pressure.',
  'Momentum is self-respect with a calendar. One square at a time, you are turning intention into something your life can stand on.',
  'You are not chasing a number. You are building a witness: a record that says you kept choosing the person you said you wanted to become.',
  'A missed day is information. A comeback is identity. The faster you return, the less power the old pattern has over your future.',
  'The deepest progress is quiet: fewer negotiations, cleaner choices, less drama around doing what matters.',
  'Every fulfilled day is a vote for freedom. Not freedom from effort, but freedom from being ruled by impulse.',
  'This arc is not about proving you are perfect. It is about proving you are reachable by your own standards, even when life gets noisy.',
  'Consistency turns hope into architecture. The more often you show up, the more your life starts to hold the shape of your goals.',
  'You are training the part of you that keeps going after the emotion fades. That part is rare. Feed it with evidence.',
  'The goal is not to win the day loudly. The goal is to close the day knowing you did not abandon yourself.',
  'Small acts repeated with care become a new environment inside you. Eventually, discipline feels less like pressure and more like home.',
  'Every completed rep reduces the distance between who you are and who you keep imagining. The gap closes by action, not by waiting.',
  'Today is not separate from the dream. Today is the dream in its smallest measurable form.',
  'The real gain is not only the habit. It is the calm confidence that comes from watching yourself become dependable.',
  'Keep the promise small enough to finish and sacred enough to respect. That is how a 90-day arc becomes a changed life.',
  'You are building proof under your own name. No one has to see it for it to be real.',
  'Do not confuse low emotion with low meaning. Some of the most important days feel ordinary while they are changing everything.',
  'The future does not arrive all at once. It arrives disguised as the rep you could complete today.',
  'A fulfilled square is more than a mark. It is a signal to your brain that the new standard survived another day.',
  'Return to the rep. Return to the standard. Return to the person who decided their life was worth shaping.'
];

const REFLECTION_QUOTES = [
  { quote: 'Act as if what you do makes a difference. It does.', source: 'William James' },
  { quote: 'Waste no more time arguing what a good person should be. Be one.', source: 'Marcus Aurelius, Meditations' },
  { quote: 'First say to yourself what you would be; then do what you have to do.', source: 'Epictetus, Discourses' },
  { quote: 'You are today where your thoughts have brought you.', source: 'James Allen, As a Man Thinketh' },
  { quote: 'The successful man is the average man, focused.', source: 'Bruce Lee' },
  { quote: 'Well done is better than well said.', source: 'Benjamin Franklin' },
  { quote: 'Energy and persistence conquer all things.', source: 'Benjamin Franklin' },
];

function reflectionQuote(seedOffset = 0) {
  const seed = Math.floor(atMidnight(operationalDate()) / DAY_MS) + dayNumber() + (Number(seedOffset) || 0);
  // Before onboarding there is no start date, so the seed can be NaN.
  const index = Number.isFinite(seed) ? ((seed % REFLECTION_QUOTES.length) + REFLECTION_QUOTES.length) % REFLECTION_QUOTES.length : 0;
  return REFLECTION_QUOTES[index];
}

function progressMantraCard() {
  const seed = Math.floor(atMidnight(operationalDate()) / DAY_MS) + dayNumber();
  const quote = PROGRESS_MANTRAS[seed % PROGRESS_MANTRAS.length];
  const identity = S.profile.identity || 'the person you are becoming';
  const book = reflectionQuote();
  return `
    <section class="card progress-mantra-card progress-reflection-card">
      <div class="card-head">
        <span class="eyebrow">Daily reflection</span>
        <span class="mini-act">Day ${dayNumber()}</span>
      </div>
      <div class="mantra-copy">${esc(quote)}</div>
      <div class="book-reflection">
        <span>${esc(book.quote)}</span>
        <small>${esc(book.source)}</small>
      </div>
      <div class="mantra-foot">
        <span>Identity</span>
        <b>${esc(identity)}</b>
      </div>
    </section>`;
}

function progressPulseCard() {
  const w = weeklyReviewData();
  const next = nextAchievement();
  const rec = recoveryRate();
  const delta = weeklyDelta();
  const pace = w.pct >= 80 ? 'excellent pace' : w.pct >= 60 ? 'steady pace' : w.pct >= 35 ? 'fragile pace' : 'reset pace';
  const deltaText = delta === null ? 'baseline forming' : delta > 0 ? `+${delta}% this week` : delta < 0 ? `${delta}% this week` : 'even this week';
  return `
    <section class="card arc-forecast-card">
      <div class="card-head">
        <span class="eyebrow">Arc forecast</span>
        <span class="pro-badge">LIVE</span>
      </div>
      <div class="forecast-main">
        <div>
          <b>${momentum()}<em>%</em></b>
          <span>${pace}</span>
        </div>
        <p>${daysLeft()} days left. At this pace, your Day 90 proof is about <b>${projectedReps()}</b> total votes.</p>
      </div>
      <div class="forecast-grid">
        <div><span>Week signal</span><b>${esc(deltaText)}</b></div>
        <div><span>Next marker</span><b>${next ? esc(next.title) : 'Next arc'}</b></div>
        <div><span>Comeback rate</span><b>${rec === null ? 'learning' : rec + '%'}</b></div>
      </div>
    </section>`;
}

function progressBriefing(rec) {
  const delta = weeklyDelta();
  const bestDay = bestWeekday();
  const reviews = reviewStats(14);
  const trend = delta === null ? 'Needs 2 weeks' : delta > 0 ? `+${delta}% vs prior week` : delta < 0 ? `${delta}% vs prior week` : 'Even with last week';
  const trendClass = delta === null ? '' : delta >= 0 ? 'good' : 'low';
  const energyClass = reviews.avgEnergy ? (reviews.avgEnergy < 3 ? 'low' : 'good') : '';
  return `
    <section class="card insight-card">
      <div class="card-head">
        <span class="eyebrow">Tracking intelligence</span>
        <span class="pro-badge">LIVE</span>
      </div>
      <div class="insight-grid">
        <div class="insight-item">
          <span class="signal ${trendClass}"></span>
          <div><b>${esc(trend)}</b><small>7-day completion trend</small></div>
        </div>
        <div class="insight-item">
          <span class="signal good"></span>
          <div><b>${projectedReps()}</b><small>projected total reps by Day 90</small></div>
        </div>
        <div class="insight-item">
          <span class="signal"></span>
          <div><b>${bestDay ? `${bestDay.day} · ${bestDay.pct}%` : 'Still learning'}</b><small>strongest weekday pattern</small></div>
        </div>
        <div class="insight-item">
          <span class="signal ${energyClass}"></span>
          <div><b>${reviews.avgEnergy ? `${reviews.avgEnergy.toFixed(1)}/5 energy` : 'No reflections yet'}</b><small>${reviews.reviews} reflection${reviews.reviews === 1 ? '' : 's'} in 14 days${reviews.topMood ? ` · ${moodLabel(reviews.topMood)}` : ''}</small></div>
        </div>
      </div>
      ${rec !== null ? `<div class="axis-note"><b>Recovery rate: ${rec}%.</b> This is how often a miss turns into a next-day comeback.</div>` : ''}
    </section>`;
}

function moodInsightPanel() {
  const stats = moodDistribution(30);
  const score = stats.score;
  return `
    <section class="card mood-insight-card compact-mood-card">
      <div class="insight-split">
        <div class="mood-ring-wrap" style="--score:${score}">
          <div class="mood-ring">
            <span>${score || '--'}</span>
            <small>mood level</small>
          </div>
        </div>
        <div class="mood-breakdown">
          <div class="section-mini-title">Mood level</div>
          ${stats.parts.map((p) => `
            <div class="mood-dot-row">
              <i class="${p.cls}"></i>
              <b>${p.pct}%</b>
              <span>${esc(p.label)}</span>
            </div>`).join('')}
        </div>
      </div>
    </section>`;
}

function moodGraphPanel(mode = 'full') {
  const compact = mode === 'compact';
  const days = compact ? 7 : 30;
  const rows = moodGraphRows(days);
  const windowDays = rows.length;
  const logged = rows.filter((r) => r.value).length;
  const avg = moodAverage(rows);
  const current = rows[rows.length - 1] || {};
  const recentAvg = moodAverage(rows.slice(-7));
  const priorAvg = compact ? 0 : moodAverage(rows.slice(-14, -7));
  const trend = moodGraphTrend(recentAvg, priorAvg, avg, logged);
  const copy = logged
    ? `${logged}/${windowDays} days logged · ${avg.toFixed(1)}/5 average`
    : 'Log mood from Today to reveal your emotional pattern.';

  return `
    <section class="card mood-graph-card ${compact ? 'compact-mood-graph-card' : ''}">
      <div class="card-head">
        <span class="eyebrow">${compact ? 'Mood trend' : 'Mood graph'}</span>
        <button class="mini-act" data-act="review">${current.mood ? esc(moodLabel(current.mood)) : 'log mood'}</button>
      </div>
      <div class="mood-graph-top">
        <div>
          <b>${logged ? avg.toFixed(1) : '--'}</b>
          <span>${windowDays}-day average</span>
        </div>
        <div>
          <b>${current.mood ? esc(moodLabel(current.mood)) : '--'}</b>
          <span>today</span>
        </div>
      </div>
      ${moodOptionChips(dlog(todayKey()).mood, 'graph')}
      ${moodLineSvg(rows, compact)}
      <div class="mood-graph-foot">
        <b>${esc(trend)}</b>
        <span>${esc(copy)}</span>
      </div>
    </section>`;
}

function moodGraphRows(days = 30) {
  const today = atMidnight(operationalDate());
  const count = Math.max(1, Math.min(days, elapsedDays()));
  return Array.from({ length: count }, (_, i) => {
    const d = addDays(today, i - (count - 1));
    const key = dkey(d);
    const l = dlog(key);
    return {
      key,
      mood: l.mood || '',
      value: moodScore(l),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      today: key === todayKey(),
    };
  });
}

function moodScore(l) {
  return ({ strong: 5, steady: 4, tired: 3, stressed: 2, low: 1 })[l.mood] || 0;
}

function moodAverage(rows) {
  const values = rows.map((r) => r.value).filter(Boolean);
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0;
}

function moodGraphTrend(recentAvg, priorAvg, avg, logged) {
  if (!logged) return 'No baseline yet';
  if (!recentAvg) return 'No recent mood data';
  if (priorAvg) {
    const delta = recentAvg - priorAvg;
    if (delta >= 0.35) return 'Mood trending up';
    if (delta <= -0.35) return 'Mood dipping';
    return 'Holding steady';
  }
  return moodGraphTone(avg);
}

function moodLineSvg(rows, compact = false) {
  const w = 320;
  const h = compact ? 112 : 140;
  const padX = 18;
  const padTop = 12;
  const padBottom = 24;
  const baseY = h - padBottom;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const xFor = (i) => padX + (rows.length <= 1 ? 0 : (innerW * i) / (rows.length - 1));
  const yFor = (v) => padTop + innerH * (1 - ((v - 1) / 4));
  const points = rows
    .map((r, i) => r.value ? { ...r, x: xFor(i), y: yFor(r.value) } : null)
    .filter(Boolean);
  const linePath = points.length
    ? `M ${points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')}`
    : '';
  const areaPath = points.length >= 2
    ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baseY} L ${points[0].x.toFixed(2)} ${baseY} Z`
    : '';
  const dayLabels = compact
    ? rows
    : rows.filter((_, i) => i === 0 || i === Math.floor((rows.length - 1) / 2) || i === rows.length - 1);

  return `
    <div class="mood-line-wrap">
      <svg class="mood-line-plot ${compact ? 'compact' : ''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Mood trend over ${rows.length} days">
        <line class="mood-axis strong" x1="${padX}" y1="${yFor(5).toFixed(2)}" x2="${w - padX}" y2="${yFor(5).toFixed(2)}"></line>
        <line class="mood-axis" x1="${padX}" y1="${yFor(3).toFixed(2)}" x2="${w - padX}" y2="${yFor(3).toFixed(2)}"></line>
        <line class="mood-axis low" x1="${padX}" y1="${yFor(1).toFixed(2)}" x2="${w - padX}" y2="${yFor(1).toFixed(2)}"></line>
        ${areaPath ? `<path class="mood-area" d="${areaPath}"></path>` : ''}
        ${linePath ? `<path class="mood-line" d="${linePath}"></path>` : ''}
        ${rows.map((r, i) => !r.value
          ? `<circle class="mood-miss-dot" cx="${xFor(i).toFixed(2)}" cy="${baseY}" r="1.8"></circle>`
          : '').join('')}
        ${points.map((p) => `
          <circle class="mood-point ${esc(p.mood)} ${p.today ? 'today' : ''}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${p.today ? 5 : 3.8}">
            <title>${esc(`${p.dateLabel}: ${moodLabel(p.mood)}`)}</title>
          </circle>`).join('')}
        <text class="mood-y-label" x="2" y="${yFor(5).toFixed(2) + 3}">5</text>
        <text class="mood-y-label" x="2" y="${yFor(3).toFixed(2) + 3}">3</text>
        <text class="mood-y-label" x="2" y="${yFor(1).toFixed(2) + 3}">1</text>
        ${dayLabels.map((r) => `
          <text class="mood-x-label ${r.today ? 'today' : ''}" x="${xFor(rows.indexOf(r)).toFixed(2)}" y="${h - 5}">${esc(r.label)}</text>`).join('')}
      </svg>
    </div>`;
}

function moodGraphTone(avg) {
  if (avg >= 4.2) return 'High clarity';
  if (avg >= 3.2) return 'Stable mood';
  if (avg >= 2.2) return 'Watch recovery';
  return 'Protect basics';
}

function moodDistribution(nDays = 30) {
  const today = atMidnight(operationalDate());
  let good = 0, normal = 0, low = 0, energy = 0, energyN = 0;
  for (let i = 0; i < Math.min(nDays, elapsedDays()); i++) {
    const l = dlog(dkey(addDays(today, -i)));
    if (l.energy) { energy += l.energy; energyN++; }
    if (l.mood === 'strong' || l.mood === 'steady') good++;
    else if (l.mood === 'tired' || l.mood === 'stressed') normal++;
    else if (l.mood === 'low') low++;
  }
  const total = good + normal + low;
  const fallback = momentum();
  const score = energyN ? Math.round((energy / energyN) * 2) : total ? Math.max(1, Math.round(fallback / 10)) : 0;
  const pct = (n) => total ? Math.round((n / total) * 100) : 0;
  return {
    score,
    parts: [
      { label: 'good · 8-10', pct: pct(good), cls: 'good' },
      { label: 'normal · 5-7', pct: pct(normal), cls: 'normal' },
      { label: 'low · 1-4', pct: pct(low), cls: 'low' },
    ],
  };
}

function habitInsightRows() {
  return S.habits.slice(0, 4).map((h) => {
    const now = Math.round(habitRate(h.id, 7) * 100);
    const base = Math.round(habitRate(h.id, 90) * 100);
    return { name: h.name, now, base, delta: now - base };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function weeklyReviewCard() {
  const w = weeklyReviewData();
  const trend = w.delta === null ? 'Still learning' : w.delta > 0 ? `+${w.delta}%` : w.delta < 0 ? `${w.delta}%` : 'Even';
  const grade = w.pct >= 85 ? 'Excellent' : w.pct >= 65 ? 'Solid' : w.pct >= 40 ? 'Uneven' : 'Needs reset';
  const bars = w.rows.map((r) => {
    const pct = r.rate === null ? 0 : Math.round(r.rate * 100);
    return `
      <div class="week-bar" title="${niceDate(r.key)}">
        <i style="height:${Math.max(6, pct)}%"></i>
        <span>${dateFromKey(r.key).toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
      </div>`;
  }).join('');
  return `
    <section class="card weekly-card">
      <div class="card-head">
        <span class="eyebrow">Weekly review</span>
        <button class="mini-act" data-act="weekly-export">export</button>
      </div>
      <div class="weekly-hero">
        <div class="weekly-score"><span>${w.pct}</span><small>% kept</small></div>
        <div>
          <div class="weekly-title">${grade} week</div>
          <div class="weekly-copy">${w.completed}/${w.scheduled || 0} scheduled reps kept${w.min ? ` · ${w.min} minimum` : ''}${w.skipped ? ` · ${w.skipped} intentional skip${w.skipped === 1 ? '' : 's'}` : ''}</div>
        </div>
      </div>
      <div class="week-bars">${bars}</div>
      <div class="weekly-grid">
        <div><b>${esc(trend)}</b><span>vs prior week</span></div>
        <div><b>${w.reviews.avgEnergy ? w.reviews.avgEnergy.toFixed(1) + '/5' : '--'}</b><span>avg energy</span></div>
        <div><b>${w.reviews.reviews}</b><span>reflections</span></div>
      </div>
      <div class="weekly-notes">
        ${w.best ? `<div><span>Anchor</span><b>${w.best.h.emoji} ${esc(w.best.h.name)}</b><small>${w.best.stats.pct}% this week</small></div>` : ''}
        ${w.focus ? `<div><span>Focus</span><b>${w.focus.h.emoji} ${esc(w.focus.h.name)}</b><small>${esc(w.focus.h.min || 'minimum version')} next time</small></div>` : ''}
      </div>
      ${w.recentWin ? `<div class="review-saved">Recent win: ${esc(w.recentWin)}</div>` : ''}
    </section>`;
}

function shareSnapshotCard() {
  const w = weeklyReviewData();
  const next = nextAchievement();
  const unlocked = achievementList().filter((a) => a.unlocked).length;
  return `
    <section class="card share-card">
      <div class="card-head">
        <span class="eyebrow">Progress card</span>
        <button class="mini-act" data-act="share-card">download</button>
      </div>
      <div class="share-preview">
        <div class="share-brand">ARC<span>90</span></div>
        <div class="share-title">${esc(S.profile.name || 'My')} · Day ${dayNumber()}</div>
        <div class="share-goal">${esc(S.profile.goal || 'Building the next 90 days')}</div>
        <div class="share-rings">
          <div><b>${momentum()}%</b><span>Momentum</span></div>
          <div><b>${w.pct}%</b><span>This week</span></div>
          <div><b>${totalReps()}</b><span>Votes</span></div>
        </div>
        <div class="share-line">
          <span>${unlocked}/${achievementList().length} badges</span>
          <span>${bestStreak()} best streak</span>
          <span>${next ? `Next: ${esc(next.title)}` : 'All badges unlocked'}</span>
        </div>
      </div>
      <div class="seg-hint">Downloads a private SVG snapshot. No data leaves this device.</div>
    </section>`;
}

function historyReview() {
  const today = atMidnight(operationalDate());
  const start = startDate();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    if (d < start) continue;
    const k = dkey(d);
    const stats = dayStats(k);
    const cls = dayStatusClass(k);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    const date = d.toLocaleDateString('en-US', { day: 'numeric' });
    days.push(`
      <button class="day-chiplet ${cls} ${k === todayKey() ? 'today' : ''}" data-act="day-open" data-id="${k}" aria-label="Review ${niceDate(k)}">
        <span>${label}</span>
        <b>${date}</b>
        <i>${stats.total ? `${stats.done}/${stats.total}` : 'rest'}</i>
      </button>`);
  }
  return `
    <section class="card history-card">
      <div class="card-head">
        <span class="eyebrow">Review & edit days</span>
        <button class="mini-act" data-act="day-open" data-id="${todayKey()}">today</button>
      </div>
      <div class="day-strip">${days.join('')}</div>
      <div class="seg-hint">Tap a day to backfill missed tracking, correct a status, or add the reflection you forgot.</div>
    </section>`;
}

function achievementsPanel() {
  const achievements = achievementList();
  const unlocked = achievements.filter((a) => a.unlocked);
  return `
    <section class="card achievements-card">
      <div class="card-head">
        <span class="eyebrow">Achievements</span>
        <span class="count-bub">${unlocked.length}/${achievements.length}</span>
      </div>
      <div class="badge-grid">
        ${achievements.map((a) => `
          <div class="badge-tile ${a.unlocked ? 'unlocked' : ''}">
            <div class="badge-icon">${esc(a.icon)}</div>
            <div class="badge-name">${esc(a.title)}</div>
            <div class="badge-desc">${esc(a.desc)}</div>
            <div class="mini-progress"><i style="width:${a.pct}%"></i></div>
            <div class="badge-foot">${a.unlocked ? 'Unlocked' : `${Math.min(a.value, a.target)}/${a.target}`}</div>
          </div>`).join('')}
      </div>
    </section>`;
}

function premiumCard(key, title, lockText, inner) {
  if (hasPremiumAccess()) {
    return `<section class="card"><div class="card-head"><span class="eyebrow">${title}</span>${previewAccessActive() ? '' : '<span class="pro-badge">PRO</span>'}</div>${inner}</section>`;
  }
  return `
    <section class="card locked">
      <div class="card-head"><span class="eyebrow">${title}</span><span class="pro-badge">PRO</span></div>
      <div class="locked-blur">${inner}</div>
      <div class="locked-cover">
        <span class="lk">🔒</span>
        <span class="lt">${title}</span>
        <span class="ls">${lockText}</span>
        <button class="btn" data-act="paywall">Unlock with Premium</button>
      </div>
    </section>`;
}

function axisInner() {
  const cats = {};
  for (const h of S.habits) {
    (cats[h.cat] = cats[h.cat] || []).push(habitRate(h.id, elapsedDays()));
  }
  const rows = Object.entries(cats).map(([cat, rates]) => {
    const c = catOf(cat);
    const r = rates.reduce((a, b) => a + b, 0) / rates.length;
    return { c, pct: Math.round(r * 100) };
  }).sort((a, b) => b.pct - a.pct);
  if (!rows.length) return '<div class="empty-note">Add habits to see your Axis.</div>';
  const weakCat = rows[rows.length - 1];
  const weakHabitsInCat = S.habits.filter((h) => h.cat === weakCat.c.id)
    .sort((a, b) => habitRate(a.id, elapsedDays()) - habitRate(b.id, elapsedDays()));
  const wh = weakHabitsInCat[0];
  const overall = Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length);
  const canRadar = rows.length >= 3;
  const toggle = canRadar ? `
    <div class="axis-toggle">
      <button class="${axisMode === 'rings' ? 'on' : ''}" data-act="axis-mode" data-id="rings">◍ Rings</button>
      <button class="${axisMode === 'radar' ? 'on' : ''}" data-act="axis-mode" data-id="radar">◈ Radar</button>
    </div>` : '';
  const body = (axisMode === 'radar' && canRadar)
    ? radar(rows)
    : `
    <div class="axis-wrap">
      ${donut(overall)}
      <div class="axis-legend">
        ${rows.map((r) => `
          <div class="axis-leg-row">
            <span class="alr-name">${r.c.emoji} ${r.c.name}</span>
            <span class="alr-bar"><span class="alr-fill ${r.pct < 50 ? 'weak' : ''}" style="width:${r.pct}%"></span></span>
            <span class="alr-pct">${r.pct}%</span>
          </div>`).join('')}
      </div>
    </div>`;
  return `${toggle}${body}
    ${wh && weakCat.pct < 85 ? `
    <div class="axis-note"><b>Main weak point:</b> ${weakCat.c.name}.<br/>
    <b>Suggested adjustment:</b> shrink “${esc(wh.name)}” to its minimum version — <b>${esc(wh.min || '2 minutes')}</b> — and anchor it right after something you never miss.</div>` : ''}`;
}

/* gradient radar / spider chart */
function radar(rows) {
  const cx = 120, cy = 118, R = 84, n = rows.length;
  const ang = (i) => (-90 + (360 / n) * i) * Math.PI / 180;
  const pt = (i, rad) => [cx + rad * Math.cos(ang(i)), cy + rad * Math.sin(ang(i))];
  // concentric grid rings at 25/50/75/100%
  let grid = '';
  for (const lvl of [0.25, 0.5, 0.75, 1]) {
    const poly = rows.map((_, i) => pt(i, R * lvl).map((v) => v.toFixed(1)).join(',')).join(' ');
    grid += `<polygon class="radar-grid" points="${poly}"/>`;
  }
  // spokes + axis labels
  let spokes = '', labels = '';
  rows.forEach((r, i) => {
    const [ex, ey] = pt(i, R);
    spokes += `<line class="radar-grid" x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/>`;
    const [lx, ly] = pt(i, R + 16);
    const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
    labels += `<text class="radar-lab" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}">${r.c.emoji}</text>`;
  });
  // data polygon
  const data = rows.map((r, i) => pt(i, R * Math.max(0.04, r.pct / 100)).map((v) => v.toFixed(1)).join(',')).join(' ');
  const dots = rows.map((r, i) => { const [px, py] = pt(i, R * Math.max(0.04, r.pct / 100)); return `<circle class="radar-dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3"/>`; }).join('');
  return `
    <div class="radar-wrap">
      <svg viewBox="0 0 240 236" class="radar-svg">
        ${grid}${spokes}
        <polygon class="radar-fill radar-anim" points="${data}"/>
        ${dots}${labels}
      </svg>
    </div>`;
}

/* gradient donut gauge */
function donut(pct) {
  const R = 38, C = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);
  return `
    <div class="donut">
      <svg viewBox="0 0 100 100">
        <circle class="donut-track" cx="50" cy="50" r="${R}" fill="none" stroke-width="9"/>
        <circle class="donut-fill" cx="50" cy="50" r="${R}" fill="none" stroke-width="9"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 50 50)"/>
      </svg>
      <div class="donut-center"><div class="dn"><span data-countup="${pct}">0</span><span class="u">%</span></div><div class="dl">balanced</div></div>
    </div>`;
}

function habitBreakdownInner(rec) {
  if (!S.habits.length) return '<div class="empty-note">Add habits to see your breakdown.</div>';
  return S.habits.map((h) => {
    const pct = Math.round(habitRate(h.id, elapsedDays()) * 100);
    return `
      <div class="hbar-row">
        <span class="e">${habitIcon(h)}</span>
        <div class="hbar-meta">
          <div class="hbar-name">${esc(h.name)}</div>
          <div class="hbar-track"><div class="hbar-fill ${pct < 50 ? 'weak' : ''}" style="width:${pct}%"></div></div>
        </div>
        <span class="hbar-pct">${pct}%</span>
      </div>`;
  }).join('') + (rec !== null ? `<div class="axis-note"><b>Recovery rate: ${rec}%</b> — how often you complete a habit the day right after missing it. Getting back up fast is the real skill.</div>` : '');
}

function arcHistoryCells(first = 0, count = 90, recent = false) {
  const start = startDate();
  const today = atMidnight(operationalDate());
  let cells = '';
  for (let i = first; i < (recent ? first + count : Math.min(90, first + count)); i++) {
    const d = addDays(start, i);
    const k = dkey(d);
    const cls = ['cell'];
    let stateLabel = 'Upcoming';
    if (d > today) cls.push('f');
    else {
      const r = rateFor(k);
      if (r === null) { cls.push('rest'); stateLabel = 'Rest day'; }
      else if (r >= 1) { cls.push('l3'); stateLabel = 'Complete'; }
      else if (r >= 0.5) { cls.push('l2'); stateLabel = `${Math.round(r * 100)}% complete`; }
      else if (r > 0) { cls.push('l1'); stateLabel = `${Math.round(r * 100)}% complete`; }
      else if (k === todayKey()) { cls.push('pending'); stateLabel = 'Not started yet'; }
      else { cls.push('missed'); stateLabel = 'Missed'; }
      if (k === todayKey()) cls.push('now');
    }
    const attrs = d <= today
      ? `data-act="day-open" data-id="${k}" aria-label="${recent ? '' : `Day ${i + 1}, `}${niceDate(k)}: ${stateLabel}"`
      : `disabled aria-label="Day ${i + 1}, future"`;
    cells += `<button class="${cls.join(' ')}" title="Day ${i + 1}: ${stateLabel}" ${k === todayKey() ? 'aria-current="date"' : ''} ${attrs}>${recent ? `<span>${d.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>${d.getDate()}</b>` : ''}</button>`;
  }
  return cells;
}

function grid90() {
  return `<div class="grid90">${arcHistoryCells()}</div>`;
}

/* ============================================================
   COACH
   ============================================================ */

/* ============================================================
   SLEEP — recovery optimizer + log + health shortcuts
   ============================================================ */
function fmtTime12(totalMin) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function fmtTimerLeft(ms) {
  if (!ms || ms <= 0) return '0:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sleepBedtimes() {
  const set = S.health.settings;
  const wake = set.wakeTarget || '07:00';
  const onset = Number(set.sleepOnset) || 14;
  const [wh, wm] = wake.split(':').map(Number);
  const wakeMin = wh * 60 + wm;
  return [
    { cycles: 6, hours: 9,   label: '9h', note: 'Full recovery' },
    { cycles: 5, hours: 7.5, label: '7½h', note: 'Optimal', best: true },
    { cycles: 4, hours: 6,   label: '6h', note: 'Minimum' },
    { cycles: 3, hours: 4.5, label: '4½h', note: 'Emergency', warn: true },
  ].map(s => {
    const totalMin = s.hours * 60 + onset;
    const bedMin = ((wakeMin - totalMin) % (24 * 60) + 24 * 60) % (24 * 60);
    return { ...s, fmt: fmtTime12(bedMin) };
  });
}

// ── SPATIAL SOUND ENGINE ─────────────────────────────────────────────────────
// Sounds are procedurally synthesized (no streaming, no files), rendered offline
// into seamless looping WAV blobs, then played through an <audio> element. Routing
// through the media pipeline (not raw Web Audio) is what makes them survive the iOS
// mute switch, keep playing when the screen locks, and appear in Control Center.
const SOUND_ENGINE = (() => {
  const SR = 32000;
  let active = null;          // currently-playing sound id (set optimistically)
  let audioEl = null;         // shared <audio> element, lives on <body>, survives re-renders
  let fadeTimer = null;
  let timerMin = 15;          // sleep timer: minutes before auto-off (0 = continuous)
  let stopTimeout = null;     // pending auto-off timeout
  let endAt = 0;              // epoch ms when the current timer fires (0 = none)
  let alarmAt = 0;            // epoch ms when the armed alarm rings (0 = disarmed)
  let ringing = false;        // alarm currently sounding
  const cache = {};           // id -> playable URL (object URL for synth, file path for recordings)
  const FILE_BASE = './assets/sounds/';
  // Nature sounds are real CC0 / CC-BY / public-domain field recordings (credits in the
  // Sleep tab). Noise + tones stay synthesized — pure noise/tones have no audible loop.
  const SOUNDS = {
    rain:     { label: 'Rain',       emoji: '🌧', file: 'rain'   },
    ocean:    { label: 'Ocean',      emoji: '🌊', file: 'ocean'  },
    stream:   { label: 'Stream',     emoji: '🏞', file: 'stream' },
    storm:    { label: 'Storm',      emoji: '⛈', file: 'storm'  },
    fire:     { label: 'Fire',       emoji: '🔥', file: 'fire'   },
    wind:     { label: 'Wind',       emoji: '🍃', file: 'wind'   },
    forest:   { label: 'Forest',     emoji: '🐦', file: 'forest' },
    night:    { label: 'Night',      emoji: '🦗', file: 'night'  },
    brown:    { label: 'Deep Sleep', emoji: '🟤', noise: 'brown', filter: { type: 'lowpass',  freq: 700        } },
    white:    { label: 'White',      emoji: '⬜', noise: 'white' },
    fan:      { label: 'Fan',        emoji: '💨', noise: 'white', filter: { type: 'bandpass', freq: 700, Q: 0.8 } },
    binaural: { label: 'Delta',      emoji: '⚡', special: 'binaural', base: 200, beat: 2 },
    theta:    { label: 'Theta',      emoji: '🌀', special: 'binaural', base: 200, beat: 6 },
    hz432:    { label: '432 Hz',     emoji: '✨', special: 'tone', freq: 432 },
    hz528:    { label: '528 Hz',     emoji: '💚', special: 'tone', freq: 528 },
  };
  // Recordings are play-ready URLs from the start, so a tap plays instantly inside the
  // gesture (iOS) and the file streams + caches on demand.
  for (const [id, def] of Object.entries(SOUNDS)) {
    if (def.file) cache[id] = FILE_BASE + def.file + '.mp3';
  }

  function getEl() {
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = 'arc90-audio';
      audioEl.loop = true;
      audioEl.preload = 'auto';
      audioEl.setAttribute('playsinline', '');
      audioEl.setAttribute('webkit-playsinline', '');
      // Lock-screen failsafe: iOS suspends setTimeout while the screen is off, but media
      // 'timeupdate' events keep firing — so the sleep timer still stops on schedule.
      audioEl.addEventListener('timeupdate', () => {
        // Armed alarm first: this event keeps firing under a locked screen, so the
        // swap-to-chime below is what makes Night Mode ring while the phone sleeps.
        if (alarmAt && !ringing && Date.now() >= alarmAt) { startRinging(); return; }
        if (endAt && active && Date.now() >= endAt) fadeOutStop();
      });
      document.body.appendChild(audioEl);
    }
    return audioEl;
  }

  function fillNoise(d, type, n) {
    if (type === 'white') {
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        d[i] = (last + 0.02 * w) / 1.02; last = d[i]; d[i] *= 3.5;
      }
    } else { // pink
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
        b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
      }
    }
  }

  // crossfade the rendered tail back over the head so the loop has no click
  function seamLoop(rendered, lenSamp, seamSamp) {
    const nCh = rendered.numberOfChannels;
    const helper = new OfflineAudioContext(nCh, lenSamp, rendered.sampleRate);
    const out = helper.createBuffer(nCh, lenSamp, rendered.sampleRate);
    for (let c = 0; c < nCh; c++) {
      const r = rendered.getChannelData(c), o = out.getChannelData(c);
      for (let i = 0; i < lenSamp; i++) o[i] = r[i];
      for (let i = 0; i < seamSamp; i++) {
        const w = i / seamSamp;
        o[i] = r[i] * w + r[lenSamp + i] * (1 - w);
      }
    }
    return out;
  }

  function normalize(buf, peak) {
    let max = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > max) max = a; }
    }
    if (max < 1e-5) return buf;
    const g = peak / max;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
    return buf;
  }

  async function renderBuffer(name) {
    const def = SOUNDS[name];
    // Tones/binaural: render a long (45s) loop so the <audio> element's loop-point gap —
    // barely noticeable on noise but a glaring click on a pure tone — recurs rarely instead
    // of every 2s. 16kHz is ample for these low frequencies and halves memory. Every
    // frequency completes whole cycles in 45s (freq×45 is integer), so content stays seamless.
    if (def.special === 'binaural') {
      const base = def.base || 200, beat = def.beat || 2;
      const TSR = 16000, len = TSR * 45;
      const oc = new OfflineAudioContext(2, len, TSR);
      const merger = oc.createChannelMerger(2);
      const o1 = oc.createOscillator(), o2 = oc.createOscillator();
      const g1 = oc.createGain(), g2 = oc.createGain();
      o1.frequency.value = base; o2.frequency.value = base + beat; g1.gain.value = 0.5; g2.gain.value = 0.5;
      o1.connect(g1); g1.connect(merger, 0, 0); o2.connect(g2); g2.connect(merger, 0, 1);
      merger.connect(oc.destination); o1.start(); o2.start();
      return normalize(await oc.startRendering(), 0.6);
    }
    if (def.special === 'tone') {
      const TSR = 16000, len = TSR * 45;
      const oc = new OfflineAudioContext(2, len, TSR);
      const osc = oc.createOscillator(), g = oc.createGain();
      osc.frequency.value = def.freq; osc.type = 'sine'; g.gain.value = 0.5;
      osc.connect(g); g.connect(oc.destination); osc.start();
      return normalize(await oc.startRendering(), 0.5);
    }
    // noise-based: render lenSec + a short seam tail, then crossfade for a clean loop
    let lenSec = 8;
    if (def.mod) { const period = 1 / def.mod.rate; lenSec = Math.max(8, Math.ceil(8 / period) * period); }
    const seam = 0.08;
    const lenSamp = Math.round(SR * lenSec);
    const total = lenSamp + Math.round(SR * seam);
    const oc = new OfflineAudioContext(2, total, SR);
    const src = oc.createBufferSource();
    const nb = oc.createBuffer(2, total, SR);
    fillNoise(nb.getChannelData(0), def.noise, total);
    fillNoise(nb.getChannelData(1), def.noise, total);
    src.buffer = nb;
    let chain = src;
    if (def.filter) {
      const f = oc.createBiquadFilter();
      f.type = def.filter.type; f.frequency.value = def.filter.freq;
      if (def.filter.Q) f.Q.value = def.filter.Q;
      src.connect(f); chain = f;
    }
    if (def.mod) {
      const lfo = oc.createOscillator(), lfoGain = oc.createGain(), amp = oc.createGain();
      lfo.frequency.value = def.mod.rate; lfoGain.gain.value = def.mod.depth; amp.gain.value = 0.7;
      lfo.connect(lfoGain); lfoGain.connect(amp.gain); chain.connect(amp); amp.connect(oc.destination); lfo.start();
    } else {
      chain.connect(oc.destination);
    }
    src.start();
    const rendered = await oc.startRendering();
    return normalize(seamLoop(rendered, lenSamp, Math.round(SR * seam)), 0.55);
  }

  function bufferToWav(buf) {
    const nCh = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const total = 44 + len * nCh * 2;
    const ab = new ArrayBuffer(total); const dv = new DataView(ab); let p = 0;
    const ws = (s) => { for (let i = 0; i < s.length; i++) dv.setUint8(p++, s.charCodeAt(i)); };
    const w32 = (v) => { dv.setUint32(p, v, true); p += 4; };
    const w16 = (v) => { dv.setUint16(p, v, true); p += 2; };
    ws('RIFF'); w32(total - 8); ws('WAVE'); ws('fmt '); w32(16); w16(1); w16(nCh);
    w32(sr); w32(sr * nCh * 2); w16(nCh * 2); w16(16); ws('data'); w32(len * nCh * 2);
    const ch = []; for (let c = 0; c < nCh; c++) ch.push(buf.getChannelData(c));
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nCh; c++) {
        let s = Math.max(-1, Math.min(1, ch[c][i]));
        dv.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true); p += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  function fadeIn(el) {
    clearInterval(fadeTimer);
    let v = 0; el.volume = 0;            // note: iOS ignores el.volume (hardware-only) — harmless no-op there
    fadeTimer = setInterval(() => {
      v = Math.min(0.9, v + 0.05);
      try { el.volume = v; } catch (e) {}
      if (v >= 0.9) clearInterval(fadeTimer);
    }, 90);
  }

  function setMeta(name) {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: SOUNDS[name].label, artist: 'Arc90 · Sleep sounds' });
        navigator.mediaSession.setActionHandler('pause', () => stopAll());
        navigator.mediaSession.setActionHandler('stop', () => stopAll());
      } catch (e) {}
    }
  }

  async function ensureCached(name) {
    if (cache[name]) return cache[name];
    if (SOUNDS[name] && SOUNDS[name].file) { cache[name] = FILE_BASE + SOUNDS[name].file + '.mp3'; return cache[name]; }
    const buf = await renderBuffer(name);
    cache[name] = URL.createObjectURL(bufferToWav(buf));
    return cache[name];
  }

  function clearTimer() {
    if (stopTimeout) { clearTimeout(stopTimeout); stopTimeout = null; }
    endAt = 0;
  }

  // ── Night Mode alarm ──────────────────────────────────────────────────────
  // iOS suspends JS timers under a locked screen but keeps <audio> playing and
  // firing 'timeupdate'. Arming plays a whisper-quiet loop to hold the audio
  // session open all night; at alarmAt the timeupdate handler swaps the SAME
  // element to a loud rising chime — a real alarm through a locked screen.
  async function renderSpecial(kind) {
    if (kind === 'keepalive') {
      // 8s of near-silent brown noise: keeps the session alive, inaudible on a nightstand.
      const len = Math.round(SR * 8);
      const oc = new OfflineAudioContext(2, len, SR);
      const src = oc.createBufferSource();
      const nb = oc.createBuffer(2, len, SR);
      fillNoise(nb.getChannelData(0), 'brown', len);
      fillNoise(nb.getChannelData(1), 'brown', len);
      src.buffer = nb; src.connect(oc.destination); src.start();
      return normalize(await oc.startRendering(), 0.012);
    }
    // Rising 4-note chime (C5 E5 G5 C6), looped — bright enough to wake, not harsh.
    const TSR = 16000, dur = 3.6, len = Math.round(TSR * dur);
    const oc = new OfflineAudioContext(2, len, TSR);
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const t = i * 0.55;
      [1, 2].forEach((harm) => {
        const osc = oc.createOscillator(), g = oc.createGain();
        osc.type = 'sine'; osc.frequency.value = freq * harm;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(harm === 1 ? 0.5 : 0.08, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        osc.connect(g); g.connect(oc.destination);
        osc.start(t); osc.stop(t + 1.6);
      });
    });
    return normalize(await oc.startRendering(), 0.9);
  }
  async function cacheSpecial(kind) {
    const key = '#' + kind;
    if (!cache[key]) cache[key] = URL.createObjectURL(bufferToWav(await renderSpecial(kind)));
    return cache[key];
  }

  function startRinging() {
    ringing = true;
    clearTimer(); clearInterval(fadeTimer);
    const el = getEl();
    if (cache['#alarm']) { el.src = cache['#alarm']; el.loop = true; }
    try { el.volume = 1; } catch (e) {}
    el.play().catch(() => {});
    try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 900]); } catch (e) {}
    try { if (window.__arc90AlarmRing) window.__arc90AlarmRing(); } catch (e) {}
  }

  // Resume the quiet keep-alive if night audio stops for any reason while armed
  // (e.g. the user stops a sleep sound) — the alarm must survive that.
  function reviveKeepalive() {
    if (!alarmAt || ringing || active || !cache['#keepalive']) return;
    active = '#keepalive';
    const el = getEl();
    el.src = cache['#keepalive']; el.loop = true;
    try { el.volume = 1; } catch (e) {}
    el.play().catch(() => { active = null; });
  }

  // Must be called from a user gesture (audio unlock). Returns false if blocked.
  async function armAlarm(epochMs) {
    try { await cacheSpecial('alarm'); await cacheSpecial('keepalive'); } catch (e) { return false; }
    clearTimer();               // armed nights are continuous — a sleep timer would kill the session
    alarmAt = epochMs; ringing = false;
    if (!active) {
      active = '#keepalive';
      const el = getEl();
      el.src = cache['#keepalive']; el.loop = true;
      try { el.volume = 1; await el.play(); } catch (e) { active = null; alarmAt = 0; return false; }
      if ('mediaSession' in navigator) {
        try { navigator.mediaSession.metadata = new MediaMetadata({ title: 'Night Mode — alarm armed', artist: 'Arc90' }); } catch (e) {}
      }
    }
    return true;
  }

  function disarmAlarm() {
    alarmAt = 0; ringing = false;
    stopAll();
  }

  // Gently fade the volume out, then stop. (iOS ignores el.volume, so there it just
  // stops cleanly at the deadline — still does what the timer promises.)
  function fadeOutStop() {
    clearTimer(); // guard: timeupdate failsafe must not re-enter mid-fade
    clearInterval(fadeTimer);
    const el = audioEl;
    if (!el) { stopAll(); return; }
    // Screen locked / backgrounded: intervals are suspended, so stop immediately.
    if (document.hidden) { stopAll(); render(); return; }
    let v = el.volume || 0.9;
    fadeTimer = setInterval(() => {
      v = Math.max(0, v - 0.06);
      try { el.volume = v; } catch (e) {}
      if (v <= 0) { clearInterval(fadeTimer); stopAll(); render(); }
    }, 140);
  }

  function scheduleStop() {
    clearTimer();
    if (!timerMin) return;                 // 0 = continuous, never auto-off
    if (alarmAt) return;                   // armed night: never auto-off, the alarm needs the session
    endAt = Date.now() + timerMin * 60000;
    stopTimeout = setTimeout(fadeOutStop, timerMin * 60000);
  }

  // Change the timer. If a sound is playing, restart the countdown from now.
  function setTimer(min) {
    timerMin = Math.max(0, Number(min) || 0);
    if (active) scheduleStop();
  }

  function stopAll() {
    clearInterval(fadeTimer);
    clearTimer();
    if (audioEl) { try { audioEl.pause(); } catch (e) {} }
    active = null;
    reviveKeepalive();   // no-op unless an alarm is armed
  }

  // Returns 'started' | 'stopped' | 'retry'. Async, but sets `active` synchronously
  // so the UI can show the live state immediately on the same tap.
  async function play(name) {
    if (!SOUNDS[name]) return 'stopped';
    if (active === name) { stopAll(); return 'stopped'; }
    stopAll();
    active = name;
    const el = getEl();
    // Fast path: already rendered — play synchronously inside the tap gesture (iOS unlock).
    if (cache[name]) {
      el.src = cache[name]; el.loop = true;
      try { await el.play(); fadeIn(el); setMeta(name); scheduleStop(); return 'started'; }
      catch (e) { active = null; return 'retry'; }
    }
    // Cold path: render first. The await can break the iOS gesture chain, so if the
    // first play() is blocked we report 'retry' and the next tap (now cached) works.
    try { await ensureCached(name); }
    catch (e) { active = null; return 'retry'; }
    if (active !== name) return 'stopped';   // user changed selection mid-render
    el.src = cache[name]; el.loop = true;
    try { await el.play(); fadeIn(el); setMeta(name); return 'started'; }
    catch (e) { active = null; return 'retry'; }
  }

  // Pre-render every sound in the background so the first tap is instant (and keeps
  // the tap inside the user-gesture window on iOS).
  async function warm() {
    for (const name of Object.keys(SOUNDS)) {
      if (cache[name]) continue;
      try { await ensureCached(name); } catch (e) { /* ignore, will render on demand */ }
    }
  }

  return {
    play, stopAll, warm, setTimer,
    armAlarm, disarmAlarm,
    alarmArmed: () => !!alarmAt,
    alarmRinging: () => ringing,
    getAlarmAt: () => alarmAt,
    getActive: () => active,
    getTimerMin: () => timerMin,
    getRemaining: () => (endAt ? Math.max(0, endAt - Date.now()) : 0),
    SOUNDS,
  };
})();

// ── MEDITATION ENGINE ─────────────────────────────────────────────────────────
const MEDITATION_DEFS = {
  '478':      { name: '4-7-8 Breathing', cycles: 8, steps: [
    { phase: 'in',    duration: 4, label: 'Breathe in'  },
    { phase: 'hold',  duration: 7, label: 'Hold'         },
    { phase: 'out',   duration: 8, label: 'Breathe out'  },
  ]},
  'box':      { name: 'Box Breathing', cycles: 6, steps: [
    { phase: 'in',    duration: 4, label: 'Breathe in'   },
    { phase: 'hold',  duration: 4, label: 'Hold full'    },
    { phase: 'out',   duration: 4, label: 'Breathe out'  },
    { phase: 'empty', duration: 4, label: 'Hold empty'   },
  ]},
  'bodyscan': { name: 'Body Scan', cycles: 1, steps: [
    { phase: 'focus', duration: 15, label: 'Eyes closed. Breathe naturally.'  },
    { phase: 'focus', duration: 20, label: 'Feel your feet. Release tension.' },
    { phase: 'focus', duration: 20, label: 'Relax your legs and hips.'        },
    { phase: 'focus', duration: 20, label: 'Soften your belly. Let it rise.'  },
    { phase: 'focus', duration: 20, label: 'Release your shoulders down.'     },
    { phase: 'focus', duration: 20, label: 'Soften your jaw and forehead.'    },
    { phase: 'out',   duration: 15, label: 'Breathe out remaining tension.'   },
    { phase: 'focus', duration: 10, label: 'You are ready for sleep.'         },
  ]},
  'sigh':     { name: 'Physiological Sigh', cycles: 6, steps: [   // ~60s — fastest calm-down
    { phase: 'in',   duration: 3, label: 'Inhale through your nose'   },
    { phase: 'in',   duration: 1, label: 'Second short sip of air'   },
    { phase: 'out',  duration: 6, label: 'Long exhale through mouth'  },
  ]},
  'coherent': { name: 'Coherent Breathing', cycles: 12, steps: [   // ~2 min — steady calm
    { phase: 'in',   duration: 5, label: 'Breathe in'  },
    { phase: 'out',  duration: 5, label: 'Breathe out' },
  ]},
};
let sleepMed = { session: null, stepIdx: 0, countdown: 0, cycle: 0, interval: null };

function sleepMedStart(id) {
  const def = MEDITATION_DEFS[id]; if (!def) return;
  if (sleepMed.interval) clearInterval(sleepMed.interval);
  const step0 = def.steps[0];
  sleepMed = { session: id, stepIdx: 0, countdown: step0.duration, cycle: 0, interval: null };
  sleepMed.interval = setInterval(() => {
    sleepMed.countdown--;
    if (sleepMed.countdown <= 0) {
      const d = MEDITATION_DEFS[sleepMed.session]; if (!d) { sleepMedStop(); return; }
      sleepMed.stepIdx++;
      if (sleepMed.stepIdx >= d.steps.length * d.cycles) {
        sleepMedStop(); showNudge('Meditation complete. Sleep well. 🌙'); return;
      }
      const step = d.steps[sleepMed.stepIdx % d.steps.length];
      sleepMed.countdown = step.duration;
      sleepMed.cycle = Math.floor(sleepMed.stepIdx / d.steps.length);
    }
    const countEl = document.getElementById('medCountdown');
    const labelEl = document.getElementById('medPhaseLabel');
    const circleEl = document.getElementById('medCircle');
    if (countEl) countEl.textContent = sleepMed.countdown;
    if (labelEl) {
      const d = MEDITATION_DEFS[sleepMed.session];
      if (d) {
        const step = d.steps[sleepMed.stepIdx % d.steps.length];
        labelEl.textContent = step.label;
        if (circleEl) circleEl.className = `med-ring med-${step.phase}`;
      }
    }
  }, 1000);
  render();
}

function sleepMedStop() {
  if (sleepMed.interval) clearInterval(sleepMed.interval);
  sleepMed = { session: null, stepIdx: 0, countdown: 0, cycle: 0, interval: null };
  render();
}

function playAlarmChime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [528, 660, 784, 880].forEach((freq, i) => {
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.connect(g); g.connect(ac.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      const t = ac.currentTime + i * 0.6;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.35);
      g.gain.linearRampToValueAtTime(0, t + 2.2);
      osc.start(t); osc.stop(t + 2.5);
    });
  } catch(e) {}
}

// ── Night Mode alarm: app-side wake screen ───────────────────────────────────
let alarmRingingUI = false;
window.__arc90AlarmRing = () => {
  alarmRingingUI = true;
  S.health.settings.alarmTime = '';   // one-shot, same as the foreground path
  save();
  try { render(); } catch (e) {}
};

function alarmOverlayView() {
  if (!alarmRingingUI) return '';
  const t = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `
    <div class="alarm-overlay" role="alertdialog" aria-label="Alarm ringing">
      <div class="alarm-ov-inner">
        <div class="alarm-ov-time">${t}</div>
        <div class="alarm-ov-word">Rise &amp; build</div>
        <div class="alarm-ov-sub">Day ${dayNumber()} of 90 is yours.</div>
        <button class="btn alarm-ov-stop" data-act="alarm-stop">I’m up</button>
      </div>
    </div>`;
}

function armNightAlarm() {
  const alarm = S.health.settings.alarmTime;
  if (!alarm) { showNudge('Set an alarm time first.'); return; }
  const [ah, am] = alarm.split(':').map(Number);
  const at = new Date(); at.setHours(ah, am, 0, 0);
  if (at <= new Date()) at.setDate(at.getDate() + 1);
  SOUND_ENGINE.armAlarm(at.getTime()).then((ok) => {
    showNudge(ok
      ? 'Night Mode armed. Leave Arc90 open — locking the screen is fine.'
      : 'Audio was blocked — tap Arm once more.');
    render();
  });
}

function meditationRunningView() {
  const def = MEDITATION_DEFS[sleepMed.session]; if (!def) return '';
  const step = def.steps[sleepMed.stepIdx % def.steps.length];
  const colors = { in: 'var(--accent)', hold: '#60a5fa', out: '#34d399', empty: '#94a3b8', focus: 'var(--accent)' };
  return `
    <div class="med-running">
      <div class="med-circle-outer" style="--med-color:${colors[step.phase] || 'var(--accent)'}">
        <div id="medCircle" class="med-ring med-${step.phase}">
          <div class="med-ring-inner">
            <span id="medCountdown" class="med-count">${sleepMed.countdown}</span>
            <span id="medPhaseLabel" class="med-label">${step.label}</span>
          </div>
        </div>
      </div>
      <div class="med-meta">
        <span class="med-sname">${def.name}</span>
        <span class="med-cycle-info">Cycle ${sleepMed.cycle + 1} of ${def.cycles}</span>
      </div>
    </div>`;
}

/* ── Sleep Score: one honest number per night ────────────────────────────────
   duration .55 (goal→goal+1.5h band, oversleep penalty) · consistency .20
   (7-night stddev, needs ≥3 nights) · quality .15 · wake mood .10.
   Same renormalize-over-logged pattern as Readiness — never fabricated. */
function sleepScoreFor(k = todayKey()) {
  const goal = Math.max(4, Number(S.health.settings.sleepGoal) || 7);
  const s = sleepDay(k);
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const parts = [];
  if (s.hours !== '') {
    const hrs = Number(s.hours);
    const dur = hrs >= goal
      ? clamp(hrs <= goal + 1.5 ? 100 : 100 - (hrs - (goal + 1.5)) * 12)
      : clamp((hrs / goal) * 100);
    parts.push({ key: 'duration', label: `${hrs % 1 ? hrs.toFixed(1) : hrs}h`, weight: 0.55, score: dur });
    const rows = sleepStats(7).rows;
    if (rows.length >= 3) {
      const mean = rows.reduce((a, r) => a + r.hours, 0) / rows.length;
      const sd = Math.sqrt(rows.reduce((a, r) => a + (r.hours - mean) ** 2, 0) / rows.length);
      parts.push({ key: 'consistency', label: sd <= 0.75 ? 'Steady window' : sd <= 1.5 ? 'Drifting' : 'Irregular', weight: 0.20, score: clamp(100 - Math.max(0, sd - 0.5) * 53) });
    }
    const qmap = { strong: 100, steady: 75, light: 50, broken: 25 };
    if (s.quality && qmap[s.quality]) parts.push({ key: 'quality', label: { strong: 'Deep', steady: 'Steady', light: 'Light', broken: 'Broken' }[s.quality], weight: 0.15, score: qmap[s.quality] });
  }
  if (s.wakeMood) {
    const ord = (MOOD_OPTIONS.find(([id]) => id === s.wakeMood) || [])[2] || 0;
    if (ord) parts.push({ key: 'wake', label: moodLabel(s.wakeMood) + ' wake', weight: 0.10, score: clamp(ord * 20) });
  }
  const wsum = parts.reduce((a, p) => a + p.weight, 0);
  const score = wsum ? Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0) / wsum) : null;
  const label = score === null ? 'Not logged' : score >= 85 ? 'Excellent' : score >= 70 ? 'Solid' : score >= 50 ? 'Fair' : 'Rough';
  return { score, label, parts };
}

function sleepScoreCard() {
  const ss = sleepScoreFor();
  const C = 326.73;
  const frac = ss.score === null ? 0 : ss.score / 100;
  const stateCls = ss.score === null ? 'none' : ss.score >= 85 ? 'good' : ss.score >= 70 ? 'mid' : ss.score >= 50 ? 'warn' : 'low';
  return `
    <section class="card sleep-score-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Sleep score</span>
        <span class="reminder-state">${ss.parts.length ? `${ss.parts.length} signal${ss.parts.length > 1 ? 's' : ''}` : 'last night'}</span>
      </div>
      <div class="vitality-main">
        <div class="ring-wrap vitality-ring">
          <svg viewBox="0 0 120 120" width="104" height="104">
            <circle class="ring-track" cx="60" cy="60" r="52" fill="none" stroke-width="11"/>
            <circle class="ring-fill" cx="60" cy="60" r="52" fill="none" stroke-width="11"
              stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"/>
          </svg>
          <div class="ring-center">
            <div class="big-num">${ss.score === null ? '<span class="of">--</span>' : `<span data-countup="${ss.score}">0</span>`}</div>
            <div class="of">Sleep</div>
          </div>
        </div>
        <div class="vitality-head">
          <span class="vitality-state ${stateCls}"><span class="dot"></span>${ss.label}</span>
          ${ss.score === null
            ? `<p class="vitality-insight">Log last night below — hours, quality, and how you woke build tonight’s score.</p>`
            : `<div class="ss-chips">${ss.parts.map((p) => `<span class="ss-chip"><b>${esc(p.label)}</b><i style="width:${p.score}%"></i></span>`).join('')}</div>`}
        </div>
      </div>
    </section>`;
}

/* ── Wind-down mode: the bedtime consistency lever ──────────────────────────── */
function windDownActive() {
  const t = S.health.settings.windDown;
  if (!t) return false;
  const [h, m] = t.split(':').map(Number);
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  const start = h * 60 + m;
  return cur >= start || cur < 180; // window runs until 3am
}

function windDownCard() {
  const t = S.health.settings.windDown;
  const lights = sleepDay().lightsOut;
  const next = typeof nextBestRep === 'function' ? nextBestRep() : null;
  const tomorrowRep = S.habits.length ? (next || S.habits[0]) : null;
  if (!t) return `
    <section class="card winddown-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Wind-down</span>
      </div>
      <p class="vitality-insight" style="margin:0 0 10px">Pick an evening hour — from then on, this tab shifts to night mode: tomorrow’s anchor rep, one-tap sounds, and a lights-out log. Bedtime consistency is the strongest sleep lever.</p>
      <div class="sleep-wake-row">
        <span class="swr-label">Start at</span>
        <input type="time" id="windDownInput" value="21:30" class="sleep-wake-input" />
        <button class="mini-act" data-act="winddown-save">Set</button>
      </div>
    </section>`;
  if (!windDownActive()) return `
    <section class="card winddown-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Wind-down</span>
        <button class="mini-act sac-clear" data-act="winddown-clear">Off</button>
      </div>
      <p class="vitality-insight" style="margin:0">Tonight at <b>${fmtTime12(Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]))}</b> this tab shifts into wind-down: anchor rep, sounds, lights-out.</p>
    </section>`;
  return `
    <section class="card winddown-card wd-active">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Wind-down · active</span>
        <button class="mini-act sac-clear" data-act="winddown-clear">Off</button>
      </div>
      ${lights ? `
        <div class="wd-done">
          <div class="wd-moon">🌙</div>
          <div>
            <b>Lights out at ${esc(lights)}</b>
            <small>Good night. Tomorrow’s arc starts with ${tomorrowRep ? esc(shortHabitName(tomorrowRep.name)) : 'your first rep'}.</small>
          </div>
        </div>` : `
        ${tomorrowRep ? `
        <div class="wd-row">
          <span class="wd-label">Tomorrow’s anchor</span>
          <b>${habitIcon(tomorrowRep)} ${esc(shortHabitName(tomorrowRep.name))}</b>
        </div>` : ''}
        <div class="wd-row">
          <span class="wd-label">Drift off to</span>
          <div class="wd-sounds">
            ${['rain', 'ocean', 'brown'].map((id) => `<button class="stm-chip${SOUND_ENGINE.getActive() === id ? ' on' : ''}" data-act="sound-play" data-id="${id}">${SOUND_ENGINE.SOUNDS[id].emoji} ${SOUND_ENGINE.SOUNDS[id].label}</button>`).join('')}
          </div>
        </div>
        <button class="btn wd-lightsout" data-act="lights-out">Lights out — log bedtime</button>
        ${S.health.settings.alarmTime && !SOUND_ENGINE.alarmArmed() ? `<div class="seg-hint" style="margin-top:8px">Alarm set for ${esc(S.health.settings.alarmTime)} — arm Night Mode below so it rings under a locked screen.</div>` : ''}`}
    </section>`;
}

/* ── Sleep debt: rolling 14-night ledger vs goal ────────────────────────────── */
function sleepDebt(nDays = 14) {
  const goal = Math.max(4, Number(S.health.settings.sleepGoal) || 7);
  const today = atMidnight(operationalDate());
  const nights = [];
  let net = 0, logged = 0;
  for (let i = nDays - 1; i >= 0; i--) {
    const k = dkey(addDays(today, -i));
    const s = sleepDay(k);
    const h = s.hours === '' ? null : Number(s.hours);
    if (h !== null) { net += h - goal; logged++; }
    nights.push({ k, h, delta: h === null ? null : h - goal });
  }
  return { nights, net, logged, goal };
}

function sleepDebtCard() {
  const d = sleepDebt(14);
  if (!d.logged) return '';
  const debt = -d.net;
  const wake = S.health.settings.wakeTarget || '07:00';
  const [wh, wm] = wake.split(':').map(Number);
  let clearMin = (wh * 60 + wm) - Math.round((d.goal + 1) * 60);
  clearMin = ((clearMin % 1440) + 1440) % 1440;
  const line = debt > 0.5
    ? `You’re <b>${debt.toFixed(1)}h behind</b> over ${d.logged} night${d.logged > 1 ? 's' : ''}. Lights out by <b>${fmtTime12(clearMin)}</b> clears it in ${Math.max(1, Math.ceil(debt))} night${Math.ceil(debt) > 1 ? 's' : ''}.`
    : debt < -0.5
      ? `You’re <b>${Math.abs(debt).toFixed(1)}h banked</b> ahead of your ${d.goal}h goal. Recovery is compounding.`
      : `Even with your ${d.goal}h goal — steady as she goes.`;
  const bars = d.nights.map((n) => {
    if (n.delta === null) return `<span class="sdb-bar sdb-empty" title="not logged"></span>`;
    const mag = Math.min(24, Math.abs(n.delta) * 12);
    return n.delta >= 0
      ? `<span class="sdb-bar sdb-up" style="--m:${mag.toFixed(0)}px" title="+${n.delta.toFixed(1)}h"></span>`
      : `<span class="sdb-bar sdb-down" style="--m:${mag.toFixed(0)}px" title="${n.delta.toFixed(1)}h"></span>`;
  }).join('');
  return `
    <section class="card sleep-debt-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Sleep debt · 14 nights</span>
        <span class="reminder-state ${debt > 0.5 ? 'sdb-neg' : 'sdb-pos'}">${debt > 0.5 ? `−${debt.toFixed(1)}h` : debt < -0.5 ? `+${Math.abs(debt).toFixed(1)}h` : '±0h'}</span>
      </div>
      <div class="sdb-strip" aria-hidden="true"><span class="sdb-axis"></span>${bars}</div>
      <p class="vitality-insight" style="margin:8px 0 0">${line}</p>
    </section>`;
}

function viewSleep() {
  if (!hasToolAccess('sleep')) return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Sleep</h1>
        <div class="sub">Bedtime, sounds, alarms &amp; recovery signals</div>
      </div>
    </header>
    ${premiumTabLock('sleep', '🌙', ['Sleep Score from duration, consistency & quality', 'Smart Alarm with Night Mode (rings screen-locked)', 'Spatial sounds & guided meditations', 'Sleep debt tracking + Apple Health sync'])}
  `;
  const set = S.health.settings;
  const wake = set.wakeTarget || '07:00';
  const alarm = set.alarmTime || '';
  const stats = sleepStats(7);
  const bedtimes = sleepBedtimes();
  const optimal = bedtimes.find(b => b.best);
  const activeSound = SOUND_ENGINE.getActive();
  const soundTimer = S.health.settings.soundTimerMin ?? 15;
  const protoCount = S.protocols.length;
  const latestSleep = vitalLatest('sleep');
  const lastNight = latestSleep ? `${latestSleep.v}h last logged` : 'not yet logged';
  const heroStat = stats.avg ? `${stats.avg.toFixed(1)}h avg · ${stats.consistency}` : lastNight;
  const wakeMood = sleepDay().wakeMood;

  let alarmCountdown = '';
  if (alarm) {
    const now = new Date(), [ah, am] = alarm.split(':').map(Number);
    const ad = new Date(now); ad.setHours(ah, am, 0, 0);
    if (ad <= now) ad.setDate(ad.getDate() + 1);
    const diff = Math.round((ad - now) / 60000);
    alarmCountdown = `${Math.floor(diff / 60)}h ${diff % 60}m until alarm`;
  }

  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Sleep</h1>
        <div class="sub">${esc(heroStat)} · recovery and wind-down</div>
      </div>
    </header>

    <div class="bento" style="margin-top:12px">
    ${sleepScoreCard()}

    ${halfStat({
      label: 'Alarm',
      value: SOUND_ENGINE.alarmArmed() ? `<span class="ms-amber">●</span><span style="font-size:16px">Armed</span>` : (alarm ? fmtTime12(Number(alarm.split(':')[0]) * 60 + Number(alarm.split(':')[1])) : '—'),
      sub: SOUND_ENGINE.alarmArmed() ? 'Night Mode is on →' : (alarm ? esc(alarmCountdown || 'set') + ' →' : 'Set a smart alarm →'),
      act: 'data-act="scroll-to" data-target=".sleep-alarm-card"',
      aria: 'Jump to the alarm',
    })}
    ${halfStat({
      label: 'Sounds',
      value: SOUND_ENGINE.getActive() && SOUND_ENGINE.getActive() !== '#keepalive' ? `<span style="font-size:16px">${esc(SOUND_ENGINE.SOUNDS[SOUND_ENGINE.getActive()]?.label || 'Playing')}</span>` : '♪',
      sub: SOUND_ENGINE.getActive() && SOUND_ENGINE.getActive() !== '#keepalive' ? 'Live · tap to manage →' : 'Rain, ocean, noise & tones →',
      act: 'data-act="scroll-to" data-target=".sleep-sounds-card"',
      aria: 'Jump to sleep sounds',
    })}

    ${healthSyncCard()}
    ${windDownCard()}

    <section class="card sleep-opt-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Bedtime optimizer</span>
        <span class="reminder-state">90-min cycles</span>
      </div>
      ${optimal ? `
      <div class="sleep-hero-bed">
        <div class="shb-time">${optimal.fmt}</div>
        <div class="shb-label">Optimal bedtime · ${optimal.label} · ${optimal.cycles} cycles</div>
      </div>` : ''}
      <div class="bedtime-slots-v2">
        ${bedtimes.map(b => `
          <div class="bsv2-slot${b.best ? ' bsv2-best' : b.warn ? ' bsv2-warn' : ''}">
            <div class="bsv2-time">${b.fmt}</div>
            <div class="bsv2-hrs">${b.label}</div>
            <div class="bsv2-note">${b.note}</div>
          </div>`).join('')}
      </div>
      <div class="sleep-wake-row">
        <span class="swr-label">Wake at</span>
        <input type="time" id="sleepWakeInput" value="${esc(wake)}" class="sleep-wake-input" />
        <button class="mini-act" data-act="sleep-wake-save">Set</button>
      </div>
    </section>

    <section class="card sleep-wakemood-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Morning check-in</span>
        ${wakeMood ? `<span class="reminder-state">${esc(moodLabel(wakeMood))}</span>` : ''}
      </div>
      <div class="wakemood-q">How did you feel when you woke up today?</div>
      ${wakeMoodChips(wakeMood)}
      <div class="seg-hint" style="margin-top:10px">Logged against today’s sleep — Arc90 will surface how bedtime affects your mornings.</div>
    </section>

    <section class="card sleep-alarm-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Smart alarm</span>
        ${alarm ? `<button class="mini-act sac-clear" data-act="alarm-clear">Clear</button>` : ''}
      </div>
      ${alarm ? `
        <div class="alarm-active">
          <div class="alarm-big-time">${fmtTime12(Number(alarm.split(':')[0])*60+Number(alarm.split(':')[1]))}</div>
          <div class="alarm-countdown">${alarmCountdown}</div>
          ${SOUND_ENGINE.alarmArmed() ? `
            <div class="alarm-armed-pill">● Night Mode armed — rings even with the screen locked</div>
            <div class="alarm-note">Keep Arc90 open on your nightstand and plug the phone in.${SOUND_ENGINE.getActive() && SOUND_ENGINE.getActive() !== '#keepalive' ? ' Your sleep sound stays on until the alarm.' : ' A whisper-quiet track keeps the alarm alive overnight.'}</div>
            <button class="btn btn-ghost alarm-disarm-btn" data-act="alarm-disarm">Disarm Night Mode</button>` : `
            <div class="alarm-note">Set — but iOS only lets this ring while Arc90 is open in the foreground.</div>
            <button class="btn alarm-arm-btn" data-act="alarm-arm">🌙 Arm Night Mode — rings with the screen locked</button>
            <div class="seg-hint" style="margin-top:8px">Arming keeps a near-silent audio session alive so the alarm can sound under a locked screen. Start a sleep sound first to drift off to it.</div>`}
        </div>` : `
        <div class="alarm-setup">
          <div class="alarm-setup-row">
            <input type="time" id="alarmInput" value="${esc(wake)}" class="sleep-wake-input alarm-time-input" />
            <button class="btn alarm-set-btn" data-act="alarm-save">Set alarm</button>
          </div>
          <div class="seg-hint" style="margin-top:10px">Plays an ascending chime when time arrives. Keep app in foreground or add to home screen.</div>
        </div>`}
    </section>

    <section class="card sleep-sounds-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Spatial sounds</span>
        ${activeSound ? `<span class="sounds-live">● Live</span>` : ''}
      </div>
      <div class="sounds-grid">
        ${Object.entries(SOUND_ENGINE.SOUNDS).map(([id, def]) => `
          <button class="sound-chip${activeSound === id ? ' sound-active' : ''}" data-act="sound-play" data-id="${id}">
            <span class="sc-emoji">${def.emoji}</span>
            ${activeSound === id ? `<span class="sc-bars"><i></i><i></i><i></i><i></i></span>` : ''}
            <span class="sc-label">${def.label}</span>
          </button>`).join('')}
      </div>
      <div class="sound-timer-row">
        <span class="stm-label">Sleep timer</span>
        <div class="stm-chips">
          ${[[15,'15m'],[30,'30m'],[60,'1h'],[0,'∞']].map(([m,l]) => `
            <button class="stm-chip${soundTimer === m ? ' on' : ''}" data-act="sound-timer" data-id="${m}">${l}</button>`).join('')}
        </div>
      </div>
      ${activeSound ? `
        <button class="sounds-stop" data-act="sound-stop">■ Stop · ${SOUND_ENGINE.SOUNDS[activeSound]?.label || ''}</button>
        <div class="sound-timer-left">${soundTimer ? `Auto-off in <b id="soundTimerLeft">${fmtTimerLeft(SOUND_ENGINE.getRemaining())}</b>` : 'Playing continuously — tap a time to set a sleep timer'}</div>` : ''}
      <div class="seg-hint" style="margin-top:10px">Nature sounds are real field recordings; noise &amp; tones are generated. Use earbuds for binaural beats. The sleep timer fades the sound out and stops.</div>
      <div class="sound-credits">Recordings via Freesound — Rain by alex36917, Ocean by Luftrum, Storm by digifishmusic (CC BY); Stream, Wind, Forest, Night &amp; Fire are CC0 / public domain.</div>
    </section>

    <section class="card sleep-med-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Sleep meditations</span>
        ${sleepMed.session ? `<button class="mini-act sac-clear" data-act="med-stop">Stop</button>` : ''}
      </div>
      ${sleepMed.session ? meditationRunningView() : `
        <div class="med-list">
          ${[
            {id:'sigh',    icon:'😮‍💨',name:'Physiological Sigh',dur:'1 min',desc:'Fastest way to calm down'},
            {id:'coherent',icon:'🫁',name:'Coherent Breathing', dur:'2 min',desc:'5 in · 5 out, steady calm'},
            {id:'478',     icon:'🌬',name:'4-7-8 Breathing',    dur:'5 min',desc:'Military sleep technique'},
            {id:'box',     icon:'⬛',name:'Box Breathing',      dur:'4 min',desc:'SEAL stress reset'},
            {id:'bodyscan',icon:'🌊',name:'Body Scan',          dur:'8 min',desc:'Progressive muscle release'},
          ].map(m=>`
            <button class="med-item" data-act="med-start" data-id="${m.id}">
              <span class="med-icon">${m.icon}</span>
              <div class="med-info">
                <span class="med-name">${m.name}</span>
                <span class="med-meta">${m.dur} · ${m.desc}</span>
              </div>
              <span class="med-go">›</span>
            </button>`).join('')}
        </div>`}
    </section>

    ${sleepDebtCard()}
    ${sleepAnalysisCard()}

    <div class="sleep-health-nav">
      <button class="shn-chip" data-act="tab" data-id="protocol">
        ${ICONS.protocol}
        <div class="shn-text">
          <span>Supplement Protocol</span>
          <small>${protoCount ? `${protoCount} tracked` : 'Log your stack'}</small>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shn-arr"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <button class="shn-chip" data-act="tab" data-id="vitals">
        ${ICONS.vitals}
        <div class="shn-text">
          <span>Vitals &amp; Metrics</span>
          <small>${esc(lastNight)} · HR · HRV · VO2</small>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shn-arr"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <div class="empty-note" style="padding-top:8px">Arc90 is not a medical device. Sounds and meditations are for relaxation only.</div>
    </div>
  `;
}

function viewProtocol() {
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Protocols</h1>
        <div class="sub">Supplements, nutrition, training, hydration, and sleep signals</div>
      </div>
    </header>

    ${protocolTodayStack()}
    ${protocolTemplatesPanel()}
    ${sleepAnalysisCard()}

    <div class="empty-note" style="padding-top:10px">Track what you already do. Arc90 records patterns, adherence, and body signals only; medical decisions stay with you and a licensed professional.</div>
  `;
}

/* ============================================================
   VITALS — biohacking metrics hub
   ============================================================ */
function vitalVal(key, k) {
  if (key === 'sleep') { const s = sleepDay(k); return s.hours === '' ? null : Number(s.hours); }
  const m = S.health[key];
  if (!m) return null;
  const v = m[k];
  if (v === undefined || v === '' || v === null) return null;
  return key === 'weight' ? v : Number(v);
}

function vitalLatest(key) {
  const today = atMidnight(operationalDate());
  for (let i = 0; i < 90; i++) {
    const k = dkey(addDays(today, -i));
    const v = vitalVal(key, k);
    if (v !== null && v !== undefined && v !== '') return { k, v };
  }
  return null;
}

function vitalTrend(key) {
  const today = atMidnight(operationalDate());
  const vals = [];
  for (let i = 0; i < 90 && vals.length < 2; i++) {
    const v = vitalVal(key, dkey(addDays(today, -i)));
    if (v !== null && v !== '' && v !== undefined && !isNaN(Number(v))) vals.push(Number(v));
  }
  if (vals.length < 2) return null;
  const d = vals[0] - vals[1];
  return { dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat', delta: Math.round(Math.abs(d) * 10) / 10 };
}

function vitalSpark(key, n = 12) {
  const today = atMidnight(operationalDate());
  const vals = [];
  for (let i = n - 1; i >= 0; i--) {
    const raw = vitalVal(key, dkey(addDays(today, -i)));
    vals.push((raw === null || raw === '' || raw === undefined) ? null : Number(raw));
  }
  const nums = vals.filter((x) => x !== null && !isNaN(x));
  if (!nums.length) return vals.map(() => '<i class="cv-spark-bar empty"></i>').join('');
  const max = Math.max(...nums), min = Math.min(...nums), range = Math.max(0.001, max - min);
  return vals.map((v) => {
    if (v === null || isNaN(v)) return '<i class="cv-spark-bar empty"></i>';
    const pct = Math.max(14, Math.round(((v - min) / range) * 100));
    return `<i class="cv-spark-bar" style="height:${pct}%"></i>`;
  }).join('');
}

function vitalCard(m) {
  const latest = vitalLatest(m.key);
  const today = vitalVal(m.key, todayKey());
  const t = vitalTrend(m.key);
  let badge = '';
  if (t && t.dir !== 'flat') {
    const good = m.dir === 'flat' ? null : (m.dir === 'down' ? t.dir === 'down' : t.dir === 'up');
    const cls = good === null ? 'flat' : (good ? 'good' : 'bad');
    badge = `<span class="vital-trend ${cls}">${t.dir === 'up' ? '▲' : '▼'} ${t.delta}</span>`;
  }
  const goalTxt = m.goal
    ? `goal ${m.goal}${m.unit ? ' ' + m.unit : ''}`
    : (m.dir === 'down' ? 'lower trends = better' : m.dir === 'up' ? 'higher trends = better' : 'track the trend');
  return `
    <section class="card vital-card">
      <div class="vital-top"><span class="vital-label">${esc(m.label)}</span>${badge}</div>
      <div class="vital-value">${latest ? esc(String(latest.v)) : '—'}${m.unit ? `<em>${esc(m.unit)}</em>` : ''}</div>
      <div class="vital-spark">${vitalSpark(m.key)}</div>
      <div class="vital-sub">${esc(goalTxt)}</div>
      <div class="vital-log">
        <input id="vital-${m.key}" aria-label="${esc(m.label || m.key)}" type="number" step="${m.step}" min="0" placeholder="${esc(m.ph)}" value="${today !== null && today !== undefined ? esc(String(today)) : ''}"/>
        <button class="btn btn-ghost" data-act="vital-save" data-key="${m.key}">Log</button>
      </div>
    </section>`;
}

function healthSyncCard() {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative) return `
    <section class="card health-sync-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Apple Health</span>
      </div>
      <p class="vitality-insight" style="margin:0">Auto-sync needs the Arc90 iPhone app, not the browser. Log manually here for now.</p>
    </section>`;
  const synced = S.product.nativeBridge;
  return `
    <section class="card health-sync-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Apple Health</span>
        ${synced ? `<span class="reminder-state sdb-pos">● Connected</span>` : ''}
      </div>
      <p class="vitality-insight" style="margin:0 0 10px">${synced ? 'Pull the last 14 days again any time — new Health data replaces stale entries, your manual sleep notes are never overwritten.' : 'Pull steps, weight, sleep, resting heart rate, HRV, and VO2 max straight from Apple Health — no manual logging.'}</p>
      <button class="btn signal-sync" data-act="health-sync">${synced ? 'Sync again' : 'Sync Apple Health'}</button>
    </section>`;
}

function viewVitals() {
  const set = S.health.settings;
  const metrics = [
    { key: 'rhr', label: 'Resting HR', unit: 'bpm', dir: 'down', step: '1', ph: 'bpm' },
    { key: 'hrv', label: 'HRV', unit: 'ms', dir: 'up', step: '1', ph: 'ms' },
    { key: 'vo2', label: 'VO2 max', unit: '', dir: 'up', step: '0.1', ph: 'ml/kg/min' },
    { key: 'weight', label: 'Weight', unit: '', dir: 'flat', step: '0.1', ph: 'kg / lb' },
    { key: 'sleep', label: 'Sleep', unit: 'h', dir: 'up', step: '0.25', ph: 'hours', goal: set.sleepGoal },
    { key: 'steps', label: 'Steps', unit: '', dir: 'up', step: '100', ph: 'steps', goal: set.stepGoal },
    { key: 'water', label: 'Hydration', unit: '', dir: 'up', step: '1', ph: 'glasses', goal: set.waterGoal },
    { key: 'kcal', label: 'Active energy', unit: 'kcal', dir: 'up', step: '10', ph: 'kcal' },
    { key: 'exercise', label: 'Exercise', unit: 'min', dir: 'up', step: '1', ph: 'minutes' },
    { key: 'distance', label: 'Distance', unit: 'km', dir: 'up', step: '0.1', ph: 'km' },
    { key: 'flights', label: 'Flights climbed', unit: '', dir: 'up', step: '1', ph: 'flights' },
    { key: 'spo2', label: 'Blood oxygen', unit: '%', dir: 'up', step: '1', ph: '%' },
    { key: 'resp', label: 'Respiratory rate', unit: '/min', dir: 'flat', step: '0.1', ph: 'breaths/min' },
  ];
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Health signals</h1>
        <div class="sub">Biohacking signals · recovery, sleep, output</div>
      </div>
    </header>
    ${healthSyncCard()}
    <div class="vital-grid">
      ${metrics.map(vitalCard).join('')}
    </div>
    <div class="empty-note" style="padding-top:10px">Log manually for now — the native build can auto-sync these from Apple Health, Oura, or Whoop. Arc90 tracks signals only; it never gives medical advice.</div>
  `;
}

function guidanceHabitPattern() {
  // Compare finished days only; an unfinished day is not a missed day.
  const today = todayKey();
  const keys = recentKeys(8).filter(key => key < today).slice(-7);
  const loggedDays = keys.filter(key => S.habits.some(habit => statusOf(habit.id, key))).length;
  const rows = S.habits.map(habit => ({ habit, stats: habitRateForKeys(habit, keys) }))
    .filter(row => row.stats && row.stats.sched >= 3);
  const ready = loggedDays >= 3 && rows.length > 0;
  const anchor = ready ? rows.filter(row => row.stats.hit >= 3 && row.stats.pct >= 70)
    .sort((a, b) => b.stats.pct - a.stats.pct)[0] || null : null;
  const focus = ready ? rows.filter(row => row.stats.pct < 85 && String(row.habit.id) !== String(anchor?.habit.id))
    .sort((a, b) => a.stats.pct - b.stats.pct)[0] || null : null;
  const scheduled = actionable(today);
  const target = focus?.habit || scheduled.find(habit => !['done', 'min'].includes(statusOf(habit.id, today)))
    || anchor?.habit || scheduled[0] || S.habits[0] || null;
  return { ready, loggedDays, anchor, focus, target };
}

function coachOverviewCard() {
  const mom = momentum();
  const stk = dayStreak();
  const day = dayNumber();
  const { ready, anchor, focus, target } = guidanceHabitPattern();
  const grade = !ready ? 'Building your baseline' : mom >= 75 ? 'Strong' : mom >= 50 ? 'Steady' : 'Room to rebuild';
  const gcls = !ready ? '' : mom >= 50 ? 'good' : 'mid';
  const read = !ready
    ? 'Start with one manageable habit. A few completed days of check-ins will give us a clearer picture of what works for you.'
    : mom >= 75
    ? 'Your recent check-ins are consistent. Keep the routine manageable before adding more.'
    : mom >= 50
      ? 'You have some consistency to build on. Give the harder habits a smaller starting point.'
      : 'Fewer habits were checked off recently. Choose one small step for today, without trying to catch up all at once.';
  const roadmap = [
    anchor ? `Keep <b>${esc(anchor.habit.name)}</b> at its usual time. You checked it off on ${anchor.stats.hit} of ${anchor.stats.sched} recent scheduled days.`
      : target ? `Start with <b>${esc(target.name)}</b>, at a time you can realistically repeat.` : 'Choose one habit that matters to you.',
    focus ? `Give <b>${esc(focus.habit.name)}</b> a smaller starting point: <b>${esc(focus.habit.min || 'a two-minute version')}</b>.`
      : anchor ? 'Keep your current routine steady before adding another commitment.' : 'Pair that small step with a familiar moment, such as finishing breakfast.',
    stk >= 3 ? `You have a ${stk}-day streak. Keep the next step manageable.` : 'Notice what made starting easier, and take that into tomorrow.',
  ];
  return `
    <section class="card coach-overview-card">
      <div class="coach-ov-head">
        <div>
          <span class="eyebrow">Your read · Day ${day} of 90</span>
          <div class="coach-ov-grade ${gcls}">${grade}${ready ? `<span> · ${mom}% momentum</span>` : ''}</div>
        </div>
        <div class="coach-ov-streak"><b>${stk}</b><small>day streak</small></div>
      </div>
      <p class="coach-ov-read">${read}</p>
      <div class="coach-roadmap">
        <span class="coach-roadmap-title">Your 7-day roadmap</span>
        <ol>${roadmap.map((r) => `<li>${r}</li>`).join('')}</ol>
      </div>
    </section>`;
}

function coachPrompts() {
  const { focus } = guidanceHabitPattern();
  const chips = [
    focus ? `How can I make ${focus.habit.name} easier to start?` : 'What habit should I focus on first?',
    'What should I fix this week?',
    'Design a morning routine for my goal',
    'I feel like quitting — what now?',
  ];
  return `
    <div class="coach-prompts">
      ${chips.map((q) => `<button class="coach-prompt-chip" data-act="coach-ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
    </div>`;
}

function guidancePlaybookAnswer(qa) {
  const { ready, anchor, focus, target } = guidanceHabitPattern();
  if (!target) return 'Choose one habit that matters to you. Keep its first step small enough for an ordinary day.';
  const name = `<b>${esc(target.name)}</b>`;
  const minimum = `<b>${esc(target.min || 'a two-minute version')}</b>`;
  if (qa.id === 'easier') return `Prepare what ${name} needs ahead of time, and begin with ${minimum}. You can decide whether to continue after starting.`;
  if (!ready) return `There is not enough completed-day history to identify a pattern yet. Start with ${name}: ${minimum}, after a familiar daily routine.`;
  if (qa.id === 'toomuch') return 'Try the Busy or Recovery day setting when your schedule is tight. Notice which targets you can repeat before adding more commitments.';
  if (focus && anchor) return `Keep <b>${esc(anchor.habit.name)}</b> at its usual time. Try ${minimum} for ${name} after that separate routine, if the timing fits your day.`;
  if (focus) return `Give ${name} one predictable cue, such as finishing breakfast. Start with ${minimum}; there is no need to make up every missed rep today.`;
  return `There is no clear weak habit in the recent completed days. Keep ${name} manageable, and adjust only what feels difficult to repeat.`;
}

function viewCoach() {
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>AI Guidance</h1>
        <div class="sub">Your data, read back to you — with a plan and a place to ask</div>
      </div>
    </header>

    ${coachOverviewCard()}

    <div class="section-gap section-title">Ask your coach</div>
    ${coachPrompts()}
    ${aiPanel()}
    ${meditationPanel()}
    ${weeklyAiReviewCard()}
    ${guidanceSignalCard()}

    <div class="section-gap section-title">Coach playbook</div>
    ${COACH_QA.slice(0, 4).map((qa) => `
      <button class="qa-chip ${openQA === qa.id ? 'open' : ''}" data-act="qa" data-id="${qa.id}">
        <span>${esc(qa.q)}</span><span class="arr">${openQA === qa.id ? '−' : '+'}</span>
      </button>
      ${openQA === qa.id ? `<div class="qa-answer">${guidancePlaybookAnswer(qa)}</div>` : ''}
    `).join('')}
    <button class="qa-chip ${openQA === 'dose' ? 'open' : ''}" data-act="qa" data-id="dose">
      <span>Can you tell me what to take, or how much?</span><span class="arr">${openQA === 'dose' ? '−' : '+'}</span>
    </button>
    ${openQA === 'dose' ? `<div class="qa-answer">${esc(DOSING_BOUNDARY)}</div>` : ''}

    <div class="section-gap section-title">Forge Mode <span class="pro-badge">PRO</span></div>
    ${forgeView()}

    <div class="empty-note" style="padding-top:18px">Coach gives habit-design guidance from your own data. Medical, dosing, and treatment decisions stay with a licensed professional.</div>
  `;
}

function guidanceSignalCard() {
  const { anchor, focus, target } = guidanceHabitPattern();
  const tip = currentTip();
  const insight = focus && anchor
    ? `Try <b>${esc(focus.habit.name)}</b> after <b>${esc(anchor.habit.name)}</b>, if the timing fits. Start with ${esc(focus.habit.min || 'a two-minute version')}.`
    : target ? `Give <b>${esc(target.name)}</b> one familiar cue. Start with ${esc(target.min || 'a two-minute version')}.`
      : 'Choose one habit that matters to you, then make its first step small.';
  return `
    <section class="card guidance-signal-card">
      <div class="card-head">
        <span class="eyebrow">Recommended move</span>
        ${target ? `<button class="mini-act" data-act="shuffle-tip">new</button>` : ''}
      </div>
      <div class="guidance-move">${insight}</div>
      ${target ? `
        <div class="guidance-technique">
          <span>${tip.icon}</span>
          <div>
            <b>${esc(tip.title)}</b>
            <small>${renderTipBody(tip, target)}</small>
          </div>
        </div>` : ''}
    </section>`;
}

function weeklyAiReviewCard() {
  const review = weeklyCoachReview();
  const key = weekReviewKey();
  const saved = guidanceHabitPattern().ready ? S.weeklyReviews[key] || review : review;
  return `
    <section class="card weekly-ai-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Weekly AI review</span>
        <button class="mini-act" data-act="weekly-ai-refresh">refresh</button>
      </div>
      <div class="weekly-ai-line">${esc(saved.summary)}</div>
      <div class="weekly-focus">
        <span>Next week’s one focus</span>
        <b>${esc(saved.focus)}</b>
        <small>${esc(saved.action)}</small>
      </div>
      <div class="seg-hint">Generated from your local tracking data. Connect AI below for conversational coaching, but this weekly review works offline.</div>
    </section>`;
}

function protocolTemplatesPanel() {
  return `
    <section class="card protocol-template-card ${protocolTemplatesOpen ? 'open' : ''}">
      <button class="library-toggle protocol-template-toggle" data-act="proto-template-toggle" aria-expanded="${protocolTemplatesOpen ? 'true' : 'false'}">
        <span>
          <b>Popular protocol templates</b>
          <small>${PROTOCOL_TEMPLATES.length} starters · vitamins, protein, sleep, training, peptides</small>
        </span>
        <i>${protocolTemplatesOpen ? '−' : '+'}</i>
      </button>
      ${protocolTemplatesOpen ? `
        <div class="protocol-template-body">
          <div class="protocol-template-grid">
            ${PROTOCOL_TEMPLATES.map((t) => `
              <button class="protocol-template" data-act="proto-template" data-id="${t.id}">
                <span>${t.emoji}</span>
                <b>${esc(t.name)}</b>
                <small>${esc(t.amount)}</small>
              </button>`).join('')}
          </div>
          <div class="seg-hint">${esc(DOSING_BOUNDARY)}</div>
        </div>` : ''}
    </section>`;
}

function protocolTodayStack() {
  const stats = protocolStats();
  const total = Math.max(1, stats.total);
  const pct = Math.round((stats.loggedToday / total) * 100);
  const rows = protocolPulseRows();
  const remaining = Math.max(0, stats.total - stats.loggedToday);
  const complete = stats.total > 0 && remaining === 0;
  return `
    <section class="card protocol-today-card">
      <div class="protocol-today-head">
        <div>
          <span class="tip-tag" style="margin:0">Daily protocol</span>
          <h3>${stats.total ? (complete ? 'Stack complete' : `${remaining} left today`) : 'Choose your stack'}</h3>
          <p>${stats.total ? 'Tap once to register. Open details only when you need context.' : 'Pick the routines you already follow.'}</p>
        </div>
        <div class="protocol-score">
          <b>${stats.total ? pct : 0}%</b>
          <span>${stats.total ? 'today' : 'ready'}</span>
        </div>
      </div>

      ${S.protocols.length ? protocolCheckSections() : protocolEmptyStarter()}
      ${S.protocols.length ? protocolWeeklyPulse(rows) : ''}

      <div class="protocol-actions">
        <button class="mini-act" data-act="proto-template-toggle">${protocolTemplatesOpen ? 'hide templates' : 'templates'}</button>
        <button class="mini-act" data-act="proto-add">${protoAddOpen ? 'close' : 'manual add'}</button>
        <button class="mini-act" data-act="proto-export">export</button>
      </div>
      ${S.protocols.length ? `<div class="protocol-signal"><b>Signal</b> ${esc(protocolInsight())}</div>` : ''}
      ${protoUrgent ? `<div class="urgent" style="margin-top:12px">⚠️ <div>${esc(URGENT_MSG)}</div></div>` : ''}
      ${protoAddOpen ? protocolAddForm() : ''}
    </section>`;
}

function protocolEmptyStarter() {
  const starters = ['vit-d3', 'magnesium', 'med-morning', 'med-evening', 'med-prn', 'creatine', 'protein', 'peptide-plan', 'omega-3', 'sleep-window', 'caffeine', 'electrolytes']
    .map((id) => PROTOCOL_TEMPLATES.find((t) => t.id === id))
    .filter(Boolean);
  return `
    <div class="protocol-empty-stack compact">
      <span class="pes-hint">Tap what you already take — tracking only, your own label or clinician direction for amounts.</span>
      <div class="protocol-starter-grid">
        ${starters.map((t) => `
          <button data-act="proto-template" data-id="${t.id}" title="${esc(t.name)}">
            <span>${t.emoji}</span>
            <b>${esc(t.name)}</b>
          </button>`).join('')}
      </div>
    </div>`;
}

function protocolWeeklyPulse(rows) {
  const score = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.pct, 0) / rows.length) : 0;
  return `
    <div class="protocol-week-pulse">
      <div class="protocol-week-copy">
        <span>7-day pulse</span>
        <b>${score}%</b>
      </div>
      <div class="protocol-pulse-bars" aria-label="7 day protocol adherence">
        ${rows.map((r) => `
          <div class="protocol-day ${r.today ? 'today' : ''}">
            <i style="height:${Math.max(8, r.pct)}%"></i>
            <span>${esc(r.label)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function protocolCheckSections() {
  const sections = [
    ['day', 'Day dose'],
    ['night', 'Night dose'],
    ['both', 'Day + night'],
    ['flex', 'Flexible'],
  ];
  return `<div class="protocol-check-list">
    ${sections.map(([slot, label]) => {
      const items = S.protocols.filter((p) => (p.slot || inferDoseSlot(p.time)) === slot);
      if (!items.length) return '';
      const kept = items.filter((p) => protocolLoggedOn(p)).length;
      return `
        <div class="protocol-dose-section">
          <span><b>${label}</b><em>${kept}/${items.length}</em></span>
          ${items.map(protocolCheckRow).join('')}
        </div>`;
    }).join('')}
  </div>`;
}

function protocolCheckRow(p) {
  const t = PROTOCOL_TYPES.find((x) => x.id === p.type) || PROTOCOL_TYPES[PROTOCOL_TYPES.length - 1];
  const logged = protocolLoggedOn(p);
  const last = [...(p.logs || [])].reverse().find((l) => l.date !== todayKey());
  const sub = logged
    ? 'Registered today'
    : last
      ? `Last ${niceDate(last.date)}`
      : `${doseSlotLabel(p.slot || inferDoseSlot(p.time))} · ${p.time || 'Any time'}`;
  const open = protoDetailOpen === p.id;
  return `
    <div class="protocol-check-wrap ${open ? 'open' : ''}">
      <button class="protocol-check ${logged ? 'done' : ''}" data-act="proto-toggle-today" data-id="${p.id}">
        <span class="protocol-check-icon">${t.emoji}</span>
        <span class="protocol-check-copy">
          <b>${esc(p.name)}</b>
          <small>${esc(sub)}${p.amount ? ' · ' + esc(compactText(p.amount, 28)) : ''}</small>
        </span>
        <span class="protocol-check-mark">${logged ? '✓' : '+'}</span>
      </button>
      <button class="protocol-detail-toggle ${open ? 'on' : ''}" data-act="proto-detail" data-id="${p.id}" aria-label="${open ? 'Hide' : 'Show'} ${esc(p.name)} details">${open ? '−' : 'i'}</button>
      ${open ? protocolQuickDetail(p) : ''}
    </div>`;
}

function protocolQuickDetail(p) {
  const t = PROTOCOL_TYPES.find((x) => x.id === p.type) || PROTOCOL_TYPES[PROTOCOL_TYPES.length - 1];
  const slot = p.slot || inferDoseSlot(p.time);
  const last = [...(p.logs || [])].reverse().find((l) => l.date !== todayKey());
  return `
    <div class="protocol-quick-detail">
      <div><span>Type</span><b>${t.emoji} ${esc(t.label)}</b></div>
      <div><span>Timing</span><b>${esc(doseSlotLabel(slot))} · ${esc(p.time || 'Any time')}</b></div>
      <div><span>Amount</span><b>${esc(p.amount || 'Your plan')}</b></div>
      <div><span>Frequency</span><b>${esc(p.freq || 'Daily')}</b></div>
      ${(p.reason || p.notes || last) ? `
        <p>${esc(p.reason || p.notes || `Last registered ${niceDate(last.date)}.`)}</p>` : ''}
    </div>`;
}

function protocolCommandCenter() {
  const stats = protocolStats();
  const next = S.protocols.find((p) => !p.logs.some((l) => l.date === todayKey())) || S.protocols[0];
  const urgentLogs = S.protocols.flatMap((p) => p.logs.filter((l) => l.urgent).map((l) => ({ p, l }))).slice(-2).reverse();
  return `
    <section class="card command-center">
      <div class="command-top">
        <div>
          <span class="tip-tag" style="margin:0">Stack command</span>
          <h3>Protocol operations</h3>
        </div>
        <span>${stats.total ? `${stats.loggedToday}/${stats.total}` : 'setup'}</span>
      </div>
      <div class="command-grid">
        <div class="command-tile">
          <span>Schedule</span>
          <b>${next ? `${esc(next.time)} · ${esc(next.name)}` : 'No protocol yet'}</b>
          <small>${next ? esc(next.freq) : 'Add one vitamin, supplement, peptide, or routine.'}</small>
        </div>
        <div class="command-tile">
          <span>Signals</span>
          <b>${stats.logs}</b>
          <small>total body-signal logs</small>
        </div>
        <div class="command-tile">
          <span>Clinician questions</span>
          <b>${urgentLogs.length || (stats.total ? 1 : 0)}</b>
          <small>${urgentLogs.length ? 'urgent flags to discuss' : stats.total ? 'review routine fit and timing' : 'none yet'}</small>
        </div>
        <div class="command-tile">
          <span>Symptoms</span>
          <b>${stats.flags}</b>
          <small>${stats.flags ? 'flagged in history' : 'no urgent flags'}</small>
        </div>
      </div>
    </section>`;
}

function protocolTrackerPanel() {
  const stats = protocolStats();
  const rows = protocolPulseRows();
  return `
    <section class="card protocol-panel minimal-protocol-panel">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Protocol graph</span>
        <button class="mini-act" data-act="proto-export">export</button>
      </div>
      <div class="protocol-hero">
        <div><b>${stats.total}</b><span>tracked</span></div>
        <div><b>${stats.loggedToday}</b><span>logged today</span></div>
        <div><b>${stats.flags}</b><span>urgent flags</span></div>
      </div>
      <div class="protocol-mini-graph">
        ${rows.map((r) => `<div class="protocol-mini-day ${r.today ? 'today' : ''}"><i style="height:${Math.max(8, r.pct)}%"></i><span>${esc(r.label)}</span></div>`).join('')}
      </div>
      ${protoUrgent ? `<div class="urgent">⚠️ <div>${esc(URGENT_MSG)}</div></div>` : ''}
      <div class="axis-note"><b>Signal:</b> ${esc(protocolInsight())}</div>
      ${protoAddOpen ? protocolAddForm() : `<button class="btn" data-act="proto-add" style="padding:13px">Add protocol manually</button>`}
      <div class="seg-hint">${esc(PROTOCOL_DISCLAIMER)}</div>
    </section>`;
}

function protocolAddForm() {
  return `
    <div class="protocol-add">
      <div class="field"><label>Name</label><input id="pName" type="text" placeholder="e.g. Vitamin D, collagen, peptide protocol" maxlength="48"/></div>
      <div class="field"><label>Category</label>
        <div class="chip-grid" id="pTypeChips">
          ${PROTOCOL_TYPES.map((t, i) => `<button class="chip ${i === 1 ? 'on' : ''}" data-ptype="${t.id}">${t.emoji} ${t.label}</button>`).join('')}
        </div></div>
      <div class="field"><label>What are you tracking?</label><input id="pReason" type="text" placeholder="e.g. clinician plan, recovery, sleep, energy" maxlength="100"/></div>
      <div class="field"><label>Dose / amount</label><input id="pAmount" type="text" placeholder="label serving, clinician plan, protein target, duration" maxlength="80"/></div>
      <div class="field"><label>Dose timing</label>
        <div class="seg" id="pSlotSeg">
          <button class="on" data-pslot="day">Day</button>
          <button data-pslot="night">Night</button>
          <button data-pslot="both">Day + night</button>
          <button data-pslot="flex">Flexible</button>
        </div></div>
      <div class="field"><label>Frequency</label>
        <div class="seg" id="pFreqSeg">
          <button class="on" data-pfreq="Daily">Daily</button>
          <button data-pfreq="Weekly">Weekly</button>
          <button data-pfreq="As needed">As needed</button>
        </div></div>
      <div class="field"><label>Reminder time</label><input id="pTime" type="time" value="08:00"/></div>
      <div class="field"><label>Notes (optional)</label><input id="pNotes" type="text" placeholder="e.g. after breakfast, per clinician instructions" maxlength="120"/></div>
      <button class="btn" data-act="proto-save">Save protocol</button>
    </div>`;
}

function sleepAnalysisCard() {
  const stats = sleepStats(7);
  const logged = stats.rows.length;
  const editKey = sleepEditKey && sleepDay(sleepEditKey) ? sleepEditKey : todayKey();
  const editing = sleepDay(editKey);
  const isToday = editKey === todayKey();
  const qualityOptions = [
    ['strong', 'Deep'],
    ['steady', 'Steady'],
    ['light', 'Light'],
    ['broken', 'Broken'],
  ];
  const bars = recentKeys(7).map((k) => {
    const s = sleepDay(k);
    const h = s.hours === '' ? 0 : Number(s.hours);
    const pct = Math.max(8, Math.min(100, Math.round((h / Math.max(stats.goal + 2, 8)) * 100)));
    const cls = `${h >= stats.goal ? 'kept' : h ? 'low' : ''}${k === editKey ? ' editing' : ''}`;
    const dow = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(k + 'T00:00').getDay()] || '';
    return `<button class="sleep-bar ${cls}" data-act="sleep-day" data-key="${k}" aria-label="Log sleep for ${niceDate(k)}"><span class="sh">${h ? h.toFixed(h % 1 ? 1 : 0) : ''}</span><span class="strack"><i style="height:${h ? pct : 8}%"></i></span><span class="sd">${dow}</span></button>`;
  }).join('');
  return `
    <section class="card sleep-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Sleep analysis</span>
        <span class="reminder-state">${logged}/7 logged</span>
      </div>
      <div class="sleep-hero">
        <div>
          <b>${stats.avg ? stats.avg.toFixed(1) : '--'}<em>h</em></b>
          <span>7-day average</span>
        </div>
        <p>${esc(stats.copy)}</p>
      </div>
      <div class="sleep-bars">${bars}</div>
      <div class="forecast-grid sleep-grid">
        <div><span>Goal</span><b>${stats.goal}h+</b></div>
        <div><span>Met goal</span><b>${stats.kept}/${logged || 7}</b></div>
        <div><span>Consistency</span><b>${esc(stats.consistency)}</b></div>
      </div>
      <div class="sleep-form-head">
        <span>Hours slept · <b>${isToday ? 'last night' : niceDate(editKey)}</b></span>
        ${isToday ? '' : `<button class="mini-act" data-act="sleep-day" data-key="${todayKey()}">back to today</button>`}
      </div>
      <div class="sleep-form">
        <input id="sleepHours" aria-label="Hours slept" type="number" min="0" max="18" step="0.25" value="${editing.hours === '' ? '' : esc(editing.hours)}" placeholder="hours"/>
        <div class="seg" id="sleepQualitySeg">
          ${qualityOptions.map(([value, label]) => `<button class="${editing.quality === value ? 'on' : ''}" data-sleep-quality="${value}">${label}</button>`).join('')}
        </div>
        <button class="btn" data-act="sleep-save">Save sleep</button>
      </div>
      <div class="seg-hint">Tap any bar to log the hours you slept that night. Duration, regularity, and next-day energy matter together — this is pattern tracking, not diagnosis.</div>
    </section>`;
}

function forgeView() {
  if (forgeActive()) {
    const focus = S.forge.focus.map((id) => S.habits.find((h) => h.id === id)).filter(Boolean);
    const anchor = S.habits.find((h) => h.id === S.forge.anchor);
    return `
      <section class="card forge-card">
        <div class="card-head" style="margin-bottom:8px">
          <span class="eyebrow" style="color:var(--amber)">Forge Mode · Day ${forgeDay()} of 7</span>
        </div>
        <div class="tip-body" style="margin-bottom:10px">A 7-day reset. Minimum versions only on your focus habits — the win is the streak, not the size.</div>
        ${anchor ? `<div class="forge-day"><span class="fd">ANCHOR</span><div><b>${anchor.emoji} ${esc(anchor.name)}</b> — keep it exactly as is. It holds the day together.</div></div>` : ''}
        ${focus.map((h) => `<div class="forge-day"><span class="fd">FOCUS</span><div><b>${h.emoji} ${esc(h.name)}</b> — minimum only: <b>${esc(h.min || '2-minute version')}</b>, right after the anchor.</div></div>`).join('')}
        <div class="forge-day"><span class="fd">RULE</span><div>Never miss twice. If a day slips, the next day is the minimum version, no negotiation.</div></div>
        <button class="danger-btn" data-act="forge-end" style="margin-top:14px">End Forge Mode</button>
      </section>`;
  }
  return `
    <section class="card forge-card">
      <div class="tip-body" style="margin-bottom:12px"><b>Falling behind?</b> Forge Mode builds a focused 7-day recovery plan: one anchor habit you never miss, your two weakest habits shrunk to their minimum versions, one rule. Less, done daily, rebuilds momentum.</div>
      <button class="btn" data-act="forge-start">Build a focused 7-day recovery plan</button>
    </section>`;
}

/* ---------------- AI Coach (authenticated server proxy) ---------------- */

let aiBusy = false;
let aiError = '';
let authEmail = '';
let authCodeSent = false;
let authBusy = false;
let authStatus = '';

function authPanel() {
  if (window.arc90Auth?.isSignedIn()) return `<div class="auth-panel"><span>Signed in</span><button class="mini-act" data-act="auth-out">Sign out</button></div>`;
  return `<div class="auth-panel">
    <label for="authEmail">Account email</label>
    <input id="authEmail" type="email" autocomplete="email" maxlength="254" value="${esc(authEmail)}" aria-describedby="authStatus" ${authBusy || authCodeSent ? 'disabled' : ''}/>
    ${authCodeSent ? '<label for="authCode">Email code</label><input id="authCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" aria-describedby="authStatus"/>' : ''}
    <button class="btn" data-act="${authCodeSent ? 'auth-verify' : 'auth-request'}" ${authBusy ? 'disabled' : ''}>${authBusy ? 'Please wait...' : authCodeSent ? 'Verify code' : 'Email me a sign-in code'}</button>
    ${authCodeSent ? `<button class="mini-act" data-act="auth-change" ${authBusy ? 'disabled' : ''}>Use another email or resend</button>` : ''}
    <div id="authStatus" role="status">${esc(authStatus)}</div>
  </div>`;
}

async function submitAuth(verify) {
  if (authBusy) return;
  const email = document.getElementById('authEmail');
  const code = document.getElementById('authCode');
  if (!verify) {
    authEmail = email?.value.trim().toLowerCase() || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail) || authEmail.length > 254) { invalidField(email, 'Enter a valid account email.'); return; }
  } else if (!/^\d{6,8}$/.test(code?.value.trim() || '')) { invalidField(code, 'Enter the 6 to 8 digit code from your email.'); return; }
  const value = code?.value.trim();
  if (!window.arc90Auth) { authStatus = 'Sign-in is not available in this build.'; render(); return; }
  authBusy = true;
  authStatus = '';
  render();
  try {
    if (verify) { await window.arc90Auth.verifyCode(authEmail, value); authCodeSent = false; authStatus = ''; }
    else { await window.arc90Auth.requestCode(authEmail); authCodeSent = true; authStatus = 'Check your email for a sign-in code.'; }
  } catch (error) {
    authStatus = error.status === 503 || /not configured|configuration|not available in this build|503/i.test(error.message || '')
      ? 'Sign-in is not configured yet. Please try again later.'
      : verify ? 'The code could not be verified. Check it or request a new code.' : 'Could not send a sign-in code. Please try again later.';
  } finally {
    authBusy = false;
    render();
    document.getElementById(authCodeSent ? 'authCode' : 'authEmail')?.focus();
  }
}

async function authenticatedHeaders() {
  if (typeof window.arc90Auth?.getAccessToken !== 'function') throw new Error('Sign-in is not available in this build. Offline guidance is still available.');
  let token;
  try { token = await window.arc90Auth.getAccessToken(); } catch (_) { /* session unavailable */ }
  if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('Sign in again to continue. Offline guidance is still available.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function aiPanel() {
  const msgs = S.aiChat.length ? S.aiChat : [{ role: 'assistant', content: 'What would you like to work on today?' }];
  return `
    <section class="card ai-card compact-ai-card">
      ${authPanel()}
      <div class="card-head" style="margin-bottom:8px">
        <span class="tip-tag" style="margin:0">AI Guidance</span>
        <button class="mini-act" data-act="ai-clear" ${aiBusy ? 'disabled' : ''}>Clear chat</button>
      </div>
      <div class="chat-box" id="aiChatBox" role="log" aria-label="Coach conversation" aria-live="polite" aria-busy="${aiBusy}">
        ${msgs.map((m) => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}">${esc(m.content)}</div>`).join('')}
        ${aiBusy ? '<div class="msg ai" role="status">Thinking...</div>' : ''}
      </div>
      <div id="aiStatus" role="status">${esc(aiError)}</div>
      <div class="chat-input">
        <input id="aiInput" type="text" aria-label="Message your coach" aria-describedby="aiStatus aiPrivacy" placeholder="Ask your coach..." maxlength="400" ${aiBusy ? 'disabled' : ''}/>
        <button class="btn chat-send" data-act="ai-send" aria-label="Send message" ${aiBusy ? 'disabled' : ''}>↑</button>
      </div>
      <div class="seg-hint" id="aiPrivacy" style="margin-top:9px">Live chat requires sign-in and sends your messages to our AI provider. Offline guidance stays on this device. Medical dosing stays with your clinician.</div>
    </section>`;
}

async function callAI(history) {
  const headers = await authenticatedHeaders();
  const messagesToSend = [];
  let remaining = 12000;
  for (const message of history.slice(-20).reverse()) {
    if (!['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') continue;
    const content = message.content.trim().slice(0, Math.min(2000, remaining));
    if (!content) break;
    messagesToSend.unshift({ role: message.role, content });
    remaining -= content.length;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('/api/coach', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ messages: messagesToSend }),
    });
    const messages = {
      400: 'That message could not be sent. Shorten it and try again.',
      401: 'Sign in to use live coaching. Offline guidance is still available.',
      403: 'Your account cannot access live coaching. Offline guidance is still available.',
      404: 'Live coaching is not available in this build. Offline guidance is still available.',
      429: 'Too many coaching requests. Wait a moment and try again.',
      503: 'Live coaching is not configured yet. Offline guidance is still available.',
    };
    if (!res.ok) throw new Error(messages[res.status] || 'Live coaching is temporarily unavailable. Please try again later.');
    const data = await res.json();
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('The coach returned an empty response. Please try again.');
    return data.reply.slice(0, 12000);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The coach took too long to respond. Please try again.');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Could not connect to live coaching. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendAI() {
  const inp = document.getElementById('aiInput');
  const text = inp ? inp.value.trim() : '';
  if (!text || aiBusy) return;
  if (text.length > 400) { invalidField(inp, 'Keep your message to 400 characters or fewer.'); return; }
  aiError = '';
  S.aiChat.push({ role: 'user', content: text });
  S.aiChat = S.aiChat.slice(-20);
  save();
  aiBusy = true;
  render();
  try {
    const reply = await callAI(S.aiChat.map((m) => ({ role: m.role, content: m.content })));
    S.aiChat.push({ role: 'assistant', content: reply.trim() });
  } catch (err) {
    aiError = err.message;
    S.aiChat.pop();
  }
  S.aiChat = S.aiChat.slice(-20);
  save();
  aiBusy = false;
  render();
  const nextInput = document.getElementById('aiInput');
  if (nextInput) { if (aiError) nextInput.value = text; nextInput.focus(); }
}

function startForge() {
  if (!gate('forge')) return;
  const sorted = [...S.habits].sort((a, b) => habitRate(a.id, 7) - habitRate(b.id, 7));
  const focus = sorted.slice(0, 2).map((h) => h.id);
  const anchor = sorted[sorted.length - 1] ? sorted[sorted.length - 1].id : null;
  S.forge = { start: todayKey(), focus, anchor };
  save();
  render();
  confetti();
}

/* ============================================================
   PROFILE
   ============================================================ */

function viewProfile() {
  const end = addDays(startDate(), 89);
  const r = S.reminders;
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>You</h1>
        <div class="sub">${[S.profile.name, S.profile.occupation].filter(Boolean).map(esc).join(' · ')}</div>
      </div>
    </header>

    <div class="goal-shell you-shell">
    <section class="you-arc" aria-labelledby="youArcTitle">
      <span class="you-kicker">Your 90-day arc</span>
      <h2 id="youArcTitle">${esc(S.profile.goal || 'Set your 90-day goal')}</h2>
      <p>${fmtDate(startDate())} → ${fmtDate(end)}${S.profile.identity ? ` · becoming <b>${esc(S.profile.identity)}</b>` : ''}</p>
      ${S.profile.motivation ? `<blockquote>“${esc(S.profile.motivation)}”</blockquote>` : ''}
      <dl><div><dd>${dayNumber()}<small>/90</small></dd><dt>Day</dt></div><div><dd>${dayStreak()}<small>d</small></dd><dt>Streak</dt></div><div><dd>${totalReps()}</dd><dt>Reps</dt></div></dl>
      <button class="you-edit" data-act="edit">Edit goal & profile</button>
    </section>
    </div>

    <div class="section-title">Today trackers</div>
    <section class="card you-trackers">
      <label class="rem-time-row" for="trackWater"><span><b>Water</b><small>Count glasses on Today.</small></span><input id="trackWater" type="checkbox" ${S.preferences.trackers?.water ? 'checked' : ''}></label>
      <label class="rem-time-row" for="trackMood"><span><b>Mood</b><small>Log how you feel on Today.</small></span><input id="trackMood" type="checkbox" ${S.preferences.trackers?.mood ? 'checked' : ''}></label>
      <div class="seg-hint">Off keeps Today focused on your goal. Your past entries are kept either way.</div>
    </section>

    <div class="section-title">Reminders</div>
    <section class="card reminder-card">
      <div class="reminder-head">
        <span class="eyebrow">Nudge rhythm</span>
        <span class="reminder-state">${r.mode === 'off' ? 'Paused' : r.mode === '2h' ? 'Every 2h' : r.mode === '4h' ? 'Every 4h' : formatClockTime(r.time || '08:00')}</span>
      </div>
      <div class="reminder-modes">
        <button class="rem-mode ${r.mode === 'daily' ? 'on' : ''}" data-act="rem-mode" data-id="daily"><b>Once daily</b><small>one cue</small></button>
        <button class="rem-mode ${r.mode === '4h' ? 'on' : ''}" data-act="rem-mode" data-id="4h"><b>Pulse</b><small>every 4h</small></button>
        <button class="rem-mode hardcore ${r.mode === '2h' ? 'on' : ''}" data-act="rem-mode" data-id="2h"><b>Hardcore</b><small>every 2h</small></button>
        <button class="rem-mode ${r.mode === 'off' ? 'on' : ''}" data-act="rem-mode" data-id="off"><b>Off</b><small>quiet</small></button>
      </div>
      ${r.mode === 'daily' || r.mode === '4h' || r.mode === '2h' ? `
        <label class="rem-time-row" for="setTime">
          <span><b>${r.mode === 'daily' ? 'Reminder time' : 'Start time'}</b><small>${r.mode === 'daily' ? 'Pick the moment you usually drift.' : 'Pulses run from here until ~10pm.'}</small></span>
          <input id="setTime" type="time" value="${esc(r.time)}" data-act-input="rem-time"/>
        </label>` : ''}
      <div class="reminder-note">${r.mode === '2h' ? `Hardcore mode — a relentless nudge every 2 hours from ${formatClockTime(r.time || '08:00')} until night, while Arc90 is open or on your home screen. For the days you refuse to slip.` : r.mode === '4h' ? `Pulse reminders every 4 hours starting near ${formatClockTime(r.time || '08:00')}, while the app is reachable.` : r.mode === 'daily' ? 'A single clean nudge keeps this calm, not noisy.' : 'No reminders. Your reps and progress still track normally.'}</div>
    </section>

    <div class="section-title">Appearance</div>
    <section class="card">
      <div class="theme-swatches">
        ${[
          ['auto',  'Auto',  '#737b82', '#b3dfbd'],
          ['dark',  'Dark',  '#111315', '#b3dfbd'],
          ['light', 'Light', '#f7f8fa', '#28613c'],
        ].map(([id, name, bg, ac]) => `
          <button class="theme-swatch${S.theme === id ? ' on' : ''}" data-act="theme" data-id="${id}" aria-pressed="${S.theme === id}" aria-label="${name} appearance">
            <span class="ts-chip" style="--sw-bg:${bg};--sw-ac:${ac}"><span class="ts-ring"></span></span>
            <span class="ts-name">${name}</span>
          </button>`).join('')}
      </div>
      <div class="seg-hint">Auto follows your iPhone appearance.</div>
      <label class="rem-time-row" for="dayStartHour"><span><b>My day starts at</b><small>Check-offs before this hour belong to the previous day.</small></span><select id="dayStartHour" aria-label="My day starts at">${Array.from({length: 24}, (_, h) => `<option value="${h}"${S.preferences.dayStartHour === h ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></label>
      <label class="rem-time-row" for="reducedMotion"><span><b>Reduce motion</b><small>Use gentle fades in place of chart movement.</small></span><input id="reducedMotion" type="checkbox" ${S.preferences.reducedMotion ? 'checked' : ''}></label>
      <label class="rem-time-row" for="shareNames"><span><b>Details on shared stories</b><small>Include goal and habit names and life-area scores in exports.</small></span><input id="shareNames" type="checkbox" ${S.preferences.shareNames ? 'checked' : ''}></label>
    </section>

    ${isDevHost() ? productReadinessCard() : ''}

    <div class="section-title">Account</div>
    ${authPanel()}
    <button class="btn btn-ghost" data-act="restore-premium">Restore Premium purchase</button>

    ${previewAccessPanel()}
    ${previewAccessActive() ? '' : `<div class="premium-card profile-premium-card">
      <div class="pt">${S.premium ? 'Arc90 Premium · active' : PREMIUM_OFFER.name}</div>
      <div class="ps">${S.premium
        ? 'Adaptive recovery, Focus Contract, full personal patterns, and unlimited routines are active on this device.'
        : `Adaptive recovery · Focus Contract · full personal patterns · unlimited routines. ${PREMIUM_OFFER.note}`}</div>
      ${S.premium
        ? `<button class="btn btn-ghost" data-act="premium-off" style="padding:12px">Switch back to Free (demo)</button>`
        : `<button class="btn" data-act="paywall" style="padding:13px">${PREMIUM_OFFER.cta} · ${PREMIUM_OFFER.price}${PREMIUM_OFFER.interval}</button>`}
    </div>`}

    <div class="section-title">Data & privacy</div>
    ${document.getElementById('privacy-consent') ? '<button class="prow" data-privacy-open aria-controls="privacy-consent" aria-expanded="false"><span class="pl">Privacy choices</span><span class="arr">›</span></button>' : ''}
    <button class="prow" data-act="export"><span class="pe">📤</span><span class="pl">Export my data (JSON)</span><span class="arr">›</span></button>
    <button class="prow" data-act="import"><span class="pe">📥</span><span class="pl">Restore from backup</span><span class="arr">›</span></button>
    <input id="importFile" class="import-input" type="file" accept="application/json,.json"/>
    <button class="danger-btn" data-act="reset">Start over (erases everything)</button>

    <details class="profile-updates">
      <summary>${S.subscribed ? 'Launch updates: subscribed' : 'Launch updates'}</summary>
      ${emailCaptureCard()}
    </details>

    <div class="empty-note">
      🔒 Your tracking records stay on this device. Optional connected features send the information described in Privacy. Export a backup before switching phones or clearing browser data.<br/><br/>
      📲 <b>iPhone:</b> open in Safari → Share → <b>Add to Home Screen</b> for the full-screen app.
    </div>
    ${legalLinks()}
  `;
}

function previewAccessPanel() {
  const preview = window.Arc90PreviewAccess;
  if (!preview || (!preview.available() && !preview.enrolled())) return '';
  const available = preview.available();
  const cutoff = new Date(preview.endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `<label class="preview-access-row" for="previewAccessSwitch">
    <span><b>Preview access</b><small>${available ? `This device only · until ${esc(cutoff)} · no charge` : 'Preview ended'}</small></span>
    <input id="previewAccessSwitch" type="checkbox" role="switch" aria-label="Preview access" ${preview.active() ? 'checked' : ''} ${available ? '' : 'disabled'}>
  </label>`;
}

function productReadinessCard() {
  return `
    <div class="section-title">Native & payments</div>
    <section class="card readiness-card">
      <div class="readiness-row">
        <span></span>
        <div><b>HealthKit bridge</b><small>SwiftUI/Capacitor can pass steps and weight into Arc90. Web fallback is manual.</small></div>
      </div>
      <div class="readiness-row">
        <span>$</span>
        <div><b>Stripe checkout</b><small>Backend endpoint is wired. Add Stripe env vars in production to open live Checkout.</small></div>
      </div>
      <div class="readiness-row">
        <span>📱</span>
        <div><b>App Store path</b><small>SwiftUI gives best notifications/widgets; Capacitor is fastest from this PWA.</small></div>
      </div>
      <div class="readiness-row">
        <span>⌚</span>
        <div><b>Apple Watch bridge</b><small>Ready to mirror Today, habits, hydration, sleep, and protocol signals through WatchConnectivity.</small></div>
      </div>
      <button class="btn btn-ghost" data-act="watch-sync" style="padding:12px;margin-top:12px">Sync Apple Watch snapshot</button>
      <button class="btn btn-ghost" data-act="stripe-checkout" style="padding:12px;margin-top:12px">Test checkout setup</button>
    </section>`;
}

function legalLinks() {
  return `
    <div class="legal-links">
      <a href="privacy.html">Privacy</a>
      <span>·</span>
      <a href="terms.html">Terms</a>
    </div>`;
}

/* ============================================================
   SHEETS
   ============================================================ */

function viewSheet() {
  const arcSheetLabel = { 'brain': 'Map details', 'brain-link': 'Link to a goal', 'brain-goal': sheet.goalId ? 'Edit goal' : 'Add a goal', 'planning-task': 'Edit task' }[sheet.type];
  const inner = sheet.type === 'paywall' ? sheetPaywall()
    : sheet.type === 'brain' ? brainDetailSheet() : sheet.type === 'brain-link' ? brainLinkSheet()
    : sheet.type === 'brain-goal' ? brainGoalSheet()
    : sheet.type === 'planning-task' ? planningTaskSheet()
    : sheet.type === 'support' ? sheetSupport()
    : sheet.type === 'daymode' ? `<div class="day-mode-sheet">${adaptiveDayPanel()}</div>`
    : sheet.type === 'adaptive' ? sheetAdaptive()
    : sheet.type === 'window' ? sheetBestWindow()
    : sheet.type === 'ritual' ? sheetRitual()
    : sheet.type === 'task' ? sheetTask()
    : sheet.type === 'edit' ? sheetEdit()
    : sheet.type === 'day' ? sheetDay()
    : sheet.type === 'review' ? sheetReview()
    : sheet.type === 'protocol' ? sheetProtocol()
    : sheet.type === 'comeback' ? sheetComeback()
    : sheet.type === 'proof' ? sheetProofWall()
    : sheet.type === 'share' ? sheetShare()
    : '';
  return `
    <div class="sheet-wrap">
      <div class="sheet-bg" data-act="close-sheet"></div>
      <div class="sheet" data-sheet-type="${esc(sheet.type)}" role="dialog" aria-modal="true" aria-label="${esc(arcSheetLabel || (sheet.type === 'paywall' ? 'Premium options' : sheet.type === 'edit' ? 'Edit profile' : sheet.type === 'daymode' ? 'Your day' : 'Arc90 ' + sheet.type))}" tabindex="-1">
        <button class="sheet-grab-zone" data-act="close-sheet" aria-label="Close"><span class="sheet-grab"></span></button>
        <button class="sheet-close" data-act="close-sheet" aria-label="Close">✕</button>
        ${inner}
      </div>
    </div>`;
}

function sheetPaywall() {
  const copy = paywallCopy(sheet.context);
  const compare = [
    ['Active habits', `${FREE_HABITS}`, 'Unlimited'],
    ['Personal patterns', 'Limited', 'Full history'],
    ['Forge recovery', '—', 'Included'],
    ['Sleep lab', '—', 'Included'],
    ['Focus Shield', '—', 'Included'],
    ['Proof photos', `${PROOF_FREE_PHOTOS}`, 'Unlimited'],
  ];
  return `
    <div class="paywall-hero">
      <span class="plan-kicker">${esc(copy.eyebrow)}</span>
      <h2>${esc(copy.title)}</h2>
      <div class="sheet-sub">${esc(copy.sub)}</div>
    </div>

    <div class="pay-stack">
      ${premiumBenefits().map(([title, body]) => `
        <div class="pay-stack-row">
          <span class="pc">✓</span>
          <div><b>${esc(title)}</b><small>${esc(body)}</small></div>
        </div>`).join('')}
    </div>

    <div class="pay-compare">
      <div class="pay-compare-row head"><span>What you get</span><span>Free</span><span class="pro">Premium</span></div>
      ${compare.map(([k, f, p]) => `
        <div class="pay-compare-row">
          <span>${esc(k)}</span>
          <span class="${f === '—' ? 'no' : ''}">${esc(f)}</span>
          <span class="yes">${esc(p)}</span>
        </div>`).join('')}
    </div>

    <div class="pay-price2">
      <div class="pp2">${PREMIUM_OFFER.price}<span>${PREMIUM_OFFER.interval}</span></div>
      <div class="pp2-week">${esc(PREMIUM_OFFER.perWeek)}</div>
      <div class="pp2-anchor">${esc(PREMIUM_OFFER.anchor)}</div>
      <div class="pp2-urgency">Review the price and renewal terms at checkout.</div>
    </div>

    <button class="btn pay-cta" data-act="stripe-checkout">${PREMIUM_OFFER.cta} · ${PREMIUM_OFFER.price}${PREMIUM_OFFER.interval}</button>
    <button class="btn btn-ghost" data-act="close-sheet" style="margin-top:9px">Maybe later — continue Free</button>
    <button class="inline-link" data-act="restore-premium" style="display:block;margin:12px auto 0;font-size:13px">Already purchased? Restore Premium</button>
    <div class="pay-trust"><span>✓ Cancel anytime</span><span>✓ Private &amp; local-first</span><span>✓ Secure Stripe</span></div>
  `;
}

function sheetTask() {
  const h = S.habits.find((x) => String(x.id) === String(sheet.id));
  if (!h) return '';
  const todayStats = statusOf(h.id, todayKey()) || (scheduledFor(h, todayKey()) ? 'due' : 'off');
  const rate7 = Math.round(habitRate(h.id, 7) * 100);
  const rate30 = Math.round(habitRate(h.id, 30) * 100);
  const nextDue = nextScheduledDate(h);
  return `
    <h2><span class="h2-glyph">${habitIcon(h)}</span>${esc(h.name)}</h2>
    <div class="sheet-sub">${rhythmLabel(h)} · next due ${niceDate(nextDue)} · today: ${todayStats === 'off' ? 'not scheduled' : todayStats}</div>
    <div class="habit-pulse">
      <div><span>${streak(h.id)}</span><small>streak</small></div>
      <div><span>${rate7}%</span><small>7-day</small></div>
      <div><span>${rate30}%</span><small>30-day</small></div>
    </div>
    ${habitMiniHeat(h)}

    <div class="sheet-section">Tune habit</div>
    <div class="field"><label>Name</label><input id="habitName" type="text" value="${esc(h.name)}" maxlength="56"/></div>
    <div class="field"><label>Minimum version</label><input id="habitMin" type="text" value="${esc(h.min || '2-minute version')}" maxlength="72"/></div>
    <div class="field"><label for="habitGoal">Supports goal</label><select id="habitGoal"><option value="">No purpose linked</option>${(S.brain?.goals || []).filter(goal => goal.status === 'active' && goal.horizon !== 'long').map(goal => `<option value="${esc(goal.id)}"${goal.id === h.goal_id ? ' selected' : ''}>${esc(goal.title)}</option>`).join('')}</select></div>
    <div class="field"><label for="habitArea">Life area</label><select id="habitArea"><option value="">Not set</option>${Object.entries(LIFE_AREAS).map(([id, label]) => `<option value="${id}"${h.life_area === id ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
    ${habitPurpose(h).length ? `<p class="habit-purpose-path">${habitPurpose(h).map(goal => esc(goal.title)).join(' → ')}</p>` : '<p class="habit-purpose-path">Link this habit to a short or mid-term goal in Arc.</p>'}
    <button class="btn btn-ghost tune-save" data-act="habit-save" data-id="${h.id}">Save habit tuning</button>

    <div class="sheet-section">Today</div>
    <button class="act-row" data-act="task-set" data-id="done"><span class="ae">✅</span><div>Complete<div class="as">The full version — counts 100%</div></div></button>
    <button class="act-row" data-act="task-set" data-id="min"><span class="ae">🤏</span><div>Minimum version<div class="as">${esc(h.min || '2-minute version')} — still counts as a win</div></div></button>
    <button class="act-row" data-act="task-set" data-id="skip"><span class="ae">🛌</span><div>Rest day / skip intentionally<div class="as">Excused — doesn’t hurt your Momentum</div></div></button>
    <button class="act-row" data-act="task-set" data-id="clear"><span class="ae">↩️</span><div>Clear today’s status</div></button>
    <div class="sheet-section">Rhythm</div>
    ${rhythmPicker(h)}
    <button class="habit-remove" data-act="remove" data-id="${h.id}">Remove this habit</button>
  `;
}

function rhythmPicker(h) {
  return `
    <div class="rhythm-grid">
      ${Object.entries(RHYTHMS).map(([id, r]) => `
        <button class="${rhythmOf(h) === id ? 'on' : ''}" data-act="rhythm-set" data-id="${h.id}" data-rhythm="${id}">
          <span>${esc(r.short)}</span>
          <small>${esc(r.label)}</small>
        </button>`).join('')}
    </div>`;
}

function reviewFields(k) {
  const l = dlog(k);
  const energy = l.energy || 3;
  return `
    <div class="field">
      <label>Energy</label>
      <input id="reviewEnergy" class="energy-range" type="range" min="1" max="5" step="1" value="${energy}"/>
      <div class="range-labels"><span>low</span><span>steady</span><span>peak</span></div>
    </div>
    <div class="field">
      <label>Mood</label>
      <div class="chip-grid review-moods">
        ${MOOD_OPTIONS.map(([id, label]) => `<button class="chip ${l.mood === id ? 'on' : ''}" data-review-mood="${id}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <label>Win</label>
      <textarea id="reviewWin" rows="2" maxlength="140" placeholder="What helped today?">${esc(l.win)}</textarea>
    </div>
    <div class="field">
      <label>Obstacle or note</label>
      <textarea id="reviewNote" rows="3" maxlength="220" placeholder="What made it harder, easier, or worth repeating?">${esc(l.note)}</textarea>
    </div>`;
}

function sheetReview() {
  const k = sheet.date || todayKey();
  const q = reflectionQuote(k === todayKey() ? 0 : k.split('-').join(''));
  return `
    <h2>Daily reflection</h2>
    <div class="sheet-sub">${niceDate(k)} · Track the context behind the checklist. Tiny notes turn into better coaching later.</div>
    <div class="reflection-quote">
      <span>${esc(q.quote)}</span>
      <small>${esc(q.source)}</small>
    </div>
    ${reviewFields(k)}
    <button class="btn" data-act="review-save">Save reflection</button>
    <div class="pay-note">Private and stored only on this device.</div>
  `;
}

function dayHabitRow(h, k) {
  const st = statusOf(h.id, k);
  const opts = [
    ['done', 'Full'],
    ['min', 'Min'],
    ['skip', 'Skip'],
    ['clear', 'Clear'],
  ];
  return `
    <div class="day-edit-row">
      <div class="day-edit-main">
        <span class="lib-emoji">${habitIcon(h)}</span>
        <div>
          <div class="lib-name">${esc(h.name)}</div>
          <div class="lib-cat">${rhythmLabel(h)} · ${esc(h.min || '2-minute version')}</div>
        </div>
      </div>
      <div class="status-grid">
        ${opts.map(([val, label]) => `<button class="${(st === val || (!st && val === 'clear')) ? 'on' : ''}" data-act="day-status" data-date="${k}" data-id="${h.id}" data-status="${val}">${label}</button>`).join('')}
      </div>
    </div>`;
}

function sheetDay() {
  const k = sheet.date || todayKey();
  const stats = dayStats(k);
  const pct = stats.rate === null ? 'Rest' : `${Math.round(stats.rate * 100)}%`;
  const day = challengeDayFor(k);
  return `
    <h2>${niceDate(k)}</h2>
    <div class="sheet-sub">Day ${Math.max(1, Math.min(90, day))} of 90 · ${stats.total ? `${stats.done}/${stats.total} reps complete` : 'intentional rest day'}</div>
    <div class="day-score ${dayStatusClass(k)}">
      <div><span>${pct}</span><small>completion</small></div>
      <div><span>${dlog(k).energy ? `${dlog(k).energy}/5` : '--'}</span><small>energy</small></div>
      <div><span>${dlog(k).mood ? moodLabel(dlog(k).mood) : '--'}</span><small>mood</small></div>
    </div>
    <div class="sheet-section">Habit statuses</div>
    ${S.habits.length ? `<div class="day-edit-list">${S.habits.map((h) => dayHabitRow(h, k)).join('')}</div>` : '<div class="empty-note">No habits were active.</div>'}
    <div class="sheet-section">Reflection</div>
    ${reviewFields(k)}
    <button class="btn" data-act="review-save">Save day</button>
  `;
}

function sheetEdit() {
  return `
    <h2>Edit profile</h2>
    <div class="field"><label>Name</label><input id="editName" type="text" value="${esc(S.profile.name)}" maxlength="32"/></div>
    <div class="field"><label>Occupation</label><input id="editOcc" type="text" value="${esc(S.profile.occupation)}" maxlength="40"/></div>
    <div class="field"><label>Your 3-month goal</label><input id="editGoal" type="text" value="${esc(S.profile.goal)}" maxlength="80"/></div>
    <button class="btn" data-act="save-edit">Save</button>
  `;
}

function sheetProtocol() {
  return `
    <h2>🧬 Protocol Tracker</h2>
    <div class="sheet-sub">Track routines, reminders, symptoms, and notes — privately, on this device.</div>
    <div class="disclaimer">${esc(PROTOCOL_DISCLAIMER)}</div>
    ${protoUrgent ? `<div class="urgent">⚠️ <div>${esc(URGENT_MSG)}</div></div>` : ''}

    ${S.protocols.map(protoRow).join('') || '<div class="empty-note">Nothing tracked yet. Add what you already use or do — Arc90 only records it.</div>'}

    ${protoAddOpen ? protocolAddForm() : `<button class="btn btn-ghost" data-act="proto-add" style="margin-top:6px">+ Add a protocol</button>`}

    <button class="btn btn-ghost" data-act="proto-export" style="margin-top:9px">📄 Export report for your doctor</button>
  `;
}

function protoRow(p) {
  const t = PROTOCOL_TYPES.find((x) => x.id === p.type) || PROTOCOL_TYPES[PROTOCOL_TYPES.length - 1];
  const logs = [...p.logs].slice(-3).reverse();
  const open = protoOpen === p.id;
  return `
    <div class="proto-row">
      <div class="proto-head">
        <span class="lib-emoji">${t.emoji}</span>
        <div style="flex:1;min-width:0">
          <div class="lib-name">${esc(p.name)}</div>
          <div class="proto-type">${t.label} · ${esc(doseSlotLabel(p.slot || inferDoseSlot(p.time)))} · ${esc(p.freq)} · ${esc(p.time)}${p.amount ? ' · ' + esc(p.amount) : ''}${p.reason ? ' · ' + esc(p.reason) : ''}${p.notes ? ' · ' + esc(p.notes) : ''}</div>
        </div>
        <button class="remove-btn" data-act="proto-del" data-id="${p.id}">✕</button>
      </div>
      ${logs.length ? `<div class="proto-log">${logs.map((l) => `
        <div class="log-line"><span class="ld">${esc(l.date.slice(5))}</span>${l.symptoms.length ? l.symptoms.map((s) => esc(sLabel(s))).join(', ') : 'logged'}${l.note ? ' — ' + esc(l.note) : ''}</div>`).join('')}</div>` : ''}
      ${open ? `
        <div class="proto-log">
          <div class="field"><label>How do you feel? (select any)</label>
            <div class="symptom-chips" id="symChips">
              ${SYMPTOMS.map((s) => `<button class="chip ${s.flag ? 'flagged' : ''}" data-sym="${s.id}">${esc(s.label)}</button>`).join('')}
            </div></div>
          <div class="field"><label>Note (optional)</label><input id="logNote" type="text" placeholder="e.g. energy good, slept 7h" maxlength="120"/></div>
          <button class="btn" data-act="proto-log-save" data-id="${p.id}" style="padding:13px">Save today’s log</button>
        </div>`
      : `<button class="tip-shuffle" data-act="proto-log" data-id="${p.id}" style="margin-top:11px">+ Log today</button>`}
    </div>`;
}
function sLabel(id) { const s = SYMPTOMS.find((x) => x.id === id); return s ? s.label : id; }

/* ============================================================
   ONBOARDING — the interview
   ============================================================ */

const OCCUPATIONS = [
  'Student 🎓', 'Founder 🚀', 'Engineer 🛠️', 'Designer 🎨', 'Healthcare 🩺', 'Creator 🎬',
  'Athlete 🏆', 'Sales 📈', 'Finance 📊', 'Lawyer ⚖️', 'Educator 🍎', 'Trades 🔧',
  'Night-shifter 🌙', 'Parent 🦸', 'Gamer 🎮', 'Artist 🖌️',
];

function renderOnboarding() {
  if (!ob) ob = freshOb();
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const steps = [obWelcome, obAbout, obVision, obGoal, obHabits, obReminders, ...(isNative ? [obHealth] : []), obContract, obEmail, obUpgrade];
  const dotCount = steps.length - 2;
  const dots = ob.step === 0 ? '' :
    `<div class="ob-dots">${Array.from({ length: dotCount }, (_, x) => x + 1).map((i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>`;
  app.innerHTML = `
    <div class="ob ${ob.step === 0 ? 'welcome' : ''} ${ob.step === 4 ? 'reps-step' : ''}">
      ${ob.step > 0 ? `<div class="ob-top"><button class="ob-back" data-act="ob-back">← Back</button>${dots}</div>` : ''}
      <div class="ob-body">${steps[ob.step]()}</div>
    </div>`;
  wireAfterRender();
  hydrateProofImages();
}

function obWelcome() {
  return `
    <div>
      <div class="logo-mark">
        ${logoMarkSvg('onboarding-symbol')}
      </div>
      <div class="brand-name">Arc<em>90</em></div>
      <p class="brand-tag">Build your next 90 days.<br/>One goal, a daily system, and <b>real momentum</b>.</p>
      <button class="btn ob-cta" data-act="ob-next">Start my 90 days</button>
    </div>`;
}

function obAbout() {
  return `
    <div>
      <div class="ob-title">First, what should we <em>call you</em>?</div>
      <div class="ob-sub">Two minutes. You'll leave with a goal, your habits, and a map that connects them.</div>
      <div class="field"><label for="obName">Your name</label>
        <input id="obName" type="text" placeholder="e.g. Michael" value="${esc(ob.name)}" maxlength="32" autocomplete="given-name"/></div>
      <button class="btn ob-cta" data-act="ob-next" id="obNextBtn" ${ob.name.trim() ? '' : 'disabled'}>Continue</button>
    </div>`;
}

// Who you are becoming: 1-3 focus areas (they choose suggested habits) and an optional long-term vision.
function obVision() {
  return `
    <div>
      <div class="ob-title">Who are you <em>becoming</em>?</div>
      <div class="ob-sub">Pick up to 3 areas to focus on. Add a big-picture vision if you have one.</div>
      <div class="field"><label>Focus areas <span style="color:var(--tx-3);font-weight:600">(${ob.cats.size}/3)</span></label>
        <div class="goal-grid">
          ${GOAL_TYPES.map((g) => `<button class="goal-tile ${ob.cats.has(g.id) ? 'on' : ''}" data-act="ob-cat" data-id="${g.id}" aria-pressed="${ob.cats.has(g.id)}"><span class="ge">${g.emoji}</span><span class="gl">${g.label}</span></button>`).join('')}
        </div>
      </div>
      <div class="field"><label for="obVision">Long-term vision <span style="color:var(--tx-3);font-weight:600">(optional)</span></label>
        <input id="obVision" type="text" placeholder="e.g. Become a registered nurse" value="${esc(ob.vision)}" maxlength="80"/></div>
      <button class="btn ob-cta" data-act="ob-next" id="obNextBtn" ${ob.cats.size ? '' : 'disabled'}>Continue</button>
    </div>`;
}

function obGoal() {
  return `
    <div>
      <div class="ob-title">Where are you in <em>90 days</em>?</div>
      <div class="ob-sub">${ob.vision.trim() ? `One goal that moves you toward <b>${esc(ob.vision.trim())}</b>.` : 'One headline goal for the next 90 days.'} Every habit you pick next will feed it.</div>
      <div class="field"><label for="obGoal">My 90-day goal</label>
        <input id="obGoal" type="text" placeholder="e.g. Finish LVN school" value="${esc(ob.goal)}" maxlength="80"/></div>
      <div class="field"><label for="obWhy">Why does it matter? <span style="color:var(--tx-3);font-weight:600">(optional)</span></label>
        <input id="obWhy" type="text" placeholder="The reason you'll remember on hard days" value="${esc(ob.motivation)}" maxlength="100"/></div>
      <button class="btn ob-cta" data-act="ob-next" id="obNextBtn" ${ob.goal.trim() ? '' : 'disabled'}>Continue</button>
    </div>`;
}

function obSuggested() {
  const ids = [];
  for (const c of ob.cats) {
    const g = GOAL_TYPES.find((x) => x.id === c);
    if (g) for (const id of g.suggest) if (!ids.includes(id)) ids.push(id);
  }
  if (!ids.length) ids.push(1, 11, 41);
  return ids.map((id) => HABIT_LIBRARY.find((h) => h.id === id));
}

function obHabits() {
  const suggested = obSuggested();
  const suggestedIds = new Set(suggested.map((h) => h.id));
  const n = ob.picked.size + ob.customs.length;
  const groups = CATEGORIES.filter((c) => c.id !== 'custom').map((c) => {
    const rows = HABIT_LIBRARY.filter((h) => h.cat === c.id && !suggestedIds.has(h.id));
    return rows.length ? `
      <div class="lib-group-head"><span>${c.emoji} ${c.name}</span><span class="count-bub">${rows.length}</span></div>
      ${rows.map((h) => pickRow(h)).join('')}` : '';
  }).join('');
  return `
    <div>
      <div class="ob-title">Your daily <em>reps</em></div>
      <div class="ob-sub">Based on your missions, we suggest these — then browse all 100. Pick up to 8 daily reps.</div>

      <div class="lib-group-head sticky-count"><span>⭐ Suggested for “${esc(ob.goal)}”</span><span class="count-bub" id="obCount">${n} picked</span></div>
      ${suggested.map((h) => pickRow(h)).join('')}
      ${ob.customs.map((c, i) => `
        <button class="pick-row on" data-act="ob-uncustom" data-id="${i}">
          <span class="pick-box">${ICONS.check}</span><span class="lib-emoji">✨</span>
          <div class="lib-name">${esc(c)}</div>
        </button>`).join('')}

      <div class="field" style="margin-top:16px"><label>Invent your own</label>
        <div class="custom-form" style="margin-bottom:0">
          <input id="obCustomName" type="text" placeholder="e.g. Practice salsa 15 min" maxlength="48"/>
          <button class="btn" data-act="ob-custom" style="padding:0 18px">Add</button>
        </div></div>

      <div class="section-title" style="margin-top:20px">The full library <span class="count-bub">100 habits · scroll & tap</span></div>
      ${groups}
      <div class="ob-bottom-cta">
        <button class="btn ob-cta" data-act="ob-next" id="obNextBtn" ${n > 0 ? '' : 'disabled'}>Continue with ${n} habit${n === 1 ? '' : 's'}</button>
      </div>
    </div>`;
}

function pickRow(h) {
  const on = ob.picked.has(h.id);
  return `
    <button class="pick-row ${on ? 'on' : ''}" data-act="ob-pick" data-id="${h.id}">
      <span class="pick-box">${ICONS.check}</span>
      <span class="lib-emoji">${habitIcon(h)}</span>
      <div style="flex:1;min-width:0">
        <div class="lib-name">${esc(h.name)}</div>
        <div class="lib-cat">${catOf(h.cat).emoji} ${catOf(h.cat).name} · min: ${esc(h.min)}</div>
      </div>
    </button>`;
}

function obReminders() {
  return `
    <div>
      <div class="ob-title">When should I <em>nudge</em> you?</div>
      <div class="ob-sub">A cue at the right moment is half the habit. Pick your rhythm.</div>
      <div class="seg" style="margin-bottom:14px">
        <button class="${ob.remMode === 'daily' ? 'on' : ''}" data-act="ob-rem" data-id="daily">Daily</button>
        <button class="${ob.remMode === '4h' ? 'on' : ''}" data-act="ob-rem" data-id="4h">Every 4h</button>
        <button class="${ob.remMode === '2h' ? 'on' : ''}" data-act="ob-rem" data-id="2h">Hardcore</button>
        <button class="${ob.remMode === 'off' ? 'on' : ''}" data-act="ob-rem" data-id="off">Off</button>
      </div>
      ${ob.remMode === 'daily' || ob.remMode === '4h' || ob.remMode === '2h' ? `<div class="field"><label>${ob.remMode === 'daily' ? 'At what time?' : 'Start at what time?'}</label><input id="obTime" type="time" value="${esc(ob.remTime)}"/></div>` : ''}
      <div class="seg-hint">${ob.remMode === 'daily' ? 'Pick the hour you usually drift. That’s where habits go to die.' : ob.remMode === '2h' ? 'Hardcore: a relentless nudge every 2 hours. For when slipping is not an option.' : ob.remMode === '4h' ? 'A steady pulse through the day, starting from your chosen time.' : 'Quiet mode. The 90-day grid will still tell the truth.'}</div>
      <button class="btn ob-cta" data-act="ob-next">Continue</button>
    </div>`;
}

function obIdentity() {
  const ids = [...ob.cats].slice(0, 2).map((c) => { const g = GOAL_TYPES.find((x) => x.id === c); return g ? g.identity : null; }).filter(Boolean);
  return ids.length ? ids.join(' & ') : 'a better me';
}
function obOccupation() {
  const parts = [...ob.occs].map((o) => o.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim());
  if (ob.occCustom.trim()) parts.push(ob.occCustom.trim());
  return parts.filter(Boolean).slice(0, 3).join(' · ');
}

function obHealth() {
  return `
    <div>
      <div class="ob-title">Connect <em>Apple Health</em></div>
      <div class="ob-sub">One tap and Arc90 fills itself — no manual logging, ever.</div>
      <div class="ob-health-list">
        <div class="ob-health-row"><span>👟</span><div><b>Steps auto-complete habits</b><small>Hit 8,000 steps and the rep checks itself off.</small></div></div>
        <div class="ob-health-row"><span>😴</span><div><b>Sleep fills your Sleep Score</b><small>Duration, consistency, and quality — straight from your nights.</small></div></div>
        <div class="ob-health-row"><span>❤️</span><div><b>Heart data powers Readiness</b><small>Resting HR, HRV, and VO2 max feed your daily reserve.</small></div></div>
        <div class="ob-health-row"><span>🔒</span><div><b>Stays on your device</b><small>Read-only. Never uploaded, never used for ads.</small></div></div>
      </div>
      ${ob.healthDone
        ? `<div class="ob-health-ok">✓ Connected — your last 14 days are already in.</div>
           <button class="btn ob-cta" data-act="ob-next">Continue</button>`
        : `<button class="btn ob-cta" data-act="ob-health-connect">Connect Apple Health</button>
           <button class="ob-skip" data-act="ob-next">Skip for now — I’ll log manually</button>`}
    </div>`;
}

function obContract() {
  const identity = obIdentity();
  const end = addDays(atMidnight(operationalDate()), 89);
  const occ = obOccupation();
  const n = ob.picked.size + ob.customs.length;
  return `
    <div>
      <div class="ob-title">Sign the <em>contract</em></div>
      <div class="ob-sub">A promise with a shape is harder to drop.</div>
      <div class="contract-card">
        <div class="line">“I, <b>${esc(ob.name || 'me')}</b>${occ ? ` — ${esc(occ)} by day,` : ' —'} <b>${esc(identity)}</b> by choice — will show up for <b>${n} small habit${n === 1 ? '' : 's'}</b>, every day, for <b>90 days</b>, until: <b>${esc(ob.goal)}</b>.”</div>
        <div class="dates">${fmtDate(new Date())} → ${fmtDate(end)}, ${end.getFullYear()}</div>
      </div>
      <button class="btn ob-cta" data-act="ob-next">Start Day 1</button>
    </div>`;
}

function obEmail() {
  if (ob.emailDone || S.subscribed) return `
    <div>
      <div class="ob-title">You’re <em>in</em>.</div>
      <div class="ob-sub">Your email preference is saved. Your progress stays on this device.</div>
      <div class="ob-health-ok">✓ ${esc(ob.email || 'Email saved')}</div>
      <button class="btn ob-cta" data-act="ob-next">Continue</button>
    </div>`;
  return `
    <div>
      <div class="ob-title">Stay in <em>the loop</em></div>
      <div class="ob-sub">Get optional Arc90 launch and product updates. This does not back up your progress or reserve a price.</div>
      <div class="field" style="margin-top:6px">
        <label>Email</label>
        <input id="obEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(ob.email || '')}" />
        <input id="obEmailHp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />
      </div>
      <label class="ob-consent" for="obEmailConsent">
        <input type="checkbox" id="obEmailConsent" />
        <span>Email me Arc90 launch and product updates. Withdraw consent by emailing <a href="mailto:michael28gh@gmail.com">the developer</a>. <a href="privacy.html">Privacy policy</a></span>
      </label>
      <div id="obEmailErr" class="ob-email-err" aria-live="polite"></div>
      <button class="btn ob-cta" data-act="ob-email-save">Email me updates</button>
      <button class="ob-skip" data-act="ob-next">Skip for now</button>
    </div>`;
}

function obUpgrade() {
  if (hasPremiumAccess()) return `<div><h2 class="ob-title">Ready for day one</h2><button class="btn ob-cta" data-act="ob-finish">Open Arc90</button></div>`;
  const benefits = [
    ['♾️', 'Unlimited habits & custom routines', `Go past the free ${FREE_HABITS}-habit limit and build the whole system.`],
    ['🧠', 'Coach AI + weekly reviews', 'Personal reads on your data and what to fix next.'],
    ['🔥', 'Forge recovery mode', 'A 7-day comeback plan for when you slip — before it becomes a lost week.'],
    ['📊', 'Axis dashboard & exports', 'Deeper analytics and a 90-day export you keep forever.'],
    ['🌙', 'Full Sleep toolkit', 'Sleep Score, Smart Alarm with Night Mode, spatial sounds & guided meditations.'],
    ['🎯', 'Full Focus toolkit', 'Focus timer and in-app shield. Blocking other apps requires supported native integration and permission.'],
  ];
  return `
    <div class="ob-pay">
      <button class="ob-pay-x" data-act="ob-finish" aria-label="Continue with the free version">✕</button>
      <div class="ob-pay-kicker">${esc(PREMIUM_OFFER.name)} · Launch offer</div>
      <h2 class="ob-pay-title">Go all-in on your <em>90 days</em></h2>
      <p class="ob-pay-sub">You’ve set the goal and signed the contract. Premium gives you the full system built to actually get you there.</p>
      <div class="ob-pay-benefits">
        ${benefits.map(([i, t, d]) => `
          <div class="ob-pay-benefit">
            <span class="obb-ico">${i}</span>
            <span class="obb-txt"><b>${esc(t)}</b><small>${esc(d)}</small></span>
            <span class="obb-check">${ICONS.check}</span>
          </div>`).join('')}
      </div>
      <div class="ob-pay-price">
        <div class="obp-amt">${PREMIUM_OFFER.price}<span>${PREMIUM_OFFER.interval}</span></div>
        <div class="obp-week">${esc(PREMIUM_OFFER.perWeek)} · ${esc(PREMIUM_OFFER.cadence)}</div>
        <div class="obp-anchor">${esc(PREMIUM_OFFER.anchor)}</div>
      </div>
      <button class="btn ob-pay-cta" data-act="ob-premium">${esc(PREMIUM_OFFER.cta)}</button>
      <div class="ob-pay-fine">Optional. Start Free or review the price and renewal terms at checkout.</div>
      <button class="ob-pay-skip" data-act="ob-finish">Continue with the free version</button>
    </div>`;
}

function finishOnboarding() {
  S.profile = {
    name: ob.name.trim(),
    occupation: obOccupation(),
    goal: ob.goal.trim(),
    goalCats: [...ob.cats],
    identity: obIdentity(),
    motivation: ob.motivation.trim(),
    start: todayKey(),
  };
  S.habits = [...ob.picked].slice(0, FREE_HABITS).map((id) => {
    const h = HABIT_LIBRARY.find((x) => x.id === id);
    return { id: h.id, emoji: h.emoji, name: h.name, cat: h.cat, min: h.min, rhythm: 'daily' };
  });
  for (const c of ob.customs.slice(0, FREE_CUSTOM)) {
    if (S.habits.length >= FREE_HABITS) break;
    S.customSeq++;
    S.habits.push({ id: 'c' + S.customSeq, emoji: '✨', name: c, cat: 'custom', min: '2-minute version', rhythm: 'daily' });
  }
  const firstGoalId = crypto.randomUUID();
  const visionId = ob.vision.trim() ? crypto.randomUUID() : null;
  if (visionId) S.brain.goals.push({ id: visionId, title: ob.vision.trim(), horizon: 'long', parent_goal_id: null, status: 'active', created_at: new Date().toISOString() });
  S.brain.goals.push({ id: firstGoalId, title: ob.goal.trim(), horizon: 'mid', parent_goal_id: visionId, status: 'active', created_at: new Date().toISOString() });
  S.profile.arcGoalId = firstGoalId;
  S.habits.forEach((habit) => { habit.goal_id = firstGoalId; });
  const openDraft = !!ob.brainDump.trim();
  if (openDraft) {
    const draft = { id: crypto.randomUUID(), raw_text: ob.brainDump.trim(), status: 'draft', created_at: new Date().toISOString(), items: [], ids: {} };
    S.brain.drafts.unshift(draft);
    S.brain.activeDraftId = draft.id;
    brainStage = 'dump';
    arcWorkspace = 'brain';
  }
  S.reminders = { mode: ob.remMode, time: ob.remTime };
  S.onboarded = true;
  save();
  track('onboarding_completed');
  ob = null;
  if (S.reminders.mode !== 'off' && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  tab = openDraft ? 'progress' : 'today';
  render();
  confetti();
}

/* ============================================================
   EVENTS
   ============================================================ */

document.addEventListener('click', (e) => {
  /* protocol form chip toggles (local, no re-render) */
  const ptype = e.target.closest('[data-ptype]');
  if (ptype) { ptype.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); ptype.classList.add('on'); return; }
  const pfreq = e.target.closest('[data-pfreq]');
  if (pfreq) { pfreq.parentElement.querySelectorAll('button').forEach((c) => c.classList.remove('on')); pfreq.classList.add('on'); return; }
  const pslot = e.target.closest('[data-pslot]');
  if (pslot) { pslot.parentElement.querySelectorAll('button').forEach((c) => c.classList.remove('on')); pslot.classList.add('on'); return; }
  const sleepQuality = e.target.closest('[data-sleep-quality]');
  if (sleepQuality) { sleepQuality.parentElement.querySelectorAll('button').forEach((c) => c.classList.remove('on')); sleepQuality.classList.add('on'); return; }
  const sym = e.target.closest('[data-sym]');
  if (sym) { sym.classList.toggle('on'); return; }
  const reviewMood = e.target.closest('[data-review-mood]');
  if (reviewMood) {
    reviewMood.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
    reviewMood.classList.add('on');
    return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  switch (act) {
    case 'side-open': navOpen = true; render(); break;
    case 'side-close': navOpen = false; render(); break;
    case 'more-toggle': setToolsMenu(!moreOpen); break;
    case 'more-close': setToolsMenu(false); break;
    case 'tab': if (id === 'progress' && el.classList.contains('pd-next')) arcWorkspace = 'map'; switchTab(id); break;
    case 'habits-add-scroll': document.getElementById('habitsAdd')?.scrollIntoView({ behavior: Arc90Motion.reduced() ? 'auto' : 'smooth', block: 'start' }); document.getElementById('customName')?.focus({ preventScroll: true }); break;
    case 'progress-range': {
      const range = Number(id);
      if (![7, 30, 90].includes(range) || range === progressRange) break;
      progressRange = range;
      progressSelected = range === 7 ? 6 : 5;
      render();
      document.querySelector('.approved-chart')?.classList.add('chart-refresh');
      document.querySelector(`[data-act="progress-range"][data-id="${range}"]`)?.focus({ preventScroll: true });
      break;
    }
    case 'progress-point': {
      progressSelected = Math.max(0, Number(id) || 0);
      render();
      document.querySelector(`[data-act="progress-point"][data-id="${progressSelected}"]`)?.focus({ preventScroll: true });
      break;
    }
    case 'mood-point': {
      moodSelected = Math.max(0, Number(id) || 0);
      render();
      document.querySelector(`[data-act="mood-point"][data-id="${moodSelected}"]`)?.focus({ preventScroll: true });
      break;
    }
    case 'support-capacity': {
      if (![5, 15, 30, 60].includes(Number(id))) break;
      S.daySupport = { ...daySupport(), capacity: Number(id), picks: [] }; save(); render();
      document.querySelector('[data-act="support-reset"][data-id="capacity"]')?.focus({ preventScroll: true }); break;
    }
    case 'support-friction': {
      if (!['time', 'energy', 'distractions', 'unsure'].includes(id)) break;
      S.daySupport = { ...daySupport(), friction: id }; save(); render();
      document.querySelector('[data-act="support-reset"][data-id="friction"]')?.focus({ preventScroll: true }); break;
    }
    case 'support-reset': {
      const support = daySupport();
      if (id === 'capacity') { support.capacity = null; support.picks = []; }
      else if (id === 'friction') support.friction = '';
      else break;
      S.daySupport = support; save(); render();
      document.querySelector(`[data-act="support-${id}"]`)?.focus({ preventScroll: true }); break;
    }
    case 'support-plan': sheet = { type: 'support', date: todayKey(), plan: supportPlan() }; render(); break;
    case 'support-apply': {
      if (sheet?.date !== todayKey()) { closeSheet(); showNudge('A new day has started. Choose today\'s capacity.'); break; }
      const plan = supportPlan();
      if (JSON.stringify(plan) !== JSON.stringify(sheet.plan)) {
        sheet.plan = plan; render(); showNudge('Your habits changed. Review the updated picks before applying.'); break;
      }
      if (!plan.items.length) { render(); break; }
      S.daySupport = { ...daySupport(), picks: plan.items.map((item) => String(item.id)) };
      S.adaptive.date = todayKey(); S.adaptive.mode = 'busy'; save(); closeSheet();
      document.querySelector('.today-habits-section')?.scrollIntoView({ block: 'start', behavior: 'instant' }); break;
    }
    case 'support-help': {
      const friction = daySupport().friction;
      if (friction === 'time') { S.adaptive.date = todayKey(); S.adaptive.mode = 'busy'; save(); render(); showNudge('Busy mode is on. Your previous check-offs are unchanged.'); }
      else if (friction === 'energy') { sheet = { type: 'adaptive', pendingMode: 'recovery', date: todayKey() }; render(); }
      else if (friction === 'distractions') {
        const h = supportFocusHabit();
        if (h || S.focus.active || S.focus.pendingCompletion) { sheet = { type: 'ritual', id: h?.id, date: todayKey() }; render(); }
      } else if (friction === 'unsure') { sheet = { type: 'support', kind: 'next', date: todayKey() }; render(); }
      break;
    }
    case 'support-pick': {
      if (sheet?.date !== todayKey()) { closeSheet(); break; }
      const h = pendingSupportHabits().find((item) => String(item.id) === id);
      if (!h) { render(); break; }
      S.daySupport = { ...daySupport(), picks: [String(h.id)] }; save(); closeSheet();
      document.querySelector('.today-habits-section')?.scrollIntoView({ block: 'start', behavior: 'instant' }); break;
    }
    case 'daymode-open': sheet = { type: 'daymode', date: todayKey() }; render(); break;
    case 'adaptive-mode': {
      if (!['full', 'busy', 'recovery'].includes(id)) break;
      if (sheet?.type === 'daymode' && sheet.date !== todayKey()) {
        closeSheet(); showNudge('A new day has started. Open Your day again.'); break;
      }
      if (id === 'recovery' && !S.habits.some((h) => S.adaptive.essentialIds.includes(String(h.id)))) {
        sheet = { type: 'adaptive', pendingMode: 'recovery', date: todayKey() }; render(); break;
      }
      S.adaptive.date = todayKey(); S.adaptive.mode = id; save();
      if (sheet?.type === 'daymode') closeSheet(); else render();
      break;
    }
    case 'adaptive-recommend': {
      if (!['full', 'busy', 'recovery'].includes(id)) break;
      if (sheet?.type !== 'daymode' || sheet.date !== todayKey()) {
        closeSheet(); showNudge('A new day has started. Open Your day again.'); break;
      }
      if (adaptiveRecommendation().mode !== id) {
        render(); showNudge('Your signals changed. Review the updated suggestion.'); break;
      }
      if (id === 'recovery' && !S.habits.some((h) => S.adaptive.essentialIds.includes(String(h.id)))) {
        sheet = { type: 'adaptive', pendingMode: 'recovery', date: todayKey() }; render(); break;
      }
      S.adaptive.date = todayKey(); S.adaptive.mode = id; save(); closeSheet();
      showNudge(`${{ full: 'Full', busy: 'Busy', recovery: 'Recovery' }[id]} day is on. Your check-offs are unchanged.`);
      break;
    }
    case 'adaptive-essentials': sheet = { type: 'adaptive' }; render(); break;
    case 'adaptive-save': {
      if (sheet?.pendingMode && sheet.date !== todayKey()) { closeSheet(); showNudge('A new day has started. Choose today\'s essentials again.'); break; }
      const ids = [...document.querySelectorAll('input[name="essential"]:checked')].map((input) => input.value);
      if (!ids.length) { showNudge('Choose at least one essential.'); break; }
      S.adaptive.essentialIds = ids;
      if (sheet?.pendingMode) { S.adaptive.date = todayKey(); S.adaptive.mode = sheet.pendingMode; }
      save(); closeSheet(); break;
    }
    case 'adaptive-reset-hints': S.adaptive.dismissed = {}; save(); render(); break;
    case 'adaptive-check': {
      const h = S.habits.find((item) => String(item.id) === id);
      if (!h) break;
      const sourceWasNextMove = el.classList.contains('next-move-action');
      const activeArcRing = document.querySelector('.hero-card .ring-fill');
      const previousArcOffset = activeArcRing ? parseFloat(getComputedStyle(activeArcRing).strokeDashoffset) : NaN;
      const previousCompletion = todayCompletion();
      const previousStreak = dayStreak();
      const completing = !isCompleted(h.id, todayKey());
      setStatus(h.id, todayKey(), completing ? adaptiveTarget(h).status : null);
      const milestone = completing ? claimStreakMilestone(previousStreak, dayStreak()) : 0;
      if (completing && !Arc90Motion.reduced() && navigator.vibrate) navigator.vibrate(12);
      render();
      animateHabitProgress(previousArcOffset);
      animateHistoryProgress(completing);
      const button = [...document.querySelectorAll('.adaptive-habit-item [data-act="adaptive-check"]')]
        .find((node) => node.dataset.id === String(h.id));
      if (completing) {
        button?.closest('.adaptive-habit-item')?.classList.add('just-completed');
        Arc90Motion.pulsePurpose(button?.closest('.adaptive-habit-item'));
        if (milestone && !Arc90Motion.reduced()) {
          document.querySelector('.hero-card')?.classList.add('streak-milestone');
          if (navigator.vibrate) navigator.vibrate(35);
        }
      }
      (sourceWasNextMove ? document.querySelector('.next-move-action') || button : button || document.querySelector('.next-move-action'))
        ?.focus({ preventScroll: true });
      celebrateTodayCompletion(previousCompletion);
      if (completing) showFeelNudge(h, milestone);
      break;
    }
    case 'adaptive-window': sheet = { type: 'window', id }; render(); break;
    case 'adaptive-dismiss': S.adaptive.dismissed[id] = true; save(); closeSheet(); break;
    case 'adaptive-remind': {
      const h = S.habits.find((item) => String(item.id) === id);
      const timing = h && bestHabitWindow(h);
      if (!timing) break;
      S.reminders.mode = 'daily'; S.reminders.time = `${String(timing.startHour).padStart(2, '0')}:00`;
      save(); closeSheet(); syncPushSubscription();
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => syncPushSubscription()).catch(() => {});
      showNudge('Daily reminder updated. Delivery depends on notification permission.'); break;
    }
    case 'ritual-open': sheet = { type: 'ritual', id, date: todayKey(), minutes: Number(el.dataset.minutes) || null }; render(); break;
    case 'ritual-start': {
      if (S.focus.active || S.focus.pendingCompletion) { render(); break; }
      if (sheet?.date !== todayKey()) {
        sheet = { type: 'ritual', id, date: todayKey() }; render();
        showNudge('A new day has started. Review today\'s target before starting.'); break;
      }
      const h = S.habits.find((item) => String(item.id) === id);
      const input = document.getElementById('ritualMinutes');
      const minutes = Number(input?.value);
      if (!h) break;
      if (!input?.value || !Number.isInteger(minutes) || minutes < 1 || minutes > 180) { invalidField(input, 'Choose 1 to 180 whole minutes.'); break; }
      const target = adaptiveTarget(h);
      const strict = focusNativeBridgeAvailable() && !!document.getElementById('ritualShield')?.checked;
      startFocusSession(minutes, target.label, strict, { habitId: String(h.id), goalDate: todayKey(), targetStatus: target.status, targets: [target.label] });
      closeSheet(); break;
    }
    case 'ritual-stop': finishFocusSession('ended'); closeSheet(); showNudge('Session ended. Your habit is unchanged.'); break;
    case 'ritual-complete': {
      const pending = S.focus.pendingCompletion;
      const h = pending && S.habits.find((item) => String(item.id) === pending.habitId);
      if (h && !isCompleted(h.id, pending.date)) setStatus(h.id, pending.date, pending.status);
      S.focus.pendingCompletion = null; save(); closeSheet(); break;
    }
    case 'ritual-dismiss': S.focus.pendingCompletion = null; save(); closeSheet(); break;
    case 'toggle': toggle(isNaN(+id) ? id : +id); break;
    case 'comeback': sheet = { type: 'comeback', n: 0 }; render(); track('comeback_opened'); break;
    case 'comeback-other': sheet = { type: 'comeback', n: ((sheet && sheet.n) || 0) + 1 }; render(); break;
    case 'comeback-do': {
      const hid = isNaN(+id) ? id : +id;
      setStatus(hid, todayKey(), 'min');
      if (navigator.vibrate) navigator.vibrate(16);
      sheet = null; render(); confetti();
      showNudge('You’re back. Never miss twice.');
      track('comeback_done');
      break;
    }
    case 'comeback-generic-do':
      sheet = null; render(); confetti();
      showNudge('That counts. Momentum restarts now.');
      track('comeback_done');
      break;
    case 'proof-open': sheet = { type: 'proof', filter: 'all' }; render(); track('proof_opened'); break;
    case 'proof-compose': sheet = { type: 'proof', filter: (sheet && sheet.filter) || 'all', compose: true }; render(); break;
    case 'proof-compose-cancel': sheet = { type: 'proof', filter: (sheet && sheet.filter) || 'all' }; render(); break;
    case 'proof-note-tag': proofTag = id; render(); break;
    case 'proof-save-note': addProofNote(); break;
    case 'proof-del': delProof(id); break;
    case 'proof-filter': sheet = { type: 'proof', filter: id, compose: !!(sheet && sheet.compose) }; render(); break;
    case 'proof-export': arcExportProof(); break;
    case 'share': openShare(); break;
    case 'share-quote': openQuoteShare(); break;
    case 'share-today': openTodayShare(); break;
    case 'subscribe': submitSubscribe(); break;
    case 'share-send': sendShare(); break;
    case 'share-save': saveShare(); break;
    case 'card-style': {
      S.cardStyle = el.dataset.id; save();
      rebuildShareCard();
      render();
      track('card_style', { style: S.cardStyle });
      break;
    }
    case 'shuffle-tip': S.tipSeed++; save(); render(); break;
    case 'close-sheet': dismissSheet(); break;
    case 'auth-request': submitAuth(false); break;
    case 'auth-verify': submitAuth(true); break;
    case 'auth-change': if (!authBusy) { authCodeSent = false; authStatus = ''; render(); } break;
    case 'auth-out': window.arc90Auth?.signOut(); authCodeSent = false; authStatus = ''; aiError = ''; render(); break;
    case 'restore-premium': {
      if (!window.arc90Auth?.isSignedIn()) {
        sheet = null; tab = 'profile'; render();
        showNudge('Sign in with your purchase email to restore Premium.');
        document.getElementById('authEmail')?.focus();
        break;
      }
      showNudge('Checking your purchase…');
      authenticatedHeaders()
        .then((headers) => fetch('/api/entitlement', { headers }))
        .then((r) => {
          if (r.status === 401) throw new Error('Sign in again to restore your purchase.');
          if (!r.ok) throw new Error('Purchase verification is temporarily unavailable. Please try again later.');
          return r.json();
        })
        .then((d) => {
          if (d && d.premium) {
            S.premium = true; save(); sheet = null; render(); confetti();
            showNudge('Premium restored. Welcome back. ✨');
            track('premium_restored');
          } else {
            showNudge('No active purchase found for your signed-in account.');
          }
        })
        .catch((error) => showNudge(error instanceof TypeError || error instanceof SyntaxError ? 'Could not reach purchase verification. Please try again later.' : error.message));
      break;
    }
    case 'library-toggle': libraryOpen = !libraryOpen; render(); break;
    case 'proto-template-toggle': protocolTemplatesOpen = !protocolTemplatesOpen; render(); break;
    case 'cat': libCat = id; libraryOpen = true; render(); break;

    case 'lib-toggle': {
      const n = +id;
      if (S.habits.some((x) => x.id === n)) { removeHabit(n); render(); }
      else if (!hasPremiumAccess() && S.habits.length >= FREE_HABITS) gate('habit-limit');
      else { addHabit(n); render(); }
      break;
    }
    case 'remove': removeHabit(id); if (sheet?.type === 'task' && String(sheet.id) === String(id)) sheet = null; render(); break;
    case 'rhythm-sheet': sheet = { type: 'task', id }; render(); break;
    case 'rhythm-set': {
      const h = S.habits.find((x) => String(x.id) === String(id));
      if (!h || !RHYTHMS[el.dataset.rhythm]) break;
      h.rhythm = el.dataset.rhythm;
      save();
      render();
      showNudge(`${h.name} is now scheduled ${rhythmLabel(h).toLowerCase()}.`);
      break;
    }
    case 'habit-save': {
      const h = S.habits.find((x) => String(x.id) === String(id));
      if (!h) break;
      const name = document.getElementById('habitName');
      const min = document.getElementById('habitMin');
      const goal = document.getElementById('habitGoal');
      const area = document.getElementById('habitArea');
      if (name && name.value.trim()) h.name = name.value.trim();
      if (min && min.value.trim()) h.min = min.value.trim();
      if (goal) {
        const selected = (S.brain?.goals || []).find(item => item.id === goal.value && item.status === 'active' && item.horizon !== 'long');
        h.goal_id = selected?.id || null;
        if (S.brain) S.brain.dirty = true;
      }
      if (area) h.life_area = Object.hasOwn(LIFE_AREAS, area.value) ? area.value : null;
      save();
      render();
      showNudge('Habit tuned. Your tracker just got more personal.');
      break;
    }
    case 'add-custom': {
      const inp = document.getElementById('customName');
      if (inp && inp.value.trim()) { if (addCustom(inp.value)) render(); }
      break;
    }
    case 'template-apply': applyTemplate(id); render(); break;

    case 'task-sheet': sheet = { type: 'task', id }; render(); break;
    case 'quick-min': {
      const k = todayKey();
      const hid = isNaN(+id) ? id : +id;
      const wasAll = allDoneToday();
      setStatus(hid, k, 'min');
      render();
      if (!wasAll && allDoneToday()) confetti();
      break;
    }
    case 'task-set': {
      const k = todayKey();
      const hid = isNaN(+sheet.id) ? sheet.id : +sheet.id;
      const wasAll = allDoneToday();
      setStatus(hid, k, id === 'clear' ? null : id);
      sheet = null;
      render();
      if (!wasAll && allDoneToday()) confetti();
      break;
    }
    case 'history-toggle': toggleTodayHistory(); break;
    case 'day-open': sheet = { type: 'day', date: id || todayKey() }; render(); break;
    case 'day-status': {
      const k = el.dataset.date || todayKey();
      const hid = isNaN(+id) ? id : +id;
      const status = el.dataset.status;
      const wasAll = k === todayKey() ? allDoneToday() : false;
      setStatus(hid, k, status === 'clear' ? null : status);
      render();
      if (k === todayKey() && !wasAll && allDoneToday()) confetti();
      break;
    }
    case 'mood-quick': {
      const moodRect = document.querySelector('.today-mood .mood-cursor')?.getBoundingClientRect();
      setQuickMood(id); animateSignalFeedback('mood-quick', id, { moodRect }); break;
    }
    case 'energy-quick': setQuickEnergy(id); break;
    case 'stress-quick': setQuickScale('stress', id, 'Stress', stressLabel); break;
    case 'focusq-quick': setQuickScale('focusQ', id, 'Focus', focusQLabel); break;
    case 'room-open': appRoom = id; window.scrollTo(0, 0); render(); break;
    case 'scroll-to': document.querySelector(el.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); break;
    case 'room-back': appRoom = null; window.scrollTo(0, 0); render(); break;
    case 'readiness-scroll': {
      if (tab === 'today') { appRoom = 'readiness'; window.scrollTo(0, 0); render(); }
      else document.querySelector('.vitality-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
    case 'stop-scroll': {
      if (tab === 'today') { appRoom = 'checkin'; window.scrollTo(0, 0); render(); }
      else document.querySelector('.today-stop-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
    case 'today-habits-scroll': document.querySelector('.today-habits-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'task-add': {
      const ti = document.getElementById('taskTitle');
      const du = document.getElementById('taskDue');
      const rm = document.getElementById('taskRemind');
      const title = ti ? ti.value.trim() : '';
      if (!title) { showNudge('Add a task name first.'); if (ti) ti.focus(); break; }
      if (title.length > 200) { invalidField(ti, 'Keep the task name to 200 characters or fewer.'); break; }
      if (du && (du.validity.badInput || (du.value && !Number.isFinite(new Date(du.value).getTime())))) { invalidField(du, 'Enter a valid deadline, or leave it blank.'); break; }
      if (!planningCommit(() => {
      S.taskSeq = (S.taskSeq || 0) + 1;
      S.tasks.push({
        id: 't' + Date.now() + '-' + S.taskSeq,
        title,
        horizon: 'short', goal_id: arcGoalLink(),
        due: du && du.value ? du.value : '',
        remind: rm ? rm.checked : true,
        done: false,
        notified: false,
        created: Date.now(),
      });
      })) break;
      render();
      showNudge('Task added.');
      if (du && du.value && rm && rm.checked && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      break;
    }
    case 'task-toggle': {
      const t = S.tasks.find((x) => String(x.id) === id);
      if (t && planningCommit(() => { t.done = !t.done; if (t.done) t.notified = true; S.brain.dirty = true; })) render();
      break;
    }
    case 'task-del': {
      if (planningCommit(() => {
        S.tasks = S.tasks.filter((x) => String(x.id) !== id);
        S.brain.deletedTaskIds = [...new Set([...(S.brain.deletedTaskIds || []), id])];
        S.brain.dirty = true;
      })) render();
      break;
    }
    case 'feel-set': recordFeel(el.dataset.hid, id); break;
    case 'review': sheet = { type: 'review', date: todayKey() }; render(); break;
    case 'practice-meditate': {
      if (!S.focus.active && !S.focus.pendingCompletion) {
        const minutes = Number(el.dataset.minutes);
        if (![2, 5, 10].includes(minutes)) break;
        startFocusSession(minutes, 'Meditation', false, { targets: ['Meditation'] });
      }
      if (tab === 'focus') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        render();
      } else switchTab('focus');
      break;
    }
    case 'intention-save': {
      const k = todayKey();
      const l = dlog(k);
      const inp = document.getElementById('intentionText');
      l.intention = inp ? inp.value.trim() : '';
      S.log[k] = l;
      save();
      render();
      showNudge(l.intention ? 'Intention saved. Make it easy to honor.' : 'Intention cleared.');
      break;
    }
    case 'review-save': {
      const k = sheet.date || todayKey();
      const l = dlog(k);
      const energy = document.getElementById('reviewEnergy');
      const mood = document.querySelector('.review-moods .chip.on');
      const win = document.getElementById('reviewWin');
      const note = document.getElementById('reviewNote');
      l.energy = energy ? Number(energy.value) || 0 : l.energy;
      l.mood = mood ? mood.dataset.reviewMood : '';
      l.win = win ? win.value.trim() : '';
      l.note = note ? note.value.trim() : '';
      S.log[k] = l;
      save();
      sheet = null;
      render();
      showNudge(k === todayKey() ? 'Reflection saved. Your patterns just got sharper.' : `Saved ${niceDate(k)}.`);
      break;
    }

    case 'paywall': if (previewAccessActive()) break; track('paywall_viewed'); sheet = { type: 'paywall' }; render(); break;
    case 'paywall-ctx': if (previewAccessActive()) break; track('paywall_viewed', { context: id }); sheet = { type: 'paywall', context: id }; render(); break;
    case 'premium-on': S.premium = true; save(); sheet = null; render(); confetti(); break;
    case 'premium-off': S.premium = false; save(); render(); break;

    case 'qa': openQA = openQA === id ? null : id; render(); break;
    case 'axis-mode': axisMode = id; render(); break;
    case 'forge-start': startForge(); break;
    case 'forge-end': S.forge = null; save(); render(); break;
    case 'focus-settings-toggle': focusSettingsOpen = !focusSettingsOpen; render(); break;
    case 'focus-duration-select': {
      const minutes = Number(el.dataset.minutes);
      if (S.focus.active || S.focus.pendingCompletion || !focusDurations().includes(minutes)) break;
      focusLength = { mode: adaptiveMode(), minutes };
      render();
      document.querySelector(`[data-act="focus-duration-select"][data-minutes="${minutes}"]`)?.focus({ preventScroll: true });
      break;
    }
    case 'focus-start': {
      if (S.focus.active || S.focus.pendingCompletion) { sheet = { type: 'ritual' }; render(); break; }
      const habit = S.habits.find((item) => String(item.id) === String(el.dataset.habitId || ''));
      const target = habit ? adaptiveTarget(habit) : null;
      const ritual = habit ? {
        habitId: String(habit.id),
        goalDate: todayKey(),
        targetStatus: el.dataset.targetStatus === 'min' || target?.status === 'min' ? 'min' : 'done',
        targets: [habit.name],
      } : null;
      const protectionStatus = startFocusSession(Number(el.dataset.minutes) || 30, el.dataset.label || 'Focus session', el.dataset.strict !== '0', ritual);
      render();
      showNudge(protectionStatus === 'requested'
        ? 'Focus started. Screen Time protection was requested.'
        : 'Focus started. Your timer is running.');
      break;
    }
    case 'focus-end': {
      if (finishFocusSession('ended')) {
        render();
        showNudge('Focus session logged.');
      }
      break;
    }
    case 'focus-unlock': {
      if (!S.focus.active) break;
      S.focus.active.unlocks = (S.focus.active.unlocks || 0) + 1;
      S.focus.seq++;
      S.focus.unlocks.unshift({ id: `fu${S.focus.seq}`, date: todayKey(), reason: 'Distraction', label: S.focus.active.label });
      save();
      render();
      showNudge('Distraction noted. Come back to your focus.');
      break;
    }
    case 'focus-native-stop-retry': {
      const cleanup = S.focus.pendingNativeStop;
      if (!cleanup || !focusNativeBridgeAvailable()) break;
      const requestId = requestNativeFocusShield('stop', { scope: 'session-cleanup' });
      if (!requestId) { showNudge('Screen Time could not receive the cleanup request.'); break; }
      S.focus.pendingNativeStop = { requestId, status: 'requested', label: cleanup.label };
      save();
      render();
      showNudge('Asking Screen Time to confirm protection is off.');
      break;
    }
    case 'focus-allday-toggle': {
      if (!focusNativeBridgeAvailable()) { showNudge('App blocking needs Apple Screen Time access. The focus timer still works.'); break; }
      const cur = allDayLockActive();
      if (!cur && !focusStats().blockedCount) { showNudge('Add at least one app or site to lock first.'); break; }
      const pendingAction = cur ? 'stop' : 'start';
      const requestId = requestNativeFocusShield(pendingAction, {
        scope: 'all-day',
        date: todayKey(),
        until: (() => { const end = new Date(); end.setHours(S.preferences.dayStartHour, 0, 0, 0); if (end <= new Date()) end.setDate(end.getDate() + 1); return end.toISOString(); })(),
        apps: S.focus.apps,
        sites: S.focus.sites,
      });
      if (!requestId) { showNudge('Screen Time could not receive that request. Try again.'); break; }
      S.focus.allDayLock = { on: cur, date: todayKey(), status: 'requested', confirmed: !!S.focus.allDayLock.confirmed, requestId, pendingAction };
      save();
      render();
      showNudge(cur ? 'Asking Screen Time to turn protection off.' : 'Asking Screen Time to protect the rest of today.');
      break;
    }
    case 'focus-app-toggle': toggleFocusItem('apps', id); render(); break;
    case 'focus-site-toggle': toggleFocusItem('sites', id); render(); break;
    case 'focus-app-add': {
      const input = document.getElementById('focusAppInput');
      if (!input || !input.value.trim()) break;
      const added = ensureFocusItem('apps', input.value);
      input.value = '';
      render();
      showNudge(added ? 'App added to the shield list.' : 'That app is already on the shield list.');
      break;
    }
    case 'focus-site-add': {
      const input = document.getElementById('focusSiteInput');
      if (!input || !input.value.trim()) break;
      const added = ensureFocusItem('sites', input.value);
      input.value = '';
      render();
      showNudge(added ? 'Site added to the shield list.' : 'That site is already on the shield list.');
      break;
    }
    case 'focus-plan-template': {
      const added = addFocusPlanFromTemplate(id);
      render();
      showNudge(added ? 'Focus window added.' : 'That focus window is already saved.');
      break;
    }
    case 'focus-plan-del':
      S.focus.plans = S.focus.plans.filter((p) => p.id !== id);
      save();
      render();
      break;

    case 'coach-ask': {
      const q = el.dataset.q || '';
      const inp = document.getElementById('aiInput');
      if (inp) { inp.value = q; sendAI(); }
      break;
    }
    case 'ai-clear': if (!aiBusy) { S.aiChat = []; aiError = ''; save(); render(); } break;
    case 'ai-send': sendAI(); break;
    case 'weekly-ai-refresh': {
      S.weeklyReviews[weekReviewKey()] = weeklyCoachReview();
      save(); render();
      showNudge('Weekly review refreshed.');
      break;
    }

    case 'rem-mode': {
      S.reminders.mode = id === '5h' ? '4h' : id;
      save();
      if (id !== 'off' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(() => syncPushSubscription()).catch(() => {});
      } else {
        syncPushSubscription(); // updates or removes the server-side registration
      }
      render(); break;
    }
    case 'theme': S.theme = id; save(); render(); break;

    case 'edit': sheet = { type: 'edit' }; render(); break;
    case 'save-edit': {
      const n = document.getElementById('editName'), o = document.getElementById('editOcc'), g = document.getElementById('editGoal');
      if (n && n.value.trim()) S.profile.name = n.value.trim();
      if (o && o.value.trim()) S.profile.occupation = o.value.trim();
      if (g && g.value.trim()) { S.profile.goal = g.value.trim(); const arc = activeArcGoal(); if (arc && arc.title !== S.profile.goal) { arc.title = S.profile.goal; S.brain.dirty = true; } }
      save(); sheet = null; render(); break;
    }

    case 'protocol': if (gate('protocol')) { sheet = { type: 'protocol' }; render(); } break;
    case 'proto-add': protoAddOpen = true; render(); break;
    case 'proto-detail': protoDetailOpen = protoDetailOpen === id ? null : id; render(); break;
    case 'proto-template': {
      const tpl = PROTOCOL_TEMPLATES.find((x) => x.id === id);
      if (!tpl) break;
      const exists = S.protocols.some((p) => p.name.toLowerCase() === tpl.name.toLowerCase());
      if (!exists) {
        S.protoSeq++;
        S.protocols.push({
          id: 'p' + S.protoSeq,
          name: tpl.name,
          type: tpl.type,
          amount: tpl.amount,
          freq: tpl.freq,
          time: tpl.time,
          slot: tpl.slot || inferDoseSlot(tpl.time),
          reason: tpl.reason,
          notes: tpl.notes,
          logs: [],
        });
        save();
      }
      showNudge(exists ? `${tpl.name} is already in your protocol.` : `${tpl.name} added to Protocol.`);
      protocolTemplatesOpen = false;
      protoDetailOpen = null;
      render();
      break;
    }
    case 'proto-save': {
      const name = document.getElementById('pName');
      if (!name || !name.value.trim()) { invalidField(name, 'Enter a protocol name.'); break; }
      if (name.value.trim().length > 120) { invalidField(name, 'Keep the protocol name to 120 characters or fewer.'); break; }
      const type = document.querySelector('#pTypeChips .chip.on');
      const freq = document.querySelector('#pFreqSeg button.on');
      const slot = document.querySelector('#pSlotSeg button.on');
      const time = document.getElementById('pTime');
      const reason = document.getElementById('pReason');
      const amount = document.getElementById('pAmount');
      const notes = document.getElementById('pNotes');
      S.protoSeq++;
      S.protocols.push({
        id: 'p' + S.protoSeq,
        name: name.value.trim(),
        type: type ? type.dataset.ptype : 'other',
        freq: freq ? freq.dataset.pfreq : 'Daily',
        time: time && time.value ? time.value : '08:00',
        slot: slot ? slot.dataset.pslot : inferDoseSlot(time && time.value ? time.value : '08:00'),
        amount: amount ? amount.value.trim() : '',
        reason: reason ? reason.value.trim() : '',
        notes: notes ? notes.value.trim() : '',
        logs: [],
      });
      save(); protoAddOpen = false; protoDetailOpen = null; render(); break;
    }
    case 'proto-del': S.protocols = S.protocols.filter((p) => p.id !== id); protoDetailOpen = null; save(); render(); break;
    case 'proto-toggle-today': {
      const p = S.protocols.find((x) => x.id === id);
      if (!p) break;
      if (protocolLoggedOn(p)) {
        p.logs = (p.logs || []).filter((l) => l.date !== todayKey());
        showNudge(`${p.name} removed from today.`);
      } else {
        upsertProtocolLog(p, { date: todayKey(), symptoms: ['none'], note: 'quick check-in', urgent: false, source: 'quick' });
        showNudge(`${p.name} registered for today.`);
      }
      save();
      render();
      break;
    }
    case 'proto-log': protoOpen = protoOpen === id ? null : id; protoUrgent = false; render(); break;
    case 'proto-log-save': {
      const p = S.protocols.find((x) => x.id === id);
      if (!p) break;
      const symptoms = [...document.querySelectorAll('#symChips .chip.on')].map((c) => c.dataset.sym);
      const note = document.getElementById('logNote');
      const urgent = symptoms.some((s) => { const d = SYMPTOMS.find((x) => x.id === s); return d && d.flag; });
      upsertProtocolLog(p, { date: todayKey(), symptoms, note: note ? note.value.trim() : '', urgent, source: 'detail' });
      save();
      protoOpen = null;
      protoUrgent = urgent;
      render();
      break;
    }
    case 'proto-export': exportProtocolReport(); break;
    case 'sleep-wake-save': {
      const inp = document.getElementById('sleepWakeInput');
      if (inp && inp.value) {
        S.health.settings.wakeTarget = inp.value;
        save();
        render();
        showNudge('Wake target saved.');
      }
      break;
    }
    case 'wake-mood': {
      const cur = sleepDay().wakeMood;
      setSleepDay(todayKey(), { wakeMood: cur === id ? '' : id });
      render();
      if (cur !== id) showNudge(`Logged your morning as “${moodLabel(id)}.”`);
      break;
    }
    case 'alarm-save': {
      const inp = document.getElementById('alarmInput');
      if (inp && inp.value) {
        S.health.settings.alarmTime = inp.value;
        save(); render();
        showNudge(`Alarm set for ${fmtTime12(Number(inp.value.split(':')[0])*60+Number(inp.value.split(':')[1]))}.`);
      }
      break;
    }
    case 'alarm-clear': {
      S.health.settings.alarmTime = '';
      if (window.__arc90AlarmCheck) { clearInterval(window.__arc90AlarmCheck); window.__arc90AlarmCheck = null; }
      if (SOUND_ENGINE.alarmArmed()) SOUND_ENGINE.disarmAlarm();
      save(); render();
      showNudge('Alarm cleared.');
      break;
    }
    case 'winddown-save': {
      const inp = document.getElementById('windDownInput');
      if (inp && inp.value) {
        S.health.settings.windDown = inp.value;
        save(); render();
        showNudge(`Wind-down starts at ${fmtTime12(Number(inp.value.split(':')[0]) * 60 + Number(inp.value.split(':')[1]))}.`);
      }
      break;
    }
    case 'winddown-clear': {
      S.health.settings.windDown = '';
      save(); render();
      showNudge('Wind-down off.');
      break;
    }
    case 'lights-out': {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setSleepDay(todayKey(), { lightsOut: hhmm });
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
      render();
      showNudge('Bedtime logged. Sleep well — tomorrow is built tonight. 🌙');
      track('lights_out');
      break;
    }
    case 'alarm-arm': armNightAlarm(); break;
    case 'alarm-disarm': {
      SOUND_ENGINE.disarmAlarm();
      render();
      showNudge('Night Mode off — alarm will only ring while Arc90 is in the foreground.');
      break;
    }
    case 'alarm-stop': {
      SOUND_ENGINE.disarmAlarm();
      alarmRingingUI = false;
      tab = 'sleep';
      render();
      setTimeout(() => document.querySelector('.sleep-wakemood-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
      showNudge('Good morning — log how you woke up.');
      break;
    }
    case 'sound-play': {
      const sid = el.dataset.id;
      SOUND_ENGINE.setTimer(S.health.settings.soundTimerMin ?? 15); // apply current sleep timer
      SOUND_ENGINE.play(sid).then((res) => {
        render();
        if (res === 'retry') showNudge('Tap the sound once more to start audio.');
      });
      render(); // optimistic — active is set synchronously
      break;
    }
    case 'sound-stop':
      SOUND_ENGINE.stopAll();
      render();
      break;
    case 'sound-timer': {
      const min = Number(el.dataset.id) || 0;
      S.health.settings.soundTimerMin = min;
      save();
      SOUND_ENGINE.setTimer(min); // reschedules from now if a sound is playing
      render();
      showNudge(min ? `Sleep timer set — sound stops in ${min < 60 ? `${min} min` : '1 hour'}.` : 'Sounds will play continuously.');
      break;
    }
    case 'med-start':
      sleepMedStart(el.dataset.id);
      break;
    case 'med-stop':
      sleepMedStop();
      break;
    case 'sleep-day': {
      const key = el.dataset.key || todayKey();
      sleepEditKey = key === todayKey() ? null : key;
      render();
      break;
    }
    case 'vital-save': {
      const key = el.dataset.key;
      if (!['sleep', 'water', 'steps', 'weight', 'rhr', 'hrv', 'vo2', 'kcal', 'exercise', 'distance', 'flights', 'spo2', 'resp'].includes(key)) break;
      const inp = document.getElementById('vital-' + key);
      if (!inp) break;
      if (!validNumberField(inp, { max: key === 'sleep' ? 18 : key === 'spo2' ? 100 : Infinity, integer: ['water', 'steps', 'flights'].includes(key) })) break;
      const raw = inp.value.trim();
      const k = todayKey();
      if (key === 'sleep') setSleepDay(k, { hours: raw === '' ? '' : Math.max(0, Math.min(18, Number(raw) || 0)) });
      else if (key === 'water') setHealthDay(k, { water: Math.max(0, Number(raw) || 0) });
      else if (key === 'steps') setHealthDay(k, { steps: Math.max(0, Number(raw) || 0) });
      else if (key === 'weight') setHealthDay(k, { weight: raw });
      else { if (raw === '') delete S.health[key][k]; else S.health[key][k] = Math.max(0, Number(raw) || 0); }
      save();
      render();
      const labels = { rhr: 'Resting HR', hrv: 'HRV', vo2: 'VO2 max', weight: 'Weight', sleep: 'Sleep', steps: 'Steps', water: 'Hydration' };
      showNudge(raw === '' ? `${labels[key] || 'Metric'} cleared.` : `${labels[key] || 'Metric'} logged. 📈`);
      break;
    }
    case 'sleep-save': {
      const k = sleepEditKey && sleepDay(sleepEditKey) ? sleepEditKey : todayKey();
      const hours = document.getElementById('sleepHours');
      if (!validNumberField(hours, { max: 18 })) break;
      const quality = document.querySelector('#sleepQualitySeg button.on');
      const raw = hours ? hours.value : '';
      setSleepDay(k, {
        hours: raw === '' ? '' : Math.max(0, Math.min(18, Number(raw) || 0)),
        quality: quality ? quality.dataset.sleepQuality : 'steady',
      });
      sleepEditKey = null;
      render();
      showNudge(k === todayKey() ? 'Sleep signal saved for last night.' : `Sleep saved for ${niceDate(k)}.`);
      break;
    }
    case 'water-add': {
      const h = healthDay();
      setHealthDay(todayKey(), { water: h.water + 1 });
      render(); animateSignalFeedback('water-add', undefined, { water: h.water }); break;
    }
    case 'water-sub': {
      const h = healthDay();
      setHealthDay(todayKey(), { water: h.water - 1 });
      render(); animateSignalFeedback('water-sub', undefined, { water: h.water }); break;
    }
    case 'weight-save': {
      const inp = document.getElementById('weightInput');
      if (!validNumberField(inp)) break;
      setHealthDay(todayKey(), { weight: inp ? inp.value : '' });
      render();
      showNudge('Weight saved privately on this device.');
      break;
    }
    case 'health-sync': requestHealthSync(); break;
    case 'watch-sync': requestWatchSync(); break;
    case 'stripe-checkout': safeStripeCheckout(); break;
    case 'weekly-export': exportWeeklyReport(); break;
    case 'share-card': exportShareCard(); break;
    case 'export': exportData(); break;
    case 'import': document.getElementById('importFile')?.click(); break;

    case 'reset': {
      if (confirm('Erase your challenge, habits and history?')) {
        localStorage.removeItem(KEY); S = defaultState(); resetPlanningWorkspace(); ob = null; tab = 'today'; sheet = null; render();
      }
      break;
    }
    case 'nudge-x': document.querySelector('.nudge')?.remove(); break;

    /* onboarding */
    case 'ob-next': ob.step++; renderOnboarding(); break;
    case 'ob-email-save': {
      const inp = document.getElementById('obEmail');
      const consent = document.getElementById('obEmailConsent');
      const hp = document.getElementById('obEmailHp');
      const errEl = document.getElementById('obEmailErr');
      const email = (inp ? inp.value : '').trim().toLowerCase();
      const setErr = (m) => { if (errEl) errEl.textContent = m; };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErr('Enter a valid email, or skip.'); break; }
      if (!consent || !consent.checked) { setErr('Check the box to opt in, or skip.'); break; }
      ob.email = email;
      const btn = el; btn.disabled = true; btn.textContent = 'Saving…';
      fetch('/api/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent: true, source: 'onboarding', hp: hp ? hp.value : '' }),
      })
        .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (ok && d.ok) {
            ob.emailDone = true; S.subscribed = true; save();
            track('subscribed', { source: 'onboarding' });
            ob.step++; renderOnboarding();
          } else {
            setErr('Could not save your subscription. Try again later or skip.');
            btn.disabled = false; btn.textContent = 'Email me updates';
          }
        })
        .catch(() => { setErr('Network error — try again or skip.'); btn.disabled = false; btn.textContent = 'Email me updates'; });
      break;
    }
    case 'ob-back': ob.step--; renderOnboarding(); break;
    case 'ob-health-connect': {
      const cap = window.Capacitor;
      let plugin = cap && cap.Plugins && cap.Plugins.Arc90Health;
      if ((!plugin || !plugin.sync) && cap && typeof cap.registerPlugin === 'function') {
        try { plugin = cap.registerPlugin('Arc90Health'); } catch (e) {}
      }
      if (!plugin || !plugin.sync) { showNudge('Apple Health needs the Arc90 iPhone app.'); break; }
      showNudge('Reading Apple Health…');
      plugin.sync({ type: 'health-sync-request', date: todayKey(), stepGoal: S.health.settings.stepGoal })
        .then((p) => {
          S.product.nativeBridge = true;
          applyNativeHealthSync(p);          // stores signals; render() lands back on this step
          ob.healthDone = true;
          renderOnboarding();
        })
        .catch((e) => showNudge('Health sync failed: ' + ((e && e.message) || e)));
      break;
    }
    case 'ob-occ': ob.occs.has(id) ? ob.occs.delete(id) : ob.occs.add(id); renderOnboarding(); break;
    case 'ob-cat': {
      if (ob.cats.has(id)) ob.cats.delete(id);
      else if (ob.cats.size >= 3) { showNudge('Three focus areas max — focus is the feature. Swap one out first.'); break; }
      else ob.cats.add(id);
      // re-seed picks round-robin across selected missions so each one contributes
      {
        const lists = [...ob.cats].map((c) => { const g = GOAL_TYPES.find((x) => x.id === c); return g ? [...g.suggest] : []; });
        const picks = [];
        for (let round = 0; picks.length < FREE_HABITS && round < 5; round++) {
          for (const l of lists) {
            const next = l.find((x) => !picks.includes(x));
            if (next !== undefined && picks.length < FREE_HABITS) { picks.push(next); l.splice(l.indexOf(next), 1); }
          }
        }
        ob.picked = new Set(picks);
      }
      renderOnboarding(); break;
    }
    case 'ob-pick': {
      const n = +id;
      if (ob.picked.has(n)) ob.picked.delete(n);
      else if (ob.picked.size + ob.customs.length >= FREE_HABITS) { showNudge(`Start with ${FREE_HABITS} or fewer — small enough to never miss. Premium unlocks unlimited later.`); break; }
      else ob.picked.add(n);
      renderOnboarding(); break;
    }
    case 'ob-custom': {
      const inp = document.getElementById('obCustomName');
      const val = inp ? inp.value.trim() : '';
      if (!val) break;
      if (ob.picked.size + ob.customs.length >= FREE_HABITS) { showNudge(`Start with ${FREE_HABITS} or fewer — you can add more later.`); break; }
      ob.customs.push(val); renderOnboarding(); break;
    }
    case 'ob-uncustom': ob.customs.splice(+id, 1); renderOnboarding(); break;
    case 'ob-rem': {
      ob.remMode = id === '5h' ? '4h' : id; renderOnboarding(); break;
    }
    case 'ob-finish': finishOnboarding(); break;
    case 'ob-premium': {
      track('ob_premium_clicked');
      finishOnboarding();        // save their setup + enter the app first
      safeStripeCheckout();      // then open checkout (falls back gracefully if not live)
      break;
    }
  }
});

document.addEventListener('keydown', (e) => {
  const dialog = document.querySelector('.sheet[role="dialog"]');
  if (e.key === 'Tab' && dialog) {
    const items = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')].filter((node) => node.getClientRects().length);
    const first = items[0], last = items[items.length - 1];
    if (!first) { e.preventDefault(); dialog.focus(); }
    else if (!dialog.contains(document.activeElement) || document.activeElement === dialog || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
      e.preventDefault(); (e.shiftKey ? last : first).focus();
    }
  }
  if (e.key === 'Escape' && sheet) {
    e.preventDefault();
    dismissSheet();
  } else if (e.key === 'Escape' && moreOpen) {
    e.preventDefault();
    setToolsMenu(false);
  }
});
document.addEventListener('input', (e) => {
  const field = e.target.dataset?.practiceField;
  const date = e.target.dataset?.date;
  if (['win', 'journal', 'gratitude'].includes(field) && /^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    S.practices ||= {};
    const entry = S.practices[date] || {};
    if (field === 'win') S.log[date] = { ...dlog(date), intention: e.target.value };
    if (field === 'journal') {
      S.journal[date] = e.target.value;
      entry.prompt = e.target.dataset.prompt;
    }
    if (field === 'gratitude') entry.gratitude = e.target.value;
    S.practices[date] = entry;
    try { save(); practiceSaveFailed = false; }
    catch (_) { practiceSaveFailed = true; }
    const status = document.getElementById('practiceSaveStatus');
    if (status) status.textContent = practiceSaveFailed
      ? 'Not saved. Keep this page open and try typing again.' : 'Saved on this device.';
  }
  if (typeof e.target.setCustomValidity === 'function') {
    e.target.setCustomValidity('');
    e.target.removeAttribute('aria-invalid');
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'dayStartHour') {
    const hour = Number(e.target.value);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      S.preferences.dayStartHour = hour; save(); render();
    }
  }
  if (e.target.id === 'trackWater' || e.target.id === 'trackMood') { S.preferences.trackers = { ...(S.preferences.trackers || {}), [e.target.id === 'trackWater' ? 'water' : 'mood']: e.target.checked }; save(); render(); return; }
  if (e.target.id === 'reducedMotion') {
    S.preferences.reducedMotion = e.target.checked; save(); render();
  }
  if (e.target.id === 'shareNames') {
    S.preferences.shareNames = e.target.checked; save(); render();
  }
  if (e.target.id === 'practiceDate') {
    const date = e.target.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayKey()) {
      practiceDate = date === todayKey() ? null : date;
      render();
    } else e.target.value = practiceDate || todayKey();
  }
  if (e.target.id === 'previewAccessSwitch') {
    const enabled = e.target.checked;
    if (!window.Arc90PreviewAccess?.setEnabled(enabled)) showNudge('Could not update preview access on this device.');
    lastPreviewAccess = previewAccessActive();
    render();
    document.getElementById('previewAccessSwitch')?.focus({ preventScroll: true });
  }
  if (e.target.id === 'setTime') { S.reminders.time = e.target.value || '08:00'; save(); syncPushSubscription(); }
  if (e.target.id === 'importFile' && e.target.files && e.target.files[0]) {
    importDataFile(e.target.files[0]);
    e.target.value = '';
  }
  if (e.target.id === 'proofFile' && e.target.files && e.target.files[0]) {
    arcAddProofPhoto(e.target);
  }
});

function closeSheet() {
  sheet = null; protoOpen = null; protoDetailOpen = null; protoAddOpen = false; protoUrgent = false;
  render();
}

function captureShellMotion() {
  const nav = document.querySelector('.tabbar');
  const active = nav?.querySelector('.tab-btn.open') || nav?.querySelector('.tab-btn.active');
  return {
    cursorLeft: document.querySelector('.tab-cursor')?.getBoundingClientRect().left,
    activeKey: active?.dataset.id || (active ? 'tools' : null),
    sheetType: document.querySelector('.sheet')?.dataset.sheetType,
  };
}

function playShellMotion(previous) {
  const reduced = Arc90Motion.reduced();
  const nav = document.querySelector('.tabbar');
  const cursor = nav?.querySelector('.tab-cursor');
  const active = nav?.querySelector('.tab-btn.open') || nav?.querySelector('.tab-btn.active');
  if (cursor && active) {
    const rect = active.getBoundingClientRect();
    const left = rect.left + rect.width / 2 - 12;
    cursor.style.left = `${left - nav.getBoundingClientRect().left}px`;
    const delta = previous.cursorLeft - left;
    if (!reduced && typeof cursor.animate === 'function' && Number.isFinite(delta) && Math.abs(delta) > 1) {
      cursor.animate([
        { transform: `translateX(${delta}px) scaleX(1)` },
        { transform: `translateX(${delta * .3}px) scaleX(1.35)`, offset: .45 },
        { transform: 'translateX(0) scaleX(1)' },
      ], { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' });
      if (previous.activeKey !== (active.dataset.id || 'tools')) active.querySelector('svg')?.animate([
        { transform: 'translateY(2px) scale(.9)' },
        { transform: 'translateY(-1px) scale(1.06)', offset: .6 },
        { transform: 'translateY(0) scale(1)' },
      ], { duration: 300, easing: 'ease-out' });
    }
  }
  const dialog = document.querySelector('.sheet');
  if (!dialog || reduced || typeof dialog.animate !== 'function' || dialog.dataset.sheetType === previous.sheetType) return;
  dialog.animate([
    { transform: `translateY(${previous.sheetType ? 8 : 32}px)`, opacity: .45 },
    { transform: 'translateY(0)', opacity: 1 },
  ], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' });
  if (!previous.sheetType) document.querySelector('.sheet-bg')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
}

function dismissSheet() {
  const dialog = document.querySelector('.sheet');
  if (!sheet) return;
  if (!dialog || document.hidden || typeof dialog.animate !== 'function' || Arc90Motion.reduced()) {
    closeSheet(); return;
  }
  if (dialog.dataset.closing) return;
  dialog.dataset.closing = 'true';
  const closing = sheet;
  const style = getComputedStyle(dialog);
  const motion = dialog.animate([
    { transform: style.transform, opacity: style.opacity },
    { transform: `translateY(${dialog.getBoundingClientRect().height + 24}px)`, opacity: 0 },
  ], { duration: 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
  document.querySelector('.sheet-bg')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
  const finish = () => { if (sheet === closing && dialog.isConnected) closeSheet(); };
  motion.finished.then(finish, finish);
}

function celebrateTodayCompletion(previous) {
  const current = todayCompletion();
  if (!previous.total || previous.done >= previous.total || !current.total || current.done !== current.total) return;
  if (document.hidden || Arc90Motion.reduced()) return;
  const hero = document.querySelector('.hero-card');
  if (hero && !sheet) hero.classList.add('arc-fulfilled');
  else confetti();
}

function animateSignalFeedback(act, id, previous = {}) {
  const button = [...document.querySelectorAll('[data-act]')].find(node =>
    node.dataset.act === act && (id === undefined || node.dataset.id === id));
  const focusTarget = button?.disabled && act === 'water-sub'
    ? document.querySelector('[data-act="water-add"]') : button;
  focusTarget?.focus({ preventScroll: true });
  if (Arc90Motion.reduced()) return;
  button?.classList.add('signal-confirm');
  if (act === 'water-add' || act === 'water-sub') {
    const count = document.querySelector('.water-stepper strong');
    count?.style.setProperty('--signal-travel', act === 'water-add' ? '6px' : '-6px');
    count?.classList.add('signal-count-tick');
    const current = count?.querySelector?.('.water-count-current');
    if (current && Number.isFinite(previous.water) && previous.water !== Number(current.textContent) && typeof current.animate === 'function') {
      count.classList.remove('signal-count-tick');
      const outgoing = document.createElement('span');
      outgoing.className = 'water-count-previous';
      outgoing.setAttribute('aria-hidden', 'true');
      outgoing.textContent = String(previous.water);
      count.appendChild(outgoing);
      const direction = act === 'water-add' ? 1 : -1;
      current.animate([
        { transform: `translateY(${direction * 100}%)`, opacity: 0 },
        { transform: 'translateY(0)', opacity: 1 },
      ], { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' });
      const exit = outgoing.animate([
        { transform: 'translateY(0)', opacity: 1 },
        { transform: `translateY(${-direction * 100}%)`, opacity: 0 },
      ], { duration: 240, easing: 'ease-out' });
      exit.finished.then(() => outgoing.remove(), () => outgoing.remove());
    }
    const fill = document.querySelector('.water-progress > span');
    if (fill && Number.isFinite(previous.water) && typeof fill.animate === 'function') {
      fill.animate([
        { transform: `scaleX(${Math.min(1, Math.max(0, previous.water) / Math.max(1, Number(S.health.settings.waterGoal) || 8))})` },
        { transform: `scaleX(${fill.style.getPropertyValue('--water-progress')})` },
      ], { duration: 240, easing: 'ease-out' });
    }
  }
  if (act === 'mood-quick') {
    const cursor = document.querySelector('.today-mood .mood-cursor');
    if (!cursor || typeof cursor.animate !== 'function') return;
    const to = cursor.getBoundingClientRect();
    const from = previous.moodRect;
    if (from && to.width && to.height) cursor.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' });
    else cursor.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
  }
}

function animateHistoryProgress(completing) {
  if (!completing || document.hidden || Arc90Motion.reduced()) return;
  document.querySelectorAll('.today-history .cell.now').forEach(cell => {
    cell.classList.add(cell.classList.contains('l3') ? 'history-fulfilled' : 'history-updated');
  });
}

function animateHabitProgress(previousOffset) {
  if (!Number.isFinite(previousOffset) || Arc90Motion.reduced()) return;
  const ring = document.querySelector('.hero-card .ring-fill');
  if (!ring) return;
  ring.style.setProperty('--previous-arc-offset', String(previousOffset));
  ring.style.setProperty('--next-arc-offset', ring.getAttribute('stroke-dashoffset'));
  ring.classList.add('arc-updated');
}

let todayArcMotion = null;
function cancelTodayArcAnimation() {
  if (!todayArcMotion) return;
  cancelAnimationFrame(todayArcMotion.frame);
  todayArcMotion.animations.forEach(animation => animation.cancel());
  todayArcMotion.counters.forEach(({ el, target, suffix }) => { el.textContent = target + suffix; });
  todayArcMotion = null;
}

function animateTodayArc() {
  if (tab !== 'today' || appRoom || sheet || moreOpen || document.hidden || document.getElementById('launchQuote')) return;
  const hero = document.querySelector('.hero-card');
  if (!hero || typeof hero.animate !== 'function' || Arc90Motion.reduced()) return;
  if (todayArcMotion?.hero === hero) return;
  cancelTodayArcAnimation();
  const motion = { hero, animations: [], counters: [], frame: null };
  todayArcMotion = motion;
  const play = (el, frames, duration, delay = 0, easing = 'cubic-bezier(.22,1,.36,1)') => {
    if (el) motion.animations.push(el.animate(frames, { duration, delay, easing, fill: 'backwards' }));
  };
  const reveal = (el, delay) => play(el, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], 420, delay);
  reveal(hero.querySelector('.hero-topline'), 0);
  play(hero.querySelector('.hero-ring svg'), [
    { opacity: .35, transform: 'rotate(-90deg) scale(.94)' },
    { opacity: 1, transform: 'rotate(-90deg) scale(1)' },
  ], 700, 40);
  const fill = hero.querySelector('.ring-fill');
  if (fill) {
    const length = parseFloat(fill.getAttribute('stroke-dasharray')) || 364.425;
    const offset = Math.max(0, Math.min(length, parseFloat(fill.getAttribute('stroke-dashoffset')) || 0));
    play(fill, [{ strokeDashoffset: String(length) }, { strokeDashoffset: String(offset) }], 920, 120);
  }
  play(hero.querySelector('.arc-intro-trace'), [
    { strokeDashoffset: '402.124', opacity: 0 },
    { strokeDashoffset: '280', opacity: .8, offset: .25 },
    { strokeDashoffset: '0', opacity: 0 },
  ], 1100, 0, 'ease-in-out');
  [...hero.querySelectorAll('.approved-hero-metrics > *, .hstat-note')].forEach((el, index) => reveal(el, 160 + index * 90));
  reveal(hero.querySelector('.next-move'), 440);
  motion.counters = [...hero.querySelectorAll('[data-countup]')].map(el => ({
    el, target: parseInt(el.dataset.countup, 10) || 0, suffix: el.dataset.suffix || '',
  }));
  motion.counters.forEach(({ el, suffix }) => { el.textContent = '0' + suffix; });
  const start = performance.now();
  const tick = now => {
    if (todayArcMotion !== motion) return;
    if (!hero.isConnected || document.hidden || Arc90Motion.reduced()) {
      cancelTodayArcAnimation(); return;
    }
    const progress = Math.max(0, Math.min(1, (now - start - 120) / 920));
    const eased = 1 - Math.pow(1 - progress, 3);
    motion.counters.forEach(({ el, target, suffix }) => { el.textContent = Math.round(target * eased) + suffix; });
    if (now - start < 1120) motion.frame = requestAnimationFrame(tick);
    else cancelTodayArcAnimation();
  };
  motion.frame = requestAnimationFrame(tick);
}

function wireAfterRender() {
  if (typeof brainWireMap === 'function') brainWireMap();
  document.querySelectorAll('.field').forEach((field) => {
    const label = field.querySelector('label');
    const input = field.querySelector('input[id], textarea[id], select[id]');
    if (label && input && !label.htmlFor) label.htmlFor = input.id;
  });
  const dialog = document.querySelector('.sheet[role="dialog"]');
  document.querySelectorAll('#app > .screen').forEach((node) => { node.inert = !!dialog || moreOpen; });
  document.querySelectorAll('#app > .tabbar-dock').forEach((node) => { node.inert = !!dialog; });
  if (dialog) dialog.focus({ preventScroll: true });
  // Swipe the bottom sheet down to dismiss it back to the app (any sheet: share, paywall, proof…)
  const sheetEl = document.querySelector('.sheet');
  if (sheetEl && !sheetEl.dataset.swipe) {
    sheetEl.dataset.swipe = '1';
    let startY = 0, cur = 0, dragging = false;
    sheetEl.addEventListener('touchstart', (e) => {
      if (sheetEl.scrollTop > 0 || sheetEl.dataset.closing || e.target.closest('input, textarea, select, a, button:not(.sheet-grab-zone)')) return;
      sheetEl.getAnimations?.().forEach(animation => animation.cancel());
      startY = e.touches[0].clientY; cur = 0; dragging = true;
      sheetEl.style.transition = 'none';
    }, { passive: true });
    sheetEl.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      cur = e.touches[0].clientY - startY;
      if (cur < 0) { cur = 0; return; }
      sheetEl.style.transform = `translateY(${cur}px)`;
      sheetEl.style.opacity = String(Math.max(0.4, 1 - cur / 600));
    }, { passive: true });
    const end = (cancelled = false) => {
      if (!dragging) return;
      dragging = false;
      sheetEl.style.transition = '';
      if (!cancelled && cur > 130) { dismissSheet(); }
      else { sheetEl.style.transform = ''; sheetEl.style.opacity = ''; }
    };
    sheetEl.addEventListener('touchend', () => end(), { passive: true });
    sheetEl.addEventListener('touchcancel', () => end(true), { passive: true });
  }
  // Pre-render sleep sounds so the first tap is instant and stays inside the gesture (iOS)
  if (tab === 'sleep' && SOUND_ENGINE.warm && !window.__arc90SoundsWarmed) {
    window.__arc90SoundsWarmed = true;
    setTimeout(() => SOUND_ENGINE.warm(), 400);
  }
  // If iOS pauses the audio element on an interruption, resume it when we come back
  if (!window.__arc90SoundResume) {
    window.__arc90SoundResume = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const el = document.getElementById('arc90-audio');
      if (el && el.paused && el.src && SOUND_ENGINE.getActive()) el.play().catch(() => {});
    });
  }
  // Live sleep-timer countdown — updates the on-screen "Auto-off in m:ss" each second
  if (!window.__arc90SoundTimerTick) {
    window.__arc90SoundTimerTick = setInterval(() => {
      const lbl = document.getElementById('soundTimerLeft');
      if (!lbl) return;
      const rem = SOUND_ENGINE.getRemaining();
      if (rem > 0) lbl.textContent = fmtTimerLeft(rem);
    }, 1000);
  }
  // Alarm polling — starts when alarm is set, self-clears when it fires
  if (S.health.settings.alarmTime && !window.__arc90AlarmCheck) {
    window.__arc90AlarmCheck = setInterval(() => {
      const alarm = S.health.settings.alarmTime;
      if (!alarm) { clearInterval(window.__arc90AlarmCheck); window.__arc90AlarmCheck = null; return; }
      if (SOUND_ENGINE.alarmArmed()) return;   // Night Mode owns the trigger — no double-fire
      const now = new Date(), [ah, am] = alarm.split(':').map(Number);
      if (now.getHours() === ah && now.getMinutes() === am && now.getSeconds() < 30) {
        playAlarmChime();
        showNudge('⏰ Rise and shine! Your alarm is going off.');
        S.health.settings.alarmTime = '';
        clearInterval(window.__arc90AlarmCheck); window.__arc90AlarmCheck = null;
        save(); render();
      }
    }, 20000);
  }
  const proofTa = document.getElementById('proofNote');
  if (proofTa && document.activeElement !== proofTa) proofTa.focus({ preventScroll: true });
  // Daily journal — autosave on input without re-rendering (keeps caret + focus)
  const journalTa = document.getElementById('journalText');
  if (journalTa && !journalTa.dataset.wired) {
    journalTa.dataset.wired = '1';
    let jt;
    journalTa.addEventListener('input', () => {
      clearTimeout(jt);
      jt = setTimeout(() => {
        const k = todayKey();
        if (journalTa.value.trim()) S.journal[k] = journalTa.value;
        else delete S.journal[k];
        save();
      }, 400);
    });
  }
  const libSearch = document.getElementById('libSearch');
  if (libSearch) libSearch.addEventListener('input', () => {
    libQuery = libSearch.value;
    const list = document.getElementById('libList');
    if (list) list.innerHTML = libList();
  });

  const map = [['obName', 'name'], ['obGoal', 'goal'], ['obWhy', 'motivation'], ['obVision', 'vision'], ['obBrainDump', 'brainDump'], ['obTime', 'remTime'], ['obOcc', 'occCustom']];
  for (const [domId, key] of map) {
    const inp = document.getElementById(domId);
    if (inp) inp.addEventListener('input', () => {
      ob[key] = inp.value;
      const btn = document.getElementById('obNextBtn');
      if (btn) {
        if (key === 'name') btn.disabled = !ob.name.trim();
        if (key === 'goal') btn.disabled = !ob.goal.trim();
      }
    });
  }

  const customName = document.getElementById('customName');
  if (customName) customName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && customName.value.trim()) { if (addCustom(customName.value)) render(); }
  });

  const aiInput = document.getElementById('aiInput');
  if (aiInput) {
    aiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); } });
    const box = document.getElementById('aiChatBox');
    if (box) box.scrollTop = box.scrollHeight;
  }

  /* animated counters — only on tab entry; instant on in-place re-renders */
  const animating = !!document.querySelector('.screen.anim') && !Arc90Motion.reduced();
  document.querySelectorAll('[data-countup]').forEach((el) => {
    const target = parseInt(el.dataset.countup, 10) || 0;
    const suffix = el.dataset.suffix || '';
    if (!animating || el.closest('.hero-card')) { el.textContent = target + suffix; return; }
    const t0 = performance.now(), dur = 700;
    const tick = (t) => {
      if (!el.isConnected) return;
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* ============================================================
   EXPORTS
   ============================================================ */

function download(filename, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function exportData() {
  // Embed proof photos (they live in IndexedDB, not S) so a backup is complete
  // and can be fully restored on a new device.
  const photos = {};
  const shots = (S.proof || []).filter((p) => p.type === 'photo');
  await Promise.all(shots.map((p) => idbGet(p.id)
    .then((b) => b ? blobToDataURL(b).then((d) => { if (d) photos[p.id] = d; }) : null)
    .catch(() => {})));
  const payload = { ...S, _proofPhotos: photos, _exportedAt: todayKey() };
  download(`arc90-data-${todayKey()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  const n = Object.keys(photos).length;
  showNudge(n ? `Data exported — ${n} proof photo${n === 1 ? '' : 's'} included.` : 'Data exported.');
}

function compactText(s, max) {
  const t = String(s || '').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function shareCardSvg() {
  const w = weeklyReviewData();
  const achievements = achievementList();
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const next = nextAchievement();
  const bars = w.rows.map((r, i) => {
    const pct = r.rate === null ? 0 : Math.round(r.rate * 100);
    const h = Math.max(18, Math.round(210 * pct / 100));
    const x = 180 + i * 104;
    const y = 900 - h;
    const lab = dateFromKey(r.key).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3).toUpperCase();
    return `<rect x="${x}" y="${y}" width="62" height="${h}" rx="31" fill="url(#barGrad)"/><text x="${x + 31}" y="946" text-anchor="middle" class="tiny">${lab}</text>`;
  }).join('');
  const C = 2 * Math.PI * 142;
  const off = C * (1 - Math.max(0, Math.min(100, momentum())) / 100);
  const focus = w.focus ? `${w.focus.h.emoji} ${w.focus.h.name}` : 'Keep showing up';
  const anchor = w.best ? `${w.best.h.emoji} ${w.best.h.name}` : 'Your strongest habit is forming';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#000000"/>
      <stop offset="0.58" stop-color="#070810"/>
      <stop offset="1" stop-color="#202131"/>
    </linearGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9ac9ed"/>
      <stop offset="1" stop-color="#b3dfbd"/>
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9ac9ed"/>
      <stop offset="1" stop-color="#b3dfbd"/>
    </linearGradient>
    <style>
      .label{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#b8bbd4;font-size:28px;font-weight:800;letter-spacing:5px}
      .title{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#f7f7ff;font-size:56px;font-weight:900}
      .body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#d8daf0;font-size:30px;font-weight:650}
      .metric{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#f7f7ff;font-size:62px;font-weight:900}
      .small{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#b8bbd4;font-size:24px;font-weight:750}
      .tiny{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#70758f;font-size:18px;font-weight:850;letter-spacing:2px}
    </style>
  </defs>
  <rect width="1080" height="1350" fill="url(#bgGrad)"/>
  <circle cx="930" cy="90" r="260" fill="#b3dfbd" opacity="0.12"/>
  <circle cx="100" cy="1240" r="280" fill="#9ac9ed" opacity="0.07"/>
  <rect x="70" y="70" width="940" height="1210" rx="58" fill="#11121c" opacity="0.94" stroke="#dce0ff" stroke-opacity="0.12"/>

  <text x="120" y="150" class="label">ARC90</text>
  <text x="120" y="238" class="title">${esc(compactText(S.profile.name || 'My progress', 24))} · Day ${dayNumber()}</text>
  <text x="120" y="292" class="body">${esc(compactText(S.profile.goal || 'Building the next 90 days', 48))}</text>

  <circle cx="540" cy="500" r="142" fill="none" stroke="#dce0ff" stroke-opacity="0.10" stroke-width="28"/>
  <circle cx="540" cy="500" r="142" fill="none" stroke="url(#ring)" stroke-width="28" stroke-linecap="round"
    stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 540 500)"/>
  <text x="540" y="492" text-anchor="middle" class="metric">${momentum()}%</text>
  <text x="540" y="538" text-anchor="middle" class="small">Momentum Score</text>

  <rect x="125" y="695" width="250" height="126" rx="30" fill="#151724" stroke="#ffffff" stroke-opacity="0.07"/>
  <text x="250" y="758" text-anchor="middle" class="metric">${w.pct}%</text>
  <text x="250" y="796" text-anchor="middle" class="small">this week</text>
  <rect x="415" y="695" width="250" height="126" rx="30" fill="#151724" stroke="#ffffff" stroke-opacity="0.07"/>
  <text x="540" y="758" text-anchor="middle" class="metric">${totalReps()}</text>
  <text x="540" y="796" text-anchor="middle" class="small">votes cast</text>
  <rect x="705" y="695" width="250" height="126" rx="30" fill="#151724" stroke="#ffffff" stroke-opacity="0.07"/>
  <text x="830" y="758" text-anchor="middle" class="metric">${bestStreak()}</text>
  <text x="830" y="796" text-anchor="middle" class="small">best streak</text>

  ${bars}

  <rect x="120" y="1010" width="840" height="92" rx="28" fill="#151724" stroke="#ffffff" stroke-opacity="0.07"/>
  <text x="160" y="1066" class="body">Anchor: ${esc(compactText(anchor, 34))}</text>
  <rect x="120" y="1126" width="840" height="92" rx="28" fill="#151724" stroke="#ffffff" stroke-opacity="0.07"/>
  <text x="160" y="1182" class="body">Focus: ${esc(compactText(focus, 36))}</text>
  <text x="120" y="1250" class="small">${unlocked}/${achievements.length} badges unlocked${next ? ` · Next: ${esc(compactText(next.title, 24))}` : ' · Arc complete'}</text>
</svg>`;
}

function exportShareCard() {
  download(`arc90-progress-card-${todayKey()}.svg`, shareCardSvg(), 'image/svg+xml');
}

async function importDataFile(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const proofPhotos = parsed._proofPhotos && typeof parsed._proofPhotos === 'object' ? parsed._proofPhotos : null;
    delete parsed._proofPhotos; // keep base64 blobs out of persisted state
    delete parsed._exportedAt;
    const next = normalizeState(parsed);
    if (!next.onboarded || !next.profile || !Array.isArray(next.habits) || typeof next.log !== 'object') {
      throw new Error('This backup is missing required Arc90 fields.');
    }
    const label = `${next.profile.name || 'Arc90 user'} · ${next.habits.length} habit${next.habits.length === 1 ? '' : 's'} · ${Object.keys(next.log).length} tracked day${Object.keys(next.log).length === 1 ? '' : 's'}`;
    if (!confirm(`Restore this backup?\n\n${label}\n\nThis replaces the Arc90 data on this device.`)) return;
    S = next;
    resetPlanningWorkspace();
    ob = null;
    sheet = null;
    protoOpen = null;
    protoAddOpen = false;
    protoUrgent = false;
    tab = 'today';
    save();
    if (proofPhotos) {
      const ids = Object.keys(proofPhotos);
      await Promise.all(ids.map((id) => dataURLToBlob(proofPhotos[id]).then((b) => b ? idbPut(id, b) : null).catch(() => {})));
    }
    render();
    showNudge('Backup restored. Welcome back to your arc.');
  } catch (err) {
    showNudge(`Could not restore backup: ${err.message}`);
  }
}

function exportWeeklyReport() {
  const w = weeklyReviewData();
  const lines = [
    'ARC90 — WEEKLY REVIEW',
    `Generated: ${new Date().toLocaleString()}`,
    `Name: ${S.profile.name || 'Me'}`,
    `Goal: ${S.profile.goal || 'Arc90 challenge'}`,
    `Challenge day: ${dayNumber()} of 90`,
    '',
    `Completion: ${w.completed}/${w.scheduled || 0} scheduled reps (${w.pct}%)`,
    `Full reps: ${w.full}`,
    `Minimum reps: ${w.min}`,
    `Intentional skips: ${w.skipped}`,
    `Missed scheduled reps: ${w.missed}`,
    `Reflections: ${w.reviews.reviews}`,
    `Average energy: ${w.reviews.avgEnergy ? w.reviews.avgEnergy.toFixed(1) + '/5' : 'not logged'}`,
    `Most common mood: ${w.reviews.topMood ? moodLabel(w.reviews.topMood) : 'not logged'}`,
    '',
    'Daily breakdown:',
  ];
  for (const r of w.rows) {
    lines.push(`- ${niceDate(r.key)}: ${r.total ? `${r.done}/${r.total}` : 'rest / not scheduled'}`);
  }
  lines.push('', 'Habits:');
  for (const h of S.habits) {
    const stats = habitRateForKeys(h, w.keys);
    lines.push(`- ${h.emoji} ${h.name}: ${stats ? `${stats.hit}/${stats.sched} (${stats.pct}%)` : 'not scheduled'} · ${rhythmLabel(h)} · minimum: ${h.min || '2-minute version'}`);
  }
  if (w.recentWin) lines.push('', `Recent win: ${w.recentWin}`);
  if (w.focus) lines.push('', `Focus next week: ${w.focus.h.name} — ${w.focus.h.min || 'minimum version'}`);
  download(`arc90-weekly-review-${todayKey()}.txt`, lines.join('\n'));
}

function exportProtocolReport() {
  const lines = [
    'ARC90 — PROTOCOL TRACKING REPORT',
    `Generated: ${new Date().toLocaleString()}`,
    `Name: ${S.profile.name}`,
    `Challenge: ${S.profile.goal} (Day ${dayNumber()} of 90, started ${S.profile.start})`,
    '',
    'This is a self-reported tracking log. It contains no medical advice,',
    'dosing information, or treatment recommendations.',
    '',
    '──────────────────────────────────────',
  ];
  if (!S.protocols.length) lines.push('No protocols tracked.');
  for (const p of S.protocols) {
    const t = PROTOCOL_TYPES.find((x) => x.id === p.type);
    lines.push('', `PROTOCOL: ${p.name}`, `Type: ${t ? t.label : p.type} · Timing: ${doseSlotLabel(p.slot || inferDoseSlot(p.time))} · Frequency: ${p.freq} · Reminder: ${p.time}`);
    if (p.amount) lines.push(`Dose / amount tracked: ${p.amount}`);
    if (p.reason) lines.push(`Tracking focus: ${p.reason}`);
    if (p.notes) lines.push(`Notes: ${p.notes}`);
    if (p.logs.length) {
      lines.push('Logs:');
      for (const l of p.logs) {
        lines.push(`  ${l.date} — ${l.symptoms.length ? l.symptoms.map(sLabel).join(', ') : 'logged'}${l.note ? ' — ' + l.note : ''}${l.urgent ? '  [URGENT SYMPTOMS FLAGGED]' : ''}`);
      }
    } else lines.push('Logs: none yet');
  }
  lines.push('', '──────────────────────────────────────', 'Share this report with your licensed healthcare professional.');
  download(`arc90-protocol-report-${todayKey()}.txt`, lines.join('\n'));
}

/* ============================================================
   CONFETTI · NUDGES · REMINDERS
   ============================================================ */

function confetti() {
  if (document.hidden || Arc90Motion.reduced()) return;
  const colors = ['#9ac9ed', '#b3dfbd', '#8fc99d', '#f2f4f6', '#d7e7da'];
  for (let i = 0; i < 30; i++) {
    const b = document.createElement('div');
    b.className = 'confetti-bit';
    b.style.left = Math.random() * 100 + 'vw';
    b.style.background = colors[i % colors.length];
    b.style.animationDuration = 1.1 + Math.random() * 1.2 + 's';
    b.style.animationDelay = Math.random() * 0.35 + 's';
    b.style.transform = `rotate(${Math.random() * 360}deg)`;
    if (i % 4 === 0) b.style.borderRadius = '50%';
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 2800);
  }
}

/* Vercel Web Analytics custom funnel events — no-op if analytics unavailable. */
function track(name, data) {
  try { if (typeof window !== 'undefined' && typeof window.va === 'function') window.va('event', { name: name, data: data || {} }); } catch (e) { /* analytics optional */ }
}

/* ---------------- Web Push: background reminders with the app closed ---------------- */
const VAPID_PUBLIC_KEY = 'BJSj7dlUllw8GRQLpIB8HRh4-N1uAU1OaM-XziGF2vqsOXUpwBsxLFSR0jqZFglIIuk74_OzDcWpaNQY_Tnvil0';

function urlB64ToU8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* Keep the server-side push registration in sync with local reminder settings.
   Privacy: only the push endpoint + mode/time/timezone leave the device — never content. */
async function syncPushSubscription() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(S.pushClientId)) {
      S.pushClientId = crypto.randomUUID();
      save();
    }
    const reg = await navigator.serviceWorker.ready;
    const mode = S.reminders.mode;
    if (mode === 'off') {
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe().catch(() => {});
      fetch('/api/push-subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: S.pushClientId, subscription: null, mode: 'off' }),
      }).catch(() => {});
      return;
    }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(VAPID_PUBLIC_KEY) });
    fetch('/api/push-subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: S.pushClientId,
        subscription: sub.toJSON(),
        mode,
        time: S.reminders.time || '08:00',
        tzOffsetMin: -new Date().getTimezoneOffset(),
      }),
    }).catch(() => {});
  } catch (e) { /* push is progressive enhancement — in-app nudges still work */ }
}

/* System notification that actually works on iOS home-screen PWAs: the Notification
   constructor is unsupported there, but ServiceWorkerRegistration.showNotification is.
   Falls back to the constructor for browsers without a ready service worker. */
function systemNotify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, icon: 'icons/icon-180.png', badge: 'icons/icon-180.png' };
  if (navigator.serviceWorker) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, opts))
      .catch(() => { try { new Notification(title, opts); } catch (e) { /* in-app nudge only */ } });
  } else {
    try { new Notification(title, opts); } catch (e) { /* in-app nudge only */ }
  }
}

function showNudge(text) {
  document.querySelector('.nudge')?.remove();
  const div = document.createElement('div');
  div.className = 'nudge';
  div.setAttribute('role', 'status');
  div.setAttribute('aria-live', 'polite');
  div.innerHTML = `<span class="ne" aria-hidden="true">◔</span><span class="nt">${esc(text)}</span><button class="nx" data-act="nudge-x" aria-label="Dismiss">✕</button>`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 9000);
}

function cheer() {
  return CHEERS[Math.floor(Math.random() * CHEERS.length)] || 'Nice one. Keep going! 🙌';
}

/* Post-habit check-in: a friendly, non-blocking nudge with feeling buttons. */
function showFeelNudge(habit, milestone = 0) {
  document.querySelector('.nudge')?.remove();
  const div = document.createElement('div');
  div.className = 'nudge feel-nudge';
  div.innerHTML = `
    <button class="nx" data-act="nudge-x" aria-label="Dismiss">✕</button>
    ${milestone ? `<div class="streak-milestone-copy">${milestone} days. That's a pattern now.</div>` : ''}
    <div class="feel-q">How do you feel after <b>${esc(habit.name)}</b>?</div>
    <div class="feel-row">
      ${HABIT_FEELINGS.map((f) => `
        <button class="feel-btn" data-act="feel-set" data-id="${f.id}" data-hid="${esc(String(habit.id))}" aria-label="${esc(f.label)}">
          <span class="fe">${f.emoji}</span>
          <span class="fl">${esc(f.label)}</span>
        </button>`).join('')}
    </div>`;
  document.body.appendChild(div);
  setTimeout(() => { if (div.isConnected) div.remove(); }, 14000);
}

function recordFeel(habitId, feelId) {
  const f = HABIT_FEELINGS.find((x) => x.id === feelId);
  if (!f) return;
  const k = todayKey();
  const l = dlog(k);
  l.feels = l.feels || {};
  l.feels[String(habitId)] = feelId;
  // Let a strong rep lift the day's energy/mood signal if it isn't already higher.
  if (f.energy && (Number(l.energy) || 0) < f.energy) l.energy = f.energy;
  if (f.mood && !l.mood) l.mood = f.mood;
  S.log[k] = l;
  save();
  render();
  showNudge(cheer());
}

function nudgeText() {
  const act = actionable(todayKey());
  const left = Math.max(0, act.length - act.filter((h) => isCompleted(h.id, todayKey())).length);
  const msg = NUDGES[(dayNumber() + left) % NUDGES.length];
  return msg.replaceAll('{day}', dayNumber()).replaceAll('{left}', left).replaceAll('{s}', left === 1 ? '' : 's');
}

function reminderSlots() {
  if (S.reminders.mode === 'daily') return [S.reminders.time || '08:00'];
  if (S.reminders.mode === '2h' || S.reminders.mode === '4h' || S.reminders.mode === '5h') {
    const step = S.reminders.mode === '2h' ? 120 : 240;
    const [hh, mm] = String(S.reminders.time || '08:00').split(':').map((n) => Number(n) || 0);
    const start = Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm));
    const slots = [];
    for (let mins = start; mins <= 22 * 60; mins += step) {
      const h = String(Math.floor(mins / 60)).padStart(2, '0');
      const m = String(mins % 60).padStart(2, '0');
      slots.push(`${h}:${m}`);
    }
    return slots.length ? slots : [S.reminders.time || '08:00'];
  }
  return [];
}

function checkReminders() {
  if (!S.onboarded || allDoneToday() || !S.habits.length) return;
  const k = todayKey();
  const hhmm = new Date().toTimeString().slice(0, 5);
  const fired = S.firedSlots[k] || [];
  for (const slot of reminderSlots()) {
    if (hhmm >= slot && !fired.includes(slot)) {
      fired.push(slot);
      S.firedSlots = {
        ...Object.fromEntries(Object.entries(S.firedSlots).filter(([key]) => key.startsWith('streak:'))),
        [k]: fired,
      };
      save();
      const text = nudgeText();
      systemNotify('Arc90', text);
      showNudge(text);
      break;
    }
  }
}

function checkTaskReminders() {
  if (!S.onboarded || !S.tasks || !S.tasks.length) return;
  const now = Date.now();
  let changed = false;
  let firedTab = false;
  for (const t of S.tasks) {
    if (t.done || t.notified || !t.remind || !t.due) continue;
    if (taskDeadline(t.due).getTime() <= now) {
      t.notified = true; changed = true; firedTab = true;
      systemNotify('Arc90 · Task due', t.title);
      showNudge(`⏰ Task due: ${t.title}`);
    }
  }
  if (changed) save();
  if (firedTab && tab === 'plan') render();
}

setInterval(() => {
  checkReminders();
  checkTaskReminders();
  if (S.onboarded && S.focus && S.focus.active) {
    const changed = syncFocusState();
    if (changed || tab === 'focus') render();
  }
}, 30000);
let lastAdaptiveDay = todayKey();
let lastPreviewAccess = previewAccessActive();
function closeStaleAdaptiveSheet() {
  if (sheet?.type === 'daymode' || (sheet?.type === 'adaptive' && sheet.pendingMode)) sheet = null;
}
setInterval(() => {
  if (!S.onboarded) return;
  const preview = previewAccessActive();
  if (lastPreviewAccess !== preview) {
    lastPreviewAccess = preview;
    if (preview && sheet?.type === 'paywall') sheet = null;
    render();
    return;
  }
  if (S.focus.active) {
    if (syncFocusState()) { render(); return; }
    document.querySelectorAll('.ritual-clock').forEach((node) => { node.textContent = ritualClock(S.focus.active); });
    const angle = `${Math.round(focusProgress(S.focus.active) * 360)}deg`;
    document.querySelectorAll('[data-focus-progress]').forEach((node) => { node.style.setProperty('--focus-angle', angle); });
  }
  const day = todayKey();
  if (lastAdaptiveDay !== day) {
    lastAdaptiveDay = day;
    closeStaleAdaptiveSheet();
    save();
    render();
  }
}, 1000);
let quoteHiddenAt = document.hidden ? Date.now() : null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { quoteHiddenAt = Date.now(); return; }
  const day = todayKey();
  const showWelcome = day !== lastAdaptiveDay || (quoteHiddenAt !== null && Date.now() - quoteHiddenAt >= 60000);
  const wasWriting = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
  quoteHiddenAt = null;
  if (lastAdaptiveDay !== day) {
    lastAdaptiveDay = day;
    closeStaleAdaptiveSheet();
    save();
  }
  syncFocusState(); render(); checkReminders(); checkTaskReminders();
  if (showWelcome && !wasWriting && S.onboarded) showLaunchQuote();
  if (!wasWriting) requestAnimationFrame(animateTodayArc);
});

/* sticky glass header: gains blur + hairline once the page scrolls */
window.addEventListener('scroll', () => {
  const bar = document.querySelector('.brandbar');
  if (bar) bar.classList.toggle('stuck', window.scrollY > 8);
}, { passive: true });

/* ============================================================
   DEV / DEMO HELPERS
   ============================================================ */

window.__seed = function (days = 30, premium = false) {
  if (!S.onboarded) {
    S.profile = { name: 'Michael', occupation: 'Founder · Athlete', goal: 'Run a 10K & save $1,500', goalCats: ['fit', 'money'], identity: 'an athlete & a wealth builder', motivation: 'Energy for the people I love', start: todayKey() };
    S.habits = [11, 12, 21, 23, 61].map((id) => { const h = HABIT_LIBRARY.find((x) => x.id === id); return { ...h, rhythm: 'daily' }; });
    S.reminders = { mode: 'daily', time: '08:00' };
    S.onboarded = true;
  }
  S.premium = premium;
  const today = atMidnight(operationalDate());
  S.profile.start = dkey(addDays(today, -(days - 1)));
  S.log = {};
  S.focus = defaultFocusState();
  S.focus.apps = ['Instagram', 'YouTube', 'X'];
  S.focus.sites = ['instagram.com', 'youtube.com'];
  S.focus.plans = [
    { id: 'fp1', name: 'Morning build', days: [1, 2, 3, 4, 5], start: '08:30', end: '11:00', strict: true },
    { id: 'fp2', name: 'Evening reset', days: [0, 1, 2, 3, 4, 5, 6], start: '20:30', end: '22:00', strict: false },
  ];
  S.focus.sessions = [];
  S.focus.unlocks = [];
  S.focus.seq = 2;
  const probs = S.habits.map((_, i) => i === 1 ? 0.93 : i === S.habits.length - 1 ? 0.34 : 0.72 + (i % 3) * 0.07);
  for (let i = days - 1; i >= 1; i--) {
    const k = dkey(addDays(today, -i));
    const entry = { done: [], min: [], skip: [], scheduledIds: S.habits.filter((h) => scheduledFor(h, k)).map((h) => String(h.id)) };
    S.habits.forEach((h, j) => {
      const r = Math.random();
      if (r < probs[j] * 0.85) entry.done.push(h.id);
      else if (r < probs[j]) entry.min.push(h.id);
      else if (r < probs[j] + 0.06) entry.skip.push(h.id);
    });
    S.log[k] = entry;
    if (i <= Math.min(10, days - 1) && i % 2 === 0) {
      S.focus.seq++;
      S.focus.sessions.unshift({
        id: `fs${S.focus.seq}`,
        date: k,
        startedAt: new Date(addDays(today, -i)).toISOString(),
        label: i % 4 === 0 ? 'Builder block' : 'Deep work',
        minutes: 45,
        actualMinutes: 45,
        strict: i % 4 === 0,
        status: 'completed',
        unlocks: i % 6 === 0 ? 1 : 0,
        targets: ['Work out 30 min'],
      });
      if (i % 6 === 0) {
        S.focus.unlocks.unshift({ id: `fu${S.focus.seq}`, date: k, reason: 'Emergency unlock', label: 'Builder block' });
      }
    }
  }
  S.log[todayKey()] = {
    done: S.habits.slice(0, 2).map((h) => h.id),
    min: [],
    skip: [],
    scheduledIds: S.habits.filter((h) => scheduledFor(h, todayKey())).map((h) => String(h.id)),
  };
  save(); render();
  return `seeded ${days} days (premium: ${premium})`;
};
window.__reset = function () { localStorage.removeItem(KEY); location.reload(); };
window.__arc90HealthSync = applyNativeHealthSync;

/* ---------------- boot ---------------- */

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

migrateGoalModelV2();
applyTheme();
if (captureTodaySchedule()) localStorage.setItem(KEY, JSON.stringify(S));
const previewNudge = consumePreviewLink();
lastPreviewAccess = previewAccessActive();
const bootNudge = consumeCheckoutReturn() || previewNudge;
render();
if (!bootNudge) showLaunchQuote();
Arc90LiveUpdate.confirmReady().then((confirmation) => {
  if (confirmation.status !== 'confirmed') return confirmation;
  return Arc90LiveUpdate.syncNativeUpdate();
}).then((result) => {
  if (result.status === 'ready') showNudge('Arc90 update ready. It will apply next time you open the app.');
});
if (bootNudge) setTimeout(() => showNudge(bootNudge), 500);

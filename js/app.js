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
    allDayLock: { on: false, date: '' },
  };
}

function defaultState() {
  return {
    onboarded: false,
    premium: false,
    theme: 'dark',
    profile: { name: '', occupation: '', goal: '', goalCats: [], identity: '', motivation: '', start: null },
    ai: { provider: 'anthropic', key: '' },
    aiChat: [],                  // [{role:'user'|'assistant', content}]
    habits: [],                  // [{id, emoji, name, cat, min}]
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
    pushClientId: '',            // anonymous id for the Web Push registration
    cardStyle: 'analyst',        // share-card style: analyst | certificate | quote | clear
  };
}

function normalizeState(data) {
  if (!data || typeof data !== 'object') throw new Error('Backup is not a valid Arc90 data file.');
  const s = Object.assign(defaultState(), data);
  s.profile = Object.assign(defaultState().profile, data.profile || {});
  s.ai = Object.assign(defaultState().ai, data.ai || {});
  s.reminders = Object.assign(defaultState().reminders, data.reminders || {});
  if (s.reminders.mode === '5h') s.reminders.mode = '4h';
  s.health = Object.assign(defaultState().health, data.health || {});
  s.health.settings = Object.assign(defaultState().health.settings, (data.health && data.health.settings) || {});
  if (!s.health.settings.wakeTarget) s.health.settings.wakeTarget = '07:00';
  if (!s.health.settings.sleepOnset) s.health.settings.sleepOnset = 14;
  if (!('alarmTime' in s.health.settings)) s.health.settings.alarmTime = '';
  if (!('soundTimerMin' in s.health.settings)) s.health.settings.soundTimerMin = 15;
  s.health.water = s.health.water && typeof s.health.water === 'object' ? s.health.water : {};
  s.health.weight = s.health.weight && typeof s.health.weight === 'object' ? s.health.weight : {};
  s.health.steps = s.health.steps && typeof s.health.steps === 'object' ? s.health.steps : {};
  s.health.sleep = s.health.sleep && typeof s.health.sleep === 'object' ? s.health.sleep : {};
  for (const m of ['rhr', 'hrv', 'vo2']) s.health[m] = s.health[m] && typeof s.health[m] === 'object' ? s.health[m] : {};
  s.weeklyReviews = data.weeklyReviews && typeof data.weeklyReviews === 'object' ? data.weeklyReviews : {};
  s.product = Object.assign(defaultState().product, data.product || {});
  s.log = data.log && typeof data.log === 'object' ? data.log : {};
  for (const k of Object.keys(s.log)) {
    if (Array.isArray(s.log[k])) s.log[k] = { done: s.log[k], min: [], skip: [] };
    else s.log[k] = Object.assign({ done: [], min: [], skip: [], energy: 0, mood: '', win: '', note: '', feels: {} }, s.log[k] || {});
    if (!s.log[k].feels || typeof s.log[k].feels !== 'object') s.log[k].feels = {};
  }
  s.habits = Array.isArray(data.habits) ? data.habits.map((h) => ({ rhythm: 'daily', emoji: '•', name: 'Untitled habit', cat: 'custom', min: '2-minute version', ...h })) : [];
  s.aiChat = Array.isArray(data.aiChat) ? data.aiChat : [];
  s.focus = normalizeFocusState(data.focus || {});
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
  })) : [];
  s.taskSeq = Number(data.taskSeq) || 0;
  s.journal = data.journal && typeof data.journal === 'object' ? data.journal : {};
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

let ob = null;
function freshOb() {
  return { step: 0, name: '', occs: new Set(), occCustom: '', goal: '', motivation: '', cats: new Set(), picked: new Set(), customs: [], remMode: 'daily', remTime: '08:00' };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      return normalizeState(JSON.parse(raw));
    }
  } catch (e) { /* corrupted -> fresh */ }
  return defaultState();
}
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

/* ---------------- date helpers ---------------- */

const DAY_MS = 86400000;
function dkey(d) { return d.toLocaleDateString('en-CA'); }
function todayKey() { return dkey(new Date()); }
function atMidnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startDate() { return atMidnight(new Date(S.profile.start + 'T00:00:00')); }
function dayNumber() {
  const n = Math.round((atMidnight(new Date()) - startDate()) / DAY_MS) + 1;
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

function normalizeFocusState(data) {
  const base = Object.assign(defaultFocusState(), data || {});
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
      date: s.date || todayKey(),
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
    } : null,
    unlocks: Array.isArray(base.unlocks) ? base.unlocks.map((u, i) => ({
      id: u.id || `fu${i + 1}`,
      date: u.date || todayKey(),
      reason: u.reason || 'Manual unlock',
      label: u.label || '',
    })) : [],
    seq: Math.max(0, Number(base.seq) || 0),
    allDayLock: base.allDayLock && typeof base.allDayLock === 'object'
      ? { on: !!base.allDayLock.on, date: base.allDayLock.date || '' }
      : { on: false, date: '' },
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
  const base = { done: [], min: [], skip: [], energy: 0, mood: '', win: '', note: '', intention: '', feels: {} };
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
  const today = atMidnight(new Date());
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
  const ref = addDays(atMidnight(new Date()), -back);
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
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const more = !S.premium
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
  if (!S.premium && proofPhotoCount() >= PROOF_FREE_PHOTOS) { gate('proof-limit'); return; }
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
  const y = dkey(addDays(atMidnight(new Date()), -1));
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
  const capNote = !S.premium ? `<div class="proof-cap">${proofPhotoCount()}/${PROOF_FREE_PHOTOS} free photos used · <button class="inline-link" data-act="paywall">unlimited with Premium</button></div>` : '';
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
  bg.addColorStop(0, '#0c0e18'); bg.addColorStop(0.45, '#08090f'); bg.addColorStop(1, '#050609');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, 936, 0, cx, 936, 720);
  glow.addColorStop(0, 'rgba(143,107,255,0.20)'); glow.addColorStop(1, 'rgba(7,8,12,0)');
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
  wm.addColorStop(0, '#8f6bff'); wm.addColorStop(1, '#c14cff');
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
  rg.addColorStop(0, '#5ee4ff'); rg.addColorStop(0.5, '#8f6bff'); rg.addColorStop(1, '#c14cff');
  ctx.save();
  ctx.shadowColor = 'rgba(143,107,255,0.5)'; ctx.shadowBlur = 38;
  ctx.strokeStyle = rg; ctx.beginPath(); ctx.arc(cx, ry, r, a0, a1); ctx.stroke();
  ctx.restore();
  // leading "activity dot" at the arc tip
  ctx.save();
  ctx.shadowColor = 'rgba(193,76,255,0.7)'; ctx.shadowBlur = 24;
  ctx.fillStyle = '#ecdcff';
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
  ctx.fillStyle = '#a78bff'; ctx.font = '700 40px ' + SANS;
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
  bg.addColorStop(0, '#0c0e18'); bg.addColorStop(0.5, '#08090f'); bg.addColorStop(1, '#050609');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, 880, 0, cx, 880, 760);
  glow.addColorStop(0, 'rgba(143,107,255,0.18)'); glow.addColorStop(1, 'rgba(7,8,12,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 2; storyRoundRect(ctx, 40, 40, W - 80, H - 80, 54); ctx.stroke();
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 60px ' + SANS;
  const wA = ctx.measureText('ARC').width, w9 = ctx.measureText('90').width, x0 = cx - (wA + w9) / 2;
  ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.fillText('ARC', x0, 200);
  const wm = ctx.createLinearGradient(x0 + wA, 0, x0 + wA + w9, 0); wm.addColorStop(0, '#8f6bff'); wm.addColorStop(1, '#c14cff');
  ctx.fillStyle = wm; ctx.fillText('90', x0 + wA, 200);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(143,107,255,0.45)'; ctx.font = '800 240px Georgia, "Times New Roman", serif'; ctx.fillText('“', cx, 600);
  ctx.fillStyle = INK; ctx.font = '600 66px ' + SANS;
  const lines = wrapCanvasText(ctx, book.quote, W - 240).slice(0, 7);
  const lh = 92; let y = 940 - (lines.length - 1) * lh / 2;
  for (const ln of lines) { ctx.fillText(ln, cx, y); y += lh; }
  ctx.fillStyle = MUTE; ctx.font = 'italic 500 42px ' + SANS; ctx.fillText('— ' + book.source, cx, y + 46);
  ctx.fillStyle = '#a78bff'; ctx.font = '700 40px ' + SANS; ctx.fillText('arc90', cx, 1838);
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
    dark:  { bg: ['#0c0e18', '#08090f', '#050609'], glow: 'rgba(143,107,255,0.20)', border: 'rgba(255,255,255,0.05)', ink: '#f4f5ff', mute: 'rgba(221,225,255,0.58)', faint: 'rgba(221,225,255,0.42)', track: 'rgba(221,225,255,0.10)', grad: ['#5ee4ff', '#8f6bff', '#c14cff'], accent: '#8f6bff', on: '#ffffff', ringGlow: 'rgba(143,107,255,0.5)', tick: '#ecdcff', dim: 'rgba(221,225,255,0.09)' },
    light: { bg: ['#ffffff', '#f1f1f1', '#e6e6e6'], glow: 'rgba(0,0,0,0.035)', border: 'rgba(0,0,0,0.14)', ink: '#141414', mute: 'rgba(17,17,17,0.66)', faint: 'rgba(17,17,17,0.54)', track: 'rgba(0,0,0,0.14)', grad: ['#555555', '#222222', '#111111'], accent: '#141414', on: '#ffffff', ringGlow: 'rgba(0,0,0,0.18)', tick: '#111111', dim: 'rgba(0,0,0,0.08)' },
    green: { bg: ['#08150e', '#050b08', '#030604'], glow: 'rgba(52,211,153,0.17)', border: 'rgba(180,255,214,0.08)', ink: '#eafff4', mute: 'rgba(234,255,244,0.58)', faint: 'rgba(234,255,244,0.42)', track: 'rgba(180,255,214,0.12)', grad: ['#6ee7b7', '#34d399', '#10b981'], accent: '#34d399', on: '#04140d', ringGlow: 'rgba(52,211,153,0.45)', tick: '#eafff4', dim: 'rgba(180,255,214,0.08)' },
    red:   { bg: ['#170709', '#0a0405', '#060203'], glow: 'rgba(255,93,108,0.17)', border: 'rgba(255,205,210,0.08)', ink: '#fff0f1', mute: 'rgba(255,240,241,0.58)', faint: 'rgba(255,240,241,0.42)', track: 'rgba(255,205,210,0.12)', grad: ['#ff8f7a', '#ff5d6c', '#e23950'], accent: '#ff5d6c', on: '#1a0306', ringGlow: 'rgba(255,93,108,0.45)', tick: '#fff0f1', dim: 'rgba(255,205,210,0.08)' },
  };
  return P[t] || P.dark;
}

function buildTodayCanvas() {
  const W = 1080, cx = W / 2;
  const P = cardTheme();
  const c = document.createElement('canvas'); c.width = W; c.height = 400;
  const ctx = c.getContext('2d');
  const k = todayKey();
  const act = actionable(k);
  const total = act.length;
  const done = act.filter((h) => isCompleted(h.id, k)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const frac = total ? done / total : 0;
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
  const reflBottom = 876 + qLines.length * (qf + 16);
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
  const ry = 540, r = 175;
  ctx.lineCap = 'round'; ctx.lineWidth = 28;
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
  const ps = pct + '%';
  let nf = 116;
  ctx.font = '800 ' + nf + 'px ' + SANS;
  while (ctx.measureText(ps).width > 272 && nf > 72) { nf -= 4; ctx.font = '800 ' + nf + 'px ' + SANS; }
  ctx.fillStyle = P.ink; ctx.textBaseline = 'middle';
  ctx.fillText(ps, cx, ry - 26);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = P.mute; ctx.font = '700 31px ' + SANS; ctx.fillText(`${done} of ${total} today`, cx, ry + 86);

  // stat row — streak · readiness · momentum (the full story for anyone who sees the card)
  {
    const stk = dayStreak();
    const rd = vitality().score;
    const tiles = [
      [String(stk), stk === 1 ? 'DAY STREAK' : 'DAY STREAK'],
      [rd === null ? `Day ${dayNumber()}` : String(rd), rd === null ? 'OF 90' : 'READINESS'],
      [momentum() + '%', 'MOMENTUM'],
    ];
    const tw = 280, th = 100, gap = 20, tx0 = cx - (tw * 3 + gap * 2) / 2, ty = 668;
    tiles.forEach(([val, lab], i) => {
      const x = tx0 + i * (tw + gap);
      ctx.fillStyle = P.dim; storyRoundRect(ctx, x, ty, tw, th, 24); ctx.fill();
      ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; storyRoundRect(ctx, x, ty, tw, th, 24); ctx.stroke();
      ctx.fillStyle = P.ink; ctx.font = '800 42px ' + SANS; ctx.fillText(val, x + tw / 2, ty + 52);
      ctx.fillStyle = P.faint; ctx.font = '700 18px ' + SANS; ctx.fillText(cap(lab), x + tw / 2, ty + 82);
    });
  }

  // daily reflection
  ctx.fillStyle = P.faint; ctx.font = '700 22px ' + SANS; ctx.fillText(cap('DAILY REFLECTION'), cx, 812);
  ctx.fillStyle = P.ink; ctx.font = 'italic 600 ' + qf + 'px ' + SERIF;
  let qy = 876;
  for (const line of qLines) { ctx.fillText(line, cx, qy); qy += qf + 16; }
  ctx.fillStyle = P.accent; ctx.font = '600 27px ' + SANS;
  ctx.fillText('— ' + book.source, cx, qy + 14);

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
  const start = startDate(), todayMid = atMidnight(new Date());
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
  const k = todayKey();
  const act = actionable(k);
  const total = act.length;
  const done = act.filter((h) => isCompleted(h.id, k)).length;
  return {
    P: cardTheme(),
    SANS: '-apple-system, "Helvetica Neue", "Segoe UI", Arial, sans-serif',
    SERIF: 'Georgia, "Times New Roman", serif',
    firstName: (S.profile.name || '').trim().split(' ')[0] || 'You',
    day: dayNumber(), stk: dayStreak(),
    total, done, pct: total ? Math.round((done / total) * 100) : 0, frac: total ? done / total : 0,
    book: reflectionQuote(),
  };
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
  ctx.fillStyle = P.faint; ctx.font = '700 23px ' + SANS; ctx.fillText(cap('COMPLETE'), cx, ry - 62);
  const psv = pct + '%'; let nf = 128; ctx.font = '800 ' + nf + 'px ' + SANS;
  while (ctx.measureText(psv).width > 300 && nf > 82) { nf -= 4; ctx.font = '800 ' + nf + 'px ' + SANS; }
  ctx.fillStyle = P.ink; ctx.textBaseline = 'middle'; ctx.fillText(psv, cx, ry + 20); ctx.textBaseline = 'alphabetic';

  // status pill
  const rdBC = vitality().score;
  const pill = [`${done} of ${total} today`, stk > 1 ? `${stk}-day streak` : null, rdBC !== null ? `Readiness ${rdBC}` : null]
    .filter(Boolean).join('   ·   ');
  ctx.font = '700 30px ' + SANS;
  const pw = ctx.measureText(pill).width + 64, ph = 68, px = cx - pw / 2, py = 962;
  ctx.fillStyle = P.dim; storyRoundRect(ctx, px, py, pw, ph, 34); ctx.fill();
  ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; storyRoundRect(ctx, px, py, pw, ph, 34); ctx.stroke();
  ctx.fillStyle = P.ink; ctx.textBaseline = 'middle'; ctx.fillText(pill, cx, py + ph / 2 + 2); ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = P.faint; ctx.font = '600 24px ' + SANS;
  ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), cx, H - 84);
  return c;
}

// QUOTE — the daily reflection as the hero, built to be shared as wisdom
function cardQuote() {
  const W = 1080, cx = W / 2;
  const { P, SANS, SERIF, firstName, day, pct, book } = cardCommon();
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
  ctx.fillStyle = P.accent; ctx.font = '600 36px ' + SANS; ctx.fillText('— ' + book.source, cx, y + 34);
  ctx.strokeStyle = P.border; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 90, y + 120); ctx.lineTo(cx + 90, y + 120); ctx.stroke();
  cardWordmark(ctx, cx, y + 210, P, SANS, 40);
  ctx.fillStyle = P.mute; ctx.font = '600 28px ' + SANS; ctx.fillText(`${firstName}  ·  Day ${day} of 90  ·  ${pct}% today`, cx, y + 258);
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
  ctx.fillStyle = P.faint; ctx.font = 'italic 400 34px ' + SERIF; ctx.fillText('This certifies that', cx, 404);
  ctx.fillStyle = P.ink; ctx.font = '700 92px ' + SERIF; ctx.fillText(storyTruncate(ctx, firstName, 820), cx, 502);
  ctx.fillStyle = P.faint; ctx.font = 'italic 400 34px ' + SERIF; ctx.fillText('showed up for', cx, 582);
  ctx.fillStyle = P.accent; ctx.font = '800 118px ' + SERIF; ctx.fillText('Day ' + day, cx, 716);
  ctx.fillStyle = P.mute; ctx.font = '600 34px ' + SANS; ctx.fillText('of the 90-day arc', cx, 778);
  const sy = 1010, sr = 138;
  ctx.save(); ctx.shadowColor = P.ringGlow; ctx.shadowBlur = 30;
  ctx.strokeStyle = P.accent; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(cx, sy, sr, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
  ctx.fillStyle = P.ink; ctx.font = '800 74px ' + SANS; ctx.textBaseline = 'middle'; ctx.fillText(pct + '%', cx, sy - 4); ctx.textBaseline = 'alphabetic';
  const rdCert = vitality().score;
  ctx.fillStyle = P.mute; ctx.font = '600 30px ' + SANS;
  ctx.fillText(`${done} of ${total} habits today${rdCert !== null ? `  ·  Readiness ${rdCert}` : ''}`, cx, sy + sr + 54);
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
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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

function bestDayStreak() {
  const today = atMidnight(new Date());
  let best = 0, run = 0;
  for (let i = elapsedDays() - 1; i >= 0; i--) {
    const k = dkey(addDays(today, -i));
    if (rateFor(k) === null) continue;
    if (dayCompleted(k)) { run++; best = Math.max(best, run); } else run = 0;
  }
  return Math.max(best, dayStreak());
}

function perfectDays() {
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
  for (let i = 0; i < elapsedDays(); i++) {
    const r = rateFor(dkey(addDays(today, -i)));
    if (r !== null && r >= 1) c++;
  }
  return c;
}

/* how often a missed habit gets completed the very next day */
function recoveryRate() {
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const yesterday = dkey(addDays(atMidnight(new Date()), -1));
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
  const today = atMidnight(new Date());
  const mondayOffset = (today.getDay() + 6) % 7;
  return dkey(addDays(today, -mondayOffset));
}

function weeklyCoachReview() {
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
  };
}

function setSleepDay(k, patch) {
  S.health.sleep[k] = Object.assign({}, sleepDay(k), patch);
  const d = S.health.sleep[k];
  if (d.hours === '' && !d.note && !d.wakeMood) delete S.health.sleep[k];
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
  const k = payload.date || todayKey();
  setHealthDay(k, {
    steps: payload.steps,
    weight: payload.weight,
    water: payload.water,
  });
  if (payload.sleepHours !== undefined || payload.sleepQuality !== undefined) {
    setSleepDay(k, { hours: payload.sleepHours ?? '', quality: payload.sleepQuality || 'steady' });
  }
  render();
  showNudge('Health signals synced. Steps can now auto-complete matching habits.');
}

function sleepStats(nDays = 7) {
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  if (!focusNativeBridgeAvailable()) return false;
  try {
    window.webkit.messageHandlers.arc90Focus.postMessage({ action, ...payload });
    return true;
  } catch (e) {
    return false;
  }
}

function finishFocusSession(status = 'completed') {
  const active = S.focus.active;
  if (!active) return false;
  requestNativeFocusShield('stop', { status });
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
  const today = atMidnight(new Date());
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

function startFocusSession(minutes, label, strict = true) {
  const target = nextBestRep();
  const session = {
    start: new Date().toISOString(),
    minutes: Math.max(1, Number(minutes) || 30),
    label: label || 'Focus session',
    strict: !!strict,
    targets: [target ? target.name : (S.profile.goal || 'Your next 90 days')],
    unlocks: 0,
  };
  S.focus.active = {
    ...session,
  };
  const nativeSent = requestNativeFocusShield('start', {
    ...session,
    apps: S.focus.apps,
    sites: S.focus.sites,
  });
  S.focus.mode = nativeSent ? 'native-ready' : 'soft';
  save();
  return nativeSent;
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
  return `
    <div class="mood-choice-row ${extraClass}">
      ${MOOD_OPTIONS.map(([id, label]) => `
        <button class="${current === id ? 'on' : ''}" data-act="mood-quick" data-id="${id}" aria-label="Set mood to ${esc(label)}">
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

function projectedReps() {
  const remaining = Math.max(0, daysLeft());
  const scheduled = actionable(todayKey()).length || S.habits.length;
  return Math.round(totalReps() + avgRate(7) * scheduled * remaining);
}

function reflectionCount(nDays = 90) {
  const today = atMidnight(new Date());
  let count = 0;
  for (let i = 0; i < Math.min(nDays, elapsedDays()); i++) {
    const l = dlog(dkey(addDays(today, -i)));
    if (l.energy || l.mood || l.win || l.note) count++;
  }
  return count;
}

function activeDaysCount() {
  const start = startDate();
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  const d = Math.round((atMidnight(new Date()) - atMidnight(new Date(S.forge.start + 'T00:00:00'))) / DAY_MS) + 1;
  return d >= 1 && d <= 7;
}
function forgeDay() {
  return Math.round((atMidnight(new Date()) - atMidnight(new Date(S.forge.start + 'T00:00:00'))) / DAY_MS) + 1;
}

const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M8.5 12.2l2.4 2.4 4.6-5"/></svg>',
  habits: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6.5h10M4 12h10M4 17.5h10"/><circle cx="19" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="17.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
  focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2"/></svg>',
  protocol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 7.5l6 6"/><path d="M7.5 10.5l6 6"/><rect x="3.5" y="11" width="17" height="6.5" rx="3.25" transform="rotate(-45 12 14.25)"/><circle cx="6.8" cy="17.2" r="1.2"/><circle cx="17.2" cy="6.8" r="1.2"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 6-8"/><path d="M16 6h3v3"/></svg>',
  coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.2-.6L3 21l1.7-5.1a8.3 8.3 0 01-1.2-4.4 8.4 8.4 0 018.5-8.4 8.4 8.4 0 019 8.4z"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.6-3.4 4.5-5 8-5s6.4 1.6 8 5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  vitals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-5 3 10 2.4-6 1.6 3H21"/></svg>',
  sleep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 10 4.2 6.5 6.5 0 0 0 20 14.5z"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4.5" width="16" height="16" rx="3"/><path d="M8 3v3M16 3v3M4 9.5h16"/><path d="M8.6 14l2 2 3.8-4"/></svg>',
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
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bar = { light: '#f2f2f2', mono: '#0a0a0a', green: '#050b08', red: '#0a0405', dark: '#03040a' };
    meta.content = bar[resolved] || '#03040a';
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

function gate(context) {
  if (S.premium) return true;
  sheet = { type: 'paywall', context };
  render();
  return false;
}

function isDevHost() {
  return ['localhost', '127.0.0.1', '0.0.0.0', ''].includes(window.location.hostname);
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
  };
  return copy[context] || {
    eyebrow: 'Upgrade your 90-day system',
    title: 'Turn your habits into a system you can actually read.',
    sub: 'Premium adds the views, recovery tools, and exports that help you spot what is working before motivation fades.',
  };
}

function premiumBenefits() {
  return [
    ['Axis Dashboard', 'See where habits, energy, focus, sleep, and recovery are helping or dragging.'],
    ['Forge Mode', 'A 7-day recovery plan when the arc starts slipping.'],
    ['Unlimited reps', 'More habits, custom routines, and challenge templates.'],
    ['Weekly reviews', 'Progress summaries and polished exports for accountability.'],
  ];
}

/* ============================================================
   RENDER ROOT
   ============================================================ */

const app = document.getElementById('app');

const TAB_ORDER = ['today', 'habits', 'sleep', 'focus', 'plan', 'progress', 'profile'];
function mainTabOf(id) {
  if (id === 'protocol' || id === 'vitals') return 'sleep'; // reached from the Sleep tab
  return TAB_ORDER.includes(id) ? id : 'today';
}
let lastRenderedTab = null;
let tabDirection = 'next';
let navOpen = false;
let proofTag = 'Win';            // selected tag in the proof note composer
let proofSeq = 0;                // disambiguates ids created in the same millisecond
let shareCanvas = null;          // last-built story card (canvas) for native share / save
let shareCardURL = '';           // its dataURL for the preview sheet
function render() {
  applyTheme();
  syncFocusState();
  if (!S.onboarded) { renderOnboarding(); return; }
  const animate = lastRenderedTab !== tab;
  const directionClass = animate ? ` enter-${tabDirection === 'prev' ? 'prev' : 'next'}` : '';
  lastRenderedTab = tab;
  const views = { today: viewToday, habits: viewHabits, sleep: viewSleep, focus: viewFocus, plan: viewPlan, progress: viewProgress, coach: viewCoach, protocol: viewProtocol, vitals: viewVitals, profile: viewProfile };
  app.innerHTML = `
    <div class="screen${animate ? ` anim${directionClass}` : ''}">${views[tab]()}</div>
    <nav class="tabbar seven">
      ${tabBtn('today', 'Today', ICONS.today)}
      ${tabBtn('habits', 'Habits', ICONS.habits)}
      ${tabBtn('sleep', 'Sleep', ICONS.sleep)}
      ${tabBtn('focus', 'Focus', ICONS.focus)}
      ${tabBtn('plan', 'Plan', ICONS.plan)}
      ${tabBtn('progress', 'Progress', ICONS.progress)}
      ${tabBtn('profile', 'Profile', ICONS.profile)}
    </nav>
    ${sheet ? viewSheet() : ''}
  `;
  wireAfterRender();
  hydrateProofImages();
  sendWatchSnapshot('render');
}

function tabBtn(id, label, icon) {
  return `<button class="tab-btn ${mainTabOf(tab) === id ? 'active' : ''}" data-act="tab" data-id="${id}">${icon}<span>${label}</span></button>`;
}

function sideNavBtn(id, label, icon, meta = '') {
  return `<button class="side-nav-btn ${mainTabOf(tab) === id ? 'active' : ''}" data-act="tab" data-id="${id}">
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
        <button class="side-upgrade" data-act="paywall">${S.premium ? 'Premium Active' : 'Upgrade to Pro'}</button>
      </aside>
    </div>`;
}

function switchTab(next) {
  if (!next || next === tab) return;
  const from = TAB_ORDER.indexOf(mainTabOf(tab));
  const to = TAB_ORDER.indexOf(mainTabOf(next));
  tabDirection = to >= from ? 'next' : 'prev';
  document.documentElement.dataset.tabDirection = tabDirection;
  const update = () => {
    tab = next;
    navOpen = false;
    openQA = null;
    window.scrollTo(0, 0);
    render();
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && document.startViewTransition) document.startViewTransition(update);
  else update();
}

/* global header: centered wordmark with the live 90-day arc */
function brandbar() {
  const day = dayNumber();
  return `
    <div class="brandbar">
      <svg viewBox="0 0 108 108" width="18" height="18" style="transform:rotate(-90deg)">
        <circle cx="54" cy="54" r="44" fill="none" stroke="var(--line-2)" stroke-width="14"/>
        <circle cx="54" cy="54" r="44" fill="none" stroke="url(#ringGrad)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(276.46 * day / 90).toFixed(1)} 276.5"/>
      </svg>
      <span>ARC<b>90</b></span>
    </div>`;
}

/* ============================================================
   TODAY
   ============================================================ */

function viewToday() {
  const act = actionable(todayKey());
  const total = act.length;
  const done = act.filter((h) => isCompleted(h.id, todayKey())).length;
  const frac = total ? done / total : 0;
  const C = 364.425;
  const mom = momentum();
  const pill = mom >= 70 ? ['good', 'Primed'] : mom >= 45 ? ['mid', 'Building'] : ['low', 'Recover'];
  const day = dayNumber();
  const todayPct = Math.round(frac * 100);
  const challengePct = Math.round((day / 90) * 100);
  const reps = totalReps();
  const dayLeftCount = daysLeft();
  const weekTone = mom >= 70 ? 'Strong week' : mom >= 45 ? 'Gaining traction' : 'Needs a reset';
  const md = momentumDelta();
  const mdCls = md > 0 ? 'up' : md < 0 ? 'down' : 'flat';
  const mdTxt = md > 0 ? `▲ +${md} today` : md < 0 ? `▼ ${Math.abs(md)} today` : 'Even today';

  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>${greeting()}, ${esc(S.profile.name.split(' ')[0] || 'you')}</h1>
        <div class="sub">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <span class="day-chip">◔ Day ${day} of 90 · ${daysLeft()} left</span>
      </div>
    </header>

    ${forgeActive() ? `<div class="forge-banner"><div>Forge Mode · Day ${forgeDay()} of 7 — minimum versions only on your focus habits. Show up small.</div></div>` : ''}

    <section class="card hero-card">
      <div class="hero-topline">
        <div class="hero-topline-label" data-act="today-habits-scroll">
          <span class="eyebrow">Today’s arc</span>
          <strong>${total ? `${done} of ${total} complete` : 'No habits due'}</strong>
        </div>
        <div class="hero-topline-actions">
          <span class="status-pill ${pill[0]}">${pill[1]}</span>
          ${S.habits.length ? `<button class="hero-share" data-act="share-today" aria-label="Share today’s arc">↗</button>` : ''}
        </div>
      </div>

      <div class="hero">
        <button class="ring-wrap hero-ring" data-act="today-habits-scroll" aria-label="Open today's habits — ${done} of ${total || 0} complete">
          <svg viewBox="0 0 132 132" width="132" height="132">
            <circle class="ring-track" cx="66" cy="66" r="58" fill="none" stroke-width="12"/>
            <circle class="ring-fill" cx="66" cy="66" r="58" fill="none" stroke-width="12"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/>
          </svg>
          <div class="ring-center">
            <div class="big-num"><span data-countup="${todayPct}" data-suffix="%">0</span></div>
            <div class="of">${done}/${total || 0} today</div>
          </div>
        </button>
        <div class="hero-stats">
          <div class="hstat">
            <div class="eyebrow">Momentum score</div>
            <div class="hstat-val grad"><span data-countup="${mom}">0</span><span class="unit">%</span></div>
            <div class="hstat-note"><span class="mom-delta ${mdCls}">${mdTxt}</span> · ${weekTone}</div>
          </div>
          <div class="hstat">
            <div class="eyebrow">90-day goal</div>
            <div class="goal-copy">${esc(S.profile.goal || 'Set a target in Profile')}</div>
            <div class="goal-meter" aria-hidden="true"><i style="width:${challengePct}%"></i></div>
          </div>
        </div>
      </div>

      ${(() => {
        const rd = vitality();
        const rst = vitalityState(rd.score);
        return `
      <button class="readiness-strip" data-act="readiness-scroll" aria-label="Readiness ${rd.score === null ? 'not logged yet' : `${rd.score} — ${rst.label}`}. View breakdown.">
        <span class="rd-label">Readiness</span>
        <span class="rd-meter"><i style="width:${rd.score === null ? 0 : rd.score}%"></i></span>
        ${rd.score === null
          ? `<span class="rd-state none">Log signals →</span>`
          : `<b class="rd-score">${rd.score}</b><span class="rd-state ${rst.cls}">${rst.label}</span>`}
      </button>`;
      })()}

      <div class="hero-metrics">
        <div><span>Day</span><b>${day}<em>/90</em></b></div>
        <div><span>Left</span><b>${dayLeftCount}</b></div>
        <div><span>Votes</span><b data-countup="${reps}">0</b></div>
      </div>

      <div class="arc-grid-panel">
        <div class="arc-grid-head">
          <div>
            <span class="eyebrow">90-day field</span>
            <b>${challengePct}% of the arc</b>
          </div>
          <span>${weekTone}</span>
        </div>
        ${grid90()}
        <div class="arc-grid-legend">
          <span><i class="l1"></i>started</span>
          <span><i class="l2"></i>partial</span>
          <span><i class="l3"></i>fulfilled</span>
        </div>
      </div>

    </section>

    ${vitalityCard()}

    <div class="card-head today-reps-head">
      <span class="section-title" style="margin:0">Today</span>
      <button class="mini-act" data-act="tab" data-id="habits">${done}/${total} · edit</button>
    </div>
    ${S.habits.length ? `<div class="habit-check-grid">${S.habits.map(habitCheckTile).join('')}</div>`
      : `<div class="card empty-note">No habits yet. <button class="inline-link" data-act="tab" data-id="habits">Choose the reps</button> that carry the 90 days.</div>`}

    ${todayStopCard()}

    ${S.habits.length ? streakBannerCard() : ''}

    <button class="coach-entry" data-act="tab" data-id="coach">
      <span class="coach-entry-ico">${ICONS.coach}</span>
      <span class="coach-entry-txt">
        <b>Ask your Coach</b>
        <small>Your read, where to improve &amp; a 7-day plan →</small>
      </span>
    </button>

    ${premiumLaunchCard()}

    ${weakSpotCard()}
    ${dailyReflectionCard()}
    ${todayFocusStrip()}
    ${comebackBtn()}
  `;
}

function premiumLaunchCard() {
  if (S.premium) return '';
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
    <button class="habit-check-tile ${cls}" data-act="toggle" data-id="${h.id}" aria-label="${esc(h.name)}">
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

  return [
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
  const today = atMidnight(new Date());
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

function healthTodayCard() {
  const h = healthDay();
  const waterPct = Math.min(100, Math.round((h.water / S.health.settings.waterGoal) * 100));
  const stepPct = Math.min(100, Math.round((h.steps / S.health.settings.stepGoal) * 100));
  const stats = dayStats(todayKey());
  const todayPct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const l = dlog(todayKey());
  const energyPct = l.energy ? l.energy * 20 : 0;
  const weightMeta = latestWeightMeta();
  return `
    <section class="health-stack">
      <div class="signal-card score-card">
        <div class="signal-head">
          <div>
            <span class="signal-icon">◎</span>
            <b><span data-countup="${momentum()}">0</span><em>%</em></b>
            <small>Momentum score</small>
          </div>
          <div class="signal-goal">
            <span>Goal</span>
            <b>${stats.done}/${stats.total || 0}</b>
          </div>
        </div>
        <div class="mini-ring-row">
          ${miniMetricRing('Today', todayPct, `${stats.done}/${stats.total || 0}`)}
          ${miniMetricRing('Glasses', waterPct, `${h.water}/${S.health.settings.waterGoal}`)}
          ${miniMetricRing('Steps', stepPct, h.steps ? compactNumber(h.steps) : '--')}
          ${miniMetricRing('Energy', energyPct, l.energy ? `${l.energy}/5` : '--')}
        </div>
      </div>

      <div class="signal-card flow-card">
        <div class="flow-head">
          <div><span class="signal-icon">↟</span><b>${stats.done}/${stats.total || 0}</b><small>habit flow today</small></div>
          <span>${stats.rate === null ? 'Rest day' : `${todayPct}% kept`}</span>
        </div>
        <div class="flow-bars">${dayFlowBars()}</div>
        <div class="flow-times"><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
      </div>

      <div class="signal-grid">
        <div class="signal-card compact-signal">
          <div class="compact-top"><span class="signal-icon">💧</span><small>Glasses</small></div>
          <b>${h.water}<em>/${S.health.settings.waterGoal}</em></b>
          <div class="mini-progress"><i style="width:${waterPct}%"></i></div>
          <div class="health-actions">
            <button data-act="water-sub" aria-label="Remove one glass of water">−</button>
            <button data-act="water-add" aria-label="Add one glass of water">+</button>
          </div>
        </div>
        <div class="signal-card compact-signal">
          <div class="compact-top"><span class="signal-icon">⌁</span><small>Steps</small></div>
          <b>${h.steps ? h.steps.toLocaleString() : '--'}<em>/${compactNumber(S.health.settings.stepGoal)}</em></b>
          <div class="mini-progress"><i style="width:${stepPct}%"></i></div>
          <small>${h.steps >= S.health.settings.stepGoal ? 'Auto-complete ready' : 'Native Health sync ready'}</small>
        </div>
      </div>

      <div class="signal-card weight-signal">
        <div>
          <div class="compact-top"><span class="signal-icon">⚖️</span><small>Weight signal</small></div>
          <b>${weightMeta.value ? `${esc(weightMeta.value)}<em>${weightMeta.unit}</em>` : '--'}</b>
          <small>${esc(weightMeta.copy)}</small>
        </div>
        <div class="weight-row">
          <input id="weightInput" type="number" inputmode="decimal" placeholder="Weight" value="${esc(h.weight)}"/>
          <button class="btn" data-act="weight-save">Save</button>
        </div>
      </div>

      <button class="signal-sync" data-act="health-sync">Sync Health signals</button>
      <div class="seg-hint">Designed for HealthKit steps and weight sync. Until the native bridge is attached, manual entries stay private on this device.</div>
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
  const today = atMidnight(new Date());
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

function habitsHeroCard() {
  const n = S.habits.length;
  if (!n) return '';
  const today = atMidnight(new Date());
  let done = 0, due = 0;
  for (let i = 0; i < 7; i++) {
    const k = dkey(addDays(today, -i));
    const a = actionable(k);
    due += a.length;
    done += a.filter((h) => isCompleted(h.id, k)).length;
  }
  const rate = due ? Math.round((done / due) * 100) : 0;
  let bestS = 0;
  S.habits.forEach((h) => { const s = streak(h.id); if (s > bestS) bestS = s; });
  return tabHeroCard(
    'Your system',
    `${n} rep${n === 1 ? '' : 's'} in rotation`,
    `Small daily votes for ${esc(S.profile.identity || 'the new you')}`,
    [['This week', rate + '%'], ['Best chain', bestS ? bestS + 'd' : '—'], ['Total votes', totalReps()]]
  );
}

function viewHabits() {
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Habits</h1>
        <div class="sub">The reps that build ${esc(S.profile.identity || 'the new you')}</div>
      </div>
      <button class="mini-act top-mini" data-act="tab" data-id="today">Done</button>
    </header>

    ${habitsHeroCard()}

    <div class="section-title">Your habits <span class="count-bub">${S.habits.length}${S.premium ? '' : ` / ${FREE_HABITS}`}</span></div>
    ${S.premium ? '' : `<div class="limit-note">Base plan: ${FREE_HABITS} active habits · ${FREE_CUSTOM} custom. <b data-act="paywall" style="cursor:pointer">Premium unlocks unlimited</b></div>`}
    ${S.habits.length ? `<div class="mine-grid">${S.habits.map(mineRow).join('')}</div>` : '<div class="card empty-note">Nothing here yet — add from the library below.</div>'}

    ${libraryPanel()}

    <div class="section-gap section-title">Create your own</div>
    <div class="custom-form">
      <input id="customName" type="text" placeholder="e.g. Practice salsa 15 min" maxlength="48"/>
      <button class="btn" data-act="add-custom" style="padding:0 20px">Add</button>
    </div>

    <div class="section-gap">${challengeTemplatesPanel()}</div>
  `;
}

function libraryPanel() {
  const cat = libCat === 'all' ? 'All missions' : (CATEGORIES.find((c) => c.id === libCat)?.name || 'Filtered');
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
          <div class="search-bar">${ICONS.search}<input id="libSearch" type="search" placeholder="Search 100 habits..." value="${esc(libQuery)}"/></div>
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

function mineRow(h) {
  const today = atMidnight(new Date());
  let dots = '';
  for (let i = 6; i >= 0; i--) {
    const st = statusOf(h.id, dkey(addDays(today, -i)));
    dots += `<i class="${st === 'done' ? 'on' : st === 'min' ? 'min' : ''}"></i>`;
  }
  return `
    <div class="mine-row">
      <span class="lib-emoji">${habitIcon(h)}</span>
      <div class="mine-copy">
        <div class="lib-name">${esc(h.name)}</div>
        <div class="lib-cat">${rhythmLabel(h)} · min: ${esc(h.min || '2-minute version')}</div>
        <div class="dot7" style="margin-top:6px">${dots}</div>
      </div>
      <div class="mine-actions">
        <button class="remove-btn rhythm-btn" data-act="rhythm-sheet" data-id="${h.id}">${rhythmLabel(h, true)}</button>
        <button class="remove-btn" data-act="remove" data-id="${h.id}">Remove</button>
      </div>
    </div>`;
}

function libList() {
  const q = libQuery.trim().toLowerCase();
  let items = HABIT_LIBRARY.filter((h) =>
    (libCat === 'all' || h.cat === libCat) &&
    (!q || h.name.toLowerCase().includes(q) || catOf(h.cat).name.toLowerCase().includes(q))
  );
  if (!items.length) return '<div class="empty-note">No matches — create it yourself below.</div>';
  return `<div class="lib-grid">${items.map((h) => {
    const added = S.habits.some((x) => x.id === h.id);
    return `
      <button class="ltile ${added ? 'added' : ''}" data-act="lib-toggle" data-id="${h.id}" title="min: ${esc(h.min)}">
        <span class="ltb">${added ? '✓' : '+'}</span>
        <span class="lte">${habitIcon(h)}</span>
        <span class="ltn">${esc(h.name)}</span>
      </button>`;
  }).join('')}</div>`;
}

function addHabit(libId) {
  const h = HABIT_LIBRARY.find((x) => x.id === libId);
  if (!h || S.habits.some((x) => x.id === h.id)) return true;
  if (!S.premium && S.habits.length >= FREE_HABITS) return gate('habit-limit') && addHabit(libId);
  S.habits.push({ id: h.id, emoji: h.emoji, name: h.name, cat: h.cat, min: h.min, rhythm: 'daily' });
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
  if (!S.premium && S.habits.length >= FREE_HABITS) return gate('habit-limit');
  if (!S.premium && customCount() >= FREE_CUSTOM) return gate('custom-limit');
  S.customSeq++;
  S.habits.push({ id: 'c' + S.customSeq, emoji: '✨', name: n, cat: 'custom', min: '2-minute version', rhythm: 'daily' });
  save();
  return true;
}

function applyTemplate(id) {
  const tpl = CHALLENGE_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return;
  let added = 0;
  for (const habitId of tpl.habits) {
    if (S.habits.some((h) => h.id === habitId)) continue;
    if (!S.premium && S.habits.length >= FREE_HABITS) break;
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
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.arc90Health) {
      window.webkit.messageHandlers.arc90Health.postMessage(message);
      showNudge('Asked the native Health bridge for steps and weight.');
      return;
    }
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Arc90Health) {
      window.Capacitor.Plugins.Arc90Health.sync(message).then(applyNativeHealthSync).catch(() => showNudge('Health sync bridge is not available yet.'));
      return;
    }
  } catch (e) { /* native bridge unavailable */ }
  showNudge('HealthKit sync needs the SwiftUI or Capacitor wrapper. This web layer is ready.');
}

function safeStripeCheckout() {
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
        <span>Yes, email me ARC90 updates. I can unsubscribe at any time.</span>
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
      else { setStatus((d && d.error) || 'Could not save. Try again.', 'err'); if (btn) { btn.disabled = false; btn.textContent = 'Keep me posted'; } }
    })
    .catch(() => { setStatus('Network error. Please try again.', 'err'); if (btn) { btn.disabled = false; btn.textContent = 'Keep me posted'; } });
}

/* ============================================================
   FOCUS
   ============================================================ */

function focusPreset(minutes, label, copy, strict = true) {
  return `
    <button class="focus-preset" data-act="focus-start" data-minutes="${minutes}" data-label="${esc(label)}" data-strict="${strict ? '1' : '0'}">
      <span>${minutes}m</span>
      <b>${esc(label)}</b>
      <small>${esc(copy)}</small>
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

function viewFocus() {
  const stats = focusStats();
  const active = S.focus.active;
  const next = nextBestRep();
  const nativeReady = focusNativeBridgeAvailable();
  const modeLabel = nativeReady ? 'Native blocker' : 'Timer only';
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Focus</h1>
        <div class="sub">One clean block. Fewer exits. More attention for the rep that matters.</div>
      </div>
      <button class="mini-act top-mini" data-act="tab" data-id="today">Done</button>
    </header>

    <section class="card focus-control-card">
      <div class="focus-control-top">
        <div>
          <span class="tip-tag" style="margin:0">${nativeReady ? 'Native focus' : 'Focus timer'}</span>
          <div class="focus-hero-title">${active ? 'Block running' : 'Start focused time'}</div>
        </div>
        <span class="focus-mode-pill ${nativeReady ? 'ready' : ''}">${modeLabel}</span>
      </div>

      ${active ? `
        <div class="focus-live-inline">
          <div>
            <div class="focus-live-time">${formatClockMinutes(focusRemainingMs(active))}</div>
            <div class="focus-live-label">${esc(active.label)}</div>
          </div>
          <div class="focus-live-copy">${nativeReady ? 'Native shielding was requested for this block.' : 'Tracking is live. App blocking is waiting on the native Screen Time bridge.'}</div>
        </div>
        <div class="focus-actions">
          <button class="btn" data-act="focus-end">Finish</button>
          <button class="btn btn-ghost" data-act="focus-unlock">${nativeReady ? 'Emergency unlock' : 'Log break'}</button>
        </div>
      ` : `
        <div class="focus-preset-grid compact">
          ${focusPreset(30, 'Deep work', 'One rep, protected.')}
          ${focusPreset(60, 'Build', 'For real work.')}
          ${focusPreset(90, 'Lock in', 'Long block.')}
        </div>
      `}

      <div class="focus-mini-stats">
        <div><b>${formatFocusMinutes(stats.todayMinutes)}</b><span>today</span></div>
        <div><b>${stats.blockedCount}</b><span>targets</span></div>
        <div><b>${stats.consistency}/7</b><span>active</span></div>
      </div>
      <div class="focus-next-line"><b>Protect next:</b> ${esc(next ? next.name : (S.profile.goal || 'your next important block'))}</div>
    </section>

    ${focusAllDayCard()}

    <section class="card focus-shield-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Focus targets</span>
        <span class="mini-act">${stats.blockedCount} saved</span>
      </div>
      ${focusTargetSummary()}

      ${stats.blockedCount < 3 ? `
        <div class="section-mini-title">Quick add</div>
        <div class="focus-chip-row">
          ${FOCUS_APP_SUGGESTIONS.slice(0, 4).map((name) => `<button class="chip ${S.focus.apps.some((a) => focusEntryKey('apps', a) === focusEntryKey('apps', name)) ? 'on' : ''}" data-act="focus-app-toggle" data-id="${esc(name)}">${esc(name)}</button>`).join('')}
        </div>` : ''}

      <div class="focus-add-compact">
        <input id="focusAppInput" type="text" maxlength="28" placeholder="Add app"/>
        <button class="btn btn-ghost" data-act="focus-app-add">Add</button>
        <input id="focusSiteInput" type="text" maxlength="48" placeholder="Add website"/>
        <button class="btn btn-ghost" data-act="focus-site-add">Add</button>
      </div>
    </section>

    <section class="card focus-native-note">
      <div>
        <span class="tip-tag" style="margin:0">Blocking status</span>
        <div class="focus-note-title">${nativeReady ? 'Native blocker connected' : 'Soft mode only right now'}</div>
        <p>${nativeReady
          ? 'Arc90 can ask iOS to shield selected apps during a focus block.'
          : 'This build can track focus blocks. True Opal-style app blocking needs Apple Screen Time APIs in native Swift, plus Apple’s Family Controls entitlement.'}</p>
      </div>
    </section>
  `;
}

function focusTargetSummary() {
  const targets = [
    ...S.focus.apps.map((value) => ({ kind: 'app', value })),
    ...S.focus.sites.map((value) => ({ kind: 'site', value })),
  ];
  if (!targets.length) {
    return '<div class="empty-note focus-empty">Choose the apps or sites that steal the first 20 minutes. Start with 2 or 3.</div>';
  }
  const hidden = Math.max(0, targets.length - 8);
  return `
    <div class="focus-target-grid">
      ${targets.slice(0, 8).map((t) => `
        <button class="focus-target-chip" data-act="focus-${t.kind === 'app' ? 'app' : 'site'}-toggle" data-id="${esc(t.value)}">
          <span>${t.kind === 'app' ? 'app' : 'web'}</span>
          <b>${esc(t.value)}</b>
        </button>`).join('')}
      ${hidden ? `<div class="focus-target-chip more"><span>more</span><b>+${hidden}</b></div>` : ''}
    </div>`;
}

/* All-day lock: one persistent, day-scoped shield slot for every focus target. */
function allDayLockActive() {
  const l = S.focus && S.focus.allDayLock;
  return !!(l && l.on && l.date === todayKey());
}

function focusAllDayCard() {
  const on = allDayLockActive();
  const targets = focusStats().blockedCount;
  return `
    <section class="card focus-allday-card ${on ? 'on' : ''}">
      <div class="allday-row">
        <div class="allday-copy">
          <span class="tip-tag" style="margin:0">All-day lock</span>
          <div class="allday-title">${on ? 'Locked all day' : 'Lock apps for the whole day'}</div>
          <p>${on
            ? `Your ${targets} target${targets === 1 ? '' : 's'} are shielded until midnight — one slot, no timer.`
            : 'Shield every focus target from now until midnight. One switch, no timer, no exits.'}</p>
        </div>
        <button class="allday-switch ${on ? 'on' : ''}" data-act="focus-allday-toggle" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="Toggle all-day lock"><i></i></button>
      </div>
      ${!targets ? '<div class="allday-empty">Add at least one app or site below, then flip the lock.</div>' : ''}
    </section>`;
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
  const d = new Date(due);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const t = new Date(now); t.setDate(now.getDate() + 1);
  const day = d.toDateString() === now.toDateString() ? 'Today'
    : d.toDateString() === t.toDateString() ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function taskOverdue(t) { return t.due && !t.done && new Date(t.due).getTime() < Date.now(); }

function journalStreak() {
  const today = atMidnight(new Date());
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
      <button class="plan-task-check${t.done ? ' on' : ''}" data-act="task-toggle" data-id="${t.id}" aria-pressed="${t.done}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}">${t.done ? ICONS.check : ''}</button>
      <div class="plan-task-body">
        <div class="plan-task-title">${esc(t.title)}</div>
        ${due ? `<div class="plan-task-due">${over ? '⚠ ' : ''}${due}${t.remind && !t.done ? ' · 🔔' : ''}</div>` : ''}
      </div>
      <button class="plan-task-del" data-act="task-del" data-id="${t.id}" aria-label="Delete task">✕</button>
    </div>`;
}

function viewPlan() {
  const tasks = (S.tasks || []).slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.due && !b.due) return (b.created || 0) - (a.created || 0);
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due) - new Date(b.due);
  });
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter(taskOverdue).length;
  const jKey = todayKey();
  const jText = (S.journal && S.journal[jKey]) || '';
  const jStreak = journalStreak();
  const jCount = journalCount();
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Plan</h1>
        <div class="sub">Deadlines, reminders &amp; today’s journal</div>
      </div>
    </header>

    ${(() => {
      const nextUp = open.find((t) => t.due);
      return tabHeroCard(
        'Execution',
        open.length ? `${open.length} open task${open.length === 1 ? '' : 's'}` : 'Clear runway',
        nextUp ? `Next up: ${esc(nextUp.title)}` : 'Add a deadline and Arc90 nudges you the moment it’s due.',
        [['Open', open.length], ['Overdue', overdue], ['Journal', jStreak ? jStreak + 'd' : '—']]
      );
    })()}

    <section class="card plan-add-card">
      <div class="card-head"><span class="tip-tag" style="margin:0">New task</span></div>
      <input id="taskTitle" class="plan-input" type="text" placeholder="What needs to get done?" maxlength="200" autocomplete="off" />
      <div class="plan-add-row">
        <input id="taskDue" class="plan-input plan-due" type="datetime-local" value="${esc(defaultTaskDue())}" aria-label="Task deadline" />
        <button class="btn plan-add-btn" data-act="task-add">Add</button>
      </div>
      <label class="plan-remind" for="taskRemind">
        <input type="checkbox" id="taskRemind" checked />
        <span>Notify me when it’s due</span>
      </label>
    </section>

    <div class="card-head plan-list-head">
      <span class="section-title" style="margin:0">Tasks</span>
      <span class="reminder-state">${open.length} open${overdue ? ` · ${overdue} overdue` : ''}</span>
    </div>
    ${tasks.length
      ? `<div class="plan-tasks">${tasks.map(taskRow).join('')}</div>`
      : `<div class="card empty-note">No tasks yet. Add a deadline above and Arc90 will nudge you the moment it’s due.</div>`}

    ${S.habits.length ? (() => {
      const dueToday = actionable(jKey);
      const doneHabits = S.habits.filter((h) => isCompleted(h.id, jKey));
      return `
        <div class="card-head plan-list-head">
          <span class="section-title" style="margin:0">Habits done today</span>
          <span class="reminder-state">${doneHabits.length}/${dueToday.length || S.habits.length}</span>
        </div>
        ${doneHabits.length ? `
          <div class="plan-tasks">
            ${doneHabits.map((h) => `
              <div class="plan-task done habit-row">
                <span class="plan-task-check on" aria-hidden="true">${ICONS.check}</span>
                <div class="plan-task-body">
                  <div class="plan-task-title">${h.emoji ? esc(h.emoji) + ' ' : ''}${esc(h.name)}</div>
                  <div class="plan-task-due">${statusOf(h.id, jKey) === 'min' ? 'Minimum version · habit' : 'Completed · habit'}</div>
                </div>
              </div>`).join('')}
          </div>`
        : `<div class="card empty-note">Nothing logged yet today. <button class="inline-link" data-act="tab" data-id="today">Knock one out →</button></div>`}
      `;
    })() : ''}

    <section class="card plan-journal-card">
      <div class="card-head">
        <span class="tip-tag" style="margin:0">Today’s journal</span>
        <span class="reminder-state">${jStreak ? `${jStreak}-day streak` : 'New'}</span>
      </div>
      <div class="plan-journal-date">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <textarea id="journalText" class="plan-journal-ta" rows="7" placeholder="How did today go? What did you learn, feel, or want to remember?">${esc(jText)}</textarea>
      <div class="seg-hint">Saves automatically on this device · ${jCount} ${jCount === 1 ? 'entry' : 'entries'} logged.</div>
    </section>

    <div class="empty-note" style="padding-top:8px">Reminders fire while Arc90 is open or in the background. Add Arc90 to your home screen for the most reliable notifications.</div>
  `;
}

/* ============================================================
   PROGRESS
   ============================================================ */

function viewProgress() {
  const end = addDays(startDate(), 89);
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Progress</h1>
        <div class="sub">${fmtDate(startDate())} → ${fmtDate(end)} · Day ${dayNumber()} of 90</div>
      </div>
    </header>

    ${commandCenterCard()}
    ${progressArcMapCard()}
    ${proofCard(true)}
    <section class="card">
      <div class="card-head"><span class="eyebrow">Last 7 days</span></div>
      ${chart(7)}
    </section>
    ${progressAnalyticsCard()}
    ${moodGraphPanel()}
    ${progressPulseCard()}
  `;
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
        <span class="pro-badge">VIOLET</span>
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
  const today = atMidnight(new Date());
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
  const seed = Math.floor(atMidnight(new Date()) / DAY_MS) + dayNumber() + (Number(seedOffset) || 0);
  return REFLECTION_QUOTES[seed % REFLECTION_QUOTES.length];
}

function progressMantraCard() {
  const seed = Math.floor(atMidnight(new Date()) / DAY_MS) + dayNumber();
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

function moodGraphPanel() {
  const rows = moodGraphRows(14);
  const logged = rows.filter((r) => r.value).length;
  const avg = logged ? rows.reduce((sum, r) => sum + r.value, 0) / logged : 0;
  const current = rows[rows.length - 1];
  const copy = logged
    ? `${logged}/14 days logged · ${avg.toFixed(1)}/5 average`
    : 'Log mood from Today to reveal your emotional pattern.';
  return `
    <section class="card mood-graph-card">
      <div class="card-head">
        <span class="eyebrow">Mood graph</span>
        <button class="mini-act" data-act="review">reflection</button>
      </div>
      ${moodOptionChips(dlog(todayKey()).mood, 'graph')}
      <div class="mood-graph">
        ${rows.map((r) => `
          <div class="mood-bar ${r.today ? 'today' : ''} ${r.value ? '' : 'empty'}">
            <i style="height:${r.value ? Math.max(12, r.value * 20) : 8}%"></i>
            <span>${esc(r.label)}</span>
          </div>`).join('')}
      </div>
      <div class="mood-graph-foot">
        <b>${logged ? moodGraphTone(avg) : 'No baseline yet'}</b>
        <span>${esc(copy)}</span>
      </div>
    </section>`;
}

function moodGraphRows(days = 14) {
  const today = atMidnight(new Date());
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - (days - 1));
    const key = dkey(d);
    const l = dlog(key);
    return {
      key,
      value: moodScore(l),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      today: key === todayKey(),
    };
  });
}

function moodScore(l) {
  if (l.energy) return Math.max(1, Math.min(5, Number(l.energy) || 0));
  return ({ strong: 5, steady: 4, tired: 3, stressed: 2, low: 1 })[l.mood] || 0;
}

function moodGraphTone(avg) {
  if (avg >= 4.2) return 'High clarity';
  if (avg >= 3.2) return 'Stable mood';
  if (avg >= 2.2) return 'Watch recovery';
  return 'Protect basics';
}

function moodDistribution(nDays = 30) {
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
  if (S.premium) {
    return `<section class="card"><div class="card-head"><span class="eyebrow">${title}</span><span class="pro-badge">PRO</span></div>${inner}</section>`;
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

function grid90() {
  const start = startDate();
  const today = atMidnight(new Date());
  let cells = '';
  for (let i = 0; i < 90; i++) {
    const d = addDays(start, i);
    const k = dkey(d);
    const cls = ['cell'];
    if (d > today) cls.push('f');
    else {
      const r = rateFor(k);
      if (r !== null) {
        if (r >= 1) cls.push('l3');
        else if (r >= 0.5) cls.push('l2');
        else if (r > 0) cls.push('l1');
      }
      if (k === todayKey()) cls.push('now');
    }
    const attrs = d <= today
      ? `data-act="day-open" data-id="${k}" aria-label="Review Day ${i + 1}, ${niceDate(k)}"`
      : `disabled aria-label="Day ${i + 1}, future"`;
    cells += `<button class="${cls.join(' ')}" title="Day ${i + 1}" ${attrs}></button>`;
  }
  return `<div class="grid90">${cells}</div>`;
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

function viewSleep() {
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
  const hr = new Date().getHours();
  const firstName = (S.profile.name || '').trim().split(' ')[0];
  const greetWord = hr >= 21 || hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : 'Good evening';
  const moonPhase = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'][Math.floor(((Date.now() / 86400000) + 14.765) % 29.53 / 29.53 * 8) % 8];
  const dateStr = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
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
    <div class="slhero">
      <div class="slhero-aurora"></div>
      <div class="slhero-inner">
        <div class="slhero-date">${dateStr}</div>
        <h1 class="slhero-greeting">${greetWord}${firstName ? `,&nbsp;<span class="slhero-name">${esc(firstName)}</span>` : ''}<span class="slhero-moon">${moonPhase}</span></h1>
        <div class="slhero-sub">${esc(heroStat)}</div>
      </div>
    </div>

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
          <div class="alarm-note">Gentle rising chime · starts softly, builds over 30s</div>
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
  `;
}

function viewProtocol() {
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Protocol</h1>
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
  const today = atMidnight(new Date());
  for (let i = 0; i < 90; i++) {
    const k = dkey(addDays(today, -i));
    const v = vitalVal(key, k);
    if (v !== null && v !== undefined && v !== '') return { k, v };
  }
  return null;
}

function vitalTrend(key) {
  const today = atMidnight(new Date());
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
  const today = atMidnight(new Date());
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
        <input id="vital-${m.key}" type="number" step="${m.step}" min="0" placeholder="${esc(m.ph)}" value="${today !== null && today !== undefined ? esc(String(today)) : ''}"/>
        <button class="btn btn-ghost" data-act="vital-save" data-key="${m.key}">Log</button>
      </div>
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
  ];
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Vitals</h1>
        <div class="sub">Biohacking signals · recovery, sleep, output</div>
      </div>
    </header>
    <div class="vital-grid">
      ${metrics.map(vitalCard).join('')}
    </div>
    <div class="empty-note" style="padding-top:10px">Log manually for now — the native build can auto-sync these from Apple Health, Oura, or Whoop. Arc90 tracks signals only; it never gives medical advice.</div>
  `;
}

function coachOverviewCard() {
  const mom = momentum();
  const stk = dayStreak();
  const day = dayNumber();
  const st = strongestHabit();
  const wk = weakestHabit();
  const grade = mom >= 75 ? 'Strong' : mom >= 50 ? 'Steady' : mom >= 30 ? 'Wobbling' : 'At risk';
  const gcls = mom >= 50 ? 'good' : mom >= 30 ? 'mid' : 'low';
  const read = mom >= 75
    ? `You’re in the top gear of your arc. The system is running — now protect it and don’t get cocky on the easy days.`
    : mom >= 50
      ? `You’re holding the line. The pattern is real but fragile — one or two habits are carrying you more than the rest.`
      : mom >= 30
        ? `Momentum is slipping. This is the exact moment most people quit — you don’t have to be perfect, you have to be present.`
        : `You’re running on willpower, not system. Let’s shrink everything to the minimum and win one day back first.`;
  const roadmap = [
    st ? `Keep <b>${esc(st.habit.name)}</b> as your anchor — it’s your most reliable rep. Stack the shaky ones right after it.` : `Pick one habit to be your daily anchor — the one you never skip.`,
    wk ? `<b>${esc(wk.habit.name)}</b> is your weak point. Drop it to its minimum (${esc(wk.habit.min || '2-minute version')}) for 7 days — consistency beats size.` : `Shrink your hardest habit to a 2-minute version until it sticks.`,
    stk >= 3 ? `Your ${stk}-day streak is real leverage — protect it tonight before anything else.` : `Log one rep today to start a streak. Loss aversion will do the rest.`,
  ];
  return `
    <section class="card coach-overview-card">
      <div class="coach-ov-head">
        <div>
          <span class="eyebrow">Your read · Day ${day} of 90</span>
          <div class="coach-ov-grade ${gcls}">${grade}<span> · ${mom}% momentum</span></div>
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
  const wk = weakestHabit();
  const chips = [
    wk ? `Why do I keep missing ${wk.habit.name}?` : 'What habit should I focus on first?',
    'What should I fix this week?',
    'Design a morning routine for my goal',
    'I feel like quitting — what now?',
  ];
  return `
    <div class="coach-prompts">
      ${chips.map((q) => `<button class="coach-prompt-chip" data-act="coach-ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
    </div>`;
}

function viewCoach() {
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Coach</h1>
        <div class="sub">Your data, read back to you — with a plan and a place to ask</div>
      </div>
    </header>

    ${coachOverviewCard()}

    <div class="section-gap section-title">Ask your coach</div>
    ${coachPrompts()}
    ${aiPanel()}
    ${weeklyAiReviewCard()}
    ${guidanceSignalCard()}

    <div class="section-gap section-title">Coach playbook</div>
    ${COACH_QA.slice(0, 4).map((qa) => `
      <button class="qa-chip ${openQA === qa.id ? 'open' : ''}" data-act="qa" data-id="${qa.id}">
        <span>${esc(qa.q)}</span><span class="arr">${openQA === qa.id ? '−' : '+'}</span>
      </button>
      ${openQA === qa.id ? `<div class="qa-answer">${fillTemplate(qa.a, true)}</div>` : ''}
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
  const w = weakestHabit();
  const st = strongestHabit();
  const tip = currentTip();
  const target = tipTarget();
  const insight = w && st
    ? `Move ${esc(w.habit.name)} after ${esc(st.habit.name.toLowerCase())} for 7 days. Minimum version: ${esc(w.habit.min || '2 minutes')}.`
    : 'Protect the smallest version of each habit until your pattern has enough data.';
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
  const saved = S.weeklyReviews[key] || review;
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
        <input id="sleepHours" type="number" min="0" max="18" step="0.25" value="${editing.hours === '' ? '' : esc(editing.hours)}" placeholder="hours"/>
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

/* ---------------- AI Coach (bring-your-own-key) ---------------- */

const AI_PROVIDERS = {
  anthropic: { label: 'Claude', model: 'claude-sonnet-4-6', hint: 'console.anthropic.com → API keys' },
  openai:    { label: 'ChatGPT', model: 'gpt-4o-mini', hint: 'platform.openai.com → API keys' },
  gemini:    { label: 'Gemini', model: 'gemini-2.5-flash', hint: 'aistudio.google.com → Get API key' },
};
let aiBusy = false;

function aiPanel() {
  const p = AI_PROVIDERS[S.ai.provider];
  if (!S.ai.key) {
    return `
      <section class="card ai-card compact-ai-card">
        <div class="card-head" style="margin-bottom:8px"><span class="tip-tag" style="margin:0">AI Guidance</span><span class="pro-badge">BETA</span></div>
        <div class="ai-compact-line">
          <span>Ask goals, habits, focus, routines, or next move.</span>
          <div class="provider-mini-row">
            ${Object.entries(AI_PROVIDERS).map(([id, pr]) => `<button class="${S.ai.provider === id ? 'on' : ''}" data-act="ai-provider" data-id="${id}">${pr.label}</button>`).join('')}
          </div>
        </div>
        <div class="ai-connect-row">
          <input id="aiKey" type="password" placeholder="${p.label} API key…" autocomplete="off"/>
          <button class="btn compact-connect" data-act="ai-connect">Connect</button>
        </div>
        <div class="seg-hint compact-key-hint">${p.hint}</div>
      </section>`;
  }
  const msgs = S.aiChat.length ? S.aiChat : [{ role: 'assistant', content: `Connected. Ask me anything about your arc, routines, focus, mindset, or execution. Day ${dayNumber()} of 90, Momentum ${momentum()}%. What do you want to solve?` }];
  return `
    <section class="card ai-card compact-ai-card">
      <div class="card-head" style="margin-bottom:8px">
        <span class="tip-tag" style="margin:0">AI Guidance · ${AI_PROVIDERS[S.ai.provider].label}</span>
        <span style="display:flex;gap:10px">
          <button class="mini-act" data-act="ai-clear">clear</button>
          <button class="mini-act" data-act="ai-disconnect">disconnect</button>
        </span>
      </div>
      <div class="chat-box" id="aiChatBox">
        ${msgs.map((m) => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}">${esc(m.content)}</div>`).join('')}
        ${aiBusy ? '<div class="msg ai typing"><i></i><i></i><i></i></div>' : ''}
      </div>
      <div class="chat-input">
        <input id="aiInput" type="text" placeholder="Ask your coach…" maxlength="400" ${aiBusy ? 'disabled' : ''}/>
        <button class="btn chat-send" data-act="ai-send" ${aiBusy ? 'disabled' : ''}>↑</button>
      </div>
      <div class="seg-hint" style="margin-top:9px">Open coaching for goals and routines. Medical dosing stays with your clinician.</div>
    </section>`;
}

function aiSystemPrompt() {
  const stats = S.habits.map((h) => `- ${h.name}: ${Math.round(habitRate(h.id, 7) * 100)}% last 7 days (min version: ${h.min || '2-minute version'})`).join('\n');
  return `You are Arc90's AI Guidance coach: a clear, useful, evidence-aware life and habit coach. You help the user think, plan, and execute across habits, focus, routines, mindset, work, training logs, and their 90-day arc.

USER: ${S.profile.name}, ${S.profile.occupation}.
90-DAY GOAL: ${S.profile.goal}${S.profile.motivation ? ` (why it matters: ${S.profile.motivation})` : ''}.
TODAY: Day ${dayNumber()} of 90. Momentum Score: ${momentum()}% (0.6×last-7-days + 0.4×whole challenge).
HABITS (7-day completion):
${stats}

RULES:
1. Answer the user's actual question directly. Be practical, warm, and specific.
2. Max ~180 words unless they ask for a plan. End with one concrete next action when useful.
3. Use behavioral science when relevant: implementation intentions, habit stacking, friction design, minimum viable habit, never-miss-twice, environment design. No fake neuroscience.
4. You may discuss broad wellness tracking, routines, and adherence. HARD BOUNDARY: do not prescribe, change, or recommend medication, supplement, peptide, or medical dosing, stacking, or treatment. If asked for dosing, say you can organize a clinician's instructions into a routine, but the dose decision belongs to a licensed professional.
5. Use their real numbers above when relevant.`;
}

async function callAI(history) {
  const { provider, key } = S.ai;
  const sys = aiSystemPrompt();
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: AI_PROVIDERS.anthropic.model, max_tokens: 400, system: sys, messages: history }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 140)}`);
    const j = await res.json();
    return j.content.map((c) => c.text || '').join('');
  }
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AI_PROVIDERS.openai.model, max_tokens: 400, messages: [{ role: 'system', content: sys }, ...history] }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 140)}`);
    const j = await res.json();
    return j.choices[0].message.content;
  }
  // gemini
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${AI_PROVIDERS.gemini.model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 400 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 140)}`);
  const j = await res.json();
  return j.candidates[0].content.parts.map((p) => p.text || '').join('');
}

async function sendAI() {
  const inp = document.getElementById('aiInput');
  const text = inp ? inp.value.trim() : '';
  if (!text || aiBusy) return;
  S.aiChat.push({ role: 'user', content: text });
  S.aiChat = S.aiChat.slice(-20);
  save();
  aiBusy = true;
  render();
  try {
    const reply = await callAI(S.aiChat.map((m) => ({ role: m.role, content: m.content })));
    S.aiChat.push({ role: 'assistant', content: reply.trim() });
  } catch (err) {
    S.aiChat.push({ role: 'assistant', content: `⚠️ Couldn't reach ${AI_PROVIDERS[S.ai.provider].label}: ${err.message}. Check your key (Coach → disconnect to re-enter) and connection.` });
  }
  S.aiChat = S.aiChat.slice(-20);
  save();
  aiBusy = false;
  render();
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
        <h1>Profile</h1>
        <div class="sub">${esc(S.profile.name)} · ${esc(S.profile.occupation)}</div>
      </div>
    </header>

    ${tabHeroCard(
      'Current challenge',
      esc(S.profile.goal || 'Set a target'),
      `${fmtDate(startDate())} → ${fmtDate(end)} · becoming <b>${esc(S.profile.identity || 'the new you')}</b>${S.profile.motivation ? `<div class="th-quote">“${esc(S.profile.motivation)}”</div>` : ''}`,
      [['Day', `${dayNumber()}<em>/90</em>`], ['Streak', `${dayStreak()}d`], ['Votes', totalReps()]]
    )}

    ${emailCaptureCard()}

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
          ['mono',  'Mono',  '#0a0a0a', '#f2f2f2'],
          ['dark',  'Dark',  '#0a0b18', '#b69cff'],
          ['light', 'Light', '#f2f2f2', '#111111'],
          ['green', 'Green', '#050b08', '#34d399'],
          ['red',   'Red',   '#0a0405', '#ff5d6c'],
        ].map(([id, name, bg, ac]) => `
          <button class="theme-swatch${S.theme === id ? ' on' : ''}" data-act="theme" data-id="${id}" aria-pressed="${S.theme === id}" aria-label="${name} appearance">
            <span class="ts-chip" style="--sw-bg:${bg};--sw-ac:${ac}"><span class="ts-ring"></span></span>
            <span class="ts-name">${name}</span>
          </button>`).join('')}
      </div>
      <div class="seg-hint">Five looks — same instrument. Pick the one you’ll want to open at night.</div>
    </section>

    ${isDevHost() ? productReadinessCard() : ''}

    <div class="section-title">App organization</div>
    <button class="prow" data-act="edit"><span class="pe">✏️</span><span class="pl">Edit name, occupation & goal</span><span class="arr">›</span></button>
    <button class="prow" data-act="tab" data-id="habits"><span class="pe">☑</span><span class="pl">Habit library</span><span class="pv">${S.habits.length}${S.premium ? '' : `/${FREE_HABITS}`} active</span><span class="arr">›</span></button>
    <button class="prow" data-act="tab" data-id="focus"><span class="pe">🎯</span><span class="pl">Focus system</span><span class="pv">${focusStats().blockedCount ? focusStats().blockedCount + ' targets' : 'set up shield'}</span><span class="arr">›</span></button>
    <button class="prow" data-act="tab" data-id="protocol"><span class="pe">🧬</span><span class="pl">Protocol tracker</span><span class="pv">${S.protocols.length ? S.protocols.length + ' tracked' : 'set up'}</span><span class="arr">›</span></button>

    <div class="premium-card profile-premium-card">
      <div class="pt">${S.premium ? 'Arc90 Premium · active' : PREMIUM_OFFER.name}</div>
      <div class="ps">${S.premium
        ? 'Axis Dashboard, Forge Mode, unlimited habits, advanced exports, and deeper coaching are active on this device.'
        : `Axis Dashboard · Forge Mode · unlimited habits · weekly reviews · advanced exports. ${PREMIUM_OFFER.note}`}</div>
      ${S.premium
        ? `<button class="btn btn-ghost" data-act="premium-off" style="padding:12px">Switch back to Free (demo)</button>`
        : `<button class="btn" data-act="paywall" style="padding:13px">${PREMIUM_OFFER.cta} · ${PREMIUM_OFFER.price}${PREMIUM_OFFER.interval}</button>`}
    </div>

    <div class="section-title">Data</div>
    <button class="prow" data-act="export"><span class="pe">📤</span><span class="pl">Export my data (JSON)</span><span class="arr">›</span></button>
    <button class="prow" data-act="import"><span class="pe">📥</span><span class="pl">Restore from backup</span><span class="arr">›</span></button>
    <input id="importFile" class="import-input" type="file" accept="application/json,.json"/>
    <button class="danger-btn" data-act="reset">Start over (erases everything)</button>

    <div class="empty-note">
      🔒 All your data lives on this device. Export a backup before switching phones or clearing browser data.<br/><br/>
      📲 <b>iPhone:</b> open in Safari → Share → <b>Add to Home Screen</b> for the full-screen app.
    </div>
    ${legalLinks()}
  `;
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
  const inner = sheet.type === 'paywall' ? sheetPaywall()
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
      <div class="sheet">
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
    ['Command Center dashboard', '—', 'Full'],
    ['Vitals & biohacking metrics', '—', 'Full'],
    ['Forge recovery mode', '—', 'Included'],
    ['Weekly reviews & exports', '—', 'Included'],
    ['Focus all-day lock', '—', 'Included'],
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
      <div class="pp2-urgency">★ Founding price — locked in for early members</div>
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
    <button class="btn btn-ghost tune-save" data-act="habit-save" data-id="${h.id}">Save habit tuning</button>

    <div class="sheet-section">Today</div>
    <button class="act-row" data-act="task-set" data-id="done"><span class="ae">✅</span><div>Complete<div class="as">The full version — counts 100%</div></div></button>
    <button class="act-row" data-act="task-set" data-id="min"><span class="ae">🤏</span><div>Minimum version<div class="as">${esc(h.min || '2-minute version')} — still counts as a win</div></div></button>
    <button class="act-row" data-act="task-set" data-id="skip"><span class="ae">🛌</span><div>Rest day / skip intentionally<div class="as">Excused — doesn’t hurt your Momentum</div></div></button>
    <button class="act-row" data-act="task-set" data-id="clear"><span class="ae">↩️</span><div>Clear today’s status</div></button>
    <div class="sheet-section">Rhythm</div>
    ${rhythmPicker(h)}
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
  const steps = [obWelcome, obAbout, obGoal, obHabits, obReminders, obContract, obUpgrade];
  const dots = ob.step === 0 ? '' :
    `<div class="ob-dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>`;
  app.innerHTML = `
    <div class="ob ${ob.step === 0 ? 'welcome' : ''} ${ob.step === 3 ? 'reps-step' : ''}">
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
        <svg viewBox="0 0 108 108">
          <circle cx="54" cy="54" r="46" fill="none" stroke="var(--line-2)" stroke-width="10"/>
          <circle cx="54" cy="54" r="46" fill="none" stroke="url(#ringGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="217 72"/>
        </svg>
      </div>
      <div class="brand-name">Arc<em>90</em></div>
      <p class="brand-tag">Build your next 90 days.<br/>One goal, a daily system, and <b>real momentum</b>.</p>
      <button class="btn ob-cta" data-act="ob-next">Start my 90 days</button>
    </div>`;
}

function obAbout() {
  return `
    <div>
      <div class="ob-title">First, <em>who's</em> doing this?</div>
      <div class="ob-sub">Quick interview — 60 seconds, then we build your system. Pick everything that's true.</div>
      <div class="field"><label>Your name</label>
        <input id="obName" type="text" placeholder="e.g. Michael" value="${esc(ob.name)}" maxlength="32"/></div>
      <div class="field"><label>What are you? <span style="color:var(--tx-3);font-weight:600">(select all that apply)</span></label>
        <div class="chip-grid">
          ${OCCUPATIONS.map((o) => `<button class="chip ${ob.occs.has(o) ? 'on' : ''}" data-act="ob-occ" data-id="${esc(o)}">${o}</button>`).join('')}
        </div>
        <div style="margin-top:10px"><input id="obOcc" type="text" placeholder="…add your own (e.g. Salsa dancer)" value="${esc(ob.occCustom)}" maxlength="40"/></div>
      </div>
      <button class="btn ob-cta" data-act="ob-next" id="obNextBtn" ${ob.name.trim() ? '' : 'disabled'}>Continue</button>
    </div>`;
}

function obGoal() {
  return `
    <div>
      <div class="ob-title">Where are you in <em>90 days</em>?</div>
      <div class="ob-sub">One headline goal — then pick up to 3 missions that feed it.</div>
      <div class="field"><label>My 3-month goal</label>
        <input id="obGoal" type="text" placeholder="e.g. Run a 10K · Save $1,500 · Conversational Spanish" value="${esc(ob.goal)}" maxlength="80"/></div>
      <div class="field"><label>Why does it matter? <span style="color:var(--tx-3);font-weight:600">(optional)</span></label>
        <input id="obWhy" type="text" placeholder="The reason you'll remember on hard days" value="${esc(ob.motivation)}" maxlength="100"/></div>
      <div class="field"><label>Your missions <span style="color:var(--tx-3);font-weight:600">(pick up to 3 · ${ob.cats.size}/3)</span></label>
        <div class="goal-grid">
          ${GOAL_TYPES.map((g) => `<button class="goal-tile ${ob.cats.has(g.id) ? 'on' : ''}" data-act="ob-cat" data-id="${g.id}"><span class="ge">${g.emoji}</span><span class="gl">${g.label}</span></button>`).join('')}
        </div>
      </div>
      <button class="btn ob-cta" data-act="ob-next" id="obNextBtn" ${ob.goal.trim() && ob.cats.size ? '' : 'disabled'}>Continue</button>
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
  return parts.filter(Boolean).slice(0, 3).join(' · ') || 'human';
}

function obContract() {
  const identity = obIdentity();
  const end = addDays(atMidnight(new Date()), 89);
  const occ = obOccupation();
  const n = ob.picked.size + ob.customs.length;
  return `
    <div>
      <div class="ob-title">Sign the <em>contract</em></div>
      <div class="ob-sub">A promise with a shape is harder to drop.</div>
      <div class="contract-card">
        <div class="line">“I, <b>${esc(ob.name || 'me')}</b> — ${esc(occ)} by day, <b>${esc(identity)}</b> by choice — will show up for <b>${n} small habit${n === 1 ? '' : 's'}</b>, every day, for <b>90 days</b>, until: <b>${esc(ob.goal)}</b>.”</div>
        <div class="dates">${fmtDate(new Date())} → ${fmtDate(end)}, ${end.getFullYear()}</div>
      </div>
      <button class="btn ob-cta" data-act="ob-next">Start Day 1</button>
    </div>`;
}

function obUpgrade() {
  const benefits = [
    ['♾️', 'Unlimited habits & custom routines', 'Go past the free 5-habit limit and build the whole system.'],
    ['🧠', 'Coach AI + weekly reviews', 'Personal reads on your data and what to fix next.'],
    ['🔥', 'Forge recovery mode', 'A 7-day comeback plan for when you slip — before it becomes a lost week.'],
    ['📊', 'Axis dashboard & exports', 'Deeper analytics and a 90-day export you keep forever.'],
    ['🎨', 'Every theme, sound & spatial audio', 'The full premium sleep and focus toolkit.'],
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
      <div class="ob-pay-fine">${esc(PREMIUM_OFFER.note)} · No commitment — you can start Free and upgrade anytime.</div>
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
  S.reminders = { mode: ob.remMode, time: ob.remTime };
  S.onboarded = true;
  save();
  track('onboarding_completed');
  ob = null;
  if (S.reminders.mode !== 'off' && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  tab = 'today';
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
    case 'tab': switchTab(id); break;
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
    case 'close-sheet': sheet = null; protoOpen = null; protoDetailOpen = null; protoAddOpen = false; protoUrgent = false; render(); break;
    case 'restore-premium': {
      const email = window.prompt('Enter the email you used at checkout:');
      if (!email || !email.trim()) break;
      showNudge('Checking your purchase…');
      fetch('/api/entitlement?email=' + encodeURIComponent(email.trim()))
        .then((r) => r.json())
        .then((d) => {
          if (d && d.premium) {
            S.premium = true; save(); sheet = null; render(); confetti();
            showNudge('Premium restored. Welcome back. ✨');
            track('premium_restored');
          } else {
            showNudge('No active purchase found for that email.');
          }
        })
        .catch(() => showNudge('Could not reach the server — try again when online.'));
      break;
    }
    case 'library-toggle': libraryOpen = !libraryOpen; render(); break;
    case 'proto-template-toggle': protocolTemplatesOpen = !protocolTemplatesOpen; render(); break;
    case 'cat': libCat = id; libraryOpen = true; render(); break;

    case 'lib-toggle': {
      const n = +id;
      if (S.habits.some((x) => x.id === n)) { removeHabit(n); render(); }
      else if (!S.premium && S.habits.length >= FREE_HABITS) gate('habit-limit');
      else { addHabit(n); render(); }
      break;
    }
    case 'remove': removeHabit(id); render(); break;
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
      if (name && name.value.trim()) h.name = name.value.trim();
      if (min && min.value.trim()) h.min = min.value.trim();
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
    case 'mood-quick': setQuickMood(id); break;
    case 'energy-quick': setQuickEnergy(id); break;
    case 'stress-quick': setQuickScale('stress', id, 'Stress', stressLabel); break;
    case 'focusq-quick': setQuickScale('focusQ', id, 'Focus', focusQLabel); break;
    case 'readiness-scroll': document.querySelector('.vitality-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); break;
    case 'stop-scroll': document.querySelector('.today-stop-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); break;
    case 'today-habits-scroll': document.querySelector('.today-reps-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'task-add': {
      const ti = document.getElementById('taskTitle');
      const du = document.getElementById('taskDue');
      const rm = document.getElementById('taskRemind');
      const title = ti ? ti.value.trim() : '';
      if (!title) { showNudge('Add a task name first.'); if (ti) ti.focus(); break; }
      S.taskSeq = (S.taskSeq || 0) + 1;
      S.tasks.push({
        id: 't' + Date.now() + '-' + S.taskSeq,
        title,
        due: du && du.value ? du.value : '',
        remind: rm ? rm.checked : true,
        done: false,
        notified: false,
        created: Date.now(),
      });
      save();
      render();
      showNudge('Task added.');
      if (du && du.value && rm && rm.checked && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      break;
    }
    case 'task-toggle': {
      const t = S.tasks.find((x) => x.id === id);
      if (t) { t.done = !t.done; if (t.done) t.notified = true; save(); render(); }
      break;
    }
    case 'task-del': {
      S.tasks = S.tasks.filter((x) => x.id !== id);
      save();
      render();
      break;
    }
    case 'feel-set': recordFeel(el.dataset.hid, id); break;
    case 'review': sheet = { type: 'review', date: todayKey() }; render(); break;
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

    case 'paywall': track('paywall_viewed'); sheet = { type: 'paywall' }; render(); break;
    case 'premium-on': S.premium = true; save(); sheet = null; render(); confetti(); break;
    case 'premium-off': S.premium = false; save(); render(); break;

    case 'qa': openQA = openQA === id ? null : id; render(); break;
    case 'axis-mode': axisMode = id; render(); break;
    case 'forge-start': startForge(); break;
    case 'forge-end': S.forge = null; save(); render(); break;
    case 'focus-start': {
      const nativeSent = startFocusSession(Number(el.dataset.minutes) || 30, el.dataset.label || 'Focus session', el.dataset.strict !== '0');
      render();
      showNudge(nativeSent
        ? `${el.dataset.label || 'Focus session'} started. Native shield requested.`
        : `${el.dataset.label || 'Focus session'} started. This build tracks focus; native Screen Time blocking is not connected yet.`);
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
      if (!confirm('Emergency unlock?\n\nArc90 will log this break so you can spot the pattern later.')) break;
      S.focus.active.unlocks = (S.focus.active.unlocks || 0) + 1;
      S.focus.seq++;
      S.focus.unlocks.unshift({ id: `fu${S.focus.seq}`, date: todayKey(), reason: 'Emergency unlock', label: S.focus.active.label });
      save();
      render();
      showNudge('Unlock logged. That is data, not failure.');
      break;
    }
    case 'focus-allday-toggle': {
      const cur = allDayLockActive();
      if (!cur && !focusStats().blockedCount) { showNudge('Add at least one app or site to lock first.'); break; }
      S.focus.allDayLock = { on: !cur, date: todayKey() };
      save();
      render();
      showNudge(!cur ? 'All-day lock on — apps shielded until midnight. 🔒' : 'All-day lock off. Freedom restored.');
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

    case 'ai-provider': S.ai.provider = id; save(); render(); break;
    case 'ai-connect': {
      const k = document.getElementById('aiKey');
      if (k && k.value.trim()) { S.ai.key = k.value.trim(); save(); render(); }
      break;
    }
    case 'ai-disconnect': S.ai.key = ''; S.aiChat = []; save(); render(); break;
    case 'coach-ask': {
      const q = el.dataset.q || '';
      if (!S.ai || !S.ai.key) { showNudge('Connect an AI provider below and your coach can answer this live.'); break; }
      const inp = document.getElementById('aiInput');
      if (inp) { inp.value = q; sendAI(); }
      break;
    }
    case 'ai-clear': S.aiChat = []; save(); render(); break;
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
      if (g && g.value.trim()) S.profile.goal = g.value.trim();
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
      if (!name || !name.value.trim()) break;
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
      save(); render();
      showNudge('Alarm cleared.');
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
      const inp = document.getElementById('vital-' + key);
      if (!inp) break;
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
      render(); break;
    }
    case 'water-sub': {
      const h = healthDay();
      setHealthDay(todayKey(), { water: h.water - 1 });
      render(); break;
    }
    case 'weight-save': {
      const inp = document.getElementById('weightInput');
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
        localStorage.removeItem(KEY); S = defaultState(); ob = null; tab = 'today'; sheet = null; render();
      }
      break;
    }
    case 'nudge-x': document.querySelector('.nudge')?.remove(); break;

    /* onboarding */
    case 'ob-next': ob.step++; renderOnboarding(); break;
    case 'ob-back': ob.step--; renderOnboarding(); break;
    case 'ob-occ': ob.occs.has(id) ? ob.occs.delete(id) : ob.occs.add(id); renderOnboarding(); break;
    case 'ob-cat': {
      if (ob.cats.has(id)) ob.cats.delete(id);
      else if (ob.cats.size >= 3) { showNudge('Three missions max — focus is the feature. Swap one out first.'); break; }
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
  if (e.key === 'Escape' && sheet) {
    sheet = null; protoOpen = null; protoDetailOpen = null; protoAddOpen = false; protoUrgent = false;
    render();
  }
});
document.addEventListener('change', (e) => {
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

function wireAfterRender() {
  // Swipe the bottom sheet down to dismiss it back to the app (any sheet: share, paywall, proof…)
  const sheetEl = document.querySelector('.sheet');
  if (sheetEl && !sheetEl.dataset.swipe) {
    sheetEl.dataset.swipe = '1';
    let startY = 0, cur = 0, dragging = false;
    sheetEl.addEventListener('touchstart', (e) => {
      if (sheetEl.scrollTop > 0) return;       // let inner content scroll first
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
    const end = () => {
      if (!dragging) return;
      dragging = false;
      sheetEl.style.transition = '';
      if (cur > 130) { closeSheet(); }
      else { sheetEl.style.transform = ''; sheetEl.style.opacity = ''; }
    };
    sheetEl.addEventListener('touchend', end, { passive: true });
    sheetEl.addEventListener('touchcancel', end, { passive: true });
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

  const map = [['obName', 'name'], ['obGoal', 'goal'], ['obWhy', 'motivation'], ['obTime', 'remTime'], ['obOcc', 'occCustom']];
  for (const [domId, key] of map) {
    const inp = document.getElementById(domId);
    if (inp) inp.addEventListener('input', () => {
      ob[key] = inp.value;
      const btn = document.getElementById('obNextBtn');
      if (btn) {
        if (key === 'name') btn.disabled = !ob.name.trim();
        if (key === 'goal') btn.disabled = !(ob.goal.trim() && ob.cats.size);
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
  const animating = !!document.querySelector('.screen.anim');
  document.querySelectorAll('[data-countup]').forEach((el) => {
    const target = parseInt(el.dataset.countup, 10) || 0;
    const suffix = el.dataset.suffix || '';
    if (!animating) { el.textContent = target + suffix; return; }
    const t0 = performance.now(), dur = 700;
    const tick = (t) => {
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
      <stop offset="0" stop-color="#5ee4ff"/>
      <stop offset="0.52" stop-color="#8f6bff"/>
      <stop offset="1" stop-color="#c14cff"/>
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5ee4ff"/>
      <stop offset="0.52" stop-color="#8f6bff"/>
      <stop offset="1" stop-color="#c14cff"/>
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
  <circle cx="930" cy="90" r="260" fill="#8f6bff" opacity="0.18"/>
  <circle cx="100" cy="1240" r="280" fill="#5ee4ff" opacity="0.08"/>
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
  const colors = ['#5ee4ff', '#8f6bff', '#c14cff', '#f7f7ff', '#5ee4c2'];
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
    if (!S.pushClientId) { S.pushClientId = 'c' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); save(); }
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
function showFeelNudge(habit) {
  document.querySelector('.nudge')?.remove();
  const div = document.createElement('div');
  div.className = 'nudge feel-nudge';
  div.innerHTML = `
    <button class="nx" data-act="nudge-x" aria-label="Dismiss">✕</button>
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
      S.firedSlots = { [k]: fired };
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
    if (new Date(t.due).getTime() <= now) {
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncFocusState(); render(); checkReminders(); checkTaskReminders(); } });

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
  const today = atMidnight(new Date());
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
    const entry = { done: [], min: [], skip: [] };
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
  S.log[todayKey()] = { done: S.habits.slice(0, 2).map((h) => h.id), min: [], skip: [] };
  save(); render();
  return `seeded ${days} days (premium: ${premium})`;
};
window.__reset = function () { localStorage.removeItem(KEY); location.reload(); };
window.__arc90HealthSync = applyNativeHealthSync;

/* ---------------- boot ---------------- */

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

applyTheme();
const bootNudge = consumeCheckoutReturn();
render();
if (bootNudge) setTimeout(() => showNudge(bootNudge), 500);

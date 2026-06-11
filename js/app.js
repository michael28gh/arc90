/* ============================================================
   ARC90 — app logic
   Vanilla JS single-page app · localStorage persistence
   Tabs: Today · Habits · Progress · Coach · Profile
   Premium is SIMULATED locally (StoreKit 2 in the native build).
   ============================================================ */

'use strict';

/* ---------------- state ---------------- */

const KEY = 'arc90.v1';
const FREE_HABITS = 5;
const FREE_CUSTOM = 2;

function defaultState() {
  return {
    onboarded: false,
    premium: false,
    theme: 'auto',
    profile: { name: '', occupation: '', goal: '', goalCats: [], identity: '', motivation: '', start: null },
    ai: { provider: 'anthropic', key: '' },
    aiChat: [],                  // [{role:'user'|'assistant', content}]
    habits: [],                  // [{id, emoji, name, cat, min}]
    customSeq: 0,
    log: {},                     // { 'YYYY-MM-DD': {done:[], min:[], skip:[]} }
    reminders: { mode: 'daily', time: '08:00' },
    tipSeed: 0,
    firedSlots: {},
    forge: null,                 // {start, focus:[ids], anchor:id}
    protocols: [],               // [{id, name, type, freq, time, notes, logs:[{date, symptoms, note, urgent}]}]
    protoSeq: 0,
  };
}

function normalizeState(data) {
  if (!data || typeof data !== 'object') throw new Error('Backup is not a valid Arc90 data file.');
  const s = Object.assign(defaultState(), data);
  s.profile = Object.assign(defaultState().profile, data.profile || {});
  s.ai = Object.assign(defaultState().ai, data.ai || {});
  s.reminders = Object.assign(defaultState().reminders, data.reminders || {});
  s.log = data.log && typeof data.log === 'object' ? data.log : {};
  for (const k of Object.keys(s.log)) {
    if (Array.isArray(s.log[k])) s.log[k] = { done: s.log[k], min: [], skip: [] };
    else s.log[k] = Object.assign({ done: [], min: [], skip: [], energy: 0, mood: '', win: '', note: '' }, s.log[k] || {});
  }
  s.habits = Array.isArray(data.habits) ? data.habits.map((h) => ({ rhythm: 'daily', emoji: '•', name: 'Untitled habit', cat: 'custom', min: '2-minute version', ...h })) : [];
  s.aiChat = Array.isArray(data.aiChat) ? data.aiChat : [];
  s.protocols = Array.isArray(data.protocols) ? data.protocols : [];
  s.firedSlots = data.firedSlots && typeof data.firedSlots === 'object' ? data.firedSlots : {};
  return s;
}

let S = load();
let tab = 'today';
let sheet = null;                // {type:'paywall'|'protocol'|'task'|'edit', ...}
let libCat = 'all';
let libQuery = '';
let openQA = null;
let axisMode = 'rings';          // 'rings' (donut+bars) | 'radar'
let protoOpen = null;            // protocol id with open log form
let protoAddOpen = false;
let protoUrgent = false;

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
  const n = Math.floor((atMidnight(new Date()) - startDate()) / DAY_MS) + 1;
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
  const base = { done: [], min: [], skip: [], energy: 0, mood: '', win: '', note: '' };
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
   60% last-7-days + 40% whole challenge. Rest days excluded, one miss can't sink it. */
function momentum() { return Math.round(100 * (0.6 * avgRate(7) + 0.4 * avgRate(90))); }

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

function moodLabel(mood) {
  return ({ strong: 'Strong', steady: 'Steady', tired: 'Tired', stressed: 'Stressed', low: 'Low' })[mood] || '';
}

function energyLabel(value) {
  const n = Number(value) || 0;
  if (!n) return 'Not logged';
  return ['Very low', 'Low', 'Steady', 'High', 'Peak'][n - 1] || 'Logged';
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
  return Math.floor((dateFromKey(k) - startDate()) / DAY_MS) + 1;
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
  const d = Math.floor((atMidnight(new Date()) - atMidnight(new Date(S.forge.start + 'T00:00:00'))) / DAY_MS) + 1;
  return d >= 1 && d <= 7;
}
function forgeDay() {
  return Math.floor((atMidnight(new Date()) - atMidnight(new Date(S.forge.start + 'T00:00:00'))) / DAY_MS) + 1;
}

const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M8.5 12.2l2.4 2.4 4.6-5"/></svg>',
  habits: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6.5h10M4 12h10M4 17.5h10"/><circle cx="19" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="17.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 6-8"/><path d="M16 6h3v3"/></svg>',
  coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.2-.6L3 21l1.7-5.1a8.3 8.3 0 01-1.2-4.4 8.4 8.4 0 018.5-8.4 8.4 8.4 0 019 8.4z"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.6-3.4 4.5-5 8-5s6.4 1.6 8 5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
};

/* ---------------- theme ---------------- */

const mqLight = window.matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const resolved = S.theme === 'auto' ? (mqLight.matches ? 'light' : 'dark') : S.theme;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#f6f4ef' : '#07080c';
}
mqLight.addEventListener('change', () => { if (S.theme === 'auto') applyTheme(); });

/* ---------------- premium gate ---------------- */

function gate(context) {
  if (S.premium) return true;
  sheet = { type: 'paywall', context };
  render();
  return false;
}

/* ============================================================
   RENDER ROOT
   ============================================================ */

const app = document.getElementById('app');

let lastRenderedTab = null;
function render() {
  applyTheme();
  if (!S.onboarded) { renderOnboarding(); return; }
  const animate = lastRenderedTab !== tab;
  lastRenderedTab = tab;
  const views = { today: viewToday, habits: viewHabits, progress: viewProgress, coach: viewCoach, profile: viewProfile };
  app.innerHTML = `
    <div class="screen${animate ? ' anim' : ''}">${views[tab]()}</div>
    <nav class="tabbar">
      ${tabBtn('today', 'Today', ICONS.today)}
      ${tabBtn('habits', 'Habits', ICONS.habits)}
      ${tabBtn('progress', 'Progress', ICONS.progress)}
      ${tabBtn('coach', 'Coach', ICONS.coach)}
      ${tabBtn('profile', 'Profile', ICONS.profile)}
    </nav>
    ${sheet ? viewSheet() : ''}
  `;
  wireAfterRender();
}

function tabBtn(id, label, icon) {
  return `<button class="tab-btn ${tab === id ? 'active' : ''}" data-act="tab" data-id="${id}">${icon}<span>${label}</span></button>`;
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
  const C = 339.292;
  const mom = momentum();
  const pill = mom >= 75 ? ['good', 'On track'] : mom >= 50 ? ['mid', 'Building'] : ['low', 'Needs attention'];
  const day = dayNumber();
  const weak = weakestHabit();
  const tip = currentTip();
  const target = tipTarget();

  const milestone = day === 30 ? ['Checkpoint · Day 30', 'One third of the arc. The routine is becoming who you are.']
    : day === 60 ? ['Checkpoint · Day 60', 'Two thirds in. This is where most people quit — you didn’t.']
    : day >= 90 ? ['Challenge complete · Day 90', 'The arc is full. Start your next 90 in Profile whenever you’re ready.'] : null;

  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>${greeting()}, ${esc(S.profile.name.split(' ')[0] || 'you')}</h1>
        <div class="sub">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <span class="day-chip">◔ Day ${day} of 90 · ${daysLeft()} left</span>
      </div>
    </header>

    ${milestone ? `<div class="milestone"><div class="t">🏁 ${milestone[0]}</div><div class="s">${milestone[1]}</div></div>` : ''}
    ${forgeActive() ? `<div class="forge-banner">🔥 <div>Forge Mode · Day ${forgeDay()} of 7 — minimum versions only on your focus habits. Show up small.</div></div>` : ''}

    <section class="card hero-card">
      <div class="hero">
        <div class="ring-wrap">
          <svg viewBox="0 0 124 124" width="124" height="124">
            <circle class="ring-track" cx="62" cy="62" r="54" fill="none" stroke-width="11"/>
            <circle class="ring-fill" cx="62" cy="62" r="54" fill="none" stroke-width="11"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/>
          </svg>
          <div class="ring-center">
            <div class="big-num">${done}<span style="color:var(--tx-3);font-size:18px">/${total}</span></div>
            <div class="of">today</div>
          </div>
        </div>
        <div class="hero-stats">
          <div class="hstat">
            <div class="eyebrow">Momentum Score</div>
            <div class="hstat-val grad"><span data-countup="${mom}">0</span><span class="unit">%</span></div>
            <span class="status-pill ${pill[0]}">${pill[1]}</span>
          </div>
          <div class="hstat">
            <div class="eyebrow">Goal</div>
            <div style="font-size:13.5px;font-weight:650;color:var(--tx-2);line-height:1.4">${esc(S.profile.goal || '—')}</div>
          </div>
        </div>
      </div>

      ${S.habits.length ? `<div class="quick-pills in-hero">${S.habits.map(quickPill).join('')}</div>` : ''}

      <div class="hero-week">
        <span class="eyebrow">This week</span>
        <span class="eyebrow" style="color:var(--tx-2)">Momentum ${mom}%</span>
      </div>
      <div class="hero-chart">${chart(7)}</div>

      <div class="votes">🗳️ <b data-countup="${totalReps()}">0</b>&nbsp;votes cast for becoming ${esc(S.profile.identity || 'a better you')}</div>
    </section>

    ${dailyPlanCard(done, total)}

    ${allDoneToday() ? `
    <div class="daydone">
      <div class="t">Day ${day} complete ✓</div>
      <div class="s">Every rep is a vote for ${esc(S.profile.identity || 'the person you’re becoming')}.</div>
    </div>` : ''}

    <div class="tile-row">
      <div class="tile lead"><div class="te">🔥</div><div class="tv"><span data-countup="${bestStreak()}">0</span></div><div class="tl">Best streak</div></div>
      <div class="tile"><div class="te">✅</div><div class="tv"><span data-countup="${perfectDays()}">0</span></div><div class="tl">Perfect days</div></div>
      <div class="tile"><div class="te">⚡</div><div class="tv"><span data-countup="${totalReps()}">0</span></div><div class="tl">Total reps</div></div>
    </div>

    ${journeyCard()}

    ${weak ? `
    <section class="card weak-card">
      <div class="card-head" style="margin-bottom:10px"><span class="eyebrow" style="color:var(--red)">Needs attention</span></div>
      <div class="weak-row">
        <span class="weak-emoji">${weak.habit.emoji}</span>
        <div style="flex:1;min-width:0">
          <div class="weak-name">${esc(weak.habit.name)}</div>
          <div class="weak-rate">${Math.round(weak.rate * 100)}% over the last 7 days — make it smaller, not later ↓</div>
        </div>
      </div>
    </section>` : ''}

    ${target ? `
    <section class="card tip-card">
      <div class="tip-tag">◎ Coach · easier to repeat</div>
      <div class="tip-title">${tip.icon} ${esc(tip.title)}</div>
      <div class="tip-body">${renderTipBody(tip, target)}</div>
      <button class="tip-shuffle" data-act="shuffle-tip">↻ Another technique</button>
    </section>` : ''}

    <div class="card-head" style="margin:20px 0 11px">
      <span class="section-title" style="margin:0">Today</span>
      <span class="eyebrow">${done}/${total}</span>
    </div>
    ${S.habits.length ? `<div class="tasks">${S.habits.map(taskRow).join('')}</div>`
      : `<div class="card empty-note">No habits yet — head to the <b>Habits</b> tab and pick the reps that carry you to your goal.</div>`}
  `;
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
          <div>
            <b>${esc(next.title)}</b>
            <small>${esc(next.desc)}</small>
            <div class="mini-progress"><i style="width:${next.pct}%"></i></div>
          </div>
          <em>${next.pct}%</em>
        </div>` : `
        <div class="next-badge complete">
          <span class="badge-medal">✓</span>
          <div><b>All badges unlocked</b><small>The arc is yours. Start the next 90 when ready.</small></div>
        </div>`}
    </section>`;
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
        <div class="plan-copy">Pick 3 to 5 habits so Arc90 can start tracking your daily signal.</div>
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
  const short = h.name.length > 16 ? h.name.replace(/\s+\d.*$/, '').slice(0, 16) : h.name;
  return `<button class="qpill ${cls}" data-act="toggle" data-id="${h.id}"><span class="qe">${h.emoji}</span><span class="qn">${esc(short)}</span><span class="qc">${on ? ICONS.check : ''}</span></button>`;
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
        <span class="task-emoji">${h.emoji}</span>
        <div style="flex:1;min-width:0">
          <div class="task-name">${esc(h.name)}</div>
          <div class="task-state">${stateLab || rhythmLabel(h, true)}</div>
        </div>
        <span class="task-streak">${s > 0 ? `🔥 ${s}` : ''}</span>
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

function viewHabits() {
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Habits</h1>
        <div class="sub">The reps that build ${esc(S.profile.identity || 'the new you')}</div>
      </div>
    </header>

    <div class="section-title">Your habits <span class="count-bub">${S.habits.length}${S.premium ? '' : ` / ${FREE_HABITS}`}</span></div>
    ${S.premium ? '' : `<div class="limit-note">Free plan: ${FREE_HABITS} active habits · ${FREE_CUSTOM} custom. <b data-act="paywall" style="cursor:pointer">Premium unlocks unlimited →</b></div>`}
    ${S.habits.length ? S.habits.map(mineRow).join('') : '<div class="card empty-note">Nothing here yet — add from the library below.</div>'}

    <div class="section-gap section-title">Create your own</div>
    <div class="custom-form">
      <input id="customName" type="text" placeholder="e.g. Practice salsa 15 min" maxlength="48"/>
      <button class="btn" data-act="add-custom" style="padding:0 20px">Add</button>
    </div>

    <div class="section-title">Library <span class="count-bub">${HABIT_LIBRARY.length} habits</span></div>
    <div class="search-bar">${ICONS.search}<input id="libSearch" type="search" placeholder="Search 100 habits…" value="${esc(libQuery)}"/></div>
    <div class="cat-chips">
      <button class="chip ${libCat === 'all' ? 'on' : ''}" data-act="cat" data-id="all">✨ All</button>
      ${CATEGORIES.filter((c) => c.id !== 'custom').map((c) => `<button class="chip ${libCat === c.id ? 'on' : ''}" data-act="cat" data-id="${c.id}">${c.emoji} ${c.name}</button>`).join('')}
    </div>
    <div id="libList">${libList()}</div>
  `;
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
      <span class="lib-emoji">${h.emoji}</span>
      <div style="flex:1;min-width:0">
        <div class="lib-name">${esc(h.name)}</div>
        <div class="lib-cat">${rhythmLabel(h)} · min: ${esc(h.min || '2-minute version')}</div>
        <div class="dot7" style="margin-top:6px">${dots}</div>
      </div>
      <button class="remove-btn rhythm-btn" data-act="rhythm-sheet" data-id="${h.id}">${rhythmLabel(h, true)}</button>
      <button class="remove-btn" data-act="remove" data-id="${h.id}">Remove</button>
    </div>`;
}

function libList() {
  const q = libQuery.trim().toLowerCase();
  let items = HABIT_LIBRARY.filter((h) =>
    (libCat === 'all' || h.cat === libCat) &&
    (!q || h.name.toLowerCase().includes(q) || catOf(h.cat).name.toLowerCase().includes(q))
  );
  if (!items.length) return '<div class="empty-note">No matches — create it yourself above. ✨</div>';
  return `<div class="lib-grid">${items.map((h) => {
    const added = S.habits.some((x) => x.id === h.id);
    return `
      <button class="ltile ${added ? 'added' : ''}" data-act="lib-toggle" data-id="${h.id}" title="min: ${esc(h.min)}">
        <span class="ltb">${added ? '✓' : '+'}</span>
        <span class="lte">${h.emoji}</span>
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

/* ============================================================
   PROGRESS
   ============================================================ */

function viewProgress() {
  const end = addDays(startDate(), 89);
  const rec = recoveryRate();
  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Progress</h1>
        <div class="sub">${fmtDate(startDate())} → ${fmtDate(end)} · Day ${dayNumber()} of 90</div>
      </div>
    </header>

    <div class="stat-duo">
      <div class="stat-card"><span class="eyebrow">Momentum</span><div class="big-num"><span data-countup="${momentum()}" data-suffix="%">0</span></div><div class="cap">60% this week · 40% overall</div></div>
      <div class="stat-card"><span class="eyebrow">Perfect days</span><div class="big-num"><span data-countup="${perfectDays()}">0</span></div><div class="cap">everything completed</div></div>
    </div>
    <div class="stat-duo">
      <div class="stat-card"><span class="eyebrow">Best streak</span><div class="big-num"><span data-countup="${bestStreak()}">0</span></div><div class="cap">days in a row</div></div>
      <div class="stat-card"><span class="eyebrow">Total reps</span><div class="big-num"><span data-countup="${totalReps()}">0</span></div><div class="cap">habits completed</div></div>
    </div>

    ${progressBriefing(rec)}
    ${weeklyReviewCard()}
    ${shareSnapshotCard()}
    ${historyReview()}
    ${achievementsPanel()}

    <section class="card">
      <div class="card-head"><span class="eyebrow">Last 7 days</span></div>
      ${chart(7)}
    </section>

    ${premiumCard('axis', 'Axis Dashboard', 'See exactly which area of your routine is strong and where you’re falling behind.', axisInner())}
    ${premiumCard('grid', 'Your 90 days', 'The full challenge heatmap — every day, every level of effort.', `${grid90()}<div class="grid-legend">less <i style="background:var(--line-2)"></i><i style="background:color-mix(in srgb,var(--accent) 32%,transparent)"></i><i style="background:color-mix(in srgb,var(--accent) 62%,transparent)"></i><i style="background:var(--accent)"></i> more</div>`)}
    ${premiumCard('habits', 'Per-habit breakdown', 'Consistency for each habit across the whole challenge, plus your recovery rate.', habitBreakdownInner(rec))}

    <div class="contract">
      <div class="q">“I, <b>${esc(S.profile.name || 'me')}</b> — ${esc(S.profile.occupation || 'human')} by day, <b>${esc(S.profile.identity || 'a better me')}</b> by choice.<br/>90 days. One goal: <b>${esc(S.profile.goal || 'level up')}</b>.”</div>
      <div class="sig">— signed ${startDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    </div>
  `;
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
        <span class="e">${h.emoji}</span>
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

function viewCoach() {
  const w = weakestHabit();
  const st = strongestHabit();
  const tip = currentTip();
  const target = tipTarget();
  const insight = w && st
    ? `You complete <b>${esc(st.habit.name)}</b> ${Math.round(st.rate * 100)}% of the time, but <b>${esc(w.habit.name)}</b> only ${Math.round(w.rate * 100)}%. You’re not failing the habit — the habit may be badly placed. Try its minimum version (<b>${esc(w.habit.min || '2 minutes')}</b>) right after ${esc(st.habit.name.toLowerCase())} for 7 days.`
    : `Early days — your patterns will show here after a few days of data. For now: protect the smallest version of every habit. Showing up beats showing off.`;

  return `
    ${brandbar()}
    <header class="topbar">
      <div>
        <h1>Coach</h1>
        <div class="sub">Habit design, not hype — and never medical advice</div>
      </div>
    </header>

    ${aiPanel()}

    <section class="card tip-card">
      <div class="tip-tag">◎ This week’s read</div>
      <div class="tip-body" style="font-size:14px">${insight}</div>
    </section>

    ${target ? `
    <section class="card tip-card">
      <div class="tip-tag">◎ Technique of the day</div>
      <div class="tip-title">${tip.icon} ${esc(tip.title)}</div>
      <div class="tip-body">${renderTipBody(tip, target)}</div>
      <button class="tip-shuffle" data-act="shuffle-tip">↻ Another technique</button>
    </section>` : ''}

    <div class="section-gap section-title">Ask Coach</div>
    ${COACH_QA.map((qa) => `
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

    <div class="empty-note" style="padding-top:18px">Coach gives habit-design guidance assembled from your own data.<br/>It never gives medical, dosing, or treatment advice.</div>
  `;
}

function forgeView() {
  if (forgeActive()) {
    const focus = S.forge.focus.map((id) => S.habits.find((h) => h.id === id)).filter(Boolean);
    const anchor = S.habits.find((h) => h.id === S.forge.anchor);
    return `
      <section class="card forge-card">
        <div class="card-head" style="margin-bottom:8px">
          <span class="eyebrow" style="color:var(--amber)">🔥 Forge Mode · Day ${forgeDay()} of 7</span>
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
      <section class="card ai-card">
        <div class="card-head" style="margin-bottom:8px"><span class="tip-tag" style="margin:0">⚡ AI Coach · strict mode</span><span class="pro-badge">BETA</span></div>
        <div class="tip-body" style="margin-bottom:13px">Connect your own AI and get a <b>strict, science-based coach</b> that knows your goal, your Momentum, and exactly which habit is slipping. Your key is stored only on this device.</div>
        <div class="seg" style="margin-bottom:11px">
          ${Object.entries(AI_PROVIDERS).map(([id, pr]) => `<button class="${S.ai.provider === id ? 'on' : ''}" data-act="ai-provider" data-id="${id}">${pr.label}</button>`).join('')}
        </div>
        <input id="aiKey" type="password" placeholder="Paste your ${p.label} API key…" autocomplete="off"/>
        <div class="seg-hint" style="margin-top:8px">Get a key: ${p.hint}</div>
        <button class="btn" data-act="ai-connect" style="margin-top:12px;padding:14px">Connect ${p.label}</button>
      </section>`;
  }
  const msgs = S.aiChat.length ? S.aiChat : [{ role: 'assistant', content: `Connected. I'm your coach for one thing only: “${S.profile.goal}”. Day ${dayNumber()} of 90, Momentum ${momentum()}%. No fluff, no excuses, no medical advice. What's in the way?` }];
  return `
    <section class="card ai-card">
      <div class="card-head" style="margin-bottom:8px">
        <span class="tip-tag" style="margin:0">⚡ AI Coach · ${AI_PROVIDERS[S.ai.provider].label}</span>
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
      <div class="seg-hint" style="margin-top:9px">Strict coach · evidence-based · refuses medical & dosing questions.</div>
    </section>`;
}

function aiSystemPrompt() {
  const stats = S.habits.map((h) => `- ${h.name}: ${Math.round(habitRate(h.id, 7) * 100)}% last 7 days (min version: ${h.min || '2-minute version'})`).join('\n');
  return `You are Arc90's AI Coach: a strict, no-nonsense, evidence-based habit coach. You coach ONE person toward ONE goal.

USER: ${S.profile.name}, ${S.profile.occupation}.
90-DAY GOAL: ${S.profile.goal}${S.profile.motivation ? ` (why it matters: ${S.profile.motivation})` : ''}.
TODAY: Day ${dayNumber()} of 90. Momentum Score: ${momentum()}% (0.6×last-7-days + 0.4×whole challenge).
HABITS (7-day completion):
${stats}

RULES:
1. Be direct and demanding but never insulting or shaming. Tough, fair, brief.
2. Max ~120 words. Every reply ends with ONE concrete action for today.
3. Ground advice in behavioral science by name (implementation intentions, habit stacking, friction design, minimum viable habit, never-miss-twice, environment design). No pop-neuroscience claims.
4. Stay on the goal. If asked about anything unrelated, give one short answer and steer back.
5. HARD BOUNDARY: never give medical, dosing, medication, supplement, or peptide advice — including amounts, schedules, stacking, or what to take. Respond exactly with: "That's a clinician question, not a coach question. I handle your reps, your schedule, and your follow-through — ask your doctor about that, then come back and we'll build the routine around their instructions."
6. Use their real numbers above when relevant. Call out the weakest habit by name.`;
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

    <section class="card">
      <div class="eyebrow" style="margin-bottom:6px">Current challenge</div>
      <div style="font-size:17px;font-weight:800;letter-spacing:-0.01em">${esc(S.profile.goal)}</div>
      <div style="font-size:12.5px;color:var(--tx-2);margin-top:5px">${fmtDate(startDate())} → ${fmtDate(end)} · Day ${dayNumber()} of 90 · becoming <b>${esc(S.profile.identity)}</b></div>
      ${S.profile.motivation ? `<div style="font-size:12.5px;color:var(--tx-3);margin-top:7px;font-style:italic">“${esc(S.profile.motivation)}”</div>` : ''}
    </section>

    <div class="premium-card">
      <div class="pt">Arc90 Premium ${S.premium ? '· active' : ''}</div>
      <div class="ps">${S.premium
        ? 'Axis Dashboard, Forge Mode, Protocol Tracker, unlimited habits, advanced reminders. (Simulated purchase — StoreKit 2 in the App Store build.)'
        : 'Axis Dashboard · Forge Mode · Protocol Tracker · unlimited habits · advanced reminders & reports.'}</div>
      ${S.premium
        ? `<button class="btn btn-ghost" data-act="premium-off" style="padding:12px">Switch back to Free (demo)</button>`
        : `<button class="btn" data-act="paywall" style="padding:13px">Start Premium · $4.99/mo</button>`}
    </div>

    <div class="section-title">Reminders</div>
    <section class="card">
      <div class="seg">
        <button class="${r.mode === 'daily' ? 'on' : ''}" data-act="rem-mode" data-id="daily">Once a day</button>
        <button class="${r.mode === '5h' ? 'on' : ''}" data-act="rem-mode" data-id="5h">Every 5 hours${S.premium ? '' : '<span class="mini-lock">PRO</span>'}</button>
        <button class="${r.mode === 'off' ? 'on' : ''}" data-act="rem-mode" data-id="off">Off</button>
      </div>
      ${r.mode === 'daily' ? `<div style="margin-top:12px"><input id="setTime" type="time" value="${esc(r.time)}" data-act-input="rem-time"/></div>` : ''}
      <div class="seg-hint">${r.mode === '5h' ? 'Nudges at 9:00, 14:00 and 19:00 while the app is reachable.' : r.mode === 'daily' ? 'One focused nudge — pick the moment you usually drift.' : 'You’re flying solo. The grid still fills either way.'}</div>
    </section>

    <div class="section-title">Appearance</div>
    <section class="card">
      <div class="seg">
        <button class="${S.theme === 'auto' ? 'on' : ''}" data-act="theme" data-id="auto">Auto</button>
        <button class="${S.theme === 'light' ? 'on' : ''}" data-act="theme" data-id="light">Light</button>
        <button class="${S.theme === 'dark' ? 'on' : ''}" data-act="theme" data-id="dark">Dark</button>
      </div>
    </section>

    <div class="section-title">More</div>
    <button class="prow" data-act="edit"><span class="pe">✏️</span><span class="pl">Edit name, occupation & goal</span><span class="arr">›</span></button>
    <button class="prow" data-act="protocol"><span class="pe">🧬</span><span class="pl">Protocol Tracker <span class="pro-badge">PRO</span></span><span class="pv">${S.protocols.length ? S.protocols.length + ' tracked' : ''}</span><span class="arr">›</span></button>
    <button class="prow" data-act="export"><span class="pe">📤</span><span class="pl">Export my data (JSON)</span><span class="arr">›</span></button>
    <button class="prow" data-act="import"><span class="pe">📥</span><span class="pl">Restore from backup</span><span class="arr">›</span></button>
    <input id="importFile" class="import-input" type="file" accept="application/json,.json"/>
    <button class="danger-btn" data-act="reset">Start over (erases everything)</button>

    <div class="empty-note">
      🔒 All your data lives on this device. Export a backup before switching phones or clearing browser data.<br/><br/>
      📲 <b>iPhone:</b> open in Safari → Share → <b>Add to Home Screen</b> for the full-screen app.
    </div>
  `;
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
    : '';
  return `
    <div class="sheet-wrap">
      <div class="sheet-bg" data-act="close-sheet"></div>
      <div class="sheet"><div class="sheet-grab"></div>${inner}</div>
    </div>`;
}

function sheetPaywall() {
  return `
    <h2>Arc90 Premium</h2>
    <div class="sheet-sub">Understand your habits. Strengthen your routine. Build real momentum.</div>
    <div class="pay-feat"><span class="pc">✓</span><span>Unlock your full <b>Axis Dashboard</b></span></div>
    <div class="pay-feat"><span class="pc">✓</span><span>Personalized coaching insights</span></div>
    <div class="pay-feat"><span class="pc">✓</span><span><b>Forge Mode</b> when you fall behind</span></div>
    <div class="pay-feat"><span class="pc">✓</span><span>Unlimited habits and challenges</span></div>
    <div class="pay-feat"><span class="pc">✓</span><span>Advanced reminders (every 5 hours) & reports</span></div>
    <div class="pay-feat"><span class="pc">✓</span><span>Track your wellness routines privately with <b>Protocol Tracker</b></span></div>
    <div class="pay-price"><div class="pp">$4.99<span style="font-size:14px;color:var(--tx-2)">/month</span></div><div class="pm">Cancel anytime.</div></div>
    <button class="btn" data-act="premium-on" style="margin-top:10px">Start Arc90 Premium</button>
    <button class="btn btn-ghost" data-act="close-sheet" style="margin-top:9px">Continue with Free</button>
    <div class="pay-note">Demo build: the purchase is simulated on this device.<br/>The App Store version uses StoreKit 2 subscriptions.</div>
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
    <h2>${h.emoji} ${esc(h.name)}</h2>
    <div class="sheet-sub">${rhythmLabel(h)} · next due ${niceDate(nextDue)} · today: ${todayStats === 'off' ? 'not scheduled' : todayStats}</div>
    <div class="habit-pulse">
      <div><span>${streak(h.id)}</span><small>streak</small></div>
      <div><span>${rate7}%</span><small>7-day</small></div>
      <div><span>${rate30}%</span><small>30-day</small></div>
    </div>
    ${habitMiniHeat(h)}

    <div class="sheet-section">Tune habit</div>
    <div class="habit-edit-grid">
      <div class="field"><label>Emoji</label><input id="habitEmoji" type="text" value="${esc(h.emoji)}" maxlength="4"/></div>
      <div class="field"><label>Name</label><input id="habitName" type="text" value="${esc(h.name)}" maxlength="56"/></div>
    </div>
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
  const moods = [
    ['strong', 'Strong'],
    ['steady', 'Steady'],
    ['tired', 'Tired'],
    ['stressed', 'Stressed'],
    ['low', 'Low'],
  ];
  return `
    <div class="field">
      <label>Energy</label>
      <input id="reviewEnergy" class="energy-range" type="range" min="1" max="5" step="1" value="${energy}"/>
      <div class="range-labels"><span>low</span><span>steady</span><span>peak</span></div>
    </div>
    <div class="field">
      <label>Mood</label>
      <div class="chip-grid review-moods">
        ${moods.map(([id, label]) => `<button class="chip ${l.mood === id ? 'on' : ''}" data-review-mood="${id}">${label}</button>`).join('')}
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
  return `
    <h2>Daily reflection</h2>
    <div class="sheet-sub">${niceDate(k)} · Track the context behind the checklist. Tiny notes turn into better coaching later.</div>
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
        <span class="lib-emoji">${h.emoji}</span>
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

    ${protoAddOpen ? `
      <div class="card" style="margin-top:6px">
        <div class="field"><label>Name</label><input id="pName" type="text" placeholder="e.g. Morning wellness routine" maxlength="48"/></div>
        <div class="field"><label>Type</label>
          <div class="chip-grid" id="pTypeChips">
            ${PROTOCOL_TYPES.map((t, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-ptype="${t.id}">${t.emoji} ${t.label}</button>`).join('')}
          </div></div>
        <div class="field"><label>Frequency</label>
          <div class="seg" id="pFreqSeg">
            <button class="on" data-pfreq="Daily">Daily</button>
            <button data-pfreq="Weekly">Weekly</button>
            <button data-pfreq="As needed">As needed</button>
          </div></div>
        <div class="field"><label>Reminder time</label><input id="pTime" type="time" value="08:00"/></div>
        <div class="field"><label>Notes (optional)</label><input id="pNotes" type="text" placeholder="e.g. After breakfast — as prescribed by my clinician" maxlength="120"/></div>
        <button class="btn" data-act="proto-save">Save protocol</button>
      </div>`
      : `<button class="btn btn-ghost" data-act="proto-add" style="margin-top:6px">+ Add a protocol</button>`}

    <button class="btn btn-ghost" data-act="proto-export" style="margin-top:9px">📄 Export report for your doctor</button>
  `;
}

function protoRow(p) {
  const t = PROTOCOL_TYPES.find((x) => x.id === p.type) || PROTOCOL_TYPES[5];
  const logs = [...p.logs].slice(-3).reverse();
  const open = protoOpen === p.id;
  return `
    <div class="proto-row">
      <div class="proto-head">
        <span class="lib-emoji">${t.emoji}</span>
        <div style="flex:1;min-width:0">
          <div class="lib-name">${esc(p.name)}</div>
          <div class="proto-type">${t.label} · ${esc(p.freq)} · ⏰ ${esc(p.time)}${p.notes ? ' · ' + esc(p.notes) : ''}</div>
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
  const steps = [obWelcome, obAbout, obGoal, obHabits, obReminders, obContract];
  const dots = ob.step === 0 ? '' :
    `<div class="ob-dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>`;
  app.innerHTML = `
    <div class="ob ${ob.step === 0 ? 'welcome' : ''}">
      ${ob.step > 0 ? `<div class="ob-top"><button class="ob-back" data-act="ob-back">← Back</button>${dots}</div>` : ''}
      <div class="ob-body">${steps[ob.step]()}</div>
    </div>`;
  wireAfterRender();
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
      <div class="ob-sub">Based on your missions, we suggest these — then browse all 100. Keep 3–5: small enough to never miss.</div>

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
      <button class="btn ob-cta" data-act="ob-next" id="obNextBtn" ${n > 0 ? '' : 'disabled'}>Continue with ${n} habit${n === 1 ? '' : 's'}</button>
    </div>`;
}

function pickRow(h) {
  const on = ob.picked.has(h.id);
  return `
    <button class="pick-row ${on ? 'on' : ''}" data-act="ob-pick" data-id="${h.id}">
      <span class="pick-box">${ICONS.check}</span>
      <span class="lib-emoji">${h.emoji}</span>
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
        <button class="${ob.remMode === 'daily' ? 'on' : ''}" data-act="ob-rem" data-id="daily">Once a day</button>
        <button data-act="ob-rem" data-id="5h">Every 5 hours<span class="mini-lock">PRO</span></button>
        <button class="${ob.remMode === 'off' ? 'on' : ''}" data-act="ob-rem" data-id="off">Off</button>
      </div>
      ${ob.remMode === 'daily' ? `<div class="field"><label>At what time?</label><input id="obTime" type="time" value="${esc(ob.remTime)}"/></div>` : ''}
      <div class="seg-hint">${ob.remMode === 'daily' ? 'Pick the hour you usually drift. That’s where habits go to die.' : 'Brave. The 90-day grid will still fill — or not — either way. 👀'}</div>
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
      <button class="btn ob-cta" data-act="ob-finish">Start Day 1</button>
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
    case 'tab': tab = id; openQA = null; render(); break;
    case 'toggle': toggle(isNaN(+id) ? id : +id); break;
    case 'shuffle-tip': S.tipSeed++; save(); render(); break;
    case 'close-sheet': sheet = null; protoOpen = null; protoAddOpen = false; protoUrgent = false; render(); break;
    case 'cat': libCat = id; render(); break;

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
      const emoji = document.getElementById('habitEmoji');
      const name = document.getElementById('habitName');
      const min = document.getElementById('habitMin');
      if (emoji && emoji.value.trim()) h.emoji = emoji.value.trim().slice(0, 4);
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
    case 'review': sheet = { type: 'review', date: todayKey() }; render(); break;
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

    case 'paywall': sheet = { type: 'paywall' }; render(); break;
    case 'premium-on': S.premium = true; save(); sheet = null; render(); confetti(); break;
    case 'premium-off': S.premium = false; save(); render(); break;

    case 'qa': openQA = openQA === id ? null : id; render(); break;
    case 'axis-mode': axisMode = id; render(); break;
    case 'forge-start': startForge(); break;
    case 'forge-end': S.forge = null; save(); render(); break;

    case 'ai-provider': S.ai.provider = id; save(); render(); break;
    case 'ai-connect': {
      const k = document.getElementById('aiKey');
      if (k && k.value.trim()) { S.ai.key = k.value.trim(); save(); render(); }
      break;
    }
    case 'ai-disconnect': S.ai.key = ''; S.aiChat = []; save(); render(); break;
    case 'ai-clear': S.aiChat = []; save(); render(); break;
    case 'ai-send': sendAI(); break;

    case 'rem-mode': {
      if (id === '5h' && !S.premium) { gate('reminders'); break; }
      S.reminders.mode = id; save();
      if (id !== 'off' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
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
    case 'proto-save': {
      const name = document.getElementById('pName');
      if (!name || !name.value.trim()) break;
      const type = document.querySelector('#pTypeChips .chip.on');
      const freq = document.querySelector('#pFreqSeg button.on');
      const time = document.getElementById('pTime');
      const notes = document.getElementById('pNotes');
      S.protoSeq++;
      S.protocols.push({
        id: 'p' + S.protoSeq,
        name: name.value.trim(),
        type: type ? type.dataset.ptype : 'other',
        freq: freq ? freq.dataset.pfreq : 'Daily',
        time: time && time.value ? time.value : '08:00',
        notes: notes ? notes.value.trim() : '',
        logs: [],
      });
      save(); protoAddOpen = false; render(); break;
    }
    case 'proto-del': S.protocols = S.protocols.filter((p) => p.id !== id); save(); render(); break;
    case 'proto-log': protoOpen = protoOpen === id ? null : id; protoUrgent = false; render(); break;
    case 'proto-log-save': {
      const p = S.protocols.find((x) => x.id === id);
      if (!p) break;
      const symptoms = [...document.querySelectorAll('#symChips .chip.on')].map((c) => c.dataset.sym);
      const note = document.getElementById('logNote');
      const urgent = symptoms.some((s) => { const d = SYMPTOMS.find((x) => x.id === s); return d && d.flag; });
      p.logs.push({ date: todayKey(), symptoms, note: note ? note.value.trim() : '', urgent });
      save();
      protoOpen = null;
      protoUrgent = urgent;
      render();
      break;
    }
    case 'proto-export': exportProtocolReport(); break;
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
      if (id === '5h') { showNudge('Every-5-hours reminders unlock with Premium — you can switch in Profile later.'); break; }
      ob.remMode = id; renderOnboarding(); break;
    }
    case 'ob-finish': finishOnboarding(); break;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'setTime') { S.reminders.time = e.target.value || '08:00'; save(); }
  if (e.target.id === 'importFile' && e.target.files && e.target.files[0]) {
    importDataFile(e.target.files[0]);
    e.target.value = '';
  }
});

function wireAfterRender() {
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

function exportData() {
  download(`arc90-data-${todayKey()}.json`, JSON.stringify(S, null, 2), 'application/json');
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
      <stop offset="0" stop-color="#07080c"/>
      <stop offset="0.58" stop-color="#0d1718"/>
      <stop offset="1" stop-color="#152014"/>
    </linearGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#64d8c0"/>
      <stop offset="1" stop-color="#2f7df6"/>
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f7df6"/>
      <stop offset="0.55" stop-color="#20c5a5"/>
      <stop offset="1" stop-color="#f2b84b"/>
    </linearGradient>
    <style>
      .label{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#8f97ab;font-size:28px;font-weight:800;letter-spacing:5px}
      .title{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#eef1f8;font-size:56px;font-weight:900}
      .body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#b7becf;font-size:30px;font-weight:650}
      .metric{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#eef1f8;font-size:62px;font-weight:900}
      .small{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#8f97ab;font-size:24px;font-weight:750}
      .tiny{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#657086;font-size:18px;font-weight:850;letter-spacing:2px}
    </style>
  </defs>
  <rect width="1080" height="1350" fill="url(#bgGrad)"/>
  <circle cx="930" cy="90" r="260" fill="#20c5a5" opacity="0.12"/>
  <circle cx="100" cy="1240" r="280" fill="#f2b84b" opacity="0.10"/>
  <rect x="70" y="70" width="940" height="1210" rx="58" fill="#0f1118" opacity="0.88" stroke="#ffffff" stroke-opacity="0.08"/>

  <text x="120" y="150" class="label">ARC90</text>
  <text x="120" y="238" class="title">${esc(compactText(S.profile.name || 'My progress', 24))} · Day ${dayNumber()}</text>
  <text x="120" y="292" class="body">${esc(compactText(S.profile.goal || 'Building the next 90 days', 48))}</text>

  <circle cx="540" cy="500" r="142" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="28"/>
  <circle cx="540" cy="500" r="142" fill="none" stroke="url(#ring)" stroke-width="28" stroke-linecap="round"
    stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 540 500)"/>
  <text x="540" y="492" text-anchor="middle" class="metric">${momentum()}%</text>
  <text x="540" y="538" text-anchor="middle" class="small">Momentum Score</text>

  <rect x="125" y="695" width="250" height="126" rx="30" fill="#151823" stroke="#ffffff" stroke-opacity="0.06"/>
  <text x="250" y="758" text-anchor="middle" class="metric">${w.pct}%</text>
  <text x="250" y="796" text-anchor="middle" class="small">this week</text>
  <rect x="415" y="695" width="250" height="126" rx="30" fill="#151823" stroke="#ffffff" stroke-opacity="0.06"/>
  <text x="540" y="758" text-anchor="middle" class="metric">${totalReps()}</text>
  <text x="540" y="796" text-anchor="middle" class="small">votes cast</text>
  <rect x="705" y="695" width="250" height="126" rx="30" fill="#151823" stroke="#ffffff" stroke-opacity="0.06"/>
  <text x="830" y="758" text-anchor="middle" class="metric">${bestStreak()}</text>
  <text x="830" y="796" text-anchor="middle" class="small">best streak</text>

  ${bars}

  <rect x="120" y="1010" width="840" height="92" rx="28" fill="#151823" stroke="#ffffff" stroke-opacity="0.06"/>
  <text x="160" y="1066" class="body">Anchor: ${esc(compactText(anchor, 34))}</text>
  <rect x="120" y="1126" width="840" height="92" rx="28" fill="#151823" stroke="#ffffff" stroke-opacity="0.06"/>
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
    lines.push('', `PROTOCOL: ${p.name}`, `Type: ${t ? t.label : p.type} · Frequency: ${p.freq} · Reminder: ${p.time}`);
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
  const colors = ['#2f7df6', '#20c5a5', '#f2b84b', '#f2f4f8', '#34d39b'];
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

function showNudge(text) {
  document.querySelector('.nudge')?.remove();
  const div = document.createElement('div');
  div.className = 'nudge';
  div.innerHTML = `<span class="ne">◔</span><span class="nt">${esc(text)}</span><button class="nx" data-act="nudge-x">✕</button>`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 9000);
}

function nudgeText() {
  const act = actionable(todayKey());
  const left = Math.max(0, act.length - act.filter((h) => isCompleted(h.id, todayKey())).length);
  const msg = NUDGES[(dayNumber() + left) % NUDGES.length];
  return msg.replaceAll('{day}', dayNumber()).replaceAll('{left}', left).replaceAll('{s}', left === 1 ? '' : 's');
}

function reminderSlots() {
  if (S.reminders.mode === 'daily') return [S.reminders.time || '08:00'];
  if (S.reminders.mode === '5h' && S.premium) return ['09:00', '14:00', '19:00'];
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
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Arc90', { body: text, icon: 'icons/icon-180.png' }); } catch (e) { /* in-app only */ }
      }
      showNudge(text);
      break;
    }
  }
}

setInterval(checkReminders, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); checkReminders(); } });

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
  }
  S.log[todayKey()] = { done: S.habits.slice(0, 2).map((h) => h.id), min: [], skip: [] };
  save(); render();
  return `seeded ${days} days (premium: ${premium})`;
};
window.__reset = function () { localStorage.removeItem(KEY); location.reload(); };

/* ---------------- boot ---------------- */

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

applyTheme();
render();

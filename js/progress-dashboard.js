'use strict';

let dashboardPeriod = 7;
let dashboardFocus = '';
let dashboardFocusMode = 'chart';
let dashboardMoreOpen = false;
let dashboardDayKey = '';
const CHART_GLOW = false;

function dashboardRows(days, offset = 0) {
  let end = new Date(todayKey() + 'T12:00:00');
  if (days === 7) days = (end.getDay() + 6) % 7 + 1;
  if (days === 90) {
    const arcEnd = addDays(startDate(), 89);
    if (arcEnd < end) end = arcEnd;
  }
  return Array.from({ length: days }, (_, i) => dashboardDay(addDays(end, i - days + 1 - offset)));
}

function dashboardHabitDue(habit, key) {
  const status = statusOf(habit.id, key);
  const recorded = S.log[key]?.scheduledIds;
  const scheduled = Array.isArray(recorded) && key !== todayKey()
    ? recorded.map(String).includes(String(habit.id))
    : scheduledFor(habit, key);
  return status !== 'skip' && (scheduled || status === 'done' || status === 'min');
}

function dashboardFeelScore(log) {
  const scores = { energized: 5, better: 4, calm: 4, same: 3, drained: 1 };
  const recorded = Object.values(log.feels || {}).filter(value => Object.hasOwn(scores, value));
  return recorded.length ? recorded.reduce((sum, value) => sum + scores[value], 0) / recorded.length : null;
}

function dashboardStats(rows) {
  const known = rows.filter(r => r.inArc);
  const planned = known.reduce((n, r) => n + r.planned, 0);
  const completed = known.reduce((n, r) => n + r.completed, 0);
  const weekday = Array.from({ length: 7 }, (_, index) => {
    const days = known.filter(r => (r.date.getDay() + 6) % 7 === index);
    const due = days.reduce((n, r) => n + r.planned, 0);
    const done = days.reduce((n, r) => n + r.completed, 0);
    return { label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index], due, done, rate: due ? done / due : null };
  });
  const hours = Array.from({ length: 24 }, (_, hour) => known.reduce((n, r) => n + r.hours.filter(h => h === hour).length, 0));
  return { known, planned, completed, rate: planned ? completed / planned : null, weekday, hours };
}

function dashboardCard(id, title, value, chart, insight, action, extra = '') {
  return `<section class="pd-card ${extra}" aria-labelledby="pd-${id}"><div class="pd-head"><h2 id="pd-${id}">${title}</h2><button data-dashboard-act="focus" data-id="${id}" aria-label="Open ${title} details" title="Details">${ICONS.expand || '↗'}</button></div><div class="pd-value">${value}</div>${chart}<p class="pd-insight">${insight}</p>${action || ''}</section>`;
}

function dashboardRing(value, label = 'scheduled reps kept', score = false) {
  const pct = value === null ? 0 : Math.round(value * 100);
  return `<div class="pd-ring" role="img" aria-label="${value === null ? 'No planned reps in this period' : score ? `${label} ${pct} of 100` : `${pct} percent ${label}`}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="pd-ring-track" cx="60" cy="60" r="48"/><circle class="pd-ring-fill" cx="60" cy="60" r="48" pathLength="100" stroke-dasharray="${pct} 100"/></svg><strong data-count-to="${pct}"${score ? ' data-count-suffix=""' : ''}>${value === null ? '—' : score ? pct : pct + '%'}</strong>${score ? '<small>of 100</small>' : ''}</div>`;
}

function dashboardHeatmap(rows) {
  const start = startDate();
  const lookup = new Map(rows.map(r => [r.key, r]));
  const cells = Array.from({ length: 90 }, (_, i) => {
    const date = addDays(start, i), key = dkey(date);
    const r = lookup.get(key) || dashboardDay(date);
    const future = key > todayKey();
    const missed = key < todayKey() && !!r?.planned && !r.completed;
    const intensity = !r?.planned || !r.completed ? 0 : Math.min(5, Math.max(1, Math.ceil(r.pct * 5)));
    const label = future ? 'upcoming' : !r?.planned ? 'no scheduled habits' : `${r.completed} of ${r.planned} reps`;
    const x = Math.floor(i / 7) * 18, y = (i % 7) * 18;
    return `<rect class="pd-cell pd-intensity-${intensity}${future ? ' pd-future' : ''}${key === todayKey() ? ' pd-today' : ''}" style="--cell-step:${Math.floor(i / 7) + i % 7}" x="${x}" y="${y}" width="14" height="14" rx="3"><title>Day ${i + 1}, ${key}: ${label}</title></rect>${missed ? `<circle class="pd-missed-dot" cx="${x + 7}" cy="${y + 7}" r="1.5" aria-hidden="true"/>` : ''}`;
  }).join('');
  return `<div class="pd-heat-scroll"><svg class="pd-heat" viewBox="0 0 248 122" role="img" aria-label="90-day arc: each square shows daily habit completion">${cells}</svg></div><div class="pd-heat-legend" aria-hidden="true"><span>Less</span>${[0, 1, 2, 3, 4, 5].map(n => `<i class="pd-intensity-${n}"></i>`).join('')}<span>More</span></div>`;
}

function dashboardDay(date) {
  const key = dkey(date), log = dlog(key);
  const inArc = date >= startDate() && key <= todayKey();
  const recorded = S.log[key]?.scheduledIds;
  const scheduledIds = !inArc ? [] : Array.isArray(recorded) && key !== todayKey()
    ? recorded.map(String)
    : S.habits.filter(h => dashboardHabitDue(h, key)).map(h => String(h.id));
  const skipped = new Set((log.skip || []).map(String));
  const completedSet = new Set([...(log.done || []), ...(log.min || [])].map(String));
  const dueIds = [...new Set([...scheduledIds, ...completedSet])].filter(id => !skipped.has(id));
  const planned = dueIds.length, completed = dueIds.filter(id => completedSet.has(id)).length;
  const completedIds = new Set(dueIds.filter(id => completedSet.has(id)));
  return { date, key, inArc, planned, completed, pct: planned ? completed / planned : null,
    feel: dashboardFeelScore({ feels: Object.fromEntries(Object.entries(log.feels || {}).filter(([id]) => completedIds.has(id))) }), energy: Number(log.energy) || 0,
    hours: Object.entries(log.completionHours || {}).filter(([id, hour]) => completedIds.has(id) && Number.isInteger(hour) && hour >= 0 && hour < 24).map(([, hour]) => hour) };
}

function dashboardBars(rows) {
  const best = rows.filter(r => r.done > 0).sort((a, b) => b.rate - a.rate)[0];
  return `<div class="pd-bars" role="img" aria-label="Weekly completion: ${rows.map((r, i) => `${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]} ${r.rate === null ? 'no planned reps' : `${Math.round(r.rate * 100)} percent`}`).join(', ')}">${rows.map((r, i) => `<div class="${r === best ? 'pd-best' : ''}"><i style="height:${r.rate === null ? 58 : Math.max(3, r.rate * 100)}%;--i:${i}" class="${r.rate === null ? 'pd-empty-bar' : ''}"></i><span>${r.label}</span></div>`).join('')}</div>`;
}

function dashboardLine(rows, key, max = 1) {
  const points = rows.map((r, i) => ({ i, value: r[key] })).filter(p => p.value !== null && Number.isFinite(p.value));
  if (points.length < 2) return '<div class="pd-ghost">Keep checking in to reveal your trend.</div>';
  const x = i => 10 + 300 * i / Math.max(1, rows.length - 1);
  const y = v => 88 - 72 * Math.max(0, Math.min(1, v / max));
  const path = points.map((p, i) => `${!i || p.i !== points[i - 1].i + 1 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  return `<svg class="pd-line" viewBox="0 0 320 104" role="img" aria-label="${key === 'feel' ? 'Post-habit feeling' : 'Daily completion'} trend over ${rows.length} days"><path class="pd-grid-line" d="M10 88H310"/><path class="pd-line-stroke" d="${path}" fill="none"${CHART_GLOW ? ' filter="url(#chart-glow)"' : ''}/>${points.map(p => `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" class="pd-point"><title>${rows[p.i].key}: ${key === 'feel' ? p.value.toFixed(1) + ' of 5' : Math.round(p.value * 100) + '%'}</title></circle>`).join('')}</svg>`;
}

function dashboardConsistency(rows) {
  const recent = rows.slice(-14);
  return `<div class="pd-habits">${S.habits.map(h => {
    const due = rows.filter(r => r.inArc && dashboardHabitDue(h, r.key));
    const done = due.filter(r => isCompleted(h.id, r.key)).length;
    const rate = due.length ? Math.round(done / due.length * 100) : null;
    return `<div><span>${esc(h.name)}</span><div class="pd-dots" aria-hidden="true">${recent.map(r => `<i class="${r.inArc && isCompleted(h.id, r.key) ? 'done' : dashboardHabitDue(h, r.key) && r.inArc ? 'missed' : 'rest'}"></i>`).join('')}</div><b>${rate === null ? '—' : rate + '%'}</b></div>`;
  }).join('') || '<p>Add a habit to see consistency.</p>'}</div>`;
}

function dashboardClock(hours) {
  const total = hours.reduce((a, b) => a + b, 0);
  if (!total) return '<div class="pd-ghost">Check off a habit to see when you show up.</div>';
  const center = 64;
  return `<svg class="pd-clock" viewBox="0 0 128 128" role="img" aria-label="Habit check-offs by hour: ${hours.map((n, h) => n ? `${h}:00 ${n}` : '').filter(Boolean).join(', ')}"><circle cx="64" cy="64" r="47" class="pd-grid-line"/>${hours.map((n, h) => { const angle = (h / 24) * Math.PI * 2 - Math.PI / 2; const inner = 25, outer = 30 + 28 * n / Math.max(...hours); return `<line x1="${(center + inner * Math.cos(angle)).toFixed(1)}" y1="${(center + inner * Math.sin(angle)).toFixed(1)}" x2="${(center + outer * Math.cos(angle)).toFixed(1)}" y2="${(center + outer * Math.sin(angle)).toFixed(1)}" class="${n ? 'pd-hour' : 'pd-hour-empty'}"/>`; }).join('')}<text x="64" y="68" text-anchor="middle">${total}</text></svg>`;
}

function dashboardAreaScores(rows) {
  return Object.keys(LIFE_AREAS).map(area => {
    const habits = S.habits.filter(h => habitPurpose(h).find(goal => goal.life_area)?.life_area === area || (!habitPurpose(h).some(goal => goal.life_area) && h.life_area === area));
    const planned = rows.filter(r => r.inArc).reduce((sum, r) => sum + habits.filter(h => dashboardHabitDue(h, r.key)).length, 0);
    const completed = rows.filter(r => r.inArc).reduce((sum, r) => sum + habits.filter(h => dashboardHabitDue(h, r.key) && isCompleted(h.id, r.key)).length, 0);
    return { area, planned, completed, rate: planned ? completed / planned : 0 };
  });
}

function dashboardRadarPath(values, smooth = true) {
  const points = values.map((value, i) => {
    const angle = i * Math.PI * 2 / values.length - Math.PI / 2;
    return [110 + Math.cos(angle) * 61 * value, 87 + Math.sin(angle) * 61 * value];
  });
  if (smooth && typeof d3 !== 'undefined' && d3.line) return d3.line().curve(d3.curveCardinalClosed.tension(.5))(points);
  return points.map((point, i) => `${i ? 'L' : 'M'}${point.map(n => n.toFixed(1)).join(' ')}`).join(' ') + 'Z';
}

function dashboardRadar(current, previous) {
  const point = (value, i) => {
    const angle = i * Math.PI * 2 / current.length - Math.PI / 2;
    return [110 + Math.cos(angle) * 61 * value, 87 + Math.sin(angle) * 61 * value];
  };
  const labels = current.map((item, i) => {
    const [x, y] = point(1.22, i);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${x < 85 ? 'end' : x > 135 ? 'start' : 'middle'}">${esc(LIFE_AREAS[item.area].replace(' / school', ''))}</text>`;
  }).join('');
  if (!current.some(area => area.planned)) return `<div class="pd-radar-wrap pd-radar-empty"><svg class="pd-radar" viewBox="0 0 220 180" role="img" aria-label="Life balance chart waiting for assigned habit areas"><path class="pd-radar-grid" d="${dashboardRadarPath(current.map(() => .5), false)}"/><path class="pd-radar-grid" d="${dashboardRadarPath(current.map(() => 1), false)}"/>${current.map((_, i) => { const [x, y] = point(1, i); return `<path class="pd-radar-grid" d="M110 87L${x.toFixed(1)} ${y.toFixed(1)}"/>`; }).join('')}${labels}</svg></div>`;
  return `<div class="pd-radar-wrap"><svg class="pd-radar" viewBox="0 0 220 180" role="img" aria-label="Life balance: ${current.map(item => `${LIFE_AREAS[item.area]} ${item.planned ? Math.round(item.rate * 100) + ' percent' : 'no habits'}`).join(', ')}"><path class="pd-radar-grid" d="${dashboardRadarPath(current.map(() => .5), false)}"/><path class="pd-radar-grid" d="${dashboardRadarPath(current.map(() => 1), false)}"/>${previous.some(item => item.planned) ? `<path class="pd-radar-previous" d="${dashboardRadarPath(previous.map(item => item.rate))}"/>` : ''}<path class="pd-radar-current" data-radar-values="${esc(JSON.stringify(current.map(item => item.rate)))}" d="${dashboardRadarPath(current.map(item => item.rate))}"/>${labels}</svg><div class="pd-radar-legend"><span>Current</span>${previous.some(item => item.planned) ? '<span>Previous</span>' : ''}</div></div>`;
}

function dashboardSpan(rows) {
  const inArc = rows.filter(r => r.inArc);
  return inArc.length ? inArc : rows;
}

function dashboardPurpose(rows, prefix = 'pd-purpose') {
  const span = dashboardSpan(rows);
  const data = Arc90Brain.alignment({ goals: S.brain.goals, habits: S.habits, tasks: S.tasks, log: S.log, start: span[0].key, end: span[span.length - 1].key });
  if (!data.nodes.some(node => node.kind === 'goal')) return { data, chart: '<div class="pd-ghost">Build a goal in Arc to reveal your purpose flow.</div>' };
  return { data, chart: Arc90PurposeChart.render(data, prefix) };
}

function dashboardGoalProgress(rows) {
  const goals = S.brain.goals.filter(goal => goal.status === 'active').map(goal => {
    const linked = S.habits.filter(habit => habitPurpose(habit).some(parent => parent.id === goal.id));
    const planned = rows.filter(row => row.inArc).reduce((sum, row) => sum + linked.filter(habit => dashboardHabitDue(habit, row.key)).length, 0);
    const done = rows.filter(row => row.inArc).reduce((sum, row) => sum + linked.filter(habit => dashboardHabitDue(habit, row.key) && isCompleted(habit.id, row.key)).length, 0);
    return { id: goal.id, title: goal.title, planned, done, habits: linked.length, rate: planned ? done / planned : null };
  }).sort((a, b) => b.planned - a.planned || a.title.localeCompare(b.title));
  if (!goals.length) return { goals, chart: '<div class="pd-ghost">Add a goal in Arc to track the work feeding it.</div>' };
  const chart = `<div class="pd-goals" role="img" aria-label="Goal-linked habit completion in this period">${goals.slice(0, 5).map(goal => `<div class="pd-goal-row"><div><span>${esc(goal.title)}</span><b>${goal.planned ? `${goal.done}/${goal.planned}` : 'No reps'}</b></div><div class="pd-goal-track"><i style="width:${goal.rate === null ? 0 : Math.round(goal.rate * 100)}%"></i></div></div>`).join('')}${goals.length > 5 ? `<p>${goals.length - 5} more goals in the detail view</p>` : ''}</div>`;
  return { goals, chart };
}

function dashboardArcCompare() {
  const days = Math.max(0, Math.min(90, dayNumber()));
  const start = startDate();
  const window = shift => Array.from({ length: days }, (_, i) => {
    const key = dkey(addDays(start, i + shift));
    return S.log[key]?.scheduledIds ? historicalRateFor(key) : null;
  });
  const currentWindow = window(0), previousWindow = window(-90);
  const pairs = currentWindow.map((value, i) => [value, previousWindow[i]])
    .filter(pair => pair.every(value => value !== null && Number.isFinite(value)));
  const current = pairs.map(pair => pair[0]), previous = pairs.map(pair => pair[1]);
  if (current.length < 7 || previous.length < 7) return { current, previous, chart: `<div class="pd-ghost">Compare arcs after 7 logged days in each cycle. Current: ${current.length}/7 · Previous: ${previous.length}/7.</div>` };
  const average = values => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100);
  const scores = [{ label: 'This arc', value: average(current) }, { label: 'Previous arc', value: average(previous) }];
  return { current, previous, scores, chart: `<div class="pd-goals" role="img" aria-label="Arc comparison based on recorded daily completion rates">${scores.map(item => `<div class="pd-goal-row"><div><span>${item.label}</span><b>${item.value}%</b></div><div class="pd-goal-track"><i style="width:${item.value}%"></i></div></div>`).join('')}</div>` };
}

function dashboardStoryData(rows, stats) {
  const shareNames = S.preferences?.shareNames === true;
  const habitRows = S.habits.map((habit, index) => {
    const due = rows.filter(row => row.inArc && dashboardHabitDue(habit, row.key));
    const done = due.filter(row => isCompleted(habit.id, row.key)).length;
    return { name: shareNames ? habit.name : `Habit ${index + 1}`, done, due: due.length };
  }).filter(habit => habit.due);
  const byRate = (a, b) => b.done / b.due - a.done / a.due;
  const ranked = [...habitRows].sort(byRate);
  const habits = ranked.length > 1 ? [ranked[0], ranked.at(-1)] : ranked;
  const weekdays = stats.weekday.filter(day => day.due);
  const best = [...weekdays].sort((a, b) => b.rate - a.rate)[0];
  const worst = [...weekdays].sort((a, b) => a.rate - b.rate)[0];
  const areas = dashboardAreaScores(rows).filter(area => area.planned)
    .map(area => ({ name: LIFE_AREAS[area.area], done: area.completed, due: area.planned }));
  const purpose = dashboardPurpose(rows).data;
  const insight = purpose.orphanHabits > 0
    ? { text: `${purpose.orphanHabits} habits are not linked to a goal.`, action: 'Link one in Arc' }
    : stats.rate !== null && stats.rate < .5
      ? { text: `${Math.round(stats.rate * 100)}% of planned reps were kept.`, action: 'Try the minimum version today' }
      : stats.planned ? { text: `${stats.completed} of ${stats.planned} planned reps were kept.`, action: 'Keep the next rep small' }
        : { text: 'No planned reps recorded in this period.', action: 'Add a habit in Arc' };
  return { title: 'My arc', period: `${rows[0].key} to ${rows[rows.length - 1].key}`,
    day: dayNumber(), done: stats.completed, due: stats.planned,
    goal: shareNames ? S.profile.goal : '', habits, areas,
    rhythm: best && worst ? { best: { name: best.label, done: best.done, due: best.due }, worst: { name: worst.label, done: worst.done, due: worst.due } } : null,
    purpose: purpose.total ? { score: purpose.score, orphanHabits: purpose.orphanHabits, activeGoals: purpose.activeGoals } : null,
    insight, shareSensitive: shareNames };
}

function dashboardTools() {
  return `<button class="pd-story-button" data-act="more-toggle" aria-label="Open Lab" aria-expanded="${moreOpen}"${moreOpen ? ' aria-controls="tools-menu"' : ''}>${ICONS.more}<span>Lab</span></button>`;
}

function dashboardInsights(rows, previousRows, stats, areas) {
  if (typeof Arc90Insights === 'undefined') return '';
  const habitStats = (habit, window) => {
    const due = window.filter(row => row.inArc && dashboardHabitDue(habit, row.key));
    return { planned: due.length, rate: due.length ? due.filter(row => isCompleted(habit.id, row.key)).length / due.length : 0 };
  };
  const insights = Arc90Insights.generate({
    days: stats.known.length,
    weekday: stats.weekday.map((day, i) => ({ ...day, label: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i] })),
    hours: stats.hours,
    areas: areas.map(area => ({ ...area, label: LIFE_AREAS[area.area] })),
    habits: S.habits.map(habit => {
      const current = habitStats(habit, rows), previous = habitStats(habit, previousRows);
      return { id: habit.id, name: habit.name, currentPlanned: current.planned, currentRate: current.rate, previousPlanned: previous.planned, previousRate: previous.rate };
    })
  });
  const measuredDays = stats.known.filter(day => day.planned).length;
  const strongest = measuredDays >= 3 ? [...stats.weekday].filter(day => day.due && day.done > 0).sort((a, b) => b.rate - a.rate)[0] : null;
  const fallback = strongest && !insights.length
    ? `<p>${esc(strongest.label)} was your strongest day: ${strongest.done} of ${strongest.due} planned reps.</p>`
    : '';
  return `<section class="pd-observations pd-panel" aria-labelledby="pd-insights"><header class="pd-panel-head"><h2 id="pd-insights">Insights</h2></header>${insights.length
    ? insights.map(item => `<div><p>${esc(item.text)}</p><button class="pd-next" data-act="tab" data-id="${esc(item.action.tab)}">${esc(item.action.label)}</button></div>`).join('')
    : fallback ? `<div>${fallback}</div>` : '<div class="pd-insights-empty"><strong>Patterns need time</strong><p>Keep a few days of reps. Your first useful observation will appear here.</p></div>'}</section>`;
}

function dashboardPanel(id, title, meta, body, extra = '') {
  return `<section class="pd-panel ${extra}" aria-labelledby="pd-${id}"><header class="pd-panel-head"><h2 id="pd-${id}">${title}</h2><div>${meta ? `<span>${meta}</span>` : ''}<button data-dashboard-act="focus" data-id="${id}" aria-label="Open ${title} details" title="Details">${ICONS.expand || '↗'}</button></div></header>${body}</section>`;
}

function dashboardShortDate(key) {
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Daily reps against the plan: a soft capsule for planned reps, a solid capsule for kept reps.
function dashboardDaily(rows) {
  const days = rows.filter(r => r.inArc);
  if (!days.some(r => r.planned || r.completed)) return '<div class="pd-ghost">Your daily reps will chart here after your first check-in.</div>';
  const max = Math.max(1, ...rows.map(r => Math.max(r.planned, r.completed)));
  const step = 320 / rows.length, w = Math.max(3, Math.min(20, step * .58)), radius = Math.min(4, w / 2);
  const scale = value => value / max * 88;
  const bars = rows.map((r, i) => {
    const x = (i * step + (step - w) / 2).toFixed(1), track = scale(r.planned), kept = scale(r.completed);
    const label = !r.inArc ? 'outside your arc' : r.planned ? `${r.completed} of ${r.planned} reps` : 'nothing scheduled';
    return `<g class="pd-day${r.key === todayKey() ? ' pd-day-today' : ''}${r.key === dashboardDayKey ? ' pd-day-selected' : ''}" style="--i:${i}" data-dashboard-act="day" data-id="${r.key}" role="button" tabindex="0" aria-pressed="${r.key === dashboardDayKey}" aria-label="${dashboardShortDate(r.key)}: ${label}"><rect class="pd-day-hit" x="${(i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="100"/>${track ? `<rect class="pd-day-track" x="${x}" y="${(96 - track).toFixed(1)}" width="${w.toFixed(1)}" height="${track.toFixed(1)}" rx="${radius}"/>` : `<rect class="pd-day-empty" x="${x}" y="94" width="${w.toFixed(1)}" height="2" rx="1"/>`}${kept ? `<rect class="pd-day-kept" x="${x}" y="${(96 - kept).toFixed(1)}" width="${w.toFixed(1)}" height="${kept.toFixed(1)}" rx="${radius}" fill="url(#pdKept)"/>` : ''}<title>${r.key}: ${label}</title></g>`;
  }).join('');
  const measured = days.filter(r => r.planned);
  const average = measured.length ? measured.reduce((sum, r) => sum + r.completed, 0) / measured.length : 0;
  const avgY = (96 - scale(average)).toFixed(1);
  const ticks = [0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    .map((i, n, all) => `<text x="${(i * step + step / 2).toFixed(1)}" y="114" text-anchor="${n === 0 && all.length > 1 ? 'start' : n === all.length - 1 && all.length > 1 ? 'end' : 'middle'}">${dashboardShortDate(rows[i].key)}</text>`).join('');
  return `<svg class="pd-daily" viewBox="0 0 320 118" role="img" aria-label="Reps kept each day, average ${average.toFixed(1)}: ${days.map(r => `${r.key} ${r.completed} of ${r.planned}`).join(', ')}"><defs><linearGradient id="pdKept" x1="0" x2="0" y1="0" y2="1"><stop stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".55"/></linearGradient></defs><path class="pd-grid-line" d="M0 96.5H320"/>${bars}${average ? `<path class="pd-avg-line" d="M0 ${avgY}H320"><title>Average ${average.toFixed(1)} reps a day</title></path>` : ''}${ticks}</svg>`;
}

// One day, opened from the daily chart: which habits were kept, and what was planned.
function dashboardDayDetail(rows) {
  const row = rows.find(r => r.key === dashboardDayKey);
  if (!row) return `<p class="pd-day-hint">Tap a day to see what you kept.</p>`;
  const log = dlog(row.key), done = new Set([...(log.done || [])].map(String)), min = new Set([...(log.min || [])].map(String)), skip = new Set([...(log.skip || [])].map(String));
  const habits = S.habits.filter(h => done.has(String(h.id)) || min.has(String(h.id)) || skip.has(String(h.id)) || dashboardHabitDue(h, row.key));
  const state = h => done.has(String(h.id)) ? ['done', 'Kept'] : min.has(String(h.id)) ? ['min', 'Minimum'] : skip.has(String(h.id)) ? ['rest', 'Rest'] : row.key < todayKey() ? ['missed', 'Missed'] : ['open', 'Open'];
  const title = new Date(row.key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return `<div class="pd-day-detail" role="status"><header><strong>${esc(title)}</strong><span>${row.planned ? `${row.completed} of ${row.planned} reps` : 'Nothing scheduled'}</span><button data-dashboard-act="day" data-id="${row.key}" aria-label="Close day details">×</button></header>${habits.length ? `<ul>${habits.map(h => { const [cls, text] = state(h); return `<li class="pd-state-${cls}"><i aria-hidden="true"></i><span>${esc(h.name)}</span><b>${text}</b></li>`; }).join('')}</ul>` : ''}</div>`;
}

// Share of completed reps by top-level goal, colored to match the Arc flow.
function dashboardShare(rows) {
  const data = dashboardPurpose(rows).data;
  if (!data.total || typeof brainFlow !== 'function') return { data, chart: '<div class="pd-ghost">Complete a rep to see which goals it feeds.</div>' };
  const parts = brainFlow(data).purpose.filter(p => p.value > 0);
  let angle = -Math.PI / 2;
  const arcs = parts.map(p => {
    const sweep = p.value / data.total * Math.PI * 2, end = angle + sweep - (parts.length > 1 ? Math.min(.22, sweep * .4) : 0);
    const point = a => `${(60 + 50 * Math.cos(a)).toFixed(2)} ${(60 + 50 * Math.sin(a)).toFixed(2)}`;
    const d = parts.length === 1 ? 'M60 10A50 50 0 1 1 59.99 10' : `M${point(angle)}A50 50 0 ${sweep > Math.PI ? 1 : 0} 1 ${point(end)}`;
    angle += sweep;
    return `<path class="${p.id === 'no-purpose' ? 'pd-share-none' : ''}" d="${d}" stroke="${p.tone}" pathLength="100"><title>${esc(p.title)}: ${p.value} reps</title></path>`;
  }).join('');
  const legend = parts.map(p => `<li><button data-dashboard-act="purpose" data-id="${esc(p.id)}" aria-label="Show ${esc(p.title)} on the Arc map"><i class="${p.id === 'no-purpose' ? 'pd-share-none' : ''}" style="background:${p.id === 'no-purpose' ? '' : p.tone}"></i><span>${esc(p.title)}<small>${p.value} ${p.value === 1 ? 'rep' : 'reps'}</small></span><b style="color:${p.id === 'no-purpose' ? 'var(--tx-2)' : p.tone}">${Math.round(p.value / data.total * 100)}%</b></button></li>`).join('');
  return { data, chart: `<div class="pd-share"><svg viewBox="0 0 120 120" role="img" aria-label="Reps by goal: ${parts.map(p => `${p.title} ${p.value}`).join(', ')}"><circle class="pd-share-track" cx="60" cy="60" r="50"/><g class="pd-share-arcs">${arcs}</g><text x="60" y="61" text-anchor="middle">${data.total}</text><text class="pd-share-sub" x="60" y="74" text-anchor="middle">reps</text></svg><ul>${legend}</ul></div>` };
}

function dashboardHabitTiles(rows) {
  if (!S.habits.length) return '<div class="pd-ghost">Add a habit to see each one here.</div>';
  const recent = rows.slice(-14);
  const flow = typeof brainFlow === 'function' ? brainFlow(dashboardPurpose(rows).data) : null;
  const purposeOf = habit => {
    const leaf = flow?.leaves.find(l => l.id === `habit:${habit.id}` || l.id === `orphan:${habit.id}`);
    const root = leaf && flow.purpose.find(p => p.id === leaf.root);
    return root && root.id !== 'no-purpose' ? root : null;
  };
  return `<div class="pd-tiles">${S.habits.map(h => {
    const due = rows.filter(r => r.inArc && dashboardHabitDue(h, r.key));
    const done = due.filter(r => isCompleted(h.id, r.key)).length;
    const rate = due.length ? Math.round(done / due.length * 100) : null;
    const purpose = purposeOf(h);
    return `<button class="pd-tile" data-dashboard-act="habit" data-id="${esc(h.id)}" style="--tone:${purpose ? purpose.tone : 'var(--flow-none)'}" aria-label="${esc(h.name)}: ${rate === null ? 'not scheduled' : `${rate} percent, ${done} of ${due.length}`}. Open details"><span>${esc(h.name)}</span><em class="${purpose ? '' : 'pd-tile-none'}">${purpose ? esc(purpose.title) : 'No goal yet'}</em><strong>${rate === null ? '—' : rate}<small>${rate === null ? 'not scheduled' : `% · ${done}/${due.length}`}</small></strong><div class="pd-spark" aria-hidden="true">${recent.map((r, i) => `<i style="--i:${i}" class="${r.inArc && isCompleted(h.id, r.key) ? 'done' : r.inArc && dashboardHabitDue(h, r.key) ? 'missed' : 'rest'}"></i>`).join('')}</div></button>`;
  }).join('')}</div>`;
}

function viewDashboard() {
  const rows = dashboardRows(dashboardPeriod), stats = dashboardStats(rows);
  const feelings = rows.filter(r => r.feel !== null);
  const previousRows = dashboardRows(dashboardPeriod, dashboardPeriod);
  const previous = dashboardStats(previousRows);
  const areas = dashboardAreaScores(rows);
  const purpose = dashboardPurpose(rows);
  const share = dashboardShare(rows);
  const goalProgress = dashboardGoalProgress(rows);
  const arcCompare = dashboardArcCompare();
  const best = stats.weekday.filter(r => r.done > 0).sort((a, b) => b.rate - a.rate)[0];
  const today = todayCompletion();
  const kept = stats.rate === null ? null : Math.round(stats.rate * 100);
  const change = kept === null || previous.rate === null ? '' : Math.round(stats.rate * 100) - Math.round(previous.rate * 100);
  const span = dashboardSpan(rows);
  const period = `${dashboardShortDate(span[0].key)} – ${dashboardShortDate(span[span.length - 1].key)}`;
  return `${brandbar()}<header class="topbar pd-topbar"><div><h1>Progress</h1><div class="sub">Day ${Math.min(90, dayNumber())} of 90${S.habits.length ? ` · ${period}` : ''}</div></div><div class="pd-header-actions">${dashboardTools()}<button class="pd-story-button" data-dashboard-act="story" aria-label="Share progress story" title="Share progress story">${ICONS.expand || '↗'}</button></div></header>
    <div class="pd-controls" role="group" aria-label="Progress period"${S.habits.length ? '' : ' hidden'}>${[[7,'Week'],[30,'30 days'],[90,'90-day arc']].map(([n,label]) => `<button data-dashboard-act="period" data-id="${n}" aria-pressed="${dashboardPeriod === n}">${label}</button>`).join('')}</div>
    ${!S.habits.length ? `<div class="pd-dash pd-shell"><section class="pd-panel pd-start" aria-labelledby="pd-start"><div class="pd-start-art" aria-hidden="true">${[38, 62, 46, 80, 58, 92, 70].map((h, i) => `<i style="height:${h}%;--i:${i}"></i>`).join('')}</div><h2 id="pd-start">Your progress starts with one habit</h2><p>Add a habit and check it off. This page fills in with your streak, your best days, and which goals your reps feed.</p><div class="pd-start-actions"><button class="btn" data-act="tab" data-id="habits">Add a habit</button><button data-act="tab" data-id="progress">Set a goal in Arc</button></div></section></div>` : `<div class="pd-dash pd-shell">
      <section class="pd-panel pd-summary" aria-labelledby="pd-summary">
        <header class="pd-summary-head"><h2 id="pd-summary">Reps kept</h2><span>${period}</span></header>
        <div class="pd-hero-num"><strong${kept === null ? '' : ` data-count-to="${kept}" data-count-suffix=""`}>${kept === null ? '—' : kept}</strong>${kept === null ? '' : '<small>%</small>'}${change !== '' ? `<b class="pd-delta ${change >= 0 ? 'up' : 'down'}" title="Compared with the previous period">${change >= 0 ? '▲' : '▼'} ${Math.abs(change)} pts</b>` : ''}</div>
        <p class="pd-hero-sub">${stats.planned ? `${stats.completed} of ${stats.planned} planned reps · <span class="pd-avg-key">avg ${(stats.completed / Math.max(1, stats.known.filter(r => r.planned).length)).toFixed(1)} a day</span>` : 'Plan a habit to start your picture.'}</p>
        <div class="pd-summary-chart">${dashboardDaily(dashboardPeriod === 90 ? span : rows)}${stats.planned ? dashboardDayDetail(rows) : ''}</div>
        <div class="pd-kpis">
          <button class="pd-kpi" data-dashboard-act="focus" data-id="momentum" aria-label="Momentum ${momentum()} of 100, open details"><span>Momentum</span><div><svg class="pd-mini-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14"/><circle cx="18" cy="18" r="14" pathLength="100" stroke-dasharray="${momentum()} 100"/></svg><strong>${momentum()}</strong></div></button>
          <div class="pd-kpi"><span>Streak</span><div><strong>${dayStreak()}</strong><small>${dayStreak() === 1 ? 'day' : 'days'}</small></div></div>
          <div class="pd-kpi"><span>Today</span><div><strong>${today.done}</strong><small>/${today.total}</small></div><i class="pd-kpi-meter"><b style="width:${today.total ? Math.round(today.done / today.total * 100) : 0}%"></b></i></div>
        </div>
      </section>
      ${dashboardPanel('share', 'Where reps went', share.data.total ? `${purpose.data.orphanHabits ? `${purpose.data.orphanHabits} unlinked` : 'All linked'}` : '', `${share.chart}<button data-act="tab" data-id="progress" class="pd-next">Open Arc flow</button>`)}
      ${dashboardPanel('habits', 'Habits', `${S.habits.length}`, dashboardHabitTiles(rows))}
      ${dashboardPanel('arc', '90-day arc', `${Math.min(90, dayNumber())}/90`, dashboardHeatmap(dashboardRows(90)))}
      <div class="pd-pair">
        ${dashboardPanel('rhythm', 'Weekly rhythm', best ? `Best: ${best.label}` : '', dashboardBars(stats.weekday))}
        ${dashboardInsights(rows, previousRows, stats, areas)}
      </div>
    </div>`}
    ${S.habits.length ? `<details class="pd-more"${dashboardMoreOpen ? ' open' : ''}><summary><span>More diagrams</span><small>6 charts</small></summary>
      <div class="pd-grid pd-explore">
      ${dashboardCard('balance', 'Life balance', areas.some(area => area.planned) ? `${areas.filter(area => area.completed).length}<small>areas with activity</small>` : '—', dashboardRadar(areas, dashboardAreaScores(previousRows)), areas.some(area => area.planned) ? 'Current period versus the previous one.' : 'No areas assigned yet.', '<button data-act="tab" data-id="habits" class="pd-next">Assign an area</button>', 'pd-wide')}
      ${dashboardCard('goals', 'Goal progress', goalProgress.goals.length ? `${goalProgress.goals.filter(goal => goal.done).length}<small>goals with activity</small>` : '—', goalProgress.chart, goalProgress.goals.length ? 'Completed reps out of planned reps. Outcomes stay yours to define.' : 'Your goals will appear here after you add them.', '<button data-act="tab" data-id="progress" class="pd-next">Review goals</button>', 'pd-wide')}
      ${dashboardCard('compare', 'Arc vs Arc', arcCompare.previous.length >= 7 && arcCompare.current.length >= 7 ? `${arcCompare.current.length}<small>days compared</small>` : '—', arcCompare.chart, arcCompare.previous.length >= 7 && arcCompare.current.length >= 7 ? 'Matched days from each arc with saved schedules.' : 'A second recorded cycle makes this comparison possible.', '', 'pd-wide')}
      ${dashboardCard('trend', 'Completion trend', stats.rate === null ? '—' : `${Math.round(stats.rate * 100)}<small>% kept</small>`, dashboardLine(rows, 'pct'), 'Full and minimum reps as a share of scheduled reps.', '')}
      ${dashboardCard('hours', 'When you show up', stats.hours.some(Boolean) ? `${Math.max(...stats.hours)}<small>at your peak hour</small>` : '—', dashboardClock(stats.hours), 'Only check-offs with recorded times are counted.', '')}
      ${dashboardCard('feel', 'Feel after', feelings.length ? `${(feelings.reduce((n, r) => n + r.feel, 0) / feelings.length).toFixed(1)}<small>/5 daily average</small>` : '—', dashboardLine(rows, 'feel', 5), `${feelings.length} days with post-habit feelings recorded.`, '', 'pd-wide')}
      </div>
    </details>` : ''}${dashboardFocus ? dashboardFocusView(rows, stats) : ''}`;
}

function dashboardFocusView(rows, stats) {
  if (dashboardFocus.startsWith('habit:')) return dashboardHabitFocus(dashboardFocus.slice(6), rows);
  const span = dashboardSpan(rows);
  const titles = { share: 'Where reps went', momentum: 'Momentum', balance: 'Life balance', purpose: 'Purpose flow', goals: 'Goal progress', arc: '90-day arc', compare: 'Arc vs Arc', rhythm: 'Weekly rhythm', trend: 'Completion trend', habits: 'Habit consistency', hours: 'When you show up', feel: 'Feel after' };
  const id = dashboardFocus;
  const chart = id === 'momentum' ? dashboardRing(momentum() / 100, 'Current momentum', true)
    : id === 'balance' ? dashboardRadar(dashboardAreaScores(rows), dashboardAreaScores(dashboardRows(dashboardPeriod, dashboardPeriod)))
    : id === 'share' ? dashboardShare(rows).chart
    : id === 'purpose' ? dashboardPurpose(rows, 'pd-focus-purpose').chart
    : id === 'goals' ? dashboardGoalProgress(rows).chart
    : id === 'arc' ? dashboardHeatmap(dashboardRows(90))
    : id === 'compare' ? dashboardArcCompare().chart
    : id === 'rhythm' ? dashboardBars(stats.weekday)
    : id === 'trend' ? dashboardLine(rows, 'pct')
    : id === 'habits' ? dashboardHabitTiles(rows)
    : id === 'hours' ? dashboardClock(stats.hours)
    : dashboardLine(rows, 'feel', 5);
  const detailRows = id === 'momentum' ? [['Current momentum', `${momentum()} / 100`]]
    : id === 'balance' ? dashboardAreaScores(rows).map(item => [LIFE_AREAS[item.area], item.planned ? `${item.completed}/${item.planned} reps` : 'No habits yet'])
    : id === 'share' ? (typeof brainFlow === 'function' ? brainFlow(dashboardPurpose(rows).data).purpose.map(item => [item.title, `${item.value} reps`]) : [])
    : id === 'purpose' ? dashboardPurpose(rows).data.nodes.map(item => [item.title, `${item.value} completions`])
    : id === 'goals' ? dashboardGoalProgress(rows).goals.map(item => [item.title, item.planned ? `${item.done}/${item.planned} reps` : 'No linked reps'])
    : id === 'compare' ? (dashboardArcCompare().scores || [{ label: 'This arc', value: null }, { label: 'Previous arc', value: null }]).map(item => [item.label, `${item.value === null ? 'Not enough matched days' : item.value + '%'} · ${dashboardArcCompare().current.length} matched days`])
    : id === 'hours' ? stats.hours.map((count, hour) => [`${String(hour).padStart(2, '0')}:00`, `${count} check-offs`])
    : id === 'rhythm' ? stats.weekday.map((day, i) => [['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i], day.due ? `${day.done}/${day.due} reps` : 'No plan'])
    : id === 'habits' ? S.habits.map(h => {
      const due = rows.filter(r => r.inArc && dashboardHabitDue(h, r.key));
      const done = due.filter(r => isCompleted(h.id, r.key)).length;
      return [h.name, due.length ? `${done}/${due.length} reps · ${Math.round(done / due.length * 100)}%` : 'No scheduled reps'];
    })
    : (id === 'arc' ? Array.from({ length: 90 }, (_, i) => dashboardDay(addDays(startDate(), i))) : rows)
      .filter(r => r.inArc).map(r => [dashboardShortDate(r.key), id === 'feel' ? (r.feel !== null ? `${r.feel.toFixed(1)}/5 after a rep` : 'No feeling logged') : r.planned ? `${r.completed}/${r.planned} reps` : 'No plan']);
  const rowLabel = { share: 'Goal', momentum: 'Metric', compare: 'Cycle', balance: 'Area', purpose: 'Item', goals: 'Item', hours: 'Hour', rhythm: 'Day', habits: 'Habit' }[id] || 'Date';
  return `<div class="pd-overlay" role="dialog" aria-modal="true" aria-label="${titles[id]} details"><div class="pd-focus"><div class="pd-focus-head"><h2>${titles[id]}</h2><button data-dashboard-act="close" aria-label="Close details">×</button></div>
    <p>${id === 'momentum' ? `Current · ${esc(dashboardShortDate(todayKey()))}` : id === 'arc' ? `${esc(dashboardShortDate(dkey(startDate())))} – ${esc(dashboardShortDate(dkey(addDays(startDate(), 89))))}` : id === 'compare' ? 'Same relative days in both 90-day cycles' : `${esc(dashboardShortDate(span[0].key))} – ${esc(dashboardShortDate(span[span.length - 1].key))}`}</p>
    <div class="pd-controls" role="group" aria-label="Detail view">${['chart','table'].map(mode => `<button data-dashboard-act="detail-mode" data-id="${mode}" aria-pressed="${dashboardFocusMode === mode}">${mode === 'chart' ? 'Chart' : 'Table'}</button>`).join('')}</div>
    ${dashboardFocusMode === 'chart' ? `<div class="pd-focus-chart" tabindex="0" aria-label="${titles[id]} chart">${chart}</div>` : `<table><thead><tr><th scope="col">${rowLabel}</th><th scope="col">Result</th></tr></thead><tbody>${detailRows.map(([label, value]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')}</tbody></table>`}
  </div></div>`;
}

function dashboardHabitFocus(habitId, rows) {
  const habit = S.habits.find(h => String(h.id) === String(habitId));
  if (!habit) return '<div class="pd-overlay" role="dialog" aria-modal="true" aria-label="Habit details"><div class="pd-focus"><div class="pd-focus-head"><h2>Habit unavailable</h2><button data-dashboard-act="close" aria-label="Close details">×</button></div></div></div>';
  const span = dashboardSpan(rows), due = span.filter(r => dashboardHabitDue(habit, r.key)), done = due.filter(r => isCompleted(habit.id, r.key)).length;
  const flow = typeof brainFlow === 'function' ? brainFlow(dashboardPurpose(rows).data) : null;
  const leaf = flow?.leaves.find(l => l.id === `habit:${habit.id}`), purpose = leaf && flow.purpose.find(p => p.id === leaf.root);
  const cells = span.map(r => { const kept = isCompleted(habit.id, r.key), planned = dashboardHabitDue(habit, r.key); return `<i class="${kept ? 'done' : planned && r.key < todayKey() ? 'missed' : planned ? 'open' : 'rest'}" title="${dashboardShortDate(r.key)}: ${kept ? 'kept' : planned ? (r.key < todayKey() ? 'missed' : 'open') : 'not scheduled'}"></i>`; }).join('');
  return `<div class="pd-overlay" role="dialog" aria-modal="true" aria-label="${esc(habit.name)} details"><div class="pd-focus pd-habit-focus" style="--tone:${purpose ? purpose.tone : 'var(--flow-none)'}"><div class="pd-focus-head"><h2>${esc(habit.name)}</h2><button data-dashboard-act="close" aria-label="Close details">×</button></div>
    <p>${esc(dashboardShortDate(span[0].key))} – ${esc(dashboardShortDate(span[span.length - 1].key))}</p>
    <div class="pd-habit-stat"><strong>${due.length ? Math.round(done / due.length * 100) : '—'}<small>${due.length ? '%' : ''}</small></strong><span>${due.length ? `${done} of ${due.length} scheduled reps kept` : 'Not scheduled in this period'}</span></div>
    <div class="pd-habit-cells" role="img" aria-label="${done} kept days out of ${due.length} scheduled">${cells}</div>
    <div class="pd-habit-goal">${purpose ? `<span><i></i>Feeds <b>${esc(purpose.title)}</b></span><button data-dashboard-act="habit-link" data-id="${esc(habit.id)}">Change goal</button>` : (() => { const suggestion = typeof brainSuggestGoal === 'function' && brainSuggestGoal(habit.name, brainLinkTargets('habit', habit)); return suggestion ? `<span><i class="pd-tile-none"></i>Looks like it feeds <b class="pd-suggest-goal">${esc(brainGoalLabel(suggestion.title))}</b></span><button class="pd-primary" data-brain-act="suggest-link" data-kind="habit" data-id="${esc(habit.id)}" data-goal="${esc(suggestion.id)}">Link it</button>` : `<span><i class="pd-tile-none"></i>Not linked to a goal yet</span><button class="pd-primary" data-dashboard-act="habit-link" data-id="${esc(habit.id)}">Link to a goal</button>`; })()}</div>
  </div></div>`;
}

function closeDashboardFocus() {
  const id = dashboardFocus;
  dashboardFocus = '';
  render();
  [...document.querySelectorAll('[data-dashboard-act="focus"]')]
    .find(button => button.dataset.id === id)?.focus({ preventScroll: true });
}

document.addEventListener('keydown', event => {
  const dialog = document.querySelector('.pd-overlay');
  if (!dialog || !dashboardFocus) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDashboardFocus();
  } else if (event.key === 'Tab') {
    const controls = [...dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]')];
    const first = controls[0], last = controls[controls.length - 1];
    if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }
});

document.addEventListener('click', event => {
  if (event.target.classList.contains('pd-overlay')) { closeDashboardFocus(); return; }
  if (event.target.closest('.pd-more > summary')) dashboardMoreOpen = !document.querySelector('.pd-more').open;
  const button = event.target.closest('[data-dashboard-act]');
  if (!button) return;
  if (button.dataset.dashboardAct === 'period') {
    const previous = JSON.parse(document.querySelector('.pd-card .pd-radar-current')?.dataset.radarValues || 'null');
    dashboardPeriod = Number(button.dataset.id); dashboardDayKey = ''; render();
    const radar = document.querySelector('.pd-card .pd-radar-current');
    if (radar && previous) Arc90Motion.morphPath(radar, previous, JSON.parse(radar.dataset.radarValues), dashboardRadarPath);
  }
  if (button.dataset.dashboardAct === 'story') {
    const rows = dashboardRows(dashboardPeriod);
    Arc90Story.open({ data: dashboardStoryData(rows, dashboardStats(rows)), reducedMotion: Arc90Motion.reduced() });
  }
  if (button.dataset.dashboardAct === 'focus') { dashboardFocus = button.dataset.id; dashboardFocusMode = 'chart'; render(); document.querySelector('.pd-focus-head button')?.focus(); }
  if (button.dataset.dashboardAct === 'detail-mode') { dashboardFocusMode = button.dataset.id === 'table' ? 'table' : 'chart'; render(); document.querySelector(`[data-dashboard-act="detail-mode"][data-id="${dashboardFocusMode}"]`)?.focus(); }
  if (button.dataset.dashboardAct === 'close') closeDashboardFocus();
  if (button.dataset.dashboardAct === 'day') { dashboardDayKey = dashboardDayKey === button.dataset.id ? '' : button.dataset.id; render(); document.querySelector(`.pd-daily [data-id="${button.dataset.id}"]`)?.focus({ preventScroll: true }); }
  if (button.dataset.dashboardAct === 'habit') { dashboardFocus = `habit:${button.dataset.id}`; render(); document.querySelector('.pd-focus-head button')?.focus(); }
  if (button.dataset.dashboardAct === 'habit-link') { dashboardFocus = ''; sheet = { type: 'brain-link', kind: 'habit', itemId: String(button.dataset.id) }; render(); }
  if (button.dataset.dashboardAct === 'purpose') { brainSelected = button.dataset.id; brainView = 'map'; brainMapMode = 'overview'; brainRange = { 7: 'week', 30: 'month', 90: 'arc' }[dashboardPeriod] || 'week'; arcWorkspace = 'map'; switchTab('progress'); }
});
document.addEventListener('keydown', event => {
  if (['Enter', ' '].includes(event.key) && event.target.matches?.('svg [data-dashboard-act]')) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});

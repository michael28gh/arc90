(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Arc90Insights = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const array = x => Array.isArray(x) ? x : [];
  const count = x => Number.isSafeInteger(x) && x >= 0;
  const rate = x => Number.isFinite(x) && x >= 0 && x <= 1;
  const clean = x => typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '';
  const identity = x => clean(x) || (count(x) ? String(x) : '');
  // Allow only floating-point roundoff at inclusive rate thresholds.
  const atLeast = (value, threshold) => value >= threshold - Number.EPSILON;
  const milestones = [7, 14, 30, 60, 90];
  const unassigned = new Set(['unassigned', 'uncategorized', 'none', 'null', 'undefined', 'not set']);

  function generate(input) {
    if (!record(input)) return [];
    const results = [];
    const seen = new Set();
    const add = (id, text, severity, tab, label) => {
      if (seen.has(id)) return;
      seen.add(id);
      results.push({ id, text, severity, action: { tab, label } });
    };
    const days = count(input.days) ? input.days : 0;

    if (days >= 14) {
      const weekdays = array(input.weekday).filter(x => record(x) && clean(x.label) &&
        count(x.due) && x.due >= 4 && count(x.done) && x.done <= x.due && rate(x.rate));
      let low, high;
      for (const day of weekdays) {
        if (!low || day.rate < low.rate) low = day;
        if (!high || day.rate > high.rate) high = day;
      }
      if (low && high && clean(low.label) !== clean(high.label) && atLeast(high.rate - low.rate, 0.30)) {
        add('weekday-gap', clean(low.label) + ' completion is ' +
          Math.round((high.rate - low.rate) * 100) + ' percentage points below ' + clean(high.label) +
          ' in this window.', 'warn', 'habits', 'Review schedule');
      }
    }

    for (const habit of array(input.habits)) {
      if (!record(habit) || !identity(habit.id) || !clean(habit.name)) continue;
      const id = identity(habit.id), name = clean(habit.name);
      if (count(habit.currentPlanned) && habit.currentPlanned >= 7 &&
          count(habit.previousPlanned) && habit.previousPlanned >= 7 &&
          rate(habit.currentRate) && rate(habit.previousRate) &&
          atLeast(habit.previousRate - habit.currentRate, 0.25)) {
        add('habit-drop:' + id, name + ' completion is down ' +
          Math.round((habit.previousRate - habit.currentRate) * 100) +
          ' percentage points from the previous window.', 'warn', 'habits', 'Review habit');
      }
      if (milestones.includes(habit.streak)) {
        add('habit-streak:' + id + ':' + habit.streak, name + ': ' + habit.streak +
          '-day streak.', 'good', 'progress', 'View progress');
      }
    }

    if (days >= 7) {
      for (const area of array(input.areas)) {
        if (!record(area)) continue;
        const key = clean(area.area), label = clean(area.label);
        if (!key || !label || unassigned.has(key.toLowerCase()) ||
            !count(area.planned) || area.planned < 7 || area.completed !== 0) continue;
        add('area-empty:' + key, label + ': no completed reps out of ' + area.planned +
          ' planned in this ' + days + '-day window.', 'warn', 'habits', 'Review habits');
      }
    }

    const hours = input.hours;
    // An incomplete histogram cannot support a truthful proportion.
    if (Array.isArray(hours) && hours.length === 24 &&
        Array.from(hours).every(count)) {
      const total = hours.reduce((sum, n) => sum + n, 0);
      const late = hours.slice(20).reduce((sum, n) => sum + n, 0);
      if (Number.isSafeInteger(total) && total >= 10 && atLeast(late / total, 0.70)) {
        add('late-checkoffs', Math.round(late / total * 100) +
          '% of checkoffs were logged at 20:00 or later.', 'info', 'today', 'View today');
      }
    }

    const priority = { warn: 0, good: 1, info: 2 };
    return results.sort((a, b) => priority[a.severity] - priority[b.severity]).slice(0, 3);
  }

  return { generate };
}));

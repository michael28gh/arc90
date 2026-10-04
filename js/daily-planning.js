(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Arc90Planning = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const object = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const text = (x, max = 2000) => typeof x === 'string' ? x.slice(0, max) : '';
  const validDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x + 'T12:00:00Z')) && new Date(x + 'T12:00:00Z').toISOString().slice(0, 10) === x;
  const entries = (x) => Object.entries(object(x)).filter(([k]) => !['__proto__', 'constructor', 'prototype'].includes(k));
  const dateShift = (date, n) => {
    if (!validDate(date)) throw new Error('Choose a valid date.');
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const nextDate = (date) => dateShift(date, 1);
  const weekStart = (date) => dateShift(date, -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const frictionKey = (x) => text(x, 200).trim().replace(/\s+/g, ' ').toLowerCase();
  function priority(raw) {
    const x = object(raw);
    if (!['habit', 'task'].includes(x.kind) || !['string', 'number'].includes(typeof x.id) || !text(x.key, 400) || !text(x.title, 200).trim()) return null;
    return { key: text(x.key, 400), kind: x.kind, id: String(x.id), title: text(x.title, 200) };
  }
  function normalize(raw) {
    const x = object(raw);
    const result = { days: {}, carry: {}, ideas: [], ideaSeq: 0, responses: {}, weeks: {}, drafts: { morning: {}, night: {} } };
    for (const period of ['morning', 'night']) {
      for (const [date, draft] of entries(object(x.drafts)[period])) {
        if (!validDate(date)) continue;
        const clean = normalize({ days: { [date]: { [period]: draft } } }).days[date]?.[period];
        if (clean) result.drafts[period][date] = { ...clean, ...(period === 'night' ? { remember: object(draft).remember === true } : {}) };
      }
    }
    for (const [date, value] of entries(x.days)) {
      if (!validDate(date)) continue;
      const day = object(value), out = {};
      if (day.morning && typeof day.morning === 'object') {
        const m = object(day.morning), seen = new Set();
        out.morning = { feeling: text(m.feeling, 80), win: text(m.win), savedAt: text(m.savedAt, 80), priorities: (Array.isArray(m.priorities) ? m.priorities : []).map(priority).filter((p) => p && !seen.has(p.key) && seen.add(p.key)).slice(0, 3) };
      }
      if (day.night && typeof day.night === 'object') {
        const n = object(day.night), outcomes = {};
        for (const [key, v] of entries(n.outcomes)) {
          const o = object(v);
          if (['completed', 'partial', 'skipped'].includes(o.status)) outcomes[key] = { status: o.status, next: ['tomorrow', 'smaller', 'drop'].includes(o.next) ? o.next : '', smaller: text(o.smaller, 200) };
        }
        out.night = { feeling: text(n.feeling, 80), helped: text(n.helped), friction: text(n.friction, 200), response: text(n.response), reflection: text(n.reflection, 10000), savedAt: text(n.savedAt, 80), outcomes };
      }
      result.days[date] = out;
    }
    for (const [date, values] of entries(x.carry)) {
      if (!validDate(date) || !Array.isArray(values)) continue;
      const seen = new Set();
      result.carry[date] = values.flatMap((v) => {
        const p = priority(v);
        if (!p || !validDate(v.sourceDate) || !text(v.sourceKey, 400) || nextDate(v.sourceDate) !== date) return [];
        const key = v.sourceDate + ':' + v.sourceKey;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ ...p, sourceDate: v.sourceDate, sourceKey: text(v.sourceKey, 400) }];
      });
    }
    const ideaIds = new Set();
    result.ideas = (Array.isArray(x.ideas) ? x.ideas : []).slice(0, 200).flatMap((v) => {
      const i = object(v), id = Number(i.id);
      if (!Number.isSafeInteger(id) || id < 1 || ideaIds.has(id)) return [];
      ideaIds.add(id);
      return [{ id, title: text(i.title, 200), taskId: typeof i.taskId === 'string' || typeof i.taskId === 'number' ? i.taskId : '' }];
    });
    result.ideaSeq = Math.max(Number.isSafeInteger(x.ideaSeq) && x.ideaSeq >= 0 ? x.ideaSeq : 0, ...result.ideas.map((i) => i.id));
    for (const [, v] of entries(x.responses)) {
      const r = object(v), key = frictionKey(r.friction);
      if (key && !['__proto__', 'constructor', 'prototype'].includes(key) && text(r.response).trim()) result.responses[key] = { friction: text(r.friction, 200), response: text(r.response) };
    }
    for (const [date, v] of entries(x.weeks)) if (validDate(date)) result.weeks[date] = { change: text(object(v).change) };
    return result;
  }
  function routePriority(planning, date, p, next, smaller = '') {
    if (!priority(p) || !['tomorrow', 'smaller', 'drop'].includes(next)) throw new Error('Choose what happens next.');
    if (next === 'smaller' && !text(smaller, 200).trim()) throw new Error('Name the smaller step.');
    const target = nextDate(date);
    planning.carry[target] = (planning.carry[target] || []).filter((v) => !(v.sourceDate === date && v.sourceKey === p.key));
    if (next !== 'drop') planning.carry[target].push({ ...priority(p), key: `carry:${date}:${p.kind}:${p.id}`, title: next === 'smaller' ? text(smaller, 200).trim() : p.title, sourceDate: date, sourceKey: p.key });
  }
  function rememberResponse(planning, friction, response) {
    const key = frictionKey(friction);
    if (!key || ['__proto__', 'constructor', 'prototype'].includes(key) || !text(response).trim()) throw new Error('Add an obstacle and a response to remember.');
    planning.responses[key] = { friction: text(friction, 200).trim(), response: text(response).trim() };
  }
  function addIdeas(planning, value) {
    const lines = text(value, 20000).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.some((line) => line.length > 200)) throw new Error('Keep each idea to 200 characters.');
    if (lines.length > 50 || planning.ideas.length + lines.length > 200) throw new Error('Add up to 50 lines at once, with 200 ideas in total.');
    const added = lines.map((title) => ({ id: ++planning.ideaSeq, title, taskId: '' }));
    planning.ideas.push(...added);
    return added;
  }
  function weekly(planning, end) {
    const start = dateShift(end, -6), accomplishments = [], helpful = [], obstacles = new Map();
    for (const [date, day] of Object.entries(planning.days).sort()) {
      if (date < start || date > end || !day.night?.savedAt) continue;
      const n = day.night;
      for (const p of day.morning?.priorities || []) {
        const status = n.outcomes[p.key]?.status;
        if (status === 'completed' || status === 'partial') accomplishments.push({ date, title: p.title, status });
      }
      const key = frictionKey(n.friction);
      if (key) obstacles.set(key, { friction: n.friction, count: (obstacles.get(key)?.count || 0) + 1 });
      if (n.helped.trim()) helpful.push({ date, text: n.helped });
    }
    return { start, end, accomplishments, helpful, obstacles: [...obstacles.values()].sort((a, b) => b.count - a.count) };
  }
  return { normalize, validDate, nextDate, weekStart, frictionKey, rememberResponse, routePriority, addIdeas, weekly };
}));

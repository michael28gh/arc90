(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Arc90DaySupport = api;
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function capacity(value) {
    return [5, 15, 30, 60].indexOf(value) !== -1 ? value : null;
  }

  function dateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    var date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
  }

  function idKey(value) {
    if (typeof value === 'string') return value.trim();
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  }

  function normalize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var picks = [];
    if (Array.isArray(raw.picks)) raw.picks.forEach(function (value) {
      var id = idKey(value);
      if (id && picks.length < 100 && picks.indexOf(id) === -1) picks.push(id);
    });
    return {
      date: dateKey(raw.date),
      capacity: capacity(raw.capacity),
      friction: ['time', 'energy', 'distractions', 'unsure'].indexOf(raw.friction) !== -1 ? raw.friction : '',
      picks: picks
    };
  }

  function forDay(raw, date) {
    var day = dateKey(date);
    var normalized = normalize(raw);
    return day && normalized.date === day ? normalized : normalize({ date: day });
  }

  function duration(label) {
    // Use the upper bound of ranges and sum compound durations conservatively.
    var pattern = /([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*-\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+)))?\s*-?\s*(minutes?|mins?|hours?|hrs?)\b/gi;
    var match;
    var total = 0;
    var found = false;
    while ((match = pattern.exec(label))) {
      if (match.index > 0 && /[\w.,:+-]/.test(label.charAt(match.index - 1))) return null;
      var first = Number(match[1]);
      var last = match[2] === undefined ? first : Number(match[2]);
      if (first <= 0 || last <= 0 || !Number.isFinite(first) || !Number.isFinite(last)) return null;
      total += Math.max(first, last) * (/^h/i.test(match[3]) ? 60 : 1);
      found = true;
    }
    return Number.isFinite(total) ? { minutes: found ? Math.ceil(total) : 5, estimated: !found } : null;
  }

  function plan(habits, budget) {
    var result = { items: [], total: 0, budget: capacity(budget) || 0 };
    if (!result.budget || !Array.isArray(habits)) return result;
    var seen = Object.create(null);
    habits.forEach(function (h) {
      if (!h || typeof h !== 'object' || result.items.length === 3) return;
      var id = idKey(h.id);
      var name = typeof h.name === 'string' ? h.name.trim() : '';
      var label = typeof h.min === 'string' && h.min.trim() ? h.min.trim() : name;
      if (!id || seen[id] || !label) return;
      seen[id] = true;
      if (/\b(no|avoid|without)\b|\bbefore\s+(bed|sunset)\b/i.test(name + ' ' + label)) return;
      var time = duration(label);
      if (!time || result.total + time.minutes > result.budget) return;
      result.items.push({ id: id, label: label, minutes: time.minutes, estimated: time.estimated });
      result.total += time.minutes;
    });
    return result;
  }

  return { normalize: normalize, forDay: forDay, plan: plan };
}));

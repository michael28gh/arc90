(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Arc90Adaptive = api;
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function modeForDay(plan, date) {
    return plan && plan.date === date &&
      ['full', 'busy', 'recovery'].indexOf(plan.mode) !== -1 ? plan.mode : 'full';
  }

  function targetForHabit(h, mode, essentialIds) {
    h = h && typeof h === 'object' ? h : {};
    var reduced = mode === 'busy' || mode === 'recovery';
    var min = reduced && typeof h.min === 'string' ? h.min.trim() : '';
    return {
      label: min || (typeof h.name === 'string' ? h.name : ''),
      status: min ? 'min' : 'done',
      optional: mode === 'recovery' &&
        (!Array.isArray(essentialIds) || !essentialIds.some(function (id) {
          return String(id) === String(h.id);
        }))
    };
  }

  function validDate(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    var year = Number(date.slice(0, 4));
    var month = Number(date.slice(5, 7));
    var day = Number(date.slice(8, 10));
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }

  function bestWindow(samples) {
    if (!Array.isArray(samples)) return null;
    var dates = Object.create(null);
    samples.forEach(function (sample) {
      if (!sample || !validDate(sample.date) || !Number.isInteger(sample.hour) ||
          sample.hour < 0 || sample.hour > 23) return;
      var bucket = Math.floor(sample.hour / 3);
      if (dates[sample.date] === undefined) dates[sample.date] = bucket;
      else if (dates[sample.date] !== bucket) dates[sample.date] = -1;
    });
    var counts = [0, 0, 0, 0, 0, 0, 0, 0];
    var totalDays = 0;
    Object.keys(dates).forEach(function (date) {
      if (dates[date] < 0) return;
      counts[dates[date]] += 1;
      totalDays += 1;
    });
    var days = Math.max.apply(null, counts);
    var bucket = counts.indexOf(days);
    if (totalDays < 6 || days < 4 || days * 5 < totalDays * 3 ||
        counts.lastIndexOf(days) !== bucket) return null;
    return { startHour: bucket * 3, endHour: bucket * 3 + 3, days: days, totalDays: totalDays };
  }

  function chooseNextMove(items, includeOptional) {
    if (!Array.isArray(items)) return null;
    var pending = items
      .map(function (item, index) { return { item: item, index: index }; })
      .filter(function (entry) {
        return entry.item && typeof entry.item === 'object' && !entry.item.done &&
          !entry.item.skipped &&
          (includeOptional !== false || !entry.item.optional);
      });
    if (!pending.length) return null;
    pending.sort(function (a, b) {
      var aScore = (a.item.picked ? 100 : 0) + (a.item.inWindow ? 10 : 0);
      var bScore = (b.item.picked ? 100 : 0) + (b.item.inWindow ? 10 : 0);
      return bScore - aScore || a.index - b.index;
    });
    return pending[0].item;
  }

  function recommendMode(input) {
    input = input && typeof input === 'object' ? input : {};
    var hasCoverage = Number.isInteger(input.readinessCount) && input.readinessCount >= 2 &&
      Number.isInteger(input.coreSignals) && input.coreSignals >= 1;
    var readiness = hasCoverage && typeof input.readiness === 'number' && isFinite(input.readiness)
      ? Math.max(0, Math.min(100, Math.round(input.readiness)))
      : null;
    var recentMisses = Number.isInteger(input.recentMisses) && input.recentMisses > 0
      ? input.recentMisses
      : 0;

    if (readiness !== null && readiness <= 45) {
      return {
        mode: 'recovery',
        reason: 'Readiness is ' + readiness + '. Protect one essential and recover.'
      };
    }
    if (recentMisses >= 3) {
      return {
        mode: 'recovery',
        reason: 'Three difficult days in a row. Protect one essential and restart gently.'
      };
    }
    if (readiness !== null && readiness <= 68) {
      return {
        mode: 'busy',
        reason: 'Readiness is ' + readiness + '. Reduce scope and keep the rhythm.'
      };
    }
    if (recentMisses >= 2) {
      return {
        mode: 'busy',
        reason: 'Two difficult days in a row. Use minimum targets and keep the rhythm.'
      };
    }
    if (readiness !== null) {
      return {
        mode: 'full',
        reason: 'Readiness is ' + readiness + '. Your usual plan looks realistic.'
      };
    }
    return {
      mode: 'full',
      reason: 'No strain signal yet. Start with your usual plan and adjust anytime.'
    };
  }

  function countRecentDifficultDays(rates, limit) {
    if (!Array.isArray(rates)) return 0;
    limit = Number.isInteger(limit) && limit > 0 ? limit : 3;
    var count = 0;
    for (var i = 0; i < rates.length && count < limit; i++) {
      var rate = rates[i];
      if (rate === undefined) break;
      if (rate === null) continue;
      if (typeof rate !== 'number' || !isFinite(rate) || rate < 0 || rate > 1) break;
      if (rate >= 0.5) break;
      count += 1;
    }
    return count;
  }

  return {
    modeForDay: modeForDay,
    targetForHabit: targetForHabit,
    bestWindow: bestWindow,
    chooseNextMove: chooseNextMove,
    recommendMode: recommendMode,
    countRecentDifficultDays: countRecentDifficultDays
  };
}));

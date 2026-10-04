(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Arc90PurposeReview = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TYPES = {
    metrics: ['id', 'title', 'goalId', 'goalTitle', 'unit', 'direction', 'context'],
    observations: ['id', 'metricId', 'date', 'value', 'context', 'note'],
    adjustments: ['id', 'metricId', 'date', 'reviewDate', 'choice', 'text', 'status'],
    rules: ['id', 'obstacle', 'context', 'response'],
    attempts: ['id', 'ruleId', 'date', 'rating', 'note'],
  };
  const ACTIONS = {
    'metric.save': 'metrics',
    'observation.save': 'observations', 'observation.delete': 'observations',
    'adjustment.save': 'adjustments', 'adjustment.delete': 'adjustments',
    'rule.save': 'rules', 'rule.delete': 'rules',
    'attempt.save': 'attempts', 'attempt.delete': 'attempts',
  };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const list = value => Array.isArray(value) ? value : [];
  const key = value => typeof value === 'string' || Number.isSafeInteger(value) ? String(value) : null;

  function fields(value, expected, label) {
    if (!object(value) || Object.keys(value).length !== expected.length ||
        expected.some(name => !own(value, name))) throw new Error(`${label} has missing or unknown fields`);
  }
  function text(value, label, max, required = false) {
    if (typeof value !== 'string') throw new Error(`${label} must be text`);
    const result = value.trim();
    if (result.length > max || (required && !result)) throw new Error(`${label} must be ${required ? 'nonempty and ' : ''}at most ${max} characters`);
    return result;
  }
  function identifier(value, label) { return text(value, label, 200, true); }
  function date(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
        new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
      throw new Error(`${label} must be a real YYYY-MM-DD date`);
    }
    return value;
  }
  function choice(value, allowed, label) {
    if (!allowed.includes(value)) throw new Error(`${label} must be ${allowed.join(', ')}`);
    return value;
  }
  function empty() { return { version: 1, metrics: [], observations: [], adjustments: [], rules: [], attempts: [] }; }

  function canonical(type, input) {
    fields(input, TYPES[type], type.slice(0, -1));
    const id = identifier(input.id, `${type} id`);
    if (type === 'metrics') return {
      id, title: text(input.title, 'Metric title', 160, true),
      goalId: input.goalId === null ? null : text(input.goalId, 'Goal ID', 200),
      goalTitle: text(input.goalTitle, 'Goal title', 160),
      unit: text(input.unit, 'Metric unit', 40, true),
      direction: choice(input.direction, ['up', 'down'], 'Metric direction'),
      context: text(input.context, 'Metric context', 160),
    };
    if (type === 'observations') {
      if (typeof input.value !== 'number' || !Number.isFinite(input.value)) throw new Error('Observation value must be a finite number');
      return { id, metricId: identifier(input.metricId, 'Observation metric ID'), date: date(input.date, 'Observation date'),
        value: input.value, context: text(input.context, 'Observation context', 160), note: text(input.note, 'Observation note', 1000) };
    }
    if (type === 'adjustments') {
      const made = date(input.date, 'Adjustment date');
      const reviewDate = date(input.reviewDate, 'Adjustment review date');
      if (reviewDate < made) throw new Error('Review date cannot be before adjustment date');
      return {
        id, metricId: identifier(input.metricId, 'Adjustment metric ID'), date: made, reviewDate,
        choice: choice(input.choice, ['keep', 'change', 'rethink'], 'Adjustment choice'),
        text: text(input.text, 'Adjustment text', 1000, true), status: choice(input.status, ['open', 'reviewed'], 'Adjustment status'),
      };
    }
    if (type === 'rules') return { id, obstacle: text(input.obstacle, 'Obstacle', 240, true),
      context: text(input.context, 'Rule context', 160), response: text(input.response, 'Response', 1000, true) };
    return { id, ruleId: identifier(input.ruleId, 'Attempt rule ID'), date: date(input.date, 'Attempt date'),
      rating: choice(input.rating, ['helped', 'not-helped', 'unsure'], 'Attempt rating'),
      note: text(input.note, 'Attempt note', 1000) };
  }

  function normalize(raw = empty()) {
    fields(raw, ['version', ...Object.keys(TYPES)], 'Purpose review snapshot');
    if (raw.version !== 1) throw new Error('Unsupported purpose review snapshot version');
    const result = empty();
    for (const type of Object.keys(TYPES)) {
      if (!Array.isArray(raw[type])) throw new Error(`${type} must be an array`);
      const seen = new Set();
      result[type] = raw[type].map(item => {
        const record = canonical(type, item);
        if (seen.has(record.id)) throw new Error(`Duplicate ${type} id: ${record.id}`);
        seen.add(record.id);
        return record;
      });
    }
    const metricIds = new Set(result.metrics.map(item => item.id));
    const ruleIds = new Set(result.rules.map(item => item.id));
    for (const type of ['observations', 'adjustments']) {
      for (const item of result[type]) if (!metricIds.has(item.metricId)) throw new Error(`${type} ${item.id} refers to a missing metric`);
    }
    for (const item of result.attempts) if (!ruleIds.has(item.ruleId)) throw new Error(`Attempt ${item.id} refers to a missing rule`);
    return result;
  }

  function transact(state, action, options = {}) {
    const today = date(options.today, 'Today');
    if (!object(action) || !own(ACTIONS, action.type)) throw new Error('Unknown purpose review action');
    const saving = action.type.endsWith('.save');
    fields(action, saving ? ['type', 'record'] : ['type', 'id'], 'Action');
    const type = ACTIONS[action.type];
    const next = normalize(state);
    if (saving) {
      const record = canonical(type, action.record);
      if (['observations', 'attempts', 'adjustments'].includes(type) && record.date > today) throw new Error(`${type.slice(0, -1)} date cannot be after today`);
      const index = next[type].findIndex(item => item.id === record.id);
      if (index >= 0 && type === 'metrics' && next.observations.some(item => item.metricId === record.id)) {
        const previous = next.metrics[index];
        if (['unit', 'goalId', 'goalTitle'].some(field => previous[field] !== record[field])) {
          throw new Error('A metric with observations cannot change its unit or goal. Save a new metric instead.');
        }
      }
      if (index >= 0 && type === 'rules' && next.attempts.some(item => item.ruleId === record.id)) {
        const previous = next.rules[index];
        if (['obstacle', 'context', 'response'].some(field => previous[field] !== record[field])) {
          throw new Error('Save a new response to keep earlier feedback with the original.');
        }
      }
      if (index < 0) next[type].push(record);
      else next[type][index] = record;
    } else {
      const id = identifier(action.id, 'Record ID');
      const index = next[type].findIndex(item => item.id === id);
      if (index < 0) throw new Error(`${type.slice(0, -1)} not found: ${id}`);
      next[type].splice(index, 1);
      if (type === 'rules') next.attempts = next.attempts.filter(item => item.ruleId !== id);
    }
    return normalize(next);
  }

  function direction(state, metricId, options = {}) {
    const today = date(options.today, 'Today');
    const snapshot = normalize(state);
    const id = identifier(metricId, 'Metric ID');
    const metric = snapshot.metrics.find(item => item.id === id);
    if (!metric) throw new Error(`Metric not found: ${id}`);
    const context = metric.context.toLocaleLowerCase();
    const start = new Date(Date.parse(today + 'T00:00:00Z') - 29 * 86400000).toISOString().slice(0, 10);
    // Stable sorting keeps insertion order for observations on the same date.
    const observations = snapshot.observations.filter(item => item.metricId === id && item.date >= start &&
      item.date <= today && item.context.toLocaleLowerCase() === context).sort((a, b) => a.date.localeCompare(b.date));
    const latest = observations.at(-1) || null;
    const previous = observations.at(-2) || null;
    return { observations, latest, previous, delta: previous ? latest.value - previous.value : null, count: observations.length };
  }

  function playbook(state, ruleId) {
    const snapshot = normalize(state);
    const id = identifier(ruleId, 'Rule ID');
    if (!snapshot.rules.some(rule => rule.id === id)) throw new Error(`Rule not found: ${id}`);
    const attempts = snapshot.attempts.filter(item => item.ruleId === id);
    return { attempts, helped: attempts.filter(item => item.rating === 'helped').length,
      notHelped: attempts.filter(item => item.rating === 'not-helped').length,
      unsure: attempts.filter(item => item.rating === 'unsure').length };
  }

  function effortForGoal(input) {
    if (!object(input)) throw new Error('Effort input must be an object');
    const target = identifier(input.goalId, 'Goal ID');
    const start = date(input.start, 'Start');
    const end = date(input.end, 'End');
    if (start > end) throw new Error('Start must not be after end');
    const goals = new Map(list(input.goals).filter(object).map(goal => [key(goal.id), goal]));
    const habits = new Map(list(input.habits).filter(object).map(habit => [key(habit.id), habit]));
    const tasks = new Map(list(input.tasks).filter(object).map(task => [key(task.id), task]));
    function belongs(habit) {
      const explicit = key(habit.goal_id);
      const task = tasks.get(key(habit.task_id));
      let ref = explicit || (task && key(task.goal_id));
      const seen = new Set();
      let found = false;
      for (let depth = 0; ref; depth++) {
        if (depth === 5 || seen.has(ref)) return false;
        const goal = goals.get(ref);
        if (!goal || goal.status === 'archived') return false;
        seen.add(ref);
        if (ref === target) found = true;
        ref = key(goal.parent_goal_id);
      }
      return found;
    }
    let count = 0;
    const activeDays = new Set();
    const log = object(input.log) ? input.log : {};
    for (const [day, entry] of Object.entries(log)) {
      if (day < start || day > end || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !object(entry)) continue;
      try { date(day, 'Log date'); } catch (_) { continue; }
      const skipped = new Set(list(entry.skip).map(key));
      for (const habitId of new Set([...list(entry.done), ...list(entry.min)].map(key))) {
        if (habitId === null || skipped.has(habitId)) continue;
        const habit = habits.get(habitId);
        if (habit && belongs(habit)) { count++; activeDays.add(day); }
      }
    }
    return { count, days: activeDays.size };
  }

  return { empty, normalize, transact, direction, playbook, effortForGoal };
}));

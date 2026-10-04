(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Arc90Brain = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HORIZONS = ['long', 'mid', 'short'];
  const FREQUENCIES = ['daily', 'weekdays', 'weekends', 'weekly'];
  const ITEM_KEYS = ['temp_id', 'type', 'title', 'horizon', 'parent_temp_id', 'parent_goal_id', 'frequency', 'confidence', 'excerpt'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const array = (x) => Array.isArray(x) ? x : [];
  const clean = (x) => typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '';
  const id = (x) => typeof x === 'string' && x.length > 0 && x.length <= 200 && x === x.trim();
  const uuid = (x) => typeof x === 'string' && UUID.test(x);
  const column = (x) => HORIZONS.indexOf(x);
  const fail = (message) => { throw new Error('Invalid brain response: ' + message); };
  const validDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x + 'T00:00:00Z')) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;

  function unique(values, accept) {
    const seen = new Set();
    return array(values).filter((x) => record(x) && accept(x) && !seen.has(x.id) && seen.add(x.id));
  }

  // Drafts are UI-owned JSON records. Clone their content without retaining references
  // or prototype setters; normalize only their identity here.
  function clone(value, seen = new Set(), depth = 0) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 30) return null;
    seen.add(value);
    const result = Array.isArray(value) ? [] : {};
    for (const key of Object.keys(value)) {
      if (!['__proto__', 'constructor', 'prototype'].includes(key)) result[key] = clone(value[key], seen, depth + 1);
    }
    seen.delete(value);
    return result;
  }

  function normalize(raw) {
    const source = record(raw) ? raw : {};
    const drafts = unique(source.drafts, (x) => id(x.id)).map((x) => clone(x));
    const goals = unique(source.goals, (x) => uuid(x.id) && clean(x.title) && column(x.horizon) >= 0).map((x) => ({
      id: x.id,
      title: clean(x.title),
      horizon: x.horizon,
      parent_goal_id: uuid(x.parent_goal_id) ? x.parent_goal_id : null,
      status: ['active', 'done', 'archived'].includes(x.status) ? x.status : 'active',
      ...(uuid(x.source_dump_id) ? { source_dump_id: x.source_dump_id } : {}),
      ...(typeof x.created_at === 'string' ? { created_at: x.created_at } : {}),
      ...(typeof x.life_area === 'string' ? { life_area: x.life_area } : {}),
    }));
    const byId = new Map(goals.map((x) => [x.id, x]));
    for (const goal of goals) {
      const parent = byId.get(goal.parent_goal_id);
      if (!parent || parent.id === goal.id || column(parent.horizon) !== column(goal.horizon) - 1) goal.parent_goal_id = null;
    }
    return {
      drafts, goals,
      activeDraftId: drafts.some((x) => x.id === source.activeDraftId) ? source.activeDraftId : null,
      cloudOwner: typeof source.cloudOwner === 'string' ? source.cloudOwner : null,
      deletedTaskIds: [...new Set(array(source.deletedTaskIds).filter(id))],
      dirty: source.dirty === true,
    };
  }

  function fallback(text) {
    const items = [], seen = new Set();
    if (typeof text !== 'string') return { items };
    const lines = text.split(/[\r\n]+/).map((line) => line.replace(/^\s*(?:[-*\u2022]+\s+|\d+[.)]\s+)/, ''));
    for (const part of lines.flatMap((line) => line.split(/[.!?]+(?:\s+|$)/))) {
      const excerpt = clean(part);
      if (!excerpt) continue;
      const title = excerpt.split(' ').slice(0, 8).join(' ');
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ temp_id: 'fallback-' + (items.length + 1), type: 'task', title, horizon: 'unsorted', parent_temp_id: null, parent_goal_id: null, frequency: null, confidence: 0, excerpt });
      if (items.length === 60) break;
    }
    return { items };
  }

  // On-device sorting when AI is unavailable: one item per idea with a best-guess type and
  // horizon. Every guess stays editable in Review; nothing is saved until the person confirms.
  const LEAD_IN = /^(?:(?:and|also|but|so|then)\s+)?(?:i\s+(?:really\s+)?(?:want|need|would like|'d like|wanna|have|hope|plan|should|must|am going|'m going)\s+(?:to\s+)?|i\s+will\s+|i'll\s+|my goal is to\s+|to\s+)/i;
  const ACTIONS = 'go|hit|work ?out|exercise|run|jog|walk|read|study|practice|meditate|journal|stretch|drink|cook|sell|buy|call|email|text|book|pay|post|upload|record|edit|write|clean|save|track|learn|apply|submit|cancel|renew|schedule|fix|order|send|return|register';
  const TASK_START = /^(?:sell|buy|call|email|text|book|pay|apply|submit|cancel|renew|schedule|fix|order|send|return|register|sign up|print|pick up|file|finish (?:the|my)|clean (?:the|my)|move (?:to|out))\b/i;
  const HABIT_HINT = /\b(?:daily|every\s*(?:day|morning|night|evening|week)|each\s+(?:day|morning|night)|(?:go|went|going) to the gym|gym|work ?out|exercise|meditat\w*|journal|stretch|routine|drink (?:more )?water|(?:read|study|practice|run|walk|jog)\b(?!.*\b(?:degree|course|school)\b))/i;
  const SHORT_HINT = /\b(?:today|tomorrow|tonight|this (?:week|month|weekend)|next (?:week|month)|before|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|the end|next)|for (?:graduation|the launch|the exam|my exam)|deadline|asap|soon)\b/i;
  const LONG_HINT = /\b(?:financial(?:ly)? (?:stable|free|freedom|secure)|become|career|healthy|healthier|wealth|wealthy|rich|retire|long[- ]term|someday|one day|marathon|degree|stable|independen\w*)\b/i;
  const TRAILING = /\s+(?:and|or|with|for|to|the|a|an|my|at|on|about|of|in|from|by)$/i;
  function suggest(text) {
    const items = [], seen = new Set();
    if (typeof text !== 'string') return { items };
    const ideas = text.split(/[\r\n]+/).map((line) => line.replace(/^\s*(?:[-*•]+\s+|\d+[.)]\s+)/, ''))
      .flatMap((line) => line.split(/[.!?;]+(?=\s|$)/))
      .flatMap((part) => part.split(/,\s*(?=(?:(?:and|also|but|so|then)\s+)?i(?:'|\s))/i))
      .flatMap((part) => part.split(new RegExp(`\\s+and\\s+(?=(?:${ACTIONS})\\b)`, 'i')));
    for (const idea of ideas) {
      const excerpt = clean(idea);
      let core = excerpt;
      for (let i = 0; i < 2; i++) core = core.replace(LEAD_IN, '').trim();
      core = core.replace(/[,:\-\s]+$/, '');
      if (!core) continue;
      let words = core.split(' ');
      if (words.length > 8) { let short = words.slice(0, 8).join(' ').replace(/[,;:\-]+$/, ''); short = short.replace(/\s+(?:to|for|so|because|that|which)\s+\S+$/i, ''); while (TRAILING.test(short)) short = short.replace(TRAILING, '').replace(/[,;:\-]+$/, ''); words = short.split(' '); }
      const title = words.join(' ').replace(/^./, (c) => c.toUpperCase());
      const key = title.toLowerCase();
      if (!title || seen.has(key)) continue;
      seen.add(key);
      const recurring = /\b(?:daily|every\s*(?:day|morning|night|evening|week)|each\s+(?:day|morning|night))\b/i.test(core);
      const type = TASK_START.test(core) ? 'task' : recurring || (HABIT_HINT.test(core) && !LONG_HINT.test(core)) ? 'habit' : 'goal';
      const horizon = type === 'goal' ? (SHORT_HINT.test(core) ? 'short' : LONG_HINT.test(core) ? 'long' : 'mid') : 'short';
      const frequency = type !== 'habit' ? null : /\bweekdays?\b/i.test(core) ? 'weekdays' : /\bweekends?\b/i.test(core) ? 'weekends' : /\b(?:weekly|once a week|every week)\b/i.test(core) ? 'weekly' : 'daily';
      items.push({ temp_id: 'local-' + (items.length + 1), type, title, horizon, parent_temp_id: null, parent_goal_id: null, frequency, confidence: 0.5, excerpt });
      if (items.length === 60) break;
    }
    return { items };
  }

  // Model responses are deliberately stricter than fallback review items.
  function validateResponse(value, existingGoals = []) {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) { fail('expected JSON'); }
    }
    if (!record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.items) || value.items.length > 60) fail('expected {items}, at most 60 items');
    const items = value.items.map((x) => {
      if (!record(x) || Object.keys(x).length !== ITEM_KEYS.length || ITEM_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(x, key))) fail('item schema');
      if (!id(x.temp_id) || !['goal', 'task', 'habit'].includes(x.type)) fail('identity or type');
      const title = clean(x.title);
      if (!title || title.split(' ').length > 8) fail('title must contain 1-8 words');
      if (column(x.horizon) < 0) fail('horizon');
      if (x.parent_temp_id !== null && !id(x.parent_temp_id)) fail('temporary parent');
      if (x.parent_goal_id !== null && !uuid(x.parent_goal_id)) fail('existing parent must be a UUID');
      if (x.parent_temp_id !== null && x.parent_goal_id !== null) fail('only one parent allowed');
      if (x.frequency !== null && !FREQUENCIES.includes(x.frequency)) fail('frequency');
      if (x.type !== 'habit' && x.frequency !== null) fail('only habits have frequency');
      if (typeof x.confidence !== 'number' || !Number.isFinite(x.confidence) || x.confidence < 0 || x.confidence > 1) fail('confidence');
      if (typeof x.excerpt !== 'string') fail('excerpt');
      return { temp_id: x.temp_id, type: x.type, title, horizon: x.horizon, parent_temp_id: x.parent_temp_id, parent_goal_id: x.parent_goal_id, frequency: x.frequency, confidence: x.confidence, excerpt: x.excerpt.trim() };
    });
    const temporary = new Map();
    for (const item of items) {
      if (temporary.has(item.temp_id)) fail('duplicate temporary id');
      temporary.set(item.temp_id, item);
    }
    const existing = new Map(), ambiguous = new Set();
    for (const goal of array(existingGoals)) {
      if (!record(goal) || !uuid(goal.id)) continue;
      if (existing.has(goal.id)) ambiguous.add(goal.id);
      existing.set(goal.id, goal);
    }
    function parentOf(item, isExisting) {
      if (!isExisting && item.parent_temp_id !== null) {
        const parent = temporary.get(item.parent_temp_id);
        if (!parent || parent.type !== 'goal') fail('temporary parent must reference a goal');
        return { item: parent, existing: false, key: 'temp:' + parent.temp_id };
      }
      const ref = item.parent_goal_id;
      if (ref == null) return null;
      const parent = existing.get(ref);
      if (!uuid(ref) || !parent || ambiguous.has(ref) || parent.status === 'archived' || column(parent.horizon) < 0) fail('unavailable existing goal');
      return { item: parent, existing: true, key: 'goal:' + ref };
    }
    for (const item of items) {
      let current = item, isExisting = false, depth = 1;
      const seen = new Set(['temp:' + item.temp_id]);
      while (true) {
        const parent = parentOf(current, isExisting);
        if (!parent) break;
        if (seen.has(parent.key) || ++depth > 5) fail('cycle or hierarchy deeper than five');
        seen.add(parent.key);
        if (!isExisting && current.type === 'habit') {
          if (!['short', 'mid'].includes(parent.item.horizon)) fail('habits require a short or mid goal');
        } else if (column(parent.item.horizon) !== column(current.horizon) - 1) {
          fail('goal/task parent must be one horizon higher; long items have no parent');
        }
        current = parent.item;
        isExisting = parent.existing;
      }
    }
    return { items };
  }

  function alignment(input = {}) {
    const source = record(input) ? input : {};
    const { start, end } = source;
    if ((start != null && !validDate(start)) || (end != null && !validDate(end)) || (start != null && end != null && start > end)) throw new Error('Invalid alignment date range');
    const goals = unique(source.goals, (x) => id(x.id) && column(x.horizon) >= 0);
    const withTextId = (values) => array(values).map((x) => record(x) && (typeof x.id === 'string' || Number.isSafeInteger(x.id)) ? { ...x, id: String(x.id) } : x);
    const habits = unique(withTextId(source.habits), (x) => id(x.id));
    const tasks = unique(withTextId(source.tasks).filter(record).map(x => ({ ...x, horizon: column(x.horizon) >= 0 ? x.horizon : 'short' })), (x) => id(x.id));
    const goalMap = new Map(goals.map((x) => [x.id, x]));
    const taskMap = new Map(tasks.map((x) => [x.id, x]));
    const counts = new Map(habits.map((x) => [x.id, 0]));
    let historicalUnassigned = 0;
    const activity = {};
    for (const habit of habits) Object.defineProperty(activity, habit.id, { value: [], enumerable: true, configurable: true, writable: true });
    for (const [date, day] of Object.entries(record(source.log) ? source.log : {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (!validDate(date) || (start != null && date < start) || (end != null && date > end) || !record(day)) continue;
      const skipped = new Set(array(day.skip).map(String));
      for (const habitId of new Set([...array(day.done), ...array(day.min)].map(String))) {
        if (skipped.has(habitId)) continue;
        if (!counts.has(habitId)) {
          if (array(day.scheduledIds).map(String).includes(habitId)) historicalUnassigned++;
          continue;
        }
        counts.set(habitId, counts.get(habitId) + 1);
        activity[habitId].push({ date, count: 1 });
      }
    }

    // Reject the whole path when an ancestor is missing/archived/cyclic. This
    // prevents partial paths from making disconnected effort appear aligned.
    function goalPath(ref) {
      const path = [], seen = new Set();
      while (ref != null) {
        const goal = goalMap.get(ref);
        if (!goal || goal.status === 'archived' || seen.has(ref) || path.length === 5) return null;
        if (path.length && column(goal.horizon) !== column(path[path.length - 1].horizon) - 1) return null;
        seen.add(ref);
        path.push(goal);
        ref = goal.parent_goal_id;
      }
      return path.length ? path : null;
    }
    function taskPath(task) {
      const path = goalPath(task.goal_id);
      return path && column(path[0].horizon) === column(task.horizon) - 1 ? path : null;
    }
    const nodes = [], nodeMap = new Map(), edges = new Map();
    function node(kind, value, col) {
      const key = kind + ':' + value.id;
      const result = {
        id: key, title: clean(kind === 'habit' ? value.name : value.title), column: col, kind, value: 0, percent: 0,
        goalId: kind === 'goal' ? value.id : id(value.goal_id) ? value.goal_id : null,
        habitId: kind === 'habit' ? value.id : null,
        taskId: kind === 'task' ? value.id : null,
      };
      nodes.push(result);
      nodeMap.set(key, result);
      return key;
    }
    function link(from, to, value = 0) {
      const key = JSON.stringify([from, to]);
      if (!edges.has(key)) edges.set(key, { source: from, target: to, value: 0 });
      edges.get(key).value += value;
    }
    for (const goal of goals) node('goal', goal, column(goal.horizon));
    for (const task of tasks) node('task', task, column(task.horizon));
    for (const goal of goals) {
      const path = goalPath(goal.id);
      if (path && path.length > 1) link('goal:' + path[1].id, 'goal:' + goal.id);
    }
    for (const task of tasks) {
      const path = taskPath(task);
      if (path) link('goal:' + path[0].id, 'task:' + task.id);
    }
    const orphans = [];
    let total = historicalUnassigned, aligned = 0, longAligned = 0, orphanValue = historicalUnassigned;
    for (const habit of habits) {
      const count = counts.get(habit.id);
      total += count;
      const direct = goalPath(habit.goal_id);
      const directValid = direct && ['short', 'mid'].includes(direct[0].horizon);
      const task = taskMap.get(String(habit.task_id));
      const throughTask = task && taskPath(task);
      // An explicit goal must agree with the task's goal or an ancestor of it.
      const routeTask = throughTask && (habit.goal_id == null || (directValid && throughTask.some((g) => g.id === habit.goal_id)));
      const path = routeTask ? throughTask : directValid ? direct : null;
      if (!path) {
        orphans.push(habit.id);
        orphanValue += count;
        continue;
      }
      aligned += count;
      if (path[path.length - 1].horizon === 'long') longAligned += count;
      const habitKey = node('habit', habit, 3);
      const habitNode = nodeMap.get(habitKey);
      habitNode.value = count;
      habitNode.goalId = path[0].id;
      habitNode.taskId = routeTask ? task.id : null;
      let child = habitKey;
      if (routeTask) {
        child = 'task:' + task.id;
        nodeMap.get(child).value += count;
        link(child, habitKey, count);
      }
      for (const goal of path) {
        const key = 'goal:' + goal.id;
        nodeMap.get(key).value += count;
        link(key, child, count);
        child = key;
      }
    }
    if (orphans.length || historicalUnassigned) nodes.push({ id: 'no-purpose', title: historicalUnassigned ? 'Unassigned effort' : 'No purpose', column: 3, kind: 'orphan', value: orphanValue, percent: 0, goalId: null, habitId: null, taskId: null, ids: orphans.slice() });
    for (const item of nodes) item.percent = total ? item.value / total * 100 : 0;
    const active = goals.filter((x) => x.status == null || x.status === 'active');
    return {
      nodes, links: [...edges.values()], total, aligned, score: total ? longAligned / total * 100 : null,
      activeGoals: active.filter((x) => nodeMap.get('goal:' + x.id).value > 0).length, orphanHabits: orphans.length,
      neglectedGoals: active.filter((x) => nodeMap.get('goal:' + x.id).value === 0).length,
      orphans, activity,
    };
  }

  return { normalize, fallback, suggest, validateResponse, alignment };
}));

(function (root) {
  'use strict';
  const shift = (date, days) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  root.Arc90ReviewSample = function (today) {
    const metric = { id: 'sample-score', title: 'Practice test score', goalId: 'sample-boards', goalTitle: 'Pass my nursing boards', unit: '%', direction: 'up', context: 'Timed, mixed-topic set' };
    const state = {
      version: 1,
      metrics: [metric],
      observations: [
        { id: 'score-1', metricId: metric.id, date: shift(today, -21), value: 62, context: metric.context, note: '50 questions, no notes.' },
        { id: 'score-2', metricId: metric.id, date: shift(today, -14), value: 63, context: metric.context, note: 'Same format, new questions.' },
        { id: 'score-3', metricId: metric.id, date: shift(today, -7), value: 62, context: metric.context, note: 'Rushed the last ten questions.' },
        { id: 'score-4', metricId: metric.id, date: today, value: 64, context: metric.context, note: 'Finished with two minutes left.' },
      ],
      adjustments: [],
      rules: [
        { id: 'late-shift', obstacle: 'A late shift', context: 'Studying after work', response: 'Answer five questions before opening social media.' },
        { id: 'busy-mind', obstacle: 'Too much on my mind', context: 'Starting a focus session', response: 'Write down the loose ends, then choose just one task.' },
      ],
      attempts: [
        { id: 'try-1', ruleId: 'late-shift', date: shift(today, -6), rating: 'helped', note: 'Five questions was enough to start.' },
        { id: 'try-2', ruleId: 'late-shift', date: shift(today, -3), rating: 'helped', note: 'Kept it small and stopped at five.' },
        { id: 'try-3', ruleId: 'late-shift', date: shift(today, -1), rating: 'unsure', note: 'Still distracted, but I tried.' },
      ],
    };
    const goals = [{ id: 'sample-boards', title: metric.goalTitle, horizon: 'mid', status: 'active', parent_goal_id: null }];
    const habits = [{ id: 1, name: 'Study for 25 minutes', goal_id: 'sample-boards' }, { id: 2, name: 'Review missed questions', goal_id: 'sample-boards' }];
    const log = {};
    for (let i = 0; i < 7; i++) log[shift(today, -i)] = { done: i < 3 ? [1, 2] : [1], min: [], skip: [] };
    return { state, source: { goals, habits, tasks: [], log } };
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));

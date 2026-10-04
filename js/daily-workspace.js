'use strict';

let arcWorkspace = 'map';
let journalPeriod = 'day';
let morningOpenDate = '';
let planningDrafts = { morning: {}, night: {} };
let brainDumpDraft = '';
let selectedIdeas = new Set();
const PLANNING_FEELINGS = ['Steady', 'Energized', 'Low energy', 'Overwhelmed', 'Uncertain'];
const STARTER_IDEAS = ['Prepare one thing for tomorrow', 'Take a short walk outside', 'Reach out to someone I miss', 'Clear one small unfinished task'];

function resetPlanningWorkspace() {
  planningDrafts = { morning: {}, night: {} };
  morningOpenDate = '';
  brainDumpDraft = '';
  selectedIdeas = new Set();
  practiceDate = null;
  arcWorkspace = 'map';
}

function planningDay(date) { return S.planning.days[date] || {}; }
function planningDraft(period, date) {
  if (!planningDrafts[period][date]) {
    const saved = S.planning.drafts?.[period]?.[date] || planningDay(date)[period];
    planningDrafts[period][date] = saved ? JSON.parse(JSON.stringify(saved)) : period === 'morning'
      ? { feeling: '', win: dlog(date).intention || '', priorities: [] }
      : { feeling: '', helped: '', friction: '', response: '', reflection: '', outcomes: {} };
  }
  return planningDrafts[period][date];
}

function planningCommit(mutate) {
  const old = { planning: JSON.parse(JSON.stringify(S.planning)), tasks: JSON.parse(JSON.stringify(S.tasks)), log: JSON.parse(JSON.stringify(S.log)), taskSeq: S.taskSeq };
  if (S.brain) old.brain = JSON.parse(JSON.stringify(S.brain));
  try { mutate(); save(); return true; }
  catch (error) {
    Object.assign(S, old);
    showNudge(error.message || 'Not saved. Keep this page open and try again.');
    return false;
  }
}

function persistPlanningDrafts(period, date) {
  if (!['morning', 'night'].includes(period) || !Arc90Planning.validDate(date)) return false;
  return planningCommit(() => {
    S.planning.drafts ||= { morning: {}, night: {} };
    S.planning.drafts[period][date] = JSON.parse(JSON.stringify(planningDraft(period, date)));
  });
}

// The goal a priority serves, so the morning plan reads as goal work, not a to-do list.
function planningGoalOf(p) {
  const item = p.kind === 'habit' ? S.habits.find((h) => String(h.id) === String(p.id)) : p.kind === 'task' ? S.tasks.find((t) => String(t.id) === String(p.id)) : null;
  const goal = item?.goal_id && (S.brain?.goals || []).find((g) => g.id === item.goal_id && g.status === 'active');
  return goal ? (typeof brainGoalLabel === 'function' ? brainGoalLabel(goal.title) : goal.title) : '';
}

function planningOptions(date) {
  const draft = planningDraft('morning', date);
  const carried = S.planning.carry[date] || [];
  const seen = new Set();
  return [...draft.priorities, ...carried,
    ...S.habits.filter((h) => scheduledFor(h, date)).map((h) => ({ key: `habit:${h.id}`, kind: 'habit', id: String(h.id), title: h.name })),
    ...S.tasks.filter((t) => !t.done).map((t) => ({ key: `task:${t.id}`, kind: 'task', id: String(t.id), title: t.title }))
  ].filter((p) => {
    const identity = p.kind + ':' + p.id;
    if (seen.has(identity)) return false;
    seen.add(identity); return true;
  });
}

function planningFeeling(period, date, feeling) {
  return `<label class="planning-field" for="${period}Feeling">How are you feeling?
    <select id="${period}Feeling" data-planning-period="${period}" data-planning-field="feeling" data-date="${date}">
      <option value="">Choose a feeling</option>${[...new Set([...PLANNING_FEELINGS, feeling].filter(Boolean))].map((value) => `<option${value === feeling ? ' selected' : ''}>${esc(value)}</option>`).join('')}
    </select></label>`;
}

function morningConsole(date, journal = false) {
  const saved = planningDay(date).morning;
  const editing = !saved?.savedAt || morningOpenDate === date || !!S.planning.drafts?.morning?.[date];
  if (!editing) return `<section class="planning-morning-summary" aria-label="Morning plan">
    <div><span class="planning-kicker">Morning saved</span><p>${esc(saved.win || 'A little space for today.')}</p>${journal && saved.priorities.length ? `<ul>${saved.priorities.map((p) => `<li>${esc(p.title)}</li>`).join('')}</ul>` : ''}</div>
    <button class="inline-link" data-planning-act="morning-open" data-date="${date}">Reopen morning</button></section>`;
  if (date !== todayKey() && !saved?.savedAt && !S.planning.drafts?.morning?.[date]) return `<section class="planning-section"><h2>Morning</h2><p>No morning plan saved for this date.</p></section>`;
  const draft = planningDraft('morning', date);
  const locked = !!planningDay(date).night?.savedAt || date !== todayKey();
  const options = locked ? draft.priorities : planningOptions(date);
  return `<section class="planning-section morning-console" aria-label="Morning plan" id="morningConsole">
    <div class="planning-heading"><h2>Morning</h2><span>A little direction for today</span></div>
    <div class="planning-morning-fields">${planningFeeling('morning', date, draft.feeling)}
      <label class="planning-field" for="morningWin">What would make today a win?
        <textarea id="morningWin" rows="2" maxlength="2000" data-planning-period="morning" data-planning-field="win" data-date="${date}" placeholder="One thing that matters.">${esc(draft.win)}</textarea>
      </label></div>
    <details class="planning-choices"><summary>Priorities <span id="priorityCount">${draft.priorities.length} / 3</span></summary>
      ${locked ? '<p>The priorities stay with this day\'s night review.</p>' : ''}
      <div class="planning-choice-list">${options.length ? options.map((p) => `<label class="planning-choice"><input type="checkbox" data-planning-priority="${esc(p.key)}" data-date="${date}"${draft.priorities.some((v) => v.key === p.key) ? ' checked' : ''}${locked ? ' disabled' : ''}><span>${esc(p.title)}<small>${p.sourceDate ? 'Brought forward by you' : p.kind === 'habit' ? 'Habit' : 'Task'}${planningGoalOf(p) ? ` · ${esc(planningGoalOf(p))}` : ''}</small></span></label>`).join('') : '<p>No habits or open tasks yet.</p>'}</div>
    </details>
    <div class="planning-actions"><button class="btn" data-planning-act="morning-save" data-date="${date}">Save morning</button><span class="planning-draft-status">${S.planning.drafts?.morning?.[date] ? 'Draft saved on this device.' : saved?.savedAt ? 'Changes are not saved yet.' : 'Not saved yet.'}</span></div>
  </section>`;
}

function todayTasksPanel() {
  const open = S.tasks.filter((task) => !task.done);
  return `<section class="planning-section today-tasks" aria-label="Tasks">
    <div class="planning-heading"><h2>Tasks</h2><button class="inline-link" data-planning-act="workspace" data-id="ideas">All tasks${open.length ? ` · ${open.length} open` : ''}</button></div>
    ${open.length ? `<div class="plan-tasks">${open.slice(0, 3).map(taskRow).join('')}</div>` : `<p>${S.tasks.length ? 'All tasks complete.' : 'No tasks yet.'}</p>`}
    <button class="inline-link" data-planning-act="workspace" data-id="ideas">Add task</button>
  </section>`;
}

function planningQuickAccess() {
  return `<section class="planning-quick" aria-label="Daily practice"><h2>Daily practice</h2><div>
    <button data-planning-act="journal-open" data-period="morning">Morning <span>${planningDay(todayKey()).morning?.savedAt ? 'Saved' : 'Set direction'}</span></button>
    <button data-planning-act="journal-open" data-period="night">Night <span>${planningDay(todayKey()).night?.savedAt ? 'Saved' : 'Look back'}</span></button>
  </div></section>`;
}

function arcWorkspaceTabs() {
  return `<nav class="arc-workspace-tabs" aria-label="Arc workspace">${[['map','Map'],['brain','Capture'],['ideas','Tasks'],['journal','Journal']].map(([name,label]) => `<button data-planning-act="workspace" data-id="${name}" aria-current="${arcWorkspace === name ? 'page' : 'false'}">${label}</button>`).join('')}</nav>`;
}

function arcWorkspaceView() {
  return `${brandbar()}<header class="topbar"><div><h1>Arc</h1><div class="sub">Small actions. A clearer picture.</div></div></header>
    ${arcWorkspaceTabs()}<div class="arc-ws arc-ws-${arcWorkspace}">${arcWorkspace === 'map' ? brainAlignment() : arcWorkspace === 'brain' ? `${brainWorkspaceContent()}<details class="arc-ideas"><summary>Saved ideas</summary>${planningIdeas()}</details>` : arcWorkspace === 'journal' ? planningJournal() : planningTasks()}</div>`;
}

function planningTasks() {
  return viewPlan(true);
}

function planningTaskSheet() {
  const task = S.tasks.find(t => String(t.id) === sheet.itemId);
  if (!task) return '<h2>Task unavailable</h2>';
  const due = /^\d{4}-\d{2}-\d{2}$/.test(task.due || '') ? task.due + 'T09:00' : task.due || '';
  return `<div class="brain-detail"><h2>Edit task</h2><label>Title<input id="editTaskTitle" maxlength="200" value="${esc(task.title)}"></label><label>Deadline<input id="editTaskDue" type="datetime-local" value="${esc(due)}"></label><button class="btn" data-planning-act="task-save" data-id="${esc(task.id)}">Save task</button></div>`;
}

function planningJournal() {
  const date = practiceDate || todayKey();
  const draftDates = [...Object.keys(S.planning.drafts?.morning || {}), ...Object.keys(S.planning.drafts?.night || {})];
  const dates = [...new Set([...Object.keys(S.planning.days), ...draftDates, ...Object.keys(S.journal), ...Object.keys(S.practices || {}), ...Object.keys(S.log).filter((key) => S.log[key]?.intention)])].filter((key) => Arc90Planning.validDate(key) && key <= todayKey()).sort().reverse();
  return `<div class="planning-journal-toolbar">
    <label class="planning-field" for="practiceDate">Journal date<input type="date" id="practiceDate" aria-label="Journal date" value="${date}" max="${todayKey()}"></label>
    <div class="planning-period" role="group" aria-label="Journal view">${['day', 'week'].map((p) => `<button data-planning-act="period" data-id="${p}" aria-pressed="${journalPeriod === p}">${p === 'day' ? 'Day' : 'Week'}</button>`).join('')}</div>
    ${dates.length ? `<label class="planning-field" for="journalHistory">History<select id="journalHistory"><option value="">Choose an entry</option>${dates.map((key) => `<option value="${key}"${key === date ? ' selected' : ''}>${key}</option>`).join('')}</select></label>` : ''}
  </div>
  ${journalPeriod === 'week' ? planningWeeklyPanel(date) : `${morningConsole(date, true)}${planningNight(date)}${dailyPracticePanel()}`}`;
}

function planningNight(date) {
  const draft = planningDraft('night', date);
  const morning = planningDay(date).morning;
  const priorities = morning?.savedAt ? morning.priorities : [];
  const nextDate = Arc90Planning.nextDate(date);
  return `<section class="planning-section planning-night" id="planningNight" aria-label="Night review">
    <div class="planning-heading"><h2>Night</h2><span>${planningDay(date).night?.savedAt ? 'Saved review' : 'A look back, without judgment'}</span></div>
    ${morning?.savedAt ? `<p class="planning-day-win">Your day win: ${esc(morning.win)}</p>` : '<p>No morning plan saved. There is still room to reflect.</p>'}
    ${priorities.map((p, index) => {
      const o = draft.outcomes[p.key] || {};
      const logged = dlog(date);
      const status = p.kind === 'habit' ? ['done', 'min', 'skip'].find((s) => logged[s].some((id) => String(id) === String(p.id))) : '';
      return `<fieldset class="planning-outcome"><legend>${esc(p.title)}</legend>
        ${status === 'done' || status === 'min' ? `<p class="planning-log-note">Habit log on ${date}: ${status === 'done' ? 'complete' : 'minimum version'}</p>` : ''}
        <label class="planning-field" for="outcome${index}">How did it go?<select id="outcome${index}" data-planning-outcome="${esc(p.key)}" data-outcome-field="status" data-date="${date}">
          <option value="">Choose an outcome</option>${[['completed', 'Completed'], ['partial', 'Partial'], ['skipped', 'Deliberately skipped']].map(([v, label]) => `<option value="${v}"${o.status === v ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        ${o.status && o.status !== 'completed' ? `<label class="planning-field" for="next${index}">What happens next?<select id="next${index}" data-planning-outcome="${esc(p.key)}" data-outcome-field="next" data-date="${date}"><option value="">Choose a next step</option>${[['tomorrow', 'Tomorrow'], ['smaller', 'Make smaller'], ['drop', 'Drop']].map(([v, label]) => `<option value="${v}"${o.next === v ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        ${o.next === 'smaller' ? `<label class="planning-field" for="smaller${index}">Smaller step for ${nextDate}<input id="smaller${index}" maxlength="200" value="${esc(o.smaller || '')}" data-planning-outcome="${esc(p.key)}" data-outcome-field="smaller" data-date="${date}"></label>` : ''}
        ${o.next === 'tomorrow' ? `<p class="planning-log-note">Available to choose on ${nextDate}.</p>` : ''}` : ''}
      </fieldset>`;
    }).join('')}
    ${planningFeeling('night', date, draft.feeling)}
    <div class="planning-two-fields">
      <label class="planning-field" for="nightHelped">What helped? <span>Optional</span><textarea id="nightHelped" rows="2" maxlength="2000" data-planning-period="night" data-planning-field="helped" data-date="${date}">${esc(draft.helped)}</textarea></label>
      <label class="planning-field" for="nightFriction">What got in the way? <span>Optional</span><input id="nightFriction" list="planningObstacles" maxlength="200" value="${esc(draft.friction)}" data-planning-period="night" data-planning-field="friction" data-date="${date}"></label>
    </div>
    <datalist id="planningObstacles">${Object.values(S.planning.responses).map((r) => `<option value="${esc(r.friction)}"></option>`).join('')}</datalist>
    <div id="planningRemembered">${planningRemembered(draft.friction)}</div>
    <details class="planning-response"${draft.response ? ' open' : ''}><summary>A response for this obstacle</summary>
      <label class="planning-field" for="nightResponse">What would you try again?<textarea id="nightResponse" rows="2" maxlength="2000" data-planning-period="night" data-planning-field="response" data-date="${date}">${esc(draft.response)}</textarea></label>
      <label class="planning-choice"><input type="checkbox" id="rememberResponse" data-planning-period="night" data-planning-field="remember" data-date="${date}"${draft.remember ? ' checked' : ''}><span>Remember this response for this obstacle</span></label>
    </details>
    <details class="planning-reflection"${draft.reflection ? ' open' : ''}><summary>Reflection <span>Optional</span></summary><label class="planning-field" for="nightReflection">Anything else to remember?<textarea id="nightReflection" rows="4" maxlength="10000" data-planning-period="night" data-planning-field="reflection" data-date="${date}">${esc(draft.reflection)}</textarea></label></details>
    <div class="planning-actions"><button class="btn" data-planning-act="night-save" data-date="${date}">Save night</button><span class="planning-draft-status" role="status">${S.planning.drafts?.night?.[date] ? 'Draft saved on this device.' : draft.dirty ? 'Changes are not saved yet.' : planningDay(date).night?.savedAt ? 'Saved on this device.' : 'Not saved yet.'}</span></div>
  </section>`;
}

function planningRemembered(friction) {
  const remembered = S.planning.responses[Arc90Planning.frictionKey(friction)];
  return remembered ? `<aside class="planning-remembered"><span class="planning-kicker">Your remembered response</span><p>${esc(remembered.response)}</p><button class="inline-link" data-planning-act="forget-response" data-key="${esc(Arc90Planning.frictionKey(friction))}">Forget response</button></aside>` : '';
}

function planningWeeklyPanel(date) {
  const w = Arc90Planning.weekly(S.planning, date);
  const week = Arc90Planning.weekStart(date);
  return `<section class="planning-section planning-week" aria-label="Weekly reflection">
    <div class="planning-heading"><h2>Your week in words</h2><span>${w.start} to ${w.end}</span></div>
    <h3>Logged accomplishments</h3>${w.accomplishments.length ? `<ul>${w.accomplishments.map((v) => `<li>${esc(v.title)} <small>${v.date} · ${v.status === 'partial' ? 'Partial progress' : 'Completed'}</small></li>`).join('')}</ul>` : '<p>No priority outcomes logged in this week yet.</p>'}
    <h3>Obstacles you noted</h3>${w.obstacles.length ? `<ul>${w.obstacles.map((v) => `<li>${esc(v.friction)} <small>${v.count} ${v.count === 1 ? 'day' : 'days'}</small></li>`).join('')}</ul>` : '<p>No obstacles noted.</p>'}
    <h3>What you said helped</h3>${w.helpful.length ? `<ul>${w.helpful.map((v) => `<li>${esc(v.text)} <small>${v.date}</small></li>`).join('')}</ul>` : '<p>No helpful responses noted.</p>'}
    <label class="planning-field" for="weekChange">One change for next week<textarea id="weekChange" rows="2" maxlength="2000" data-week="${week}">${esc(S.planning.weeks[week]?.change || '')}</textarea></label>
    <button class="btn btn-ghost" data-planning-act="week-save" data-week="${week}">Save next-week change</button>
  </section>`;
}

function planningIdeas() {
  return `<section class="planning-section planning-ideas" aria-label="Ideas">
    <details class="planning-starters"><summary>Starter suggestions</summary><ul>${STARTER_IDEAS.map((title, i) => `<li><span>${esc(title)}</span><button class="inline-link" data-planning-act="starter" data-id="${i}" aria-label="Add suggestion: ${esc(title)}">Add idea</button></li>`).join('')}</ul></details>
    <div class="planning-heading"><h2>Your ideas</h2><span>${S.planning.ideas.length} / 200</span></div>
    <div class="planning-idea-list">${S.planning.ideas.length ? S.planning.ideas.map((idea) => `<div class="planning-idea-row">
      <input type="checkbox" data-idea-select="${idea.id}" aria-label="Select idea: ${esc(idea.title)}"${selectedIdeas.has(idea.id) ? ' checked' : ''}${idea.taskId ? ' disabled' : ''}>
      <label class="planning-field" for="idea${idea.id}"><span>${idea.taskId ? 'Added to tasks' : 'Idea'}</span><input id="idea${idea.id}" data-idea-title="${idea.id}" maxlength="200" value="${esc(idea.title)}"${idea.taskId ? ' readonly' : ''}>${idea.taskId && !S.tasks.some((t) => String(t.id) === String(idea.taskId)) ? `<button class="inline-link" data-planning-act="idea-reopen" data-id="${idea.id}">Task removed. Return to idea</button>` : ''}</label>
      <button class="planning-icon" data-planning-act="idea-remove" data-id="${idea.id}" title="Remove idea" aria-label="Remove idea: ${esc(idea.title)}">${ICONS.close || '&#215;'}</button>
    </div>`).join('') : '<p>No ideas saved yet.</p>'}</div>
    <button class="btn btn-ghost" data-planning-act="ideas-convert" id="ideasConvert"${selectedIdeas.size ? '' : ' disabled'}>Make selected tasks${selectedIdeas.size ? ` (${selectedIdeas.size})` : ''}</button>
  </section>`;
}

function savePlanningMorning(date) {
  const draft = planningDraft('morning', date);
  if (!draft.feeling || !draft.win.trim()) { showNudge('Choose a feeling and a day win before saving.'); return false; }
  if (draft.priorities.length > 3) { showNudge('Choose up to three priorities.'); return false; }
  const morning = { feeling: draft.feeling, win: draft.win, priorities: draft.priorities.map(({ key, kind, id, title }) => ({ key, kind, id, title })), savedAt: new Date().toISOString() };
  if (!planningCommit(() => { S.planning.days[date] = { ...planningDay(date), morning }; if (S.planning.drafts) delete S.planning.drafts.morning[date]; })) return false;
  delete planningDrafts.morning[date];
  morningOpenDate = '';
  render(); showNudge('Morning saved.'); return true;
}

function savePlanningNight(date) {
  const draft = planningDraft('night', date);
  const previousNight = planningDay(date).night;
  if (!draft.feeling) { showNudge('Choose a feeling before saving.'); return false; }
  const priorities = planningDay(date).morning?.priorities || [];
  for (const p of priorities) {
    const o = draft.outcomes[p.key];
    if (!o?.status || (o.status !== 'completed' && !o.next)) { showNudge('Choose an outcome and a next step for each unfinished priority.'); return false; }
    if (o.status !== 'completed' && o.next === 'smaller' && !o.smaller?.trim()) { showNudge('Name the smaller step.'); return false; }
  }
  const night = { feeling: draft.feeling, helped: draft.helped, friction: draft.friction, response: draft.response, reflection: draft.reflection, outcomes: {}, savedAt: new Date().toISOString() };
  for (const p of priorities) {
    const o = draft.outcomes[p.key];
    night.outcomes[p.key] = { status: o.status, next: o.status === 'completed' ? '' : o.next, smaller: o.status !== 'completed' && o.next === 'smaller' ? o.smaller.trim() : '' };
  }
  if (!planningCommit(() => {
    for (const p of priorities) {
      const o = night.outcomes[p.key];
      const changed = previousNight?.outcomes?.[p.key]?.status !== o.status;
      const task = p.kind === 'task' && S.tasks.find(t => String(t.id) === String(p.id));
      if (task && changed) task.done = o.status === 'completed';
      if (changed && p.kind === 'habit' && S.habits.some(h => String(h.id) === String(p.id))) {
        const log = dlog(date);
        for (const key of ['done', 'min', 'skip']) log[key] = (log[key] || []).filter(id => String(id) !== String(p.id));
        const habit = S.habits.find(h => String(h.id) === String(p.id));
        log[o.status === 'completed' ? 'done' : o.status === 'partial' ? 'min' : 'skip'].push(habit.id);
        if (o.status === 'skipped') { delete log.completedAt?.[habit.id]; delete log.completionHours?.[habit.id]; }
        S.log[date] = log;
      }
      Arc90Planning.routePriority(S.planning, date, p, o.status === 'completed' ? 'drop' : o.next, o.smaller);
    }
    if (draft.remember) Arc90Planning.rememberResponse(S.planning, draft.friction, draft.response);
    S.planning.days[date] = { ...planningDay(date), night };
    if (S.planning.drafts) delete S.planning.drafts.night[date];
  })) return false;
  delete planningDrafts.night[date];
  render(); showNudge('Night saved.'); return true;
}

function convertPlanningIdeas() {
  const ideas = S.planning.ideas.filter((i) => selectedIdeas.has(i.id) && !i.taskId);
  if (!ideas.length) return false;
  if (ideas.some((i) => !i.title.trim())) { showNudge('Give each selected idea a title.'); return false; }
  if (!planningCommit(() => {
    if (!Number.isSafeInteger(S.taskSeq) || S.taskSeq < 0 || S.taskSeq >= Number.MAX_SAFE_INTEGER - ideas.length) S.taskSeq = 0;
    for (const idea of ideas) {
      let id;
      do { id = 't' + (++S.taskSeq); } while (S.tasks.some((t) => String(t.id) === id));
      S.tasks.push({ id, title: idea.title.trim(), horizon: 'short', goal_id: typeof arcGoalLink === 'function' ? arcGoalLink() : null, due: '', remind: false, done: false, notified: false, created: Date.now() });
      idea.taskId = id;
    }
  })) return false;
  selectedIdeas.clear(); render(); showNudge('Selected ideas added to tasks.'); return true;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-planning-act]');
  if (!button) return;
  const { planningAct: action, date, id } = button.dataset;
  if (date && (!Arc90Planning.validDate(date) || date > todayKey())) return;
  switch (action) {
    case 'task-edit': sheet = { type: 'planning-task', itemId: String(id) }; render(); break;
    case 'task-save': {
      const task = S.tasks.find(t => String(t.id) === String(id));
      const title = document.getElementById('editTaskTitle').value.trim();
      const due = document.getElementById('editTaskDue');
      if (!task || !title || title.length > 200) { showNudge('Enter a task title of 1 to 200 characters.'); break; }
      if (due.validity.badInput || (due.value && !Number.isFinite(new Date(due.value).getTime()))) { showNudge('Choose a valid deadline.'); break; }
      const previousDisplay = /^\d{4}-\d{2}-\d{2}$/.test(task.due || '') ? task.due + 'T09:00' : task.due || '';
      const deadlineChanged = due.value !== previousDisplay;
      if (planningCommit(() => { Object.assign(task, { title, ...(deadlineChanged ? { due: due.value, notified: false } : {}) }); S.brain.dirty = true; })) { sheet = null; render(); }
      break;
    }
    case 'workspace':
      arcWorkspace = id;
      if (tab === 'progress') render(); else switchTab('progress');
      break;
    case 'period': journalPeriod = id; render(); break;
    case 'morning-open': morningOpenDate = date; render(); document.getElementById('morningFeeling')?.focus(); break;
    case 'morning-save': savePlanningMorning(date); break;
    case 'night-save': savePlanningNight(date); break;
    case 'journal-open':
      arcWorkspace = 'journal'; journalPeriod = 'day'; practiceDate = null;
      if (button.dataset.period === 'morning') morningOpenDate = todayKey();
      if (tab === 'progress') render(); else switchTab('progress');
      document.getElementById(button.dataset.period === 'night' ? 'planningNight' : 'morningConsole')?.scrollIntoView({ block: 'start' });
      break;
    case 'week-save':
      if (planningCommit(() => { S.planning.weeks[button.dataset.week] = { change: document.getElementById('weekChange').value }; })) showNudge('Next-week change saved.');
      break;
    case 'forget-response':
      if (planningCommit(() => { delete S.planning.responses[button.dataset.key]; })) render();
      break;
    case 'ideas-add':
      if (planningCommit(() => Arc90Planning.addIdeas(S.planning, brainDumpDraft))) { brainDumpDraft = ''; render(); }
      break;
    case 'starter':
      if (planningCommit(() => Arc90Planning.addIdeas(S.planning, STARTER_IDEAS[Number(id)] || ''))) render();
      break;
    case 'idea-remove':
      if (planningCommit(() => { S.planning.ideas = S.planning.ideas.filter((i) => i.id !== Number(id)); })) { selectedIdeas.delete(Number(id)); render(); }
      break;
    case 'idea-reopen':
      if (planningCommit(() => {
        const idea = S.planning.ideas.find((i) => i.id === Number(id));
        if (idea && !S.tasks.some((t) => String(t.id) === String(idea.taskId))) idea.taskId = '';
      })) render();
      break;
    case 'ideas-convert': convertPlanningIdeas(); break;
  }
});

document.addEventListener('input', (event) => {
  const el = event.target, data = el.dataset;
  if (!data) return;
  if (data.planningPeriod && data.planningField && Arc90Planning.validDate(data.date)) {
    const draft = planningDraft(data.planningPeriod, data.date);
    draft[data.planningField] = el.type === 'checkbox' ? el.checked : el.value;
    draft.dirty = true;
    const status = el.closest('.planning-section')?.querySelector('.planning-draft-status');
    if (status) status.textContent = 'Changes are not saved yet.';
    if (data.planningField === 'friction') document.getElementById('planningRemembered').innerHTML = planningRemembered(el.value);
  }
  if (data.planningOutcome && data.outcomeField === 'smaller') {
    const draft = planningDraft('night', data.date);
    draft.outcomes[data.planningOutcome] ||= {};
    draft.outcomes[data.planningOutcome].smaller = el.value;
    draft.dirty = true;
    const status = el.closest('.planning-section')?.querySelector('.planning-draft-status');
    if (status) status.textContent = 'Changes are not saved yet.';
  }
  if (el.id === 'brainDump') brainDumpDraft = el.value;
  if (data.planningPeriod || data.planningOutcome) {
    const saved = persistPlanningDrafts(data.planningPeriod || 'night', data.date);
    const status = el.closest('.planning-section')?.querySelector('.planning-draft-status');
    if (status) status.textContent = saved ? 'Draft saved on this device.' : 'Draft not saved. Keep this page open.';
  }
});

document.addEventListener('change', (event) => {
  const el = event.target, data = el.dataset;
  if (!data) return;
  if (el.id === 'journalHistory' && Arc90Planning.validDate(el.value) && el.value <= todayKey()) { practiceDate = el.value; render(); }
  if (data.planningPriority) {
    const draft = planningDraft('morning', data.date);
    if (el.checked && draft.priorities.length >= 3) { el.checked = false; showNudge('Three is enough. Uncheck a priority to choose another.'); return; }
    const choice = planningOptions(data.date).find((p) => p.key === data.planningPriority);
    if (el.checked && choice) draft.priorities.push({ ...choice });
    else draft.priorities = draft.priorities.filter((p) => p.key !== data.planningPriority);
    draft.dirty = true;
    document.getElementById('priorityCount').textContent = `${draft.priorities.length} / 3`;
    const status = el.closest('.planning-section')?.querySelector('.planning-draft-status');
    if (status) status.textContent = 'Changes are not saved yet.';
  }
  if (data.planningOutcome && data.outcomeField !== 'smaller') {
    const draft = planningDraft('night', data.date);
    draft.outcomes[data.planningOutcome] ||= {};
    draft.outcomes[data.planningOutcome][data.outcomeField] = el.value;
    draft.dirty = true;
    const focus = el.id; render(); document.getElementById(focus)?.focus({ preventScroll: true });
  }
  if (data.ideaTitle) planningCommit(() => {
    const idea = S.planning.ideas.find((i) => i.id === Number(data.ideaTitle));
    if (idea && !idea.taskId) idea.title = el.value.slice(0, 200);
  });
  if (data.planningPriority || data.planningOutcome) persistPlanningDrafts(data.planningPriority ? 'morning' : 'night', data.date);
  if (data.ideaSelect) {
    if (el.checked) selectedIdeas.add(Number(data.ideaSelect)); else selectedIdeas.delete(Number(data.ideaSelect));
    const button = document.getElementById('ideasConvert');
    button.disabled = !selectedIdeas.size;
    button.textContent = `Make selected tasks${selectedIdeas.size ? ` (${selectedIdeas.size})` : ''}`;
  }
});

'use strict';

let brainStage = 'dump';
let brainRange = 'week';
let brainView = 'map';
let brainBusy = false;
let brainMessage = '';
let brainSelected = null;
let brainExpanded = false;
let brainZoom = 1;
let brainMapMode = 'overview';
let brainLayoutCache = null;
let brainScrollKey = '';
let brainScrollLeft = null;
let brainRevealKey = '';
const BRAIN_HORIZONS = { short: 'Short term', mid: 'Mid term', long: 'Long term', unsorted: 'Unsorted' };
const BRAIN_TYPES = { goal: 'Goal', task: 'Task', habit: 'Habit candidate' };
const BRAIN_FREQUENCIES = { daily: 'Daily', weekdays: 'Weekdays', weekends: 'Weekends', weekly: 'Weekly (Sunday)' };
const brainId = () => crypto.randomUUID();
function brainDraft() { return S.brain.drafts.find(d => d.id === S.brain.activeDraftId) || null; }
function brainPersist() {
  try { save(); return true; }
  catch (_) { brainMessage = 'Not saved. Keep this page open and export your data before closing.'; return false; }
}
function brainAtomic(change) {
  const before = { brain: structuredClone(S.brain), habits: structuredClone(S.habits), tasks: structuredClone(S.tasks), ...(S.log ? { log: structuredClone(S.log) } : {}) };
  try { change(); S.brain.dirty = true; save(); brainLayoutCache = null; return true; }
  catch (error) { Object.assign(S, before); brainMessage = error.message || 'Could not save changes.'; return false; }
}
function brainNewDraft() {
  const draft = { id: brainId(), raw_text: '', status: 'draft', created_at: new Date().toISOString(), items: [], ids: {} };
  S.brain.drafts.unshift(draft); S.brain.activeDraftId = draft.id;
  brainStage = 'dump'; brainMessage = ''; brainPersist();
  return draft;
}
function brainOptions(values, current) {
  return Object.entries(values).map(([id, title]) => `<option value="${esc(id)}"${id === current ? ' selected' : ''}>${esc(title)}</option>`).join('');
}
function viewBrainDump() {
  return `${brandbar()}<header class="topbar"><div><h1>Brain Dump</h1><div class="sub">Make room for what matters.</div></div></header>${brainWorkspaceContent()}`;
}
function brainWorkspaceContent() {
  const draft = brainDraft();
  return `<nav class="brain-tabs" aria-label="Brain Dump stages">${[['dump', 'Dump'], ['sort', 'Review']].map(([id, title]) => `<button data-brain-act="stage" data-id="${id}" aria-current="${brainStage === id ? 'page' : 'false'}">${title}</button>`).join('')}</nav>
    <p class="brain-status" id="brainStatus" role="status">${esc(brainMessage)}</p>
    ${brainStage === 'dump' ? brainDumpInput(draft) : brainReview(draft)}
    <details class="brain-cloud"><summary>Cloud backup</summary><p>${S.brain.dirty ? 'Local changes waiting to sync.' : 'Saved on this device.'}</p><div class="brain-actions"><button data-brain-act="sync" ${brainBusy ? 'disabled' : ''}>Save to cloud</button><button data-brain-act="load-cloud" ${brainBusy ? 'disabled' : ''}>Load my cloud map</button></div></details>`;
}
function brainDumpInput(draft) {
  if (draft?.status === 'sorted') {
    const count = (draft.items || []).length;
    return `<section class="brain-input brain-saved" aria-label="Capture saved"><span class="brain-saved-mark" aria-hidden="true">✓</span><h2>Saved to your map</h2><p>${count} ${count === 1 ? 'item' : 'items'} from this capture ${count === 1 ? 'is' : 'are'} on your map.</p>
      <div class="brain-actions"><button class="btn" data-brain-act="new">New capture</button><button data-brain-act="stage" data-id="map">Open map</button></div>
      <details class="brain-saved-text"><summary>What you wrote</summary><p>${esc(draft.raw_text || '')}</p></details></section>${brainHistory()}`;
  }
  return `<section class="brain-input" aria-label="Brain dump input"><label class="sr-only" for="brainText">Everything on your mind</label>
    <textarea id="brainText" rows="9" maxlength="20000" placeholder="Write everything on your mind, one idea after another. For example: I want to finish LVN school, I want to go to the gym, sell my car."${draft?.status === 'sorted' ? ' readonly' : ''}>${esc(draft?.raw_text || '')}</textarea>
    <div class="brain-actions"><button class="btn" id="brainSort" data-brain-act="sort" ${brainBusy || !draft?.raw_text?.trim() || draft.status === 'sorted' ? 'disabled' : ''}>${brainBusy ? 'Sorting...' : 'Sort it'}</button><button data-brain-act="new">New dump</button>${typeof (window.SpeechRecognition || window.webkitSpeechRecognition) === 'function' ? `<button data-brain-act="dictate" aria-label="Dictate brain dump" title="Dictate">${ICONS.mic}</button>` : ''}</div>
    ${draft?.status !== 'sorted' ? `<button id="brainManualSort" data-brain-act="sort-manual" ${brainBusy || !draft?.raw_text?.trim() ? 'disabled' : ''}>Review manually</button>` : '<button data-brain-act="stage" data-id="map">Open map</button>'}
    <p class="brain-note">Sort it splits your ideas into goals, habits and tasks for you to review. Signed in, it uses AI and sends this text and your goal titles to the AI service; otherwise it sorts on this device.</p></section>
    ${brainHistory()}`;
}
function brainHistory() {
  return `<section class="brain-history"><h2>Past captures</h2>${S.brain.drafts.length ? S.brain.drafts.map(d => { const n = (d.items || []).length; return `<button data-brain-act="history" data-id="${esc(d.id)}"><span>${esc(new Date(d.created_at).toLocaleDateString())}</span><span>${n} ${n === 1 ? 'item' : 'items'} · ${d.status === 'sorted' ? 'Saved' : 'Draft'}</span></button>`; }).join('') : '<p>No captures yet.</p>'}</section>`;
}
function brainParentOptions(item, draft) {
  const choices = { '': 'No goal link' };
  const permits = horizon => item.type === 'habit' ? ['short', 'mid'].includes(horizon) : item.horizon === 'short' ? horizon === 'mid' : item.horizon === 'mid' ? horizon === 'long' : false;
  for (const goal of S.brain.goals.filter(g => g.status === 'active' && permits(g.horizon))) choices[`existing:${goal.id}`] = goal.title;
  for (const goal of draft.items.filter(g => g.type === 'goal' && g.temp_id !== item.temp_id && permits(g.horizon))) choices[`new:${goal.temp_id}`] = goal.title;
  return brainOptions(choices, item.parent_goal_id ? `existing:${item.parent_goal_id}` : item.parent_temp_id ? `new:${item.parent_temp_id}` : '');
}
function brainReview(draft) {
  if (!draft?.items?.length) return '<section class="brain-empty"><h2>Nothing to review yet</h2><button class="btn" data-brain-act="stage" data-id="dump">Write a capture</button></section>';
  if (draft.status === 'sorted') return '<section class="brain-empty"><h2>This capture is on your map</h2><button class="btn" data-brain-act="stage" data-id="map">Open map</button> <button data-brain-act="new">New capture</button></section>';
  return `<div class="brain-review">${['unsorted', 'short', 'mid', 'long'].filter(h => draft.items.some(i => i.horizon === h)).map(h => `<section><h2>${BRAIN_HORIZONS[h]}</h2>${draft.items.filter(i => i.horizon === h).map(item => `<article class="brain-review-item" data-review-id="${esc(item.temp_id)}">
    <label>Title<input value="${esc(item.title)}" maxlength="120" data-brain-field="title" data-id="${esc(item.temp_id)}" aria-label="Title: ${esc(item.title)}"></label>
    <div class="brain-field-row"><label>Type<select data-brain-field="type" data-id="${esc(item.temp_id)}">${brainOptions(BRAIN_TYPES, item.type)}</select></label><label>Horizon<select data-brain-field="horizon" data-id="${esc(item.temp_id)}">${brainOptions(BRAIN_HORIZONS, item.horizon)}</select></label></div>
    <label>Supports<select data-brain-field="parent" data-id="${esc(item.temp_id)}">${brainParentOptions(item, draft)}</select></label>
    ${item.type === 'habit' ? `<label>Frequency<select data-brain-field="frequency" data-id="${esc(item.temp_id)}">${brainOptions(BRAIN_FREQUENCIES, item.frequency || 'daily')}</select></label><button data-brain-act="candidate" data-id="${esc(item.temp_id)}" aria-pressed="${!!item.includeHabit}">${item.includeHabit ? 'Included when you save' : 'Add to my 90-day arc'}</button>` : ''}
    <div class="brain-item-footer"><details><summary>Original words</summary><p>${esc(item.excerpt || '')}</p></details><button data-brain-act="remove" data-id="${esc(item.temp_id)}" aria-label="Delete ${esc(item.title)}" title="Delete item">${ICONS.close || '&#215;'}</button></div>
    </article>`).join('')}</section>`).join('')}<div class="brain-review-save"><button class="btn" data-brain-act="save-map">Save to map</button><span>Only confirmed habit candidates join your arc.</span></div></div>`;
}
async function brainConnection() {
  const token = await window.arc90Auth?.getAccessToken();
  if (!token) throw new Error('Sign in from You to use AI sorting or cloud backup. Manual sorting is available.');
  const response = await fetch('/api/auth-config', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Cloud connection is unavailable. Your draft stays on this device.');
  const cfg = await response.json();
  const headers = { apikey: cfg.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const auth = await fetch(`${cfg.url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(10000) });
  if (!auth.ok) throw new Error('Please sign in again.');
  const user = await auth.json();
  if (S.brain.cloudOwner && S.brain.cloudOwner !== user.id) throw new Error('This local map belongs to another account. Sign in with that account before syncing.');
  return { ...cfg, headers, userId: user.id };
}
async function brainSort(manual = false) {
  const draft = brainDraft();
  if (brainBusy || !draft?.raw_text.trim() || draft.status === 'sorted') return;
  const text = draft.raw_text; brainBusy = true; brainMessage = ''; render();
  const brainState = S.brain;
  let items, message;
  try {
    if (manual) throw new Error('Manual review.');
    const cfg = await brainConnection();
    const response = await fetch(`${cfg.url}/functions/v1/categorize-brain-dump`, { method: 'POST', headers: cfg.headers,
      body: JSON.stringify({ text, existing_goals: S.brain.goals.filter(g => g.status === 'active').map(({ id, title, horizon }) => ({ id, title, horizon })) }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(response.status === 429 ? 'Daily AI limit reached.' : 'AI sorting is unavailable.');
    items = Arc90Brain.validateResponse(await response.json(), S.brain.goals).items;
    message = 'Suggestions only. Review every item before saving.';
  } catch (error) {
    items = brainSuggestParents(Arc90Brain.suggest(text).items);
    items.forEach(item => { if (item.type === 'habit') item.includeHabit = true; });
    const why = manual || /Sign in/.test(error.message) ? '' : ` ${error.message}`;
    message = `Sorted on this device.${why} Check each item, then save.`;
  } finally {
    brainBusy = false;
    if (S.brain === brainState && S.brain.drafts.includes(draft) && draft.raw_text === text && draft.status !== 'sorted') {
      draft.items = items;
      if (S.brain.activeDraftId === draft.id) { brainStage = 'sort'; brainMessage = message; }
      brainPersist();
    }
    if (tab === 'brain' || tab === 'progress') render();
  }
}
// Link each sorted idea to a goal it clearly serves: a new goal from the same capture or an
// existing one, respecting horizons. Only a single clear match is linked; Review can change it.
function brainSuggestParents(items) {
  const above = { short: 'mid', mid: 'long' };
  const existing = S.brain.goals.filter(g => g.status === 'active');
  for (const item of items) {
    if (item.parent_temp_id || item.parent_goal_id) continue;
    const allowed = item.type === 'habit' ? ['short', 'mid'] : above[item.horizon] ? [above[item.horizon]] : [];
    if (!allowed.length) continue;
    const candidates = [
      ...items.filter(g => g !== item && g.type === 'goal' && allowed.includes(g.horizon)).map(g => ({ id: `new:${g.temp_id}`, title: `${g.title} ${g.excerpt}` })),
      ...existing.filter(g => allowed.includes(g.horizon)).map(g => ({ id: `old:${g.id}`, title: g.title })),
    ];
    const match = brainSuggestGoal(`${item.title} ${item.excerpt}`, candidates);
    if (match?.id.startsWith('new:')) item.parent_temp_id = match.id.slice(4);
    else if (match) item.parent_goal_id = match.id.slice(4);
  }
  return items;
}
function brainCommitReview() {
  const draft = brainDraft();
  if (!draft || draft.status === 'sorted') return;
  try {
    if (!draft.items.length) throw new Error('Keep at least one item to save.');
    if (draft.items.some(item => item.horizon === 'unsorted')) throw new Error('Choose Short term, Mid term or Long term for every item before saving.');
    if (draft.items.some(item => !item.title.trim() || item.title.trim().split(/\s+/).length > 8)) throw new Error('Give every item a title of 1 to 8 words.');
    const reviewed = Arc90Brain.validateResponse({ items: draft.items.map(({ includeHabit, ...item }) => item) }, S.brain.goals).items;
    const included = new Set(draft.items.filter(i => i.includeHabit).map(i => i.temp_id));
    const old = structuredClone(S.brain);
    const success = brainAtomic(() => {
      draft.ids ||= {};
      for (const item of reviewed) draft.ids[item.temp_id] ||= brainId();
      const parent = i => i.parent_goal_id || (i.parent_temp_id ? draft.ids[i.parent_temp_id] : null);
      for (const item of reviewed) {
        const id = draft.ids[item.temp_id];
        if (item.type === 'goal') S.brain.goals.push({ id, title: item.title, horizon: item.horizon, parent_goal_id: parent(item), status: 'active', created_at: new Date().toISOString(), source_dump_id: draft.id });
        if (item.type === 'task') S.tasks.push({ id, title: item.title, horizon: item.horizon, goal_id: parent(item), done: false, due: '', remind: false, notified: false, created: Date.now(), source_dump_id: draft.id });
        if (item.type === 'habit' && included.has(item.temp_id)) {
          if (S.habits.length >= 100) throw new Error('Your arc already has 100 habits. Remove one before adding another.');
          S.habits.push({ id, name: item.title, cat: 'custom', emoji: '', min: '2-minute version', rhythm: ({ weekdays: 'weekdays', weekends: 'weekends', weekly: 'weekly' })[item.frequency] || 'daily', goal_id: parent(item), source_dump_id: draft.id });
        }
      }
      draft.status = 'sorted';
    });
    if (success) { arcWorkspace = 'map'; brainStage = 'dump'; brainMessage = 'Saved on this device. Cloud backup is optional.'; if (tab === 'brain') tab = 'progress'; }
    else S.brain = old;
  } catch (error) { brainMessage = error.message; }
  render();
}
function brainWindow(range = brainRange) {
  const now = atMidnight(operationalDate());
  const start = range === 'arc' ? S.profile.start || todayKey() : dkey(addDays(now, range === 'month' ? -29 : -((now.getDay() + 6) % 7)));
  return { start, end: range === 'arc' ? [todayKey(), dkey(addDays(new Date(start + 'T00:00:00'), 89))].sort()[0] : todayKey() };
}
function brainData() {
  const data = Arc90Brain.alignment({ goals: S.brain.goals, habits: S.habits, tasks: S.tasks, log: S.log, ...brainWindow() });
  const week = Arc90Brain.alignment({ goals: S.brain.goals, habits: S.habits, tasks: S.tasks, log: S.log, start: dkey(addDays(atMidnight(operationalDate()), -6)), end: todayKey() });
  return { ...data, neglectedGoals: week.neglectedGoals };
}
function brainRangeLabel() {
  const { start, end } = brainWindow();
  const fmt = key => new Date(key + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}
// Display-only goal label: drop "I want to"-style lead-ins so charts stay readable.
// The saved title is never changed; sheets and lists still show it in full.
function brainGoalLabel(title) {
  const text = String(title || '').trim().replace(/^(i\s+(really\s+)?(want|need|would like|'d like|plan|hope|have)\s+to|i\s+will|i'm\s+going\s+to|i\s+am\s+going\s+to|my\s+goal\s+is\s+to)\s+/i, '');
  return text ? text[0].toUpperCase() + text.slice(1) : String(title || '');
}

// Link suggestions: shared words or closely related concepts between a habit/task and a goal.
// Only a single clear winner is suggested, and nothing links until the person taps.
const BRAIN_CONCEPTS = [
  ['study', 'school', 'class', 'exam', 'test', 'lvn', 'rn', 'nurse', 'nursing', 'lecture', 'homework', 'flashcard', 'teas', 'nclex', 'pharmacology', 'course', 'learn'],
  ['video', 'youtube', 'clip', 'edit', 'upload', 'channel', 'content', 'film', 'record', 'thumbnail', 'vlog', 'tiktok'],
  ['run', 'marathon', 'race', 'jog', 'training', 'mile', 'miles', '5k', '10k'],
  ['gym', 'workout', 'lift', 'strength', 'fitness', 'muscle', 'train', 'lean', 'leaner', 'fit', 'health', 'healthy', 'healthier'],
  ['money', 'fund', 'save', 'savings', 'budget', 'debt', 'invest', 'spend', 'emergency'],
  ['read', 'book', 'pages', 'novel', 'chapter'],
  ['write', 'writing', 'journal', 'blog', 'book', 'author'],
  ['sleep', 'bed', 'bedtime', 'rest'],
  ['water', 'hydrate', 'hydration', 'drink'],
  ['meditate', 'meditation', 'breathe', 'mindful', 'affirmation', 'gratitude', 'pray', 'prayer'],
  ['business', 'client', 'clients', 'sales', 'launch', 'startup', 'product', 'customers'],
  ['code', 'coding', 'program', 'developer', 'app', 'build'],
];
const BRAIN_STOP = new Set(('i a an the to of on in for and or my me be is am are was get got do does did make start finish keep more less every each day daily week weekly one two three minutes minute hour hours want need will would like going go into out up with by at from this that it its your you our we'.split(' ')));
function brainTerms(text) {
  const terms = new Set();
  for (let word of String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (BRAIN_STOP.has(word) || word.length < 2) continue;
    word = word.replace(/(ing|ed|es|s)$/, '') || word;
    terms.add(word);
    BRAIN_CONCEPTS.forEach((group, i) => { if (group.some(term => term === word || term.replace(/(ing|ed|es|s)$/, '') === word)) terms.add(`#${i}`); });
  }
  return terms;
}
function brainSuggestGoal(text, goals) {
  const mine = brainTerms(text);
  const scored = goals.map(goal => { const theirs = brainTerms(goal.title); let score = 0; for (const term of mine) if (theirs.has(term)) score += term.startsWith('#') ? 1 : 2; return { goal, score }; }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.length && (scored.length === 1 || scored[0].score > scored[1].score) ? scored[0].goal : null;
}
function brainLinkTargets(kind, item) {
  const parentHorizon = { short: 'mid', mid: 'long' }[item.horizon || 'short'];
  return S.brain.goals.filter(g => g.status === 'active' && (kind === 'task' ? g.horizon === parentHorizon : g.horizon !== 'long'));
}

// Goals without a parent, and the goal they would roll up to when the choice is clear.
function brainRollups() {
  const active = S.brain.goals.filter(g => g.status === 'active');
  // Only suggest a parent whose meaning matches; being the only option is not a reason.
  return active.filter(g => g.horizon !== 'long' && !g.parent_goal_id).map(goal => {
    const options = active.filter(p => p.horizon === ({ short: 'mid', mid: 'long' })[goal.horizon]);
    return { goal, options, parent: brainSuggestGoal(goal.title, options) };
  }).filter(r => r.options.length && (r.parent || r.goal.horizon === 'mid'));
}
function brainRollupCard() {
  const hasLong = S.brain.goals.some(g => g.status === 'active' && g.horizon === 'long');
  const rollups = brainRollups();
  if (hasLong && !rollups.length) return '';
  return `<section class="brain-rollup" aria-labelledby="brainRollupTitle"><header><h2 id="brainRollupTitle">${hasLong ? 'Connect your goals' : 'Add your big-picture goal'}</h2><p>${hasLong ? 'These goals do not roll up to anything yet. Connect them so every rep counts toward your vision.' : 'Your goals are steps. A long-term goal, like "Become an RN", is what they add up to.'}</p></header>
    ${hasLong ? '' : '<button class="btn" data-brain-act="goal-new" data-horizon="long">Add a long-term goal</button>'}
    ${rollups.length ? `<ul>${rollups.map(r => `<li><span><b>${esc(brainGoalLabel(r.goal.title))}</b><small>${r.parent ? `Rolls up to ${esc(brainGoalLabel(r.parent.title))}?` : `Choose what it supports`}</small></span>${r.parent ? `<button data-brain-act="goal-parent" data-id="${esc(r.goal.id)}" data-parent="${esc(r.parent.id)}">Connect</button>` : `<button data-brain-act="goal-edit" data-id="${esc(r.goal.id)}">Choose</button>`}</li>`).join('')}</ul>` : ''}</section>`;
}
// Habits grouped by the top-level goal they feed, in the same colors as the Arc flow.
// Used by Today and Habits so every screen tells the same goal story.
function brainHabitGroups() {
  const flow = brainFlow(brainData());
  const groups = flow.purpose.filter(p => p.id !== 'no-purpose').map(p => ({ id: p.id, goalId: p.actId.replace(/^goal:/, ''), title: p.title, tone: p.tone, habits: [] }));
  const unlinked = [];
  for (const habit of S.habits) {
    const leaf = flow.leaves.find(l => l.id === `habit:${habit.id}`);
    const group = leaf && groups.find(g => g.id === leaf.root);
    if (group) group.habits.push(habit); else unlinked.push(habit);
  }
  return { groups: groups.filter(g => g.habits.length), unlinked };
}
// A single allocation bar: the same purpose split as the flow, readable at a glance.
function brainAllocation(data) {
  if (!data.total) return '';
  const parts = brainFlow(data).purpose.filter(p => p.value > 0);
  const lead = parts.find(p => p.id !== 'no-purpose');
  return `<div class="brain-alloc"><div class="brain-alloc-bar" role="img" aria-label="${esc(parts.map(p => `${p.title} ${Math.round(p.value / data.total * 100)} percent`).join(', '))}">${parts.map(p => `<i class="${p.id === 'no-purpose' ? 'brain-alloc-none' : ''}" style="flex:${p.value};background:${p.id === 'no-purpose' ? '' : p.tone}"></i>`).join('')}</div>
    <p>${lead ? `Most of your reps fed <b style="color:${lead.tone}">${esc(lead.title)}</b>.` : 'None of these reps are linked to a goal yet.'}</p></div>`;
}
function brainStart(data) {
  const linked = S.habits.some(h => !data.orphans.includes(String(h.id)));
  const repped = Object.values(S.log || {}).some(day => (day?.done || []).length || (day?.min || []).length);
  const steps = [
    [S.brain.goals.length > 0, 'Add a goal', 'Name what this arc is for.', '<button class="btn" data-brain-act="goal-new">Add a goal</button>'],
    [linked, 'Link a habit', 'Connect a daily habit to a goal.', S.habits.length ? `<button data-brain-act="link-habit" data-id="${esc(S.habits[0].id)}">Link a habit</button>` : '<button data-act="tab" data-id="habits">Add a habit</button>'],
    [repped, 'Complete your first rep', 'Check off a habit on Today.', '<button data-act="tab" data-id="today">Open Today</button>'],
  ];
  const next = steps.findIndex(step => !step[0]);
  return `<section class="arc-start" aria-labelledby="arcStartTitle"><div class="arc-start-art" aria-hidden="true"><i></i><i></i><i></i></div><h2 id="arcStartTitle">Map your first 90 days</h2><p>See exactly where your effort goes, and which goals it moves.</p>
    <ol>${steps.map(([done, title, text, action], i) => `<li class="${done ? 'done' : i === next ? 'next' : ''}"><span class="arc-step-dot" aria-hidden="true">${done ? '✓' : i + 1}</span><div><b>${title}</b><small>${done ? 'Done' : text}</small></div>${!done && i === next ? action : ''}</li>`).join('')}</ol></section>`;
}
function brainReps(n) { return `${n} ${n === 1 ? 'rep' : 'reps'}`; }
function brainOrphanRow(kind, item, title, meta) {
  const suggestion = brainSuggestGoal(title, brainLinkTargets(kind, item));
  return `<div class="brain-orphan-row"><button data-brain-act="link-${kind}" data-id="${esc(item.id)}" class="brain-orphan-habit"><span><b>${esc(title)}</b><small>${esc(meta)}</small></span>${suggestion ? '' : '<span class="brain-orphan-link">Link</span>'}</button>${suggestion ? `<button class="brain-suggest" data-brain-act="suggest-link" data-kind="${kind}" data-id="${esc(item.id)}" data-goal="${esc(suggestion.id)}" aria-label="Link ${esc(title)} to ${esc(suggestion.title)}"><span>Suggested</span><b>${esc(brainGoalLabel(suggestion.title))}</b><i>Link</i></button>` : ''}</div>`;
}
function brainAlignment() {
  const data = brainData();
  if (!S.brain.goals.length || !S.habits.length) return `<section class="brain-alignment">${brainStart(data)}</section>`;
  const linked = data.total ? `${Math.round(data.aligned / data.total * 100)}%` : '--';
  const unlinkedTasks = S.tasks.filter(t => !t.done && !t.goal_id);
  const orphanHabits = data.orphans.map(id => S.habits.find(h => String(h.id) === String(id))).filter(Boolean);
  return `<section class="brain-alignment">
    <div class="brain-map-frame">
      <header class="brain-map-intro"><div><h2>Where your effort went</h2><p>${esc(brainRangeLabel())}</p></div><div class="brain-map-total"><strong>${data.total}</strong><span>${data.total === 1 ? 'rep' : 'reps'} completed</span></div></header>
      ${brainAllocation(data)}
      <dl class="brain-stats">${[[linked, 'Linked to a goal'], [data.activeGoals, 'Goals moving'], [data.neglectedGoals, 'Idle 7 days'], [data.orphanHabits, 'Unlinked habits']].map(([value, title]) => `<div><dd>${value}</dd><dt>${title}</dt></div>`).join('')}</dl>
      <div class="brain-controls"><div class="brain-segment" role="group" aria-label="Alignment period">${[['week', 'Week'], ['month', '30 days'], ['arc', '90 days']].map(([id, label]) => `<button data-brain-act="range" data-id="${id}" aria-pressed="${brainRange === id}">${label}</button>`).join('')}</div><div class="brain-segment" role="group" aria-label="Map layout">${[['overview', 'Flow'], ['path', 'Levels'], ['list', 'List']].map(([id, label]) => `<button data-brain-act="${id === 'list' ? 'view' : 'map-mode'}" data-id="${id === 'list' ? 'list' : id}" aria-pressed="${id === 'list' ? brainView === 'list' : brainView === 'map' && brainMapMode === id}">${label}</button>`).join('')}</div></div>
      <p class="brain-status" role="status">${esc(brainMessage)}</p>
      ${brainView === 'map' ? brainMap(data) : brainList(data)}
      <footer class="brain-map-footer"><span>${data.aligned} of ${data.total} reps linked</span><button data-brain-act="goal-new">Add a goal</button></footer>
    </div>
    ${brainRollupCard()}
    ${orphanHabits.length || unlinkedTasks.length ? `<section class="brain-orphans" aria-labelledby="brainOrphansTitle"><header><h2 id="brainOrphansTitle">Needs a purpose</h2><span>${orphanHabits.length + unlinkedTasks.length}</span></header>
      ${orphanHabits.map(h => brainOrphanRow('habit', h, h.name, `Habit · ${brainReps(data.activity[String(h.id)]?.length || 0)} in period`)).join('')}
      ${unlinkedTasks.map(t => brainOrphanRow('task', t, t.title, 'Task')).join('')}
      </section>` : '<p class="brain-all-linked">Every habit and open task feeds a goal.</p>'}</section>`;
}
function brainList(data) {
  return `<div class="brain-list">${['Long term', 'Mid term', 'Short term', 'Daily habits'].map((title, column) => `<section><h2>${title}</h2>${data.nodes.filter(n => n.column === column).map(n => `<button data-brain-act="node" data-id="${esc(n.id)}"><span>${esc(n.title)}</span><span>${Math.round(n.percent || 0)}% · ${n.value} completions</span></button>`).join('') || '<p>No items yet.</p>'}</section>`).join('')}<section><h2>Connections</h2>${data.links.map((l, i) => `<button data-brain-act="link" data-id="${i}">${esc(data.nodes.find(n => n.id === l.target)?.title || '')} supports ${esc(data.nodes.find(n => n.id === l.source)?.title || '')}</button>`).join('') || '<p>No connections yet.</p>'}</section></div>`;
}
function brainOverview(data) {
  const children = new Set(data.links.map(link => link.target));
  const roots = data.nodes.filter(node => (node.kind === 'goal' && !children.has(node.id)) || node.id === 'no-purpose');
  return {
    nodes: [{ id: 'effort-total', title: 'Your effort', kind: 'total', column: 0, value: data.total, percent: 100 }, ...roots.map(node => ({ ...node, horizonColumn: node.column, column: 1 }))],
    links: roots.map(node => ({ source: 'effort-total', target: node.id, value: node.value, overview: true })),
  };
}
function brainGraph(data, mode = brainMapMode) {
  const key = JSON.stringify([data.nodes, data.links, brainExpanded, mode]);
  if (brainLayoutCache?.key === key) return brainLayoutCache.graph;
  const overview = mode === 'overview', input = overview ? brainOverview(data) : data;
  let nodes = input.nodes.map(n => ({ ...n }));
  const replacements = new Map();
  if (!brainExpanded) for (let col = 0; col < 4; col++) {
    const group = nodes.filter(n => n.column === col && n.id !== 'no-purpose').sort((a, b) => b.value - a.value);
    const limit = overview ? 5 : 6;
    if (group.length > limit) {
      const rest = group.slice(limit - 1), id = `more-${col}`;
      rest.forEach(n => replacements.set(n.id, id));
      nodes = nodes.filter(n => !rest.includes(n));
      nodes.push({ id, title: `+${rest.length} more`, column: col, kind: 'more', members: rest.map(n => n.id), value: rest.reduce((s, n) => s + n.value, 0), percent: rest.reduce((s, n) => s + n.percent, 0) });
    }
  }
  const grouped = new Map();
  input.links.forEach((l, i) => {
    const source = replacements.get(l.source) || l.source, target = replacements.get(l.target) || l.target;
    if (source === target) return;
    const id = `${source}|${target}`;
    if (!grouped.has(id)) grouped.set(id, { source, target, value: 0, indexes: [], overview });
    const link = grouped.get(id); link.value += l.value; link.indexes.push(i);
  });
  const links = [];
  // Route a direct link through empty horizons without running across another node's label lane.
  for (const link of grouped.values()) {
    let source = link.source;
    const from = nodes.find(node => node.id === source), to = nodes.find(node => node.id === link.target);
    for (let column = from.column + 1; column < to.column; column++) {
      const id = `relay:${link.source}:${link.target}:${column}`;
      nodes.push({ id, column, kind: 'relay', title: to.title, value: link.value, origin: link.source, destination: link.target });
      links.push({ ...link, source, target: id }); source = id;
    }
    links.push({ ...link, source });
  }
  const columns = overview ? [0, 1] : [0, 1, 2, 3];
  const height = Math.max(overview ? 320 : 380, ...columns.map(col => nodes.filter(n => n.column === col).length * 70 + 110));
  const width = overview ? 360 : 1220;
  const anchors = columns.map(column => ({ id: `anchor-${column}`, column, hidden: true, fixedValue: .000001 }));
  const graph = d3.sankey().nodeId(n => n.id).nodeAlign(n => n.column).nodeWidth(8).nodePadding(52).iterations(24)
    .nodeSort((a, b) => Number(a.hidden || a.id === 'no-purpose') - Number(b.hidden || b.id === 'no-purpose') || (overview ? b.actualValue - a.actualValue : 0))
    .extent([[overview ? 87 : 132, 64], [overview ? 210 : 1078, height - 26]])({
    nodes: [...nodes.map(n => ({ ...n, actualValue: n.value, fixedValue: Math.max(n.value, .001) })), ...anchors],
    links: [...links, ...columns.slice(0, -1).map(i => ({ source: `anchor-${i}`, target: `anchor-${i + 1}`, value: .000001, hidden: true }))],
  });
  graph.links.forEach(link => { link.planned = !link.hidden && link.value === 0; });
  graph.nodes.forEach(node => { node.exit = node.x1 + (!overview && node.column > 0 && node.column < 3 ? 150 : 0); });
  graph.height = height; graph.width = width; graph.mode = mode;
  brainLayoutCache = { key, graph }; return graph;
}
function brainPathIds(data, selected) {
  const ids = new Set([selected]);
  for (const direction of ['up', 'down']) {
    const pending = [selected], seen = new Set();
    while (pending.length) {
      const id = pending.pop(); if (seen.has(id)) continue; seen.add(id);
      data.links.filter(l => (direction === 'up' ? l.target : l.source) === id).forEach(l => { const next = direction === 'up' ? l.source : l.target; ids.add(next); pending.push(next); });
    }
  }
  return ids;
}
function brainMapLines(title, limit, max = 3) {
  const words = String(title || '').trim().split(/\s+/), lines = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + word).length <= limit) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word.length > limit ? word.slice(0, limit - 1) + '…' : word);
  }
  if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, '') + '…'; }
  return lines;
}
function brainMapTitle(title, limit) {
  const value = String(title || '').trim();
  if (value.length <= limit) return [value];
  let cut = value.lastIndexOf(' ', limit + 1);
  if (cut < 1) return [value.slice(0, limit - 1) + '…'];
  const first = value.slice(0, cut).trim();
  const rest = value.slice(cut).trim();
  if (rest.length <= limit) return [first, rest];
  let end = rest.lastIndexOf(' ', limit - 2);
  if (end < 1) end = limit - 3;
  return [first, `${rest.slice(0, end).trim()}...`];
}
function brainRibbon(link, center = false) {
  const x0 = link.source.exit, x1 = link.target.x0, mid = (x0 + x1) / 2;
  const half = Math.max(2, link.width) / 2;
  if (center) return `M${x0},${link.y0}C${mid},${link.y0} ${mid},${link.y1} ${x1},${link.y1}`;
  return `M${x0},${link.y0 - half}C${mid},${link.y0 - half} ${mid},${link.y1 - half} ${x1},${link.y1 - half}L${x1},${link.y1 + half}C${mid},${link.y1 + half} ${mid},${link.y0 + half} ${x0},${link.y0 + half}Z`;
}
// Flow layout: all completed reps -> top-level purpose -> each habit, like a cash-flow
// Sankey. Widths come only from completed reps; zero-rep items stay visible as
// planned dashed paths so structure never reads as activity.
function brainFlow(data) {
  const parent = new Map(data.links.map(l => [l.target, l.source]));
  const rootOf = id => { const seen = new Set(); while (parent.has(id) && !seen.has(id)) { seen.add(id); id = parent.get(id); } return id; };
  const goalOrder = new Map(S.brain.goals.map((g, i) => [`goal:${g.id}`, i]));
  const order = id => goalOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  const roots = data.nodes.filter(n => n.kind === 'goal' && !parent.has(n.id));
  const tones = new Map([...roots].sort((a, b) => order(a.id) - order(b.id)).map((n, i) => [n.id, `var(--flow-${i % 8})`]));
  roots.sort((a, b) => b.value - a.value || order(a.id) - order(b.id));
  const purpose = roots.map((n, i) => ({ id: n.id, title: brainGoalLabel(n.title), value: n.value, column: 1, rank: i, tone: tones.get(n.id), act: 'node', actId: n.id }));
  const leaves = data.nodes.filter(n => n.kind === 'habit').map(n => {
    const root = purpose.find(p => p.id === rootOf(n.id));
    return root && { id: n.id, title: n.title, value: n.value, column: 2, rank: root.rank, root: root.id, tone: root.tone, act: 'node', actId: n.id };
  }).filter(Boolean);
  const orphan = data.nodes.find(n => n.id === 'no-purpose');
  if (orphan) {
    const rank = purpose.length;
    purpose.push({ id: 'no-purpose', title: orphan.title, value: orphan.value, column: 1, rank, tone: 'var(--flow-none)', act: 'node', actId: 'no-purpose' });
    let counted = 0;
    for (const habitId of data.orphans) {
      const habit = S.habits.find(h => String(h.id) === String(habitId)), value = data.activity[String(habitId)]?.length || 0;
      counted += value;
      leaves.push({ id: `orphan:${habitId}`, title: habit?.name || 'Habit', value, column: 2, rank, root: 'no-purpose', tone: 'var(--flow-none)', act: 'link-habit', actId: String(habitId) });
    }
    if (orphan.value > counted) leaves.push({ id: 'orphan:removed', title: 'Removed habits', value: orphan.value - counted, column: 2, rank, root: 'no-purpose', tone: 'var(--flow-none)', act: 'node', actId: 'no-purpose' });
  }
  return { total: { id: 'effort-total', title: 'All effort', value: data.total, column: 0, rank: 0, tone: 'var(--flow-total)' }, purpose, leaves };
}
function brainFlowGraph(data) {
  const key = JSON.stringify(['flow', data.nodes, data.links, data.orphans, data.total]);
  if (brainLayoutCache?.key === key) return brainLayoutCache.graph;
  const flow = brainFlow(data), planned = !data.total;
  const nodes = [flow.total, ...flow.purpose, ...flow.leaves];
  const children = id => flow.leaves.filter(l => l.root === id);
  // With no completed reps, lay out the plan on equal units and draw it as thin dashed structure.
  const weight = n => planned ? Math.max(1, n.column === 1 ? children(n.id).length : 1) : n.value;
  const links = [
    ...flow.purpose.map(p => ({ source: 'effort-total', target: p.id, value: weight(p), reps: p.value })),
    ...flow.leaves.map(l => ({ source: l.root, target: l.id, value: weight(l), reps: l.value })),
  ];
  const rows = Math.max(flow.purpose.length, flow.leaves.length, 1), epsilon = data.total ? data.total * .002 : .002;
  const tall = flow.purpose.some(p => brainMapLines(p.title, 22, 3).length > 2);
  const width = 360, height = Math.max(tall ? 300 : 260, rows * (tall ? 86 : 78) + 48);
  const graph = d3.sankey().nodeId(n => n.id).nodeAlign(n => n.column).nodeWidth(8).nodePadding(tall ? 60 : 50).iterations(6)
    .nodeSort((a, b) => a.rank - b.rank || b.value - a.value)
    .extent([[0, 34], [width, height - 6]])({
      nodes: nodes.map(n => ({ ...n, reps: n.value, fixedValue: Math.max(weight(n), epsilon) })),
      links: links.map(l => ({ ...l, value: Math.max(l.value, epsilon) })),
    });
  graph.nodes.forEach(n => { n.exit = n.x1; });
  graph.links.forEach(l => { l.planned = planned || l.reps === 0; });
  Object.assign(graph, { width, height, planned });
  brainLayoutCache = { key, graph }; return graph;
}
function brainFlowMap(data) {
  if (!data.total && !data.nodes.some(n => n.kind === 'goal')) return '<div class="brain-empty"><p>Your purpose flow appears once you add a goal or complete a rep.</p></div>';
  const graph = brainFlowGraph(data), sel = brainSelected;
  const lit = n => !sel || n.id === 'effort-total' || n.id === sel || n.actId === sel || n.root === sel || graph.nodes.some(m => (m.id === sel || m.actId === sel) && m.root === n.id);
  const pct = n => n.reps / data.total < .01 ? '<1%' : `${Math.round(n.reps / data.total * 100)}%`;
  const caption = n => graph.planned ? 'Planned' : n.reps ? `${pct(n)} · ${n.reps} ${n.reps === 1 ? 'rep' : 'reps'}` : 'No reps yet';
  const captionMarkup = n => graph.planned || !n.reps ? esc(caption(n)) : `<tspan class="brain-node-pct" fill="${n.tone}">${pct(n)}</tspan> · ${n.reps} ${n.reps === 1 ? 'rep' : 'reps'}`;
  const animate = brainRevealKey !== brainLayoutCache.key; brainRevealKey = brainLayoutCache.key;
  const ribbons = graph.links.map((l, i) => {
    const target = l.target, on = lit(target);
    const label = `${target.title}: ${l.planned ? 'planned, no completed reps' : `${l.reps} completed reps`}`;
    const shape = l.planned
      ? `<path class="brain-ribbon brain-ribbon-planned" d="${brainRibbon(l, true)}" stroke="${target.tone}"/>`
      : target.root === 'no-purpose' || target.id === 'no-purpose' ? `<path class="brain-ribbon brain-ribbon-none" d="${brainRibbon(l)}" fill="url(#brainHatch)"/>`
      : `<path class="brain-ribbon" d="${brainRibbon(l)}" fill="url(#brainFlow${i})" stroke="url(#brainFlow${i})"/>`;
    return `<g class="brain-flow-hit${l.planned ? ' brain-flow-planned' : ''}" data-brain-act="${target.act}" data-id="${esc(target.actId)}" role="button" tabindex="-1" aria-label="${esc(label)}" opacity="${on ? 1 : .18}">${shape}<path class="brain-ribbon-target" d="${brainRibbon(l, true)}" stroke-width="${Math.max(16, l.width)}"/><title>${esc(label)}</title></g>`;
  }).join('');
  const nodes = graph.nodes.map(n => {
    const mid = (n.y0 + n.y1) / 2, h = Math.max(3, n.y1 - n.y0), idle = graph.planned || !n.reps;
    const bar = `<rect class="brain-node-bar${idle ? ' brain-node-idle' : ''}" x="${n.x0}" y="${mid - h / 2}" width="8" height="${h}" rx="2" fill="${n.tone}"/>`;
    if (n.column === 0) return `<g class="brain-node brain-total-node" role="img" aria-label="All effort, ${data.total} completed reps">${bar}</g>`;
    const lines = brainMapLines(n.title, 22, n.column === 1 ? 3 : 2), x = n.x0 - 8, top = mid - (lines.length * 14 + 13) / 2 + 11;
    return `<g class="brain-node" style="--col:${n.column}" data-brain-act="${n.act}" data-id="${esc(n.actId)}" role="button" tabindex="0" aria-label="${esc(n.title)}, ${esc(caption(n))}" opacity="${lit(n) ? 1 : .28}">
      <rect class="brain-node-hit" x="${x - 152}" y="${Math.min(n.y0, mid - 22)}" width="172" height="${Math.max(44, h)}"/>${bar}
      <text class="brain-node-title" x="${x}" y="${top}" text-anchor="end">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? 14 : 0}">${esc(line)}</tspan>`).join('')}</text><text class="brain-node-value" x="${x}" y="${top + lines.length * 14 + 1}" text-anchor="end">${captionMarkup(n)}</text><title>${esc(n.title)}</title></g>`;
  }).join('');
  return `<div class="brain-flow-wrap"><svg class="brain-map brain-map-flow${animate ? ' brain-map-animate' : ''}" viewBox="0 0 ${graph.width} ${graph.height}" role="group" aria-label="Completed reps flowing from all effort to goals and habits">
    <defs><clipPath id="brainFlowReveal"><rect class="brain-flow-reveal" width="${graph.width}" height="${graph.height}"/></clipPath>${graph.links.map((l, i) => `<linearGradient id="brainFlow${i}" gradientUnits="userSpaceOnUse" x1="${l.source.x1}" x2="${l.target.x0}" y1="0" y2="0"><stop stop-color="${l.target.tone}" stop-opacity=".28"/><stop offset=".55" stop-color="${l.target.tone}" stop-opacity=".62"/><stop offset="1" stop-color="${l.target.tone}" stop-opacity=".9"/></linearGradient>`).join('')}<pattern id="brainHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" class="brain-hatch-bg"/><rect width="2.2" height="7" class="brain-hatch-line"/></pattern></defs>
    <text class="brain-column-label" x="0" y="14">Effort</text><text class="brain-column-label" x="${graph.width / 2 + 4}" y="14" text-anchor="middle">Purpose</text><text class="brain-column-label" x="${graph.width}" y="14" text-anchor="end">Habits</text>
    <g clip-path="url(#brainFlowReveal)">${ribbons}</g>${nodes}</svg></div>
    ${graph.planned ? '<p class="brain-map-prompt">No completed reps in this period yet. Dashed lines show your plan.</p>' : ''}
    ${sel ? '<div class="brain-map-tools"><button data-brain-act="clear-selection">Clear highlight</button></div>' : ''}`;
}
function brainMap(data) {
  if (brainMapMode !== 'path') return brainFlowMap(data);
  if (!data.nodes.length) return '<div class="brain-empty">Your alignment map will appear here.</div>';
  const graph = brainGraph(data), ids = brainSelected ? brainPathIds(data, brainSelected) : null;
  if (brainScrollKey !== brainLayoutCache.key) { brainScrollKey = brainLayoutCache.key; brainScrollLeft = null; }
  const overview = graph.mode === 'overview';
  const tone = n => n.id === 'no-purpose' ? 'var(--brain-orphan)' : `var(--brain-${n.horizonColumn ?? n.column})`;
  const highlighted = n => !ids || n.kind === 'total' || ids.has(n.id) || n.members?.some(id => ids.has(id)) || (n.kind === 'relay' && ids.has(n.origin) && ids.has(n.destination));
  const visibleLinks = graph.links.filter(l => !l.hidden);
  const linkedPct = data.total ? Math.round(data.aligned / data.total * 100) : 0;
  const firstOrphan = data.orphans[0];
  const headings = overview ? ['Effort', 'Purpose'] : ['Long term', 'Mid term', 'Short term', 'Daily habits'];
  const nodeMarkup = graph.nodes.filter(n => !n.hidden).map(n => {
    const y = (n.y0 + n.y1) / 2, h = Math.max(3, n.y1 - n.y0);
    if (n.kind === 'relay') return `<rect class="brain-relay" x="${n.x0}" y="${n.y0}" width="${n.exit - n.x0}" height="${Math.max(2, h)}" fill="${tone(n)}" opacity="${highlighted(n) ? .25 : .04}"/>`;
    const left = n.column === 0, x = left ? 14 : n.x1 + 12;
    const labelWidth = overview ? (left ? 63 : 125) : (left ? 106 : 126);
    const lines = brainMapTitle(n.title, overview && left ? 10 : 19);
    const textY = y - (lines.length === 2 ? 14 : 7);
    const value = n.kind === 'total' ? `${data.total} reps` : `${Math.round(n.percent || 0)}% · ${n.actualValue} reps`;
    const action = n.kind === 'more' ? 'expand' : 'node';
    return `<g class="brain-node${n.kind === 'total' ? ' brain-total-node' : ''}" ${n.kind === 'total' ? 'role="img"' : `data-brain-act="${action}" data-id="${esc(n.id)}" role="button" tabindex="0"`} aria-label="${esc(n.title)}, ${esc(value)}" opacity="${highlighted(n) ? 1 : .15}">
      <rect class="brain-node-hit" x="${left ? x : n.x0 - 3}" y="${y - Math.max(24, h / 2)}" width="${labelWidth + 24}" height="${Math.max(48, h)}"/>
      <rect class="brain-node-bar" x="${n.x0}" y="${y - h / 2}" width="8" height="${h}" rx="2" fill="${tone(n)}"/>
      ${n.exit > n.x1 ? `<rect x="${n.exit - 3}" y="${n.y0}" width="3" height="${h}" fill="${tone(n)}" opacity=".5"/>` : ''}
      <text x="${x}" y="${textY}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? 15 : 0}">${esc(line)}</tspan>`).join('')}</text><text class="brain-node-value" x="${x}" y="${textY + lines.length * 15 + 3}">${esc(value)}</text><title>${esc(n.title)}</title></g>`;
  }).join('');
  return `<div class="brain-map-levels">
    <div class="brain-map-scroll" tabindex="0" aria-label="Alignment map, horizontal scroll"><svg class="brain-map brain-map-${graph.mode}" viewBox="0 0 ${graph.width} ${graph.height}" style="width:${brainZoom * 100}%;--map-min-width:${overview ? 0 : graph.width * brainZoom}px" role="group" aria-label="${overview ? 'Completed effort flowing into goals' : 'Goals flowing left to right into daily habits'}">
    <defs><clipPath id="brainFlowReveal"><rect class="brain-flow-reveal" width="${graph.width}" height="${graph.height}"/></clipPath>${visibleLinks.map((l, i) => `<linearGradient id="brainFlow${i}" gradientUnits="userSpaceOnUse" x1="${l.source.exit}" x2="${l.target.x0}" y1="0" y2="0"><stop stop-color="${tone(overview ? l.target : l.source)}" stop-opacity=".42"/><stop offset="1" stop-color="${tone(l.target)}" stop-opacity=".72"/></linearGradient>`).join('')}</defs>
    ${headings.map((heading, column) => { const node = graph.nodes.find(n => n.column === column), x = overview ? (column ? 202 : 14) : (column ? node.x0 : 14); return `<text x="${x}" y="28" class="brain-column-label">${heading}</text>${!graph.nodes.some(n => n.column === column && !n.hidden && n.kind !== 'relay') ? `<text x="${x}" y="64" class="brain-stage-empty">Not linked yet</text>` : ''}`; }).join('')}
    <g clip-path="url(#brainFlowReveal)">
    ${visibleLinks.map((l, i) => {
      const orphan = l.target.id === 'no-purpose', dashed = l.planned || orphan;
      const faded = !highlighted(l.source) || !highlighted(l.target);
      const original = data.links[l.indexes[0]], from = data.nodes.find(n => n.id === original?.source), to = data.nodes.find(n => n.id === original?.target);
      const label = overview ? `${l.target.title}: ${l.value} completed reps` : `${to?.title} supports ${from?.title}: ${l.planned ? 'planned, no completed reps' : l.value + ' completed reps'}`;
      const action = l.target.kind === 'more' || l.indexes.length > 1 ? 'expand' : overview ? 'node' : 'link';
      const id = overview ? l.target.id : l.indexes[0];
      return `<g class="brain-flow-hit${l.planned ? ' brain-flow-planned' : ''}${orphan ? ' brain-flow-orphan' : ''}" data-brain-act="${action}" data-id="${esc(id)}" role="button" tabindex="0" aria-label="${esc(label)}" opacity="${faded ? .15 : 1}"><path class="brain-ribbon" d="${l.planned ? brainRibbon(l, true) : brainRibbon(l)}" fill="${l.planned ? 'none' : 'url(#brainFlow' + i + ')'}"${dashed ? ` stroke="${tone(l.target)}" stroke-width="1" stroke-dasharray="4 4"` : ''}/><path class="brain-ribbon-target" d="${brainRibbon(l, true)}" fill="none" stroke="transparent" stroke-width="${Math.max(18, l.width)}"/><title>${esc(label)}</title></g>`;
    }).join('')}
    </g>${nodeMarkup}</svg></div>
    ${!data.links.length ? '<p class="brain-map-prompt">No linked paths yet.</p>' : ''}
    <div class="brain-map-tools"><button data-brain-act="zoom-out" aria-label="Zoom out" title="Zoom out"${brainZoom <= .6 ? ' disabled' : ''}>−</button><output id="brainZoomLabel">${Math.round(brainZoom * 100)}%</output><button data-brain-act="zoom-in" aria-label="Zoom in" title="Zoom in"${brainZoom >= 2 ? ' disabled' : ''}>+</button><button data-brain-act="expand">${brainExpanded ? 'Group items' : 'Show all'}</button>${brainSelected ? '<button data-brain-act="clear-selection">Clear highlight</button>' : ''}</div></div>`;
}
function brainWireMap() {
  const scroll = document.querySelector('.brain-map-scroll');
  if (!scroll) return;
  scroll.scrollLeft = brainScrollLeft === null ? 0 : brainScrollLeft;
  scroll.addEventListener('scroll', () => { brainScrollLeft = scroll.scrollLeft; }, { passive: true });
}
// Color, kind and ancestry for any map node, so sheets match the flow.
function brainNodeContext(data, nodeId) {
  const parent = new Map(data.links.map(l => [l.target, l.source]));
  const ancestors = [];
  for (let id = parent.get(nodeId), seen = new Set(); id && !seen.has(id); id = parent.get(id)) { seen.add(id); ancestors.push(data.nodes.find(n => n.id === id)); }
  const rootId = ancestors.length ? ancestors[ancestors.length - 1].id : nodeId;
  const purpose = brainFlow(data).purpose.find(p => p.id === rootId);
  return { ancestors: ancestors.filter(Boolean).reverse(), tone: purpose?.tone || 'var(--flow-none)' };
}
function brainDetailSheet() {
  const data = brainData();
  if (sheet.linkIndex !== undefined) {
    const link = data.links[sheet.linkIndex];
    if (!link) return '<h2>Connection unavailable</h2>';
    const source = data.nodes.find(n => n.id === link.source), target = data.nodes.find(n => n.id === link.target);
    const { tone } = brainNodeContext(data, target.id);
    return `<div class="brain-detail brain-sheet" style="--tone:${tone}"><header class="bs-head"><span class="bs-kind">Connection</span><h2>${esc(target.title)}</h2><p>Supports <b>${esc(source.title)}</b></p></header><p role="status" class="bs-status">${esc(brainMessage)}</p>
      <div class="bs-stats"><div><strong>${link.value}</strong><span>${link.value === 1 ? 'rep' : 'reps'} this period</span></div></div>
      <div class="bs-actions"><button class="bs-danger" data-brain-act="unlink" data-id="${sheet.linkIndex}">Unlink</button></div></div>`;
  }
  const node = data.nodes.find(n => n.id === sheet.nodeId);
  if (!node) return '<h2>Item unavailable</h2>';
  const ids = brainPathIds(data, node.id);
  const { ancestors, tone } = node.id === 'no-purpose' ? { ancestors: [], tone: 'var(--flow-none)' } : brainNodeContext(data, node.id);
  const below = data.nodes.filter(n => n.id !== node.id && ids.has(n.id) && !ancestors.some(a => a.id === n.id));
  const habits = node.id === 'no-purpose' ? S.habits.filter(h => data.orphans.includes(String(h.id))) : S.habits.filter(h => (node.habitId && String(h.id) === node.habitId) || below.some(n => n.habitId === String(h.id)));
  const tasks = S.tasks.filter(t => below.some(n => n.taskId === String(t.id)) || (node.taskId && String(t.id) === node.taskId));
  const subgoals = below.filter(n => n.kind === 'goal');
  const dates = Array.from({ length: 7 }, (_, i) => dkey(addDays(atMidnight(operationalDate()), i - 6)));
  const activity = Arc90Brain.alignment({ goals: S.brain.goals, habits, tasks: S.tasks, log: S.log, start: dates[0], end: dates[6] }).activity;
  const daily = dates.map(date => habits.filter(h => activity[String(h.id)]?.some(a => a.date === date)).length);
  const peak = Math.max(1, habits.length, ...daily);
  const kind = node.id === 'no-purpose' ? 'Not linked yet' : node.kind === 'goal' ? `${({ short: 'Short-term', mid: 'Mid-term', long: 'Long-term' })[S.brain.goals.find(g => g.id === node.goalId)?.horizon] || ''} goal` : node.kind === 'habit' ? 'Habit' : 'Task';
  const reps = id => data.activity[String(id)]?.length || 0;
  const row = (title, meta, action = '') => `<li><i aria-hidden="true"></i><span><b>${esc(title)}</b><small>${esc(meta)}</small></span>${action}</li>`;
  return `<div class="brain-detail brain-sheet" style="--tone:${tone}">
    <header class="bs-head"><span class="bs-kind">${esc(kind)}</span><h2>${esc(node.title)}</h2>${ancestors.length ? `<p class="bs-path">Rolls up to ${ancestors.map(a => `<b>${esc(a.title)}</b>`).join(' <span aria-hidden="true">›</span> ')}</p>` : ''}</header>
    <p role="status" class="bs-status">${esc(brainMessage)}</p>
    <div class="bs-stats"><div><strong>${node.value}</strong><span>${node.value === 1 ? 'rep' : 'reps'} this period</span></div><div><strong>${Math.round(node.percent || 0)}%</strong><span>of all your effort</span></div>${node.kind === 'habit' ? '' : `<div><strong>${habits.length}</strong><span>${habits.length === 1 ? 'habit' : 'habits'}</span></div>`}</div>
    <section class="bs-section"><h3>Last 7 days</h3><div class="bs-week" role="img" aria-label="${daily.map((n, i) => `${new Date(dates[i] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })} ${n}`).join(', ')}">${daily.map((n, i) => `<div class="${dates[i] === todayKey() ? 'bs-today' : ''}"><i style="height:${n ? Math.max(12, n / peak * 100) : 4}%" class="${n ? '' : 'bs-zero'}"></i><span>${esc(new Date(dates[i] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' }))}</span><b>${n}</b></div>`).join('')}</div></section>
    ${subgoals.length || habits.length || tasks.length ? `<section class="bs-section"><h3>${node.id === 'no-purpose' ? 'Habits without a goal' : node.kind === 'habit' ? 'This habit' : 'Feeding this goal'}</h3><ul class="bs-list">
      ${subgoals.map(g => row(g.title, `${({ short: 'Short-term', mid: 'Mid-term', long: 'Long-term' })[S.brain.goals.find(x => x.id === g.goalId)?.horizon] || ''} goal · ${brainReps(g.value)}`)).join('')}
      ${habits.map(h => row(h.name, `Habit · ${brainReps(reps(h.id))} this period`, `<button data-brain-act="link-habit" data-id="${esc(h.id)}">${h.goal_id || h.task_id ? 'Change' : 'Link'}</button>`)).join('')}
      ${tasks.map(t => row(t.title, `Task${t.done ? ' · done' : ''}`, `<button data-brain-act="link-task" data-id="${esc(t.id)}">Change</button>`)).join('')}
    </ul></section>` : '<p class="bs-empty">Nothing is linked here yet. Link a habit to start the flow.</p>'}
    ${node.kind === 'goal' ? `<div class="bs-actions"><button data-brain-act="goal-edit" data-id="${esc(node.goalId)}">Edit goal</button></div>` : ''}</div>`;
}
function brainLinkSheet() {
  const item = sheet.kind === 'task' ? S.tasks.find(t => String(t.id) === sheet.itemId) : S.habits.find(h => String(h.id) === sheet.itemId);
  if (!item) return '<h2>Item unavailable</h2>';
  const parentHorizon = { short: 'mid', mid: 'long' }[item.horizon || 'short'];
  const goals = brainLinkTargets(sheet.kind, item);
  const suggestion = !item.goal_id && brainSuggestGoal(item.title || item.name, goals);
  return `<div class="brain-detail brain-sheet"><header class="bs-head"><span class="bs-kind">${sheet.kind === 'task' ? 'Task' : 'Habit'}</span><h2>Link to a goal</h2><p>${esc(item.title || item.name)}</p></header><p role="status" class="bs-status">${esc(brainMessage)}</p>
    ${suggestion ? `<button class="brain-suggest brain-suggest-wide" data-brain-act="suggest-link" data-kind="${sheet.kind}" data-id="${esc(item.id)}" data-goal="${esc(suggestion.id)}"><span>Suggested</span><b>${esc(suggestion.title)}</b><i>Link</i></button>` : ''}
    <label class="bs-field">Goal<select id="brainGoalPicker">${brainOptions({ '': 'No goal', ...Object.fromEntries(goals.map(g => [g.id, g.title])) }, sheet.selectedGoalId || item.goal_id || '')}</select></label>${!goals.length ? `<p class="bs-empty">No ${sheet.kind === 'task' ? 'matching' : 'short or mid-term'} goals yet. Add one below.</p>` : ''}
    <div class="bs-actions"><button class="btn" data-brain-act="confirm-link">Save link</button>${sheet.kind !== 'task' || parentHorizon ? '<button data-brain-act="goal-new">Add a goal</button>' : ''}</div></div>`;
}
function brainGoalSheet() {
  const goal = S.brain.goals.find(g => g.id === sheet.goalId);
  const form = sheet.form || goal || { title: '', horizon: 'mid', parent_goal_id: null };
  const linked = goal && (S.brain.goals.some(g => g.parent_goal_id === goal.id) || S.habits.some(h => h.goal_id === goal.id) || S.tasks.some(t => t.goal_id === goal.id));
  const horizonAbove = { short: 'mid', mid: 'long' }[form.horizon];
  const parents = S.brain.goals.filter(g => g.status === 'active' && g.id !== goal?.id && g.horizon === horizonAbove);
  return `<div class="brain-detail brain-sheet"><header class="bs-head"><span class="bs-kind">${goal ? 'Goal' : 'New goal'}</span><h2>${goal ? 'Edit goal' : 'Add a goal'}</h2><p>Long-term goals are your vision. Mid and short-term goals are the steps that roll up to them.</p></header><p role="alert" class="bs-status">${esc(brainMessage)}</p>
    <label class="bs-field">Goal title<input id="brainGoalTitle" maxlength="120" value="${esc(form.title)}" placeholder="Finish LVN school"></label>
    <label class="bs-field">Horizon<select id="brainGoalHorizon"${linked ? ' disabled' : ''}>${brainOptions({ short: 'Short term', mid: 'Mid term', long: 'Long term' }, form.horizon)}</select></label>
    ${form.horizon === 'long' ? '' : `<label class="bs-field">Supports<select id="brainGoalParent">${brainOptions({ '': 'No parent goal', ...Object.fromEntries(parents.map(g => [g.id, g.title])) }, form.parent_goal_id || '')}</select></label>`}
    <div class="bs-actions"><button class="btn" data-brain-act="goal-save">Save goal</button></div></div>`;
}
function brainSaveGoal() {
  const title = document.getElementById('brainGoalTitle').value.trim();
  const horizon = document.getElementById('brainGoalHorizon').value;
  const parentId = (horizon !== 'long' && document.getElementById('brainGoalParent')?.value) || null;
  sheet.form = { title, horizon, parent_goal_id: parentId };
  if (!title || title.split(/\s+/).length > 8) { brainMessage = 'Use a goal title of 1 to 8 words.'; return; }
  const parent = parentId && S.brain.goals.find(g => g.id === parentId && g.status === 'active');
  if (!['short', 'mid', 'long'].includes(horizon) || (parentId && (!parent || parent.horizon !== ({ short: 'mid', mid: 'long' })[horizon]))) { brainMessage = 'Choose a parent in the next horizon.'; return; }
  const existing = S.brain.goals.find(g => g.id === sheet.goalId);
  if (existing && horizon !== existing.horizon && (S.brain.goals.some(g => g.parent_goal_id === existing.id) || S.habits.some(h => h.goal_id === existing.id) || S.tasks.some(t => t.goal_id === existing.id))) { brainMessage = 'Unlink connected items before changing this horizon.'; return; }
  if (parentId && parentId === existing?.id) { brainMessage = 'A goal cannot support itself.'; return; }
  const returnTo = sheet.returnTo;
  let savedGoalId = existing?.id;
  if (brainAtomic(() => {
    if (existing) Object.assign(existing, sheet.form);
    else {
      const id = brainId(), dumpId = brainId(), now = new Date().toISOString();
      savedGoalId = id;
      const item = { temp_id: 'manual-goal', title, type: 'goal', horizon, parent_temp_id: null, parent_goal_id: parentId, frequency: null, confidence: 1, excerpt: title };
      S.brain.drafts.unshift({ id: dumpId, raw_text: title, status: 'sorted', created_at: now, items: [item], ids: { 'manual-goal': id } });
      S.brain.goals.push({ id, title, horizon, parent_goal_id: parentId, status: 'active', created_at: now, source_dump_id: dumpId });
    }
  })) { sheet = returnTo ? { ...returnTo, selectedGoalId: savedGoalId } : null; brainMessage = 'Goal saved.'; brainSelected = null; }
}
function brainEnsureCloudAnchor() {
  if (S.brain.drafts.some(d => d.status === 'sorted')) return;
  if (!S.brain.goals.length && !S.tasks.length && !S.brain.deletedTaskIds?.length) throw new Error('Add a goal or save a reviewed dump first.');
  if (!brainAtomic(() => S.brain.drafts.unshift({ id: brainId(), raw_text: 'Arc map backup', status: 'sorted', created_at: new Date().toISOString(), items: [], ids: {} }))) throw new Error(brainMessage);
}
function brainCloudData() {
  const tasks = S.tasks.filter(t => t.goal_id || t.source_dump_id);
  return {
    dumps: S.brain.drafts.filter(d => d.status === 'sorted').map(d => ({ id: d.id, raw_text: d.raw_text, status: 'saved', review: { items: d.items } })),
    goals: S.brain.goals.map(({ id, title, horizon, parent_goal_id, status, source_dump_id, life_area }) => ({ id, title, horizon, parent_goal_id: parent_goal_id || null, status, source_dump_id: source_dump_id || null, life_area: life_area || null })),
    habits: S.habits.filter(h => h.goal_id || h.source_dump_id || h.life_area).map(({ id, name, goal_id, rhythm, source_dump_id, life_area }) => ({ id: String(id), name, goal_id: goal_id || null, rhythm, source_dump_id: source_dump_id || null, life_area: life_area || null })),
    tasks: tasks.map(({ id, title, horizon, goal_id, done, due, source_dump_id }) => ({ id: String(id), title, horizon: horizon || 'short', goal_id: goal_id || null, done, due: /^\d{4}-\d{2}-\d{2}/.test(due || '') ? due.slice(0, 10) : null, source_dump_id: source_dump_id || null })),
    taskStates: [...tasks.map(t => ({ id: String(t.id), due_local: /^\d{4}-\d{2}-\d{2}T/.test(t.due || '') ? t.due : null, deleted: false })), ...(S.brain.deletedTaskIds || []).filter(id => !tasks.some(t => String(t.id) === id)).map(id => ({ id, due_local: null, deleted: true }))],
  };
}
function brainCloudBatches(data) {
  if (!data.dumps.length) throw new Error('Save a reviewed dump to your map first.');
  const batchLimit = 800000;
  const payloadLimit = 220000;
  const size = payloads => new TextEncoder().encode(JSON.stringify(payloads)).length;
  const empty = dump => ({ dump, goals: [], habits: [], tasks: [] });
  const batches = [];
  let batch = [];
  for (const dump of data.dumps) {
    const payload = empty(dump);
    if (size([payload]) > payloadLimit) throw new Error('One brain dump is too large for cloud backup. Shorten its review and retry.');
    if (batch.length >= 50 || size([...batch, payload]) > batchLimit) { batches.push(batch); batch = []; }
    batch.push(payload);
  }
  if (batch.length) batches.push(batch);
  const anchor = data.dumps[0];
  for (const key of ['goals', 'habits', 'tasks']) {
    const rows = key === 'goals' ? [...data.goals].sort((a, b) => ({ long: 0, mid: 1, short: 2 }[a.horizon] ?? 3) - ({ long: 0, mid: 1, short: 2 }[b.horizon] ?? 3)) : data[key];
    let part = [];
    for (const row of rows) {
      const candidate = [...part, row];
      if (candidate.length > 200 || size([{ ...empty(anchor), [key]: candidate }]) > payloadLimit) {
        if (!part.length) throw new Error('One map item is too large for cloud backup. Shorten it and retry.');
        batches.push([{ ...empty(anchor), [key]: part }]); part = [row];
      } else part = candidate;
    }
    if (part.length) batches.push([{ ...empty(anchor), [key]: part }]);
  }
  return batches;
}
async function brainSync(load = false) {
  if (brainBusy) return; brainBusy = true; brainMessage = ''; render();
  try {
    const cfg = await brainConnection();
    if (load) {
      const result = {};
      for (const table of ['brain_dumps', 'goals', 'arc_habits', 'arc_tasks']) {
        const response = await fetch(`${cfg.url}/rest/v1/${table}?select=*&user_id=eq.${encodeURIComponent(cfg.userId)}&limit=1000`, { headers: cfg.headers, signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('Cloud map is unavailable. Nothing local was replaced.');
        result[table] = await response.json();
      }
      if (!brainAtomic(() => {
        const merge = (local, remote) => [...local, ...remote.filter(r => !local.some(l => String(l.id) === String(r.id)))];
        S.brain.goals = merge(S.brain.goals, result.goals);
        S.brain.drafts = merge(S.brain.drafts, result.brain_dumps.map(d => ({ ...d, status: d.status === 'saved' ? 'sorted' : d.status, items: d.review?.items || [], ids: {} })));
        S.habits = merge(S.habits, result.arc_habits.map(h => ({ cat: 'custom', emoji: '', min: '2-minute version', ...h })));
        S.brain.deletedTaskIds = [...new Set([...(S.brain.deletedTaskIds || []), ...result.arc_tasks.filter(t => t.deleted).map(t => String(t.id))])];
        const deleted = new Set(S.brain.deletedTaskIds);
        S.tasks = merge(S.tasks, result.arc_tasks.map(t => ({ ...t, due: t.due_local ? t.due_local.slice(0, 16) : t.due || '', remind: false, notified: false, created: 0 }))).filter(t => !deleted.has(String(t.id)));
        S.brain.cloudOwner = cfg.userId;
      })) throw new Error(brainMessage);
      brainMessage = 'Cloud items added. Existing local edits were kept.';
    } else {
      brainEnsureCloudAnchor();
      const data = brainCloudData();
      const snapshot = JSON.stringify(data);
      for (const payloads of brainCloudBatches(data)) {
        const response = await fetch(`${cfg.url}/rest/v1/rpc/save_brain_maps`, { method: 'POST', headers: cfg.headers,
          body: JSON.stringify({ payloads }), signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('Cloud save failed. Local changes are kept; retry when connected.');
      }
      for (let i = 0; i < data.taskStates.length; i += 200) {
        const response = await fetch(`${cfg.url}/rest/v1/rpc/save_brain_task_state`, { method: 'POST', headers: cfg.headers,
          body: JSON.stringify({ states: data.taskStates.slice(i, i + 200) }), signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('Task backup is incomplete. Your local deadlines and deletions are kept; retry when connected.');
      }
      S.brain.cloudOwner = cfg.userId;
      S.brain.dirty = JSON.stringify(brainCloudData()) !== snapshot;
      brainPersist();
      brainMessage = S.brain.dirty ? 'Cloud saved; newer edits are still on this device.' : 'Cloud backup saved.';
    }
  } catch (error) { brainMessage = error.message; }
  finally { brainBusy = false; if (tab === 'brain' || tab === 'progress') render(); }
}

document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'brainText') {
    const draft = brainDraft() || brainNewDraft(); if (draft.status === 'sorted') return;
    draft.raw_text = el.value; draft.items = []; brainPersist();
    for (const id of ['brainSort', 'brainManualSort']) { const button = document.getElementById(id); if (button) button.disabled = !el.value.trim() || brainBusy; }
    const status = document.getElementById('brainStatus'); if (status) status.textContent = brainMessage || 'Draft saved on this device.';
  }
  if (el.dataset.brainField === 'title') {
    const item = brainDraft()?.items.find(i => i.temp_id === el.dataset.id);
    if (item) { item.title = el.value; brainPersist(); }
  }
});
document.addEventListener('change', event => {
  const el = event.target, field = el.dataset.brainField;
  if (el.id === 'brainGoalHorizon' && sheet?.type === 'brain-goal') {
    sheet.form = { title: document.getElementById('brainGoalTitle').value, horizon: el.value, parent_goal_id: null };
    render(); return;
  }
  if (!field || field === 'title') return;
  const draft = brainDraft(), item = draft?.items.find(i => i.temp_id === el.dataset.id);
  if (!item) return;
  if (field === 'parent') {
    const [kind, id] = el.value.split(':'); item.parent_temp_id = kind === 'new' ? id : null; item.parent_goal_id = kind === 'existing' ? id : null;
  } else {
    item[field] = el.value;
    if (field === 'type' || field === 'horizon') {
      item.parent_temp_id = null; item.parent_goal_id = null;
      if (item.type !== 'habit') item.frequency = null;
      else item.frequency ||= 'daily';
      for (const child of draft.items.filter(i => i.parent_temp_id === item.temp_id)) child.parent_temp_id = null;
    }
  }
  brainPersist(); render();
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-brain-act]'); if (!button) return;
  const { brainAct: action, id } = button.dataset; let redraw = true;
  if (action === 'stage') { if (id === 'map') { arcWorkspace = 'map'; if (tab === 'brain') tab = 'progress'; } else { brainStage = id; if (tab === 'progress') arcWorkspace = 'brain'; } }
  else if (action === 'goal-new' || action === 'goal-edit') {
    brainMessage = '';
    const returnTo = sheet?.type === 'brain-link' ? { ...sheet } : null;
    const task = returnTo?.kind === 'task' && S.tasks.find(t => String(t.id) === returnTo.itemId);
    const horizon = task ? ({ short: 'mid', mid: 'long' }[task.horizon || 'short'] || 'mid') : 'mid';
    sheet = { type: 'brain-goal', goalId: action === 'goal-edit' ? id : null, returnTo, ...(action === 'goal-new' ? { form: { title: '', horizon: ['short', 'mid', 'long'].includes(button.dataset.horizon) ? button.dataset.horizon : horizon, parent_goal_id: null } } : {}) };
  }
  else if (action === 'goal-save') brainSaveGoal();
  else if (action === 'new') brainNewDraft();
  else if (action === 'sort') { brainSort(); return; }
  else if (action === 'sort-manual') { brainSort(true); return; }
  else if (action === 'sync' || action === 'load-cloud') { brainSync(action === 'load-cloud'); return; }
  else if (action === 'history') { S.brain.activeDraftId = id; brainStage = 'dump'; brainPersist(); }
  else if (action === 'candidate') { const item = brainDraft().items.find(i => i.temp_id === id); item.includeHabit = !item.includeHabit; brainPersist(); }
  else if (action === 'remove') { const draft = brainDraft(); draft.items = draft.items.filter(i => i.temp_id !== id); draft.items.forEach(i => { if (i.parent_temp_id === id) i.parent_temp_id = null; }); brainPersist(); }
  else if (action === 'save-map') { brainCommitReview(); return; }
  else if (action === 'range') { brainRange = id; brainSelected = null; }
  else if (action === 'view') brainView = id;
  else if (action === 'map-mode') { brainView = 'map'; brainMapMode = id === 'path' ? 'path' : 'overview'; brainZoom = 1; brainScrollLeft = null; }
  else if (action === 'expand') brainExpanded = !brainExpanded;
  else if (action === 'clear-selection') brainSelected = null;
  else if (action === 'zoom-in' || action === 'zoom-out') brainZoom = Math.max(.6, Math.min(2, brainZoom + (action === 'zoom-in' ? .2 : -.2)));
  else if (action === 'node') { brainSelected = id; sheet = { type: 'brain', nodeId: id }; }
  else if (action === 'link') { const l = brainData().links[Number(id)]; brainSelected = l?.target; sheet = { type: 'brain', linkIndex: Number(id) }; }
  else if (action === 'link-habit' || action === 'link-task') { brainMessage = ''; sheet = { type: 'brain-link', kind: action === 'link-task' ? 'task' : 'habit', itemId: String(id) }; }
  else if (action === 'suggest-link') {
    const kind = button.dataset.kind === 'task' ? 'task' : 'habit';
    const item = kind === 'task' ? S.tasks.find(t => String(t.id) === String(id)) : S.habits.find(h => String(h.id) === String(id));
    const goal = item && brainLinkTargets(kind, item).find(g => g.id === button.dataset.goal);
    if (goal && brainAtomic(() => { item.goal_id = goal.id; if (kind === 'habit') item.task_id = null; item.source_dump_id ||= S.brain.drafts.find(d => d.status === 'sorted')?.id || null; })) { brainMessage = `Linked to ${brainGoalLabel(goal.title)}.`; if (sheet?.type === 'brain-link') sheet = null; }
  } else if (action === 'goal-parent') {
    const goal = S.brain.goals.find(g => g.id === id), parent = S.brain.goals.find(g => g.id === button.dataset.parent);
    if (goal && parent && parent.status === 'active' && parent.horizon === ({ short: 'mid', mid: 'long' })[goal.horizon] && brainAtomic(() => { goal.parent_goal_id = parent.id; })) brainMessage = `${brainGoalLabel(goal.title)} now rolls up to ${brainGoalLabel(parent.title)}.`;
  }
  else if (action === 'confirm-link') {
    const goalId = document.getElementById('brainGoalPicker').value || null;
    const item = sheet.kind === 'task' ? S.tasks.find(t => String(t.id) === sheet.itemId) : S.habits.find(h => String(h.id) === sheet.itemId);
    if (item && brainAtomic(() => { item.goal_id = goalId; if (sheet.kind === 'habit') item.task_id = null; item.source_dump_id ||= S.brain.drafts.find(d => d.status === 'sorted')?.id || null; })) sheet = null;
  } else if (action === 'unlink') {
    const data = brainData(), link = data.links[Number(id)], target = data.nodes.find(n => n.id === link?.target);
    if (target && brainAtomic(() => {
      const habit = S.habits.find(h => String(h.id) === target.habitId), task = S.tasks.find(t => String(t.id) === target.taskId), goal = S.brain.goals.find(g => g.id === target.goalId);
      if (habit) { habit.goal_id = null; habit.task_id = null; } else if (task) task.goal_id = null; else if (goal) goal.parent_goal_id = null;
    })) { sheet = null; brainSelected = null; }
  } else if (action === 'dictate') {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition(); recognition.lang = navigator.language; recognition.interimResults = false;
    recognition.onresult = e => { const input = document.getElementById('brainText'); if (input) { input.value += ' ' + e.results[0][0].transcript; input.dispatchEvent(new Event('input', { bubbles: true })); } };
    recognition.onerror = () => { brainMessage = 'Dictation unavailable. You can keep typing.'; if (tab === 'brain' || tab === 'progress') render(); }; recognition.start(); redraw = false;
  }
  if (redraw) render();
});
document.addEventListener('keydown', event => {
  if (['Enter', ' '].includes(event.key) && event.target.matches('svg [data-brain-act]')) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
let brainGesture = null;
document.addEventListener('touchstart', event => {
  if (event.touches.length === 2 && event.target.closest('.brain-map-scroll')) brainGesture = { distance: Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY), zoom: brainZoom };
}, { passive: true });
document.addEventListener('touchmove', event => {
  if (!brainGesture || event.touches.length !== 2 || !event.target.closest('.brain-map-scroll')) return;
  event.preventDefault(); brainZoom = Math.max(.6, Math.min(2, brainGesture.zoom * Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY) / brainGesture.distance));
  const svg = document.querySelector('.brain-map'); if (svg) { svg.style.width = `${brainZoom * 100}%`; svg.style.setProperty('--map-min-width', `${brainMapMode === 'path' ? 1220 * brainZoom : 0}px`); }
  const label = document.getElementById('brainZoomLabel'); if (label) label.textContent = `${Math.round(brainZoom * 100)}%`;
}, { passive: false });
document.addEventListener('touchend', () => { brainGesture = null; }, { passive: true });

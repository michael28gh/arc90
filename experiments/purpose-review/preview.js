(function () {
  'use strict';
  const core = window.Arc90PurposeReview;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const localDate = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-'); };
  let today = localDate();
  const shift = (date, days) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const dateLabel = value => new Intl.DateTimeFormat('en', { month:'short', day:'numeric', timeZone:'UTC' }).format(new Date(value + 'T12:00:00Z'));
  const number = value => Math.abs(value) >= 1e9 || (value !== 0 && Math.abs(value) < 1e-5) ? value.toExponential() : new Intl.NumberFormat('en', { maximumSignificantDigits:15 }).format(value);
  const uid = () => crypto.randomUUID();
  const sample = window.Arc90ReviewSample(today);
  let state, store, workspace = 'sample', view = 'direction', metricId = '', mode, currentId, trigger, brokenRaw;
  const storageKey = () => 'arc90:purpose-review:v1:' + workspace;
  const action = (name, id, title, cls = '') => `<button type="button" class="${cls}" data-action="${name}" data-id="${esc(id)}">${esc(title)}</button>`;
  const field = (label, name, value = '', options = {}) => `<label class="field">${esc(label)}<input name="${name}" value="${esc(value)}" type="${options.type || 'text'}" ${options.required === false ? '' : 'required'} ${options.max ? `maxlength="${options.max}"` : ''} ${options.readonly ? 'readonly' : ''} ${options.type === 'number' ? 'step="any"' : ''} ${options.type === 'date' && !options.future ? `max="${today}"` : ''}></label>`;
  const area = (label, name, value = '', required = false) => `<label class="field">${esc(label)}<textarea name="${name}" maxlength="1000" ${required ? 'required' : ''}>${esc(value)}</textarea></label>`;
  const select = (label, name, options, value) => `<label class="field">${esc(label)}<select name="${name}">${options.map(([key, title]) => `<option value="${esc(key)}" ${key === value ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></label>`;
  function notify(message) { $('notice').textContent = message; }
  function refreshDate() {
    today = localDate();
    document.querySelectorAll('input[type="date"][max]').forEach(input => { input.max = today; });
    $('today-label').textContent = new Intl.DateTimeFormat('en',{weekday:'long',month:'short',day:'numeric'}).format(new Date());
  }
  function persist(actionValue) {
    refreshDate();
    if (!store) throw new Error('Saved records are unavailable. Export them before resetting this workspace.');
    const next = core.transact(state, actionValue, { today });
    state = store.save(next);
    $('save-state').textContent = 'Saved on this browser only';
  }
  function loadWorkspace() {
    brokenRaw = null;
    try {
      store = window.Arc90ReviewStorage.open(localStorage, storageKey(), core.normalize, workspace === 'sample' ? sample.state : core.empty());
      state = store.read();
      $('save-state').textContent = 'Local only. No cloud sync.';
      notify('');
    } catch (error) {
      store = null;
      state = core.empty();
      try { brokenRaw = localStorage.getItem(storageKey()); } catch (_) { /* Storage may be disabled. */ }
      notify('Saved records could not be opened. Nothing was overwritten. Export records to recover the original file, or reset this workspace.');
      $('save-state').textContent = 'Storage unavailable';
    }
    metricId = state.metrics[0]?.id || '';
    document.querySelectorAll('[name="workspace"]').forEach(input => { input.checked = input.value === workspace; });
    $('workspace-note').textContent = workspace === 'sample' ? 'Sample data. Separate from your Arc90 account.' : 'Private sandbox. Not connected to your Arc90 account.';
    render();
  }
  function plot(metric, observations) {
    if (!observations.length) return '<div class="empty-plot">No comparable measurements yet</div>';
    const values = observations.map(o => o.value);
    let low = Math.min(...values), high = Math.max(...values);
    const pad = Math.max((high - low) * .35, 1);
    low = low >= 0 ? Math.max(0,low - pad) : low - pad; high += pad;
    const start = Date.parse(observations[0].date), end = Date.parse(observations.at(-1).date);
    const points = observations.map(o => ({
      x: start === end ? 280 : 10 + (Date.parse(o.date) - start) / (end - start) * 540,
      y: 165 - (o.value - low) / (high - low) * 150,
    }));
    return `<figure class="chart" aria-label="${esc(metric.title)} observations"><div class="plot-grid"><div class="axis-y" aria-hidden="true"><span>${number(high)}</span><span>${number(low)}</span></div><svg class="plot" viewBox="0 0 560 180" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="15" x2="560" y2="15"/><line x1="0" y1="90" x2="560" y2="90"/><line x1="0" y1="165" x2="560" y2="165"/>${points.length > 1 ? `<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}"/>` : ''}${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4"/>`).join('')}</svg></div><div class="axis-x" aria-hidden="true"><span>${dateLabel(observations[0].date)}</span><span>${observations.length > 1 ? dateLabel(observations.at(-1).date) : ''}</span></div><figcaption>${observations.length} ${observations.length === 1 ? 'measurement' : 'measurements'} in the last 30 days. ${esc(metric.context)}.</figcaption></figure>`;
  }
  function observationList(metric) {
    const records = state.observations.filter(o => o.metricId === metric.id).slice().sort((a,b) => b.date.localeCompare(a.date));
    if (!records.length) return '';
    return `<details><summary>All measurements (${records.length})</summary><ul class="record-list">${records.map(o => `<li class="record"><div class="record-copy"><strong>${number(o.value)} ${esc(metric.unit)}</strong><span class="subtle"> &middot; ${dateLabel(o.date)}</span><p class="subtle">${esc(o.context)}</p>${o.note ? `<p class="subtle">${esc(o.note)}</p>` : ''}</div><div class="record-actions">${action('observation', o.id, 'Edit', 'text-button')}${action('delete-observation', o.id, 'Delete', 'text-button danger')}</div></li>`).join('')}</ul></details>`;
  }
  function adjustmentList(metric) {
    const rows = state.adjustments.filter(a => a.metricId === metric.id).slice().reverse();
    if (!rows.length) return '';
    return `<section class="section-band"><h3>Your decisions</h3><ul class="record-list">${rows.map(a => `<li class="record"><div class="record-copy"><span class="tag ${a.status === 'reviewed' ? 'reviewed' : ''}">${a.status === 'reviewed' ? 'Reviewed' : a.reviewDate <= today ? 'Ready to revisit' : 'In progress'}</span><span class="subtle">Review ${dateLabel(a.reviewDate)}</span><p>${esc(a.text)}</p><span class="subtle">${({keep:'Keep the routine',change:'Change the method',rethink:'Revisit the measure'})[a.choice]}</span></div><div class="record-actions">${a.status === 'open' ? action('reviewed', a.id, 'Mark reviewed', 'text-button') : ''}${action('adjustment', a.id, 'Edit', 'text-button')}${action('delete-adjustment', a.id, 'Delete', 'text-button danger')}</div></li>`).join('')}</ul></section>`;
  }
  function directionView() {
    const metric = state.metrics.find(m => m.id === metricId) || state.metrics[0];
    if (!metric) return `<section class="empty"><p class="eyebrow">Your first direction check</p><h2>What would real progress look like?</h2><p>No measurements yet.</p>${action('metric', '', 'Add a measure', 'primary')}</section>`;
    metricId = metric.id;
    const result = core.direction(state, metric.id, { today });
    const effort = workspace === 'sample' ? core.effortForGoal({ ...sample.source, goalId:metric.goalId, start:shift(today,-6), end:today }) : null;
    const deltaUnit = metric.unit === '%' ? 'percentage points' : metric.unit;
    const change = result.delta === null ? 'One more comparable measurement needed' : `${result.delta > 0 ? '+' : ''}${number(result.delta)} ${esc(deltaUnit)} since the previous check`;
    const heading = result.count < 2 ? 'Give the result some context.' : result.delta === 0 ? 'Steady effort. An unchanged result.' : 'A result to reflect on.';
    const summary = result.count < 2 ? 'A single observation is a starting point, not a trend.' : `${dateLabel(result.previous.date)}: ${number(result.previous.value)} ${metric.unit}. ${dateLabel(result.latest.date)}: ${number(result.latest.value)} ${metric.unit}. This change alone does not tell us what caused it.`;
    return `<section><div class="section-head"><div class="goal-select"><label for="metric-picker" class="sr-only">Outcome measure</label><select id="metric-picker">${state.metrics.map(m => `<option value="${esc(m.id)}" ${m.id === metric.id ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></div>${action('metric', '', 'Add measure')}</div><div class="goal-trail">${esc(metric.goalTitle)}</div><div class="review-grid"><section class="outcome-section" aria-label="Outcome observations"><div class="chart-header"><div><h2>${esc(metric.title)}</h2><p class="subtle">${esc(metric.context)} &middot; ${metric.direction === 'up' ? 'Higher' : 'Lower'} is your aim</p></div>${action('metric', metric.id, 'Edit measure', 'text-button')}</div><div class="chart-header"><div class="big-value">${result.latest ? number(result.latest.value) : '--'}<small>${esc(metric.unit)}</small></div><p class="delta">${change}</p></div>${plot(metric, result.observations)}${action('observation', '', 'Record a measurement', 'full-width')}<div class="stats"><div class="stat"><strong>${effort ? effort.count : '--'}</strong><span>Goal-linked reps</span><span>Last 7 days${effort ? ' &middot; example' : ' &middot; not connected'}</span></div><div class="stat"><strong>${result.count}</strong><span>Comparable checks</span><span>Last 30 days</span></div><div class="stat"><strong>${result.latest ? dateLabel(result.latest.date) : '--'}</strong><span>Latest check</span><span>Self-recorded</span></div></div>${observationList(metric)}</section><section class="decision"><p class="eyebrow">Your next decision</p><h2>${heading}</h2><p>${esc(summary)}</p><form id="decision-form"><fieldset class="choice-list"><legend>What do you want to try?</legend><label><input type="radio" name="choice" value="keep" checked>Keep the routine</label><label><input type="radio" name="choice" value="change">Change the method</label><label><input type="radio" name="choice" value="rethink">Revisit the measure</label></fieldset>${area('One specific adjustment', 'text', '', true)}${field('Revisit on', 'reviewDate', shift(today,7), { type:'date', future:true })}<div class="form-error" role="alert"></div><button class="primary full-width" type="submit">Save my decision</button></form></section></div>${adjustmentList(metric)}</section>`;
  }
  function playbookView() {
    return `<section><div class="section-head"><div><p class="eyebrow">Built from your experience</p><h2>Keep what actually helped.</h2></div>${action('rule', '', 'Add response', 'primary')}</div><p class="playbook-lead">Your obstacles. Your responses. Your own verdict, without a score.</p>${!state.rules.length ? '<div class="empty"><h3>No saved responses yet.</h3><p>A difficult day can leave you with something useful for the next one.</p></div>' : ''}<div class="rules">${state.rules.map(rule => {
      const memory = core.playbook(state,rule.id);
      return `<article class="rule"><p class="eyebrow">When</p><h3>${esc(rule.obstacle)}</h3><p class="rule-context">${esc(rule.context)}</p><p class="eyebrow">My response</p><p class="rule-response">${esc(rule.response)}</p><div class="rule-memory"><div class="memory-copy"><strong>${memory.helped} marked helpful</strong><br>${memory.attempts.length} recorded attempts &middot; ${memory.unsure} unsure</div>${action('attempt', rule.id, 'Log a try')}</div><div class="rule-footer"><span class="subtle">${memory.attempts.length ? 'Your feedback, not a prediction' : 'Not tried yet'}</span><div>${action('rule', rule.id, 'Edit', 'text-button')}${action('delete-rule', rule.id, 'Forget', 'text-button danger')}</div></div>${memory.attempts.length ? `<details><summary>View attempts (${memory.attempts.length})</summary>${memory.attempts.slice().sort((a,b) => b.date.localeCompare(a.date)).map(a => `<div class="attempt"><span class="tag ${a.rating === 'helped' ? 'reviewed' : ''}">${ratingLabel(a.rating)}</span><span class="subtle">${dateLabel(a.date)}</span><p class="subtle">${esc(a.note)}</p><div class="record-actions">${action('edit-attempt', a.id, 'Edit', 'text-button')}${action('delete-attempt', a.id, 'Delete', 'text-button danger')}</div></div>`).join('')}</details>` : ''}</article>`;
    }).join('')}</div></section>`;
  }
  function ratingLabel(rating) { return ({ helped:'Helped', 'not-helped':'Did not help', unsure:'Not sure' })[rating]; }
  function render() {
    refreshDate();
    $('rule-count').textContent = state.rules.length;
    document.querySelectorAll('[data-view]').forEach(button => {
      if (button.dataset.view === view) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    $('content').innerHTML = view === 'direction' ? directionView() : playbookView();
    $('content').querySelectorAll('button,input,select,textarea').forEach(el => { if (!store) el.disabled = true; });
  }
  function openEditor(kind, id = '') {
    refreshDate();
    trigger = document.activeElement;
    mode = kind; currentId = id;
    let title, fields, button = 'Save';
    if (kind === 'metric') {
      const m = state.metrics.find(x => x.id === id) || { direction:'up',context:'' };
      const hasRecords = state.observations.some(o => o.metricId === id);
      title = id ? 'Edit outcome measure' : 'A measure that matters';
      fields = field('Goal', 'goalTitle', m.goalTitle, { max:120,readonly:hasRecords }) + field('Measure', 'title', m.title, {max:100}) + `<div class="form-grid">${field('Unit', 'unit', m.unit, {max:24,readonly:hasRecords})}${select('Your aim','direction',[['up','Higher'],['down','Lower']],m.direction)}</div>` + field('Comparison group', 'context', m.context, {max:120});
      if (hasRecords) fields += '<p class="form-note">Goal and unit are fixed for this measurement history.</p>';
    } else if (kind === 'observation') {
      const m = state.metrics.find(x => x.id === metricId);
      const o = state.observations.find(x => x.id === id) || {date:today,context:m.context};
      title = id ? 'Correct a measurement' : 'Record the result';
      fields = `<p class="form-note">${esc(m.title)} &middot; ${esc(m.goalTitle)}</p><div class="form-grid">${field('Value (' + m.unit + ')','value',o.value,{type:'number'})}${field('Date','date',o.date,{type:'date'})}</div>` + field('Comparison group','context',o.context,{max:120}) + area('Note (optional)','note',o.note);
    } else if (kind === 'rule') {
      const r = state.rules.find(x => x.id === id) || {};
      const hasAttempts = state.attempts.some(a => a.ruleId === id);
      title = id ? 'Edit your response' : 'Save a personal response';
      fields = field('When this gets in the way','obstacle',r.obstacle,{max:120}) + field('In this situation','context',r.context,{max:120}) + area('My response','response',r.response,true);
      if (hasAttempts) {
        fields += '<p class="form-note">A changed response becomes a new version. Earlier feedback stays with the original.</p>';
        button = 'Save new response';
      }
    } else if (kind === 'attempt' || kind === 'edit-attempt') {
      const a = kind === 'edit-attempt' ? state.attempts.find(x => x.id === id) : {ruleId:id,date:today,rating:'unsure'};
      const r = state.rules.find(x => x.id === a.ruleId);
      title = kind === 'edit-attempt' ? 'Edit this attempt' : 'How did it go?';
      fields = `<p class="form-note">${esc(r.response)}</p>` + field('Date','date',a.date,{type:'date'}) + select('Your verdict','rating',[['unsure','Not sure'],['helped','Helped'],['not-helped','Did not help']],a.rating) + area('What happened? (optional)','note',a.note);
    } else if (kind === 'adjustment') {
      const a = state.adjustments.find(x => x.id === id);
      title = 'Edit your decision';
      fields = select('Decision','choice',[['keep','Keep the routine'],['change','Change the method'],['rethink','Revisit the measure']],a.choice) + area('One specific adjustment','text',a.text,true) + field('Revisit on','reviewDate',a.reviewDate,{type:'date',future:true}) + select('Status','status',[['open','In progress'],['reviewed','Reviewed']],a.status);
    } else {
      title = kind === 'reset' ? 'Reset this workspace?' : kind === 'delete-rule' ? 'Forget this response?' : 'Delete this record?';
      fields = `<p>${kind === 'reset' ? 'This deletes this preview workspace\'s edits only. Your live Arc90 records are not affected.' : kind === 'delete-rule' ? 'The response and all its recorded attempts will be deleted from this browser.' : 'This cannot be undone. Other records will stay unchanged.'}</p>`;
      button = kind === 'reset' ? 'Reset workspace' : kind === 'delete-rule' ? 'Forget response' : 'Delete record';
    }
    $('editor-title').textContent = title;
    $('editor-form').innerHTML = fields + `<div class="form-error" role="alert"></div><div class="dialog-actions"><button type="button" id="cancel-editor">Cancel</button><button type="submit" class="${kind.startsWith('delete') || kind === 'reset' ? 'danger' : 'primary'}">${button}</button></div>`;
    $('editor').showModal();
  }
  function closeEditor() {
    $('editor').close();
    if (trigger?.isConnected) trigger.focus();
    else document.querySelector(`[data-view="${view}"]`).focus();
  }
  $('editor-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const id = currentId || uid();
    try {
      if (mode === 'reset') {
        const initial = workspace === 'sample' ? sample.state : core.empty();
        if (store) state = store.save(initial);
        else {
          if (localStorage.getItem(storageKey()) !== brokenRaw) throw new Error('This workspace changed. Reload before resetting.');
          localStorage.setItem(storageKey(), JSON.stringify(core.normalize(initial)));
        }
        closeEditor(); loadWorkspace(); notify('Preview workspace reset.'); return;
      }
      if (mode === 'metric') {
        const old = state.metrics.find(x => x.id === currentId);
        persist({type:'metric.save',record:{...data,id,goalId:old?.goalId || 'manual-' + uid()}});
        metricId = id;
      } else if (mode === 'observation') persist({type:'observation.save',record:{...data,id,metricId,value:data.value.trim() === '' ? NaN : Number(data.value)}});
      else if (mode === 'rule') {
        const old = state.rules.find(x => x.id === id);
        const changed = old && ['obstacle','context','response'].some(key => old[key] !== data[key].trim());
        const hasAttempts = state.attempts.some(a => a.ruleId === id);
        persist({type:'rule.save',record:{...data,id:changed && hasAttempts ? uid() : id}});
      }
      else if (mode === 'attempt' || mode === 'edit-attempt') {
        const old = state.attempts.find(x => x.id === currentId);
        persist({type:'attempt.save',record:{...data,id:mode === 'attempt' ? uid() : id,ruleId:mode === 'attempt' ? currentId : old.ruleId}});
      } else if (mode === 'adjustment') {
        const old = state.adjustments.find(x => x.id === currentId);
        persist({type:'adjustment.save',record:{...old,...data}});
      } else if (mode.startsWith('delete-')) persist({type:mode.slice(7) + '.delete',id:currentId});
      render(); closeEditor(); notify('Saved on this browser.');
    } catch (error) { event.currentTarget.querySelector('.form-error').textContent = error.message; }
  });
  $('content').addEventListener('submit', event => {
    if (event.target.id !== 'decision-form') return;
    event.preventDefault();
    refreshDate();
    const data = Object.fromEntries(new FormData(event.target));
    try {
      persist({type:'adjustment.save',record:{...data,id:uid(),metricId,date:today,status:'open'}});
      render(); notify('Decision saved. Review ' + dateLabel(data.reviewDate) + '.');
    } catch (error) { event.target.querySelector('.form-error').textContent = error.message; }
  });
  $('content').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'reviewed') {
      try { persist({type:'adjustment.save',record:{...state.adjustments.find(x => x.id === button.dataset.id),status:'reviewed'}}); render(); notify('Decision marked reviewed.'); } catch (error) { notify(error.message); }
    } else openEditor(button.dataset.action,button.dataset.id);
  });
  $('content').addEventListener('change', event => { if (event.target.id === 'metric-picker') { metricId = event.target.value; render(); } });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.view; notify(''); render(); }));
  document.querySelectorAll('[name="workspace"]').forEach(input => input.addEventListener('change', () => {
    workspace = input.value;
    try { localStorage.setItem('arc90:purpose-review:workspace',workspace); } catch (_) { /* Record writes still report failure. */ }
    loadWorkspace();
  }));
  $('theme').addEventListener('change', () => {
    document.documentElement.dataset.theme = $('theme').value;
    try { localStorage.setItem('arc90:purpose-review:theme',$('theme').value); } catch (_) { /* Theme preference is optional. */ }
  });
  $('close-editor').addEventListener('click',closeEditor);
  $('editor-form').addEventListener('click', event => { if (event.target.id === 'cancel-editor') closeEditor(); });
  $('reset').addEventListener('click', () => openEditor('reset'));
  $('export').addEventListener('click', () => {
    try {
      const body = brokenRaw !== null ? brokenRaw : JSON.stringify({kind:'arc90-purpose-review-export',workspace,exportedAt:new Date().toISOString(),records:state},null,2);
      const url = URL.createObjectURL(new Blob([body],{type:'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = `arc90-${workspace}-review-${today}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),10000);
      notify('Export prepared. It contains only this preview workspace.');
    } catch (error) { notify('Export failed: ' + error.message); }
  });
  window.addEventListener('storage', event => { if (event.key === storageKey()) notify('This workspace changed in another window. Reload before making edits.'); });
  window.addEventListener('focus', refreshDate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDate(); });
  document.addEventListener('input', refreshDate);
  try {
    workspace = localStorage.getItem('arc90:purpose-review:workspace') === 'personal' ? 'personal' : 'sample';
    const theme = localStorage.getItem('arc90:purpose-review:theme');
    if (['dark','light'].includes(theme)) { document.documentElement.dataset.theme = theme; $('theme').value = theme; }
  } catch (_) { /* The data loader below provides the actionable storage error. */ }
  loadWorkspace();
}());

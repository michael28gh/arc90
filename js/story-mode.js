/* Progress Story sidecar. Load css/story-mode.css and this file before calling open().
   data: { title?, period?, day?, goal?, done?, due?, pct?,
           rows?: [{ label, detail?, done?, due?, pct?, rest? }],
           habits?: [{ name, done?, due?, pct? }] }.
   Counts and percentages are shown only when supplied (or calculated from supplied counts).
   Reopening closes the previous story. Reduced motion disables timed advancement. */
(function () {
  'use strict';

  const DURATION = 5000;
  const WIDTH = 1080;
  const HEIGHT = 1350;
  let active = null;

  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const label = (value) => typeof value === 'string' ? value.trim() : '';
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const percent = (value) => Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  const plain = (value) => isObject(value) ? value : {};
  const metric = (row) => {
    const done = count(row.done);
    const due = count(row.due);
    const pct = percent(row.pct);
    if (done !== null && due !== null && due > 0 && done <= due) {
      return { value: `${done} / ${due}`, pct: Math.round(done / due * 100) };
    }
    if (pct !== null) return { value: `${Math.round(pct)}%`, pct };
    if (row.rest === true || due === 0) return { value: 'Rest', pct: null };
    return { value: null, pct: null };
  };

  function makeCards(input) {
    const data = plain(input);
    const cards = [{ type: 'summary', title: label(data.title) || 'Progress', rows: [] }];
    const summary = cards[0];
    if (count(data.day) !== null) summary.rows.push({ label: 'Day of your arc', value: String(data.day) });
    const total = metric(data);
    if (total.value) summary.rows.push({ label: total.value.includes('/') ? 'Reps kept' : total.value === 'Rest' ? 'Activity' : 'Completion', value: total.value, pct: total.pct });
    if (label(data.goal)) summary.rows.push({ label: 'Goal', value: label(data.goal) });
    if (Array.isArray(data.areas) && data.areas.length) {
      cards.push({ type: 'balance', title: 'Life balance', private: true, rows: data.areas.map(plain)
        .filter((row) => label(row.name)).map((row) => ({ label: label(row.name), ...metric(row) })).slice(0, 8) });
    }
    if (isObject(data.rhythm) && isObject(data.rhythm.best) && isObject(data.rhythm.worst)) {
      cards.push({ type: 'rhythm', title: 'Your rhythm', rows: [
        { label: `Best day · ${label(data.rhythm.best.name)}`, ...metric(data.rhythm.best) },
        { label: `Toughest day · ${label(data.rhythm.worst.name)}`, ...metric(data.rhythm.worst) },
      ] });
    } else if (Array.isArray(data.rows) && data.rows.length) {
      cards.push({ type: 'timeline', title: 'The timeline', rows: data.rows.map(plain).filter((row) => label(row.label)).map((row) => ({ label: label(row.label), detail: label(row.detail), ...metric(row) })).slice(0, 8) });
    }
    if (Array.isArray(data.habits) && data.habits.length) {
      cards.push({ type: 'habits', title: 'Habits', rows: data.habits.map(plain).filter((row) => label(row.name)).map((row) => ({ label: label(row.name), ...metric(row) })).slice(0, 7) });
    }
    if (isObject(data.purpose)) {
      const score = percent(data.purpose.score);
      const orphans = count(data.purpose.orphanHabits);
      const active = count(data.purpose.activeGoals);
      const rows = [];
      if (score !== null) rows.push({ label: 'Effort reaching a long-term goal', value: `${Math.round(score)}%`, pct: score });
      if (active !== null) rows.push({ label: 'Active goals', value: String(active) });
      if (orphans !== null) rows.push({ label: 'Habits without a goal', value: String(orphans) });
      cards.push({ type: 'purpose', title: 'Purpose flow', rows });
    }
    if (isObject(data.insight) && label(data.insight.text)) {
      cards.push({ type: 'insight', title: 'Your next move', rows: [
        { label: label(data.insight.text) },
        ...(label(data.insight.action) ? [{ label: 'Next move', detail: label(data.insight.action) }] : []),
      ] });
    }
    return cards.filter((card) => card.type === 'summary' || card.rows.length);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, text, title) {
    const node = element('button', className, text);
    node.type = 'button';
    if (title) node.setAttribute('aria-label', title);
    return node;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function fitted(ctx, value, x, y, width, size, weight, color) {
    let text = String(value);
    ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    while (text.length > 1 && ctx.measureText(text).width > width) text = text.slice(0, -1);
    if (text !== String(value)) text = text.slice(0, -1) + '\u2026';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function canvasFor(card, data, index, length) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    const ink = '#f2f4f6', muted = '#a7b0b5', accent = '#b3dfbd';
    ctx.fillStyle = '#111315';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textBaseline = 'alphabetic';
    fitted(ctx, 'ARC90', 90, 130, 600, 42, 800, accent);
    fitted(ctx, label(data.period) || 'YOUR ARC', 90, 204, 800, 25, 700, muted);
    fitted(ctx, card.title, 90, 340, 900, 78, 750, ink);
    ctx.fillStyle = '#36443e';
    ctx.fillRect(90, 383, 900, 2);
    const rows = card.private && data.shareSensitive !== true ? [] : card.rows;
    if (!rows.length) {
      fitted(ctx, card.private ? 'Area details hidden for sharing' : 'No activity data yet', 90, 490, 880, 42, 500, muted);
    } else {
      const firstY = 485;
      const spacing = Math.min(110, 690 / rows.length);
      rows.forEach((row, i) => {
        const y = firstY + i * spacing;
        fitted(ctx, row.label, 90, y, 610, 32, 600, muted);
        if (row.value) {
          ctx.textAlign = 'right';
          fitted(ctx, row.value, 990, y, 265, 36, 750, ink);
          ctx.textAlign = 'left';
        }
        if (row.detail) fitted(ctx, row.detail, 90, y + 32, 830, 23, 400, muted);
        if (row.pct !== null && row.pct !== undefined) {
          ctx.fillStyle = '#304039';
          ctx.fillRect(90, y + (row.detail ? 47 : 20), 900, 9);
          ctx.fillStyle = accent;
          ctx.fillRect(90, y + (row.detail ? 47 : 20), 900 * row.pct / 100, 9);
        }
      });
    }
    ctx.fillStyle = '#36443e';
    ctx.fillRect(90, 1225, 900, 2);
    fitted(ctx, 'ARC90  /  PROGRESS', 90, 1280, 700, 24, 700, muted);
    ctx.textAlign = 'right';
    fitted(ctx, `${index + 1} / ${length}`, 990, 1280, 150, 24, 700, muted);
    return canvas;
  }

  function open(options) {
    if (!isObject(options) || !isObject(options.data)) throw new TypeError('Arc90Story.open requires a plain data object');
    if (active) active.close();
    const data = options.data;
    const cards = makeCards(data);
    const reduced = options.reducedMotion === undefined
      ? !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      : !!options.reducedMotion;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const root = element('div', 'arc90-story');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Progress story');
    root.tabIndex = -1;
    if (reduced) root.classList.add('arc90-story-reduced');
    const shell = element('div', 'arc90-story-shell');
    const top = element('div', 'arc90-story-top');
    const heading = element('span', 'arc90-story-heading', 'Progress story');
    const closeButton = button('arc90-story-icon', '\u00d7', 'Close story');
    top.append(heading, closeButton);
    const progress = element('div', 'arc90-story-progress');
    progress.setAttribute('aria-label', `${cards.length} story cards`);
    const bars = cards.map((_, i) => {
      const track = element('span', 'arc90-story-track');
      track.setAttribute('aria-label', `Card ${i + 1}`);
      track.appendChild(element('i', 'arc90-story-fill'));
      progress.appendChild(track);
      return track.firstChild;
    });
    const stage = element('div', 'arc90-story-stage');
    stage.setAttribute('aria-live', 'polite');
    const actions = element('div', 'arc90-story-actions');
    const previous = button('arc90-story-icon', '\u2039', 'Previous card');
    const next = button('arc90-story-icon', '\u203a', 'Next card');
    const share = button('arc90-story-command', 'Share', 'Share current card');
    const save = button('arc90-story-command', 'Save image', 'Save current card as PNG');
    actions.append(previous, share, save, next);
    shell.append(top, progress, stage, actions);
    root.appendChild(shell);
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';

    let index = 0, elapsed = 0, lastTime = null, frame = null, pressed = false, pressAt = 0, closed = false;
    let visible = !document.hidden;
    const paintBars = () => bars.forEach((bar, i) => {
      const amount = reduced ? (i <= index ? 1 : 0) : i < index ? 1 : i > index ? 0 : Math.min(1, elapsed / DURATION);
      bar.style.transform = `scaleX(${amount})`;
    });
    const render = () => {
      const card = cards[index];
      stage.replaceChildren();
      const content = element('div', 'arc90-story-content');
      content.appendChild(element('div', 'arc90-story-brand', 'ARC90'));
      content.appendChild(element('div', 'arc90-story-period', label(data.period) || 'YOUR ARC'));
      content.appendChild(element('h2', 'arc90-story-title', card.title));
      const list = element('div', 'arc90-story-list');
      if (!card.rows.length) list.appendChild(element('p', 'arc90-story-empty', 'No activity data yet'));
      card.rows.forEach((row) => {
        const item = element('div', 'arc90-story-row');
        const line = element('div', 'arc90-story-row-line');
        line.append(element('span', '', row.label));
        if (row.value) line.append(element('strong', '', row.value));
        item.appendChild(line);
        if (row.detail) item.appendChild(element('small', '', row.detail));
        if (row.pct !== null && row.pct !== undefined) {
          const track = element('div', 'arc90-story-meter');
          const fill = element('i');
          fill.style.width = `${row.pct}%`;
          track.appendChild(fill);
          item.appendChild(track);
        }
        list.appendChild(item);
      });
      content.appendChild(list);
      const footer = element('div', 'arc90-story-footer');
      footer.append(element('span', '', 'ARC90 / PROGRESS'), element('span', '', `${index + 1} / ${cards.length}`));
      content.appendChild(footer);
      stage.appendChild(content);
      previous.disabled = index === 0;
      next.disabled = index === cards.length - 1;
      paintBars();
    };
    const tick = (now) => {
      frame = null;
      if (closed || reduced || pressed || !visible) return;
      if (lastTime !== null) elapsed += Math.max(0, now - lastTime);
      lastTime = now;
      if (elapsed >= DURATION) {
        if (index < cards.length - 1) {
          index++;
          elapsed = 0;
          render();
        } else {
          elapsed = DURATION;
          paintBars();
          return;
        }
      } else paintBars();
      frame = requestAnimationFrame(tick);
    };
    const pause = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; lastTime = null; };
    const resume = () => { if (!closed && !reduced && !pressed && visible && frame === null && elapsed < DURATION) frame = requestAnimationFrame(tick); };
    const navigate = (direction) => {
      const target = Math.max(0, Math.min(cards.length - 1, index + direction));
      if (target === index) return;
      pause();
      index = target;
      elapsed = 0;
      render();
      resume();
    };
    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      pressed = true;
      pressAt = performance.now();
      pause();
      stage.setPointerCapture?.(event.pointerId);
    };
    const onPointerUp = (event) => {
      if (!pressed) return;
      pressed = false;
      const quick = performance.now() - pressAt < 350;
      if (quick) {
        const rect = stage.getBoundingClientRect();
        navigate(event.clientX < rect.left + rect.width / 2 ? -1 : 1);
      }
      resume();
    };
    const onPointerCancel = () => { pressed = false; resume(); };
    const onVisibility = () => { visible = !document.hidden; if (visible) resume(); else pause(); };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); navigate(1); }
      else if (event.key === 'Tab') {
        const focusables = [closeButton, previous, share, save, next].filter((node) => !node.disabled);
        const current = focusables.indexOf(document.activeElement);
        const target = event.shiftKey ? (current <= 0 ? focusables.at(-1) : focusables[current - 1]) : focusables[(current + 1) % focusables.length];
        event.preventDefault();
        target.focus();
      }
    };
    const close = () => {
      if (closed) return;
      closed = true;
      pause();
      root.remove();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
      if (active === controller) active = null;
      previousFocus?.focus?.();
      if (typeof options.onClose === 'function') options.onClose();
    };
    const exportCard = (mode) => {
      let canvas;
      const exportIndex = index;
      try { canvas = canvasFor(cards[exportIndex], data, exportIndex, cards.length); }
      catch (_) { return; }
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const filename = `arc90-progress-${exportIndex + 1}.png`;
        if (mode === 'share' && navigator.share && navigator.canShare && typeof File !== 'undefined') {
          const file = new File([blob], filename, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file] }); } catch (_) { /* Cancelled share. */ }
            return;
          }
        }
        download(blob, filename);
      }, 'image/png');
    };
    const controller = { close };
    closeButton.addEventListener('click', close);
    previous.addEventListener('click', () => navigate(-1));
    next.addEventListener('click', () => navigate(1));
    share.addEventListener('click', () => exportCard('share'));
    save.addEventListener('click', () => exportCard('save'));
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibility);
    render();
    closeButton.focus();
    active = controller;
    resume();
    return controller;
  }

  window.Arc90Story = { open };
}());

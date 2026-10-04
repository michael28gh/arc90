(function (root) {
  'use strict';
  const tokens = Object.freeze({ fast: 150, base: 250, slow: 450, draw: 600, stagger: 40, cellStagger: 8 });
  const styles = document.documentElement.style;
  for (const [key, value] of Object.entries(tokens)) styles.setProperty(`--motion-${key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}`, `${value}ms`);
  styles.setProperty('--motion-ease-out', 'cubic-bezier(.22,1,.36,1)');
  styles.setProperty('--motion-spring', 'cubic-bezier(.34,1.45,.5,1)');
  const seen = new Set();
  let observer;
  const reduced = () => document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;

  function count(element) {
    const value = Number(element.dataset.countTo), suffix = element.dataset.countSuffix ?? '%';
    if (!Number.isFinite(value) || reduced()) return;
    const start = performance.now();
    const tick = now => {
      if (!element.isConnected) return;
      const fraction = Math.min(1, (now - start) / tokens.draw);
      element.textContent = Math.round(value * (1 - Math.pow(1 - fraction, 3))) + suffix;
      if (fraction < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function morphPath(element, previous, next, path) {
    if (!element || reduced() || !Array.isArray(previous) || previous.length !== next.length) return;
    const started = performance.now();
    const tick = now => {
      if (!element.isConnected) return;
      if (reduced()) {
        element.setAttribute('d', path(next));
        element.dataset.radarValues = JSON.stringify(next);
        return;
      }
      const fraction = Math.min(1, (now - started) / tokens.slow);
      const eased = fraction * fraction * (3 - 2 * fraction);
      const values = next.map((value, index) => previous[index] + (value - previous[index]) * eased);
      element.setAttribute('d', path(values));
      element.dataset.radarValues = JSON.stringify(values);
      if (fraction < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function pulsePurpose(tile) {
    if (!tile || reduced()) return;
    const source = tile.querySelector('.adaptive-state');
    const target = tile.querySelector('.adaptive-purpose');
    if (!source || !target) return;
    const from = source.getBoundingClientRect(), to = target.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const dot = document.createElement('span');
    dot.setAttribute('aria-hidden', 'true');
    Object.assign(dot.style, {
      position: 'fixed', left: `${from.left + from.width / 2 - 3}px`, top: `${from.top + from.height / 2 - 3}px`,
      width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)',
      pointerEvents: 'none', zIndex: '120',
    });
    document.body.appendChild(dot);
    const dx = to.left + Math.min(12, to.width / 2) - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const motion = dot.animate([
      { transform: 'translate(0,0) scale(.75)', opacity: 0 },
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: .15 },
      { transform: `translate(${dx}px,${dy}px) scale(1)`, opacity: 1, offset: .8 },
      { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 0 },
    ], { duration: tokens.slow, easing: 'cubic-bezier(.22,1,.36,1)' });
    motion.finished.catch(() => {}).then(() => dot.remove());
    target.animate([{ color: 'var(--accent)' }, { color: 'var(--tx)' }, { color: 'var(--accent)' }], { duration: tokens.slow });
  }

  function observeCharts(container, entering) {
    observer?.disconnect();
    if (entering) seen.clear();
    const cards = [...container.querySelectorAll('.pd-card, .pd-panel')];
    const reveal = card => {
      const id = card.getAttribute('aria-labelledby');
      if (seen.has(id)) return;
      seen.add(id);
      card.classList.add(reduced() ? 'pd-fade' : 'pd-enter');
      card.querySelectorAll('[data-count-to]').forEach(count);
    };
    if (!('IntersectionObserver' in root)) { cards.forEach(reveal); return; }
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        reveal(entry.target);
        observer.unobserve(entry.target);
      }
    }, { threshold: .08 });
    cards.filter(card => !seen.has(card.getAttribute('aria-labelledby'))).forEach(card => observer.observe(card));
  }
  root.Arc90Motion = { tokens, reduced, observeCharts, morphPath, pulsePurpose };
}(window));

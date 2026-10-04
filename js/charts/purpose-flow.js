(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('d3-sankey'));
  else root.Arc90PurposeChart = factory(root.d3);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (d3) {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const tone = node => node.id === 'no-purpose' ? 'var(--tx-3)' : ['var(--accent)', 'var(--accent-3)', 'var(--mint)', 'var(--tx-2)'][node.column];
  let cachedKey = '', cachedGraph;

  function layout(data) {
    const key = JSON.stringify([data.nodes, data.links]);
    if (key === cachedKey) return cachedGraph;
    const replacements = new Map();
    const nodes = [];
    for (let column = 0; column < 4; column++) {
      const group = data.nodes.filter(node => node.column === column && node.id !== 'no-purpose').sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
      const limit = column === 3 && data.orphanHabits ? 2 : 3;
      nodes.push(...group.slice(0, limit).map(node => ({ ...node })));
      const rest = group.slice(limit);
      if (rest.length) {
        const id = `summary-${column}`;
        rest.forEach(node => replacements.set(node.id, id));
        nodes.push({ id, column, title: `+${rest.length} more`, value: rest.reduce((sum, node) => sum + node.value, 0) });
      }
    }
    const orphan = data.nodes.find(node => node.id === 'no-purpose');
    if (orphan) nodes.push({ ...orphan });
    const grouped = new Map();
    for (const link of data.links.filter(link => link.value > 0)) {
      const source = replacements.get(link.source) || link.source;
      const target = replacements.get(link.target) || link.target;
      const id = JSON.stringify([source, target]);
      if (!grouped.has(id)) grouped.set(id, { source, target, value: 0 });
      grouped.get(id).value += link.value;
    }
    // Invisible anchors keep empty horizons in place without inventing visible links.
    const anchors = [0, 1, 2, 3].map(column => ({ id: `anchor-${column}`, column, hidden: true, fixedValue: .00001 }));
    const graph = d3.sankey().nodeId(node => node.id).nodeAlign(node => node.column)
      .nodeWidth(6).nodePadding(34).iterations(24).extent([[9, 34], [282, 246]])({
        nodes: [...nodes.map(node => ({ ...node, actualValue: node.value, fixedValue: Math.max(node.value, data.total * .015, .25) })), ...anchors],
        links: [...grouped.values(), ...[0, 1, 2].map(i => ({ source: `anchor-${i}`, target: `anchor-${i + 1}`, value: .00001, hidden: true }))],
      });
    cachedKey = key; cachedGraph = graph;
    return graph;
  }

  function render(data, prefix = 'purpose') {
    if (!data.total || !data.links.some(link => link.value > 0)) return '<div class="pd-ghost">Complete a linked habit to reveal your flow.</div>';
    const graph = layout(data);
    const links = graph.links.filter(link => !link.hidden);
    const nodes = graph.nodes.filter(node => !node.hidden);
    const id = escape(prefix.replace(/[^a-zA-Z0-9_-]/g, ''));
    return `<svg class="pd-flow" viewBox="0 0 360 270" role="img" aria-label="Purpose flow: ${Math.round(data.score || 0)} percent reaches a long-term goal; ${data.orphanHabits} habits without a goal">
      <defs>${links.map((link, index) => `<linearGradient id="${id}-${index}" gradientUnits="userSpaceOnUse" x1="${link.source.x1}" x2="${link.target.x0}"><stop stop-color="${tone(link.source)}"/><stop offset="1" stop-color="${tone(link.target)}"/></linearGradient>`).join('')}</defs>
      ${['Vision', 'Goals', 'Steps', 'Habits'].map((title, index) => `<text class="pd-flow-heading" x="${9 + index * 89}" y="14">${title}</text>`).join('')}
      <g class="pd-flow-ribbons">${links.map((link, index) => `<path d="${d3.sankeyLinkHorizontal()(link)}" fill="none" stroke="url(#${id}-${index})" stroke-width="${Math.max(2, link.width)}" opacity=".3"><title>${escape(link.target.title)} supports ${escape(link.source.title)}: ${link.value} completions</title></path>`).join('')}</g>
      ${nodes.map(node => `<g><rect x="${node.x0}" y="${node.y0}" width="6" height="${Math.max(3, node.y1 - node.y0)}" fill="${tone(node)}"/><text x="${node.x1 + 4}" y="${node.y0 + 10}">${escape(node.title.length > 11 ? node.title.slice(0, 10) + '…' : node.title)}</text><text class="pd-flow-value" x="${node.x1 + 4}" y="${node.y0 + 22}">${Math.round(node.actualValue / data.total * 100)}%</text><title>${escape(node.title)}: ${node.actualValue} completions</title>${node.id === 'no-purpose' ? `<path d="M${node.x0 - 25} ${node.y1 - 3}H${node.x0 - 3}" stroke="var(--tx-3)" stroke-dasharray="2 3"/>` : ''}</g>`).join('')}
    </svg>`;
  }
  return { layout, render };
}));

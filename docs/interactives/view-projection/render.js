(function (root) {
  'use strict';
  const model = typeof module === 'object' && module.exports ? require('./model.js') : root.CourseWikiViewProjection;
  const points = list => list.map(p => p.join(',')).join(' ');
  const text = (x, y, value, extra = '') => `<text x="${x}" y="${y}" ${extra}>${value}</text>`;
  function drawing(part, convention = 'third', masked = '', guides = false) {
    const positions = model.layout(convention), s = 40;
    let body = '';
    if (guides) {
      const f = positions.front, t = positions.top, r = positions.right;
      body += `<g class="vp-guide" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 5">`;
      for (let i = 0; i <= part.heights.length; i++) body += `<path d="M${f[0] + i * s} ${f[1]}V${t[1] - part.depth * s}"/>`;
      for (const h of [0, ...new Set(part.heights)]) body += `<path d="M${Math.min(f[0], r[0])} ${f[1] - h * s}H${Math.max(f[0] + part.heights.length * s, r[0] + part.depth * s)}"/>`;
      body += '</g>';
    }
    for (const view of ['front', 'top', 'right']) {
      const p = model.project(part, view), [x, y] = positions[view];
      const xy = ([a, b]) => [x + a * s, y - b * s];
      body += text(x, y + 28, view[0].toUpperCase() + view.slice(1));
      if (view === masked) {
        body += `<rect x="${x - 8}" y="${y - p.height * s - 8}" width="${p.width * s + 16}" height="${p.height * s + 16}" fill="var(--surface, white)" stroke="currentColor" stroke-dasharray="5 5"/>`;
        body += text(x + p.width * s / 2, y - p.height * s / 2 + 6, '?', 'text-anchor="middle"');
      } else {
        body += `<polygon points="${points(p.outline.map(xy))}" fill="var(--surface, white)" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>`;
        for (const e of p.edges) body += `<polyline points="${points([xy(e.a), xy(e.b)])}" fill="none" stroke="currentColor" stroke-width="1.5"${e.hidden ? ' stroke-dasharray="7 4"' : ''}/>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 400" role="img" aria-label="${convention}-angle layout for ${part.name}. ${masked ? masked + ' view concealed for prediction.' : 'Front, top, and right views.'}" style="font-family:system-ui,sans-serif;font-size:18px">${body}</svg>`;
  }

  function pictorial(part, options = {}) {
    const s = 38, project = ([x, y, z]) => [65 + s * x + s * .65 * y, 190 - s * z - s * .4 * y];
    const poly = (pts, fill) => `<polygon points="${points(pts.map(project))}" fill="${fill}" stroke="#182c40" stroke-width="1.7" stroke-linejoin="round"/>`;
    let body = '';
    const h = part.heights, n = h.length, d = part.depth;
    // Opaque front, top strips and all risers that face the viewer at +x.
    for (let x = 0; x < n; x++) {
      body += poly([[x, 0, h[x]], [x + 1, 0, h[x]], [x + 1, d, h[x]], [x, d, h[x]]], '#e7c86a');
      if (x === n - 1 || h[x] > h[x + 1]) {
        const low = x === n - 1 ? 0 : h[x + 1];
        body += poly([[x + 1, 0, low], [x + 1, d, low], [x + 1, d, h[x]], [x + 1, 0, h[x]]], '#a9c9db');
      }
    }
    // Use the actual front outline so coplanar strips do not invent seams.
    const f = model.project(part, 'front');
    body += poly(f.outline.map(([x, z]) => [x, 0, z]), '#f3f6f8');
    // Cover artificial top seams between equal heights by rendering contiguous runs once.
    for (let x = 0; x < n;) {
      let end = x + 1; while (end < n && h[end] === h[x]) end++;
      body += poly([[x, 0, h[x]], [end, 0, h[x]], [end, d, h[x]], [x, d, h[x]]], '#e7c86a');
      x = end;
    }
    if (options.labels !== false) {
      body += '<g fill="#182c40" font-family="system-ui,sans-serif" font-size="16">';
      body += text(55, 221, 'Look from FRONT ↑');
      body += text(245, 166, '← RIGHT');
      body += text(118, 33, 'TOP ↓');
      body += '</g>';
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 240" role="img" aria-label="Pictorial of ${part.name}.">${options.background === false ? '' : '<rect width="340" height="240" fill="#fff"/>'}${body}</svg>`;
  }
  const api = { drawing, pictorial };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiViewProjectionRender = api;
})(typeof globalThis === 'object' ? globalThis : this);

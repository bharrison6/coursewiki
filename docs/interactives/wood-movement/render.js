(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function format(value, unit, signed = false) {
    if (value === 0) return '0';
    const magnitude = Math.abs(value), digits = unit === 'in' ? 4 : 3;
    const rounded = magnitude.toFixed(digits);
    const number = Number(rounded) === 0 || magnitude >= 1e7 ? magnitude.toExponential(2) : rounded;
    return (value < 0 ? '−' : signed ? '+' : '') + number;
  }
  function pointText(point, unit) {
    if (point.direction === 'none') return '0 ' + unit + ' · stationary';
    const travel = format(point.signedTravel, unit, true) + ' ' + unit + ' ' + point.direction;
    if (point.status === 'exceeds') return travel + ' · exceeds by ' + format(-point.remaining, unit) + ' ' + unit;
    if (point.status === 'at-limit') return travel + ' · at travel limit';
    return travel + ' · ' + format(point.remaining, unit) + ' ' + unit + ' travel left';
  }
  function diagram(result, extent, preview = false) {
    const {unit, points, anchor, inward, outward} = result;
    const x0 = 95, x1 = 405, y = 47, boardHeight = 36;
    // Divide first: 68 / a valid subnormal extent can overflow, even though
    // each normalized displacement and its final display coordinate is bounded.
    const displayDistance = value => extent > 0 ? value / extent * 68 : 0;
    const displacement = points.map(p => preview ? 0 : displayDistance(p.displacement));
    const reference = anchor === 'center' ? (x0 + x1) / 2 : x0;
    const caption = preview ? 'Installed board; moisture change not applied yet.' : points.map(p => p.edge + ' edge: ' + pointText(p, unit)).join('. ');
    // Stationary support windows: pin center may travel within these intervals.
    // Clear travel is entered directly; no slot length or fastener size is inferred.
    const gauges = points.map((p, i) => {
      const x = i ? x1 : x0, sign = i ? 1 : -1;
      const fixed = p.position === result.reference;
      if (fixed) return '';
      const low = Math.min(x - sign * displayDistance(inward), x + sign * displayDistance(outward));
      const high = Math.max(x - sign * displayDistance(inward), x + sign * displayDistance(outward));
      const moved = x + displacement[i];
      return `<g class="wm-gauge" data-edge="${p.edge}" data-displacement="${preview ? 0 : p.displacement}">
        <rect class="wm-window" x="${low}" y="103" width="${high-low}" height="18" rx="3"/>
        <path class="wm-origin" d="M${x} 99v26"/>
        <path class="wm-leader" d="M${moved} ${y+boardHeight}V112"/>
        <circle class="wm-pin${!preview && p.status === 'exceeds' ? ' wm-exceeded' : ''}" cx="${moved}" cy="112" r="5"/>
      </g>`;
    }).join('');
    return `<svg class="wm-diagram" viewBox="0 0 500 144" role="img" aria-label="${esc(caption)}" focusable="false">
      <rect class="wm-support" x="12" y="93" width="476" height="38" rx="4"/>
      <rect class="wm-board" x="${x0+displacement[0]}" y="${y}" width="${x1-x0+displacement[1]-displacement[0]}" height="${boardHeight}"/>
      <path class="wm-grain" d="M${x0+displacement[0]+12} ${y+8}v20 M250 ${y+8}v20 M${x1+displacement[1]-12} ${y+8}v20"/>
      <rect class="wm-installed" x="${x0}" y="${y}" width="${x1-x0}" height="${boardHeight}"/>
      ${gauges}
      <path class="wm-fixed" d="M${reference} 39v87 M${reference-9} 135l9-9 9 9Z"/>
    </svg>`;
  }
  function comparison(center, edge, preview = false) {
    // Common magnification for BOTH boards and their travel windows. Fit all
    // extremes without clipping or constraining the free movement to a window.
    const largest = Math.max(Math.abs(edge.change), center.inward, center.outward);
    return [center, edge].map(r => `<div class="wm-case" data-anchor="${r.anchor}">
      <strong>${r.anchor === 'center' ? 'Center fixed' : 'Left edge fixed'}</strong>
      ${diagram(r, largest, preview)}
      <div class="wm-edge-readings">${r.points.map(p => `<div><span>${p.edge === 'left' ? 'Left' : 'Right'} edge</span><strong>${preview ? 'At installation' : esc(pointText(p,r.unit))}</strong></div>`).join('')}</div>
    </div>`).join('');
  }
  const api = Object.freeze({format, pointText, diagram, comparison});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiWoodMovementRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

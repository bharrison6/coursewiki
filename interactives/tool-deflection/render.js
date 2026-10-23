(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiDeflection);
  if (node) module.exports = api; else root.CourseWikiDeflectionDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  var GEOMETRY_SCALE = 2.8, CLAMP = 80;
  function n(v) { return M.format(v, 4); }
  function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function txt(x, y, value, cls, anchor) {
    return '<text x="' + n(x) + '" y="' + n(y) + '" class="td-text ' + (cls || '') + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(value) + '</text>';
  }
  function path(d, cls, attrs) { return '<path class="' + cls + '" d="' + d + '"' + (attrs || '') + '/>'; }
  function commonScale(a, b) {
    // Fixed ×100 for the main experiments; extreme settings reduce BOTH bends together.
    var largest = Math.max(M.solve(a).tip, M.solve(b).tip);
    return largest === 0 ? 100 : Math.min(100, 58 / (largest * GEOMETRY_SCALE));
  }
  function shape(s, originY, amplification) {
    M.validate(s);
    var top = [], bottom = [], r = s.diameter * GEOMETRY_SCALE / 2;
    for (var i = 0; i <= 40; i++) {
      var x = s.length * i / 40, y = originY + M.at(s, x) * GEOMETRY_SCALE * amplification;
      top.push([CLAMP + x * GEOMETRY_SCALE, y - r]);
      bottom.push([CLAMP + x * GEOMETRY_SCALE, y + r]);
    }
    var points = top.concat(bottom.reverse());
    return points.map(function (p, i) { return (i ? 'L' : 'M') + n(p[0]) + ' ' + n(p[1]); }).join('') + 'Z';
  }
  function beam(s, y, scale, label, live) {
    var r = s.diameter * GEOMETRY_SCALE / 2, end = CLAMP + s.length * GEOMETRY_SCALE;
    var dy = M.solve(s).tip * GEOMETRY_SCALE * scale, out = [];
    out.push(txt(16, y - 37, label, 'td-row-label'));
    out.push(txt(480, y - 37, M.format(M.solve(s).micrometers) + ' µm', 'td-value', 'end'));
    out.push('<rect class="td-holder" x="30" y="' + n(y - 28) + '" width="50" height="56" rx="3"/>');
    for (var j = 0; j < 4; j++) out.push(path('M' + (35 + j * 11) + ' ' + (y - 27) + 'l-5 54', 'td-hatch'));
    out.push(path('M' + CLAMP + ' ' + (y - 29) + 'v58', 'td-clamp'));
    out.push(path(shape(s, y, scale), 'td-tool' + (live ? ' td-current' : ''),
      ' data-tip-mm="' + M.solve(s).tip + '" data-bend-scale="' + scale + '"'));
    // The unloaded outline and axis stay in place even when the loaded tool moves.
    out.push(path('M' + CLAMP + ' ' + n(y - r) + 'H' + n(end) + 'V' + n(y + r) + 'H' + CLAMP, 'td-reference'));
    out.push(path('M' + CLAMP + ' ' + y + 'H' + n(end + 12), 'td-axis'));
    if (s.force > 0) {
      out.push(path('M' + n(end + 11) + ' ' + n(y + dy - 27) + 'v23m-5-7l5 7 5-7', 'td-force'));
    }
    out.push(txt(end + 22, y + dy - 9, M.format(s.force) + ' N', 'td-small'));
    out.push(path('M' + CLAMP + ' ' + (y + 77) + 'H' + n(end) + 'M' + CLAMP + ' ' + (y + 72) + 'v10M' + n(end) + ' ' + (y + 72) + 'v10', 'td-dimension'));
    out.push(txt((CLAMP + end) / 2, y + 96, 'L = ' + M.format(s.length) + ' mm', 'td-small', 'middle'));
    out.push(txt(480, y + 77, 'Ø ' + M.format(s.diameter) + ' mm', 'td-small', 'end'));
    out.push(txt(480, y + 96, 'E ' + M.format(s.modulus) + ' GPa', 'td-small', 'end'));
    return out.join('');
  }
  function pair(current, baseline) {
    var scale = commonScale(current, baseline);
    var label = 'Solid round tools, side view. Baseline: ' + M.format(M.solve(baseline).micrometers) +
      ' micrometers tip displacement. Your setup: ' + M.format(M.solve(current).micrometers) +
      ' micrometers. Both bending displacements exaggerated by ' + M.format(scale, 1) + ' times.';
    return '<svg class="td-beams" viewBox="0 0 500 364" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      txt(16, 17, 'IDEAL SOLID ROUND TOOL', 'td-small') +
      txt(480, 17, 'Bending ×' + M.format(scale, 1) + ' in both', 'td-small', 'end') +
      beam(baseline, 80, scale, 'BASELINE', false) + beam(current, 250, scale, 'YOUR SETUP', true) +
      '</svg>';
  }
  function wall(s) {
    var solution = M.solve(s), scale = commonScale(s, s), dy = solution.tip * GEOMETRY_SCALE * scale;
    return '<svg class="td-wall" viewBox="0 0 620 136" role="img" aria-label="' +
      esc('Ideal one-sided wall pass: bending away leaves ' + M.format(solution.micrometers) + ' micrometers of extra material at the tip. Gap exaggerated ' + M.format(scale, 1) + ' times.') + '" focusable="false">' +
      '<rect class="td-work" x="24" y="18" width="272" height="' + n(33 + dy) + '"/>' +
      '<rect class="td-extra" x="24" y="51" width="272" height="' + n(dy) + '"/>' +
      path('M24 51H296', 'td-reference') + path('M24 ' + n(51 + dy) + 'H296', 'td-cut-edge') +
      txt(36, 38, 'WORKPIECE', 'td-small') + txt(310, 51, 'Dashed: intended wall', 'td-small') +
      txt(310, 75, 'Solid: shifted cutting edge', 'td-small') +
      txt(310, 99, M.format(solution.micrometers) + ' µm extra material', 'td-value') +
      txt(24, 128, 'One-sided offset at the tip · gap ×' + M.format(scale, 1) + ' · schematic', 'td-small') + '</svg>';
  }
  function staticLesson() {
    var long = Object.assign({}, M.DEFAULT), short = Object.assign({}, long, { length: 40 });
    return '<figure class="td-static-figure">' + pair(short, long) +
      '<figcaption>Halving the clamp-to-load length, from 80 to 40 mm, cuts ideal tip bending from 57.947 to 7.243 µm: one eighth as much. Both drawings use the same geometry scale and ×100 bend magnification. Dashed outlines are the unloaded tools.</figcaption></figure>' +
      '<figure class="td-static-figure">' + wall(short) +
      '<figcaption>In this ideal one-sided wall pass, the cutting edge bends away from the work. The short setup leaves 7.243 µm of extra material at the tip. This is a geometric consequence of the assumed load, not a prediction of a real finished part.</figcaption></figure>';
  }
  return { shape: shape, pair: pair, wall: wall, commonScale: commonScale, staticLesson: staticLesson, GEOMETRY_SCALE: GEOMETRY_SCALE };
});

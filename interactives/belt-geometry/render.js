(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./model.js') : root.CourseWikiBeltGeometry);
  if (node) module.exports = api; else root.CourseWikiBeltDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const f = M.format;
  function diagram(s) {
    const r = M.solve(s), scale = Math.min(260 / (r.C + (s.D + s.d) / 2), 160 / s.D);
    const small = s.d * scale / 2, large = s.D * scale / 2;
    const x = 20 + small, X = x + r.C * scale, y = 105;
    const a = Math.asin((s.D - s.d) / (2 * r.C));
    const sx = x - small * Math.sin(a), sy = small * Math.cos(a);
    const lx = X - large * Math.sin(a), ly = large * Math.cos(a);
    return '<svg viewBox="0 0 300 260" role="img" aria-label="Open belt with external tangent spans; small pulley left, large pulley right. The highlighted arc shows small-pulley contact.">' +
      '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="' + x + '" cy="' + y + '" r="' + small + '"/><circle cx="' + X + '" cy="' + y + '" r="' + large + '"/>' +
      '<path stroke-width="4" d="M' + sx + ' ' + (y-sy) + 'L' + lx + ' ' + (y-ly) + 'A' + large + ' ' + large + ' 0 1 1 ' + lx + ' ' + (y+ly) + 'L' + sx + ' ' + (y+sy) + '"/>' +
      '<path class="bg-wrap" stroke-width="5" d="M' + sx + ' ' + (y+sy) + 'A' + small + ' ' + small + ' 0 0 1 ' + sx + ' ' + (y-sy) + '"/>' +
      '<path stroke-dasharray="3 3" d="M' + x + ' ' + y + 'H' + X + '"/></g>' +
      '<text x="20" y="21">d = ' + f(s.d) + ' ' + s.unit + '</text><text x="20" y="236">D = ' + f(s.D) + ' ' + s.unit + '</text>' +
      '<text x="20" y="257">C = ' + f(r.C) + ' ' + s.unit + '</text></svg>';
  }
  function results(s) {
    const r = M.solve(s);
    const rows = [['Belt pitch length L (approx., ' + s.unit + ')', r.L], ['Center distance C (' + s.unit + ')', r.C],
      ['Speed ratio n_small / n_large', r.ratio], ['Large-pulley speed (r/min)', r.largeSpeed],
      ['Belt speed (m/min)', r.beltSpeed], ['Small-pulley wrap (degrees)', r.wrap], ['Unequal-pulley correction (' + s.unit + ')', r.correction]];
    return '<table><caption>Open belt: D = ' + f(s.D) + ', d = ' + f(s.d) + ' ' + s.unit + '; n_small = ' + f(s.n) + ' r/min</caption><tbody>' + rows.map(row => '<tr><th scope="row">' + row[0] + '</th><td>' + f(row[1]) + '</td></tr>').join('') + '</tbody></table>' +
      '<p class="bg-warning">' + (r.wrap < 150 ? 'Reduced small-pulley contact. ' : '') + 'Less wrap means less grip for a friction belt and fewer teeth engaged for a timing belt. This geometry model does not rate load capacity.</p>';
  }
  function staticLesson() {
    return diagram(M.DEFAULT) + results(M.DEFAULT) + '<p>Worked example: D = 200 mm, d = 100 mm, C = 400 mm and n_small = 1200 r/min. L ≈ 800 + 150π + 6.25 = 1277.49 mm. The inverse returns C ≈ 400 mm. Ratio = 2; n_large = 600 r/min; v = π × 100 × 1200 / 1000 ≈ 376.99 m/min; wrap ≈ 165.64°.</p>';
  }
  return { diagram, results, staticLesson };
});

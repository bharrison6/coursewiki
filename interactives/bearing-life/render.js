(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./model.js') : root.CourseWikiBearingLife);
  if (node) module.exports = api; else root.CourseWikiBearingLifeDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const f = M.format;
  // Axis ticks span many decades across the allowed inputs; compact notation keeps them inside the left margin.
  const ax = v => (v >= 1e5 || v < 0.01) ? v.toExponential(1).replace('e+', 'e') : f(v);
  function results(s) {
    const r = M.solve(s);
    return '<table><caption>Example ' + s.type + ' bearing: C = ' + f(s.C) + ' kN (given), P = ' + f(s.P) + ' kN, n = ' + f(s.speed) + ' r/min</caption><tbody>' +
      [['C/P', r.ratio], ['L10 (million revolutions)', r.life], ['L10h (hours)', r.lifeHours], ['Years at assumed duty', r.years]].map(row => '<tr><th scope="row">' + row[0] + '</th><td>' + f(row[1]) + '</td></tr>').join('') +
      '</tbody></table><p>Duty assumption: ' + f(s.hours) + ' h/day × ' + f(s.days) + ' days/year. Years = hours ÷ annual operating hours.</p>';
  }
  function chart(s) {
    const at = P => M.solve(Object.assign({}, s, { P })).lifeHours;
    const low = s.P / 2, high = s.P * 2, top = at(low), bottom = at(high);
    const x = P => 75 + (P - low) / (high - low) * 205;
    const y = h => 165 - (Math.log(h) - Math.log(bottom)) / (Math.log(top) - Math.log(bottom)) * 135;
    let path = '';
    for (let i = 0; i <= 60; i++) { const P = low + (high - low) * i / 60; path += (i ? 'L' : 'M') + x(P).toFixed(2) + ' ' + y(at(P)).toFixed(2); }
    return '<figure><figcaption>L10h versus P: logarithmic vertical scale. Equal vertical steps represent equal life ratios. C and speed stay fixed.</figcaption><svg viewBox="0 0 300 220" role="img" aria-label="Life falls as load rises. Circles mark current load and double load.">' +
      '<text x="5" y="18">L10h (h), log scale</text>' +
      [low, s.P, high].map(P => '<path d="M75 ' + y(at(P)) + 'H280" stroke="currentColor" opacity=".25"/><text x="70" y="' + (y(at(P)) + 5) + '" text-anchor="end">' + ax(at(P)) + '</text><text x="' + x(P) + '" y="190" text-anchor="middle">' + ax(P) + '</text>').join('') +
      '<path d="M75 25V170H285" fill="none" stroke="currentColor"/><path d="' + path + '" fill="none" stroke="currentColor" stroke-width="3"/>' +
      [s.P, high].map(P => '<circle cx="' + x(P) + '" cy="' + y(at(P)) + '" r="5" fill="currentColor"/>').join('') +
      '<text x="180" y="215" text-anchor="middle">P (kN)</text></svg><p>Marked points: current ' + f(s.P) + ' kN → ' + f(at(s.P)) + ' h; double load ' + f(high) + ' kN → ' + f(bottom) + ' h. ' +
      (s.type === 'ball' ? '<strong>Double the load → 1/8 the life.</strong>' : 'Double the load → 1/2^(10/3) ≈ 0.09921 of the life.') + '</p></figure>';
  }
  function staticLesson() {
    return '<p>Static worked example (also used for printing).</p>' + results(M.DEFAULT) + chart(M.DEFAULT) +
      '<p>C/P = 14/2 = 7; L10 = 7³ = 343 million revolutions. L10h = 343 × 10⁶/(60 × 1500) = 3811 h, or 1.906 years at 2000 h/year. At P = 4 kN, L10 = 42.875 million revolutions and L10h = 476.4 h.</p>';
  }
  return { results, chart, staticLesson };
});

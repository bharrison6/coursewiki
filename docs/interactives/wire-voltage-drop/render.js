(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./model.js') : root.CourseWikiWireDrop);
  if (node) module.exports = api; else root.CourseWikiWireDropDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const f = M.format;
  function diagram(s) {
    const r = M.solve(s);
    return '<svg viewBox="0 0 300 160" role="img" aria-label="Current travels from source to load and returns on a second conductor. Both conductors contribute resistance.">' +
      '<path d="M45 90V35H255V90M255 110V135H45V110" fill="none" stroke="currentColor" stroke-width="3"/>' +
      '<path d="M140 30l10 5-10 5M160 130l-10 5 10 5" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<text x="150" y="23" text-anchor="middle">Out: ' + f(s.length) + ' ' + s.unit + '</text>' +
      '<text x="150" y="157" text-anchor="middle">Return: ' + f(s.length) + ' ' + s.unit + '</text>' +
      '<text x="8" y="106">Source</text><text x="228" y="106">Load</text>' +
      '<text x="150" y="75" text-anchor="middle">Loop = ' + f(r.loopM) + ' m</text>' +
      '<text x="150" y="100" text-anchor="middle">AWG ' + s.awg + ' · ' + f(s.current) + ' A</text></svg>';
  }
  function results(s) {
    const r = M.solve(s);
    const rows = [['Single wire: Ω / 1000 ft', r.ohmsPer1000Ft], ['Single wire: Ω / km', r.ohmsPerKm],
      ['Loop resistance (Ω)', r.loopResistance], ['Voltage drop (V)', r.drop], ['Source voltage lost (%)', r.percent],
      ['Load voltage (V)', r.loadVoltage], ['Wire heating loss (W)', r.loss]];
    return '<table><caption>AWG ' + s.awg + ', ' + f(s.length) + ' ' + s.unit + ' one way, ' + f(s.current) + ' A, ' + f(s.voltage) + ' V source</caption><tbody>' +
      rows.map(row => '<tr><th scope="row">' + row[0] + '</th><td>' + f(row[1]) + '</td></tr>').join('') + '</tbody></table>' +
      (!r.feasible ? '<p class="wvd-warning">The requested current leaves no positive load voltage. This is not a possible operating point for a passive resistive load on this source; reduce current or wire resistance. Negative load voltage is an algebraic result, not a predicted passive-load voltage.</p>' : '');
  }
  function comparison(s, baseline) {
    const a = M.solve(s), b = M.solve(baseline);
    return [['Voltage drop', a.drop, b.drop, 'V'], ['Wire heating loss', a.loss, b.loss, 'W']].map(row => {
      const max = Math.max(row[1], row[2], 1e-12);
      return '<figure><figcaption>' + row[0] + ': baseline ' + f(row[2]) + ' ' + row[3] + '; now ' + f(row[1]) + ' ' + row[3] + '</figcaption>' +
        '<svg viewBox="0 0 300 50" role="img" aria-label="' + row[0] + ', baseline ' + f(row[2]) + ', now ' + f(row[1]) + ' ' + row[3] + '">' +
        '<rect x="0" y="3" width="' + (290 * row[2] / max) + '" height="16" fill="none" stroke="currentColor"/>' +
        '<rect x="0" y="28" width="' + (290 * row[1] / max) + '" height="16" fill="currentColor"/></svg></figure>';
    }).join('') + '<p>Outline = baseline; filled = now. Each pair shares its own scale; compare within a pair. Loss is heating power, not wire temperature.</p>';
  }
  function staticLesson() {
    const s = M.DEFAULT, r = M.solve(s);
    return diagram(s) + results(s) + '<p>Worked example: 50 ft out + 50 ft back = 30.48 m of copper. R = ρL/A = ' + f(r.loopResistance) + ' Ω. At 5 A, IR = ' + f(r.drop) + ' V and I²R = ' + f(r.loss) + ' W.</p>' +
      comparison(Object.assign({}, s, { current: 10 }), s) + '<p>Doubling only current doubles the drop and quadruples heating loss. Doubling only length doubles both; a smaller AWG number lowers both at the same current.</p>';
  }
  return { diagram, results, comparison, staticLesson };
});

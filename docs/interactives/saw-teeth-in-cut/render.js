(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiSawTeeth);
  if (node) module.exports = api; else root.CourseWikiSawTeethDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  function n(v) { return v.toFixed(2); }
  function svg(label, height, body) { return '<svg class="st-svg" viewBox="0 0 360 ' + height + '" role="img" aria-label="' + label + '" focusable="false">' + body + '</svg>'; }
  function line(x1, y1, x2, y2, cls) { return '<path class="' + cls + '" d="M' + n(x1) + ' ' + n(y1) + 'L' + n(x2) + ' ' + n(y2) + '"/>'; }
  function text(x, y, value, anchor) { return '<text x="' + x + '" y="' + y + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + value + '</text>'; }
  function plot(s, d, many) {
    var r = M.solve(s), ceiling = Math.max(4, r.max * 1.15), points = M.samples(s);
    function x(v) { return 44 + v / r.depth * 300; }
    function y(v) { return 156 - v / ceiling * 112; }
    var body = '<rect class="st-low" x="44" y="' + n(y(3)) + '" width="300" height="' + n(156 - y(3)) + '"/>';
    body += line(44, 156, 344, 156, 'st-axis') + line(44, 44, 44, 156, 'st-axis');
    body += line(44, y(3), 344, y(3), 'st-guide');
    body += '<path class="st-curve' + (many ? ' st-many' : '') + '" d="' + points.map(function (p, i) { return (i ? 'L' : 'M') + n(x(p.depth)) + ' ' + n(y(p.teeth)); }).join('') + '"/>';
    if (d !== undefined) body += line(x(d), 44, x(d), 156, 'st-cursor') + '<circle class="st-dot" cx="' + n(x(d)) + '" cy="' + n(y(M.at(s, d).teeth)) + '" r="4"/>';
    body += text(8, 24, 'Teeth · top of scale ' + n(ceiling)) + text(8, 161, '0') + text(44, 181, '0') + text(344, 181, n(r.depth), 'end') + text(180, 205, 'Cut depth (mm)', 'middle');
    return svg('Engaged teeth versus cut depth. Dashed line: about three teeth. Shading: below three. Scale adjusts to the section.', 216, body);
  }
  function section(s, d) {
    var h = M.depth(s), width = s.type === 'flat' ? s.thickness : s.diameter;
    var scale = Math.min(260 / width, 150 / h), y = 35 + d * scale, r = M.at(s, d), body = '';
    if (s.type === 'flat') body += '<rect class="st-stock" x="' + n(180 - width * scale / 2) + '" y="35" width="' + n(width * scale) + '" height="' + n(h * scale) + '"/>';
    else {
      body += '<circle class="st-stock" cx="180" cy="' + n(35 + h * scale / 2) + '" r="' + n(width * scale / 2) + '"/>';
      if (s.type === 'tube') body += '<circle class="st-hole" cx="180" cy="' + n(35 + h * scale / 2) + '" r="' + n((width / 2 - s.wall) * scale) + '"/>';
    }
    body += line(12, y - 7, 348, y - 7, 'st-blade');
    r.intervals.forEach(function (v) { body += line(180 + v[0] * scale, y, 180 + v[1] * scale, y, 'st-contact'); });
    var pitch = M.pitchMM(s) * scale, stride = Math.max(1, Math.ceil(336 / pitch / 180));
    // Extremely fine user inputs are decimated visually; the real-valued calculation is unchanged.
    for (var j = Math.ceil(-168 / pitch / stride); j <= Math.floor(168 / pitch / stride); j++) {
      var xx = j * pitch * stride, engaged = r.intervals.some(function (v) { return xx / scale >= v[0] && xx / scale <= v[1]; });
      body += '<path class="st-tooth' + (engaged ? ' st-engaged' : '') + '" d="M' + n(180 + xx - Math.min(3, pitch / 3)) + ' ' + n(y - 7) + 'l' + n(Math.min(3, pitch / 3)) + ' 7l' + n(Math.min(3, pitch / 3)) + ' -7"/>';
    }
    body += text(12, 22, 'Blade side view · feed ↓') + text(12, 211, stride > 1 ? 'Fine teeth simplified in drawing' : 'Highlighted tips touch material');
    return svg('Blade tooth line crosses the section at depth ' + n(d) + ' mm. Highlighted segments are solid contact; gaps do not count.', 224, body);
  }
  function readout(s, d) {
    var a = M.at(s, d), r = M.solve(s);
    return '<p class="st-results">At depth ' + n(d) + ' mm: <strong>' + n(a.teeth) + ' teeth</strong> across ' + n(a.length) + ' mm of material.<br>Across the cut: minimum <strong>' + n(r.min) + '</strong>; maximum <strong>' + n(r.max) + '</strong> teeth.</p><p>' + (a.belowThree ? 'Below the common rule of thumb of about three teeth.' : 'At or above about three teeth here; this is not a blade approval.') + '</p>';
  }
  function staticLesson() {
    return '<p>Dashed line = about three teeth; shading = below three. Each plot uses its own vertical scale.</p><div class="st-cases">' + ['tube', 'fine'].map(function (key) {
      var s = M.PRESETS[key];
      return '<figure class="st-case"><h3>' + (key === 'tube' ? 'Thin-wall tube, coarse blade' : 'Thick solid bar, fine blade') + '</h3>' + plot(s, undefined, key === 'fine') + '<figcaption><p>' + (key === 'tube' ? '50.80 mm outside diameter; 1.00 mm wall; 6 TPI.' : '50.80 mm contact thickness; 25.40 mm feed height; 24 TPI.') + '</p>' + readout(s, M.depth(s) / 2) + '<p>' + (key === 'tube' ? 'Contact tends to zero at entry and exit. At mid-depth only the two walls count. The peaks occur where the blade touches the inside circle.' : 'Gullets may fill with chips; check the blade maker\'s guidance.') + '</p></figcaption></figure>';
    }).join('') + '</div>';
  }
  return { plot: plot, section: section, readout: readout, staticLesson: staticLesson };
});

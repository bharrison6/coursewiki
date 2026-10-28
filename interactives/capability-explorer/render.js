(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiCapability);
  if (node) module.exports = api; else root.CourseWikiCapabilityDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  function n(v) { return v.toFixed(2); }
  function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function curve(s) {
    M.validate(s);
    // Fixed size and density scales across every teaching preset and slider setting.
    var lo = 19.76, hi = 20.24, base = 150;
    function x(v) { return 12 + (v - lo) / (hi - lo) * 336; }
    function y(v) { return base - 120 * .004 / s.sigma * Math.exp(-.5 * Math.pow((v - s.mean) / s.sigma, 2)); }
    function line(a, b) {
      var points = [];
      for (var i = 0; i <= 240; i++) { var v = a + (b - a) * i / 240; points.push((i ? 'L' : 'M') + n(x(v)) + ' ' + n(y(v))); }
      return points.join('');
    }
    function tail(a, b) { return '<path class="ce-tail" d="' + line(a, b) + 'L' + n(x(b)) + ' ' + base + 'H' + n(x(a)) + 'Z"/>'; }
    return '<svg class="ce-curve" viewBox="0 0 360 210" role="img" aria-label="Normal distribution; shaded tails are outside the size limits. Mean ' + M.format(s.mean, 3) + ' mm; standard deviation ' + M.format(s.sigma, 3) + ' mm." focusable="false">' +
      '<rect class="ce-band" x="' + n(x(s.lsl)) + '" y="25" width="' + n(x(s.usl) - x(s.lsl)) + '" height="125"/>' + tail(lo, s.lsl) + tail(s.usl, hi) +
      '<path class="ce-line" d="' + line(lo, hi) + '"/>' +
      '<path class="ce-limit" d="M' + n(x(s.lsl)) + ' 25V150M' + n(x(s.usl)) + ' 25V150"/>' +
      '<path class="ce-mean" d="M' + n(x(s.mean)) + ' 25V150"/>' +
      '<text x="' + n(x(s.lsl) - 4) + '" y="20" text-anchor="end">LSL</text><text x="' + n(x(s.usl) + 4) + '" y="20">USL</text>' +
      '<text x="' + n(x(s.lsl) - 4) + '" y="173" text-anchor="end">' + M.format(s.lsl) + '</text><text x="' + n(x(s.usl) + 4) + '" y="173">' + M.format(s.usl) + '</text>' +
      '<text x="180" y="202" text-anchor="middle">Size (mm) · dashed line = mean</text></svg>';
  }
  function readout(s) {
    var r = M.solve(s);
    return '<div class="ce-results"><div>Cp <strong>' + M.format(r.cp) + '</strong></div><div>Cpk <strong>' + M.format(r.cpk) + '</strong></div><div>Outside <strong>' + esc(M.ppm(r.ppm)) + ' ppm</strong></div></div>' +
      '<p>Below LSL: ' + M.format(r.below * 100, 3) + '% · Above USL: ' + M.format(r.above * 100, 3) + '% · Total: ' + M.format(r.total * 100, 3) + '%</p>';
  }
  function staticLesson() {
    return '<div class="ce-cases">' + ['precise', 'wide'].map(function (key) {
      var s = M.PRESETS[key];
      return '<figure class="ce-case"><h3>' + (key === 'precise' ? 'Precise but off-centre' : 'Centred but wide') + '</h3>' + curve(s) +
        '<figcaption>Mean ' + M.format(s.mean, 3) + ' mm; σ ' + M.format(s.sigma, 3) + ' mm.' + readout(s) +
        '<p>' + (key === 'precise' ? 'The narrow spread gives a high Cp, but the mean is only one σ below the upper limit. Cpk reveals that small margin.' : 'Centring makes Cp and Cpk equal. The wide spread still puts parts beyond both limits.') + '</p></figcaption></figure>';
    }).join('') + '</div>';
  }
  return { curve: curve, readout: readout, staticLesson: staticLesson };
});

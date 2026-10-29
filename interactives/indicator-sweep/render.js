(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiIndicatorSweep);
  if (node) module.exports = api; else root.CourseWikiIndicatorSweepDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  function n(v) { return Number(v).toFixed(2); }
  function signed(v) { var f = M.format(v); return v > 0.0005 ? '+' + f : v < -0.0005 ? '−' + M.format(Math.abs(v)) : f; }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function frame(s) {
    var r = M.result(s), center = (r.min + r.max) / 2;
    // The gain depends on sweep range, never on the stored zero. Re-zeroing
    // shifts the numeric frame but leaves the drawn profile span unchanged.
    var halfScale = Math.max(0.05, r.range * 0.675);
    return Object.freeze({ center: center, halfScale: halfScale, min: center - halfScale,
      max: center + halfScale, top: 240, bottom: 300 });
  }
  function draw(s) {
    M.validate(s);
    // x1 leaves a real gutter for quantitative tick labels. Tick strokes,
    // endpoint dots and their labels therefore occupy disjoint regions.
    var pts = M.samples(s, 61), r = M.result(s), f = frame(s), x0 = 66, x1 = 530, w = x1 - x0;
    var physicalExtent = Math.max.apply(null, pts.map(function (p) { return Math.abs(p.surface); }).concat([0.08]));
    // Preserve the useful exaggeration for hundredths while keeping every admitted
    // ±1 mm adjustment inside the physical panel.
    var physicalScale = Math.min(520, 44 / physicalExtent);
    function x(v) { return x0 + v / s.length * w; }
    // The indicator body is below the jaw in this top view; positive physical
    // displacement is therefore drawn downward, toward the body.
    function jawY(v) { return 82 + v * physicalScale; }
    function plotY(v) { return f.bottom - (v - f.min) / (f.max - f.min) * (f.bottom - f.top); }
    var jaw = pts.map(function (p, i) { return (i ? 'L' : 'M') + n(x(p.x)) + ' ' + n(jawY(p.surface)); }).join('');
    var plot = pts.map(function (p, i) { return (i ? 'L' : 'M') + n(x(p.x)) + ' ' + n(plotY(p.reading)); }).join('');
    var contactX = x(s.position), contactY = jawY(M.surface(s, s.position));
    var contactAnchor = s.position < s.length * .2 ? 'start' : s.position > s.length * .8 ? 'end' : 'middle';
    var zeroX = x(s.zeroX), zeroY = plotY(0), zeroVisible = zeroY >= f.top && zeroY <= f.bottom;
    var toward = s.response === 1 ? 'increases' : 'decreases';
    var zeroAnchor = s.zeroX < s.length * .2 ? 'start' : s.zeroX > s.length * .8 ? 'end' : 'middle';
    return '<svg class="is-svg" viewBox="0 0 640 400" role="img" aria-label="' + esc('Top-view jaw and quantitative comparison plot. Contact at ' + M.format(s.position) + ' mm reads ' + M.format(M.reading(s, s.position)) + ' mm. Moving the jaw toward the body ' + toward + ' the reading.') + '" focusable="false">' +
      '<text class="is-title" x="18" y="25">Physical contact — displacement exaggerated</text>' +
      '<path class="is-reference" d="M' + x0 + ' 82H' + x1 + '"/><path class="is-jaw" d="' + jaw + '"/>' +
      '<path class="is-body" d="M' + n(contactX - 30) + ' 140h60v28h-60z"/><path class="is-stem" d="M' + n(contactX) + ' 140V' + n(contactY + 5) + '"/>' +
      '<circle class="is-contact" cx="' + n(contactX) + '" cy="' + n(contactY) + '" r="5"/>' +
      '<path class="is-toward" d="M120 105V150M114 141L120 150L126 141"/><text x="132" y="136">toward body</text>' +
      '<text x="' + n(contactX) + '" y="184" text-anchor="' + contactAnchor + '">contact ' + M.format(s.position) + ' mm</text>' +
      '<text class="is-title" x="18" y="203">Comparison reading (mm)</text><text class="is-note is-gain-note" x="18" y="225">Same gain after re-zero; changing jaw geometry may rescale</text>' +
      (!zeroVisible ? '<text class="is-note is-zero-frame-note" x="18" y="388">zero ' + (zeroY < f.top ? 'above' : 'below') + ' frame — current readings remain in view</text>' : '') +
      (zeroVisible ? '<path class="is-axis" d="M' + x0 + ' ' + n(zeroY) + 'H' + x1 + '"/>' : '') +
      '<path class="is-tick" d="M' + x1 + ' ' + f.top + 'h10M' + x1 + ' ' + f.bottom + 'h10"/>' +
      '<text class="is-tick-label" x="622" y="' + (f.top + 7) + '" text-anchor="end">' + signed(f.max) + '</text><text class="is-tick-label" x="622" y="' + (f.bottom + 7) + '" text-anchor="end">' + signed(f.min) + '</text>' +
      '<path class="is-reading" d="' + plot + '"/><path class="is-zero" d="M' + n(zeroX) + ' 235V310"/>' +
      '<circle class="is-dot" cx="' + n(contactX) + '" cy="' + n(plotY(M.reading(s, s.position))) + '" r="5"/>' +
      '<text x="' + x0 + '" y="328">0</text><text x="' + x1 + '" y="328" text-anchor="end">' + M.format(s.length) + ' mm</text>' +
      '<text x="' + n(zeroX) + '" y="355" text-anchor="' + zeroAnchor + '">stored zero at ' + M.format(s.zeroX) + ' mm</text>' +
      '</svg>';
  }
  function readout(s) {
    var r = M.result(s);
    return '<div class="is-readout"><span class="is-contact-readout">Contact at ' + M.format(s.position) + ' mm <strong>' + signed(M.reading(s, s.position)) + ' mm</strong></span><span>Left reference <strong>' + signed(r.left) + ' mm</strong></span><span>Center reference <strong>' + signed(r.center) + ' mm</strong></span><span>Right reference <strong>' + signed(r.right) + ' mm</strong></span><span>Right − left <strong>' + signed(r.endpointDifference) + ' mm</strong></span><span>Full sweep range <strong>' + M.format(r.range) + ' mm</strong></span></div>';
  }
  function staticLesson() {
    var slope = Object.assign({}, M.PRESETS.slope), rezeroed = M.withZero(slope, 50), bump = Object.assign({}, M.PRESETS.bump);
    return '<div class="is-static-grid"><figure><h3>Same tilted jaw, two zeros</h3>' + draw(slope) + '<figcaption><h4>Zero stored at the left</h4>' + readout(slope) + '<h4>Same jaw, zero stored at 50 mm</h4>' + readout(rezeroed) + '<p>Zeroing at 50 mm changes the displayed left, center and right values, but not right minus left.</p></figcaption></figure>' +
      '<figure><h3>Equal endpoints can hide a local high spot</h3>' + draw(bump) + '<figcaption>' + readout(bump) + '<p>The endpoints both read 0.000 mm, while the center reads +0.080 mm. Traverse the whole jaw instead of checking only its ends.</p></figcaption></figure></div>' +
      '<p><strong>Model:</strong> displayed reading at position x = response × physical displacement at x − the raw reading stored as zero. Positive physical displacement means closer to the indicator body. The response is stated before interpreting the sign.</p><p>Plot ticks are millimetres. Vertical gain comes from the full sweep range, so changing only the stored zero shifts the tick values without stretching the curve. Changing the jaw geometry can rescale the scene; the numeric readout remains the authority.</p>' +
      '<p><strong>Worked example:</strong> over 100 mm, a smooth +0.060 mm physical rise gives +0.060 mm right minus left when moving toward the body increases the reading. Moving the adjustable right end −0.060 mm removes that ideal linear trend. A real setup is accepted against the job requirement, not a universal tolerance from this model.</p>' +
      '<p class="is-source">Alignment procedure: <a href="https://ocw.mit.edu/courses/2-670-mechanical-engineering-tools-january-iap-2004/69ddc43986801c51a7fbfa97d6b5b63f_mill.pdf">MIT, Introduction to the Mill</a>, pp. 2–3. The comparison geometry and examples here are original.</p>';
  }
  return Object.freeze({ frame: frame, draw: draw, readout: readout, staticLesson: staticLesson });
});


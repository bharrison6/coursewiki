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
  function draw(s) {
    M.validate(s);
    var pts = M.samples(s, 61), x0 = 66, x1 = 574, w = x1 - x0;
    var facePts = Array.from({ length: 63 }, function (_, i) {
      var xx = -s.margin + (s.length + 2 * s.margin) * i / 62;
      return { x: xx, surface: M.surface(s, xx) };
    });
    var physicalExtent = Math.max.apply(null, facePts.map(function (p) { return Math.abs(p.surface); }).concat([0.08]));
    // Preserve the useful exaggeration for hundredths while keeping every admitted
    // ±1 mm adjustment inside the physical panel.
    var physicalScale = Math.min(520, 44 / physicalExtent);
    function x(v) { return x0 + v / s.length * w; }
    // The indicator body is below the jaw in this top view; positive physical
    // displacement is therefore drawn downward, toward the body.
    function jawY(v) { return 82 + v * physicalScale; }
    var jaw = facePts.map(function (p, i) { return (i ? 'L' : 'M') + n(x(p.x)) + ' ' + n(jawY(p.surface)); }).join('');
    var linear = facePts.map(function (p) { return { x: p.x, y: jawY(s.a + s.m * p.x) }; });
    var vise = linear.map(function (p, i) { return (i ? 'L' : 'M') + n(x(p.x)) + ' ' + n(p.y); }).join('') +
      linear.slice().reverse().map(function (p) { return 'L' + n(x(p.x)) + ' ' + n(p.y - 34); }).join('') + 'Z';
    var contactX = x(s.position), contactY = jawY(M.surface(s, s.position));
    var contactAnchor = s.position < s.length * .2 ? 'start' : s.position > s.length * .8 ? 'end' : 'middle';
    // P=(p,0) is a world reference, so its marker stays on y=0 even as the
    // vise pose moves. The dashed leader shows its relation to the vise.
    var pivotX = x(s.pivot), pivotY = jawY(s.pivotY);
    var pivotLineEnd = pivotY < 65 ? pivotY + 6 : pivotY - 6;
    var pivotAtRight = s.pivot > s.length * .8, pivotAnchor = pivotAtRight ? 'end' : 'start';
    var pivotLabelX = pivotX + (pivotAtRight ? -10 : 10);
    var toward = s.response === 1 ? 'increases' : 'decreases';
    var current = signed(M.reading(s, s.position));
    return '<svg class="is-svg" viewBox="0 0 640 230" role="img" aria-label="' + esc('Exaggerated top-view vise, chosen next pivot and functional digital indicator. Contact at ' + M.format(s.position) + ' mm reads ' + current + ' mm. Moving the jaw toward the body ' + toward + ' the reading.') + '" focusable="false">' +
      '<text class="is-title" x="18" y="25">Physical contact — deviation exaggerated, not to scale</text>' +
      '<path class="is-reference" d="M' + x0 + ' 82H' + x1 + 'M' + x0 + ' 76V88M' + x1 + ' 76V88"/><path class="is-vise" d="' + vise + '"/><path class="is-jaw" d="' + jaw + '"/>' +
      '<path class="is-pivot-line" d="M' + n(pivotX) + ' 65V' + n(pivotLineEnd) + '"/><circle class="is-pivot" cx="' + n(pivotX) + '" cy="' + n(pivotY) + '" r="6"/><text class="is-pivot-label" x="' + n(pivotLabelX) + '" y="74" text-anchor="' + pivotAnchor + '">P' + M.format(s.pivot) + '</text>' +
      '<rect class="is-body" x="' + n(contactX - 45) + '" y="133" width="90" height="48" rx="5"/><rect class="is-display" x="' + n(contactX - 38) + '" y="140" width="76" height="24" rx="2"/><text class="is-digital-value" x="' + n(contactX) + '" y="159" text-anchor="middle">' + current + '</text><text class="is-digital-unit" x="' + n(contactX) + '" y="178" text-anchor="middle">mm</text><path class="is-stem" d="M' + n(contactX) + ' 133V' + n(contactY + 5) + '"/>' +
      '<circle class="is-contact" cx="' + n(contactX) + '" cy="' + n(contactY) + '" r="5"/>' +
      '<path class="is-toward" d="M120 105V150M114 141L120 150L126 141"/><text x="132" y="136">toward body</text>' +
      '<text x="' + n(contactX) + '" y="198" text-anchor="' + contactAnchor + '">contact ' + M.format(s.position) + ' mm</text>' +
      '<text class="is-note" x="18" y="220">Illustrative pose and pivot — the digital value uses the exact model</text>' +
      '</svg>';
  }
  function readout(s) {
    var r = M.result(s);
    return '<div class="is-readout"><span>Measuring span <strong>0–100 mm; 1 mm face margins</strong></span><span>Stored zero <strong>at ' + M.format(s.zeroX) + ' mm</strong></span><span>Next pivot <strong>P=(' + M.format(s.pivot) + ', 0) mm</strong></span><span>Accumulated |d| <strong>' + M.formatFine(s.travel) + ' / 0.0040 mm/mm</strong></span><span>Left reference <strong>' + signed(r.left) + ' mm</strong></span><span>Center reference <strong>' + signed(r.center) + ' mm</strong></span><span>Right reference <strong>' + signed(r.right) + ' mm</strong></span><span>Right − left <strong>' + signed(r.endpointDifference) + ' mm</strong></span><span>Model summary — full sweep range <strong>' + M.format(r.range) + ' mm</strong></span></div>';
  }
  function staticLesson() {
    var slope = Object.assign({}, M.PRESETS.slope), rotated = M.rotate(slope, -0.0006, 25);
    var rezeroed = M.withZero(rotated, 50), bump = Object.assign({}, M.PRESETS.bump);
    return '<div class="is-static-grid"><figure><h3>Rotate about a chosen illustrative pivot</h3>' + draw(slope) + '<figcaption><h4>Before: +0.060 mm tilt, old zero at the left</h4>' + readout(slope) + '<h4>After −0.0006 about 25 mm: both ends +0.015 mm</h4>' + draw(rotated) + readout(rotated) + '<h4>Optional convenience: re-zero at 50 mm</h4>' + readout(rezeroed) + '<p>The rotation removes the linear tilt while the chosen pivot determines the common offset. Re-zeroing changes the displayed references, not the alignment.</p></figcaption></figure>' +
      '<figure><h3>Equal endpoints can hide a local high spot</h3>' + draw(bump) + '<figcaption>' + readout(bump) + '<p>The endpoints both read 0.000 mm, while the center reads +0.080 mm. Traverse the whole jaw instead of checking only its ends.</p></figcaption></figure></div>' +
      '<p><strong>Model:</strong> physical jaw position is a + m·x + b·4(x/L)(1 − x/L). Displayed reading = response × physical position − the raw reading stored as zero. A small illustrative rotation d about world pivot P=(p, 0) updates m to m + d and a to a − p·d; the stored zero is unchanged. The fixed 100 mm measuring span is inset 1 mm from each end of the finite modeled face. This is a first-order small-angle model with |d| ≤ 0.001 mm/mm, 0.0001 mm/mm control steps, and total rotation travel ≤ 0.004. The step is model resolution, not real-vise quantization. It does not model adjustment force. The drawing exaggerates deviation and is not a literal scale.</p>' +
      '<p><strong>Worked example:</strong> over 100 mm, start with left 0.000 and right +0.060 mm. Apply d = −0.0006 about 25 mm: both ends become +0.015 mm, so the tilt is gone but the old zero reveals a common offset. About 50 mm both become +0.030 mm; about 0 mm both become 0.000 mm. Re-zeroing is optional convenience, not an alignment requirement. A real setup is accepted against the job requirement, not a universal tolerance from this model.</p>' +
      '<p class="is-source">Alignment procedure: <a href="https://ocw.mit.edu/courses/2-670-mechanical-engineering-tools-january-iap-2004/69ddc43986801c51a7fbfa97d6b5b63f_mill.pdf">MIT, Introduction to the Mill</a>, pp. 2–3. The comparison geometry and examples here are original.</p>';
  }
  return Object.freeze({ draw: draw, readout: readout, staticLesson: staticLesson });
});


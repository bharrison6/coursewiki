(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiBacklash, node ? require('./model-asset.js') : root.CourseWikiBacklashModel);
  if (node) module.exports = api; else root.CourseWikiBacklashDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, asset) {
  'use strict';
  if (!M || !asset) throw new Error('Backlash model unavailable');
  // Pure SVG/HTML renderers shared by the live lab and the static (no-JS, print, search) lesson.
  // Markup is ID-free so any number of mounts can coexist in one aggregate.
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function mm(v, digits) { var d = digits == null ? 2 : digits, t = (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d); return t.replace('-', '\u2212'); }
  function signed(v, digits) { var t = mm(v, digits); return v > 0.5 * Math.pow(10, -(digits == null ? 2 : digits)) ? '+' + t : t; }
  function num(v) { return Number(v.toFixed(3)); }
  function polar(cx, cy, rad, deg) { var a = (deg - 90) * Math.PI / 180; return [num(cx + rad * Math.cos(a)), num(cy + rad * Math.sin(a))]; }

  // Handwheel dial collar seen from the handwheel end. Graduation k sits 3.6k degrees clockwise from the
  // top of the collar; turning forward rotates the collar counter-clockwise, bringing higher numbers under
  // the fixed index. Optional band = {from, divisions}: the graduations that passed during a dead band.
  function handwheel(state, band) {
    var snap = M.snapshot(state), rot = num(-3.6 * state.turn), turns = Math.floor(state.turn / 100 + 1e-9), div = num(state.turn - 100 * turns);
    var label = 'Handwheel dial reading ' + mm(snap.reading) + ' mm: ' + turns + ' turns and ' + mm(div, div % 1 ? 1 : 0) + ' divisions of ' + mm(state.lead / 100, 2) + ' mm.';
    var o = '<svg class="bl-wheel" viewBox="0 0 240 250" role="img" aria-label="' + esc(label) + '"><title>' + esc(label) + '</title>';
    o += '<circle class="bl-wheel-rim" cx="120" cy="128" r="110"/>';
    o += '<g transform="rotate(' + rot + ' 120 128)">';
    o += '<circle class="bl-wheel-face" cx="120" cy="128" r="96"/>';
    if (band && band.divisions > 0) {
      var a0 = 3.6 * (band.from - band.divisions), a1 = 3.6 * band.from, p0 = polar(120, 128, 94, a0), p1 = polar(120, 128, 94, a1), q1 = polar(120, 128, 60, a1), q0 = polar(120, 128, 60, a0), large = a1 - a0 > 180 ? 1 : 0;
      o += '<path class="bl-wheel-band" d="M' + p0 + 'A94 94 0 ' + large + ' 1 ' + p1 + 'L' + q1 + 'A60 60 0 ' + large + ' 0 ' + q0 + 'Z"/>';
    }
    for (var k = 0; k < 100; k++) {
      var len = k % 10 === 0 ? 14 : k % 5 === 0 ? 10 : 6, a = polar(120, 128, 96, 3.6 * k), b = polar(120, 128, 96 - len, 3.6 * k);
      o += '<path class="bl-tick' + (k % 10 === 0 ? ' is-major' : '') + '" d="M' + a + 'L' + b + '"/>';
      if (k % 10 === 0) { var t = polar(120, 128, 72, 3.6 * k); o += '<text class="bl-wheel-num" x="' + t[0] + '" y="' + num(t[1] + 5) + '" text-anchor="middle" transform="rotate(' + num(3.6 * k) + ' ' + t[0] + ' ' + num(t[1]) + ')">' + k + '</text>'; }
    }
    var h = polar(120, 128, 103, 180);
    o += '<circle class="bl-wheel-hub" cx="120" cy="128" r="22"/></g><g transform="rotate(' + rot + ' 120 128)"><circle class="bl-wheel-knob" cx="' + h[0] + '" cy="' + h[1] + '" r="7"/></g>';
    o += '<path class="bl-index" d="M112 4H128L120 20Z"/>';
    o += '<text class="bl-wheel-read" x="120" y="133" text-anchor="middle">' + mm(snap.reading) + '</text><text class="bl-wheel-unit" x="120" y="150" text-anchor="middle">mm</text>';
    return o + '</svg>';
  }
  // Plunger dial indicator against the carriage: 0.01 mm graduations, one pointer turn per millimetre,
  // a small counter for whole millimetres, and the digits written out.
  function indicator(state) {
    var c = state.carriage, frac = ((c % 1) + 1) % 1, whole = Math.floor(c + 1e-9);
    var label = 'Indicator on the carriage reads ' + mm(c) + ' mm.';
    var o = '<svg class="bl-gauge" viewBox="0 0 240 250" role="img" aria-label="' + esc(label) + '"><title>' + esc(label) + '</title>';
    o += '<rect class="bl-gauge-stem" x="112" y="232" width="16" height="16"/><circle class="bl-gauge-rim" cx="120" cy="124" r="108"/><circle class="bl-gauge-face" cx="120" cy="124" r="96"/>';
    for (var k = 0; k < 100; k++) {
      var len = k % 10 === 0 ? 13 : k % 5 === 0 ? 9 : 5, a = polar(120, 124, 96, 3.6 * k), b = polar(120, 124, 96 - len, 3.6 * k);
      o += '<path class="bl-tick' + (k % 10 === 0 ? ' is-major' : '') + '" d="M' + a + 'L' + b + '"/>';
      if (k % 10 === 0) { var t = polar(120, 124, 73, 3.6 * k); o += '<text class="bl-gauge-num" x="' + t[0] + '" y="' + num(t[1] + 5) + '" text-anchor="middle">' + k + '</text>'; }
    }
    o += '<circle class="bl-gauge-sub" cx="120" cy="86" r="17"/>';
    for (var j = 0; j < 10; j++) { var s0 = polar(120, 86, 17, 36 * j), s1 = polar(120, 86, 13, 36 * j); o += '<path class="bl-tick" d="M' + s0 + 'L' + s1 + '"/>'; }
    var sub = polar(120, 86, 13, 36 * (((whole % 10) + 10) % 10 + frac)), tip = polar(120, 124, 88, 360 * frac), tail = polar(120, 124, 18, 360 * frac + 180);
    o += '<path class="bl-gauge-subhand" d="M120 86L' + sub + '"/><path class="bl-gauge-hand" d="M' + tail + 'L' + tip + '"/><circle class="bl-gauge-pin" cx="120" cy="124" r="6"/>';
    o += '<text class="bl-gauge-read" x="120" y="160" text-anchor="middle">' + mm(c) + '</text><text class="bl-wheel-unit" x="120" y="174" text-anchor="middle">mm</text>';
    return o + '</svg>';
  }
  // Carriage position (indicator) against dial reading (screw rotation). Forward approaches lie on c = d,
  // reverse approaches on c = d + B; every point lies in the band between them, B wide along the dial axis.
  function loop(points, state, win) {
    var B = state.clearance, W = 560, H = 380, L = 78, R = 18, T = 18, Bt = 64;
    var x0 = win.x0, x1 = win.x1, y0 = win.y0, y1 = win.y1;
    function X(v) { return num(L + (v - x0) / (x1 - x0) * (W - L - R)); }
    function Y(v) { return num(H - Bt - (v - y0) / (y1 - y0) * (H - Bt - T)); }
    var cur = M.snapshot(state), steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5], step = steps.find(function (s) { return (x1 - x0) / s <= 7; }) || 10;
    var label = 'Hysteresis loop: carriage position against dial reading. The band between the forward-approach line and the reverse-approach line is ' + mm(B) + ' mm wide along the dial axis. Current dial ' + mm(cur.reading) + ' mm, carriage ' + mm(cur.carriage) + ' mm.';
    var o = '<svg class="bl-loop" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '" data-width-mm="' + B + '"><title>' + esc(label) + '</title>';
    o += '<rect class="bl-plot" x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - Bt - T) + '"/>';
    for (var gx = Math.ceil(x0 / step) * step; gx <= x1 + 1e-9; gx += step) o += '<path class="bl-grid" d="M' + X(gx) + ' ' + T + 'V' + (H - Bt) + '"/><text class="bl-axis-num" x="' + X(gx) + '" y="' + (H - Bt + 18) + '" text-anchor="middle">' + mm(gx, step < 0.1 ? 2 : step < 1 ? 1 : 0) + '</text>';
    for (var gy = Math.ceil(y0 / step) * step; gy <= y1 + 1e-9; gy += step) o += '<path class="bl-grid" d="M' + L + ' ' + Y(gy) + 'H' + (W - R) + '"/><text class="bl-axis-num" x="' + (L - 8) + '" y="' + (Y(gy) + 5) + '" text-anchor="end">' + mm(gy, step < 0.1 ? 2 : step < 1 ? 1 : 0) + '</text>';
    o += '<svg x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - Bt - T) + '" viewBox="' + L + ' ' + T + ' ' + (W - L - R) + ' ' + (H - Bt - T) + '" overflow="hidden">';
    var lo = x0 - (x1 - x0), hi = x1 + (x1 - x0);
    o += '<path class="bl-band" d="M' + X(lo) + ' ' + Y(lo) + 'L' + X(hi) + ' ' + Y(hi) + 'L' + X(hi) + ' ' + Y(hi + B) + 'L' + X(lo) + ' ' + Y(lo + B) + 'Z"/>';
    o += '<path class="bl-line-fwd" d="M' + X(lo) + ' ' + Y(lo) + 'L' + X(hi) + ' ' + Y(hi) + '"/><path class="bl-line-rev" d="M' + X(lo) + ' ' + Y(lo + B) + 'L' + X(hi) + ' ' + Y(hi + B) + '"/>';
    if (points.length > 1) o += '<path class="bl-trace" d="M' + points.map(function (p) { return X(p.reading) + ' ' + Y(p.carriage); }).join('L') + '"/>';
    var cy = cur.carriage;
    o += '<g class="bl-width"><path d="M' + X(cy - B) + ' ' + Y(cy) + 'H' + X(cy) + '"/><path d="M' + X(cy - B) + ' ' + (Y(cy) - 7) + 'v14M' + X(cy) + ' ' + (Y(cy) - 7) + 'v14"/></g>';
    o += '<circle class="bl-now" cx="' + X(cur.reading) + '" cy="' + Y(cy) + '" r="7"/></svg>';
    var lx = X(Math.max(x0, Math.min(x1, cy - B / 2))), ly = Y(cy) - 14 < T + 14 ? Y(cy) + 26 : Y(cy) - 14;
    o += '<text class="bl-width-label" x="' + lx + '" y="' + ly + '" text-anchor="middle">B = ' + mm(B) + ' mm</text>';
    o += '<text class="bl-axis" x="' + ((W + L) / 2) + '" y="' + (H - 16) + '" text-anchor="middle">Dial reading from screw rotation (mm)</text>';
    o += '<text class="bl-axis" transform="rotate(-90)" x="' + (-(H - Bt + T) / 2) + '" y="20" text-anchor="middle">Carriage from indicator (mm)</text>';
    o += '<g class="bl-key"><path class="bl-line-fwd" d="M' + (L + 12) + ' ' + (T + 18) + 'h26"/><text x="' + (L + 44) + '" y="' + (T + 23) + '">forward approach: carriage = dial</text>';
    o += '<path class="bl-line-rev" d="M' + (L + 12) + ' ' + (T + 42) + 'h26"/><text x="' + (L + 44) + '" y="' + (T + 47) + '">reverse approach: carriage = dial + B</text></g>';
    return o + '</svg>';
  }
  // Square window that keeps the current point inside the middle of the plot.
  function loopWindow(state, previous) {
    var B = state.clearance, half = Math.max(2.5 * B, 0.3), d = M.reading(state), c = state.carriage;
    if (previous && previous.half === half) {
      var inside = function (v, a, b) { var m = (b - a) * 0.18; return v >= a + m && v <= b - m; };
      if (inside(d, previous.x0, previous.x1) && inside(c, previous.y0, previous.y1)) return previous;
    }
    var mid = (d + c) / 2;
    return { half: half, x0: mid - half, x1: mid + half, y0: mid - half + B / 2, y1: mid + half + B / 2 };
  }
  // Axial section through the thread, drawn to scale for the lab's own lead and clearance and riding on
  // the carriage (nut fixed in the picture). The profile is the 3D model's illustrative form scaled with
  // the lead (model.threadProfile). The screw does not slide: turning its helix carries the tooth profile
  // across this fixed plane by the true offset c - s.
  function prof(points, lead, x) {
    var p = points.map(function (q) { return q[0]; }), r = points.map(function (q) { return q[1]; }), v = ((x % lead) + lead) % lead;
    var xs = [p[3] - lead].concat(p, [p[0] + lead]), rs = [r[3]].concat(r, [r[0]]);
    for (var i = 1; i < xs.length; i++) if (v <= xs[i]) return rs[i - 1] + (rs[i] - rs[i - 1]) * (v - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return r[0];
  }
  function section(state, caption) {
    var g = M.threadProfile(state.lead, state.clearance), L = g.lead, snap = M.snapshot(state), u = snap.offset, sc = g.scale;
    var W = 600, H = 380, k = 38 / sc, xm = -1.5 * L, xM = 1.5 * L, rBase = 6.6 * sc, rTop = 12.4 * sc;
    function X(x) { return num(30 + (x - xm) * k); }
    function Y(r) { return num(H - 90 - (r - rBase) * k); }
    var bk = [];
    for (var m = -3; m <= 3; m++) [g.screw, g.nut].forEach(function (pp, which) { pp.forEach(function (q) { bk.push(q[0] + m * L - (which ? 0 : u)); }); });
    bk = bk.filter(function (x) { return x > xm && x < xM; }).concat([xm, xM]).sort(function (a, b) { return a - b; });
    var screw = 'M' + X(xm) + ' ' + Y(rBase) + bk.map(function (x) { return 'L' + X(x) + ' ' + Y(prof(g.screw, L, x + u)); }).join('') + 'L' + X(xM) + ' ' + Y(rBase) + 'Z';
    var nut = 'M' + X(xm) + ' ' + Y(rTop) + bk.map(function (x) { return 'L' + X(x) + ' ' + Y(prof(g.nut, L, x)); }).join('') + 'L' + X(xM) + ' ' + Y(rTop) + 'Z';
    var state3 = snap.contact, marks = '';
    // Mark the flank pair in contact on each screw tooth: +X flank when driving forward, -X when driving back.
    for (var t = -2; t <= 2; t++) {
      var lf = [g.screw[0][0] + t * L - u, g.screw[1][0] + t * L - u], rf = [g.screw[2][0] + t * L - u, g.screw[3][0] + t * L - u];
      if (state3 === 'forward' && rf[0] > xm && rf[1] < xM) marks += '<path class="bl-contact" d="M' + X(rf[0]) + ' ' + Y(g.rMaj) + 'L' + X(rf[1]) + ' ' + Y(g.rMin) + '"/>';
      if (state3 === 'reverse' && lf[0] > xm && lf[1] < xM) marks += '<path class="bl-contact" d="M' + X(lf[0]) + ' ' + Y(g.rMin) + 'L' + X(lf[1]) + ' ' + Y(g.rMaj) + '"/>';
    }
    var words = state3 === 'forward' ? 'Screw flank pushing the nut toward +X' : state3 === 'reverse' ? 'Screw flank pushing the nut toward \u2212X' : 'Nut held in the clearance: no flank touching';
    var scale = 'To scale: lead ' + mm(L, L % 1 ? 1 : 0) + ' mm, clearance ' + mm(state.clearance) + ' mm';
    var label = 'Axial section through the thread, drawn riding on the carriage. ' + words + '. ' + scale + ' (illustrative 30-degree thread form).';
    var o = '<svg class="bl-section" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '" data-lead-mm="' + L + '" data-clearance-mm="' + state.clearance + '"><title>' + esc(label) + '</title>';
    o += '<path class="bl-nut" d="' + nut + '"/><path class="bl-screw" d="' + screw + '"/>' + marks;
    o += '<path class="bl-axisline" d="M' + X(xm) + ' ' + (H - 80) + 'H' + X(xM) + '"/><text class="bl-small" x="' + X(xM) + '" y="' + (H - 86) + '" text-anchor="end">+X \u2192</text>';
    o += '<text class="bl-state" x="' + X(xm) + '" y="22">' + esc(words) + '</text>';
    o += '<g class="bl-legend"><rect class="bl-nut" x="' + X(xm) + '" y="' + (H - 62) + '" width="20" height="16"/><text x="' + (X(xm) + 28) + '" y="' + (H - 48) + '">bronze nut, moves with the carriage</text>';
    o += '<rect class="bl-screw" x="' + X(xm) + '" y="' + (H - 30) + '" width="20" height="16"/><text x="' + (X(xm) + 28) + '" y="' + (H - 16) + '">steel screw, turns but never slides</text>';
    o += '</g><text class="bl-small bl-scale" x="' + X(xm) + '" y="48">' + esc((caption ? caption + ' \u00b7 ' : '') + scale) + '</text>';
    return o + '</svg>';
  }
  function readouts(state) {
    var s = M.snapshot(state), band = M.deadBand(state.lead, state.clearance);
    var contactText = s.contact === 'forward' ? 'Driving toward +X' : s.contact === 'reverse' ? 'Driving toward \u2212X' : 'In the clearance: carriage held';
    return '<dl class="bl-readout"><div><dt>Dial (from screw rotation)</dt><dd data-bl-out="reading">' + mm(s.reading) + ' mm</dd></div>' +
      '<div><dt>Carriage (indicator)</dt><dd data-bl-out="carriage">' + mm(s.carriage) + ' mm</dd></div>' +
      '<div><dt>Carriage \u2212 dial</dt><dd data-bl-out="difference">' + signed(s.difference) + ' mm</dd></div>' +
      '<div><dt>Flank contact</dt><dd class="bl-words" data-bl-out="contact">' + contactText + '</dd></div>' +
      '<div><dt>Dead band after a reversal</dt><dd>' + mm(band.divisions, band.divisions % 1 ? 1 : 0) + ' div = ' + mm(band.degrees, 1) + '\u00b0</dd></div></dl>';
  }
  function positioningRows(lead, clearance) {
    var plan = M.positioningPlan(clearance), div = function (v) { return Math.round(v * M.DIVISIONS / lead); };
    var over = div(plan.overshoot), target = div(plan.target), back = div(plan.backTo);
    var direct = M.replay({ lead: lead, clearance: clearance }, [over, target - over]).state;
    var same = M.replay({ lead: lead, clearance: clearance }, [over, back - over, target - back]).state;
    return [{ name: 'Reverse straight to the number', how: mm(plan.overshoot) + ' \u2192 ' + mm(plan.target), a: M.attempt(direct, plan.target) },
      { name: 'Back past it, approach forward again', how: mm(plan.overshoot) + ' \u2192 ' + mm(plan.backTo) + ' \u2192 ' + mm(plan.target), a: M.attempt(same, plan.target) }];
  }
  function positioningTable(lead, clearance, caption) {
    var rows = positioningRows(lead, clearance);
    return '<div class="unit-table-wrap"><table class="unit-table bl-table"><caption>' + esc(caption) + '</caption><thead><tr><th scope="col">Method</th><th scope="col">Dial moves</th><th scope="col">Dial</th><th scope="col">Carriage</th><th scope="col">Error</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row">' + esc(r.name) + '</th><td>' + r.how + ' mm</td><td>' + mm(r.a.reading) + ' mm</td><td>' + mm(r.a.carriage) + ' mm</td><td>' + signed(r.a.error) + ' mm</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function staticLesson() {
    var B = 0.2, L = 5, band = M.deadBand(L, B);
    var loopRun = M.replay({ lead: L, clearance: B }, [20, -20, 20]);
    var dense = M.replay({ lead: L, clearance: B }, Array(20).fill(1).concat(Array(20).fill(-1), Array(20).fill(1)));
    var after = M.replay({ lead: L, clearance: B }, [20, -4]).state;
    var fwd = M.replay({ lead: 5, clearance: 1 }, [20]).state, mid = M.turnBy(fwd, -10), rev = M.turnBy(fwd, -30);
    var o = '<div class="bl-static">';
    o += '<p><strong>What the lab does:</strong> a handwheel turns an axially fixed lead screw. The dial reports travel calculated from screw rotation; an indicator on the carriage reports where the carriage really is. With a total axial clearance <var>B</var> between screw and nut flanks, the two agree only while the screw keeps pushing in the direction the dial was set in.</p>';
    o += '<div class="panel bl-formula"><p><strong>Dead band after a reversal</strong> = clearance \u00f7 lead, as a fraction of a turn:</p><p><code>angle = 360\u00b0 \u00d7 B \u00f7 L</code> \u2003 <code>dial divisions = B \u00f7 (L \u00f7 100)</code> on a dial with 100 divisions per turn.</p>';
    o += '<p><strong>Worked example:</strong> lead L = 5 mm/rev, so one division is 0.05 mm. Clearance B = 0.20 mm. Angle = 360\u00b0 \u00d7 0.20 \u00f7 5 = <strong>' + mm(band.degrees, 1) + '\u00b0</strong>; divisions = 0.20 \u00f7 0.05 = <strong>' + band.divisions + '</strong>. For four divisions after the reversal the dial changes and the carriage does not.</p></div>';
    o += '<figure class="bl-static-pair"><div class="bl-static-instruments">' + handwheel(after, { from: 20, divisions: 4 }) + indicator(after) + '</div><figcaption>Driven forward to 1.00 mm, then reversed four divisions: the dial reads 0.80 mm (the shaded graduations passed under the index) while the indicator still reads 1.00 mm. Illustrative dial, lead 5 mm, clearance 0.20 mm.</figcaption></figure>';
    o += '<figure>' + loop(dense.points, loopRun.state, { x0: -0.35, x1: 1.35, y0: -0.25, y1: 1.45 }) + '<figcaption>Forward 0 \u2192 1.00 mm, back to 0, forward to 1.00 mm again. Each reversal runs along a flat step 0.20 mm long, so the path is a loop B wide measured along the dial axis.</figcaption></figure>';
    o += '<figure class="bl-static-sections">' + section(fwd, 'Driving forward') + section(mid, 'Reversed part way') + section(rev, 'Driving back') + '<figcaption>The same three moments in the thread, drawn to scale for lead 5 mm and clearance 1.0 mm (the exaggerated clearance of the 3D model). The heavy blue line marks the flank in contact. Reversing moves the contact from one flank to the other; between the two, nothing pushes the carriage.</figcaption></figure>';
    o += '<p class="bl-keep"><strong>Landing on 25.00 mm after overshooting to 25.60 mm</strong> (lead 5 mm, clearance 0.20 mm). The dial was zeroed after a forward approach, so it equals the carriage position only for forward approaches:</p>';
    o += positioningTable(5, 0.2, 'Same dial number, two approaches.');
    o += '<p>Reversing straight to the number stops the carriage one full clearance away from the dial reading, still on the overshoot side: the dial shows 25.00 mm while the carriage is at 25.20 mm. Backing past the target by more than the clearance and finishing in the original direction puts the screw back on the flank the dial was set against.</p>';
    o += '<p class="bl-limit"><strong>Model limits:</strong> rigid parts and a kinematic dead band only. Friction is assumed to hold the carriage still inside the clearance, and nothing else pushes it along the axis; there is no force, stiffness, preload or stick-slip model. Lead, clearance and the 3D dimensions are illustrative and exaggerated, not a standard thread or a measured machine.</p>';
    return o + '</div>';
  }
  return Object.freeze({ handwheel: handwheel, indicator: indicator, loop: loop, loopWindow: loopWindow, section: section,
    readouts: readouts, positioningRows: positioningRows, positioningTable: positioningTable, staticLesson: staticLesson, format: { mm: mm, signed: signed } });
});

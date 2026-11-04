/* Pure SVG renderer for the sweep and loft lab. Used by the live lab (charts,
   plan views and the no-WebGL fallback) and by static.cjs for the printable,
   no-JavaScript lesson inside each mount. Output is ID-free so several mounts
   and aggregates can carry it at once. */
(function (root, factory) {
  var api = factory(root.CourseWikiSweepLoftModel || (typeof require === 'function' ? require('./model.js') : null));
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.CourseWikiSweepLoftRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  var fmt = M.fmt;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function n1(v) { return (Math.round(v * 10) / 10).toString(); }
  /* Douglas-Peucker simplification at sub-pixel tolerance keeps static SVG lean */
  function simplify(pts, tol) {
    if (pts.length < 3) return pts.slice();
    var keep = new Array(pts.length), stack = [[0, pts.length - 1]], t2 = tol * tol;
    keep[0] = keep[pts.length - 1] = true;
    while (stack.length) {
      var seg = stack.pop(), a = pts[seg[0]], b = pts[seg[1]], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, best = -1, bi = -1;
      for (var i = seg[0] + 1; i < seg[1]; i++) {
        var p = pts[i], t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
        var ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1], d = ex * ex + ey * ey;
        if (d > best) { best = d; bi = i; }
      }
      if (best > t2) { keep[bi] = true; stack.push([seg[0], bi], [bi, seg[1]]); }
    }
    return pts.filter(function (_, i) { return keep[i]; });
  }
  function pathD(pts, closed) {
    if (!pts.length) return '';
    if (closed) { pts = simplify(pts.concat([pts[0]]), 0.35); pts.pop(); } else pts = simplify(pts, 0.35);
    var d = 'M' + n1(pts[0][0]) + ' ' + n1(pts[0][1]);
    for (var i = 1; i < pts.length; i++) d += 'L' + n1(pts[i][0]) + ' ' + n1(pts[i][1]);
    return d + (closed ? 'Z' : '');
  }
  /* split a polyline into runs by a per-point flag so each run gets its own class */
  function runs(pts, flags) {
    var out = [], cur = null;
    for (var i = 1; i < pts.length; i++) {
      var f = !!(flags[i - 1] || flags[i]);
      if (!cur || cur.flag !== f) { cur = { flag: f, pts: [pts[i - 1]] }; out.push(cur); }
      cur.pts.push(pts[i]);
    }
    return out;
  }

  /* ---------- isometric projection (z up) ---------- */
  function projector(az, el) {
    var a = az * Math.PI / 180, e = el * Math.PI / 180;
    var right = [-Math.sin(a), Math.cos(a), 0];
    var up = [-Math.sin(e) * Math.cos(a), -Math.sin(e) * Math.sin(a), Math.cos(e)];
    return function (p) { return [p[0] * right[0] + p[1] * right[1] + p[2] * right[2], -(p[0] * up[0] + p[1] * up[1] + p[2] * up[2])]; };
  }
  function fitter(all, W, H, pad, top) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    all.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    var sx = (W - 2 * pad) / Math.max(maxX - minX, 1e-9), sy = (H - top - pad) / Math.max(maxY - minY, 1e-9), s = Math.min(sx, sy);
    var ox = (W - (maxX - minX) * s) / 2 - minX * s, oy = top + (H - top - pad - (maxY - minY) * s) / 2 - minY * s;
    return { scale: s, map: function (p) { return [p[0] * s + ox, p[1] * s + oy]; } };
  }
  function svgOpen(cls, W, H, label) {
    return '<svg class="sll-svg ' + cls + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';
  }
  function title(x, y, text, cls) { return '<text class="' + (cls || 'sll-t-title') + '" x="' + x + '" y="' + y + '">' + esc(text) + '</text>'; }

  /* ---------- verdict text shared by live readouts and static captions ---------- */
  function diagramVerdict(v) {
    if (v.status === 'local-pass') return 'Local pass · global clearance unknown';
    if (v.state === 'matched') return 'Matched · sections checked';
    if (v.state === 'twisted') return 'Twisted · sections checked';
    if (v.state === 'folded') return 'Wrong order · doubles back';
    if (v.state === 'pinched') return 'Sections pinch or cross';
    if (v.state === 'folds') return 'Fails · local fold';
    if (v.state === 'degenerate') return 'Fails · inner wall collapses';
    return v.title;
  }
  function sweepVerdict(r) {
    var s = r.summary, worst = null;
    r.samples.forEach(function (q) { if (q.centre && (!worst || q.margin < worst.margin)) worst = q; });
    var reach = worst ? worst.reach : 0, rho = worst ? worst.rho : Infinity, out = { state: s.state, coil: null };
    var local = 'At the tightest bend the profile reaches ' + fmt(reach, 2) + ' mm toward the centre of curvature, inside the ' + fmt(rho, 2) + ' mm bend radius (margin ' + fmt(rho - reach, 2) + ' mm).';
    if (s.state === 'degenerate') {
      out.title = 'Fails: the inner wall collapses';
      out.text = 'The profile reaches exactly ' + fmt(reach, 2) + ' mm toward the centre, equal to the ' + fmt(rho, 2) + ' mm bend radius. The inner wall shrinks to an edge at the centre of curvature, so the surface is singular there. Treat it as a failure.';
    } else if (s.state === 'folds') {
      out.title = 'Fails: the inner wall folds through itself';
      out.text = 'Over ' + fmt(s.flaggedFraction * 100, 0) + '% of the path the profile reaches ' + fmt(reach, 2) + ' mm toward the centre of curvature, past the ' + fmt(rho, 2) + ' mm bend radius. The inner side runs backwards and crosses itself (red).';
    } else if (r.overall === 'builds') {
      out.title = 'Builds: no fold and no clash';
      out.text = local + ' On this U-bend that also rules out clashes: each slice stays on its own side of the bend and the straight legs are ' + fmt(2 * r.params.bend, 2) + ' mm apart, more than the ' + fmt(2 * r.profile.halfU, 2) + ' mm profile width across the bend.';
    } else if (r.overall === 'fails-clash') {
      out.title = 'Fails: neighbouring coils collide';
      out.text = local + ' There is no local fold, but the turns clash.';
    } else {
      out.title = 'Local test passes; global clearance not established';
      out.text = local + ' ' + (r.helix ? 'The neighbouring-coil chord check found no contact, but it can only prove a clash, never clearance: other parts of the sections can still meet.' : 'This lab does not search distant parts of this path for clashes, so it cannot say the whole sweep builds.');
    }
    if (r.coil) {
      var c = r.coil;
      if (c.touches) out.coil = { touches: true, text: 'Coils collide: neighbouring turns are ' + fmt(c.distance, 2) + ' mm apart along the chord between them, but the profile needs ' + fmt(c.reachSum, 2) + ' mm. The local bend test cannot see this clash.' };
      else if (c.distance === null) out.coil = { touches: false, text: 'Coil chord check: the turns spread apart steadily, so there is no neighbouring-coil chord to test. That does not prove the coils clear.' };
      else out.coil = { touches: false, text: 'Coil chord check: neighbouring turns are ' + fmt(c.distance, 2) + ' mm apart along the chord and the profile needs ' + fmt(c.reachSum, 2) + ' mm there, so there is no contact on that chord. That does not prove the coils clear.' };
    }
    if (r.helix && r.profile.shape === 'rectangle') out.roll = 'The bar rolls about ' + fmt(r.helix.rollPerTurnDeg, 0) + '° per turn relative to the coil, because this lab carries the profile without avoidable twist. CAD orientation options can instead keep it aligned with the coil.';
    out.status = r.overall;
    out.fails = r.overall === 'fails-local' || r.overall === 'fails-clash';
    out.established = r.overall !== 'local-pass';
    return out;
  }
  function loftVerdict(r) {
    var s = r.summary, tw = s.twists.map(function (t) { return fmt(Math.abs(t), 0) + '°'; });
    var checked = ' Checked ' + s.checkedSections + ' cross-sections; none crosses itself.';
    if (s.state === 'folded') return { state: s.state, title: 'Wrong shape: the loft doubles back', text: 'The selection order jumps past the middle profile, so the surface travels up, then back down through heights it already occupies. This is not a proof of surface intersection. Select profiles in the order they sit along the part.' };
    if (s.state === 'pinched') return { state: s.state, title: 'Fails: sections pinch or cross themselves', text: 'The connectors pair vertices so far apart (' + tw.join(' then ') + ' of twist) that some cross-sections ' + (s.degenerate && !s.crossing ? 'collapse to zero area' : 'cross themselves') + ' (red). Line up the start points.' };
    if (s.state === 'twisted') return { state: s.state, title: 'Twisted: no crossing section found', text: 'Each connector rotates ' + tw.join(' then ') + ' between profiles, so the sides spiral and the narrowest section is ' + fmt(s.minAreaRatio * 100, 0) + '% of the smallest profile. Probably not the intent.' + checked };
    return { state: s.state, title: 'Connectors matched: no crossing section found', text: 'Matching start points pair corresponding vertices, so the connector lines run straight up the sides with no twist.' + checked };
  }

  /* ---------- sweep plan view (planar paths) ---------- */
  function sweepPlan(r, opts) {
    opts = opts || {};
    var W = opts.width || 480, H = opts.height || 330, P = r.params, prof = r.profile;
    if (P.path === 'helix') return sweepIso(r, opts);
    var w = prof.halfU, S = r.samples;
    var plus = S.map(function (q) { return [q.p[0] + w * q.e1[0], q.p[1] + w * q.e1[1]]; });
    var minus = S.map(function (q) { return [q.p[0] - w * q.e1[0], q.p[1] - w * q.e1[1]]; });
    var foldPlus = S.map(function (q) { return q.centre ? 1 - q.kappa * w * (q.e1[0] * q.centre[0] + q.e1[1] * q.centre[1]) <= M.TOL : false; });
    var foldMinus = S.map(function (q) { return q.centre ? 1 + q.kappa * w * (q.e1[0] * q.centre[0] + q.e1[1] * q.centre[1]) <= M.TOL : false; });
    var centre = S.map(function (q) { return [q.p[0], q.p[1]]; });
    var worst = null; S.forEach(function (q) { if (q.centre && (!worst || q.margin < worst.margin - 1e-12)) worst = q; });
    var cc = worst ? [worst.p[0] + worst.rho * worst.centre[0], worst.p[1] + worst.rho * worst.centre[1]] : null;
    var all = plus.concat(minus, centre); if (cc) all.push(cc);
    var flip = function (p) { return [p[0], -p[1]]; };
    var f = fitter(all.map(flip), W, H - 58, 22, 48), m = function (p) { return f.map(flip(p)); };
    var label = opts.label || ('Plan view of the ' + (P.path === 'arc' ? 'arc' : 'S-curve') + ' sweep. ' + sweepVerdict(r).title + '.');
    var out = svgOpen('sll-plan', W, H, label);
    out += title(14, 22, opts.title || 'PLAN OF THE BEND · swept edges');
    out += '<text class="sll-t-note" x="14" y="39">' + esc(prof.shape === 'circle' ? 'Ø' + fmt(prof.size, 2) + ' circle' : fmt(prof.width, 2) + ' × ' + fmt(prof.height, 2) + ' rectangle') + ' · half-width across the bend ' + fmt(w, 2) + ' mm</text>';
    // ribs: profile chords across the band
    var step = Math.max(1, Math.round(S.length / 22)), ribs = '', ribsBad = '';
    for (var i = 0; i < S.length; i += step) {
      var seg = 'M' + n1(m(minus[i])[0]) + ' ' + n1(m(minus[i])[1]) + 'L' + n1(m(plus[i])[0]) + ' ' + n1(m(plus[i])[1]);
      if (S[i].flagged) ribsBad += seg; else ribs += seg;
    }
    out += '<path class="sll-rib" d="' + ribs + '"/>' + (ribsBad ? '<path class="sll-rib sll-bad" d="' + ribsBad + '"/>' : '');
    out += '<path class="sll-centreline" d="' + pathD(centre.map(m)) + '"/>';
    [[plus, foldPlus], [minus, foldMinus]].forEach(function (pair) {
      runs(pair[0].map(m), pair[1]).forEach(function (run) { out += '<path class="sll-edge' + (run.flag ? ' sll-bad' : '') + '" d="' + pathD(run.pts) + '"/>'; });
    });
    if (worst && cc) {
      var pp = m([worst.p[0], worst.p[1]]), cm = m(cc), reachEnd = m([worst.p[0] + worst.reach * worst.centre[0], worst.p[1] + worst.reach * worst.centre[1]]);
      out += '<path class="sll-radius" d="M' + n1(pp[0]) + ' ' + n1(pp[1]) + 'L' + n1(cm[0]) + ' ' + n1(cm[1]) + '"/>';
      out += '<path class="sll-reach' + (worst.flagged ? ' sll-bad' : '') + '" d="M' + n1(pp[0]) + ' ' + n1(pp[1]) + 'L' + n1(reachEnd[0]) + ' ' + n1(reachEnd[1]) + '"/>';
      out += '<path class="sll-centremark" d="M' + n1(cm[0] - 7) + ' ' + n1(cm[1]) + 'h14M' + n1(cm[0]) + ' ' + n1(cm[1] - 7) + 'v14"/>';
      out += '<circle class="sll-dot" cx="' + n1(pp[0]) + '" cy="' + n1(pp[1]) + '" r="3.5"/>';
    }
    var v = sweepVerdict(r);
    out += '<g class="sll-key"><text class="sll-t-note" x="' + (W - 14) + '" y="' + (H - 40) + '" text-anchor="end">+ centre of curvature at the tightest bend</text>';
    out += '<text class="sll-t-note" x="' + (W - 14) + '" y="' + (H - 24) + '" text-anchor="end">bend radius ' + fmt(worst ? worst.rho : Infinity, 2) + ' mm · reach ' + fmt(worst ? worst.reach : 0, 2) + ' mm</text>';
    out += '<text class="sll-t-verdict' + (v.fails ? ' sll-bad-text' : '') + '" x="' + (W - 14) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(diagramVerdict(v)) + '</text></g>';
    return out + '</svg>';
  }

  /* ---------- isometric wireframe of a sweep ---------- */
  function sweepIso(r, opts) {
    opts = opts || {};
    var W = opts.width || 480, H = opts.height || 330, proj = projector(opts.az == null ? -58 : opts.az, opts.el == null ? (r.params.path === 'helix' ? 18 : 38) : opts.el);
    var upto = opts.progress == null ? r.samples.length - 1 : Math.round(opts.progress * (r.samples.length - 1));
    var flat = r.rings.map(function (ring) { return ring.map(proj); });
    var all = []; flat.forEach(function (ring) { ring.forEach(function (p) { all.push(p); }); });
    var f = fitter(all, W, H, 18, 46), N = r.profile.points.length;
    var label = opts.label || ('Wireframe of the ' + r.params.path + ' sweep. ' + sweepVerdict(r).title + '.');
    var out = svgOpen('sll-iso', W, H, label) + title(14, 22, opts.title || 'SWEEP · wireframe, red where the profile reaches the centre of curvature');
    var idx = r.profile.sharp ? [0, 6, 12, 13, 19, 25, 26, 32, 38, 39, 45, 51] : [0, 6, 12, 18, 24, 30, 36, 42];
    idx.forEach(function (j) {
      var pts = [], flags = [];
      for (var i = 0; i <= upto; i++) { pts.push(f.map(flat[i][j])); flags.push(r.fold[i][j] <= M.TOL); }
      runs(pts, flags).forEach(function (run) { out += '<path class="sll-wire' + (run.flag ? ' sll-bad' : '') + '" d="' + pathD(run.pts) + '"/>'; });
    });
    var step = Math.max(1, Math.round(r.samples.length / (r.params.path === 'helix' ? 60 : 26)));
    var good = '', bad = '';
    for (var i = 0; i <= upto; i += step) {
      if (!r.samples[i].flagged) { good += pathD(flat[i].map(f.map), true); continue; }
      // only the part of the ring that reaches the centre of curvature is red
      var pts = flat[i].map(f.map), fl = r.fold[i].map(function (v) { return v <= M.TOL; });
      runs(pts.concat([pts[0]]), fl.concat([fl[0]])).forEach(function (run) { if (run.flag) bad += pathD(run.pts); else good += pathD(run.pts); });
    }
    out += '<path class="sll-ring" d="' + good + '"/>' + (bad ? '<path class="sll-ring sll-bad" d="' + bad + '"/>' : '');
    out += '<path class="sll-ring sll-head" d="' + pathD(flat[upto].map(f.map), true) + '"/>';
    var v = sweepVerdict(r);
    out += '<text class="sll-t-verdict' + (v.fails ? ' sll-bad-text' : '') + '" x="' + (W - 14) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(diagramVerdict(v)) + '</text>';
    return out + '</svg>';
  }

  /* ---------- local check chart along the path ---------- */
  function marginChart(r, opts) {
    opts = opts || {};
    var W = opts.width || 480, H = opts.height || 220, L = 46, R = 14, T = 62, B = 34, S = r.samples, total = r.length;
    var finiteRho = S.filter(function (q) { return Number.isFinite(q.rho); }).map(function (q) { return q.rho; });
    var minRho = finiteRho.length ? Math.min.apply(null, finiteRho) : 60;
    var yMax = Math.max(r.summary.maxReach * 1.6, minRho * 1.6, 10);
    yMax = Math.ceil(yMax / 8) * 8; // quarter ticks land on whole millimetres
    function X(s) { return L + (W - L - R) * s / Math.max(total, 1e-9); }
    function Y(v) { return T + (H - T - B) * (1 - Math.min(v, yMax) / yMax); }
    var label = opts.label || ('Chart along the path: local bend radius against the profile reach toward the centre of curvature. ' + sweepVerdict(r).title + '.');
    var out = svgOpen('sll-chart', W, H, label) + title(14, 20, opts.title || 'LOCAL CHECK ALONG THE PATH');
    out += '<text class="sll-t-note" x="14" y="37">red: reach toward the centre ≥ local bend radius</text>';
    // red bands
    var band = '';
    for (var i = 1; i < S.length; i++) {
      if (S[i].flagged && S[i - 1].flagged) band += 'M' + n1(X(S[i - 1].s)) + ' ' + T + 'H' + n1(X(S[i].s)) + 'V' + (H - B) + 'H' + n1(X(S[i - 1].s)) + 'Z';
      else if (S[i].flagged && (i === S.length - 1 || !S[i + 1].flagged) && !S[i - 1].flagged) band += 'M' + n1(X(S[i].s) - 1.5) + ' ' + T + 'h3V' + (H - B) + 'h-3Z';
    }
    if (band) out += '<path class="sll-band" d="' + band + '"/>';
    out += '<path class="sll-axis" d="M' + L + ' ' + T + 'V' + (H - B) + 'H' + (W - R) + '"/>';
    for (var g = 0; g <= yMax; g += yMax / 4) out += '<text class="sll-t-tick" x="' + (L - 6) + '" y="' + n1(Y(g) + 4) + '" text-anchor="end">' + fmt(g, 0) + '</text><path class="sll-grid" d="M' + L + ' ' + n1(Y(g)) + 'H' + (W - R) + '"/>';
    out += '<text class="sll-t-tick" x="' + L + '" y="' + (H - 12) + '">path start</text><text class="sll-t-tick" x="' + (W - R) + '" y="' + (H - 12) + '" text-anchor="end">end, ' + fmt(total, 0) + ' mm along</text>';
    out += '<text class="sll-t-tick" x="' + (L - 6) + '" y="' + (T - 10) + '" text-anchor="end">mm</text>';
    out += '<path class="sll-rho" d="' + pathD(S.map(function (q) { return [X(q.s), Y(Number.isFinite(q.rho) ? q.rho : yMax)]; })) + '"/>';
    out += '<path class="sll-reachline" d="' + pathD(S.map(function (q) { return [X(q.s), Y(q.centre ? q.reach : 0)]; })) + '"/>';
    if (opts.progress != null) { var px = X(opts.progress * total); out += '<path class="sll-cursor" d="M' + n1(px) + ' ' + T + 'V' + (H - B) + '"/>'; }
    out += '<g class="sll-legend"><path class="sll-rho" d="M' + L + ' 50h24"/><text class="sll-t-tick" x="' + (L + 30) + '" y="54">bend radius</text>';
    out += '<path class="sll-reachline" d="M' + (L + 125) + ' 50h24"/><text class="sll-t-tick" x="' + (L + 155) + '" y="54">reach toward centre</text></g>';
    return out + '</svg>';
  }

  /* ---------- isometric wireframe of a loft ---------- */
  function loftIso(r, opts) {
    opts = opts || {};
    var W = opts.width || 420, H = opts.height || 380, proj = projector(opts.az == null ? -62 : opts.az, opts.el == null ? 24 : opts.el);
    var flat = r.rings.map(function (ring) { return ring.map(proj); });
    var all = []; flat.forEach(function (ring) { ring.forEach(function (p) { all.push(p); }); });
    var f = fitter(all, W, H, 16, opts.title === '' ? 12 : 40), Nn = r.n;
    var v = loftVerdict(r);
    var out = svgOpen('sll-iso sll-loft', W, H, opts.label || ('Loft wireframe. ' + v.title + '.'));
    if (opts.title !== '') out += title(12, 22, opts.title || 'LOFT · connector lines pair the vertices');
    var thin = '', bad = '', doubled = '', st = r.spanRings;
    for (var i = 0; i < r.rings.length; i++) {
      if (i % st === 0) continue;
      var d = pathD(flat[i].map(f.map), true);
      if (r.ringDoubled[i]) { if (i % 3 === 0) doubled += d; }
      else if (r.ringBad[i]) bad += d;
      else if (i % 4 === 0) thin += d;
    }
    out += '<path class="sll-ring sll-thin" d="' + thin + '"/>';
    for (var j = Nn / 8; j < Nn; j += Nn / 8) out += '<path class="sll-pair" d="' + pathD(flat.map(function (ring) { return f.map(ring[j]); })) + '"/>';
    if (doubled) out += '<path class="sll-ring sll-bad sll-doubled" d="' + doubled + '"/>';
    if (bad) out += '<path class="sll-ring sll-bad" d="' + bad + '"/>';
    [0, st, 2 * st].forEach(function (ri) { out += '<path class="sll-station" d="' + pathD(flat[ri].map(f.map), true) + '"/>'; });
    out += '<path class="sll-connector" d="' + pathD(flat.map(function (ring) { return f.map(ring[0]); })) + '"/>';
    [0, st, 2 * st].forEach(function (ri, k) {
      var p = f.map(flat[ri][0]);
      out += '<circle class="sll-start" cx="' + n1(p[0]) + '" cy="' + n1(p[1]) + '" r="4.5"/>';
      if (opts.labels !== false) out += '<text class="sll-t-tick" x="' + n1(p[0] + 9) + '" y="' + n1(p[1] + 4) + '">' + (k + 1) + ' ' + esc(r.stations[k].id) + '</text>';
    });
    if (opts.verdict !== false) out += '<text class="sll-t-verdict' + (v.state === 'pinched' || v.state === 'folded' ? ' sll-bad-text' : '') + '" x="' + (W - 12) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(diagramVerdict(v)) + '</text>';
    return out + '</svg>';
  }

  return { esc: esc, sweepPlan: sweepPlan, sweepIso: sweepIso, marginChart: marginChart, loftIso: loftIso, sweepVerdict: sweepVerdict, loftVerdict: loftVerdict, projector: projector };
});

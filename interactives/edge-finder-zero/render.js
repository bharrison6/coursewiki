(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiEdgeFinderZero);
  if (node) module.exports = api; else root.CourseWikiEdgeFinderZeroDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  // Pure string renderers shared by the live lab and the static (print/no-JS) lesson.
  function n2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  var mm = M.mm, sm = M.signedMm;
  var PHASE_TEXT = { free: 'Wobbling: tip runs off-centre, not touching', centring: 'Centring: tip touches and runs nearly concentric', kick: 'Kick: trigger reached' };
  function axisName(st) { return M.SIDES[st.side].axis.toUpperCase(); }
  function sideWord(st) { return M.SIDES[st.side].label.toLowerCase(); }

  // 45° section hatching clipped to a rectangle, without SVG ids (mounts stay independent).
  function hatch(x, y, w, h, gap) {
    var d = '';
    for (var k = gap; k < w + h; k += gap) {
      var x1 = x + Math.max(0, k - h), y1 = y + Math.min(k, h), x2 = x + Math.min(k, w), y2 = y + Math.max(0, k - w);
      d += 'M' + n2(x1) + ' ' + n2(y1) + 'L' + n2(x2) + ' ' + n2(y2);
    }
    return d;
  }
  // ---- Close-up: magnified top view and matching side view ----------------------
  var CK = 0.014;                     // px per µm (14 px per mm)
  var C_EDGE = 320, C_TOP = 128, C_SURF = 268;
  function closeGeometry(st, theta) {
    var c = M.contact(st), n = M.SIDES[st.side].n, off = M.tipOffset(c, theta);
    var axisX = C_EDGE + n * c.d * CK;
    return { c: c, n: n, axisX: axisX, dx: -n * off.u * CK, dy: -off.v * CK, rr: st.r * CK };
  }
  function tipTransforms(st, theta) {
    var g = closeGeometry(st, theta);
    return { top: 'translate(' + n2(g.dx) + ' ' + n2(g.dy) + ')', side: 'translate(' + n2(g.dx) + ' 0)' };
  }
  function closeup(st, theta, opts) {
    opts = opts || {};
    var g = closeGeometry(st, theta === undefined ? 0 : theta), c = g.c, n = g.n, ax = g.axisX, rr = g.rr;
    var partX = n < 0 ? C_EDGE : 0, partW = n < 0 ? 640 - C_EDGE : C_EDGE;
    var t = tipTransforms(st, theta === undefined ? 0 : theta);
    var viewWord = M.SIDES[st.side].axis === 'x' ? 'Side view from the front' : 'Side view from the right';
    var label = 'Magnified close-up of the ' + sideWord(st) + '. ' + PHASE_TEXT[c.phase] + '. ' +
      (c.phase === 'kick' ? 'Spindle centre has reached or passed the trigger point.' : 'Gap to the trigger point ' + mm(c.gap) + ' mm.');
    var gapText = c.phase === 'kick' ? 'Kick: trigger reached' : 'To trigger: ' + mm(c.gap) + ' mm';
    var off = ax < -rr || ax > 640 + rr;
    var labelX = n < 0 ? 630 : 10, labelAnchor = n < 0 ? 'end' : 'start';
    return '<svg class="efz-svg efz-close" viewBox="0 0 640 360" role="img" aria-label="' + esc(label) + '" focusable="false" data-phase="' + c.phase + '">' +
      '<rect class="efz-part" x="' + partX + '" y="40" width="' + partW + '" height="176"/>' +
      '<path class="efz-face" d="M' + C_EDGE + ' 40V216"/>' +
      '<text class="efz-small" x="' + labelX + '" y="70" text-anchor="' + labelAnchor + '">part</text>' +
      '<text class="efz-small" x="' + labelX + '" y="28" text-anchor="' + labelAnchor + '">Top view, magnified</text>' +
      '<text class="efz-small efz-orient" x="' + labelX + '" y="206" text-anchor="' + labelAnchor + '">' + (M.SIDES[st.side].axis === 'x' ? '→ +X   ↑ +Y' : 'turned 90°: → +Y   ↓ +X') + '</text>' +
      // concentric reference ring and spindle axis
      '<circle class="efz-ref" cx="' + n2(ax) + '" cy="' + C_TOP + '" r="' + n2(rr) + '"/>' +
      '<path class="efz-axis" d="M' + n2(ax - 10) + ' ' + C_TOP + 'H' + n2(ax + 10) + 'M' + n2(ax) + ' ' + (C_TOP - 10) + 'V' + (C_TOP + 10) + '"/>' +
      '<g class="efz-tip-top" transform="' + t.top + '"><circle class="efz-tip" cx="' + n2(ax) + '" cy="' + C_TOP + '" r="' + n2(rr) + '"/><circle class="efz-tip-dot" cx="' + n2(ax) + '" cy="' + C_TOP + '" r="3"/></g>' +
      // Motion marks above the tip: the kick throws it sideways along the edge.
      (c.phase === 'kick' ? '<path class="efz-kickmark" d="M' + n2(ax - 16) + ' ' + n2(C_TOP - rr - 20) + 'l-7 -14M' + n2(ax) + ' ' + n2(C_TOP - rr - 22) + 'v-16M' + n2(ax + 16) + ' ' + n2(C_TOP - rr - 20) + 'l7 -14"/>' : '') +
      (off ? '<text class="efz-small" x="' + (n < 0 ? 12 : 628) + '" y="200" text-anchor="' + (n < 0 ? 'start' : 'end') + '">' + (n < 0 ? '← ' : '') + 'edge finder out of frame' + (n < 0 ? '' : ' →') + '</text>' : '') +
      // side view
      '<path class="efz-divider" d="M0 226H640"/>' +
      '<text class="efz-small" x="' + labelX + '" y="254" text-anchor="' + labelAnchor + '">' + viewWord + '</text>' +
      '<rect class="efz-part" x="' + partX + '" y="' + C_SURF + '" width="' + partW + '" height="' + (360 - C_SURF) + '"/><path class="efz-hatch" d="' + hatch(partX, C_SURF, partW, 360 - C_SURF, 14) + '"/>' +
      '<path class="efz-face" d="M' + C_EDGE + ' ' + C_SURF + 'V360M' + partX + ' ' + C_SURF + 'h' + partW + '"/>' +
      '<path class="efz-axis efz-centerline" d="M' + n2(ax) + ' 232V352"/>' +
      '<g class="efz-tip-side" transform="' + t.side + '"><rect class="efz-tip" x="' + n2(ax - rr) + '" y="232" width="' + n2(2 * rr) + '" height="92"/></g>' +
      '<text class="efz-gap" x="' + labelX + '" y="' + (C_SURF + 36) + '" text-anchor="' + labelAnchor + '">' + esc(gapText) + '</text>' +
      '</svg>';
  }

  // ---- Top view of the part, true scale ------------------------------------------
  var TS = 0.0036, TCX = 320, TCY = 250;
  function tx(x) { return TCX + (x - M.middle('x')) * TS; }
  function ty(y) { return TCY - (y - M.middle('y')) * TS; }
  function holeScreen(st, hole) {
    var s = M.SIDES[st.side];
    return s.axis === 'x' ? { x: tx(hole.at), y: ty(M.middle('y')) } : { x: tx(M.middle('x')), y: ty(hole.at) };
  }
  function holeMark(st, hole) {
    var p = holeScreen(st, hole), r = 2000 * TS;
    var cls = hole.kind === 'yours' ? 'efz-hole' : hole.kind === 'forgot' ? 'efz-hole-forgot' : hole.kind === 'sign' ? 'efz-hole-sign' : 'efz-hole-ok';
    var extra = hole.kind === 'sign' ? '<circle class="efz-hole-sign" cx="' + n2(p.x) + '" cy="' + n2(p.y) + '" r="' + n2(r + 4) + '"/>' : '';
    return '<g data-hole="' + esc(hole.kind) + '" data-cx="' + n2(p.x) + '" data-cy="' + n2(p.y) + '"><circle class="' + cls + '" cx="' + n2(p.x) + '" cy="' + n2(p.y) + '" r="' + n2(r) + '"/>' + extra + '</g>';
  }
  function topView(st, opts) {
    opts = opts || {};
    var s = M.SIDES[st.side], P = M.PART, holes = (st.holes || []).concat(opts.extra || []);
    var x0 = tx(P.x0), x1 = tx(P.x1), yb = ty(P.y1), yf = ty(P.y0);
    var E = M.edge(st.side), H = M.holeTarget(st.side), target = E + H;
    var ip = s.axis === 'x' ? { x: tx(target), y: ty(M.middle('y')) } : { x: tx(M.middle('x')), y: ty(target) };
    var datum = s.axis === 'x' ? 'M' + n2(tx(E)) + ' ' + n2(yb) + 'V' + n2(yf) : 'M' + n2(x0) + ' ' + n2(ty(E)) + 'H' + n2(x1);
    var sp = opts.spindle || st.pos, spx = tx(sp.x), spy = ty(sp.y), rr = st.r * TS;
    // Dimension from the datum edge to the drawn hole.
    var dim, dimText;
    if (s.axis === 'x') {
      var dy = ty(M.middle('y')) + 36;
      dim = 'M' + n2(tx(E)) + ' ' + n2(dy) + 'H' + n2(ip.x) + 'M' + n2(ip.x) + ' ' + n2(ip.y + 10) + 'V' + n2(dy + 6);
      dimText = '<text class="efz-small" x="' + n2((tx(E) + ip.x) / 2) + '" y="' + n2(dy + 24) + '" text-anchor="middle">20</text>';
    } else {
      var dx = tx(M.middle('x')) + 40;
      dim = 'M' + n2(dx) + ' ' + n2(ty(E)) + 'V' + n2(ip.y) + 'M' + n2(ip.x + 10) + ' ' + n2(ip.y) + 'H' + n2(dx + 6);
      dimText = '<text class="efz-small" x="' + n2(dx + 10) + '" y="' + n2((ty(E) + ip.y) / 2 + 7) + '">20</text>';
    }
    var datumLabelPos = s.axis === 'x' ? { x: tx(E), y: yb - 12, a: 'middle' } : { x: x1 + 10, y: ty(E) + 7, a: 'start' };
    var label = 'Top view of the 100 by 60 mm part, true scale. Datum: the ' + sideWord(st) + ', ' + axisName(st) + ' 0 after setting. Drawn check hole 20 mm inside it.' +
      (holes.length ? ' ' + holes.map(function (h) { return h.label + ' ' + mm(h.fromEdge) + ' mm from the edge'; }).join('; ') + '.' : ' No hole drilled yet.');
    return '<svg class="efz-svg efz-top" viewBox="0 0 640 470" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      '<text class="efz-small" x="18" y="28">Top view, true scale</text>' +
      '<rect class="efz-part" x="' + n2(x0) + '" y="' + n2(yb) + '" width="' + n2(x1 - x0) + '" height="' + n2(yf - yb) + '"/>' +
      '<path class="efz-datum" d="' + datum + '"/>' +
      '<text class="efz-datum-label" x="' + n2(datumLabelPos.x) + '" y="' + n2(datumLabelPos.y) + '" text-anchor="' + datumLabelPos.a + '">datum ' + axisName(st) + ' 0</text>' +
      '<path class="efz-dim" d="' + dim + '"/>' + dimText +
      '<circle class="efz-intended" cx="' + n2(ip.x) + '" cy="' + n2(ip.y) + '" r="' + n2(2000 * TS + 3) + '"/>' +
      '<path class="efz-intended-cross" d="M' + n2(ip.x - 14) + ' ' + n2(ip.y) + 'H' + n2(ip.x + 14) + 'M' + n2(ip.x) + ' ' + n2(ip.y - 14) + 'V' + n2(ip.y + 14) + '"/>' +
      holes.map(function (h) { return holeMark(st, h); }).join('') +
      '<g class="efz-spindle" data-sx="' + n2(spx) + '" data-sy="' + n2(spy) + '">' + (opts.spindle ? '' : '<circle class="efz-tip-true" cx="' + n2(spx) + '" cy="' + n2(spy) + '" r="' + n2(rr) + '"/>') + '<path class="efz-axis" d="M' + n2(spx - 8) + ' ' + n2(spy) + 'H' + n2(spx + 8) + 'M' + n2(spx) + ' ' + n2(spy - 8) + 'V' + n2(spy + 8) + '"/></g>' +
      '<path class="efz-axes" d="M30 446H90M82 440L90 446L82 452M30 446V386M24 394L30 386L36 394"/>' +
      '<text class="efz-small" x="96" y="453">+X</text><text class="efz-small" x="40" y="392">+Y (back)</text>' +
      '<text class="efz-small" x="622" y="453" text-anchor="end">front (operator side)</text>' +
      '</svg>';
  }

  // ---- Magnified ruler: where each hole lands, measured from the datum edge -----------
  var RK = 20, RMIN = -2000, RMAX = 27000;          // 20 px per mm over −2 … 27 mm
  function rulerX(um) { return 40 + (um - RMIN) / 1000 * RK; }
  function latestByKind(holes) {
    var out = {}; holes.forEach(function (h) { out[h.kind === 'correct' ? 'yours' : h.kind] = h; });
    return ['yours', 'forgot', 'sign'].filter(function (k) { return out[k]; }).map(function (k) { return out[k]; });
  }
  function holeRuler(st, holes) {
    var shown = latestByKind(holes || st.holes), ticks = '', nums = '';
    for (var m = -2; m <= 27; m++) {
      var x = rulerX(m * 1000), big = m % 5 === 0;
      ticks += 'M' + n2(x) + ' 44V' + (big ? 30 : 37);
      if (big) nums += '<text class="efz-small" x="' + n2(x) + '" y="24" text-anchor="middle">' + m + '</text>';
    }
    var lanes = shown.map(function (h, i) {
      var y = 80 + i * 38, clamped = Math.max(RMIN, Math.min(RMAX, h.fromEdge)), x = rulerX(clamped), off = clamped !== h.fromEdge;
      var word = h.kind === 'yours' || h.kind === 'correct' ? h.label.toLowerCase() : h.kind === 'forgot' ? 'radius forgotten' : 'wrong sign';
      var text = word + ' ' + (clamped !== h.fromEdge ? '(off scale) ' : '') + mm(h.fromEdge), right = x + 14 + text.length * 12.5 > 632;
      var cls = h.kind === 'forgot' ? 'efz-hole-forgot' : h.kind === 'sign' ? 'efz-hole-sign' : 'efz-hole';
      return '<g data-ruler="' + esc(h.kind) + '" data-x="' + n2(x) + '"><path class="efz-lane" d="M' + n2(x) + ' 44V' + (y - 8) + '"/><circle class="' + cls + '" cx="' + n2(x) + '" cy="' + y + '" r="7"/>' +
        '<text class="efz-small efz-halo" x="' + n2(right ? x - 14 : x + 14) + '" y="' + (y + 8) + '" text-anchor="' + (right ? 'end' : 'start') + '">' + esc(text) + '</text></g>';
    }).join('');
    var label = 'Magnified scale of distance from the datum edge, 20 mm drawn at 20.000. ' + (shown.length ? shown.map(function (h) { return h.label + ' at ' + mm(h.fromEdge) + ' mm'; }).join('; ') + '.' : 'No holes yet.');
    return '<svg class="efz-svg efz-ruler" viewBox="0 0 640 ' + (shown.length ? 62 + shown.length * 38 : 62) + '" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      '<rect class="efz-part" x="' + n2(rulerX(0)) + '" y="44" width="' + n2(rulerX(RMAX) - rulerX(0) + 20) + '" height="200"/>' +
      '<path class="efz-datum" d="M' + n2(rulerX(0)) + ' 30V250"/>' +
      '<path class="efz-axes" d="M' + n2(rulerX(RMIN)) + ' 44H' + n2(rulerX(RMAX)) + ticks + '"/>' + nums +
      '<path class="efz-target" d="M' + n2(rulerX(20000)) + ' 30V250"/>' + lanes + '</svg>';
  }

  // ---- Readout, holes and explanations --------------------------------------------
  function dro(st) {
    var r = M.readings(st), c = M.contact(st), a = M.SIDES[st.side].axis;
    function row(k) { return '<div class="efz-dro-row' + (k === a ? ' is-active' : '') + '"><span class="efz-dro-axis">' + k.toUpperCase() + '</span><output class="efz-dro-value" data-efz-dro="' + k + '">' + sm(r[k]) + '</output><span class="efz-dro-unit">mm</span></div>'; }
    return '<div class="efz-dro" data-phase="' + c.phase + '">' + row('x') + row('y') +
      '<p class="efz-phase" data-efz-phase="' + c.phase + '"><strong>' + (c.phase === 'kick' ? 'KICK' : c.phase === 'centring' ? 'Centring' : 'Wobbling') + '</strong> ' + esc(PHASE_TEXT[c.phase].split(': ')[1]) + '</p></div>';
  }
  function holeRows(st, holes) {
    return holes.map(function (h) {
      var cls = M.classify(h, st.r), mult = cls === 'radius' ? ' (1 r)' : cls === 'double' ? ' (2 r)' : '';
      return '<tr data-kind="' + esc(h.kind) + '"><th scope="row"><span class="efz-key efz-key-' + esc(h.kind) + '" aria-hidden="true"></span>' + esc(h.label) + '</th><td>' + sm(h.setting) + '</td><td>' + mm(h.fromEdge) + '</td><td>' + (h.inwardError === 0 ? '0.000' : (h.inwardError < 0 ? mm(-h.inwardError) + ' toward edge' : mm(h.inwardError) + ' away from edge') + mult) + '</td></tr>';
    }).join('');
  }
  function holeTable(st, holes) {
    holes = holes || st.holes;
    if (!holes.length) return '<p class="efz-empty">No check holes yet.</p>';
    return '<div class="efz-table-wrap"><table class="efz-table"><caption>Check holes: drawing says 20.000 mm from the ' + sideWord(st) + '</caption><thead><tr><th scope="col">Hole</th><th scope="col">Readout set at kick (mm)</th><th scope="col">Lands from edge (mm)</th><th scope="col">Off by (mm)</th></tr></thead><tbody>' + holeRows(st, holes) + '</tbody></table></div>';
  }
  function rule(st) {
    var s = M.SIDES[st.side], plus = s.n < 0;
    return 'Approaching the ' + sideWord(st) + ' moving ' + s.move + ': edge ' + s.axis.toUpperCase() + ' = reading ' + (plus ? '+' : '−') + ' r. To make the edge read 0, set the readout to ' + sm(M.correctSetting(st.side, st.r)) + ' mm at the kick.';
  }
  // Separates the ideal setting contribution (0, r, 2r …) from the signed overshoot,
  // then states the net shift and where the readout's zero really lies.
  function explain(st, hole) {
    var s = M.SIDES[st.side], r = st.r, right = M.correctSetting(st.side, r);
    var settingPart = s.n * hole.setting - r, over = hole.overshoot, net = hole.inwardError;
    function dir(v) { return v < 0 ? 'toward the edge' : 'away from the edge'; }
    var out = [hole.label + ' lands ' + mm(hole.fromEdge) + ' mm from the ' + sideWord(st) + (net === 0 ? ', exactly as drawn.' : ', ' + mm(Math.abs(net)) + ' mm ' + (net < 0 ? 'closer to the edge' : 'further from the edge') + ' than the drawn 20.000 mm.')];
    if (settingPart === 0) out.push(over ? 'The setting ' + sm(right) + ' mm is correct for this side, so it contributes nothing.' : 'At the kick the spindle centre was one radius (' + mm(r) + ' mm) outside the edge, so the readout had to read ' + sm(right) + ' mm there.');
    else if (hole.setting === 0) out.push('At the exact trigger, the spindle centre is one radius outside the edge. Setting 0 there puts zero at the spindle centre: the forgotten radius contributes r = ' + mm(r) + ' mm toward the edge.');
    else if (hole.setting === -right) out.push('At the exact trigger, the spindle centre is one radius outside the edge. The wrong sign moves zero a second radius further out: the wrong sign contributes 2r = ' + mm(2 * r) + ' mm toward the edge.');
    else out.push('The setting differs from the correct ' + sm(right) + ' mm, contributing ' + mm(Math.abs(settingPart)) + ' mm ' + dir(settingPart) + '.');
    if (over) out.push('The last jog went past the trigger by ' + mm(over) + ' mm, which moves the hole ' + mm(over) + ' mm away from the edge.');
    if (over && settingPart) out.push('Net: ' + mm(Math.abs(settingPart)) + ' mm ' + (settingPart < 0 ? 'toward' : 'away') + ' and ' + mm(over) + ' mm away gives ' + (net === 0 ? '0.000 mm.' : mm(Math.abs(net)) + ' mm ' + dir(net) + '.'));
    out.push(hole.zeroOutside === 0 ? 'Zero is exactly on the edge.' : hole.zeroOutside > 0 ? 'Zero lies ' + mm(hole.zeroOutside) + ' mm outside the edge.' : 'Zero lies ' + mm(-hole.zeroOutside) + ' mm inside the part.');
    if (over) out.push('Back away and re-approach with finer steps.');
    return out.join(' ');
  }

  // ---- Tool length side view --------------------------------------------------------
  var ZS = 0.0021, ZSURF = 366, ZH = 420, RAISE = 8000;
  function lengthView(g, shown, opts) {
    opts = opts || {};
    // shown: { t1: bool, t2: bool } — touched-off stations; others are drawn raised.
    var stations = [{ id: 't1', x: 190 }, { id: 't2', x: 450 }];
    var body = stations.map(function (s) {
      var T = M.TOOLS[s.id], touched = shown && shown[s.id];
      var raise = opts.raise && typeof opts.raise[s.id] === 'number' ? opts.raise[s.id] : touched ? 0 : RAISE;
      var reading = M.touchReading(s.id, g);
      var gaugeLine = ZSURF - (g + T.length + raise) * ZS, tipY = gaugeLine + T.length * ZS;
      var w = (s.id === 't1' ? 10000 : 6000) * ZS;                  // diameter, same scale as length
      var pt = s.id === 't2' ? 6000 / (2 * Math.tan(59 * Math.PI / 180)) * ZS : 0; // 118° point length
      var block = g ? '<rect class="efz-block" x="' + (s.x - 34) + '" y="' + n2(ZSURF - g * ZS) + '" width="68" height="' + n2(g * ZS) + '"/>' : '';
      return '<g data-station="' + s.id + '">' + block +
        '<rect class="efz-spindle-nose" x="' + (s.x - 40) + '" y="' + n2(gaugeLine - 34) + '" width="80" height="34"/>' +
        '<path class="efz-gauge-line" d="M' + (s.x - 62) + ' ' + n2(gaugeLine) + 'H' + (s.x + 62) + '"/>' +
        (s.id === 't2' ? '<path class="efz-drill-point" d="M' + n2(s.x - w / 2) + ' ' + n2(tipY - pt) + 'L' + s.x + ' ' + n2(tipY) + 'L' + n2(s.x + w / 2) + ' ' + n2(tipY - pt) + 'Z"/>' : '') +
        '<rect class="efz-tool" data-diameter-px="' + n2(w) + '" x="' + n2(s.x - w / 2) + '" y="' + n2(gaugeLine) + '" width="' + n2(w) + '" height="' + n2(T.length * ZS - pt) + '"/>' +
        '<path class="efz-dim" d="M' + (s.x + 52) + ' ' + n2(gaugeLine) + 'V' + n2(tipY) + 'M' + (s.x + 46) + ' ' + n2(tipY) + 'H' + (s.x + 58) + '"/>' +
        '<text class="efz-small" x="' + (s.x + 60) + '" y="' + n2((gaugeLine + tipY) / 2) + '">L ' + mm(T.length) + '</text>' +
        '<text class="efz-label" x="' + s.x + '" y="' + n2(gaugeLine - 44) + '" text-anchor="middle">' + T.short + (touched ? ' · Z ' + sm(reading) : raise > 0 ? ' · raised' : '') + '</text>' +
        '</g>';
    }).join('');
    var label = 'Side view of two tools touched off on the part top' + (g ? ' through a ' + mm(g) + ' mm block' : '') + '. T1 length ' + mm(M.TOOLS.t1.length) + ' mm, T2 length ' + mm(M.TOOLS.t2.length) + ' mm from the spindle gauge line. ' +
      (shown && shown.t1 ? 'T1 reads Z ' + sm(M.touchReading('t1', g)) + '. ' : '') + (shown && shown.t2 ? 'T2 reads Z ' + sm(M.touchReading('t2', g)) + '.' : '');
    return '<svg class="efz-svg efz-length" viewBox="0 0 640 ' + ZH + '" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      '<text class="efz-small" x="18" y="28">Side view: tool lengths and diameters to scale</text>' +
      body +
      '<rect class="efz-part" x="40" y="' + ZSURF + '" width="560" height="' + (ZH - ZSURF) + '"/>' +
      '<path class="efz-face" d="M40 ' + ZSURF + 'H600"/>' +
      '<text class="efz-small" x="48" y="' + (ZSURF + 30) + '">part top, Z 0</text>' +
      '</svg>';
  }
  function lengthTable(g) {
    return '<div class="efz-table-wrap"><table class="efz-table"><caption>Touch-off ' + (g ? 'through a ' + mm(g) + ' mm block' : 'with ideal zero-thickness contact') + '</caption><thead><tr><th scope="col">Tool</th><th scope="col">Length, gauge line to tip (mm)</th><th scope="col">Z reading at touch-off (mm)</th><th scope="col">Length value vs T1 (mm)</th></tr></thead><tbody>' +
      ['t1', 't2'].map(function (id) { var T = M.TOOLS[id]; return '<tr><th scope="row">' + esc(T.label) + '</th><td>' + mm(T.length) + '</td><td>' + sm(M.touchReading(id, g)) + '</td><td>' + sm(M.lengthValue(id)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  // ---- Static lessons (inside the mounts; regenerated by static.cjs) -------------------
  var SOURCES = '<p class="efz-source">Sources: <a href="https://ocw.mit.edu/courses/2-670-mechanical-engineering-tools-january-iap-2004/69ddc43986801c51a7fbfa97d6b5b63f_mill.pdf">MIT 2.670, Milling Machine</a>, “Using an Edge Finder”, p. 6; <a href="https://www.starrett.co.uk/products/precision-hand-tools/edge-finders/edge-finders-edge-finders/827mb-edge-finder/">Starrett 827MB</a> and <a href="https://www.starrett.co.uk/products/precision-hand-tools/edge-finders/edge-finders-edge-finders/827a-edge-finder/">827A</a> product pages (how to use; 6 mm and 0.200 in contact diameters). The part, readings and drawings are original illustrations.</p>';
  function sidesTable() {
    return '<div class="efz-table-wrap"><table class="efz-table"><caption>The sign depends on the side approached (+X right, +Y toward the back)</caption><thead><tr><th scope="col">Edge</th><th scope="col">Spindle approaches moving</th><th scope="col">Edge position</th><th scope="col">Set readout at the kick (10 mm contact)</th></tr></thead><tbody>' +
      ['left', 'right', 'front', 'back'].map(function (id) { var s = M.SIDES[id]; return '<tr><th scope="row">' + s.label + '</th><td>' + s.move + '</td><td>' + s.axis.toUpperCase() + ' = reading ' + (s.n < 0 ? '+' : '−') + ' r</td><td>' + sm(M.correctSetting(id, 5000)) + ' mm</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function staticLesson() {
    var base = M.create('left', 'd10');
    var wob = base, cen = M.atGap(base, 200), kick = M.atGap(base, 0);
    var done = M.drill(M.setReadout(kick, -5000));
    var extra = [M.whatIf(done, 'forgot'), M.whatIf(done, 'sign')];
    var reading = M.readings(kick).x;
    return '<div class="efz-static-grid">' +
      '<figure class="efz-fig"><h3>Wobble, centre, kick</h3>' +
      '<div class="efz-seq"><div><h4>Free: off-centre wobble</h4>' + closeup(wob, 0, { uid: 'sa' }) + '</div><div><h4>0.200 mm before the trigger: nearly concentric</h4>' + closeup(cen, 0, { uid: 'sb' }) + '</div><div><h4>At the trigger: the tip kicks sideways</h4>' + closeup(kick, 0, { uid: 'sc' }) + '</div></div>' +
      '<figcaption>The offset tip orbits while free, is pushed concentric by the edge, then kicks when the spindle centre is one contact radius from the edge. The wobble and kick are drawn for illustration, not as contact mechanics.</figcaption></figure>' +
      '<figure class="efz-fig"><h3>Where the check hole lands</h3>' + topView(done, { extra: extra }) + '<p class="efz-ruler-cap">Distance from the datum edge, magnified (mm); the dashed line is the drawing’s 20.000</p>' + holeRuler(done, done.holes.concat(extra)) +
      '<figcaption>' + holeTable(done, done.holes.concat(extra)) + '</figcaption></figure></div>' +
      sidesTable() +
      '<p><strong>Worked example (left edge, 10 mm contact, r = 5 mm):</strong> at the kick the X readout shows ' + sm(reading) + ' mm in its old, arbitrary frame. The edge is at reading + r = ' + sm(reading) + ' + 5.000 = ' + sm(reading + 5000) + ' mm. Setting the readout to −5.000 mm at that position makes the edge read 0, and a hole programmed at X 20.000 lands 20.000 mm from the edge. Setting 0 instead (radius forgotten) puts the hole at 15.000 mm: off by r. Setting +5.000 (wrong sign) puts it at 10.000 mm: off by 2r.</p>' +
      '<p><strong>Model:</strong> top view; positions are the spindle centre relative to the part, whichever of them actually moves. The trigger occurs when the spindle centre is exactly one contact radius (half the contact diameter, not the body diameter) from the edge, on the approach side. Lengths are exact to 0.001 mm; jog steps are 1, 0.1 and 0.01 mm. A step that crosses the trigger leaves the readout past it by up to one step. The other axis is assumed already located. Backlash, tip wear, edge condition and speed are not modelled; use the edge finder’s specified speed.</p>' + SOURCES;
  }
  function staticLength() {
    var g = 10000;
    return '<figure class="efz-fig"><h3>Two tools touched off on the same surface</h3>' + lengthView(g, { t1: true, t2: true }) + '<figcaption>' + lengthTable(g) + lengthTable(0) + '</figcaption></figure>' +
      '<p><strong>Worked example:</strong> the readout follows the spindle and reads T1’s tip height, with the part top at Z 0. T2 is 27.500 mm longer than T1. Touching T2 onto a 10.000 mm block, the readout shows Z = 0 + 10.000 + (109.500 − 82.000) = +37.500 mm. T2’s length value is that reading minus the block: +27.500 mm. With that value applied, the tip Z is the reading minus 27.500. Without it, a move to Z +2.000 with T2 would put its tip at 2.000 − 27.500 = −25.500 mm: 25.500 mm below the part top.</p>' +
      '<p><strong>Model:</strong> Z reading at touch-off = surface Z + gauge thickness + (L<sub>tool</sub> − L<sub>T1</sub>). Lengths run from the spindle gauge line to the tip and are illustrative. The gauge is either an ideal zero-thickness contact or a stated 10.000 mm block. Controls store and apply tool length in different ways; follow the control’s documentation for the actual offset entry.</p>';
  }
  return Object.freeze({ holeRuler: holeRuler, rulerX: rulerX, closeup: closeup, tipTransforms: tipTransforms, topView: topView, holeScreen: holeScreen, dro: dro, holeTable: holeTable, rule: rule, explain: explain,
    lengthView: lengthView, lengthTable: lengthTable, RAISE: RAISE, staticLesson: staticLesson, staticLength: staticLength, PHASE_TEXT: PHASE_TEXT, TS: TS });
});

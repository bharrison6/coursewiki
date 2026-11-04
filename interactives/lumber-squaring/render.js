(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiLumberSquaring);
  if (node) module.exports = api; else root.CourseWikiLumberSquaringDraw = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  if (!M) throw new Error('Lumber-squaring model unavailable');
  var NX = M.NX, NY = M.NY, TOL = M.TOL, TG = M.TARGET;
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function mm(v) { return (Math.abs(v) < 0.05 ? 0 : v).toFixed(1); }
  function deg(v) { return (Math.abs(v) < 0.05 ? 0 : v).toFixed(1); }
  function n1(v) { return Math.round(v * 10) / 10; }
  function pts(list) { return list.map(function (p) { return n1(p[0]) + ',' + n1(p[1]); }).join(' '); }
  function frameNodes(board) {
    var F = M.faceFrame(board.nodes);
    return function (i, j, k) { return F.to(M.node(board, i, j, k)); };
  }
  function supportLine(xs, vs, below) {
    // Straightedge parallel to the end-to-end chord, resting on the outermost points.
    var n = xs.length, s = (vs[n - 1] - vs[0]) / ((xs[n - 1] - xs[0]) || 1), off = below ? Infinity : -Infinity;
    for (var i = 0; i < n; i++) { var d = vs[i] - vs[0] - s * (xs[i] - xs[0]); off = below ? Math.min(off, d) : Math.max(off, d); }
    var gaps = vs.map(function (v, i) { return Math.abs(v - (vs[0] + s * (xs[i] - xs[0]) + off)); });
    return { at: function (x) { return vs[0] + s * (x - xs[0]) + off; }, gap: Math.max.apply(null, gaps) };
  }
  function verdict(ok, text) { return '<span class="ls-verdict ' + (ok ? 'is-ok' : 'is-off') + '">' + (ok ? '✓ ' : '✗ ') + esc(text) + '</span>'; }
  function svgOpen(w, h, label) { return '<svg class="ls-fig" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '"><title>' + esc(label) + '</title>'; }

  // 1. Straightedge across face A at mid-length (true scale).
  function acrossFace(board, m) {
    var q = frameNodes(board), i = (NX - 1) / 2, top = [], bot = [];
    for (var j = 0; j < NY; j++) { bot.push(q(i, j, 0)); top.push(q(i, j, 1)); }
    var ys = bot.map(function (p) { return p[1]; }), zs = bot.map(function (p) { return p[2]; });
    var se = supportLine(ys, zs, true), y0 = Math.min.apply(null, ys.concat(top.map(function (p) { return p[1]; })));
    var zmin = Math.min.apply(null, zs.concat([se.at(ys[0]), se.at(ys[NY - 1])])), sc = 1.75;
    function X(y) { return 20 + (y - y0) * sc; } function Y(z) { return 122 - (z - zmin) * sc; }
    var poly = bot.map(function (p) { return [X(p[1]), Y(p[2])]; }).concat(top.slice().reverse().map(function (p) { return [X(p[1]), Y(p[2])]; }));
    var gapPoly = bot.map(function (p) { return [X(p[1]), Y(p[2])]; }).concat(bot.slice().reverse().map(function (p) { return [X(p[1]), Y(se.at(p[1]))]; }));
    var ok = se.gap <= TOL.mm && m.clean.A;
    var label = 'Cross-section at mid-length with a straightedge held against face A. Largest gap ' + mm(se.gap) + ' mm.';
    return { ok: ok, title: 'Straightedge across face A', text: ok ? 'flat across the width' : se.gap <= TOL.mm ? 'no gap, but still rough-sawn' : 'gap ' + mm(se.gap) + ' mm', svg: svgOpen(310, 140, label) +
      '<polygon class="ls-gap" points="' + pts(gapPoly) + '"/><polygon class="ls-wood" points="' + pts(poly) + '"/>' +
      '<line class="ls-straightedge" x1="' + n1(X(ys[0]) - 8) + '" y1="' + n1(Y(se.at(ys[0])) + 3) + '" x2="' + n1(X(ys[NY - 1]) + 8) + '" y2="' + n1(Y(se.at(ys[NY - 1])) + 3) + '"/>' +
      '<text x="20" y="137" class="ls-note">face A down · true scale</text></svg>' };
  }
  // 2. Straightedge along face A at mid-width (height exaggerated x4).
  function alongFace(board, m) {
    var q = frameNodes(board), j = (NY - 1) / 2, bot = [], top = [];
    for (var i = 0; i < NX; i++) { bot.push(q(i, j, 0)); top.push(q(i, j, 1)); }
    var xs = bot.map(function (p) { return p[0]; }), zs = bot.map(function (p) { return p[2]; }), se = supportLine(xs, zs, true);
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), sx = 270 / Math.max(1, x1 - x0), ex = 4;
    var zmin = Math.min.apply(null, zs.concat([se.at(x0), se.at(x1)]));
    function X(x) { return 20 + (x - x0) * sx; } function Y(z) { return 118 - (z - zmin) * sx * ex; }
    var poly = bot.map(function (p) { return [X(p[0]), Y(p[2])]; }).concat(top.slice().reverse().map(function (p) { return [X(p[0]), Y(p[2])]; }));
    var gapPoly = bot.map(function (p) { return [X(p[0]), Y(p[2])]; }).concat(bot.slice().reverse().map(function (p) { return [X(p[0]), Y(se.at(p[0]))]; }));
    var ok = se.gap <= TOL.mm && m.clean.A;
    var label = 'Side view along the length with a straightedge under face A. Largest gap ' + mm(se.gap) + ' mm. Heights drawn four times larger than lengths.';
    return { ok: ok, title: 'Straightedge along face A', text: ok ? 'flat along the length' : se.gap <= TOL.mm ? 'no gap, but still rough-sawn' : 'gap ' + mm(se.gap) + ' mm', svg: svgOpen(310, 140, label) +
      '<polygon class="ls-gap" points="' + pts(gapPoly) + '"/><polygon class="ls-wood" points="' + pts(poly) + '"/>' +
      '<line class="ls-straightedge" x1="' + n1(X(x0) - 6) + '" y1="' + n1(Y(se.at(x0)) + 3) + '" x2="' + n1(X(x1) + 6) + '" y2="' + n1(Y(se.at(x1)) + 3) + '"/>' +
      '<text x="20" y="137" class="ls-note">heights ×4</text></svg>' };
  }
  // 3. Winding sticks: compare face A's cross-width tilt at the two ends. The tilt difference is the
  // twist term of a quadratic fit of face A (one corner's lift when the other three touch a plane).
  function windingSticks(board, m) {
    var lift = m.faceA.twist, ex = 3, ok = lift <= TOL.mm && m.clean.A;
    var dz = Math.max(-30, Math.min(30, lift / 2 * (130 / Math.max(1, m.width.min)) * ex));
    function stick(sign, y, cls) { return '<line class="' + cls + '" x1="90" y1="' + n1(y + sign * dz / 2) + '" x2="220" y2="' + n1(y - sign * dz / 2) + '"/>'; }
    var label = 'Winding sticks on face A at both ends, sighted along the board. Their tilts differ by ' + mm(lift) + ' mm across the width. Tilt drawn three times larger.';
    return { ok: ok, title: 'Winding sticks on face A', text: ok ? 'sticks parallel: no twist' : lift <= TOL.mm ? 'no twist, but still rough-sawn' : 'out of parallel ' + mm(lift) + ' mm', svg: svgOpen(310, 140, label) +
      stick(-1, 58, 'ls-stick is-far') + stick(1, 82, 'ls-stick') +
      '<text x="228" y="62" class="ls-note">far end</text><text x="228" y="86" class="ls-note">near end</text><text x="20" y="137" class="ls-note">tilt ×3</text></svg>' };
  }
  // 4. Straightedge along edge A, seen from above (sideways exaggerated x4).
  function edgePlan(board, m) {
    var q = frameNodes(board), mid = [], far = [];
    for (var i = 0; i < NX; i++) { var a = q(i, 0, 0), b = q(i, 0, 1), c = q(i, NY - 1, 0), d = q(i, NY - 1, 1); mid.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); far.push([(c[0] + d[0]) / 2, (c[1] + d[1]) / 2]); }
    var xs = mid.map(function (p) { return p[0]; }), hs = mid.map(function (p) { return p[1]; }), se = supportLine(xs, hs, true);
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), sx = 270 / Math.max(1, x1 - x0), ex = 4;
    function X(x) { return 20 + (x - x0) * sx; } function Y(h) { return 112 - (h - se.at(x0)) * sx * ex; }
    // Draw the near-edge band only (true width would not fit): edge line plus 20 mm of face.
    var band = mid.map(function (p) { return [X(p[0]), Y(p[1])]; }).concat(mid.slice().reverse().map(function (p) { return [X(p[0]), Y(p[1]) - 44]; }));
    var gapPoly = mid.map(function (p) { return [X(p[0]), Y(p[1])]; }).concat(mid.slice().reverse().map(function (p) { return [X(p[0]), Y(se.at(p[0]))]; }));
    var ok = se.gap <= TOL.mm && m.clean.N;
    var label = 'Edge A seen from above with a straightedge against it. Largest gap ' + mm(se.gap) + ' mm. Sideways deviation drawn four times larger.';
    return { ok: ok, title: 'Straightedge along edge A', text: ok ? 'edge straight' : se.gap <= TOL.mm ? 'no gap, but still rough-sawn' : 'gap ' + mm(se.gap) + ' mm', svg: svgOpen(310, 140, label) +
      '<polygon class="ls-gap" points="' + pts(gapPoly) + '"/><polygon class="ls-wood" points="' + pts(band) + '"/>' +
      '<line class="ls-straightedge" x1="' + n1(X(x0) - 6) + '" y1="' + n1(Y(se.at(x0)) + 3) + '" x2="' + n1(X(x1) + 6) + '" y2="' + n1(Y(se.at(x1)) + 3) + '"/>' +
      '<text x="20" y="137" class="ls-note">seen from above · sideways ×4</text></svg>' };
  }
  // 5. Square on face A and edge A at the worst measured station (angle error drawn x5).
  function squareCheck(board, m) {
    var e = m.nearEdge, err = e.square, ok = err <= TOL.deg && m.clean.N;
    var nf = e.worstFaceNormal || [0, 0, 1], ne = e.worstEdgeNormal || [0, 1, 0];
    var fd = [nf[2], -nf[1]], ed = [-ne[2], ne[1]];
    var inner = Math.atan2(fd[0] * ed[1] - fd[1] * ed[0], fd[0] * ed[0] + fd[1] * ed[1]);
    var shown = Math.PI / 2 + (inner - Math.PI / 2) * 5;
    var cx = 80, cy = 112, L1 = 180, L2 = 88, exX = cx + Math.cos(shown) * L2, exY = cy - Math.sin(shown) * L2;
    var label = 'Square on face A and edge A in the cross-section with the largest error: ' + deg(err) + ' degrees out of square. Angle error drawn five times larger.';
    return { ok: ok, title: 'Square on face A and edge A', text: ok ? 'square within 0.1°' : err <= TOL.deg ? 'square, but edge A still rough-sawn' : deg(err) + '° out of square', svg: svgOpen(310, 140, label) +
      '<polygon class="ls-wood" points="' + pts([[cx, cy], [cx + L1, cy], [cx + L1, exY], [exX, exY]]) + '"/>' +
      '<path class="ls-square" d="M' + (cx - 12) + ' ' + (cy + 10) + 'V' + (cy - L2 - 6) + 'h8V' + (cy + 2) + 'H' + (cx + L1 - 30) + 'v8Z"/>' +
      '<line class="ls-edge-line" x1="' + cx + '" y1="' + cy + '" x2="' + n1(exX) + '" y2="' + n1(exY) + '"/>' +
      '<text x="' + (cx + 30) + '" y="' + (cy - 8) + '" class="ls-note">face A</text><text x="' + (cx + 12) + '" y="' + (cy - L2 + 16) + '" class="ls-note">edge A</text>' +
      '<text x="20" y="137" class="ls-note">square shown at the worst spot · angle error ×5</text></svg>' };
  }
  function checks(board, metrics) {
    var m = metrics || M.measure(board);
    var list = [acrossFace(board, m), alongFace(board, m), windingSticks(board, m), edgePlan(board, m), squareCheck(board, m)];
    return '<div class="ls-checks-grid">' + list.map(function (c) {
      return '<figure class="ls-check ' + (c.ok ? 'is-ok' : 'is-off') + '">' + c.svg + '<figcaption><strong>' + esc(c.title) + '</strong> ' + verdict(c.ok, c.text) + '</figcaption></figure>';
    }).join('') + '</div>';
  }
  function range(r) { return Math.abs(r.max - r.min) < 0.05 ? mm(r.min) : mm(r.min) + '–' + mm(r.max); }
  function readouts(metrics, roughVolume) {
    var m = metrics, s = M.status(m);
    function row(name, value, ok, target) { return '<tr><th scope="row">' + esc(name) + '</th><td>' + esc(value) + '</td><td>' + verdict(ok, ok ? 'yes' : 'no') + '</td><td>' + esc(target) + '</td></tr>'; }
    var removed = roughVolume ? Math.round(100 * (1 - m.volume / roughVolume)) : 0;
    return '<table class="ls-readout"><caption>Measured board (model mm). Material removed so far: ' + removed + '%</caption><thead><tr><th scope="col">Check</th><th scope="col">Now</th><th scope="col">True?</th><th scope="col">Goal</th></tr></thead><tbody>' +
      row('Thickness', range(m.thickness) + ' mm', s.thickAt && s.parallelT, '19.0 mm everywhere') +
      row('Width', range(m.width) + ' mm', s.widthAt && s.parallelW, '110.0 mm everywhere') +
      row('Length', range(m.length) + ' mm', s.lengthAt && s.parallelL, '520.0 mm') +
      row('Face A out of flat', mm(m.faceA.flatness) + ' mm', s.flatA, 'flat, machined') +
      row('Face B out of flat', mm(m.faceB.flatness) + ' mm', s.flatB, 'flat, machined') +
      row('Edge A out of straight', mm(m.nearEdge.straightness) + ' mm', s.straightN, 'straight, machined') +
      row('Edge A to face A', deg(m.nearEdge.square) + '° off 90°', s.squareN, 'square') +
      row('Edge B out of straight', mm(m.farEdge.straightness) + ' mm', s.straightF, 'straight, machined') +
      row('Edge B to face A', deg(m.farEdge.square) + '° off 90°', s.squareF, 'square') +
      row('Ends to face and edge', deg(m.ends.square) + '° off 90°', s.squareEnds, 'square') +
      '</tbody></table>';
  }

  function explain(op, before, after, info) {
    var b = before, a = after, s = M.status(a), out = [];
    if (op === 'joint-face') {
      if (info.depth < TOL.mm) out.push('Face A was already flat; one skim pass machines it and confirms it.');
      else out.push('The board rested on its lowest points on the long jointer table. ' + info.passes + ' illustrative pass' + (info.passes > 1 ? 'es' : '') + ' lowered the cut until it reached face A’s deepest hollow, ' + mm(info.depth) + ' mm in from the first contact. Face A is now flat.');
      if (!s.flatB) out.push('Face B is untouched and still ' + mm(a.faceB.flatness) + ' mm out of flat: the jointer only works on the face on its table.');
    } else if (op === 'joint-edge') {
      out.push('Edge A rode the long jointer table, so the cut is straight along the length (' + mm(info.depth) + ' mm off at the deepest point).');
      if (s.squareN) out.push('Face A is flat against the fence, so edge A is square to it all along.');
      else out.push('Face A is not flat. Where it touches the fence beside the cutter, its local angle sets the edge angle, so edge A is up to ' + deg(a.nearEdge.square) + '° out of square.');
    } else if (op === 'plane') {
      if (info.mode === 'flexible') {
        if (b.faceA.flatness > TOL.mm) out.push('In this flexible-board example the feed rollers press the warped board flat on the bed, and the knives cut the top parallel to the pressed underside. On release it springs back: thickness is ' + range(a.thickness) + ' mm, but face A is still ' + mm(a.faceA.flatness) + ' mm out of flat and face B now copies it (' + mm(a.faceB.flatness) + ' mm).');
        else out.push('Face A was flat on the bed, so nothing needed pressing: face B is now parallel to face A.');
      } else {
        out.push('In this rigid example (a stiff board, or one held on a flat sled) the board keeps the attitude it rests in, so the top is cut flat, parallel to that resting plane. Face A itself is unchanged at ' + mm(a.faceA.flatness) + ' mm out of flat; thickness now ranges ' + range(a.thickness) + ' mm.');
      }
      if (!info.cleaned) out.push('The board was already thinner than 19 mm in places, so parts of the top were not reached.');
    } else if (op === 'rip') {
      out.push('Edge A rode the fence, resting on its outermost points.');
      if (s.straightN) out.push('Edge A is straight, so the new edge is straight and parallel: width ' + range(a.width) + ' mm.');
      else out.push('Edge A is not straight, so the new edge follows edge A’s resting line, not edge A itself: width ranges ' + range(a.width) + ' mm.');
      if (!info.cleaned) out.push('Part of the far edge was already inside 110 mm and was not reached.');
    } else if (op === 'crosscut') {
      out.push('Each end was cut perpendicular to face A and edge A near that end: the first just enough to clean up, the second 520 mm away.');
      if (s.squareEnds) out.push('Both ends are square.');
      else out.push('The local face or edge near an end is not true, so an end is ' + deg(a.ends.square) + '° out of square to it.');
      if (!info.cleaned) out.push('The board was too short to clean up the second end at 520 mm.');
    }
    if (a.thickness.min < TG.thickness - TOL.mm) out.push('Thinnest point: ' + mm(a.thickness.min) + ' mm, below the 19 mm goal. No later cut can put that material back.');
    if (a.width.min < TG.width - TOL.mm) out.push('Narrowest point: ' + mm(a.width.min) + ' mm, below the 110 mm goal.');
    return out.join(' ');
  }

  // ---------- Static figures (also used live in the comparison) ----------
  var VIEW = { cup: 'end', twist: 'ends', bow: 'side', crook: 'plan' };
  function thumb(board, kind, forced) {
    var q = frameNodes(board), view = forced || VIEW[kind], polys = [], i, j, ex = 1, note = '';
    if (view === 'end' || view === 'ends') {
      (view === 'ends' ? [NX - 1, 0] : [(NX - 1) / 2]).forEach(function (ii, n) {
        var poly = []; for (j = 0; j < NY; j++) poly.push(q(ii, j, 0)); for (j = NY - 1; j >= 0; j--) poly.push(q(ii, j, 1));
        polys.push({ cls: view === 'ends' && n === 0 ? 'ls-wood is-far' : 'ls-wood', p: poly.map(function (p) { return [p[1], p[2]]; }) });
      });
      note = view === 'ends' ? 'both ends, sighted along' : 'end view';
    } else if (view === 'side') {
      var poly = [], jm = (NY - 1) / 2; for (i = 0; i < NX; i++) poly.push(q(i, jm, 0)); for (i = NX - 1; i >= 0; i--) poly.push(q(i, jm, 1));
      ex = 3; polys.push({ cls: 'ls-wood', p: poly.map(function (p) { return [p[0], p[2] * ex]; }) }); note = 'side · heights ×3';
    } else {
      var pl = []; for (i = 0; i < NX; i++) { var a = q(i, 0, 0), b = q(i, 0, 1); pl.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); }
      for (i = NX - 1; i >= 0; i--) { var c = q(i, NY - 1, 0), d = q(i, NY - 1, 1); pl.push([(c[0] + d[0]) / 2, (c[1] + d[1]) / 2]); }
      ex = 1; polys.push({ cls: 'ls-wood', p: pl.map(function (p) { return [p[0], -p[1] * ex]; }) }); note = 'from above';
    }
    return { polys: polys, note: note };
  }
  // One row per stage, all at a common scale, so material loss between stages is visible.
  function strip(boards, kind, labels, caption) {
    var frames = boards.map(function (bd) { return thumb(bd, kind); }), view = VIEW[kind];
    var lab = 112, W = 640, fw = W - lab, rowH = view === 'plan' ? 84 : view === 'side' ? 60 : 70, spanX = 0, spanY = 0;
    frames.forEach(function (f) { var xs = [], ys = []; f.polys.forEach(function (p) { p.p.forEach(function (v) { xs.push(v[0]); ys.push(v[1]); }); }); spanX = Math.max(spanX, Math.max.apply(null, xs) - Math.min.apply(null, xs)); spanY = Math.max(spanY, Math.max.apply(null, ys) - Math.min.apply(null, ys)); });
    var sc = Math.min((fw - 16) / spanX, (rowH - 22) / spanY), H = frames.length * rowH + 4;
    var out = '<svg class="ls-strip" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(caption) + '"><title>' + esc(caption) + '</title>';
    frames.forEach(function (f, n) {
      var xs = [], ys = []; f.polys.forEach(function (p) { p.p.forEach(function (v) { xs.push(v[0]); ys.push(v[1]); }); });
      var cx = (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2, cy = (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2, oy = n * rowH + 2;
      out += '<rect class="ls-frame" x="0" y="' + oy + '" width="' + W + '" height="' + (rowH - 2) + '"/>';
      out += '<text class="ls-stage-label" x="8" y="' + (oy + rowH / 2) + '">' + (n ? n + '. ' : '') + esc(labels[n]) + '</text>';
      f.polys.forEach(function (p) { out += '<polygon class="' + p.cls + '" points="' + pts(p.p.map(function (v) { return [lab + fw / 2 + (v[0] - cx) * sc, oy + (rowH - 14) / 2 - (v[1] - cy) * sc]; })) + '"/>'; });
      out += '<text class="ls-note" x="' + (W - 6) + '" y="' + (oy + rowH - 7) + '" text-anchor="end">' + esc(f.note) + '</text>';
    });
    return out + '</svg>';
  }
  // Three orthographic views of one board (used when 3D is unavailable).
  function views(board) {
    var frames = ['ends', 'side', 'plan'].map(function (v) { return thumb(board, board.kind, v); });
    var w = 200, h = 110, gap = 10, out = '<svg class="ls-strip" viewBox="0 0 ' + (3 * w + 2 * gap) + ' ' + h + '" role="img" aria-label="Current board: both ends sighted along the length, side view with heights three times larger, and view from above."><title>Current board in three views</title>';
    frames.forEach(function (f, n) {
      var xs = [], ys = []; f.polys.forEach(function (p) { p.p.forEach(function (v) { xs.push(v[0]); ys.push(v[1]); }); });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var sc = Math.min((w - 16) / (x1 - x0 || 1), (h - 30) / (y1 - y0 || 1)), ox = n * (w + gap);
      out += '<rect class="ls-frame" x="' + ox + '" y="0" width="' + w + '" height="' + h + '"/>';
      f.polys.forEach(function (p) { out += '<polygon class="' + p.cls + '" points="' + pts(p.p.map(function (v) { return [ox + w / 2 + (v[0] - (x0 + x1) / 2) * sc, (h - 14) / 2 - (v[1] - (y0 + y1) / 2) * sc]; })) + '"/>'; });
      out += '<text class="ls-note" x="' + (ox + 4) + '" y="' + (h - 4) + '">' + esc(f.note) + '</text>';
    });
    return out + '</svg>';
  }
  var SHORT = { 'joint-face': 'Joint face', 'joint-edge': 'Joint edge', plane: 'Plane', rip: 'Rip', crosscut: 'Crosscut' };
  function sequenceFigure(kind, sequence, options) {
    var steps = M.run(kind, sequence, options);
    var labels = steps.map(function (s) { return s.op ? SHORT[s.op] : 'Rough'; });
    var last = steps[steps.length - 1].metrics;
    var caption = M.BOARDS[kind].label + ' board, ' + labels.slice(1).join(', ') + '. Final: face A ' + mm(last.faceA.flatness) + ' mm out of flat, thickness ' + range(last.thickness) + ' mm, edge A ' + deg(last.nearEdge.square) + '° off square.';
    return { svg: strip(steps.map(function (s) { return s.board; }), kind, labels, caption), steps: steps, caption: caption };
  }
  function comparisonTable(kind, options) {
    var ref = M.run(kind, M.REFERENCE_ORDER, options), pf = M.run(kind, M.PLANER_FIRST, options);
    function cells(st) { var m = st.metrics; return '<td>' + mm(m.faceA.flatness) + '</td><td>' + mm(m.faceB.flatness) + '</td><td>' + range(m.thickness) + '</td><td>' + deg(m.nearEdge.square) + '°</td>'; }
    function rows(list, name) { return list.map(function (st, n) { return '<tr>' + (n === 0 ? '<th scope="rowgroup" rowspan="' + list.length + '">' + esc(name) + '</th>' : '') + '<td>' + esc(st.op ? M.OP_LABELS[st.op] : 'Rough board') + '</td>' + cells(st) + '</tr>'; }).join(''); }
    return '<table class="ls-compare"><caption>' + esc(M.BOARDS[kind].label) + ' board: what each step leaves (model mm). Planer: ' + (options && options.planer === 'rigid' ? 'rigid board or flat sled' : 'flexible board pressed flat by the rollers') + '.</caption><thead><tr><th scope="col">Order</th><th scope="col">After</th><th scope="col">Face A out of flat</th><th scope="col">Face B out of flat</th><th scope="col">Thickness</th><th scope="col">Edge A off square</th></tr></thead><tbody>' +
      rows(pf, 'Planer first') + rows(ref, 'Reference order') + '</tbody></table>';
  }

  function staticLesson() {
    var kinds = ['cup', 'bow', 'twist', 'crook'];
    var cup = M.run('cup', M.REFERENCE_ORDER), cupPf = M.run('cup', ['plane']), cupPfAll = M.run('cup', M.PLANER_FIRST);
    var rough = cup[0].metrics, afterPlane = cupPf[1].metrics, pfFinal = cupPfAll[cupPfAll.length - 1].metrics;
    var twistEdgeFirst = M.run('twist', ['joint-edge', 'joint-face']);
    var tef = twistEdgeFirst[2].metrics;
    var html = '<p><strong>Square a warped board.</strong> With JavaScript, this card is an interactive board you can machine one operation at a time: pick a cup, bow, twist or crook, predict what the jointer, planer or table saw will do, and check the result with a straightedge, winding sticks and a square. The figures below come from the same model.</p>';
    html += '<h3>The reference order on four warped boards</h3><p>Each strip starts with a rough board (warp exaggerated to be visible) and applies face-joint, edge-joint, plane, rip and crosscut. Every later step uses a surface an earlier step made true.</p>';
    kinds.forEach(function (k) { var f = sequenceFigure(k, M.REFERENCE_ORDER); html += '<figure class="ls-static-fig">' + f.svg + '<figcaption>' + esc(f.caption) + '</figcaption></figure>'; });
    html += '<h3>Planer first: thickness becomes even, the cup stays</h3>';
    var pfFig = sequenceFigure('cup', M.PLANER_FIRST);
    html += '<figure class="ls-static-fig">' + pfFig.svg + '<figcaption>' + esc(pfFig.caption) + '</figcaption></figure>';
    html += '<p><strong>Worked example (cupped board).</strong> The rough board’s face A is ' + mm(rough.faceA.flatness) + ' mm out of flat. In the flexible-board example the planer presses it flat, cuts the top parallel to the pressed underside, and releases it: thickness becomes ' + range(afterPlane.thickness) + ' mm, but face A is still ' + mm(afterPlane.faceA.flatness) + ' mm out of flat and face B now copies the cup (' + mm(afterPlane.faceB.flatness) + ' mm). Flattening face A afterwards leaves the board ' + range(pfFinal.thickness) + ' mm thick, short of 19 mm. In the reference order the same board finishes at 19.0 × 110.0 × 520.0 mm with every check at zero within the model’s tolerance.</p>';
    html += comparisonTable('cup');
    html += '<p><strong>Edge before face.</strong> On the twisted board, jointing edge A first and face A second leaves edge A ' + deg(tef.nearEdge.square) + '° out of square: where the twisted face touched the fence, its local angle set the edge angle. Flatten the face first, then use it against the fence.</p>';
    html += '<h3>What the model assumes</h3><ul>' +
      '<li>Geometry only, in millimetres. The board is a grid of points on its faces, edges and ends. Every cut is a plane or a surface built from straight lines, and a point outside the cut slides inward along the board until it reaches the cut, so no step can add material.</li>' +
      '<li>Jointer face: an ideal long, flat table. The board rests on its lowest points; the cut stays parallel to that resting plane and passes continue until the deepest hollow is reached. The pass count shown is an illustrative step, not a depth-of-cut recommendation.</li>' +
      '<li>Jointer edge and table-saw rip: the edge rests on its outermost points along a long table or fence, so the cut is straight along the length. The face touching the fence or table beside the cutter sets the edge angle, so a flat face gives a square edge and a twisted face does not.</li>' +
      '<li>Planer, flexible-board example: feed-roller pressure is assumed to bend the board until its overall curve lies on the bed; the top is cut parallel to that pressed underside and the warp returns on release. A stiffer board, or one shimmed on a flat sled, can instead keep its resting attitude; switch the planer to the rigid case to compare. Neither case is a rule for every board or planer.</li>' +
      '<li>Crosscut: each end is cut perpendicular to face A and edge A near that end, first end just to clean up, second end at the finished length.</li>' +
      '<li>Warp amounts (cup 6 mm, bow 14 mm, twist 12 mm, crook 16 mm on a 640 × 150 × 36 mm blank) are deliberately large illustrative values, not measured boards. Machine setup, feed, guards, snipe, tearout, kickback and moisture movement are outside this model.</li></ul>';
    return html;
  }

  return Object.freeze({ views: views, checks: checks, readouts: readouts, explain: explain, sequenceFigure: sequenceFigure, comparisonTable: comparisonTable, staticLesson: staticLesson, mm: mm, deg: deg, range: range, esc: esc });
});

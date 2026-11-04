(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiLumberSquaring = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /*
   * Idealised reference-surface geometry for squaring one rough board.
   * Units: millimetres and degrees. Frame: x along the length, y across the
   * width (edge A is the near edge, y about 0), z through the thickness
   * (face A is the underside, the face that sits on a machine table).
   *
   * The board is a structured solid: NX stations along the length, NY across
   * the width and two layers (face A, face B). Every operation is a cut by a
   * plane or a ruled surface. A node outside the cut slides along its own
   * material line (a column through the thickness, or a row across the width
   * or along the length) until it reaches the cut. Nodes only ever move into
   * the material, so no operation can add material.
   */
  var NX = 49, NY = 13;
  var ROUGH = Object.freeze({ length: 640, width: 150, thickness: 36 });
  var TARGET = Object.freeze({ thickness: 19, width: 110, length: 520 });
  var TOL = Object.freeze({ mm: 0.05, deg: 0.1 });
  var OPS = Object.freeze(['joint-face', 'joint-edge', 'plane', 'rip', 'crosscut']);
  var OP_LABELS = Object.freeze({
    'joint-face': 'Jointer: flatten face A',
    'joint-edge': 'Jointer: straighten edge A against the fence',
    'plane': 'Planer: face A on the bed, plane to 19 mm',
    'rip': 'Table saw: rip to 110 mm, edge A on the fence',
    'crosscut': 'Crosscut: square both ends to 520 mm'
  });
  var REFERENCE_ORDER = Object.freeze(['joint-face', 'joint-edge', 'plane', 'rip', 'crosscut']);
  var PLANER_FIRST = Object.freeze(['plane', 'joint-face', 'joint-edge', 'plane', 'rip', 'crosscut']);
  // Deliberately large illustrative warp so it can be seen; not measured data.
  var BOARDS = Object.freeze({
    cup: Object.freeze({ id: 'cup', label: 'Cup', amount: 6, view: 'end',
      description: 'Curved across the width. The hollow face is down, so it rests on its two long edges; the middle is 6 mm higher than the edges.' }),
    bow: Object.freeze({ id: 'bow', label: 'Bow', amount: 14, view: 'side',
      description: 'Curved along the length, out of the face. The hollow face is down, so it rests on its ends; the middle is 14 mm high.' }),
    twist: Object.freeze({ id: 'twist', label: 'Twist', amount: 12, view: 'end',
      description: 'The four corners are not in one plane. With three corners on a flat table, the fourth is 12 mm up.' }),
    crook: Object.freeze({ id: 'crook', label: 'Crook', amount: 16, view: 'top',
      description: 'Curved along the length within the face, so the edges wander sideways. Edge A is 16 mm hollow at the middle.' })
  });

  function fail(message) { throw new RangeError(message); }
  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function idx(i, j, k) { return ((k * NY + j) * NX + i) * 3; }
  function get(P, i, j, k) { var n = idx(i, j, k); return [P[n], P[n + 1], P[n + 2]]; }
  function put(P, i, j, k, p) { var n = idx(i, j, k); P[n] = p[0]; P[n + 1] = p[1]; P[n + 2] = p[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; }
  function lerp(a, b, t) { return add(a, mul(sub(b, a), t)); }

  // Least squares by normal equations with column scaling; tiny ridge for degenerate data.
  function lsq(rows, values) {
    var m = rows[0].length, A = [], b = [], s = [], i, j, r, c;
    for (j = 0; j < m; j++) { s[j] = 0; for (r = 0; r < rows.length; r++) s[j] = Math.max(s[j], Math.abs(rows[r][j])); s[j] = s[j] || 1; }
    for (i = 0; i < m; i++) { A[i] = []; b[i] = 0; for (j = 0; j < m; j++) A[i][j] = 0; }
    for (r = 0; r < rows.length; r++) for (i = 0; i < m; i++) {
      var ri = rows[r][i] / s[i]; b[i] += ri * values[r];
      for (j = 0; j < m; j++) A[i][j] += ri * rows[r][j] / s[j];
    }
    for (i = 0; i < m; i++) A[i][i] += 1e-12 * (1 + A[i][i]);
    for (c = 0; c < m; c++) {
      var p = c; for (r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      var t = A[c]; A[c] = A[p]; A[p] = t; var tb = b[c]; b[c] = b[p]; b[p] = tb;
      for (r = c + 1; r < m; r++) { var f = A[r][c] / A[c][c]; for (j = c; j < m; j++) A[r][j] -= f * A[c][j]; b[r] -= f * b[c]; }
    }
    var x = new Array(m);
    for (i = m - 1; i >= 0; i--) { var v = b[i]; for (j = i + 1; j < m; j++) v -= A[i][j] * x[j]; x[i] = v / A[i][i]; }
    return x.map(function (v, k) { return v / s[k]; });
  }

  function create(kind) {
    var spec = BOARDS[kind];
    if (!spec) fail('Choose cup, bow, twist or crook');
    var L = ROUGH.length, W = ROUGH.width, T = ROUGH.thickness;
    var P = new Float64Array(NX * NY * 2 * 3);
    for (var k = 0; k < 2; k++) for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
      var u = i / (NX - 1), v = j / (NY - 1), zn = k ? T : 0;
      var yn = v * W;
      var xs = 4 + 0.025 * (yn - W / 2) - 0.03 * (zn - T / 2), xe = L - 3 + 0.035 * (yn - W / 2) + 0.025 * (zn - T / 2);
      var x = xs + (xe - xs) * u;
      // Rough-sawn edges: gentle waviness plus a slight bevel (illustrative).
      var en = 0.5 * Math.sin(2 * Math.PI * x / 230 + 0.7) + 0.3 * Math.sin(2 * Math.PI * x / 160 + 1.1) + (k ? 0.3 : -0.2);
      var ef = 0.45 * Math.sin(2 * Math.PI * x / 210 + 2.1) + 0.25 * Math.sin(2 * Math.PI * x / 150) + (k ? -0.25 : 0.35);
      var y = yn + (1 - v) * en + v * ef;
      // Faces carry only the declared warp; rough-sawn texture is shown by colour, not geometry,
      // so a thickness check is not confused by saw marks.
      var z = zn;
      var xi = (x - L / 2) / (L / 2), eta = (y - W / 2) / (W / 2);
      if (kind === 'cup') z += spec.amount * (1 - eta * eta);
      if (kind === 'bow') z += spec.amount * (1 - xi * xi);
      if (kind === 'twist') z += spec.amount / 4 * xi * eta;
      if (kind === 'crook') y += spec.amount * (1 - xi * xi);
      put(P, i, j, k, [x, y, z]);
    }
    return freezeBoard({ kind: kind, nodes: P, machined: emptyFlags(), history: [] });
  }

  function emptyFlags() {
    return { A: new Uint8Array(NX * NY), B: new Uint8Array(NX * NY), N: new Uint8Array(NX * 2), F: new Uint8Array(NX * 2), S: new Uint8Array(NY * 2), E: new Uint8Array(NY * 2) };
  }
  function copyFlags(f) { var o = {}; Object.keys(f).forEach(function (k) { o[k] = new Uint8Array(f[k]); }); return o; }
  function freezeBoard(b) { return Object.freeze(b); }
  function clone(board) { return { kind: board.kind, nodes: new Float64Array(board.nodes), machined: copyFlags(board.machined), history: board.history.slice() }; }
  function check(board) {
    if (!board || !(board.nodes instanceof Float64Array) || board.nodes.length !== NX * NY * 6) fail('Not a board from this model');
    for (var n = 0; n < board.nodes.length; n++) if (!finite(board.nodes[n])) fail('Board geometry is not finite');
  }

  // Frame whose z axis is the normal of face A's best-fit plane.
  function faceFrame(P) {
    var rows = [], vals = [];
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) { var p = get(P, i, j, 0); rows.push([1, p[0], p[1]]); vals.push(p[2]); }
    var c = lsq(rows, vals);
    var ez = norm([-c[1], -c[2], 1]), ex = norm([1, 0, c[1]]);
    ex = norm(sub(ex, mul(ez, dot(ex, ez)))); var ey = cross(ez, ex);
    var o = [ROUGH.length / 2, ROUGH.width / 2, c[0] + c[1] * ROUGH.length / 2 + c[2] * ROUGH.width / 2];
    return { o: o, ex: ex, ey: ey, ez: ez, to: function (p) { var d = sub(p, o); return [dot(d, ex), dot(d, ey), dot(d, ez)]; } };
  }

  // Slide every node outside keep(p) >= 0 along its material line.
  var EPS = 1e-9;
  function clipColumns(B, face, keep) {
    var P = B.nodes, kOut = face === 'A' ? 0 : 1, kIn = 1 - kOut, through = false, moved = 0;
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
      var po = get(P, i, j, kOut), pi = get(P, i, j, kIn), fo = keep(po);
      if (fo >= -EPS) { if (Math.abs(fo) < 1e-6) B.machined[face][j * NX + i] = 1; continue; }
      var fi = keep(pi), q;
      if (fi <= 0) { q = pi; through = true; }
      else {
        // Secant refinement keeps the crossing exact for curved (flexible planer) cut surfaces.
        var lo = 0, hi = 1, flo = fo, fhi = fi, t = fo / (fo - fi);
        for (var it = 0; it < 30; it++) {
          var ft = keep(lerp(po, pi, t)); if (Math.abs(ft) < 1e-10) break;
          if (ft < 0) { lo = t; flo = ft; } else { hi = t; fhi = ft; }
          t = lo + (hi - lo) * flo / (flo - fhi);
        }
        q = lerp(po, pi, t);
      }
      put(P, i, j, kOut, q); B.machined[face][j * NX + i] = 1; moved++;
    }
    return { through: through, moved: moved };
  }
  // Redistribute nodes 0..e evenly between the cut (index s0) and node e; nodes beyond e stay put.
  function resampleLine(pts, flags, s0, e) {
    var n = pts.length, out = pts.slice(), fl = flags ? flags.slice() : pts.map(function () { return 0; });
    for (var t = 0; t <= e; t++) {
      var s = s0 + (e - s0) * t / e, a = Math.min(n - 2, Math.floor(s)), f = s - a;
      out[t] = lerp(pts[a], pts[a + 1], f);
      fl[t] = flags ? (f < 1e-9 ? flags[a] : f > 1 - 1e-9 ? flags[a + 1] : (flags[a] && flags[a + 1])) : 0;
    }
    return { pts: out, flags: fl };
  }
  // Generic line clip: line(t) gives [i,j,k] for t = 0..n-1 measured from the cut side.
  function clipLines(B, count, n, line, keep, faceFlagsFor, sideFlag) {
    var P = B.nodes, through = false, moved = 0;
    for (var l = 0; l < count; l++) {
      var ids = [], pts = [], f = [];
      for (var t = 0; t < n; t++) { var id = line(l, t); ids.push(id); var p = get(P, id[0], id[1], id[2]); pts.push(p); f.push(keep(p)); }
      if (f[0] >= -EPS) { if (Math.abs(f[0]) < 1e-6) sideFlag(l, 1); continue; }
      var m = 1; while (m < n && f[m] < 0) m++;
      var s0, e;
      if (m >= n) { through = true; s0 = n - 1 - 1e-9; e = n - 1; } else { s0 = (m - 1) + f[m - 1] / (f[m - 1] - f[m]); e = Math.min(n - 1, 2 * m + 2); }
      var faceFlags = faceFlagsFor(l, ids), r = resampleLine(pts, faceFlags.values, s0, e);
      for (t = 0; t < n; t++) put(P, ids[t][0], ids[t][1], ids[t][2], r.pts[t]);
      faceFlags.write(r.flags);
      sideFlag(l, 1); moved++;
    }
    return { through: through, moved: moved };
  }
  function faceFlagAccess(B, ids) {
    var arr = ids[0][2] === 0 ? B.machined.A : B.machined.B;
    return { values: ids.map(function (q) { return arr[q[1] * NX + q[0]]; }), write: function (vals) { ids.forEach(function (q, t) { arr[q[1] * NX + q[0]] = vals[t]; }); } };
  }
  function clipEdge(B, side, keep) {
    var near = side === 'N';
    return clipLines(B, NX * 2, NY, function (l, t) { var i = l % NX, k = (l / NX) | 0; return [i, near ? t : NY - 1 - t, k]; }, keep,
      function (l, ids) { return faceFlagAccess(B, ids); },
      function (l, v) { B.machined[side][l] = v; });
  }
  function clipEnd(B, side, keep) {
    var start = side === 'S';
    return clipLines(B, NY * 2, NX, function (l, t) { var j = l % NY, k = (l / NY) | 0; return [start ? t : NX - 1 - t, j, k]; }, keep,
      function (l, ids) {
        var fa = faceFlagAccess(B, ids), k = ids[0][2], j = ids[0][1];
        if (j !== 0 && j !== NY - 1) return fa;
        // A row along an edge also carries that edge's flags.
        var ea = j === 0 ? B.machined.N : B.machined.F;
        return { values: fa.values.map(function (v, t) { return v && ea[k * NX + ids[t][0]]; }), write: function (vals) { fa.write(vals); ids.forEach(function (q, t) { ea[k * NX + q[0]] = vals[t] ? 1 : ea[k * NX + q[0]]; }); } };
      },
      function (l, v) { B.machined[side][l] = v; });
  }

  // Cross-section of face A at each station in the face frame: z' = a + s y'.
  function stationFaceLines(P, F) {
    var out = [];
    for (var i = 0; i < NX; i++) {
      var rows = [], vals = [];
      for (var j = 0; j < NY; j++) { var q = F.to(get(P, i, j, 0)); rows.push([1, q[1]]); vals.push(q[2]); }
      var c = lsq(rows, vals); out.push({ a: c[0], s: c[1] });
    }
    return out;
  }
  // Lateral coordinate measured perpendicular to the local face line (cross-section corrected).
  function lateral(q, line) { return (q[1] + line.s * (q[2] - line.a)) / (1 + line.s * line.s); }
  function edgeNodes(P, F, lines, side) {
    var j = side === 'N' ? 0 : NY - 1, out = [];
    for (var k = 0; k < 2; k++) for (var i = 0; i < NX; i++) { var q = F.to(get(P, i, j, k)); out.push({ i: i, k: k, x: q[0], h: lateral(q, lines[i]) }); }
    return out;
  }
  function fitLine(points) { var c = lsq(points.map(function (p) { return [1, p.x]; }), points.map(function (p) { return p.h; })); return { a: c[0], b: c[1] }; }

  function jointFace(board) {
    var B = clone(board), P = B.nodes, rows = [], vals = [], d = [], i, j;
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) { var p = get(P, i, j, 0); rows.push([1, p[0], p[1]]); vals.push(p[2]); }
    var c = lsq(rows, vals);
    for (var n = 0; n < vals.length; n++) d.push(vals[n] - c[0] - c[1] * rows[n][1] - c[2] * rows[n][2]);
    var rest = Math.min.apply(null, d), deep = Math.max.apply(null, d), depth = deep - rest;
    var passes = depth < 1.5 ? 1 : depth < 6 ? 3 : 5, stages = [], through = false;
    // Each illustrative pass is the original board clipped at that pass's depth (nested cuts).
    for (var s = 1; s <= passes; s++) {
      var off = c[0] + rest + depth * s / passes;
      B = clone(board);
      var r = clipColumns(B, 'A', function (q) { return q[2] - off - c[1] * q[0] - c[2] * q[1]; });
      through = through || r.through; stages.push(snapshot(B));
    }
    var nrm = norm([-c[1], -c[2], 1]);
    return finish(B, 'joint-face', stages, { passes: passes, depth: depth, through: through,
      plane: { point: [ROUGH.length / 2, ROUGH.width / 2, c[0] + rest + depth + c[1] * ROUGH.length / 2 + c[2] * ROUGH.width / 2], normal: nrm } });
  }

  function jointEdge(board) {
    var B = clone(board), P = B.nodes, F = faceFrame(P), lines = withStations(P, F);
    var pts = edgeNodes(P, F, lines, 'N'), line = fitLine(pts);
    var d = pts.map(function (p) { return p.h - line.a - line.b * p.x; });
    var rest = Math.min.apply(null, d), deep = Math.max.apply(null, d), depth = deep - rest;
    var passes = depth < 1.5 ? 1 : depth < 6 ? 3 : 5, stages = [], through = false;
    var twistContact = maxSlopeSpread(lines);
    for (var s = 1; s <= passes; s++) {
      var off = line.a + rest + depth * s / passes;
      B = clone(board);
      var r = clipEdge(B, 'N', stationKeep(F, lines, function (x) { return off + line.b * x; }, 1));
      through = through || r.through; stages.push(snapshot(B));
    }
    return finish(B, 'joint-edge', stages, { passes: passes, depth: depth, through: through, faceSlopeSpreadDeg: twistContact });
  }
  function maxSlopeSpread(lines) { var s = lines.map(function (l) { return Math.atan(l.s) * 180 / Math.PI; }); return Math.max.apply(null, s) - Math.min.apply(null, s); }
  // Keep-function for a cut surface perpendicular to the local face line at each station.
  // sign 1 keeps material beyond Y(x) (edge A side cut); sign -1 keeps material before Y(x).
  function stationKeep(F, lines, Y, sign) {
    return function (p) {
      var q = F.to(p), i = Math.max(0, Math.min(NX - 1, Math.round(stationOf(q[0], F, lines)))), l = lines[i];
      return sign * (lateral(q, l) - Y(q[0]));
    };
  }
  // Stations are material rows; locate the nearest by frame x of face A row nodes (precomputed lookup).
  function stationOf(x, F, lines) {
    var xs = lines.xs; if (!xs) return 0;
    if (x <= xs[0]) return 0; if (x >= xs[NX - 1]) return NX - 1;
    var lo = 0, hi = NX - 1; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    return lo + (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  }
  function withStations(P, F) {
    var lines = stationFaceLines(P, F), xs = [];
    for (var i = 0; i < NX; i++) { var sum = 0; for (var j = 0; j < NY; j++) sum += F.to(get(P, i, j, 0))[0]; xs.push(sum / NY); }
    for (i = 1; i < NX; i++) if (xs[i] <= xs[i - 1]) xs[i] = xs[i - 1] + 1e-6;
    lines.xs = xs; return lines;
  }

  function plane(board, options) {
    var mode = (options && options.planer) || 'flexible';
    if (mode !== 'flexible' && mode !== 'rigid') fail('Planer support must be flexible or rigid');
    var B = clone(board), P = B.nodes, F = faceFrame(P), bottom = [], i, j;
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) bottom.push(F.to(get(P, i, j, 0)));
    var support;
    if (mode === 'flexible') {
      // Declared flexible-board idealisation: feed-roller pressure bends the board until the
      // smooth (quadratic) part of face A lies on the bed; local roughness stays.
      var sx = ROUGH.length / 2, sy = ROUGH.width / 2;
      var basis = function (x, y) { var u = x / sx, v = y / sy; return [1, u, v, u * u, v * v, u * v]; };
      var cq = lsq(bottom.map(function (q) { return basis(q[0], q[1]); }), bottom.map(function (q) { return q[2]; }));
      support = function (x, y) { var b = basis(x, y), s = 0; for (var n = 0; n < 6; n++) s += b[n] * cq[n]; return s; };
    } else support = function () { return 0; };
    var bed = Infinity; bottom.forEach(function (q) { bed = Math.min(bed, q[2] - support(q[0], q[1])); });
    var level = bed + TARGET.thickness;
    var keep = function (p) { var q = F.to(p); return level - (q[2] - support(q[0], q[1])); };
    var pressed0 = pressedSnapshot(B, F, support, bed);
    var r = clipColumns(B, 'B', keep);
    var pressed1 = pressedSnapshot(B, F, support, bed);
    var cleaned = true; for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) if (Math.abs(keep(get(B.nodes, i, j, 1))) > 1e-6) cleaned = false;
    return finish(B, 'plane', [], { mode: mode, through: r.through, cleaned: cleaned, pressed: mode === 'flexible' ? [pressed0, pressed1] : null,
      plane: { point: add(F.o, add(mul(F.ez, level), [0, 0, 0])), normal: F.ez } });
  }
  // Display-only state: each column shifted along the face normal by the support shape (shear, volume preserving).
  function pressedSnapshot(B, F, support, bed) {
    var out = new Float64Array(B.nodes);
    for (var n = 0; n < out.length; n += 3) {
      var p = [out[n], out[n + 1], out[n + 2]], q = F.to(p), sh = support(q[0], q[1]);
      out[n] -= F.ez[0] * sh; out[n + 1] -= F.ez[1] * sh; out[n + 2] -= F.ez[2] * sh;
    }
    return Object.freeze({ kind: B.kind, nodes: out, machined: copyFlags(B.machined), history: B.history.slice() });
  }

  function rip(board) {
    var B = clone(board), P = B.nodes, F = faceFrame(P), lines = withStations(P, F);
    var pts = edgeNodes(P, F, lines, 'N'), line = fitLine(pts);
    var rest = Math.min.apply(null, pts.map(function (p) { return p.h - line.a - line.b * p.x; }));
    var cosb = 1 / Math.sqrt(1 + line.b * line.b);
    var r = clipEdge(B, 'F', stationKeep(F, lines, function (x) { return line.a + rest + line.b * x + TARGET.width / cosb; }, -1));
    var cleaned = Array.prototype.every.call(B.machined.F, function (v) { return v === 1; });
    return finish(B, 'rip', [], { through: r.through, cleaned: cleaned, fenceSlope: line.b });
  }

  function crosscut(board) {
    var B = clone(board), P = B.nodes, F = faceFrame(P), lines = withStations(P, F);
    var pts = edgeNodes(P, F, lines, 'N'), line = fitLine(pts), d = norm([1, line.b, 0]);
    function localNormal(fromStart) {
      var rows = [], vals = [], lim = Math.round((NX - 1) * 0.15);
      for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) if (fromStart ? i <= lim : i >= NX - 1 - lim) { var q = F.to(get(P, i, j, 0)); rows.push([1, q[0], q[1]]); vals.push(q[2]); }
      var c = lsq(rows, vals), m = norm([-c[1], -c[2], 1]);
      return norm(sub(d, mul(m, dot(d, m))));
    }
    var ds = localNormal(true), de = localNormal(false), cs = -Infinity, j, k;
    for (k = 0; k < 2; k++) for (j = 0; j < NY; j++) cs = Math.max(cs, dot(F.to(get(P, 0, j, k)), ds));
    var ce = cs + TARGET.length;
    var r1 = clipEnd(B, 'S', function (p) { return dot(F.to(p), ds) - cs; });
    var r2 = clipEnd(B, 'E', function (p) { return ce - dot(F.to(p), de); });
    var cleaned = Array.prototype.every.call(B.machined.S, function (v) { return v === 1; }) && Array.prototype.every.call(B.machined.E, function (v) { return v === 1; });
    return finish(B, 'crosscut', [], { through: r1.through || r2.through, cleaned: cleaned });
  }

  function snapshot(B) { return Object.freeze({ kind: B.kind, nodes: new Float64Array(B.nodes), machined: copyFlags(B.machined), history: B.history.slice() }); }
  function finish(B, op, stages, info) {
    B.history = B.history.concat([op]);
    var board = freezeBoard(B);
    if (!stages.length || stages[stages.length - 1].nodes.some(function (v, n) { return v !== board.nodes[n]; })) stages = stages.concat([board]);
    else stages[stages.length - 1] = board;
    return Object.freeze({ board: board, stages: Object.freeze(stages), info: Object.freeze(info) });
  }

  function apply(board, op, options) {
    check(board);
    if (OPS.indexOf(op) < 0) fail('Unknown operation');
    if (op === 'joint-face') return jointFace(board);
    if (op === 'joint-edge') return jointEdge(board);
    if (op === 'plane') return plane(board, options);
    if (op === 'rip') return rip(board);
    return crosscut(board);
  }

  // ---------- Measurement (geometry only; history is never consulted) ----------
  function triangles(P, visit) {
    function q(i, j, k) { return get(P, i, j, k); }
    function quad(a, b, c, d) { visit(a, b, c); visit(a, c, d); }
    var i, j;
    for (j = 0; j < NY - 1; j++) for (i = 0; i < NX - 1; i++) {
      quad(q(i, j, 1), q(i + 1, j, 1), q(i + 1, j + 1, 1), q(i, j + 1, 1));
      quad(q(i, j, 0), q(i, j + 1, 0), q(i + 1, j + 1, 0), q(i + 1, j, 0));
    }
    for (i = 0; i < NX - 1; i++) {
      quad(q(i, 0, 0), q(i + 1, 0, 0), q(i + 1, 0, 1), q(i, 0, 1));
      quad(q(i, NY - 1, 0), q(i, NY - 1, 1), q(i + 1, NY - 1, 1), q(i + 1, NY - 1, 0));
    }
    for (j = 0; j < NY - 1; j++) {
      quad(q(0, j, 0), q(0, j, 1), q(0, j + 1, 1), q(0, j + 1, 0));
      quad(q(NX - 1, j, 0), q(NX - 1, j + 1, 0), q(NX - 1, j + 1, 1), q(NX - 1, j, 1));
    }
  }
  function volume(board) {
    var v = 0, o = [ROUGH.length / 2, ROUGH.width / 2, ROUGH.thickness / 2];
    triangles(board.nodes, function (a, b, c) { v += dot(sub(a, o), cross(sub(b, o), sub(c, o))) / 6; });
    return v;
  }
  function planeAngle(n1, n2) { return Math.acos(Math.min(1, Math.abs(dot(norm(n1), norm(n2))))) * 180 / Math.PI; }
  function quadForm(points) {
    // z = c0 + c1 u + c2 v + c3 u^2 + c4 v^2 + c5 uv over normalised extents.
    var xs = points.map(function (p) { return p[0]; }), ys = points.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var hx = (x1 - x0) / 2 || 1, hy = (y1 - y0) / 2 || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var c = lsq(points.map(function (p) { var u = (p[0] - cx) / hx, v = (p[1] - cy) / hy; return [1, u, v, u * u, v * v, u * v]; }), points.map(function (p) { return p[2]; }));
    return { bow: Math.abs(c[3]), cup: Math.abs(c[4]), twist: Math.abs(c[5]) * 4 };
  }
  function faceMetrics(P, F, k) {
    var pts = [];
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) pts.push(F.to(get(P, i, j, k)));
    var c = lsq(pts.map(function (q) { return [1, q[0], q[1]]; }), pts.map(function (q) { return q[2]; }));
    var r = pts.map(function (q) { return q[2] - c[0] - c[1] * q[0] - c[2] * q[1]; });
    var qf = quadForm(pts);
    return { flatness: Math.max.apply(null, r) - Math.min.apply(null, r), cup: qf.cup, bow: qf.bow, twist: qf.twist, normal: norm([-c[1], -c[2], 1]) };
  }
  function localPlane(points, axis) {
    // axis 2: z = a + b x + c y ; axis 1: y = a + b x + c z ; axis 0: x = a + b y + c z
    var o = [0, 1, 2].filter(function (n) { return n !== axis; });
    var c = lsq(points.map(function (q) { return [1, q[o[0]], q[o[1]]]; }), points.map(function (q) { return q[axis]; }));
    var n = [0, 0, 0]; n[axis] = 1; n[o[0]] = -c[1]; n[o[1]] = -c[2]; return norm(n);
  }
  function edgeMetrics(P, F, side) {
    var j = side === 'N' ? 0 : NY - 1, mid = [], windows = 6, worst = 0, worstAt = 0, worstFace = null, worstEdge = null;
    for (var i = 0; i < NX; i++) { var a = F.to(get(P, i, j, 0)), b = F.to(get(P, i, j, 1)); mid.push({ x: (a[0] + b[0]) / 2, h: (a[1] + b[1]) / 2 }); }
    var line = fitLine(mid), r = mid.map(function (p) { return p.h - line.a - line.b * p.x; });
    var cq = lsq(mid.map(function (p) { var u = (p.x - mid[0].x) / ((mid[NX - 1].x - mid[0].x) / 2 || 1) - 1; return [1, u, u * u]; }), mid.map(function (p) { return p.h; }));
    for (var w = 0; w < windows; w++) {
      var i0 = Math.round(w * (NX - 1) / windows), i1 = Math.round((w + 1) * (NX - 1) / windows), facePts = [], edgePts = [], thin = false;
      for (i = i0; i <= i1; i++) {
        for (var jj = 0; jj < NY; jj++) if (side === 'N' ? jj <= (NY - 1) / 3 : jj >= 2 * (NY - 1) / 3) facePts.push(F.to(get(P, i, jj, 0)));
        var e0 = F.to(get(P, i, j, 0)), e1 = F.to(get(P, i, j, 1)); edgePts.push(e0, e1);
        if (Math.abs(e1[2] - e0[2]) < 0.5) thin = true;
      }
      if (thin) continue;
      var nf = localPlane(facePts, 2), ne = localPlane(edgePts, 1), err = Math.abs(90 - planeAngle(nf, ne));
      if (err > worst) { worst = err; worstAt = (i0 + i1) / 2; worstFace = nf; worstEdge = ne; }
    }
    return { straightness: Math.max.apply(null, r) - Math.min.apply(null, r), crook: Math.abs(cq[2]), square: worst, worstStation: worstAt, worstFaceNormal: worstFace, worstEdgeNormal: worstEdge, line: line };
  }
  function endMetrics(P, F, side) {
    var i = side === 'S' ? 0 : NX - 1, endPts = [], facePts = [], edgePts = [], lim = Math.round((NX - 1) * 0.15);
    for (var k = 0; k < 2; k++) for (var j = 0; j < NY; j++) endPts.push(F.to(get(P, i, j, k)));
    for (var ii = 0; ii < NX; ii++) if (side === 'S' ? ii <= lim : ii >= NX - 1 - lim) {
      for (j = 0; j < NY; j++) facePts.push(F.to(get(P, ii, j, 0)));
      edgePts.push(F.to(get(P, ii, 0, 0)), F.to(get(P, ii, 0, 1)));
    }
    var ne = localPlane(endPts, 0), nf = localPlane(facePts, 2), nd = localPlane(edgePts, 1);
    return { toFace: Math.abs(90 - planeAngle(ne, nf)), toEdge: Math.abs(90 - planeAngle(ne, nd)) };
  }
  function measure(board) {
    check(board);
    var P = board.nodes, F = faceFrame(P), i, j, k;
    var th = [], wd = [], ln = [];
    // Thickness along face A's normal, from each face-B node down to face A at the same (x', y'):
    // a first-order surface correction keeps slanted columns on curved faces from reading as uneven.
    var low = []; for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) low.push(F.to(get(P, i, j, 0)));
    function L(i2, j2) { return low[j2 * NX + i2]; }
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) {
      var tq = F.to(get(P, i, j, 1)), bq = L(i, j), ia = Math.max(0, i - 1), ib = Math.min(NX - 1, i + 1), ja = Math.max(0, j - 1), jb = Math.min(NY - 1, j + 1);
      var du = sub(L(ib, j), L(ia, j)), dv = sub(L(i, jb), L(i, ja)), det = du[0] * dv[1] - du[1] * dv[0], dz = 0;
      if (Math.abs(det) > 1e-9) { var ex0 = tq[0] - bq[0], ey0 = tq[1] - bq[1], a1 = (ex0 * dv[1] - ey0 * dv[0]) / det, a2 = (du[0] * ey0 - du[1] * ex0) / det; dz = a1 * du[2] + a2 * dv[2]; }
      th.push(tq[2] - (bq[2] + dz));
    }
    var near = edgeMetrics(P, F, 'N'), far = edgeMetrics(P, F, 'F');
    var d = norm([1, near.line.b, 0]), e = [-d[1], d[0], 0];
    for (k = 0; k < 2; k++) {
      var nearPts = []; for (i = 0; i < NX; i++) nearPts.push(F.to(get(P, i, 0, k)));
      for (i = 0; i < NX; i++) {
        var fq = F.to(get(P, i, NY - 1, k)), xa = dot(fq, d), best = null;
        for (var n = 0; n < NX - 1; n++) {
          var a0 = dot(nearPts[n], d), a1 = dot(nearPts[n + 1], d);
          if ((xa - a0) * (xa - a1) <= 0 && a1 !== a0) { var t = (xa - a0) / (a1 - a0); best = dot(lerp(nearPts[n], nearPts[n + 1], t), e); break; }
        }
        if (best !== null) wd.push(dot(fq, e) - best);
      }
      for (j = 0; j < NY; j++) ln.push(dot(sub(F.to(get(P, NX - 1, j, k)), F.to(get(P, 0, j, k))), d));
    }
    function range(a) { return a.length ? { min: Math.min.apply(null, a), max: Math.max.apply(null, a) } : { min: 0, max: 0 }; }
    function all(a) { return Array.prototype.every.call(a, function (v) { return v === 1; }); }
    var fa = faceMetrics(P, F, 0), fb = faceMetrics(P, F, 1), es = endMetrics(P, F, 'S'), ee = endMetrics(P, F, 'E');
    var faceAngle = planeAngle(fa.normal, fb.normal);
    return Object.freeze({
      volume: volume(board),
      thickness: range(th), width: range(wd), length: range(ln),
      faceA: fa, faceB: fb, facesAngle: faceAngle,
      nearEdge: near, farEdge: far,
      ends: { square: Math.max(es.toFace, es.toEdge, ee.toFace, ee.toEdge), start: es, end: ee },
      clean: { A: all(board.machined.A), B: all(board.machined.B), N: all(board.machined.N), F: all(board.machined.F), S: all(board.machined.S), E: all(board.machined.E) }
    });
  }

  function status(m) {
    var t = TOL.mm, a = TOL.deg;
    return Object.freeze({
      flatA: m.clean.A && m.faceA.flatness <= t,
      flatB: m.clean.B && m.faceB.flatness <= t,
      parallelT: m.thickness.max - m.thickness.min <= t,
      straightN: m.clean.N && m.nearEdge.straightness <= t,
      squareN: m.clean.N && m.nearEdge.square <= a,
      straightF: m.clean.F && m.farEdge.straightness <= t,
      squareF: m.clean.F && m.farEdge.square <= a,
      parallelW: m.width.max - m.width.min <= t,
      squareEnds: m.clean.S && m.clean.E && m.ends.square <= a,
      parallelL: m.length.max - m.length.min <= t,
      thickOK: m.thickness.min >= TARGET.thickness - t,
      widthOK: m.width.min >= TARGET.width - t,
      lengthOK: m.length.min >= TARGET.length - t,
      thickAt: Math.abs(m.thickness.max - TARGET.thickness) <= t && Math.abs(m.thickness.min - TARGET.thickness) <= t,
      widthAt: Math.abs(m.width.max - TARGET.width) <= t && Math.abs(m.width.min - TARGET.width) <= t,
      lengthAt: Math.abs(m.length.max - TARGET.length) <= t && Math.abs(m.length.min - TARGET.length) <= t
    });
  }
  function finished(m) {
    var s = status(m);
    return s.flatA && s.flatB && s.parallelT && s.straightN && s.squareN && s.straightF && s.squareF && s.parallelW && s.squareEnds && s.parallelL && s.thickAt && s.widthAt && s.lengthAt;
  }

  // Predictions: each option is a predicate on the measured result. More than one can be true.
  var PREDICTIONS = Object.freeze({
    'joint-face': [
      { id: 'flat', text: 'Face A comes out flat; the warp is cut out of that face.' },
      { id: 'copies', text: 'Face A keeps its warp; the jointer only smooths the surface.' },
      { id: 'short', text: 'Too little thickness is left for the 19 mm target.' }],
    'joint-edge': [
      { id: 'true', text: 'Edge A comes out straight and square to face A.' },
      { id: 'copies', text: 'Edge A comes out straight but out of square, because face A is not flat.' },
      { id: 'short', text: 'Too little width is left for the 110 mm target.' }],
    'plane': [
      { id: 'true', text: 'Both faces come out flat and parallel.' },
      { id: 'copies', text: 'Thickness becomes even, but the warp is still there after the board leaves the planer.' },
      { id: 'short', text: 'The board is too thin to clean up the whole top at 19 mm.' }],
    'rip': [
      { id: 'true', text: 'The new edge is straight and parallel to edge A.' },
      { id: 'copies', text: 'The new edge is straight, but the width varies because edge A is not straight.' },
      { id: 'short', text: 'Too little width is left to clean up the whole edge at 110 mm.' }],
    'crosscut': [
      { id: 'true', text: 'Both ends come out square to the face and edge, at 520 mm.' },
      { id: 'copies', text: 'The ends are cut, but they are not square to the board because a reference is not true.' },
      { id: 'short', text: 'The board is too short to clean up both ends at 520 mm.' }]
  });
  // Prediction outcomes are geometric: a face or edge that is flat, straight or square counts as such
  // even if it is still unmachined. Machining completion only matters for finished() and for "short"
  // (whether this cut reached the whole surface).
  function geometry(m) {
    var t = TOL.mm, a = TOL.deg;
    return {
      flatA: m.faceA.flatness <= t, flatB: m.faceB.flatness <= t, parallelT: m.thickness.max - m.thickness.min <= t,
      straightN: m.nearEdge.straightness <= t, squareN: m.nearEdge.square <= a,
      straightF: m.farEdge.straightness <= t, parallelW: m.width.max - m.width.min <= t,
      squareEnds: m.ends.square <= a
    };
  }
  function outcomes(op, after, info) {
    var m = after, s = status(m), g = geometry(m), o = {};
    if (op === 'joint-face') { o.flat = g.flatA; o.copies = !g.flatA; o.short = !s.thickOK || !!(info && info.through); }
    else if (op === 'joint-edge') { o.true = g.straightN && g.squareN; o.copies = g.straightN && !g.squareN; o.short = !s.widthOK || !!(info && info.through); }
    else if (op === 'plane') { o.true = g.flatA && g.flatB && g.parallelT; o.copies = g.parallelT && !(g.flatA && g.flatB); o.short = !m.clean.B || !s.thickOK; }
    else if (op === 'rip') { o.true = g.straightF && g.parallelW && g.straightN; o.copies = g.straightF && !(g.parallelW && g.straightN); o.short = !m.clean.F || !s.widthOK; }
    else if (op === 'crosscut') { o.true = g.squareEnds && s.lengthAt; o.copies = m.clean.S && m.clean.E && !g.squareEnds; o.short = !m.clean.E || !s.lengthOK; }
    else fail('Unknown operation');
    return Object.freeze(o);
  }
  function score(op, choice, after, info) {
    var list = PREDICTIONS[op]; if (!list) fail('Unknown operation');
    if (!list.some(function (p) { return p.id === choice; })) fail('Unknown prediction');
    var o = outcomes(op, after, info);
    return Object.freeze({ correct: !!o[choice], outcomes: o, trueIds: list.filter(function (p) { return o[p.id]; }).map(function (p) { return p.id; }) });
  }

  function run(kind, sequence, options) {
    var board = create(kind), steps = [{ op: null, board: board, metrics: measure(board) }];
    (sequence || []).forEach(function (op) { var r = apply(board, op, options); board = r.board; steps.push({ op: op, board: board, info: r.info, metrics: measure(board) }); });
    return steps;
  }

  return Object.freeze({
    NX: NX, NY: NY, ROUGH: ROUGH, TARGET: TARGET, TOL: TOL, OPS: OPS, OP_LABELS: OP_LABELS, BOARDS: BOARDS,
    REFERENCE_ORDER: REFERENCE_ORDER, PLANER_FIRST: PLANER_FIRST, PREDICTIONS: PREDICTIONS,
    create: create, apply: apply, measure: measure, status: status, finished: finished, outcomes: outcomes, score: score,
    run: run, volume: volume, node: function (board, i, j, k) { return get(board.nodes, i, j, k); }, triangles: triangles, faceFrame: faceFrame
  });
});

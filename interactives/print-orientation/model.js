(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiPrintOrientation = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /*
   * Geometric print-orientation model (pure; no DOM).
   * Units: millimetres and degrees. World frame: +z is the build-up vector, normal to the
   * build plate and to every layer plane; the plate is z = 0.
   * A face's inclination is measured from the horizontal plate: 0 deg horizontal, 90 deg vertical.
   * A face is downward-facing when its outward normal has n.z < 0. A downward face that is not
   * resting on the plate is flagged for support when its inclination is LESS than the threshold;
   * a face exactly at the threshold is treated as printable (the slicer convention: the threshold
   * is the most horizontal slope printed without support). Upward and vertical faces are never flagged.
   * Raw slope classification and support risk are kept separate: a downward face resting on the
   * plate is supported by the plate ('bed') and never enters the support proxy; nor does a flagged
   * face lying wholly within the first layer ('first-layer'), which is deposited onto the plate. The proxy is the
   * plate-projected area of the remaining flagged faces. It is not slicer support volume, time or a
   * guarantee: bridging, support that lands on the part, interface gaps and removal are not modelled.
   */
  var DEG = Math.PI / 180, EPS = 1e-9, BED_EPS = 1e-6;
  var PART = Object.freeze({ arm: 60, back: 50, t: 8, r: 10, width: 30, gussetLeg: 30, gussetT: 6, arcSegments: 16 });
  var LIMITS = Object.freeze({ spin: [-180, 180], threshold: [20, 70], layer: [0.05, 0.3] });
  var LOADS = Object.freeze({
    hang: Object.freeze({ title: 'Weight hanging from the arm tip', short: 'Hanging weight',
      description: 'The back plate is screwed to a wall and a weight hangs from the arm tip. The arm bends, so the most stretched material runs along the arm, around the bend and up the back plate; the gusset is stretched along its diagonal.' }),
    pull: Object.freeze({ title: 'Straight pull along the arm', short: 'Pull along arm',
      description: 'A strap pulls the arm tip straight out along the arm. The arm is stretched along its length.' }),
    none: Object.freeze({ title: 'No load shown', short: 'None', description: 'Orientation only.' })
  });
  var DEFAULTS = Object.freeze({ spin: 0, lay: 'upright', threshold: 45, layer: 0.2, load: 'hang' });
  var PRESETS = Object.freeze([
    Object.freeze({ id: 'base', label: 'Arm flat on the plate', spin: 0, lay: 'upright' }),
    Object.freeze({ id: 'back', label: 'Back plate flat on the plate', spin: -90, lay: 'upright' }),
    Object.freeze({ id: 'inverted', label: 'Upside down', spin: 180, lay: 'upright' }),
    Object.freeze({ id: 'tilt', label: 'Tilted 45°', spin: 45, lay: 'upright' }),
    Object.freeze({ id: 'side', label: 'On its side', spin: 0, lay: 'side' })
  ]);

  function finite(v, name) { var n = Number(v); if (v === '' || v === null || !isFinite(n)) throw new RangeError(name + ' must be a finite number'); return n; }
  function state(input) {
    var s = Object.assign({}, DEFAULTS, input || {});
    var spin = finite(s.spin, 'Spin'), threshold = finite(s.threshold, 'Overhang threshold'), layer = finite(s.layer, 'Layer height');
    if (spin < LIMITS.spin[0] || spin > LIMITS.spin[1]) throw new RangeError('Spin must be between -180 and 180 degrees');
    if (threshold < LIMITS.threshold[0] || threshold > LIMITS.threshold[1]) throw new RangeError('Overhang threshold must be between 20 and 70 degrees');
    if (layer < LIMITS.layer[0] - EPS || layer > LIMITS.layer[1] + EPS) throw new RangeError('Layer height must be between 0.05 and 0.30 mm');
    if (s.lay !== 'upright' && s.lay !== 'side') throw new RangeError('Lay must be upright or side');
    if (!LOADS[s.load]) throw new RangeError('Choose a defined load case');
    return Object.freeze({ spin: spin, lay: s.lay, threshold: threshold, layer: layer, load: s.load });
  }

  // ---------- small vector helpers ----------
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return [a[0] / l, a[1] / l, a[2] / l]; }
  function newell(pts) {
    var n = [0, 0, 0];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
  }
  function polygonArea(pts) { return len(newell(pts)) / 2; }
  function area2(poly) { var s = 0; for (var i = 0; i < poly.length; i++) { var a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }

  // Ear clipping for a simple counter-clockwise polygon of 2D points.
  function triangulate(poly) {
    if (area2(poly) <= 0) throw new Error('Polygon must be counter-clockwise');
    var idx = poly.map(function (_, i) { return i; }), tris = [];
    function c2(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    function inside(p, a, b, c) { return c2(a, b, p) >= -1e-12 && c2(b, c, p) >= -1e-12 && c2(c, a, p) >= -1e-12; }
    var guard = 0;
    while (idx.length > 3) {
      if (++guard > 100000) throw new Error('Triangulation did not converge');
      var clipped = false;
      for (var i = 0; i < idx.length; i++) {
        var a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
        if (c2(poly[a], poly[b], poly[c]) <= 1e-10) continue;
        var ok = true;
        for (var j = 0; j < idx.length; j++) { var p = idx[j]; if (p === a || p === b || p === c) continue; if (inside(poly[p], poly[a], poly[b], poly[c])) { ok = false; break; } }
        if (!ok) continue;
        tris.push([a, b, c]); idx.splice(i, 1); clipped = true; break;
      }
      if (!clipped) throw new Error('Triangulation failed');
    }
    tris.push(idx.slice());
    return tris;
  }

  // ---------- the bracket ----------
  // Profile in the part's XZ plane, extruded along part Y (0..width). Concentric inner fillet
  // (radius r) and outer round (radius t + r). A centred gusset web fills part of the inside corner.
  function profile(P) {
    P = P || PART;
    var t = P.t, r = P.r, C = t + r, R = t + r, g = P.gussetLeg, N = P.arcSegments;
    if (!(t > 0 && r > 0 && g > r && t + g < P.arm && t + g < P.back && C < P.arm && C < P.back && P.gussetT > 0 && P.gussetT < P.width && N >= 2)) throw new RangeError('Inconsistent bracket dimensions');
    var pts = [], feat = [], vn = [];
    function add(x, z, f, n) { pts.push([x, z]); feat.push(f); vn.push(n || null); }
    add(C, 0, 'arm-underside', [0, -1]);
    add(P.arm, 0, 'arm-end');
    add(P.arm, t, 'arm-top');
    var coverStart = pts.length; add(t + g, t, 'arm-top');
    add(C, t, 'inner-fillet', [0, 1]);
    for (var k = 1; k < N; k++) { var th = (270 - 90 * k / N) * DEG; add(C + r * Math.cos(th), C + r * Math.sin(th), 'inner-fillet', [-Math.cos(th), -Math.sin(th)]); }
    add(t, C, 'back-inner', [1, 0]);
    var coverEnd = pts.length; add(t, t + g, 'back-inner');
    add(t, P.back, 'back-top');
    add(0, P.back, 'back-outer');
    add(0, C, 'outer-round', [-1, 0]);
    for (k = 1; k < N; k++) { th = (180 + 90 * k / N) * DEG; add(C + R * Math.cos(th), C + R * Math.sin(th), 'outer-round', [Math.cos(th), Math.sin(th)]); }
    // Edge i runs pts[i] -> pts[i+1]; covered edges (inside the gusset slab) are coverStart .. coverEnd-1.
    var gusset = [pts[coverEnd]];
    for (k = coverEnd - 1; k >= coverStart; k--) gusset.push(pts[k]);
    var analytic = {
      lArea: P.arm * t + (P.back - t) * t - (R * R - Math.PI * R * R / 4) + (r * r - Math.PI * r * r / 4),
      gussetArea: g * g / 2 - (r * r - Math.PI * r * r / 4)
    };
    return { P: P, pts: pts, feat: feat, vertexNormal: vn, coverStart: coverStart, coverEnd: coverEnd, gusset: gusset, center: [C, C], analytic: analytic };
  }

  function face(pts3, feature, tris, vnormals) {
    var n = newell(pts3), a = len(n) / 2;
    return { pts: pts3, normal: [n[0] / (2 * a), n[1] / (2 * a), n[2] / (2 * a)], area: a, feature: feature, tris: tris, vnormals: vnormals || null };
  }
  function partFaces(P) {
    var pr = profile(P), p = pr.pts, W = pr.P.width, a = (W - pr.P.gussetT) / 2, b = a + pr.P.gussetT, faces = [];
    var slabs = [[0, a], [a, b], [b, W]];
    for (var i = 0; i < p.length; i++) {
      var q = (i + 1) % p.length, A = p[i], B = p[q], covered = i >= pr.coverStart && i < pr.coverEnd;
      var dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz), fn = [dz / l, 0, -dx / l];
      var arc = pr.feat[i] === 'inner-fillet' || pr.feat[i] === 'outer-round';
      var nA = arc ? [pr.vertexNormal[i][0], 0, pr.vertexNormal[i][1]] : fn;
      var nB = arc ? [pr.vertexNormal[q][0], 0, pr.vertexNormal[q][1]] : fn;
      slabs.forEach(function (s, si) {
        if (covered && si === 1) return;
        faces.push(face([[A[0], s[0], A[1]], [A[0], s[1], A[1]], [B[0], s[1], B[1]], [B[0], s[0], B[1]]], pr.feat[i], [[0, 1, 2], [0, 2, 3]], [nA, nA, nB, nB]));
      });
    }
    // Gusset diagonal wall (middle slab only).
    var G0 = p[pr.coverStart], G1 = p[pr.coverEnd];
    faces.push(face([[G0[0], a, G0[1]], [G0[0], b, G0[1]], [G1[0], b, G1[1]], [G1[0], a, G1[1]]], 'gusset-edge', [[0, 1, 2], [0, 2, 3]]));
    function cap(poly2, y, down, feature) {
      var tris = triangulate(poly2), pts3 = poly2.map(function (v) { return [v[0], y, v[1]]; });
      if (!down) { pts3 = pts3.slice().reverse(); var n = pts3.length; tris = tris.map(function (t) { return [n - 1 - t[0], n - 1 - t[2], n - 1 - t[1]]; }); }
      faces.push(face(pts3, feature, tris));
    }
    cap(p, 0, true, 'front-face'); cap(p, W, false, 'back-face');
    cap(pr.gusset, a, true, 'gusset-face'); cap(pr.gusset, b, false, 'gusset-face');
    return { faces: faces, profile: pr, slab: { a: a, b: b, W: W } };
  }
  var PART_MESH = partFaces(PART);

  // ---------- orientation ----------
  function rotation(s) {
    var a = s.spin * DEG, b = (s.lay === 'side' ? 90 : 0) * DEG, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    // World = Rx(b) * Ry(a) * part
    var Ry = [[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]], Rx = [[1, 0, 0], [0, cb, -sb], [0, sb, cb]], M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) M[i][j] += Rx[i][k] * Ry[k][j];
    return M;
  }
  function apply(M, v) { return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]]; }
  function placement(s, mesh) {
    mesh = mesh || PART_MESH;
    var M = rotation(s), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    mesh.faces.forEach(function (f) { f.pts.forEach(function (p) { var w = apply(M, p); for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); } }); });
    var off = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]];
    function toWorld(p) { var w = apply(M, p); return [w[0] + off[0], w[1] + off[1], w[2] + off[2]]; }
    var faces = mesh.faces.map(function (f) {
      return { pts: f.pts.map(toWorld), normal: apply(M, f.normal), area: f.area, feature: f.feature, tris: f.tris,
        vnormals: f.vnormals ? f.vnormals.map(function (n) { return apply(M, n); }) : null };
    });
    return { M: M, offset: off, toWorld: toWorld, faces: faces, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
  }

  // ---------- classification ----------
  function inclination(n) { var c = Math.min(1, Math.abs(n[2]) / len(n)); return Math.acos(c) / DEG; }
  function classifyNormal(n, threshold, onBed) {
    var nz = n[2] / len(n);
    if (nz > EPS) return 'up';
    if (nz >= -EPS) return 'vertical';
    if (onBed) return 'bed';
    return inclination(n) < threshold - EPS ? 'support' : 'down-ok';
  }
  function layerCount(height, h) {
    if (!(height >= 0) || !(h > 0)) throw new RangeError('Height must be non-negative and layer height positive');
    return Math.ceil(height / h - 1e-9);
  }

  function pointInTri2(p, a, b, c) {
    var d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    var d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
    var d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
    var neg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12, pos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
    return !(neg && pos);
  }
  // Union of the flagged faces' plate projections, sampled at cell centres.
  function rasterUnion(faces, cell) {
    var tris = [];
    faces.forEach(function (f) { f.tris.forEach(function (t) { var a = f.pts[t[0]], b = f.pts[t[1]], c = f.pts[t[2]]; if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 1e-12) tris.push([a, b, c]); }); });
    if (!tris.length) return 0;
    var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    tris.forEach(function (t) { t.forEach(function (p) { lo[0] = Math.min(lo[0], p[0]); lo[1] = Math.min(lo[1], p[1]); hi[0] = Math.max(hi[0], p[0]); hi[1] = Math.max(hi[1], p[1]); }); });
    var nx = Math.ceil((hi[0] - lo[0]) / cell) + 1, ny = Math.ceil((hi[1] - lo[1]) / cell) + 1, grid = new Uint8Array(nx * ny), count = 0;
    tris.forEach(function (t) {
      var x0 = Math.max(0, Math.floor((Math.min(t[0][0], t[1][0], t[2][0]) - lo[0]) / cell)), x1 = Math.min(nx - 1, Math.ceil((Math.max(t[0][0], t[1][0], t[2][0]) - lo[0]) / cell));
      var y0 = Math.max(0, Math.floor((Math.min(t[0][1], t[1][1], t[2][1]) - lo[1]) / cell)), y1 = Math.min(ny - 1, Math.ceil((Math.max(t[0][1], t[1][1], t[2][1]) - lo[1]) / cell));
      for (var j = y0; j <= y1; j++) for (var i = x0; i <= x1; i++) {
        var k = j * nx + i; if (grid[k]) continue;
        if (pointInTri2([lo[0] + (i + 0.5) * cell, lo[1] + (j + 0.5) * cell], t[0], t[1], t[2])) { grid[k] = 1; count++; }
      }
    });
    return count * cell * cell;
  }

  // Classify an arbitrary closed mesh already placed in world coordinates (plate at bedZ).
  function analyzeFaces(faces, opts) {
    opts = opts || {};
    var threshold = opts.threshold == null ? 45 : opts.threshold, bedZ = opts.bedZ == null ? 0 : opts.bedZ, cell = opts.cell || 0.1;
    var firstLayer = opts.firstLayer || 0;
    var zmin = Infinity, zmax = -Infinity, totals = { up: 0, vertical: 0, bed: 0, 'first-layer': 0, support: 0, 'down-ok': 0 }, supportSum = 0, flagged = [];
    var classified = faces.map(function (f) {
      f.pts.forEach(function (p) { zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); });
      var onBed = f.pts.every(function (p) { return Math.abs(p[2] - bedZ) <= BED_EPS; });
      var cls = classifyNormal(f.normal, threshold, onBed);
      // A flagged face lying wholly inside the first layer is deposited directly on the plate.
      if (cls === 'support' && firstLayer > 0 && f.pts.every(function (p) { return p[2] <= bedZ + firstLayer + EPS; })) cls = 'first-layer';
      totals[cls] += f.area;
      if (cls === 'support') { supportSum += f.area * Math.abs(f.normal[2]); flagged.push(f); }
      return Object.assign({}, f, { cls: cls, inclination: inclination(f.normal) });
    });
    var union = rasterUnion(flagged, cell), toPlate = 0, toPart = 0, bedProjected = 0;
    classified.forEach(function (f) { if (f.cls === 'bed' || f.cls === 'first-layer') bedProjected += f.area * Math.abs(f.normal[2]); });
    // Where would a support column from each flagged triangle land? Sampled at the triangle centroid.
    flagged.forEach(function (f) {
      f.tris.forEach(function (t) {
        var A = f.pts[t[0]], B = f.pts[t[1]], C = f.pts[t[2]], c = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
        var projected = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) / 2;
        var blocked = faces.some(function (g) { return g !== f && g.tris.some(function (u) {
          var P = g.pts[u[0]], Q = g.pts[u[1]], R = g.pts[u[2]];
          if (!pointInTri2(c, P, Q, R)) return false;
          var det = (Q[0] - P[0]) * (R[1] - P[1]) - (R[0] - P[0]) * (Q[1] - P[1]);
          if (Math.abs(det) < 1e-9) return false;
          var a = ((c[0] - P[0]) * (R[1] - P[1]) - (R[0] - P[0]) * (c[1] - P[1])) / det, b = ((Q[0] - P[0]) * (c[1] - P[1]) - (c[0] - P[0]) * (Q[1] - P[1])) / det;
          return P[2] + a * (Q[2] - P[2]) + b * (R[2] - P[2]) < c[2] - 1e-6;
        }); });
        if (blocked) toPart += projected; else toPlate += projected;
      });
    });
    return { faces: classified, totals: totals, supportSum: supportSum, supportUnion: union, cell: cell,
      overlap: Math.max(0, supportSum - union), toPlate: toPlate, toPart: toPart,
      rawDownBelowThreshold: supportSum + bedProjected, bedProjected: bedProjected,
      height: zmax - bedZ, zmin: zmin, zmax: zmax, threshold: threshold };
  }

  // ---------- load direction relative to the layer planes ----------
  function layerAngle(dirPart, s) { var d = unit(apply(rotation(s), dirPart)); return Math.asin(Math.min(1, Math.abs(d[2]))) / DEG; }
  function fibreDirections(load) {
    if (load === 'pull') return [{ part: 'arm', dir: [1, 0, 0] }];
    if (load !== 'hang') return [];
    var out = [];
    for (var psi = 0; psi <= 90; psi += 1) out.push({ part: psi === 0 ? 'arm' : psi === 90 ? 'back plate' : 'bend', dir: [Math.cos(psi * DEG), 0, Math.sin(psi * DEG)] });
    out.push({ part: 'gusset', dir: [-Math.SQRT1_2, 0, Math.SQRT1_2] });
    return out;
  }
  function loadReport(s) {
    var dirs = fibreDirections(s.load);
    if (!dirs.length) return null;
    var angles = dirs.map(function (d) { return { part: d.part, angle: layerAngle(d.dir, s) }; });
    var max = Math.max.apply(null, angles.map(function (a) { return a.angle; })), min = Math.min.apply(null, angles.map(function (a) { return a.angle; }));
    var worst = angles.filter(function (a) { return a.angle >= max - 1e-6; })[0];
    return { load: s.load, min: min, max: max, worstPart: worst.part, mostlyNormal: max > 45 + 1e-9, samples: angles };
  }
  // A prediction is 'parallel' (stretch direction mostly in the layer planes, angle < 45 deg) or
  // 'normal' (mostly normal to them, angle > 45 deg). Within +/- tolerance of 45 deg either is accepted.
  function gradePrediction(prediction, maxAngle, tolerance) {
    if (prediction !== 'parallel' && prediction !== 'normal') throw new RangeError('Prediction must be parallel or normal');
    var tol = tolerance == null ? 5 : tolerance;
    if (Math.abs(maxAngle - 45) <= tol) return { result: 'either', correct: true };
    var truth = maxAngle > 45 ? 'normal' : 'parallel';
    return { result: truth, correct: truth === prediction };
  }

  // ---------- quantized section (stair steps) ----------
  // Layer k occupies [k h, min((k+1) h, H)] above the plate; its outline is the true section at that
  // slab's mid-height, extruded vertically through the slab. Defined for the upright lay, where the
  // section through the front slab (part y = a/2) is the profile itself in a vertical plane.
  function scan(poly, z) {
    var xs = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      if ((p[1] <= z && q[1] > z) || (q[1] <= z && p[1] > z)) xs.push(p[0] + (z - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
    }
    xs.sort(function (a, b) { return a - b; });
    var out = []; for (var k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
    return out;
  }
  function symDiff(a, b) {
    var ev = []; a.forEach(function (s) { ev.push([s[0], 1, 0], [s[1], -1, 0]); }); b.forEach(function (s) { ev.push([s[0], 1, 1], [s[1], -1, 1]); });
    ev.sort(function (x, y) { return x[0] - y[0]; });
    var ca = 0, cb = 0, out = [], start = null;
    ev.forEach(function (e) {
      var before = (ca > 0) !== (cb > 0);
      if (e[2] === 0) ca += e[1]; else cb += e[1];
      var after = (ca > 0) !== (cb > 0);
      if (!before && after) start = e[0];
      if (before && !after && e[0] - start > 1e-9) out.push([start, e[0]]);
    });
    return out;
  }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function section(s) {
    s = state(s);
    if (s.lay !== 'upright') return null;
    var place = placement(s), pr = PART_MESH.profile, y = PART_MESH.slab.a / 2;
    var poly = pr.pts.map(function (v) { var w = place.toWorld([v[0], y, v[1]]); return [w[0], w[2]]; });
    var H = place.size[2], h = s.layer, n = layerCount(H, h), layers = [];
    for (var k = 0; k < n; k++) { var z0 = k * h, z1 = Math.min((k + 1) * h, H); layers.push({ z0: z0, z1: z1, intervals: scan(poly, (z0 + z1) / 2) }); }
    var segs = [];
    layers.forEach(function (L, k) {
      L.intervals.forEach(function (iv) { segs.push([[iv[0], L.z0], [iv[0], L.z1]], [[iv[1], L.z0], [iv[1], L.z1]]); });
      var below = k ? layers[k - 1].intervals : [];
      symDiff(below, L.intervals).forEach(function (iv) { segs.push([[iv[0], L.z0], [iv[1], L.z0]]); });
    });
    if (layers.length) layers[layers.length - 1].intervals.forEach(function (iv) { segs.push([[iv[0], H], [iv[1], H]]); });
    function gap(feature) {
      var worst = 0;
      for (var i = 0; i < poly.length; i++) {
        if (pr.feat[i] !== feature) continue;
        var a = poly[i], b = poly[(i + 1) % poly.length];
        for (var j = 0; j <= 8; j++) {
          var p = [a[0] + (b[0] - a[0]) * j / 8, a[1] + (b[1] - a[1]) * j / 8], best = Infinity;
          for (var m = 0; m < segs.length; m++) { var d = segDist(p, segs[m][0], segs[m][1]); if (d < best) best = d; }
          if (best > worst) worst = best;
        }
      }
      return worst;
    }
    return { state: s, poly: poly, feat: pr.feat, height: H, layerHeight: h, layers: layers, boundary: segs, gap: gap,
      center: (function () { var c = place.toWorld([pr.center[0], y, pr.center[1]]); return [c[0], c[2]]; })(),
      radii: { inner: pr.P.r, outer: pr.P.t + pr.P.r } };
  }

  // ---------- full analysis for the bracket ----------
  function analyze(input, opts) {
    var s = state(input), place = placement(s), a = analyzeFaces(place.faces, { threshold: s.threshold, firstLayer: s.layer, cell: (opts && opts.cell) || 0.1 });
    var H = place.size[2];
    return Object.assign(a, { state: s, placement: place, size: place.size, layers: layerCount(H, s.layer), load: loadReport(s),
      curvedVertical: s.lay === 'side' });
  }

  // Lowest part surface above a plate point (for drawing support pillars); returns {z, face} or null.
  function lowestHit(faces, x, y) {
    var best = null;
    faces.forEach(function (f) {
      f.tris.forEach(function (t) {
        var A = f.pts[t[0]], B = f.pts[t[1]], C = f.pts[t[2]];
        var det = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
        if (Math.abs(det) < 1e-9) return;
        var u = ((x - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (y - A[1])) / det, v = ((B[0] - A[0]) * (y - A[1]) - (x - A[0]) * (B[1] - A[1])) / det;
        if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) return;
        var z = A[2] + u * (B[2] - A[2]) + v * (C[2] - A[2]);
        if (!best || z < best.z) best = { z: z, face: f };
      });
    });
    return best;
  }
  function supportPillars(analysis, pitch) {
    pitch = pitch || 2.5;
    var out = [], flagged = analysis.faces.filter(function (f) { return f.cls === 'support'; });
    if (!flagged.length) return out;
    var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    flagged.forEach(function (f) { f.pts.forEach(function (p) { lo[0] = Math.min(lo[0], p[0]); lo[1] = Math.min(lo[1], p[1]); hi[0] = Math.max(hi[0], p[0]); hi[1] = Math.max(hi[1], p[1]); }); });
    for (var x = Math.ceil(lo[0] / pitch) * pitch; x <= hi[0] + 1e-9; x += pitch) for (var y = Math.ceil(lo[1] / pitch) * pitch; y <= hi[1] + 1e-9; y += pitch) {
      var hit = lowestHit(analysis.faces, x + 0.013, y + 0.017);
      if (hit && hit.face.cls === 'support' && hit.z > 0.05) out.push([x + 0.013, y + 0.017, hit.z]);
    }
    return out;
  }
  // Plane z = level intersected with every triangle: an array of segments [[x,y,z],[x,y,z],normal].
  function contour(faces, level) {
    var segs = [];
    faces.forEach(function (f) {
      f.tris.forEach(function (t) {
        var P = [f.pts[t[0]], f.pts[t[1]], f.pts[t[2]]], hits = [];
        for (var i = 0; i < 3; i++) {
          var a = P[i], b = P[(i + 1) % 3], da = a[2] - level, db = b[2] - level;
          if ((da < 0 && db >= 0) || (db < 0 && da >= 0)) { var u = da / (da - db); hits.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), level]); }
        }
        if (hits.length === 2) segs.push([hits[0], hits[1], f.normal]);
      });
    });
    return segs;
  }
  function meshCheck(faces) {
    // Every directed triangle edge must be matched by exactly one reversed edge (closed, consistently oriented).
    var key = function (p) { return p.map(function (v) { return Math.round(v * 1e6); }).join(','); }, edges = new Map(), volume = 0;
    faces.forEach(function (f) { f.tris.forEach(function (t) {
      for (var i = 0; i < 3; i++) { var k = key(f.pts[t[i]]) + '>' + key(f.pts[t[(i + 1) % 3]]); edges.set(k, (edges.get(k) || 0) + 1); }
      var a = f.pts[t[0]], b = f.pts[t[1]], c = f.pts[t[2]]; volume += dot(a, cross(b, c)) / 6;
    }); });
    var bad = 0; edges.forEach(function (n, k) { var parts = k.split('>'); if (n !== 1 || edges.get(parts[1] + '>' + parts[0]) !== 1) bad++; });
    return { unmatched: bad, volume: volume, edges: edges.size };
  }

  return Object.freeze({ PART: PART, LIMITS: LIMITS, LOADS: LOADS, DEFAULTS: DEFAULTS, PRESETS: PRESETS, MESH: PART_MESH,
    state: state, profile: profile, partFaces: partFaces, rotation: rotation, placement: placement, triangulate: triangulate,
    inclination: inclination, classifyNormal: classifyNormal, layerCount: layerCount, analyzeFaces: analyzeFaces, analyze: analyze,
    rasterUnion: rasterUnion, layerAngle: layerAngle, loadReport: loadReport, gradePrediction: gradePrediction, section: section,
    supportPillars: supportPillars, contour: contour, lowestHit: lowestHit, meshCheck: meshCheck, polygonArea: polygonArea, area2: area2 });
});

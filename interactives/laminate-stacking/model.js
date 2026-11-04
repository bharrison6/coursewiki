/* Bounded classical laminate theory for a stack of thin, perfectly bonded,
   linear-elastic orthotropic plies in plane stress (Kirchhoff plate kinematics,
   small deflection). Units throughout: MPa, mm, N/mm (force resultant N),
   N (moment resultant per unit width M), 1/mm (curvature kappa).

   Geometry: z is measured UP from the geometric midplane. Plies are listed
   from the TOP face (z = +h/2) to the BOTTOM face (z = -h/2), which is how a
   stacking sequence is written. Fiber angle theta is measured from the global
   x axis toward y, counterclockwise seen from +z. Shear strains are
   ENGINEERING shear strains (gamma_xy = 2 eps_xy); curvatures follow
   kappa_x = -d2w/dx2, kappa_y = -d2w/dy2, kappa_xy = -2 d2w/dxdy, so the
   midplane deflection is w = -(kappa_x x^2 + kappa_y y^2 + kappa_xy x y)/2.

   The ply material comes from the fiber-orientation module's illustrative
   defaults and is validated by that module's own validator. This is NOT a
   strength, failure, buckling, thermal, moisture or cure-warp model. */
(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('../fiber-orientation/model.js') : root.FiberOrientationModel);
  if (node) module.exports = api; else root.CourseWikiLaminate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (FO) {
  'use strict';
  if (!FO) throw new Error('laminate-stacking requires the fiber-orientation model.');

  var PLY_MM = 0.125;          // chosen illustrative ply thickness, not measured data
  var MAX_PLIES = 16;
  var ANGLES = Object.freeze([0, 45, -45, 90]);
  var MATERIAL = Object.freeze({ E1GPa: FO.defaults.E1GPa, E2GPa: FO.defaults.E2GPa,
    G12GPa: FO.defaults.G12GPa, nu12: FO.defaults.nu12 });
  var REL_ZERO = 1e-9;

  function finite(v, name) { if (!Number.isFinite(v)) throw new RangeError(name + ' must be a finite number.'); }

  function material(input) {
    var m = input || MATERIAL;
    // Reuse the single-ply module's validation rather than copying it.
    FO.validate({ E1GPa: m.E1GPa, E2GPa: m.E2GPa, G12GPa: m.G12GPa, nu12: m.nu12, angleDeg: 0, sigmaXMPa: 0 });
    return m;
  }

  /* Reduced stiffness Q of one ply in its own axes, MPa. */
  function reducedStiffness(input) {
    var m = material(input);
    var E1 = m.E1GPa * 1000, E2 = m.E2GPa * 1000, G12 = m.G12GPa * 1000;
    var nu21 = m.nu12 * E2 / E1, d = 1 - m.nu12 * nu21;
    return { Q11: E1 / d, Q22: E2 / d, Q12: m.nu12 * E2 / d, Q66: G12 };
  }

  /* Transformed reduced stiffness Qbar (3x3, MPa) for engineering shear strain. */
  function qbar(angleDeg, input) {
    finite(angleDeg, 'Ply angle');
    var q = reducedStiffness(input), t = angleDeg * Math.PI / 180;
    var m = Math.cos(t), n = Math.sin(t), m2 = m * m, n2 = n * n;
    var Q11 = q.Q11, Q22 = q.Q22, Q12 = q.Q12, Q66 = q.Q66;
    var b11 = Q11 * m2 * m2 + 2 * (Q12 + 2 * Q66) * m2 * n2 + Q22 * n2 * n2;
    var b22 = Q11 * n2 * n2 + 2 * (Q12 + 2 * Q66) * m2 * n2 + Q22 * m2 * m2;
    var b12 = (Q11 + Q22 - 4 * Q66) * m2 * n2 + Q12 * (m2 * m2 + n2 * n2);
    var b16 = (Q11 - Q12 - 2 * Q66) * m2 * m * n + (Q12 - Q22 + 2 * Q66) * m * n2 * n;
    var b26 = (Q11 - Q12 - 2 * Q66) * m * n2 * n + (Q12 - Q22 + 2 * Q66) * m2 * m * n;
    var b66 = (Q11 + Q22 - 2 * Q12 - 2 * Q66) * m2 * n2 + Q66 * (m2 * m2 + n2 * n2);
    return [[b11, b12, b16], [b12, b22, b26], [b16, b26, b66]];
  }

  function zeros(r, c) { var out = []; for (var i = 0; i < r; i++) { out.push([]); for (var j = 0; j < c; j++) out[i].push(0); } return out; }

  function normalizePlies(plies) {
    if (!Array.isArray(plies) || plies.length < 1) throw new RangeError('A laminate needs at least one ply.');
    if (plies.length > 64) throw new RangeError('At most 64 plies are supported.');
    return plies.map(function (p, i) {
      var angle = typeof p === 'number' ? p : p && p.angle;
      var t = typeof p === 'number' ? PLY_MM : (p && p.t != null ? p.t : PLY_MM);
      finite(angle, 'Ply ' + (i + 1) + ' angle');
      finite(t, 'Ply ' + (i + 1) + ' thickness');
      if (t <= 0) throw new RangeError('Ply ' + (i + 1) + ' thickness must be greater than zero.');
      return { angle: angle, t: t };
    });
  }

  /* A (N/mm), B (N), D (N mm). Plies listed top (z=+h/2) to bottom. */
  function abd(plies, input) {
    var list = normalizePlies(plies);
    var h = list.reduce(function (s, p) { return s + p.t; }, 0);
    var A = zeros(3, 3), B = zeros(3, 3), D = zeros(3, 3), zTop = h / 2, layers = [];
    list.forEach(function (p) {
      var zBot = zTop - p.t, Q = qbar(p.angle, input);
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
        A[i][j] += Q[i][j] * (zTop - zBot);
        B[i][j] += Q[i][j] * (zTop * zTop - zBot * zBot) / 2;
        D[i][j] += Q[i][j] * (zTop * zTop * zTop - zBot * zBot * zBot) / 3;
      }
      layers.push({ angle: p.angle, t: p.t, zTop: zTop, zBottom: zBot });
      zTop = zBot;
    });
    return { A: A, B: B, D: D, h: h, layers: layers };
  }

  function full(L) {
    var K = zeros(6, 6);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      K[i][j] = L.A[i][j]; K[i][j + 3] = L.B[i][j]; K[i + 3][j] = L.B[i][j]; K[i + 3][j + 3] = L.D[i][j];
    }
    return K;
  }

  /* Gauss-Jordan inverse with partial pivoting; refuses singular input. */
  function invert(M) {
    var n = M.length, a = M.map(function (row, i) {
      var r = row.slice(); for (var j = 0; j < n; j++) r.push(i === j ? 1 : 0); return r;
    });
    var scale = 0; M.forEach(function (row) { row.forEach(function (v) { scale = Math.max(scale, Math.abs(v)); }); });
    for (var c = 0; c < n; c++) {
      var p = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      if (!(Math.abs(a[p][c]) > scale * 1e-14)) throw new RangeError('Stiffness matrix is singular.');
      var tmp = a[c]; a[c] = a[p]; a[p] = tmp;
      var piv = a[c][c];
      for (var k = 0; k < 2 * n; k++) a[c][k] /= piv;
      for (r = 0; r < n; r++) if (r !== c) {
        var f = a[r][c];
        if (f) for (k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k];
      }
    }
    return a.map(function (row) { return row.slice(n); });
  }
  function mulVec(M, v) { return M.map(function (row) { return row.reduce(function (s, x, j) { return s + x * v[j]; }, 0); }); }
  function upperLeft(M) { return [M[0].slice(0, 3), M[1].slice(0, 3), M[2].slice(0, 3)]; }
  function maxAbs(M) { var m = 0; M.forEach(function (row) { row.forEach(function (v) { m = Math.max(m, Math.abs(v)); }); }); return m; }

  function laminate(plies, input) {
    var L = abd(plies, input);
    L.a = invert(L.A);                       // flat-held (curvature-constrained) compliance, mm/N
    L.inverseABD = invert(full(L));
    L.aFree = upperLeft(L.inverseABD);       // free in-plane compliance with M = 0, mm/N
    return L;
  }

  /* Directional in-plane modulus (GPa) for a uniaxial resultant along theta.
     mode 'flat': curvature held at zero, uses A only.
     mode 'free': plate free to curve with zero applied moment, uses full ABD. */
  function directionalModulus(L, thetaDeg, mode) {
    finite(thetaDeg, 'Direction');
    var t = thetaDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    var v = [c * c, s * s, c * s];
    var a = mode === 'free' ? L.aFree : L.a;
    var compliance = mulVec(a, v).reduce(function (sum, x, i) { return sum + x * v[i]; }, 0);
    return 1 / (L.h * compliance) / 1000;
  }

  function polar(L, mode, step) {
    var out = [], d = step || 2;
    for (var th = 0; th < 360; th += d) out.push({ theta: th, E: directionalModulus(L, th, mode) });
    return out;
  }

  /* Solve the full 6x6 relation for midplane strain and curvature.
     N in N/mm; M in N (per unit width). Zero load returns exact zeros. */
  function respond(L, N, M) {
    var n = N || {}, m = M || {};
    var load = [n.Nx || 0, n.Ny || 0, n.Nxy || 0, m.Mx || 0, m.My || 0, m.Mxy || 0];
    load.forEach(function (v, i) { finite(v, ['Nx', 'Ny', 'Nxy', 'Mx', 'My', 'Mxy'][i]); });
    var x = mulVec(L.inverseABD, load);
    // Rounding leaves ~1e-20 residues where the exact answer is zero (for example
    // curvature of a symmetric stack). Snap components that are below 1e-9 of the
    // largest strain in the laminate (membrane or bending surface strain) to 0.
    var scale = Math.max(Math.abs(x[0]), Math.abs(x[1]), Math.abs(x[2]),
      (Math.abs(x[3]) + Math.abs(x[4]) + Math.abs(x[5])) * L.h / 2);
    x = x.map(function (v, i) { var s = i < 3 ? Math.abs(v) : Math.abs(v) * L.h / 2; return s <= 1e-9 * scale ? 0 : v; });
    return {
      load: { Nx: load[0], Ny: load[1], Nxy: load[2], Mx: load[3], My: load[4], Mxy: load[5] },
      strain: { ex: x[0], ey: x[1], gxy: x[2] },
      curvature: { kx: x[3], ky: x[4], kxy: x[5] }
    };
  }

  /* Midplane deflection (mm, positive up) at (x, y) mm, from a solved curvature. */
  function deflection(curvature, x, y) {
    return -(curvature.kx * x * x + curvature.ky * y * y + curvature.kxy * x * y) / 2;
  }

  function mirrored(angles) {
    var a = angles.map(function (p) { return typeof p === 'number' ? p : p.angle; });
    for (var i = 0, j = a.length - 1; i < j; i++, j--) if (a[i] !== a[j]) return false;
    return true;
  }

  function classify(L, angles) {
    var Amax = maxAbs(L.A), Bmax = maxAbs(L.B);
    var A = L.A, list = angles.map(function (p) { return typeof p === 'number' ? p : p.angle; });
    var bZero = Bmax <= REL_ZERO * Amax * L.h;
    var balancedMatrix = Math.abs(A[0][2]) <= REL_ZERO * Amax && Math.abs(A[1][2]) <= REL_ZERO * Amax;
    var qi = Math.abs(A[0][0] - A[1][1]) <= REL_ZERO * Amax && balancedMatrix &&
      Math.abs(A[2][2] - (A[0][0] - A[0][1]) / 2) <= REL_ZERO * Amax;
    var flat = polar(L, 'flat', 1).map(function (p) { return p.E; });
    var free = polar(L, 'free', 1).map(function (p) { return p.E; });
    function range(xs) { var lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs); return { min: lo, max: hi }; }
    var plus = list.filter(function (a) { return a === 45; }).length, minus = list.filter(function (a) { return a === -45; }).length;
    return {
      symmetric: mirrored(list),
      couplingZero: bZero,
      balanced: balancedMatrix,
      balancedCount: { plus45: plus, minus45: minus },
      quasiIsotropic: qi,
      flat: range(flat),
      free: range(free),
      Bmax: Bmax
    };
  }

  /* Principal curvatures of the midplane surface. kappa_xy is the ENGINEERING
     twist (-2 d2w/dxdy), so the curvature tensor is [[kx, kxy/2], [kxy/2, ky]]. */
  function principalCurvatures(k) {
    finite(k.kx, 'kappa_x'); finite(k.ky, 'kappa_y'); finite(k.kxy, 'kappa_xy');
    var mean = (k.kx + k.ky) / 2, r = Math.hypot((k.kx - k.ky) / 2, k.kxy / 2);
    var k1 = mean + r, k2 = mean - r, big = Math.max(Math.abs(k1), Math.abs(k2));
    return { k1: k1, k2: k2, maxAbs: big, radiusMm: big > 0 ? 1 / big : Infinity };
  }

  /* Exact height range of the quadratic surface w(x, y) over the square
     |x|, |y| <= a. Extrema of a quadratic on a square lie at the corners, at
     stationary points along the four edges, or at the interior stationary
     point (the origin, where w = 0). The linear model assumes the true range
     is small compared with the laminate thickness h. */
  function surfaceRange(curvature, a) {
    var k = curvature, pts = [[a, a], [a, -a], [-a, a], [-a, -a], [0, 0]];
    [-a, a].forEach(function (e) {
      if (k.ky !== 0) { var y = -k.kxy * e / (2 * k.ky); if (Math.abs(y) <= a) pts.push([e, y]); }
      if (k.kx !== 0) { var x = -k.kxy * e / (2 * k.kx); if (Math.abs(x) <= a) pts.push([x, e]); }
    });
    var hi = -Infinity, lo = Infinity, at = { hi: null, lo: null };
    pts.forEach(function (p) {
      var w = deflection(k, p[0], p[1]);
      if (w > hi) { hi = w; at.hi = p; }
      if (w < lo) { lo = w; at.lo = p; }
    });
    return { max: hi, min: lo, maxAt: at.hi, minAt: at.lo };
  }
  function smallDeflection(curvature, halfSpanMm, h) {
    if (!(halfSpanMm > 0) || !(h > 0)) throw new RangeError('Patch half-span and thickness must be greater than zero.');
    var r = surfaceRange(curvature, halfSpanMm), span = r.max - r.min;
    return { reliefMm: span, ratioToThickness: span / h, withinLinearRange: span <= h, maxAt: r.maxAt, minAt: r.minAt };
  }

  function mirror(angles) { return angles.concat(angles.slice().reverse()); }

  function label(angles) {
    var a = angles.map(function (p) { return typeof p === 'number' ? p : p.angle; });
    if (a.length > 1 && a.length % 2 === 0 && mirrored(a)) return '[' + a.slice(0, a.length / 2).map(text).join('/') + ']s';
    return '[' + a.map(text).join('/') + ']';
    function text(x) { return x > 0 && x !== 90 ? '+' + x : x < 0 ? '\u2212' + Math.abs(x) : String(x); }
  }

  function format(v, digits) {
    var d = digits == null ? 2 : digits, s = Number(v).toFixed(d);
    if (Number(s) === 0) s = Number(0).toFixed(d);
    return s.replace('-', '\u2212');
  }

  return Object.freeze({
    PLY_MM: PLY_MM, MAX_PLIES: MAX_PLIES, ANGLES: ANGLES, MATERIAL: MATERIAL,
    reducedStiffness: reducedStiffness, qbar: qbar, abd: abd, laminate: laminate,
    directionalModulus: directionalModulus, polar: polar, respond: respond, deflection: deflection,
    classify: classify, smallDeflection: smallDeflection, surfaceRange: surfaceRange, principalCurvatures: principalCurvatures, mirror: mirror, mirrored: mirrored,
    label: label, format: format, invert: invert
  });
});

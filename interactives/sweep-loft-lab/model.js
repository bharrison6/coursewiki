/* Sweep and loft lab: pure procedural geometry (no DOM, no WebGL).
   Units are millimetres and degrees. This is not a CAD kernel.

   Sweep: a planar profile, centred on the path, is carried along the path in a
   rotation-minimising frame (double-reflection method, Wang et al. 2008). For a
   frame with no rotation about the tangent, the surface derivative along the
   path is t * (1 - kappa * (q . n)), where q is the profile point and n the unit
   direction to the centre of curvature. The surface folds where that factor
   reaches zero, so the LOCAL test flags a path point when the profile's extent
   toward the centre of curvature (its support value in direction n) is at least
   the local radius of curvature (Patrikalakis, Maekawa and Cho, Shape
   Interrogation, sect. 11.6.2). The local test is not a global validity test;
   the helix adds one separate coil-to-coil chord check, described below.

   Loft: three fixed profiles on parallel planes. Each profile is resampled by
   arc length from its chosen start point (connector), counter-clockwise.
   Corresponding vertices are joined in selection order by a uniform
   Catmull-Rom spline with reflected end points, which passes through every
   profile and is symmetric under reversal of the station order. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.CourseWikiSweepLoftModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TOL = 1e-9;
  var LIMITS = Object.freeze({
    size: Object.freeze({ min: 4, max: 40, step: 1 }),
    bend: Object.freeze({ min: 5, max: 60, step: 0.5 }),
    pitch: Object.freeze({ min: 12, max: 60, step: 1 })
  });
  var PATHS = ['arc', 's-curve', 'helix'];
  var SHAPES = ['circle', 'rectangle'];
  var ARC_LEG = 20;          // straight lead-in and lead-out on the arc path, mm
  var S_HALF_SPAN = 60;      // the S-curve spans 2 x 60 mm along x
  var HELIX_TURNS = 2.5;
  var CIRCLE_POINTS = 48;
  var RECT_SIDE_SEGMENTS = 12;

  /* ---------- small vector helpers ---------- */
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; }

  function plain(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
  function exactKeys(value, keys) {
    if (!plain(value)) return false;
    var a = Object.keys(value).sort(), b = keys.slice().sort();
    return a.length === b.length && a.every(function (k, i) { return k === b[i]; });
  }
  function inRange(v, lim) { return typeof v === 'number' && Number.isFinite(v) && v >= lim.min && v <= lim.max; }

  /* ---------- profiles ---------- */
  // u lies along frame axis e1 (in the bend plane for planar paths), v along e2.
  function sweepProfile(shape, size, turned) {
    var pts = [], hu, hv, i;
    if (shape === 'circle') {
      var r = size / 2;
      for (i = 0; i < CIRCLE_POINTS; i++) {
        var a = 2 * Math.PI * i / CIRCLE_POINTS;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      return {
        shape: shape, size: size, turned: false, width: size, height: size, halfU: r, halfV: r, points: pts, sharp: false,
        support: function () { return r; },
        radial: function () { return r; }
      };
    }
    var w = size, h = size / 2;
    hu = turned ? h / 2 : w / 2; hv = turned ? w / 2 : h / 2;
    // Four sides; each side carries both of its corners so normals stay sharp.
    var corners = [[hu, -hv], [hu, hv], [-hu, hv], [-hu, -hv]];
    for (var s = 0; s < 4; s++) {
      var c0 = corners[s], c1 = corners[(s + 1) % 4];
      for (i = 0; i <= RECT_SIDE_SEGMENTS; i++) {
        var f = i / RECT_SIDE_SEGMENTS;
        pts.push([c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f]);
      }
    }
    return {
      shape: shape, size: size, turned: !!turned, width: w, height: h, halfU: hu, halfV: hv, points: pts, sharp: true,
      // exact support value (extent) of the rectangle in unit direction (cu, cv)
      support: function (cu, cv) { return hu * Math.abs(cu) + hv * Math.abs(cv); },
      // exact distance from the centre to the boundary along (cu, cv)
      radial: function (cu, cv) {
        var a = Math.abs(cu) > 1e-15 ? hu / Math.abs(cu) : Infinity;
        var b = Math.abs(cv) > 1e-15 ? hv / Math.abs(cv) : Infinity;
        return Math.min(a, b);
      }
    };
  }

  /* ---------- paths (analytic position, tangent, curvature, centre direction) ---------- */
  function arcSamples(R) {
    var out = [], i, L = ARC_LEG, nLeg = 10, nArc = 120;
    for (i = 0; i < nLeg; i++) {
      out.push({ p: [R, -L + L * i / nLeg, 0], t: [0, 1, 0], kappa: 0, centre: null });
    }
    for (i = 0; i <= nArc; i++) {
      var phi = Math.PI * i / nArc;
      out.push({ p: [R * Math.cos(phi), R * Math.sin(phi), 0], t: [-Math.sin(phi), Math.cos(phi), 0], kappa: 1 / R, centre: [-Math.cos(phi), -Math.sin(phi), 0] });
    }
    for (i = 1; i <= nLeg; i++) {
      out.push({ p: [-R, -L * i / nLeg, 0], t: [0, -1, 0], kappa: 0, centre: null });
    }
    return out;
  }
  function sCurveAmplitude(rhoMin) { var k = Math.PI / S_HALF_SPAN; return 1 / (rhoMin * k * k); }
  function sCurvePoint(x, A) {
    var k = Math.PI / S_HALF_SPAN, y = A * Math.sin(k * x), y1 = A * k * Math.cos(k * x), y2 = -A * k * k * Math.sin(k * x);
    var q = Math.sqrt(1 + y1 * y1), kappa = Math.abs(y2) / (q * q * q);
    var t = [1 / q, y1 / q, 0], centre = null;
    if (kappa > 0) centre = y2 > 0 ? [-y1 / q, 1 / q, 0] : [y1 / q, -1 / q, 0];
    return { p: [x - S_HALF_SPAN, y, 0], t: t, kappa: kappa, centre: centre, x: x };
  }
  function sCurveSamples(rhoMin) {
    var A = sCurveAmplitude(rhoMin), span = 2 * S_HALF_SPAN, n = 6000, i;
    // arc-length table, then uniform arc-length samples plus the exact tightest points
    var xs = [], ss = [0], prev = sCurvePoint(0, A).p;
    for (i = 0; i <= n; i++) xs.push(span * i / n);
    for (i = 1; i <= n; i++) { var p = sCurvePoint(xs[i], A).p; ss.push(ss[i - 1] + len(sub(p, prev))); prev = p; }
    var total = ss[n], m = 360, want = [], j = 0;
    for (i = 0; i <= m; i++) {
      var target = total * i / m;
      while (j < n && ss[j + 1] < target) j++;
      var f = j < n ? (target - ss[j]) / Math.max(ss[j + 1] - ss[j], 1e-15) : 0;
      want.push(j < n ? xs[j] + (xs[j + 1] - xs[j]) * f : span);
    }
    want.push(S_HALF_SPAN / 2, 3 * S_HALF_SPAN / 2, S_HALF_SPAN);
    want.sort(function (a, b) { return a - b; });
    var clean = [];
    want.forEach(function (x) { if (!clean.length || x - clean[clean.length - 1] > 1e-9) clean.push(Math.min(Math.max(x, 0), span)); });
    return clean.map(function (x) { return sCurvePoint(x, A); });
  }
  function helixParams(a, pitch) {
    var h = pitch / (2 * Math.PI);
    // a rotation-minimising frame turns against the Frenet frame at the torsion rate,
    // so per turn it rolls tau * (arc length of one turn) = 2 pi h / sqrt(a^2 + h^2)
    return { a: a, h: h, pitch: pitch, turns: HELIX_TURNS, theta: 2 * Math.PI * HELIX_TURNS, rho: (a * a + h * h) / a, rollPerTurnDeg: 360 * h / Math.sqrt(a * a + h * h) };
  }
  function helixPoint(theta, hp) {
    var a = hp.a, h = hp.h, q = Math.sqrt(a * a + h * h), zMid = h * hp.theta / 2;
    return {
      p: [a * Math.cos(theta), a * Math.sin(theta), h * theta - zMid],
      t: [-a * Math.sin(theta) / q, a * Math.cos(theta) / q, h / q],
      kappa: a / (q * q), centre: [-Math.cos(theta), -Math.sin(theta), 0], theta: theta
    };
  }
  function helixSamples(hp) {
    var out = [], n = Math.round(96 * hp.turns);
    for (var i = 0; i <= n; i++) out.push(helixPoint(hp.theta * i / n, hp));
    return out;
  }

  /* ---------- rotation-minimising frames by double reflection ---------- */
  function rmf(samples, firstE1) {
    var e1 = unit(sub(firstE1, mul(samples[0].t, dot(firstE1, samples[0].t))));
    samples[0].e1 = e1; samples[0].e2 = cross(samples[0].t, e1);
    for (var i = 0; i < samples.length - 1; i++) {
      var a = samples[i], b = samples[i + 1];
      var v1 = sub(b.p, a.p), c1 = dot(v1, v1), rL, tL;
      if (c1 < 1e-24) { rL = a.e1; tL = a.t; }
      else {
        rL = sub(a.e1, mul(v1, 2 * dot(v1, a.e1) / c1));
        tL = sub(a.t, mul(v1, 2 * dot(v1, a.t) / c1));
      }
      var v2 = sub(b.t, tL), c2 = dot(v2, v2);
      var r = c2 < 1e-24 ? rL : sub(rL, mul(v2, 2 * dot(v2, rL) / c2));
      r = unit(sub(r, mul(b.t, dot(r, b.t))));
      b.e1 = r; b.e2 = cross(b.t, r);
    }
  }

  /* ---------- sweep ---------- */
  var SWEEP_KEYS = ['path', 'shape', 'size', 'bend', 'pitch', 'turned'];
  function validateSweep(p) {
    if (!exactKeys(p, SWEEP_KEYS)) return 'Use one path, profile shape, size, bend radius, pitch and turn setting.';
    if (PATHS.indexOf(p.path) < 0) return 'Choose an arc, S-curve or helix path.';
    if (SHAPES.indexOf(p.shape) < 0) return 'Choose a circle or rectangle profile.';
    if (!inRange(p.size, LIMITS.size)) return 'Profile size must be ' + LIMITS.size.min + ' to ' + LIMITS.size.max + ' mm.';
    if (!inRange(p.bend, LIMITS.bend)) return 'Bend radius must be ' + LIMITS.bend.min + ' to ' + LIMITS.bend.max + ' mm.';
    if (!inRange(p.pitch, LIMITS.pitch)) return 'Helix pitch must be ' + LIMITS.pitch.min + ' to ' + LIMITS.pitch.max + ' mm.';
    if (typeof p.turned !== 'boolean') return 'The rectangle turn setting must be on or off.';
    return '';
  }
  function classify(reach, rho) {
    if (!Number.isFinite(rho)) return 'clear';
    var d = reach - rho, tol = TOL * Math.max(1, rho);
    if (d < -tol) return 'clear';
    if (d <= tol) return 'degenerate';
    return 'folds';
  }
  function sweep(params) {
    var error = validateSweep(params);
    if (error) return { ok: false, error: error };
    var prof = sweepProfile(params.shape, params.size, params.turned), samples, hp = null, firstE1;
    if (params.path === 'arc') { samples = arcSamples(params.bend); firstE1 = cross([0, 0, 1], samples[0].t); }
    else if (params.path === 's-curve') { samples = sCurveSamples(params.bend); firstE1 = cross([0, 0, 1], samples[0].t); }
    else { hp = helixParams(params.bend, params.pitch); samples = helixSamples(hp); firstE1 = samples[0].centre; }
    rmf(samples, firstE1);
    var s = 0, i, j;
    for (i = 0; i < samples.length; i++) {
      var sm = samples[i];
      if (i) s += len(sub(sm.p, samples[i - 1].p));
      sm.s = s;
      sm.rho = sm.kappa > 0 ? 1 / sm.kappa : Infinity;
      if (sm.centre) {
        var cu = dot(sm.centre, sm.e1), cv = dot(sm.centre, sm.e2), cl = Math.sqrt(cu * cu + cv * cv);
        sm.centreUV = [cu / cl, cv / cl];
        sm.reach = prof.support(cu / cl, cv / cl);
      } else { sm.centreUV = null; sm.reach = 0; }
      sm.margin = sm.rho - sm.reach;
      sm.state = classify(sm.reach, sm.rho);
      sm.flagged = sm.state !== 'clear';
    }
    var total = s, N = prof.points.length, rings = [], fold = [];
    for (i = 0; i < samples.length; i++) {
      var q = samples[i], ring = [], fr = [];
      for (j = 0; j < N; j++) {
        var u = prof.points[j][0], v = prof.points[j][1];
        var off = add(mul(q.e1, u), mul(q.e2, v));
        ring.push(add(q.p, off));
        fr.push(q.centre ? 1 - q.kappa * dot(off, q.centre) : 1);
      }
      rings.push(ring); fold.push(fr);
    }
    var flaggedLength = 0, minRho = Infinity, worstMargin = Infinity, maxReach = 0, firstFlag = null, state = 'clear';
    for (i = 0; i < samples.length; i++) {
      var c = samples[i];
      minRho = Math.min(minRho, c.rho);
      worstMargin = Math.min(worstMargin, c.margin);
      maxReach = Math.max(maxReach, c.reach);
      if (c.flagged && firstFlag === null) firstFlag = c.s;
      if (c.state === 'folds') state = 'folds';
      else if (c.state === 'degenerate' && state === 'clear') state = 'degenerate';
      if (i && c.flagged && samples[i - 1].flagged) flaggedLength += c.s - samples[i - 1].s;
    }
    var result = {
      ok: true,
      params: { path: params.path, shape: params.shape, size: params.size, bend: params.bend, pitch: params.pitch, turned: params.turned },
      profile: prof,
      samples: samples,
      rings: rings,
      fold: fold,
      length: total,
      summary: {
        state: state, minRho: minRho, worstMargin: worstMargin, maxReach: maxReach,
        flaggedLength: flaggedLength, flaggedFraction: total > 0 ? flaggedLength / total : 0, firstFlag: firstFlag
      },
      helix: hp,
      coil: hp ? coilCheck(samples, prof, hp) : null
    };
    result.global = globalStatus(result);
    result.overall = state !== 'clear' ? 'fails-local' : result.global.status === 'clash' ? 'fails-clash' : result.global.status === 'clear' ? 'builds' : 'local-pass';
    return result;
  }

  /* What the lab can establish beyond the local test. It never runs a general
     collision search, so it claims clearance only where geometry proves it:
     - arc (planar U-bend) with the local test passing: every profile slice lies in
       a plane through the arc centre or on a straight leg; arc slices sit on the
       y >= 0 side and leg slices on y <= 0, the half-width across the bend is
       below R, and the legs are 2R apart, so no two slices meet;
     - helix with the chord check touching: the two profiles reach each other along
       a chord that lies in both normal planes, so a clash is proven.
     A passing local test anywhere else (S-curve, helix without chord contact) is
     reported as only that: global clearance is not established. */
  function globalStatus(r) {
    if (r.summary.state !== 'clear') return { status: 'not-evaluated', basis: 'The local test already fails.' };
    if (r.params.path === 'arc') return { status: 'clear', basis: 'U-bend geometry: half-width across the bend below the bend radius and legs 2R apart.' };
    if (r.coil && r.coil.touches) return { status: 'clash', basis: 'Neighbouring coils reach each other along the chord between them.' };
    if (r.params.path === 'helix') return { status: 'unknown', basis: 'The neighbouring-coil chord check can prove a clash but never clearance; other parts of the sections are not searched.' };
    return { status: 'unknown', basis: 'This lab does not search distant parts of this path for clashes.' };
  }

  /* Separate helix coil check. For a helix every stationary chord length is a
     double-normal chord (by the helix's screw symmetry), so the chord lies in the
     normal planes at both ends. Two profiles reach each other along that chord
     when their boundary distances along it add up to the chord length. For a
     circle or a rectangle that is a sufficient condition for contact; finding no
     contact on that chord does NOT establish clearance (sections can meet off
     the chord, e.g. a turned 12 x 6 bar on an 8 mm coil with 12 mm pitch). */
  function coilDistance(delta, hp) { return Math.sqrt(2 * hp.a * hp.a * (1 - Math.cos(delta)) + hp.h * hp.h * delta * delta); }
  function coilCheck(samples, prof, hp) {
    var n = 6000, best = null, prev = coilDistance(hp.theta / n, hp), cur, next, i;
    for (i = 2; i < n; i++) {
      cur = coilDistance(hp.theta * i / n, hp); next = coilDistance(hp.theta * (i + 1) / n, hp);
      if (cur <= prev && cur <= next) {
        // golden-section refine on [i-1, i+1]
        var lo = hp.theta * (i - 1) / n, hi = hp.theta * (i + 1) / n, g = (Math.sqrt(5) - 1) / 2;
        for (var k = 0; k < 80; k++) {
          var m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo);
          if (coilDistance(m1, hp) < coilDistance(m2, hp)) hi = m2; else lo = m1;
        }
        var d = (lo + hi) / 2, dist = coilDistance(d, hp);
        if (!best || dist < best.distance) best = { delta: d, distance: dist };
      }
      prev = cur;
    }
    if (!best) return { method: 'double-normal chord', distance: null, delta: null, reachSum: 0, touches: false };
    // evaluate the boundary distances along the chord at sampled start angles
    var reachSum = 0, step = hp.theta / (samples.length - 1);
    for (i = 0; i < samples.length; i++) {
      var th = samples[i].theta, th2 = th + best.delta;
      if (th2 > hp.theta + 1e-12) break;
      var j0 = Math.min(Math.floor(th2 / step), samples.length - 2), f = th2 / step - j0;
      var A = samples[j0], B = samples[j0 + 1];
      var e1 = unit(add(mul(A.e1, 1 - f), mul(B.e1, f))), other = helixPoint(th2, hp);
      e1 = unit(sub(e1, mul(other.t, dot(e1, other.t))));
      var e2 = cross(other.t, e1), u = unit(sub(other.p, samples[i].p));
      var ri = prof.radial(dot(u, samples[i].e1), dot(u, samples[i].e2));
      var rj = prof.radial(-dot(u, e1), -dot(u, e2));
      reachSum = Math.max(reachSum, ri + rj);
    }
    return {
      method: 'double-normal chord', distance: best.distance, delta: best.delta, reachSum: reachSum,
      touches: reachSum >= best.distance - TOL * Math.max(1, best.distance)
    };
  }

  /* ---------- loft ---------- */
  var LOFT_PROFILES = Object.freeze([
    Object.freeze({ id: 'square', label: 'Square 60 × 60', short: 'Square', z: 0 }),
    Object.freeze({ id: 'circle', label: 'Circle Ø44', short: 'Circle', z: 45 }),
    Object.freeze({ id: 'slot', label: 'Slot 56 × 24', short: 'Slot', z: 90 })
  ]);
  var LOFT_N = 64, SPAN_RINGS = 32, SPAN_CHECKS = 96;
  var SQ = 30, CR = 22, SLOT_HX = 28, SLOT_R = 12, SLOT_C = SLOT_HX - SLOT_R;

  function perimeter(id) {
    if (id === 'square') return 8 * SQ;
    if (id === 'circle') return 2 * Math.PI * CR;
    return 2 * Math.PI * SLOT_R + 4 * SLOT_C;
  }
  // point at arc length sigma (counter-clockwise from the rightmost mid point)
  function boundaryPoint(id, sigma) {
    var P = perimeter(id); sigma = ((sigma % P) + P) % P;
    if (id === 'circle') { var a = sigma / CR; return [CR * Math.cos(a), CR * Math.sin(a)]; }
    if (id === 'square') {
      var a2 = SQ;
      if (sigma <= a2) return [a2, sigma];
      if (sigma <= 3 * a2) return [a2 - (sigma - a2), a2];
      if (sigma <= 5 * a2) return [-a2, a2 - (sigma - 3 * a2)];
      if (sigma <= 7 * a2) return [-a2 + (sigma - 5 * a2), -a2];
      return [a2, -a2 + (sigma - 7 * a2)];
    }
    var q = Math.PI * SLOT_R / 2, c = SLOT_C, r = SLOT_R;
    if (sigma <= q) { var t1 = sigma / r; return [c + r * Math.cos(t1), r * Math.sin(t1)]; }
    if (sigma <= q + 2 * c) return [c - (sigma - q), r];
    if (sigma <= 3 * q + 2 * c) { var t2 = Math.PI / 2 + (sigma - q - 2 * c) / r; return [-c + r * Math.cos(t2), r * Math.sin(t2)]; }
    if (sigma <= 3 * q + 4 * c) return [-c + (sigma - 3 * q - 2 * c), -r];
    var t3 = -Math.PI / 2 + (sigma - 3 * q - 4 * c) / r; return [c + r * Math.cos(t3), r * Math.sin(t3)];
  }
  // arc length of the boundary point hit by a ray from the centre at angle deg
  function startSigma(id, deg) {
    var P = perimeter(id), a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    if (id === 'circle') return ((a * CR) % P + P) % P;
    var target;
    if (id === 'square') { var k = SQ / Math.max(Math.abs(ca), Math.abs(sa)); target = [k * ca, k * sa]; }
    else {
      // ray against the slot: straight sides y = +-r for |x| <= c, else end caps
      var tFlat = Math.abs(sa) > 1e-15 ? SLOT_R / Math.abs(sa) : Infinity;
      if (Math.abs(tFlat * ca) <= SLOT_C + 1e-12) target = [tFlat * ca, tFlat * sa];
      else {
        var cx = ca >= 0 ? SLOT_C : -SLOT_C, b = -2 * cx * ca, cc = cx * cx - SLOT_R * SLOT_R;
        var tt = (-b + Math.sqrt(b * b - 4 * cc)) / 2; target = [tt * ca, tt * sa];
      }
    }
    // invert by dense search then refine (boundary is piecewise smooth and simple)
    var best = 0, bestD = Infinity, n = 4096, i;
    for (i = 0; i < n; i++) {
      var pt = boundaryPoint(id, P * i / n), d = (pt[0] - target[0]) * (pt[0] - target[0]) + (pt[1] - target[1]) * (pt[1] - target[1]);
      if (d < bestD) { bestD = d; best = P * i / n; }
    }
    var lo = best - P / n, hi = best + P / n, g = (Math.sqrt(5) - 1) / 2;
    function dist(sg) { var p2 = boundaryPoint(id, sg); return (p2[0] - target[0]) * (p2[0] - target[0]) + (p2[1] - target[1]) * (p2[1] - target[1]); }
    for (i = 0; i < 100; i++) { var m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo); if (dist(m1) < dist(m2)) hi = m2; else lo = m1; }
    var sg = (lo + hi) / 2;
    // snap to an exact corner/joint when within numerical noise
    var snaps = id === 'square' ? [0, SQ, 3 * SQ, 5 * SQ, 7 * SQ, P] : [];
    snaps.forEach(function (v) { if (Math.abs(sg - v) < 1e-7) sg = v; });
    return ((sg % P) + P) % P;
  }
  function loftProfile(id, deg) {
    var P = perimeter(id), s0 = startSigma(id, deg), pts = [];
    for (var i = 0; i < LOFT_N; i++) pts.push(boundaryPoint(id, s0 + P * i / LOFT_N));
    return pts;
  }
  function profileById(id) { for (var i = 0; i < LOFT_PROFILES.length; i++) if (LOFT_PROFILES[i].id === id) return LOFT_PROFILES[i]; return null; }

  function validateLoft(p) {
    if (!exactKeys(p, ['order', 'starts'])) return 'Use one profile order and one start point per profile.';
    if (!Array.isArray(p.order) || p.order.length !== 3) return 'Select all three profiles once.';
    var seen = {};
    for (var i = 0; i < 3; i++) {
      if (!profileById(p.order[i])) return 'Unknown profile in the selection order.';
      if (seen[p.order[i]]) return 'Select each profile once.';
      seen[p.order[i]] = true;
    }
    if (!exactKeys(p.starts, ['square', 'circle', 'slot'])) return 'Give a start point for the square, circle and slot.';
    for (var k in p.starts) {
      var v = p.starts[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= 360) return 'Start points are whole degrees from 0 to 359.';
    }
    return '';
  }
  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t, out = [];
    for (var k = 0; k < 3; k++) {
      out.push(0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
    }
    return out;
  }
  function polyArea(ring) {
    var a = 0;
    for (var i = 0; i < ring.length; i++) { var p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return a / 2;
  }
  function segmentsCross(a, b, c, d) {
    function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    var d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function isSimple(ring) {
    var n = ring.length;
    for (var i = 0; i < n; i++) {
      var a = ring[i], b = ring[(i + 1) % n];
      for (var j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segmentsCross(a, b, ring[j], ring[(j + 1) % n])) return false;
      }
    }
    return true;
  }
  function polarAngle(p, c) { return Math.atan2(p[1] - c[1], p[0] - c[0]); }
  function wrapDeg(d) { while (d > 180) d -= 360; while (d <= -180) d += 360; return d; }

  function loft(params) {
    var error = validateLoft(params);
    if (error) return { ok: false, error: error };
    var order = params.order.slice(), starts = { square: params.starts.square, circle: params.starts.circle, slot: params.starts.slot };
    var stations = order.map(function (id) {
      var meta = profileById(id), flat = loftProfile(id, starts[id]);
      return { id: id, z: meta.z, start: starts[id], points: flat.map(function (q) { return [q[0], q[1], meta.z]; }) };
    });
    // reflected phantom stations keep the spline symmetric under reversal
    function phantom(a, b) { return a.points.map(function (p, i) { return sub(mul(p, 2), b.points[i]); }); }
    var P = [phantom(stations[0], stations[1])].concat(stations.map(function (s) { return s.points; }), [phantom(stations[2], stations[1])]);
    function ringAt(span, t) {
      var r = [];
      for (var i = 0; i < LOFT_N; i++) r.push(catmull(P[span][i], P[span + 1][i], P[span + 2][i], P[span + 3][i], t));
      return r;
    }
    var rings = [], ringSpan = [], ringT = [], span, k;
    for (span = 0; span < 2; span++) {
      for (k = 0; k <= SPAN_RINGS; k++) {
        if (span === 1 && k === 0) continue;
        var t = k / SPAN_RINGS;
        rings.push(ringAt(span, t)); ringSpan.push(span); ringT.push(t);
      }
    }
    // dense section checks: collapse (area minimum reaching zero), crossing or inversion
    var refArea = Math.min.apply(null, stations.map(function (s) { return Math.abs(polyArea(s.points)); }));
    var bad = [], minAreaRatio = Infinity, crossing = false, degenerate = false;
    for (span = 0; span < 2; span++) {
      var areas = [];
      for (k = 0; k <= SPAN_CHECKS; k++) {
        var tt = k / SPAN_CHECKS, ring = ringAt(span, tt), area = polyArea(ring);
        areas.push(area);
        minAreaRatio = Math.min(minAreaRatio, area / refArea);
        if (area <= 0 || !isSimple(ring)) { crossing = crossing || area < 0 || !isSimple(ring); bad.push({ span: span, t: tt, kind: area <= 0 ? 'inverted' : 'crossing' }); }
      }
      for (k = 1; k < SPAN_CHECKS; k++) {
        if (areas[k] <= areas[k - 1] && areas[k] <= areas[k + 1] && areas[k] < 0.05 * refArea) {
          var lo = (k - 1) / SPAN_CHECKS, hi = (k + 1) / SPAN_CHECKS, g = (Math.sqrt(5) - 1) / 2;
          for (var it = 0; it < 80; it++) {
            var m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo);
            if (polyArea(ringAt(span, m1)) < polyArea(ringAt(span, m2))) hi = m2; else lo = m1;
          }
          var tm = (lo + hi) / 2, am = polyArea(ringAt(span, tm));
          minAreaRatio = Math.min(minAreaRatio, am / refArea);
          if (am <= 1e-6 * refArea) { degenerate = true; bad.push({ span: span, t: tm, kind: 'collapsed' }); }
        }
      }
    }
    var halfStep = 0.5 / SPAN_RINGS;
    var ringBad = rings.map(function (_, r) {
      return bad.some(function (b) { return b.span === ringSpan[r] && Math.abs(b.t - ringT[r]) <= halfStep + 1e-12; });
    });
    // station order: does the loft double back along its axis?
    var zc = rings.map(function (r) { return r[0][2]; });
    var runs = [], startIdx = 0, dir = 0;
    for (var r = 1; r < zc.length; r++) {
      var d = Math.sign(Math.round((zc[r] - zc[r - 1]) * 1e9));
      if (d === 0) continue;
      if (dir === 0) dir = d;
      else if (d !== dir) { runs.push([startIdx, r - 1]); startIdx = r - 1; dir = d; }
    }
    runs.push([startIdx, zc.length - 1]);
    var ringDoubled = rings.map(function () { return false; });
    if (runs.length > 1) {
      runs.forEach(function (run, ri) {
        for (var q = run[0]; q <= run[1]; q++) {
          ringDoubled[q] = runs.some(function (other, oi) {
            if (oi === ri) return false;
            var zs = zc.slice(other[0], other[1] + 1), lo2 = Math.min.apply(null, zs), hi2 = Math.max.apply(null, zs);
            return zc[q] > lo2 + 1e-9 && zc[q] < hi2 - 1e-9;
          });
        }
      });
    }
    var folded = runs.length > 1;
    // twist between consecutive stations: circular mean of the angle from each
    // vertex to its partner about the shared loft axis (all profiles are centred on it)
    var twists = [0, 1].map(function (sp) {
      var A = stations[sp].points, B = stations[sp + 1].points, sx = 0, sy = 0;
      for (var i = 0; i < LOFT_N; i++) {
        var d = polarAngle(B[i], [0, 0]) - polarAngle(A[i], [0, 0]);
        sx += Math.cos(d); sy += Math.sin(d);
      }
      var deg = Math.atan2(sy, sx) * 180 / Math.PI;
      if (Math.abs(Math.abs(deg) - 180) < 1e-6) deg = 180;
      return Math.abs(deg) < 1e-9 ? 0 : wrapDeg(deg);
    });
    var twisted = twists.some(function (tw) { return Math.abs(tw) >= 0.5; });
    var state = folded ? 'folded' : (crossing || degenerate) ? 'pinched' : twisted ? 'twisted' : 'matched';
    return {
      ok: true,
      params: { order: order, starts: starts },
      stations: stations,
      rings: rings,
      ringSpan: ringSpan,
      ringT: ringT,
      ringBad: ringBad,
      ringDoubled: ringDoubled,
      spanRings: SPAN_RINGS,
      n: LOFT_N,
      summary: { state: state, twists: twists, minAreaRatio: minAreaRatio, crossing: crossing, degenerate: degenerate, folded: folded, badSections: bad.length, checkedSections: 2 * (SPAN_CHECKS + 1) }
    };
  }

  /* ---------- formatting ---------- */
  function fmt(value, digits) {
    if (value === Infinity) return '∞';
    if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
    var d = digits == null ? 1 : digits, s = value.toFixed(d);
    if (d > 0) s = s.replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  }
  function defaults() { return { path: 'arc', shape: 'circle', size: 16, bend: 20, pitch: 30, turned: false }; }
  function loftDefaults() { return { order: ['square', 'circle', 'slot'], starts: { square: 0, circle: 0, slot: 0 } }; }

  return {
    TOL: TOL, LIMITS: LIMITS, PATHS: PATHS.slice(), SHAPES: SHAPES.slice(), LOFT_PROFILES: LOFT_PROFILES,
    ARC_LEG: ARC_LEG, HELIX_TURNS: HELIX_TURNS,
    sweep: sweep, validateSweep: validateSweep, classify: classify, sweepProfile: sweepProfile,
    loft: loft, validateLoft: validateLoft, loftProfile: loftProfile, polyArea: polyArea, isSimple: isSimple,
    sCurveAmplitude: sCurveAmplitude, helixParams: helixParams, coilDistance: coilDistance,
    defaults: defaults, loftDefaults: loftDefaults, fmt: fmt
  };
});

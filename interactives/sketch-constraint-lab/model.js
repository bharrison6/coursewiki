/* Four-variable axis-aligned rectangle model. Shape and orientation are built in;
   only xL,xR,yB,yT vary. Linear equality rank counts independent conditions.
   Positive sizes are an open domain restriction, not extra equality constraints.
   Projection to the nearest solution of the active equalities is a lab convention;
   size-domain violations are rejected, not optimized along the domain boundary.
   This is not a vendor solver claim. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SketchConstraintModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var EPS = 1e-8;
  function dot(a, b) { return a.reduce(function (sum, x, i) { return sum + x * b[i]; }, 0); }
  function clean(x) { return Math.abs(x) < EPS ? 0 : x; }
  function defaults() { return { anchor: 'corner', width: 64, height: 22, widthOn: true,
    heightOn: true, anchorX: true, anchorY: true, extra: 'none', extraWidth: 64 }; }
  function initial(anchor) { return anchor === 'center' ? [-32, 32, -11, 11] : [0, 64, 0, 22]; }
  function validate(s) {
    if (!s || !['corner', 'center'].includes(s.anchor)) return 'Choose a corner or center anchor.';
    var active = [];
    if (s.widthOn) active.push(s.width);
    if (s.heightOn) active.push(s.height);
    if (s.extra === 'driving') active.push(s.extraWidth);
    if (!active.every(function (x) { return typeof x === 'number' && Number.isFinite(x) && x >= 1 && x <= 120; }))
      return 'Enter dimensions from 1 to 120 mm. Blank, zero and negative sizes are not accepted.';
    if (!['none', 'reference', 'driving'].includes(s.extra)) return 'Unknown top-edge dimension mode.';
    return '';
  }
  function constraints(s) {
    var rows = [];
    function add(id, a, b) { rows.push({ id: id, a: a, b: b }); }
    if (s.widthOn) add('width', [-1, 1, 0, 0], s.width);
    if (s.heightOn) add('height', [0, 0, -1, 1], s.height);
    if (s.anchorX) add('anchor-x', s.anchor === 'center' ? [1, 1, 0, 0] : [1, 0, 0, 0], 0);
    if (s.anchorY) add('anchor-y', s.anchor === 'center' ? [0, 0, 1, 1] : [0, 0, 1, 0], 0);
    if (s.extra === 'driving') add('top-width', [-1, 1, 0, 0], s.extraWidth);
    return rows;
  }
  // RREF supplies both a consistency test and a basis for the remaining motion.
  function solve(rows, preferred) {
    var m = rows.map(function (r) { return r.a.concat(r.b); }), pivots = [], rank = 0;
    for (var c = 0; c < 4 && rank < m.length; c++) {
      var pivot = rank;
      for (var i = rank + 1; i < m.length; i++) if (Math.abs(m[i][c]) > Math.abs(m[pivot][c])) pivot = i;
      if (Math.abs(m[pivot][c]) < EPS) continue;
      var swap = m[rank]; m[rank] = m[pivot]; m[pivot] = swap;
      var factor = m[rank][c];
      m[rank] = m[rank].map(function (v) { return v / factor; });
      for (var j = 0; j < m.length; j++) if (j !== rank) {
        var scale = m[j][c];
        m[j] = m[j].map(function (v, k) { return clean(v - scale * m[rank][k]); });
      }
      pivots.push(c); rank++;
    }
    if (m.some(function (r) { return r.slice(0, 4).every(function (x) { return Math.abs(x) < EPS; }) && Math.abs(r[4]) > EPS; }))
      return { ok: false, rank: rank, dof: null, count: rows.length, reason: 'contradiction' };
    var base = [0, 0, 0, 0], basis = [];
    pivots.forEach(function (c, i) { base[c] = m[i][4]; });
    for (var f = 0; f < 4; f++) if (!pivots.includes(f)) {
      var v = [0, 0, 0, 0]; v[f] = 1;
      pivots.forEach(function (c, i) { v[c] = -m[i][f]; });
      basis.forEach(function (u) { var p = dot(v, u); v = v.map(function (x, k) { return x - p * u[k]; }); });
      var norm = Math.sqrt(dot(v, v)); basis.push(v.map(function (x) { return x / norm; }));
    }
    var delta = preferred.map(function (x, k) { return x - base[k]; });
    basis.forEach(function (u) { var p = dot(delta, u); base = base.map(function (x, k) { return x + p * u[k]; }); });
    return { ok: true, geometry: base.map(clean), rank: rank, dof: 4 - rank, count: rows.length,
      redundant: rows.length - rank, basis: basis };
  }
  function validGeometry(g) { return g.every(Number.isFinite) && g[1] - g[0] >= 1 - EPS && g[3] - g[2] >= 1 - EPS && g[1] - g[0] <= 120 + EPS && g[3] - g[2] <= 120 + EPS; }
  function evaluate(s, previous) {
    var error = validate(s);
    if (error) return { ok: false, reason: 'input', error: error, geometry: previous.slice(), dof: null };
    var result = solve(constraints(s), previous);
    if (!result.ok) return Object.assign(result, { geometry: previous.slice(), error: 'The two driving widths disagree. No feasible rectangle satisfies this set. Last valid drawing retained.' });
    if (!validGeometry(result.geometry)) return Object.assign(result, { ok: false, reason: 'domain', dof: null, geometry: previous.slice(), error: 'That change would leave the lab’s positive 1–120 mm size range. Last valid drawing retained.' });
    return result;
  }
  // Diagnose one corner: add a temporary requested coordinate only when it can
  // coexist with the actual constraints. These probes never change their rank.
  function move(s, previous, indices, requested) {
    var current = evaluate(s, previous);
    if (!current.ok) return current;
    var rows = constraints(s), g = current.geometry.slice();
    indices.forEach(function (index, n) {
      if (!Number.isFinite(requested[n])) return;
      var a = [0, 0, 0, 0]; a[index] = 1;
      var pin = { a: a, b: requested[n] }, attempt = solve(rows.concat(pin), g);
      if (attempt.ok && validGeometry(attempt.geometry)) { g = attempt.geometry; rows.push(pin); }
    });
    return Object.assign(current, { geometry: g.map(clean), moved: g.some(function (v, i) { return Math.abs(v - previous[i]) > EPS; }) });
  }
  function measurements(g) { return { width: g[1] - g[0], height: g[3] - g[2], centerX: (g[0] + g[1]) / 2, centerY: (g[2] + g[3]) / 2 }; }
  return { defaults: defaults, initial: initial, validate: validate, constraints: constraints,
    solve: solve, evaluate: evaluate, move: move, measurements: measurements };
});

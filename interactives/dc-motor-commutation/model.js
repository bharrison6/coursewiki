(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCommutation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Bounded teaching model: ideal rectangular coil(s) in a uniform field.
  //
  // Geometry. x points from the left magnet face to the right one, y is up, and
  // z runs along the shaft toward the commutator end, where the end view looks
  // from. The rotor angle `alpha` is the direction of the coil's marked normal
  // n, measured counter-clockwise from +x as seen from the commutator end.
  // Side A of a coil sits at r(-sin alpha, cos alpha); side B is opposite.
  // The drawings label coil 1's sides 1 (A) and 2 (B), and coil 2's sides 3 and 4.
  //
  // theta, the angle the learner sees, is the angle from B to n. With the
  // default magnets B points along +x, so theta = alpha. Swapping the magnets
  // reverses B, so the same rotor position has theta = alpha + 180 degrees.
  //
  // Current is signed per coil side A: +1 flows toward the commutator end
  // (out of the end view), -1 flows away. Side B always carries the opposite.
  // F = I L x B gives a force along +/-y on each side; the torque about the
  // shaft, positive counter-clockwise from the commutator end, is
  //   tau = -sA * N B I A * sin(theta).
  // All results are normalized to one coil's peak N B I A.
  const DEG = Math.PI / 180;
  const MODES = Object.freeze(['commutator', 'slip']);

  function finite(name, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(name + ' must be a finite number.');
    return value;
  }
  function wrap(deg) {
    finite('Angle', deg);
    let d = deg % 360;
    if (d < 0) d += 360;
    if (d === 360 || Object.is(d, -0)) d = 0;
    return d;
  }
  // Exact zeros and ones at the quarter turns keep the boundary cases honest.
  function sinDeg(deg) {
    const w = wrap(deg);
    if (w === 0 || w === 180) return 0;
    if (w === 90) return 1;
    if (w === 270) return -1;
    return Math.sin(w * DEG);
  }
  function cosDeg(deg) { return sinDeg(deg + 90); }
  function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }

  function options(input) {
    const o = Object.assign({ mode: 'commutator', coils: 1, supply: 1, field: 1 }, input || {});
    if (!MODES.includes(o.mode)) throw new RangeError('Use mode "commutator" or "slip".');
    if (o.coils !== 1 && o.coils !== 2) throw new RangeError('Use one coil or two coils.');
    if (o.supply !== 1 && o.supply !== -1) throw new RangeError('Supply polarity must be +1 or -1.');
    if (o.field !== 1 && o.field !== -1) throw new RangeError('Magnet polarity must be +1 or -1.');
    return Object.freeze({ mode: o.mode, coils: o.coils, supply: o.supply, field: o.field });
  }
  function thetaFromAlpha(alpha, field) { return wrap(alpha + (field === -1 ? 180 : 0)); }
  function alphaFromTheta(theta, field) { return wrap(theta - (field === -1 ? 180 : 0)); }

  // Signed current in side A of a coil whose normal is at rotor angle alpha.
  // Slip rings: fixed by the supply. Split ring: the brushes change segment
  // as the coil passes the neutral plane (sin alpha = 0); exactly there the
  // brushes sit on the gaps and the coil carries no current.
  function sideCurrent(alpha, opts) {
    const o = options(opts);
    if (o.mode === 'slip') return -o.supply;
    const s = sign(sinDeg(alpha));
    return s === 0 ? 0 : -o.supply * s;
  }

  function coil(alpha, o, index) {
    const a = wrap(alpha + 90 * index);
    const theta = thetaFromAlpha(a, o.field);
    const current = sideCurrent(a, o);
    const s = sinDeg(a), c = cosDeg(a);
    // Force per unit B I L on each long side: F = I L x B, along y only.
    const forceA = current * o.field, forceB = -forceA;
    // Torque per unit N B I A; A = 2 r L, so each side contributes half.
    const torque = -current * sinDeg(theta) + 0;
    return Object.freeze({
      index, alpha: a, theta, current,
      normal: Object.freeze({ x: c, y: s }),
      sideA: Object.freeze({ x: -s, y: c, force: forceA }),
      sideB: Object.freeze({ x: s, y: -c, force: forceB }),
      // Perpendicular distance from the shaft to each force's line of action,
      // as a fraction of the coil half-width.
      lever: Math.abs(s),
      torque: torque === 0 ? 0 : torque,
      // Split ring: brushes press on the top and bottom of the commutator. The
      // segment joined to side A spans alpha-90..alpha+90 (centred on n), so it
      // meets the top brush while sin(alpha) > 0 and the bottom brush while
      // sin(alpha) < 0; at the neutral plane both brushes sit on the gaps.
      segmentABrush: o.mode === 'slip' ? 'ring' : (s > 0 ? 'top' : s < 0 ? 'bottom' : 'gap')
    });
  }

  function analyze(alpha, opts) {
    const o = options(opts);
    const a = wrap(finite('Rotor angle', alpha));
    const coils = [coil(a, o, 0)];
    if (o.coils === 2) coils.push(coil(a, o, 1));
    const total = coils.reduce((sum, k) => sum + k.torque, 0);
    return Object.freeze({
      alpha: a, theta: thetaFromAlpha(a, o.field), options: o,
      coils: Object.freeze(coils), total: Math.abs(total) < 1e-12 ? 0 : total,
      // Which way the torque turns the rotor, seen from the commutator end.
      sense: total > 1e-12 ? 'counterclockwise' : total < -1e-12 ? 'clockwise' : 'none',
      // The top brush (split ring) or side-A ring brush (slip rings) is the
      // supply's positive side when supply = +1.
      topBrush: o.supply === 1 ? '+' : '-'
    });
  }
  function torqueAtTheta(theta, opts) {
    const o = options(opts);
    return analyze(alphaFromTheta(wrap(theta), o.field), o).total;
  }

  function sweep(opts, count) {
    const n = count === undefined ? 3600 : count;
    if (!Number.isInteger(n) || n < 4 || n > 36000) throw new RangeError('Use 4 to 36,000 samples per turn.');
    const o = options(opts), out = [];
    for (let i = 0; i < n; i += 1) out.push(torqueAtTheta(360 * (i + 0.5) / n, o));
    return out;
  }
  // Average torque over one full turn (midpoint rule), normalized.
  function turnAverage(opts, count) {
    const values = sweep(opts, count);
    return values.reduce((s, v) => s + v, 0) / values.length;
  }
  // Smallest and largest total torque magnitude over a turn, sampled on
  // whole-degree and half-degree angles so the exact extremes are included.
  function ripple(opts) {
    const o = options(opts);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 720; i += 1) {
      const v = torqueAtTheta(i / 2, o);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const oneSign = min >= 0 || max <= 0;
    const lo = oneSign ? Math.min(Math.abs(min), Math.abs(max)) : 0;
    const hi = Math.max(Math.abs(min), Math.abs(max));
    return Object.freeze({ min, max, oneDirection: oneSign, ratio: oneSign && hi > 0 ? lo / hi : null });
  }

  // Ideal torque in SI units: tau = N B I A sin(theta), commutated |sin|.
  // These are the formula's inputs, not a motor rating.
  function torqueSI(input) {
    const v = input || {};
    const turns = v.turns, field = finite('Field', v.fieldT), current = finite('Current', v.currentA), area = finite('Area', v.areaM2);
    const theta = finite('Angle', v.thetaDeg);
    if (!Number.isInteger(turns) || turns < 1 || turns > 10000) throw new RangeError('Use 1 to 10,000 whole turns.');
    if (field < 0 || field > 3) throw new RangeError('Use a field magnitude from 0 to 3 T.');
    if (current < 0 || current > 1000) throw new RangeError('Use a current magnitude from 0 to 1,000 A.');
    if (area <= 0 || area > 1) throw new RangeError('Use a coil area above 0 and at most 1 square metre.');
    const mode = v.mode === undefined ? 'commutator' : v.mode;
    if (!MODES.includes(mode)) throw new RangeError('Use mode "commutator" or "slip".');
    const peak = turns * field * current * area;
    const s = sinDeg(theta);
    return Object.freeze({ peak, torque: mode === 'slip' ? peak * s : peak * Math.abs(s) });
  }

  // What the torque does just either side of a rotor angle. Angles grow
  // counter-clockwise and positive torque is counter-clockwise, so torque > 0
  // just before and < 0 just after pushes the rotor back: a stable rest angle.
  //   driven      torque is not zero here
  //   stable      zero here, both neighbours push back toward it
  //   unstable    zero here, both neighbours push away from it
  //   through     zero here, both neighbours push the same way (a dead spot
  //               that a moving rotor passes through); see direction
  //   none        zero here and on both sides
  function neighbourhood(alpha, opts, probeDeg) {
    const o = options(opts);
    const p = probeDeg === undefined ? 1 : finite('Probe angle', probeDeg);
    if (p <= 0 || p > 10) throw new RangeError('Use a probe angle above 0 and at most 10 degrees.');
    const a = wrap(finite('Rotor angle', alpha));
    const at = analyze(a, o).total, before = analyze(a - p, o).total, after = analyze(a + p, o).total;
    let kind = 'none', direction = 'none';
    if (at !== 0) { kind = 'driven'; direction = at > 0 ? 'counterclockwise' : 'clockwise'; }
    else if (before > 0 && after < 0) kind = 'stable';
    else if (before < 0 && after > 0) kind = 'unstable';
    else if (before > 0 && after > 0) { kind = 'through'; direction = 'counterclockwise'; }
    else if (before < 0 && after < 0) { kind = 'through'; direction = 'clockwise'; }
    return Object.freeze({ kind, direction, at, before, after });
  }

  // Qualitative motion for the animation only. The inertia and friction
  // constants are illustrative choices that make the torque visible; they are
  // not measured, and the result is not a speed prediction (no back EMF).
  const ILLUSTRATIVE = Object.freeze({ gain: 9, friction: 2 });
  function illustrativeStep(state, dt, opts) {
    const o = options(opts);
    let alpha = wrap(finite('Rotor angle', state.alpha)), omega = finite('Angular velocity', state.omega);
    finite('Time step', dt);
    if (dt < 0 || dt > 0.25) throw new RangeError('Use a time step from 0 to 0.25 s.');
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      const tau = analyze(alpha, o).total;
      omega += (ILLUSTRATIVE.gain * tau - ILLUSTRATIVE.friction * omega) * h;
      alpha = wrap(alpha + omega * h / DEG);
    }
    return Object.freeze({ alpha, omega });
  }

  return Object.freeze({
    MODES, ILLUSTRATIVE, wrap, sinDeg, cosDeg, options, thetaFromAlpha, alphaFromTheta,
    sideCurrent, analyze, neighbourhood, torqueAtTheta, sweep, turnAverage, ripple, torqueSI, illustrativeStep
  });
});

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiTensileTest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Bounded teaching model: engineering stress-strain curves for four SYNTHETIC specimens.
  // Stress in MPa, strain as a ratio (mm/mm), modulus in MPa, area under the curve in MPa = MJ/m^3.
  // Curves are piecewise cubic Hermite segments through stated knots: chosen illustrative shapes,
  // not measured data, grades, allowables or certification values.
  const GEOMETRY = Object.freeze({ gaugeLength: 50, diameter: 12.5 }); // mm, chosen for illustration
  const AREA = Math.PI * GEOMETRY.diameter * GEOMETRY.diameter / 4;      // mm^2
  const OFFSET = 0.002;                                                  // 0.2 % offset strain

  // Knot: [strain, stress, slope in, slope out]; slope out defaults to slope in.
  const DEFS = [
    { id: 'ductile', letter: 'A', label: 'Ductile, low-carbon-steel-like', E: 200000, neck: 'local', neckRA: 0.6,
      zoom: 0.01, linear: 0.00125,
      knots: [[0, 0, 200000], [0.00125, 250, 200000, 0], [0.015, 250, 0, 2200], [0.2, 400, 0], [0.3, 320, -1600]],
      note: 'Linear to a flat yield plateau, then strain hardening, a peak and a long fall to fracture.' },
    { id: 'alloy', letter: 'B', label: 'Aluminium-alloy-like', E: 70000, neck: 'local', neckRA: 0.35,
      zoom: 0.01, linear: 0.0025,
      knots: [[0, 0, 70000], [0.0025, 175, 70000], [0.004, 240, 28000], [0.007, 272, 5500], [0.012, 284, 1500],
        [0.03, 296, 400], [0.09, 310, 0], [0.13, 282, -1400]],
      note: 'No plateau: the curve bends gradually away from the elastic line, so the offset rule is needed.' },
    { id: 'brittle', letter: 'C', label: 'Brittle, gray-iron-like', E: 100000, neck: 'none', neckRA: 0,
      zoom: 0.004, linear: 0.001,
      knots: [[0, 0, 100000], [0.001, 100, 100000], [0.0032, 215, 30000]],
      note: 'Curves slightly, then fractures at its highest stress with very little permanent strain.' },
    { id: 'polymer', letter: 'D', label: 'Polymer-like (cold drawing)', E: 2500, neck: 'draw', neckRA: 0.45,
      zoom: 0.06, linear: 0.01,
      knots: [[0, 0, 2500], [0.01, 25, 2500], [0.03, 45, 600], [0.04, 48, 0], [0.07, 36, 0], [0.4, 38, 15], [0.55, 44, 60]],
      note: 'Very low stiffness; a stress peak, a drop as a neck forms, then the neck draws along the gauge length.' }
  ];

  function finite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(name + ' must be a finite number.');
  }
  function build(def) {
    const knots = def.knots.map(k => ({ e: k[0], s: k[1], mIn: k[2], mOut: k.length > 3 ? k[3] : k[2] }));
    for (let i = 1; i < knots.length; i++) if (!(knots[i].e > knots[i - 1].e)) throw new Error(def.id + ': knots must increase in strain');
    if (knots[0].e !== 0 || knots[0].s !== 0) throw new Error(def.id + ': curve must start at the origin');
    const c = Object.assign({}, def, { knots });
    c.fractureStrain = knots[knots.length - 1].e;
    c.fractureStress = knots[knots.length - 1].s;
    return c;
  }
  const CURVES = Object.freeze(DEFS.map(build));
  function curveById(id) {
    const c = CURVES.find(x => x.id === id);
    if (!c) throw new RangeError('Unknown specimen: ' + id);
    return c;
  }
  function segmentIndex(c, e) {
    finite(e, 'Strain');
    if (e < 0 || e > c.fractureStrain + 1e-15) throw new RangeError('Strain must be between 0 and the fracture strain.');
    const k = c.knots;
    for (let i = 0; i < k.length - 2; i++) if (e <= k[i + 1].e) return i;
    return k.length - 2;
  }
  function seg(c, i) {
    const a = c.knots[i], b = c.knots[i + 1];
    return { x0: a.e, h: b.e - a.e, y0: a.s, y1: b.s, m0: a.mOut, m1: b.mIn };
  }
  function evalSeg(g, t) {
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * g.y0 + (t3 - 2 * t2 + t) * g.h * g.m0 + (-2 * t3 + 3 * t2) * g.y1 + (t3 - t2) * g.h * g.m1;
  }
  function slopeSeg(g, t) {
    const t2 = t * t;
    return (6 * t2 - 6 * t) / g.h * g.y0 + (3 * t2 - 4 * t + 1) * g.m0 + (-6 * t2 + 6 * t) / g.h * g.y1 + (3 * t2 - 2 * t) * g.m1;
  }
  function areaSeg(g, t) { // integral from x0 to x0 + t h, exact for the cubic
    const t2 = t * t, t3 = t2 * t, t4 = t3 * t;
    return g.h * (g.y0 * (t4 / 2 - t3 + t) + g.h * g.m0 * (t4 / 4 - 2 * t3 / 3 + t2 / 2) + g.y1 * (-t4 / 2 + t3) + g.h * g.m1 * (t4 / 4 - t3 / 3));
  }
  function stress(c, e) {
    const i = segmentIndex(c, e), g = seg(c, i);
    return evalSeg(g, Math.min(1, Math.max(0, (e - g.x0) / g.h)));
  }
  function slope(c, e) {
    const i = segmentIndex(c, e), g = seg(c, i);
    return slopeSeg(g, Math.min(1, Math.max(0, (e - g.x0) / g.h)));
  }
  // Work per original volume under the loading envelope from 0 to e (MPa = MJ/m^3). Nondecreasing in e
  // because every envelope stress is nonnegative; the unloading path is not part of this integral.
  function area(c, e) {
    const last = segmentIndex(c, e);
    let total = 0;
    for (let i = 0; i < last; i++) total += areaSeg(seg(c, i), 1);
    const g = seg(c, last);
    return total + areaSeg(g, Math.min(1, Math.max(0, (e - g.x0) / g.h)));
  }
  // Highest engineering stress on the curve (the ultimate tensile strength in this test).
  function peak(c) {
    let best = { strain: 0, stress: 0 };
    const consider = (e) => { const s = stress(c, e); if (s > best.stress + 1e-9) best = { strain: e, stress: s }; };
    c.knots.forEach(k => consider(k.e));
    for (let i = 0; i < c.knots.length - 1; i++) {
      const g = seg(c, i);
      // Roots of the derivative: a quadratic in t.
      const A = 6 * g.y0 / g.h + 3 * g.m0 - 6 * g.y1 / g.h + 3 * g.m1;
      const B = -6 * g.y0 / g.h - 4 * g.m0 + 6 * g.y1 / g.h - 2 * g.m1;
      const C = g.m0;
      const roots = [];
      if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) roots.push(-C / B); }
      else { const d = B * B - 4 * A * C; if (d >= 0) { roots.push((-B + Math.sqrt(d)) / (2 * A), (-B - Math.sqrt(d)) / (2 * A)); } }
      roots.filter(t => t > 0 && t < 1).forEach(t => consider(g.x0 + t * g.h));
    }
    return best;
  }
  // 0.2 % offset yield: first intersection of sigma = E (e - offset) with the curve. Returns null when
  // the specimen fractures before the offset line meets the curve (undefined for this test, not zero).
  function offsetYield(c, offset) {
    const off = offset === undefined ? OFFSET : offset;
    finite(off, 'Offset');
    if (off <= 0) throw new RangeError('Offset must be positive.');
    if (off >= c.fractureStrain) return null;
    const g = e => stress(c, e) - c.E * (e - off);
    const points = [off];
    c.knots.forEach(k => { if (k.e > off) points.push(k.e); });
    for (let p = 0; p < points.length - 1; p++) {
      const a0 = points[p], b0 = points[p + 1], n = 400;
      for (let j = 0; j < n; j++) {
        let a = a0 + (b0 - a0) * j / n, b = a0 + (b0 - a0) * (j + 1) / n;
        if (g(a) > 0 && g(b) <= 0) {
          for (let it = 0; it < 80; it++) { const m = (a + b) / 2; if (g(m) > 0) a = m; else b = m; }
          const e = (a + b) / 2;
          return { strain: e, stress: stress(c, e) };
        }
      }
    }
    return null;
  }
  // Ideal elastic unloading: a straight line of slope E from (e, s) to zero load.
  // Permanent set = e - s/E, clamped so it can never be negative (an elastic state recovers fully).
  function residualStrain(e, s, E) {
    finite(e, 'Strain'); finite(s, 'Stress'); finite(E, 'Modulus');
    if (E <= 0) throw new RangeError('Modulus must be greater than zero.');
    if (e < 0 || s < 0) throw new RangeError('This tension model accepts only nonnegative strain and stress.');
    const r = e - s / E;
    return r > 1e-12 ? r : 0;
  }
  function properties(c) {
    const p = peak(c), y = offsetYield(c);
    const elongation = residualStrain(c.fractureStrain, c.fractureStress, c.E);
    return {
      id: c.id, E: c.E, yield: y ? y.stress : null, yieldStrain: y ? y.strain : null,
      uts: p.stress, utsStrain: p.strain, fractureStrain: c.fractureStrain, fractureStress: c.fractureStress,
      elongation, toughness: area(c, c.fractureStrain), necks: c.neck !== 'none' && p.strain < c.fractureStrain
    };
  }
  const PROPERTY_KEYS = { stiffness: 'E', strength: 'uts', ductility: 'elongation', toughness: 'toughness' };
  function ranking(key) {
    const field = PROPERTY_KEYS[key];
    if (!field) throw new RangeError('Unknown property: ' + key);
    return CURVES.map(c => ({ id: c.id, value: properties(c)[field] })).sort((a, b) => b.value - a.value);
  }

  // ---- the test as a state machine -------------------------------------------------------------
  // eMax: furthest strain reached on the loading envelope. e: current strain. Below eMax the specimen
  // sits on the elastic unload/reload line through (eMax, sigma(eMax)); it cannot go below zero load
  // (the model does not push it into compression), and reloading rejoins the envelope at eMax.
  function createTest(id) { curveById(id); return Object.freeze({ id, eMax: 0, e: 0, fractured: false }); }
  function moveTo(state, target) {
    const c = curveById(state.id);
    finite(target, 'Crosshead strain');
    if (state.fractured) return state;
    const t = Math.max(0, target);
    if (t >= c.fractureStrain) return Object.freeze({ id: state.id, eMax: c.fractureStrain, e: c.fractureStrain, fractured: true });
    if (t >= state.eMax) return Object.freeze({ id: state.id, eMax: t, e: t, fractured: false });
    const floor = residualStrain(state.eMax, stress(c, state.eMax), c.E);
    return Object.freeze({ id: state.id, eMax: state.eMax, e: Math.max(t, floor), fractured: false });
  }
  function reading(state) {
    const c = curveById(state.id);
    const sEnv = stress(c, state.eMax), set = residualStrain(state.eMax, sEnv, c.E);
    const p = peak(c), y = offsetYield(c);
    let s, stage;
    if (state.fractured) { s = 0; stage = 'fractured'; }
    else if (state.e < state.eMax) { s = sEnv - c.E * (state.eMax - state.e); if (s < 1e-9) s = 0; stage = s > 0 ? 'unloaded' : 'slack'; }
    else {
      s = sEnv;
      if (state.e <= c.linear + 1e-12) stage = 'elastic';
      else if (state.e <= p.strain + 1e-12) stage = 'plastic';
      else stage = 'necking';
    }
    const workDensity = area(c, state.eMax);
    return {
      strain: state.e, stress: s, force: s * AREA / 1000, extension: state.e * GEOMETRY.gaugeLength,
      envelopeStrain: state.eMax, envelopeStress: sEnv, permanentSet: state.fractured ? residualStrain(c.fractureStrain, c.fractureStress, c.E) : set,
      stage, workDensity, work: workDensity * AREA * GEOMETRY.gaugeLength / 1000, // MJ/m^3 x mm^3 -> J
      recoverable: state.fractured ? 0 : s * s / (2 * c.E),
      pastYield: !!y && state.eMax >= y.strain, pastPeak: state.eMax > p.strain + 1e-12 || (state.fractured && p.strain >= c.fractureStrain - 1e-12),
      fractured: state.fractured
    };
  }
  // Which part of the curve the current point is on, read from the actual local slope rather than the
  // stage alone: a level yield plateau is not strain hardening, and the approach to the peak flattens.
  function phase(state) {
    const c = curveById(state.id), r = reading(state);
    if (r.stage !== 'plastic') return r.stage;
    if (c.id === 'brittle') return 'nonlinear';
    if (c.neck === 'draw') return 'toward-peak';
    const p = peak(c), y = offsetYield(c), k = slope(c, state.e);
    if (!y || state.e < y.strain) return k <= 0.0005 * c.E ? 'plateau' : 'leaving-linear';
    if (k <= 0.0005 * c.E && r.stress < 0.97 * p.stress) return 'plateau';
    if (r.stress >= 0.97 * p.stress) return 'near-peak';
    return 'hardening';
  }
  // Scoring a permanent-set prediction (entered in percent). Tolerance is 10 % of the elastic recovery
  // sigma/E, never below 0.005 percentage points, so ignoring recovery or predicting zero falls outside.
  function scorePrediction(predictedPercent, state) {
    if (typeof predictedPercent !== 'number' || !Number.isFinite(predictedPercent) || predictedPercent < 0)
      return { status: 'invalid' };
    const c = curveById(state.id);
    if (state.fractured) return { status: 'invalid' };
    const s = stress(c, state.eMax);
    const actual = residualStrain(state.eMax, s, c.E) * 100;
    const recovery = (state.eMax * 100) - actual;
    const tol = Math.max(0.005, 0.1 * recovery);
    const diff = Math.abs(predictedPercent - actual);
    let status = diff <= tol ? 'match' : Math.abs(predictedPercent * 100 - actual) <= tol && actual > 0 ? 'match-ratio' : diff <= 3 * tol ? 'close' : 'miss';
    return { status, actual, tolerance: tol, recovery, difference: predictedPercent - actual };
  }

  // Crosshead control: a slider position u in [0, 1] maps to strain e = ef u^k, with k chosen so the
  // end of the linear region sits at u = 0.15. This only spaces the control; it is not a rate model.
  function exponent(c) { return Math.log(c.linear / c.fractureStrain) / Math.log(0.15); }
  function strainAt(c, u) { finite(u, 'Slider position'); const v = Math.min(1, Math.max(0, u)); return c.fractureStrain * Math.pow(v, exponent(c)); }
  function sliderAt(c, e) { finite(e, 'Strain'); if (e <= 0) return 0; return Math.min(1, Math.pow(e / c.fractureStrain, 1 / exponent(c))); }

  // Illustrative specimen outline. Length follows the strain exactly (gauge length L0 (1 + e)).
  // Uniform plastic thinning keeps volume; the neck depth and shape after the peak are drawn only to
  // show where deformation localizes. They are not a necking mechanics model or a failure prediction.
  function specimen(state) {
    const c = curveById(state.id), r = reading(state), p = peak(c);
    const uniformLimit = residualStrain(p.strain, p.stress, c.E);
    const plastic = state.fractured ? residualStrain(c.fractureStrain, c.fractureStress, c.E) : r.permanentSet;
    const uniform = Math.min(plastic, uniformLimit);
    const diameter = GEOMETRY.diameter / Math.sqrt(1 + uniform);
    let neck = 0;
    if (c.neck !== 'none' && state.eMax > p.strain + 1e-12) neck = Math.min(1, (state.eMax - p.strain) / (c.fractureStrain - p.strain));
    const neckDiameter = neck > 0 ? diameter * Math.sqrt(1 - c.neckRA * (c.neck === 'draw' ? Math.min(1, neck * 8) : Math.pow(neck, 1.4))) : diameter;
    const neckLength = c.neck === 'draw' && neck > 0 ? GEOMETRY.gaugeLength * (0.08 + 0.85 * neck) : GEOMETRY.gaugeLength * 0.16;
    return {
      length: GEOMETRY.gaugeLength * (1 + (state.fractured ? plastic : r.strain)), diameter, neck, neckDiameter, neckLength,
      neckStyle: c.neck, fractured: state.fractured
    };
  }

  function nice(value, digits) {
    if (!Number.isFinite(value)) return '—';
    const d = digits === undefined ? 3 : digits;
    return Number(value.toFixed(d)).toFixed(d);
  }
  return {
    GEOMETRY, AREA, OFFSET, CURVES, PROPERTY_KEYS, curveById, stress, slope, area, peak, offsetYield,
    residualStrain, properties, ranking, createTest, moveTo, reading, phase, scorePrediction, strainAt, sliderAt,
    specimen, nice
  };
});

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiChainChordal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Kinematics of one sprocket driving a roller chain, treated as a rigid pitch polygon.
  // Assumptions: rigid links of exactly one pitch, pins seated on the pitch polygon, a taut
  // straight span that stays parallel to its mean line, and constant sprocket speed.
  // Units: pitch and lengths in mm, speed in r/min, chain speed in m/s.
  // Angles are measured clockwise from the top of the sprocket; the sprocket turns clockwise,
  // so the top span leaves to the right and the bottom span arrives from the right.

  // Pitches already tabulated on the chain-drives page (ANSI base numbers; 1/8 in per step).
  const PITCHES = Object.freeze([
    Object.freeze({ id: '25', label: '#25', p: 6.35 }),
    Object.freeze({ id: '35', label: '#35', p: 9.525 }),
    Object.freeze({ id: '40', label: '#40', p: 12.7 }),
    Object.freeze({ id: '100', label: '#100', p: 31.75 })
  ]);
  const LIMITS = Object.freeze({ teethMin: 6, teethMax: 30, rpmMin: 30, rpmMax: 600, rpmStep: 30 });
  const DEFAULT = Object.freeze({ teeth: 9, chain: '40', rpm: 120 });

  function teethOk(N) {
    if (!Number.isInteger(N) || N < 3) throw new RangeError('Tooth count must be a whole number of at least 3.');
    return N;
  }
  function positive(v, name) {
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(name + ' must be finite and positive.');
    return v;
  }
  function speedOk(n) {
    if (!Number.isFinite(n) || n < 0) throw new RangeError('Sprocket speed must be finite and not negative.');
    return n;
  }
  function phaseOk(phase) {
    if (!Number.isFinite(phase)) throw new RangeError('Sprocket position must be finite.');
    return phase;
  }
  function pitchOf(id) {
    const found = PITCHES.find(c => c.id === String(id));
    if (!found) throw new RangeError('Unknown chain size.');
    return found.p;
  }

  const halfAngle = N => Math.PI / teethOk(N);                       // 180°/N in radians
  const pitchRadius = (N, p) => positive(p, 'Pitch') / (2 * Math.sin(halfAngle(N)));
  // (vmax − vmin) / vmax: the form in Tsubaki's Complete Guide to Chain, section 2.2.1.
  const ripple = N => 1 - Math.cos(halfAngle(N));
  // (vmax − vmin) / mean speed: the form in Shigley's text, Eq. 17-31 (8th ed.).
  const rippleOfMean = N => { const h = halfAngle(N); return (Math.PI / N) * (1 / Math.sin(h) - 1 / Math.tan(h)); };
  const rise = (N, p) => pitchRadius(N, p) * ripple(N);
  // Mean chain speed / maximum speed. The mean is N·p·n, exactly one pitch per tooth passed.
  const meanFactor = N => { const h = halfAngle(N); return Math.sin(h) / h; };

  // Position of the leaving pin, measured from top dead centre, for a sprocket position given in
  // teeth (phase = 0 puts a pin exactly at the top). The result lies in [−180°/N, +180°/N).
  function leavingAngle(N, phase) {
    phaseOk(phase);
    const u = phase + 0.5 - Math.floor(phase + 0.5) - 0.5;
    return u * 2 * halfAngle(N);
  }

  function summary(N, p, rpm) {
    teethOk(N); positive(p, 'Pitch'); speedOk(rpm);
    const R = pitchRadius(N, p), omega = rpm * 2 * Math.PI / 60;
    const vmax = omega * R / 1000;
    return {
      teeth: N, pitch: p, rpm, R, halfAngleDeg: 180 / N,
      ripple: ripple(N), rippleOfMean: rippleOfMean(N), rise: rise(N, p),
      lowRadius: R * Math.cos(halfAngle(N)),
      vmax, vmin: vmax * Math.cos(halfAngle(N)), vmean: N * p * rpm / 60000,
      pulseHz: N * rpm / 60, toothPeriod: rpm > 0 ? 60 / (N * rpm) : Infinity
    };
  }

  // Instantaneous state of the leaving span at sprocket position `phase` (teeth).
  function instant(N, p, rpm, phase) {
    const s = summary(N, p, rpm), a = leavingAngle(N, phase), c = Math.cos(a);
    return {
      angle: a, angleDeg: a * 180 / Math.PI, speedRatio: c, heightRatio: c,
      speed: s.vmax * c, verticalSpeed: -s.vmax * Math.sin(a),
      height: s.R * c, drop: s.R - s.R * c
    };
  }

  // Pin centres for drawing: wrapped pins on the pitch polygon, plus straight top and bottom
  // spans. Each pin keeps an absolute index j so link plates alternate consistently as the chain
  // moves. Coordinates in mm, origin at the sprocket centre, y upward.
  function pose(N, p, phase, spanLength) {
    teethOk(N); positive(p, 'Pitch'); phaseOk(phase);
    const span = spanLength === undefined ? 6 * p : positive(spanLength, 'Span length');
    const R = pitchRadius(N, p), step = 2 * halfAngle(N);
    const at = j => { const a = (phase - j) * step; return { j, x: R * Math.sin(a), y: R * Math.cos(a), angle: a }; };
    const jL = Math.floor(phase + 0.5);            // pin leaving at the top
    const jE = Math.floor(phase + N / 2 + 0.5);    // pin engaging at the bottom
    const wrap = [];
    for (let j = jL; j <= jE; j++) wrap.push(at(j));
    const leave = wrap[0], engage = wrap[wrap.length - 1];
    const count = Math.max(1, Math.ceil(span / p));
    const top = [], bottom = [];
    for (let k = 1; k <= count; k++) {
      top.push({ j: jL - k, x: leave.x + k * p, y: leave.y });
      bottom.push({ j: jE + k, x: engage.x + k * p, y: engage.y });
    }
    return { R, pitch: p, teeth: N, sprocketTurn: phase * step, leaving: jL, engaging: jE, wrap, top, bottom };
  }

  // Normalized speed (= normalized span height) sampled over a window of sprocket positions.
  function trace(N, fromPhase, toPhase, perTooth) {
    teethOk(N); phaseOk(fromPhase); phaseOk(toPhase);
    if (!(toPhase > fromPhase)) throw new RangeError('Trace window must have positive length.');
    const samples = Math.max(2, Math.ceil((toPhase - fromPhase) * (perTooth || 48)));
    const out = [];
    for (let i = 0; i <= samples; i++) {
      const t = fromPhase + (toPhase - fromPhase) * i / samples;
      out.push([t, Math.cos(leavingAngle(N, t))]);
    }
    // Add the exact cusps (pin hand-over at half-integer positions) so minima are not sampled away.
    for (let k = Math.ceil(fromPhase - 0.5); k + 0.5 <= toPhase; k++) {
      const t = k + 0.5;
      if (t >= fromPhase) out.push([t, Math.cos(halfAngle(N))]);
    }
    return out.sort((m, n) => m[0] - n[0]);
  }

  function format(v, digits) {
    if (!Number.isFinite(v)) return '—';
    return Number(v.toPrecision(digits || 4)).toString();
  }
  const percent = (v, places) => (v * 100).toFixed(places === undefined ? 2 : places) + ' %';

  return { PITCHES, LIMITS, DEFAULT, pitchOf, halfAngle, pitchRadius, ripple, rippleOfMean, rise, meanFactor,
    leavingAngle, summary, instant, pose, trace, format, percent };
});

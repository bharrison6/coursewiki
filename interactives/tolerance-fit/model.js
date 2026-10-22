/* ============================================================================
   tolerance-fit / model.js - the arithmetic behind the fit lab, and nothing else.

   No DOM here. Every function is deterministic so the focused Node tests can
   hold it to the numbers the page prints.

   EVERY SIZE IS AN INTEGER COUNT of the unit system's smallest step:
     in  - one count is 0.0001 in (a "tenth")
     mm  - one count is 0.001 mm  (one micrometre)
   Clearance is a subtraction of two sizes that differ in the fourth decimal
   place. Done in floating point, 0.7500 - 0.7506 can print as -0.0005999...
   and a zero can arrive as -0, which reads as "interference" when the parts
   are exactly the same size. Integers make the sign exact, so the boundary
   cases this lab is built to show are decided by `> 0`, `=== 0` and `< 0`.

   A drawing (a "spec") is one shared nominal size plus a pair of deviations
   for each part:
     { unit: 'in', nominal: 7500,
       hole:  { upper: 10,  lower: 0   },     // 0.7500 +0.0010 / 0
       shaft: { upper: -10, lower: -20 } }    // 0.7500 -0.0010 / -0.0020
   Limits are nominal + deviation. The limits are INCLUSIVE: a part measured
   exactly on a limit is in tolerance.

   The limits in the presets and challenges are made-up teaching values. They
   are not taken from, and do not claim to match, any standard fit system.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  else { root.ToleranceFitModel = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MINUS = '−';

  var UNITS = {
    'in': { id: 'in', symbol: 'in', name: 'inch',       decimals: 4, step: '0.0001 in' },
    'mm': { id: 'mm', symbol: 'mm', name: 'millimeter', decimals: 3, step: '0.001 mm (1 µm)' }
  };

  function unitOf(id) {
    var u = UNITS[id];
    if (!u) { throw new Error('unknown unit: ' + id); }
    return u;
  }

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  /* ---- formatting --------------------------------------------------------
     `n` is an integer and the value is n / 10^decimals. Built from integer
     digits, never from toFixed() on a float, so it cannot print -0.0000 or a
     ...9999 tail. A zero is never signed. */
  function formatScaled(n, decimals, opts) {
    if (!isInt(n)) { throw new Error('formatScaled needs an integer, got ' + n); }
    var signed = !!(opts && opts.signed);
    var neg = n < 0;
    var abs = neg ? -n : n;
    var base = Math.pow(10, decimals);
    var whole = Math.floor(abs / base);
    var frac = String(abs % base);
    while (frac.length < decimals) { frac = '0' + frac; }
    var body = decimals > 0 ? whole + '.' + frac : String(whole);
    if (n === 0) { return body; }
    if (neg) { return MINUS + body; }
    return signed ? '+' + body : body;
  }

  /* A size or a diametral value, in the unit's own resolution. */
  function format(counts, unitId, opts) {
    return formatScaled(counts, unitOf(unitId).decimals, opts);
  }

  /* Half of an integer count - the radial gap, which is half the diametral
     clearance. An odd diametral count needs one more decimal place, and
     gets it rather than being rounded to a value the parts do not have. */
  function formatHalf(counts, unitId, opts) {
    if (!isInt(counts)) { throw new Error('formatHalf needs an integer, got ' + counts); }
    var d = unitOf(unitId).decimals;
    if (counts % 2 === 0) { return formatScaled(counts / 2, d, opts); }
    return formatScaled(counts * 5, d + 1, opts);
  }

  function withUnit(text, unitId) { return text + ' ' + unitOf(unitId).symbol; }

  /* ---- parsing -----------------------------------------------------------
     A typed decimal to integer counts, by string, so 0.0010 is exactly 10.
     Digits beyond the resolution are rounded half away from zero and the
     result says so. Accepts a leading +, - or the typographic minus. */
  function parseToCounts(text, unitId) {
    var d = unitOf(unitId).decimals;
    var m = /^\s*([+\-−]?)\s*(\d*)(?:\.(\d*))?\s*$/.exec(String(text == null ? '' : text));
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) {
      return { ok: false, error: 'Enter a number.' };
    }
    var neg = m[1] === '-' || m[1] === MINUS;
    var whole = m[2] === '' ? 0 : parseInt(m[2], 10);
    var fracDigits = m[3] || '';
    var kept = fracDigits.slice(0, d);
    while (kept.length < d) { kept += '0'; }
    var rest = fracDigits.slice(d);
    var counts = whole * Math.pow(10, d) + (d > 0 ? parseInt(kept, 10) : 0);
    var rounded = /[1-9]/.test(rest);
    if (rest.length && rest.charAt(0) >= '5') { counts += 1; }
    if (!isFinite(counts) || counts > 1e9) { return { ok: false, error: 'That number is too large for this lab.' }; }
    if (neg && counts !== 0) { counts = -counts; }
    return { ok: true, counts: counts, rounded: rounded };
  }

  /* ---- limits and inspection --------------------------------------------*/
  function limits(spec, part) {
    var p = spec[part];
    return { min: spec.nominal + p.lower, max: spec.nominal + p.upper, tolerance: p.upper - p.lower };
  }

  function validateSpec(spec) {
    var errors = [];
    if (!spec || !UNITS[spec.unit]) { return { ok: false, errors: ['Unknown unit system.'] }; }
    if (!isInt(spec.nominal) || spec.nominal <= 0) { errors.push('The nominal size must be greater than zero.'); }
    ['hole', 'shaft'].forEach(function (part) {
      var p = spec[part];
      var name = part === 'hole' ? 'Hole' : 'Shaft';
      if (!p || !isInt(p.upper) || !isInt(p.lower)) { errors.push(name + ': both deviations must be numbers.'); return; }
      if (p.upper <= p.lower) {
        errors.push(name + ': the upper deviation must be larger than the lower one, or there is no tolerance band at all.');
      }
      if (isInt(spec.nominal) && spec.nominal > 0 &&
          (Math.abs(p.upper) * 4 > spec.nominal || Math.abs(p.lower) * 4 > spec.nominal)) {
        errors.push(name + ': deviations over a quarter of the nominal size are outside what this lab draws.');
      }
    });
    return { ok: errors.length === 0, errors: errors };
  }

  /* Where one measured part sits against its own limits. The limits are
     inclusive, so `atLimit` parts pass inspection. */
  function inspect(actual, lim) {
    if (actual < lim.min) { return { inSpec: false, state: 'under', by: lim.min - actual }; }
    if (actual > lim.max) { return { inSpec: false, state: 'over', by: actual - lim.max }; }
    if (actual === lim.min) { return { inSpec: true, state: 'at-min', by: 0 }; }
    if (actual === lim.max) { return { inSpec: true, state: 'at-max', by: 0 }; }
    return { inSpec: true, state: 'inside', by: 0 };
  }

  /* ---- clearance ---------------------------------------------------------
     Diametral clearance = hole - shaft. Positive is a gap, negative is
     interference (overlap), zero is line-to-line: the two are the same size. */
  function clearance(holeActual, shaftActual) { return holeActual - shaftActual; }

  function pairKind(c) {
    if (c > 0) { return 'clearance'; }
    if (c < 0) { return 'interference'; }
    return 'line-to-line';
  }

  /* Every pair the drawing permits. The tightest legal pair is the smallest
     hole with the largest shaft; the loosest is the largest hole with the
     smallest shaft. Those two numbers alone decide the fit. */
  function envelope(spec) {
    var h = limits(spec, 'hole');
    var s = limits(spec, 'shaft');
    var min = h.min - s.max;
    var max = h.max - s.min;
    var kind, boundary = false;
    if (min >= 0) { kind = 'clearance'; boundary = min === 0; }
    else if (max <= 0) { kind = 'interference'; boundary = max === 0; }
    else { kind = 'transition'; }
    return {
      min: min, max: max, kind: kind, boundary: boundary,
      tightest: { hole: h.min, shaft: s.max },
      loosest:  { hole: h.max, shaft: s.min }
    };
  }

  /* One selected pair, in full: each part's inspection, the pair's
     clearance, and whether this is the lab's "reveal" - two parts that both
     pass inspection and still overlap. */
  function evaluate(spec, holeActual, shaftActual) {
    var hl = limits(spec, 'hole');
    var sl = limits(spec, 'shaft');
    var hole = inspect(holeActual, hl);
    var shaft = inspect(shaftActual, sl);
    var c = clearance(holeActual, shaftActual);
    var kind = pairKind(c);
    return {
      hole: hole, shaft: shaft,
      holeLimits: hl, shaftLimits: sl,
      clearance: c, kind: kind,
      bothInSpec: hole.inSpec && shaft.inSpec,
      inSpecButInterferes: hole.inSpec && shaft.inSpec && c < 0,
      envelope: envelope(spec)
    };
  }

  /* ---- the window both sliders and both figures share --------------------
     One range for both parts, so the pair map has the same scale on both
     axes (its zero-clearance line is a true 45 degrees) and the section view
     does not rescale while a slider moves. Padded beyond every limit so a
     reader can make a part that fails inspection. */
  function viewWindow(spec) {
    var h = limits(spec, 'hole');
    var s = limits(spec, 'shaft');
    var lo = Math.min(h.min, s.min);
    var hi = Math.max(h.max, s.max);
    var pad = Math.max(2, Math.ceil(Math.max(h.tolerance, s.tolerance) / 2));
    return { min: lo - pad, max: hi + pad };
  }

  function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }

  /* ---- honest magnification ---------------------------------------------
     The section view draws the nominal diameter at `drawnDiameterPx` and
     magnifies only the DEPARTURES from nominal. Magnification is chosen from
     round numbers so the label is a figure a reader can repeat, and is the
     largest round number that keeps every size in the window inside
     `bandPx` of the nominal wall (on radius). Returns the pixels per count to
     draw departures with. */
  var NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  function magnification(spec, drawnDiameterPx, bandPx) {
    var w = viewWindow(spec);
    var reach = Math.max(Math.abs(w.min - spec.nominal), Math.abs(w.max - spec.nominal), 1) / 2;
    var truePxPerCount = drawnDiameterPx / spec.nominal;
    var best = null;
    for (var i = 0; i < NICE.length; i++) {
      if (reach * truePxPerCount * NICE[i] <= bandPx) { best = NICE[i]; }
    }
    if (best === null) {
      // Not even true scale fits; draw to fit and say "not magnified".
      return { factor: 1, pxPerCount: bandPx / reach, magnified: false };
    }
    return { factor: best, pxPerCount: truePxPerCount * best, magnified: best > 1 };
  }

  /* ---- every legal pair, counted ----------------------------------------
     If every in-tolerance size were equally likely, what share of pairs
     would overlap? Counted exactly over the integer grid of legal sizes -
     no sampling. The page labels the assumption: real sizes cluster. */
  function pairShare(spec) {
    var h = limits(spec, 'hole');
    var s = limits(spec, 'shaft');
    var holeN = h.max - h.min + 1;
    var shaftN = s.max - s.min + 1;
    var interfere = 0, touch = 0;
    for (var hole = h.min; hole <= h.max; hole++) {
      // shafts strictly larger than this hole
      var bigger = s.max - Math.max(s.min, hole + 1) + 1;
      if (bigger > 0) { interfere += bigger; }
      if (hole >= s.min && hole <= s.max) { touch += 1; }
    }
    var total = holeN * shaftN;
    return { total: total, interfere: interfere, lineToLine: touch, clear: total - interfere - touch };
  }

  /* A small seeded generator, so "run 100 assemblies" is repeatable in a
     test and still varied on the page. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickInRange(lo, hi, rng) { return lo + Math.floor(rng() * (hi - lo + 1)); }

  /* Pull `n` legal parts of each kind and pair them. */
  function samplePairs(spec, n, rng) {
    var h = limits(spec, 'hole');
    var s = limits(spec, 'shaft');
    var pairs = [];
    var counts = { clearance: 0, 'line-to-line': 0, interference: 0 };
    for (var i = 0; i < n; i++) {
      var hole = pickInRange(h.min, h.max, rng);
      var shaft = pickInRange(s.min, s.max, rng);
      var kind = pairKind(clearance(hole, shaft));
      counts[kind] += 1;
      pairs.push({ hole: hole, shaft: shaft, kind: kind });
    }
    return { pairs: pairs, counts: counts };
  }

  /* ---- teaching content: presets and the call-the-fit challenge ----------
     Same five drawings in each unit system. The mm set is NOT a conversion of
     the inch set (0.0001 in is 2.54 um, not a whole count); it is a parallel
     set with the same lessons. */
  function spec(unit, nominal, hu, hl, su, sl) {
    return { unit: unit, nominal: nominal, hole: { upper: hu, lower: hl }, shaft: { upper: su, lower: sl } };
  }

  var PRESETS = {
    'in': [
      { id: 'slides', title: 'Slides freely',          spec: spec('in', 7500, 10, 0, -10, -20), actual: { hole: 7504, shaft: 7486 } },
      { id: 'either', title: 'Could go either way',    spec: spec('in', 7500, 10, 0, 6, -2),    actual: { hole: 7506, shaft: 7501 } },
      { id: 'pressed', title: 'Pressed together',      spec: spec('in', 7500, 10, 0, 25, 15),   actual: { hole: 7505, shaft: 7520 } },
      { id: 'trap', title: 'Both pass, still stuck',   spec: spec('in', 7500, 10, 0, 6, -2),    actual: { hole: 7502, shaft: 7505 } },
      { id: 'zero', title: 'Zero at the worst case',   spec: spec('in', 7500, 10, 0, 0, -8),    actual: { hole: 7500, shaft: 7500 } }
    ],
    'mm': [
      { id: 'slides', title: 'Slides freely',          spec: spec('mm', 20000, 25, 0, -25, -50), actual: { hole: 20010, shaft: 19963 } },
      { id: 'either', title: 'Could go either way',    spec: spec('mm', 20000, 25, 0, 15, -5),   actual: { hole: 20015, shaft: 20003 } },
      { id: 'pressed', title: 'Pressed together',      spec: spec('mm', 20000, 25, 0, 60, 35),   actual: { hole: 20012, shaft: 20048 } },
      { id: 'trap', title: 'Both pass, still stuck',   spec: spec('mm', 20000, 25, 0, 15, -5),   actual: { hole: 20005, shaft: 20012 } },
      { id: 'zero', title: 'Zero at the worst case',   spec: spec('mm', 20000, 25, 0, 0, -20),   actual: { hole: 20000, shaft: 20000 } }
    ]
  };

  /* `answer` is written down by hand and the tests recompute it from the
     limits, so a typo in a drawing cannot ship a wrong answer key. */
  var CHALLENGES = {
    'in': [
      { spec: spec('in', 7500, 12, 0, -4, -11), answer: 'clearance' },
      { spec: spec('in', 7500, 8, 0, 10, 3),    answer: 'transition' },
      { spec: spec('in', 7500, 6, 0, 18, 12),   answer: 'interference' },
      { spec: spec('in', 7500, 10, 0, 0, -7),   answer: 'clearance' },
      { spec: spec('in', 7500, 15, 5, 7, -3),   answer: 'transition' }
    ],
    'mm': [
      { spec: spec('mm', 20000, 30, 0, -10, -28), answer: 'clearance' },
      { spec: spec('mm', 20000, 20, 0, 25, 8),    answer: 'transition' },
      { spec: spec('mm', 20000, 15, 0, 45, 30),   answer: 'interference' },
      { spec: spec('mm', 20000, 25, 0, 0, -18),   answer: 'clearance' },
      { spec: spec('mm', 20000, 40, 10, 15, -5),  answer: 'transition' }
    ]
  };

  function cloneSpec(s) {
    return { unit: s.unit, nominal: s.nominal,
      hole: { upper: s.hole.upper, lower: s.hole.lower },
      shaft: { upper: s.shaft.upper, lower: s.shaft.lower } };
  }

  return {
    UNITS: UNITS,
    PRESETS: PRESETS,
    CHALLENGES: CHALLENGES,
    formatScaled: formatScaled,
    format: format,
    formatHalf: formatHalf,
    withUnit: withUnit,
    parseToCounts: parseToCounts,
    limits: limits,
    validateSpec: validateSpec,
    inspect: inspect,
    clearance: clearance,
    pairKind: pairKind,
    envelope: envelope,
    evaluate: evaluate,
    viewWindow: viewWindow,
    clamp: clamp,
    magnification: magnification,
    pairShare: pairShare,
    mulberry32: mulberry32,
    samplePairs: samplePairs,
    cloneSpec: cloneSpec
  };
});

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiIndicatorSweep = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PRESETS = Object.freeze({
    slope: Object.freeze({ kind: 'slope', length: 100, margin: 1, a: 0, m: 0.0006, bump: 0, pivot: 25, pivotY: 0, travel: 0, response: 1, zeroX: 0, zeroValue: 0, position: 100 }),
    aligned: Object.freeze({ kind: 'aligned', length: 100, margin: 1, a: 0, m: 0, bump: 0, pivot: 25, pivotY: 0, travel: 0, response: 1, zeroX: 0, zeroValue: 0, position: 100 }),
    bump: Object.freeze({ kind: 'bump', length: 100, margin: 1, a: 0, m: 0, bump: 0.08, pivot: 25, pivotY: 0, travel: 0, response: 1, zeroX: 0, zeroValue: 0, position: 50 })
  });
  function finite(v, key) {
    if (!Number.isFinite(v)) throw new RangeError(key + ' must be a finite number');
    return v;
  }
  function onIncrementGrid(v) { return Math.abs(v / 0.0001 - Math.round(v / 0.0001)) <= 1e-9; }
  function validate(s) {
    if (!s || !Object.prototype.hasOwnProperty.call(PRESETS, s.kind)) throw new RangeError('Choose a defined jaw case');
    finite(s.length, 'Sweep length'); finite(s.margin, 'Face margin'); finite(s.a, 'Common offset'); finite(s.m, 'Linear slope'); finite(s.bump, 'Midspan bump');
    finite(s.pivot, 'Chosen pivot'); finite(s.pivotY, 'Pivot y'); finite(s.travel, 'Accumulated rotation travel');
    finite(s.zeroX, 'Zero position'); finite(s.zeroValue, 'Stored zero reading'); finite(s.position, 'Contact position');
    if (s.length !== 100) throw new RangeError('This lesson models one 100 mm sweep');
    if (s.margin !== 1) throw new RangeError('This lesson requires a 1 mm face margin at each end');
    if (Math.abs(s.a) > 0.25) throw new RangeError('Common offset must stay within ±0.25 mm');
    if (Math.abs(s.m) > 0.002) throw new RangeError('Linear slope must stay within ±0.002 mm per mm');
    if (Math.abs(s.bump) > 0.2) throw new RangeError('Midspan bump must stay within ±0.20 mm');
    if (s.pivotY !== 0) throw new RangeError('The illustrative world pivot uses y = 0 mm');
    if (s.travel < 0 || s.travel > 0.004) throw new RangeError('Accumulated rotation travel must stay from 0 to 0.004');
    if (!onIncrementGrid(s.travel)) throw new RangeError('Accumulated rotation travel must use 0.0001 mm/mm steps');
    if (s.response !== 1 && s.response !== -1) throw new RangeError('Contact response must be +1 or -1');
    if (s.pivot < 0 || s.pivot > s.length || s.zeroX < 0 || s.zeroX > s.length || s.position < 0 || s.position > s.length) throw new RangeError('Pivot, contact and zero positions must lie on the sweep');
    return s;
  }
  // Positive physical displacement means the jaw is closer to the indicator body.
  function surface(s, x) {
    validate(s); finite(x, 'Position');
    if (x < -s.margin || x > s.length + s.margin) throw new RangeError('Position must lie on the finite vise face');
    var t = x / s.length;
    return s.a + s.m * x + s.bump * 4 * t * (1 - t);
  }
  function raw(s, x) { return validate(s).response * surface(s, x); }
  // zeroValue is the raw comparator value stored when the bezel/reference was set.
  // Geometry can change later without silently changing that stored reference.
  function reading(s, x) { return raw(s, x) - validate(s).zeroValue; }
  function samples(s, count) {
    validate(s); count = count === undefined ? 41 : count;
    if (!Number.isInteger(count) || count < 3 || count > 501) throw new RangeError('Sample count must be an integer from 3 to 501');
    return Array.from({ length: count }, function (_, i) {
      var x = s.length * i / (count - 1);
      return { x: x, surface: surface(s, x), reading: reading(s, x) };
    });
  }
  function result(s) {
    validate(s);
    var candidates = [0, s.length], linear = s.m * s.length;
    // The ideal bump is quadratic. Include its exact stationary point so the lesson's
    // peak is a model result, not an artifact of the drawing's sampling interval.
    if (s.bump !== 0) {
      var t = (4 * s.bump + linear) / (8 * s.bump);
      if (t > 0 && t < 1) candidates.push(t * s.length);
    }
    var readings = candidates.map(function (x) { return reading(s, x); });
    var min = Math.min.apply(null, readings), max = Math.max.apply(null, readings);
    return Object.freeze({
      left: reading(s, 0), center: reading(s, s.length / 2), right: reading(s, s.length),
      endpointDifference: reading(s, s.length) - reading(s, 0), range: max - min,
      min: min, max: max, physicalEndpointDifference: surface(s, s.length) - surface(s, 0)
    });
  }
  function withZero(s, x) {
    validate(s); finite(x, 'Zero position');
    if (x < 0 || x > s.length) throw new RangeError('Zero position must lie on the sweep');
    return Object.assign({}, s, { zeroX: x, zeroValue: raw(s, x) });
  }
  function withResponse(s, response) {
    validate(s);
    var next = Object.assign({}, s, { response: response, zeroValue: 0 });
    validate(next);
    return withZero(next, s.zeroX);
  }
  function withPivot(s, pivot) {
    validate(s); finite(pivot, 'Chosen pivot');
    var next = Object.assign({}, s, { pivot: pivot });
    return validate(next);
  }
  function rotate(s, increment, pivot) {
    validate(s); finite(increment, 'Rotation increment'); finite(pivot, 'Chosen pivot');
    // First-order small-angle pose update over this lesson's fixed 100 mm span.
    // It illustrates alignment geometry; it does not model adjustment forces.
    if (Math.abs(increment) > 0.001) throw new RangeError('Rotation increment must stay within ±0.001 mm per mm');
    if (!onIncrementGrid(increment)) throw new RangeError('Rotation increment must be a multiple of 0.0001 mm per mm');
    increment = Math.round(increment / 0.0001) * 0.0001;
    var travel = Math.round((s.travel + Math.abs(increment)) / 0.0001) * 0.0001;
    var next = Object.assign({}, s, { pivot: pivot, m: s.m + increment, a: s.a - pivot * increment, travel: travel });
    return validate(next);
  }
  function format(v) { return (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3); }
  function formatFine(v) { return (Math.abs(v) < 0.00005 ? 0 : v).toFixed(4); }
  return Object.freeze({ PRESETS: PRESETS, DEFAULT: PRESETS.slope, validate: validate, surface: surface,
    raw: raw, reading: reading, samples: samples, result: result, withZero: withZero, withResponse: withResponse,
    withPivot: withPivot, rotate: rotate, format: format, formatFine: formatFine });
});


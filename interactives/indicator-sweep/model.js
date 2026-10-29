(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiIndicatorSweep = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PRESETS = Object.freeze({
    slope: Object.freeze({ kind: 'slope', length: 100, endRise: 0.06, bump: 0, adjustment: 0, response: 1, zeroX: 0, zeroValue: 0, position: 100 }),
    aligned: Object.freeze({ kind: 'aligned', length: 100, endRise: 0, bump: 0, adjustment: 0, response: 1, zeroX: 0, zeroValue: 0, position: 100 }),
    bump: Object.freeze({ kind: 'bump', length: 100, endRise: 0, bump: 0.08, adjustment: 0, response: 1, zeroX: 0, zeroValue: 0, position: 50 })
  });
  function finite(v, key) {
    if (!Number.isFinite(v)) throw new RangeError(key + ' must be a finite number');
    return v;
  }
  function validate(s) {
    if (!s || !Object.prototype.hasOwnProperty.call(PRESETS, s.kind)) throw new RangeError('Choose a defined jaw case');
    finite(s.length, 'Sweep length'); finite(s.endRise, 'End rise'); finite(s.bump, 'Midspan bump');
    finite(s.adjustment, 'Right-end adjustment'); finite(s.zeroX, 'Zero position'); finite(s.zeroValue, 'Stored zero reading'); finite(s.position, 'Contact position');
    if (s.length < 10 || s.length > 500) throw new RangeError('Sweep length must be from 10 to 500 mm');
    for (var key of ['endRise', 'bump', 'adjustment']) if (Math.abs(s[key]) > 1) throw new RangeError(key + ' must stay within ±1 mm');
    if (s.response !== 1 && s.response !== -1) throw new RangeError('Contact response must be +1 or -1');
    if (s.zeroX < 0 || s.zeroX > s.length || s.position < 0 || s.position > s.length) throw new RangeError('Contact and zero positions must lie on the sweep');
    return s;
  }
  // Positive physical displacement means the jaw is closer to the indicator body.
  function surface(s, x) {
    validate(s); finite(x, 'Position');
    if (x < 0 || x > s.length) throw new RangeError('Position must lie on the sweep');
    var t = x / s.length;
    return (s.endRise + s.adjustment) * t + s.bump * 4 * t * (1 - t);
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
    var candidates = [0, s.length], linear = s.endRise + s.adjustment;
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
  function withAdjustment(s, amount) { return Object.assign({}, validate(s), { adjustment: finite(amount, 'Right-end adjustment') }); }
  function cancelEndpointTrend(s) { return withAdjustment(s, -s.endRise); }
  function format(v) { return (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3); }
  return Object.freeze({ PRESETS: PRESETS, DEFAULT: PRESETS.slope, validate: validate, surface: surface,
    raw: raw, reading: reading, samples: samples, result: result, withZero: withZero, withResponse: withResponse,
    withAdjustment: withAdjustment, cancelEndpointTrend: cancelEndpointTrend, format: format });
});


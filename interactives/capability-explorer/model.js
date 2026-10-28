(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCapability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DEFAULT = Object.freeze({ lsl: 19.95, usl: 20.05, mean: 20, sigma: .01 });
  var PRESETS = Object.freeze({
    precise: Object.freeze({ lsl: 19.95, usl: 20.05, mean: 20.045, sigma: .005 }),
    wide: Object.freeze({ lsl: 19.95, usl: 20.05, mean: 20, sigma: .025 })
  });
  function validate(s) {
    ['lsl', 'usl', 'mean', 'sigma'].forEach(function (k) {
      if (!s || !Number.isFinite(s[k])) throw new RangeError(k + ' must be finite');
    });
    if (s.sigma <= 0 || s.lsl >= s.usl) throw new RangeError('Require sigma > 0 and LSL < USL');
    return s;
  }
  // Abramowitz–Stegun 7.1.26: absolute erf error <= 1.5e-7.
  // Evaluate the complementary tail directly to avoid subtracting near-one values.
  function erfcPositive(x) {
    var t = 1 / (1 + .3275911 * x);
    return (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
  }
  function erf(x) {
    if (typeof x !== 'number' || Number.isNaN(x)) throw new RangeError('erf requires a number');
    if (x === 0) return 0;
    return (x < 0 ? -1 : 1) * (1 - erfcPositive(Math.abs(x)));
  }
  function normalCDF(z) {
    if (typeof z !== 'number' || Number.isNaN(z)) throw new RangeError('CDF requires a number');
    if (z === 0) return .5;
    var tail = .5 * erfcPositive(Math.abs(z) / Math.SQRT2);
    return z < 0 ? tail : 1 - tail;
  }
  function solve(s) {
    validate(s);
    var below = normalCDF((s.lsl - s.mean) / s.sigma);
    var above = normalCDF((s.mean - s.usl) / s.sigma);
    var total = Math.min(1, below + above);
    return { cp: (s.usl - s.lsl) / (6 * s.sigma),
      cpk: Math.min(s.usl - s.mean, s.mean - s.lsl) / (3 * s.sigma),
      below: below, above: above, total: total, ppm: total * 1e6 };
  }
  function format(v, digits) { return v.toFixed(digits === undefined ? 2 : digits); }
  function ppm(v) { return v < 1 ? '<1' : Math.round(v).toLocaleString('en-US'); }
  return { DEFAULT: DEFAULT, PRESETS: PRESETS, validate: validate, erf: erf, normalCDF: normalCDF, solve: solve, format: format, ppm: ppm };
});

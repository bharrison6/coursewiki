(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCSS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DEFAULT = Object.freeze({ units: 'inch', speed: 240, diameter: 2, od: 2, clamp: 1000 });
  function validate(s) {
    if (!s || ['inch', 'metric'].indexOf(s.units) < 0) throw new RangeError('Choose inch or metric units');
    ['speed', 'clamp', 'od'].forEach(function (k) {
      if (!Number.isFinite(s[k]) || s[k] <= 0) throw new RangeError(k + ' must be finite and positive');
    });
    if (!Number.isFinite(s.diameter) || s.diameter < 0 || s.diameter > s.od)
      throw new RangeError('Diameter must be between zero and stock OD');
    return s;
  }
  function solve(s) {
    validate(s);
    var factor = s.units === 'inch' ? 12 : 1000;
    var crossover = s.speed * factor / (Math.PI * s.clamp);
    // null denotes the singular, undefined unclamped request at the centre.
    var unrestricted = s.diameter === 0 ? null : s.speed * factor / (Math.PI * s.diameter);
    var rpm = s.diameter === 0 ? s.clamp : Math.min(s.clamp, unrestricted);
    return { rpm: rpm, surfaceSpeed: Math.PI * s.diameter * rpm / factor,
      crossover: crossover, clampActive: s.diameter <= crossover, unrestricted: unrestricted };
  }
  function units(s) { return s.units === 'inch' ? { length: 'in', speed: 'SFM' } : { length: 'mm', speed: 'm/min' }; }
  function format(v, digits) { return Number(v.toFixed(digits === undefined ? 2 : digits)).toString(); }
  return { DEFAULT: DEFAULT, validate: validate, solve: solve, units: units, format: format };
});

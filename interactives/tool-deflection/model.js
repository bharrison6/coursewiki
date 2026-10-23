(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiDeflection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // N, mm, GPa at the boundary. Internally E is N/mm², so y is mm.
  var DEFAULT = Object.freeze({ length: 80, diameter: 10, force: 100, modulus: 600 });
  function validate(s) {
    ['length', 'diameter', 'modulus'].forEach(function (k) {
      if (!s || !Number.isFinite(s[k]) || s[k] <= 0) throw new RangeError(k + ' must be finite and positive');
    });
    if (!Number.isFinite(s.force) || s.force < 0) throw new RangeError('force must be finite and nonnegative');
    return s;
  }
  function sectionMoment(d) {
    if (!Number.isFinite(d) || d <= 0) throw new RangeError('diameter must be finite and positive');
    return Math.PI * Math.pow(d, 4) / 64;
  }
  function at(s, x) {
    validate(s);
    if (!Number.isFinite(x) || x < 0 || x > s.length) throw new RangeError('x must lie between clamp and load');
    return s.force * x * x * (3 * s.length - x) / (6 * s.modulus * 1000 * sectionMoment(s.diameter));
  }
  function slope(s, x) {
    validate(s);
    if (!Number.isFinite(x) || x < 0 || x > s.length) throw new RangeError('x must lie between clamp and load');
    return s.force * x * (2 * s.length - x) / (2 * s.modulus * 1000 * sectionMoment(s.diameter));
  }
  function solve(s) {
    validate(s);
    var tip = at(s, s.length), slenderness = s.length / s.diameter, relative = tip / s.length;
    return { tip: tip, micrometers: tip * 1000, moment: sectionMoment(s.diameter),
      stiffness: 3 * s.modulus * 1000 * sectionMoment(s.diameter) / Math.pow(s.length, 3),
      slenderness: slenderness, relative: relative,
      // These are conservative teaching prompts, not certified applicability or safety limits.
      shortBeam: slenderness < 4, largeDeflection: relative > 0.01 };
  }
  function compare(current, baseline) {
    var a = solve(current), b = solve(baseline);
    return { current: a, baseline: b, ratio: b.tip === 0 ? null : a.tip / b.tip,
      factors: { length: Math.pow(current.length / baseline.length, 3),
        diameter: Math.pow(baseline.diameter / current.diameter, 4),
        force: baseline.force === 0 ? null : current.force / baseline.force,
        modulus: baseline.modulus / current.modulus } };
  }
  function format(v, places) { return Number(v.toFixed(places === undefined ? 3 : places)).toString(); }
  return { DEFAULT: DEFAULT, validate: validate, sectionMoment: sectionMoment, at: at,
    slope: slope, solve: solve, compare: compare, format: format };
});

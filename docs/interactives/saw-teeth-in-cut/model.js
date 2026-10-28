(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiSawTeeth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Dimensions and depth are mm. Counts are continuous tooth-spacing estimates.
  var PRESETS = Object.freeze({
    tube: Object.freeze({ type: 'tube', diameter: 50.8, wall: 1, thickness: 50.8, height: 25.4, pitch: 6, unit: 'tpi' }),
    fine: Object.freeze({ type: 'flat', diameter: 50.8, wall: 1, thickness: 50.8, height: 25.4, pitch: 24, unit: 'tpi' })
  });
  function positive(v, key) {
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(key + ' must be finite and positive');
    return v;
  }
  function tpiToMM(v) { return positive(25.4 / positive(v, 'TPI'), 'pitch'); }
  function mmToTPI(v) { return positive(25.4 / positive(v, 'pitch'), 'TPI'); }
  function pitchMM(s) {
    if (!s || !['tpi', 'mm'].includes(s.unit)) throw new RangeError('Choose TPI or mm pitch');
    return s.unit === 'tpi' ? tpiToMM(s.pitch) : positive(s.pitch, 'pitch');
  }
  function validate(s) {
    pitchMM(s);
    if (!['flat', 'round', 'tube'].includes(s.type)) throw new RangeError('Choose a section type');
    if (s.type === 'flat') { positive(s.thickness, 'Contact thickness'); positive(s.height, 'Feed height'); }
    else positive(s.diameter, 'Diameter');
    if (s.type === 'tube') {
      positive(s.wall, 'Wall');
      if (s.wall >= s.diameter / 2) throw new RangeError('Wall must be less than the outer radius');
    }
    return s;
  }
  function depth(s) { validate(s); return s.type === 'flat' ? s.height : s.diameter; }
  function chord(radius, offset) {
    var u = Math.abs(offset) / radius;
    return u >= 1 ? 0 : 2 * radius * Math.sqrt((1 - u) * (1 + u));
  }
  function at(s, d) {
    var h = depth(s);
    if (!Number.isFinite(d) || d < 0 || d > h) throw new RangeError('Depth must lie inside the section');
    var outer, inner = 0, intervals;
    if (s.type === 'flat') outer = s.thickness;
    else {
      outer = chord(s.diameter / 2, s.diameter / 2 - d);
      if (s.type === 'tube') inner = chord(s.diameter / 2 - s.wall, s.diameter / 2 - d);
    }
    intervals = outer === 0 ? [] : inner === 0 ? [[-outer / 2, outer / 2]] : [[-outer / 2, -inner / 2], [inner / 2, outer / 2]];
    var length = Math.max(0, outer - inner), teeth = length / pitchMM(s);
    if (!Number.isFinite(teeth)) throw new RangeError('Dimensions and pitch exceed the calculation range');
    return { depth: d, length: length, teeth: teeth, belowThree: teeth < 3, intervals: intervals };
  }
  function solve(s) {
    var h = depth(s), peakDepth = s.type === 'tube' ? s.wall : h / 2;
    // Tube maxima occur at the inner-circle tangencies, not at mid-depth.
    return { min: at(s, 0).teeth, max: at(s, peakDepth).teeth, peakDepth: peakDepth, depth: h };
  }
  function samples(s) {
    var h = depth(s), ds = [0, h / 2, h];
    for (var i = 1; i < 160; i++) ds.push(h * i / 160);
    if (s.type === 'tube') ds.push(s.wall, h - s.wall);
    return Array.from(new Set(ds)).sort(function (a, b) { return a - b; }).map(function (d) { return at(s, d); });
  }
  function rotateFlat(s) {
    validate(s);
    if (s.type !== 'flat') throw new RangeError('Only the rectangular section changes when rotated');
    return Object.assign({}, s, { thickness: s.height, height: s.thickness });
  }
  function format(v) { return v.toFixed(2); }
  return { PRESETS: PRESETS, DEFAULT: PRESETS.tube, validate: validate, pitchMM: pitchMM, tpiToMM: tpiToMM,
    mmToTPI: mmToTPI, depth: depth, at: at, solve: solve, samples: samples, rotateFlat: rotateFlat, format: format };
});

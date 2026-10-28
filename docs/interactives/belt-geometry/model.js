(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiBeltGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEFAULT = Object.freeze({ D: 200, d: 100, C: 400, L: 1277.488898038469, n: 1200, unit: 'mm', mode: 'center' });
  function positive(v, name) {
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(name + ' must be finite and positive.');
  }
  function diameters(D, d) {
    positive(D, 'D'); positive(d, 'd');
    if (D < d) throw new RangeError('D must be at least d.');
  }
  function length(D, d, C) {
    diameters(D, d); positive(C, 'C');
    if (C <= (D + d) / 2) throw new RangeError('Separate the pulleys: C must exceed (D + d)/2.');
    return 2 * C + Math.PI * (D + d) / 2 + (D - d) ** 2 / (4 * C);
  }
  function center(D, d, L) {
    diameters(D, d); positive(L, 'L');
    // 4CL = 8C² + 2π(D+d)C + (D-d)², hence 8C² - BC + (D-d)² = 0.
    // The larger root is the separated-pulley branch; reject overlap below.
    const B = 4 * L - 2 * Math.PI * (D + d);
    const disc = B * B - 32 * (D - d) ** 2;
    if (B <= 0 || disc < 0) throw new RangeError('That length cannot fit these pulleys. Increase L.');
    const C = (B + Math.sqrt(disc)) / 16;
    length(D, d, C);
    return C;
  }
  function solve(s) {
    if (!s || !['mm', 'in'].includes(s.unit) || !['center', 'length'].includes(s.mode)) throw new RangeError('Choose mm or in and a solve mode.');
    if (!Number.isFinite(s.n) || s.n < 0) throw new RangeError('Small-pulley speed must be finite and nonnegative.');
    const C = s.mode === 'length' ? center(s.D, s.d, s.L) : s.C;
    const L = length(s.D, s.d, C), ratio = s.D / s.d;
    const wrap = 180 - 2 * Math.asin((s.D - s.d) / (2 * C)) * 180 / Math.PI;
    const result = { C, L, ratio, largeSpeed: s.n / ratio,
      beltSpeed: Math.PI * s.d * s.n * (s.unit === 'mm' ? .001 : .0254),
      wrap, correction: (s.D - s.d) ** 2 / (4 * C) };
    if (Object.values(result).some(v => !Number.isFinite(v))) throw new RangeError('Values are too large to calculate.');
    return result;
  }
  function convert(s, unit) {
    if (!['mm', 'in'].includes(unit)) throw new RangeError('Choose mm or in.');
    const factor = s.unit === unit ? 1 : unit === 'in' ? 1 / 25.4 : 25.4;
    const out = Object.assign({}, s, { unit });
    ['D', 'd', 'C', 'L'].forEach(k => { out[k] *= factor; });
    return out;
  }
  const format = v => Number(v.toPrecision(6)).toString();
  return { DEFAULT, length, center, solve, convert, format };
});

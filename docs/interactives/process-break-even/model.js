(function (root) {
  'use strict';
  function compare(q) {
    if (!Number.isInteger(q) || q < 1) throw new RangeError('Quantity must be a positive whole number.');
    const a = 120 + 8 * q, b = 720 + 3 * q;
    return { quantity: q, a, b, unitA: a / q, unitB: b / q, cheaper: a === b ? 'tie' : a < b ? 'A' : 'B' };
  }
  const api = Object.freeze({ compare });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CourseWikiProcessBreakEven = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

(function (root) {
  'use strict';
  function number(value) {
    const s = String(value).trim();
    const f = s.match(/^(?:(\d+)[ -])?(\d+)\/(\d+)$/);
    const n = f ? Number(f[1] || 0) + Number(f[2]) / Number(f[3])
      : /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;
    if (!Number.isFinite(n)) throw new RangeError('Enter a nonnegative number or fraction, such as 3/4 or 1-1/2.');
    return n;
  }
  function finite(n) {
    if (!Number.isFinite(n)) throw new RangeError('The values exceed the calculator range.');
    return n;
  }
  function boardFeet(dimensions, units) {
    if (!['ft', 'in'].includes(units)) throw new RangeError('Choose feet or inches for length.');
    const v = ['thickness', 'width', 'length'].map(k => number(dimensions[k]));
    if (v.some(n => n <= 0)) throw new RangeError('All dimensions must be greater than zero.');
    return finite(v[0] * v[1] * v[2] / (units === 'ft' ? 12 : 144));
  }
  function row({ quantity, sale, actual, same, units }) {
    const q = number(quantity);
    if (!Number.isSafeInteger(q) || q < 1) throw new RangeError('Quantity must be a positive whole number.');
    if (typeof same !== 'boolean') throw new RangeError('Specify whether the dimensions are the same.');
    const tallyEach = boardFeet(sale, units);
    const physicalEach = boardFeet(same ? sale : actual || {}, units);
    return { quantity: q, tallyEach, physicalEach, tally: finite(q * tallyEach), physical: finite(q * physicalEach) };
  }
  function total(rows) {
    return rows.reduce((s, r) => ({ tally: finite(s.tally + r.tally), physical: finite(s.physical + r.physical) }), { tally: 0, physical: 0 });
  }
  function cost(tally, price) {
    if (!Number.isFinite(tally) || tally < 0) throw new RangeError('A valid tally is required.');
    return finite(tally * number(price));
  }
  // Allowance convention: percent is the share of the PURCHASED material that will not become parts,
  // so buy = needed / (1 - p). 20% -> x1.25. The "add p% to what you need" convention (needed * (1 + p)) is NOT this.
  function allowance(needed, percent) {
    const n = number(needed), p = number(percent);
    if (p >= 100) throw new RangeError('Allowance must be at least 0% and less than 100%.');
    return finite(n / (1 - p / 100));
  }
  const api = Object.freeze({ number, boardFeet, row, total, cost, allowance });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CourseWikiLumberTally = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

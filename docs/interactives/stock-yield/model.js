(function (root) {
  'use strict';
  // Lengths are integer hundredths of a millimeter; prices are integer cents.
  // At most 120000 length ticks and 60 blanks: all arithmetic below is exact.
  const limits = Object.freeze({
    length: Object.freeze([50, 1200]), blank: Object.freeze([20, 400]),
    kerf: Object.freeze([0, 6]), left: Object.freeze([0, 150]),
    right: Object.freeze([0, 150]), price: Object.freeze([0, 500])
  });
  const defaults = Object.freeze({ length: '1000', blank: '98', kerf: '2', left: '0', right: '0', price: '48' });
  const labels = Object.freeze({ length: 'Stock length', blank: 'Blank length', kerf: 'Kerf', left: 'Left excluded trim', right: 'Right excluded trim', price: 'Stock price' });
  function parse(value, key) {
    if (!Object.hasOwn(limits, key)) throw new RangeError('Unknown input.');
    if (!['number', 'string'].includes(typeof value)) throw new RangeError(`${labels[key]}: enter a decimal with at most two decimal places.`);
    const s = String(value).trim();
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) throw new RangeError(`${labels[key]}: enter a decimal with at most two decimal places.`);
    const ticks = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
    const [min, max] = limits[key];
    if (!Number.isSafeInteger(ticks) || ticks < min * 100 || ticks > max * 100) {
      throw new RangeError(`${labels[key]}: use ${min} to ${max}${key === 'price' ? ' dollars' : ' mm'}.`);
    }
    return ticks;
  }
  function calculate(input) {
    if (!input || typeof input !== 'object') throw new RangeError('Complete the stock layout inputs.');
    const v = Object.fromEntries(Object.keys(limits).map(key => [key, parse(input[key], key)]));
    const trim = v.left + v.right;
    if (trim > v.length) throw new RangeError('The excluded trims together must not exceed stock length.');
    const usable = v.length - trim;
    const pitch = v.blank + v.kerf;
    const count = Math.floor(usable / pitch);
    const parts = count * v.blank;
    const kerfLoss = count * v.kerf;
    const offcut = usable - parts - kerfLoss;
    // Every rectangle has an actual interval, including zero-width ideal kerfs.
    const blanks = Array.from({ length: count }, (_, i) => {
      const start = v.left + i * pitch;
      return Object.freeze({ number: i + 1, start, end: start + v.blank, cutStart: start + v.blank, cutEnd: start + pitch });
    });
    return Object.freeze({
      ticks: Object.freeze(v), trim, usable, pitch, count, cuts: count, parts, kerfLoss, offcut,
      offcutStart: v.left + count * pitch, blanks: Object.freeze(blanks),
      utilization: parts / v.length * 100,
      costPerBlank: count ? v.price / (count * 100) : null,
      // Round a nonnegative rational number of cents half-up, using integers.
      costRoundedCents: count ? Math.floor((2 * v.price + count) / (2 * count)) : null,
      nextStockLength: trim + (count + 1) * pitch,
      additionalForNext: pitch - offcut
    });
  }
  const api = Object.freeze({ limits, defaults, parse, calculate });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CourseWikiStockYield = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiMeasurement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Integer units: ten-thousandths for vernier micrometers; thousandths otherwise.
  const modes = Object.freeze(['micrometer', 'vernier-micrometer', 'vernier-caliper']);
  function reading(mode, units) {
    if (!modes.includes(mode)) throw new RangeError('Unknown instrument');
    const fine = mode === 'vernier-micrometer';
    const max = mode === 'vernier-caliper' ? 1999 : fine ? 9999 : 999;
    if (!Number.isInteger(units) || units < 0 || units > max) throw new RangeError('Reading outside trainer range');
    const factor = fine ? 10000 : 1000;
    const thousandths = fine ? Math.floor(units / 10) : units;
    const main = Math.floor(thousandths / 25) * 25;
    const remainder = thousandths % 25;
    const vernier = fine ? units % 10 : mode === 'vernier-caliper' ? remainder : 0;
    return Object.freeze({mode, units, factor, digits: fine ? 4 : 3, main,
      thimble: mode === 'vernier-caliper' ? 0 : remainder, vernier,
      value: units / factor, text: (units / factor).toFixed(fine ? 4 : 3)});
  }
  function random(mode, rng = Math.random) {
    if (!modes.includes(mode)) throw new RangeError('Unknown instrument');
    const r = rng();
    if (!Number.isFinite(r) || r < 0 || r >= 1) throw new RangeError('Random sample must be in [0, 1)');
    return reading(mode, Math.floor(r * (mode === 'vernier-caliper' ? 2000 : mode === 'vernier-micrometer' ? 10000 : 1000)));
  }
  function check(r, input) {
    // Compare exactly in decimal space: never round an extra digit into a correct answer.
    const s = String(input).trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return false;
    const [whole, fraction = ''] = s.split('.');
    if (/[1-9]/.test(fraction.slice(r.digits))) return false;
    const units = Number(whole || '0') * r.factor + Number(fraction.slice(0, r.digits).padEnd(r.digits, '0'));
    return units === r.units;
  }
  function explain(r) {
    const main = (r.main / 1000).toFixed(r.digits);
    if (r.mode === 'vernier-caliper') return `Main scale ${main} + vernier ${r.vernier} × 0.001 = ${r.text} in.`;
    const thimble = (r.thimble / 1000).toFixed(r.digits);
    return `Sleeve ${main} + thimble ${thimble}` +
      (r.mode === 'vernier-micrometer' ? ` + vernier ${r.vernier} × 0.0001` : '') + ` = ${r.text} in.`;
  }
  function describe(r) {
    if (r.mode === 'vernier-caliper') return `The vernier zero is ${r.vernier ? 'past' : 'exactly on'} the ${(r.main / 1000).toFixed(3)} in main-scale line. Vernier division ${r.vernier} aligns with a main-scale line.`;
    return `The last reached sleeve line is ${(r.main / 1000).toFixed(3)} in. ` +
      (r.vernier ? `The datum lies between thimble ${r.thimble} and ${(r.thimble + 1) % 25}; sleeve vernier line ${r.vernier} aligns.` : `Thimble ${r.thimble} aligns with the datum.`);
  }
  return Object.freeze({modes, reading, random, check, explain, describe});
});

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiWireDrop = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RHO = 1.724e-8, FT = 0.3048;
  const DEFAULT = Object.freeze({ voltage: 24, current: 5, length: 50, unit: 'ft', awg: 18 });
  function diameter(awg) {
    if (!Number.isInteger(awg) || awg < 4 || awg > 30) throw new RangeError('Use an integer AWG from 4 to 30.');
    return 0.127 * Math.pow(92, (36 - awg) / 39); // mm
  }
  function solve(s) {
    if (!s || !['voltage', 'current', 'length'].every(k => Number.isFinite(s[k]))) throw new RangeError('Enter finite numbers.');
    if (s.voltage < 5 || s.voltage > 240 || s.current < 0.1 || s.current > 30 || s.length < 0 || s.length > 1000) throw new RangeError('Use 5–240 V, 0.1–30 A and a one-way length from 0 to 1000.');
    if (s.unit !== 'ft' && s.unit !== 'm') throw new RangeError('Choose ft or m.');
    const diameterMm = diameter(s.awg), areaM2 = Math.PI * (diameterMm / 1000) ** 2 / 4;
    const oneWayM = s.length * (s.unit === 'ft' ? FT : 1), loopM = 2 * oneWayM;
    const ohmsPerM = RHO / areaM2, loopResistance = ohmsPerM * loopM;
    const drop = s.current * loopResistance, percent = drop / s.voltage * 100;
    return { diameterMm, areaM2, oneWayM, loopM, ohmsPer1000Ft: ohmsPerM * 1000 * FT,
      ohmsPerKm: ohmsPerM * 1000, loopResistance, drop, percent,
      loadVoltage: s.voltage - drop, loss: s.current ** 2 * loopResistance,
      feasible: drop < s.voltage };
  }
  function format(n) { return Number(n.toPrecision(4)).toString(); }
  return { RHO, FT, DEFAULT, diameter, solve, format };
});

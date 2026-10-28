/* Dimensionless compatibility model. No temperature, material or force prediction. */
(function (root) {
  'use strict';
  function calculate(heat, mode, travel) {
    if (!Number.isFinite(heat) || heat < 0 || heat > 100) throw new RangeError('Heat must be 0–100');
    if (mode !== 'floating' && mode !== 'fixed') throw new RangeError('Unknown support arrangement');
    if (!Number.isFinite(travel) || travel < 0 || travel > 1) throw new RangeError('Travel must be 0–1');
    const free = heat / 100;
    const accommodated = mode === 'floating' ? Math.min(free, travel) : 0;
    const restrained = Math.max(0, free - accommodated);
    return {free, accommodated, restrained, limited: restrained > 1e-9};
  }
  const api = {calculate};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiShaftThermal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

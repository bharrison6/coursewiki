(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiBacklashKinematics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Rigid play operator: the driven position holds until one moving bound reaches it.
  function clampBetween(position, lower, upper) {
    if (![position, lower, upper].every(Number.isFinite) || lower > upper) throw new RangeError('Finite ordered bounds are required.');
    return Math.min(Math.max(position, lower), upper);
  }
  function clampToBand(position, phase, clearance) {
    if (![position, phase, clearance].every(Number.isFinite) || clearance < 0) throw new RangeError('Position, phase and nonnegative clearance must be finite.');
    return clampBetween(position, phase - clearance / 2, phase + clearance / 2);
  }
  return Object.freeze({ clampBetween: clampBetween, clampToBand: clampToBand });
});

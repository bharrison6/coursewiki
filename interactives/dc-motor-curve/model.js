(function (root) {
  'use strict';
  function operatingPoint(stall, noLoad, load) {
    if (![stall, noLoad, load].every(Number.isFinite) || stall <= 0 || noLoad <= 0 || load < 0) {
      throw new RangeError('Use positive stall torque and no-load speed, and nonnegative load torque.');
    }
    const peakSpeed = noLoad / 2;
    const peakTorque = stall / 2;
    const peakPower = stall * noLoad * Math.PI / 120;
    if (!Number.isFinite(peakPower)) throw new RangeError('Values are too large.');
    if (load > stall) return { state: 'overload', speed: null, omega: null, power: null, peakSpeed, peakTorque, peakPower };
    const speed = noLoad * (1 - load / stall);
    const omega = speed * Math.PI / 30;
    return { state: load === stall ? 'stall' : 'running', speed, omega, power: load * omega, peakSpeed, peakTorque, peakPower };
  }
  const api = Object.freeze({ operatingPoint });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiDCMotor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

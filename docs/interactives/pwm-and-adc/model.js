(function (root) {
  'use strict';
  function range(value, min, max) {
    if (!Number.isFinite(value) || value < min || value > max) throw new RangeError('Value outside model range');
    return value;
  }
  function adc(volts) {
    range(volts, 0, 5);
    return Math.min(1023, Math.floor(volts * 1024 / 5));
  }
  function voltage(code) {
    range(code, 0, 1023);
    if (!Number.isInteger(code)) throw new RangeError('Code must be an integer');
    return code * 5 / 1024;
  }
  function pwm(percent, frequency) {
    range(percent, 0, 100); range(frequency, 1, 100000);
    const duty = percent / 100, period = 1 / frequency;
    return { duty, period, onTime: duty * period, average: 5 * duty, writeValue: Math.round(255 * duty) };
  }
  // Exact settled response of an unloaded first-order RC filter, at cycle phase 0..1.
  function filtered(percent, frequency, phase, tau = 0.01) {
    const p = pwm(percent, frequency);
    range(phase, 0, 1); range(tau, 1e-9, 1e6);
    if (p.duty === 0 || p.duty === 1) return p.average;
    const b = Math.exp(-(p.period - p.onTime) / tau);
    const top = 5 * (-Math.expm1(-p.onTime / tau)) / (-Math.expm1(-p.period / tau));
    const bottom = top * b, t = phase * p.period;
    return phase <= p.duty ? 5 + (bottom - 5) * Math.exp(-t / tau) : top * Math.exp(-(t - p.onTime) / tau);
  }
  const api = Object.freeze({ adc, voltage, pwm, filtered });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiPwmAdc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

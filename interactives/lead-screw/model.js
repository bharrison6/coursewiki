(function (root) {
  'use strict';
  const NM_PER_LBF_IN = 0.1129848290276167;
  function calculate({ pitch, starts, rpm, torque, efficiency, units = 'mm' }) {
    if (!['mm', 'in'].includes(units)) throw new RangeError('Choose mm or in.');
    if (![pitch, starts, rpm, torque, efficiency].every(Number.isFinite)) throw new RangeError('Enter a finite number in every field.');
    if (pitch <= 0 || !Number.isInteger(starts) || starts < 1 || starts > 12 || rpm < 0 || torque < 0 || efficiency <= 0 || efficiency > 100) {
      throw new RangeError('Use pitch > 0, 1–12 whole starts, rpm and torque ≥ 0, and efficiency > 0 to 100%.');
    }
    const lead = pitch * starts;
    const speedMinute = rpm * lead;
    const speedSecond = speedMinute / 60;
    const theoreticalForce = 2 * Math.PI * torque / (units === 'mm' ? lead / 1000 : lead);
    const actualForce = theoreticalForce * efficiency / 100;
    if (![lead, speedMinute, speedSecond, theoreticalForce, actualForce].every(Number.isFinite) || lead <= 0) throw new RangeError('The values exceed the calculator range.');
    return { lead, speedMinute, speedSecond, theoreticalForce, actualForce };
  }
  function convertInputs(pitch, torque, from, to) {
    if (!['mm', 'in'].includes(from) || !['mm', 'in'].includes(to)) throw new RangeError('Unknown units.');
    if (from === to) return { pitch, torque };
    return from === 'mm' ? { pitch: pitch / 25.4, torque: torque / NM_PER_LBF_IN } : { pitch: pitch * 25.4, torque: torque * NM_PER_LBF_IN };
  }
  const api = { calculate, convertInputs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CourseWikiLeadScrew = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

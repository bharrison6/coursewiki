(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiAcWaveform = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = 2 * Math.PI;
  function finite(name, value) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
    return value;
  }
  function analyze({ offset, amplitude, frequency, resistance }) {
    [offset, amplitude, frequency, resistance].forEach((value, index) => finite(['Offset', 'Amplitude', 'Frequency', 'Resistance'][index], value));
    if (offset < -10 || offset > 10) throw new RangeError('Use a DC offset from −10 to 10 V.');
    if (amplitude < 0 || amplitude > 10) throw new RangeError('Use a sine amplitude from 0 to 10 V.');
    if (frequency < 0 || frequency > 1000 || (amplitude > 0 && frequency < .1)) throw new RangeError('Use 0.1–1000 Hz for a sine; pure DC may use 0 Hz.');
    if (resistance < .1 || resistance > 10000) throw new RangeError('Use a resistance from 0.1 to 10,000 Ω.');
    const acRms = amplitude / Math.SQRT2;
    const totalRms = Math.hypot(offset, acRms);
    if (![totalRms, totalRms * totalRms / resistance].every(Number.isFinite)) throw new RangeError('The derived RMS and power must stay finite.');
    return Object.freeze({ offset, amplitude, frequency, resistance,
      mean: offset, acRms, totalRms, minimum: offset - amplitude, maximum: offset + amplitude,
      peakToPeak: 2 * amplitude, period: amplitude === 0 ? null : 1 / frequency,
      averagePower: totalRms * totalRms / resistance,
      crossesZero: amplitude > 0 && Math.abs(offset) < amplitude,
      touchesZero: amplitude > 0 && Math.abs(offset) === amplitude });
  }
  function instantaneous(input, phase) {
    const result = analyze(input);
    finite('Phase', phase);
    if (phase < 0 || phase >= 1) throw new RangeError('Use normalized phase from 0 up to, but not including, 1.');
    return result.offset + result.amplitude * Math.sin(TAU * phase);
  }
  function samples(input, count = 161) {
    if (!Number.isInteger(count) || count < 2 || count > 2001) throw new RangeError('Use 2–2001 whole drawing samples.');
    return Object.freeze(Array.from({ length: count }, (_, index) => {
      const phase = index / (count - 1);
      const wrapped = phase === 1 ? 0 : phase;
      return Object.freeze({ phase, value: instantaneous(input, wrapped) });
    }));
  }
  return Object.freeze({ TAU, analyze, instantaneous, samples });
});

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCircuits = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function solve({ voltage, mode, resistances, closed }) {
    if (!Number.isFinite(voltage) || voltage < 0 || voltage > 48) throw new RangeError('Supply: use 0–48 V.');
    if (!['series', 'parallel'].includes(mode)) throw new RangeError('Choose series or parallel.');
    if (!Array.isArray(resistances) || ![2, 3].includes(resistances.length) ||
        resistances.some(r => !Number.isFinite(r) || r < 1 || r > 1000)) throw new RangeError('Use two or three resistances from 1–1000 ohms.');
    if (!Array.isArray(closed) || closed.length !== resistances.length || closed.some(c => typeof c !== 'boolean')) throw new RangeError('Each resistor needs a switch state.');
    const conducting = mode === 'series' ? closed.every(Boolean) : closed.some(Boolean);
    const resistance = !conducting ? Infinity : mode === 'series' ? resistances.reduce((a, r) => a + r, 0) :
      1 / resistances.reduce((a, r, i) => a + (closed[i] ? 1 / r : 0), 0);
    const current = conducting ? voltage / resistance : 0;
    const elements = resistances.map((r, i) => {
      const amps = mode === 'series' ? current : closed[i] ? voltage / r : 0;
      return { resistance: r, closed: closed[i], current: amps, voltage: amps * r, power: amps * amps * r };
    });
    return { mode, voltage, resistance, current, power: voltage * current, elements };
  }
  return { solve };
});

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
  function seriesPointIds(count) {
    if (![2, 3].includes(count)) throw new RangeError('Use two or three series resistors.');
    const ids = ['supply-positive'];
    for (let i = 0; i < count; i++) {
      ids.push(`switch-${i + 1}-out`);
      if (i < count - 1) ids.push(`resistor-${i + 1}-out`);
    }
    ids.push('supply-negative');
    return Object.freeze(ids);
  }
  function seriesNodePotentials({ voltage, resistances, closed }) {
    const solution = solve({ voltage, mode: 'series', resistances, closed });
    const ids = seriesPointIds(resistances.length), open = [];
    closed.forEach((value, index) => { if (!value) open.push(index); });
    const values = {};
    if (open.length === 0) {
      let potential = voltage;
      values['supply-positive'] = potential;
      resistances.forEach((resistance, index) => {
        values[`switch-${index + 1}-out`] = potential;
        potential -= solution.current * resistance;
        if (index < resistances.length - 1) values[`resistor-${index + 1}-out`] = potential;
      });
      values['supply-negative'] = 0;
    } else {
      const firstBoundary = 2 * open[0], lastBoundary = 2 * open[open.length - 1];
      ids.forEach((id, index) => {
        values[id] = index <= firstBoundary ? voltage : index >= lastBoundary + 1 ? 0 : null;
      });
    }
    return Object.freeze({ supported: open.length <= 1,
      reason: open.length <= 1 ? null : 'More than one open switch leaves a floating node whose ideal voltage is not determined.',
      points: Object.freeze(values), pointIds: ids, solution });
  }
  function probeVoltage(state, redId, blackId) {
    if (!state || !state.points || !state.pointIds) throw new TypeError('Use a series-node-potential result.');
    if (!state.pointIds.includes(redId) || !state.pointIds.includes(blackId)) throw new RangeError('Choose named probe points from this circuit.');
    if (redId === blackId) return 0;
    const red = state.points[redId], black = state.points[blackId];
    return red === null || black === null ? null : red - black;
  }
  return { solve, seriesPointIds, seriesNodePotentials, probeVoltage };
});

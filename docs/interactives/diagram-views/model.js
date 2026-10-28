(function (root) {
  'use strict';
  const views = Object.freeze(['comparison', 'pictorial', 'wiring', 'schematic', 'block']);
  const components = Object.freeze(['battery', 'switch', 'resistor', 'led']);
  const descriptions = Object.freeze({
    battery: 'B1 battery: supplies energy to the circuit.',
    switch: 'S1 switch: opens or closes the conducting path.',
    resistor: 'R1 resistor: limits the LED current.',
    led: 'D1 LED: produces light when operated with suitable forward current.'
  });
  const connections = Object.freeze([
    Object.freeze(['B1+', 'S1.1']), Object.freeze(['S1.2', 'R1.1']),
    Object.freeze(['R1.2', 'D1.A']), Object.freeze(['D1.K', 'B1-'])
  ]);
  function initial() { return { view: 'comparison', component: 'battery' }; }
  function select(state, field, value) {
    const allowed = field === 'view' ? views : field === 'component' ? components : [];
    if (!allowed.includes(value)) throw new RangeError('Unknown drawing selection');
    return { ...state, [field]: value };
  }
  const api = Object.freeze({ views, components, descriptions, connections, initial, select });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CourseWikiDiagramViews = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

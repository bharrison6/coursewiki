(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CadStateHistoryScenarios = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var intro = {
    id: 'bracket-milestones',
    name: 'Mounting bracket milestones',
    workspace: { id: 'main', name: 'Main workspace' },
    features: [
      { id: 'mount-sketch', name: 'Mounting sketch', parameter: 'width', unit: 'mm', value: 60, min: 30, max: 100 },
      { id: 'base-extrude', name: 'Base extrude', parameter: 'depth', unit: 'mm', value: 12, min: 4, max: 30 },
      { id: 'edge-fillet', name: 'Edge fillet', parameter: 'radius', unit: 'mm', value: 2, min: 0, max: 6 }
    ]
  };

  return { intro: intro };
});

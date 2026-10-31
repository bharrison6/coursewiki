(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.CadEndConditionsRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function number(value) { return String(Math.round(value * 100) / 100); }
  function svg(state) {
    if (!state || state.ok !== true || !state.parameters || !state.result) return '';
    var p = state.parameters, r = state.result;
    var top = 58, scale = 170 / Math.max(p.plateThickness, 16);
    var plateHeight = p.plateThickness * scale, removedHeight = r.removedDepth * scale;
    var bottom = top + plateHeight, cutBottom = top + removedHeight;
    var label = p.endType === 'blind' ? 'Blind ' + number(p.blindDepth) + ' mm' : 'Through all';
    var floor = r.isOpen ? 'open through plate' : number(r.floorThickness) + ' mm floor remains';
    var material = r.isOpen ?
      'M70 ' + top + 'H205V' + bottom + 'H70Z M315 ' + top + 'H450V' + bottom + 'H315Z' :
      'M70 ' + top + 'H205V' + cutBottom + 'H315V' + top + 'H450V' + bottom + 'H70Z';
    var cut = r.isOpen ?
      'M205 ' + top + 'H315 M205 ' + top + 'V' + bottom + ' M315 ' + top + 'V' + bottom :
      'M205 ' + top + 'H315V' + cutBottom + 'H205Z';
    return '<svg class="cec-section" viewBox="0 0 520 285" role="img" aria-label="Plate section. ' + label + '. Plate thickness ' + number(p.plateThickness) + ' millimeters; ' + floor + '.">' +
      '<text class="cec-title" x="16" y="25">SECTION · ONE PLATE / ONE DOWNWARD CUT</text>' +
      '<path class="cec-material" d="' + material + '" fill-rule="evenodd"/>' +
      '<path class="cec-cut" d="' + cut + '"/>' +
      '<path class="cec-dimension" d="M466 ' + top + 'V' + bottom + 'm-6 ' + (-plateHeight) + 'h12m-12 ' + plateHeight + 'h12"/>' +
      '<text class="cec-label" x="476" y="' + (top + plateHeight / 2) + '" transform="rotate(90 476 ' + (top + plateHeight / 2) + ')">' + number(p.plateThickness) + ' mm plate</text>' +
      '<text class="cec-label" x="260" y="49" text-anchor="middle">' + label + '</text>' +
      '<text class="cec-result-label" x="260" y="270" text-anchor="middle">Actual removal ' + number(r.removedDepth) + ' mm · ' + floor + '</text>' +
      '</svg>';
  }
  return { svg: svg };
});

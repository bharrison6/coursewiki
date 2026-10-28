/* USDA FPL-GTR-282 (2021), chapter 13, Table 13-5 and Equation 13-3.
   Coefficients are per percentage point MC, not green-to-oven-dry percentages. */
(function (root) {
  'use strict';
  const species = Object.freeze([
    ['Ash, white', .00169, .00219],
    ['Basswood, American', .00230, .00234],
    ['Beech, American', .00190, .00330],
    ['Birch, yellow', .00256, .00327],
    ['Cherry, black', .00126, .00223],
    ['Hickory, true', .00259, .00315],
    ['Maple, red (soft maple)', .00102, .00252],
    ['Maple, sugar (hard maple)', .00151, .00400],
    ['Red oak, northern red', .00148, .00338],
    ['White oak, white', .00183, .00462],
    ['Poplar, yellow (yellow-poplar)', .00137, .00216],
    ['Walnut, black', .00112, .00308],
    ['Douglas-fir, Coast-type', .00165, .00267],
    ['Fir, white', .00112, .00245],
    ['Pine, loblolly (a southern yellow pine)', .00165, .00234],
    ['Pine, ponderosa', .00133, .00252],
    ['Cedar, western red', .00111, .00234]
  ].map(([name, radial, tangential]) => Object.freeze({name, radial, tangential})));
  const orientations = Object.freeze({
    'flat-width': 'tangential', 'quarter-width': 'radial',
    'flat-thickness': 'radial', unknown: 'tangential'
  });
  function calculate({speciesIndex, orientation, dimension, unit, initialMC, finalMC}) {
    if (!Number.isInteger(speciesIndex) || !species[speciesIndex]) throw new RangeError('Choose a listed species.');
    if (!Object.hasOwn(orientations, orientation)) throw new RangeError('Choose a listed orientation.');
    if (unit !== 'in' && unit !== 'mm') throw new RangeError('Choose inches or millimeters.');
    if (!Number.isFinite(dimension) || dimension <= 0) throw new RangeError('Enter a positive starting dimension.');
    if (![initialMC, finalMC].every(m => Number.isFinite(m) && m >= 6 && m <= 14)) {
      throw new RangeError('Both moisture contents must be between 6% and 14%, inclusive. Outside this range a different method applies; no estimate is given.');
    }
    const direction = orientations[orientation], coefficient = species[speciesIndex][direction];
    const change = dimension * coefficient * (finalMC - initialMC);
    const finalDimension = dimension + change;
    if (!Number.isFinite(finalDimension)) throw new RangeError('Dimension is too large to calculate.');
    return {change, finalDimension, direction, coefficient, unit};
  }
  const api = Object.freeze({species, calculate});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiWoodMovement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

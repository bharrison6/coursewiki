/* USDA FPL-GTR-282 (2021), chapter 13, Table 13-5 and Equation 13-3.
   Coefficients are per percentage point MC, not green-to-oven-dry percentages. */
(function (root) {
  'use strict';
  const species = Object.freeze([
    ['Ash, white', .00169, .00274],
    ['Basswood, American', .00230, .00330],
    ['Beech, American', .00190, .00431],
    ['Birch, yellow', .00256, .00338],
    ['Cherry, black', .00126, .00248],
    ['Hickory, true', .00259, .00411],
    ['Maple, red (soft maple)', .00137, .00289],
    ['Maple, sugar (hard maple)', .00165, .00353],
    ['Red oak, northern red', .00137, .00304],
    ['White oak, white', .00194, .00376],
    ['Poplar, yellow (yellow-poplar)', .00158, .00289],
    ['Walnut, black', .00190, .00274],
    ['Douglas-fir, Coast-type', .00165, .00267],
    ['Fir, white', .00112, .00245],
    ['Pine, loblolly (a southern yellow pine)', .00165, .00259],
    ['Pine, ponderosa', .00133, .00216],
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
  // Derived geometry, not an additional USDA material law: uniform free strain,
  // one fixed reference, and a stationary support. Points are ideal width edges.
  function attachmentTravel(input) {
    const movement = calculate(input);
    const {anchor, inward, outward, dimension} = input;
    if (!['center', 'left-edge'].includes(anchor)) throw new RangeError('Choose center or left-edge fixing.');
    if (![inward, outward].every(n => Number.isFinite(n) && n >= 0)) {
      throw new RangeError('Enter nonnegative finite inward and outward clear travel.');
    }
    if (input.orientation === 'flat-thickness') throw new RangeError('Choose a width direction for the attachment experiment.');
    const reference = anchor === 'center' ? dimension / 2 : 0;
    const strain = movement.change / dimension;
    const points = [0, dimension].map((position, i) => {
      // Normalizing first avoids overflow for otherwise valid large dimensions.
      const fraction = (position - reference) / dimension;
      const displacement = fraction * movement.change;
      const signedTravel = Math.abs(fraction) * movement.change; // + away, − toward reference
      const direction = signedTravel > 0 ? 'outward' : signedTravel < 0 ? 'inward' : 'none';
      const demand = Math.abs(signedTravel), available = direction === 'inward' ? inward : outward;
      const remaining = available - demand;
      const epsilon = Number.EPSILON * 8 * Math.max(available, demand);
      const status = direction === 'none' ? 'stationary' : remaining < -epsilon ? 'exceeds' : Math.abs(remaining) <= epsilon ? 'at-limit' : 'within';
      return {edge: i === 0 ? 'left' : 'right', position, displacement, signedTravel, direction, demand, available, remaining, status};
    });
    return {...movement, anchor, reference, strain, inward, outward, points};
  }
  const api = Object.freeze({species, calculate, attachmentTravel});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiWoodMovement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiResinBatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function positive(value, name) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(name + ' must be finite and greater than zero.');
    return value;
  }
  function nonnegative(value, name) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(name + ' must be finite and zero or greater.');
    return value;
  }
  // Internal units: grams and millilitres. No rounded result feeds another calculation.
  // A volume specification becomes mass weights a*rhoA : b*rhoB.
  function batch(s) {
    if (!s) throw new RangeError('Batch inputs are required.');
    positive(s.ratioA, 'A ratio parts'); positive(s.ratioB, 'B ratio parts');
    positive(s.densityA, 'A density'); positive(s.densityB, 'B density');
    positive(s.amountG, 'Given mass'); nonnegative(s.tareG, 'Container tare');
    if (s.basis !== 'mass' && s.basis !== 'volume') throw new RangeError('Choose mass or volume as the ratio basis.');
    if (s.mode !== 'total' && s.mode !== 'given-a') throw new RangeError('Choose target total mass or given A mass.');
    var weightA = s.ratioA * (s.basis === 'volume' ? s.densityA : 1);
    var weightB = s.ratioB * (s.basis === 'volume' ? s.densityB : 1);
    positive(weightA, 'A mass weight'); positive(weightB, 'B mass weight');
    // Normalize before summing to avoid needless overflow in a+b.
    var scale = Math.max(weightA, weightB), a = weightA / scale, b = weightB / scale;
    var massA = s.mode === 'total' ? s.amountG * (a / (a + b)) : s.amountG;
    var massB = s.mode === 'total' ? s.amountG * (b / (a + b)) : s.amountG * (b / a);
    var totalG = massA + massB, volumeA = massA / s.densityA, volumeB = massB / s.densityB;
    var afterAGrossG = s.tareG + massA, finalGrossG = s.tareG + totalG;
    [massA, massB, totalG, volumeA, volumeB, afterAGrossG, finalGrossG].forEach(function (value) {
      positive(value, 'Calculated quantity (use less extreme inputs)');
    });
    return { massAG: massA, massBG: massB, totalG: totalG, volumeAMl: volumeA, volumeBMl: volumeB,
      massRatioAtoB: positive(massA / massB, 'Calculated mass ratio'),
      volumeRatioAtoB: positive(volumeA / volumeB, 'Calculated volume ratio'),
      emptyGrossG: s.tareG, afterAGrossG: afterAGrossG, finalGrossG: finalGrossG,
      afterATaredG: massA, finalTaredG: totalG };
  }
  function convertMass(value, from, to) {
    nonnegative(value, 'Mass');
    if (![from, to].every(function (unit) { return unit === 'g' || unit === 'kg'; })) throw new RangeError('Unknown mass unit.');
    var result = from === to ? value : from === 'g' ? value / 1000 : value * 1000;
    nonnegative(result, 'Converted mass');
    if (value > 0 && result === 0) throw new RangeError('Converted mass is too small.');
    return result;
  }
  return { batch: batch, convertMass: convertMass };
});

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCoolantMix = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function positive(v, name) { if (!Number.isFinite(v) || v <= 0) throw new RangeError(name + ' must be finite and positive'); }
  function nonnegative(v, name) { if (!Number.isFinite(v) || v < 0) throw new RangeError(name + ' must be finite and nonnegative'); }
  function percent(v) { nonnegative(v, 'Percent'); if (v >= 100) throw new RangeError('Percent must be below 100'); }
  function ratioToPercent(water, concentrate) {
    positive(water, 'Water parts'); nonnegative(concentrate, 'Concentrate parts');
    var p = 100 / (1 + water / concentrate); percent(p); return p;
  }
  function percentToRatio(p) { percent(p); return p === 0 ? { water: 1, concentrate: 0 } : { water: (100 - p) / p, concentrate: 1 }; }
  function brixToPercent(brix, factor) { nonnegative(brix, 'Brix'); positive(factor, 'Factor'); var p = brix * factor; percent(p); return p; }
  function result(volume, concentration, capacity) {
    positive(volume, 'Final volume'); percent(concentration);
    if (capacity !== undefined) positive(capacity, 'Capacity');
    return { finalVolume: volume, finalPercent: concentration, exceedsCapacity: capacity !== undefined && volume > capacity };
  }
  function correctSump(s) {
    if (!s) throw new RangeError('Sump inputs required');
    positive(s.volume, 'Volume'); percent(s.currentPercent); percent(s.targetPercent);
    var c = s.currentPercent, t = s.targetPercent, addition = 0, substance = 'none';
    if (c > t && t === 0) throw new RangeError('No finite water addition reaches exactly 0% from a nonzero concentration');
    if (c < t) { addition = s.volume * ((t - c) / (100 - t)); substance = 'neat concentrate'; }
    if (c > t) { addition = s.volume * ((c - t) / t); substance = 'water'; }
    return Object.assign(result(s.volume + addition, t, s.capacity), { addition: addition, substance: substance });
  }
  // Volume and concentration are BEFORE the loss. Default loss is well-mixed carry-out.
  // Pure-water evaporation is an explicit idealisation, not the same loss mechanism.
  function topUp(s) {
    if (!s) throw new RangeError('Top-up inputs required');
    positive(s.volume, 'Volume'); percent(s.currentPercent); percent(s.mixPercent); nonnegative(s.lossVolume, 'Loss volume');
    if (s.lossVolume >= s.volume) throw new RangeError('Loss must be less than starting volume');
    var kind = s.lossKind === undefined ? 'carry-out' : s.lossKind;
    if (kind !== 'carry-out' && kind !== 'evaporation') throw new RangeError('Unknown loss kind');
    var remaining = s.volume - s.lossVolume;
    var concentrate = (kind === 'evaporation' ? s.volume : remaining) * s.currentPercent / 100;
    var afterLossPercent = concentrate / remaining * 100; percent(afterLossPercent);
    var finalPercent = (concentrate + s.lossVolume * s.mixPercent / 100) / s.volume * 100;
    return Object.assign(result(s.volume, finalPercent, s.capacity), { afterLossVolume: remaining, afterLossPercent: afterLossPercent });
  }
  function convertVolume(v, from, to) {
    nonnegative(v, 'Volume');
    if (![from, to].every(function (u) { return u === 'L' || u === 'US gal'; })) throw new RangeError('Unknown volume unit');
    var value = from === to ? v : from === 'L' ? v / 3.785411784 : v * 3.785411784;
    nonnegative(value, 'Converted volume'); return value;
  }
  function format(v, digits) { return v.toFixed(digits === undefined ? 2 : digits); }
  return { ratioToPercent: ratioToPercent, percentToRatio: percentToRatio, brixToPercent: brixToPercent,
    correctSump: correctSump, topUp: topUp, convertVolume: convertVolume, format: format };
});

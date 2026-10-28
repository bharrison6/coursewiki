'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../../interactives/coolant-mix/model.js');
const D = require('../../interactives/coolant-mix/render.js');
const base = { volume: 100, currentPercent: 3, targetPercent: 5, capacity: 120 };
function near(a, b, tolerance = 1e-10) { assert.ok(Math.abs(a - b) < tolerance, `${a} should equal ${b}`); }
test('ratio order and inverse use total parts, including zero concentrate', () => {
  near(M.ratioToPercent(20, 1), 4.761904761904762);
  assert.deepEqual(M.percentToRatio(5), { water: 19, concentrate: 1 });
  assert.deepEqual(M.percentToRatio(0), { water: 1, concentrate: 0 });
  near(M.ratioToPercent(1, 0), 0);
  for (const p of [.1, 4, 50, 99.9]) { const r = M.percentToRatio(p); near(M.ratioToPercent(r.water, r.concentrate), p); }
});
test('Brix conversion uses the entered factor', () => { near(M.brixToPercent(6, 1), 6); near(M.brixToPercent(3.2, 1.5), 4.8); });
test('lean and rich corrections satisfy independently checked concentrate balances', () => {
  const lean = M.correctSump(base); near(lean.addition, 2.105263157894737); near(lean.finalVolume, 102.10526315789474);
  near((3 + lean.addition) / lean.finalVolume, .05); assert.equal(lean.substance, 'neat concentrate');
  const rich = M.correctSump({ ...base, currentPercent: 8 }); near(rich.addition, 60); near(rich.finalVolume, 160);
  near(8 / rich.finalVolume, .05); assert.equal(rich.substance, 'water');
  near(M.correctSump({ ...base, currentPercent: 5 }).addition, 0);
  near(M.correctSump({ ...base, currentPercent: 0, targetPercent: 0 }).finalPercent, 0);
});
test('capacity boundary uses final volume rather than addition alone', () => {
  assert.equal(M.correctSump(base).exceedsCapacity, false);
  assert.equal(M.correctSump({ ...base, capacity: 101 }).exceedsCapacity, true);
  assert.equal(M.correctSump({ ...base, currentPercent: 8, capacity: 160 }).exceedsCapacity, false);
  assert.equal(M.correctSump({ ...base, currentPercent: 8, capacity: 159.99 }).exceedsCapacity, true);
});
test('carry-out and evaporation give different water and premix outcomes', () => {
  const s = { volume: 100, currentPercent: 5, lossVolume: 20, mixPercent: 0 };
  near(M.topUp(s).finalPercent, 4); near(M.topUp({ ...s, mixPercent: 5 }).finalPercent, 5);
  const evaporation = { ...s, lossKind: 'evaporation' };
  near(M.topUp(evaporation).afterLossPercent, 6.25); near(M.topUp(evaporation).finalPercent, 5);
  near(M.topUp({ ...evaporation, mixPercent: 5 }).finalPercent, 6);
  near(M.topUp({ ...s, currentPercent: 3 }).finalPercent, 2.4);
  near(M.topUp({ ...s, lossVolume: 0 }).finalPercent, 5);
  assert.equal(M.topUp({ ...s, capacity: 99 }).exceedsCapacity, true);
});
test('US gallons convert all volume balances without changing concentration', () => {
  near(M.convertVolume(1, 'US gal', 'L'), 3.785411784);
  const s = { ...base, volume: M.convertVolume(100, 'L', 'US gal'), capacity: M.convertVolume(120, 'L', 'US gal') };
  near(M.convertVolume(M.correctSump(s).addition, 'US gal', 'L'), M.correctSump(base).addition);
});
test('guards reject invalid inputs and impossible dilution or evaporation', () => {
  for (const key of ['volume', 'currentPercent', 'targetPercent', 'capacity']) for (const v of [NaN, Infinity, -1, '5', null])
    assert.throws(() => M.correctSump({ ...base, [key]: v }), RangeError);
  for (const key of ['volume', 'capacity']) assert.throws(() => M.correctSump({ ...base, [key]: 0 }), RangeError);
  for (const key of ['currentPercent', 'targetPercent']) assert.throws(() => M.correctSump({ ...base, [key]: 100 }), RangeError);
  assert.throws(() => M.correctSump({ ...base, targetPercent: 0 }), /No finite/);
  for (const args of [[0, 1], [-1, 1], [20, -1], [Infinity, 1]]) assert.throws(() => M.ratioToPercent(...args), RangeError);
  for (const p of [-1, 100, Infinity, NaN]) assert.throws(() => M.percentToRatio(p), RangeError);
  for (const args of [[6, 0], [-1, 1], [50, 2], [NaN, 1]]) assert.throws(() => M.brixToPercent(...args), RangeError);
  const s = { volume: 100, currentPercent: 5, lossVolume: 20, mixPercent: 5 };
  for (const patch of [{ lossVolume: 100 }, { lossVolume: -1 }, { mixPercent: 100 }, { lossKind: 'unknown' }, { lossKind: 'evaporation', lossVolume: 96 }])
    assert.throws(() => M.topUp({ ...s, ...patch }), RangeError);
  assert.throws(() => M.correctSump(null), RangeError); assert.throws(() => M.topUp(null), RangeError);
  assert.throws(() => M.convertVolume(1, 'L', 'gallon'), RangeError);
});
test('drawing encodes independently variable fill height and tint', () => {
  const a = D.sump(50, 5, 100, 'L'), b = D.sump(100, 5, 100, 'L'), c = D.sump(50, 10, 100, 'L');
  assert.match(a, /class="cm-liquid"[^>]*height="60"/); assert.match(b, /class="cm-liquid"[^>]*height="120"/);
  const tint = s => s.match(/fill-opacity="([^"]+)"/)[1]; assert.equal(tint(a), tint(b)); assert.notEqual(tint(a), tint(c));
  assert.match(D.sump(101, 5, 100, 'L'), /Exceeds capacity/);
});

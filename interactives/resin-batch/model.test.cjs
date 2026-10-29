'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { batch, convertMass } = require('./model.js');
const defaults = { ratioA: 10, ratioB: 1, basis: 'mass', mode: 'total', amountG: 220, densityA: 1.2, densityB: 0.8, tareG: 35 };
const state = extra => ({ ...defaults, ...extra });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 2e-12 * Math.max(1, Math.abs(expected)), `${actual} ≈ ${expected}`);

test('10:1 means 200+20 for a 220g total, versus 220+22 for given A', () => {
  const total = batch(state()), given = batch(state({ mode: 'given-a' }));
  close(total.massAG, 200); close(total.massBG, 20); close(total.totalG, 220);
  close(given.massAG, 220); close(given.massBG, 22); close(given.totalG, 242);
});
test('mass 2:1 control keeps individual unrounded volumes and converts the ratio', () => {
  const r = batch(state({ ratioA: 2, amountG: 300 }));
  close(r.massAG, 200); close(r.massBG, 100); close(r.volumeAMl, 500 / 3); close(r.volumeBMl, 125);
  close(r.massRatioAtoB, 2); close(r.volumeRatioAtoB, 4 / 3);
  assert.equal(Object.hasOwn(r, 'mixedVolume'), false);
});
test('volume 2:1 at unequal densities gives 225g A and 75g B, not 200g/100g', () => {
  const r = batch(state({ ratioA: 2, basis: 'volume', amountG: 300 }));
  close(r.massAG, 225); close(r.massBG, 75); close(r.volumeAMl, 187.5); close(r.volumeBMl, 93.75);
  close(r.volumeRatioAtoB, 2); close(r.massRatioAtoB, 3);
});
test('basis conversion can describe the same physical batch when ratio parts also convert', () => {
  const mass = batch(state({ ratioA: 2, amountG: 300 }));
  const volume = batch(state({ ratioA: 4, ratioB: 3, basis: 'volume', amountG: 300 }));
  for (const key of Object.keys(mass)) close(volume[key], mass[key]);
});
test('unrounded dense balance/inverse and density controls in both bases and modes', () => {
  for (const basis of ['mass', 'volume']) for (const ratioA of [0.1, 1, 7, 10]) for (const ratioB of [0.3, 1, 4]) {
    for (const densityA of [0.75, 1.2, 2.1]) for (const densityB of [0.8, 1.3]) {
      const s = state({ basis, ratioA, ratioB, densityA, densityB, amountG: 237.89123 });
      const r = batch(s), inverse = batch({ ...s, mode: 'given-a', amountG: r.massAG });
      close(r.massAG + r.massBG, s.amountG); close(r.volumeAMl * densityA, r.massAG); close(r.volumeBMl * densityB, r.massBG);
      close(basis === 'mass' ? r.massAG / r.massBG : r.volumeAMl / r.volumeBMl, ratioA / ratioB);
      for (const key of Object.keys(r)) close(inverse[key], r[key]);
    }
  }
});
test('equal density control gives identical batches for equal numeric ratio in either basis', () => {
  const a = batch(state({ densityA: 1.15, densityB: 1.15 }));
  const b = batch(state({ densityA: 1.15, densityB: 1.15, basis: 'volume' }));
  for (const key of Object.keys(a)) close(a[key], b[key]);
});
test('tare moves gross readings only; cumulative after B is total material, not B alone', () => {
  const r = batch(state()), zero = batch(state({ tareG: 0 }));
  close(r.emptyGrossG, 35); close(r.afterAGrossG, 235); close(r.finalGrossG, 255);
  close(r.afterATaredG, 200); close(r.finalTaredG, 220);
  for (const key of ['massAG', 'massBG', 'totalG', 'volumeAMl', 'volumeBMl']) close(r[key], zero[key]);
});
test('unit conversion preserves the physical batch and rejects unsupported or overflowing units', () => {
  close(convertMass(220, 'g', 'kg'), 0.22); close(convertMass(0.22, 'kg', 'g'), 220);
  const r = batch(state({ amountG: convertMass(0.22, 'kg', 'g'), tareG: convertMass(0.035, 'kg', 'g') }));
  close(r.finalGrossG, 255); close(convertMass(0, 'g', 'kg'), 0);
  assert.throws(() => convertMass(1, 'oz', 'g'), RangeError);
  assert.throws(() => convertMass(Number.MAX_VALUE, 'kg', 'g'), RangeError);
});
test('invalid and extreme inputs reject rather than leak NaN, Infinity, zero components or stale output', () => {
  for (const key of ['ratioA', 'ratioB', 'densityA', 'densityB', 'amountG']) {
    for (const value of [0, -1, NaN, Infinity, -Infinity, '', null, undefined]) assert.throws(() => batch(state({ [key]: value })), RangeError, `${key}: ${value}`);
  }
  for (const tareG of [-1, NaN, Infinity, '', null]) assert.throws(() => batch(state({ tareG })), RangeError);
  for (const extra of [{ basis: 'weight' }, { mode: 'a' }, { ratioA: Number.MIN_VALUE, ratioB: Number.MAX_VALUE }, { basis: 'volume', ratioA: Number.MAX_VALUE, densityA: 2 }, { mode: 'given-a', amountG: Number.MAX_VALUE }]) assert.throws(() => batch(state(extra)), RangeError);
});

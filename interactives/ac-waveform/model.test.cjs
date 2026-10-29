'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const drawing = require('./render.js');
const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('zero-mean and offset sine statistics stay distinct', () => {
  const centered = model.analyze({ offset: 0, amplitude: 2, frequency: 50, resistance: 100 });
  near(centered.mean, 0); near(centered.acRms, Math.SQRT2); near(centered.totalRms, Math.SQRT2);
  near(centered.minimum, -2); near(centered.maximum, 2); near(centered.peakToPeak, 4);
  near(centered.period, .02); near(centered.averagePower, .02); assert.equal(centered.crossesZero, true);
  const shifted = model.analyze({ offset: 1, amplitude: 2, frequency: 50, resistance: 100 });
  near(shifted.mean, 1); near(shifted.acRms, Math.SQRT2); near(shifted.totalRms, Math.sqrt(3));
  near(shifted.averagePower, .03); near(shifted.minimum, -1); near(shifted.maximum, 3);
});

test('one-polarity and pure DC boundaries are explicit', () => {
  const positive = model.analyze({ offset: 3, amplitude: 2, frequency: 60, resistance: 100 });
  assert.equal(positive.crossesZero, false); assert.equal(positive.touchesZero, false); near(positive.minimum, 1);
  const tangent = model.analyze({ offset: -2, amplitude: 2, frequency: 60, resistance: 100 });
  assert.equal(tangent.crossesZero, false); assert.equal(tangent.touchesZero, true);
  const dc = model.analyze({ offset: -2, amplitude: 0, frequency: 0, resistance: 100 });
  near(dc.mean, -2); near(dc.totalRms, 2); near(dc.averagePower, .04); assert.equal(dc.period, null);
  for (const phase of [0, .125, .5, .999999]) near(model.instantaneous({ offset: -2, amplitude: 0, frequency: 1, resistance: 100 }, phase), -2);
});

test('instantaneous values and renderer use the same canonical model', () => {
  const input = { offset: 1, amplitude: 2, frequency: 25, resistance: 100 };
  near(model.instantaneous(input, 0), 1); near(model.instantaneous(input, .25), 3);
  near(model.instantaneous(input, .5), 1); near(model.instantaneous(input, .75), -1);
  const points = model.samples(input, 9); assert.equal(points.length, 9); near(points[0].value, points.at(-1).value);
  const svg = drawing.diagram(input); assert.match(svg, /mean 1\.00 V/); assert.match(svg, /max 3\.00 V/); assert.match(svg, /min -1\.00 V/);
  assert.match(svg, /data-cycle-count="1"/); assert.match(svg, /One complete cycle/); assert.match(svg, /phase 1 · one cycle/);
  assert.equal(points[0].phase, 0); assert.equal(points.at(-1).phase, 1);
  const dcSvg = drawing.diagram({ offset: 2, amplitude: 0, frequency: 0, resistance: 100 });
  assert.match(dcSvg, /data-cycle-count="0"/); assert.match(dcSvg, /no oscillation period/); assert.match(dcSvg, /constant 2\.00 V/);
  assert.doesNotMatch(dcSvg, />max /); assert.doesNotMatch(dcSvg, />min /); assert.doesNotMatch(dcSvg, /one cycle/);
});

test('invalid domains and drawing bounds are rejected', () => {
  const base = { offset: 0, amplitude: 2, frequency: 50, resistance: 100 };
  for (const offset of [-11, 11, NaN, Infinity]) assert.throws(() => model.analyze({ ...base, offset }), RangeError);
  for (const amplitude of [-1, 11, NaN]) assert.throws(() => model.analyze({ ...base, amplitude }), RangeError);
  for (const frequency of [0, .099, 1001, Number.MIN_VALUE, NaN]) assert.throws(() => model.analyze({ ...base, frequency }), RangeError);
  for (const resistance of [0, .099, 10001, Number.MIN_VALUE, NaN]) assert.throws(() => model.analyze({ ...base, resistance }), RangeError);
  assert.doesNotThrow(() => model.analyze({ ...base, amplitude: 0, frequency: 0 }));
  for (const phase of [-1, 1, NaN]) assert.throws(() => model.instantaneous(base, phase), RangeError);
  for (const count of [1, 2002, 2.5]) assert.throws(() => model.samples(base, count), RangeError);
});

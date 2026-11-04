'use strict';
// Model checks for the edge-finder lesson: geometry, signs, units and invalid input.
// Run: node --test interactives/edge-finder-zero/model.test.cjs
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('./model.js');
const SIDES = ['left', 'right', 'front', 'back'];

// Walk from the start to the exact trigger with coarse, medium and fine steps,
// the way a careful learner would: never step past the trigger.
function approachExactly(st) {
  for (const step of M.STEPS) {
    while (M.contact(st).gap >= step) st = M.jog(st, 1, step);
  }
  return st;
}

test('independent sign case: edges at 10 and 40 mm with r = 0.10 mm', () => {
  // Left/front (bottom in the top view) edge at 10.000, right/back (top) at 40.000.
  for (const [side, edge, reading, correction] of [['left', 10000, 9900, 100], ['front', 10000, 9900, 100], ['right', 40000, 40100, -100], ['back', 40000, 40100, -100]]) {
    assert.equal(M.triggerReading(side, edge, 100), reading, side + ' trigger reading');
    assert.equal(M.edgeFromReading(side, reading, 100), edge, side + ' edge recovered');
    assert.equal(M.edgeFromReading(side, reading, 100) - reading, correction, side + ' correction sign');
    assert.equal(Math.abs(reading - edge), 100, side + ' omission error is r');
    assert.equal(Math.abs((reading - correction) - edge), 200, side + ' wrong-sign error is 2r');
  }
});

test('page worked example: 10 mm contact from the left puts the spindle centre at X = −5 mm', () => {
  assert.equal(M.correctSetting('left', 5000), -5000);
  assert.equal(M.correctSetting('right', 5000), 5000);
  assert.equal(M.correctSetting('front', 5000), -5000);
  assert.equal(M.correctSetting('back', 5000), 5000);
});

test('all four sides and every listed contact: correct, forgotten and wrong-sign holes', () => {
  for (const side of SIDES) for (const tipId of Object.keys(M.TIPS)) {
    const r = M.TIPS[tipId].diameter / 2, n = M.SIDES[side].n, axis = M.SIDES[side].axis;
    let st = approachExactly(M.create(side, tipId));
    const c = M.contact(st);
    assert.equal(c.phase, 'kick', `${side}/${tipId} reaches the kick`);
    assert.equal(c.overshoot, 0, `${side}/${tipId} careful approach stops at the trigger`);
    assert.equal(M.distance(st), r, 'spindle centre is exactly r outside the edge');
    const reading = M.readings(st)[axis];
    assert.equal(M.edgeFromReading(side, reading, r), M.edge(side), `${side}/${tipId} edge = reading ∓ r recovers the true edge`);
    // Spindle must be on the approach side of the edge.
    assert.equal(Math.sign(reading - M.edge(side)), n, 'spindle is outside the part on the approach side');

    st = M.drill(M.setReadout(st, M.correctSetting(side, r)));
    const yours = st.holes[0];
    assert.equal(yours.error, 0); assert.equal(yours.fromEdge, M.HOLE_INSET); assert.equal(M.classify(yours, r), 'exact');
    // After setting, the true edge reads exactly zero.
    assert.equal(M.edge(side) + st.frame[axis], 0, 'the datum edge now reads 0');

    const forgot = M.whatIf(st, 'forgot'), sign = M.whatIf(st, 'sign');
    assert.equal(Math.abs(forgot.error), r, 'forgotten radius shifts the hole by r');
    assert.equal(Math.abs(sign.error), 2 * r, 'wrong sign shifts the hole by 2r');
    assert.equal(forgot.inwardError, -r, 'forgotten radius moves the hole toward the datum edge');
    assert.equal(sign.inwardError, -2 * r, 'the wrong sign moves it further toward the edge');
    assert.equal(Math.sign(forgot.error), n, 'signed axis error points to the approach side');
    assert.equal(M.classify(forgot, r), 'radius'); assert.equal(M.classify(sign, r), 'double');
    assert.deepEqual(M.whatIf(st, 'correct').error, 0);
    // Where zero lands: correct on the edge, forgotten radius one r OUTSIDE,
    // wrong sign two r OUTSIDE (the spindle was already r outside; the sign adds r more).
    assert.equal(yours.zeroOutside, 0, side + ' correct zero is on the edge');
    assert.equal(forgot.zeroOutside, r, side + ' forgotten radius: zero r outside the edge');
    assert.equal(sign.zeroOutside, 2 * r, side + ' wrong sign: zero 2r outside the edge, never inside');
    for (const h of [yours, forgot, sign]) assert.equal(h.zeroOutside + h.inwardError, 0, 'hole shift mirrors the zero shift');
  }
});

test('stepping past the trigger records the overshoot and it appears in the hole', () => {
  let st = M.create('left', 'd10');
  st = M.atGap(st, 630);                    // 0.630 mm before the trigger
  st = M.jog(st, 1, 1000);                  // a coarse 1 mm step crosses it
  const c = M.contact(st);
  assert.equal(c.phase, 'kick'); assert.equal(c.overshoot, 370);
  st = M.drill(M.setReadout(st, -5000));
  assert.equal(st.holes[0].inwardError, 370, 'hole lands 0.370 mm too far from the edge');
  assert.equal(st.holes[0].zeroOutside, -370, 'overshoot puts zero 0.370 mm inside the part');
  assert.ok(st.holes[0].setting === -5000 && st.holes[0].overshoot === 370);
});

test('contact phases: free wobble, centring inside 0.5 mm, kick at d = r', () => {
  const st = M.create('back', 'd6');
  assert.equal(M.contact(st).phase, 'free');
  assert.equal(M.contact(M.atGap(st, 500)).phase, 'free');
  assert.equal(M.contact(M.atGap(st, 499)).phase, 'centring');
  assert.equal(M.contact(M.atGap(st, 499)).eccentricity, 499);
  assert.equal(M.contact(M.atGap(st, 1)).phase, 'centring');
  assert.equal(M.contact(M.atGap(st, 0)).phase, 'kick');
  // The drawn tip never penetrates the part face in any phase.
  for (const gap of [3000, 500, 300, 10, 0, -400]) {
    const c = M.contact(M.atGap(st, gap));
    for (let k = 0; k < 64; k++) assert.ok(M.tipOffset(c, k * Math.PI / 32).u + 3000 <= c.d + 1e-9, `gap ${gap}: tip stays outside the face`);
  }
});

test('jog rules and limits', () => {
  let st = M.create('right', 'd10');
  const startReading = M.readings(st).x;
  st = M.jog(st, 1, 1000);
  assert.equal(M.readings(st).x, startReading - 1000, 'toward the right edge moves −X');
  st = M.jog(st, -1, 100);
  assert.equal(M.readings(st).x, startReading - 900, 'away moves +X');
  assert.equal(M.readings(M.jog(M.create('front', 'd10'), 1, 10)).y, M.readings(M.create('front', 'd10')).y + 10, 'toward the front edge moves +Y');
  assert.throws(() => M.jog(st, 1, 500), /1, 0.1 or 0.01 mm/);
  assert.throws(() => M.jog(st, 0, 1000), /toward/);
  const kicked = M.atGap(st, 0);
  assert.throws(() => M.jog(kicked, 1, 10), /already kicked/);
  assert.equal(M.contact(M.jog(kicked, -1, 10)).phase, 'centring', 'backing off 0.01 mm recentres');
  let far = M.create('left', 'd10');
  for (let i = 0; i < 10; i++) far = M.jog(far, -1, 1000);
  assert.throws(() => M.jog(far, -1, 10), /far enough/);
});

test('readout setting: only at the kick, finite, ≤ 3 decimals, ±50 mm', () => {
  const st = M.create('left', 'd10');
  assert.throws(() => M.setReadout(st, -5000), /only at the kick/);
  const k = M.atGap(st, 0);
  assert.throws(() => M.drill(k), /Set the readout/);
  assert.equal(M.parseMillimetres('-5'), -5000);
  assert.equal(M.parseMillimetres(' −2.54 '), -2540);
  assert.equal(M.parseMillimetres('+.5'), 500);
  assert.equal(M.parseMillimetres('-0'), 0);
  for (const bad of ['', 'abc', '5 mm', '1e3', 'NaN', 'Infinity', '--5', '2.5401', '50.001']) assert.throws(() => M.parseMillimetres(bad), RangeError, JSON.stringify(bad));
  assert.throws(() => M.setReadout(k, 2.5), /whole number/);
  assert.throws(() => M.setReadout(k, 60000), /−50.000/);
  assert.throws(() => M.create('top', 'd10'), /left, right, front or back/);
  assert.throws(() => M.create('left', 'd8'), /listed contact/);
  assert.throws(() => M.edgeFromReading('left', 1000, 0), /Tip radius/);
  assert.throws(() => M.validate(Object.assign({}, k, { r: 3000 })), /match/);
  assert.throws(() => M.validate(Object.assign({}, k, { pos: { x: k.pos.x, y: k.pos.y + 1 } })), /one axis/);
});

test('state stays immutable and what-if holes do not change it', () => {
  const k = M.setReadout(M.atGap(M.create('front', 'd5080'), 0), -2540);
  const before = JSON.stringify(k);
  M.whatIf(k, 'forgot'); M.whatIf(k, 'sign'); M.drill(k);
  assert.equal(JSON.stringify(k), before);
  assert.ok(Object.isFrozen(k) && Object.isFrozen(k.pos));
});

test('tool length stage: touch-off readings, length values and the missing-value error', () => {
  // Reading at touch-off = surface Z + gauge + (L_tool − L_ref).
  assert.equal(M.touchReading('t1', 0), 0);
  assert.equal(M.touchReading('t2', 0), 27500);
  assert.equal(M.touchReading('t1', 10000), 10000);
  assert.equal(M.touchReading('t2', 10000), 37500);
  assert.equal(M.touchReading('t2', 10000, -3000), 34500, 'a lower surface lowers every reading equally');
  assert.equal(M.lengthValue('t1'), 0); assert.equal(M.lengthValue('t2'), 27500);
  // The gauge cancels when the length value is taken: value = reading − g.
  for (const g of [0, 10000]) assert.equal(M.touchReading('t2', g) - g, M.lengthValue('t2'));
  // With the value applied, the tip sits on the gauge top at touch-off.
  assert.equal(M.tipZ(M.touchReading('t2', 10000), M.lengthValue('t2')), 10000);
  // Commanded Z +2.000 with T2 but T1's value (0): T2's tip is 27.500 mm lower than intended.
  assert.equal(M.tipZ(2000, 0) - M.lengthValue('t2'), -25500);
  assert.throws(() => M.touchReading('t3', 0), /T1 or T2/);
  assert.throws(() => M.touchReading('t1', 50), /Gauge/);
  assert.throws(() => M.touchReading('t1', 0.5), /whole number/);
});

test('formatting', () => {
  assert.equal(M.mm(-5000), '-5.000'); assert.equal(M.signedMm(-5000), '−5.000'); assert.equal(M.signedMm(2540), '+2.540'); assert.equal(M.signedMm(0), '0.000');
});

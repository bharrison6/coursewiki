'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const M = require('../../interactives/gear-ratios/model.js');
const D = require('../../interactives/gear-ratios/render.js');
const U = require('../../interactives/gear-ratios/demo.js');
const setup = change => ({ ...M.DEFAULT, ...change });
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} should be ${b}`);

test('independent speed, direction, torque and power oracles for three trains', () => {
  const pair = M.solve(setup({ a: 20, b: 60 }));
  near(pair.output.rpm, -40); near(pair.ratio, 3); near(pair.outputTorque, 6);
  const idler = M.solve(setup({ mode: 'idler', a: 20, idler: 35, b: 60 }));
  near(idler.gears[1].rpm, -480 / 7); near(idler.output.rpm, 40); near(idler.outputTorque, 6);
  const compound = M.solve(setup({ mode: 'compound', a: 20, b: 60, c: 25, d: 50 }));
  near(compound.gears[1].rpm, -40); near(compound.gears[2].rpm, -40);
  near(compound.output.rpm, 20); near(compound.ratio, 6); near(compound.outputTorque, 12);
  for (const result of [pair, idler, compound]) {
    near(result.inputPower, 25.132741228718345); near(result.outputPower, result.inputPower);
  }
});
test('idler size changes only its own speed and geometry, not final motion or torque', () => {
  for (const idler of [20, 21, 35, 45, 60]) {
    const r = M.solve(setup({ mode: 'idler', a: 20, idler, b: 60 }));
    near(r.output.rpm, 40); near(r.ratio, 3); near(r.outputTorque, 6);
    near(r.gears[1].rpm, -2400 / idler);
  }
});
test('gear speed invariants and lossless power hold for odd/even counts and both directions', () => {
  for (const mode of M.MODES) for (const a of [20, 21, 37, 60]) for (const b of [20, 29, 40, 59]) for (const direction of [-1, 1]) {
    const r = M.solve(setup({ mode, a, b, c: 23, d: 57, idler: 35, direction, rpm: 190, torque: 7.5 }));
    const gear = id => r.gears.find(g => g.id === id);
    for (const [left, right] of r.meshes) near(gear(left).rpm * gear(left).teeth, -gear(right).rpm * gear(right).teeth, 1e-8);
    for (const [left, right] of r.shafts) {
      near(gear(left).rpm, gear(right).rpm); near(gear(left).phase, gear(right).phase);
      assert.notEqual(gear(left).rpm * gear(left).teeth, gear(right).rpm * gear(right).teeth);
    }
    near(r.outputPower, r.inputPower); near(r.speedFactor * r.torqueFactor, 1);
    near(r.stages.reduce((p, v) => p * v, 1), r.ratio);
  }
});
test('speed increase, unity ratio, reversed input and stationary loaded gears are coherent', () => {
  const fast = M.solve(setup({ a: 60, b: 20 })); near(fast.output.rpm, -360); near(fast.ratio, 1 / 3); near(fast.outputTorque, 2 / 3);
  const equal = M.solve(setup({ a: 31, b: 31 })); near(equal.ratio, 1); near(equal.output.rpm, -120);
  near(M.solve(setup({ direction: -1 })).output.rpm, 60);
  for (const mode of M.MODES) {
    const zero = M.solve(setup({ mode, rpm: 0 }));
    near(zero.output.rpm, 0); near(zero.inputPower, 0); near(zero.outputPower, 0);
    assert.ok(Number.isFinite(zero.ratio) && zero.outputTorque > 0);
    const unloaded = M.solve(setup({ mode, torque: 0 })); near(unloaded.outputTorque, 0); near(unloaded.outputPower, 0);
  }
});
test('invalid configurations fail at the model boundary', () => {
  for (const key of ['a', 'b', 'c', 'd', 'idler']) for (const value of [0, 19, 61, 21.5, NaN, Infinity])
    assert.throws(() => M.solve(setup({ [key]: value })), RangeError);
  for (const rpm of [-1, 241, NaN, Infinity]) assert.throws(() => M.solve(setup({ rpm })), RangeError);
  for (const torque of [-1, 11, NaN, Infinity]) assert.throws(() => M.solve(setup({ torque })), RangeError);
  assert.throws(() => M.solve(setup({ mode: 'planetary' })), RangeError);
  assert.throws(() => M.solve(setup({ direction: 0 })), RangeError);
});
test('displayed time scale slows every shaft equally and caps the fastest at 12 rpm', () => {
  for (const mode of M.MODES) for (const rpm of [0, 10, 120, 240]) {
    const r = M.solve(setup({ mode, a: 60, b: 20, c: 60, d: 20, rpm })), scale = M.animationScale(r);
    assert.ok(scale > 0 && scale <= 1);
    assert.ok(Math.max(...r.gears.map(g => Math.abs(g.rpm * scale))) <= 12.000000001);
    near(M.advance(r, .25, 3), .25 + r.gears[0].rpm / 60 * scale * 3);
  }
  assert.throws(() => M.advance(M.solve(M.DEFAULT), 0, -1), RangeError);
});
test('mesh phase puts tooth opposite space throughout signed multi-turn motion', () => {
  const fractional = x => ((x % 1) + 1) % 1;
  for (const mode of M.MODES) for (const a of [20, 21, 60]) for (const b of [20, 37, 60]) {
    const r = M.solve(setup({ mode, a, b, idler: 35, c: 23, d: 51 }));
    for (const turns of [-4.15, -1, 0, .017, .25, .9, 4.2]) {
      const rotations = M.rotations(r, turns);
      for (const [first, second] of r.meshes) {
        const ga = r.gears.find(g => g.id === first), gb = r.gears.find(g => g.id === second);
        const ra = rotations.find(g => g.id === first), rb = rotations.find(g => g.id === second);
        near(fractional((-ga.teeth * ra.angle + gb.teeth * (Math.PI - rb.angle)) / M.TAU), .5, 1e-8);
      }
    }
  }
});
test('drawn involute teeth match standard pitch, base, tip and root dimensions', () => {
  const g = D.geometry(40); near(g.pitch, 20); near(g.base, 18.79385241571817); near(g.tip, 21); near(g.root, 18.75);
  for (const teeth of [20, 21, 37, 60]) {
    const geo = D.geometry(teeth), pts = D.outline(teeth), radii = pts.map(p => Math.hypot(...p));
    near(Math.min(...radii), geo.root); near(Math.max(...radii), geo.tip);
    near(D.halfThickness(geo, geo.pitch) * geo.pitch, Math.PI / 4 - .015);
    // Each tooth has four tip vertices after the first; their count catches missing teeth.
    assert.equal(radii.filter(r => Math.abs(r - geo.tip) < 1e-8).length, teeth * 5);
  }
});
function inside(p, polygon) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
function rotate(points, angle, x) { return points.map(([px, py]) => [x + px * Math.cos(angle) - py * Math.sin(angle), px * Math.sin(angle) + py * Math.cos(angle)]); }
test('sampled tooth outlines do not penetrate their mate through a tooth cycle, including odd counts', () => {
  // Positive and negative controls establish the collision instrument itself.
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  assert.equal(inside([1, 1], square), true); assert.equal(inside([3, 1], square), false);
  for (const [a, b] of [[20, 20], [20, 60], [21, 37], [59, 23], [60, 60]]) {
    const r = M.solve(setup({ a, b })), distance = (a + b) / 2;
    for (let sample = 0; sample < 24; sample++) {
      const rotations = M.rotations(r, sample / (24 * a));
      const pa = rotate(D.outline(a), rotations[0].angle, 0), pb = rotate(D.outline(b), rotations[1].angle, distance);
      for (const p of pa.filter(p => p[0] > distance - b / 2 - 1)) assert.equal(inside(p, pb), false, `A enters B: ${a}/${b} at ${sample}`);
      for (const p of pb.filter(p => p[0] < a / 2 + 1)) assert.equal(inside(p, pa), false, `B enters A: ${a}/${b} at ${sample}`);
    }
  }
});
test('every drawn mesh has tangent pitch circles and compound planes share aligned shafts', () => {
  for (const mode of M.MODES) for (const a of [20, 39, 60]) for (const b of [20, 51, 60]) {
    const s = setup({ mode, a, b, c: 31, d: 59, idler: 21 }), l = D.layout(s);
    for (const [first, second] of l.solved.meshes) {
      const g1 = l.solved.gears.find(g => g.id === first), g2 = l.solved.gears.find(g => g.id === second);
      const p1 = l.positions[first], p2 = l.positions[second];
      near(Math.hypot(p1.x - p2.x, p1.y - p2.y), (g1.teeth + g2.teeth) / 2 * l.scale);
    }
    if (mode === 'compound') near(l.positions.B.x, l.positions.C.x);
    for (const gear of l.solved.gears) {
      const pos = l.positions[gear.id], radius = D.geometry(gear.teeth).tip * l.scale;
      assert.ok(pos.x - radius > 0 && pos.x + radius < l.width);
      assert.ok(pos.y - radius > 0 && pos.y + radius < l.height);
    }
    const svg = D.train(s, .375);
    for (const gear of l.solved.gears) {
      assert.ok(svg.includes(`data-gear="${gear.id}" data-ratio="${gear.ratio}" data-phase="${gear.phase}" transform="${D.transform(gear, .375)}"`));
      assert.ok(svg.includes(`data-teeth="${gear.teeth}"`));
    }
  }
});
test('prediction comparisons teach different mechanisms with model-derived outcomes', () => {
  const bigger = U.trial('bigger'); near(M.solve(bigger.after).output.rpm / M.solve(bigger.before).output.rpm, .5);
  const idler = U.trial('idler'); near(M.solve(idler.after).output.rpm / M.solve(idler.before).output.rpm, -1);
  const compound = U.trial('compound'); near(M.solve(compound.after).ratio, 4);
  assert.throws(() => U.trial('unknown'), RangeError);
});
test('committed no-JS and print figures are exactly generated by the shared model/renderer', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../collections/engineering/pages/gear-ratios.html'), 'utf8');
  const source = html.split('<!-- GEAR-RATIOS-STATIC -->')[1].split('<!-- /GEAR-RATIOS-STATIC -->')[0].trim();
  assert.equal(source, D.staticLesson());
  assert.equal((source.match(/<svg/g) || []).length, 3);
  assert.ok(source.includes('60 rpm CCW') && source.includes('60 rpm CW') && source.includes('30 rpm CW'));
});

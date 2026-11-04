'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('./model.js');
const KINDS = Object.keys(M.BOARDS);
const NX = M.NX, NY = M.NY;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function last(steps) { return steps[steps.length - 1].metrics; }

test('rough boards carry the declared warp shape and nothing else', () => {
  const c = M.measure(M.create('cup')), b = M.measure(M.create('bow')), t = M.measure(M.create('twist')), k = M.measure(M.create('crook'));
  assert.ok(Math.abs(c.faceA.cup - 6) < 0.3 && c.faceA.bow < 0.1 && c.faceA.twist < 0.1, 'cup is across the width');
  assert.ok(Math.abs(b.faceA.bow - 14) < 0.5 && b.faceA.cup < 0.1 && b.faceA.twist < 0.1, 'bow is along the length, out of the face');
  assert.ok(Math.abs(t.faceA.twist - 12) < 0.3 && t.faceA.cup < 0.1 && t.faceA.bow < 0.1, 'twist lifts one corner 12 mm');
  assert.ok(Math.abs(k.nearEdge.crook - 16) < 0.6 && k.faceA.flatness < 1e-9 && k.faceB.flatness < 1e-9, 'crook is in the plane of the face');
  for (const kind of KINDS) {
    const m = M.measure(M.create(kind));
    assert.ok(m.thickness.min > 35.9 && m.width.min > 148 && m.length.min > 630, kind + ' blank is oversize');
    assert.equal(M.finished(m), false);
  }
});

test('reference order face, edge, thickness, width, length finishes every board true and to size', () => {
  for (const kind of KINDS) {
    for (const planer of ['flexible', 'rigid']) {
      const m = last(M.run(kind, M.REFERENCE_ORDER, { planer }));
      assert.equal(M.finished(m), true, kind + ' ' + planer);
      for (const v of [m.faceA.flatness, m.faceB.flatness, m.nearEdge.straightness, m.farEdge.straightness, m.thickness.max - m.thickness.min, m.width.max - m.width.min, m.length.max - m.length.min]) assert.ok(v < 1e-6, kind + ' error ' + v);
      for (const a of [m.nearEdge.square, m.farEdge.square, m.ends.square]) assert.ok(a < 1e-5, kind + ' angle ' + a);
      assert.ok(Math.abs(m.thickness.min - 19) < 1e-6 && Math.abs(m.width.min - 110) < 1e-6 && Math.abs(m.length.min - 520) < 1e-6);
    }
  }
});

test('flexible planer first copies the released warp; it does not flatten', () => {
  for (const kind of ['cup', 'bow', 'twist']) {
    const steps = M.run(kind, ['plane'], { planer: 'flexible' }), r = steps[0].metrics, p = steps[1].metrics;
    assert.ok(Math.abs(p.faceA.flatness - r.faceA.flatness) < 1e-9, kind + ': face A untouched');
    assert.ok(Math.abs(p.faceB.flatness - p.faceA.flatness) < 0.25, kind + ': face B copies face A');
    assert.ok(p.faceB.flatness > 5, kind + ': warp remains after release');
    assert.ok(p.thickness.max - p.thickness.min <= M.TOL.mm, kind + ': thickness is even');
    const full = last(M.run(kind, M.PLANER_FIRST, { planer: 'flexible' }));
    assert.equal(M.finished(full), false);
    assert.ok(full.thickness.min < M.TARGET.thickness - 1, kind + ': flattening afterwards leaves it too thin');
  }
  // Boundary: a crook-only board has flat faces, so planing first costs nothing.
  assert.equal(M.finished(last(M.run('crook', M.PLANER_FIRST))), true);
});

test('rigid planer (stiff board or sled) cuts a flat top without flattening face A', () => {
  const steps = M.run('cup', ['plane'], { planer: 'rigid' }), p = steps[1].metrics;
  assert.ok(p.faceB.flatness < 1e-6, 'top is flat');
  assert.ok(Math.abs(p.faceA.flatness - steps[0].metrics.faceA.flatness) < 1e-9, 'face A unchanged');
  assert.ok(p.thickness.max - p.thickness.min > 5, 'thickness now varies by the cup');
});

test('jointer passes remove monotonically, only from face A, along each column', () => {
  for (const kind of KINDS) {
    const b0 = M.create(kind), r = M.apply(b0, 'joint-face');
    let prevT = new Array(NX * NY).fill(0), prevV = M.volume(b0);
    for (const st of r.stages) {
      const v = M.volume(st); assert.ok(v <= prevV + 1e-9, kind + ' volume'); prevV = v;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const a = M.node(b0, i, j, 0), top = M.node(b0, i, j, 1), now = M.node(st, i, j, 0);
        assert.deepEqual(M.node(st, i, j, 1), top, 'face B untouched');
        const d = top.map((x, n) => x - a[n]), e = now.map((x, n) => x - a[n]), len2 = d.reduce((s, x) => s + x * x, 0);
        const t = e.reduce((s, x, n) => s + x * d[n], 0) / len2, off = e.map((x, n) => x - t * d[n]);
        assert.ok(Math.hypot(...off) < 1e-9, 'node stays on its column');
        assert.ok(t >= -1e-12 && t <= 1 + 1e-12 && t >= prevT[j * NX + i] - 1e-12, 'moves inward, never back');
        prevT[j * NX + i] = t;
      }
    }
    assert.ok(r.info.passes >= 1);
  }
});

test('row cuts move nodes inward along their own material rows', () => {
  for (const [kind, op] of [['crook', 'joint-edge'], ['cup', 'rip'], ['bow', 'crosscut']]) {
    const b0 = M.create(kind), b1 = M.apply(b0, op).board, alongWidth = op !== 'crosscut';
    const lines = alongWidth ? NX * 2 : NY * 2, n = alongWidth ? NY : NX;
    for (let l = 0; l < lines; l++) {
      const id = t => alongWidth ? [l % NX, t, (l / NX) | 0] : [t, l % NY, (l / NY) | 0];
      const old = []; for (let t = 0; t < n; t++) old.push(M.node(b0, ...id(t)));
      let prev = -1;
      for (let t = 0; t < n; t++) {
        const p = M.node(b1, ...id(t)); let best = Infinity, at = 0;
        for (let s = 0; s < n - 1; s++) {
          const a = old[s], d = old[s + 1].map((x, k) => x - a[k]), e = p.map((x, k) => x - a[k]), L = d.reduce((u, x) => u + x * x, 0);
          const u = Math.max(0, Math.min(1, e.reduce((v, x, k) => v + x * d[k], 0) / L)), dist = Math.hypot(...e.map((x, k) => x - u * d[k]));
          if (dist < best) { best = dist; at = s + u; }
        }
        assert.ok(best < 1e-7, kind + ' ' + op + ' node on its old row: ' + best);
        assert.ok(at >= prev - 1e-9, 'row order preserved'); prev = at;
      }
    }
  }
});

test('volume never increases over random operation sequences', () => {
  const rand = rng(20261104);
  for (const kind of KINDS) for (let trial = 0; trial < 12; trial++) {
    let b = M.create(kind), v = M.volume(b);
    for (let s = 0; s < 7; s++) {
      const op = M.OPS[Math.floor(rand() * M.OPS.length)], r = M.apply(b, op, { planer: rand() < 0.5 ? 'flexible' : 'rigid' });
      for (const st of r.stages) { const vs = M.volume(st); assert.ok(vs <= v + 1e-9, kind + ' ' + op + ' ' + (vs - v)); v = vs; }
      b = r.board;
    }
  }
});

test('the planer press is display-only and volume preserving', () => {
  const r = M.apply(M.create('bow'), 'plane', { planer: 'flexible' });
  const [p0] = r.info.pressed, v0 = M.volume(M.create('bow')), vp = M.volume(p0);
  assert.ok(Math.abs(vp - v0) / v0 < 1e-5, 'shear press keeps volume within mesh discretisation');
  assert.ok(M.measure(p0).faceA.flatness < 0.05, 'pressed underside lies on the bed');
  assert.ok(M.measure(r.board).faceA.flatness > 13, 'released board keeps its bow');
});

test('reference matters: edge before face fails on twist, not on cup; rip before jointing follows the crook', () => {
  const tw = last(M.run('twist', ['joint-edge', 'joint-face']));
  assert.ok(tw.nearEdge.square > 1, 'twisted face against the fence leaves the edge out of square: ' + tw.nearEdge.square);
  const cup = last(M.run('cup', ['joint-edge', 'joint-face']));
  assert.ok(cup.nearEdge.square < M.TOL.deg, 'cup rests on both long edges against the fence');
  const k = M.run('crook', ['rip']), m = k[1].metrics;
  assert.ok(m.width.max - m.width.min > 10, 'width varies by the crook');
  assert.ok(Math.abs(m.nearEdge.straightness - k[0].metrics.nearEdge.straightness) < 1e-9, 'rip does not straighten edge A');
  assert.ok(m.farEdge.straightness < 1e-6, 'the sawn edge is straight');
});

test('predictions are scored from the measured result, and more than one can be true', () => {
  const pf = M.run('cup', ['plane']);
  assert.equal(M.score('plane', 'copies', pf[1].metrics, pf[1].info).correct, true);
  assert.equal(M.score('plane', 'true', pf[1].metrics, pf[1].info).correct, false);
  const ref = M.run('cup', ['joint-face', 'joint-edge', 'plane']);
  assert.equal(M.score('plane', 'true', ref[3].metrics, ref[3].info).correct, true);
  const both = M.run('bow', ['plane', 'joint-face']), s = M.score('joint-face', 'flat', both[2].metrics, both[2].info);
  assert.equal(s.correct, true); assert.deepEqual(s.trueIds.sort(), ['flat', 'short']);
  assert.throws(() => M.score('plane', 'maybe', pf[1].metrics, pf[1].info), RangeError);
  assert.throws(() => M.score('sand', 'true', pf[1].metrics), RangeError);
});

test('prediction scoring is geometric: unwarped faces are not graded as copied warp', () => {
  // Crook is edge (planform) warp: its faces are flat, so a flexible planer pass leaves both faces flat and parallel.
  const k = M.run('crook', ['plane'], { planer: 'flexible' }), km = k[1].metrics;
  assert.ok(km.faceA.flatness <= M.TOL.mm && km.faceB.flatness <= M.TOL.mm && km.thickness.max - km.thickness.min <= M.TOL.mm);
  assert.equal(M.score('plane', 'true', km, k[1].info).correct, true, 'flat and parallel is right for crook');
  assert.equal(M.score('plane', 'copies', km, k[1].info).correct, false, 'no face warp was copied');
  assert.equal(M.finished(km), false, 'face A is still unmachined and the crook remains');
  // The same pass on face-warped boards still copies the warp.
  for (const kind of ['cup', 'bow', 'twist']) {
    const s = M.run(kind, ['plane'], { planer: 'flexible' })[1];
    assert.equal(M.score('plane', 'copies', s.metrics, s.info).correct, true, kind);
    assert.equal(M.score('plane', 'true', s.metrics, s.info).correct, false, kind);
  }
  // Crook rip first: straight sawn edge, width varies, and the hollow middle is already under 110 mm.
  const r = M.run('crook', ['rip'])[1];
  assert.deepEqual(M.score('rip', 'copies', r.metrics, r.info).trueIds, ['copies', 'short']);
  assert.equal(M.score('rip', 'true', r.metrics, r.info).correct, false);
  const jf = M.run('crook', ['joint-face'])[1];
  assert.equal(M.score('joint-face', 'flat', jf.metrics, jf.info).correct, true);
});

test('measurement reads geometry only and is independent of position and history', () => {
  const b = M.run('twist', ['joint-face', 'joint-edge'])[2].board, m = M.measure(b);
  const moved = { kind: b.kind, nodes: new Float64Array(b.nodes.length), machined: b.machined, history: [] };
  const a = 0.09, c = 0.05, ca = Math.cos(a), sa = Math.sin(a), cc = Math.cos(c), scc = Math.sin(c);
  for (let n = 0; n < b.nodes.length; n += 3) {
    let x = b.nodes[n], y = b.nodes[n + 1], z = b.nodes[n + 2];
    [x, y] = [ca * x - sa * y, sa * x + ca * y]; [y, z] = [cc * y - scc * z, scc * y + cc * z];
    moved.nodes[n] = x + 40; moved.nodes[n + 1] = y - 25; moved.nodes[n + 2] = z + 7;
  }
  const r = M.measure(moved);
  for (const key of ['flatness', 'twist']) assert.ok(Math.abs(r.faceA[key] - m.faceA[key]) < 1e-4, key);
  assert.ok(Math.abs(r.nearEdge.square - m.nearEdge.square) < 1e-3 && Math.abs(r.nearEdge.straightness - m.nearEdge.straightness) < 1e-3);
  assert.ok(Math.abs(r.thickness.min - m.thickness.min) < 1e-3 && Math.abs(r.volume - m.volume) / m.volume < 1e-9);
});

test('repeating a finished operation removes nothing', () => {
  const b = M.run('bow', M.REFERENCE_ORDER).pop().board, v = M.volume(b);
  for (const op of M.OPS) { const r = M.apply(b, op); assert.ok(Math.abs(M.volume(r.board) - v) < 1e-6, op); assert.equal(M.finished(M.measure(r.board)), true, op); }
});

test('invalid inputs are rejected', () => {
  assert.throws(() => M.create('wane'), RangeError);
  const b = M.create('cup');
  assert.throws(() => M.apply(b, 'sand'), RangeError);
  assert.throws(() => M.apply(b, 'plane', { planer: 'magic' }), RangeError);
  assert.throws(() => M.apply({ nodes: [1, 2, 3] }, 'rip'), RangeError);
  const bad = { kind: 'cup', nodes: new Float64Array(b.nodes), machined: b.machined, history: [] }; bad.nodes[7] = NaN;
  assert.throws(() => M.measure(bad), RangeError);
  assert.ok(Object.isFrozen(b) && Object.isFrozen(M.TARGET) && Object.isFrozen(M.BOARDS.cup));
});

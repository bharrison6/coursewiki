'use strict';
// node --test interactives/dc-motor-commutation/model.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const M = require('./model.js');
const D = require('./render.js');

const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` expected ${b}, got ${a}`);
const POLARITIES = [[1, 1], [-1, 1], [1, -1], [-1, -1]];

// Independent physics: F = I L x B on each long side, tau_z = (r x F)_z, using
// only the model's coil geometry and side currents, not its torque formula.
function vectorTorque(alpha, opts) {
  const o = M.options(opts);
  const B = [o.field, 0, 0];
  let total = 0;
  for (let k = 0; k < o.coils; k += 1) {
    const a = (alpha + 90 * k) * Math.PI / 180;
    const sides = [{ p: [-Math.sin(a), Math.cos(a)], i: M.sideCurrent(alpha + 90 * k, o) }];
    sides.push({ p: [-sides[0].p[0], -sides[0].p[1]], i: -sides[0].i });
    for (const s of sides) {
      const L = [0, 0, s.i]; // current along +z (toward the commutator end) when positive
      const F = [L[1] * B[2] - L[2] * B[1], L[2] * B[0] - L[0] * B[2], L[0] * B[1] - L[1] * B[0]];
      // r = 1 (half-width), length 1/2 so that A = 2 r L = 1: torque per N B I A.
      total += 0.5 * (s.p[0] * F[1] - s.p[1] * F[0]);
    }
  }
  return total;
}

test('torque is zero in the neutral plane (theta = 0 and 180 degrees) for every setup', () => {
  for (const mode of M.MODES) for (const [supply, field] of POLARITIES) for (const th of [0, 180, 360, -180]) {
    assert.equal(M.torqueAtTheta(th, { mode, coils: 1, supply, field }), 0, `${mode} ${supply} ${field} ${th}`);
  }
});

test('one commutated coil: 0, 0.707, 1, 0.707, 0 at 0/45/90/135/180 degrees', () => {
  const want = [[0, 0], [45, Math.SQRT1_2], [90, 1], [135, Math.SQRT1_2], [180, 0], [225, Math.SQRT1_2], [270, 1]];
  for (const [th, v] of want) close(M.torqueAtTheta(th, {}), v, 1e-12, `theta ${th}`);
});

test('commutated torque never reverses; its sign is supply x field', () => {
  for (const coils of [1, 2]) for (const [supply, field] of POLARITIES) {
    const values = M.sweep({ coils, supply, field }, 7200);
    const s = supply * field;
    assert.ok(values.every(v => v * s >= 0), `coils ${coils}, supply ${supply}, field ${field}`);
  }
  assert.ok(M.sweep({}, 7200).every(v => v >= 0), 'default commutated torque is never negative');
});

test('slip rings: torque reverses each half turn and averages zero', () => {
  close(M.turnAverage({ mode: 'slip' }), 0, 1e-12);
  close(M.turnAverage({ mode: 'slip', coils: 2 }), 0, 1e-12);
  assert.ok(M.torqueAtTheta(90, { mode: 'slip' }) > 0 && M.torqueAtTheta(270, { mode: 'slip' }) < 0);
  const r = M.ripple({ mode: 'slip' });
  assert.equal(r.oneDirection, false);
  assert.equal(r.ratio, null);
});

test('average torque over a turn: 2/pi for one commutated coil, 4/pi for two', () => {
  close(M.turnAverage({}), 2 / Math.PI, 1e-6);
  close(M.turnAverage({ coils: 2 }), 4 / Math.PI, 1e-6);
});

test('two coils 90 degrees apart: min 1, max sqrt 2, ripple ratio cos 45 = 0.7071', () => {
  const r = M.ripple({ coils: 2 });
  close(r.min, 1, 1e-12);
  close(r.max, Math.SQRT2, 1e-12);
  close(r.ratio, Math.cos(Math.PI / 4), 1e-12);
  assert.ok(Math.abs(r.ratio - 0.7071) < 1e-4);
  // A single commutated coil reaches zero, so its ripple ratio is 0.
  assert.equal(M.ripple({}).ratio, 0);
});

test('the model torque matches an independent F = I L x B, tau = r x F calculation', () => {
  for (const mode of M.MODES) for (const coils of [1, 2]) for (const [supply, field] of POLARITIES) {
    for (let alpha = 0; alpha < 360; alpha += 7.5) {
      const o = { mode, coils, supply, field };
      close(M.analyze(alpha, o).total, vectorTorque(alpha, o), 1e-12, `${JSON.stringify(o)} alpha ${alpha}`);
    }
  }
});

test('force on each side has the same size at every angle; the lever arm is |sin theta|', () => {
  for (let alpha = 1; alpha < 360; alpha += 13) {
    const c = M.analyze(alpha, {}).coils[0];
    assert.equal(Math.abs(c.sideA.force), 1);
    assert.equal(c.sideB.force, -c.sideA.force);
    close(c.lever, Math.abs(Math.sin(alpha * Math.PI / 180)), 1e-12);
    // Couple: two equal, opposite forces, so no net force.
    assert.equal(c.sideA.force + c.sideB.force, 0);
  }
});

test('the split ring reverses the coil current at the neutral plane; slip rings never do', () => {
  for (const th of [0, 180]) {
    const before = M.sideCurrent(th - 1, {}), after = M.sideCurrent(th + 1, {});
    assert.equal(before, -after, `split ring at ${th}`);
    assert.equal(M.sideCurrent(th, {}), 0, 'on the gap there is no current');
    assert.equal(M.sideCurrent(th - 1, { mode: 'slip' }), M.sideCurrent(th + 1, { mode: 'slip' }));
  }
  assert.equal(M.analyze(10, {}).coils[0].segmentABrush, 'top');
  assert.equal(M.analyze(190, {}).coils[0].segmentABrush, 'bottom');
  assert.equal(M.analyze(0, {}).coils[0].segmentABrush, 'gap');
});

test('reversing I or B reverses rotation; reversing both restores it', () => {
  const sense = (supply, field) => M.analyze(M.alphaFromTheta(60, field), { supply, field }).sense;
  assert.equal(sense(1, 1), 'counterclockwise');
  assert.equal(sense(-1, 1), 'clockwise');
  assert.equal(sense(1, -1), 'clockwise');
  assert.equal(sense(-1, -1), 'counterclockwise');
  // Swapping the magnets at a fixed rotor position: theta (from B) moves by 180.
  assert.equal(M.thetaFromAlpha(30, -1), 210);
  assert.equal(M.alphaFromTheta(210, -1), 30);
});

test('SI torque: tau = N B I A sin theta, worked example on the page', () => {
  const ex = M.torqueSI({ turns: 50, fieldT: 0.2, currentA: 2, areaM2: 0.04 * 0.03, thetaDeg: 30 });
  close(ex.peak, 0.024, 1e-12);
  close(ex.torque, 0.012, 1e-12);
  close(M.torqueSI({ turns: 1, fieldT: 1, currentA: 1, areaM2: 1, thetaDeg: 270, mode: 'slip' }).torque, -1, 1e-12);
  close(M.torqueSI({ turns: 1, fieldT: 1, currentA: 1, areaM2: 1, thetaDeg: 270 }).torque, 1, 1e-12);
  assert.equal(M.torqueSI({ turns: 3, fieldT: 0, currentA: 5, areaM2: 0.1, thetaDeg: 90 }).torque, 0);
});

test('invalid inputs are rejected rather than producing numbers', () => {
  const ok = { turns: 10, fieldT: 0.5, currentA: 1, areaM2: 0.01, thetaDeg: 30 };
  for (const bad of [{ turns: 0 }, { turns: 2.5 }, { fieldT: -0.1 }, { fieldT: 4 }, { currentA: NaN }, { currentA: -1 },
    { areaM2: 0 }, { areaM2: 2 }, { thetaDeg: Infinity }, { mode: 'brushless' }]) {
    assert.throws(() => M.torqueSI(Object.assign({}, ok, bad)), RangeError, JSON.stringify(bad));
  }
  for (const bad of [{ mode: 'x' }, { coils: 3 }, { supply: 0 }, { field: 2 }]) assert.throws(() => M.options(bad), RangeError);
  assert.throws(() => M.analyze(NaN, {}), RangeError);
  assert.throws(() => M.analyze('30', {}), RangeError);
  assert.throws(() => M.sweep({}, 3), RangeError);
  assert.throws(() => M.illustrativeStep({ alpha: 0, omega: 0 }, 1, {}), RangeError);
});

test('angles wrap without negative zero or 360', () => {
  for (const [a, w] of [[360, 0], [-0, 0], [-90, 270], [725, 5], [359.5, 359.5]]) {
    assert.ok(Object.is(M.wrap(a), w), `${a} -> ${M.wrap(a)}`);
  }
});

test('illustrative motion: commutator keeps one direction; slip rings swing back', () => {
  let s = { alpha: 30, omega: 0 }, minOmega = Infinity;
  for (let i = 0; i < 600; i += 1) { s = M.illustrativeStep(s, 1 / 60, {}); if (i > 30) minOmega = Math.min(minOmega, s.omega); }
  assert.ok(minOmega > 0, 'commutated rotor never turns backward');
  s = { alpha: 150, omega: 0 };
  let reversed = false;
  for (let i = 0; i < 600; i += 1) { s = M.illustrativeStep(s, 1 / 60, { mode: 'slip' }); if (s.omega < 0) reversed = true; }
  assert.ok(reversed, 'slip-ring rotor is pushed back after passing the neutral plane');
  assert.ok(Number.isFinite(s.alpha) && Number.isFinite(s.omega));
});

test('drawings follow the model: conductor marks, forces and zero-torque state', () => {
  // theta = 30 degrees, commutator: side A carries current away (cross) at E(-0.5, 0.866).
  const svg = D.endView({ alpha: 30, options: {} });
  const ax = 180 - 78 * 0.5, ay = 158 - 78 * Math.cos(Math.PI / 6);
  const cross = svg.match(/class="dmcc-cross" d="M([\d.]+) ([\d.]+)/);
  assert.ok(cross, 'a cross mark is drawn');
  close(Number(cross[1]) + 6, ax, 0.2, 'cross x');
  close(Number(cross[2]) + 6, ay, 0.2, 'cross y');
  assert.ok(/counterclockwise/.test(svg));
  // In the neutral plane there is no current, no force arrow and no torque arrow.
  const zero = D.endView({ alpha: 0, options: {} });
  assert.ok(!/dmcc-force"/.test(zero) && !/dmcc-torque"/.test(zero) && /τ = 0/.test(zero));
  for (const mode of M.MODES) for (const coils of [1, 2]) for (const [supply, field] of POLARITIES) for (const alpha of [0, 33, 90, 200]) {
    const st = { alpha, options: { mode, coils, supply, field }, revealed: true, visited: [0.1, 0.2] };
    for (const out of [D.cutaway(st), D.endView(st), D.trace(st)]) assert.ok(!/NaN|undefined|Infinity/.test(out), JSON.stringify(st));
  }
  assert.ok(!/NaN|undefined/.test(D.staticViews() + D.staticTrace()));
});

test('the page static figures are generated by this renderer', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'static.cjs'), '--check'], { encoding: 'utf8' });
  assert.match(output, /match the model and renderer/);
});

// ---- Physical connectivity of the drawn wiring (v2) ------------------------
const G = D.GEOMETRY;
const angDist = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };
const SETUPS = [];
for (const mode of M.MODES) for (const coils of [1, 2]) for (const [supply, field] of POLARITIES) SETUPS.push({ mode, coils, supply, field });
const ALPHAS = [0, 30, 90, 150, 180, 210, 270, 300];

test('each coil lead lands inside its own conducting segment or its own ring, never on a gap', () => {
  for (const o of SETUPS) for (const alpha of ALPHAS) {
    const r = M.analyze(alpha, o);
    D.wiring(alpha, o).forEach((w, k) => {
      const c = r.coils[k], label = JSON.stringify(o) + ' alpha ' + alpha + ' coil ' + k;
      if (o.mode === 'commutator') {
        // Segment A spans c.alpha +/- 90 minus the gap; segment B is opposite.
        assert.ok(angDist(w.a.angle, c.alpha) < 90 - G.SPLIT_GAP, label + ' lead A inside segment A');
        assert.ok(angDist(w.b.angle, c.alpha + 180) < 90 - G.SPLIT_GAP, label + ' lead B inside segment B');
        // The gap centres are at c.alpha +/- 90: a lead must stay clear of them.
        for (const g of [c.alpha + 90, c.alpha - 90]) {
          assert.ok(angDist(w.a.angle, g) > G.SPLIT_GAP && angDist(w.b.angle, g) > G.SPLIT_GAP, label + ' clear of gaps');
        }
        const z0 = G.SPLIT_Z0 + G.SPLIT_STEP * k;
        for (const end of [w.a, w.b]) assert.ok(end.z > z0 && end.z < z0 + G.SPLIT_W, label + ' on this coil\'s commutator');
      } else {
        const za = G.SLIP_Z0 + G.SLIP_STEP * 2 * k, zb = za + G.SLIP_STEP;
        assert.ok(w.a.z > za && w.a.z < za + G.SLIP_W, label + ' lead A on ring A');
        assert.ok(w.b.z > zb && w.b.z < zb + G.SLIP_W, label + ' lead B on ring B');
        assert.ok(Math.abs(w.a.z - w.b.z) >= G.SLIP_STEP - 1e-9, label + ' the two ends use distinct rings');
      }
      // Each lead reaches the contact surface radius.
      for (const p of [w.forward[0], w.forward[w.forward.length - 1]]) close(Math.hypot(p[0], p[1]), G.RING_R, 1e-9, label + ' at ring radius');
    });
  }
});

test('brush phase and current agree: current enters side A from the positive brush', () => {
  for (const o of SETUPS) for (const alpha of ALPHAS) {
    const r = M.analyze(alpha, o);
    r.coils.forEach(c => {
      const plus = o.supply; // polarity of the top brush (+1 means positive)
      let brushOnA;
      if (o.mode === 'commutator') {
        // The top brush sits at 90 degrees; it touches segment A when 90 lies inside alpha +/- 90.
        const d = angDist(90, c.alpha);
        if (d === 90) { assert.equal(c.current, 0, 'on the gap: no current'); return; }
        brushOnA = d < 90 ? plus : -plus;
        assert.equal(c.segmentABrush, d < 90 ? 'top' : 'bottom');
      } else brushOnA = plus; // ring A carries the top brush
      // Conventional current flows from + into side A: away from the commutator end (-1).
      assert.equal(c.current, -brushOnA, JSON.stringify(o) + ' alpha ' + alpha);
    });
  }
});

test('the drawn wire starts and ends on the contacts, and the current path matches the end view', () => {
  for (const o of SETUPS) for (const alpha of ALPHAS) {
    const svg = D.cutaway({ alpha, options: o });
    const wires = [...svg.matchAll(/class="dmcc-wire[^"]*" fill="none" d="([^"]+)"/g)].map(m => m[1]);
    const flows = [...svg.matchAll(/class="dmcc-flow" fill="none" stroke-dasharray="[^"]+" stroke-dashoffset="[^"]+" d="([^"]+)"/g)].map(m => m[1]);
    const ws = D.wiring(alpha, o).slice().reverse(); // drawn second coil first
    assert.equal(wires.length, ws.length);
    const pointsOf = d => d.split(/[ML]/).filter(Boolean).map(s => s.trim().split(' ').map(Number));
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.2;
    let f = 0;
    ws.forEach((w, i) => {
      const pts = pointsOf(wires[i]);
      assert.ok(near(pts[0], D.project(w.forward[0])), 'wire starts at contact A');
      assert.ok(near(pts[pts.length - 1], D.project(w.forward[w.forward.length - 1])), 'wire ends at contact B');
      if (w.current === 0) return;
      const flow = pointsOf(flows[f++]);
      const entry = w.current < 0 ? w.forward[0] : w.forward[w.forward.length - 1];
      assert.ok(near(flow[0], D.project(entry)), 'current path starts at the contact it enters');
      // Along side A the drawn current runs front-to-back exactly when the end view shows a cross (away).
      const iF = flow.findIndex(p => near(p, D.project(w.corners.aF))), iB = flow.findIndex(p => near(p, D.project(w.corners.aB)));
      assert.ok(iF >= 0 && iB >= 0);
      const away = iF < iB;
      assert.equal(away, w.current < 0);
    });
    // End view agrees with the model for coil 1 side 1.
    const c1 = M.analyze(alpha, o).coils[0];
    const end = D.endView({ alpha, options: o });
    if (c1.current < 0) assert.match(end, /dmcc-cross/); else if (c1.current > 0) assert.match(end, /dmcc-dot/);
    else if (o.coils === 1) assert.ok(!/dmcc-cross|dmcc-dot/.test(end), 'no current marks on the gap');
  }
});

test('zero-torque angles are classified from the torque either side, for every polarity', () => {
  const kind = (alpha, o) => M.neighbourhood(alpha, o).kind;
  // Slip rings, default supply and magnets: theta 0 unstable, 180 stable.
  assert.equal(kind(0, { mode: 'slip' }), 'unstable');
  assert.equal(kind(180, { mode: 'slip' }), 'stable');
  // Reversed supply swaps them.
  assert.equal(kind(0, { mode: 'slip', supply: -1 }), 'stable');
  assert.equal(kind(180, { mode: 'slip', supply: -1 }), 'unstable');
  // Swapped magnets at the same rotor position swap them too.
  assert.equal(kind(0, { mode: 'slip', field: -1 }), 'stable');
  assert.equal(kind(180, { mode: 'slip', field: -1 }), 'unstable');
  assert.equal(kind(0, { mode: 'slip', supply: -1, field: -1 }), 'unstable');
  // Split ring: a dead spot the rotor passes through, in the commutated direction.
  const n = M.neighbourhood(0, {});
  assert.equal(n.kind, 'through'); assert.equal(n.direction, 'counterclockwise');
  assert.equal(M.neighbourhood(180, { supply: -1 }).direction, 'clockwise');
  // Two commutated coils: never zero, so never a rest angle.
  for (const a of ALPHAS) assert.equal(kind(a, { coils: 2 }), 'driven');
  assert.throws(() => M.neighbourhood(0, {}, 0), RangeError);
});

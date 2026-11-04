'use strict';
// Laminate model checks against independent hand results and invariants.
// Run: node --test interactives/laminate-stacking/model.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const M = require('./model.js');
const D = require('./render.js');
const UI = require('./demo.js');
const FO = require('../fiber-orientation/model.js');

function near(actual, expected, tol, msg) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol * scale, `${msg || ''} ${actual} != ${expected} (rel tol ${tol})`);
}
const maxAbs = m => Math.max(...m.flat().map(Math.abs));
// Hand values for E1 40, E2 10, G12 5 GPa, nu12 0.30 (nu21 = 0.075, 1 - nu12 nu21 = 0.9775).
const Q11 = 40000 / 0.9775, Q22 = 10000 / 0.9775, Q12 = 3000 / 0.9775, Q66 = 5000;
const QI = [0, 45, -45, 90, 90, -45, 45, 0];

test('ply defaults and validation come from the fiber-orientation module', () => {
  assert.deepEqual({ ...M.MATERIAL }, { E1GPa: FO.defaults.E1GPa, E2GPa: FO.defaults.E2GPa, G12GPa: FO.defaults.G12GPa, nu12: FO.defaults.nu12 });
  const q = M.reducedStiffness();
  near(q.Q11, Q11, 1e-12); near(q.Q22, Q22, 1e-12); near(q.Q12, Q12, 1e-12); near(q.Q66, Q66, 1e-12);
  assert.throws(() => M.reducedStiffness({ E1GPa: 1, E2GPa: 1, G12GPa: 1, nu12: 1 }), /1 - nu12\*nu21/);
  assert.throws(() => M.reducedStiffness({ E1GPa: 0, E2GPa: 1, G12GPa: 1, nu12: 0.3 }), /greater than zero/);
});

test('a single ply reproduces the single-ply lesson in every direction', () => {
  const one = M.laminate([0]);
  near(M.directionalModulus(one, 0), 40, 1e-12, 'Ex(0)');
  near(M.directionalModulus(one, 90), 10, 1e-12, 'Ex(90)');
  for (let th = -90; th <= 180; th += 7.5) near(M.directionalModulus(one, th), FO.illustrative(th).effectiveModulusGPa, 1e-12, 'theta ' + th);
  for (const phi of [-45, 0, 30, 45, 90]) near(M.directionalModulus(M.laminate([phi]), 0), FO.illustrative(phi).effectiveModulusGPa, 1e-12, 'ply ' + phi);
  assert.equal(maxAbs(one.B) <= 1e-9 * maxAbs(one.A), true, 'one ply is symmetric about its own midplane');
});

test('Qbar uses engineering shear: matches an independent tensor rotation with the Reuter matrix', () => {
  const Q = [[Q11, Q12, 0], [Q12, Q22, 0], [0, 0, Q66]];
  const mul = (a, b) => a.map(r => b[0].map((_, j) => r.reduce((s, x, k) => s + x * b[k][j], 0)));
  for (const deg of [-60, -45, 0, 20, 45, 90]) {
    const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    // Stress transformation global -> material (tensor shear), and its inverse.
    const T = [[c * c, s * s, 2 * c * s], [s * s, c * c, -2 * c * s], [-c * s, c * s, c * c - s * s]];
    const Ti = [[c * c, s * s, -2 * c * s], [s * s, c * c, 2 * c * s], [c * s, -c * s, c * c - s * s]];
    const R = [[1, 0, 0], [0, 1, 0], [0, 0, 2]], Ri = [[1, 0, 0], [0, 1, 0], [0, 0, 0.5]];
    const expected = mul(mul(mul(mul(Ti, Q), R), T), Ri);
    const got = M.qbar(deg);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(got[i][j] - expected[i][j]) <= 1e-9 * Q11, `Qbar ${deg} [${i}][${j}]`);
  }
  // +-45 symmetric laminate in-plane shear modulus = (Q11 + Q22 - 2 Q12)/4 for engineering shear.
  const pm = M.laminate([45, -45, -45, 45]);
  near(pm.A[2][2] / pm.h, (Q11 + Q22 - 2 * Q12) / 4, 1e-12, 'G_xy of [+-45]s');
});

test('A, B, D units and hand values for [0/90]: A in N/mm, B in N, D in N mm', () => {
  const L = M.laminate([0, 90]);
  near(L.h, 0.25, 1e-15);
  near(L.A[0][0], (Q11 + Q22) * 0.125, 1e-12, 'A11 = sum Qbar t');
  near(L.B[0][0], (Q11 - Q22) * 0.125 * 0.125 / 2, 1e-12, 'B11 with 0 deg on top');
  near(L.B[1][1], -(Q11 - Q22) * 0.125 * 0.125 / 2, 1e-12, 'B22');
  near(L.D[0][0], (Q11 + Q22) * Math.pow(0.125, 3) / 3, 1e-12, 'D11');
  assert.ok(Math.abs(L.B[2][2]) < 1e-9 && Math.abs(L.B[0][1]) < 1e-9);
  // Flat-held modulus in GPa times thickness in mm, times 1000, is the stiffness in N/mm.
  near(M.directionalModulus(L, 0) * L.h * 1000, 1 / L.a[0][0], 1e-12);
});

test('symmetric stacks have B = 0; unsymmetric stacks do not', () => {
  for (const s of [[0, 90, 90, 0], [45, -45, -45, 45], QI, [0], [90, 0, 90]]) {
    const L = M.laminate(s);
    assert.ok(maxAbs(L.B) <= 1e-9 * maxAbs(L.A) * L.h, M.label(s) + ' B ~ 0');
    assert.equal(M.classify(L, s).couplingZero, true);
    assert.equal(M.classify(L, s).symmetric, true);
  }
  for (const s of [[0, 90], [45, -45], [0, 45, -45, 90], [0, 0, 90]]) {
    const L = M.laminate(s);
    assert.ok(maxAbs(L.B) > 1, M.label(s) + ' B != 0');
    assert.equal(M.classify(L, s).couplingZero, false);
  }
});

test('[0/+45/-45/90]s is quasi-isotropic: constant Ex within 1e-6 and A16 = A26 = 0', () => {
  for (const s of [QI, [45, 0, -45, 90, 90, -45, 0, 45]]) {
    const L = M.laminate(s), E0 = M.directionalModulus(L, 0);
    for (let th = 0; th <= 360; th += 15) assert.ok(Math.abs(M.directionalModulus(L, th) - E0) <= 1e-6 * E0, M.label(s) + ' at ' + th);
    assert.ok(Math.abs(L.A[0][2]) <= 1e-9 * L.A[0][0] && Math.abs(L.A[1][2]) <= 1e-9 * L.A[0][0]);
    near(L.A[2][2], (L.A[0][0] - L.A[0][1]) / 2, 1e-9, 'isotropic A66');
    assert.equal(M.classify(L, s).quasiIsotropic, true);
  }
  for (const s of [[0, 90, 90, 0], [45, -45, -45, 45], [0, 45, 45, 0]]) assert.equal(M.classify(M.laminate(s), s).quasiIsotropic, false, M.label(s));
  // Balanced is a separate property: [0/+45]s is symmetric but unbalanced.
  const ub = M.laminate([0, 45, 45, 0]), c = M.classify(ub, [0, 45, 45, 0]);
  assert.equal(c.symmetric, true); assert.equal(c.balanced, false); assert.ok(Math.abs(ub.A[0][2]) > 1);
  const ap = M.classify(M.laminate([45, -45]), [45, -45]);
  assert.equal(ap.balanced, true); assert.equal(ap.symmetric, false);
});

test('reversing the ply order keeps A and D, reverses B, and reverses curvature but not midplane strain', () => {
  for (const s of [[0, 90], [45, -45], [0, 45, -45, 90], [0, 0, 90, 45]]) {
    const L = M.laminate(s), R = M.laminate(s.slice().reverse());
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      assert.ok(Math.abs(L.A[i][j] - R.A[i][j]) <= 1e-9 * maxAbs(L.A));
      assert.ok(Math.abs(L.D[i][j] - R.D[i][j]) <= 1e-9 * maxAbs(L.D));
      assert.ok(Math.abs(L.B[i][j] + R.B[i][j]) <= 1e-9 * maxAbs(L.B));
    }
    const a = M.respond(L, { Nx: 0.5 }), b = M.respond(R, { Nx: 0.5 });
    for (const k of ['ex', 'ey', 'gxy']) assert.ok(Math.abs(a.strain[k] - b.strain[k]) <= 1e-9 * Math.abs(a.strain.ex), k);
    for (const k of ['kx', 'ky', 'kxy']) assert.ok(Math.abs(a.curvature[k] + b.curvature[k]) <= 1e-9 * Math.max(1e-12, Math.abs(a.curvature.kx) + Math.abs(a.curvature.kxy)), k);
  }
});

test('zero load means zero deformation, even with B != 0', () => {
  for (const s of [[0, 90], [45, -45], [0, 90, 90, 0]]) {
    const r = M.respond(M.laminate(s), { Nx: 0, Ny: 0, Nxy: 0 }, { Mx: 0, My: 0, Mxy: 0 });
    assert.deepEqual([r.strain.ex, r.strain.ey, r.strain.gxy, r.curvature.kx, r.curvature.ky, r.curvature.kxy].map(Math.abs), [0, 0, 0, 0, 0, 0]);
    const relief = M.smallDeflection(r.curvature, 25, 0.25);
    assert.equal(relief.reliefMm, 0);
  }
});

test('symmetric stack under Nx with zero moment: zero curvature; unsymmetric: curl toward the 0 deg face', () => {
  const sym = M.respond(M.laminate([0, 90, 90, 0]), { Nx: 0.5 });
  assert.deepEqual([sym.curvature.kx, sym.curvature.ky, sym.curvature.kxy].map(Math.abs), [0, 0, 0]);
  assert.ok(sym.strain.ex > 0);
  const un = M.respond(M.laminate([0, 90]), { Nx: 0.5 });
  assert.ok(Math.abs(un.curvature.kx) > 1e-5, 'curvature appears under in-plane load');
  // 0 deg ply on top (+z): the panel curves into the 0 deg fiber side, so its x edges rise.
  assert.ok(M.deflection(un.curvature, 25, 0) > 0);
  const tw = M.respond(M.laminate([45, -45]), { Nx: 0.5 });
  assert.ok(Math.abs(tw.curvature.kxy) > 1e-5 && tw.curvature.kx === 0 && tw.curvature.ky === 0, 'antisymmetric angle ply twists');
});

test('full 6x6 solution satisfies N = A eps + B kappa and M = B eps + D kappa = 0, linearly', () => {
  for (const s of [[0, 90], [45, -45, 0], [0, 45, -45, 90], [90, 45, 45, 0, -45]]) {
    const L = M.laminate(s);
    for (const N of [{ Nx: 0.5 }, { Ny: -0.3 }, { Nxy: 0.2 }, { Nx: 0.25, Ny: 0.1, Nxy: -0.4 }]) {
      const r = M.respond(L, N), e = [r.strain.ex, r.strain.ey, r.strain.gxy], k = [r.curvature.kx, r.curvature.ky, r.curvature.kxy];
      const want = [N.Nx || 0, N.Ny || 0, N.Nxy || 0];
      for (let i = 0; i < 3; i++) {
        const n = L.A[i].reduce((sum, a, j) => sum + a * e[j] + L.B[i][j] * k[j], 0);
        const m = L.B[i].reduce((sum, b, j) => sum + b * e[j] + L.D[i][j] * k[j], 0);
        assert.ok(Math.abs(n - want[i]) <= 1e-9, 'N residual');
        assert.ok(Math.abs(m) <= 1e-9, 'M residual');
      }
      const double = M.respond(L, { Nx: 2 * (N.Nx || 0), Ny: 2 * (N.Ny || 0), Nxy: 2 * (N.Nxy || 0) });
      near(double.curvature.kx, 2 * r.curvature.kx, 1e-9); near(double.strain.ex, 2 * r.strain.ex, 1e-9);
    }
  }
});

test('free laminate is never stiffer than flat-held; equal when B = 0', () => {
  for (const s of [[0, 90], [45, -45], [0, 45, -45, 90]]) {
    const L = M.laminate(s);
    for (let th = 0; th < 180; th += 5) assert.ok(M.directionalModulus(L, th, 'free') <= M.directionalModulus(L, th, 'flat') + 1e-12);
    assert.ok(M.directionalModulus(L, 0, 'free') < M.directionalModulus(L, 0, 'flat') - 0.1);
  }
  const S = M.laminate(QI);
  for (let th = 0; th < 180; th += 5) near(M.directionalModulus(S, th, 'free'), M.directionalModulus(S, th, 'flat'), 1e-9);
});

test('invalid inputs are refused rather than drawn', () => {
  assert.throws(() => M.laminate([]), /at least one ply/);
  assert.throws(() => M.laminate([0, NaN]), /finite/);
  assert.throws(() => M.laminate([{ angle: 0, t: 0 }]), /greater than zero/);
  assert.throws(() => M.laminate('0/90'), /at least one ply/);
  assert.throws(() => M.respond(M.laminate([0]), { Nx: Infinity }), /finite/);
  assert.throws(() => M.directionalModulus(M.laminate([0]), NaN), /finite/);
  assert.throws(() => M.invert([[1, 2], [2, 4]]), /singular/);
});

test('labels, presets and the prediction key', () => {
  assert.equal(M.label([0, 90, 90, 0]), '[0/90]s');
  assert.equal(M.label([0, 90]), '[0/90]');
  assert.equal(M.label([0, 45, -45, 90]), '[0/+45/\u221245/90]');
  // Defensible answers: both orderings of the quasi-isotropic ply set are right.
  const truth = UI.QUIZ.map(q => M.classify(M.laminate(q.stack), q.stack).quasiIsotropic);
  assert.deepEqual(truth, [false, false, true, true]);
  assert.equal(UI.scoreQuiz(['c', 'd']).correct, 4);
  assert.equal(UI.scoreQuiz(['c']).correct, 3);
  assert.equal(UI.scoreQuiz(['a', 'b']).correct, 0);
  assert.deepEqual(UI.moved([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
  for (const p of UI.PRESETS) assert.ok(p[2].length >= 1 && p[2].length <= M.MAX_PLIES);
});

test('renderer: no element ids, one plate per ply, zero load draws a flat panel, shared magnification', () => {
  const svg = D.stack([0, 45, -45, 90]);
  assert.doesNotMatch(svg, /\sid="/);
  assert.equal((svg.match(/class="ls-ply ls-/g) || []).length, 4);
  assert.deepEqual([...svg.matchAll(/data-angle="(-?\d+)"/g)].map(m => Number(m[1])).sort((a, b) => a - b), [-45, 0, 45, 90]);
  const L = M.laminate([0, 90]);
  const flat = D.panel(L, M.respond(L, {}), 50);
  const pts = [...flat.matchAll(/class="ls-face" points="([^"]+)"/g)].map(m => m[1]);
  assert.equal(pts.length, 144);
  // Zero load: heights are zero, so the drawing cannot depend on the magnification.
  const facesAt = (resp, mag) => [...D.panel(L, resp, mag).matchAll(/class="ls-face" points="([^"]+)"/g)].map(m => m[1]).sort().join('|');
  assert.equal(facesAt(M.respond(L, {}), 50), facesAt(M.respond(L, {}), 1));
  assert.notEqual(facesAt(M.respond(L, { Nx: 0.5 }), 50), facesAt(M.respond(L, { Nx: 0.5 }), 1));
  const sym = M.laminate([0, 90, 90, 0]);
  assert.equal([...D.panel(sym, M.respond(sym, { Nx: 0.5 }), 50).matchAll(/class="ls-face" points="([^"]+)"/g)].map(m => m[1]).sort().join('|'),
    [...D.panel(sym, M.respond(sym, {}), 50).matchAll(/class="ls-face" points="([^"]+)"/g)].map(m => m[1]).sort().join('|'), 'symmetric panel stays flat under Nx');
  assert.doesNotMatch(flat, /ls-load/, 'no arrows when unloaded');
  const loaded = D.panel(L, M.respond(L, { Nx: 0.5 }), 50);
  assert.notEqual(flat, loaded);
  const mag = D.commonMagnification([L, M.laminate(M.mirror([0, 90]))]);
  assert.ok(mag > 0 && mag <= D.BASE_MAGNIFICATION);
  assert.doesNotMatch(D.staticLesson(), /\sid="/);
});

test('balanced is a flat-held property: an unsymmetric balanced stack can still shear when free', () => {
  const s = [0, 45, -45, 90], L = M.laminate(s), c = M.classify(L, s);
  assert.equal(c.balanced, true); assert.equal(c.couplingZero, false);
  const free = M.respond(L, { Nx: 0.5 });
  near(free.strain.gxy, 5.7361e-6, 1e-4, 'free gamma_xy of [0/+45/-45/90] at Nx 0.5');
  // Held flat (kappa = 0) the same pull gives no shear because A16 = A26 = 0.
  const flatStrain = L.a.map(row => row[0] * 0.5);
  assert.ok(Math.abs(flatStrain[2]) <= 1e-12 * Math.abs(flatStrain[0]));
  const sym = [0, 45, -45, 90, 90, -45, 45, 0];
  assert.equal(M.respond(M.laminate(sym), { Nx: 0.5 }).strain.gxy, 0, 'balanced and symmetric: no shear when free');
});

test('principal curvatures use the engineering twist: tensor [[kx, kxy/2], [kxy/2, ky]]', () => {
  const tw = M.respond(M.laminate([45, -45]), { Nx: 0.5 }).curvature;
  near(M.principalCurvatures(tw).radiusMm, 2541.9, 1e-4, 'pure twist radius');
  near(M.principalCurvatures(M.respond(M.laminate([0, 90]), { Nx: 0.5 }).curvature).radiusMm, 1270.96, 1e-4, 'cylindrical curl radius');
  assert.equal(M.principalCurvatures({ kx: 0, ky: 0, kxy: 0 }).radiusMm, Infinity);
  // Independent check: the normal curvature in direction phi is kx c^2 + ky s^2 + kxy s c;
  // its extremes over phi are the principal curvatures.
  for (const k of [{ kx: 1e-3, ky: -2e-4, kxy: 5e-4 }, { kx: 0, ky: 0, kxy: -8e-4 }, tw]) {
    let hi = -Infinity, lo = Infinity;
    for (let i = 0; i < 3600; i++) { const f = i * Math.PI / 3600, c = Math.cos(f), s = Math.sin(f); const kn = k.kx * c * c + k.ky * s * s + k.kxy * s * c; hi = Math.max(hi, kn); lo = Math.min(lo, kn); }
    const p = M.principalCurvatures(k);
    assert.ok(Math.abs(p.k1 - hi) <= 1e-9 && Math.abs(p.k2 - lo) <= 1e-9);
  }
});

test('surface height range finds edge and corner extrema (saddle, twist, mixed) against a dense grid', () => {
  const sad = M.respond(M.laminate([0, 90]), { Nx: 0.5, Ny: 0.5 }).curvature;
  near(sad.kx, -0.000786808, 1e-5); near(sad.ky, 0.000786808, 1e-5);
  const r = M.smallDeflection(sad, 25, 0.25);
  near(r.reliefMm, 0.491755, 1e-5, 'saddle relief from edge midpoints');
  assert.equal(r.withinLinearRange, false);
  const tw = M.smallDeflection(M.respond(M.laminate([45, -45]), { Nx: 0.5 }).curvature, 25, 0.25);
  near(tw.reliefMm, 0.491755, 1e-5, 'pure twist relief from corners');
  const grid = (k, a, n) => { let hi = -Infinity, lo = Infinity; for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const w = M.deflection(k, -a + 2 * a * i / n, -a + 2 * a * j / n); hi = Math.max(hi, w); lo = Math.min(lo, w); } return hi - lo; };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let t = 0; t < 200; t++) {
    const k = { kx: rnd() * 2e-3, ky: rnd() * 2e-3, kxy: rnd() * 2e-3 };
    const exact = M.smallDeflection(k, 25, 0.25).reliefMm, sampled = grid(k, 25, 160);
    assert.ok(exact >= sampled - 1e-12, 'exact range never below sampled range');
    assert.ok(exact - sampled <= 1e-3 * Math.max(exact, 1e-9) + 1e-9, `exact ${exact} vs grid ${sampled}`);
  }
  assert.equal(M.smallDeflection({ kx: 0, ky: 0, kxy: 0 }, 25, 0.25).reliefMm, 0);
  assert.throws(() => M.smallDeflection(sad, 0, 0.25), /greater than zero/);
});

test('common magnification bounds every load in the slider box (dense load sampling)', () => {
  for (const s of [[0, 90], [45, -45], [0, 45, -45, 90], [0, 0, 90], [90, 45, 0]]) {
    const lams = [M.laminate(s), M.laminate(M.mirror(s))], mag = D.commonMagnification(lams);
    let worst = 0;
    const steps = [-0.5, -0.3, -0.1, 0, 0.1, 0.3, 0.5];
    for (const L of lams) for (const nx of steps) for (const ny of steps) for (const nxy of steps)
      worst = Math.max(worst, M.smallDeflection(M.respond(L, { Nx: nx, Ny: ny, Nxy: nxy }).curvature, D.PATCH_MM / 2, L.h).reliefMm);
    assert.ok(worst * mag <= 0.3 * D.PATCH_MM + 1e-9, M.label(s) + ' drawn range ' + worst * mag);
  }
});

test('static fallback in the host page matches the renderer', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'static.cjs')], { encoding: 'utf8' });
  assert.match(out, /matches/);
});

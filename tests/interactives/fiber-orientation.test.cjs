const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../../interactives/fiber-orientation/model.js');

function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`);
}

test('illustrative 0, 45, and 90 degree axis values match independent compliance results', () => {
  const zero = M.illustrative(0), fortyFive = M.illustrative(45), ninety = M.illustrative(90);
  near(zero.effectiveModulusGPa, 40);
  near(zero.globalStrain.epsilonX, 0.00025);
  near(ninety.effectiveModulusGPa, 10);
  near(ninety.globalStrain.epsilonX, 0.001);
  near(fortyFive.effectiveModulusGPa, 12.903225806451612);
  near(fortyFive.globalStrain.epsilonX, 0.000775);
  near(fortyFive.globalStrain.epsilonY, -0.000225);
  near(fortyFive.globalStrain.gammaXY, -0.000375);
});

test('opposite fiber angles keep axial response and reverse extension-shear coupling', () => {
  const plus = M.illustrative(45), minus = M.illustrative(-45);
  near(plus.effectiveModulusGPa, minus.effectiveModulusGPa);
  near(plus.globalStrain.epsilonX, minus.globalStrain.epsilonX);
  near(plus.globalStrain.epsilonY, minus.globalStrain.epsilonY);
  near(plus.globalStrain.gammaXY, -minus.globalStrain.gammaXY);
  assert.notEqual(Math.sign(plus.globalStrain.gammaXY), 0);
});

test('orientation is 180 degree periodic and axes do not couple extension to shear', () => {
  for (const angle of [-67, 0, 28, 90, 143]) {
    const a = M.illustrative(angle), b = M.illustrative(angle + 180);
    near(a.effectiveModulusGPa, b.effectiveModulusGPa);
    near(a.globalStrain.epsilonX, b.globalStrain.epsilonX);
    near(a.globalStrain.gammaXY, b.globalStrain.gammaXY);
  }
  near(M.illustrative(0).globalStrain.gammaXY, 0);
  near(M.illustrative(90).globalStrain.gammaXY, 0);
});

test('isotropic constants make every orientation identical with zero shear', () => {
  const E = 30, nu = 0.25, G = E / (2 * (1 + nu));
  for (const angle of [-45, 0, 17, 45, 90, 137]) {
    const r = M.calculate({ E1GPa: E, E2GPa: E, G12GPa: G, nu12: nu, sigmaXMPa: 12, angleDeg: angle });
    near(r.effectiveModulusGPa, E);
    near(r.globalStrain.epsilonX, 12 / 30000);
    near(r.globalStrain.epsilonY, -nu * 12 / 30000);
    near(r.globalStrain.gammaXY, 0);
  }
});

test('sign and units scale consistently with applied stress', () => {
  const tensile = M.illustrative(30);
  const compressive = M.calculate({ ...M.defaults, sigmaXMPa: -10, angleDeg: 30 });
  near(compressive.globalStrain.epsilonX, -tensile.globalStrain.epsilonX);
  near(compressive.globalStrain.epsilonY, -tensile.globalStrain.epsilonY);
  near(compressive.globalStrain.gammaXY, -tensile.globalStrain.gammaXY);
  near(compressive.effectiveModulusGPa, tensile.effectiveModulusGPa);
});

test('invalid and unstable elastic inputs are rejected', () => {
  assert.throws(() => M.calculate({ ...M.defaults, angleDeg: 0, E1GPa: 0 }), /greater than zero/);
  assert.throws(() => M.calculate({ ...M.defaults, angleDeg: 0, G12GPa: NaN }), /finite/);
  assert.throws(() => M.calculate({ E1GPa: 1, E2GPa: 1, G12GPa: 1, nu12: 1, sigmaXMPa: 1, angleDeg: 0 }), /1 - nu12\*nu21/);
});

test('published practice answers accept stated rounding and reject common wrong methods', () => {
  const accepts = (attempt, answer, tolerance) => Math.abs(attempt - answer) <= tolerance;
  assert.equal(accepts(0.025, 0.025, 0.0005), true);
  assert.equal(accepts(0.00025, 0.025, 0.0005), false, 'dimensionless strain must not pass as percent');
  assert.equal(accepts(12.90, 12.9032258064516, 0.05), true);
  assert.equal(accepts(0.129, 12.9032258064516, 0.05), false, 'percent/GPa unit confusion must fail');
  assert.equal(accepts(2000, 2000, 1), true);
  assert.equal(accepts(20, 2000, 1), false, 'area conversion error must fail');
  const bank = fs.readFileSync(path.join(__dirname, '../../practice/fiber-direction-and-stiffness.html'), 'utf8');
  for (const id of ['fiber-angle-symmetry', 'fiber-stiffness-not-strength']) {
    const panel = bank.match(new RegExp('<div[^>]+id="' + id + '"[^>]+>'));
    assert.ok(panel, id + ' panel must exist');
    assert.match(panel[0], /data-unit="choice"/);
  }
});

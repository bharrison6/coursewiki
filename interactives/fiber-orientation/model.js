/* One thin, unidirectional, orthotropic lamina in linear plane stress.
   Applied stress is uniform in global x with free transverse edges:
   sigma_y = tau_xy = 0. This is an elastic teaching model, not strength,
   damage, failure, laminate, coupon-grip, or design-allowable analysis. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FiberOrientationModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var EPS = 1e-12;
  var DEFAULTS = Object.freeze({ E1GPa: 40, E2GPa: 10, G12GPa: 5, nu12: 0.30, sigmaXMPa: 10 });

  function finite(value, name) {
    if (!Number.isFinite(value)) throw new RangeError(name + ' must be finite.');
  }
  function validate(input) {
    if (!input) throw new RangeError('Material and load inputs are required.');
    ['E1GPa', 'E2GPa', 'G12GPa'].forEach(function (key) {
      finite(input[key], key);
      if (input[key] <= 0) throw new RangeError(key + ' must be greater than zero.');
    });
    finite(input.nu12, 'nu12');
    finite(input.sigmaXMPa, 'sigmaXMPa');
    finite(input.angleDeg, 'angleDeg');
    var nu21 = input.nu12 * input.E2GPa / input.E1GPa;
    if (1 - input.nu12 * nu21 <= EPS) throw new RangeError('Elastic constants must satisfy 1 - nu12*nu21 > 0.');
    return nu21;
  }
  function normalizeAngle(angleDeg) {
    finite(angleDeg, 'angleDeg');
    var angle = angleDeg % 180;
    return angle < 0 ? angle + 180 : angle;
  }
  function calculate(input) {
    var nu21 = validate(input);
    var angle = normalizeAngle(input.angleDeg);
    var radians = angle * Math.PI / 180;
    var m = Math.cos(radians), n = Math.sin(radians);
    var sigma1 = m * m * input.sigmaXMPa;
    var sigma2 = n * n * input.sigmaXMPa;
    var tau12 = -m * n * input.sigmaXMPa;
    // GPa -> MPa so the returned strains are dimensionless.
    var E1 = input.E1GPa * 1000, E2 = input.E2GPa * 1000, G12 = input.G12GPa * 1000;
    var epsilon1 = sigma1 / E1 - input.nu12 * sigma2 / E1;
    var epsilon2 = -input.nu12 * sigma1 / E1 + sigma2 / E2;
    var gamma12 = tau12 / G12;
    var epsilonX = m * m * epsilon1 + n * n * epsilon2 - m * n * gamma12;
    var epsilonY = n * n * epsilon1 + m * m * epsilon2 + m * n * gamma12;
    var gammaXY = 2 * m * n * (epsilon1 - epsilon2) + (m * m - n * n) * gamma12;
    var complianceXPerGPa = Math.pow(m, 4) / input.E1GPa + Math.pow(n, 4) / input.E2GPa +
      m * m * n * n * (1 / input.G12GPa - 2 * input.nu12 / input.E1GPa);
    return Object.freeze({
      angleDeg: angle,
      nu21: nu21,
      effectiveModulusGPa: 1 / complianceXPerGPa,
      applied: Object.freeze({ sigmaXMPa: input.sigmaXMPa, sigmaYMPa: 0, tauXYMPa: 0 }),
      materialStressMPa: Object.freeze({ sigma1: sigma1, sigma2: sigma2, tau12: tau12 }),
      materialStrain: Object.freeze({ epsilon1: epsilon1, epsilon2: epsilon2, gamma12: gamma12 }),
      globalStrain: Object.freeze({ epsilonX: epsilonX, epsilonY: epsilonY, gammaXY: gammaXY })
    });
  }
  function illustrative(angleDeg) {
    return calculate(Object.assign({ angleDeg: angleDeg }, DEFAULTS));
  }
  return Object.freeze({ defaults: DEFAULTS, normalizeAngle: normalizeAngle, validate: validate,
    calculate: calculate, illustrative: illustrative });
});

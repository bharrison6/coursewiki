(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiGears = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TAU = 2 * Math.PI;
  var DEFAULT = Object.freeze({ mode: 'pair', a: 20, b: 40, idler: 30, c: 20, d: 40,
    rpm: 120, torque: 2, direction: 1, efficiency: 100 });
  var MODES = Object.freeze(['pair', 'idler', 'compound']);
  function validate(s) {
    if (!s || MODES.indexOf(s.mode) < 0) throw new RangeError('Unknown gear train');
    ['a', 'b', 'idler', 'c', 'd'].forEach(function (key) {
      if (!Number.isInteger(s[key]) || s[key] < 20 || s[key] > 60) throw new RangeError(key + ': use 20–60 whole teeth');
    });
    if (!Number.isFinite(s.rpm) || s.rpm < 0 || s.rpm > 240) throw new RangeError('Input speed must be 0–240 rpm');
    if (!Number.isFinite(s.torque) || s.torque < 0 || s.torque > 10) throw new RangeError('Input torque must be 0–10 N·m');
    if (s.direction !== 1 && s.direction !== -1) throw new RangeError('Direction must be 1 or -1');
    if (s.efficiency !== undefined && (!Number.isFinite(s.efficiency) || s.efficiency <= 0 || s.efficiency > 100))
      throw new RangeError('Mesh efficiency must be greater than 0 and at most 100 percent');
    return s;
  }
  // Clockwise is positive, viewed from the front on every shaft. The phase sets a
  // tooth opposite a space at the line of centers; motion then preserves that mesh.
  function meshPhase(driver, drivenTeeth, lineAngle) {
    return lineAngle + Math.PI - Math.PI / drivenTeeth -
      driver.teeth / drivenTeeth * (driver.phase - lineAngle);
  }
  function solve(s) {
    validate(s);
    var gears = [{ id: 'A', teeth: s.a, ratio: 1, phase: 0, shaft: 0 }], meshes = [], shafts = [];
    function mesh(from, id, teeth, shaft) {
      var driver = gears.find(function (g) { return g.id === from; });
      var gear = { id: id, teeth: teeth, ratio: -driver.ratio * driver.teeth / teeth,
        phase: meshPhase(driver, teeth, 0), shaft: shaft };
      gears.push(gear); meshes.push([from, id]); return gear;
    }
    if (s.mode === 'idler') { mesh('A', 'I', s.idler, 1); mesh('I', 'B', s.b, 2); }
    else {
      var b = mesh('A', 'B', s.b, 1);
      if (s.mode === 'compound') {
        gears.push({ id: 'C', teeth: s.c, ratio: b.ratio, phase: b.phase, shaft: 1 });
        shafts.push(['B', 'C']); mesh('C', 'D', s.d, 2);
      }
    }
    var output = gears[gears.length - 1], ratio = 1 / Math.abs(output.ratio);
    gears.forEach(function (g) { g.rpm = g.ratio * s.rpm * s.direction; });
    // One ordinary stage has one mesh. An idler adds a mesh, not a reduction
    // stage. This lab explicitly charges the stated loss at EVERY actual mesh.
    var totalEfficiency = Math.pow((s.efficiency === undefined ? 100 : s.efficiency) / 100, meshes.length);
    return { gears: gears, meshes: meshes, shafts: shafts, output: output, ratio: ratio,
      totalEfficiency: totalEfficiency,
      deliveredTorque: s.rpm === 0 ? null : s.torque * ratio * totalEfficiency,
      deliveredPower: s.torque * s.rpm * TAU / 60 * totalEfficiency,
      speedFactor: Math.abs(output.ratio), torqueFactor: ratio, outputTorque: s.torque * ratio,
      inputPower: s.torque * s.rpm * TAU / 60,
      outputPower: s.torque * ratio * Math.abs(output.rpm) * TAU / 60,
      relation: output.ratio < 0 ? 'opposite' : 'same',
      stages: s.mode === 'compound' ? [s.b / s.a, s.d / s.c] : [s.b / s.a] };
  }
  function rotations(solution, inputTurns) {
    if (!Number.isFinite(inputTurns)) throw new RangeError('Input turns must be finite');
    return solution.gears.map(function (g) {
      return { id: g.id, turns: inputTurns * g.ratio, angle: g.phase + inputTurns * g.ratio * TAU };
    });
  }
  function animationScale(solution) {
    var fastest = Math.max.apply(null, solution.gears.map(function (g) { return Math.abs(g.rpm); }));
    return fastest === 0 ? 1 : Math.min(1, 12 / fastest);
  }
  function advance(solution, turns, seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Elapsed seconds must be finite and nonnegative');
    if (!Number.isFinite(turns)) throw new RangeError('Input turns must be finite');
    return turns + solution.gears[0].rpm / 60 * animationScale(solution) * seconds;
  }
  function format(n, digits) { return Number(n.toFixed(digits === undefined ? 2 : digits)).toString(); }
  function direction(rpm) { return rpm === 0 ? 'stopped' : rpm > 0 ? 'CW' : 'CCW'; }
  return { DEFAULT: DEFAULT, MODES: MODES, TAU: TAU, validate: validate, solve: solve,
    meshPhase: meshPhase, rotations: rotations, animationScale: animationScale, advance: advance,
    format: format, direction: direction };
});

/* Pure symbolic cut-end-condition model.
   One rectangular cut starts on the top face of one flat plate and travels
   normal to that face through one selected body. This is not a CAD kernel.
   It models only the shared teaching distinction between a distance-controlled
   blind cut and a through-all cut. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.CadEndConditionsModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TYPES = ['blind', 'through-all'];
  var GOALS = ['through-cut', 'retained-pocket'];
  var acceptedStates = new WeakSet();

  function finitePositive(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0.01 && value <= 1000 &&
      Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
  }
  function plain(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function exactKeys(value, expected) {
    if (!plain(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function (key, index) { return key === wanted[index]; });
  }
  function freeze(value) {
    Object.keys(value).forEach(function (key) {
      if (value[key] && typeof value[key] === 'object' && !Object.isFrozen(value[key])) freeze(value[key]);
    });
    return Object.freeze(value);
  }
  function validate(parameters) {
    if (!exactKeys(parameters, ['plateThickness', 'endType', 'blindDepth', 'goal'])) {
      return 'Use one plate thickness, end type, blind depth, and goal.';
    }
    if (!finitePositive(parameters.plateThickness)) return 'Plate thickness must be 0.01 to 1000 mm with at most two decimal places.';
    if (!TYPES.includes(parameters.endType)) return 'Choose Blind or Through all.';
    if (!finitePositive(parameters.blindDepth)) return 'Blind depth must be 0.01 to 1000 mm with at most two decimal places.';
    if (!GOALS.includes(parameters.goal)) return 'Choose a through-cut or retained-pocket goal.';
    return '';
  }
  function solve(parameters) {
    var error = validate(parameters);
    if (error) return { ok: false, error: error };
    var thicknessCount = Math.round(parameters.plateThickness * 100);
    var blindCount = Math.round(parameters.blindDepth * 100);
    var removedCount = parameters.endType === 'blind' ? Math.min(blindCount, thicknessCount) : thicknessCount;
    var floorCount = Math.max(thicknessCount - removedCount, 0);
    var thickness = thicknessCount / 100;
    var blindDepth = blindCount / 100;
    var requested = parameters.endType === 'blind' ? blindDepth : null;
    var removedDepth = removedCount / 100;
    var floorThickness = floorCount / 100;
    var isOpen = floorCount === 0;
    var goalMet = parameters.goal === 'through-cut' ? isOpen : !isOpen;
    var accepted = freeze({
      ok: true,
      parameters: {
        plateThickness: thickness,
        endType: parameters.endType,
        blindDepth: blindDepth,
        goal: parameters.goal
      },
      result: {
        requestedDepth: requested,
        removedDepth: removedDepth,
        floorThickness: floorThickness,
        isOpen: isOpen,
        goalMet: goalMet
      }
    });
    acceptedStates.add(accepted);
    return accepted;
  }
  function initial(overrides) {
    var values = { plateThickness: 10, endType: 'blind', blindDepth: 12, goal: 'through-cut' };
    if (plain(overrides)) Object.keys(overrides).forEach(function (key) { values[key] = overrides[key]; });
    return solve(values);
  }
  function update(state, patch) {
    if (!state || !acceptedStates.has(state)) {
      return { ok: false, state: state || null, error: 'Start from a valid accepted state.' };
    }
    if (!plain(patch) || !Object.keys(patch).length || Object.keys(patch).some(function (key) {
      return !['plateThickness', 'endType', 'blindDepth', 'goal'].includes(key);
    })) return { ok: false, state: state, error: 'Change one or more declared experiment inputs.' };
    var next = {
      plateThickness: state.parameters.plateThickness,
      endType: state.parameters.endType,
      blindDepth: state.parameters.blindDepth,
      goal: state.parameters.goal
    };
    Object.keys(patch).forEach(function (key) { next[key] = patch[key]; });
    var solved = solve(next);
    return solved.ok ? solved : { ok: false, state: state, error: solved.error };
  }
  function formatMm(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '';
    return (Math.round(value * 100) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + ' mm';
  }

  return { types: TYPES.slice(), goals: GOALS.slice(), validate: validate, solve: solve, initial: initial, update: update, formatMm: formatMm };
});

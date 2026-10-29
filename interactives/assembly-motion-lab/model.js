/* Axis alignment is built in. This is a two-coordinate teaching joint, not a CAD solver. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AssemblyMotionModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var RANGE = 30;
  var goals = {
    hinge: { seat: true, lock: false, label: 'Hinge: spin, no slide' },
    slider: { seat: false, lock: true, label: 'Slider: slide, no spin' },
    fixed: { seat: true, lock: true, label: 'Fixed: no relative motion' }
  };
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function wrap(angle) {
    var remainder = angle % 360;
    var normalized = remainder < 0 ? remainder + 360 : remainder;
    // Addition near 360 can round up for a tiny negative remainder.
    return normalized >= 360 ? 0 : normalized || 0;
  }
  function valid(s) { return s && typeof s.seat === 'boolean' && typeof s.lock === 'boolean' && finite(s.z) && Math.abs(s.z) <= RANGE && finite(s.angle) && s.angle >= 0 && s.angle < 360 && (!s.seat || s.z === 0) && (!s.lock || s.angle === 0); }
  function defaults() { return { seat: false, lock: false, z: 12, angle: 35 }; }
  function freedoms(s) { return { slide: !s.seat, spin: !s.lock, dof: Number(!s.seat) + Number(!s.lock) }; }
  // Selecting a condition enforces its stated datum. Removing it preserves current placement.
  function conditions(s, seat, lock) {
    if (!valid(s) || typeof seat !== 'boolean' || typeof lock !== 'boolean') return { ok: false, state: s, reason: 'Invalid joint state or condition.' };
    return { ok: true, state: { seat: seat, lock: lock, z: seat ? 0 : s.z, angle: lock ? 0 : s.angle } };
  }
  function move(s, coordinate, value) {
    if (!valid(s) || !['z', 'angle'].includes(coordinate) || !finite(value)) return { ok: false, state: s, reason: 'Enter a finite coordinate; the last valid placement remains.' };
    if (coordinate === 'z' && Math.abs(value) > RANGE) return { ok: false, state: s, reason: 'Axial position must be within the declared lab range −30 to +30 mm.' };
    var blocked = coordinate === 'z' ? s.seat : s.lock;
    var next = Object.assign({}, s);
    if (!blocked) next[coordinate] = coordinate === 'angle' ? wrap(value) : value;
    return { ok: true, state: next, blocked: blocked, moved: next[coordinate] !== s[coordinate] };
  }
  function assess(s, goal) {
    if (!valid(s) || !Object.prototype.hasOwnProperty.call(goals, goal)) return { ok: false, matches: false, message: 'Choose a valid joint goal.' };
    var target = goals[goal], f = freedoms(s), matches = s.seat === target.seat && s.lock === target.lock;
    var message = matches ? 'Goal met. ' + target.label + '.' :
      goal === 'hinge' ? (s.lock ? 'The hinge cannot turn. Remove the angular lock to restore spin.' : 'The lever can slide off its axial location. Seat the shoulder at z = 0 while preserving spin.') :
      goal === 'slider' ? (s.seat ? 'The slider cannot travel. Remove the shoulder condition to restore slide.' : 'The slider can spin. Lock its angular orientation at θ = 0° while preserving slide.') :
      'The fixed goal needs both z = 0 and θ = 0°. Apply the missing locating condition.';
    return { ok: true, matches: matches, freedoms: f, message: message };
  }
  return { RANGE: RANGE, goals: goals, defaults: defaults, valid: valid, wrap: wrap, freedoms: freedoms, conditions: conditions, move: move, assess: assess };
});

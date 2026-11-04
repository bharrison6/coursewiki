(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiBacklash = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Rigid kinematic dead band for an axially fixed screw driving a non-rotating nut.
  // Units: millimetres for travel and clearance, degrees for screw rotation.
  // phi is the right-hand screw rotation about +X. For a right-hand thread the relative
  // helical phase is s = -L * phi / 360. The carriage position c is clamped to
  // [s - B/2, s + B/2]; inside that band friction holds the carriage still.
  // The screw never translates: only its rotation, and therefore its helical phase, changes.
  var DIVISIONS = 100;               // dial graduations per handwheel turn (illustrative dial)
  var LEADS = Object.freeze([2, 5]); // mm per revolution offered by the lab
  var CLEARANCES = Object.freeze([0.05, 0.2, 1.0]); // total axial clearance offered, mm
  var GEOMETRY = Object.freeze({ lead: 5, clearance: 1.0 }); // the 3D model's own built values
  var TRAVEL = Object.freeze({ min: -30, max: 50 }); // dial travel limits, mm (inside full nut engagement)
  var EPS = 1e-9;

  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function check(lead, clearance) {
    if (!finite(lead) || lead <= 0) throw new RangeError('Lead must be a positive number of millimetres per revolution.');
    if (!finite(clearance) || clearance <= 0) throw new RangeError('Clearance must be a positive number of millimetres.');
    if (clearance >= lead) throw new RangeError('Clearance must be smaller than the lead.');
  }
  // The contract rule, stated once: c = min(max(c, s - B/2), s + B/2).
  function clampToBand(c, s, B) {
    if (![c, s, B].every(finite) || B < 0) throw new RangeError('Carriage, phase and clearance must be finite numbers.');
    return Math.min(Math.max(c, s - B / 2), s + B / 2);
  }
  function deadBand(lead, clearance) {
    check(lead, clearance);
    return Object.freeze({ mm: clearance, degrees: 360 * clearance / lead, divisions: DIVISIONS * clearance / lead, divisionMm: lead / DIVISIONS });
  }
  // State is kept in handwheel divisions so whole-division moves land exactly on dial numbers.
  // The dial was zeroed after driving forward (+X), with the nut seated on the forward-drive flank:
  // reading d = s - B/2 at the zero, so for any later forward approach the carriage equals the reading.
  function create(options) {
    var o = Object.assign({ lead: 5, clearance: 1.0 }, options || {});
    check(o.lead, o.clearance);
    return Object.freeze({ lead: o.lead, clearance: o.clearance, turn: 0, carriage: 0, lastDirection: 1 });
  }
  function reading(state) { return state.turn * state.lead / DIVISIONS; }
  function phase(state) { return reading(state) + state.clearance / 2; }
  function screwDegrees(state) { return -360 * phase(state) / state.lead; }
  // Move the handwheel by n divisions; positive n drives the reading (and the carriage) toward +X.
  // A single monotonic move is exact: clamping at the end equals clamping at every intermediate phase.
  function turnBy(state, n) {
    if (!finite(n)) throw new RangeError('Turn by a finite number of divisions.');
    if (n === 0) return state;
    var lo = TRAVEL.min * DIVISIONS / state.lead, hi = TRAVEL.max * DIVISIONS / state.lead;
    var target = Math.min(hi, Math.max(lo, state.turn + n));
    if (target === state.turn) return state;
    var d = target * state.lead / DIVISIONS;
    // Lower edge of the band is the reading itself; upper edge is reading + B (s -/+ B/2).
    var c = Math.min(Math.max(state.carriage, d), d + state.clearance);
    return Object.freeze({ lead: state.lead, clearance: state.clearance, turn: target, carriage: c, lastDirection: target > state.turn ? 1 : -1 });
  }
  function atTravelLimit(state) {
    return state.turn <= TRAVEL.min * DIVISIONS / state.lead + EPS || state.turn >= TRAVEL.max * DIVISIONS / state.lead - EPS;
  }
  // Which flank carries the nut: 'forward' when the screw is pushing the carriage toward +X,
  // 'reverse' when pushing toward -X, 'free' while the carriage sits inside the clearance.
  function contact(state) {
    var u = state.carriage - phase(state), h = state.clearance / 2, tol = 1e-9 * Math.max(1, Math.abs(state.carriage));
    if (Math.abs(u + h) <= tol) return 'forward';
    if (Math.abs(u - h) <= tol) return 'reverse';
    return 'free';
  }
  function snapshot(state) {
    var d = reading(state);
    return Object.freeze({ reading: d, carriage: state.carriage, difference: state.carriage - d, phase: phase(state),
      screwDegrees: screwDegrees(state), contact: contact(state), offset: state.carriage - phase(state) });
  }
  // The 3D model is built with lead 5 mm and clearance 1.0 mm. It is coupled to the lab only at
  // exactly those settings, where its screw angle IS the handwheel angle and its carriage IS c.
  // No other settings are remapped onto it.
  function isReference(state) {
    return Math.abs(state.lead - GEOMETRY.lead) < EPS && Math.abs(state.clearance - GEOMETRY.clearance) < EPS;
  }
  function referencePose(state) {
    if (!isReference(state)) return null;
    return Object.freeze({ carriageMm: state.carriage, screwDegrees: screwDegrees(state) });
  }
  // Start a prediction from a known state: zeroed, then driven forward to the reading, so the nut is
  // seated on the forward flank whatever the learner did before.
  function seatedForward(options, readingMm) {
    var s = create(options);
    if (!finite(readingMm) || readingMm < 0) throw new RangeError('Seat at a reading of zero or more.');
    return turnBy(s, Math.round(readingMm * DIVISIONS / s.lead));
  }
  // Axial thread profile, the 3D model's illustrative 30-degree form scaled with the lead (the Blender
  // build_model.py rule): depth 0.4 L, radial clearance 0.05 L, tooth width at mid-depth (L - B) / 2.
  // Returns [phase mm, radius mm] corners for the screw and for the nut, period L.
  function threadProfile(lead, clearance) {
    check(lead, clearance);
    var k = lead / 5, L = lead, B = clearance, Rmaj = 10 * k, Rmin = 8 * k, h = Rmaj - Rmin, Rmid = (Rmaj + Rmin) / 2;
    var ta = Math.tan(15 * Math.PI / 180), wm = L / 2 - B / 2, c = L / 2, cr = 0.25 * k;
    if (wm - h * ta <= 0) throw new RangeError('Clearance too large for this thread form.');
    var screw = [[c - (wm + h * ta) / 2, Rmin], [c - (wm - h * ta) / 2, Rmaj], [c + (wm - h * ta) / 2, Rmaj], [c + (wm + h * ta) / 2, Rmin]];
    var Rc = Rmin + cr, Rr = Rmaj + cr, left = function (r) { return c + L / 2 - wm / 2 + (Rmid - r) * ta; }, m = c + L / 2;
    var mod = function (x) { return ((x % L) + L) % L; };
    var nut = [[mod(left(Rr)), Rr], [mod(left(Rc)), Rc], [mod(2 * m - left(Rc)), Rc], [mod(2 * m - left(Rr)), Rr]].sort(function (p, q) { return p[0] - q[0]; });
    return Object.freeze({ lead: L, clearance: B, screw: screw, nut: nut, rMin: Rmin, rMaj: Rmaj, rMid: Rmid, scale: k });
  }
  // Score a prediction of the dead band. Within half a dial division (1.8 degrees) is correct:
  // the dial cannot be read more finely than that, so a nearer whole-division answer is defensible.
  function scorePrediction(lead, clearance, value, unit) {
    var band = deadBand(lead, clearance);
    if (unit !== 'divisions' && unit !== 'degrees') throw new RangeError('Choose divisions or degrees.');
    if (!finite(value) || value < 0) throw new RangeError('Enter a prediction of zero or more.');
    var predictedDivisions = unit === 'degrees' ? value * DIVISIONS / 360 : value;
    var error = predictedDivisions - band.divisions;
    return Object.freeze({ band: band, predictedDivisions: predictedDivisions, errorDivisions: error, correct: Math.abs(error) <= 0.5 + EPS });
  }
  // Positioning attempt: compare the dial with the carriage once the dial shows the target.
  function attempt(state, target) {
    var d = reading(state);
    if (!finite(target)) throw new RangeError('Target must be a finite number.');
    return Object.freeze({ target: target, reading: d, carriage: state.carriage, error: state.carriage - target,
      onTarget: Math.abs(d - target) <= EPS, approach: state.lastDirection > 0 ? 'forward' : 'reverse' });
  }
  // The positioning exercise: target 25 mm, an overshoot larger than the clearance (so a straight
  // reversal really reaches the far flank), and a back-off point more than one clearance below the target.
  function positioningPlan(clearance) {
    if (!finite(clearance) || clearance <= 0) throw new RangeError('Clearance must be a positive number of millimetres.');
    return Object.freeze({ target: 25, overshoot: clearance < 0.6 ? 25.6 : 25.6 + clearance, backTo: 25 - Math.max(0.5, 2 * clearance) });
  }
  // Replay a list of handwheel moves (divisions) from a fresh zero; used for static figures and tests.
  function replay(options, moves) {
    var s = create(options), pts = [snapshot(s)];
    (moves || []).forEach(function (n) { s = turnBy(s, n); pts.push(snapshot(s)); });
    return { state: s, points: pts };
  }
  return Object.freeze({ DIVISIONS: DIVISIONS, LEADS: LEADS, CLEARANCES: CLEARANCES, GEOMETRY: GEOMETRY, TRAVEL: TRAVEL,
    clampToBand: clampToBand, deadBand: deadBand, create: create, reading: reading, phase: phase, screwDegrees: screwDegrees,
    turnBy: turnBy, atTravelLimit: atTravelLimit, contact: contact, snapshot: snapshot, isReference: isReference, referencePose: referencePose,
    seatedForward: seatedForward, threadProfile: threadProfile,
    scorePrediction: scorePrediction, attempt: attempt, positioningPlan: positioningPlan, replay: replay });
});

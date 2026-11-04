(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiEdgeFinderZero = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Pure geometric model. Every length is an integer number of micrometres (µm),
  // so sign and radius checks are exact; the interface formats them as mm.
  //
  // Frame: top view, positions are the spindle centre relative to the part.
  // +X points right, +Y points away from the operator (toward the back).
  // n is the outward normal of the edge along its axis: the side the spindle
  // approaches from. The trigger happens when the spindle centre is exactly
  // r (contact-tip radius) outside the edge, on the approach side:
  //   d = n · (P − E) = r   →   E = P − n·r
  // Left/front edges (n = −1, approached moving +): edge = reading + r.
  // Right/back edges (n = +1, approached moving −): edge = reading − r.
  var SIDES = Object.freeze({
    left: Object.freeze({ id: 'left', axis: 'x', n: -1, label: 'Left edge', move: '+X' }),
    right: Object.freeze({ id: 'right', axis: 'x', n: 1, label: 'Right edge', move: '−X' }),
    front: Object.freeze({ id: 'front', axis: 'y', n: -1, label: 'Front edge', move: '+Y' }),
    back: Object.freeze({ id: 'back', axis: 'y', n: 1, label: 'Back edge', move: '−Y' })
  });
  // Contact diameters. 10 mm matches the page's worked example; 6 mm and
  // 0.200 in are published contact diameters of one maker's mechanical edge
  // finders (Starrett 827MB and 827A product pages). The radius used is half the
  // CONTACT diameter, not the body diameter.
  var TIPS = Object.freeze({
    d10: Object.freeze({ id: 'd10', diameter: 10000, label: '10 mm contact (page example)' }),
    d6: Object.freeze({ id: 'd6', diameter: 6000, label: '6 mm contact' }),
    d5080: Object.freeze({ id: 'd5080', diameter: 5080, label: '0.200 in (5.080 mm) contact' })
  });
  // Illustrative 100 × 60 mm block, located in the readout's arbitrary starting frame.
  var PART = Object.freeze({ x0: 37460, x1: 137460, y0: 12840, y1: 72840 });
  var HOLE_INSET = 20000;      // drawing: check hole 20.000 mm inside the datum edge
  var START_GAP = 7370;        // first position: 7.370 mm beyond the trigger point
  var AWAY_LIMIT = 10000;      // may back off up to 10 mm further than the start
  var ECCENTRIC = 500;         // illustrative free-running tip offset, 0.5 mm
  var KICK = 1000;             // illustrative sideways throw after the trigger, 1 mm
  var STEPS = Object.freeze([1000, 100, 10]);
  var SETTING_LIMIT = 50000;   // the readout entry accepts −50.000 … +50.000 mm

  function int(v, key) {
    if (typeof v !== 'number' || !Number.isInteger(v)) throw new RangeError(key + ' must be a whole number of micrometres');
    return v;
  }
  function z(v) { return v === 0 ? 0 : v; }   // never report −0
  function side(id) {
    if (!Object.prototype.hasOwnProperty.call(SIDES, id)) throw new RangeError('Choose the left, right, front or back edge');
    return SIDES[id];
  }
  function tip(id) {
    if (!Object.prototype.hasOwnProperty.call(TIPS, id)) throw new RangeError('Choose a listed contact diameter');
    return TIPS[id];
  }
  function radiusOf(r) { int(r, 'Tip radius'); if (r <= 0 || r > 10000) throw new RangeError('Tip radius must be from 1 µm to 10 mm'); return r; }
  // Edge coordinate in the starting frame. A custom part may be supplied for checks.
  function edge(sideId, part) {
    var s = side(sideId), p = part || PART;
    if (s.axis === 'x') return s.n < 0 ? p.x0 : p.x1;
    return s.n < 0 ? p.y0 : p.y1;
  }
  function middle(axis, part) { var p = part || PART; return axis === 'x' ? (p.x0 + p.x1) / 2 : (p.y0 + p.y1) / 2; }
  function other(axis) { return axis === 'x' ? 'y' : 'x'; }

  // The rule the learner applies: edge = reading − n·r.
  function edgeFromReading(sideId, reading, r) { return int(reading, 'Reading') - side(sideId).n * radiusOf(r); }
  // Readout at the exact trigger in a frame whose zero is the true edge.
  function triggerReading(sideId, edgeAt, r) { return int(edgeAt, 'Edge') + side(sideId).n * radiusOf(r); }
  // What to set the readout to at the trigger so the edge itself reads zero.
  function correctSetting(sideId, r) { return side(sideId).n * radiusOf(r); }
  // Drawing coordinate of the check hole in the datum frame (inside the part).
  function holeTarget(sideId) { return -side(sideId).n * HOLE_INSET; }

  function create(sideId, tipId) {
    var s = side(sideId), t = tip(tipId), r = t.diameter / 2;
    var pos = { x: middle('x'), y: middle('y') };
    pos[s.axis] = edge(sideId) + s.n * (r + START_GAP);
    return Object.freeze({ side: s.id, tip: t.id, r: r, pos: Object.freeze(pos), frame: Object.freeze({ x: 0, y: 0 }), setting: null, holes: Object.freeze([]) });
  }
  function validate(st) {
    if (!st || typeof st !== 'object') throw new RangeError('State is missing');
    var s = side(st.side), t = tip(st.tip);
    if (st.r !== t.diameter / 2) throw new RangeError('Tip radius must match the chosen contact');
    int(st.pos.x, 'Position X'); int(st.pos.y, 'Position Y'); int(st.frame.x, 'Frame X'); int(st.frame.y, 'Frame Y');
    var d = distance(st, true);
    if (d > st.r + START_GAP + AWAY_LIMIT) throw new RangeError('Position is outside the modelled approach');
    if (st.pos[other(s.axis)] !== middle(other(s.axis))) throw new RangeError('This lesson moves along one axis only');
    return st;
  }
  function distance(st, raw) { if (!raw) validate(st); var s = SIDES[st.side]; return s.n * (st.pos[s.axis] - edge(st.side)); }
  function contact(st) {
    var d = distance(st), r = st.r, gap = d - r;
    if (gap <= 0) return Object.freeze({ phase: 'kick', d: d, gap: gap, eccentricity: 0, overshoot: gap === 0 ? 0 : -gap });
    if (gap < ECCENTRIC) return Object.freeze({ phase: 'centring', d: d, gap: gap, eccentricity: gap, overshoot: 0 });
    return Object.freeze({ phase: 'free', d: d, gap: gap, eccentricity: ECCENTRIC, overshoot: 0 });
  }
  function readings(st) { validate(st); return Object.freeze({ x: st.pos.x + st.frame.x, y: st.pos.y + st.frame.y }); }
  function with_(st, patch) { return validate(Object.freeze(Object.assign({}, st, patch))); }
  // direction +1 moves toward the edge, −1 backs away.
  function jog(st, direction, step) {
    validate(st);
    if (direction !== 1 && direction !== -1) throw new RangeError('Jog direction must be toward (+1) or away (−1)');
    if (STEPS.indexOf(step) < 0) throw new RangeError('Choose a 1, 0.1 or 0.01 mm step');
    var s = SIDES[st.side], c = contact(st);
    if (direction === 1 && c.phase === 'kick') throw new RangeError('The tip has already kicked. Feeding further only drags it; back away and re-approach');
    if (direction === -1 && c.d + step > st.r + START_GAP + AWAY_LIMIT) throw new RangeError('That is far enough away for this approach');
    var pos = Object.assign({}, st.pos);
    pos[s.axis] = st.pos[s.axis] - s.n * direction * step;
    return with_(st, { pos: Object.freeze(pos) });
  }
  // Move to a known gap beyond the trigger (used by static figures and checks).
  function atGap(st, gap) {
    int(gap, 'Gap'); var s = SIDES[validate(st).side], pos = Object.assign({}, st.pos);
    pos[s.axis] = edge(st.side) + s.n * (st.r + gap);
    return with_(st, { pos: Object.freeze(pos) });
  }
  function parseMillimetres(text) {
    var t = String(text == null ? '' : text).trim().replace(/[−–]/g, '-');
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) throw new RangeError('Enter a number in millimetres, such as -5 or 2.54');
    var um = Math.round(Number(t) * 1000);
    if (Math.abs(Number(t) * 1000 - um) > 1e-6) throw new RangeError('The readout resolves 0.001 mm; use at most three decimal places');
    if (Math.abs(um) > SETTING_LIMIT) throw new RangeError('Enter a value from −50.000 to +50.000 mm');
    return um === 0 ? 0 : um;
  }
  // Set the readout on the axis being found so the current position reads `value`.
  function setReadout(st, value) {
    validate(st); int(value, 'Setting');
    if (Math.abs(value) > SETTING_LIMIT) throw new RangeError('Enter a value from −50.000 to +50.000 mm');
    var c = contact(st);
    if (c.phase !== 'kick') throw new RangeError('Find the edge first: set the readout only at the kick');
    var s = SIDES[st.side], frame = Object.assign({}, st.frame);
    frame[s.axis] = value - st.pos[s.axis];
    return with_(st, { frame: Object.freeze(frame), setting: Object.freeze({ value: value, at: st.pos[s.axis], overshoot: c.overshoot }) });
  }
  // Where the check hole lands when the readout frame offset is `frameAxis`.
  function holeFor(sideId, frameAxis, target) {
    var s = side(sideId), E = edge(sideId), H = target === undefined ? holeTarget(sideId) : target;
    var at = H - frameAxis;                       // machine moves until reading = H
    var fromEdge = z(-s.n * (at - E));            // inward distance from the datum edge
    // Where the readout's zero actually lies: the position reading 0 is −frameAxis.
    // Positive = outside the part on the approach side; negative = inside the part.
    var zeroOutside = z(s.n * (-frameAxis - E));
    return Object.freeze({ at: at, fromEdge: fromEdge, error: z(at - (E + H)), inwardError: z(fromEdge - (-s.n * H)), zeroOutside: zeroOutside });
  }
  function drill(st, label) {
    validate(st);
    if (!st.setting) throw new RangeError('Set the readout before drilling the check hole');
    var s = SIDES[st.side], h = holeFor(st.side, st.frame[s.axis]);
    var hole = Object.freeze(Object.assign({ label: label || 'Your hole', setting: st.setting.value, overshoot: st.setting.overshoot, kind: 'yours' }, h));
    return with_(st, { holes: Object.freeze(st.holes.concat([hole])) });
  }
  // A what-if hole: the same trigger position, a different setting. State is unchanged.
  function whatIf(st, kind) {
    validate(st);
    var c = contact(st);
    if (c.phase !== 'kick') throw new RangeError('Reach the kick first; a mistake needs a trigger reading to act on');
    var s = SIDES[st.side], right = correctSetting(st.side, st.r);
    var value = kind === 'forgot' ? 0 : kind === 'sign' ? -right : kind === 'correct' ? right : null;
    if (value === null) throw new RangeError('Unknown mistake');
    var h = holeFor(st.side, value - st.pos[s.axis]);
    return Object.freeze(Object.assign({ label: kind === 'forgot' ? 'Radius forgotten' : kind === 'sign' ? 'Wrong sign' : 'Correct setting', setting: value, overshoot: c.overshoot, kind: kind }, h));
  }
  // Illustrative tip motion for drawing. u is toward the part (µm), v along the edge.
  // The tip never crosses the part face: u + r ≤ d in every phase.
  function tipOffset(c, theta) {
    if (!Number.isFinite(theta)) throw new RangeError('Angle must be finite');
    if (c.phase === 'kick') return { u: c.gap - 150 - 150 * Math.cos(theta), v: KICK * (0.8 + 0.2 * Math.sin(theta)) };
    return { u: c.eccentricity * Math.cos(theta), v: c.eccentricity * Math.sin(theta) };
  }
  function classify(hole, r) {
    var e = Math.abs(hole.error);
    if (e === 0) return 'exact';
    if (e === r) return 'radius';
    if (e === 2 * r) return 'double';
    return 'other';
  }

  // ---- Stage 2: tool length (Z) -----------------------------------------------
  // Z is positive upward. The part's top surface is Z = 0. The readout follows the
  // spindle and was set to read the REFERENCE tool's tip height. A tool touched
  // onto a gauge of thickness g has its tip at Z = g, so
  //   reading at touch-off = Z_surface + g + (L_tool − L_ref)
  //   tool length value    = L_tool − L_ref  (relative to the reference tool)
  // With a value applied, tip Z = reading − value. Lengths are gauge line to tip.
  var TOOLS = Object.freeze({
    t1: Object.freeze({ id: 't1', label: 'T1 · 10 mm end mill (reference)', short: 'T1', length: 82000 }),
    t2: Object.freeze({ id: 't2', label: 'T2 · 6 mm drill', short: 'T2', length: 109500 })
  });
  var GAUGES = Object.freeze({ g0: 0, g10: 10000 });
  function tool(id) { if (!Object.prototype.hasOwnProperty.call(TOOLS, id)) throw new RangeError('Choose T1 or T2'); return TOOLS[id]; }
  function gauge(g) { int(g, 'Gauge thickness'); if (g !== 0 && g !== 10000) throw new RangeError('Gauge must be ideal contact (0 mm) or the 10.000 mm block'); return g; }
  function lengthValue(id) { return tool(id).length - TOOLS.t1.length; }
  function touchReading(id, g, surfaceZ) { var z = surfaceZ === undefined ? 0 : int(surfaceZ, 'Surface Z'); return z + gauge(g) + lengthValue(id); }
  function tipZ(reading, value) { return int(reading, 'Reading') - int(value, 'Length value'); }

  function mm(um) { var v = um / 1000; return (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3); }
  function signedMm(um) { return um > 0 ? '+' + mm(um) : um < 0 ? '−' + mm(-um) : mm(0); }

  return Object.freeze({
    SIDES: SIDES, TIPS: TIPS, PART: PART, HOLE_INSET: HOLE_INSET, START_GAP: START_GAP, ECCENTRIC: ECCENTRIC, KICK: KICK, STEPS: STEPS,
    TOOLS: TOOLS, GAUGES: GAUGES,
    side: side, tip: tip, edge: edge, middle: middle, edgeFromReading: edgeFromReading, triggerReading: triggerReading,
    correctSetting: correctSetting, holeTarget: holeTarget, create: create, validate: validate, distance: distance, contact: contact,
    readings: readings, jog: jog, atGap: atGap, parseMillimetres: parseMillimetres, setReadout: setReadout, holeFor: holeFor,
    drill: drill, whatIf: whatIf, tipOffset: tipOffset, classify: classify,
    lengthValue: lengthValue, touchReading: touchReading, tipZ: tipZ, mm: mm, signedMm: signedMm
  });
});

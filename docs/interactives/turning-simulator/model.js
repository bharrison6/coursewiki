/* ============================================================================
   turning-simulator / model.js - the lathe the simulator runs on. No DOM.

   Every number the simulator shows comes from here, and every function is
   deterministic so the focused Node tests can drive whole parts through it.

   COORDINATES. Inches. Z runs along the spindle axis: Z0 is where the
   drawing's finished front face belongs, plus is toward the tailstock, minus
   is toward the chuck. X is a DIAMETER, the way many lathe readouts are set:
   X 0.750 means the tool's reference point would cut a 0.750 in diameter.
   Internally the model works in radius, r = X / 2.

   THE WORK is a solid of revolution, so one half-profile describes it. The
   profile is cut into columns 0.001 in long. Each column holds one ring of
   metal between an inner radius ri (0 when solid) and an outer radius ro.
   Thread grooves are sampled at one angular phase, with separate surviving
   outer-crest and inner-minor envelopes. A root notch in that one section is
   not an annular hole. Separation requires a kerf through those envelopes;
   only then does the portion on the tailstock side fall away.

   A TOOL is described in the same section plane, relative to its reference
   point. Every tool the simulator ships keeps one interval per column:
     outside tools  occupy r >= tip + edge(dz)  (the shank runs away from the
                    axis, so nothing of the work can sit above the edge)
     inside tools   occupy r <= tip - edge(dz) at the head, with a round bar
                    under it that has to fit inside the hole
     axial tools    (tailstock) occupy r <= radius(dz) on the centerline
   The rougher's leading edge is angled, the facing blade has square sides,
   and V flanks rise at 30 degrees. The drawn profile is the cutting and
   collision profile. These are the particular tools provided by this lab.

   THE MECHANISMS are deliberately different, not one eraser:
     cut     metal inside the cutting window is removed; metal that would
             touch the holder, the bar, a blade side or the jaws stops the
             move; so does more engaged edge than the tool takes in a pass.
     thread  a pass is synchronised with the spindle: the tool sweeps the
             length once and the section plane sees one notch per pitch, at a
             phase that stays locked from pass to pass.
     form    a knurl displaces metal: the roots sink and the crests rise by
             the same amount, so the knurled diameter grows and nothing is
             removed.
     drill   tailstock tools only move along the axis.

   The tool limits (depth per pass, infeed per threading pass, knurl depth,
   minimum bores) and the part tolerances are made-up teaching values sized
   for these four parts. They are not tool-maker data and not a standard.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  else { root.CourseWikiTurning = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COL = 0.001;      // column length along Z
  var STEP = 0.0005;    // sub-step along a move
  var WINDOW = 0.020;   // travel the engagement estimate averages over
  var SLACK = 1.05;     // the column grid aliases the estimate by a few percent
  var EPS = 1e-9;
  var MINUS = '−';
  var SQ3 = Math.sqrt(3);
  var TAN10 = Math.tan(10 * Math.PI / 180);
  var TAN30 = Math.tan(30 * Math.PI / 180);
  var TAN59 = Math.tan(59 * Math.PI / 180);
  var SAWN = 0.02;      // axial depth of the uneven sawn end
  var MTOL = 0.00005;   // inspection tolerance: half the last digit any readout shows

  /* ---- tool edge shapes ----------------------------------------------------*/
  /* An insert corner with a vertical leading edge at dz = 0, a nose radius, and
     a trailing edge rising at `slope` toward +dz. The reference point is the
     imaginary tip where the lines through the nose's leftmost and lowest
     points meet, so the readout is the diameter and face the tool cuts. */
  function insertEdge(nose, slope) {
    var s = Math.atan(slope);
    var tz = nose * (1 + Math.sin(s));
    var tr = nose * (1 - Math.cos(s));
    return function (dz) {
      if (dz < 0) { return Infinity; }
      // A land 0.0012 in long at the lowest point, so a turned diameter is exactly
      // the readout wherever the column grid happens to fall under the nose.
      if (Math.abs(dz - nose) <= 0.0006) { return 0; }
      if (dz <= tz) { var u = dz - nose; return nose - Math.sqrt(Math.max(0, nose * nose - u * u)); }
      return tr + (dz - tz) * slope;
    };
  }
  /* A 60 degree V with a small flat at the tip. Flanks rise at 30 degrees from
     the radial direction: up 1 for every tan 30 across. */
  function vEdge(flat) {
    var h = flat / 2;
    return function (dz) { var a = Math.abs(dz); return a <= h ? 0 : (a - h) * SQ3; };
  }

  /* Rounded roughing nose, with 10 degrees of lead on the leading flank.
     Its reference is the nose's lowest point. The edge ahead of that point
     leaves an angled shoulder; a radial facing cut finishes the allowance. */
  function roughEdge(dz) {
    var nose = 0.008, slope = dz < 0 ? 1 / TAN10 : TAN10;
    var a = Math.atan(slope), tangent = nose * Math.sin(a), q = Math.abs(dz);
    if (q <= 0.0006) { return 0; }
    if (q <= tangent) { return nose - Math.sqrt(Math.max(0, nose * nose - q * q)); }
    return nose * (1 - Math.cos(a)) + (q - tangent) * slope;
  }
  var boreInsert = insertEdge(0.008, TAN10);
  var threadV = vEdge(0.004);

  var DRILLS = [
    { id: '0.2500', d: 0.2500, label: '1/4 in (0.250)' },
    { id: '0.4219', d: 0.421875, label: '27/64 in (0.422)' },
    { id: '0.5000', d: 0.5000, label: '1/2 in (0.500)' }
  ];
  var PITCHES = [13, 16, 20];

  var TOOLS = {
    turn: {
      id: 'turn', name: 'Turning tool', mount: 'post', side: 'out', action: 'cut',
      span: [-0.04, 0.75], cut: { from: -0.04, to: 0.30, depth: 0.20 }, maxEngage: 0.100,
      edge: function (dz) {
        if (dz < -0.04 || dz > 0.75) { return Infinity; }
        if (dz <= 0.30) { return roughEdge(dz); }
        return 0.06;
      },
      does: 'This roughing tool has a 10° lead and a 0.008 in nose radius. Its edge cuts ahead of the readout point. For the stepped pin, stop 0.040 in short and face the allowance. Deeper shoulders need more clearance as the diameter decreases.',
      cannot: 'An axial stop leaves an angled shoulder, not a finished face. Takes at most 0.100 in of edge in one pass. Other real turning tools and settings can both turn and face.'
    },
    face: {
      id: 'face', name: 'Facing tool', mount: 'post', side: 'out', action: 'cut', radialOnly: true,
      width: 0.0625, reach: 0.75,
      span: [0, 0.30], cut: { from: 0, to: 0.0625, depth: 0.012 }, maxEngage: 0.065,
      edge: function (dz) {
        if (dz < 0 || dz > 0.30) { return Infinity; }
        return dz <= 0.0625 ? 0 : 0.75;
      },
      does: 'A narrow square finishing blade, 1/16 in wide, set for radial feed. Put its left corner at the finished face or shoulder Z, then feed X across the remaining metal. The cut, not merely selecting this tool, makes the face flat.',
      cannot: 'Faces axial slices up to its 0.0625 in width; take more than one slice for a larger allowance. Retract clear before moving Z: this blade has no side-cutting clearance.'
    },
    chamfer: {
      id: 'chamfer', name: 'Chamfer tool', mount: 'post', side: 'out', action: 'cut',
      span: [-0.30, 0.30], cut: { from: -0.15, to: 0.15, depth: 0.15 }, maxEngage: 0.100,
      edge: function (dz) {
        var a = Math.abs(dz);
        if (a > 0.30) { return Infinity; }
        return a <= 0.15 ? a : 0.15;
      },
      does: 'A 90 degree point: plunge it at an edge and each side cuts a 45 degree chamfer. Plunged where a part will be cut off, it chamfers the back edge before parting.',
      cannot: 'Only reaches outside edges. A chamfer at the mouth of a hole needs the countersink in the tailstock.'
    },
    groove: {
      id: 'groove', name: 'Grooving and parting blade', mount: 'post', side: 'out', action: 'cut',
      width: 0.125, reach: 0.70, radialOnly: true,
      span: [-0.125, 0.30], cut: { from: -0.125, to: 0, depth: 0.012 }, maxEngage: 0.13,
      edge: function (dz) {
        if (dz < -0.125 || dz > 0.30) { return Infinity; }
        return dz <= 0 ? 0 : 0.70;
      },
      does: 'A blade 0.125 in wide that cuts only on its front edge. Plunge it straight in for a groove, or all the way to the center (or the hole) to part the work off. Its readout point is the right-hand corner, the side that faces your part.',
      cannot: 'Has no side clearance: once it is in a cut it only moves straight in or straight out. Widen a groove with a second plunge.'
    },
    thread: {
      id: 'thread', name: 'Threading tool (outside)', mount: 'post', side: 'out', action: 'thread',
      span: [-0.0366, 0.40], cut: { from: -0.0366, to: 0.0366, depth: 0.06 }, maxEngage: 0.02, maxInfeed: 0.015,
      edge: function (dz) {
        if (dz < -0.0366 || dz > 0.40) { return Infinity; }
        if (dz <= 0.0366) { return threadV(dz); }
        return 0.06;
      },
      does: 'A 60 degree form tool. A threading pass drives the carriage from the leadscrew, one pitch per turn of the work, so every pass follows the same helix. Feed it in a little before each pass.',
      cannot: 'Takes at most 0.015 in of infeed per pass. Needs somewhere to stop at the end of a pass, such as a relief groove, and must be backed out before the carriage returns.'
    },
    knurl: {
      id: 'knurl', name: 'Knurling tool', mount: 'post', side: 'out', action: 'form',
      wheelHalf: 0.1875, wheelChamfer: 0.03, penFull: 0.010, pitch: 0.042,
      span: [-0.30, 0.30], cut: { from: -0.1875, to: 0.1875, depth: 0.25 },
      edge: function (dz) {
        var a = Math.abs(dz);
        if (a > 0.30) { return Infinity; }
        if (a <= 0.1875 - 0.03) { return 0; }
        if (a <= 0.1875) { return a - (0.1875 - 0.03); }
        return 0.25;
      },
      does: 'A pair of opposed, beveled forming wheels, one left-hand and one right-hand, rolls a diamond pattern. Their axles are parallel to Z. Here X controls the simulated wheel gap, not a literal carriage coordinate; close the gap to form, then feed Z along the work.',
      cannot: 'This is form knurling: no chips. A full knurl here depresses the roots 0.010 in and raises the crests 0.010 in radially, adding 0.020 in to the blank diameter. Growth is a teaching approximation; real knurl growth depends on the material and wheels.'
    },
    bore: {
      id: 'bore', name: 'Boring bar', mount: 'post', side: 'in', action: 'cut',
      head: [0, 0.12], cut: { depth: 0.06 }, bar: { from: -0.02, to: 1.6, top: 0.075, dia: 0.375 }, holder: 0.6,
      maxEngage: 0.040,
      edge: function (dz) { return (dz < 0 || dz > 0.12) ? Infinity : boreInsert(dz); },
      does: 'Turns the inside of an existing hole bigger, feeding toward the chuck, the way the turning tool works on the outside.',
      cannot: 'Needs a hole at least 0.450 in across before its bar fits inside. Takes at most 0.040 in per side in one pass: a long thin bar bends.'
    },
    ithread: {
      id: 'ithread', name: 'Threading bar (inside)', mount: 'post', side: 'in', action: 'thread',
      head: [-0.0309, 0.0309], cut: { depth: 0.05 }, bar: { from: -0.04, to: 1.2, top: 0.06, dia: 0.31 }, holder: 0.6,
      maxEngage: 0.015, maxInfeed: 0.012,
      edge: function (dz) { return Math.abs(dz) > 0.0309 ? Infinity : threadV(dz); },
      does: 'A 60 degree form tool on a bar, for threads inside a hole. Passes run from outside the part toward the chuck, synchronised with the spindle.',
      cannot: 'Needs a hole at least 0.370 in across. Takes at most 0.012 in of infeed per pass.'
    },
    center: {
      id: 'center', name: 'Center drill', mount: 'tailstock', side: 'axial', action: 'cut',
      cutTo: 0.2318, bodyTo: 1.6, bodyR: 0.125,
      radius: function (dz) {
        if (dz < 0) { return -Infinity; }
        if (dz <= 0.0328) { return dz * TAN59; }
        if (dz <= 0.11) { return 0.0545; }
        if (dz <= 0.2318) { return 0.0545 + (dz - 0.11) * TAN30; }
        return 0.125;
      },
      does: 'A combined drill and countersink with a small pilot and a 60 degree cone, used to make a seat for a lathe center. Its shape is different from a spotting drill.',
      cannot: 'Only drills as deep as its cone. For starting a twist drill, choose the starting method and spot angle recommended for that drill; this center drill is not a universal first step.'
    },
    drill: {
      id: 'drill', name: 'Twist drill', mount: 'tailstock', side: 'axial', action: 'cut',
      flute: 2.5, bodyTo: 3.5, peck: 3,
      radiusFor: function (d) {
        return function (dz) {
          if (dz < 0) { return -Infinity; }
          if (dz <= 2.5) { return Math.min(dz * TAN59, d / 2); }
          return 0.5;
        };
      },
      does: 'Drills a hole on the centerline from the tailstock, with a 118 degree point.',
      cannot: 'Only moves along the axis. Back it out to clear chips at least every three diameters of depth.'
    },
    csink: {
      id: 'csink', name: 'Countersink', mount: 'tailstock', side: 'axial', action: 'cut',
      cutTo: 0.375, bodyTo: 1.5, bodyR: 0.375,
      radius: function (dz) {
        if (dz < 0) { return -Infinity; }
        return dz <= 0.375 ? dz : 0.375;
      },
      does: 'A 90 degree cone in the tailstock: it chamfers the mouth of a hole.',
      cannot: 'Only chamfers up to 0.750 in across, and only at the mouth of a hole on the centerline.'
    }
  };
  var TOOL_ORDER = ['turn', 'face', 'chamfer', 'groove', 'thread', 'knurl', 'bore', 'ithread', 'center', 'drill', 'csink'];

  /* Inside tools: the bar has to fit. Its top sits `top` below the tip and it
     is `dia` across, so the smallest hole it enters is dia + top. */
  function minBore(tool) { return tool.bar ? tool.bar.dia + tool.bar.top : 0; }

  /* ---- the parts ---------------------------------------------------------------
     Every dimension is a distance from the finished front face (s), the way a
     machinist measures it with calipers. Segments run from the front face
     back. `d` is nominal; `lo`/`hi` are deviations. */
  var TARGETS = [
    {
      id: 'stepped-pin', title: 'Stepped pin',
      summary: 'Two turned diameters, a chamfer on the end and a head left at bar size.',
      teaches: 'Facing, turning in passes, square shoulders, chamfering and parting off.',
      stock: { dia: 1.000, zEnd: 0.060, zJaw: -2.300 },
      length: { L: 1.500, tol: 0.005 },
      outside: [
        { kind: 'plain', from: 0, to: 0.625, d: 0.500, lo: -0.002, hi: 0.002, label: 'Pin' },
        { kind: 'plain', from: 0.625, to: 1.250, d: 0.750, lo: -0.002, hi: 0.002, label: 'Body' },
        { kind: 'plain', from: 1.250, to: 1.500, d: 1.000, lo: -0.005, hi: 0.002, label: 'Head', asBar: true }
      ],
      shoulders: [{ at: 0.625, tol: 0.005 }, { at: 1.250, tol: 0.005 }],
      inside: [],
      chamfers: [{ edge: 'front-od', c: 0.030, tol: 0.010 }]
    },
    {
      id: 'bushing', title: 'Bushing',
      summary: 'A turned sleeve with a through bore, two outside chamfers and a chamfer at the bore mouth.',
      teaches: 'Center drilling, drilling, boring, countersinking and chamfering a back edge before parting.',
      stock: { dia: 1.250, zEnd: 0.060, zJaw: -1.900 },
      length: { L: 1.000, tol: 0.005 },
      outside: [
        { kind: 'plain', from: 0, to: 1.000, d: 1.125, lo: -0.002, hi: 0.002, label: 'Outside' }
      ],
      shoulders: [],
      inside: [
        { kind: 'plain', from: 0, to: 1.000, d: 0.625, lo: 0, hi: 0.002, label: 'Bore', through: true }
      ],
      chamfers: [
        { edge: 'front-od', c: 0.030, tol: 0.010 },
        { edge: 'back-od', c: 0.030, tol: 0.010 },
        { edge: 'front-bore', c: 0.030, tol: 0.010 }
      ]
    },
    {
      id: 'thumb-screw', title: 'Thumb screw',
      summary: 'A knurled head, a thread relief groove and a 16-per-inch thread.',
      teaches: 'Knurling, grooving, external threading in passes, and why a thread needs somewhere to stop.',
      stock: { dia: 1.000, zEnd: 0.060, zJaw: -2.100 },
      length: { L: 1.250, tol: 0.005 },
      outside: [
        { kind: 'thread', from: 0, to: 0.625, d: 0.375, tpi: 16, crest: [0.370, 0.375], root: [0.296, 0.302], label: 'Thread' },
        { kind: 'groove', from: 0.625, to: 0.750, d: 0.290, lo: -0.005, hi: 0.005, label: 'Relief groove' },
        { kind: 'knurl', from: 0.750, to: 1.250, d: 0.880, crest: [0.875, 0.885], blank: 0.860, label: 'Knurled head' }
      ],
      shoulders: [{ at: 0.625, tol: 0.010 }, { at: 0.750, tol: 0.005 }],
      inside: [],
      chamfers: [{ edge: 'front-od', c: 0.030, tol: 0.010 }]
    },
    {
      id: 'knurled-nut', title: 'Knurled nut',
      summary: 'A knurled ring with a 13-per-inch thread inside it.',
      teaches: 'Drilling to the thread\'s inside size, internal threading and parting off a ring.',
      stock: { dia: 1.000, zEnd: 0.060, zJaw: -1.600 },
      length: { L: 0.500, tol: 0.005 },
      outside: [
        { kind: 'knurl', from: 0, to: 0.500, d: 0.880, crest: [0.875, 0.885], blank: 0.860, label: 'Knurled outside' }
      ],
      shoulders: [],
      inside: [
        { kind: 'thread', from: 0, to: 0.500, d: 0.500, tpi: 13, crest: [0.417, 0.434], root: [0.500, 0.506], label: 'Thread', through: true }
      ],
      chamfers: []
    }
  ];
  function target(id) {
    for (var i = 0; i < TARGETS.length; i++) { if (TARGETS[i].id === id) { return TARGETS[i]; } }
    throw new Error('unknown part: ' + id);
  }

  /* ---- formatting -----------------------------------------------------------*/
  function round(v, places) { var f = Math.pow(10, places); return Math.round(v * f) / f; }
  function fmt(v, places) {
    var p = places == null ? 3 : places;
    var r = round(v, p);
    if (Math.abs(r) < Math.pow(10, -p) / 2) { r = 0; }
    var s = Math.abs(r).toFixed(p);
    return (r < 0 ? MINUS : '') + s;
  }
  function fmtSigned(v, places) { var s = fmt(v, places); return (round(v, places == null ? 3 : places) > 0 ? '+' : '') + s; }
  function inch(v, places) { return fmt(v, places) + ' in'; }
  function dia(v, places) { return 'Ø' + fmt(v, places); }

  /* ---- the work -------------------------------------------------------------*/
  function Piece(zL, n) {
    this.zL = zL; this.n = n;
    this.ro = new Float64Array(n); this.ri = new Float64Array(n);
    this.kB = new Float64Array(n); this.kP = new Float64Array(n);
    this.thO = new Float64Array(n); this.thI = new Float64Array(n);
    this.thBaseO = new Float64Array(n); this.thBaseI = new Float64Array(n);
  }
  function zc(p, i) { return p.zL + (i + 0.5) * COL; }
  function colAt(p, z) { return Math.floor((z - p.zL) / COL + 1e-9); }
  function outerEnvelope(p, i) { return p.thO[i] && p.thBaseO[i] > 0 ? p.thBaseO[i] : p.ro[i]; }
  function innerEnvelope(p, i) { return p.thI[i] && p.thBaseI[i] > 0 ? p.thBaseI[i] : p.ri[i]; }
  function has(p, i) { return outerEnvelope(p, i) > innerEnvelope(p, i) + EPS; }
  function clearColumn(p, i) {
    p.ro[i] = p.ri[i] = p.kB[i] = p.kP[i] = p.thO[i] = p.thI[i] = p.thBaseO[i] = p.thBaseI[i] = 0;
  }

  function parkFor(st, toolId) {
    var t = TOOLS[toolId], R = st.R;
    if (t.side === 'axial') { return { z: 0.600, r: 0 }; }
    if (t.side === 'in') { return { z: 0.700, r: round(t.bar.top + t.bar.dia / 2, 3) }; }
    return { z: 0.400, r: round(R + 0.150, 3) };
  }

  /* A fresh bar in the chuck. The end is sawn, so it is uneven and sits a
     little past Z0: facing it is the first job. */
  function create(targetId) {
    var T = target(targetId);
    var R = T.stock.dia / 2;
    var zL = T.stock.zJaw;
    var n = Math.round((T.stock.zEnd + 0.04 - zL) / COL);
    var p = new Piece(zL, n);
    for (var i = 0; i < n; i++) {
      var z = zc(p, i);
      var ro = 0;
      if (z <= T.stock.zEnd - SAWN) { ro = R; }
      else if (z <= T.stock.zEnd) {
        var f = (T.stock.zEnd - z) / SAWN;
        var jag = 0.06 * Math.sin(i * 2.399) * Math.sin(i * 0.731);
        ro = R * Math.max(0, Math.min(1, f + jag * (1 - f) * f * 4));
      }
      p.ro[i] = ro;
    }
    var st = {
      targetId: T.id, R: R, zJaw: zL, work: p,
      tool: 'turn', drill: '0.5000', tpi: 16,
      tz: 0, tr: 0, spindle: false,
      win: { a: [], l: [] }, peck: null, threadSeat: null,
      notes: { noCenter: false },
      part: null, parts: 0, version: 0
    };
    var park = parkFor(st, 'turn');
    st.tz = park.z; st.tr = park.r;
    return st;
  }

  function copyPiece(p) {
    var q = new Piece(p.zL, p.n);
    q.ro.set(p.ro); q.ri.set(p.ri); q.kB.set(p.kB); q.kP.set(p.kP); q.thO.set(p.thO); q.thI.set(p.thI);
    q.thBaseO.set(p.thBaseO); q.thBaseI.set(p.thBaseI);
    return q;
  }
  function snapshot(st) {
    return {
      work: copyPiece(st.work), part: st.part ? copyPiece(st.part) : null, parts: st.parts,
      tool: st.tool, drill: st.drill, tpi: st.tpi, tz: st.tz, tr: st.tr, spindle: st.spindle,
      peck: st.peck, threadSeat: st.threadSeat ? Object.assign({}, st.threadSeat) : null, notes: { noCenter: st.notes.noCenter }
    };
  }
  function restore(st, s) {
    st.work = copyPiece(s.work); st.part = s.part ? copyPiece(s.part) : null; st.parts = s.parts;
    st.tool = s.tool; st.drill = s.drill; st.tpi = s.tpi; st.tz = s.tz; st.tr = s.tr; st.spindle = s.spindle;
    st.peck = s.peck; st.threadSeat = s.threadSeat ? Object.assign({}, s.threadSeat) : null; st.notes = { noCenter: s.notes.noCenter };
    st.win = { a: [], l: [] };
    st.version++;
    return st;
  }

  function position(st) { return { z: round(st.tz, 4), x: round(st.tr * 2, 4) }; }

  /* ---- jaws and chuck --------------------------------------------------------*/
  var JAW_LEN = 0.55, JAW_UP = 0.32, BODY_UP = 1.1;
  function jawTop(st, z) {
    if (z >= st.zJaw) { return -Infinity; }
    return z >= st.zJaw - JAW_LEN ? st.R + JAW_UP : st.R + BODY_UP;
  }

  /* ---- one sub-step -----------------------------------------------------------
     Evaluate the tool at (z, r) against the work. With apply false nothing is
     written, so a step that would crash is refused before it changes anything.
     Column edges are sampled at the column's centre and both ends so a column
     the tool reaches into counts as reached. */
  function edgeCol(tool, dz) {
    var h = COL / 2 - 1e-6;
    return Math.min(tool.edge(dz - h), tool.edge(dz), tool.edge(dz + h));
  }
  function radiusCol(fn, dz) {
    var h = COL / 2 - 1e-6;
    return Math.max(fn(dz - h), fn(dz), fn(dz + h));
  }
  function axialRadius(st, tool) {
    return tool.id === 'drill' ? tool.radiusFor(drillSize(st)) : tool.radius;
  }
  function drillSize(st) {
    for (var i = 0; i < DRILLS.length; i++) { if (DRILLS[i].id === st.drill) { return DRILLS[i].d; } }
    return DRILLS[0].d;
  }
  function hasThreads(p) {
    for (var i = 0; i < p.n; i++) { if (p.thO[i] || p.thI[i]) { return true; } }
    return false;
  }
  function knurlContact(st) {
    if (st.tool !== 'knurl') { return false; }
    var p = st.work, t = TOOLS.knurl;
    var a = Math.max(0, colAt(p, st.tz + t.cut.from)), b = Math.min(p.n - 1, colAt(p, st.tz + t.cut.to));
    for (var i = a; i <= b; i++) {
      if (has(p, i) && st.tr + t.edge(zc(p, i) - st.tz) <= p.ro[i] + 0.0005) { return true; }
    }
    return false;
  }

  // Separation occurs when the modeled wall is cut through, not at a fixed
  // small core diameter. Burrs, elastic tearing and break-off are not modeled.
  function emptyAfter(p, i) { return !has(p, i); }

  function step(st, tool, z, r, apply, opts) {
    var p = st.work, out = { code: null, area: 0, formed: false, emptied: false, threadHit: false, info: null };
    var noCut = opts && opts.noCut;
    var i, i0, i1, dz, top;
    if (tool.side === 'out') {
      i0 = colAt(p, z + tool.span[0] - COL); i1 = colAt(p, z + tool.span[1] + COL);
      // jaws, left of the work array
      if (z + tool.span[0] < st.zJaw + COL) {
        for (var k = Math.floor((z + tool.span[0] - st.zJaw) / COL) - 1; k < 0; k++) {
          var zk = st.zJaw + (k + 0.5) * COL;
          dz = zk - z;
          var e0 = edgeCol(tool, dz);
          if (e0 !== Infinity && r + e0 < jawTop(st, zk) - EPS) { out.code = 'jaws'; return out; }
        }
      }
      for (i = Math.max(0, i0); i <= Math.min(p.n - 1, i1); i++) {
        if (!has(p, i)) { continue; }
        dz = zc(p, i) - z;
        var e = edgeCol(tool, dz);
        if (e === Infinity) { continue; }
        var b = r + e;
        // A later rotating cut also reaches crests between the fixed thread
        // section samples. Keep their current envelope, including chamfers.
        top = outerEnvelope(p, i);
        if (b >= top - EPS) { continue; }
        var inCut = dz >= tool.cut.from - COL / 2 && dz <= tool.cut.to + COL / 2;
        if (tool.action === 'form') {
          // the knurl wheels
          if (!inCut) { out.code = 'holder'; return out; }
          var blank = p.kB[i] > 0 ? p.kB[i] : p.ro[i];
          var pen = p.kB[i] > 0 ? p.kP[i] : 0;
          var crest = p.ro[i];
          var limit = p.kB[i] > 0 ? 2 * tool.penFull + 0.02 : tool.penFull + 0.02;
          if (crest - b > limit) { out.code = 'shoulder'; return out; }
          if (b < blank - pen - EPS) {
            var np = blank - b;
            if (np > tool.penFull + 0.00005) { out.code = 'fulldepth'; return out; }
            out.formed = true;
            if (apply) { p.kB[i] = blank; p.kP[i] = np; p.ro[i] = blank + np; }
          }
          continue;
        }
        if (!inCut) { out.code = 'holder'; return out; }
        if (top > r + tool.cut.depth + EPS) { out.code = tool.id === 'groove' ? 'side' : 'body'; return out; }
        if (noCut) { continue; }
        if (tool.action === 'thread' && p.thO[i] !== 0) { out.code = 'retract'; out.info = { side: 'out' }; return out; }
        var nt = Math.max(b, innerEnvelope(p, i));
        out.area += (top - nt) * COL;
        if (apply) {
          p.ro[i] = Math.min(p.ro[i], nt);
          if (p.thO[i]) { p.thBaseO[i] = Math.min(p.thBaseO[i], nt); }
          if (p.kB[i] > 0 && nt <= p.kB[i] - p.kP[i] + EPS) { p.kB[i] = 0; p.kP[i] = 0; }
          if (emptyAfter(p, i)) { clearColumn(p, i); out.emptied = true; }
        }
      }
      return out;
    }
    if (tool.side === 'in') {
      var bar = tool.bar, hd = tool.head;
      var lo = Math.min(hd[0], bar.from), hi = bar.to + tool.holder;
      if (z + lo < st.zJaw + COL) { out.code = 'chuck'; return out; }
      i0 = colAt(p, z + lo - COL); i1 = colAt(p, z + hi + COL);
      var barTop = r - bar.top, barBot = r - bar.top - bar.dia;
      for (i = Math.max(0, i0); i <= Math.min(p.n - 1, i1); i++) {
        if (!has(p, i)) { continue; }
        dz = zc(p, i) - z;
        var ri = innerEnvelope(p, i);
        if (dz > bar.to + COL / 2) { out.code = 'holder'; return out; }
        var inHead = dz >= hd[0] - COL / 2 && dz <= hd[1] + COL / 2;
        var inBar = dz >= bar.from - COL / 2;
        if ((inHead || inBar) && ri < 0.01) { out.code = 'nohole'; return out; }
        if (inBar && barBot < -ri - EPS) { out.code = 2 * ri < minBore(tool) - 1e-6 ? 'bar' : 'farwall'; return out; }
        if (inHead) {
          var eh = edgeCol(tool, dz);
          var tt = eh === Infinity ? barTop : r - eh;
          if (ri < tt - EPS) {
            if (ri < r - tool.cut.depth - EPS) { out.code = ri < 0.01 ? 'nohole' : 'body'; return out; }
            if (noCut) { continue; }
            if (tool.action === 'thread' && p.thI[i] !== 0) { out.code = 'retract'; out.info = { side: 'in' }; return out; }
            var nb = Math.min(tt, outerEnvelope(p, i));
            out.area += (nb - ri) * COL;
            if (apply) {
              p.ri[i] = Math.max(p.ri[i], nb);
              if (p.thI[i]) { p.thBaseI[i] = Math.max(p.thBaseI[i], nb); }
              if (emptyAfter(p, i)) { clearColumn(p, i); out.emptied = true; }
            }
          }
          continue;
        }
        if (inBar && ri < barTop - EPS) { out.code = ri < 0.01 ? 'nohole' : (dz < 0 ? 'bottom' : 'bar'); return out; }
      }
      return out;
    }
    // axial, on the centerline
    var rad = axialRadius(st, tool);
    var cutTo = tool.id === 'drill' ? tool.flute : tool.cutTo;
    if (z < st.zJaw + 0.05) { out.code = 'chuck'; return out; }
    i0 = colAt(p, z - COL); i1 = colAt(p, z + tool.bodyTo + COL);
    for (i = Math.max(0, i0); i <= Math.min(p.n - 1, i1); i++) {
      if (!has(p, i)) { continue; }
      dz = zc(p, i) - z;
      var rr = radiusCol(rad, dz);
      // Past the cutting part, a body as wide as the hole it made already rubs.
      if (dz > cutTo + COL / 2) {
        if (rr >= p.ri[i] - 1e-6) { out.code = tool.id === 'drill' ? 'chuck-body' : 'body'; return out; }
        continue;
      }
      var inner = innerEnvelope(p, i);
      if (rr <= inner + EPS) { continue; }
      if (noCut) { continue; }
      var nr = Math.min(rr, outerEnvelope(p, i));
      out.area += (nr - inner) * COL;
      if (apply) {
        p.ri[i] = Math.max(p.ri[i], nr);
        if (p.thI[i]) { p.thBaseI[i] = Math.max(p.thBaseI[i], nr); }
        if (emptyAfter(p, i)) { clearColumn(p, i); out.emptied = true; }
      }
    }
    return out;
  }

  /* ---- separation: a cut right through drops everything beyond it ------------*/
  function separate(st) {
    var p = st.work, i = 0;
    while (i < p.n && has(p, i)) { i++; }
    var j = i, maxR = 0, first = -1, last = -1;
    for (; j < p.n; j++) {
      if (has(p, j)) { if (first < 0) { first = j; } last = j; if (p.ro[j] > maxR) { maxR = p.ro[j]; } }
    }
    if (first < 0) { return null; }
    var keep = maxR >= 0.05 && (last - first + 1) * COL >= 0.02;
    var piece = null;
    if (keep) {
      piece = new Piece(p.zL, p.n);
      for (j = first; j <= last; j++) {
        piece.ro[j] = p.ro[j]; piece.ri[j] = p.ri[j]; piece.kB[j] = p.kB[j]; piece.kP[j] = p.kP[j];
        piece.thO[j] = p.thO[j]; piece.thI[j] = p.thI[j];
        piece.thBaseO[j] = p.thBaseO[j]; piece.thBaseI[j] = p.thBaseI[j];
      }
    }
    for (j = first; j <= last; j++) { p.ro[j] = 0; p.ri[j] = 0; p.kB[j] = 0; p.kP[j] = 0; p.thO[j] = 0; p.thI[j] = 0; p.thBaseO[j] = 0; p.thBaseI[j] = 0; }
    if (!keep) { return 'debris'; }
    st.part = piece; st.parts++;
    return 'part';
  }

  /* ---- engagement window --------------------------------------------------------*/
  function winPush(st, a, l) {
    var w = st.win; w.a.push(a); w.l.push(l);
    var L = 0; for (var k = 0; k < w.l.length; k++) { L += w.l[k]; }
    while (w.l.length > 1 && L - w.l[0] >= WINDOW) { L -= w.l.shift(); w.a.shift(); }
    var A = 0; for (k = 0; k < w.a.length; k++) { A += w.a[k]; }
    return A / Math.max(L, WINDOW);
  }
  function winPop(st) { st.win.a.pop(); st.win.l.pop(); }

  /* ---- explanations ----------------------------------------------------------------*/
  function explain(st, code, data) {
    var t = TOOLS[st.tool];
    switch (code) {
      case 'spindle': return 'The spindle is stopped. A tool pushed against still work only rubs and chips its edge: start the spindle before the tool touches the work.';
      case 'engage':
        if (t.id === 'groove') { return 'That plunge engages more than the blade\'s front edge.'; }
        return 'This cut would put ' + inch(data.engage || 0) + ' of the edge into the work at once. The ' + t.name.toLowerCase() + (t.maxEngage ? ' takes at most ' + inch(t.maxEngage) + ' in one pass' : ' cannot take that much at once') + ': back out and take it in more than one pass.';
      case 'body':
        if (t.side === 'axial') { return 'The ' + t.name.toLowerCase() + ' has gone as deep as its cutting part reaches; its body would rub the work.'; }
        if (t.side === 'in') { return 'That is deeper than the cutting edge reaches: the bar under the insert would hit the wall. Take a lighter pass.'; }
        return 'That is deeper than the cutting edge: the top of the insert would hit the work. Take a lighter pass.';
      case 'holder': return t.action === 'form'
        ? 'The knurling tool\'s holder would hit the work there.'
        : 'Only the cutting edge can touch the work. Another part of the ' + t.name.toLowerCase() + ' would hit it there.';
      case 'side': return 'The side of the blade would be pushed into the wall of the groove. A blade cuts only on its front edge: back it straight out, move over, and plunge again.';
      case 'face-side': return 'This facing blade is set for radial cutting. Back it clear of the work before moving Z, then feed X across the face.';
      case 'jaws': return 'The tool would run into the chuck jaws. Keep the tool clear of the chuck.';
      case 'chuck': return 'That would reach into the part of the bar held in the chuck.';
      case 'chuck-body': return 'The drill is in as far as its flutes reach: the drill chuck would hit the work.';
      case 'nohole': return 'There is no hole for the ' + t.name.toLowerCase() + ' to go into. It needs one at least ' + dia(minBore(t)) + ' in across: drill one first.';
      case 'bar': return 'The bar would rub the wall of the hole. The ' + t.name.toLowerCase() + ' needs a hole at least ' + dia(minBore(t)) + ' in across and only cuts with its tip.';
      case 'bottom': return 'The end of the bar has reached the bottom of the hole, where the drill point left a cone. Stop the pass short of it, or drill deeper.';
      case 'farwall': return 'The back of the bar would hit the far side of the hole. Move the tip out toward the wall it cuts, or use a bigger hole.';
      case 'fulldepth': return 'The knurl is at full depth: the diamond points are formed. Pressing harder only crushes and flakes them.';
      case 'shoulder': return 'The knurling wheels would be pushed into a shoulder. Knurling forms a surface the wheels can roll on; it cannot cut a step.';
      case 'peck': return 'The drill is ' + inch(data.depth || 0) + ' into this cut, three drill diameters. Back it out of the hole to clear the chips, then go back in.';
      case 'retract': return 'The threading tool is still in the thread. Back it out past the crests' + (data.clear != null ? ' (X ' + (t.side === 'in' ? 'below ' : 'above ') + fmt(data.clear) + ')' : '') + ' before you move the carriage, or it will cut the crests off.';
      case 'infeed': return 'That pass would cut ' + inch(data.infeed || 0) + ' deep at the bottom of the groove. The ' + t.name.toLowerCase() + (t.maxInfeed ? ' takes at most ' + inch(t.maxInfeed) + ' of infeed per pass: feed it in less, and take more passes.' : ' is not a threading tool.');
      case 'limit': return 'That is the end of the slide\'s travel.';
      case 'axis': return 'Tailstock tools ride on the centerline. They move only along Z.';
      case 'threadstop': return 'The threading tool would have run into a shoulder before the commanded stop, so it stopped at the last clear carriage position. Stop the pass sooner, or cut a relief groove for the tool to run into.';
      case 'parted': return 'Parted off. The finished part has dropped clear: see the inspection below.';
      case 'nopass': return 'A threading pass runs toward the chuck: set a stop Z to the left of the tool.';
      case 'notthread': return 'Choose a threading tool to take a threading pass.';
      case 'air': return 'The pass cut nothing: the tool is not in contact. Feed it in before the next pass.';
      default: return code;
    }
  }
  function stopObj(st, code, data) { return { code: code, text: explain(st, code, data || {}) }; }

  /* Where a threading tool is clear of the thread it is in: past the largest
     crest (outside) or the smallest one (inside) under its span. */
  function threadClear(st, tool) {
    var p = st.work, inside = tool.side === 'in';
    var i0 = colAt(p, st.tz - 0.1), i1 = colAt(p, st.tz + 0.1), v = inside ? Infinity : 0;
    for (var i = Math.max(0, i0); i <= Math.min(p.n - 1, i1); i++) {
      if (!has(p, i)) { continue; }
      if (inside && p.thI[i] !== 0) { v = Math.min(v, 2 * p.ri[i]); }
      if (!inside && p.thO[i] !== 0) { v = Math.max(v, 2 * p.ro[i]); }
    }
    return (v === Infinity || v === 0) ? null : v;
  }

  /* ---- moves -----------------------------------------------------------------------*/
  function frontZ(p) {
    for (var i = p.n - 1; i >= 0; i--) { if (has(p, i)) { return p.zL + (i + 1) * COL; } }
    return -Infinity;
  }
  function limits(st, tool) {
    return { zMin: st.zJaw - 0.60, zMax: 1.60, xMin: 0, xMax: tool.side === 'axial' ? 0 : round(2 * (st.R + 1.0), 3) };
  }

  function move(st, toZ, toX) {
    var tool = TOOLS[st.tool];
    var res = { moved: false, cut: 0, formed: false, stop: null, parted: false, debris: false, contact: false };
    var lim = limits(st, tool);
    if (tool.side === 'axial') {
      if (Math.abs(toX) > EPS) { res.axisLocked = true; }
      toX = 0;
    }
    var tz = Math.max(lim.zMin, Math.min(lim.zMax, toZ));
    var tx = Math.max(lim.xMin, Math.min(lim.xMax, toX));
    var clipped = Math.abs(tz - toZ) > 1e-9 || Math.abs(tx - toX) > 1e-9;
    var z0 = st.tz, r0 = st.tr, r1 = tx / 2;
    var dzT = tz - z0, drT = r1 - r0, len = Math.sqrt(dzT * dzT + drT * drT);
    // The sampled axial thread profile is at one fixed angular phase. The
    // carriage may stop between those samples; radial withdrawal from its
    // actual helical groove must not be mistaken for cutting a sampled crest.
    var retractingThread = tool.action === 'thread' && st.threadSeat && Math.abs(dzT) < EPS &&
      (tool.side === 'out' ? drT >= 0 : drT <= 0);
    if (tool.action === 'thread' && Math.abs(dzT) > EPS) {
      var clear = threadClear(st, tool);
      if (clear !== null && (tool.side === 'out' ? r0 * 2 < clear - EPS : r0 * 2 > clear + EPS)) {
        res.stop = stopObj(st, 'retract', { clear: clear }); return res;
      }
      st.threadSeat = null;
    }
    var n = Math.max(1, Math.ceil(len / STEP - 1e-9));
    var pz = z0, pr = r0;
    for (var k = 1; k <= n && len > 0; k++) {
      var z = z0 + dzT * k / n, r = r0 + drT * k / n;
      var chk = step(st, tool, z, r, false, retractingThread ? { noCut: true } : null);
      if (chk.code) { res.stop = stopObj(st, chk.code, chk.code === 'retract' ? { clear: threadClear(st, tool) } : null); break; }
      if (tool.radialOnly && Math.abs(dzT) > EPS && chk.area > EPS) { res.stop = stopObj(st, tool.id === 'face' ? 'face-side' : 'side'); break; }
      if ((chk.area > EPS || chk.formed) && !st.spindle) { res.stop = stopObj(st, 'spindle'); break; }
      var sl = Math.sqrt((z - pz) * (z - pz) + (r - pr) * (r - pr));
      var eng = winPush(st, chk.area, sl);
      if (tool.maxEngage && chk.area > EPS && eng > tool.maxEngage * SLACK + 1e-9) {
        winPop(st); res.stop = stopObj(st, 'engage', { engage: eng }); break;
      }
      if (tool.id === 'drill' && chk.area > EPS) {
        if (st.peck == null) {
          var p0 = st.work, fi = colAt(p0, frontZ(p0) - COL / 2);
          if (fi >= 0 && p0.ri[fi] < 0.02) { st.notes.noCenter = true; }
          st.peck = z;
        }
        var depth = st.peck - z;
        var D = drillSize(st);
        if (depth > tool.peck * D + 1e-9) { winPop(st); res.stop = stopObj(st, 'peck', { depth: tool.peck * D }); break; }
      }
      var ap = step(st, tool, z, r, true, retractingThread ? { noCut: true } : null);
      st.tz = z; st.tr = r; pz = z; pr = r;
      res.moved = true; res.cut += chk.area; res.formed = res.formed || chk.formed;
      if (chk.area > EPS || chk.formed) { res.contact = true; st.version++; }
      if (tool.id === 'drill' && st.peck != null && z >= frontZ(st.work) - EPS) { st.peck = null; }
      if (ap.emptied) {
        var sep = separate(st);
        st.version++;
        if (sep === 'part') { res.parted = true; res.stop = stopObj(st, 'parted'); break; }
        if (sep === 'debris') { res.debris = true; }
      }
    }
    if (tool.id === 'drill' && st.peck != null && st.tz >= frontZ(st.work) - EPS) { st.peck = null; }
    st.tz = round(st.tz, 6); st.tr = round(st.tr, 7);
    if (!res.stop && clipped) { res.stop = stopObj(st, 'limit'); }
    if (!res.stop && res.axisLocked) { res.stop = stopObj(st, 'axis'); }
    return res;
  }

  /* ---- threading --------------------------------------------------------------------
     The carriage is driven from the leadscrew, so the tool advances one pitch per
     turn. Seen in the section plane that is one notch per pitch along the swept
     length. Notch centres sit at Z0 - k * pitch whatever the pass, so a second pass
     at the same pitch lands in the same notches, and a pass at another pitch cuts
     a second, crossing helix. */
  function threadPass(st, zStop) {
    var tool = TOOLS[st.tool];
    var res = { moved: false, cut: 0, notches: 0, stop: null, from: st.tz, to: st.tz, infeed: 0 };
    if (tool.action !== 'thread') { res.stop = stopObj(st, 'notthread'); return res; }
    if (!(zStop < st.tz - 0.005)) { res.stop = stopObj(st, 'nopass'); return res; }
    if (!st.spindle) { res.stop = stopObj(st, 'spindle'); return res; }
    var p = st.work, inside = tool.side === 'in', r = st.tr, pitch = 1 / st.tpi;
    var lim = limits(st, tool);
    zStop = Math.max(lim.zMin, zStop);
    // 1. the body has to clear the work along the whole pass
    var zEnd = st.tz, crash = null;
    var nst = Math.max(1, Math.ceil((st.tz - zStop) / 0.001));
    for (var k = 1; k <= nst; k++) {
      var z = st.tz - (st.tz - zStop) * k / nst;
      var chk = step(st, tool, z, r, false, { noCut: true });
      if (chk.code) { crash = chk.code; break; }
      zEnd = z;
    }
    // 2. infeed at every notch the pass will cut
    var kMax = Math.floor((-zEnd) / pitch + 1e-9), kMin = Math.ceil((-st.tz) / pitch - 1e-9);
    var notches = [];
    for (k = kMin; k <= kMax; k++) { notches.push(-k * pitch); }
    // zEnd is carriage travel. Section-plane notch phase must not round it to
    // a whole turn or move the readout away from the commanded stop.
    var worst = 0, any = false;
    for (k = 0; k < notches.length; k++) {
      var c = colAt(p, notches[k]);
      if (c < 0 || c >= p.n || !has(p, c)) { continue; }
      var inf = inside ? r - p.ri[c] : p.ro[c] - r;
      if (inf > EPS) { any = true; }
      if (inf > worst) { worst = inf; }
    }
    if (worst > tool.maxInfeed * SLACK + 1e-9) { res.stop = stopObj(st, 'infeed', { infeed: worst }); return res; }
    // 3. cut the notches and mark the threaded length with its pitch
    var half = inside ? 0.0309 : 0.0366;
    var i0 = colAt(p, zEnd - (notches.length ? half : 0)), i1 = colAt(p, st.tz);
    for (var i = Math.max(0, i0); i <= Math.min(p.n - 1, i1); i++) {
      if (!has(p, i)) { continue; }
      var reached = inside ? (r > p.ri[i] + EPS) : (r < p.ro[i] - EPS);
      if (!reached) { continue; }
      var tag = inside ? p.thI : p.thO;
      if (tag[i] === 0) {
        (inside ? p.thBaseI : p.thBaseO)[i] = inside ? p.ri[i] : p.ro[i];
        tag[i] = pitch;
      } else if (Math.abs(tag[i] - pitch) > 1e-9) { tag[i] = -1; }
    }
    var area = 0;
    for (k = 0; k < notches.length; k++) {
      var zn = notches[k];
      var a0 = colAt(p, zn - half - COL), a1 = colAt(p, zn + half + COL);
      for (i = Math.max(0, a0); i <= Math.min(p.n - 1, a1); i++) {
        if (!has(p, i)) { continue; }
        var e = edgeCol(tool, zc(p, i) - zn);
        if (e === Infinity) { continue; }
        if (inside) {
          var nb = Math.min(r - e, p.ro[i]);
          if (nb > p.ri[i] + EPS) { area += (nb - p.ri[i]) * COL; p.ri[i] = nb; }
        } else {
          var nt = Math.max(r + e, p.ri[i]);
          if (nt < p.ro[i] - EPS) { area += (p.ro[i] - nt) * COL; p.ro[i] = nt; }
        }
      }
      res.notches++;
    }
    st.tz = round(zEnd, 6);
    res.moved = true; res.cut = area; res.to = st.tz; res.infeed = worst;
    res.turns = (res.from - res.to) / pitch;
    st.threadSeat = { z: st.tz, pitch: pitch };
    st.win = { a: [], l: [] };
    st.version++;
    if (crash) { res.stop = stopObj(st, (crash === 'jaws' || crash === 'chuck') ? crash : 'threadstop'); res.crashed = true; res.crash = crash; }
    else if (!any || area <= EPS) { res.stop = stopObj(st, 'air'); }
    return res;
  }

  /* ---- tool change and spindle ---------------------------------------------------*/
  function setSpindle(st, on) { st.spindle = !!on; st.win = { a: [], l: [] }; return st.spindle; }
  function selectTool(st, id) {
    if (!TOOLS[id]) { throw new Error('unknown tool: ' + id); }
    if (st.spindle) { return { ok: false, text: 'Stop the spindle before changing tools.' }; }
    st.tool = id;
    var park = parkFor(st, id);
    st.tz = park.z; st.tr = park.r; st.win = { a: [], l: [] }; st.peck = null; st.threadSeat = null;
    return { ok: true };
  }
  function setDrill(st, id) {
    if (st.spindle) { return { ok: false, text: 'Stop the spindle before changing the drill.' }; }
    for (var i = 0; i < DRILLS.length; i++) { if (DRILLS[i].id === id) { st.drill = id; return { ok: true }; } }
    throw new Error('unknown drill: ' + id);
  }
  function setPitch(st, tpi) {
    if (PITCHES.indexOf(tpi) < 0) { throw new Error('unknown pitch: ' + tpi); }
    if (st.spindle) { return { ok: false, text: 'Stop the spindle before you change the leadscrew gearing.' }; }
    st.tpi = tpi; return { ok: true };
  }

  /* ---- the target profile ------------------------------------------------------------
     Nominal and limit radii at a distance s from the front face, chamfers
     included. Used to draw the drawing's outline over the work and to tint the
     metal still to come off. */
  function segAt(list, s) {
    for (var i = 0; i < list.length; i++) { if (s >= list[i].from - 1e-9 && s <= list[i].to + 1e-9) { return list[i]; } }
    return null;
  }
  function chamferOf(T, edge) {
    for (var i = 0; i < T.chamfers.length; i++) { if (T.chamfers[i].edge === edge) { return T.chamfers[i]; } }
    return null;
  }
  function outerNom(seg) { return seg.kind === 'thread' ? seg.crest[1] : (seg.kind === 'knurl' ? seg.d : seg.d); }
  function profileAt(T, s) {
    var L = T.length.L;
    if (s < 0 || s > L) { return null; }
    var so = segAt(T.outside, s), si = segAt(T.inside, s);
    var ro = outerNom(so) / 2, ri = 0, roMin, roMax, riMin = 0, riMax = 0;
    if (so.kind === 'thread') { roMin = so.root[0] / 2; roMax = so.crest[1] / 2; }
    else if (so.kind === 'knurl') { roMin = (so.blank - 0.005) / 2; roMax = so.crest[1] / 2; }
    else { roMin = (so.d + so.lo) / 2; roMax = (so.d + so.hi) / 2; }
    if (si) {
      if (si.kind === 'thread') { ri = si.crest[0] / 2; riMin = si.crest[0] / 2; riMax = si.root[1] / 2; }
      else { ri = si.d / 2; riMin = (si.d + si.lo) / 2; riMax = (si.d + si.hi) / 2; }
    }
    var cf = chamferOf(T, 'front-od'), cb = chamferOf(T, 'back-od'), cbr = chamferOf(T, 'front-bore');
    if (cf && s < cf.c) { var d1 = cf.c - s; ro -= d1; roMin -= d1 + cf.tol; roMax -= Math.max(0, d1 - cf.tol); }
    if (cb && s > L - cb.c) { var d2 = s - (L - cb.c); ro -= d2; roMin -= d2 + cb.tol; roMax -= Math.max(0, d2 - cb.tol); }
    if (cbr && si && s < cbr.c) { var d3 = cbr.c - s; ri += d3; riMax += d3 + cbr.tol; riMin += Math.max(0, d3 - cbr.tol); }
    return { ro: ro, ri: ri, roMin: roMin, roMax: roMax, riMin: riMin, riMax: riMax, kind: so.kind, insideKind: si ? si.kind : null };
  }

  /* Per column of the work on the lathe: how much metal is still outside the
     drawing (to come off) and where the work is already smaller than the
     drawing allows. Measured from Z0, where the drawing is placed. Corners are
     given 0.02 in of grace so a nose radius is not called a gouge. */
  function compare(st) {
    var T = target(st.targetId), p = st.work, L = T.length.L;
    var res = { excessOut: [], excessIn: [], under: [] };
    var bounds = [0, L];
    T.outside.forEach(function (sg) { bounds.push(sg.from, sg.to); });
    T.inside.forEach(function (sg) { bounds.push(sg.from, sg.to); });
    function nearBound(s) { for (var b = 0; b < bounds.length; b++) { if (Math.abs(s - bounds[b]) < 0.02) { return true; } } return false; }
    for (var i = 0; i < p.n; i++) {
      if (!has(p, i)) { continue; }
      var s = -zc(p, i);
      if (s < 0) { res.excessOut.push([i, 0, p.ro[i]]); continue; }
      if (s > L) { continue; }
      var g = profileAt(T, s);
      if (p.ro[i] > g.roMax + 0.0005) { res.excessOut.push([i, g.roMax, p.ro[i]]); }
      if (p.ri[i] < g.riMin - 0.0005 && g.riMin > 0) { res.excessIn.push([i, p.ri[i], g.riMin]); }
      if (!nearBound(s)) {
        if (p.ro[i] < g.roMin - 0.0005) { res.under.push([i, 'out']); }
        else if (g.riMax > 0 && p.ri[i] > g.riMax + 0.0005) { res.under.push([i, 'in']); }
        else if (g.riMax === 0 && p.ri[i] > 0.001) { res.under.push([i, 'in']); }
      }
    }
    return res;
  }

  /* ---- measuring a part -----------------------------------------------------------------*/
  function zEndAt(p, rho, fromRight) {
    if (fromRight) {
      for (var i = p.n - 1; i >= 0; i--) { if (has(p, i) && p.ri[i] <= rho && p.ro[i] > rho) { return p.zL + (i + 1) * COL; } }
    } else {
      for (var j = 0; j < p.n; j++) { if (has(p, j) && p.ri[j] <= rho && p.ro[j] > rho) { return p.zL + j * COL; } }
    }
    return null;
  }
  function span(p) {
    var a = -1, b = -1;
    for (var i = 0; i < p.n; i++) { if (has(p, i)) { if (a < 0) { a = i; } b = i; } }
    return a < 0 ? null : { a: a, b: b };
  }
  /* Where an end face is and whether it is flat. The end position is measured
     at nine radii from near the axis (or outside a hole's chamfer) to just
     inside the edge chamfer, wherever there is metal, and a flat face agrees
     within 0.003 in. A face that is flat outside but stands proud near the
     axis is a nub: the facing cut stopped short of the center. */
  function endFace(p, rIn, rOut, fromRight) {
    var lo = Math.max(rIn, 0.004), N = 9, rs = [], zs = [];
    if (rOut - lo <= 0.004) { return null; }
    for (var k = 0; k < N; k++) {
      var rho = lo + (rOut - lo) * k / (N - 1);
      var v = zEndAt(p, rho, fromRight);
      if (v !== null) { rs.push(rho); zs.push(v); }
    }
    if (zs.length < 2) { return null; }
    var sgn = fromRight ? 1 : -1, zRef = zs[zs.length - 1];
    var mn = Math.min.apply(null, zs), mx = Math.max.apply(null, zs);
    var res = { z: zRef, flat: mx - mn <= 0.0031, spread: mx - mn, nub: 0, nubR: 0 };
    if (!res.flat && fromRight) {
      // A faced ring is exactly flat; a sawn end slopes everywhere.
      var j = zs.length - 1;
      while (j > 0 && Math.abs(zs[j - 1] - zRef) <= 0.0005) { j--; }
      var proud = zs.slice(0, j).every(function (z) { return sgn * (z - zRef) > 0.0031; });
      if (proud && j > 0 && zs.length - j >= 3 && rOut - rs[j] >= 0.35 * (rOut - lo)) {
        res.flat = true; res.nub = mx - zRef; res.nubR = rs[j - 1];
      }
    }
    return res;
  }
  /* The outer surface with thread and knurl teeth bridged: the largest radius
     within half a pitch. What a micrometer across the crests would read. */
  function envOut(p, i) {
    if (p.thO[i] !== 0 && p.thBaseO[i] > 0) { return p.thBaseO[i]; }
    if (p.thO[i] === 0 && p.kB[i] === 0) { return p.ro[i]; }
    var w = p.thO[i] > 0 ? Math.ceil(p.thO[i] / 2 / COL) + 1 : (p.thO[i] < 0 ? 25 : 3);
    var m = 0;
    for (var k = Math.max(0, i - w); k <= Math.min(p.n - 1, i + w); k++) { if (has(p, k) && p.ro[k] > m) { m = p.ro[k]; } }
    return m;
  }
  function envIn(p, i) {
    if (p.thI[i] !== 0 && p.thBaseI[i] > 0) { return p.thBaseI[i]; }
    if (p.thI[i] === 0) { return p.ri[i]; }
    var w = p.thI[i] > 0 ? Math.ceil(p.thI[i] / 2 / COL) + 1 : 25;
    var m = Infinity;
    for (var k = Math.max(0, i - w); k <= Math.min(p.n - 1, i + w); k++) { if (has(p, k) && p.ri[k] < m) { m = p.ri[k]; } }
    return m === Infinity ? p.ri[i] : m;
  }
  /* Surviving outside/inside diameters at one Z. For a thread these are the
     crest/minor envelopes, not a notch treated as an annular empty groove. */
  function measureAt(st, z) {
    var p = st.work, i = colAt(p, z);
    if (i < 0 || i >= p.n || !has(p, i)) { return null; }
    return { od: 2 * outerEnvelope(p, i), id: 2 * innerEnvelope(p, i) };
  }

  /* ---- inspection -------------------------------------------------------------------------
     Measures the part the way it would be inspected: every length from the
     actual front face, diameters over the clean length of each feature, the
     thread by its pitch and the depth of its roots, the knurl by how fully the
     points have formed. Each line says what to do next where something can be
     done. */
  function columnsBetween(p, zF, s0, s1) {
    var out = [];
    for (var i = 0; i < p.n; i++) {
      if (!has(p, i)) { continue; }
      var s = zF - zc(p, i);
      if (s >= s0 - 1e-9 && s <= s1 + 1e-9) { out.push(i); }
    }
    return out;
  }
  /* Inspect the face at nine radii, rather than accepting one sharp change
     in a sampled profile as a finished shoulder. Leave only a small corner
     allowance for the nose/edge transition. Teeth are bridged for this check. */
  function shoulderFace(p, zF, sNom, dRight, dLeft) {
    var smallRight = dLeft > dRight, lo = Math.min(dLeft, dRight) / 2, hi = Math.max(dLeft, dRight) / 2;
    var inset = Math.min(0.006, (hi - lo) / 8), positions = [];
    for (var k = 0; k < 9; k++) {
      var rho = lo + inset + (hi - lo - 2 * inset) * k / 8, best = null;
      for (var i = 1; i < p.n; i++) {
        if (!has(p, i) || !has(p, i - 1)) { continue; }
        var s = zF - (p.zL + i * COL);
        if (Math.abs(s - sNom) > 0.25) { continue; }
        var left = envOut(p, i - 1), right = envOut(p, i);
        var crosses = smallRight ? left > rho && right <= rho : left <= rho && right > rho;
        if (crosses && (best === null || Math.abs(s - sNom) < Math.abs(best - sNom))) { best = s; }
      }
      if (best === null) { return null; }
      positions.push(best);
    }
    var mn = Math.min.apply(null, positions), mx = Math.max.apply(null, positions);
    return { position: positions[4], min: mn, max: mx, spread: mx - mn, flat: mx - mn <= 0.0031 };
  }

  function evaluate(st) {
    var T = target(st.targetId);
    var piece = st.part || st.work;
    var parted = !!st.part;
    var L = T.length.L;
    var items = [];
    var spanW = span(piece);
    function add(it) { items.push(it); }
    if (!spanW) {
      return { items: [], parted: parted, accepted: false, okCount: 0, total: 0, empty: true, notes: [] };
    }
    var first = T.outside[0], last = T.outside[T.outside.length - 1];
    var bore0 = T.inside.length ? T.inside[0] : null;
    var cf = chamferOf(T, 'front-od'), cb = chamferOf(T, 'back-od'), cbr = chamferOf(T, 'front-bore');
    var rInF = bore0 ? (bore0.kind === 'thread' ? bore0.root[1] : bore0.d + bore0.hi) / 2 + (cbr ? cbr.c + cbr.tol : 0) + 0.005 : 0;
    var rOutF = (first.kind === 'thread' ? first.root[0] : (first.kind === 'knurl' ? first.blank - 0.03 : first.d + first.lo)) / 2 - (cf ? cf.c + cf.tol : 0) - 0.005;
    // Until a hole is made the face is solid, and all of it has to be faced.
    var face = endFace(piece, piece.ri[spanW.b] < 0.004 ? 0 : rInF, rOutF, true);
    if (!face) {
      return { items: [{ id: 'face', label: 'Front face', spec: 'Faced flat', made: 'No face to measure', status: 'missing', hint: 'The work does not have the drawing\'s shape near the front yet.' }],
        parted: parted, accepted: false, okCount: 0, total: 1, notes: [] };
    }
    var zF = face.z;
    // --- front face
    (function () {
      var it = { id: 'face', label: 'Front face', spec: 'Faced flat, square to the axis' };
      if (!face.flat) {
        it.made = 'Uneven by ' + inch(face.spread);
        it.status = 'over';
        it.hint = 'Face the uneven or sawn end: choose the facing tool, place its left corner at the finished Z, and feed X to 0. Take axial slices no wider than 0.0625 in.';
      } else if (face.nub) {
        it.made = 'A nub ' + inch(face.nub) + ' tall is left at the center';
        it.status = 'over';
        it.hint = 'The facing cut stopped short of the center. Feed it on to X 0.';
      } else {
        it.made = 'Flat, at Z ' + fmt(zF);
        it.status = 'ok';
        if (Math.abs(zF) > 0.0015) { it.made += ' (' + inch(Math.abs(zF)) + (zF < 0 ? ' past Z0' : ' short of Z0') + ')'; }
      }
      add(it);
    })();
    var lenNote = Math.abs(zF) > 0.0015 ? ' Lengths are measured from this face.' : '';

    // A target without an internal feature requires solid material, too.
    // Requested diameters alone cannot distinguish a pin from a hollow tube.
    if (!T.inside.length) {
      var coreCols = columnsBetween(piece, zF, 0, L);
      var hole = 0;
      coreCols.forEach(function (i) { hole = Math.max(hole, 2 * piece.ri[i]); });
      add({ id: 'core', label: 'Solid core', spec: 'Solid material: no hole',
        made: hole > EPS ? 'An unintended hole, up to ' + dia(hole) : 'Solid',
        status: hole > EPS ? 'under' : 'ok',
        hint: hole > EPS ? 'The drawing has no hole. That material is gone: undo the drilling or boring, or start new stock.' : '' });
    }
    // --- outside segments
    T.outside.forEach(function (sg, idx) {
      var isFirst = idx === 0, isLast = idx === T.outside.length - 1;
      var m0 = isFirst ? (cf ? cf.c + cf.tol + 0.01 : 0.02) : 0.025;
      var m1 = isLast ? (cb ? cb.c + cb.tol + 0.01 : 0.02) : 0.025;
      if (sg.kind === 'thread' || sg.kind === 'knurl') { m0 = Math.max(m0, 0.03); m1 = Math.max(m1, 0.03); }
      var cols = columnsBetween(piece, zF, sg.from + m0, sg.to - m1);
      var it = { id: 'od-' + idx, label: sg.label };
      if (sg.kind === 'thread') {
        it.spec = sg.tpi + ' threads per inch, 60°. Crests ' + dia(sg.crest[0]) + ' to ' + fmt(sg.crest[1]) + ', roots ' + dia(sg.root[0]) + ' to ' + fmt(sg.root[1]);
        threadCheck(it, piece, cols, sg, false);
      } else if (sg.kind === 'knurl') {
        it.spec = 'Diamond knurl, full points, ' + dia(sg.crest[0]) + ' to ' + fmt(sg.crest[1]) + ' over the points';
        knurlCheck(it, piece, cols, sg);
      } else {
        it.spec = dia(sg.d) + ' ' + tolText(sg.lo, sg.hi) + (sg.asBar ? ' (left at bar size)' : '');
        diaCheck(it, piece, cols, sg, false);
      }
      if (!cols.length) { it.made = 'Part too short to have this'; it.status = 'missing'; it.hint = ''; }
      add(it);
    });
    // --- shoulders
    T.shoulders.forEach(function (sh, idx) {
      var right = segAt(T.outside, sh.at - 0.01), left = segAt(T.outside, sh.at + 0.01);
      var dR = outerNom(right), dL = outerNom(left);
      if (right.kind === 'thread') { dR = right.crest[0]; }
      var it = { id: 'sh-' + idx, label: 'Shoulder', spec: 'Flat face, ' + inch(sh.at) + ' ±' + fmt(sh.tol) + ' from the front face' };
      var faceAt = shoulderFace(piece, zF, sh.at, dR, dL);
      if (faceAt === null) {
        it.made = 'No complete shoulder face yet'; it.status = 'missing';
        it.hint = 'Rough-turn short of this shoulder, then use a radial facing cut at Z ' + fmt(zF - sh.at) + ' to finish its allowance.';
      } else {
        var s = faceAt.position;
        it.made = faceAt.flat ? inch(s) + ' from the face' : 'Angled or uneven by ' + inch(faceAt.spread) + ', near ' + inch(s);
        // which way can it still move? toward the bigger diameter side, by cutting more
        var smallRight = dR < dL;
        var tooFar = smallRight ? faceAt.max > sh.at + sh.tol + EPS : faceAt.min < sh.at - sh.tol - EPS;
        if (faceAt.flat && faceAt.min >= sh.at - sh.tol - EPS && faceAt.max <= sh.at + sh.tol + EPS) { it.status = 'ok'; }
        else if (!tooFar) {
          it.status = 'over';
          it.hint = 'Shoulder allowance remains. With the facing tool clear, set Z ' + fmt(zF - sh.at) + (smallRight ? '' : ' minus its 0.0625 in width') + ', then feed X across the face to ' + fmt(Math.min(dR, dL)) + '. Retract before moving Z.' + lenNote;
        } else {
          it.status = 'under';
          it.hint = 'Part of the shoulder was cut beyond its allowed plane. That metal is gone: undo before that cut, rough-turn short of the shoulder, then face the remaining allowance.';
        }
      }
      add(it);
    });
    // --- inside
    T.inside.forEach(function (sg, idx) {
      var m0 = cbr ? cbr.c + cbr.tol + 0.01 : 0.02;
      var end = parted ? sg.to - 0.02 : sg.to;
      var cols = columnsBetween(piece, zF, sg.from + Math.max(m0, sg.kind === 'thread' ? 0.03 : 0), end);
      var it = { id: 'id-' + idx, label: sg.label };
      if (sg.kind === 'thread') {
        it.spec = sg.tpi + ' threads per inch, 60°, through. Inside crests ' + dia(sg.crest[0]) + ' to ' + fmt(sg.crest[1]) + ', roots ' + dia(sg.root[0]) + ' to ' + fmt(sg.root[1]);
        threadCheck(it, piece, cols, sg, true);
      } else {
        it.spec = dia(sg.d) + ' ' + tolText(sg.lo, sg.hi) + (sg.through ? ', through' : '');
        diaCheck(it, piece, cols, sg, true);
      }
      if (it.status === 'ok' && sg.through && !parted) {
        // the hole has to run past where the part will be cut off
        var deep = columnsBetween(piece, zF, sg.to - 0.01, sg.to + 0.01).every(function (i) { return piece.ri[i] > 0.01; });
        if (!deep) { it.status = 'over'; it.made += ', not deep enough to go through'; it.hint = 'The hole must run past ' + inch(sg.to) + ' from the face so it goes through once the part is cut off.'; }
      }
      add(it);
    });
    // --- the back face, once the part is off
    var back = null;
    if (parted) {
      var ri0 = bore0 ? (bore0.kind === 'thread' ? bore0.root[1] : bore0.d + bore0.hi) / 2 + 0.005 : 0;
      var ro0 = (last.kind === 'knurl' ? last.blank - 0.03 : (last.kind === 'thread' ? last.root[0] : last.d + (last.lo || 0))) / 2 - (cb ? cb.c + cb.tol : 0) - 0.005;
      back = endFace(piece, ri0, ro0, false);
    }
    var frontIdx = colAt(piece, zF - COL / 2), backIdx = back ? colAt(piece, back.z + COL / 2) : spanW.a;
    // --- chamfers
    T.chamfers.forEach(function (c, idx) {
      var it = { id: 'ch-' + idx, label: c.edge === 'front-od' ? 'Front edge chamfer' : (c.edge === 'back-od' ? 'Back edge chamfer' : 'Chamfer at the hole'),
        spec: inch(c.c) + ' × 45° ±' + fmt(c.tol) };
      chamferCheck(it, piece, zF, c, T, parted, frontIdx, backIdx);
      add(it);
    });
    // --- length
    (function () {
      var it = { id: 'len', label: 'Overall length', spec: inch(L) + ' ±' + fmt(T.length.tol) };
      if (!parted) {
        it.made = 'Not parted off yet'; it.status = 'pending';
        it.hint = 'Part off with the blade\'s right-hand corner at Z ' + fmt(zF - L) + '.';
      } else if (!back) {
        it.made = 'Cannot find the back face'; it.status = 'under'; it.hint = '';
      } else {
        var len = zF - back.z;
        it.made = inch(len);
        if (Math.abs(len - L) <= T.length.tol + 1e-9) { it.status = 'ok'; }
        else if (len > L) { it.status = 'over'; it.hint = inch(len - L) + ' long. On a real job a second setup would face it to length; in this simulator, undo the part-off and cut it at Z ' + fmt(zF - L) + '.'; }
        else { it.status = 'under'; it.hint = inch(L - len) + ' short: scrap. Undo the part-off and cut it at Z ' + fmt(zF - L) + '.'; }
      }
      add(it);
    })();
    var notes = [];
    if (st.notes.noCenter) { notes.push('You drilled without using the simulated starting tool. This model keeps the hole on center and does not predict drill wandering. On a real machine, the starting method depends on the drill geometry and its manufacturer\'s guidance; a center drill is not a universal spotting tool.'); }
    var ok = items.filter(function (x) { return x.status === 'ok'; }).length;
    return { items: items, parted: parted, accepted: parted && ok === items.length, okCount: ok, total: items.length, zFace: zF, notes: notes };
  }
  function tolText(lo, hi) {
    if (lo === -hi) { return '±' + fmt(hi); }
    return fmtSigned(hi) + ' / ' + fmtSigned(lo);
  }

  function diaCheck(it, p, cols, sg, inside) {
    if (!cols.length) { return; }
    var mn = Infinity, mx = -Infinity, none = false;
    cols.forEach(function (i) {
      var v = inside ? 2 * p.ri[i] : 2 * p.ro[i];
      if (inside && p.ri[i] < 0.005) { none = true; }
      if (v < mn) { mn = v; } if (v > mx) { mx = v; }
    });
    var lo = sg.d + sg.lo, hi = sg.d + sg.hi;
    if (inside && none) {
      it.made = mx < 0.01 ? 'No hole' : 'Does not run the full length';
      it.status = 'missing';
      it.hint = mx < 0.01 ? 'Drill a pilot hole, then bore it to size. On a real machine, use the starting method recommended for that drill.' : 'Drill and bore the hole deeper.';
      return;
    }
    it.made = Math.abs(mx - mn) < 0.0006 ? dia(mx) : dia(mn) + ' to ' + fmt(mx);
    var badLo = mn < lo - MTOL, badHi = mx > hi + MTOL;
    if (!badLo && !badHi) { it.status = 'ok'; return; }
    if (inside) {
      if (badHi) { it.status = 'under'; it.hint = inch(mx - hi) + ' over the largest size. That metal is gone: undo back before that cut, or start new stock.'; return; }
      it.status = 'over';
      it.hint = inch(lo - mn) + ' under the smallest size. Take another boring pass at X ' + fmt(sg.d + (sg.hi + sg.lo) / 2) + (lo - mn > 0.08 ? ', in more than one pass' : '') + '.';
      return;
    }
    if (badLo) { it.status = 'under'; it.hint = inch(lo - mn) + ' under the smallest size. Cutting cannot put metal back: undo back before that pass, or start new stock.'; return; }
    it.status = 'over';
    var target = sg.d + (sg.hi + sg.lo) / 2;
    it.hint = inch(mx - hi) + ' over the largest size. Take another pass at X ' + fmt(target) + ((mx - target) / 2 > 0.1 ? ', in more than one pass (at most 0.100 in off the radius each)' : '') + '.';
  }

  function threadCheck(it, p, cols, sg, inside) {
    if (!cols.length) { return; }
    var pitch = 1 / sg.tpi, tags = {}, tagged = 0, mixed = false, periods = {};
    var crest = inside ? Infinity : -Infinity, rootv = inside ? -Infinity : Infinity;
    cols.forEach(function (i) {
      var t = inside ? p.thI[i] : p.thO[i];
      if (t < 0) { mixed = true; }
      if (t !== 0) { tagged++; tags[round(t, 6)] = true; }
      var v = inside ? 2 * p.ri[i] : 2 * p.ro[i];
      var period = Math.round(zc(p, i) / pitch);
      var local = periods[period] || (periods[period] = { min: Infinity, max: -Infinity });
      local.min = Math.min(local.min, v); local.max = Math.max(local.max, v);
      if (inside) { crest = Math.min(crest, v); rootv = Math.max(rootv, v); }
      else { crest = Math.max(crest, v); rootv = Math.min(rootv, v); }
    });
    var cover = tagged / cols.length;
    var crestLo = sg.crest[0], crestHi = sg.crest[1], rootLo = sg.root[0], rootHi = sg.root[1];
    if (inside && rootv < 0.01) { it.made = 'No hole'; it.status = 'missing'; it.hint = 'Drill to the thread\'s inside size, ' + dia(sg.crest[0]) + ' to ' + fmt(sg.crest[1]) + ', using the starting method recommended for the drill.'; return; }
    if (!tagged) {
      it.made = 'Not threaded' + (inside ? ', hole ' + dia(crest) : ', ' + dia(crest));
      it.status = 'missing';
      if (!inside && crest > crestHi + MTOL) { it.hint = 'Turn it to the crest size first, then thread it at ' + sg.tpi + ' per inch.'; }
      else if (inside && crest < crestLo - MTOL) { it.hint = 'The hole is under the thread\'s inside size. Open it to ' + dia(sg.crest[0]) + ' to ' + fmt(sg.crest[1]) + ', then thread it.'; }
      else { it.hint = 'Thread it at ' + sg.tpi + ' per inch with the ' + (inside ? 'threading bar' : 'outside threading tool') + '.'; }
      return;
    }
    var keys = Object.keys(tags).map(Number);
    var wrong = keys.filter(function (k) { return k > 0 && Math.abs(k - pitch) > MTOL; });
    it.made = sg.tpi + ' per inch? ';
    if (mixed || (wrong.length && keys.length > 1)) {
      it.made = 'Crossed: passes at two different pitches';
      it.status = 'under';
      it.hint = 'Every pass of one thread must use the same pitch, or the passes cut different helixes. Undo back to before the wrong pass, or start new stock.';
      return;
    }
    if (wrong.length) {
      it.made = 'Cut at ' + Math.round(1 / wrong[0]) + ' per inch';
      it.status = 'under';
      it.hint = 'The drawing asks for ' + sg.tpi + ' threads per inch. Undo back before the threading, set ' + sg.tpi + ' per inch, and thread it again.';
      return;
    }
    it.made = (inside ? 'Inside crests ' : 'Crests ') + dia(crest) + ', roots ' + dia(rootv);
    if (cover < 0.97) {
      it.status = 'over'; it.made += ', ' + Math.round(cover * 100) + '% of the length';
      it.hint = 'The thread does not run the full length. Start each pass clear of the front and run it to the end of the thread.';
      return;
    }
    var crestBad = inside ? (crest < crestLo - MTOL || crest > crestHi + MTOL) : (crest < crestLo - MTOL || crest > crestHi + MTOL);
    if (inside) {
      if (rootv < rootLo - MTOL) { it.status = 'over'; it.hint = 'Not deep enough yet. Feed the bar out ' + inch(Math.min(0.012, (rootLo - rootv) / 2 + 0.0015)) + ' and take another pass (X ' + fmt(Math.min(rootv + 2 * TOOLS.ithread.maxInfeed, (rootLo + rootHi) / 2)) + ').'; return; }
      if (rootv > rootHi + MTOL) { it.status = 'under'; it.hint = 'Cut too deep: the teeth are thin. Undo back before that pass.'; return; }
    } else {
      if (rootv > rootHi + MTOL) { it.status = 'over'; it.hint = 'Not deep enough yet. Take another pass at X ' + fmt(Math.max(rootv - 2 * TOOLS.thread.maxInfeed, (rootLo + rootHi) / 2)) + '.'; return; }
      if (rootv < rootLo - MTOL) { it.status = 'under'; it.hint = 'Cut too deep: the teeth are thin and weak. Undo back before that pass.'; return; }
    }
    if (crestBad) {
      it.status = inside ? (crest > crestHi ? 'under' : 'over') : (crest > crestHi ? 'over' : 'under');
      it.hint = inside ? 'The inside crests are set by the drilled hole: ' + dia(crestLo) + ' to ' + fmt(crestHi) + '.' : 'The crests are the diameter turned before threading: ' + dia(crestLo) + ' to ' + fmt(crestHi) + '.';
      return;
    }
    // One completed turn cannot supply the root depth for the whole thread.
    // Check each pitch whose root center lies in the inspected clean length.
    var zMin = zc(p, cols[0]), zMax = zc(p, cols[cols.length - 1]);
    var roots = [], crests = [];
    Object.keys(periods).forEach(function (key) {
      var z = Number(key) * pitch;
      if (z < zMin - COL || z > zMax + COL) { return; }
      var local = periods[key];
      roots.push(inside ? local.max : local.min);
      crests.push(inside ? local.min : local.max);
    });
    if (roots.length) {
      var rMin = Math.min.apply(null, roots), rMax = Math.max.apply(null, roots);
      var cMin = Math.min.apply(null, crests), cMax = Math.max.apply(null, crests);
      if (rMin < rootLo - MTOL || rMax > rootHi + MTOL) {
        var tooDeep = inside ? rMax > rootHi + MTOL : rMin < rootLo - MTOL;
        it.made = 'Roots ' + dia(rMin) + ' to ' + fmt(rMax) + ' along the thread';
        it.status = tooDeep ? 'under' : 'over';
        it.hint = tooDeep ? 'At least one turn is cut too deep. Undo back before that pass.' : 'Some turns are still too shallow. Take the next infeed pass over the full required thread length.';
        return;
      }
      if (cMin < crestLo - MTOL || cMax > crestHi + MTOL) {
        var removedCrests = inside ? cMax > crestHi + MTOL : cMin < crestLo - MTOL;
        it.made = 'Crests ' + dia(cMin) + ' to ' + fmt(cMax) + ' along the thread';
        it.status = removedCrests ? 'under' : 'over';
        it.hint = removedCrests ? 'The crests have been cut away in part of the thread. Undo back before that cut.' : 'The crest size must meet the drawing along the full thread, not just one region.';
        return;
      }
    }
    it.status = 'ok';
  }

  function knurlCheck(it, p, cols, sg) {
    if (!cols.length) { return; }
    var full = 0, any = 0, capped = 0, maxPen = 0, mn = Infinity, mx = -Infinity, blanks = [];
    var penFull = TOOLS.knurl.penFull;
    cols.forEach(function (i) {
      var v = 2 * p.ro[i];
      if (v < mn) { mn = v; } if (v > mx) { mx = v; }
      if (p.kB[i] > 0) {
        any++; blanks.push(2 * p.kB[i]);
        if (p.kP[i] > maxPen) { maxPen = p.kP[i]; }
        if (p.kP[i] >= penFull - 0.0005) {
          if (p.ro[i] < p.kB[i] + p.kP[i] - 0.0005) { capped++; } else { full++; }
        }
      }
    });
    blanks.sort(function (a, b) { return a - b; });
    var blank = blanks.length ? blanks[Math.floor(blanks.length / 2)] : mx;
    if (!any) {
      it.made = 'Not knurled, ' + dia(mx);
      it.status = 'missing';
      it.hint = mx > sg.blank + 0.003 ? 'Turn the blank to about ' + dia(sg.blank) + ' first: a full knurl here adds 0.020 in to the diameter.' : 'Knurl it: run the knurling tool along it, pressed in to X ' + fmt(mx - 2 * penFull) + '.';
      return;
    }
    it.made = (mx - mn < 0.0006 ? dia(mx) : dia(mn) + ' to ' + fmt(mx)) + ' over the points, from a ' + dia(blank) + ' blank';
    if (any < cols.length * 0.97) {
      it.status = 'over'; it.hint = 'The knurl does not cover the whole length. Run the wheels along the rest of it.';
      return;
    }
    if (capped > cols.length * 0.03) {
      it.status = 'under'; it.hint = 'The tops of the points have been cut off. Undo back before that cut.';
      return;
    }
    if (full < cols.length * 0.97) {
      it.status = 'over'; it.made += ', points not fully formed';
      it.hint = 'Press the knurl in further, to X ' + fmt(blank - 2 * penFull) + ', and run it along again.';
      return;
    }
    if (mn < sg.crest[0] - MTOL || mx > sg.crest[1] + MTOL) {
      it.status = mx > sg.crest[1] ? 'over' : 'under';
      it.hint = 'A full knurl adds 0.020 in to the blank diameter, so the blank decides this size. ' +
        (mx > sg.crest[1] ? 'Undo back before knurling and turn the blank smaller, to about ' + dia(sg.blank) + '.' : 'The blank was too small: about ' + dia(sg.blank) + ' gives ' + dia(sg.blank + 0.02) + '.');
      return;
    }
    it.status = 'ok';
  }

  function chamferCheck(it, p, zF, c, T, parted, frontIdx, backIdx) {
    var i, legZ, legR, base, sg;
    if (c.edge === 'back-od' && !parted) {
      it.made = 'Measured once the part is cut off'; it.status = 'pending';
      it.hint = 'The back edge can be chamfered before parting: plunge the chamfer tool where the blade will cut, at Z ' + fmt(zF - T.length.L) + '.';
      return;
    }
    var lo = c.c - c.tol, hi = c.c + c.tol;
    if (c.edge === 'front-bore') {
      var colsB = columnsBetween(p, zF, 0.08, 0.10);
      if (!colsB.length || p.ri[colsB[0]] < 0.005) { it.made = 'No hole yet'; it.status = 'missing'; it.hint = 'Make the hole first, then chamfer its mouth with the countersink.'; return; }
      base = envIn(p, colsB[0]);
      legR = Math.max(0, p.ri[frontIdx] - base);
      var cntB = 0;
      for (i = frontIdx; i >= 0 && has(p, i) && envIn(p, i) > base + 0.0003; i--) { cntB++; }
      legZ = cntB * COL;
      legVerdict(it, legZ, legR, lo, hi, 'Feed the countersink in further, about ' + inch(Math.max(0.001, c.c - Math.min(legR, legZ))) + ' more.');
      if (it.status === 'ok') { chamferProfile(it, p, frontIdx, -1, base, legR, hi, true); }
      return;
    }
    var front = c.edge === 'front-od';
    sg = front ? T.outside[0] : T.outside[T.outside.length - 1];
    var edgeIdx = front ? frontIdx : backIdx, dir = front ? -1 : 1;
    var refCols = columnsBetween(p, zF, front ? sg.from + hi + 0.02 : sg.to - hi - 0.03, front ? sg.from + hi + 0.03 : sg.to - hi - 0.02);
    if (!refCols.length || !has(p, edgeIdx)) { it.made = 'Cannot measure'; it.status = 'missing'; it.hint = ''; return; }
    base = envOut(p, refCols[0]);
    if (sg.kind === 'plain' || sg.kind === 'groove') {
      legR = Math.max(0, base - p.ro[edgeIdx]);
      var cnt = 0;
      for (i = edgeIdx; i >= 0 && i < p.n && has(p, i) && p.ro[i] < base - 0.0003; i += dir) { cnt++; }
      legZ = cnt * COL;
      legVerdict(it, legZ, legR, lo, hi, null);
      if (it.status === 'ok') { chamferProfile(it, p, edgeIdx, dir, base, legR, hi, false); }
      return;
    }
    /* A threaded or knurled end: its teeth break up the chamfer's line, so
       test the band. Nothing may stand above the 45 degree line a chamfer at
       the small limit leaves; and no crest may sit below the line a chamfer at
       the large limit leaves. Crests are the columns at the local top. */
    var above = 0, below = 0, k, s, est = [];
    for (k = 0, i = edgeIdx; i >= 0 && i < p.n && has(p, i) && k * COL <= hi + 0.08; k++, i += dir) {
      s = (k + 0.5) * COL;
      if (s < lo) { var lineLo = base - (lo - s); if (p.ro[i] - lineLo > above) { above = p.ro[i] - lineLo; } }
      if (p.ro[i] >= envOut(p, i) - 0.0002) {
        var lineHi = Math.min(base, base - (hi - s));
        if (lineHi - p.ro[i] > below) { below = lineHi - p.ro[i]; }
        if (p.ro[i] < base - 0.001) { est.push(s + (base - p.ro[i])); }
      }
    }
    est.sort(function (a, b) { return a - b; });
    if (above > 0.0015) {
      it.made = est.length ? 'About ' + inch(est[Math.floor(est.length / 2)]) + ' × 45°' : 'Sharp edge';
      it.status = 'over';
      it.hint = above > lo - 0.004 ? 'Break the edge with the chamfer tool before threading: put its point at the corner and plunge.' : 'Plunge the chamfer tool about ' + inch(above) + ' further.';
      return;
    }
    it.made = est.length ? 'About ' + inch(est[Math.floor(est.length / 2)]) + ' × 45°' : 'Chamfered';
    if (below > 0.0015) { it.status = 'under'; it.hint = 'Bigger than the drawing allows. Undo back before that cut.'; return; }
    it.status = 'ok';
  }
  // Equal leg extents can also describe a cylindrical step. Inspect the
  // sloping surface itself, allowing two columns for sampled edge location.
  function chamferProfile(it, p, edgeIdx, dir, base, depth, maxDepth, inside) {
    var error = 0, unrecoverable = false, tolerance = 2 * COL + MTOL;
    for (var k = 0, i = edgeIdx; i >= 0 && i < p.n && has(p, i) && k * COL <= maxDepth + COL; k++, i += dir) {
      var s = (k + 0.5) * COL;
      var removed = inside ? p.ri[i] - base : base - p.ro[i];
      error = Math.max(error, Math.abs(removed - Math.max(0, depth - s)));
      if (removed > Math.max(0, maxDepth - s) + tolerance) { unrecoverable = true; }
    }
    if (error <= tolerance) { return; }
    it.made += ', but the surface is not a 45° chamfer';
    it.status = unrecoverable ? 'under' : 'over';
    it.hint = unrecoverable ? 'The stepped or curved cut removed material below the allowed chamfer. Undo this edge cut and make the sloping chamfer.' : 'The edge needs a sloping 45° surface, not a cylindrical step. Finish it with the chamfer tool or countersink.';
  }
  function legVerdict(it, legZ, legR, lo, hi, smallHint) {
    it.made = legR < 0.004 && legZ < 0.004 ? 'Sharp edge' : inch(legZ) + ' long × ' + inch(legR) + ' deep';
    var big = Math.max(legR, legZ), small = Math.min(legR, legZ);
    if (small >= lo - MTOL && big <= hi + MTOL) { it.status = 'ok'; return; }
    if (big > hi + MTOL) { it.status = 'under'; it.hint = 'Bigger than the drawing allows. Undo back before that cut.'; return; }
    it.status = 'over';
    it.hint = smallHint || (legR < 0.004 && legZ < 0.004 ? 'Break the edge with the chamfer tool: put its point at the corner and plunge.' : 'Plunge the chamfer tool about ' + inch(Math.max(0.001, (lo + hi) / 2 - small)) + ' further.');
  }

  /* Replay a list of learner actions: the tests and the page's printed
     figures use it, so a figure is a state the simulator can actually reach.
       ['sp', on]  ['tool', id]  ['drill', id]  ['tpi', n]
       ['mv', z, x]  ['z', z]  ['x', x]  ['th', zStop]                      */
  function play(st, ops) {
    var log = [];
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k], r = null;
      switch (op[0]) {
        case 'sp': setSpindle(st, op[1]); break;
        case 'tool': r = selectTool(st, op[1]); break;
        case 'drill': r = setDrill(st, op[1]); break;
        case 'tpi': r = setPitch(st, op[1]); break;
        case 'mv': r = move(st, op[1], op[2]); break;
        case 'z': r = move(st, op[1], st.tr * 2); break;
        case 'x': r = move(st, st.tz, op[1]); break;
        case 'th': r = threadPass(st, op[1]); break;
        default: throw new Error('unknown action: ' + op[0]);
      }
      log.push({ op: op, r: r });
    }
    return log;
  }

  return {
    COL: COL, STEP: STEP, WINDOW: WINDOW, SLACK: SLACK, play: play,
    TOOLS: TOOLS, TOOL_ORDER: TOOL_ORDER, DRILLS: DRILLS, PITCHES: PITCHES, TARGETS: TARGETS,
    target: target, minBore: minBore, drillSize: drillSize, hasThreads: hasThreads, knurlContact: knurlContact,
    create: create, snapshot: snapshot, restore: restore, position: position, limits: limits,
    parkFor: parkFor, jawTop: jawTop, JAW_LEN: JAW_LEN, JAW_UP: JAW_UP, BODY_UP: BODY_UP,
    selectTool: selectTool, setSpindle: setSpindle, setDrill: setDrill, setPitch: setPitch,
    move: move, threadPass: threadPass, explain: explain,
    profileAt: profileAt, compare: compare, measureAt: measureAt, evaluate: evaluate,
    frontZ: frontZ, has: has, zc: zc, colAt: colAt, envOut: envOut, envIn: envIn, outerEnvelope: outerEnvelope, innerEnvelope: innerEnvelope, shoulderFace: shoulderFace,
    fmt: fmt, fmtSigned: fmtSigned, inch: inch, dia: dia, round: round, MINUS: MINUS
  };
});

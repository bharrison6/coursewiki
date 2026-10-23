/* ============================================================================
   gcode-playground / gcode.js - read a G-code program and say what it commands.

   A pure interpreter for a small, declared teaching subset of milling G-code,
   modelled on the LinuxCNC dialect. Text in, a list of lines out: for every
   line the words it holds, the machine state after it, what it commands (in
   order) and a plain-language account. Nothing here knows where the metal
   is; machine.js runs these commands against the milling simulator's block.

   WHAT IS SUPPORTED, AND HOW STRICTLY
     G0 G1 G2 G3 G80 G81   motion; straight moves are straight lines in X, Y
                           and Z together, arcs turn in the XY plane only
     G17 G20 G21 G40 G49 G54 G90 G91 G90.1 G91.1 G94 G98 G99
     M2 M30 M3 M5 M6 M8 M9, and the words F S T N X Y Z I J R
   Every other code is reported at its line as not supported, and every
   malformed line is reported as an error: nothing is skipped quietly. The
   first problem stops the program there, as a control would.

   Some rules are the simulator's own, stricter than a real control, so the
   program has to say what it means: units and distance mode must be set
   before the first move, units cannot change after it, a drilling cycle
   needs G98 or G99, and a tool change needs the spindle stopped and the
   tool raised to the change height. Each says so where it stops a program.

   Units inside: millimetres, in the setup's work coordinates (X0 Y0 the
   front-left corner of the block, Z0 its finished top). Inch programs are
   converted on the way in and shown in inches on the way out.
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('../milling-simulator/model.js') : root.CourseWikiMillingSim);
  if (node) module.exports = api;
  else root.CourseWikiGcode = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  var INCH = 25.4;
  var EPS = 1e-6;
  var S = M.SETUP;
  var MACHINE = {
    home: { x: S.home.x, y: S.home.y, z: S.home.z },
    travel: S.travel,
    toolChangeZ: S.clearZ,
    rapid: 5000              // mm/min, the simulator's rapid rate for timing
  };

  /* ---- the tool table -----------------------------------------------------
     Tool numbers point at the milling simulator's own tools, so the cut is
     that tool's real size and obeys its rules (a drill cannot cut sideways,
     a face mill cannot plunge). */
  var TOOL_TABLE = [
    { t: 1, sim: 'em10' },
    { t: 2, sim: 'em6' },
    { t: 3, sim: 'dr6' },
    { t: 4, sim: 'sp12' },
    { t: 5, sim: 'fm50' }
  ];
  TOOL_TABLE.forEach(function (e) { e.tool = M.TOOL_BY_ID[e.sim]; e.label = M.toolLabel(e.tool); });
  function toolEntry(t) {
    for (var k = 0; k < TOOL_TABLE.length; k++) if (TOOL_TABLE[k].t === t) return TOOL_TABLE[k];
    return null;
  }

  /* ---- the codes ------------------------------------------------------------
     group: the modal group (two codes of one group on a line is an error).
     no:    why it is not supported here. */
  var G = {
    '0': { group: 'motion' }, '1': { group: 'motion' }, '2': { group: 'motion' }, '3': { group: 'motion' },
    '80': { group: 'motion' }, '81': { group: 'motion' },
    '17': { group: 'plane' }, '20': { group: 'units' }, '21': { group: 'units' },
    '40': { group: 'comp' }, '49': { group: 'length' }, '54': { group: 'coord' },
    '90': { group: 'dist' }, '91': { group: 'dist' }, '90.1': { group: 'arcdist' }, '91.1': { group: 'arcdist' },
    '94': { group: 'feedmode' }, '98': { group: 'retract' }, '99': { group: 'retract' }
  };
  var G_NO = [
    [['18', '19'], 'Only the XY plane (G17) is supported here, so arcs in the XZ plane (G18) and YZ plane (G19) are not.'],
    [['4'], 'Dwell (G4) is not supported in this simulator.'],
    [['5', '5.1', '5.2', '5.3'], 'Splines (G5) are not supported in this simulator.'],
    [['7', '8'], 'G7 and G8 are lathe diameter and radius modes.'],
    [['10'], 'Setting offsets from the program (G10) is not supported here.'],
    [['28', '28.1', '30', '30.1', '53'], 'Machine-coordinate and return-to-home moves (G28, G30, G53) are not modelled. This simulator has only the work coordinates of its one setup.'],
    [['33', '33.1', '76'], 'Threading cycles are not supported in this simulator.'],
    [['38.2', '38.3', '38.4', '38.5'], 'Probing moves are not supported in this simulator.'],
    [['41', '41.1', '42', '42.1'], 'Cutter radius compensation (G41/G42) is not modelled. Program the path of the tool’s centre instead, one tool radius away from the wall.'],
    [['43', '43.1', '43.2'], 'Tool length offsets (G43) are not modelled: in this simulator Z is always the tip of the tool.'],
    [['52', '92', '92.1', '92.2', '92.3'], 'Coordinate shifts (G52, G92) are not supported in this simulator.'],
    [['55', '56', '57', '58', '59', '59.1', '59.2', '59.3'], 'This setup has one work offset, G54. Other work offsets are not modelled.'],
    [['61', '61.1', '64'], 'Path blending modes are not modelled: every move here stops exactly at its end point.'],
    [['73', '74', '82', '83', '84', '85', '86', '87', '88', '89'], 'Of the canned cycles, only plain drilling (G81) is supported here.'],
    [['93', '95'], 'Only feed in units per minute (G94) is supported here.'],
    [['96', '97'], 'G96 and G97 are spindle-speed modes not modelled here: the spindle speed is S, in rpm.']
  ];
  var M_CODES = {
    2: { group: 'stop' }, 30: { group: 'stop' }, 6: { group: 'toolchange' },
    3: { group: 'spindle' }, 5: { group: 'spindle' }, 8: { group: 'coolant' }, 9: { group: 'coolant' }
  };
  var M_NO = [
    [[0, 1, 60], 'Program pauses (M0, M1) are not supported here. Use the simulator’s Pause and Step instead.'],
    [[4], 'A counterclockwise spindle (M4) is not modelled. This simulator’s cutters are right-hand and cut with M3.'],
    [[7], 'Mist coolant (M7) is not modelled here.'],
    [[98, 99], 'Subprograms (M98, M99) are not supported here.']
  ];
  var LETTER_NO = {
    A: 'This is a three-axis mill: there is no A axis.', B: 'This is a three-axis mill: there is no B axis.',
    C: 'This is a three-axis mill: there is no C axis.', U: 'There is no U axis on this mill.',
    V: 'There is no V axis on this mill.', W: 'There is no W axis on this mill.',
    K: 'K is an arc centre offset along Z, used only by G18 and G19 arcs, which are not supported here.',
    P: 'P belongs to codes this simulator does not support (dwells, arc turns, cycle dwells).',
    Q: 'Q belongs to peck-drilling cycles, which are not supported here.',
    L: 'L (repeat count) is not supported here.',
    H: 'H selects a tool length offset, which is not modelled here.',
    D: 'D selects a cutter compensation offset, which is not modelled here.',
    E: 'E is not used by this simulator.',
    O: 'O-word subroutines and loops are not supported here.'
  };

  function gKey(v) { return String(Math.round(v * 10) / 10); }
  function unsupportedG(key) {
    for (var k = 0; k < G_NO.length; k++) if (G_NO[k][0].indexOf(key) >= 0) return G_NO[k][1];
    return null;
  }
  function unsupportedM(n) {
    for (var k = 0; k < M_NO.length; k++) if (M_NO[k][0].indexOf(n) >= 0) return M_NO[k][1];
    return null;
  }

  /* ---- number formats --------------------------------------------------------*/
  /* Short, for sentences: 20, -3.5, 0.125 (with a true minus sign). */
  function short(v, dp) {
    var p = Math.pow(10, dp), r = Math.round(v * p) / p;
    if (Object.is(r, -0) || Math.abs(r) < 0.5 / p) r = 0;
    var s = String(r);
    if (/e/.test(s)) s = r.toFixed(dp);
    return s.charAt(0) === '-' ? '−' + s.slice(1) : s;
  }
  function unitDp(units) { return units === 'in' ? 4 : 3; }
  function scaleOf(units) { return units === 'in' ? INCH : 1; }
  function inUnits(mm, units) { return mm / scaleOf(units); }
  function say(mm, units) { return short(inUnits(mm, units), unitDp(units)); }
  function unitName(units) { return units === 'in' ? 'in' : 'mm'; }
  function feedName(units) { return units === 'in' ? 'in/min' : 'mm/min'; }

  /* ======================================================================
     Reading one line
     ====================================================================*/
  function problem(kind, message, col) { return { kind: kind, message: message, col: col == null ? null : col }; }

  function parseLine(raw) {
    var out = { raw: raw, comments: [], words: [], blank: false, marker: false, errors: [] };
    var code = '', i, ch, j;
    for (i = 0; i < raw.length; i++) {
      ch = raw.charAt(i);
      if (ch === '(') {
        j = raw.indexOf(')', i + 1);
        if (j < 0) { out.errors.push(problem('syntax', 'This comment is never closed: a “(” needs a matching “)” on the same line.', i)); break; }
        var inner = raw.slice(i + 1, j);
        if (inner.indexOf('(') >= 0) { out.errors.push(problem('syntax', 'A comment cannot contain another “(”.', i)); break; }
        out.comments.push(inner.trim());
        i = j;
        continue;
      }
      if (ch === ')') { out.errors.push(problem('syntax', 'There is a “)” here with no “(” before it.', i)); break; }
      if (ch === ';') { out.comments.push(raw.slice(i + 1).trim()); break; }
      code += ch;
    }
    if (out.errors.length) return out;
    // Spaces and tabs mean nothing in G-code outside comments, and case does not matter.
    code = code.replace(/\s+/g, '').toUpperCase();
    if (!code) { out.blank = !out.comments.length; return out; }
    if (code === '%') { out.marker = true; return out; }
    if (code.charAt(0) === '/') { out.errors.push(problem('unsupported', 'Block delete (a line starting with “/”) is not supported here.')); return out; }
    if (code.charAt(0) === 'O') { out.errors.push(problem('unsupported', 'O-word subroutines and loops are not supported here.')); return out; }
    var param = /[#\[]/.exec(code);
    if (param) {
      out.errors.push(problem('unsupported', 'Parameters and expressions (' + param[0] + ') are not supported here: write each number out.'));
      return out;
    }
    var k = 0;
    while (k < code.length) {
      ch = code.charAt(k);
      if (!/[A-Z]/.test(ch)) {
        out.errors.push(problem('syntax', '“' + ch + '” is not allowed here. Every word is a letter followed by a number, like X20 or G1.'));
        return out;
      }
      var m = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(code.slice(k + 1));
      if (!m) {
        out.errors.push(problem('syntax', ch + ' has no number after it. Every word is a letter followed by a number, like ' + ch + '10.'));
        return out;
      }
      out.words.push({ letter: ch, text: m[0], value: Number(m[0]) });
      k += 1 + m[0].length;
    }
    return out;
  }

  /* Sort a parsed line's words into codes and values, and catch everything
     that is wrong with the line by itself, whatever comes before it. */
  function classify(p) {
    var c = { g: {}, gList: [], m: {}, mList: [], v: {}, vText: {}, n: null, errors: p.errors.slice() };
    if (c.errors.length) return c;
    p.words.forEach(function (w, idx) {
      if (c.errors.length) return;
      var L = w.letter;
      if (L === 'N') {
        if (idx !== 0) c.errors.push(problem('syntax', 'A line number (N) has to come first on its line.'));
        else if (c.n != null) c.errors.push(problem('syntax', 'Two line numbers on one line.'));
        else if (!/^\d+$/.test(w.text)) c.errors.push(problem('syntax', 'A line number is a whole number, like N10.'));
        else c.n = w.value;
        return;
      }
      if (L === 'G') {
        var key = gKey(w.value);
        if (Math.abs(Number(key) - w.value) > 1e-9 || w.value < 0) { c.errors.push(problem('syntax', 'G' + w.text + ' is not a G-code.')); return; }
        if (!G[key]) {
          var why = unsupportedG(key);
          c.errors.push(why ? problem('unsupported', 'G' + key + ' is not supported here. ' + why) :
            problem('syntax', 'G' + key + ' is not a G-code this simulator knows.'));
          return;
        }
        var grp = G[key].group;
        if (c.g[grp] != null) { c.errors.push(problem('syntax', 'G' + c.g[grp] + ' and G' + key + ' are in the same group, so they cannot share a line.')); return; }
        c.g[grp] = key; c.gList.push(key);
        return;
      }
      if (L === 'M') {
        if (!/^\d+$/.test(w.text)) { c.errors.push(problem('syntax', 'M' + w.text + ' is not an M-code: M-codes are whole numbers.')); return; }
        var n = w.value;
        if (!M_CODES[n]) {
          var whyM = unsupportedM(n);
          c.errors.push(problem('unsupported', 'M' + n + ' is not supported here.' + (whyM ? ' ' + whyM : '')));
          return;
        }
        var mg = M_CODES[n].group;
        if (c.m[mg] != null) { c.errors.push(problem('syntax', 'M' + c.m[mg] + ' and M' + n + ' are in the same group, so they cannot share a line.')); return; }
        c.m[mg] = n; c.mList.push(n);
        return;
      }
      if (LETTER_NO[L]) { c.errors.push(problem('unsupported', L + ' words are not supported here. ' + LETTER_NO[L])); return; }
      if ('XYZIJRFST'.indexOf(L) < 0) { c.errors.push(problem('syntax', L + ' is not a G-code word.')); return; }
      if (c.v[L] != null) { c.errors.push(problem('syntax', 'There are two ' + L + ' words on this line. Each letter can appear once.')); return; }
      c.v[L] = w.value; c.vText[L] = w.text;
    });
    if (!c.errors.length) {
      if (c.v.T != null && !/^\d+$/.test(c.vText.T)) c.errors.push(problem('syntax', 'A tool number is a whole number, like T1.'));
      else if (c.v.F != null && c.v.F < 0) c.errors.push(problem('program', 'A feed rate cannot be negative.'));
      else if (c.v.S != null && c.v.S < 0) c.errors.push(problem('program', 'A spindle speed cannot be negative: the direction is M3, the speed is S.'));
    }
    return c;
  }

  /* ======================================================================
     The machine state the program builds
     ====================================================================*/
  function initialState() {
    return {
      units: null, dist: null, arcDist: 'inc', motion: null, motionLine: null,
      feed: null, feedLine: null, rpm: 0, spindle: false, coolant: false,
      tool: null, nextTool: null, retract: null, cycle: null,
      pos: { x: MACHINE.home.x, y: MACHINE.home.y, z: MACHINE.home.z },
      moved: false, ended: false
    };
  }
  function copyState(st) {
    return {
      units: st.units, dist: st.dist, arcDist: st.arcDist, motion: st.motion, motionLine: st.motionLine,
      feed: st.feed, feedLine: st.feedLine, rpm: st.rpm, spindle: st.spindle, coolant: st.coolant,
      tool: st.tool, nextTool: st.nextTool, retract: st.retract,
      cycle: st.cycle ? { z: st.cycle.z, r: st.cycle.r, oldZ: st.cycle.oldZ } : null,
      pos: { x: st.pos.x, y: st.pos.y, z: st.pos.z }, moved: st.moved, ended: st.ended
    };
  }

  var AXES = ['X', 'Y', 'Z'];
  function q(v) { return Math.round(v * 1e7) / 1e7; }
  function same(a, b) { return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.z - b.z) < EPS; }

  /* ---- travel -------------------------------------------------------------*/
  function travelProblem(pts, units) {
    var T = MACHINE.travel, names = { x: ['X', T.x0, T.x1], y: ['Y', T.y0, T.y1], z: ['Z', T.z0, T.z1] };
    for (var k = 0; k < pts.length; k++) {
      for (var a in names) {
        var v = pts[k][a], lim = names[a];
        if (v < lim[1] - EPS || v > lim[2] + EPS) {
          return problem('program', 'This move goes past the end of the machine’s travel: ' + lim[0] + ' would reach ' +
            say(v, units) + ' ' + unitName(units) + ', and this machine’s ' + lim[0] + ' travel runs from ' +
            say(lim[1], units) + ' to ' + say(lim[2], units) + ' ' + unitName(units) + '.');
        }
      }
    }
    return null;
  }

  /* ---- arcs ------------------------------------------------------------------
     G2 turns clockwise and G3 counterclockwise, seen from above (from +Z,
     looking down on the XY plane). Returns the arc, or a problem. */
  function arcGeometry(from, to, c, cw, units) {
    var tol = 1e-4;
    var r0 = Math.hypot(from.x - c.x, from.y - c.y), r1 = Math.hypot(to.x - c.x, to.y - c.y);
    if (r0 < 1e-4) return problem('program', 'The arc’s centre is on its start point, so it has no radius. Check I and J: they are measured from the start of the arc.');
    var diff = Math.abs(r1 - r0);
    if (diff > Math.max(0.005, 0.001 * r0)) {
      return problem('program', 'The end point is not on the arc’s circle: it is ' + say(r1, units) + ' ' + unitName(units) +
        ' from the centre, but the start is ' + say(r0, units) + ' ' + unitName(units) + ' from it. Check the end point and I, J.');
    }
    var a0 = Math.atan2(from.y - c.y, from.x - c.x), a1 = Math.atan2(to.y - c.y, to.x - c.x);
    var full = Math.hypot(to.x - from.x, to.y - from.y) < tol;
    var sweep;
    if (full) sweep = cw ? -2 * Math.PI : 2 * Math.PI;
    else if (cw) { sweep = a1 - a0; while (sweep >= 0) sweep -= 2 * Math.PI; while (sweep < -2 * Math.PI) sweep += 2 * Math.PI; }
    else { sweep = a1 - a0; while (sweep <= 0) sweep += 2 * Math.PI; while (sweep > 2 * Math.PI) sweep -= 2 * Math.PI; }
    return { cx: c.x, cy: c.y, r: r0, r1: r1, a0: a0, sweep: sweep, cw: cw, full: full };
  }
  /* Points along an arc, for travel checks and for drawing. */
  function arcPoints(from, arc, to, maxStep) {
    var n = Math.max(2, Math.ceil(Math.abs(arc.sweep) / (maxStep || Math.PI / 36)));
    var pts = [];
    for (var k = 0; k <= n; k++) {
      var f = k / n, a = arc.a0 + arc.sweep * f, r = arc.r + (arc.r1 - arc.r) * f;
      pts.push(k === n ? { x: to.x, y: to.y, z: to.z } : { x: arc.cx + r * Math.cos(a), y: arc.cy + r * Math.sin(a), z: from.z });
    }
    return pts;
  }

  /* ======================================================================
     Interpreting a whole program
     ====================================================================*/
  function interpret(source) {
    // A list of lines is taken as it is; a text is split into lines, without
    // the empty one after a final newline.
    var texts;
    if (Array.isArray(source)) texts = source.map(function (t) { return String(t); });
    else {
      var src = String(source == null ? '' : source).replace(/\r\n?/g, '\n');
      texts = src === '' ? [] : src.split('\n');
      if (texts.length > 1 && texts[texts.length - 1] === '') texts.pop();
    }
    var lines = texts.map(function (t, i) {
      var p = parseLine(t);
      return { index: i, text: t, parsed: p, c: classify(p), ops: [], explain: '', error: null, run: false };
    });
    var st = initialState(), program = { lines: lines, error: null, ended: -1, staticErrors: [] };
    lines.forEach(function (ln) { if (ln.c.errors.length) program.staticErrors.push({ line: ln.index, kind: ln.c.errors[0].kind, message: ln.c.errors[0].message }); });

    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (st.ended) { ln.after = 'end'; ln.state = copyState(st); continue; }
      var res = runLine(ln, st);
      ln.state = copyState(st);
      if (res) {
        ln.error = res;
        ln.ops = [];
        program.error = { line: i, kind: res.kind, message: res.message };
        for (var k = i + 1; k < lines.length; k++) { lines[k].after = 'error'; lines[k].state = copyState(st); }
        break;
      }
      ln.run = true;
      if (st.ended) program.ended = i;
    }
    program.endState = copyState(st);
    program.moves = [];
    lines.forEach(function (l) { l.ops.forEach(function (o) { if (o.op === 'move') program.moves.push(o); }); });
    program.hasEnd = program.ended >= 0;
    return program;
  }

  /* One line, in the order a control carries out the parts of a line:
     feed, speed, tool, tool change, spindle, coolant, the modes, then the
     motion, then the program end. Returns a problem or null. */
  function runLine(ln, st) {
    var c = ln.c, p = ln.parsed, said = [];
    if (c.errors.length) return c.errors[0];
    if (p.blank) { ln.explain = 'A blank line. The machine skips it.'; return null; }
    if (p.marker) { ln.explain = 'A “%” marks the start or end of a program file. The machine does nothing here.'; return null; }
    if (!p.words.length) { ln.explain = 'A comment, for people reading the program. The machine ignores it.'; return null; }
    var v = c.v;

    if (v.F != null) { st.feed = v.F; st.feedLine = ln.index; }
    if (v.S != null) st.rpm = v.S;
    if (v.T != null) {
      var te = toolEntry(v.T);
      if (!te) return problem('program', 'There is no T' + v.T + ' in this simulator’s tool table. Its tools are ' +
        TOOL_TABLE.map(function (e) { return 'T' + e.t; }).join(', ') + '.');
      st.nextTool = v.T;
    }
    if (c.m.toolchange === 6) {
      if (st.nextTool == null) return problem('program', 'M6 changes to the tool chosen by a T word, and no tool has been chosen. Put T and a number on this line or before it, like T1 M6.');
      if (st.spindle) return problem('program', 'The spindle is still turning. This simulator needs it stopped (M5) before a tool change.');
      var unitsForZ = st.units || 'mm';
      if (st.pos.z < MACHINE.toolChangeZ - 1e-9) {
        return problem('program', 'The tool is at Z ' + say(st.pos.z, unitsForZ) + '. In this simulator a tool change needs Z ' +
          say(MACHINE.toolChangeZ, unitsForZ) + ' ' + unitName(unitsForZ) + ' or higher, clear of the work, and it does not move the tool there for you. Add a G0 Z move before M6.');
      }
      var e = toolEntry(st.nextTool);
      if (st.tool === st.nextTool) said.push('Tool ' + e.t + ' is already in the spindle.');
      else said.push('Changes to tool ' + e.t + ': ' + M.toolNoun(e.tool) + '.');
      st.tool = st.nextTool;
      ln.ops.push({ op: 'tool', t: e.t, sim: e.sim, label: e.label, line: ln.index });
    } else if (v.T != null) {
      said.push('Gets tool ' + v.T + ' ready. It goes into the spindle at the next M6.');
    }
    if (c.m.spindle === 3) {
      if (!(st.rpm > 0)) return problem('program', 'M3 starts the spindle, but no speed has been set. Give an S word (rpm) on this line or before it, like S2500 M3.');
      st.spindle = true;
      said.push('Spindle on, turning clockwise at ' + short(st.rpm, 0) + ' rpm.');
      ln.ops.push({ op: 'spindle', on: true, rpm: st.rpm, line: ln.index });
    } else if (c.m.spindle === 5) {
      st.spindle = false;
      said.push('Spindle stops.');
      ln.ops.push({ op: 'spindle', on: false, rpm: st.rpm, line: ln.index });
    } else if (v.S != null) {
      said.push(st.spindle ? 'Spindle speed changes to ' + short(st.rpm, 0) + ' rpm.' : 'Sets the spindle speed to ' + short(st.rpm, 0) + ' rpm for when it starts.');
      if (st.spindle) ln.ops.push({ op: 'spindle', on: true, rpm: st.rpm, line: ln.index });
    }
    if (c.m.coolant === 8) { st.coolant = true; said.push('Coolant on (shown only: coolant does not change the cut here).'); ln.ops.push({ op: 'coolant', on: true, line: ln.index }); }
    if (c.m.coolant === 9) { st.coolant = false; said.push('Coolant off.'); ln.ops.push({ op: 'coolant', on: false, line: ln.index }); }

    var g = c.g, modes = [];
    if (g.plane) modes.push('arcs in the XY plane (G17)');
    if (g.units) {
      var u = g.units === '20' ? 'in' : 'mm';
      if (st.moved && st.units && st.units !== u) {
        return problem('program', 'The units are changed after the machine has started moving. In this simulator G20 or G21 is set once, before the first move.');
      }
      st.units = u;
      modes.push(u === 'in' ? 'inches (G20)' : 'millimetres (G21)');
    }
    if (g.comp) modes.push('no cutter compensation (G40): the program is the path of the tool’s centre');
    if (g.length) modes.push('no tool length offset (G49): Z is the tip of the tool');
    if (g.coord) modes.push('the work offset of this setup (G54)');
    if (g.dist) {
      st.dist = g.dist === '90' ? 'abs' : 'inc';
      modes.push(st.dist === 'abs' ? 'absolute positions (G90), measured from work zero' : 'incremental moves (G91), measured from where the tool is');
    }
    if (g.arcdist) {
      st.arcDist = g.arcdist === '90.1' ? 'abs' : 'inc';
      modes.push(st.arcDist === 'abs' ? 'arc centres I and J as positions (G90.1)' : 'arc centres I and J measured from the arc’s start (G91.1)');
    }
    if (g.feedmode) modes.push('feed in units per minute (G94)');
    if (g.retract) {
      st.retract = g.retract === '98' ? 'G98' : 'G99';
      modes.push(g.retract === '98' ? 'drilling cycles rise back to the starting height (G98)' : 'drilling cycles rise back to the R plane (G99)');
    }
    if (modes.length) said.push('Sets ' + list(modes) + '.');

    var mres = motion(ln, st, said);
    if (mres) return mres;
    if (v.F != null && !ln.ops.some(function (o) { return o.op === 'move'; })) {
      said.unshift('Sets the feed rate to ' + short(v.F, 3) + ' ' + (st.units ? feedName(st.units) : 'units per minute') + ' for the feed moves that follow.');
    }

    if (c.m.stop === 2 || c.m.stop === 30) {
      st.ended = true;
      // LinuxCNC M2/M30 reset the supported modal state after this line's
      // motion, as well as stopping spindle and coolant. Neither moves Z.
      st.spindle = false; st.coolant = false;
      st.dist = 'abs'; st.motion = 'G1'; st.motionLine = ln.index; st.cycle = null;
      said.push('Ends the program (M' + c.m.stop + '), stops the spindle and coolant, and resets distance mode to G90 and motion to G1. The tool stays where the last move left it.');
      ln.ops.push({ op: 'end', code: c.m.stop, line: ln.index });
    }
    if (p.comments.length && said.length) said.push('The comment is for people reading the program.');
    ln.explain = said.join(' ') || 'This line changes nothing.';
    return null;
  }

  function list(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  /* ---- motion ------------------------------------------------------------- */
  function motion(ln, st, said) {
    var c = ln.c, v = c.v;
    var gm = c.g.motion;
    var hasAxis = v.X != null || v.Y != null || v.Z != null;
    var hasArcWord = v.I != null || v.J != null;
    var prevMotion = st.motion, prevLine = st.motionLine;
    if (gm != null) {
      var newMode = gm === '80' ? null : 'G' + gm;
      if (newMode !== 'G81' || prevMotion !== 'G81') st.cycle = null;
      st.motion = newMode; st.motionLine = ln.index;
      if (gm === '80') {
        if (hasAxis || hasArcWord || v.R != null) return problem('program', 'G80 cancels the drilling cycle, so it cannot carry X, Y, Z, I, J or R words on its line.');
        said.push(prevMotion === 'G81' ? 'Cancels the drilling cycle (G80): from here, X, Y and Z words alone do not drill.' : 'Cancels any motion mode (G80).');
        return null;
      }
    }
    var mode = st.motion;
    // A line with axis words and no motion code moves in the mode already in force.
    var fromLine = gm == null && mode ? mode + ' from line ' + (st.motionLine + 1) + ' is still in force, so this line ' : '';
    if (!mode) {
      if (hasAxis || hasArcWord || v.R != null) {
        return problem('program', prevLine == null && gm == null ? 'X, Y or Z with no motion mode yet: start the first move with G0 (rapid) or G1 (feed).'
          : 'X, Y or Z with no motion mode in force (G80 cancelled it). Say how to move: G0, G1, G2, G3 or G81.');
      }
      return null;
    }
    var isArc = mode === 'G2' || mode === 'G3';
    if (!isArc && hasArcWord) return problem('program', 'I and J give the centre of an arc, so they only mean something with G2 or G3.');
    if (mode !== 'G81' && !isArc && v.R != null) return problem('program', 'R is an arc radius (G2, G3) or a drilling cycle’s retract plane (G81). It means nothing with ' + mode + '.');
    var moves = isArc ? (hasAxis || hasArcWord || v.R != null) : mode === 'G81' ? (hasAxis || gm === '81') : hasAxis;
    if (!moves) {
      if (gm != null) said.push(mode === 'G0' ? 'Sets rapid motion (G0) for the moves that follow.' : mode === 'G1' ? 'Sets feed motion (G1) for the moves that follow.' :
        'Sets ' + (mode === 'G2' ? 'clockwise' : 'counterclockwise') + ' arcs (' + mode + ') for the moves that follow.');
      return null;
    }
    if (!st.units) return problem('program', 'No units yet. This simulator needs G21 (millimetres) or G20 (inches) before the first move, so every number has a meaning.');
    if (!st.dist) return problem('program', 'No distance mode yet. This simulator needs G90 (absolute) or G91 (incremental) before the first move.');

    var sc = scaleOf(st.units), units = st.units, from = { x: st.pos.x, y: st.pos.y, z: st.pos.z };
    if (mode === 'G81') return cycle(ln, st, said, from, fromLine);

    var to = { x: from.x, y: from.y, z: from.z }, given = [];
    AXES.forEach(function (A) {
      var a = A.toLowerCase();
      if (v[A] == null) return;
      to[a] = q(st.dist === 'abs' ? v[A] * sc : from[a] + v[A] * sc);
      given.push(A);
    });
    var kept = AXES.filter(function (A) { return given.indexOf(A) < 0; });

    if (mode === 'G0' || mode === 'G1') {
      var feedMm = null;
      if (mode === 'G1') {
        if (st.feed == null) return problem('program', 'G1 feeds at the feed rate, and none has been set. Add F and a rate (' + feedName(units) + ') on this line or before it, like F300.');
        if (!(st.feed > 0)) return problem('program', 'The feed rate is zero, so a G1 move would never arrive. Set F above zero.');
        feedMm = st.feed * sc;
      }
      var tp = travelProblem([to], units);
      if (tp) return tp;
      var mv = { op: 'move', kind: mode === 'G0' ? 'rapid' : 'feed', from: from, to: to, feed: feedMm, line: ln.index };
      ln.ops.push(mv);
      st.pos = { x: to.x, y: to.y, z: to.z };
      st.moved = true;
      said.push(describeLine(mode, from, to, given, kept, st, fromLine));
      return null;
    }

    // ---- arcs
    var cw = mode === 'G2';
    if (st.feed == null) return problem('program', mode + ' feeds at the feed rate, and none has been set. Add F and a rate (' + feedName(units) + ') on this line or before it.');
    if (!(st.feed > 0)) return problem('program', 'The feed rate is zero, so the arc would never finish. Set F above zero.');
    if (v.Z != null && Math.abs(to.z - from.z) > EPS) {
      return problem('unsupported', 'This arc also moves Z, which makes a helix. Helical moves are not modelled here: move Z on its own line, then cut the arc.');
    }
    var centre;
    if (v.R != null) {
      if (hasArcWord) return problem('program', 'An arc is given either by its centre (I, J) or by its radius (R), not both.');
      if (v.X == null && v.Y == null) return problem('program', 'An arc given by R needs an end point (X and/or Y).');
      var dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy), R = v.R * sc;
      if (d < 1e-4) return problem('program', 'An arc given by R cannot end where it starts. For a full circle, give the centre with I and J instead.');
      if (Math.abs(R) < 1e-6) return problem('program', 'R0 is not an arc.');
      if (d / 2 > Math.abs(R) + 1e-4) return problem('program', 'R ' + say(Math.abs(R), units) + ' is too small: the end point is ' + say(d, units) + ' ' + unitName(units) + ' away, and an arc of that radius reaches at most ' + say(2 * Math.abs(R), units) + '.');
      var h = Math.sqrt(Math.max(0, R * R - d * d / 4)), mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      // Clockwise with a positive R (less than half a turn): the centre is to the right of the chord.
      var side = (cw ? 1 : -1) * (R > 0 ? 1 : -1);
      centre = { x: mx + side * h * dy / d, y: my - side * h * dx / d };
    } else {
      if (!hasArcWord) return problem('program', 'An arc needs its centre (I and J) or its radius (R).');
      if (st.arcDist === 'abs') {
        if (v.I == null || v.J == null) return problem('program', 'With G90.1, I and J are the centre’s position, so both must be given.');
        centre = { x: v.I * sc, y: v.J * sc };
      } else {
        centre = { x: from.x + (v.I || 0) * sc, y: from.y + (v.J || 0) * sc };
      }
    }
    var arc = arcGeometry(from, to, centre, cw, units);
    if (arc.kind) return arc;
    var tpa = travelProblem(arcPoints(from, arc, to), units);
    if (tpa) return tpa;
    ln.ops.push({ op: 'move', kind: 'arc', from: from, to: to, feed: st.feed * sc, arc: arc, line: ln.index });
    st.pos = { x: to.x, y: to.y, z: to.z };
    st.moved = true;
    var deg = Math.abs(arc.sweep) * 180 / Math.PI;
    said.push((fromLine ? fromLine.charAt(0).toUpperCase() + fromLine.slice(1) + 'cuts a ' + (cw ? 'clockwise' : 'counterclockwise') + ' arc'
      : (cw ? 'Clockwise' : 'Counterclockwise') + ' arc (' + mode + ')') + ' around the centre at X ' + say(arc.cx, units) + ', Y ' + say(arc.cy, units) +
      (v.R != null ? '' : st.arcDist === 'abs' ? ' (I, J as a position)' : ' (I, J measured from the start)') +
      ', radius ' + say(arc.r, units) + ', turning ' + (arc.full ? 'a full circle' : short(deg, 1) + '°') +
      (arc.full ? ' back to X ' : ' to X ') + say(to.x, units) + ', Y ' + say(to.y, units) + ' at ' + short(st.feed, units === 'in' ? 2 : 0) + ' ' + feedName(units) + '.');
    return null;
  }

  function describeLine(mode, from, to, given, kept, st, fromLine) {
    var u = st.units;
    var where = given.map(function (A) { return A + ' ' + say(to[A.toLowerCase()], u); }).join(', ');
    var s = fromLine ? fromLine.charAt(0).toUpperCase() + fromLine.slice(1) + (mode === 'G0' ? 'moves at rapid' : 'feeds') + ' to ' + where
      : (mode === 'G0' ? 'Rapid (G0)' : 'Feeds (G1)') + ' to ' + where;
    if (mode === 'G1') s += ' at ' + short(st.feed, u === 'in' ? 2 : 0) + ' ' + feedName(u);
    s += '.';
    if (st.dist === 'inc') {
      s += ' G91 is in force, so ' + given.map(function (A) {
        var a = A.toLowerCase(), d = to[a] - from[a];
        return A + (d >= 0 ? ' +' : ' ') + say(d, u);
      }).join(', ') + ' from where the tool was.';
    }
    if (kept.length && kept.length < 3) s += ' ' + list(kept) + (kept.length > 1 ? ' are' : ' is') + ' not given, so ' + (kept.length > 1 ? 'they stay' : 'it stays') + '.';
    var moves = ['X', 'Y', 'Z'].filter(function (A) { var a = A.toLowerCase(); return Math.abs(to[a] - from[a]) > EPS; });
    if (!moves.length) s += ' The tool is already there.';
    else if (moves.length > 1) s += ' The axes move together, in one straight line.';
    return s;
  }

  /* ---- G81: the drilling cycle ------------------------------------------------
     Before the hole: if the tool is below R it rises to R; it moves across
     to the hole at rapid; it comes down to R at rapid. Then it feeds to Z,
     and rises at rapid to R (G99) or to where it started the cycles from,
     or R if that is higher (G98). */
  function cycle(ln, st, said, from, fromLine) {
    var v = ln.c.v, units = st.units, sc = scaleOf(units);
    if (st.dist !== 'abs') return problem('unsupported', 'Drilling cycles in incremental mode (G91) are not supported here. Use G90 for the cycle.');
    if (!st.retract) return problem('program', 'A drilling cycle needs to know how high to rise after each hole. Put G98 (back to the starting height) or G99 (back to R) on this line or before it.');
    if (st.feed == null || !(st.feed > 0)) return problem('program', 'G81 feeds down at the feed rate, and none has been set. Add F and a rate (' + feedName(units) + ').');
    var series = st.cycle;
    var z = v.Z != null ? q(v.Z * sc) : series ? series.z : null;
    var r = v.R != null ? q(v.R * sc) : series ? series.r : null;
    if (z == null || r == null) return problem('program', 'G81 needs Z (the bottom of the hole) and R (the height it starts feeding from) on its first line.');
    if (r < z - EPS) return problem('program', 'R ' + say(r, units) + ' is below Z ' + say(z, units) + '. R is the height the drill starts feeding from, so it has to be above the bottom of the hole.');
    var oldZ = series ? series.oldZ : from.z;
    var x = v.X != null ? q(v.X * sc) : from.x, y = v.Y != null ? q(v.Y * sc) : from.y;
    var clear = st.retract === 'G99' ? r : Math.max(oldZ, r);
    var p = { x: from.x, y: from.y, z: from.z }, out = [];
    var go = function (kind, to, role) {
      if (same(p, to)) return;
      out.push({ op: 'move', kind: kind, from: p, to: to, feed: kind === 'feed' ? st.feed * sc : null, line: ln.index, cycle: true, role: role });
      p = to;
    };
    if (p.z < r - EPS) go('rapid', { x: p.x, y: p.y, z: r }, 'up to R');
    go('rapid', { x: x, y: y, z: p.z }, 'across to the hole');
    if (p.z > r + EPS) go('rapid', { x: x, y: y, z: r }, 'down to R');
    go('feed', { x: x, y: y, z: z }, 'drill');
    go('rapid', { x: x, y: y, z: clear }, 'retract');
    var tp = travelProblem(out.map(function (o) { return o.to; }), units);
    if (tp) return tp;
    out.forEach(function (o) { ln.ops.push(o); });
    st.cycle = { z: z, r: r, oldZ: oldZ };
    st.pos = { x: p.x, y: p.y, z: p.z };
    st.moved = true;
    said.push((ln.c.g.motion === '81' ? 'Drilling cycle (G81)' : 'Another hole: ' + fromLine + 'drills') +
      ' at X ' + say(x, units) + ', Y ' + say(y, units) + '. Rapid across, down to R ' + say(r, units) +
      ', feed to Z ' + say(z, units) + ' at ' + short(st.feed, units === 'in' ? 2 : 0) + ' ' + feedName(units) +
      ', then rapid back up to Z ' + say(clear, units) + (st.retract === 'G99' ? ' (G99: the R plane).' : ' (G98: the height the cycles started from' + (clear === r && r > oldZ ? ', or R, which is higher' : '') + ').'));
    return null;
  }

  /* ---- for other modules ---------------------------------------------------- */
  function scale(units) { return scaleOf(units); }

  return {
    INCH: INCH, MACHINE: MACHINE, TOOL_TABLE: TOOL_TABLE, toolEntry: toolEntry,
    parseLine: parseLine, classify: classify, interpret: interpret,
    arcGeometry: arcGeometry, arcPoints: arcPoints,
    short: short, say: say, unitName: unitName, feedName: feedName, scale: scale, unitDp: unitDp,
    SUPPORTED_G: Object.keys(G), SUPPORTED_M: Object.keys(M_CODES).map(Number)
  };
});

'use strict';
/* Focused tests for the G-code playground's interpreter and machine:
   interactives/gcode-playground/gcode.js and machine.js.
   Run: node --test --test-concurrency=2 tests/interactives/gcode-playground.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MOD = path.join(__dirname, '..', '..', 'interactives', 'gcode-playground');
const G = require(path.join(MOD, 'gcode.js'));
const X = require(path.join(MOD, 'machine.js'));
const Sim = require(path.join(__dirname, '..', '..', 'interactives', 'milling-simulator', 'model.js'));

const HEAD = ['G21 G90 G17', 'T1 M6', 'S2500 M3'];
const prog = (lines) => G.interpret(lines.join('\n'));
const run = (lines) => { const p = prog(lines); const m = X.create().load(p); m.runToEnd(); return { p, m }; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const pos = (p) => p.endState.pos;
const moves = (p) => p.moves.map((mv) => ({ kind: mv.kind, from: mv.from, to: mv.to }));

/* ======================================================================
   Reading lines
   ====================================================================*/
test('words, comments, case and spaces are read the way G-code reads them', () => {
  const a = G.parseLine('g1x10 y-.5 (a comment) F 300 ; tail');
  assert.deepEqual(a.words.map((w) => w.letter + w.text), ['G1', 'X10', 'Y-.5', 'F300']);
  assert.deepEqual(a.comments, ['a comment', 'tail']);
  assert.equal(G.parseLine('   ').blank, true);
  assert.equal(G.parseLine('%').marker, true);
  const c = G.classify(G.parseLine('G01 G90.1 X1'));
  assert.equal(c.g.motion, '1');
  assert.equal(c.g.arcdist, '90.1');
});

test('malformed lines are syntax errors at their own line', () => {
  const cases = {
    'G1 X': /X has no number/,
    'G1 X1 X2': /two X words/,
    'G0 G1 X5': /same group/,
    'M3 M5': /same group/,
    '(open comment': /never closed/,
    'G1 X5 )': /no “\(”/,
    'G1 X1.2.3': /not allowed|no number/,
    'X10 N20': /line number/,
    'G7.5': /not a G-code/,
    'Q': /Q words are not supported|no number/
  };
  for (const [line, rx] of Object.entries(cases)) {
    const p = prog([line]);
    assert.ok(p.error, line + ' is rejected');
    assert.equal(p.error.line, 0);
    assert.match(p.error.message, rx, line);
  }
});

test('codes outside the subset are identified as unsupported, never skipped', () => {
  const cases = ['G41 G1 X10 F100', 'G43 H1', 'G18', 'G4 P1', 'G28', 'G55', 'G64', 'G83 X1 Y1 Z-1 R1 Q1', 'G93', 'M4 S100', 'M7', 'M0',
    'G2 X1 Y1 K1', 'G1 A10', '#1=5', 'G1 X[1+2]', '/G1 X1', 'O100 sub'];
  for (const line of cases) {
    const p = prog([...HEAD, line, 'M30']);
    assert.ok(p.error, line + ' stops the program');
    assert.equal(p.error.line, 3, line + ' is reported at its own line');
    assert.equal(p.error.kind, 'unsupported', line + ' is called unsupported');
    assert.equal(p.lines[4].after, 'error', 'the line after it does not run');
    assert.equal(p.lines[4].ops.length, 0);
  }
  // Every problem on a line by itself is listed, even past the first stop.
  const p = prog([...HEAD, 'G41', 'G0 X1', 'M7', 'M30']);
  assert.deepEqual(p.staticErrors.map((e) => e.line), [3, 5]);
});

/* ======================================================================
   Modal state and omitted axes
   ====================================================================*/
test('a known program ends where it was sent, and every move is a straight line from where the last one ended', () => {
  const p = prog([...HEAD, 'G0 X10 Y30', 'G0 Z2', 'G1 Z-3 F100', 'G1 X90 F300', 'G0 Z20', 'M5', 'M30']);
  assert.equal(p.error, null);
  assert.deepEqual(pos(p), { x: 90, y: 30, z: 20 });
  const ms = moves(p);
  assert.deepEqual(ms.map((m) => m.kind), ['rapid', 'rapid', 'feed', 'feed', 'rapid']);
  assert.deepEqual(ms[0].from, G.MACHINE.home, 'the first move starts at the machine’s start point');
  for (let k = 1; k < ms.length; k++) assert.deepEqual(ms[k].from, ms[k - 1].to, 'move ' + k + ' starts where ' + (k - 1) + ' ended');
  assert.equal(p.moves[3].feed, 300);
  assert.equal(p.moves[2].feed, 100);
});

test('an axis left out stays put, and a line with only axis words keeps the motion mode and feed in force', () => {
  const p = prog([...HEAD, 'G0 X10 Y20 Z5', 'G1 Z-1 F120', 'X40', 'Y35', 'G0 Z10', 'X0']);
  assert.equal(p.error, null);
  const ms = p.moves;
  assert.deepEqual(ms[2].to, { x: 40, y: 20, z: -1 });
  assert.equal(ms[2].kind, 'feed');
  assert.equal(ms[2].feed, 120, 'F stays in force');
  assert.deepEqual(ms[3].to, { x: 40, y: 35, z: -1 });
  assert.equal(ms[5].kind, 'rapid', 'X0 after G0 is a rapid');
  assert.match(p.lines[5].explain, /G1 from line 5 is still in force/);
  assert.match(p.lines[5].explain, /Y and Z are not given/);
});

test('moving before a motion mode, after G80, or without a feed rate is an error', () => {
  assert.match(prog(['G21 G90', 'X10']).error.message, /no motion mode yet/);
  assert.match(prog([...HEAD, 'G0 X1', 'G80', 'X5']).error.message, /G80 cancelled it/);
  assert.match(prog([...HEAD, 'G1 X10']).error.message, /no(ne)? .*feed rate|feed rate, and none/);
  assert.match(prog([...HEAD, 'G1 X10 F0']).error.message, /zero/);
  assert.match(prog(['G0 X10']).error.message, /no motion mode|No units/);
  assert.match(prog(['G90', 'G0 X10']).error.message, /No units/);
  assert.match(prog(['G21', 'G0 X10']).error.message, /No distance mode/);
  assert.match(prog(['G21 G90', 'G1 X10 I2 F100']).error.message, /only mean something with G2 or G3/);
});

test('the parts of one line happen in a control’s order: speed and spindle before the move, the end after it', () => {
  const p = prog(['G21 G90', 'T1 M6', 'S2000 M3 G1 X20 F100 M30']);
  assert.equal(p.error, null);
  assert.deepEqual(p.lines[2].ops.map((o) => o.op), ['spindle', 'move', 'end']);
  assert.equal(p.ended, 2);
  const q = prog(['G21 G90', 'T1 M6', 'G1 X20 F100 M3']);
  assert.match(q.error.message, /no speed has been set/);
});

test('lines after the program end are marked as not run', () => {
  const p = prog([...HEAD, 'M5', 'M30', 'G0 X50', 'G41']);
  assert.equal(p.ended, 4);
  assert.equal(p.error, null, 'a line after the end is not interpreted');
  assert.equal(p.lines[5].after, 'end');
  assert.equal(p.lines[5].ops.length, 0);
  assert.equal(p.hasEnd, true);
  assert.equal(prog([...HEAD]).hasEnd, false);
});

test('M2 and M30 stop spindle and coolant after the last move, reset modes, and do not retract', () => {
  for (const end of ['M2', 'M30']) {
    const {p, m} = run([...HEAD, 'M8', 'G91 G0 X50 Y-10 Z-10 ' + end, 'G0 X99']);
    assert.equal(p.error, null);
    assert.equal(m.alarm, null);
    assert.equal(m.status, 'done');
    assert.deepEqual(m.position(), {x: 10, y: 20, z: 10});
    assert.deepEqual(m.spindle, {on: false, rpm: 2500});
    assert.equal(m.coolant, false);
    assert.equal(p.endState.spindle, false);
    assert.equal(p.endState.coolant, false);
    assert.equal(p.endState.dist, 'abs');
    assert.equal(p.endState.motion, 'G1');
    assert.equal(p.lines[5].after, 'end');
    assert.match(p.lines[4].explain, /stops the spindle and coolant/);
  }
});

/* ======================================================================
   Distance mode and units
   ====================================================================*/
test('G91 adds each number to where the tool is; G90 makes it a position again', () => {
  const p = prog([...HEAD, 'G0 X10 Y10', 'G91 G0 X30', 'Y-5 Z-10', 'G90 G0 X30']);
  assert.equal(p.error, null);
  assert.deepEqual(p.moves[1].to, { x: 40, y: 10, z: 20 });
  assert.deepEqual(p.moves[2].to, { x: 40, y: 5, z: 10 });
  assert.deepEqual(p.moves[3].to, { x: 30, y: 5, z: 10 });
  assert.match(p.lines[4].explain, /X \+30 from where the tool was/);
});

test('G20 turns every number, feed rates included, into inches', () => {
  const p = prog(['G20 G90 G17', 'T1 M6', 'S2500 M3', 'G0 X1 Y0.5', 'G1 Z-0.1 F4', 'G91 X0.25']);
  assert.equal(p.error, null);
  assert.ok(near(p.moves[0].to.x, 25.4) && near(p.moves[0].to.y, 12.7));
  assert.ok(near(p.moves[1].to.z, -2.54));
  assert.ok(near(p.moves[1].feed, 101.6), 'F4 in/min is 101.6 mm/min');
  assert.ok(near(p.moves[2].to.x, 31.75));
  assert.match(p.lines[3].explain, /X 1, Y 0\.5/, 'explained in the program’s own units');
  // The same slot in inches and in millimetres cuts the same metal.
  const mm = run([...HEAD, 'G0 X10.16 Y30.48', 'G0 Z2.032', 'G1 Z-3.048 F100', 'G1 X89.916 F300', 'G0 Z20.32', 'M5', 'M30']);
  const inch = run(['G20 G90 G17', 'T1 M6', 'S2500 M3', 'G0 X0.4 Y1.2', 'G0 Z0.08', 'G1 Z-0.12 F4', 'G1 X3.54 F12', 'G0 Z0.8', 'M5', 'M30']);
  assert.equal(inch.m.alarm, null);
  assert.ok(near(mm.m.sim.removed, inch.m.sim.removed, 1e-6));
  for (const [x, y] of [[20, 30.48], [50, 34], [89, 27]]) assert.ok(near(mm.m.sim.heightAt(x, y), inch.m.sim.heightAt(x, y), 1e-9));
});

test('units are set once, before the first move', () => {
  assert.match(prog([...HEAD, 'G0 X1', 'G20']).error.message, /units are changed after the machine has started moving/);
  assert.equal(prog([...HEAD, 'G0 X1', 'G21']).error, null, 'repeating the same units is harmless');
  assert.equal(prog(['G20', 'G21 G90', 'T1 M6', 'G0 X1']).error, null, 'changing before any move is fine');
  // Travel is checked in the program's units too.
  const t = prog(['G20 G90 G17', 'T1 M6', 'G0 X10 Y30']);
  assert.equal(t.error.kind, 'program');
  assert.match(t.error.message, /past the end of the machine’s travel: X would reach 10 in/);
});

/* ======================================================================
   Arcs
   ====================================================================*/
const mid = (mv) => G.arcPoints(mv.from, mv.arc, mv.to, Math.PI / 2)[1];
test('G2 is clockwise and G3 counterclockwise, seen from above', () => {
  const base = [...HEAD, 'G0 X20 Y30 Z2', 'G1 Z1.5 F100'];
  const cw = prog([...base, 'G2 X40 Y30 I10 J0']).moves[2];
  const ccw = prog([...base, 'G3 X40 Y30 I10 J0']).moves[2];
  assert.ok(cw.arc.sweep < 0 && near(cw.arc.sweep, -Math.PI));
  assert.ok(ccw.arc.sweep > 0 && near(ccw.arc.sweep, Math.PI));
  // From the left of the centre to the right of it: clockwise goes over the top.
  assert.ok(near(mid(cw).x, 30) && near(mid(cw).y, 40), 'G2 passes through Y 40');
  assert.ok(near(mid(ccw).x, 30) && near(mid(ccw).y, 20), 'G3 passes through Y 20');
});

test('I and J are measured from the arc’s start (G91.1), or are a position under G90.1, whatever G90 or G91 says', () => {
  const inc = prog([...HEAD, 'G0 X20 Y30 Z2', 'G91 G3 X10 Y10 I0 J10 F100']).moves[1];
  assert.deepEqual([inc.arc.cx, inc.arc.cy], [20, 40]);
  assert.deepEqual(inc.to, { x: 30, y: 40, z: 2 });
  const abs = prog([...HEAD, 'G0 X20 Y30 Z2', 'G90.1 G3 X30 Y40 I20 J40 F100']).moves[1];
  assert.deepEqual([abs.arc.cx, abs.arc.cy], [20, 40]);
  assert.ok(near(abs.arc.sweep, Math.PI / 2));
  assert.match(prog([...HEAD, 'G0 X20 Y30 Z2', 'G90.1 G3 X30 Y40 I20 F100']).error.message, /both must be given/);
});

test('an R arc takes the short way with +R and the long way with −R', () => {
  const s = prog([...HEAD, 'G0 X0 Y0 Z5', 'G2 X10 Y10 R10 F100']).moves[1];
  assert.ok(near(s.arc.cx, 10) && near(s.arc.cy, 0));
  assert.ok(near(s.arc.sweep, -Math.PI / 2));
  const l = prog([...HEAD, 'G0 X0 Y0 Z5', 'G2 X10 Y10 R-10 F100']).moves[1];
  assert.ok(near(l.arc.cx, 0) && near(l.arc.cy, 10));
  assert.ok(near(l.arc.sweep, -1.5 * Math.PI));
  assert.match(prog([...HEAD, 'G0 X0 Y0 Z5', 'G2 X30 Y0 R10 F100']).error.message, /too small/);
  assert.match(prog([...HEAD, 'G0 X0 Y0 Z5', 'G2 X0 Y0 R10 F100']).error.message, /cannot end where it starts/);
  assert.match(prog([...HEAD, 'G0 X0 Y0 Z5', 'G2 X10 Y10 R10 I5 F100']).error.message, /not both/);
});

test('an arc whose end is off its circle, or which also moves Z, is stopped at its line', () => {
  const off = prog([...HEAD, 'G0 X72 Y15 Z2', 'G3 X80 Y23 I0 J6 F100', 'M30']);
  assert.equal(off.error.line, 4);
  assert.equal(off.error.kind, 'program');
  assert.match(off.error.message, /not on the arc’s circle/);
  const ok = prog([...HEAD, 'G0 X72 Y15 Z2', 'G3 X80 Y23 I0 J8 F100']);
  assert.equal(ok.error, null);
  const helix = prog([...HEAD, 'G0 X72 Y15 Z2', 'G3 X80 Y23 Z0 I0 J8 F100']);
  assert.equal(helix.error.kind, 'unsupported');
  assert.match(helix.error.message, /helix/);
  assert.equal(prog([...HEAD, 'G0 X72 Y15 Z2', 'G3 X80 Y23 Z2 I0 J8 F100']).error, null, 'Z at its own height is not a helix');
  const full = prog([...HEAD, 'G0 X60 Y30 Z2', 'G2 I-10 F100']).moves[1];
  assert.equal(full.arc.full, true);
  assert.ok(near(full.arc.sweep, -2 * Math.PI));
  assert.match(prog([...HEAD, 'G0 X60 Y30 Z2', 'G2 X70 F100']).error.message, /centre \(I and J\) or its radius/);
});

/* ======================================================================
   The drilling cycle
   ====================================================================*/
test('G81 rapids to the hole and to R, feeds to Z, and rises to R (G99) or to the starting height (G98)', () => {
  const body = ['G0 X15 Y15', 'G0 Z10', 'G81 X15 Y15 Z-8 R2 F120', 'X85', 'G80'];
  const g98 = prog(['G21 G90 G98', 'T3 M6', 'S1500 M3', ...body]);
  const g99 = prog(['G21 G90 G99', 'T3 M6', 'S1500 M3', ...body]);
  assert.equal(g98.error, null);
  const holes98 = g98.moves.filter((m) => m.cycle), holes99 = g99.moves.filter((m) => m.cycle);
  assert.deepEqual(holes98.slice(0, 3).map((m) => [m.kind, m.role, m.to.z]), [['rapid', 'down to R', 2], ['feed', 'drill', -8], ['rapid', 'retract', 10]]);
  assert.equal(holes98[1].feed, 120);
  assert.deepEqual(holes99[2].to.z, 2, 'G99 rises to R');
  // The second hole: the same depth, R and feed, from a line with only X.
  const second98 = holes98.slice(3);
  assert.deepEqual(second98.map((m) => m.role), ['across to the hole', 'down to R', 'drill', 'retract']);
  assert.deepEqual(second98[0].to, { x: 85, y: 15, z: 10 }, 'G98 crosses at the starting height');
  assert.deepEqual(holes99[3].to, { x: 85, y: 15, z: 2 }, 'G99 crosses at R');
  assert.deepEqual(second98[2].to, { x: 85, y: 15, z: -8 });
  // G98 rises to R when R is above the starting height.
  const low = prog(['G21 G90 G98', 'T3 M6', 'S1500 M3', 'G0 X15 Y15', 'G0 Z1.5', 'G81 Z-8 R5 F120']);
  assert.deepEqual(low.moves.filter((m) => m.cycle).map((m) => [m.role, m.to.z]), [['up to R', 5], ['drill', -8], ['retract', 5]]);
});

test('the cycle is refused without a retract mode, with R below Z, in G91, and axis words after G80 do not drill', () => {
  assert.match(prog(['G21 G90', 'T3 M6', 'S1500 M3', 'G81 X15 Y15 Z-8 R2 F120']).error.message, /G98 \(back to the starting height\) or G99/);
  assert.match(prog(['G21 G90 G99', 'T3 M6', 'S1500 M3', 'G81 X15 Y15 Z2 R-8 F120']).error.message, /R .* is below Z/);
  assert.equal(prog(['G21 G91 G99', 'T3 M6', 'S1500 M3', 'G81 X15 Y15 Z-8 R2 F120']).error.kind, 'unsupported');
  assert.match(prog(['G21 G90 G99', 'T3 M6', 'S1500 M3', 'G81 X15 Y15 F120']).error.message, /needs Z .* and R/);
  assert.match(prog(['G21 G90 G99', 'T3 M6', 'S1500 M3', 'G81 X15 Y15 Z-8 R2 F120', 'G80', 'X85']).error.message, /no motion mode in force/);
  assert.match(prog(['G21 G90 G99', 'T3 M6', 'S1500 M3', 'G80 X5']).error.message, /cannot carry/);
});

/* ======================================================================
   Tools and the spindle
   ====================================================================*/
test('a tool change needs the spindle stopped and the tool at the change height, and never moves the tool itself', () => {
  assert.match(prog(['G21 G90', 'T1 M6', 'S2500 M3', 'T2 M6']).error.message, /spindle is still turning/);
  const low = prog(['G21 G90', 'T1 M6', 'G0 Z5', 'T2 M6']);
  assert.match(low.error.message, /needs Z 20 mm or higher/);
  assert.match(low.error.message, /does not move the tool there for you/);
  assert.match(prog(['G21 G90', 'M6']).error.message, /no tool has been chosen/);
  assert.match(prog(['G21 G90', 'T9 M6']).error.message, /no T9/);
  // The milling simulator's loadTool would raise a low spindle; the program never lets it.
  const { m } = run(['G21 G90', 'T1 M6', 'G0 X50 Y30 Z25', 'T2 M6', 'M30']);
  assert.equal(m.alarm, null);
  assert.deepEqual(m.position(), { x: 50, y: 30, z: 25 });
  assert.equal(m.sim.tool.id, 'em6');
  for (const e of G.TOOL_TABLE) assert.ok(Sim.TOOL_BY_ID[e.sim], 'T' + e.t + ' is a milling simulator tool');
});

/* ======================================================================
   Running on the block
   ====================================================================*/
const SLOT = [...HEAD, 'G0 X10 Y30', 'G0 Z2', 'G1 Z-3 F100', 'G1 X90 F300', 'G0 Z20', 'M5', 'M30'];

test('the slot is the cutter’s width, at the programmed depth, along the programmed path', () => {
  const { m } = run(SLOT);
  assert.equal(m.status, 'done');
  assert.equal(m.alarm, null);
  assert.ok(near(m.sim.heightAt(50, 30), -3));
  assert.ok(near(m.sim.heightAt(50, 34.9), -3), 'within the Ø10 cutter’s radius');
  assert.ok(near(m.sim.heightAt(50, 35.1), Sim.SETUP.stock.rawTop), 'beyond its radius the raw top is left');
  assert.ok(near(m.sim.heightAt(5.1, 30), -3) && near(m.sim.heightAt(4.9, 30), Sim.SETUP.stock.rawTop), 'a round end, one radius past X 10');
  assert.deepEqual(m.position(), { x: 90, y: 30, z: 20 });
  // 4 deep from the raw top at Z +1. The plunge took the disc at X 10; the feed adds
  // the 80 x 10 strip less that disc's front half, plus the half disc it ends in.
  assert.ok(near(m.info[5].volume, Math.PI * 25 * 4, 15), 'the plunge removes a Ø10 disc');
  assert.ok(near(m.info[6].volume, 80 * 10 * 4, 30), 'the long feed removes its swept volume');
  assert.equal(m.info[7].volume, 0, 'the rapid up removes nothing');
});

test('a move in X, Y and Z at once stays one straight line through the air', () => {
  const p = prog(['G21 G90', 'T1 M6', 'G0 X10 Y10 Z5', 'M30']);
  const m = X.create().load(p);
  const a = G.MACHINE.home, b = { x: 10, y: 10, z: 5 };
  // Stop partway through the move: the tool is on the straight line, not on a dog-leg.
  m.tick(0.3);
  const q = m.position(), t = (q.x - a.x) / (b.x - a.x);
  assert.ok(t > 0.05 && t < 0.95, 'partway');
  assert.ok(near(q.y, a.y + (b.y - a.y) * t, 1e-6) && near(q.z, a.z + (b.z - a.z) * t, 1e-6), 'on the line');
  m.runToEnd();
  assert.equal(m.alarm, null);
  const seg = m.trail.find((s) => s.line === 2);
  assert.equal(seg.pts.length, 2, 'one straight leg, not separate Z and XY legs');
  assert.deepEqual(seg.pts[1], b);
});

test('a slope into metal, a rapid into metal and a feed with the spindle stopped all stop at the metal, cutting nothing', () => {
  const ramp = run(['G21 G90', 'T1 M6', 'S2000 M3', 'G0 X20 Y30 Z2', 'G1 X40 Z-3 F100', 'M30']).m;
  assert.equal(ramp.alarm.line, 4);
  assert.equal(ramp.alarm.kind, 'machine');
  assert.match(ramp.alarm.message, /ramping/);
  assert.equal(ramp.sim.removed, 0);
  const c = ramp.contact, f = (c.x - 20) / 20;
  assert.ok(near(c.z, 2 - 5 * f, 1e-4), 'the stop is on the programmed slope');
  assert.ok(c.z > Sim.SETUP.stock.rawTop - 0.01 && c.z < Sim.SETUP.stock.rawTop + 0.01, 'where the tip meets the top of the block');
  const rapid = run(['G21 G90', 'T1 M6', 'S2500 M3', 'G0 X20 Y30', 'G0 Z-3', 'M30']).m;
  assert.equal(rapid.alarm.line, 4);
  assert.match(rapid.alarm.message, /A rapid \(G0\) would drive/);
  assert.equal(rapid.sim.removed, 0);
  assert.ok(near(rapid.contact.z, Sim.SETUP.stock.rawTop, 1e-3));
  const across = run(['G21 G90', 'T1 M6', 'S2500 M3', 'G0 X-20 Y30', 'G0 Z-2', 'G0 X50', 'M30']).m;
  assert.equal(across.alarm.line, 5);
  // Contact is found on the milling simulator's 0.25 mm display grid.
  assert.ok(near(across.contact.x, -5, 0.15), 'a rapid across stops when the cutter’s edge reaches the block');
  assert.ok(across.contact.x < -4.8, 'and not inside it');
  const still = run(['G21 G90', 'T1 M6', 'G0 X20 Y30 Z2', 'G1 Z-3 F100', 'M30']).m;
  assert.match(still.alarm.message, /spindle stopped/);
  assert.equal(still.sim.removed, 0);
});

test('the milling simulator’s tool rules apply: a face mill cannot plunge, a drill cannot cut sideways, the vise is solid', () => {
  const face = run(['G21 G90', 'T5 M6', 'S800 M3', 'G0 X50 Y30 Z5', 'G1 Z0 F100', 'M30']).m;
  assert.equal(face.alarm.line, 4);
  assert.match(face.alarm.message, /cannot be pushed straight down/);
  const drill = run(['G21 G90', 'T3 M6', 'S1500 M3', 'G0 X20 Y30 Z2', 'G1 Z-3 F100', 'G1 X40', 'M30']).m;
  assert.equal(drill.alarm.line, 5);
  assert.match(drill.alarm.message, /cuts only at its point/);
  const jaw = run(['G21 G90', 'T1 M6', 'S2500 M3', 'G0 X50 Y-12', 'G1 Z-10 F100', 'M30']).m;
  assert.equal(jaw.alarm.line, 4);
  assert.match(jaw.alarm.message, /vise jaw/);
});

test('arcs cut a circle’s ring, with chords within 0.01 mm of the arc', () => {
  const { p, m } = run([...HEAD.slice(0, 1), 'T2 M6', 'S3000 M3', 'G0 X60 Y30 Z2', 'G1 Z-2 F80', 'G2 I-10 F200', 'G0 Z20', 'M5', 'M30']);
  assert.equal(m.alarm, null);
  assert.ok(near(m.sim.heightAt(50, 30), Sim.SETUP.stock.rawTop), 'the centre is left standing');
  for (const a of [0, 0.7, 2, 3.3, 4.4, 5.9]) {
    assert.ok(near(m.sim.heightAt(50 + 10 * Math.cos(a), 30 + 10 * Math.sin(a)), -2), 'cut on the circle at ' + a);
    assert.ok(near(m.sim.heightAt(50 + 13.2 * Math.cos(a), 30 + 13.2 * Math.sin(a)), Sim.SETUP.stock.rawTop), 'not beyond the Ø6 tool');
  }
  const op = p.moves.find((mv) => mv.kind === 'arc');
  const pts = [op.from].concat(X.chordPoints(op));
  for (let k = 1; k < pts.length; k++) {
    const mx = (pts[k - 1].x + pts[k].x) / 2, my = (pts[k - 1].y + pts[k].y) / 2;
    assert.ok(10 - Math.hypot(mx - 50, my - 30) <= X.CHORD_TOL + 1e-9);
  }
});

test('the holes example drills four holes to depth with the cycle', () => {
  const { m } = run(['G21 G90 G17', 'T3 M6', 'S1500 M3', 'G0 X15 Y15', 'G0 Z10', 'G98 G81 X15 Y15 Z-8 R2 F120', 'X85', 'Y45', 'X15', 'G80', 'G0 Z20', 'M5', 'M30']);
  assert.equal(m.alarm, null);
  for (const [x, y] of [[15, 15], [85, 15], [85, 45], [15, 45]]) assert.ok(near(m.sim.heightAt(x, y), -8), 'hole at ' + x + ', ' + y);
  assert.ok(near(m.sim.heightAt(50, 30), Sim.SETUP.stock.rawTop));
});

/* ======================================================================
   Run, step, reset and edit give one answer
   ====================================================================*/
const sample = (sim) => [[20, 30], [50, 33], [89, 30], [50, 30], [72, 15], [80, 23], [15, 15]].map(([x, y]) => sim.heightAt(x, y));

test('stepping in small time slices, line by line, and all at once reach the same block, time and position', () => {
  const p = prog(['G21 G90 G17', 'T2 M6', 'S3000 M3', 'G0 X28 Y15', 'G0 Z2', 'G1 Z-1.5 F80', 'G1 X72 F250', 'G3 X80 Y23 I0 J8', 'G1 Y37', 'G0 Z20', 'M5', 'M30']);
  const all = X.create().load(p); all.runToEnd();
  const slices = X.create().load(p);
  let guard = 0;
  while (!slices.finished() && guard++ < 100000) slices.tick(0.05);
  const lines = X.create().load(p);
  while (!lines.finished()) lines.runLine();
  for (const m of [slices, lines]) {
    assert.equal(m.status, 'done');
    assert.ok(near(m.time, all.time, 1e-6));
    assert.ok(near(m.sim.removed, all.sim.removed, 1e-6));
    assert.deepEqual(m.position(), all.position());
    assert.deepEqual(sample(m.sim), sample(all.sim));
  }
  const pv = X.preview(p);
  assert.ok(near(pv.time, all.time) && near(pv.removed, all.sim.removed), 'the preview is the same run');
});

test('reset and seek put the machine back exactly, and a new program replaces the old one entirely', () => {
  const p = prog(SLOT);
  const m = X.create().load(p);
  m.runToEnd();
  const done = sample(m.sim);
  m.seek(6);
  assert.equal(m.line, 6);
  assert.deepEqual(m.position(), { x: 10, y: 30, z: -3 });
  assert.ok(near(m.sim.heightAt(50, 30), Sim.SETUP.stock.rawTop), 'the slot is not cut yet');
  m.runToEnd();
  assert.deepEqual(sample(m.sim), done);
  m.reset();
  assert.equal(m.sim.removed, 0);
  assert.equal(m.trail.length, 0);
  assert.deepEqual(m.position(), G.MACHINE.home);
  assert.equal(m.sim.tool, null);
  // Loading an edited program starts it from scratch: nothing of the old run is left.
  m.runToEnd();
  const edited = prog(SLOT.map((l) => l === 'G1 Z-3 F100' ? 'G1 Z-6 F100' : l));
  m.load(edited);
  assert.equal(m.sim.removed, 0);
  assert.equal(m.status, 'ready');
  m.runToEnd();
  assert.ok(near(m.sim.heightAt(50, 30), -6));
});

test('the machine stops at a program error and runs nothing after it', () => {
  const p = prog([...HEAD, 'G0 X10 Y30', 'G41', 'G0 Z2', 'M30']);
  const m = X.create().load(p);
  m.runToEnd();
  assert.equal(m.status, 'alarm');
  assert.equal(m.alarm.line, 4);
  assert.equal(m.alarm.kind, 'unsupported');
  assert.deepEqual(m.position(), { x: 10, y: 30, z: 20 });
});

/* ============================================================================
   gcode-playground / machine.js - run an interpreted program on the block.

   The metal, the tools and the vise are the milling simulator's own
   (CourseWikiMillingSim): the same 100 x 60 block, the same cut model, the
   same rules about what each tool can do. This file only decides how a
   programmed move becomes motion of that machine, and it keeps to the
   program exactly:

   - A straight move goes in one straight line, X, Y and Z together. It is
     never split into "up, then across, then down": that is the manual
     simulator's convenience routing (Sim.moveTo), and it is not used here.
     A move along Z alone, or in X and Y at one height, cuts through the
     milling simulator's own advance(), which removes the metal and applies
     its tool rules. A move in X or Y and Z at once is followed exactly
     through the air; if it would reach metal, the machine stops at the
     point of contact and says so, because the cut model has no sloped cuts.
   - An arc is cut as short straight chords in X and Y, each within 0.01 mm
     of the true arc, at one height.
   - A rapid (G0) never cuts. If it would touch metal, the tool stops where it
     touches and the program stops with an alarm. So does a feed move into
     metal while the spindle is stopped.
   - A tool change (M6) loads the tool where the tool already is. The
     interpreter has already refused a change below the change height, so
     the milling simulator never raises the spindle on the program's behalf.

   Timing is simple: feed moves at F, rapids at the simulator's rapid rate,
   no acceleration, no time for tool changes or spindle starts.
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('../milling-simulator/model.js') : root.CourseWikiMillingSim,
    node ? require('./gcode.js') : root.CourseWikiGcode);
  if (node) module.exports = api;
  else root.CourseWikiGcodeMachine = api;
})(typeof self !== 'undefined' ? self : this, function (M, G) {
  'use strict';

  var EPS = 1e-6;
  var CHORD_TOL = 0.01;          // mm, largest gap between a chord and its arc
  var SAMPLE = 0.1;              // mm, step for following a move through the air

  function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; }
  function dist3(a, b) { return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
  function cp(p) { return { x: p.x, y: p.y, z: p.z }; }

  /* ---- breaking a programmed move into legs -------------------------------*/
  function chordPoints(op) {
    var a = op.arc, r = Math.max(a.r, a.r1);
    var step = r > CHORD_TOL ? 2 * Math.acos(1 - CHORD_TOL / r) : Math.PI / 2;
    var n = Math.max(1, Math.ceil(Math.abs(a.sweep) / step - 1e-9));
    var pts = [];
    for (var k = 1; k <= n; k++) {
      var f = k / n, ang = a.a0 + a.sweep * f, rr = a.r + (a.r1 - a.r) * f;
      pts.push(k === n ? cp(op.to) : { x: a.cx + rr * Math.cos(ang), y: a.cy + rr * Math.sin(ang), z: op.from.z });
    }
    return pts;
  }
  function legsFor(op) {
    var out = [], speed = op.kind === 'rapid' ? G.MACHINE.rapid : op.feed;
    var kind = op.kind === 'rapid' ? 'rapid' : 'feed';
    var push = function (a, b) {
      var len = dist3(a, b);
      if (len < EPS) return;
      var axis = Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS ? 'z' : Math.abs(a.z - b.z) < EPS ? 'xy' : 'xyz';
      out.push({ kind: kind, axis: axis, from: cp(a), to: cp(b), len: len, done: 0, speed: speed, line: op.line, op: op });
    };
    if (op.kind === 'arc') {
      var prev = op.from;
      chordPoints(op).forEach(function (p) { push(prev, p); prev = p; });
    } else push(op.from, op.to);
    return out;
  }

  /* ======================================================================
     The machine
     ====================================================================*/
  function Machine(opts) {
    opts = opts || {};
    this.sim = opts.sim || M.create();
    this.program = null;
    this.reset();
  }

  Machine.prototype.load = function (program) { this.program = program; this.reset(); return this; };

  Machine.prototype.reset = function () {
    this.sim.reset();
    this.line = 0;               // the line being run, or the next to run
    this.inLine = false;
    this.ops = null; this.opIndex = 0;
    this.legs = []; this.leg = null;
    this.status = this.program ? 'ready' : 'empty';
    this.alarm = null;
    this.spindle = { on: false, rpm: 0 };
    this.coolant = false;
    this.time = 0;
    this.trail = [];             // what the tool actually did: { line, kind, pts, head }
    this.seg = null;
    this.info = [];              // per line: { volume, time, done }
    this.lastDone = -1;
    this.contact = null;         // where an alarm stopped the tool
    return this;
  };

  Machine.prototype.lines = function () { return this.program ? this.program.lines : []; };
  Machine.prototype.finished = function () { return this.status === 'done' || this.status === 'alarm' || this.status === 'empty'; };
  Machine.prototype.position = function () { return cp(this.sim.pos); };

  /* Run for up to `seconds` of machine time.
     opts.lineEnd: stop when the current line is finished.
     opts.before:  stop before starting line `before`.
     Returns what happened: { lineDone, alarm, done }. */
  Machine.prototype.tick = function (seconds, opts) {
    opts = opts || {};
    var budget = seconds, out = { lineDone: false, alarm: null, done: false };
    var guard = 0;
    while (!this.finished()) {
      if (++guard > 1e7) throw new Error('machine loop did not settle');
      if (!this.inLine) {
        if (opts.before != null && this.line >= opts.before) break;
        if (!this.startLine()) continue;
      }
      if (!this.leg && !this.legs.length) {
        if (this.opIndex >= this.ops.length) {
          this.endLine();
          out.lineDone = true;
          if (opts.lineEnd) break;
          continue;
        }
        this.startOp(this.ops[this.opIndex++]);
        if (this.status === 'alarm') break;
        continue;
      }
      if (!this.leg) this.startLeg(this.legs.shift());
      if (this.status === 'alarm') break;
      if (budget <= 0) break;
      budget = this.runLeg(budget);
      if (this.status === 'alarm') break;
    }
    if (this.status === 'alarm') out.alarm = this.alarm;
    if (this.status === 'done') out.done = true;
    return out;
  };
  Machine.prototype.runLine = function () { return this.tick(Infinity, { lineEnd: true }); };
  Machine.prototype.runToEnd = function () { return this.tick(Infinity); };
  /* Start again and run every line before `k`, so line k is next. */
  Machine.prototype.seek = function (k) { this.reset(); if (this.program) this.tick(Infinity, { before: k }); return this; };

  /* ---- lines ------------------------------------------------------------------*/
  Machine.prototype.startLine = function () {
    var lines = this.lines();
    if (this.line >= lines.length) { this.status = 'done'; return false; }
    var ln = lines[this.line];
    if (ln.after) { this.status = 'done'; return false; }
    if (ln.error) {
      this.raise({ line: ln.index, kind: ln.error.kind, message: ln.error.message });
      return false;
    }
    this.inLine = true;
    this.ops = ln.ops; this.opIndex = 0;
    this.info[ln.index] = { volume: 0, time: 0, done: false, removedAt: this.sim.removed, timeAt: this.time };
    this.status = 'running';
    return true;
  };
  Machine.prototype.endLine = function () {
    var i = this.line, rec = this.info[i];
    this.sim.commit();
    rec.volume = this.sim.removed - rec.removedAt;
    rec.time = this.time - rec.timeAt;
    rec.done = true;
    this.lastDone = i;
    this.inLine = false; this.ops = null; this.seg = null;
    this.line = i + 1;
    if (this.program.ended === i) this.status = 'done';
    else if (this.line >= this.lines().length) this.status = 'done';
    else this.status = 'ready';
  };
  Machine.prototype.raise = function (alarm) {
    this.alarm = alarm;
    this.status = 'alarm';
    this.leg = null; this.legs = [];
    if (this.sim.entry) this.sim.commit();
    var rec = this.info[alarm.line];
    if (rec) { rec.volume = this.sim.removed - rec.removedAt; rec.time = this.time - rec.timeAt; }
  };

  /* ---- operations ---------------------------------------------------------------*/
  Machine.prototype.startOp = function (op) {
    var sim = this.sim;
    if (op.op === 'tool') {
      var res = sim.loadTool(op.sim);
      if (!res.ok || res.raised) {
        // The interpreter checks the change height; this is a guard, not a route.
        this.raise({ line: op.line, kind: 'machine', message: res.message });
      }
      return;
    }
    if (op.op === 'spindle') { this.spindle = { on: op.on, rpm: op.rpm }; return; }
    if (op.op === 'coolant') { this.coolant = op.on; return; }
    if (op.op === 'end') {
      this.spindle.on = false;
      this.coolant = false;
      return;
    }
    if (op.op === 'move') {
      this.legs = legsFor(op);
      this.seg = { line: op.line, kind: op.kind === 'rapid' ? 'rapid' : 'feed', pts: [cp(sim.pos)], head: null, cycle: !!op.cycle };
      this.trail.push(this.seg);
    }
  };

  /* ---- legs -----------------------------------------------------------------------
     At the start of each leg, find out how far it may go. A rapid, a feed
     with the spindle stopped, and any move with no tool cut nothing, so the
     metal they would meet does not change while they move: one check at the
     start finds the contact point. A cutting move along one axis is handed
     to the milling simulator, which stops it at any rule it breaks. */
  Machine.prototype.startLeg = function (leg) {
    var sim = this.sim, T = sim.tool;
    this.leg = leg;
    leg.limit = leg.len;
    leg.stop = null;
    var cutting = T && leg.kind === 'feed' && this.spindle.on && this.spindle.rpm > 0;
    if (cutting && leg.axis !== 'xyz') {
      leg.simLeg = { axis: leg.axis, from: cp(leg.from), to: cp(leg.to), len: leg.len, done: 0 };
      return;
    }
    var hit = this.firstContact(leg);
    if (!hit) return;
    leg.limit = hit.t * leg.len;
    leg.stop = this.alarmFor(leg, hit);
  };

  Machine.prototype.alarmFor = function (leg, hit) {
    var T = this.sim.tool, name = T ? 'the ' + M.toolNoun(T) : 'the spindle';
    if (hit.code === 'fixture') return hit.message;
    if (!T) return 'There is no tool in the spindle, and this move would drive the spindle into the work. Load a tool (for example T1 M6) before moving down to the block.';
    if (leg.kind === 'rapid') {
      return 'A rapid (G0) would drive ' + name + ' into the metal here. Rapids are for moving through the air: the machine moves as fast as it can and does not cut. Stop above the work at rapid, then feed in with G1.';
    }
    if (!(this.spindle.on && this.spindle.rpm > 0)) {
      return name.charAt(0).toUpperCase() + name.slice(1) + ' reached the metal with the spindle stopped. Start the spindle with M3 (and an S speed) before the tool touches the work.';
    }
    return 'This move goes in X or Y and Z at the same time, and it reaches the metal here. Cutting on a slope (ramping) is not modelled in this simulator: feed down along Z on its own, then across in X and Y at one height.';
  };

  /* The first point along a non-cutting leg where the tool would meet metal
     or the vise, as a fraction of the leg; null if it never does. */
  Machine.prototype.firstContact = function (leg) {
    var sim = this.sim, self = this;
    var test;
    if (leg.axis !== 'xyz' && sim.tool) {
      test = function (t) {
        var b = lerp(leg.from, leg.to, t);
        var r = leg.axis === 'xy' ? sim.checkXY(leg.from, b, leg.from.z) : sim.checkZ(leg.from, leg.from.z, b.z);
        if (r.ok && !r.engaged) return { ok: true };
        if (!r.ok && (r.code === 'jaw' || r.code === 'parallel' || r.code === 'floor')) return { ok: false, code: 'fixture', message: r.message };
        return { ok: false, code: 'metal' };
      };
      var end = test(1);
      if (end.ok) return null;
      var f = sim.furthest(test, leg.len);
      return { t: f.t, code: f.refusal.code, message: f.refusal.message };
    }
    // Followed point by point: diagonal moves, and any move with no tool.
    var n = Math.max(1, Math.ceil(leg.len / SAMPLE)), prevT = 0;
    for (var k = 0; k <= n; k++) {
      var t = k / n, h = self.blockedAt(lerp(leg.from, leg.to, t));
      if (h) {
        if (k === 0) return { t: 0, code: h.code, message: h.message };
        var lo = prevT, hi = t;
        for (var it = 0; it < 30; it++) {
          var mid = (lo + hi) / 2;
          if (self.blockedAt(lerp(leg.from, leg.to, mid))) hi = mid; else lo = mid;
        }
        return { t: Math.max(0, lo - 4 * EPS / leg.len), code: h.code, message: h.message };
      }
      prevT = t;
    }
    return null;
  };

  /* Would the tool, with its tip at p, overlap metal or the vise? */
  Machine.prototype.blockedAt = function (p) {
    var sim = this.sim, T = sim.tool, st = sim.stock, S = sim.setup;
    var r = T ? T.dia / 2 : 0, cone = T ? T.cone : 0;
    if (T) {
      var fx = sim.fixtureXY(p, p, p.z, r);
      if (fx) return { code: 'fixture', message: fx.message };
    } else {
      var boxes = [];
      if (p.z < S.jawTop - EPS) boxes = boxes.concat(S.jaws);
      if (p.z < S.parallelTop - EPS) boxes = boxes.concat(S.parallels);
      if (p.z < S.viseFloor + EPS) boxes.push(S.viseBase);
      for (var b = 0; b < boxes.length; b++) {
        var q = boxes[b];
        if (p.x > q.x0 && p.x < q.x1 && p.y > q.y0 && p.y < q.y1) return { code: 'fixture', message: 'The spindle would hit the ' + (q.name || 'vise') + '.' };
      }
    }
    if (p.z >= st.rawTop - EPS) return null;
    if (!T) return sim.heightAt(p.x, p.y) > p.z + EPS ? { code: 'metal' } : null;
    if (!sim.capsuleTouchesStock(p, p, r)) return null;
    var R = sim.cellRange(p.x - r, p.x + r, p.y - r, p.y + r);
    for (var j = R.j0; j <= R.j1; j++) {
      var cy = sim.cellY(j);
      for (var i = R.i0; i <= R.i1; i++) {
        var cx = sim.cellX(i), d = Math.hypot(cx - p.x, cy - p.y);
        if (d > r + 1e-9) continue;
        var hgt = sim.raster[i + j * sim.nx];
        if (hgt <= st.bottom + EPS) continue;
        if (hgt > p.z + cone * d + EPS) return { code: 'metal' };
      }
    }
    return null;
  };

  /* Move along the current leg for up to `budget` seconds; return what is left. */
  Machine.prototype.runLeg = function (budget) {
    var leg = this.leg, sim = this.sim;
    var rate = leg.speed / 60;                       // mm per second
    var want = budget === Infinity ? Infinity : budget * rate;
    if (leg.simLeg) {
      var remainS = leg.len - leg.simLeg.done;
      var d = Math.min(want, remainS);
      var res = sim.advance(leg.simLeg, d);
      var moved = leg.simLeg.blocked ? dist3(leg.from, sim.pos) - leg.done : d;
      leg.done += Math.max(0, moved);
      this.time += Math.max(0, moved) / rate;
      this.seg.head = cp(sim.pos);
      if (res.blocked) {
        this.contact = cp(sim.pos);
        this.raise({ line: leg.line, kind: 'machine', message: res.message, code: res.code });
        return 0;
      }
      if (res.done || leg.done >= leg.len - EPS) return this.finishLeg(budget === Infinity ? Infinity : budget - d / rate);
      return 0;
    }
    var remain = leg.limit - leg.done;
    var step = Math.min(want, remain);
    leg.done += step;
    this.time += step / rate;
    sim.pos = leg.done >= leg.len - EPS ? cp(leg.to) : lerp(leg.from, leg.to, leg.done / leg.len);
    this.seg.head = cp(sim.pos);
    if (leg.done >= leg.limit - EPS) {
      if (leg.stop) {
        this.contact = cp(sim.pos);
        this.raise({ line: leg.line, kind: 'machine', message: leg.stop });
        return 0;
      }
      return this.finishLeg(budget === Infinity ? Infinity : budget - step / rate);
    }
    return 0;
  };
  Machine.prototype.finishLeg = function (left) {
    var leg = this.leg;
    this.sim.pos = cp(leg.to);
    this.seg.pts.push(cp(leg.to));
    this.seg.head = null;
    this.leg = null;
    return Math.max(0, left);
  };

  /* ---- what the program will do, all at once -----------------------------------
     A second machine on its own block runs the whole program instantly, so
     the page can show its path, its run time and its first alarm before the
     learner presses Play. The Play run executes the program again; it does
     not replay this one. */
  function preview(program, opts) {
    var m = new Machine({ sim: opts && opts.sim }).load(program);
    m.runToEnd();
    return {
      machine: m, alarm: m.alarm, time: m.time, removed: m.sim.removed,
      linesRun: m.lastDone + 1, contact: m.contact
    };
  }

  return {
    Machine: Machine, create: function (o) { return new Machine(o); },
    preview: preview, legsFor: legsFor, chordPoints: chordPoints, CHORD_TOL: CHORD_TOL
  };
});

/* ============================================================================
   milling-simulator / model.js - the part, the tools and the machine rules.

   A 2.5D model of a vertical mill. The tool axis is always vertical, so the
   part is fully described by the height of its top surface over the XY plane:
   metal fills every column from the bottom of the stock up to H(x, y).

   THE TRUTH IS A LIST OF CUTS, NOT A PICTURE. Every cut is recorded as one
   removal primitive: "take away everything above floor f inside this
   footprint". The footprint is a disc (a plunge) or a capsule (a sideways
   move at constant height), and the floor is flat for end mills, face mills
   and boring heads, and a cone for drills and the 90-degree spot/chamfer
   tool. H(x, y) is the stock top lowered by every primitive that covers the
   point, so it is exact at any point, at any resolution - which is what lets
   the inspection measure a wall to the hundredth rather than to a pixel.

   A raster of H at cell centres is kept alongside, stamped by the same floor
   functions, for drawing, for contact checks and for the colour overlay. It
   is exact at its cell centres and is never the thing that is measured.

   Machine rules live here too (what each kind of tool may and may not do),
   so the page, the tests and the printed figure all run the same rules.

   Units: millimetres. X0 Y0 is the front-left corner of the stock seen from
   the operator; Z0 is the finished top face. The raw stock stands proud of
   Z0 by the facing allowance.
   ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiMillingSim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-6;
  var CELL = 0.25;            // raster pitch, mm
  var BUCKET = 5;             // spatial index pitch for exact queries, mm

  /* ---- the setup: stock in a vise on two parallels ---------------------
     Jaws grip the front (y = 0) and back (y = 60) faces. The parallels hold
     the part up off the vise floor along those same two edges, so a hole
     drilled through near the front or back edge would run into a parallel.
     Everything here is the model's own illustrative setup. */
  var SETUP = {
    stock: { x0: 0, x1: 100, y0: 0, y1: 60, bottom: -20, top: 0, rawTop: 1 },
    jawTop: -8,
    jaws: [
      { name: 'front vise jaw', x0: -30, x1: 130, y0: -14, y1: 0 },
      { name: 'back vise jaw', x0: -30, x1: 130, y0: 60, y1: 74 }
    ],
    parallelTop: -20,
    parallels: [
      { name: 'front parallel', x0: -30, x1: 130, y0: 0, y1: 8 },
      { name: 'back parallel', x0: -30, x1: 130, y0: 52, y1: 60 }
    ],
    viseFloor: -32,
    viseBase: { name: 'vise', x0: -30, x1: 130, y0: -14, y1: 74 },
    clearZ: 20,               // where a tool change leaves the spindle
    home: { x: -40, y: 30, z: 20 },
    travel: { x0: -80, x1: 180, y0: -45, y1: 105, z0: -40, z1: 60 }
  };

  /* ---- the tools ---------------------------------------------------------
     reach  how far up from the tip the tool can cut. Metal above that inside
            the tool's circle would meet the non-cutting body or shank.
     side   may cut while moving sideways (in X and Y).
     plunge may be fed straight down into metal.
     cone   rise of the cutting point per mm out from the axis (0 = flat).
     The sizes are an illustrative rack, not a recommendation. */
  function cot(deg) { return 1 / Math.tan(deg * Math.PI / 360); }   // deg = included angle
  var TOOLS = [
    { id: 'fm50', kind: 'face', group: 'Face mill', name: 'Face mill', dia: 50, reach: 4, teeth: 5,
      side: true, plunge: false, cone: 0 },
    { id: 'em12', kind: 'end', group: 'End mills', name: 'End mill', dia: 12, reach: 26, teeth: 3,
      side: true, plunge: true, cone: 0 },
    { id: 'em10', kind: 'end', group: 'End mills', name: 'End mill', dia: 10, reach: 22, teeth: 3,
      side: true, plunge: true, cone: 0 },
    { id: 'em8', kind: 'end', group: 'End mills', name: 'End mill', dia: 8, reach: 19, teeth: 3,
      side: true, plunge: true, cone: 0 },
    { id: 'em6', kind: 'end', group: 'End mills', name: 'End mill', dia: 6, reach: 13, teeth: 2,
      side: true, plunge: true, cone: 0 },
    { id: 'sp12', kind: 'spot', group: 'Spot and chamfer', name: 'Spot and chamfer tool', dia: 12, angle: 90,
      reach: 6, side: true, plunge: true, cone: cot(90) },
    { id: 'dr4.2', kind: 'drill', group: 'Drills', name: 'Drill', dia: 4.2, angle: 118, reach: 40,
      side: false, plunge: true, cone: cot(118) },
    { id: 'dr5', kind: 'drill', group: 'Drills', name: 'Drill', dia: 5.0, angle: 118, reach: 40,
      side: false, plunge: true, cone: cot(118) },
    { id: 'dr6', kind: 'drill', group: 'Drills', name: 'Drill', dia: 6.0, angle: 118, reach: 40,
      side: false, plunge: true, cone: cot(118) },
    { id: 'dr6.6', kind: 'drill', group: 'Drills', name: 'Drill', dia: 6.6, angle: 118, reach: 40,
      side: false, plunge: true, cone: cot(118) },
    { id: 'dr6.8', kind: 'drill', group: 'Drills', name: 'Drill', dia: 6.8, angle: 118, reach: 40,
      side: false, plunge: true, cone: cot(118) },
    { id: 'dr10', kind: 'drill', group: 'Drills', name: 'Drill', dia: 10.0, angle: 118, reach: 40,
      side: false, plunge: true, cone: cot(118) },
    { id: 'tapM6', kind: 'tap', group: 'Taps', name: 'Tap', thread: 'M6x1', dia: 6, reach: 30,
      side: false, plunge: true, cone: 0, lead: 4 },
    { id: 'tapM8', kind: 'tap', group: 'Taps', name: 'Tap', thread: 'M8x1.25', dia: 8, reach: 30,
      side: false, plunge: true, cone: 0, lead: 4 },
    { id: 'bore', kind: 'bore', group: 'Boring head', name: 'Boring head', dia: 20, minDia: 12, maxDia: 40,
      barDia: 9, reach: 30, side: false, plunge: true, cone: 0 }
  ];
  var TOOL_BY_ID = {};
  TOOLS.forEach(function (t) { TOOL_BY_ID[t.id] = t; });

  /* ---- threads -------------------------------------------------------------
     Minor-diameter limits of the internal thread, tolerance class 6H. The
     simulator accepts a tapped hole whose drilled size falls inside them.
     Basic minor diameter = D - 1.082532 P; 6H adds nothing below it and the
     grade-6 tolerance above it. SOURCE CHECK PENDING (see the page's sources
     note): values recalled from ISO 965-1 tables, not read in this lane. */
  var THREADS = {
    'M6x1':    { id: 'M6x1', label: 'M6×1', major: 6, pitch: 1, minorMin: 4.917, minorMax: 5.153, tapDrill: 5.0 },
    'M8x1.25': { id: 'M8x1.25', label: 'M8×1.25', major: 8, pitch: 1.25, minorMin: 6.647, minorMax: 6.912, tapDrill: 6.8 }
  };

  function toolLabel(t) {
    if (!t) return 'No tool';
    if (t.kind === 'tap') return THREADS[t.thread].label + ' tap';
    if (t.kind === 'bore') return 'Boring head Ø' + fmt(t.dia, 2);
    if (t.kind === 'spot') return 'Spot and chamfer tool Ø' + fmt(t.dia, 0) + ', 90°';
    return t.name + ' Ø' + fmt(t.dia, t.dia % 1 ? 1 : 0);
  }
  /* The same name inside a sentence: "the end mill Ø12". */
  function toolNoun(t) {
    var s = toolLabel(t);
    return /^M\d/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
  }

  /* Fixed decimals, a true minus sign, and never "-0.00". */
  function fmt(v, dp) {
    var s = (Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp)).toFixed(dp);
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
    return s.charAt(0) === '-' ? '\u2212' + s.slice(1) : s;
  }
  function fmtSigned(v, dp) {
    var s = fmt(v, dp);
    return (s.charAt(0) !== '\u2212' && Number(s) !== 0 ? '+' : '') + s;
  }
  /* Read a typed number: accepts a true minus sign, a comma decimal point
     and surrounding spaces. NaN for anything else. */
  function parseNum(text) {
    if (typeof text === 'number') return text;
    var t = String(text == null ? '' : text).trim().replace(/\u2212/g, '-').replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return Number(t);
  }
  function q4(v) { return Math.round(v * 1e4) / 1e4; }

  /* ---- plane geometry ----------------------------------------------------*/
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = 0;
    if (l2 > 0) { t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; }
    var ex = px - (ax + t * dx), ey = py - (ay + t * dy);
    return Math.sqrt(ex * ex + ey * ey);
  }
  function pointRectDist(px, py, r) {
    var dx = Math.max(r.x0 - px, 0, px - r.x1), dy = Math.max(r.y0 - py, 0, py - r.y1);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function segHitsRect(ax, ay, bx, by, r) {         // Liang-Barsky
    var t0 = 0, t1 = 1, dx = bx - ax, dy = by - ay;
    var p = [-dx, dx, -dy, dy], qv = [ax - r.x0, r.x1 - ax, ay - r.y0, r.y1 - ay];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (qv[i] < 0) return false; }
      else {
        var t = qv[i] / p[i];
        if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
        else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
    }
    return true;
  }
  function segRectDist(ax, ay, bx, by, r) {
    if (segHitsRect(ax, ay, bx, by, r)) return 0;
    var d = Math.min(pointRectDist(ax, ay, r), pointRectDist(bx, by, r));
    [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]].forEach(function (c) {
      d = Math.min(d, segDist(c[0], c[1], ax, ay, bx, by));
    });
    return d;
  }

  /* Signed distances, negative inside. Rounded box with corner radius rc. */
  function sdBox(px, py, cx, cy, hw, hh, rc) {
    rc = rc || 0;
    var qx = Math.abs(px - cx) - (hw - rc), qy = Math.abs(py - cy) - (hh - rc);
    var ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - rc;
  }
  function sdCircle(px, py, cx, cy, r) { return Math.hypot(px - cx, py - cy) - r; }
  function sdCapsule(px, py, ax, ay, bx, by, r) { return segDist(px, py, ax, ay, bx, by) - r; }

  /* ======================================================================
     The simulation
     ====================================================================*/
  function Sim(opts) {
    opts = opts || {};
    var st = SETUP.stock;
    this.setup = SETUP;
    this.stock = st;
    this.nx = Math.round((st.x1 - st.x0) / CELL);
    this.ny = Math.round((st.y1 - st.y0) / CELL);
    this.nbx = Math.ceil((st.x1 - st.x0) / BUCKET);
    this.nby = Math.ceil((st.y1 - st.y0) / BUCKET);
    this.reset();
  }

  Sim.prototype.reset = function () {
    var st = this.stock;
    this.raster = new Float64Array(this.nx * this.ny);
    this.raster.fill(st.rawTop);
    this.mark = new Int32Array(this.nx * this.ny);
    this.prims = [];
    this.buckets = [];
    for (var b = 0; b < this.nbx * this.nby; b++) this.buckets.push([]);
    this.threads = [];
    this.history = [];
    this.entry = null;
    this.serial = 0;
    this.nextId = 1;
    this.tool = null;
    this.pos = { x: SETUP.home.x, y: SETUP.home.y, z: SETUP.home.z };
    this.version = 0;
    this.removed = 0;          // mm^3 of metal removed, from the raster
  };

  /* ---- exact height ------------------------------------------------------*/
  Sim.prototype.inStock = function (x, y) {
    var st = this.stock;
    return x >= st.x0 && x <= st.x1 && y >= st.y0 && y <= st.y1;
  };

  function primFloor(p, x, y) {
    var d = segDist(x, y, p.ax, p.ay, p.bx, p.by);
    if (d > p.r + 1e-9) return Infinity;
    return p.z + p.cone * d;
  }

  /* Top of the metal at (x, y), or -Infinity where there is no stock. A
     column cut right through reads as the stock bottom. */
  Sim.prototype.heightAt = function (x, y) {
    if (!this.inStock(x, y)) return -Infinity;
    var st = this.stock;
    var bi = Math.min(this.nbx - 1, Math.floor((x - st.x0) / BUCKET));
    var bj = Math.min(this.nby - 1, Math.floor((y - st.y0) / BUCKET));
    var list = this.buckets[bi + bj * this.nbx];
    var h = st.rawTop;
    for (var k = 0; k < list.length; k++) {
      var f = primFloor(list[k], x, y);
      if (f < h) h = f;
    }
    return h < st.bottom ? st.bottom : h;
  };
  Sim.prototype.hasMetal = function (x, y, z) {
    var h = this.heightAt(x, y);
    return h > this.stock.bottom + EPS && h >= z - 1e-9 && z >= this.stock.bottom - 1e-9;
  };

  /* ---- raster ------------------------------------------------------------*/
  Sim.prototype.cellX = function (i) { return this.stock.x0 + (i + 0.5) * CELL; };
  Sim.prototype.cellY = function (j) { return this.stock.y0 + (j + 0.5) * CELL; };
  Sim.prototype.cellRange = function (x0, x1, y0, y1) {
    var st = this.stock;
    return {
      i0: Math.max(0, Math.ceil((x0 - st.x0) / CELL - 0.5)),
      i1: Math.min(this.nx - 1, Math.floor((x1 - st.x0) / CELL - 0.5)),
      j0: Math.max(0, Math.ceil((y0 - st.y0) / CELL - 0.5)),
      j1: Math.min(this.ny - 1, Math.floor((y1 - st.y0) / CELL - 0.5))
    };
  };
  Sim.prototype.rasterAt = function (i, j) {
    var v = this.raster[i + j * this.nx];
    return v < this.stock.bottom ? this.stock.bottom : v;
  };

  /* Stamp a primitive (or the part of one between two points) into the
     raster, recording old values for undo and tallying which side of the
     travel direction the removed metal was on. */
  Sim.prototype.stamp = function (p, seg, tally) {
    var ax = seg ? seg.ax : p.ax, ay = seg ? seg.ay : p.ay, bx = seg ? seg.bx : p.bx, by = seg ? seg.by : p.by;
    var r = p.r, z = p.z, k = p.cone, st = this.stock, nx = this.nx;
    var R = this.cellRange(Math.min(ax, bx) - r, Math.max(ax, bx) + r, Math.min(ay, by) - r, Math.max(ay, by) + r);
    var ux = bx - ax, uy = by - ay, ul = Math.hypot(ux, uy);
    if (ul > 0) { ux /= ul; uy /= ul; }
    var e = this.entry, raster = this.raster, mark = this.mark, serial = this.serial;
    var changed = 0;
    for (var j = R.j0; j <= R.j1; j++) {
      var y = st.y0 + (j + 0.5) * CELL;
      for (var i = R.i0; i <= R.i1; i++) {
        var x = st.x0 + (i + 0.5) * CELL;
        var d = segDist(x, y, ax, ay, bx, by);
        if (d > r + 1e-9) continue;
        var f = z + k * d, idx = i + j * nx, old = raster[idx];
        if (f >= old) continue;
        if (e && mark[idx] !== serial) { mark[idx] = serial; e.cellIdx.push(idx); e.cellOld.push(old); }
        var lo = Math.max(f, st.bottom), hiOld = Math.max(old, st.bottom);
        var dv = (hiOld - lo) * CELL * CELL;
        raster[idx] = f;
        if (dv > 0) {
          changed += dv;
          if (tally && ul > 0) {
            var cross = ux * (y - ay) - uy * (x - ax);    // > 0: left of travel
            if (cross > 1e-9) tally.left += dv; else if (cross < -1e-9) tally.right += dv;
          }
        }
      }
    }
    this.removed += changed;
    if (tally) tally.volume += changed;
    return changed;
  };

  Sim.prototype.rebuildRaster = function () {
    this.raster.fill(this.stock.rawTop);
    var keep = this.entry; this.entry = null;
    var saveRemoved = this.removed;
    for (var k = 0; k < this.prims.length; k++) this.stamp(this.prims[k]);
    this.entry = keep;
    this.removed = saveRemoved;
  };

  /* ---- primitives and the bucket index -----------------------------------*/
  Sim.prototype.bucketRange = function (p) {
    var st = this.stock;
    var x0 = Math.min(p.ax, p.bx) - p.r, x1 = Math.max(p.ax, p.bx) + p.r;
    var y0 = Math.min(p.ay, p.by) - p.r, y1 = Math.max(p.ay, p.by) + p.r;
    if (x1 < st.x0 || x0 > st.x1 || y1 < st.y0 || y0 > st.y1) return null;
    return {
      i0: Math.max(0, Math.floor((x0 - st.x0) / BUCKET)), i1: Math.min(this.nbx - 1, Math.floor((x1 - st.x0) / BUCKET)),
      j0: Math.max(0, Math.floor((y0 - st.y0) / BUCKET)), j1: Math.min(this.nby - 1, Math.floor((y1 - st.y0) / BUCKET))
    };
  };
  Sim.prototype.index = function (p) {
    var R = this.bucketRange(p);
    if (!R) return;
    p.cells = p.cells || {};
    for (var j = R.j0; j <= R.j1; j++) for (var i = R.i0; i <= R.i1; i++) {
      var key = i + j * this.nbx;
      if (!p.cells[key]) { p.cells[key] = true; this.buckets[key].push(p); }
    }
  };
  Sim.prototype.unindex = function (p) {
    var self = this;
    Object.keys(p.cells || {}).forEach(function (key) {
      var list = self.buckets[key], at = list.indexOf(p);
      if (at >= 0) list.splice(at, 1);
    });
    p.cells = {};
  };
  Sim.prototype.addPrim = function (p) {
    p.id = this.nextId++;
    this.prims.push(p);
    this.index(p);
    if (this.entry) this.entry.prims.push(p);
    return p;
  };

  /* ---- history -------------------------------------------------------------
     One entry per learner action: a move (however many legs and frames it
     took), a tool change, or a boring-head adjustment. Undo restores the
     raster cells it changed, drops its primitives and threads, and puts the
     tool and position back. */
  Sim.prototype.begin = function (kind, label) {
    if (this.entry) this.commit();
    this.serial++;
    this.entry = {
      kind: kind, label: label || kind, serial: this.serial,
      before: { pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, tool: this.tool },
      prims: [], cellIdx: [], cellOld: [], threadsBefore: this.threads.map(cloneThread),
      removedBefore: this.removed,
      tally: { left: 0, right: 0, volume: 0 }, plunge: 0, notes: [], blocked: null, xy: 0
    };
    return this.entry;
  };
  Sim.prototype.commit = function () {
    var e = this.entry;
    if (!e) return null;
    this.entry = null;
    var moved = e.before.pos.x !== this.pos.x || e.before.pos.y !== this.pos.y || e.before.pos.z !== this.pos.z;
    var changed = e.prims.length || e.cellIdx.length || e.before.tool !== this.tool ||
      !sameThreads(e.threadsBefore, this.threads);
    if (!moved && !changed) return summarize(e);
    e.cellIdx = Int32Array.from(e.cellIdx);
    e.cellOld = Float64Array.from(e.cellOld);
    this.history.push(e);
    this.version++;
    return summarize(e);
  };
  function summarize(e) {
    var side = null, t = e.tally, tot = t.left + t.right;
    if (t.volume > 1e-6 && tot > 1e-6) {
      var l = t.left / tot;
      side = l > 0.85 ? 'conventional' : l < 0.15 ? 'climb' : 'both';
    }
    return { kind: e.kind, label: e.label, volume: t.volume, side: side, blocked: e.blocked, notes: e.notes.slice() };
  }
  function cloneThread(t) { var c = {}; for (var k in t) c[k] = t[k]; return c; }
  function sameThreads(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].zTip !== b[i].zTip || a[i].cx !== b[i].cx || a[i].cy !== b[i].cy) return false;
    }
    return true;
  }
  Sim.prototype.canUndo = function () { return this.history.length > 0 && !this.entry; };
  Sim.prototype.undo = function () {
    if (this.entry) this.commit();
    var e = this.history.pop();
    if (!e) return null;
    for (var k = e.cellIdx.length - 1; k >= 0; k--) this.raster[e.cellIdx[k]] = e.cellOld[k];
    for (var m = e.prims.length - 1; m >= 0; m--) {
      var p = e.prims[m];
      this.unindex(p);
      var at = this.prims.lastIndexOf(p);
      if (at >= 0) this.prims.splice(at, 1);
    }
    this.threads = e.threadsBefore.map(cloneThread);
    this.pos = { x: e.before.pos.x, y: e.before.pos.y, z: e.before.pos.z };
    this.tool = e.before.tool;
    this.removed = e.removedBefore;
    this.version++;
    return e;
  };

  /* ---- tools ---------------------------------------------------------------*/
  Sim.prototype.loadTool = function (id) {
    var base = TOOL_BY_ID[id];
    if (!base) return { ok: false, message: 'There is no tool called ' + id + '.' };
    if (this.tool && this.tool.id === id) return { ok: true, same: true, message: toolLabel(this.tool) + ' is already in the spindle.' };
    var e = this.begin('tool', 'Tool change');
    var raised = false;
    if (this.pos.z < SETUP.clearZ) { this.pos.z = SETUP.clearZ; raised = true; }
    var t = {};
    for (var k in base) t[k] = base[k];
    this.tool = t;
    e.notes.push((raised ? 'Spindle raised to Z ' + fmtSigned(SETUP.clearZ, 2) + ', then ' : '') +
      toolLabel(t) + ' loaded.');
    this.commit();
    return { ok: true, raised: raised, message: e.notes[0] };
  };

  Sim.prototype.radius = function () { return this.tool ? this.tool.dia / 2 : 0; };

  /* A boring head is adjusted only when the bar is out of the work. */
  Sim.prototype.setBoreDia = function (d) {
    var t = this.tool;
    if (!t || t.kind !== 'bore') return { ok: false, message: 'Load the boring head first.' };
    if (!(d >= t.minDia && d <= t.maxDia)) {
      return { ok: false, message: 'This boring head adjusts from Ø' + fmt(t.minDia, 0) + ' to Ø' + fmt(t.maxDia, 0) + '.' };
    }
    d = Math.round(d * 100) / 100;
    if (this.maxHeightIn(this.pos.x, this.pos.y, t.maxDia / 2) > this.pos.z - EPS && this.pos.z < this.stock.rawTop + EPS) {
      return { ok: false, message: 'Raise the boring bar out of the hole before adjusting it.' };
    }
    if (d === t.dia) return { ok: true, same: true, message: 'Boring head already set to Ø' + fmt(d, 2) + '.' };
    this.begin('tool', 'Boring head setting');
    var c = {};
    for (var k in t) c[k] = t[k];
    c.dia = d;
    this.tool = c;
    this.entry.notes.push('Boring head set to Ø' + fmt(d, 2) + '.');
    this.commit();
    return { ok: true, message: 'Boring head set to Ø' + fmt(d, 2) + '.' };
  };

  /* Highest metal inside a circle, from the raster (contact checks). */
  Sim.prototype.maxHeightIn = function (x, y, r) {
    var R = this.cellRange(x - r, x + r, y - r, y + r), m = -Infinity;
    for (var j = R.j0; j <= R.j1; j++) {
      var cy = this.cellY(j);
      for (var i = R.i0; i <= R.i1; i++) {
        var cx = this.cellX(i);
        if ((cx - x) * (cx - x) + (cy - y) * (cy - y) > r * r + 1e-9) continue;
        var v = this.rasterAt(i, j);
        if (v > this.stock.bottom + EPS && v > m) m = v;
      }
    }
    return m;
  };

  /* ---- motion ----------------------------------------------------------------
     Like a manual mill: X and Y move together on the table, Z moves on its
     own. A move to a point therefore runs as legs, ordered the safe way round:
     up before across, across before down. */
  Sim.prototype.clampTarget = function (t) {
    var tr = SETUP.travel, out = { x: t.x, y: t.y, z: t.z }, note = null;
    if (out.x < tr.x0 || out.x > tr.x1 || out.y < tr.y0 || out.y > tr.y1 || out.z > tr.z1) {
      note = 'That is past the end of the machine’s travel; the move stops at its limit.';
    }
    out.x = q4(Math.min(tr.x1, Math.max(tr.x0, out.x)));
    out.y = q4(Math.min(tr.y1, Math.max(tr.y0, out.y)));
    out.z = q4(Math.min(tr.z1, Math.max(tr.z0, out.z)));
    return { target: out, note: note };
  };
  Sim.prototype.plan = function (target) {
    var c = this.clampTarget({
      x: target.x == null ? this.pos.x : target.x,
      y: target.y == null ? this.pos.y : target.y,
      z: target.z == null ? this.pos.z : target.z
    });
    var t = c.target, p = this.pos, legs = [];
    var xy = function (z) { return { axis: 'xy', from: { x: p.x, y: p.y, z: z }, to: { x: t.x, y: t.y, z: z } }; };
    var zl = function (x, y, z0) { return { axis: 'z', from: { x: x, y: y, z: z0 }, to: { x: x, y: y, z: t.z } }; };
    var moveXY = Math.abs(t.x - p.x) > EPS || Math.abs(t.y - p.y) > EPS, moveZ = Math.abs(t.z - p.z) > EPS;
    if (moveZ && t.z > p.z) { legs.push(zl(p.x, p.y, p.z)); if (moveXY) legs.push(xy(t.z)); }
    else { if (moveXY) legs.push(xy(p.z)); if (moveZ) legs.push(zl(t.x, t.y, p.z)); }
    legs.forEach(function (l) {
      l.len = l.axis === 'xy' ? Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y) : Math.abs(l.to.z - l.from.z);
      l.done = 0;
    });
    return { legs: legs, note: c.note, target: t };
  };

  /* Can the tool sweep from a to b at height z (XY) without breaking a rule?
     Returns { ok, engaged } or { ok:false, code, message }. */
  Sim.prototype.checkXY = function (a, b, z) {
    var T = this.tool, r = T.dia / 2;
    var fx = this.fixtureXY(a, b, z, r);
    if (fx) return fx;
    if (!this.capsuleTouchesStock(a, b, r) || z >= this.stock.rawTop - EPS) return { ok: true, engaged: false };
    var st = this.stock, R = this.cellRange(Math.min(a.x, b.x) - r, Math.max(a.x, b.x) + r, Math.min(a.y, b.y) - r, Math.max(a.y, b.y) + r);
    var engaged = false;
    for (var j = R.j0; j <= R.j1; j++) {
      var y = this.cellY(j);
      for (var i = R.i0; i <= R.i1; i++) {
        var x = this.cellX(i), d = segDist(x, y, a.x, a.y, b.x, b.y);
        if (d > r + 1e-9) continue;
        var h = this.raster[i + j * this.nx];
        if (h <= st.bottom + EPS) continue;
        if (h > z + T.cone * d + EPS) {
          engaged = true;
          if (!T.side) return this.refuse('side');
          if (h > z + T.reach + EPS) return this.refuse('reach', h - z);
        }
      }
    }
    return { ok: true, engaged: engaged };
  };
  Sim.prototype.checkZ = function (p, z0, z1) {
    var T = this.tool, r = T.dia / 2;
    if (z1 >= z0) return { ok: true, engaged: false };
    var fx = this.fixtureXY(p, p, z1, r);
    if (fx) return fx;
    if (T.kind === 'tap') return { ok: true, engaged: false };   // planned separately
    if (!this.capsuleTouchesStock(p, p, r) || z1 >= this.stock.rawTop - EPS) return { ok: true, engaged: false };
    var st = this.stock, R = this.cellRange(p.x - r, p.x + r, p.y - r, p.y + r), engaged = false;
    var bar = T.kind === 'bore' ? T.barDia / 2 : 0;
    for (var j = R.j0; j <= R.j1; j++) {
      var y = this.cellY(j);
      for (var i = R.i0; i <= R.i1; i++) {
        var x = this.cellX(i), d = Math.hypot(x - p.x, y - p.y);
        if (d > r + 1e-9) continue;
        var h = this.raster[i + j * this.nx];
        if (h <= st.bottom + EPS) continue;
        if (h > z1 + T.cone * d + EPS) {
          engaged = true;
          if (!T.plunge) return this.refuse('plunge');
          if (bar && d <= bar + 1e-9) return this.refuse('pilot');
          if (h > z1 + T.reach + EPS) return this.refuse('reach', h - z1);
        }
      }
    }
    return { ok: true, engaged: engaged };
  };
  Sim.prototype.capsuleTouchesStock = function (a, b, r) {
    return segRectDist(a.x, a.y, b.x, b.y, { x0: this.stock.x0, x1: this.stock.x1, y0: this.stock.y0, y1: this.stock.y1 }) <= r + 1e-9;
  };
  Sim.prototype.fixtureXY = function (a, b, z, r) {
    var i;
    if (z < SETUP.jawTop - EPS) {
      for (i = 0; i < SETUP.jaws.length; i++) {
        if (segRectDist(a.x, a.y, b.x, b.y, SETUP.jaws[i]) < r - 1e-9) return this.refuse('jaw', SETUP.jaws[i].name);
      }
    }
    if (z < SETUP.parallelTop - EPS) {
      for (i = 0; i < SETUP.parallels.length; i++) {
        if (segRectDist(a.x, a.y, b.x, b.y, SETUP.parallels[i]) < r - 1e-9) return this.refuse('parallel', SETUP.parallels[i].name);
      }
    }
    if (z < SETUP.viseFloor + EPS && segRectDist(a.x, a.y, b.x, b.y, SETUP.viseBase) < r - 1e-9) return this.refuse('floor');
    return null;
  };

  /* Every refusal names what would have happened and what to do instead. */
  Sim.prototype.refuse = function (code, info) {
    var T = this.tool, L = toolNoun(T), m;
    switch (code) {
      case 'side':
        m = T.kind === 'drill' ? 'A drill cuts only at its point as it feeds down. Pushed sideways in the metal it would bend or snap. Raise it clear of the work before moving across.'
          : T.kind === 'tap' ? 'A tap only goes straight in and straight back out of its hole. Raise it clear of the work before moving across.'
          : 'The boring bar cuts only as it feeds down its hole. Raise it clear of the work before moving across.';
        break;
      case 'reach':
        m = T.kind === 'spot' ? 'Only the 90° point of the ' + L + ' cuts, the first ' + fmt(T.reach, 0) +
            ' mm up from its tip. Any deeper here and the metal would meet its plain body.'
          : T.kind === 'face' ? 'The inserts of the face mill stand only ' + fmt(T.reach, 0) + ' mm below its body, so it cuts no deeper than that in one pass. ' +
            'Take a deeper step in several passes.'
          : 'The cutting edges of the ' + L + ' run only ' + fmt(T.reach, 0) + ' mm up from its tip. Any deeper here and the metal would rub on the plain shank above them. ' +
            'A cutter with longer flutes is needed.';
        break;
      case 'plunge':
        m = 'A face mill cuts with the inserts around its rim as it moves across. It cannot be pushed straight down into the metal. Lower it beside the work, then feed it across.';
        break;
      case 'pilot':
        m = 'The boring bar has no cutting edge at its centre: it needs a hole at least Ø' + fmt(T.barDia + 1, 0) +
          ' to start in. Drill or mill one first.';
        break;
      case 'jaw':
        m = 'The ' + L + ' would hit the ' + info + '. Below Z ' + fmtSigned(SETUP.jawTop, 2) + ' the jaws are in the way along the front and back of the part.';
        break;
      case 'parallel':
        m = 'The ' + L + ' would run into the ' + info + ' under the part. Holes near the front and back edges cannot go through in this setup.';
        break;
      case 'floor':
        m = 'The ' + L + ' would hit the floor of the vise at Z ' + fmtSigned(SETUP.viseFloor, 2) + '.';
        break;
      default:
        m = info || 'That move is not possible.';
    }
    return { ok: false, code: code, message: m };
  };

  /* Bisection for the furthest allowed fraction of a leg segment. Every
     rule is monotone along a straight leg: a longer sweep covers more. */
  Sim.prototype.furthest = function (test, len) {
    var lo = 0, hi = 1, last = null;
    for (var k = 0; k < 26; k++) {
      var mid = (lo + hi) / 2, r = test(mid);
      if (r.ok) lo = mid; else { hi = mid; last = r; }
    }
    // stop a hair short of the contact, so a refused move removes nothing
    lo = Math.max(0, lo - 4 * EPS / Math.max(len || 1, EPS));
    return { t: lo, refusal: last || test(1) };
  };

  /* Apply the cut swept by moving from a to b at height z (XY leg). */
  Sim.prototype.cutXY = function (a, b, z) {
    var T = this.tool, e = this.entry;
    if (!T.side || z >= this.stock.rawTop - EPS) return;
    if (!this.capsuleTouchesStock(a, b, T.dia / 2)) return;
    var last = e.prims[e.prims.length - 1];
    var seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y };
    if (last && last.leg === e.legSerial && last.kind === 'sweep' &&
        Math.abs(last.bx - a.x) < 1e-7 && Math.abs(last.by - a.y) < 1e-7) {
      last.bx = b.x; last.by = b.y;        // same straight leg: extend
      this.index(last);
      this.stamp(last, seg, e.tally);
      return;
    }
    var p = this.addPrim({ kind: 'sweep', leg: e.legSerial, tool: T.id, ax: a.x, ay: a.y, bx: b.x, by: b.y,
      r: T.dia / 2, z: z, cone: T.cone });
    this.stamp(p, seg, e.tally);
  };
  /* Apply the plunge to depth z1 at p (Z leg, going down). */
  Sim.prototype.cutZ = function (p, z1) {
    var T = this.tool, e = this.entry;
    if (T.kind === 'tap' || z1 >= this.stock.rawTop - EPS) return;
    if (!this.capsuleTouchesStock(p, p, T.dia / 2)) return;
    var last = e.prims[e.prims.length - 1];
    if (last && last.leg === e.legSerial && last.kind === 'plunge') {
      if (z1 < last.z) { last.z = z1; this.stamp(last, null, e.tally); }
      return;
    }
    var prim = this.addPrim({ kind: 'plunge', leg: e.legSerial, tool: T.id, ax: p.x, ay: p.y, bx: p.x, by: p.y,
      r: T.dia / 2, z: z1, cone: T.cone });
    this.stamp(prim, null, e.tally);
  };

  /* Start a leg; the tap's whole descent is planned once, up front. */
  Sim.prototype.startLeg = function (leg) {
    if (!this.entry) this.begin('move', 'Move');
    this.entry.legSerial = (this.entry.legSerial || 0) + 1;
    leg.serial = this.entry.legSerial;
    if (leg.axis === 'z' && leg.to.z < leg.from.z && this.tool && this.tool.kind === 'tap') {
      leg.tap = this.planTap(leg.from, leg.to.z);
    }
  };

  /* Advance along a leg by up to dist mm. */
  Sim.prototype.advance = function (leg, dist) {
    if (!this.tool) return { done: true, blocked: true, message: 'Load a tool first.' };
    if (leg.serial == null) this.startLeg(leg);
    var remain = leg.len - leg.done;
    if (remain <= EPS) return { done: true };
    var d = Math.min(dist, remain), f = (leg.done + d) / leg.len;
    var self = this, a = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    var b = {
      x: leg.from.x + (leg.to.x - leg.from.x) * f,
      y: leg.from.y + (leg.to.y - leg.from.y) * f,
      z: leg.from.z + (leg.to.z - leg.from.z) * f
    };
    if (leg.done + d >= leg.len - EPS) b = { x: leg.to.x, y: leg.to.y, z: leg.to.z };
    var res;
    if (leg.axis === 'xy') {
      res = this.checkXY(a, b, a.z);
      if (!res.ok) {
        var fr = this.furthest(function (t) { return self.checkXY(a, lerp(a, b, t), a.z); }, Math.hypot(b.x - a.x, b.y - a.y));
        var stop = lerp(a, b, fr.t);
        this.cutXY(a, stop, a.z);
        this.pos = stop;
        return this.block(leg, fr.refusal);
      }
      this.cutXY(a, b, a.z);
      if (res.engaged) this.entry.xy += Math.hypot(b.x - a.x, b.y - a.y);
    } else if (b.z < a.z) {
      if (leg.tap) {
        var stopZ = leg.tap.stopZ;
        if (b.z < stopZ - EPS) {
          this.pos = { x: a.x, y: a.y, z: Math.min(a.z, stopZ) };
          this.finishTap(leg);
          return this.block(leg, { ok: false, code: leg.tap.code, message: leg.tap.message });
        }
        this.pos = b;
        if (leg.done + d >= leg.len - EPS) this.finishTap(leg);
        leg.done += d;
        return { done: leg.done >= leg.len - EPS };
      }
      res = this.checkZ(a, a.z, b.z);
      if (!res.ok) {
        var fz = this.furthest(function (t) { return self.checkZ(a, a.z, a.z + (b.z - a.z) * t); }, a.z - b.z);
        var zs = a.z + (b.z - a.z) * fz.t;
        this.cutZ(a, zs);
        this.pos = { x: a.x, y: a.y, z: zs };
        return this.block(leg, fz.refusal);
      }
      this.cutZ(a, b.z);
      if (res.engaged) this.entry.plunge = Math.max(this.entry.plunge, a.z - b.z);
    }
    this.pos = b;
    leg.done += d;
    return { done: leg.done >= leg.len - EPS };
  };
  Sim.prototype.block = function (leg, refusal) {
    leg.done = leg.len;
    leg.blocked = refusal;
    if (this.entry) this.entry.blocked = refusal;
    return { done: true, blocked: true, code: refusal.code, message: refusal.message };
  };
  /* Not rounded: a stop at the point of contact has to stay exactly there,
     or the next move would start a hair inside the metal. */
  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  }

  /* Run a whole move at once: the tests, reduced motion and print use this. */
  Sim.prototype.moveTo = function (target, label) {
    var pl = this.plan(target);
    this.begin('move', label || 'Move');
    if (pl.note) this.entry.notes.push(pl.note);
    for (var k = 0; k < pl.legs.length; k++) {
      var r = this.advance(pl.legs[k], Infinity);
      if (r.blocked) break;
    }
    return this.commit();
  };

  /* ---- holes and taps ------------------------------------------------------*/
  /* Distance from (x, y) along direction u to the first metal at height z,
     searching out to maxR. Infinity when the hole is open that way. */
  Sim.prototype.firstMetal = function (x, y, ux, uy, z, maxR, step) {
    step = step || 0.05;
    var self = this;
    var metal = function (rho) {
      var h = self.heightAt(x + ux * rho, y + uy * rho);
      return h > self.stock.bottom + EPS && h >= z - 1e-9;
    };
    if (metal(0)) return 0;
    var prev = 0;
    for (var rho = step; rho <= maxR + 1e-9; rho += step) {
      if (metal(rho)) {
        var lo = prev, hi = rho;
        for (var k = 0; k < 24; k++) { var mid = (lo + hi) / 2; if (metal(mid)) hi = mid; else lo = mid; }
        return hi;
      }
      prev = rho;
    }
    return Infinity;
  };
  /* Inscribed and circumscribed radius of the opening around an axis. */
  Sim.prototype.openingAt = function (x, y, z, maxR, dirs) {
    dirs = dirs || 24;
    var rIn = Infinity, rOut = 0, open = false, pts = [];
    for (var k = 0; k < dirs; k++) {
      var a = 2 * Math.PI * k / dirs, ux = Math.cos(a), uy = Math.sin(a);
      var rho = this.firstMetal(x, y, ux, uy, z, maxR);
      if (rho === Infinity) { open = true; rOut = Infinity; continue; }
      pts.push({ x: x + ux * rho, y: y + uy * rho });
      if (rho < rIn) rIn = rho;
      if (rho > rOut) rOut = rho;
    }
    return { rIn: rIn === Infinity ? maxR : rIn, rOut: rOut, open: open, pts: pts };
  };
  Sim.prototype.surfaceAround = function (x, y, r) {
    var m = -Infinity;
    for (var k = 0; k < 16; k++) {
      var a = 2 * Math.PI * k / 16, h = this.heightAt(x + r * Math.cos(a), y + r * Math.sin(a));
      if (h > m) m = h;
    }
    return m;
  };

  /* Plan a tap's descent from p down to zTarget against the hole that is
     actually there. Result: how far it may go, and the thread it would cut.
     Checked in the order a machinist would find out: is there a hole, is
     the tap over its centre, is it the right size, how deep does it go. */
  Sim.prototype.planTap = function (p, zTarget) {
    var T = this.tool, th = THREADS[T.thread], P = th.pitch, R = th.major / 2;
    var zSurf = this.surfaceAround(p.x, p.y, R + 1.5);
    var none = { stopZ: zTarget, code: null, message: null, record: null };
    if (zSurf === -Infinity || zTarget >= zSurf - EPS || zSurf <= this.stock.bottom + EPS) return none;
    var breakMin = th.minorMin - 0.25 * P;     // smaller than this and the tap would break
    var levels = [], z;
    for (z = zSurf - 0.1; z > zTarget + 1e-9; z -= 0.25) levels.push(z);
    levels.push(zTarget);
    var self = this;
    var row = function (lv) {
      var o = self.openingAt(p.x, p.y, lv, R + 1, 24);
      o.fit = o.open ? null : fitCircle(o.pts);
      return { z: lv, o: o };
    };
    var rows = levels.map(row);
    var stopAbove = function (code, message, lvl) {
      return { stopZ: Math.min(p.z, Math.max(zTarget, lvl)), code: code, message: message, record: null };
    };
    // The hole starts at the first level that is closed all round. Above it
    // the tap may pass through open air: a wide countersink, or a cut the
    // hole breaks out into. (Metal is a column, so a level that is open is
    // open at every level above it too: the open levels are always on top.)
    var closed = function (r) { return !r.o.open && r.o.fit && r.o.fit.r > 0.3; };
    var k0 = -1;
    for (var i = 0; i < rows.length; i++) if (closed(rows[i])) { k0 = i; break; }
    if (k0 < 0) {
      return stopAbove('tap-nohole', 'There is no hole here for the tap. A tap cuts its thread into the wall of a hole that is already there: drill one first, at the tap drill size.', zSurf);
    }
    // the straight part of the hole: the commonest fitted diameter
    var counts = {}, best = null, bestRow = null;
    rows.slice(k0).filter(closed).forEach(function (r) {
      var key = (Math.round(r.o.fit.r * 200) / 100).toFixed(2);
      counts[key] = (counts[key] || 0) + 1;
      if (!best || counts[key] > counts[best]) { best = key; bestRow = r; }
    });
    var D = Number(best), off = Math.hypot(bestRow.o.fit.x - p.x, bestRow.o.fit.y - p.y);
    if (off > 0.15) {
      return stopAbove('tap-align', 'The tap is ' + fmt(off, 2) + ' mm off the centre of this hole. Line it up first: go to the X and Y the hole was drilled at.', zSurf);
    }
    if (D < breakMin) {
      return stopAbove('tap-small', 'This hole is \u00d8' + fmt(D, 2) + ': too small for an ' + th.label + ' tap, which would have to cut solid metal at its core and would likely break. ' +
        th.label + ' is tapped into a \u00d8' + fmt(th.tapDrill, 1) + ' hole.', zSurf);
    }
    if (D >= th.major - 0.1 * P) {
      return stopAbove('tap-large', 'This hole is \u00d8' + fmt(D, 2) + ', as big as the ' + th.label + ' thread itself. The tap would have nothing to cut.', zSurf);
    }
    // the tip stops where the hole narrows (the drill point) or ends
    var narrow = function (r) { return !r.o.open && 2 * r.o.rIn < breakMin; };
    var stop = zTarget, code = null, msg = null;
    for (var k = 0; k < rows.length; k++) {
      if (!narrow(rows[k])) continue;
      var hi = k > 0 ? rows[k - 1].z : zSurf, lo = rows[k].z;
      for (var b = 0; b < 12; b++) {
        var mid = (hi + lo) / 2;
        if (narrow(row(mid))) lo = mid; else hi = mid;
      }
      stop = hi;
      code = 'tap-bottom';
      msg = 'The tap reached the bottom of the hole at Z ' + fmtSigned(stop, 2) + ' and stopped there: forced further, it would break. ' +
        'Its first ' + T.lead + ' threads are tapered, so full thread ends ' + fmt(T.lead * P, 2) + ' mm above its tip. Drill deeper for more full thread.';
      break;
    }
    var quality = D < th.minorMin ? 'tight' : D <= th.minorMax ? 'ok' : 'shallow';
    return {
      stopZ: stop, code: code, message: msg,
      record: { spec: th.id, cx: p.x, cy: p.y, zSurf: zSurf, hole: D, quality: quality }
    };
  };
  Sim.prototype.finishTap = function (leg) {
    var plan = leg.tap;
    if (!plan || !plan.record || leg.tapDone) return;
    leg.tapDone = true;
    var zTip = this.pos.z, T = this.tool, P = THREADS[T.thread].pitch;
    if (zTip >= plan.record.zSurf - EPS) return;
    var rec = plan.record, ex = null;
    for (var i = 0; i < this.threads.length; i++) {
      var t = this.threads[i];
      if (t.spec === rec.spec && Math.hypot(t.cx - rec.cx, t.cy - rec.cy) < 0.2) { ex = t; break; }
    }
    if (ex) {
      if (zTip < ex.zTip) { ex.zTip = zTip; ex.fullBottom = zTip + T.lead * P; }
    } else {
      this.threads.push({ spec: rec.spec, cx: rec.cx, cy: rec.cy, zTop: rec.zSurf, zTip: zTip,
        fullBottom: zTip + T.lead * P, hole: rec.hole, quality: rec.quality });
    }
    this.entry.notes.push('Thread cut: ' + THREADS[rec.spec].label + ' down to Z ' + fmtSigned(zTip, 2) +
      ' (full thread to Z ' + fmtSigned(zTip + T.lead * P, 2) + ').');
  };

  /* What is left of a thread now: full thread survives at a height only
     where the metal between its minor and major diameters is still there
     all the way round. Later cuts lower or remove it. */
  Sim.prototype.threadState = function (t) {
    var th = THREADS[t.spec], rMid = (t.hole / 2 + th.major / 2) / 2;
    var top = Infinity;
    for (var k = 0; k < 24; k++) {
      var a = 2 * Math.PI * k / 24;
      var h = this.heightAt(t.cx + rMid * Math.cos(a), t.cy + rMid * Math.sin(a));
      if (h < top) top = h;
    }
    var fullTop = Math.min(top, t.zTop);
    return { top: fullTop, bottom: t.fullBottom, length: Math.max(0, fullTop - t.fullBottom) };
  };

  /* ---- where the tool may be drawn: holder and spindle are not modelled --*/
  Sim.prototype.snapshot = function () {
    return { pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, tool: this.tool, version: this.version };
  };

  /* ======================================================================
     Measuring
     ====================================================================*/
  /* Walk from p along u until the surface crosses level z, in the given
     sense ('up': first point with metal at z; 'down': first point without). */
  Sim.prototype.edgeAlong = function (px, py, ux, uy, z, maxD, sense) {
    var self = this, step = 0.05;
    var hit = function (s) {
      var h = self.heightAt(px + ux * s, py + uy * s);
      var metal = h > self.stock.bottom + EPS && h >= z;
      return sense === 'down' ? !metal : metal;
    };
    if (hit(0)) return 0;
    var prev = 0;
    for (var s = step; s <= maxD + 1e-9; s += step) {
      if (hit(s)) {
        var lo = prev, hi = s;
        for (var k = 0; k < 26; k++) { var m = (lo + hi) / 2; if (hit(m)) hi = m; else lo = m; }
        return hi;
      }
      prev = s;
    }
    return Infinity;
  };

  /* Least-squares circle through points (Kasa). */
  function fitCircle(pts) {
    var n = pts.length;
    if (n < 3) return null;
    var sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    pts.forEach(function (p) {
      var z = p.x * p.x + p.y * p.y;
      sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y;
      sxz += p.x * z; syz += p.y * z; sz += z;
    });
    // solve [sxx sxy sx; sxy syy sy; sx sy n] [D E F]^T = -[sxz syz sz]^T
    var A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], B = [-sxz, -syz, -sz];
    var sol = solve3(A, B);
    if (!sol) return null;
    var cx = -sol[0] / 2, cy = -sol[1] / 2, r2 = cx * cx + cy * cy - sol[2];
    return r2 > 0 ? { x: cx, y: cy, r: Math.sqrt(r2) } : null;
  }
  function solve3(A, B) {
    var M = A.map(function (row, i) { return row.concat([B[i]]); });
    for (var c = 0; c < 3; c++) {
      var piv = c;
      for (var r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-12) return null;
      var tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      for (var r2 = 0; r2 < 3; r2++) {
        if (r2 === c) continue;
        var f = M[r2][c] / M[c][c];
        for (var k = c; k < 4; k++) M[r2][k] -= f * M[c][k];
      }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }

  return {
    EPS: EPS, CELL: CELL, SETUP: SETUP, TOOLS: TOOLS, TOOL_BY_ID: TOOL_BY_ID, THREADS: THREADS,
    Sim: Sim, create: function (o) { return new Sim(o); },
    toolLabel: toolLabel, toolNoun: toolNoun, fmt: fmt, fmtSigned: fmtSigned, parseNum: parseNum, q4: q4,
    segDist: segDist, sdBox: sdBox, sdCircle: sdCircle, sdCapsule: sdCapsule, fitCircle: fitCircle,
    segRectDist: segRectDist
  };
});

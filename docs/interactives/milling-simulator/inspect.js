/* ============================================================================
   milling-simulator / inspect.js - is the part that is left the part on the
   drawing?

   Nothing here looks at which tools were used or in what order. Every check
   reads the metal that is actually left (model.js heightAt), so a feature
   cut early and spoiled by a later cut fails, and any sequence that leaves
   the right shape passes.

   Two instruments, because they answer different questions:

   1. The ENVELOPE says WHERE the part is wrong. Each drawing feature claims
      a region and the band of heights the top surface may have there, with
      a sideways tolerance band at every edge where either height is fine.
      Every raster cell is then "fine", "still to remove" or "cut too far".
      This drives the colour overlay. Geometry-derived probes supplement
      the grid at cut apices, endpoints, footprints and feature boundaries.

   2. The MEASUREMENTS say HOW MUCH. Walls are found by walking the exact
      surface out from inside a feature, holes by fitting a circle to the
      hole wall, threads by checking that the metal they were cut in is still
      there. Displayed values are rounded to the hundredth. These sampled
      teaching checks do not certify every point of a manufactured surface.
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiMillingSim);
  if (node) module.exports = api;
  else root.CourseWikiMillingInspect = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  var fmt = M.fmt, fmtSigned = M.fmtSigned;
  var DRILL_CONE = 1 / Math.tan(118 * Math.PI / 360);
  var ROOT2M1 = Math.SQRT2 - 1;

  function tolXY(f) { return f.tolXY == null ? 0.1 : f.tolXY; }
  function tolZ(f) { return f.tolZ == null ? 0.05 : f.tolZ; }
  function cot(deg) { return 1 / Math.tan(deg * Math.PI / 360); }

  /* ---- the envelope: allowed [lo, hi] for the top surface at (x, y) ------*/
  function set(env, lo, hi, f) { env.lo = lo; env.hi = hi; env.owner = f.id; env.mode = 'set'; }
  function widen(env, lo, f) { if (lo < env.lo) env.lo = lo; env.owner = f.id; env.mode = 'band'; }

  var CLASSIFY = {
    recess: function (f, x, y, env) {
      var cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2, hw = (f.x1 - f.x0) / 2, hh = (f.y1 - f.y0) / 2;
      var t = tolXY(f), z = tolZ(f);
      var si = M.sdBox(x, y, cx, cy, hw, hh, f.rMax || 0);
      if (si < -t) return set(env, f.floor - z, f.floor + z, f);
      if (M.sdBox(x, y, cx, cy, hw, hh, 0) <= t) widen(env, f.floor - z, f);
    },
    slot: function (f, x, y, env) {
      var s = M.sdCapsule(x, y, f.ax, f.ay, f.bx, f.by, f.width / 2), t = tolXY(f), z = tolZ(f);
      if (s < -t) return set(env, f.floor - z, f.floor + z, f);
      if (s <= t) widen(env, f.floor - z, f);
    },
    boss: function (f, x, y, env) {
      var sb = M.sdBox(x, y, (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, (f.x1 - f.x0) / 2, (f.y1 - f.y0) / 2, 0);
      var t = tolXY(f), z = tolZ(f);
      if (sb > t) return set(env, f.floor - z, f.floor + z, f);
      if (sb >= -t) widen(env, f.floor - z, f);
    },
    chamfer: function (f, x, y, env, job) {
      var b = f.boss, top = job.top, c = f.size, t = tolXY(f), z = tolZ(f);
      var sb = M.sdBox(x, y, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, 0);
      if (sb >= 0) return;
      var e = -sb, zt = top - c + e;
      if (e < t) return widen(env, zt - z, f);
      if (e < c - t) return set(env, zt - z, zt + z, f);
      if (e <= c + t) widen(env, zt - z, f);
    },
    hole: function (f, x, y, env, job) {
      var d0 = Math.hypot(x - f.cx, y - f.cy), r = f.d / 2, t = tolXY(f), z = tolZ(f);
      var top = f.top == null ? job.top : f.top, bottom = job.bottom;
      if (f.csk) {
        var rc = f.csk.d / 2, kc = cot(f.csk.angle), zc = top - (rc - d0) * kc;
        var tc = f.csk.tol == null ? 0.2 : f.csk.tol;
        if (d0 < rc - tc) set(env, zc - tc * kc - z, zc + tc * kc + z, f);
        else if (d0 <= rc + tc) widen(env, zc - tc * kc - z, f);
      }
      var lo, hi;
      if (f.through) { lo = -Infinity; hi = bottom + z; }
      else if (f.thread) { lo = bottom + (f.minWall == null ? 1 : f.minWall); hi = top - f.thread.depth + z; }
      else { var zf = top - f.depth; lo = zf - DRILL_CONE * Math.max(0, r - d0) - z; hi = zf + z; }
      if (d0 < r - t) return set(env, lo, hi, f);
      if (d0 <= r + t) widen(env, lo, f);
    }
  };

  /* Compare every raster cell with the envelope, and keep per-feature
     statistics: how much of it has been cut at all, and the heights seen
     on its floor. */
  function envAt(job, x, y, env) {
    var tz = job.tolTop == null ? 0.05 : job.tolTop;
    env.lo = job.top - tz; env.hi = job.top + tz; env.owner = 'top'; env.mode = 'set';
    for (var k = 0; k < job.features.length; k++) CLASSIFY[job.features[k].type](job.features[k], x, y, env, job);
    return env;
  }
  function compare(sim, job) {
    var nx = sim.nx, ny = sim.ny, n = nx * ny;
    var status = new Uint8Array(n), owners = {}, env = { lo: 0, hi: 0, owner: 'top', mode: 'set' };
    var tz = job.tolTop == null ? 0.05 : job.tolTop, bottom = sim.stock.bottom;
    var tally = function (id) {
      return owners[id] || (owners[id] = { excess: 0, over: 0, cells: 0, cut: 0, ex: null, ov: null, deepest: 0,
        hmin: Infinity, hmax: -Infinity, floorMin: Infinity, floorMax: -Infinity, setCells: 0, setCut: 0 });
    };
    var grow = function (b, x, y) {
      if (!b) return { x0: x, x1: x, y0: y, y1: y };
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      return b;
    };
    var excess = 0, over = 0;
    for (var j = 0; j < ny; j++) {
      var y = sim.cellY(j);
      for (var i = 0; i < nx; i++) {
        var x = sim.cellX(i);
        envAt(job, x, y, env);
        var h = sim.rasterAt(i, j), o = tally(env.owner), idx = i + j * nx;
        o.cells++;
        if (h < o.hmin) o.hmin = h; if (h > o.hmax) o.hmax = h;
        var cut = h < job.top - tz;
        if (cut) o.cut++;
        if (env.mode === 'set') {
          o.setCells++;
          if (cut) { o.setCut++; if (h < o.floorMin) o.floorMin = h; if (h > o.floorMax) o.floorMax = h; }
        }
        // a column cut right through is "no metal": it satisfies any band that reaches the bottom
        var hv = h <= bottom + 1e-9 ? -Infinity : h;
        if (hv > env.hi + 1e-9) { status[idx] = 1; excess++; o.excess++; o.ex = grow(o.ex, x, y); }
        else if (hv < env.lo - 1e-9) {
          status[idx] = 2; over++; o.over++; o.ov = grow(o.ov, x, y);
          var dd = env.lo - Math.max(h, bottom); if (dd > o.deepest) o.deepest = dd;
        }
      }
    }
    function witness(x, y) {
      if (!sim.inStock(x, y)) return;
      envAt(job, x, y, env);
      var h = sim.heightAt(x, y), hv = h <= bottom + 1e-9 ? -Infinity : h;
      if (hv >= env.lo - 1e-9) return;
      var i = Math.min(nx - 1, Math.max(0, Math.floor((x - sim.stock.x0) / M.CELL)));
      var j = Math.min(ny - 1, Math.max(0, Math.floor((y - sim.stock.y0) / M.CELL))), idx = i + j * nx;
      if (status[idx] !== 2) { over++; status[idx] = 2; }
      var o = tally(env.owner);
      o.over++; o.ov = grow(o.ov, x, y);
      o.deepest = Math.max(o.deepest, env.lo - Math.max(h, bottom));
    }
    sim.prims.forEach(function (p) { M.cutWitnesses(p, witness); });
    // Drawing boundaries need their own probes: they rarely align with
    // cell centres. Check just inside and outside each tolerance band.
    job.features.forEach(function (f) {
      var t = tolXY(f), xs = [], ys = [];
      if (f.x0 != null) xs = [f.x0-t-1e-5, f.x0+t+1e-5, f.x1-t-1e-5, f.x1+t+1e-5];
      if (f.y0 != null) ys = [f.y0-t-1e-5, f.y0+t+1e-5, f.y1-t-1e-5, f.y1+t+1e-5];
      xs.forEach(function (x) { for (var y=sim.stock.y0; y<=sim.stock.y1; y+=M.CELL) witness(x,y); });
      ys.forEach(function (y) { for (var x=sim.stock.x0; x<=sim.stock.x1; x+=M.CELL) witness(x,y); });
    });
    return { status: status, excess: excess, over: over, owners: owners };
  }

  /* ---- measurement helpers -----------------------------------------------*/
  function within(v, nominal, tol) { return Math.abs(v - nominal) <= tol + 1e-9; }
  function mm(v) { return fmt(v, 2); }
  function stations(a, b, keep) {
    var span = b - a, k = keep || 0;
    var lo = a + Math.min(span / 2, k), hi = b - Math.min(span / 2, k);
    return [lo + (hi - lo) * 0.2, (lo + hi) / 2, lo + (hi - lo) * 0.8];
  }
  function check(ok, text) { return { ok: !!ok, text: text }; }
  function regionNote(o) {
    if (!o) return '';
    return ' (gold on the view' + (o.ex ? ', around X ' + fmt((o.ex.x0 + o.ex.x1) / 2, 0) + ' Y ' + fmt((o.ex.y0 + o.ex.y1) / 2, 0) : '') + ')';
  }
  function cellChecks(cmp, f, checks, what) {
    var o = cmp.owners[f.id];
    if (!o) return;
    if (o.over) {
      checks.push(check(false, 'Cut too far in ' + what + ': up to ' + fmt(o.deepest, 2) + ' mm past the drawing' +
        (o.ov ? ', around X ' + fmt((o.ov.x0 + o.ov.x1) / 2, 0) + ' Y ' + fmt((o.ov.y0 + o.ov.y1) / 2, 0) : '') + ' (red on the view).'));
    }
    if (o.excess) checks.push(check(false, 'Metal still to remove in ' + what + regionNote(o) + '.'));
  }
  function verdict(row) {
    var bad = row.checks.filter(function (c) { return !c.ok; });
    row.ok = bad.length === 0;
    if (row.ok) row.status = 'ok';
    else if (row.overcut) row.status = 'over';
    else if (row.untouched) row.status = 'none';
    else row.status = 'todo';
    return row;
  }

  /* Where is the wall that should stand at P? s points from P into the
     metal the drawing keeps. Start 2 mm inside that metal and walk out
     until it ends (or, if it is already gone there, walk further in until
     it starts). dev > 0: the wall stands dev mm out on the cut side, so
     metal remains; dev < 0: cut |dev| mm too far. */
  function measureWall(sim, px, py, sx, sy, zmid, reach) {
    var bottom = sim.stock.bottom;
    var Sx = px + 2 * sx, Sy = py + 2 * sy, h = sim.heightAt(Sx, Sy);
    if (h > bottom + 1e-6 && h >= zmid) {
      var u = sim.edgeAlong(Sx, Sy, -sx, -sy, zmid, 2 + reach, 'down');
      return u === Infinity ? { notCut: true } : { dev: u - 2 };
    }
    var v = sim.edgeAlong(Sx, Sy, sx, sy, zmid, 40, 'up');
    return v === Infinity ? { gone: true } : { dev: -(2 + v) };
  }
  /* Fold a wall's stations into one check. */
  function wallCheck(row, name, results, t) {
    var remain = -Infinity, overc = -Infinity, notCut = 0, gone = 0;
    results.forEach(function (r) {
      if (r.gone) gone++;
      else if (r.notCut) notCut++;
      else { if (r.dev > remain) remain = r.dev; if (-r.dev > overc) overc = -r.dev; }
    });
    if (gone) { row.overcut = true; row.checks.push(check(false, 'The ' + name + ' has been cut away.')); return; }
    if (overc > t) { row.overcut = true; row.checks.push(check(false, 'The ' + name + ' is cut ' + mm(overc) + ' mm too far.')); return; }
    if (notCut === results.length) { row.checks.push(check(false, 'Nothing cut up to the ' + name + ' yet.')); return; }
    if (notCut) { row.checks.push(check(false, 'Parts of the ' + name + ' are not reached yet.')); return; }
    if (remain > t) { row.checks.push(check(false, 'The ' + name + ' needs ' + mm(remain) + ' mm more taken off.')); return; }
    row.checks.push(check(true, 'The ' + name + ' is within \u00b1' + fmt(t, 2) + ' mm.'));
  }
  function floorCheck(row, o, f, where) {
    var tz = tolZ(f);
    if (!o || !o.setCut) return;
    if (o.floorMin < f.floor - tz) { row.overcut = true; row.checks.push(check(false, where + ' is cut ' + mm(f.floor - o.floorMin) + ' mm too deep (Z ' + fmtSigned(o.floorMin, 2) + ').')); }
    else if (o.floorMax > f.floor + tz) row.checks.push(check(false, where + ' is still up to Z ' + fmtSigned(o.floorMax, 2) + ' in places: ' + mm(o.floorMax - f.floor) + ' mm to go.'));
    else if (o.setCut < o.setCells) row.checks.push(check(false, where + ' is at Z ' + fmtSigned(f.floor, 2) + ' where it is cut, but not all of it is cut yet.'));
    else row.checks.push(check(true, where + ' is at Z ' + fmtSigned(f.floor, 2) + ' \u00b1' + fmt(tz, 2) + '.'));
  }

  /* ---- per-feature measurement -------------------------------------------*/
  var MEASURE = {};

  MEASURE.top = function (sim, job, cmp) {
    var o = cmp.owners.top || { excess: 0, over: 0, cells: 0, hmin: 0, hmax: 0 };
    var row = { id: 'top', label: job.topLabel || 'Top face at Z ' + fmtSigned(job.top, 2), checks: [] };
    var lo = o.hmin, hi = o.hmax;
    row.measured = o.cells ? (Math.abs(hi - lo) < 0.005 ? 'Z ' + fmtSigned(hi, 2) : 'Z ' + fmtSigned(lo, 2) + ' to ' + fmtSigned(hi, 2)) : '';
    row.untouched = o.cells && lo >= sim.stock.rawTop - 1e-6;
    if (o.excess) {
      var pct = Math.max(1, Math.round(100 * o.excess / Math.max(1, o.cells)));
      row.checks.push(check(false, row.untouched ? 'Not faced yet: the raw top stands ' + fmt(sim.stock.rawTop - job.top, 2) + ' mm above Z ' + fmtSigned(job.top, 2) + '.'
        : 'About ' + pct + '% of the top is still above Z ' + fmtSigned(job.top, 2) + regionNote(o) + '.'));
    }
    if (o.over) { row.overcut = true; row.checks.push(check(false, 'The top has been cut below Z ' + fmtSigned(job.top, 2) + ', up to ' + fmt(o.deepest, 2) + ' mm too deep (red on the view).')); }
    if (!row.checks.length) row.checks.push(check(true, 'Top-face probes are within tolerance at Z ' + fmtSigned(job.top, 2) + '.'));
    return verdict(row);
  };

  MEASURE.recess = function (sim, job, cmp, f) {
    var st = sim.stock, t = tolXY(f), top = job.top, o = cmp.owners[f.id];
    var zmid = (top + f.floor) / 2, row = { id: f.id, label: f.label, checks: [] };
    var x0 = Math.max(f.x0, st.x0), x1 = Math.min(f.x1, st.x1), y0 = Math.max(f.y0, st.y0), y1 = Math.min(f.y1, st.y1);
    var keep = (f.rMax || 0) + 1, what = f.kind || 'recess';
    var walls = [
      { side: 'left', inside: f.x0 > st.x0 + 0.5, at: f.x0, sx: -1, sy: 0, reach: x1 - x0 },
      { side: 'right', inside: f.x1 < st.x1 - 0.5, at: f.x1, sx: 1, sy: 0, reach: x1 - x0 },
      { side: 'front', inside: f.y0 > st.y0 + 0.5, at: f.y0, sx: 0, sy: -1, reach: y1 - y0 },
      { side: 'back', inside: f.y1 < st.y1 - 0.5, at: f.y1, sx: 0, sy: 1, reach: y1 - y0 }
    ];
    row.untouched = !o || !o.cut;
    if (row.untouched) row.checks.push(check(false, 'Not cut yet.'));
    else {
      walls.forEach(function (w) {
        if (!w.inside) return;
        var list = w.sx ? stations(y0, y1, keep) : stations(x0, x1, keep);
        var res = list.map(function (sv) {
          return w.sx ? measureWall(sim, w.at, sv, w.sx, 0, zmid, w.reach) : measureWall(sim, sv, w.at, 0, w.sy, zmid, w.reach);
        });
        wallCheck(row, w.side + ' wall (' + (w.sx ? 'X ' : 'Y ') + mm(w.at) + ')', res, t);
      });
      floorCheck(row, o, f, 'The floor');
      var parts = [];
      if (o.setCut) parts.push('floor Z ' + fmtSigned(o.floorMax, 2));
      if (f.rMax) {
        var worst = 0;
        [[f.x0, f.y0, 1, 1], [f.x1, f.y0, -1, 1], [f.x0, f.y1, 1, -1], [f.x1, f.y1, -1, -1]].forEach(function (c) {
          var s = sim.edgeAlong(c[0], c[1], c[2] / Math.SQRT2, c[3] / Math.SQRT2, zmid, 2 * f.rMax + 10, 'down');
          var R = s === Infinity ? Infinity : s / ROOT2M1;
          if (R > worst) worst = R;
        });
        if (worst === Infinity) row.checks.push(check(false, 'Its corners are not reached yet.'));
        else if (worst > f.rMax + t) row.checks.push(check(false, 'Its corners are about R' + fmt(worst, 1) + ', rounder than R' + fmt(f.rMax, 0) +
          ' max. A cutter leaves its own radius in an inside corner.'));
        else row.checks.push(check(true, 'Corners R' + fmt(worst, 1) + ', no rounder than R' + fmt(f.rMax, 0) + '.'));
        if (worst !== Infinity) parts.push('corners R' + fmt(worst, 1));
      }
      row.measured = parts.join(', ');
    }
    cellChecks(cmp, f, row.checks, 'this ' + what);
    if (o && o.over) row.overcut = true;
    return verdict(row);
  };

  MEASURE.slot = function (sim, job, cmp, f) {
    var t = tolXY(f), top = job.top, zmid = (top + f.floor) / 2, o = cmp.owners[f.id];
    var row = { id: f.id, label: f.label, checks: [] };
    var L = Math.hypot(f.bx - f.ax, f.by - f.ay), ux = (f.bx - f.ax) / L, uy = (f.by - f.ay) / L, nx = -uy, ny = ux;
    var mx = (f.ax + f.bx) / 2, my = (f.ay + f.by) / 2, hw = f.width / 2;
    row.untouched = !o || !o.cut;
    if (row.untouched) row.checks.push(check(false, 'Not cut yet.'));
    else {
      var reach = f.width;
      var side1 = measureWall(sim, mx + nx * hw, my + ny * hw, nx, ny, zmid, reach);
      var side2 = measureWall(sim, mx - nx * hw, my - ny * hw, -nx, -ny, zmid, reach);
      var end1 = measureWall(sim, f.bx + ux * hw, f.by + uy * hw, ux, uy, zmid, L + reach);
      var end2 = measureWall(sim, f.ax - ux * hw, f.ay - uy * hw, -ux, -uy, zmid, L + reach);
      var ws = [side1, side2], es = [end1, end2];
      var bad = function (r) { return r.gone || r.notCut; };
      if (ws.some(bad) || es.some(bad)) {
        if (ws.concat(es).some(function (r) { return r.gone; })) { row.overcut = true; row.checks.push(check(false, 'The slot runs into another cut: one of its walls is gone.')); }
        else row.checks.push(check(false, 'The slot is not cut to its full length and width yet.'));
      } else {
        var width = f.width - side1.dev - side2.dev, len = L + f.width - end1.dev - end2.dev;
        var off = (side2.dev - side1.dev) / 2, endOff = (end2.dev - end1.dev) / 2;
        if (width > f.width + t) { row.overcut = true; row.checks.push(check(false, 'Width ' + mm(width) + ': ' + mm(width - f.width) + ' mm too wide.')); }
        else if (width < f.width - t) row.checks.push(check(false, 'Width ' + mm(width) + ': ' + mm(f.width - width) + ' mm too narrow.'));
        else row.checks.push(check(true, 'Width ' + mm(width) + '.'));
        if (Math.abs(off) > t) { if (Math.min(side1.dev, side2.dev) < -t) row.overcut = true; row.checks.push(check(false, 'Its centre line is ' + mm(Math.abs(off)) + ' mm off to one side.')); }
        var want = L + f.width;
        if (len > want + t) { row.overcut = true; row.checks.push(check(false, 'Length ' + mm(len) + ' end to end: ' + mm(len - want) + ' mm too long.')); }
        else if (len < want - t) row.checks.push(check(false, 'Length ' + mm(len) + ' end to end: ' + mm(want - len) + ' mm short.'));
        else row.checks.push(check(true, 'Length ' + mm(len) + ' end to end.'));
        if (Math.abs(endOff) > t) row.checks.push(check(false, 'It sits ' + mm(Math.abs(endOff)) + ' mm off along its length.'));
        row.measured = mm(width) + ' wide, ' + mm(len) + ' long';
      }
      floorCheck(row, o, f, 'The floor');
      if (o.setCut) row.measured = (row.measured ? row.measured + ', ' : '') + 'floor Z ' + fmtSigned(o.floorMax, 2);
    }
    cellChecks(cmp, f, row.checks, 'the slot');
    if (o && o.over) row.overcut = true;
    return verdict(row);
  };

  MEASURE.boss = function (sim, job, cmp, f) {
    var st = sim.stock, t = tolXY(f), top = job.top, zmid = (top + f.floor) / 2, o = cmp.owners[f.id];
    var row = { id: f.id, label: f.label, checks: [] };
    var walls = [
      { side: 'left', at: f.x0, sx: 1, sy: 0, reach: f.x0 - st.x0 },
      { side: 'right', at: f.x1, sx: -1, sy: 0, reach: st.x1 - f.x1 },
      { side: 'front', at: f.y0, sx: 0, sy: 1, reach: f.y0 - st.y0 },
      { side: 'back', at: f.y1, sx: 0, sy: -1, reach: st.y1 - f.y1 }
    ];
    row.untouched = !o || !o.cut;
    if (row.untouched) row.checks.push(check(false, 'Not cut yet: the metal round the boss is still at the top.'));
    else {
      walls.forEach(function (w) {
        var list = w.sx ? stations(f.y0, f.y1, 1) : stations(f.x0, f.x1, 1);
        var res = list.map(function (sv) {
          return w.sx ? measureWall(sim, w.at, sv, w.sx, 0, zmid, w.reach) : measureWall(sim, sv, w.at, 0, w.sy, zmid, w.reach);
        });
        wallCheck(row, w.side + ' face (' + (w.sx ? 'X ' : 'Y ') + mm(w.at) + ')', res, t);
      });
      floorCheck(row, o, f, 'The floor round the boss');
      if (o.setCut) row.measured = 'floor Z ' + fmtSigned(o.floorMax, 2);
    }
    cellChecks(cmp, f, row.checks, 'the area round the boss');
    if (o && o.over) row.overcut = true;
    return verdict(row);
  };

  MEASURE.chamfer = function (sim, job, cmp, f) {
    var b = f.boss, top = job.top, t = tolXY(f), row = { id: f.id, label: f.label, checks: [] };
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    var edges = [
      { side: 'left', x: b.x0, y: cy, ux: 1, uy: 0 }, { side: 'right', x: b.x1, y: cy, ux: -1, uy: 0 },
      { side: 'front', x: cx, y: b.y0, ux: 0, uy: 1 }, { side: 'back', x: cx, y: b.y1, ux: 0, uy: -1 }
    ];
    var widths = [], none = 0;
    edges.forEach(function (e) {
      var sx = e.x - 2 * e.ux, sy = e.y - 2 * e.uy;
      // found 0.01 below the top, then carried up the 45-degree face to the top
      var s = sim.edgeAlong(sx, sy, e.ux, e.uy, top - 0.01, 12, 'up');
      var w = s === Infinity ? Infinity : s - 2 + 0.01;
      if (w <= 0.03) none++;
      widths.push({ side: e.side, w: w });
    });
    if (none === 4) { row.untouched = true; row.checks.push(check(false, 'No chamfer yet: the top edges of the boss are still sharp.')); }
    else {
      widths.forEach(function (e) {
        if (e.w === Infinity) { row.overcut = true; row.checks.push(check(false, 'The ' + e.side + ' edge has no flat top left behind it.')); }
        else if (e.w > f.size + t) { row.overcut = true; row.checks.push(check(false, 'The ' + e.side + ' chamfer is ' + mm(e.w) + ' wide: ' + mm(e.w - f.size) + ' mm too big.')); }
        else if (e.w < f.size - t) row.checks.push(check(false, 'The ' + e.side + ' chamfer is ' + mm(Math.max(0, e.w)) + ' wide: ' + mm(f.size - Math.max(0, e.w)) + ' mm to go.'));
        else row.checks.push(check(true, 'The ' + e.side + ' chamfer is ' + mm(e.w) + ' wide.'));
      });
      row.measured = widths.map(function (e) { return e.w === Infinity ? '?' : mm(Math.max(0, e.w)); }).join(' / ');
    }
    cellChecks(cmp, f, row.checks, 'the chamfers');
    if (cmp.owners[f.id] && cmp.owners[f.id].over) row.overcut = true;
    return verdict(row);
  };

  MEASURE.hole = function (sim, job, cmp, f) {
    var r = f.d / 2, top = f.top == null ? job.top : f.top, bottom = sim.stock.bottom;
    var tD = f.tolD == null ? 0.1 : f.tolD, tP = f.tolPos == null ? 0.1 : f.tolPos, tz = tolZ(f);
    var row = { id: f.id, label: f.label, checks: [], measured: '' };
    var cskDepth = f.csk ? (f.csk.d / 2 - r) * cot(f.csk.angle) : 0;
    var zm = Math.min(top - 0.3 - cskDepth, top - 0.3);
    var hc = sim.heightAt(f.cx, f.cy);
    if (hc >= zm) {
      row.untouched = hc >= top - tz;
      row.checks.push(check(false, row.untouched ? 'Not drilled yet.' : 'Started, but not open to its full size yet.'));
    } else {
      var o = sim.openingAt(f.cx, f.cy, zm, r + 3, 24), rFit = r - 0.15, cFit = { x: f.cx, y: f.cy };
      if (o.open) {
        row.overcut = true;
        row.checks.push(check(false, 'The hole breaks into another cut beside it.'));
      } else {
        var c = M.fitCircle(o.pts), D = c ? 2 * c.r : 0, off = c ? Math.hypot(c.x - f.cx, c.y - f.cy) : 0;
        if (c) { rFit = c.r - 0.01; cFit = c; }
        row.measured = 'Ø' + mm(D);
        if (D > f.d + tD) { row.overcut = true; row.checks.push(check(false, 'Ø' + mm(D) + ': ' + mm(D - f.d) + ' mm too big.')); }
        else if (D < f.d - tD) row.checks.push(check(false, 'Ø' + mm(D) + ': ' + mm(f.d - D) + ' mm too small.'));
        else row.checks.push(check(true, 'Ø' + mm(D) + '.'));
        if (off > tP) {
          row.overcut = true;
          row.checks.push(check(false, 'Its centre is ' + mm(off) + ' mm from X ' + mm(f.cx) + ' Y ' + mm(f.cy) + ' (at X ' + mm(c.x) + ' Y ' + mm(c.y) + ').'));
        }
      }
      // depth
      var throughNow = true;
      // Breakthrough at the centre is not a full-diameter through hole.
      var exitR = Math.max(0, (f.d - tD) / 2 - 1e-7);
      [0, exitR].forEach(function (rr) {
        for (var a = 0; a < 24; a++) {
          var ang = a * Math.PI / 12, h = sim.heightAt(cFit.x + rr * Math.cos(ang), cFit.y + rr * Math.sin(ang));
          if (h > bottom + 1e-6) throughNow = false;
        }
      });
      // full-size depth: the floor just inside the measured wall, where a
      // drill's point has barely started to slope
      var zf = -Infinity;
      for (var a2 = 0; a2 < 8; a2++) {
        var an = a2 * Math.PI / 4, hh = sim.heightAt(cFit.x + rFit * Math.cos(an), cFit.y + rFit * Math.sin(an));
        if (hh > zf) zf = hh;
      }
      if (f.through) {
        if (throughNow) row.checks.push(check(true, 'Through at the minimum allowed diameter.'));
        else row.checks.push(check(false, 'Not through yet: full size only to Z ' + fmtSigned(zf, 2) + '.'));
        row.measured = (row.measured || '') + (throughNow ? ' through' : '');
      } else if (throughNow) {
        row.overcut = true; row.checks.push(check(false, 'Drilled right through; the drawing has a blind hole.'));
      } else if (!f.thread) {
        var depth = top - zf;
        if (depth < f.depth - tz) row.checks.push(check(false, 'Full size to ' + mm(depth) + ' deep: ' + mm(f.depth - depth) + ' mm to go.'));
        else if (depth > f.depth + tz) { row.overcut = true; row.checks.push(check(false, 'Full size to ' + mm(depth) + ' deep: ' + mm(depth - f.depth) + ' mm too deep.')); }
        else row.checks.push(check(true, 'Full size to ' + mm(depth) + ' deep.'));
        row.measured = (row.measured || '') + ', ' + mm(depth) + ' deep';
      } else {
        row.measured = (row.measured || '') + ', full size ' + mm(top - zf) + ' deep';
      }
      if (f.csk) {
        var tc = f.csk.tol == null ? 0.2 : f.csk.tol, oc = sim.openingAt(f.cx, f.cy, top - 0.02, f.csk.d / 2 + 2, 24);
        // measured 0.02 below the top, then carried up the cone to the top
        var cc = oc.open ? null : M.fitCircle(oc.pts), Dc = cc ? 2 * cc.r + 2 * 0.02 / cot(f.csk.angle) : 0;
        if (!cc || Dc <= f.d + 0.05) row.checks.push(check(false, 'No countersink yet.'));
        else if (Dc > f.csk.d + tc) { row.overcut = true; row.checks.push(check(false, 'Countersink Ø' + mm(Dc) + ': ' + mm(Dc - f.csk.d) + ' mm too big.')); }
        else if (Dc < f.csk.d - tc) row.checks.push(check(false, 'Countersink Ø' + mm(Dc) + ': ' + mm(f.csk.d - Dc) + ' mm too small.'));
        else row.checks.push(check(true, 'Countersink Ø' + mm(Dc) + '.'));
      }
    }
    if (f.thread) threadChecks(sim, job, f, row, top, cskDepth);
    cellChecks(cmp, f, row.checks, 'and around this hole');
    if (cmp.owners[f.id] && cmp.owners[f.id].over) row.overcut = true;
    return verdict(row);
  };

  function threadChecks(sim, job, f, row, top, cskDepth) {
    var spec = M.THREADS[f.thread.spec], rec = null;
    sim.threads.forEach(function (t) {
      if (Math.hypot(t.cx - f.cx, t.cy - f.cy) < 0.3) { if (!rec || t.spec === spec.id) rec = t; }
    });
    if (!rec) { row.checks.push(check(false, 'Not tapped yet.')); return; }
    if (rec.spec !== spec.id) { row.overcut = true; row.checks.push(check(false, 'Tapped ' + M.THREADS[rec.spec].label + ', but the drawing calls for ' + spec.label + '.')); return; }
    var s = sim.threadState(rec), deep = top - s.bottom, need = f.thread.depth;
    if (rec.quality === 'tight') {
      row.overcut = true;
      row.checks.push(check(false, 'Tapped in a Ø' + mm(rec.hole) + ' hole, under the ' + fmt(spec.minorMin, 3) + ' minimum minor diameter for ' + spec.label + '-6H. ' +
        'The pilot is outside this model’s minor-diameter band; this simplified check does not establish functional thread fit.'));
    } else if (rec.quality === 'shallow') {
      row.overcut = true;
      row.checks.push(check(false, 'Tapped in a Ø' + mm(rec.hole) + ' hole, over the ' + fmt(spec.minorMax, 3) + ' maximum minor diameter for ' + spec.label + '-6H: the threads are too shallow.'));
    } else {
      row.checks.push(check(true, 'Tapped in a Ø' + mm(rec.hole) + ' hole, inside the ' + fmt(spec.minorMin, 3) + '–' + fmt(spec.minorMax, 3) + ' limits for ' + spec.label + '-6H.'));
    }
    if (s.length <= 0) { row.overcut = true; row.checks.push(check(false, 'The thread has been cut away by a later cut.')); return; }
    if (deep < need - tolZ(f)) row.checks.push(check(false, 'Full thread reaches ' + mm(deep) + ' deep; the drawing needs ' + mm(need) + '.'));
    else row.checks.push(check(true, 'Full thread reaches ' + mm(deep) + ' deep.'));
    if (s.top < top - cskDepth - 1.0) {
      row.overcut = true;
      row.checks.push(check(false, 'The top of the thread was cut away down to Z ' + fmtSigned(s.top, 2) + '.'));
    }
    row.measured = (row.measured ? row.measured + ', ' : '') + 'thread to ' + mm(deep) + ' deep';
  }

  /* ---- the inspection report --------------------------------------------*/
  function inspect(sim, job) {
    var cmp = compare(sim, job);
    var rows = [MEASURE.top(sim, job, cmp)];
    job.features.forEach(function (f) { rows.push(MEASURE[f.type](sim, job, cmp, f)); });
    var done = rows.filter(function (r) { return r.ok; }).length;
    var overcut = cmp.over > 0 || rows.some(function (r) { return r.status === 'over'; });
    var complete = done === rows.length && cmp.excess === 0 && cmp.over === 0;
    var started = sim.removed > 0.5;
    return {
      rows: rows, done: done, total: rows.length, complete: complete, overcut: overcut,
      started: started, status: cmp.status, excessCells: cmp.excess, overCells: cmp.over,
      summary: complete ? 'The part passes the modeled drawing checks.'
        : overcut ? 'Metal has been cut where the drawing keeps it. Cutting more cannot put it back: undo to before the mistake.'
        : !started ? 'Nothing cut yet.'
        : done + ' of ' + rows.length + ' callouts match the drawing.'
    };
  }

  /* ---- the nominal part, for drawings and the target outline ---------------
     The drawing's own geometry with no tolerances: pocket corners at their
     largest allowed radius, a drill point under blind holes. A tapped blind
     hole is drawn drilled 4 pitches plus a drill point past its thread, the
     usual way a drawing shows one; that depth is illustrative, not a spec. */
  var NOMINAL = {
    recess: function (f, x, y, z) {
      var s = M.sdBox(x, y, (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, (f.x1 - f.x0) / 2, (f.y1 - f.y0) / 2, f.rMax || 0);
      return s < 0 ? Math.min(z, f.floor) : z;
    },
    slot: function (f, x, y, z) { return M.sdCapsule(x, y, f.ax, f.ay, f.bx, f.by, f.width / 2) < 0 ? Math.min(z, f.floor) : z; },
    boss: function (f, x, y, z) {
      return M.sdBox(x, y, (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, (f.x1 - f.x0) / 2, (f.y1 - f.y0) / 2, 0) > 0 ? Math.min(z, f.floor) : z;
    },
    chamfer: function (f, x, y, z, job) {
      var b = f.boss, sb = M.sdBox(x, y, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, 0);
      return sb < 0 && -sb < f.size ? Math.min(z, job.top - f.size - sb) : z;
    },
    hole: function (f, x, y, z, job) {
      var d0 = Math.hypot(x - f.cx, y - f.cy), r = f.d / 2, top = f.top == null ? job.top : f.top;
      if (f.csk && d0 < f.csk.d / 2) z = Math.min(z, top - (f.csk.d / 2 - d0) * cot(f.csk.angle));
      if (d0 >= r) return z;
      if (f.through) return job.bottom;
      var full = f.thread ? top - f.thread.depth - 4 * M.THREADS[f.thread.spec].pitch : top - f.depth;
      return Math.min(z, full - DRILL_CONE * (r - d0));
    }
  };
  function nominalAt(job, x, y) {
    var z = job.top;
    for (var k = 0; k < job.features.length; k++) z = NOMINAL[job.features[k].type](job.features[k], x, y, z, job);
    return Math.max(z, job.bottom);
  }

  return { compare: compare, inspect: inspect, nominalAt: nominalAt, envAt: envAt, CLASSIFY: CLASSIFY, MEASURE: MEASURE };
});

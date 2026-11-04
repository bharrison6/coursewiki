(function (root) {
  'use strict';
  // Section geometry for three authored parts. Units: millimetres.
  // Axes: x to the right, y away from a front viewer (toward the back), z up.
  // Every feature is a box or a round feature with a vertical axis, so each part is a
  // stack of z-bands whose horizontal cross-sections are exact 2D regions. Round
  // features are regular polygons with SIDES sides inscribed in the nominal circle; all
  // areas, caps, drawings and meshes come from those same polygons, so they agree exactly
  // with each other and stay within sag(r) = r(1 - cos(pi/SIDES)) of a true circle.
  const SIDES = 96, EPS = 1e-7, BIG = 1e4;
  const sag = r => r * (1 - Math.cos(Math.PI / SIDES));

  const box = (x0, x1, y0, y1, z0, z1) => ({ box: { x0, x1, y0, y1, z0, z1 } });
  const cyl = (cx, cy, r, z0, z1) => ({ cyl: { cx, cy, r, z0, z1 } });
  const parts = [
    { id: 'bushing', name: 'Flanged bushing', revolved: true, modes: ['full', 'half'], plane: { min: -29, max: 29, start: 0 },
      summary: 'A Ø40 body, a Ø60 flange, a Ø20 through bore and a Ø30 counterbore 8 deep in the flange end.',
      features: [
        { id: 'body', op: 'add', name: 'body', seen: 'the outside of the body', ...cyl(0, 0, 20, 0, 30) },
        { id: 'flange', op: 'add', name: 'flange', seen: 'the outside of the flange', ...cyl(0, 0, 30, 30, 40) },
        { id: 'bore', op: 'cut', name: 'through bore', seen: 'the far wall of the through bore', ...cyl(0, 0, 10, 0, 40) },
        { id: 'counterbore', op: 'cut', name: 'counterbore', seen: 'the far wall of the counterbore', ...cyl(0, 0, 15, 32, 40) }],
      axes: [{ x: 0, y: 0, r: 30, always: true }], marks: [{ x: 0, y: 0, r: 30 }] },
    { id: 'bracket', name: 'Angle bracket', revolved: false, modes: ['full', 'offset'], plane: { min: -24, max: 24, start: -10 },
      offset: { jog: -2, a: -10, b: 3 },
      summary: 'An 80 × 49 × 12 base with a 38-high upright at the back, a Ø14 blind hole 8 deep, and an 11-wide through slot.',
      features: [
        { id: 'base', op: 'add', name: 'base', seen: 'the front face of the base', ...box(-40, 40, -24.5, 24.5, 0, 12) },
        { id: 'upright', op: 'add', name: 'upright', seen: 'the front face of the upright', ...box(-40, 40, 14.5, 24.5, 12, 50) },
        { id: 'hole', op: 'cut', name: 'blind hole', seen: 'the far wall of the blind hole', ...cyl(-20, -10, 7, 4, 12) },
        { id: 'slot', op: 'cut', name: 'slot', seen: 'the far wall of the slot', ...box(10, 30, -2.5, 8.5, 0, 12) },
        { id: 'slot-left', op: 'cut', name: 'slot', seen: 'the curved far end of the slot', ...cyl(10, 3, 5.5, 0, 12) },
        { id: 'slot-right', op: 'cut', name: 'slot', seen: 'the curved far end of the slot', ...cyl(30, 3, 5.5, 0, 12) }],
      axes: [{ x: -20, y: -10, r: 7 }, { x: 10, y: 3, r: 5.5 }, { x: 30, y: 3, r: 5.5 }],
      marks: [{ x: -20, y: -10, r: 7 }, { x: 10, y: 3, r: 5.5 }, { x: 30, y: 3, r: 5.5 }], slotLine: [[10, 3], [30, 3]] },
    { id: 'pulley', name: 'Pulley with hub', revolved: true, modes: ['full', 'half'], plane: { min: -39, max: 39, start: 0 },
      summary: 'A Ø80 flat-face rim 24 wide joined by a 6-thick solid web to a Ø32 hub with a Ø16 bore.',
      features: [
        { id: 'rim', op: 'add', name: 'rim-and-web disc', seen: 'the outside of the rim', ...cyl(0, 0, 40, 0, 24) },
        { id: 'recess-low', op: 'cut', name: 'recess', seen: 'the inside of the rim', ...cyl(0, 0, 34, 0, 9) },
        { id: 'recess-high', op: 'cut', name: 'recess', seen: 'the inside of the rim', ...cyl(0, 0, 34, 15, 24) },
        { id: 'hub', op: 'add', name: 'hub', seen: 'the outside of the hub', ...cyl(0, 0, 16, -2, 26) },
        { id: 'bore', op: 'cut', name: 'bore', seen: 'the far wall of the bore', ...cyl(0, 0, 8, -2, 26) }],
      axes: [{ x: 0, y: 0, r: 40, always: true }], marks: [{ x: 0, y: 0, r: 40 }] }];
  const byId = Object.fromEntries(parts.map(p => [p.id, p]));

  // ---------- 2D primitives ----------
  function polygon(c) {
    const v = [];
    for (let i = 0; i < SIDES; i++) {
      let cs = Math.cos(2 * Math.PI * i / SIDES), sn = Math.sin(2 * Math.PI * i / SIDES);
      if (i % (SIDES / 4) === 0) { cs = [1, 0, -1, 0][i / (SIDES / 4)]; sn = [0, 1, 0, -1][i / (SIDES / 4)]; }
      v.push([c.cx + c.r * cs, c.cy + c.r * sn]);
    }
    return v;
  }
  function leafFor(f) {
    if (f.box) return { kind: 'rect', x0: f.box.x0, x1: f.box.x1, y0: f.box.y0, y1: f.box.y1, feature: f };
    const v = polygon(f.cyl);
    return { kind: 'poly', cx: f.cyl.cx, cy: f.cyl.cy, r: f.cyl.r, v, y0: f.cyl.cy - f.cyl.r, y1: f.cyl.cy + f.cyl.r, feature: f };
  }
  function chord(p, y) {
    y = Math.min(p.y1, Math.max(p.y0, y));
    let lo = Infinity, hi = -Infinity;
    const v = p.v;
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length];
      if (a[1] === y) { lo = Math.min(lo, a[0]); hi = Math.max(hi, a[0]); }
      if ((a[1] - y) * (b[1] - y) < 0) {
        const x = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
        lo = Math.min(lo, x); hi = Math.max(hi, x);
      }
    }
    return [lo, hi];
  }
  const active = (p, ya, yb) => p.y0 <= ya + EPS && p.y1 >= yb - EPS;
  function linesOf(p, ya, yb) {
    const src = { kind: p.keep ? 'keep' : p.kind, leaf: p };
    if (p.kind === 'rect') return [{ a: p.x0, b: p.x0, src, side: 'L' }, { a: p.x1, b: p.x1, src, side: 'R' }];
    const ca = chord(p, ya), cb = chord(p, yb);
    return [{ a: ca[0], b: cb[0], src, side: 'L' }, { a: ca[1], b: cb[1], src, side: 'R' }];
  }

  // A shared horizontal-strip partition: no primitive starts, ends or turns a corner inside
  // a strip, and no two primitive boundaries cross inside one, so every boundary is one
  // straight segment per strip and boolean results need only be evaluated at mid-height.
  function partition(leaves, yLo, yHi) {
    const ys = [yLo, yHi];
    for (const p of leaves) {
      if (p.kind === 'rect') ys.push(p.y0, p.y1); else for (const v of p.v) ys.push(v[1]);
    }
    const sorted = ys.filter(y => y >= yLo && y <= yHi).sort((a, b) => a - b), cuts = [];
    for (const y of sorted) if (!cuts.length || y - cuts[cuts.length - 1] > EPS) cuts.push(y);
    const strips = [];
    const split = (ya, yb, depth) => {
      const lines = [];
      for (const p of leaves) if (active(p, ya, yb)) lines.push(...linesOf(p, ya, yb));
      if (depth < 40) for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
        const da = lines[i].a - lines[j].a, db = lines[i].b - lines[j].b;
        if (da * db < 0 && Math.abs(da) > EPS && Math.abs(db) > EPS) {
          const y = ya + (yb - ya) * da / (da - db);
          if (y - ya > EPS && yb - y > EPS) { split(ya, y, depth + 1); split(y, yb, depth + 1); return; }
        }
      }
      strips.push([ya, yb]);
    };
    for (let i = 0; i + 1 < cuts.length; i++) split(cuts[i], cuts[i + 1], 0);
    return strips;
  }

  const xAt = (line, t) => line.a + (line.b - line.a) * t;
  const rank = l => l.src.kind === 'keep' ? 0 : l.src.kind === 'rect' ? 1 : 2;
  // Boolean of two interval sets at mid-strip (t = 0.5); endpoints keep their source lines.
  function combine(A, B, fn) {
    const ev = [];
    for (const iv of A) { ev.push({ x: xAt(iv.l, .5), w: 0, s: 1, line: iv.l }, { x: xAt(iv.r, .5), w: 0, s: -1, line: iv.r }); }
    for (const iv of B) { ev.push({ x: xAt(iv.l, .5), w: 1, s: 1, line: iv.l }, { x: xAt(iv.r, .5), w: 1, s: -1, line: iv.r }); }
    ev.sort((p, q) => p.x - q.x);
    const out = [], c = [0, 0];
    let inside = false, start = null;
    for (let i = 0; i < ev.length;) {
      let j = i;
      while (j < ev.length && ev[j].x - ev[i].x <= EPS) j++;
      const group = ev.slice(i, j).sort((p, q) => rank(p.line) - rank(q.line));
      for (const e of group) c[e.w] += e.s;
      const now = fn(c[0] > 0, c[1] > 0);
      if (now && !inside) start = group[0].line;
      if (!now && inside && group[0].x - xAt(start, .5) > EPS) out.push({ l: start, r: group[0].line });
      inside = now; i = j;
    }
    return out;
  }
  const OPS = { add: (a, b) => a || b, cut: (a, b) => a && !b, and: (a, b) => a && b };
  function evaluate(steps, lineMap) {
    let set = [];
    for (const st of steps) {
      const other = st.steps ? evaluate(st.steps, lineMap) : (lineMap.get(st.leaf) ? [{ l: lineMap.get(st.leaf)[0], r: lineMap.get(st.leaf)[1] }] : []);
      set = combine(set, other, OPS[st.op]);
    }
    return set;
  }

  // ---------- cut definitions ----------
  function keepRects(part, cut) {
    const f = cut.flip ? -1 : 1, R = (x0, x1, y0, y1) => ({ kind: 'rect', keep: true, x0, x1, y0, y1 });
    if (cut.mode === 'half') return f > 0 ? [R(-BIG, 0, -BIG, BIG), R(-BIG, BIG, 0, BIG)] : [R(0, BIG, -BIG, BIG), R(-BIG, BIG, -BIG, 0)];
    if (cut.mode === 'offset') {
      const j = part.offset.jog;
      return f > 0 ? [R(-BIG, j, cut.a, BIG), R(j, BIG, cut.b, BIG)] : [R(-BIG, j, -BIG, cut.a), R(j, BIG, -BIG, cut.b)];
    }
    return [f > 0 ? R(-BIG, BIG, cut.s, BIG) : R(-BIG, BIG, -BIG, cut.s)];
  }
  function normalizeCut(part, cut) {
    cut = Object.assign({ mode: 'full', flip: false }, cut || {});
    if (!part.modes.includes(cut.mode)) throw new Error(part.name + ' has no ' + cut.mode + ' section');
    const lim = part.plane, ok = v => Number.isFinite(v) && v >= lim.min && v <= lim.max;
    if (cut.mode === 'full') { cut.s = Number(cut.s ?? lim.start); if (!ok(cut.s)) throw new RangeError('Plane position must be between ' + lim.min + ' and ' + lim.max + ' mm'); }
    if (cut.mode === 'offset') {
      cut.a = Number(cut.a ?? part.offset.a); cut.b = Number(cut.b ?? part.offset.b);
      if (!ok(cut.a) || !ok(cut.b)) throw new RangeError('Offset legs must be between ' + lim.min + ' and ' + lim.max + ' mm');
    }
    if (cut.mode === 'half') cut.s = 0;
    cut.flip = !!cut.flip;
    return cut;
  }
  // Plane depth (y) used at a given x: one value for full/half, two legs for offset.
  function planeAt(part, cut, x) { return cut.mode === 'offset' ? (x < part.offset.jog ? cut.a : cut.b) : cut.s; }

  function extents(part) {
    const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const f of part.features) {
      const b = f.box || { x0: f.cyl.cx - f.cyl.r, x1: f.cyl.cx + f.cyl.r, y0: f.cyl.cy - f.cyl.r, y1: f.cyl.cy + f.cyl.r, z0: f.cyl.z0, z1: f.cyl.z1 };
      if (f.op === 'add') { e.x0 = Math.min(e.x0, b.x0); e.x1 = Math.max(e.x1, b.x1); e.y0 = Math.min(e.y0, b.y0); e.y1 = Math.max(e.y1, b.y1); }
      e.z0 = Math.min(e.z0, b.z0); e.z1 = Math.max(e.z1, b.z1);
    }
    return e;
  }

  // ---------- solids as bands ----------
  function solid(part, keep, which) {
    const ext = extents(part), leaves = part.features.map(leafFor), keepLeaves = keep || [];
    const zs = [...new Set(part.features.flatMap(f => { const g = f.box || f.cyl; return [g.z0, g.z1]; }))].sort((a, b) => a - b);
    const P = partition(leaves.concat(keepLeaves), ext.y0 - 1, ext.y1 + 1);
    const lineMaps = P.map(([ya, yb]) => {
      const m = new Map();
      for (const p of leaves.concat(keepLeaves)) if (active(p, ya, yb)) m.set(p, linesOf(p, ya, yb));
      return m;
    });
    const keepStep = { steps: keepLeaves.map(leaf => ({ op: 'add', leaf })) };
    const bands = [];
    for (let i = 0; i + 1 < zs.length; i++) {
      const z0 = zs[i], z1 = zs[i + 1], zm = (z0 + z1) / 2;
      const steps = [];
      leaves.forEach(leaf => { const g = leaf.feature.box || leaf.feature.cyl; if (g.z0 < zm && g.z1 > zm) steps.push({ op: leaf.feature.op, leaf }); });
      if (which === 'kept') steps.push(Object.assign({ op: 'and' }, keepStep));
      if (which === 'removed') steps.push(Object.assign({ op: 'cut' }, keepStep));
      const rects = steps.filter(s => s.leaf && s.leaf.kind === 'rect').map(s => s.leaf).concat(keepLeaves);
      bands.push({ z0, z1, sets: lineMaps.map(m => evaluate(steps, m)), rects });
    }
    return { part, P, bands, ext };
  }

  function intervalDiff(A, B) {
    const out = [];
    for (const [a0, a1] of A) {
      let pieces = [[a0, a1]];
      for (const [b0, b1] of B) pieces = pieces.flatMap(([p0, p1]) => {
        if (b1 <= p0 + EPS || b0 >= p1 - EPS) return [[p0, p1]];
        const r = [];
        if (b0 - p0 > EPS) r.push([p0, b0]);
        if (p1 - b1 > EPS) r.push([b1, p1]);
        return r;
      });
      out.push(...pieces);
    }
    return out.filter(([p0, p1]) => p1 - p0 > EPS);
  }
  function horizontalSource(rects, y, x) {
    for (const r of rects) if ((Math.abs(r.y0 - y) < 1e-6 || Math.abs(r.y1 - y) < 1e-6) && x >= r.x0 - EPS && x <= r.x1 + EPS)
      return { kind: r.keep ? 'keep' : 'rect', leaf: r };
    return { kind: 'rect', leaf: null };
  }
  // Boundary segments of one band region, each with its outward normal and source surface.
  function boundary(P, sets, rects) {
    const segs = [];
    const add = (x0, y0, x1, y1, nx, ny, src) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len > EPS) segs.push({ x0, y0, x1, y1, nx: nx / len, ny: ny / len, src });
    };
    P.forEach(([ya, yb], i) => {
      for (const iv of sets[i]) {
        const dl = [iv.l.b - iv.l.a, yb - ya], dr = [iv.r.b - iv.r.a, yb - ya];
        add(iv.l.a, ya, iv.l.b, yb, -dl[1], dl[0], iv.l.src);
        add(iv.r.a, ya, iv.r.b, yb, dr[1], -dr[0], iv.r.src);
      }
    });
    for (let i = 0; i <= P.length; i++) {
      const y = i < P.length ? P[i][0] : P[P.length - 1][1];
      const below = i > 0 ? sets[i - 1].map(iv => [iv.l.b, iv.r.b]) : [];
      const above = i < P.length ? sets[i].map(iv => [iv.l.a, iv.r.a]) : [];
      for (const [x0, x1] of intervalDiff(below, above)) add(x1, y, x0, y, 0, x1 - x0, horizontalSource(rects, y, (x0 + x1) / 2));
      for (const [x0, x1] of intervalDiff(above, below)) add(x0, y, x1, y, 0, -(x1 - x0), horizontalSource(rects, y, (x0 + x1) / 2));
    }
    return segs;
  }
  const regionArea = (P, sets) => P.reduce((sum, [ya, yb], i) => sum + sets[i].reduce((s, iv) => s + (iv.r.a - iv.l.a + iv.r.b - iv.l.b) / 2 * (yb - ya), 0), 0);

  // ---------- section view (looking in the arrow direction) ----------
  const surfaceKey = seg => seg.src.kind === 'poly' ? 'p:' + seg.src.leaf.feature.id + ':' + seg.src.leaf.cx + ',' + seg.src.leaf.cy : null;
  function depthAt(seg, x, dir) { return dir * (seg.y0 + (seg.y1 - seg.y0) * (x - seg.x0) / (seg.x1 - seg.x0)); }
  // True when a visible line separates two neighbouring view cells.
  function edgeBetween(c1, c2, us, dir) {
    if (!c1.seg && !c2.seg) return false;
    if (!c1.seg || !c2.seg) return true;
    const k1 = c1.seg.src.kind === 'keep', k2 = c2.seg.src.kind === 'keep';
    if (k1 && k2) return false;                 // one continuous cut face, also across offset jogs
    if (k1 !== k2) return true;
    for (const u of us) if (Math.abs(depthAt(c1.seg, u * dir, dir) - depthAt(c2.seg, u * dir, dir)) > 1e-6) return true;
    const a = surfaceKey(c1.seg), b = surfaceKey(c2.seg);
    if (a && a === b) return false;              // facets of one round surface
    // Surfaces meeting tangentially (a slot's flat side running into its round end) have no
    // edge; the 5° allowance exceeds one facet turn (3.75°) and nothing sharper is smoothed.
    return c1.seg.nx * c2.seg.nx + c1.seg.ny * c2.seg.ny < Math.cos(5 * Math.PI / 180);
  }
  function sectionView(S, cut) {
    const dir = cut.flip ? -1 : 1, ext = S.ext, part = S.part;
    const xLo = ext.x0 - 6, xHi = ext.x1 + 6;
    const rows = S.bands.map((band, k) => {
      const segs = boundary(S.P, band.sets, band.rects).filter(s => s.ny * dir < -1e-9 && Math.abs(s.x1 - s.x0) > EPS);
      const xs = [xLo, xHi];
      for (const s of segs) xs.push(s.x0, s.x1);
      xs.sort((a, b) => a - b);
      const cells = [];
      for (let i = 0; i + 1 < xs.length; i++) {
        const xa = xs[i], xb = xs[i + 1];
        if (xb - xa <= EPS) continue;
        const xm = (xa + xb) / 2;
        let best = null, bd = Infinity;
        for (const s of segs) {
          if (xm < Math.min(s.x0, s.x1) || xm > Math.max(s.x0, s.x1)) continue;
          const d = depthAt(s, xm, dir);
          if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && s.src.kind === 'keep')) { best = s; bd = d; }
        }
        cells.push({ ua: dir > 0 ? xa : -xb, ub: dir > 0 ? xb : -xa, seg: best, k, z0: band.z0, z1: band.z1 });
      }
      if (dir < 0) cells.reverse();
      return cells;
    });
    const lines = [], halfAxis = cut.mode === 'half' ? 0 : null;
    // Vertical lines inside each band.
    rows.forEach(cells => {
      for (let i = 0; i + 1 < cells.length; i++) {
        const u = cells[i].ub;
        cells[i].edgeRight = edgeBetween(cells[i], cells[i + 1], [u], dir);
        if (cells[i].edgeRight && !(halfAxis !== null && Math.abs(u - halfAxis) < 1e-6)) lines.push([u, cells[i].z0, u, cells[i].z1]);
      }
    });
    // Horizontal lines at band boundaries, including the top and bottom outline.
    const links = [];
    for (let k = 0; k <= rows.length; k++) {
      const lo = k > 0 ? rows[k - 1] : null, hi = k < rows.length ? rows[k] : null;
      const z = hi ? hi[0].z0 : lo[0].z1;
      const us = [...new Set([...(lo || []), ...(hi || [])].flatMap(c => [c.ua, c.ub]))].sort((a, b) => a - b);
      let run = null;
      for (let i = 0; i + 1 < us.length; i++) {
        const ua = us[i], ub = us[i + 1], um = (ua + ub) / 2;
        if (ub - ua <= EPS) continue;
        const find = row => row ? row.findIndex(c => c.ua <= um && c.ub >= um) : -1;
        const ib = find(lo), ia = find(hi);
        const cb = ib >= 0 ? lo[ib] : { seg: null }, ca = ia >= 0 ? hi[ia] : { seg: null };
        const edge = edgeBetween(cb, ca, [ua, ub], dir);
        if (!edge && ib >= 0 && ia >= 0) links.push([k - 1, ib, k, ia]);
        if (edge) { if (run && Math.abs(run[2] - ua) < EPS) run[2] = ub; else { if (run) lines.push(run.slice(0, 2).concat([run[2], z])); run = [ua, z, ub]; } }
      }
      if (run) lines.push([run[0], run[1], run[2], z]);
    }
    // Faces: cells joined wherever no visible line separates them.
    const flat = [], index = rows.map(r => r.map(c => flat.push(c) - 1)), parent = flat.map((_, i) => i);
    const findRoot = i => parent[i] === i ? i : (parent[i] = findRoot(parent[i]));
    const join = (a, b) => { a = findRoot(a); b = findRoot(b); if (a !== b) parent[b] = a; };
    rows.forEach((cells, k) => cells.forEach((c, i) => { if (i + 1 < cells.length && !c.edgeRight) join(index[k][i], index[k][i + 1]); }));
    for (const [kb, ib, ka, ia] of links) join(index[kb][ib], index[ka][ia]);
    const groups = new Map();
    flat.forEach((c, i) => { const r = findRoot(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
    const faces = [];
    const top = rows.length - 1;
    for (const cells of groups.values()) {
      const seg = cells[0].seg, type = !seg ? 'empty' : seg.src.kind === 'keep' ? 'cut' : 'surface';
      if (type === 'empty' && cells.some(c => c.k === 0 || c.k === top || c === rows[c.k][0] || c === rows[c.k][rows[c.k].length - 1])) continue;
      const area = cells.reduce((s, c) => s + (c.ub - c.ua) * (c.z1 - c.z0), 0);
      const big = cells.reduce((m, c) => (c.ub - c.ua) * (c.z1 - c.z0) > (m.ub - m.ua) * (m.z1 - m.z0) ? c : m);
      const label = { u: (big.ua + big.ub) / 2, z: (big.z0 + big.z1) / 2 };
      const w = Math.max(...cells.map(c => c.ub)) - Math.min(...cells.map(c => c.ua)), h = Math.max(...cells.map(c => c.z1)) - Math.min(...cells.map(c => c.z0));
      faces.push({ type, cells, area, label, tiny: area < 8 || w < 1.5 || h < 1.5, describe: describeFace(part, cut, type, cells, label, dir) });
    }
    faces.sort((a, b) => b.label.z - a.label.z || a.label.u - b.label.u);
    faces.forEach((f, i) => { f.n = i + 1; });
    const axes = part.axes.filter(a => a.always || Math.abs(planeAt(part, cut, a.x) - a.y) < a.r).map(a => dir * a.x);
    const capArea = flat.filter(c => c.seg && c.seg.src.kind === 'keep').reduce((s, c) => s + (c.ub - c.ua) * (c.z1 - c.z0), 0);
    return { dir, rows, cells: flat, lines, faces, axes, capArea, u0: dir > 0 ? xLo : -xHi, u1: dir > 0 ? xHi : -xLo, z0: ext.z0, z1: ext.z1 };
  }
  function materialNames(part, x, y, z) {
    const names = [];
    for (const f of part.features) if (f.op === 'add' && inside(f, x, y, z) && !names.includes(f.name)) names.push(f.name);
    return names;
  }
  function describeFace(part, cut, type, cells, label, dir) {
    if (type === 'cut') {
      const names = [];
      for (const c of cells) {
        const x = dir * (c.ua + c.ub) / 2;
        for (const n of materialNames(part, x, planeAt(part, cut, x) + dir * 1e-3, (c.z0 + c.z1) / 2)) if (!names.includes(n)) names.push(n);
      }
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0] || 'material';
      return 'Cut material: the plane passes through the solid ' + list + ' here, so it is hatched.';
    }
    if (type === 'empty') return 'Open space: you look straight through the part here. Nothing is cut, so it stays blank.';
    const at = cells.find(c => c.ua <= label.u && c.ub >= label.u && c.z0 <= label.z && c.z1 >= label.z) || cells[0];
    const seg = at.seg, f = seg.src.leaf && seg.src.leaf.feature, x = dir * label.u;
    const behind = depthAt(seg, x, dir) - dir * planeAt(part, cut, x);
    const what = f ? f.seen : 'a surface of the part';
    // In a half section the unsectioned half keeps its front quarter, so its surfaces lie in
    // FRONT of the cutting plane: describe them as the outside view, not as depth behind the cut.
    // The section half is always to the right of the center line (u > 0) in view coordinates.
    if ((cut.mode === 'half' && label.u < 0) || behind < -1e-6)
      return 'Not cut: this half of the view is not sectioned, so you see ' + what + ', in front of the cutting plane. Draw its visible edges, but do not hatch it.';
    return 'Not cut: you see ' + what + ', about ' + behind.toFixed(1) + ' mm behind the plane. Draw its edges, but do not hatch it.';
  }

  // Point membership with true circles; an oracle independent of the polygon machinery.
  function inside(f, x, y, z) {
    if (f.box) { const b = f.box; return x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1; }
    const c = f.cyl; return z > c.z0 && z < c.z1 && Math.hypot(x - c.cx, y - c.cy) < c.r;
  }
  function isMaterial(part, x, y, z) {
    let m = false;
    for (const f of part.features) if (inside(f, x, y, z)) m = f.op === 'add';
    return m;
  }

  // ---------- parent (top) view ----------
  const topCache = new Map();
  function topView(partId) {
    if (topCache.has(partId)) return topCache.get(partId);
    const part = byId[partId], S = solid(part, null, 'whole'), segs = [];
    let above = S.P.map(() => []);
    for (let k = S.bands.length - 1; k >= 0; k--) {
      const band = S.bands[k], level = band.sets.map((set, i) => combine(set, above[i], OPS.cut));
      segs.push(...boundary(S.P, level, band.rects));
      above = band.sets.map((set, i) => combine(above[i], set, OPS.add));
    }
    const result = { polylines: chain(segs), ext: S.ext };
    topCache.set(partId, result);
    return result;
  }
  // Join boundary pieces into polylines and drop collinear interior points.
  function chain(segs) {
    const key = (x, y) => x.toFixed(5) + ',' + y.toFixed(5), seen = new Set(), list = [];
    for (const s of segs) {
      const a = key(s.x0, s.y0), b = key(s.x1, s.y1), k = a < b ? a + '|' + b : b + '|' + a;
      if (!seen.has(k)) { seen.add(k); list.push({ a, b, p: [s.x0, s.y0], q: [s.x1, s.y1], used: false }); }
    }
    const at = new Map();
    for (const e of list) for (const k of [e.a, e.b]) { if (!at.has(k)) at.set(k, []); at.get(k).push(e); }
    const lines = [];
    for (const e of list) {
      if (e.used) continue;
      e.used = true;
      const pts = [e.p, e.q];
      for (const forward of [true, false]) {
        for (;;) {
          const end = forward ? pts[pts.length - 1] : pts[0], k = key(end[0], end[1]);
          const next = (at.get(k) || []).find(n => !n.used && at.get(k).length === 2);
          if (!next) break;
          next.used = true;
          const other = next.a === k ? next.q : next.p;
          if (forward) pts.push(other); else pts.unshift(other);
        }
      }
      lines.push(pts.filter((p, i) => {
        if (i === 0 || i === pts.length - 1) return true;
        const a = pts[i - 1], b = pts[i + 1];
        return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-6;
      }));
    }
    return lines;
  }

  // Cutting-plane line in top-view coordinates, with viewing arrows.
  function cuttingPlane(part, cut) {
    const e = extents(part), f = cut.flip ? -1 : 1, m = 9;
    if (cut.mode === 'half') {
      const path = f > 0 ? [[e.x1 + m, 0], [0, 0], [0, e.y0 - m]] : [[e.x0 - m, 0], [0, 0], [0, e.y1 + m]];
      return { path, arrows: [{ at: path[0], dir: [0, f] }], letters: [path[0], path[2]] };
    }
    if (cut.mode === 'offset') {
      const j = part.offset.jog, path = [[e.x0 - m, cut.a], [j, cut.a], [j, cut.b], [e.x1 + m, cut.b]];
      return { path, arrows: [{ at: path[0], dir: [0, f] }, { at: path[3], dir: [0, f] }], letters: [path[0], path[3]] };
    }
    const path = [[e.x0 - m, cut.s], [e.x1 + m, cut.s]];
    return { path, arrows: path.map(at => ({ at, dir: [0, f] })), letters: path };
  }

  // ---------- 3D surface data ----------
  function meshData(S) {
    const part = { pos: [], nor: [] }, cap = { pos: [], nor: [], uv: [] }, edges = [];
    const segsByBand = S.bands.map(b => boundary(S.P, b.sets, b.rects));
    const tri = (o, a, b, c, na, nb, nc) => { o.pos.push(...a, ...b, ...c); o.nor.push(...na, ...nb, ...nc); };
    S.bands.forEach((band, k) => {
      const { z0, z1 } = band;
      for (const s of segsByBand[k]) {
        const isCap = s.src.kind === 'keep', o = isCap ? cap : part;
        let n0 = [s.nx, s.ny, 0], n1 = n0;
        if (s.src.kind === 'poly') {
          const L = s.src.leaf, r0 = [s.x0 - L.cx, s.y0 - L.cy], r1 = [s.x1 - L.cx, s.y1 - L.cy];
          const sg = Math.sign(r0[0] * s.nx + r0[1] * s.ny + r1[0] * s.nx + r1[1] * s.ny) || 1;
          n0 = [sg * r0[0] / Math.hypot(...r0), sg * r0[1] / Math.hypot(...r0), 0];
          n1 = [sg * r1[0] / Math.hypot(...r1), sg * r1[1] / Math.hypot(...r1), 0];
        }
        let A = [s.x0, s.y0, z0], B = [s.x1, s.y1, z0], C = [s.x1, s.y1, z1], D = [s.x0, s.y0, z1];
        let nA = n0, nB = n1;
        if ((s.y1 - s.y0) * s.nx - (s.x1 - s.x0) * s.ny < 0) { [A, B, C, D] = [B, A, D, C]; [nA, nB] = [n1, n0]; }
        tri(o, A, B, C, nA, nB, nB); tri(o, A, C, D, nA, nB, nA);
        if (isCap) {
          const u = p => -s.ny * p[0] + s.nx * p[1];
          cap.uv.push(u(A), A[2], u(B), B[2], u(C), C[2], u(A), A[2], u(C), C[2], u(D), D[2]);
        }
      }
      const up = k + 1 < S.bands.length ? S.bands[k + 1].sets : null, down = k > 0 ? S.bands[k - 1].sets : null;
      S.P.forEach(([ya, yb], i) => {
        for (const [other, z, n] of [[up, z1, 1], [down, z0, -1]]) {
          for (const iv of other ? combine(band.sets[i], other[i], OPS.cut) : band.sets[i]) {
            const a = [iv.l.a, ya, z], b = [iv.r.a, ya, z], c = [iv.r.b, yb, z], d = [iv.l.b, yb, z], nz = [0, 0, n];
            if (n > 0) { tri(part, a, b, c, nz, nz, nz); tri(part, a, c, d, nz, nz, nz); }
            else { tri(part, a, c, b, nz, nz, nz); tri(part, a, d, c, nz, nz, nz); }
          }
        }
      });
      // Vertical feature edges where two walls meet at a real corner.
      const at = new Map(), key = (x, y) => x.toFixed(5) + ',' + y.toFixed(5);
      for (const s of segsByBand[k]) for (const [x, y] of [[s.x0, s.y0], [s.x1, s.y1]]) { const q = key(x, y); if (!at.has(q)) at.set(q, { x, y, list: [] }); at.get(q).list.push(s); }
      for (const v of at.values()) {
        const [a, b] = v.list;
        if (b && a.nx * b.nx + a.ny * b.ny < Math.cos(Math.PI / 9)) edges.push([v.x, v.y, z0, v.x, v.y, z1]);
      }
    });
    // Horizontal feature edges: wall boundaries not continued by the same wall in the next band.
    const lineKey = s => [s.nx.toFixed(6), s.ny.toFixed(6), (s.nx * s.x0 + s.ny * s.y0).toFixed(5)].join('|');
    const t = (s, x, y) => -s.ny * x + s.nx * y;
    const grouped = segsByBand.map(list => {
      const g = new Map();
      for (const s of list) { s.key = lineKey(s); if (!g.has(s.key)) g.set(s.key, []); g.get(s.key).push(s); }
      return g;
    });
    const uncovered = (s, others) => {
      const t0 = t(s, s.x0, s.y0), t1 = t(s, s.x1, s.y1);
      const cover = (others.get(s.key) || []).map(o => { const a = t(o, o.x0, o.y0), b = t(o, o.x1, o.y1); return [Math.min(a, b), Math.max(a, b)]; });
      return intervalDiff([[Math.min(t0, t1), Math.max(t0, t1)]], cover).map(([p, q]) => {
        const f = v => (v - t0) / (t1 - t0);
        return [s.x0 + (s.x1 - s.x0) * f(p), s.y0 + (s.y1 - s.y0) * f(p), s.x0 + (s.x1 - s.x0) * f(q), s.y0 + (s.y1 - s.y0) * f(q)];
      });
    };
    for (let k = 0; k <= S.bands.length; k++) {
      const none = new Map(), lo = k > 0 ? k - 1 : -1, hi = k < S.bands.length ? k : -1;
      const z = k < S.bands.length ? S.bands[k].z0 : S.bands[k - 1].z1;
      for (const [a, b] of [[lo, hi], [hi, lo]]) if (a >= 0) for (const s of segsByBand[a]) for (const [x0, y0, x1, y1] of uncovered(s, b >= 0 ? grouped[b] : none)) edges.push([x0, y0, z, x1, y1, z]);
    }
    return { part, cap, edges };
  }
  function meshVolume(m) {
    let v = 0;
    for (const o of [m.part, m.cap]) for (let i = 0; i < o.pos.length; i += 9) {
      const p = o.pos;
      v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
    }
    return v;
  }

  // ---------- public entry points ----------
  function compute(partId, cutIn) {
    const part = byId[partId];
    if (!part) throw new Error('Unknown part: ' + partId);
    const cut = normalizeCut(part, cutIn), keep = keepRects(part, cut);
    const kept = solid(part, keep, 'kept');
    return { part, cut, kept, view: sectionView(kept, cut), plane: cuttingPlane(part, cut), keep };
  }
  function removed(result) { return solid(result.part, result.keep, 'removed'); }
  function whole(partId) { return solid(byId[partId], null, 'whole'); }
  function volume(S) { return S.bands.reduce((s, b) => s + regionArea(S.P, b.sets) * (b.z1 - b.z0), 0); }
  // Score a prediction: selected is the set of face numbers the learner hatched.
  function score(view, selected) {
    const scored = view.faces.filter(f => !f.tiny);
    const results = scored.map(f => ({ n: f.n, type: f.type, chose: selected.has(f.n), correct: selected.has(f.n) === (f.type === 'cut'), describe: f.describe }));
    return { results, right: results.filter(r => r.correct).length, total: results.length };
  }

  const api = { SIDES, sag, parts, byId, compute, removed, whole, volume, topView, meshData, meshVolume, score, isMaterial, extents, planeAt,
    _internal: { partition, combine, chord, polygon, boundary, regionArea, solid, keepRects, normalizeCut } };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiSectionExplorer = api;
})(typeof globalThis === 'object' ? globalThis : this);

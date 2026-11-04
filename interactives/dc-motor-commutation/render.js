(function (root, factory) {
  'use strict';
  const api = factory(root.CourseWikiCommutation || (typeof require === 'function' ? require('./model.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCommutationDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  if (!M) throw new Error('The commutation model is required.');
  // One pure SVG renderer serves the live views and the static/print figures.
  // Only model numbers and fixed strings enter the markup.
  const DEG = Math.PI / 180;
  const f1 = v => (Math.round(v * 10) / 10).toString();
  const f2 = v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
  const pts = list => list.map(p => f1(p[0]) + ',' + f1(p[1])).join(' ');
  const pathOf = list => list.map((p, i) => (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1])).join(' ');

  function arrowHead(tip, from, size, cls) {
    const dx = tip[0] - from[0], dy = tip[1] - from[1], len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, s = size || 9;
    const a = [tip[0] - ux * s - uy * s * 0.55, tip[1] - uy * s + ux * s * 0.55];
    const b = [tip[0] - ux * s + uy * s * 0.55, tip[1] - uy * s - ux * s * 0.55];
    return '<path class="' + cls + '" d="M' + f1(tip[0]) + ' ' + f1(tip[1]) + 'L' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(b[0]) + ' ' + f1(b[1]) + 'Z"/>';
  }
  function arrow(from, to, cls, size) {
    return '<path class="' + cls + '" fill="none" stroke="currentColor" d="M' + f1(from[0]) + ' ' + f1(from[1]) + 'L' + f1(to[0]) + ' ' + f1(to[1]) + '"/>' +
      arrowHead(to, from, size, cls + '-head');
  }
  function poleLabels(field) { return field === 1 ? ['N', 'S'] : ['S', 'N']; }

  // ---- Cutaway side view ----------------------------------------------------
  // Looking across the gap from the near pole (cut away) toward the far pole,
  // slightly from above: the shaft runs left to right, the commutator end is on
  // the right. Farther points (larger x) sit a little higher and to the right.
  const SV = Object.freeze({ S: 60, OX: 150, OY: 150, kx: 0.26, ky: 0.36, cy: 0.93 });
  function P(x, y, z) { return [SV.OX + SV.S * (z + SV.kx * x), SV.OY - SV.S * (SV.cy * y + SV.ky * x)]; }
  const COIL_Z = 1.5, RING_R = 0.32;
  const SPLIT_Z0 = 1.95, SPLIT_STEP = 0.5, SLIP_Z0 = 1.9, SLIP_STEP = 0.3;
  // Ordered path of conventional current through one coil, from the
  // commutator lead of the side it enters to the lead of the side it leaves.
  function coilPath(c, zLead) {
    const A = c.sideA, B = c.sideB;
    const leadA = P(RING_R * A.x, RING_R * A.y, zLead), leadB = P(RING_R * B.x, RING_R * B.y, zLead);
    const aF = P(A.x, A.y, COIL_Z), aB = P(A.x, A.y, -COIL_Z), bB = P(B.x, B.y, -COIL_Z), bF = P(B.x, B.y, COIL_Z);
    // Side A current -1 flows away from the commutator end: lead A -> front A -> back A.
    const forward = [leadA, aF, aB, bB, bF, leadB];
    return { forward, flow: c.current < 0 ? forward : forward.slice().reverse() };
  }
  function chevron(p, q, cls) {
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    const tip = [mid[0] + dx / len * 8, mid[1] + dy / len * 8];
    return arrowHead(tip, mid, 15, cls);
  }
  // A cylinder band of the commutator from rotor angle a0 to a1 (degrees), z0..z1,
  // drawn only where it faces the viewer (x < 0 side) for a solid look.
  function band(a0, a1, z0, z1, cls) {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 6)), near = [], far = [];
    for (let i = 0; i <= n; i += 1) {
      const t = (a0 + (a1 - a0) * i / n) * DEG;
      near.push(P(RING_R * Math.cos(t), RING_R * Math.sin(t), z1));
      far.push(P(RING_R * Math.cos(t), RING_R * Math.sin(t), z0));
    }
    return '<polygon class="' + cls + '" points="' + pts(near.concat(far.reverse())) + '"/>';
  }
  // Clip a rotor-frame arc to the half facing the viewer (angles 90..270 have x < 0).
  function visibleArcs(a0, a1) {
    const out = [];
    const lo = 90, hi = 270;
    for (let k = -1; k <= 1; k += 1) {
      const s0 = Math.max(a0, lo + 360 * k), s1 = Math.min(a1, hi + 360 * k);
      if (s1 > s0) out.push([s0, s1]);
    }
    return out;
  }
  function cutaway(state) {
    const st = state || {};
    const o = M.options(st.options), r = M.analyze(st.alpha || 0, o);
    const slip = o.mode === 'slip';
    const near = o.field === 1 ? 'N' : 'S', far = o.field === 1 ? 'S' : 'N';
    let svg = '<svg class="dmcc-svg dmcc-cutaway" viewBox="0 0 420 280" role="img" focusable="false" aria-label="' +
      'Cutaway side view: the ' + near + ' pole is cut away in front, the ' + far + ' pole face is behind the coil. ' +
      (o.coils === 2 ? 'Two coils at right angles turn' : 'One rectangular coil turns') + ' on a shaft with ' +
      (slip ? 'slip rings' : 'a split-ring commutator') + ' and brushes at the right-hand end, fed from a DC supply.' + '">';
    // Far pole face, behind everything.
    const fx = 1.45;
    const farFace = [P(fx, -1.25, -1.6), P(fx, -1.25, 1.6), P(fx, 1.25, 1.6), P(fx, 1.25, -1.6)];
    svg += '<polygon class="dmcc-pole dmcc-pole-' + far.toLowerCase() + '" points="' + pts(farFace) + '"/>';
    const fl = P(fx, 1.0, -1.35);
    svg += '<text class="dmcc-pole-text" x="' + f1(fl[0]) + '" y="' + f1(fl[1] + 8) + '">' + far + '</text>';
    // Field: from N to S, here across the gap (into or out of the picture).
    [-1.0, 0, 1.0].forEach(z => {
      const from = P(-1.3 * o.field, -1.12, z), to = P(1.3 * o.field, -1.12, z);
      svg += arrow(from, to, 'dmcc-field', 8);
    });
    const bTip = P(1.3 * o.field, -1.12, -1.0);
    svg += '<text class="dmcc-small dmcc-halo" x="' + f1(bTip[0] + (o.field === 1 ? 6 : -16)) + '" y="' + f1(bTip[1] + (o.field === 1 ? 4 : 18)) + '">B</text>';
    const zEnd = slip ? SLIP_Z0 + SLIP_STEP * (2 * o.coils) : SPLIT_Z0 + SPLIT_STEP * o.coils;
    svg += '<path class="dmcc-shaft" d="' + pathOf([P(0, 0, -2.2), P(0, 0, zEnd)]) + '"/>';
    // Coils: the second coil first so coil 1 reads on top; the far long side of each first.
    r.coils.slice().reverse().forEach(c => {
      const zLead = slip ? SLIP_Z0 + 2 * SLIP_STEP * c.index : SPLIT_Z0 + SPLIT_STEP * c.index;
      const p = coilPath(c, zLead);
      svg += '<path class="dmcc-wire' + (c.index ? ' dmcc-wire-2' : '') + '" fill="none" d="' + pathOf(p.forward) + '"/>';
      if (c.current !== 0) {
        svg += '<path class="dmcc-glow" fill="none" d="' + pathOf(p.flow) + '"/>';
        svg += '<path class="dmcc-flow" fill="none" stroke-dasharray="7 11" stroke-dashoffset="' + f1(-(st.flowPhase || 0) * 18) + '" d="' + pathOf(p.flow) + '"/>';
        svg += chevron(p.flow[1], p.flow[2], 'dmcc-current-head') + chevron(p.flow[3], p.flow[4], 'dmcc-current-head');
      }
      [[c.index ? '3' : '1', c.sideA], [c.index ? '4' : '2', c.sideB]].forEach(pair => {
        const sd = pair[1];
        if (sd.force) svg += arrow(P(sd.x, sd.y, 0), P(sd.x, sd.y + 0.7 * sd.force, 0), 'dmcc-force', 11);
        const t = P(sd.x, sd.y, -COIL_Z - 0.22);
        svg += '<text class="dmcc-small dmcc-tag dmcc-halo" x="' + f1(t[0]) + '" y="' + f1(t[1] + 5) + '" text-anchor="middle">' + pair[0] + '</text>';
      });
    });
    // Contacts. Brushes press from above and below; wires run to the supply on the right.
    const contacts = [];
    r.coils.forEach(c => {
      if (slip) {
        [0, 1].forEach(sideIndex => {
          const z0 = SLIP_Z0 + SLIP_STEP * (2 * c.index + sideIndex), z1 = z0 + 0.2;
          svg += band(90, 270, z0, z1, 'dmcc-ring' + (c.current !== 0 ? ' is-live' : ''));
          // Ring for side A takes the top brush, ring for side B the bottom brush.
          contacts.push({ top: sideIndex === 0, z: (z0 + z1) / 2, live: c.current !== 0 });
        });
      } else {
        const z0 = SPLIT_Z0 + SPLIT_STEP * c.index, z1 = z0 + 0.28, gap = 8, a = c.alpha;
        // Segment A is centred on n: alpha-90..alpha+90. Segment B is opposite.
        visibleArcs(a - 90 + gap, a + 90 - gap).concat(visibleArcs(a - 90 + gap + 360, a + 90 - gap + 360))
          .forEach(seg => { svg += band(seg[0], seg[1], z0, z1, 'dmcc-segment dmcc-segment-a' + (c.current ? ' is-live' : '')); });
        visibleArcs(a + 90 + gap, a + 270 - gap).concat(visibleArcs(a + 90 + gap - 360, a + 270 - gap - 360))
          .forEach(seg => { svg += band(seg[0], seg[1], z0, z1, 'dmcc-segment dmcc-segment-b' + (c.current ? ' is-live' : '')); });
        contacts.push({ top: true, z: (z0 + z1) / 2, live: c.current !== 0 });
        contacts.push({ top: false, z: (z0 + z1) / 2, live: c.current !== 0 });
      }
    });
    const batX = SV.OX + SV.S * (zEnd + 0.75), topY = SV.OY - SV.S * 1.25, botY = SV.OY + SV.S * 1.25, midY = SV.OY;
    contacts.forEach(k => {
      const touch = P(0, (k.top ? 1 : -1) * (RING_R * 1.04), k.z), end = [touch[0], touch[1] + (k.top ? -26 : 26)];
      svg += '<path class="dmcc-brush' + (k.live ? ' is-live' : '') + '" d="' + pathOf([touch, end]) + '"/>';
      const busY = k.top ? topY : botY;
      svg += '<path class="dmcc-lead" fill="none" d="' + pathOf([end, [end[0], busY], [batX, busY]]) + '"/>';
    });
    const topSign = r.topBrush === '+' ? '+' : '−', botSign = topSign === '+' ? '−' : '+';
    const longUp = topSign === '+';
    svg += '<g class="dmcc-battery"><path class="dmcc-lead" fill="none" d="M' + f1(batX) + ' ' + f1(topY) + 'V' + f1(midY - 6) + 'M' + f1(batX) + ' ' + f1(midY + 6) + 'V' + f1(botY) + '"/>' +
      '<path class="dmcc-cell-long" d="M' + f1(batX - 15) + ' ' + f1(midY + (longUp ? -6 : 6)) + 'h30"/>' +
      '<path class="dmcc-cell-short" d="M' + f1(batX - 8) + ' ' + f1(midY + (longUp ? 6 : -6)) + 'h16"/>' +
      '<text class="dmcc-small" x="' + f1(batX + 20) + '" y="' + f1(midY - 10) + '">' + topSign + '</text>' +
      '<text class="dmcc-small" x="' + f1(batX + 20) + '" y="' + f1(midY + 20) + '">' + botSign + '</text></g>';
    svg += '<text class="dmcc-small dmcc-halo" x="' + f1(batX + 8) + '" y="' + f1(topY - 10) + '" text-anchor="end">DC supply</text>';
    const hw = P(0, 0, (SPLIT_Z0 + zEnd) / 2 - 0.1);
    svg += '<text class="dmcc-small dmcc-halo" x="' + f1(hw[0]) + '" y="' + f1(botY + 20) + '" text-anchor="middle">' + (slip ? 'slip rings' : 'split ring') + '</text>';
    // Near pole, cut away: outline only, drawn last.
    const nx = -1.45;
    const nearFace = [P(nx, -1.25, -1.6), P(nx, -1.25, 1.6), P(nx, 1.25, 1.6), P(nx, 1.25, -1.6)];
    svg += '<polygon class="dmcc-cut dmcc-cut-' + near.toLowerCase() + '" fill="none" points="' + pts(nearFace) + '"/>';
    const nl = P(nx, -1.25, -1.6);
    svg += '<text class="dmcc-small dmcc-halo" x="' + f1(nl[0]) + '" y="' + f1(nl[1] + 20) + '">' + near + ', cut away</text>';
    svg += '</svg>';
    return svg;
  }

  // ---- End view, looking at the commutator end -------------------------------
  const EV = Object.freeze({ cx: 180, cy: 158, r: 78, face: 112 });
  function E(x, y, scale) { const s = scale === undefined ? EV.r : scale; return [EV.cx + s * x, EV.cy - s * y]; }
  function endView(state) {
    const st = state || {};
    const o = M.options(st.options), r = M.analyze(st.alpha || 0, o);
    const labels = poleLabels(o.field);
    const c1 = r.coils[0];
    let svg = '<svg class="dmcc-svg dmcc-endview" viewBox="0 0 360 312" role="img" focusable="false" aria-label="End view at theta ' +
      Math.round(r.theta) + ' degrees. Each coil side carries ' + (c1.current ? 'current ' + (c1.current > 0 ? 'toward' : 'away from') + ' the viewer in side 1' : 'no current: the brushes are on the gaps') +
      '. Total torque ' + f2(r.total) + ' of one coil\'s peak, ' + (r.sense === 'none' ? 'no turning effect' : r.sense) + '.">';
    // Pole shoes with curved faces.
    const shoe = sideSign => {
      const pts2 = [];
      for (let i = 0; i <= 12; i += 1) {
        const a = (-50 + 100 * i / 12) * DEG;
        pts2.push([EV.cx + sideSign * EV.face * Math.cos(a), EV.cy - EV.face * Math.sin(a)]);
      }
      const outer = EV.cx + sideSign * 166;
      return [[outer, pts2[0][1]]].concat(pts2).concat([[outer, pts2[pts2.length - 1][1]]]);
    };
    svg += '<polygon class="dmcc-pole dmcc-pole-' + labels[0].toLowerCase() + '" points="' + pts(shoe(-1)) + '"/>';
    svg += '<polygon class="dmcc-pole dmcc-pole-' + labels[1].toLowerCase() + '" points="' + pts(shoe(1)) + '"/>';
    svg += '<text class="dmcc-pole-text" x="' + (EV.cx - 140) + '" y="' + (EV.cy + 9) + '" text-anchor="middle">' + labels[0] + '</text>';
    svg += '<text class="dmcc-pole-text" x="' + (EV.cx + 140) + '" y="' + (EV.cy + 9) + '" text-anchor="middle">' + labels[1] + '</text>';
    // Field lines from N to S.
    [-56, -28, 0, 28, 56].forEach(dy => {
      const half = Math.sqrt(EV.face * EV.face - dy * dy) - 4;
      const y = EV.cy + dy;
      const a = [EV.cx - o.field * half, y], b = [EV.cx + o.field * (half - 2), y];
      svg += '<path class="dmcc-fieldline" d="M' + f1(a[0]) + ' ' + f1(y) + 'L' + f1(b[0]) + ' ' + f1(y) + '"/>' +
        arrowHead([EV.cx + o.field * 34, y], [EV.cx, y], 7, 'dmcc-fieldline-head');
    });
    svg += '<text class="dmcc-small dmcc-halo" x="' + (EV.cx + o.field * 62) + '" y="' + (EV.cy - 68) + '" text-anchor="middle">B</text>';
    // Neutral plane: the coil face lies here when theta is 0 or 180 degrees.
    svg += '<path class="dmcc-neutral" d="M' + EV.cx + ' ' + (EV.cy - 112) + 'V' + (EV.cy + 112) + '"/>' +
      '<text class="dmcc-small dmcc-soft dmcc-halo" x="' + EV.cx + '" y="' + (EV.cy + 150) + '" text-anchor="middle">neutral plane</text>';
    // Lever arm of coil 1: horizontal distance from the shaft to each force line.
    if (c1.current !== 0 && c1.lever > 0.02) {
      const a = E(c1.sideA.x, c1.sideA.y);
      svg += '<path class="dmcc-lever" d="M' + EV.cx + ' ' + f1(a[1]) + 'H' + f1(a[0]) + '"/>' +
        '<path class="dmcc-lever-line" d="M' + f1(a[0]) + ' ' + (EV.cy - 104) + 'V' + (EV.cy + 104) + '"/>';
    }
    // Coils edge-on, with conductor ends.
    r.coils.slice().reverse().forEach(c => {
      const a = E(c.sideA.x, c.sideA.y), b = E(c.sideB.x, c.sideB.y);
      svg += '<path class="dmcc-coil-edge' + (c.index ? ' dmcc-wire-2' : '') + '" d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(b[0]) + ' ' + f1(b[1]) + '"/>';
      [[c.sideA, a, c.current, c.index ? '3' : '1'], [c.sideB, b, -c.current, c.index ? '4' : '2']].forEach(item => {
        const s = item[0], p = item[1], cur = item[2];
        svg += '<circle class="dmcc-conductor' + (cur ? ' is-live' : '') + '" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="12"/>';
        if (cur > 0) svg += '<circle class="dmcc-dot" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="3.6"/>';
        else if (cur < 0) svg += '<path class="dmcc-cross" d="M' + f1(p[0] - 6) + ' ' + f1(p[1] - 6) + 'l12 12M' + f1(p[0] + 6) + ' ' + f1(p[1] - 6) + 'l-12 12"/>';
        if (s.force) {
          const from = [p[0], p[1] - 14 * s.force], to = [p[0], p[1] - 52 * s.force];
          svg += arrow(from, to, 'dmcc-force', 10);
        }
        // Side label beside the conductor, horizontally clear of its vertical force arrow.
        const side = s.x < -0.05 ? -1 : 1;
        svg += '<text class="dmcc-small dmcc-tag dmcc-halo" x="' + f1(p[0] + side * 22) + '" y="' + f1(p[1] + 5) + '" text-anchor="' + (side < 0 ? 'end' : 'start') + '">' + item[3] + '</text>';
      });
    });
    // Marked normal n of coil 1 and the angle theta from B to n.
    const nTip = E(c1.normal.x, c1.normal.y, 46);
    svg += arrow([EV.cx, EV.cy], nTip, 'dmcc-normal', 7);
    const nl = E(c1.normal.x, c1.normal.y, 60);
    svg += '<text class="dmcc-small dmcc-normal-text dmcc-halo" x="' + f1(nl[0]) + '" y="' + f1(nl[1] + 5) + '" text-anchor="middle">n</text>';
    const bDir = o.field === 1 ? 0 : 180, sweep = r.theta;
    if (sweep > 0.5) {
      const steps = Math.max(2, Math.ceil(sweep / 6)), arc = [];
      for (let i = 0; i <= steps; i += 1) { const a = (bDir + sweep * i / steps) * DEG; arc.push(E(Math.cos(a), Math.sin(a), 24)); }
      svg += '<path class="dmcc-angle" fill="none" d="' + pathOf(arc) + '"/>';
    }
    // Torque indicator in the top-right corner: a curved arrow about a shaft dot,
    // its sweep growing with |tau| and its direction following the sign.
    const gx = 318, gy = 34, gr = 17;
    svg += '<circle class="dmcc-shaft-dot" cx="' + gx + '" cy="' + gy + '" r="3.5"/>';
    if (r.total !== 0) {
      const span = Math.min(300, 70 + 150 * Math.abs(r.total)), dir = r.total > 0 ? 1 : -1, arc = [];
      for (let i = 0; i <= 24; i += 1) { const t = (90 - dir * span / 2 + dir * span * i / 24) * DEG; arc.push([gx + gr * Math.cos(t), gy - gr * Math.sin(t)]); }
      svg += '<path class="dmcc-torque" fill="none" d="' + pathOf(arc) + '"/>' + arrowHead(arc[24], arc[21], 10, 'dmcc-torque-head');
      svg += '<text class="dmcc-label dmcc-torque-text" x="' + (gx - 26) + '" y="' + (gy + 6) + '" text-anchor="end">τ</text>';
    } else {
      svg += '<text class="dmcc-small dmcc-halo" x="' + (gx + 18) + '" y="' + (gy + 5) + '" text-anchor="end">τ = 0</text>';
    }
    svg += '<text class="dmcc-label" x="8" y="24">θ = ' + Math.round(r.theta) + '°</text>';
    svg += '</svg>';
    return svg;
  }

  // ---- Torque against angle --------------------------------------------------
  const TR = Object.freeze({ x0: 64, x1: 620, yc: 142, sy: 64 });
  const tx = theta => TR.x0 + (TR.x1 - TR.x0) * theta / 360;
  const ty = v => TR.yc - TR.sy * v;
  function curve(opts, pick) {
    const list = [];
    for (let i = 0; i <= 360; i += 1) {
      const r = M.analyze(M.alphaFromTheta(i === 360 ? 0 : i, opts.field), opts);
      list.push([tx(i), ty(pick(r))]);
    }
    return pathOf(list);
  }
  function trace(state) {
    const st = state || {};
    const o = M.options(st.options);
    let svg = '<svg class="dmcc-svg dmcc-trace" viewBox="0 0 640 290" role="img" focusable="false" aria-label="Torque against coil angle theta, from 0 to 360 degrees' +
      (st.compare ? ': slip rings alternate sign, a commutated coil stays positive, and two commutated coils never reach zero.' : st.revealed ? ', full curve shown.' : ', showing the angles visited so far.') + '">';
    // Axes and grid.
    [-1, 1].forEach(v => { svg += '<path class="dmcc-grid" d="M' + TR.x0 + ' ' + ty(v) + 'H' + TR.x1 + '"/>'; });
    if (st.compare || (st.revealed && o.coils === 2)) svg += '<path class="dmcc-grid" d="M' + TR.x0 + ' ' + f1(ty(Math.SQRT2)) + 'H' + TR.x1 + '"/>';
    [0, 90, 180, 270, 360].forEach(d => {
      svg += '<path class="dmcc-grid" d="M' + f1(tx(d)) + ' ' + ty(1.55) + 'V' + ty(-1.55) + '"/>' +
        '<text class="dmcc-small" x="' + f1(tx(d)) + '' + '" y="' + (ty(-1.55) + 18) + '" text-anchor="middle">' + d + '°</text>';
    });
    svg += '<path class="dmcc-axis" d="M' + TR.x0 + ' ' + ty(0) + 'H' + TR.x1 + '"/>';
    [[1, '1'], [0, '0'], [-1, '−1']].forEach(t => { svg += '<text class="dmcc-small" x="' + (TR.x0 - 12) + '" y="' + f1(ty(t[0]) + 5) + '" text-anchor="end">' + t[1] + '</text>'; });
    if (st.compare || (st.revealed && o.coils === 2)) svg += '<text class="dmcc-small" x="' + (TR.x0 - 12) + '" y="' + f1(ty(Math.SQRT2) + 5) + '" text-anchor="end">1.41</text>';
    svg += '<text class="dmcc-small" x="' + (TR.x0 - 50) + '" y="16">Torque ÷ one coil’s peak NBIA</text>';
    svg += '<text class="dmcc-small" x="' + TR.x1 + '" y="' + (ty(-1.55) + 38) + '" text-anchor="end">θ, angle from B to the coil normal n</text>';
    if (st.compare) {
      const slip = M.options({ mode: 'slip', field: 1, supply: 1 }), one = M.options({ field: 1, supply: 1 }), two = M.options({ coils: 2, field: 1, supply: 1 });
      svg += '<path class="dmcc-curve-slip" fill="none" d="' + curve(slip, r => r.total) + '"/>';
      svg += '<path class="dmcc-curve" fill="none" d="' + curve(one, r => r.total) + '"/>';
      svg += '<path class="dmcc-curve-two" fill="none" d="' + curve(two, r => r.total) + '"/>';
      svg += '<text class="dmcc-small dmcc-halo" x="' + f1(tx(135)) + '" y="' + f1(ty(1.41) - 8) + '" text-anchor="middle">two coils (thick)</text>' +
        '<text class="dmcc-small dmcc-halo" x="' + f1(tx(90)) + '" y="' + f1(ty(0.5)) + '" text-anchor="middle">one coil, commutator</text>' +
        '<text class="dmcc-small dmcc-halo" x="' + f1(tx(270)) + '" y="' + f1(ty(-1) + 20) + '" text-anchor="middle">one coil, slip rings (dashed)</text>';
      [0, 180, 360].forEach(d => { svg += '<circle class="dmcc-zero" cx="' + f1(tx(d)) + '" cy="' + ty(0) + '" r="5"/>'; });
      svg += '<text class="dmcc-small dmcc-halo" x="' + f1(tx(180)) + '" y="' + (ty(0) + 22) + '" text-anchor="middle">zero</text>';
      svg += '</svg>';
      return svg;
    }
    if (st.revealed) {
      if (o.coils === 2) {
        svg += '<path class="dmcc-curve-part" fill="none" d="' + curve(o, r => r.coils[0].torque) + '"/>';
        svg += '<path class="dmcc-curve-part dmcc-curve-part-2" fill="none" d="' + curve(o, r => r.coils[1].torque) + '"/>';
      }
      svg += '<path class="dmcc-curve" fill="none" d="' + curve(o, r => r.total) + '"/>';
      const rp = M.ripple(o), lowAt = [], highAt = [];
      for (let d = 0; d <= 360; d += 45) {
        const v = M.torqueAtTheta(d === 360 ? 0 : d, o);
        if (Math.abs(Math.abs(v) - Math.min(Math.abs(rp.min), Math.abs(rp.max))) < 1e-9 && rp.oneDirection) lowAt.push([d, v]);
        if (Math.abs(Math.abs(v) - Math.max(Math.abs(rp.min), Math.abs(rp.max))) < 1e-9) highAt.push([d, v]);
        if (!rp.oneDirection && Math.abs(v) < 1e-9) lowAt.push([d, 0]);
      }
      lowAt.forEach(p => { svg += '<circle class="dmcc-zero" cx="' + f1(tx(p[0])) + '" cy="' + f1(ty(p[1])) + '" r="5"/>'; });
      highAt.forEach(p => { svg += '<circle class="dmcc-peak" cx="' + f1(tx(p[0])) + '" cy="' + f1(ty(p[1])) + '" r="5"/>'; });
      const lowLabel = rp.oneDirection && o.coils === 2 ? 'smallest ' + f2(Math.min(Math.abs(rp.min), Math.abs(rp.max))) : 'zero';
      const firstLow = lowAt.find(p => p[0] === 180) || lowAt[1] || lowAt[0];
      if (firstLow) svg += '<text class="dmcc-small dmcc-halo" x="' + f1(tx(firstLow[0])) + '" y="' + f1(ty(firstLow[1]) + 26) + '" text-anchor="middle">' + lowLabel + '</text>';
      const firstHigh = highAt[0];
      if (firstHigh) svg += '<text class="dmcc-small dmcc-halo" x="' + f1(tx(firstHigh[0])) + '" y="' + f1(ty(firstHigh[1]) + (firstHigh[1] < 0 ? 24 : -12)) + '" text-anchor="middle">peak ' + f2(Math.abs(firstHigh[1])) + '</text>';
    }
    // Angles visited by the rotor so far: one value per whole degree.
    const visited = st.visited || [];
    let d = '';
    for (let i = 0; i < 360; i += 1) if (typeof visited[i] === 'number') d += 'M' + f1(tx(i)) + ' ' + f1(ty(visited[i])) + 'h0.1';
    if (d) svg += '<path class="dmcc-visited" d="' + d + '"/>';
    if (typeof st.alpha === 'number') {
      const now = M.analyze(st.alpha, o);
      svg += '<path class="dmcc-now-line" d="M' + f1(tx(now.theta)) + ' ' + ty(1.55) + 'V' + ty(-1.55) + '"/>' +
        '<circle class="dmcc-now" cx="' + f1(tx(now.theta)) + '" cy="' + f1(ty(now.total)) + '" r="7"/>';
    }
    svg += '</svg>';
    return svg;
  }

  // ---- Static lesson figures -------------------------------------------------
  const STATIC_ALPHA = 30;
  function staticViews() {
    const s = { alpha: STATIC_ALPHA, options: { mode: 'commutator', coils: 1, supply: 1, field: 1 } };
    return '<figure class="dmcc-static-figure"><div class="dmcc-static-pair">' + cutaway(s) + endView(s) + '</div>' +
      '<figcaption>One coil at θ = 30°. Left, a cutaway side view: the N pole in front is cut away, the S pole is behind the coil, and B points away from you. Right, the end view from the commutator end, with the top brush positive. In the end view, current runs away from you along side 1 (⊗) and back toward you along side 2 (⊙). ' +
      'F = BIL pushes side 1 down and side 2 up. The two forces are equal and opposite, so there is no net force, but they form a couple. Each acts at a lever arm of r·sin 30° = 0.5r from the shaft, where r is half the coil width. So τ = 0.5·NBIA, counter-clockwise as seen from the commutator end.</figcaption></figure>';
  }
  function staticTrace() {
    return '<figure class="dmcc-static-figure">' + trace({ compare: true }) +
      '<figcaption>Torque against θ for one turn, as a fraction of one coil’s peak NBIA. Slip rings (dashed): the torque reverses every half turn and averages zero. ' +
      'Split-ring commutator (solid): the current reverses at the neutral plane, so the torque is |sin θ|, never negative, averaging 2/π ≈ 0.64; it is still zero at 0° and 180°. ' +
      'Two commutated coils 90° apart (thick): the sum runs from 1 to √2 ≈ 1.41, so the smallest torque is 0.71 of the largest and never zero.</figcaption></figure>';
  }

  return Object.freeze({ cutaway, endView, trace, staticViews, staticTrace, STATIC_ALPHA });
});

(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./model.js') : root.CourseWikiChainChordal);
  if (node) module.exports = api; else root.CourseWikiChainChordalDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  // Pure SVG markup shared by the live lab and the static (print / no-JS) fallback.
  const n = v => (Math.round(v * 100) / 100).toString();
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const deg = r => r * 180 / Math.PI;

  // Layout of the drive drawing for a given viewBox width (640 wide, or 420 compact).
  function layout(W) {
    const wide = W >= 560;
    // The gauge is a column right of the drive in both layouts, so the moving span, its gauge and
    // the controls under the drawing stay close together on a phone.
    return wide
      ? { W, H: 372, cx: 172, cy: 178, Rpx: 120, wide, driveW: W - 168, driveH: 372, gauge: { x: W - 154, y: 56, w: 146, h: 290 } }
      : { W, H: 344, cx: 120, cy: 168, Rpx: 92, wide, driveW: W - 98, driveH: 344, gauge: { x: W - 94, y: 30, w: 90, h: 286 } };
  }

  // Schematic sprocket outline, seats centred on the pitch polygon vertices, drawn about (0,0)
  // in screen units (y down) with seat k at k·360°/N clockwise from the top. Tooth form is
  // illustrative: a seat arc slightly larger than the roller, straight flanks and a tip arc.
  function sprocketPath(N, Rpx, ppx) {
    const step = 2 * Math.PI / N, rs = 0.32 * ppx, g = 18 * Math.PI / 180;
    let Rt = Rpx + 0.3 * ppx;
    const pt = (th, r) => [r * Math.sin(th), -r * Math.cos(th)];
    function gap(k, tip) {
      const th = k * step, u = [Math.sin(th), -Math.cos(th)], w = [Math.cos(th), Math.sin(th)];
      const c = pt(th, Rpx);
      const side = s => {
        const T = [c[0] + rs * (-Math.sin(g) * u[0] + s * Math.cos(g) * w[0]), c[1] + rs * (-Math.sin(g) * u[1] + s * Math.cos(g) * w[1])];
        const d = [Math.cos(g) * u[0] + s * Math.sin(g) * w[0], Math.cos(g) * u[1] + s * Math.sin(g) * w[1]];
        const b = T[0] * d[0] + T[1] * d[1], cc = T[0] * T[0] + T[1] * T[1] - tip * tip;
        const t = -b + Math.sqrt(Math.max(0, b * b - cc));
        return { T, F: [T[0] + t * d[0], T[1] + t * d[1]] };
      };
      return { minus: side(-1), plus: side(1) };
    }
    // Keep a visible tooth land even on few-tooth sprockets.
    for (let i = 0; i < 20; i++) {
      const a = gap(0, Rt).plus.F, b = gap(1, Rt).minus.F;
      const span = Math.atan2(b[0], -b[1]) - Math.atan2(a[0], -a[1]);
      if (span > 0.18 * step) break;
      Rt -= 0.02 * ppx;
    }
    let d = '';
    for (let k = 0; k < N; k++) {
      const q = gap(k, Rt);
      d += (k === 0 ? 'M' : 'L') + n(q.minus.F[0]) + ' ' + n(q.minus.F[1]) +
        'L' + n(q.minus.T[0]) + ' ' + n(q.minus.T[1]) +
        'A' + n(rs) + ' ' + n(rs) + ' 0 0 0 ' + n(q.plus.T[0]) + ' ' + n(q.plus.T[1]) +
        'L' + n(q.plus.F[0]) + ' ' + n(q.plus.F[1]);
      const next = gap(k + 1, Rt).minus.F;
      d += 'A' + n(Rt) + ' ' + n(Rt) + ' 0 0 1 ' + n(next[0]) + ' ' + n(next[1]);
    }
    return { d: d + 'Z', tip: Rt };
  }

  // One link plate between two pin centres (screen units): a waisted, figure-eight outline.
  function plate(a, b, rc, waist) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const u = [dx / L, dy / L], w = [-u[1], u[0]], e = Math.sqrt(Math.max(0, rc * rc - waist * waist));
    const P = (o, s, t) => n(o[0] + s * u[0] + t * w[0]) + ' ' + n(o[1] + s * u[1] + t * w[1]);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], pinch = waist * 0.82;
    return 'M' + P(a, e, waist) + 'Q' + P(mid, 0, pinch) + ' ' + P(b, -e, waist) +
      'A' + n(rc) + ' ' + n(rc) + ' 0 1 0 ' + P(b, -e, -waist) +
      'Q' + P(mid, 0, -pinch) + ' ' + P(a, e, -waist) +
      'A' + n(rc) + ' ' + n(rc) + ' 0 1 0 ' + P(a, e, waist) + 'Z';
  }

  function frame(state, W) {
    const L = layout(W || 640), p = M.pitchOf(state.chain), N = state.teeth;
    const R = M.pitchRadius(N, p), s = L.Rpx / R;
    return { L, p, N, R, s, ppx: p * s };
  }

  // Moving chain: pins from the model's pose, mapped to screen. Inner plates first, then outer
  // plates (nearer the viewer), then pins. The leaving span and leaving pin are highlighted.
  function chainLayer(state, phase, W) {
    const F = frame(state, W), L = F.L;
    const spanMm = (L.driveW - L.cx + 2 * F.ppx) / F.s;
    const pose = M.pose(F.N, F.p, phase, spanMm);
    const scr = q => [L.cx + q.x * F.s, L.cy - q.y * F.s];
    const pins = pose.bottom.slice().reverse().concat(pose.wrap.slice().reverse(), pose.top);
    // pins now ordered by decreasing j: bottom span (largest j) → wrap → top span.
    let inner = '', outer = '', joints = '';
    const topSet = new Set(pose.top.map(q => q.j).concat([pose.leaving]));
    for (let i = 0; i + 1 < pins.length; i++) {
      const a = pins[i], b = pins[i + 1], lo = Math.min(a.j, b.j);
      const span = topSet.has(a.j) && topSet.has(b.j) ? ' cc-span' : '';
      const isInner = ((lo % 2) + 2) % 2 === 0;
      const d = isInner ? plate(scr(a), scr(b), 0.33 * F.ppx, 0.25 * F.ppx) : plate(scr(a), scr(b), 0.37 * F.ppx, 0.27 * F.ppx);
      if (isInner) inner += '<path class="cc-plate cc-inner' + span + '" d="' + d + '"/>';
      else outer += '<path class="cc-plate cc-outer' + span + '" d="' + d + '"/>';
    }
    pins.forEach(q => {
      const c = scr(q), lead = q.j === pose.leaving;
      joints += '<circle class="cc-pin' + (lead ? ' cc-pin-leave' : '') + '" cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" r="' + n((lead ? 0.2 : 0.15) * F.ppx) + '"/>';
    });
    return inner + outer + joints;
  }

  // Geometry overlays: the radius to the leaving pin, the span height and the magnified gauge.
  function overlayLayer(state, phase, W, ghost) {
    const F = frame(state, W), L = F.L, I = M.instant(F.N, F.p, state.rpm, phase);
    const lx = L.cx + F.R * Math.sin(I.angle) * F.s, ly = L.cy - I.height * F.s;
    let out = '';
    if (ghost) {
      out += '<circle class="cc-ghost" cx="' + L.cx + '" cy="' + L.cy + '" r="' + L.Rpx + '"/>' +
        '<path class="cc-ghost" d="M' + L.cx + ' ' + n(L.cy - L.Rpx) + 'H' + L.driveW + '"/>';
    }
    out += '<path class="cc-height" d="M' + L.cx + ' ' + L.cy + 'V' + n(ly) + '"/>' +
      '<path class="cc-radius" d="M' + L.cx + ' ' + L.cy + 'L' + n(lx) + ' ' + n(ly) + '"/>' +
      '<circle class="cc-hub-dot" cx="' + L.cx + '" cy="' + L.cy + '" r="3"/>';
    // Gauge: span height between R (top) and R·cos(180°/N) (bottom), magnified by k.
    const G = L.gauge, risePx = F.R * M.ripple(F.N) * F.s, sm = 'cc-text cc-small', angle = n(180 / F.N) + '°';
    const top = G.y + (L.wide ? 62 : 80), bot = G.y + G.h - (L.wide ? 42 : 88);
    const k = (bot - top) / risePx, kText = k >= 100 ? Math.round(k / 10) * 10 : k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    const y = top + (I.drop / (F.R * M.ripple(F.N))) * (bot - top);
    const x0 = G.x + (L.wide ? 12 : 10), x1 = G.x + (L.wide ? 44 : 46), xc = (x0 + x1) / 2, drop = M.format(I.drop, 3) + ' mm';
    out += '<g class="cc-gauge"><rect class="cc-gauge-box" x="' + G.x + '" y="' + G.y + '" width="' + G.w + '" height="' + G.h + '" rx="6"/>' +
      '<path class="cc-gauge-ref" d="M' + x0 + ' ' + n(top) + 'H' + x1 + 'M' + x0 + ' ' + n(bot) + 'H' + x1 + '"/>' +
      '<path class="cc-gauge-track" d="M' + xc + ' ' + n(top) + 'V' + n(bot) + '"/>' +
      '<circle class="cc-gauge-dot" cx="' + xc + '" cy="' + n(y) + '" r="7"/>';
    if (L.wide) out += '<text class="' + sm + ' cc-strong" x="' + (G.x + 10) + '" y="' + (G.y + 20) + '">Leaving-span height</text>' +
      '<text class="' + sm + '" x="' + (G.x + 10) + '" y="' + (G.y + 36) + '">scale magnified ×' + kText + '</text>' +
      '<text class="' + sm + '" x="' + (x1 + 6) + '" y="' + n(top + 5) + '">R</text>' +
      '<text class="' + sm + '" x="' + (x1 + 6) + '" y="' + n(bot + 5) + '">R cos(' + angle + ')</text>' +
      '<text class="' + sm + '" x="' + (G.x + 10) + '" y="' + (G.y + G.h - 12) + '">drop: ' + drop + '</text></g>';
    else out += '<text class="' + sm + ' cc-strong" x="' + (G.x + 8) + '" y="' + (G.y + 20) + '">Span</text>' +
      '<text class="' + sm + ' cc-strong" x="' + (G.x + 8) + '" y="' + (G.y + 38) + '">height</text>' +
      '<text class="' + sm + '" x="' + (G.x + 8) + '" y="' + (G.y + 58) + '">×' + kText + '</text>' +
      '<text class="' + sm + '" x="' + (x1 + 5) + '" y="' + n(top + 5) + '">R</text>' +
      '<text class="' + sm + '" x="' + (G.x + 8) + '" y="' + n(bot + 22) + '">R cos</text>' +
      '<text class="' + sm + '" x="' + (G.x + 8) + '" y="' + n(bot + 40) + '">(' + angle + ')</text>' +
      '<text class="' + sm + '" x="' + (G.x + 8) + '" y="' + (G.y + G.h - 28) + '">drop</text>' +
      '<text class="' + sm + '" x="' + (G.x + 8) + '" y="' + (G.y + G.h - 9) + '">' + drop + '</text></g>';
    return out;
  }

  function labelLayer(state, W) {
    const F = frame(state, W), L = F.L, chain = M.PITCHES.find(c => c.id === String(state.chain));
    const plateHalf = 0.37 * F.ppx, low = F.R * Math.cos(M.halfAngle(F.N)) * F.s;
    const wide = L.wide, xLab = L.driveW - (wide ? 112 : 84), sm = 'cc-text cc-small';
    // Title sits above the gauge column, leaving the top of the drive free for few-tooth chains.
    let out = (wide
      ? '<text class="cc-text cc-strong" x="' + (L.gauge.x + 2) + '" y="20">' + F.N + ' teeth · ' + esc(chain.label) + '</text>' +
        '<text class="cc-text cc-small" x="' + (L.gauge.x + 2) + '" y="40">p = ' + M.format(F.p, 4) + ' mm</text>'
      : '<text class="cc-text cc-strong" x="12" y="20">' + F.N + ' teeth · ' + esc(chain.label) + ' chain, p = ' + M.format(F.p, 4) + ' mm</text>') +
      '<text class="' + sm + ' cc-span-label" x="' + xLab + '" y="' + n(L.cy - low + plateHalf + 20) + '">' + (wide ? 'leaving span →' : 'leaving →') + '</text>' +
      '<text class="' + sm + '" x="' + xLab + '" y="' + n(L.cy + low - plateHalf - 9) + '">' + (wide ? '← arriving span' : '← arriving') + '</text>' +
      '<path class="cc-turn" d="' + turnArrow(L) + '"/>';
    if (wide) out += '<text class="' + sm + '" x="12" y="' + (L.H - 12) + '">R = ' + M.format(F.R, 4) + ' mm · constant ω, clockwise · scaled to fit</text>' +
      '<path class="cc-divider" d="M' + L.driveW + ' 0V' + L.H + '"/>';
    else out += '<text class="' + sm + '" x="12" y="' + (L.H - 10) + '">R = ' + M.format(F.R, 4) + ' mm · ω constant · to fit</text>' +
      '<path class="cc-divider" d="M' + L.driveW + ' 0V' + L.H + '"/>';
    return out;
  }
  function turnArrow(L) {
    const r = L.Rpx * 0.36, a0 = -150 * Math.PI / 180, a1 = -40 * Math.PI / 180;
    const P = a => [L.cx + r * Math.cos(a), L.cy + r * Math.sin(a)], s = P(a0), e = P(a1);
    const h = [e[0] - 7 * Math.cos(a1 - 0.6) , e[1] - 7 * Math.sin(a1 - 0.6)];
    return 'M' + n(s[0]) + ' ' + n(s[1]) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(e[0]) + ' ' + n(e[1]) +
      'M' + n(e[0] - 9 * Math.cos(a1 - 1.9)) + ' ' + n(e[1] - 9 * Math.sin(a1 - 1.9)) + 'L' + n(e[0]) + ' ' + n(e[1]) + 'L' + n(h[0] - 4 * Math.cos(a1 + 0.9)) + ' ' + n(h[1] - 4 * Math.sin(a1 + 0.9));
  }

  function sprocketLayer(state, W) {
    const F = frame(state, W), L = F.L, sp = sprocketPath(F.N, L.Rpx, F.ppx);
    const hub = Math.max(L.Rpx * 0.34, 18), bore = hub * 0.45, markR = (L.Rpx - 0.32 * F.ppx) * 0.8;
    const mark = 0.5 * 2 * Math.PI / F.N;
    return '<path class="cc-sprocket" d="' + sp.d + '"/>' +
      '<circle class="cc-hub" r="' + n(hub) + '"/><circle class="cc-bore" r="' + n(bore) + '"/>' +
      '<circle class="cc-mark" cx="' + n(markR * Math.sin(mark)) + '" cy="' + n(-markR * Math.cos(mark)) + '" r="' + n(Math.max(3, 0.08 * L.Rpx)) + '"/>';
  }
  const sprocketTransform = (state, phase, W) => {
    const L = layout(W || 640), turns = phase / state.teeth;
    return 'translate(' + L.cx + ' ' + L.cy + ') rotate(' + n(((turns % 1) + 1) % 1 * 360) + ')';
  };

  function sceneLabel(state, phase) {
    const p = M.pitchOf(state.chain), I = M.instant(state.teeth, p, state.rpm, phase);
    return 'Side view of a ' + state.teeth + '-tooth sprocket turning clockwise with roller chain wrapped around its left side. ' +
      'The leaving pin sits ' + M.format(Math.abs(I.angleDeg), 3) + ' degrees from the top, so the leaving span is ' +
      M.format(I.drop, 3) + ' mm below the pitch radius and moving at ' + M.format(I.speedRatio * 100, 4) + ' percent of omega R.';
  }

  // Whole drive drawing. The live lab updates the three dynamic groups in place each frame.
  function scene(state, phase, opts) {
    const o = opts || {}, W = o.width || 640, L = layout(W);
    return '<svg class="cc-scene' + (L.W < 560 ? ' cc-compact' : '') + '" viewBox="0 0 ' + L.W + ' ' + L.H + '" role="img" aria-label="' + esc(sceneLabel(state, phase)) + '" data-cc-scene>' +
      // A nested viewport clips the drive area without document ids, so copies never collide.
      '<svg x="0" y="0" width="' + L.driveW + '" height="' + L.driveH + '" viewBox="0 0 ' + L.driveW + ' ' + L.driveH + '" overflow="hidden"><g>' +
      '<g data-cc-sprocket transform="' + sprocketTransform(state, phase, W) + '">' + sprocketLayer(state, W) + '</g>' +
      '<g data-cc-chain>' + chainLayer(state, phase, W) + '</g></g></svg>' +
      '<g data-cc-overlay>' + overlayLayer(state, phase, W, !!o.ghost) + '</g>' +
      '<g data-cc-labels>' + labelLayer(state, W) + '</g></svg>';
  }

  // Speed trace: chain speed as a fraction of ωR (identical to span height as a fraction of R),
  // against sprocket rotation counted in teeth. Window ends at `phase`.
  function traceChart(spec) {
    // spec.mini: a short comparison chart for the prediction result.
    const W = spec.width || 640, compact = W < 560, H = spec.mini ? (compact ? 204 : 190) : compact ? 284 : 230;
    const x0 = compact ? 50 : 58, x1 = W - (compact ? 40 : 52), y0 = 30, y1 = H - (spec.mini ? (compact ? 86 : 56) : compact ? 100 : 64);
    const lo = 0.85, hi = 1.0, from = spec.from, to = spec.to;
    const X = t => x0 + (t - from) / (to - from) * (x1 - x0), Y = v => y1 - (v - lo) / (hi - lo) * (y1 - y0);
    const line = N => M.trace(N, from, to, 64).map((q, i) => (i ? 'L' : 'M') + n(X(q[0])) + ' ' + n(Y(q[1]))).join('');
    const fs = compact ? 16 : 13;
    let g = '<rect class="cc-plot-bg" x="' + x0 + '" y="' + y0 + '" width="' + (x1 - x0) + '" height="' + (y1 - y0) + '"/>';
    [0.85, 0.9, 0.95, 1].forEach(v => {
      g += '<path class="cc-grid" d="M' + x0 + ' ' + n(Y(v)) + 'H' + x1 + '"/>' +
        '<text class="cc-text cc-tick" style="font-size:' + fs + 'px" x="' + (x0 - 6) + '" y="' + n(Y(v) + 4) + '" text-anchor="end">' + Math.round(v * 100) + '</text>' +
        '<text class="cc-text cc-tick" style="font-size:' + fs + 'px" x="' + (x1 + 6) + '" y="' + n(Y(v) + 4) + '">' + Math.round(v * 100) + '</text>';
    });
    for (let k = Math.ceil(from); k <= to; k++) g += '<path class="cc-grid cc-grid-tooth" d="M' + n(X(k)) + ' ' + y0 + 'V' + y1 + '"/>';
    const ghostOn = !!spec.ghost;
    if (ghostOn) g += '<path class="cc-trace-ghost" d="M' + x0 + ' ' + n(Y(1)) + 'H' + x1 + '"/>';
    if (spec.teeth) g += '<path class="cc-trace-mean" d="M' + x0 + ' ' + n(Y(M.meanFactor(spec.teeth))) + 'H' + x1 + '"/>';
    const styles = ['cc-trace-a', 'cc-trace-b'];
    (spec.compare || []).forEach((N, i) => { g += '<path class="cc-trace-compare ' + styles[i % 2] + '" d="' + line(N) + '"/>'; });
    if (spec.teeth) {
      g += '<path class="cc-trace" d="' + line(spec.teeth) + '"/>';
      if (spec.cursor) {
        const v = Math.cos(M.leavingAngle(spec.teeth, to));
        g += '<circle class="cc-trace-dot" cx="' + n(X(to)) + '" cy="' + n(Y(v)) + '" r="5.5"/>';
      }
    }
    g += '<text class="cc-text cc-axis" style="font-size:' + fs + 'px" x="' + x0 + '" y="' + (y0 - 10) + '">' + (compact ? 'speed, % of ωR' : 'chain speed, % of ωR') + '</text>' +
      '<text class="cc-text cc-axis" style="font-size:' + fs + 'px" x="' + x1 + '" y="' + (y0 - 10) + '" text-anchor="end">' + (compact ? '= height, % of R' : '= span height, % of R') + '</text>' +
      '<text class="cc-text cc-axis" style="font-size:' + fs + 'px" x="' + ((x0 + x1) / 2) + '" y="' + (y1 + fs + 6) + '" text-anchor="middle">' + (compact ? 'rotation → one division = one tooth' : 'sprocket rotation → one grid division = one tooth') + '</text>';
    // Legend, drawn into the SVG so print and no-JS readers get it too.
    const items = [];
    if (spec.teeth) items.push(['cc-trace', spec.teeth + ' teeth' + (spec.compare && spec.compare.length ? ' (now)' : '')]);
    (spec.compare || []).forEach((N, i) => items.push(['cc-trace-compare ' + styles[i % 2], N + ' teeth: ' + M.percent(M.ripple(N), 2)]));
    if (spec.teeth) items.push(['cc-trace-mean', 'average = N·p·n']);
    if (ghostOn) items.push(['cc-trace-ghost', 'belt on pitch circle']);
    let lx = x0, ly = H - (compact ? 34 : 18);
    const per = compact ? Math.ceil(items.length / 2) : items.length, colW = compact ? (x1 - x0) / 2 : (x1 - x0) / Math.max(items.length, 1);
    items.forEach((it, i) => {
      if (compact) { lx = x0 + (i >= per ? colW : 0); ly = H - (spec.mini ? 14 : 42) + (i % per) * 22; } else lx = x0 + i * colW;
      g += '<path class="' + it[0] + ' cc-legend" d="M' + n(lx) + ' ' + n(ly - 4) + 'h22"/><text class="cc-text cc-tick" style="font-size:' + fs + 'px" x="' + n(lx + 27) + '" y="' + n(ly) + '">' + esc(it[1]) + '</text>';
    });
    const label = 'Chain speed trace over ' + M.format(to - from, 3) + ' teeth of rotation' +
      (spec.teeth ? ' for ' + spec.teeth + ' teeth: it peaks at 100 percent of omega R once per tooth and dips to ' + M.format(Math.cos(M.halfAngle(spec.teeth)) * 100, 4) + ' percent' : '') +
      ((spec.compare || []).length ? '. Compared: ' + spec.compare.map(N => N + ' teeth dips to ' + M.format(Math.cos(M.halfAngle(N)) * 100, 4) + ' percent').join('; ') : '') + '.';
    return '<svg class="cc-trace-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">' + g + '</svg>';
  }

  const TABLE_TEETH = Object.freeze([6, 8, 9, 10, 12, 15, 17, 19, 21, 25, 30]);
  function rippleTable(p) {
    const rows = TABLE_TEETH.map(N => '<tr' + (N === 9 || N === 21 ? ' class="cc-row-mark"' : '') + '><th scope="row">' + N + '</th><td>' + M.format(M.pitchRadius(N, p) / p, 4) + '</td><td>' +
      M.percent(M.ripple(N), 2) + '</td><td>' + M.percent(M.rippleOfMean(N), 2) + '</td><td>' + M.format(M.rise(N, p), 3) + '</td></tr>').join('');
    return '<div class="unit-table-wrap"><table class="unit-table cc-table"><caption>Chordal speed variation by tooth count. Rise is for p = ' + M.format(p, 4) + ' mm (#40); ripple percentages do not depend on pitch or speed.</caption>' +
      '<thead><tr><th scope="col">Teeth N</th><th scope="col">R / p</th><th scope="col">Ripple (v<sub>max</sub> − v<sub>min</sub>) / v<sub>max</sub></th><th scope="col">Same spread ÷ average speed</th><th scope="col">Span rise (mm)</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function staticLesson() {
    const state = { teeth: 9, chain: '40', rpm: 120 }, s = M.summary(9, 12.7, 120), t = M.summary(21, 12.7, 120);
    return '<div class="cc-static-pair">' +
      '<figure class="cc-static-figure">' + scene(state, 0, { width: 420, uid: 'cc-static-a' }) + '<figcaption><strong>Pin at the top:</strong> the leaving span sits at the full pitch radius R and moves at ωR, its fastest.</figcaption></figure>' +
      '<figure class="cc-static-figure">' + scene(state, 0.5, { width: 420, uid: 'cc-static-b' }) + '<figcaption><strong>Two pins straddle the top:</strong> the span leaves from a flat of the polygon at R cos(180°/N) and moves at ωR cos(180°/N), its slowest.</figcaption></figure></div>' +
      '<div class="cc-law"><div><strong>Pitch radius</strong>R = p / (2 sin(180°/N))</div>' +
      '<div><strong>Speed range</strong>ωR cos(180°/N) ≤ v ≤ ωR</div>' +
      '<div><strong>Ripple</strong>(v<sub>max</sub> − v<sub>min</sub>) / v<sub>max</sub> = 1 − cos(180°/N)</div>' +
      '<div><strong>Span rise</strong>R (1 − cos(180°/N))</div></div>' +
      '<p><strong>Worked example:</strong> #40 chain (p = 12.7 mm) on a 9-tooth sprocket at 120 r/min. R = 12.7 / (2 sin 20°) = ' + M.format(s.R, 4) + ' mm. ' +
      'ω = 120 × 2π / 60 = 12.57 rad/s, so v<sub>max</sub> = ωR = ' + M.format(s.vmax, 3) + ' m/s and v<sub>min</sub> = ωR cos 20° = ' + M.format(s.vmin, 3) + ' m/s. ' +
      'Ripple = 1 − cos 20° = ' + M.percent(s.ripple, 2) + '; the span rises and falls ' + M.format(s.rise, 3) + ' mm, once per tooth: ' + M.format(s.pulseHz, 3) + ' times a second. ' +
      'With 21 teeth the same chain and speed give ' + M.percent(t.ripple, 2) + ' and ' + M.format(t.rise, 3) + ' mm.</p>' +
      '<figure class="cc-static-figure cc-static-trace">' + traceChart({ width: 640, from: 0, to: 3, compare: [9, 21] }) +
      '<figcaption>Three teeth of rotation. Each pulse is one tooth: the speed peaks when a pin passes the top and dips at the hand-over between pins. More teeth make a shallower, more frequent pulse.</figcaption></figure>' +
      rippleTable(12.7);
  }

  return { layout, sprocketPath, plate, chainLayer, overlayLayer, labelLayer, sprocketLayer, sprocketTransform, sceneLabel, scene, traceChart, rippleTable, staticLesson, TABLE_TEETH };
});

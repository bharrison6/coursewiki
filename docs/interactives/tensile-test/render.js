(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./model.js') : root.CourseWikiTensileTest);
  if (node) module.exports = api; else root.CourseWikiTensileTestRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  // Pure string renderer shared by the live lab and the static/print fallback.
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const n1 = v => Number(v).toFixed(1);
  function pct(strain, digits) { return (strain * 100).toFixed(digits === undefined ? (strain < 0.01 ? 3 : strain < 0.1 ? 2 : 1) : digits); }
  function mpa(v) { return v >= 100 ? v.toFixed(0) : v.toFixed(1); }
  function gpa(E) { return E >= 10000 ? (E / 1000).toFixed(0) : (E / 1000).toFixed(1); }
  function niceStep(max, count) {
    const raw = max / count, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function decimals(step) { return Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9))); }
  function letterOf(id) { return M.curveById(id).letter; }

  // ---- stress-strain plot ------------------------------------------------------------------------
  const W = 520, H = 380, L = 80, R = 20, T = 44, B = 70;
  function plot(o) {
    const HH = o.H || H, xMax = o.xMax, yMax = o.yMax, pw = W - L - R, ph = HH - T - B;
    const X = e => L + e / xMax * pw, Y = s => T + ph - s / yMax * ph;
    const clip = esc(o.prefix) + '-clip';
    const xs = niceStep(xMax * 100, 5), ys = niceStep(yMax, 5), xd = decimals(xs);
    let g = '<defs><clipPath id="' + clip + '"><rect x="' + L + '" y="' + (T - 4) + '" width="' + (pw + 4) + '" height="' + (ph + 4) + '"/></clipPath></defs>';
    for (let v = 0; v <= xMax * 100 + 1e-9; v += xs) {
      const x = X(v / 100).toFixed(1);
      g += '<path class="tt-grid" d="M' + x + ' ' + T + 'V' + (T + ph) + '"/><text class="tt-tick" x="' + x + '" y="' + (T + ph + 22) + '" text-anchor="middle">' + v.toFixed(xd) + '</text>';
    }
    for (let v = 0; v <= yMax + 1e-9; v += ys) {
      const y = Y(v).toFixed(1);
      g += '<path class="tt-grid" d="M' + L + ' ' + y + 'H' + (L + pw) + '"/><text class="tt-tick" x="' + (L - 8) + '" y="' + (Number(y) + 6) + '" text-anchor="end">' + Number(v.toFixed(2)) + '</text>';
    }
    g += '<path class="tt-axis" d="M' + L + ' ' + T + 'V' + (T + ph) + 'H' + (L + pw) + '" fill="none" stroke="currentColor"/>';
    g += '<text class="tt-label" x="' + (L + pw / 2) + '" y="' + (HH - 12) + '" text-anchor="middle">Engineering strain (%)</text>';
    g += '<text class="tt-label" transform="translate(22 ' + (T + ph / 2) + ') rotate(-90)" text-anchor="middle">Engineering stress (MPa)</text>';
    if (o.title) g += '<text class="tt-ptitle" x="' + L + '" y="28">' + esc(o.title) + '</text>';
    let body = '', outside = '';
    const path = (c, to) => {
      const end = Math.min(to, xMax * 1.05, c.fractureStrain), pts = [];
      const n = 260;
      for (let i = 0; i <= n; i++) pts.push(end * i / n);
      c.knots.forEach(k => { if (k.e < end) pts.push(k.e); });
      pts.sort((a, b) => a - b);
      return pts.map((e, i) => (i ? 'L' : 'M') + X(e).toFixed(2) + ' ' + Y(M.stress(c, e)).toFixed(2)).join('');
    };
    if (o.area && o.area.to > 0) {
      const d = path(o.area.c, o.area.to), end = Math.min(o.area.to, xMax * 1.05, o.area.c.fractureStrain);
      body += '<path class="tt-area" d="' + d + 'L' + X(end).toFixed(2) + ' ' + Y(0) + 'L' + X(0) + ' ' + Y(0) + 'Z"/>';
    }
    if (o.offset) {
      const c = o.offset.c, top = o.offset.y ? o.offset.y.stress * 1.18 : Math.min(yMax, M.peak(c).stress * 1.3);
      const e0 = M.OFFSET, e1 = e0 + top / c.E;
      body += '<path class="tt-offset" d="M' + X(e0).toFixed(2) + ' ' + Y(0) + 'L' + X(e1).toFixed(2) + ' ' + Y(top).toFixed(2) + '"/>';
      body += '<path class="tt-offset-base" d="M' + X(0) + ' ' + (Y(0) - 7) + 'H' + X(e0).toFixed(2) + '"/>';
    }
    (o.series || []).forEach(sr => {
      if (sr.to <= 0) return;
      body += '<path class="tt-curve ' + (sr.cls || '') + '" data-series="' + sr.c.id + '" d="' + path(sr.c, sr.to) + '" fill="none" stroke="currentColor"/>';
      if (sr.end) {
        const e = Math.min(sr.c.fractureStrain, xMax), x = X(e), y = Y(M.stress(sr.c, e));
        const lx = Math.min(x + 6, L + pw - 14), ly = Math.max(T + 14, y - 8);
        body += '<text class="tt-endlabel ' + (sr.cls || '') + '" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '">' + sr.c.letter + '</text>';
        if (sr.c.fractureStrain <= xMax) body += '<path class="tt-fracture ' + (sr.cls || '') + '" d="M' + (x - 6) + ' ' + (y - 6) + 'l12 12m0 -12l-12 12"/>';
      }
    });
    if (o.unload) {
      const u = o.unload;
      body += '<path class="tt-unload" data-tt-unload d="M' + X(u.e0).toFixed(2) + ' ' + Y(u.s0).toFixed(2) + 'L' + X(u.e1).toFixed(2) + ' ' + Y(u.s1 || 0).toFixed(2) + '"/>';
    }
    if (o.setMark !== undefined && o.setMark !== null) outside += '<path class="tt-set" data-tt-set d="M' + X(o.setMark).toFixed(2) + ' ' + Y(0) + 'l-8 -15h16z"/>';
    if (o.prediction !== undefined && o.prediction !== null && o.prediction <= xMax * 1.05)
      outside += '<path class="tt-pred" data-tt-pred d="M' + X(o.prediction).toFixed(2) + ' ' + (Y(0) + 1) + 'l-8 15h16z"/>';
    (o.marks || []).forEach(m => {
      const x = X(m.e), y = Y(m.s);
      if (m.e > xMax * 1.02) return;
      if (m.kind === 'yield') body += '<circle class="tt-mark-yield" data-tt-mark="yield" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6.5"/>';
      else if (m.kind === 'uts') body += '<path class="tt-mark-uts" data-tt-mark="uts" d="M' + x.toFixed(1) + ' ' + (y - 8).toFixed(1) + 'l8 8l-8 8l-8 -8z"/>';
      else if (m.kind === 'fracture') body += '<path class="tt-mark-fracture" data-tt-mark="fracture" d="M' + (x - 7) + ' ' + (y - 7) + 'l14 14m0 -14l-14 14"/>';
      if (m.label) {
        const lines = m.label.split('\n'), w = Math.max(...lines.map(s => s.length)) * 10.5, right = x + 11 + w <= L + pw || x - 11 - w < L;
        const ty = Math.max(T + 16, Math.min(T + ph - 8, y + (m.dy || -14)));
        outside += '<text class="tt-marklabel" x="' + (right ? x + 11 : x - 11).toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + lines.map((s, i) => '<tspan x="' + (right ? x + 11 : x - 11).toFixed(1) + '" dy="' + (i ? 21 : 0) + '">' + esc(s) + '</tspan>').join('') + '</text>';
      }
    });
    if (o.point) body += '<circle class="tt-point" data-tt-point cx="' + X(o.point.e).toFixed(1) + '" cy="' + Y(o.point.s).toFixed(1) + '" r="7"/>';
    if (o.annotations) body += o.annotations(X, Y);
    return '<svg class="tt-plot" viewBox="0 0 ' + W + ' ' + HH + '" role="img" aria-label="' + esc(o.aria) + '" data-xmax="' + xMax + '" data-ymax="' + yMax + '">' + g +
      '<g clip-path="url(#' + clip + ')">' + body + '</g>' + outside + '</svg>';
  }
  function axisMax(c) {
    const p = M.peak(c);
    const yStep = niceStep(p.stress * 1.15, 5);
    return { full: Math.ceil(c.fractureStrain * 1.08 * 1000) / 1000, zoom: c.zoom, y: Math.ceil(p.stress * 1.15 / yStep) * yStep };
  }
  // Main test view: the live curve so far, its area, landmarks reached, the unload line and the offset construction.
  function testPlots(state, extra) {
    const x = extra || {}, c = M.curveById(state.id), r = M.reading(state), ax = axisMax(c);
    const props = M.properties(c), y = M.offsetYield(c), p = M.peak(c);
    const marks = [];
    if (r.pastYield && y) marks.push({ kind: 'yield', e: y.strain, s: y.stress, label: '0.2% offset yield\n' + mpa(y.stress) + ' MPa', zoomOnly: true, dy: 28 });
    if (r.pastPeak) marks.push({ kind: 'uts', e: p.strain, s: p.stress, label: 'UTS ' + mpa(p.stress) + ' MPa' });
    if (state.fractured && props.necks) marks.push({ kind: 'fracture', e: c.fractureStrain, s: c.fractureStress, label: 'Fracture', dy: 22 });
    if (state.fractured && !props.necks) marks.push({ kind: 'fracture', e: c.fractureStrain, s: c.fractureStress, label: '', dy: 22 });
    const unloading = !state.fractured && state.e < state.eMax - 1e-12;
    const unload = x.unloadPreview || (unloading ? { e0: state.eMax, s0: r.envelopeStress, e1: r.strain, s1: r.stress } : null);
    const set = unloading && r.stress <= 0 ? r.permanentSet : (x.setMark !== undefined ? x.setMark : null);
    const point = state.fractured ? null : { e: r.strain, s: r.stress };
    const common = { series: [{ c, to: state.eMax, cls: 'tt-main' }], area: x.hideArea ? null : { c, to: state.eMax }, unload, point, setMark: set, prediction: x.prediction };
    const zoomMarks = marks.filter(m => m.e <= ax.zoom);
    // The offset line is drawn once yield is reached, or after fracture to show it never meets a brittle curve.
    const offsetShown = x.offset !== false && ((y && r.pastYield) || (!y && state.fractured));
    const slopeNote = (X, Y) => {
      // Label the slope on the offset line when it is drawn (it is parallel to the elastic line), clear of other labels.
      let e = Math.min(ax.zoom * 0.3, c.linear * 0.4), s = M.stress(c, e);
      if (offsetShown) { s = 0.25 * (y ? y.stress : p.stress); e = M.OFFSET + s / c.E; }
      let t = '<text class="tt-marklabel" x="' + (X(e) + 10).toFixed(1) + '" y="' + (Y(s) + 18).toFixed(1) + '">slope = E</text>';
      return t;
    };
    const full = plot(Object.assign({}, common, {
      prefix: (x.prefix || 'tt') + '-full', xMax: ax.full, yMax: ax.y, title: 'Whole test',
      marks: marks.filter(m => !m.zoomOnly || ax.zoom >= ax.full), offset: offsetShown && ax.zoom >= ax.full ? { c, y } : null,
      annotations: ax.zoom >= ax.full ? slopeNote : null,
      aria: 'Engineering stress against strain for specimen ' + c.letter + ' to ' + pct(state.eMax) + '% strain' + (state.fractured ? ', to fracture.' : '.')
    }));
    const zoom = ax.zoom >= ax.full ? '' : plot(Object.assign({}, common, {
      prefix: (x.prefix || 'tt') + '-zoom', xMax: ax.zoom, yMax: ax.y, title: 'Start of the test, magnified',
      marks: zoomMarks, offset: offsetShown ? { c, y } : null,
      annotations: slopeNote,
      aria: 'The first ' + pct(ax.zoom) + '% of strain for specimen ' + c.letter + ', showing the elastic slope' + (offsetShown ? ' and the 0.2% offset construction.' : '.')
    }));
    return { full, zoom };
  }

  // ---- the specimen ------------------------------------------------------------------------------
  const SW = 720, SH = 190, CY = 104, PX = 5; // 5 px per mm, drawn to scale
  function specimen(state, opts) {
    const o = opts || {}, sp = M.specimen(state), c = M.curveById(state.id);
    const endW = 80, fil = 28, R0 = M.GEOMETRY.diameter * PX / 2, Rend = 20 * PX / 2;
    const x0 = 46, g0 = x0 + endW + fil, gL = sp.length * PX, g1 = g0 + gL, xEnd = g1 + fil + endW;
    const R = sp.diameter * PX / 2, Rn = sp.neckDiameter * PX / 2, mid = (g0 + g1) / 2, halfNeck = sp.neckLength * PX / 2;
    function radius(x) {
      if (sp.neck <= 0) return R;
      const z = (x - mid) / halfNeck;
      if (sp.neckStyle === 'draw') { const a = Math.abs(z); const w = a <= 1 ? 1 : a >= 1.6 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (a - 1) / 0.6); return R - (R - Rn) * w; }
      return R - (R - Rn) * Math.exp(-z * z * 2.2);
    }
    function profile(xa, xb, sign) {
      const pts = [], n = 90;
      for (let i = 0; i <= n; i++) { const x = xa + (xb - xa) * i / n; pts.push([x, CY + sign * radius(x)]); }
      return pts;
    }
    const gap = sp.fractured ? 10 : 0;
    function half(side) {
      // side -1: left piece (or whole specimen when not fractured), +1: right piece
      const whole = !sp.fractured;
      const a = side < 0 ? g0 : mid + gap / 2, b = side < 0 ? (whole ? g1 : mid - gap / 2) : g1;
      let d = '';
      if (side < 0) d += 'M' + x0 + ' ' + (CY - Rend) + 'H' + (x0 + endW) + 'C' + (x0 + endW + fil * 0.6) + ' ' + (CY - Rend) + ' ' + (g0 - fil * 0.4) + ' ' + (CY - R) + ' ' + g0 + ' ' + (CY - R);
      else d += 'M' + a.toFixed(1) + ' ' + (CY - radius(a + gap / 2)).toFixed(1);
      const top = profile(side < 0 ? g0 : a, b, -1).map(p => 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      d += top;
      if (side > 0 || whole) d += 'C' + (g1 + fil * 0.4) + ' ' + (CY - R) + ' ' + (g1 + fil * 0.4) + ' ' + (CY - Rend) + ' ' + (g1 + fil) + ' ' + (CY - Rend) + 'H' + xEnd + 'V' + (CY + Rend) + 'H' + (g1 + fil) + 'C' + (g1 + fil * 0.4) + ' ' + (CY + Rend) + ' ' + (g1 + fil * 0.4) + ' ' + (CY + R) + ' ' + g1 + ' ' + (CY + R);
      else {
        // broken face of the left piece: a ductile cup/cone hint or a flat brittle face
        const rr = radius(b);
        d += sp.neckStyle === 'none' ? 'L' + (b + 1.5).toFixed(1) + ' ' + (CY - rr * 0.3).toFixed(1) + 'L' + (b - 1).toFixed(1) + ' ' + (CY + rr * 0.2).toFixed(1) + 'L' + b.toFixed(1) + ' ' + (CY + rr).toFixed(1)
          : 'L' + (b - 3).toFixed(1) + ' ' + (CY - rr * 0.55).toFixed(1) + 'L' + (b + 2).toFixed(1) + ' ' + CY + 'L' + (b - 3).toFixed(1) + ' ' + (CY + rr * 0.55).toFixed(1) + 'L' + b.toFixed(1) + ' ' + (CY + rr).toFixed(1);
      }
      const bottom = profile(side < 0 ? g0 : a, b, 1).reverse().map(p => 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      if (side > 0 && !whole) {
        d += bottom;
        const rr = radius(a);
        d += sp.neckStyle === 'none' ? 'L' + (a + 1.5).toFixed(1) + ' ' + (CY + rr * 0.2).toFixed(1) + 'L' + (a + 3.5).toFixed(1) + ' ' + (CY - rr * 0.3).toFixed(1)
          : 'L' + (a + 5).toFixed(1) + ' ' + (CY + rr * 0.55).toFixed(1) + 'L' + a.toFixed(1) + ' ' + CY + 'L' + (a + 5).toFixed(1) + ' ' + (CY - rr * 0.55).toFixed(1);
        return d + 'Z';
      }
      d += bottom;
      d += 'C' + (g0 - fil * 0.4) + ' ' + (CY + R) + ' ' + (x0 + endW + fil * 0.6) + ' ' + (CY + Rend) + ' ' + (x0 + endW) + ' ' + (CY + Rend) + 'H' + x0 + 'Z';
      return d;
    }
    let s = '';
    // frame: fixed grip (left) and moving crosshead (right)
    const gripH = Rend * 2 + 28;
    s += '<path class="tt-spec' + (sp.fractured ? ' tt-broken' : '') + '" d="' + half(-1) + '"/>';
    if (sp.fractured) s += '<path class="tt-spec tt-broken" d="' + half(1) + '"/>';
    if (sp.neck > 0) s += '<g data-tt-neck="1"><path class="tt-neckmark" d="M' + mid.toFixed(1) + ' ' + (CY + R + 10).toFixed(1) + 'v14"/><text class="tt-slabel" x="' + mid.toFixed(1) + '" y="' + (CY + R + 40).toFixed(1) + '" text-anchor="middle">' + (sp.neckStyle === 'draw' ? 'drawn neck (illustrative)' : 'neck (illustrative)') + '</text></g>';
    s += '<rect class="tt-grip" x="' + (x0 - 30) + '" y="' + (CY - gripH / 2) + '" width="' + (endW + 22) + '" height="' + gripH + '"/>';
    s += '<text class="tt-slabel" x="' + (x0 - 30) + '" y="' + (CY - gripH / 2 - 8) + '">Fixed grip</text>';
    const xh = xEnd - endW - 8;
    s += '<rect class="tt-grip tt-crosshead" data-tt-crosshead x="' + xh + '" y="' + (CY - gripH / 2) + '" width="' + (endW + 30) + '" height="' + gripH + '"/>';
    s += '<text class="tt-slabel" x="' + (xh + endW + 26) + '" y="' + (CY - gripH / 2 - 8) + '" text-anchor="end">Crosshead →</text>';
    // gauge length dimension
    const dy = CY - R0 - 2;
    if (!sp.neck && !sp.fractured) s += '<path class="tt-gauge" d="M' + g0 + ' ' + (dy - 12) + 'v10M' + g1.toFixed(1) + ' ' + (dy - 12) + 'v10"/>';
    return '<svg class="tt-specimen" viewBox="0 0 ' + SW + ' ' + SH + '" role="img" data-neck="' + (sp.neck > 0 ? 1 : 0) + '" data-fractured="' + (sp.fractured ? 1 : 0) + '" aria-label="' +
      esc('Specimen ' + c.letter + (sp.fractured ? ', fractured' : sp.neck > 0 ? ', necking' : '') + ': gauge length ' + n1(sp.length) + ' mm. Drawn to scale; neck shape illustrative.') + '">' + s + '</svg>';
  }

  function specimenCaption(state) {
    const sp = M.specimen(state);
    return (sp.fractured ? 'Broken pieces fitted back together: gauge length ' : 'Gauge length ') + n1(sp.length) + ' mm (original L₀ = 50.0 mm). Drawn to scale' + (sp.neck > 0 ? '; neck shape illustrative.' : '.');
  }
  // ---- live text: follows the actual curve segment (model phase), shared by the lab and the tests ----
  const STAGE_TEXT = { elastic: 'Elastic', plateau: 'Yield plateau', 'leaving-linear': 'Leaving the straight line', hardening: 'Plastic, hardening',
    'near-peak': 'Near the peak', nonlinear: 'Nonlinear', 'toward-peak': 'Toward the peak', necking: 'After the peak (neck)', fractured: 'Fractured',
    unloaded: 'Unloading / reloading (elastic)', slack: 'Zero load (slack)' };
  function stageText(state) {
    const ph = M.phase(state);
    return ph === 'necking' && M.curveById(state.id).neck === 'draw' ? 'Neck drawing' : STAGE_TEXT[ph];
  }
  function statusText(state) {
    const c = M.curveById(state.id), r = M.reading(state);
    switch (M.phase(state)) {
      case 'elastic': return state.eMax === 0 ? 'Ready. Stress is zero until the crosshead moves.' : 'Elastic: stress rises in proportion to strain (slope E). Unload now and the specimen returns to its original length.';
      case 'plateau': return 'Yield plateau: the stress stays level at about ' + mpa(r.stress) + ' MPa while the specimen keeps stretching. This stretch is permanent; the curve has not started to rise again yet.';
      case 'leaving-linear': return 'The curve is leaving the straight line. The 0.2% offset rule marks where yield is taken.';
      case 'hardening': return 'Plastic: permanent stretching continues, and the curve rises because the material strain-hardens.';
      case 'near-peak': return 'Near the peak: the curve is flattening as strain hardening runs out. A neck forms once the peak is passed.';
      case 'nonlinear': return 'Past the straight part, the curve bends slightly. Keep pulling and watch for fracture.';
      case 'toward-peak': return 'The curve bends over toward a stress peak. Part of this stretch is now permanent.';
      case 'necking': return c.neck === 'draw' ? 'After the peak the stress dropped as a neck formed; the neck now draws along the specimen (illustrative).' : 'Past the peak: a neck has formed, so force and engineering stress fall while stretching concentrates there (illustrative neck).';
      case 'fractured': return 'Fractured. The load drops to zero and each piece springs back by σ/E. Elongation after fracture ≈ ' + pct(r.permanentSet, 2) + '%.' + (c.neck === 'none' ? ' No neck formed: this curve peaks at fracture. The dashed 0.2% offset line never meets the curve, so there is no offset yield strength (undefined, not zero).' : '');
      case 'unloaded': return 'On the elastic unload/reload line (slope E). Reloading follows the same line back to the curve.';
      case 'slack': return 'Zero load: the specimen is slack with ' + pct(r.permanentSet, 3) + '% permanent set. This model does not push it into compression.';
    }
    return '';
  }
  // Compact paired view for the prediction panel: the specimen and the unloading line framed together,
  // so the check stays beside the answer box. The window is the magnified start when it holds the test.
  function unloadView(state, opts) {
    const o = opts || {}, c = M.curveById(state.id), r = M.reading(state), ax = axisMax(c);
    const xMax = state.eMax <= ax.zoom * 0.97 ? ax.zoom : ax.full;
    const unloading = state.e < state.eMax - 1e-12;
    const svg = plot({
      prefix: (o.prefix || 'tt') + '-uv', xMax, yMax: ax.y, H: 300, title: xMax === ax.zoom && ax.zoom < ax.full ? 'Unloading (start of test, magnified)' : 'Unloading',
      series: [{ c, to: state.eMax, cls: 'tt-main' }],
      unload: unloading ? { e0: state.eMax, s0: r.envelopeStress, e1: r.strain, s1: r.stress } : null,
      point: { e: r.strain, s: r.stress }, setMark: unloading && r.stress <= 0 ? r.permanentSet : null, prediction: o.prediction,
      aria: 'Unloading check for specimen ' + c.letter + ': strain ' + pct(r.strain, 3) + '%, stress ' + mpa(r.stress) + ' MPa.'
    });
    return '<div class="tt-uv-spec">' + specimen(state) + '</div><p class="tt-uv-read" data-tt-uv-read>L = ' + (M.specimen(state).length).toFixed(3) + ' mm · σ = ' + mpa(r.stress) + ' MPa · ε = ' + pct(r.strain, 3) + '%</p>' + svg;
  }
  // ---- comparison ----------------------------------------------------------------------------------
  function comparePlot(ids, zoom, prefix) {
    const cs = ids.map(M.curveById);
    const xMax = zoom ? 0.01 : 0.6, yMax = 450;
    return plot({
      prefix: prefix || 'tt-cmp', xMax, yMax, title: zoom ? 'First 1% of strain' : 'Complete synthetic curves',
      series: cs.map(c => ({ c, to: c.fractureStrain, cls: 'tt-s-' + c.letter.toLowerCase(), end: true })),
      aria: 'Engineering stress-strain curves of synthetic specimens ' + cs.map(c => c.letter).join(', ') + (zoom ? ', first 1% of strain.' : ', to fracture.')
    });
  }
  function legend(ids) {
    return '<ul class="tt-legend">' + ids.map(id => { const c = M.curveById(id); return '<li><svg viewBox="0 0 40 12" aria-hidden="true"><path class="tt-curve tt-s-' + c.letter.toLowerCase() + '" d="M2 6H38" stroke="currentColor"/></svg> <strong>' + c.letter + '</strong> ' + esc(c.label) + '</li>'; }).join('') + '</ul>';
  }
  function propertyTable() {
    const rows = M.CURVES.map(c => {
      const p = M.properties(c);
      return '<tr><th scope="row">' + c.letter + ': ' + esc(c.label) + '</th><td>' + gpa(p.E) + '</td><td>' + (p.yield === null ? 'none: fractures first' : mpa(p.yield)) + '</td><td>' + mpa(p.uts) + '</td><td>' + pct(p.elongation, 1) + '</td><td>' + p.toughness.toFixed(p.toughness < 1 ? 2 : 0) + '</td></tr>';
    }).join('');
    return '<div class="tt-tablewrap" tabindex="0" role="region" aria-label="Synthetic specimen properties"><table class="tt-table"><caption>Read from the four synthetic curves (illustrative; not material data)</caption><thead><tr><th scope="col">Specimen</th><th scope="col">Stiffness E (GPa)</th><th scope="col">0.2% offset yield (MPa)</th><th scope="col">UTS (MPa)</th><th scope="col">Elongation after fracture (%)</th><th scope="col">Area to fracture (MJ/m³)</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  const PROPERTY_TEXT = {
    stiffness: { name: 'Stiffness', unit: 'GPa', fmt: v => gpa(v), raw: v => v / 1000, q: 'steepest elastic slope (highest E)' },
    strength: { name: 'Ultimate tensile strength', unit: 'MPa', fmt: mpa, raw: v => v, q: 'highest ultimate tensile strength' },
    ductility: { name: 'Ductility', unit: '% elongation', fmt: v => pct(v, 1), raw: v => v * 100, q: 'most elongation after fracture' },
    toughness: { name: 'Area under the curve', unit: 'MJ/m³', fmt: v => v.toFixed(v < 1 ? 2 : 0), raw: v => v, q: 'largest area under the curve to fracture' }
  };
  function rankingBars(key) {
    const t = PROPERTY_TEXT[key], list = M.ranking(key), max = list[0].value;
    return '<figure class="tt-rank"><figcaption>' + esc(t.name) + ' (' + esc(t.unit) + ')</figcaption><ol>' + list.map(r => {
      const c = M.curveById(r.id), w = Math.max(0.6, r.value / max * 100);
      return '<li><span class="tt-rank-name">' + c.letter + '</span><span class="tt-bar"><span class="tt-bar-fill tt-s-' + c.letter.toLowerCase() + '" style="width:' + w.toFixed(1) + '%"></span></span><span class="tt-rank-val">' + t.fmt(r.value) + '</span></li>';
    }).join('') + '</ol></figure>';
  }

  // ---- static lesson (no-JS, search and print) ---------------------------------------------------------
  function staticLesson() {
    const c = M.curveById('ductile'), p = M.properties(c);
    const done = { id: 'ductile', eMax: c.fractureStrain, e: c.fractureStrain, fractured: true };
    const at10 = M.stress(c, 0.10), set10 = M.residualStrain(0.10, at10, c.E);
    const plots = testPlots(done, { prefix: 'tt-static', unloadPreview: { e0: 0.10, s0: at10, e1: set10, s1: 0 }, setMark: set10 });
    const shots = [
      { id: 'ductile', eMax: 0, e: 0, fractured: false, cap: 'Before loading' },
      { id: 'ductile', eMax: p.utsStrain, e: p.utsStrain, fractured: false, cap: 'At the peak (UTS): stretched uniformly, no neck yet' },
      { id: 'ductile', eMax: 0.27, e: 0.27, fractured: false, cap: 'After the peak: deformation concentrates in a neck' },
      done
    ];
    shots[3] = Object.assign({}, done, { cap: 'Fractured; pieces fitted together' });
    return '<div class="tt-static">' +
      '<p><strong>Tensile test: one curve, four different properties.</strong> This fallback shows the same synthetic curves and calculations as the live lab.</p>' +
      '<p>A round specimen with a chosen gauge length <em>L</em><sub>0</sub> = 50 mm and diameter 12.5 mm (original area <em>A</em><sub>0</sub> = ' + M.AREA.toFixed(1) + ' mm²) is pulled by a moving crosshead. Engineering stress σ = <em>F</em>/<em>A</em><sub>0</sub> (N/mm² = MPa). Engineering strain ε = Δ<em>L</em>/<em>L</em><sub>0</sub> (mm/mm, shown here in %). Both use the <em>original</em> dimensions, so engineering stress falls after the neck forms even though the force is concentrated on a shrinking section.</p>' +
      '<figure class="tt-figure"><figcaption>Synthetic specimen A (ductile, low-carbon-steel-like; illustrative, not a grade). Shaded: area under the curve to fracture. Dashed red line: unloading from 10% strain.</figcaption><div class="tt-plots">' + plots.full + plots.zoom + '</div></figure>' +
      '<ul class="tt-readlist">' +
      '<li><strong>Stiffness:</strong> the elastic slope, Young’s modulus <em>E</em> = σ/ε = 200 MPa ÷ 0.001 = 200 000 MPa = 200 GPa.</li>' +
      '<li><strong>Yield strength (0.2% offset):</strong> draw a line with slope <em>E</em> starting at 0.2% strain; where it meets the curve, σ<sub>y</sub> ≈ ' + mpa(p.yield) + ' MPa (at ' + pct(p.yieldStrain, 3) + '% strain). Specimen A then stretches along a level yield plateau (stress constant at 250 MPa up to 1.5% strain) before strain hardening makes the curve rise again.</li>' +
      '<li><strong>Ultimate tensile strength (UTS):</strong> the highest engineering stress, ' + mpa(p.uts) + ' MPa at ' + pct(p.utsStrain, 0) + '% strain. A neck begins to form after this peak.</li>' +
      '<li><strong>Ductility:</strong> elongation after fracture ≈ ε<sub>f</sub> − σ<sub>f</sub>/<em>E</em> = 30% − 0.16% = ' + pct(p.elongation, 2) + '%.</li>' +
      '<li><strong>Toughness (tensile):</strong> the area under the curve to fracture, ∫σ dε ≈ ' + p.toughness.toFixed(0) + ' MJ/m³ (1 MPa × 1 = 1 MJ/m³ = 1 J/cm³) of work per original volume. For this gauge volume that is about ' + (p.toughness * M.AREA * M.GEOMETRY.gaugeLength / 1000).toFixed(0) + ' J. This is not fracture toughness <em>K</em><sub>IC</sub>, which is measured on a cracked specimen.</li>' +
      '</ul>' +
      '<p><strong>Worked example: unloading leaves permanent set.</strong> Stop at ε = 10.0%, where σ = ' + mpa(at10) + ' MPa. Removing the load follows a straight line parallel to the elastic slope, so the elastic part σ/<em>E</em> = ' + mpa(at10) + '/200 000 = ' + pct(at10 / c.E, 3) + '% springs back. Permanent set = 10.0% − ' + pct(at10 / c.E, 3) + '% = <strong>' + pct(set10, 3) + '%</strong>, or ' + (set10 * M.GEOMETRY.gaugeLength).toFixed(2) + ' mm on the 50 mm gauge length. Below the yield point the same rule gives zero set: at 0.1% strain and 200 MPa, 0.1% − 200/200 000 = 0.</p>' +
      '<figure class="tt-figure"><figcaption>The same specimen at four moments. Length to scale; the neck shape is illustrative only.</figcaption><div class="tt-shots">' +
      shots.map(st => '<div class="tt-shot"><p class="tt-shotcap"><strong>' + esc(st.cap) + '.</strong> ' + esc(specimenCaption(st)) + '</p>' + specimen(st) + '</div>').join('') + '</div></figure>' +
      '<p><strong>Compare the four synthetic specimens.</strong> Each ranks differently on each property: the stiffest is not always the strongest, and the most ductile is not the toughest.</p>' +
      '<figure class="tt-figure"><figcaption>All four synthetic curves on one set of axes; the right panel magnifies the first 1% of strain, where the elastic slopes differ.</figcaption><div class="tt-plots">' + comparePlot(['ductile', 'alloy', 'brittle', 'polymer'], false, 'tt-static-cmp') + comparePlot(['ductile', 'alloy', 'brittle', 'polymer'], true, 'tt-static-cmpz') + '</div>' + legend(['ductile', 'alloy', 'brittle', 'polymer']) + '</figure>' +
      propertyTable() +
      '<p>Specimen C fractures before the 0.2% offset line reaches its curve, so it has <strong>no offset yield strength in this test</strong>: the value is undefined, not zero. Specimen D (polymer-like) reaches its peak stress early and then draws a neck along the specimen; its offset value is shown only for comparison.</p>' +
      limits() + '</div>';
  }
  function limits() {
    return '<details class="tt-limits"><summary>Model, assumptions and sources</summary>' +
      '<p>The four curves are <strong>synthetic</strong>: piecewise cubic curves through chosen points, shaped to resemble common behaviour. They are not measurements, grades, certification values or design allowables. Real results depend on composition, processing, specimen geometry, test speed and temperature, none of which are modelled.</p>' +
      '<p>Unloading and reloading follow a straight line with the initial elastic slope <em>E</em> (an ideal elastic approximation, no hysteresis). The load never goes below zero: once the unload line reaches zero load the specimen is slack. Permanent set = ε − σ/<em>E</em>, never negative. Elongation after fracture uses the same rule at the fracture point.</p>' +
      '<p>The specimen length is drawn to scale. Its thinning before the peak keeps volume constant; the neck and the fracture are drawn only to show where deformation concentrates, not calculated from a necking or fracture law. True stress, strain rate, temperature and hardness are outside this lab.</p>' +
      '<p>The area under the curve is work per original volume in this tension test (MPa = MJ/m³). Impact and fracture-toughness tests measure related but different behaviour.</p>' +
      '<p>Sources: ASTM E8/E8M, <em>Standard Test Methods for Tension Testing of Metallic Materials</em> (the test method and its definitions; consult the current edition). W. D. Callister Jr. and D. G. Rethwisch, <em>Materials Science and Engineering: An Introduction</em>, chapter “Mechanical Properties of Metals” (engineering stress and strain, modulus, 0.2% offset yield, tensile strength and necking, ductility, toughness as area under the curve, elastic recovery on unloading).</p></details>';
  }
  const PLOT = Object.freeze({ W, L, R });
  return { PLOT, stageText, statusText, unloadView, plot, testPlots, specimen, specimenCaption, comparePlot, legend, propertyTable, rankingBars, PROPERTY_TEXT, staticLesson, limits, pct, mpa, gpa, axisMax, esc };
});

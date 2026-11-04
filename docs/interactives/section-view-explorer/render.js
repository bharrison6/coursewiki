(function (root) {
  'use strict';
  // One SVG renderer for the live explorer and the static lesson figures. No element IDs,
  // so any number of copies can share a page or a printable aggregate.
  const M = typeof module === 'object' && module.exports ? require('./model.js') : root.CourseWikiSectionExplorer;
  const K = 4;                       // sheet units per millimetre
  const f1 = v => (Math.round(v * 10) / 10).toString();
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const HATCH = 7;                   // perpendicular hatch spacing, sheet units

  function hatch(rects, scale = 1) {
    const p = HATCH * scale * Math.SQRT2;
    let d = '';
    for (const [X0, Y0, X1, Y1] of rects) {
      for (let c = Math.ceil((X0 + Y0) / p) * p; c < X1 + Y1; c += p) {
        const xa = Math.max(X0, c - Y1), xb = Math.min(X1, c - Y0);
        if (xb - xa > .3) d += 'M' + f1(xa) + ' ' + f1(c - xa) + 'L' + f1(xb) + ' ' + f1(c - xb);
      }
    }
    return d;
  }
  // Merge horizontally touching cells in one band so hatch lines run unbroken.
  function runs(cells) {
    const out = [];
    for (const c of cells.slice().sort((a, b) => a.z0 - b.z0 || a.ua - b.ua)) {
      const last = out[out.length - 1];
      if (last && last.z0 === c.z0 && Math.abs(last.ub - c.ua) < 1e-6) last.ub = c.ub; else out.push({ ua: c.ua, ub: c.ub, z0: c.z0, z1: c.z1 });
    }
    return out;
  }

  function sheet(result, opts = {}) {
    const part = result.part, cut = result.cut, view = result.view, top = M.topView(part.id), e = top.ext;
    const xLo = e.x0 - 18, xHi = e.x1 + 18, W = (xHi - xLo) * K;
    const yTop = e.y1 + 15, topH = (yTop - (e.y0 - 15)) * K, head = 30;
    const secTop = head + topH + 40, zTop = e.z1 + 7, secH = (zTop - (e.z0 - 7)) * K;
    const g = Math.max(1, W / 400), gs = v => f1(v * g), H = secTop + secH + 80 * g;
    const TX = x => (x - xLo) * K, TY = y => head + (yTop - y) * K;
    const uLo = view.dir > 0 ? xLo : -xHi;
    const SX = u => (u - uLo) * K, SY = z => secTop + (zTop - z) * K;
    const predict = opts.predict || null, revealed = predict && predict.revealed;
    const showHatch = f => !predict || revealed || f.tiny ? f.type === 'cut' : predict.selected.has(f.n);
    let body = '';

    // Parent view: the uncut part seen from above, with the cutting-plane line.
    body += '<text class="sve-label" x="8" y="21" font-size="' + gs(17) + '">Top view: cutting plane A–A</text>';
    let d = '';
    for (const pl of top.polylines) d += pl.map((p, i) => (i ? 'L' : 'M') + f1(TX(p[0])) + ' ' + f1(TY(p[1]))).join('');
    body += '<path class="sve-edge" d="' + d + '" fill="none" stroke="#1f1e1c" stroke-width="' + gs(2.2) + '" stroke-linejoin="round"/>';
    let c = '';
    for (const m of part.marks) {
      const L = (m.r + 4) * K;
      c += 'M' + f1(TX(m.x) - L) + ' ' + f1(TY(m.y)) + 'h' + f1(2 * L) + 'M' + f1(TX(m.x)) + ' ' + f1(TY(m.y) - L) + 'v' + f1(2 * L);
    }
    if (part.slotLine) c += 'M' + f1(TX(part.slotLine[0][0])) + ' ' + f1(TY(part.slotLine[0][1])) + 'L' + f1(TX(part.slotLine[1][0])) + ' ' + f1(TY(part.slotLine[1][1]));
    body += '<path class="sve-center" d="' + c + '" fill="none" stroke="#565350" stroke-width="' + gs(1.1) + '" stroke-dasharray="14 4 3 4"/>';
    const cp = result.plane;
    body += '<path class="sve-cutline" d="' + cp.path.map((p, i) => (i ? 'L' : 'M') + f1(TX(p[0])) + ' ' + f1(TY(p[1]))).join('') + '" fill="none" stroke="#135b88" stroke-width="' + gs(3) + '" stroke-dasharray="18 5 4 5"/>';
    for (const a of cp.arrows) {
      const x = TX(a.at[0]), y = TY(a.at[1]), dy = -a.dir[1], L = 34 * g;
      body += '<path class="sve-cutline-solid" d="M' + f1(x) + ' ' + f1(y) + 'v' + f1(dy * (L - 10 * g)) + '" stroke="#135b88" stroke-width="' + gs(3) + '" fill="none"/>';
      body += '<path class="sve-arrowhead" d="M' + f1(x) + ' ' + f1(y + dy * L) + 'l' + gs(-6) + ' ' + f1(-dy * 13 * g) + 'h' + gs(12) + 'z" fill="#135b88"/>';
    }
    cp.letters.forEach((p, i) => {
      const leg = cut.mode === 'half' && i === 1;
      const x = TX(p[0]) + (leg ? 18 : p[0] < 0 ? -16 : 16) * g, y = TY(p[1]) + (leg ? (cut.flip ? 16 : -4) : -12) * g;
      body += '<text class="sve-letter" x="' + f1(x) + '" y="' + f1(y) + '" font-size="' + gs(21) + '" font-weight="700" text-anchor="middle">A</text>';
    });

    // The section view.
    const faces = view.faces;
    for (const f of faces) {
      const rd = runs(f.cells).map(r => 'M' + f1(SX(r.ua)) + ' ' + f1(SY(r.z1)) + 'H' + f1(SX(r.ub)) + 'V' + f1(SY(r.z0)) + 'H' + f1(SX(r.ua)) + 'Z').join('');
      const on = showHatch(f), interactive = opts.interactive && !(predict && f.tiny);
      let cls = 'sve-face' + (on ? ' is-hatched' : '') + (opts.focus === f.n ? ' is-focus' : '');
      if (revealed && !f.tiny) cls += predict.selected.has(f.n) === (f.type === 'cut') ? ' is-right' : ' is-wrong';
      const label = predict && !revealed ? 'Region ' + f.n + (on ? ', marked as cut (hatched)' : ', not marked') : 'Region ' + f.n + ': ' + f.describe;
      body += '<path class="' + cls + '" d="' + rd + '" fill="' + (on ? '#fdf7e7' : 'transparent') + '" data-face="' + f.n + '"' +
        (interactive ? ' tabindex="0" role="button"' + (predict && !revealed ? ' aria-pressed="' + on + '"' : '') + ' aria-label="' + esc(label) + '"' : '') + '/>';
      if (on) body += '<path class="sve-hatch" d="' + hatch(runs(f.cells).map(r => [SX(r.ua), SY(r.z1), SX(r.ub), SY(r.z0)]), g) + '" stroke="#565350" stroke-width="' + gs(1.1) + '" fill="none" pointer-events="none"/>';
    }
    body += '<path class="sve-edge" d="' + view.lines.map(l => 'M' + f1(SX(l[0])) + ' ' + f1(SY(l[1])) + 'L' + f1(SX(l[2])) + ' ' + f1(SY(l[3]))).join('') + '" fill="none" stroke="#1f1e1c" stroke-width="' + gs(2.2) + '" stroke-linecap="square" pointer-events="none"/>';
    body += '<path class="sve-center" d="' + view.axes.map(u => 'M' + f1(SX(u)) + ' ' + f1(SY(e.z1 + 5)) + 'V' + f1(SY(e.z0 - 5))).join('') + '" fill="none" stroke="#565350" stroke-width="' + gs(1.1) + '" stroke-dasharray="14 4 3 4" pointer-events="none"/>';
    if (predict) for (const f of faces) {
      if (f.tiny) continue;
      const x = SX(f.label.u), y = SY(f.label.z), right = predict.selected.has(f.n) === (f.type === 'cut');
      const mark = revealed ? (right ? ' ✓' : ' ✗') : '';
      const w = (revealed ? 44 : 28) * g, h = 28 * g;
      body += '<g class="sve-badge' + (revealed ? (right ? ' is-right' : ' is-wrong') : '') + '" pointer-events="none"><rect x="' + f1(x - w / 2) + '" y="' + f1(y - h / 2) + '" width="' + f1(w) + '" height="' + f1(h) + '" rx="' + f1(h / 2) + '" fill="#fbfaf8" stroke="#1f1e1c" stroke-width="1.5"/>' +
        '<text x="' + f1(x) + '" y="' + f1(y + 6 * g) + '" font-size="' + gs(18) + '" font-weight="700" text-anchor="middle">' + f.n + mark + '</text></g>';
    }
    const kind = { full: 'Full section', half: 'Half section', offset: 'Offset section' }[cut.mode];
    body += '<text class="sve-title" x="' + f1(W / 2) + '" y="' + f1(secTop + secH + 24 * g) + '" font-size="' + gs(20) + '" font-weight="700" text-anchor="middle">SECTION A–A</text>';
    const notes = predict && !revealed ? ['Predict: mark the regions the plane cuts.'] : [kind + ', seen in the arrow direction.'];
    if (view.dir < 0) notes.push('Seen from the back: left and right are reversed.');
    notes.forEach((t, i) => { body += '<text class="sve-label" x="' + f1(W / 2) + '" y="' + f1(secTop + secH + (48 + 20 * i) * g) + '" font-size="' + gs(15) + '" text-anchor="middle">' + esc(t) + '</text>'; });
    const aria = opts.interactive ? 'role="group" aria-label="' + esc(part.name + ': top view with cutting plane A–A and SECTION A–A. ' + (predict && !revealed ? 'Select each region you think is cut.' : 'Select a region to hear what it is.')) + '"'
      : 'role="img" aria-label="' + esc(describe(result)) + '"';
    return '<svg class="sve-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f1(W) + ' ' + f1(H) + '" ' + aria + ' font-family="Archivo, Helvetica Neue, Arial, sans-serif">' + body + '</svg>';
  }

  // A plain-language account of the same view, used for alt text and the static lesson.
  function describe(result) {
    const v = result.view, cuts = v.faces.filter(f => f.type === 'cut'), rest = v.faces.filter(f => f.type !== 'cut');
    const where = result.cut.mode === 'offset' ? 'a stepped plane at y = ' + result.cut.a + ' and ' + result.cut.b + ' mm' : result.cut.mode === 'half' ? 'two perpendicular planes on the center lines' : 'a plane at y = ' + result.cut.s + ' mm';
    return result.part.name + ' cut by ' + where + '. SECTION A–A has ' + cuts.length + ' hatched region' + (cuts.length === 1 ? '' : 's') +
      ' totalling ' + Math.round(v.capArea) + ' mm² and ' + rest.length + ' unhatched region' + (rest.length === 1 ? '' : 's') + ' inside the outline.';
  }

  const api = { sheet, describe, hatch, K };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiSectionExplorerRender = api;
})(typeof globalThis === 'object' ? globalThis : this);

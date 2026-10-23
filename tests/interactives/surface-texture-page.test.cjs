'use strict';
/* Focused tests for the surface texture lab's pictures, page, manifest and
   stylesheet: interactives/surface-texture/render.js and
   collections/machining/pages/surface-texture.html.
   Run: node --test --test-concurrency=2 tests/interactives/surface-texture-page.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'surface-texture');
const PAGE = path.join(ROOT, 'collections', 'machining', 'pages', 'surface-texture.html');
const S = require(path.join(MOD, 'surface.js'));
const P = require(path.join(MOD, 'profile.js'));
const N = require(path.join(MOD, 'notation.js'));
const R = require(path.join(MOD, 'render.js'));
const Q = require(path.join(MOD, 'quiz.js'));
const D = require(path.join(MOD, 'demo.js'));
const page = () => fs.readFileSync(PAGE, 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

test('equal-Ra guidance follows match success and the geometry actually traced', () => {
  const start = R.equalSpec('rounded'), before = P.measure(start, 'x', 0.8);
  const state = { spec: start, dir: 'x', lc: 0.8, match: true, matchResult: null, before };
  const change = (key, value) => {
    const target = P.measure(state.spec, state.dir, state.lc).Ra;
    state.spec = S.make({ ...state.spec, [key]: value });
    state.matchResult = P.solveHeightForRa(state.spec, state.dir, state.lc, target);
    state.spec.height = state.matchResult.height;
    return D.equalMission(state, P.measure(state.spec, state.dir, state.lc));
  };
  // Control: the intended comparison still explains the visible flat tops.
  assert.match(change('shape', 'plateau'), /cut by deep narrow grooves/);
  state.spec = start; state.matchResult = null;
  const failed = change('lay', 'radial');
  assert.equal(state.matchResult.achievable, false);
  assert.match(failed, /Cannot hold the requested Ra 1.6 µm/);
  assert.match(failed, /not an equal-Ra comparison/);
  assert.match(failed, /trace follows the marks/);
  assert.match(failed, /Restore comparison/);
  assert.doesNotMatch(failed, /so Ra stays the same|data-st-act="shape-/);
  // This second match is attainable, but its radial trace still does not
  // cross the grooves: success alone must not restore the shape narrative.
  const radialPlateau = change('shape', 'plateau');
  assert.equal(state.matchResult.achievable, true);
  assert.match(radialPlateau, /trace follows the marks/);
  assert.doesNotMatch(radialPlateau, /cut by deep narrow grooves|narrow peaks standing up/);
  state.spec = R.equalSpec('plateau'); state.dir = 'y'; state.matchResult = null;
  assert.match(D.equalMission(state, P.measure(state.spec, 'y', 0.8)), /trace follows the marks/);
  state.dir = 'x'; state.match = false;
  assert.match(D.equalMission(state, P.measure(state.spec, 'x', 0.8)), /original Ra is not being held/);
});

/* Absolute points of render.js's compact path data (M, then relative l steps). */
function points(d) {
  const out = [];
  for (const sub of d.split('M').filter(Boolean)) {
    const [head, rel] = sub.split('l');
    const h = head.match(/-?(?:\d+\.?\d*|\.\d+)/g).map(Number);
    let x = h[0], y = h[1];
    out.push([x, y]);
    const n = (rel || '').match(/-?(?:\d+\.?\d*|\.\d+)/g) || [];
    for (let i = 0; i + 1 < n.length; i += 2) { x = Math.round((x + Number(n[i])) * 10) / 10; y = Math.round((y + Number(n[i + 1])) * 10) / 10; out.push([x, y]); }
  }
  return out;
}

/* Points of an absolute M / L / H / V path, as the symbols are drawn. */
function absPoints(d) {
  const out = [];
  let x = 0, y = 0;
  for (const m of d.matchAll(/([MLHV])([^MLHV]*)/g)) {
    const n = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
    if (m[1] === 'H') x = n[0]; else if (m[1] === 'V') y = n[0]; else { x = n[0]; y = n[1]; }
    out.push([x, y]);
  }
  return out;
}

test('the page follows the module contract', () => {
  const p = page();
  assert.match(p, /^@@ID: surface-texture$/m);
  assert.match(p, /^@@TITLE: Surface Texture and Finish$/m);
  assert.match(p, /^@@SECTION: Measurement and Fit$/m);
  assert.match(p, /^@@STATUS: ready$/m);
  assert.equal((p.match(/data-interactive="surface-texture"/g) || []).length, 3);
  assert.match(p, /data-interactive="surface-texture" data-st-view="notation"/);
  assert.match(p, /data-interactive="surface-texture" data-st-view="challenge"/);
  let depth = 0;
  for (const tag of p.match(/<\/?section\b/g)) { depth += tag === '<section' ? 1 : -1; assert.ok(depth >= 0 && depth <= 1, 'no nested sections'); }
  assert.equal(depth, 0);
  assert.ok(!/<script\b/.test(p), 'assets load through the manifest, not the page');
  assert.match(p, /<noscript>/);
  for (const id of ['tolerances-and-fits', 'lathe-operations', 'milling-operations', 'feeds-and-speeds']) assert.ok(p.includes('[[' + id + ']]'), 'links ' + id);
  for (const s of Object.values(N.SOURCES)) assert.ok(p.includes(esc(s.url)), 'cites ' + s.url);
  const track = fs.readFileSync(path.join(ROOT, 'tracks', 'machining-fundamentals.track'), 'utf8');
  assert.match(track, /> Measurement and Fit\ntolerances-and-fits\nsurface-texture\n/);
});

test('the printed figures in the page are the renderer\'s output', () => {
  const p = page();
  for (const name of R.staticNames()) assert.ok(p.includes(R.staticFigure(name).svg), name + ' figure is current');
  assert.deepEqual(S.SHAPE_ORDER.map(shape => R.staticFigure('equal-' + shape).parts.rough.lim), [20, 20, 20], 'equal-Ra comparison uses one vertical scale');
  const ids = [...p.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'every SVG id on the page is unique');
  for (const m of p.matchAll(/(?:url\(#|href="#)([^)"]+)/g)) assert.ok(ids.includes(m[1]), 'reference resolves: ' + m[1]);
  for (const m of p.matchAll(/aria-labelledby="([^"]+)"/g)) for (const r of m[1].split(' ')) assert.ok(ids.includes(r), 'label resolves: ' + r);
  assert.ok(!/NaN|undefined|Infinity/.test(p));
});

test('the page\'s numbers are the model\'s numbers', () => {
  const p = page(), f = N.fmtUm;
  const surf = R.staticFigure('surface');
  assert.ok(p.includes('Heights drawn ' + surf.exaggeration + ' times larger than widths.'), 'surface caption states the drawn exaggeration');
  const d = P.measure(S.make(), 'x', 0.8);
  assert.ok(p.includes('Rz&nbsp;=&nbsp;(' + d.sections.map((s) => f(s.height)).join('&nbsp;+&nbsp;') + ')&nbsp;&divide;&nbsp;5&nbsp;=&nbsp;' + f(d.Rz)), 'worked Rz');
  const rows = [
    ['Trace left to right, across', d], ['Trace front to back, along', P.measure(S.make(), 'y', 0.8)],
    ['12&nbsp;&micro;m waviness, &lambda;c&nbsp;0.8&nbsp;mm', P.measure(S.make({ wave: 12 }), 'x', 0.8)],
    ['Same surface, &lambda;c&nbsp;2.5&nbsp;mm', P.measure(S.make({ wave: 12 }), 'x', 2.5)],
    ['Scratch three times the mark height', P.measure(S.make({ scratch: true }), 'x', 0.8)]
  ];
  for (const [label, a] of rows) assert.ok(p.includes('<td>' + label + '</td><td>' + f(a.Ra) + '</td><td>' + f(a.Rz) + '</td><td>' + f(a.Rt) + '</td>'), label);
  for (const shape of S.SHAPE_ORDER) {
    const a = P.measure(R.equalSpec(shape), 'x', 0.8);
    assert.ok(p.includes('Rz&nbsp;' + f(a.Rz) + ',\n      Rt&nbsp;' + f(a.Rt)), shape + ' caption');
  }
  for (const g of N.N_GRADES) assert.ok(p.includes('<tr><th scope="row">' + g.grade + '</th><td>' + f(g.ra) + '</td><td>' + N.fmtMicroinch(g.ra) + '</td></tr>'), g.grade);
  for (const r of N.TRIANGLES.rows) assert.ok(p.includes(R.staticFigure('triangles-' + r.marks).svg + ' <span class="sr-only">' + r.marks + ' triangle' + (r.marks > 1 ? 's' : '') + '</span></td><td>' + r.ra.map(f).join(', ') + '</td>'), r.marks + ' triangles');
  assert.match(p, /approximate, not rigorous/);
  for (const k of N.PROCESS_ORDER) assert.ok(p.includes(esc(N.PROCESS[k].reading)), k);
  for (const sym of N.LAY_ORDER) assert.ok(p.includes(esc(N.LAY[sym].meaning)), 'lay ' + sym);
});

test('the challenge\'s printed answers are the quiz\'s own', () => {
  const p = page();
  for (const q of Q.build()) {
    const ans = q.options.find((o) => o.id === q.answer);
    assert.equal(!!q.shows, q.draw.kind !== 'none', q.id + ' says in words what its figure draws');
    assert.ok(p.includes('<li>' + (q.shows ? '<span class="aside">' + esc(q.shows) + '</span> ' : '') + esc(q.question) + ' <em>' + esc(ans.text) + '.</em> ' + esc(q.explain) + '</li>'), q.id);
  }
});

test('the symbols are drawn as the standards distinguish them', () => {
  const g = R.legs(0, 0);
  const seg = (s) => s.match(/class="st-sym-line st-sym-dash" d="([^"]+)"/);
  for (const conv of ['legacy', 'current']) {
    for (const proc of N.PROCESS_ORDER) {
      const svg = R.symbol({ notation: conv, process: proc, param: 'Ra', value: 3.2, lay: '⊥' }).svg;
      assert.equal(!!seg(svg), conv === 'current', conv + ' ' + proc + ': the separate dash only on the current symbol');
      assert.equal(/<circle class="st-sym-line"/.test(svg), proc === 'prohibited', 'circle only for removal prohibited');
      const main = absPoints(svg.match(/<path class="st-sym-line" d="([^"]+)"/)[1]);
      // short leg top, point, long leg top, then the long line to the right
      assert.ok(main[1][1] > main[0][1] && main[2][1] < main[0][1] && main[3][0] > main[2][0] && main[3][1] === main[2][1], 'check-mark shape with the line running right');
      assert.equal(main.length > 4, proc === 'removal', 'the bar closes the lower triangle only for removal required');
      const req = svg.match(/<text class="st-req" x="([^"]+)" y="([^"]+)">Ra 3.2<\/text>/);
      assert.ok(Number(req[1]) > main[2][0] && Number(req[2]) > main[2][1], 'the requirement sits below the long line, right of the long leg');
      const lay = svg.match(/<text class="st-req st-lay" x="([^"]+)" y="([^"]+)">⊥<\/text>/);
      if (conv === 'current') assert.ok(Number(lay[2]) < main[2][1], 'ISO 21920 lay sits above the long line');
      else assert.ok(Number(lay[2]) > main[2][1] + 20 && Number(lay[1]) > main[1][0], 'ISO 1302 lay sits beside the long leg, below the line');
    }
  }
  // The dash floats: clear of both legs and of the bar.
  const d = R.currentDash(g);
  // distance from a point to a leg, the segment from the point of the V (0, 0) to the leg's end
  const distToSeg = (x, y, ex, ey) => { const t = Math.max(0, Math.min(1, (x * ex + y * ey) / (ex * ex + ey * ey))); return Math.hypot(x - t * ex, y - t * ey); };
  const distToLeg = (x, y, ex, ey) => Math.abs(ex * y - ey * x) / Math.hypot(ex, ey);   // to the leg's whole line
  for (let k = 0; k <= 10; k++) {
    const x = d[0] + (d[2] - d[0]) * k / 10;
    assert.ok(distToSeg(x, d[1], g.A[0], g.A[1]) > 4, 'dash clear of the short leg');
    assert.ok(distToSeg(x, d[1], g.B[0], g.B[1]) > 4, 'dash clear of the long leg');
  }
  assert.ok(d[1] < g.A[1] - 2 && d[2] < g.B[0] * (d[1] / g.B[1]) - 2, 'above the short leg and left of the long leg');
  // The circle touches both legs.
  const svg = R.symbol({ notation: 'legacy', process: 'prohibited' }).svg;
  const c = svg.match(/<circle class="st-sym-line" cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/).slice(1).map(Number);
  const vx = 34, vy = 70;
  near(distToLeg(c[0] - vx, c[1] - vy, g.A[0], g.A[1]), c[2], 0.15, 'tangent to the short leg');
  near(distToLeg(c[0] - vx, c[1] - vy, g.B[0], g.B[1]), c[2], 0.15, 'tangent to the long leg');
});

test('the profile figure marks the numbers it prints', () => {
  const an = P.measure(S.make({ scratch: true }), 'x', 0.8);
  const fig = R.profiles(an, { idPrefix: 't' });
  const zs = [...fig.svg.matchAll(/>Z(\d) ([^<]+)</g)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(zs, an.sections.map((s) => [s.index, N.fmtUm(s.height)]));
  // the Rt bar runs from the analysed peak to the analysed valley, in the plot's own scale
  const bar = absPoints(fig.svg.match(/class="st-rt-bar" d="([^"]+)"/)[1]);
  const lim = fig.parts.rough.lim, top = fig.parts.rough.top, bottom = fig.parts.rough.bottom;
  const yOf = (v) => (top + bottom) / 2 - v / lim * (bottom - top) / 2;
  near(bar[0][1], yOf(an.rt.peak.v), 0.06, 'Rt bar top'); near(bar[1][1], yOf(an.rt.valley.v), 0.06, 'Rt bar bottom');
  assert.ok(fig.svg.includes('Rz ' + N.fmtUm(an.Rz) + ' µm'), 'description states Rz');
  assert.ok(fig.svg.includes('Ra ' + N.fmtUm(an.Ra)), 'description states Ra');
  // compact and full layouts draw the same sections
  const compact = R.profiles(an, { compact: true, idPrefix: 'c' }).svg;
  assert.equal((compact.match(/class="st-zbar"/g) || []).length, 5);
  assert.equal((fig.svg.match(/class="st-peak"/g) || []).length, 5);
  assert.equal((fig.svg.match(/class="st-valley"/g) || []).length, 5);
});

test('the block draws what the trace measures', () => {
  for (const dir of ['x', 'y']) {
    for (const lc of P.CUTOFFS) {
      const spec = S.make({ scratch: true });
      const pic = R.pictorial(spec, { lc, dir, view: 'front', idPrefix: 'p' });
      assert.ok(!/NaN|undefined|Infinity/.test(pic.svg), dir + ' ' + lc);
      near(pic.width, 7 * lc, 1e-9, 'the patch holds the whole trace');
      assert.match(pic.svg, new RegExp('Heights are drawn ' + pic.exaggeration + ' times larger than widths'));
      assert.match(pic.svg, /class="st-trace"/);
      assert.match(pic.svg, /class="st-scratch"/);
      assert.ok(pic.svg.includes(R.RELATION_WORDS[S.relation(spec.lay, dir)]));
    }
  }
  for (const lay of S.PATTERN_ORDER) {
    const mini = R.pictorial(S.make({ lay }), { mini: true, trace: false });
    assert.ok(!/class="st-trace"/.test(mini.svg), 'a lay figure without a trace');
    assert.ok(!/NaN|undefined/.test(mini.svg));
  }
});

test('manifest and stylesheet follow the site rules', () => {
  const conf = fs.readFileSync(path.join(MOD, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@ID: surface-texture$/m);
  const js = conf.match(/^@@JS: (.+)$/m)[1].split(',').map((s) => s.trim());
  assert.deepEqual(js, ['surface.js', 'profile.js', 'notation.js', 'render.js', 'quiz.js', 'demo.js'], 'model, analysis, notation, pictures, quiz, then controls');
  assert.deepEqual(conf.match(/^@@CSS: (.+)$/m)[1].split(',').map((s) => s.trim()), ['demo.css']);
  for (const f of js.concat(['demo.css'])) assert.ok(fs.existsSync(path.join(MOD, f)), f + ' exists');
  const demo = fs.readFileSync(path.join(MOD, 'demo.js'), 'utf8');
  for (const g of ['CourseWikiTextureSurface', 'CourseWikiTextureProfile', 'CourseWikiTextureNotation', 'CourseWikiTextureRender', 'CourseWikiTextureQuiz']) assert.ok(demo.includes('window.' + g), 'demo reads ' + g);
  assert.ok(!/N_GRADES\s*=|TRIANGLES\s*=|exp\(-Math\.PI/.test(demo), 'no notation tables or filter maths outside their modules');
  const sheet = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const outsidePrint = sheet.slice(0, sheet.indexOf('@media print'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outsidePrint), 'no literal colours outside print');
  for (const rule of sheet.split('}')) {
    if (/\.st-(lbl|small|tick|face-lbl|sec-num|req|grade|k|v|s|rel|verdict|mission)\b/.test(rule)) {
      assert.ok(!/(^|[;{\s])(fill|color):\s*var\(--(msu-gold|msu-redorange|cat2|cat3|flag)\)/.test(rule), 'text in gold or red-orange: ' + rule.trim());
    }
  }
  assert.match(sheet, /\.presenting/); assert.match(sheet, /@media print/);
  assert.match(sheet, /\.st-live > \.st-static \{ display: none; \}/);
  assert.match(sheet, /\[data-interactive="surface-texture"\] \[hidden\] \{ display: none !important; \}/);
});

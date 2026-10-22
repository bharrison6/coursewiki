'use strict';
/* Focused tests for the turning simulator's pictures, page and manifest:
   interactives/turning-simulator/render.js and collections/machining/pages/lathe-operations.html.
   Run: node --test --test-concurrency=2 tests/interactives/turning-simulator-page.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'turning-simulator');
const PAGE = path.join(ROOT, 'collections', 'machining', 'pages', 'lathe-operations.html');
const M = require(path.join(MOD, 'model.js'));
const R = require(path.join(MOD, 'render.js'));

const nums = (d) => (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const pairs = (d) => { const n = nums(d); const out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };

test('the page follows the module contract', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.match(page, /^@@ID: lathe-operations$/m);
  assert.match(page, /^@@TITLE: Lathe Operations$/m);
  assert.match(page, /^@@SECTION: Turning$/m);
  assert.match(page, /^@@STATUS: ready$/m);
  assert.equal((page.match(/data-interactive="turning-simulator"/g) || []).length, 1);
  let depth = 0;
  for (const tag of page.match(/<\/?section\b/g)) { depth += tag === '<section' ? 1 : -1; assert.ok(depth >= 0 && depth <= 1, 'no nested sections'); }
  assert.equal(depth, 0);
  assert.ok(!/<script\b/.test(page), 'assets load through the manifest, not the page');
  assert.match(page, /<noscript>/);
  // Checklists are only the things to work through.
  const boxes = page.match(/<ul class="boxes">[\s\S]*?<\/ul>/g) || [];
  assert.equal(boxes.length, 1);
  assert.match(page, /<h2>Things to try in the simulator<\/h2>\s*<ul class="boxes">/);
  for (const id of ['machine-hazards', 'feeds-and-speeds', 'tolerances-and-fits']) assert.ok(page.includes('[[' + id + ']]'), 'links ' + id);
});

test('the printed figures in the page are the renderer\'s output', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.ok(page.includes(R.staticScene('pin-turning')), 'the part-way scene is current');
  for (const T of M.TARGETS) assert.ok(page.includes(R.drawing(T, { idPrefix: 'ts-static-d-' + T.id })), T.id + ' drawing is current');
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'every SVG id on the page is unique');
  for (const m of page.matchAll(/(?:url\(#|href="#)([^)"]+)/g)) assert.ok(ids.includes(m[1]), 'reference resolves: ' + m[1]);
  for (const m of page.matchAll(/aria-labelledby="([^"]+)"/g)) for (const r of m[1].split(' ')) assert.ok(ids.includes(r), 'label resolves: ' + r);
  // The printed scene is a state the simulator reaches, and the caption says what it shows.
  const st = R.sceneState('pin-turning');
  assert.equal(st.tool, 'turn');
  assert.ok(st.tz < -0.2 && st.tz > -0.4, 'tool halfway along the first pin pass');
  assert.ok(Math.abs(st.work.ro[M.colAt(st.work, -1.0)] - 0.375) < 1e-9, 'body turned to 0.750');
});

test('the drawn cutting edge is the model\'s edge, and the drawn tool is the tool that collides', () => {
  for (const id of M.TOOL_ORDER) {
    const t = M.TOOLS[id];
    const svg = R.toolShape(id, { drill: 0.5 });
    const edge = svg.match(/class="ts-tool-edge[^"]*" d="([^"]+)"/)[1];
    for (const [x, y] of pairs(edge)) {
      const dz = x / R.S, dr = -y / R.S;
      // Drawn points are rounded to 0.1 SVG unit, so compare within that much of Z.
      const fn = t.side === 'axial' ? (id === 'drill' ? t.radiusFor(0.5) : t.radius) : t.edge;
      const want = t.side === 'in' ? -dr : dr;
      assert.ok([-0.0007, 0, 0.0007].some((h) => Math.abs(want - fn(dz + h)) < 0.0012), id + ' edge at dz ' + dz);
    }
    if (t.side === 'out') {
      // The body outline's lowest boundary is the edge function across the whole span.
      const body = svg.match(/class="ts-tool-body" d="([^"]+)"/)[1];
      for (const [x, y] of pairs(body)) {
        const dz = x / R.S, dr = -y / R.S;
        // Points at a step in the edge (insert to holder) sit on one side of it or the other.
        const near = [-0.0015, 0, 0.0015].some((h) => Math.abs(dr - t.edge(dz + h)) < 0.0012);
        if (dr < 2.5) { assert.ok(near || Math.abs(dz - t.span[0]) < 0.002 || Math.abs(dz - t.span[1]) < 0.002, id + ' body at dz ' + dz); }
      }
    }
    assert.ok(!/NaN|undefined|Infinity/.test(svg), id);
  }
});

test('the work is drawn where the model has it, section above and outside below', () => {
  const st = M.create('stepped-pin');
  M.play(st, [['sp', true], ['mv', 0, 1.4], ['x', 0], ['x', 1.4], ['mv', 0.1, 0.880], ['z', -1.0]]);
  const f = R.frame(M.target('stepped-pin'));
  const w = R.workPaths(st.work, f);
  const top = pairs(w.sec), bot = pairs(w.ext);
  // Flat stretches are drawn as one segment: find the segment over a Z at a radius.
  const spans = (list, z, y) => list.some((p, k) => k > 0 && p[1] === y && list[k - 1][1] === y && Math.min(p[0], list[k - 1][0]) <= f.x(z) && Math.max(p[0], list[k - 1][0]) >= f.x(z));
  assert.ok(spans(top, -0.5, f.y(0.44)), 'turned radius in the section');
  assert.ok(spans(bot, -0.5, f.y(-0.44)), 'the same radius mirrored outside');
  assert.ok(spans(top, -1.5, f.y(0.5)), 'bar size beyond the pass');
  // A step is a vertical edge on the outside view.
  assert.ok(pairs(w.edges).some(([x]) => Math.abs(x - f.x(-1.0)) < 1), 'shoulder edge drawn');
  // Metal outside the drawing is tinted; nothing is marked undersize yet.
  const c = R.comparePaths(st, f);
  assert.ok(c.counts.excess > 0);
  assert.equal(c.counts.under, 0);
  // Cut too deep and the undersize line appears.
  M.play(st, [['x', 1.1], ['z', 0.1], ['x', 0.700], ['z', -0.4]]);
  M.play(st, [['x', 1.1], ['z', 0.1], ['x', 0.600], ['z', -0.4]]);
  assert.equal(R.comparePaths(st, f).counts.under, 0, 'still bigger than the Ø0.500 pin');
  M.play(st, [['x', 1.1], ['z', 0.1], ['x', 0.480], ['z', -0.4]]);
  assert.ok(R.comparePaths(st, f).counts.under > 0, 'Ø0.480 is under the smallest size of the pin');
});

test('every view the parts pass through draws without gaps', () => {
  const seqs = {
    'stepped-pin': [['sp', true], ['mv', 0, 1.4], ['x', 0], ['x', 1.4], ['sp', false], ['tool', 'groove'], ['sp', true], ['mv', -1.5, 1.2], ['x', 0]],
    'bushing': [['sp', true], ['sp', false], ['tool', 'drill'], ['sp', true], ['z', -1.0], ['z', 0.6], ['sp', false], ['tool', 'bore'], ['sp', true], ['mv', 0.1, 0.55], ['z', -0.5]],
    'thumb-screw': [['sp', true], ['mv', 0.1, 0.900], ['z', -1.4], ['x', 1.1], ['sp', false], ['tool', 'knurl'], ['sp', true], ['mv', -0.9, 0.95], ['x', 0.88], ['z', -1.2]],
    'knurled-nut': [['sp', true], ['sp', false], ['tool', 'ithread'], ['sp', true]]
  };
  for (const T of M.TARGETS) {
    const st = M.create(T.id);
    for (const op of seqs[T.id]) {
      M.play(st, [op]);
      const svg = R.scene(st, { idPrefix: 'probe' });
      assert.ok(!/NaN|undefined|Infinity/.test(svg), T.id + ' after ' + JSON.stringify(op));
    }
    if (st.part) assert.ok(R.partFigure(st.part).startsWith('<svg'));
    const dr = R.drawing(T);
    assert.ok(!/NaN|undefined|Infinity/.test(dr), T.id + ' drawing');
    assert.match(dr, /<desc id="[^"]+">[^<]{40,}<\/desc>/, 'the drawing says what it shows');
  }
  for (const id of M.TOOL_ORDER) assert.ok(!/NaN|undefined/.test(R.toolIcon(id)));
});

test('the drawing table lists every feature before anything is measured', () => {
  for (const T of M.TARGETS) {
    const items = M.evaluate(M.create(T.id)).items.map((x) => x.id);
    const want = ['face', ...(!T.inside.length ? ['core'] : []), ...T.outside.map((_, k) => 'od-' + k), ...T.shoulders.map((_, k) => 'sh-' + k), ...T.inside.map((_, k) => 'id-' + k), ...T.chamfers.map((_, k) => 'ch-' + k), 'len'];
    assert.deepEqual(items, want, T.id);
  }
});

test('manifest, shared modules and stylesheet follow the site rules', () => {
  const conf = fs.readFileSync(path.join(MOD, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@ID: turning-simulator$/m);
  const js = conf.match(/^@@JS: (.+)$/m)[1].split(',').map((s) => s.trim());
  const css = conf.match(/^@@CSS: (.+)$/m)[1].split(',').map((s) => s.trim());
  assert.deepEqual(js, ['model.js', 'render.js', 'demo.js'], 'engine, then pictures, then controls');
  for (const f of js.concat(css)) assert.ok(fs.existsSync(path.join(MOD, f)), f + ' exists');
  const demo = fs.readFileSync(path.join(MOD, 'demo.js'), 'utf8');
  assert.match(demo, /window\.CourseWikiTurning\b/); assert.match(demo, /window\.CourseWikiTurningRender\b/);
  assert.ok(!/edge\s*:\s*function|insertEdge|vEdge/.test(demo), 'no tool geometry outside the model');
  assert.ok(!/TOOLS\s*=\s*\{/.test(demo + fs.readFileSync(path.join(MOD, 'render.js'), 'utf8')), 'one tool table');
  const sheet = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const outsidePrint = sheet.slice(0, sheet.indexOf('@media print'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outsidePrint), 'no literal colours outside print');
  for (const rule of sheet.split('}')) {
    if (/\.ts-(dtxt|lbl|dlbl|k|k2|badge|tag|item-label|jog-sub)\b/.test(rule)) assert.ok(!/(^|[;{\s])(fill|color):\s*var\(--(msu-gold|msu-redorange|cat2|cat3|flag)\)/.test(rule), 'text in gold or red-orange: ' + rule.trim());
  }
  assert.match(sheet, /\.presenting/); assert.match(sheet, /@media print/);
  assert.match(sheet, /\.ts-live > \.ts-static \{ display: none; \}/);
});

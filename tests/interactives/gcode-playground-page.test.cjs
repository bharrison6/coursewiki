'use strict';
/* Focused tests for the G-code playground's blocks, pictures, manifest and page:
   interactives/gcode-playground/blocks.js, render.js, interactive.conf and
   collections/machining/pages/gcode-and-toolpaths.html.
   Run: node --test --test-concurrency=2 tests/interactives/gcode-playground-page.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'gcode-playground');
const PAGE = path.join(ROOT, 'collections', 'machining', 'pages', 'gcode-and-toolpaths.html');
const G = require(path.join(MOD, 'gcode.js'));
const B = require(path.join(MOD, 'blocks.js'));
const R = require(path.join(MOD, 'render.js'));
const X = require(path.join(MOD, 'machine.js'));
const page = fs.readFileSync(PAGE, 'utf8');

/* ---- blocks ------------------------------------------------------------------*/
test('one block is one line: every example reads into blocks and writes back line for line', () => {
  for (const ex of B.EXAMPLES) {
    const blocks = B.fromText(ex.text.join('\n'));
    assert.equal(blocks.length, ex.text.length, ex.id + ': a block per line');
    assert.deepEqual(blocks.map(B.toLine), ex.text, ex.id + ': the same lines come back');
    assert.ok(blocks.every((b) => b.type !== 'code'), ex.id + ': every example line is a typed block');
  }
});

test('lines that fit no block are kept unchanged in a code-line block', () => {
  const odd = ['N10 G0 X5', 'G0 G90 X5', 'G41 G1 X1', 'g1x5f100', 'T7 M6', 'X1 F100', '%', '', 'G1 X5 (a) (b)', 'G81 X1 Y1 Z-1 R1 F10'];
  for (const line of odd) {
    const b = B.fromLine(line);
    if (line === 'g1x5f100') { assert.equal(b.type, 'feed'); assert.equal(B.toLine(b), 'G1 X5 F100'); continue; }
    assert.equal(b.type, 'code', line);
    assert.equal(B.toLine(b), line, 'kept exactly: ' + line);
  }
  const noted = B.fromLine('T1 M6 (end mill)');
  assert.equal(noted.type, 'tool');
  assert.equal(B.toLine(noted), 'T1 M6 (end mill)');
  // Whatever a block holds, it means what its line means.
  for (const line of odd.concat(['G2 X10 Y10 R5', 'G99 G81 X1 Y2 Z-3 R2 F50', 'X1 Y2', 'G91', 'M2'])) {
    const b = B.fromLine(line);
    const a = G.interpret([line]).lines[0], c = G.interpret([B.toLine(b)]).lines[0];
    assert.deepEqual(c.c.v, a.c.v, line);
    assert.deepEqual(c.c.gList.slice().sort(), a.c.gList.slice().sort(), line);
    assert.deepEqual(c.c.mList, a.c.mList, line);
  }
});

test('a fresh block of every kind is a line the interpreter can read', () => {
  for (const type of B.ORDER) {
    const line = B.toLine(B.make(type));
    const c = G.classify(G.parseLine(line));
    assert.deepEqual(c.errors, [], type + ': ' + line);
  }
  // An empty number leaves its word out; a number is kept as typed, tidied of a true minus or a decimal comma.
  const f = B.make('feed', { x: '', y: '−12,5', z: ' -3 ', f: '300' });
  assert.equal(B.toLine(f), 'G1 Y-12.5 Z-3 F300');
  const r = B.make('rapid', { x: '20', y: '', z: '' });
  r.type = 'feed';
  assert.equal(B.toLine(r), 'G1 X20', 'a rapid swapped to a feed keeps its words');
  const arc = B.make('arc', { dir: 'G3', x: '10', y: '0', by: 'r', i: '4', j: '4', r: '5', f: '' });
  assert.equal(B.toLine(arc), 'G3 X10 Y0 R5', 'only the centre words that apply are written');
});

test('every example runs to its end, and its tries point at the blocks they name', () => {
  for (const ex of B.EXAMPLES) {
    const p = G.interpret(ex.text.join('\n'));
    assert.equal(p.error, null, ex.id);
    const pv = X.preview(p);
    assert.equal(pv.alarm, null, ex.id);
    assert.ok(p.hasEnd, ex.id + ' ends with M30');
    assert.equal(ex.tries.length, 3);
    for (const t of ex.tries) for (const m of t.matchAll(/block (\d+)/g)) assert.ok(Number(m[1]) <= ex.text.length, ex.id + ': ' + t);
  }
  // The first try in each guided example changes what happens, as its text says.
  const slot = B.example('slot').text;
  const deeper = X.preview(G.interpret(slot.map((l) => l === 'G1 Z-3 F100' ? 'G1 Z-6 F100' : l).join('\n')));
  assert.equal(deeper.alarm, null);
  assert.ok(Math.abs(deeper.machine.sim.heightAt(50, 30) + 6) < 1e-9);
  const moved = slot.slice(); moved.splice(6, 0, moved.splice(3, 1)[0]);
  assert.match(X.preview(G.interpret(moved.join('\n'))).alarm.message, /spindle stopped/, 'spindle on after the plunge');
  const inch = G.interpret(slot.map((l) => l.replace('G21', 'G20')).join('\n'));
  assert.match(inch.error.message, /travel/, 'G20 makes the same numbers too long');
  const out = B.example('outline').text;
  assert.match(G.interpret(out.map((l, k) => k === 8 ? l.replace('J8', 'J6') : l).join('\n')).error.message, /not on the arc/);
  const holes = B.example('holes').text, h2 = holes.slice();
  h2.splice(10, 0, h2.splice(7, 1)[0]);
  assert.match(G.interpret(h2.join('\n')).error.message, /no motion mode in force/);
  const face = B.example('facing').text.map((l, k) => k === 4 ? 'G0 X20 Y15' : l);
  assert.match(X.preview(G.interpret(face.join('\n'))).alarm.message, /rapid/);
  assert.match(X.preview(G.interpret(face.map((l, k) => k === 5 ? 'G1 Z0 F100' : l).join('\n'))).alarm.message, /cannot be pushed straight down/);
});

/* ---- the drawing ------------------------------------------------------------------*/
test('arcs are drawn the way they turn, and the deepest cut is painted last', () => {
  const p = G.interpret(['G21 G90', 'T2 M6', 'S3000 M3', 'G0 X20 Y30 Z2', 'G1 Z1.5 F100', 'G2 X40 Y30 I10 J0', 'G3 X60 Y30 I10 J0'].join('\n'));
  const arcs = p.moves.filter((m) => m.kind === 'arc');
  // Screen y runs down, so a clockwise arc seen from above has SVG sweep-flag 1.
  assert.match(R.plan([arcs[0]], 'top'), / 0 0 1 40 -30"/);
  assert.match(R.plan([arcs[1]], 'top'), / 0 0 0 60 -30"/);
  const m = X.create().load(G.interpret(['G21 G90', 'T1 M6', 'S2500 M3', 'G0 X20 Y30 Z2', 'G1 Z-8 F100', 'G0 Z5', 'G0 X30', 'G1 Z-1', 'G0 Z20'].join('\n')));
  m.runToEnd();
  const cuts = R.cuts(m.sim);
  assert.ok(cuts.indexOf('gp-d1') < cuts.indexOf('gp-d4'), 'shallow first, deep on top');
  assert.equal(R.band(-20), 'thru');
  assert.equal(R.band(0.5), '0');
});

test('the printed figures in the page are the renderer’s output', () => {
  for (const id of ['slot', 'outline', 'holes']) assert.ok(page.includes(R.staticFigure(id)), id + ' figure is current');
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'every SVG id on the page is unique');
  for (const m of page.matchAll(/(?:url\(#|href="#)([^)"]+)/g)) assert.ok(ids.includes(m[1]), 'reference resolves: ' + m[1]);
  // The static figure is the program run to its end, captioned with the example's own words.
  for (const id of ['slot', 'outline', 'holes']) {
    const ex = B.example(id);
    assert.ok(page.includes('<strong>' + ex.title + '.</strong> ' + ex.brief.replace(/×/g, '×')), id + ' caption');
    for (const line of ex.text) assert.ok(page.includes('<li><code>' + line.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</code></li>'), id + ' lists ' + line);
  }
});

/* ---- manifest and page ---------------------------------------------------------------*/
test('the module manifest loads the milling model first and every asset by its exact name', () => {
  const conf = fs.readFileSync(path.join(MOD, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@ID: gcode-playground$/m);
  assert.match(conf, /^@@REQUIRES: milling-simulator$/m);
  const assets = [...conf.matchAll(/^@@(?:JS|CSS):\s*(.*)$/gm)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
  assert.deepEqual(assets, ['demo.css', 'gcode.js', 'machine.js', 'blocks.js', 'render.js', 'demo.js']);
  for (const file of assets) assert.ok(fs.readdirSync(MOD).includes(file), 'case-sensitive asset ' + file);
  // Nothing here reaches into the milling simulator's interface or manual routing.
  for (const file of ['gcode.js', 'machine.js', 'blocks.js', 'render.js', 'demo.js']) {
    const src = fs.readFileSync(path.join(MOD, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\.moveTo\(|\.plan\(|CourseWikiMillingDraw|CourseWikiMillingInspect|CourseWikiMillingJobs/, file);
  }
  const css = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,6}\b(?![^{]*!important)/, 'colours come from tokens (print overrides aside)');
});

test('the page follows the module contract and says what the simulator reads', () => {
  assert.match(page, /^@@ID: gcode-and-toolpaths$/m);
  assert.match(page, /^@@TITLE: G-code and Toolpaths$/m);
  assert.match(page, /^@@SECTION: Milling$/m);
  assert.match(page, /^@@STATUS: ready$/m);
  assert.equal((page.match(/data-interactive="gcode-playground"/g) || []).length, 1);
  let depth = 0;
  for (const tag of page.match(/<\/?section\b/g)) { depth += tag === '<section' ? 1 : -1; assert.ok(depth >= 0 && depth <= 1, 'no nested sections'); }
  assert.equal(depth, 0);
  assert.ok(!/<script\b/.test(page), 'assets load through the manifest, not the page');
  assert.match(page, /<noscript>/);
  assert.match(page, /<div data-gp-live><\/div>/);
  const boxes = page.match(/<ul class="boxes">[\s\S]*?<\/ul>/g) || [];
  assert.equal(boxes.length, 1);
  assert.match(page, /<h2>Things to try in the G-code simulator<\/h2>\s*<ul class="boxes">/);
  // Its own heading: section ids in a printed aggregate come from headings, and the milling and lathe pages use the plain one.
  assert.doesNotMatch(page, /<h2>Things to try in the simulator<\/h2>/);
  for (const id of ['milling-operations', 'feeds-and-speeds']) assert.ok(page.includes('[[' + id + ']]'), 'links ' + id);
  // Every code the interpreter reads is named on the page and in the live app, so neither claims less or more.
  const demo = fs.readFileSync(path.join(MOD, 'demo.js'), 'utf8');
  const reads = /Reads <code>([^<]+)<\/code>, ' \+\s*'<code>([^<]+)<\/code>/.exec(demo);
  assert.ok(reads, 'the live app lists the codes it reads');
  const listed = (reads[1] + ' ' + reads[2]).split(/\s+/);
  const supported = G.SUPPORTED_G.map((k) => 'G' + k).concat(G.SUPPORTED_M.map((k) => 'M' + k));
  assert.deepEqual(listed.slice().sort(), supported.slice().sort());
  for (const code of supported) assert.ok(page.includes('<code>' + code + '</code>'), 'page names ' + code);
  for (const e of G.TOOL_TABLE) assert.ok(page.includes('<code>T' + e.t + '</code>'), 'page names T' + e.t);
});

'use strict';
/* Focused tests for the lathe simulator's working interface (demo.js markup and
   demo.css): every control the hands need sits in one workbench, nothing in the
   lab is a scrolling frame, and the page names the controls the learner sees.
   The fit to the screen itself is measured in a browser; these check its premises.
   Run: node --test --test-concurrency=2 tests/interactives/turning-simulator-ui.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'turning-simulator');
const PAGE = path.join(ROOT, 'collections', 'machining', 'pages', 'lathe-operations.html');
const M = require(path.join(MOD, 'model.js'));
const U = require(path.join(MOD, 'demo.js'));
const CSS = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8');

const html = U.markup('t1');
// The workbench runs from its opening tag to the tray that follows it.
const bench = html.slice(html.indexOf('<div class="ts-workbench"'), html.indexOf('<div class="ts-tray">'));
const outside = html.slice(0, html.indexOf('<div class="ts-workbench"')) + html.slice(html.indexOf('<div class="ts-tray">'));

test('every operating control is in the one workbench', () => {
  assert.ok(bench.length > 1000, 'the workbench is found');
  const controls = ['data-ts-act="spindle"', 'data-ts-act="measure"', 'data-ts-act="undo"', 'data-ts-act="hold"',
    'data-ts-in="z"', 'data-ts-act="feed-z"', 'data-ts-in="x"', 'data-ts-act="feed-x"', 'data-ts-in="stop"', 'data-ts-act="thread"',
    'data-ts-jog="x+"', 'data-ts-jog="x-"', 'data-ts-jog="z+"', 'data-ts-jog="z-"', '<select data-ts-drill>', '<select data-ts-tpi>',
    'data-ts-viewwrap', 'data-ts-act="zoom"', 'data-ts-msg', 'data-ts-view="section"', 'data-ts-view="normal"'];
  for (const c of controls) {
    assert.equal(bench.split(c).length - 1, 1, 'one ' + c + ' in the workbench');
    assert.ok(!outside.includes(c), c + ' only in the workbench');
  }
  for (const t of M.TOOL_ORDER) assert.ok(bench.includes('data-ts-tool="' + t + '"'), t + ' in the tool rack');
  for (const s of U.STEPS) assert.ok(bench.includes('value="' + s + '"'), 'step ' + s + ' beside the handwheels');
  // The part and the drawing are chosen above it; they are not used while cutting.
  for (const T of M.TARGETS) assert.ok(outside.includes('data-ts-part="' + T.id + '"'), T.id + ' above the bench');
  assert.ok(outside.includes('data-ts-act="drawing"') && outside.includes('data-ts-drawing hidden'), 'the drawing opens on request');
});

test('controls name what they do, and the feedback offers more rather than scrolling', () => {
  assert.match(html, /aria-keyshortcuts="Control\+Z">Undo</);
  assert.match(html, /aria-keyshortcuts="Escape" hidden>Stop feed</);
  assert.match(html, /data-ts-act="more" aria-expanded="false" hidden>More</);
  assert.match(html, /role="status" aria-live="polite"/);
  for (const [j, a, s] of [['x+', 'X+', 'away from center'], ['x-', 'X−', 'toward center'], ['z-', 'Z−', 'toward chuck'], ['z+', 'Z+', 'toward tailstock']]) {
    assert.ok(html.includes('data-ts-jog="' + j + '" aria-label="' + a + ', ' + s + ', one step"'), j + ' says which way it moves');
  }
  // A tool button's label is its short name; the soft hyphen lets Countersink break in a narrow rack.
  assert.equal(U.SHORT.csink, 'Counter­sink');
  for (const t of M.TOOL_ORDER) assert.ok(U.SHORT[t], t + ' has a rack label');
});

test('one switch shows the whole work in section or from outside, never half of each', () => {
  assert.match(bench, /<div class="ts-views" role="group" aria-label="View of the work"><button type="button" data-ts-view="section" aria-pressed="true">Section<\/button><button type="button" data-ts-view="normal" aria-pressed="false">Normal<\/button><\/div>/);
  // The switch sits over the picture, so it adds no height to the bench.
  assert.match(CSS, /\.ts-views \{ position: absolute;/);
  assert.match(html, /V changes between the section and the normal view/);
  assert.match(html, /ts-lg-hidden"><span class="ts-key ts-key-hidden" aria-hidden="true"><\/span>a hole, hidden inside/);
  const page = fs.readFileSync(PAGE, 'utf8').replace(/\s+/g, ' ');
  assert.match(page, /<strong>Section<\/strong> cuts the work in half along its centerline/);
  assert.match(page, /<strong>Normal<\/strong> shows the outside/);
  assert.ok(!/upper half of the work cut away|Above the centerline<\/strong>/.test(page), 'no half-and-half picture described');
});

test('nothing in the lab is a scrolling frame; only a wide drawing scrolls sideways', () => {
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{[^{}]*\}/g) || [];
  const scrolling = rules.filter((r) => /overflow(-[xy])?\s*:\s*(auto|scroll)/.test(r)).map((r) => r.split('{')[0].trim());
  assert.deepEqual(scrolling, ['.ts-drawing-scroll'], 'only the drawing scrolls');
  assert.match(CSS, /\.ts-drawing-scroll \{ max-width: 100%; overflow-x: auto;/);
  assert.ok(!/max-height\s*:\s*(min\(|calc\()?[^;]*svh/.test(CSS), 'no viewport-height cap that would push controls into a frame');
  assert.ok(!/\.ts-workbench\s*\{[^}]*height\s*:/.test(CSS), 'the workbench has no fixed height');
  // The message is clamped to a fixed number of lines and opens in place.
  assert.match(CSS, /-webkit-line-clamp: var\(--ts-lines\)/);
  assert.match(CSS, /\.ts-feedback\.is-open \.ts-msg \{ display: block; overflow: visible; \}/);
});

test('the page leads its card with the simulator and names its controls as they appear', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.match(page, /<h2>Lathe simulator: make the part on the drawing<\/h2>\s*<div data-interactive="turning-simulator">/);
  const card = page.slice(page.indexOf('<h2>Lathe simulator'), page.indexOf('</section>', page.indexOf('<h2>Lathe simulator'))).replace(/\s+/g, ' ');
  for (const name of ['Feed to Z', 'Feed to X', 'Stop feed', 'Undo', 'New bar', 'Measure', 'Drawing']) {
    assert.ok(card.includes(name), 'the card names ' + name);
    assert.ok(html.includes('>' + name + '<'), name + ' is a control');
  }
  assert.ok(!/Measure the part<\/strong>|scroll this panel/i.test(card), 'no stale control names');
  assert.ok(!/Scroll this panel/i.test(html), 'no instruction to scroll the controls');
});

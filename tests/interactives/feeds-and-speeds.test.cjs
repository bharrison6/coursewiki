// Focused tests for interactives/feeds-and-speeds.
// Run: node --test --test-concurrency=2 tests/interactives/feeds-and-speeds.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'feeds-and-speeds');
const CUTTER = path.join(ROOT, 'interactives', 'cutter-geometry', 'cutter.js');
const M = require(path.join(MOD, 'model.js'));
const D = require(path.join(MOD, 'demo.js'));
const PAGE = path.join(ROOT, 'collections', 'machining', 'pages', 'feeds-and-speeds.html');

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const half = () => M.setupToCanon('in', M.example('in', 'half-inch'));
const capped = () => M.setupToCanon('in', M.example('in', 'eighth-inch-capped'));

/* A recording stand-in for the shared cutter API, used to check what this
   module asks it to draw. It draws nothing of its own. */
function recorder() {
  const calls = [];
  return { calls, render(o) { calls.push(JSON.parse(JSON.stringify(o))); return '<g data-stub="cutter"></g>'; } };
}

test('the formula anchors, in both unit systems', () => {
  rel(M.spindleSpeedInch(300, 0.5), 12 * 300 / (Math.PI * 0.5), 1e-12, 'inch RPM');
  rel(M.spindleSpeed(90, 12), 1000 * 90 / (Math.PI * 12), 1e-12, 'metric RPM');
  // The same physical cut through either formula gives the same RPM.
  rel(M.spindleSpeed(300 * M.M_PER_FT, 0.5 * M.MM_PER_IN), M.spindleSpeedInch(300, 0.5), 1e-12, 'inch and metric agree');
  rel(M.tableFeed(2000, 4, 0.05), 400, 1e-12, 'feed = n z fz');
  rel(M.chipLoad(400, 2000, 4), 0.05, 1e-12, 'fz = vf / (n z)');
  rel(M.cuttingSpeed(M.spindleSpeed(90, 12), 12), 90, 1e-12, 'cutting speed round-trips');
});

test('the worked example on the page is what the model computes', () => {
  const s = M.solve(half());
  assert.equal(M.show(s.rpm, 'rpm', 'in'), '2,292 rev/min');
  assert.equal(M.show(s.feed, 'feed', 'in'), '18.3 in/min');
  assert.equal(M.show(s.speed, 'speed', 'in'), '300 SFM');
  assert.equal(M.show(s.chip, 'chip', 'in'), '0.0020 in/tooth');
  const page = fs.readFileSync(PAGE, 'utf8');
  for (const t of ['2,292 rev/min', '18.3 in/min', '9,167 rev/min', '6.4 in/min', '131 SFM', '1.571 in', '2.3 times']) {
    assert.ok(page.includes(t), 'page states ' + t);
  }
  const c = M.solve(capped());
  assert.equal(M.format(c.requestedRpm, 'rpm', 'in'), '9,167');
  assert.equal(M.format(c.requestedRpm / c.rpm, 'feed', 'in'), '2.3');
});

test('unit switching keeps the physical setup and its results', () => {
  for (const ex of M.EXAMPLES.in.concat(M.EXAMPLES.mm)) {
    const canon = M.setupToCanon(ex.unit, ex);
    const other = ex.unit === 'in' ? 'mm' : 'in';
    const back = M.setupToCanon(other, M.setupFromCanon(other, canon));
    for (const k of ['diameter', 'speed', 'chip']) rel(back[k], canon[k], 1e-12, ex.id + ' ' + k);
    assert.equal(back.teeth, canon.teeth); assert.equal(back.maxRpm, canon.maxRpm);
    const a = M.solve(canon), b = M.solve(back);
    for (const k of ['rpm', 'feed', 'speed', 'chip']) rel(b[k], a[k], 1e-12, ex.id + ' result ' + k);
  }
  // 0.5 in reads as 12.7 mm; the RPM text is the same in either system.
  const s = M.solve(half());
  assert.equal(M.show(half().diameter, 'diameter', 'mm'), '12.7 mm');
  assert.equal(M.show(s.rpm, 'rpm', 'mm'), M.show(s.rpm, 'rpm', 'in'));
  assert.equal(M.show(s.feed, 'feed', 'mm'), '466 mm/min');
});

test('a machine top speed separates requested from actual, and recomputes from actual', () => {
  const c = capped(), s = M.solve(c);
  assert.equal(s.capped, true);
  rel(s.requestedRpm, 12 * 300 / (Math.PI * 0.125), 1e-12, 'requested');
  assert.equal(s.rpm, 4000);
  rel(s.feed, 4000 * 2 * c.chip, 1e-12, 'feed from actual RPM');
  rel(M.chipLoad(s.feed, s.rpm, c.teeth), c.chip, 1e-12, 'chip load kept');
  rel(M.fromCanon('in', 'speed', s.speed), Math.PI * 0.125 * 4000 / 12, 1e-9, 'surface speed from actual RPM');
  assert.ok(s.speed < c.speed, 'the edge runs slower than asked');
  // Below the cap nothing changes.
  const free = M.solve(Object.assign({}, c, { maxRpm: 20000 }));
  assert.equal(free.capped, false); rel(free.rpm, free.requestedRpm, 0, 'uncapped');
  // The worked lines say so.
  const lines = D.workedLines(c, 'in').join('\n');
  assert.match(lines, /tops out at 4,000 rev\/min/);
  assert.match(lines, /4,000 × 2 × 0\.0008 ≈ 6\.4 in\/min/);
  assert.match(lines, /131 SFM, not the 300 SFM asked for/);
  assert.ok(!/tops out/.test(D.workedLines(half(), 'in').join('\n')), 'no cap line when uncapped');
});

test('the experiment: hold the table feed versus hold the chip load', () => {
  const c = half();
  for (const f of [0.25, 0.5, 1.5, 2]) {
    const feed = M.trial(c, f, 'feed'), chip = M.trial(c, f, 'chip');
    rel(feed.change.rpm, f, 1e-12, 'rpm moves'); rel(chip.change.rpm, f, 1e-12, 'rpm moves');
    rel(feed.change.feed, 1, 1e-12, 'feed held'); rel(feed.change.chip, 1 / f, 1e-12, 'chip load inverse');
    rel(chip.change.chip, 1, 1e-12, 'chip held'); rel(chip.change.feed, f, 1e-12, 'feed in step');
    rel(feed.change.speed, f, 1e-12, 'cutting speed follows the spindle');
    // Every trial still satisfies the defining relation.
    for (const t of [feed, chip]) rel(t.feed, M.tableFeed(t.rpm, t.teeth, t.chip), 1e-12, 'vf = n z fz');
  }
  assert.equal(M.ratioText(0.5), '×0.5'); assert.equal(M.ratioText(2), '×2'); assert.equal(M.ratioText(1), 'unchanged');
  assert.throws(() => M.trial(c, 2, 'rpm'), /chip or feed/);
  // A trial above the machine top speed is capped too.
  const t = M.trial(Object.assign({}, c, { maxRpm: 3000 }), 2, 'chip');
  assert.equal(t.capped, true); assert.equal(t.rpm, 3000);
});

test('turning and feed share one time scale, and marks are one feed per tooth apart', () => {
  const s = M.solve(half());
  const tReal = M.realTime(3.7, 200);
  rel(tReal, 3.7 / 200, 1e-15, 'screen to real');
  const m = M.motion(s, tReal);
  rel(m.turns, s.rpm / 60 * tReal, 1e-12, 'turns from the same real time');
  rel(m.workTravel, s.feed / 60 * tReal, 1e-12, 'travel from the same real time');
  rel(m.workTravel / m.turns, s.feed / s.rpm, 1e-12, 'travel per turn is the real ratio');
  const ms = M.marks(s, tReal, undefined, 10);
  assert.equal(ms.length, 10);
  for (let i = 1; i < ms.length; i++) rel(ms[i].offset - ms[i - 1].offset, s.chip, 1e-9, 'mark spacing is fz');
  // Teeth: z of them, evenly pitched, clockwise, and the front half is engaged.
  assert.equal(m.teeth.length, 4);
  const later = M.motion(s, tReal + 1e-4);
  const d = M.wrap(later.teeth[0].psi - m.teeth[0].psi);
  assert.ok(d < 0, 'clockwise: psi falls with time');
  for (const t of m.teeth) assert.equal(t.engaged, Math.cos(t.psi) > 1e-9);
  // The uncut sliver grows to one feed per tooth and is taken at each pass.
  const period = 60 / (s.rpm * s.teeth), t1 = M.firstPass(s, Math.PI / 2);
  rel(M.uncutSliver(s, t1 + 0.999999 * period), s.chip, 1e-5, 'grows to fz');
  assert.ok(M.uncutSliver(s, t1 + 1e-9) < s.chip * 1e-3, 'taken at the pass');
  // A tooth sits at the front of the cut at each pass time.
  const at = M.motion(s, t1 + 3 * period);
  assert.ok(at.teeth.some((t) => Math.abs(t.psi) < 1e-9), 'a tooth at psi = 0 on a pass');
  // Passes per turn equal the flute count.
  // (measured half a pitch short of the turn, clear of the boundary)
  assert.equal(M.passesBefore(s, t1 + 60 / s.rpm - period / 2), s.teeth);
});

test('input checking: numbers, signs, whole teeth, optional top speed, ranges', () => {
  assert.equal(M.parseNumber('1,250'), 1250); assert.equal(M.parseNumber('.5'), 0.5);
  assert.equal(M.parseNumber('1 250'), 1250); assert.equal(M.parseNumber('abc'), null);
  assert.equal(M.parseNumber('1/2'), null); assert.equal(M.parseNumber(''), null);
  const ok = M.validate('in', { diameter: '0.5', speed: '300', teeth: '4', chip: '0.002', maxRpm: '' });
  assert.equal(ok.ok, true); assert.equal(ok.canon.maxRpm, null);
  rel(ok.canon.diameter, 12.7, 1e-12, 'inch converted to mm');
  const bad = M.validate('in', { diameter: 'x', speed: '-1', teeth: '2.5', chip: '0', maxRpm: 'fast' });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.errors.map((e) => e.field).sort(), ['chip', 'diameter', 'maxRpm', 'speed', 'teeth']);
  const range = M.validate('mm', { diameter: '5000', speed: '90', teeth: '4', chip: '0.05', maxRpm: '' });
  assert.equal(range.ok, false); assert.match(range.errors[0].message, /outside/);
  assert.ok(!/NaN|undefined/.test(range.errors[0].message));
});

test('the panel renderer uses the shared cutter API exactly as contracted', () => {
  const s = M.solve(half()), rec = recorder();
  const svg = D.renderPanel(s, 0.0123, { unit: 'in', title: 'Setup', idPrefix: 'tA', cutter: rec, insetPxPerMm: D.insetScale(half()) });
  assert.equal(rec.calls.length, 1);
  const call = rec.calls[0], m = M.motion(s, 0.0123);
  assert.equal(call.radius, D.PANEL.R);
  assert.equal(call.idPrefix, 'tA-cut');
  assert.deepEqual(call.teeth, m.teeth.map((t) => ({ psi: t.psi, engaged: t.engaged })));
  assert.ok(svg.includes('<g class="fs-cutter" transform="translate(' + D.PANEL.cx + ' ' + D.PANEL.cy + ')"><g data-stub="cutter"></g></g>'));
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(!/NaN|undefined|Infinity/.test(svg), 'no bad numbers');
  assert.match(svg, /Work feed 18\.3 in\/min/); assert.match(svg, /distance ×\d/);
  assert.match(svg, /schematic/); assert.doesNotMatch(svg, /cut surface|fs-lens/);
  // Two panels on one page need distinct clip-path ids.
  const other = D.renderPanel(s, 0.0123, { unit: 'in', idPrefix: 'tB', cutter: rec });
  assert.match(svg, /id="tA-inset"/); assert.match(other, /id="tB-inset"/);
  // Without any cutter API the panel says so instead of inventing one.
  const missing = D.renderPanel(s, 0, { unit: 'in', cutter: { render: null } });
  if (!fs.existsSync(CUTTER)) assert.match(missing, /cutter drawing not loaded/);
});

test('with the real shared cutter module, when present', { skip: !fs.existsSync(CUTTER) && 'interactives/cutter-geometry not on this branch yet' }, () => {
  const C = require(CUTTER);
  assert.equal(typeof C.render, 'function');
  const s = M.solve(half());
  for (const t of [0, 0.004, 0.02]) {
    const svg = D.renderPanel(s, t, { unit: 'in', idPrefix: 'real', cutter: C });
    assert.ok(!/NaN|undefined|Infinity/.test(svg));
    assert.ok(!/cutter drawing not loaded/.test(svg));
  }
  // demo.js resolves the shared module by itself in Node.
  assert.ok(!/cutter drawing not loaded/.test(D.renderPanel(s, 0, { unit: 'in' })));
});

test('the printed figures in the page are the renderer output', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.ok(page.includes(D.renderComparison(half(), 'in')), 'comparison figure current');
  assert.ok(page.includes(D.renderCircumference('0.5 in', '1.571 in')), 'circumference figure current');
  const cmp = D.renderComparison(half(), 'in');
  assert.match(cmp, /8 passes/); assert.equal((cmp.match(/16 passes/g) || []).length, 2);
  assert.match(cmp, /0\.0010 in\/tooth/); assert.match(cmp, /36\.7 in\/min/);
  rel(Math.PI * 0.5, 1.571, 5e-4, 'circumference label');
});

test('page and manifest follow the module contract', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.match(page, /^@@ID: feeds-and-speeds$/m);
  assert.match(page, /^@@SECTION: Milling$/m);
  assert.equal((page.match(/data-interactive="feeds-and-speeds"/g) || []).length, 1);
  let depth = 0;
  for (const tag of page.match(/<\/?section\b/g)) {
    depth += tag === '<section' ? 1 : -1;
    assert.ok(depth >= 0 && depth <= 1, 'no nested sections');
  }
  assert.equal(depth, 0);
  assert.ok(!/<script\b/.test(page), 'assets load through the manifest, not the page');
  assert.ok(!/<!--/.test(page), 'no authoring comments ship publicly');
  assert.ok(!/[A-Za-z]:\\|\/Users\//.test(page), 'no machine paths');

  const conf = fs.readFileSync(path.join(MOD, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@ID: feeds-and-speeds$/m);
  assert.match(conf, /^@@REQUIRES: cutter-geometry$/m);
  const js = conf.match(/^@@JS: (.+)$/m)[1].split(',').map((s) => s.trim());
  const css = conf.match(/^@@CSS: (.+)$/m)[1].split(',').map((s) => s.trim());
  assert.deepEqual(js, ['model.js', 'demo.js'], 'model loads before the demo that reads it');
  for (const f of js.concat(css)) assert.ok(fs.readdirSync(MOD).includes(f), f + ' exists, exact case');
  // No private copy of a cutter renderer in this module.
  const demo = fs.readFileSync(path.join(MOD, 'demo.js'), 'utf8');
  assert.ok(!/mill-tooth|renderCutter|function\s+tooth/i.test(demo), 'no forked cutter drawing');
});

test('the stylesheet uses theme tokens and never sets gold or red-orange as text', () => {
  const css = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const outsidePrint = css.slice(0, css.indexOf('@media print'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outsidePrint), 'no literal colours outside print');
  for (const rule of css.split('}')) {
    if (/\.fs-t\b|\.fs-t-|\.fs-v\b|\.fs-s\b|\.fs-k\b/.test(rule)) {
      assert.ok(!/(?:^|[\s;{])(fill|color):\s*var\(--(msu-gold|msu-redorange|flag|cat2|cat3)\)/.test(rule), 'text colour: ' + rule.trim());
    }
  }
  assert.match(css, /\.presenting/); assert.match(css, /@media print/);
  // Every selector is scoped to this module's own prefix or root.
  for (const rule of outsidePrint.split('}')) {
    const sel = rule.split('{')[0].trim();
    if (!sel || sel.startsWith('@') || /^(from|to|\d)/.test(sel)) continue;
    for (const part of sel.replace(/:is\([^)]*\)/g, ':is()').split(',')) assert.ok(/\.fs-|feeds-and-speeds|data-fs-|data-stale/.test(part), 'scoped: ' + part.trim());
  }
});

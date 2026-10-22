// Focused tests for interactives/feeds-and-speeds.
// Run: node --test --test-concurrency=2 tests/interactives/feeds-and-speeds.test.cjs
//
// The page's static figures are renderer output. After a deliberate change
// to a renderer, regenerate them from the same calls the last tests use:
//   D.renderCircumference('0.5 in', '1.571 in') and
//   D.renderStaticFigure(worked(), 'in', 'al-6061-t6').
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'feeds-and-speeds');
const M = require(path.join(MOD, 'model.js'));
const D = require(path.join(MOD, 'demo.js'));
const R = require(path.join(ROOT, 'interactives', 'material-removal', 'removal.js'));
const DATA = require(path.join(MOD, 'cutting-data.js'));
const PAGE = path.join(ROOT, 'collections', 'machining', 'pages', 'feeds-and-speeds.html');

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
/* The page's worked example, in canonical units. */
const worked = () => M.setupToCanon('in', { diameter: 0.5, speed: 300, teeth: 4, chip: 0.002, width: 0.1, depth: 0.5, maxRpm: null, eta: null });
const capped = () => M.setupToCanon('in', { diameter: 0.125, speed: 300, teeth: 2, chip: 0.0008, width: 0.05, depth: 0.1, maxRpm: 4000, eta: null });
const AL = DATA.get('al-6061-t6').energyJMm3;

test('an invalid nonblank machine cap makes dependent results unknown', () => {
  const input = { diameter: '0.5', speed: '400', teeth: '4', chip: '0.00415', width: '0.1', depth: '0.5', maxRpm: '0', eta: '' };
  const bad = M.readFields('in', input);
  assert.ok(bad.errors.some(e => e.field === 'maxRpm'));
  const p = M.partial(bad.values, bad.errors);
  for (const kind of ['rpm', 'feed', 'rate']) assert.ok(p.needs[kind].includes('maxRpm'));
  assert.equal(p.rpm, undefined); assert.equal(p.feed, undefined);
  assert.deepEqual(D.workedLines(bad.values, 'in', AL, bad.errors), []);
  const blank = M.readFields('in', Object.assign({}, input, { maxRpm: '' }));
  assert.equal(blank.errors.length, 0);
  assert.ok(M.partial(blank.values, blank.errors).rpm > 3000, 'an explicitly blank optional cap still means no cap');
});

test('the formula anchors, in both unit systems', () => {
  rel(M.spindleSpeedInch(300, 0.5), 12 * 300 / (Math.PI * 0.5), 1e-12, 'inch RPM');
  rel(M.spindleSpeed(90, 12), 1000 * 90 / (Math.PI * 12), 1e-12, 'metric RPM');
  rel(M.spindleSpeed(300 * M.M_PER_FT, 0.5 * M.MM_PER_IN), M.spindleSpeedInch(300, 0.5), 1e-12, 'inch and metric agree');
  rel(M.tableFeed(2000, 4, 0.05), 400, 1e-12, 'feed = n z fz');
  rel(M.chipLoad(400, 2000, 4), 0.05, 1e-12, 'fz = vf / (n z)');
  rel(M.cuttingSpeed(M.spindleSpeed(90, 12), 12), 90, 1e-12, 'cutting speed round-trips');
});

test('the worked examples on the page are what the modules compute', () => {
  const v = worked(), s = M.solve(v);
  assert.equal(M.show(s.rpm, 'rpm', 'in'), '2,292 rev/min');
  assert.equal(M.show(s.feed, 'feed', 'in'), '18.3 in/min');
  const q = R.removalRate(v.width, v.depth, s.feed), win = R.autoWindow(s.feed, v.diameter);
  assert.equal(win, 5);
  assert.equal(R.showRate(q, 'in'), '0.917 in³/min');
  assert.equal(R.showRate(q, 'mm'), '15.0 cm³/min');
  assert.equal(R.showLength(R.travel(s.feed, win), 'in'), '1.53 in');
  assert.equal(R.showVolume(R.volume(v.width, v.depth, R.travel(s.feed, win)), 'in'), '0.0764 in³');
  assert.equal(R.showPowerBoth(...R.powerBand(q, AL)), '110–210 W (0.15–0.28 hp)');
  assert.equal(R.showHp(...R.powerBand(q, DATA.get('stainless-304').energyJMm3)), '0.60–1.2 hp');
  const mid = D.guideMiddle('al-6061-t6', v.diameter);
  assert.equal(M.show(mid.speed, 'speed', 'in'), '400 SFM');
  assert.equal(M.show(mid.chip, 'chip', 'in'), '0.00415 in/tooth');
  const page = fs.readFileSync(PAGE, 'utf8');
  for (const t of ['2,292 rev/min', '18.3 in/min', '9,167 rev/min', '6.4 in/min', '131 SFM', '1.571 in', '2.3 times',
    '0.917\n  in&sup3;/min', '15.0 cm&sup3;/min', '1.53 in', '0.0764 in&sup3;', '0.15 to 0.28 hp', '110 to 210 W',
    '0.16 to 0.30 hp per in&sup3;/min', '0.65 to 1.3 hp per in&sup3;/min', '0.60 to 1.2 hp', '400 SFM', '0.00415 in/tooth', '745.7 W']) {
    assert.ok(page.includes(t), 'page states ' + JSON.stringify(t));
  }
  const c = M.solve(capped());
  assert.equal(M.format(c.requestedRpm, 'rpm', 'in'), '9,167');
  assert.equal(M.format(c.requestedRpm / c.rpm, 'feed', 'in'), '2.3');
});

test('nothing starts filled in: no examples, no hidden setup', () => {
  assert.equal(M.EXAMPLES, undefined);
  assert.equal(M.example, undefined);
  const demo = fs.readFileSync(path.join(MOD, 'demo.js'), 'utf8');
  assert.ok(!/EXAMPLES|data-fs-example|Illustrative numbers/.test(demo), 'no example buttons');
  // The only places a field is written are the guide button and the unit switch.
  const writes = demo.match(/(?<!function )setField\('|(?<!function )setField\(k,/g) || [];
  assert.deepEqual(writes, ["setField('", "setField('", 'setField(k,']);
  const empty = M.readFields('in', {});
  assert.deepEqual(empty.values, { maxRpm: null, eta: null });
  assert.deepEqual(empty.errors, []);
  assert.deepEqual(empty.missing.sort(), M.REQUIRED.slice().sort());
  const p = M.partial(empty.values);
  assert.equal(p.rpm, undefined); assert.equal(p.feed, undefined);
  assert.deepEqual(p.needs.rpm, ['diameter', 'speed']);
  assert.deepEqual(D.workedLines(empty.values, 'in', AL), []);
});

test('partial entries give each result as soon as its fields are valid', () => {
  const r = M.readFields('in', { diameter: '0.5', speed: '300' });
  const p = M.partial(r.values);
  assert.equal(M.show(p.rpm, 'rpm', 'in'), '2,292 rev/min');
  assert.equal(p.feed, undefined);
  assert.deepEqual(p.needs.feed, ['teeth', 'chip']);
  assert.equal(D.workedLines(r.values, 'in', AL).length, 1);
  // An invalid field is reported and treated as absent, never guessed.
  const bad = M.readFields('in', { diameter: '0.5', speed: 'fast', teeth: '2.5', chip: '0.002', width: '0.6', depth: '0' });
  assert.deepEqual(bad.errors.map((e) => e.field).sort(), ['depth', 'speed', 'teeth', 'width']);
  assert.match(bad.errors.find((e) => e.field === 'width').message, /more than the cutter diameter/);
  assert.equal(bad.values.speed, undefined); assert.equal(bad.values.width, undefined);
  const range = M.readFields('mm', { diameter: '5000' });
  assert.match(range.errors[0].message, /outside/);
  assert.ok(!/NaN|undefined/.test(range.errors[0].message));
  assert.equal(M.parseNumber('1,250'), 1250); assert.equal(M.parseNumber('.5'), 0.5);
  assert.equal(M.parseNumber('1/2'), null); assert.equal(M.parseNumber(''), null);
  // The complete-form wrapper still reports blanks.
  assert.equal(M.validate('in', { diameter: '0.5' }).ok, false);
  const ok = M.validate('in', { diameter: '0.5', speed: '300', teeth: '4', chip: '0.002', width: '0.1', depth: '0.5' });
  assert.equal(ok.ok, true); rel(ok.canon.width, 2.54, 1e-12, 'width in mm');
});

test('the worked lines carry removal and power, and the material changes only power', () => {
  const v = worked();
  const al = D.workedLines(v, 'in', AL), ss = D.workedLines(v, 'in', DATA.get('stainless-304').energyJMm3);
  assert.match(al[2], /0\.1 in × 0\.5 in × 18\.3 in\/min ≈ 0\.917 in³\/min/);
  assert.match(al[3], /0\.917 in³\/min × 0\.16–0\.30 hp per in³\/min ≈ 0\.15–0\.28 hp \(110–210 W\)/);
  assert.deepEqual(al.slice(0, 3), ss.slice(0, 3), 'geometry, speed and feed lines identical across materials');
  assert.notEqual(al[3], ss[3]);
  const metric = D.workedLines(Object.assign({}, v, { eta: 80 }), 'mm', AL);
  assert.match(metric[3], /15\.0 cm³\/min × 7\.3–14 W per cm³\/min ≈ 110–210 W \(0\.15–0\.28 hp\)/);
  assert.match(metric[4], /÷ 0\.8 ≈ 140–260 W/);
  // Without an energy band there is no power line.
  assert.equal(D.workedLines(v, 'in', null).length, 3);
});

test('the guide gives middle values only inside its diameter table', () => {
  const g = DATA.get('al-6061-t6');
  const mid = D.guideMiddle('al-6061-t6', 12.7);
  rel(mid.speed, (g.vcMMin[0] + g.vcMMin[1]) / 2, 1e-12, 'middle cutting speed');
  assert.deepEqual(Object.keys(mid).sort(), ['chip', 'speed'], 'never touches the cutter, flutes or cut');
  assert.equal(D.guideMiddle('al-6061-t6', 50).chip, null, 'no extrapolation past 1 in');
  assert.equal(D.guideMiddle('al-6061-t6', undefined).chip, null);
  assert.equal(D.guideMiddle('no-such-material', 12.7), null);
  assert.equal(M.bandPosition(250, [300, 500]), 'below');
  assert.equal(M.bandPosition(400, [300, 500]), 'inside');
  assert.equal(M.bandPosition(600, [300, 500]), 'above');
});

test('unit switching keeps the physical setup and leaves empty fields empty', () => {
  for (const setup of [worked(), capped()]) {
    const back = M.setupToCanon('in', M.setupFromCanon('in', M.setupToCanon('mm', M.setupFromCanon('mm', setup))));
    for (const k of Object.keys(setup)) {
      if (setup[k] === null) assert.equal(back[k], null, k + ' stays empty');
      else rel(back[k], setup[k], 1e-12, k);
    }
  }
  const partialSetup = M.setupToCanon('in', { diameter: 0.5 });
  assert.deepEqual(partialSetup, { diameter: 12.7, maxRpm: null, eta: null }, 'missing fields are not invented; optional ones stay empty');
  const s = M.solve(worked());
  assert.equal(M.show(worked().diameter, 'diameter', 'mm'), '12.7 mm');
  assert.equal(M.show(worked().width, 'width', 'mm'), '2.54 mm');
  assert.equal(M.show(s.rpm, 'rpm', 'mm'), M.show(s.rpm, 'rpm', 'in'));
  assert.equal(M.show(s.feed, 'feed', 'mm'), '466 mm/min');
  assert.equal(M.show(80, 'eta', 'in'), '80%');
});

test('a machine top speed separates requested from actual, and recomputes from actual', () => {
  const c = capped(), s = M.solve(c);
  assert.equal(s.capped, true);
  assert.equal(s.rpm, 4000);
  rel(s.feed, 4000 * 2 * c.chip, 1e-12, 'feed from actual RPM');
  rel(M.fromCanon('in', 'speed', s.speed), Math.PI * 0.125 * 4000 / 12, 1e-9, 'surface speed from actual RPM');
  const lines = D.workedLines(c, 'in', AL).join('\n');
  assert.match(lines, /tops out at 4,000 rev\/min/);
  assert.match(lines, /4,000 × 2 × 0\.0008 ≈ 6\.4 in\/min/);
  assert.match(lines, /131 SFM, not the 300 SFM asked for/);
  assert.ok(!/tops out/.test(D.workedLines(worked(), 'in', AL).join('\n')), 'no cap line when uncapped');
  const p = M.partial(c);
  assert.equal(p.capped, true); rel(p.speed, s.speed, 1e-12, 'partial agrees with solve');
});

test('the experiment: hold the table feed versus hold the chip load', () => {
  const c = worked();
  for (const f of [0.25, 0.5, 1.5, 2]) {
    const feed = M.trial(c, f, 'feed'), chip = M.trial(c, f, 'chip');
    rel(feed.change.feed, 1, 1e-12, 'feed held'); rel(feed.change.chip, 1 / f, 1e-12, 'chip load inverse');
    rel(chip.change.chip, 1, 1e-12, 'chip held'); rel(chip.change.feed, f, 1e-12, 'feed in step');
    // Removal follows the table feed and nothing else.
    const q0 = R.removalRate(c.width, c.depth, M.solve(c).feed);
    rel(R.removalRate(c.width, c.depth, feed.feed) / q0, 1, 1e-12, 'feed held: same removal');
    rel(R.removalRate(c.width, c.depth, chip.feed) / q0, f, 1e-12, 'chip held: removal in step');
  }
  assert.equal(M.ratioText(0.5), '×0.5'); assert.equal(M.ratioText(2), '×2'); assert.equal(M.ratioText(1), 'unchanged');
  assert.throws(() => M.trial(c, 2, 'rpm'), /chip or feed/);
  const t = M.trial(Object.assign({}, c, { maxRpm: 3000 }), 2, 'chip');
  assert.equal(t.capped, true); assert.equal(t.rpm, 3000);
});

test('the printed figures in the page are the renderer output', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.ok(page.includes(D.renderCircumference('0.5 in', '1.571 in')), 'circumference figure current');
  const fig = D.renderStaticFigure(worked(), 'in', 'al-6061-t6');
  assert.ok(page.includes(fig), 'removal and power figure current');
  assert.equal((fig.match(/class="fs-sweep"/g) || []).length, 3);
  assert.equal((fig.match(/<svg class="mr-svg"/g) || []).length, 3);
  assert.match(fig, /removed <strong>0\.0764 in³<\/strong>/);
  assert.match(fig, /removed <strong>0\.153 in³<\/strong>/, 'chip held: twice the volume');
  assert.equal((fig.match(/data-material=/g) || []).length, 10, 'all ten materials priced');
  assert.ok(!/NaN|undefined|Infinity/.test(fig));
  // The retired drawings are gone from the page.
  assert.ok(!/fs-compare-svg|tooth-pass|half-inch|Tooth-pass record/i.test(page));
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
  for (const s of DATA.materials[0].sources) assert.ok(page.includes(s.url), 'page cites ' + s.title);

  const conf = fs.readFileSync(path.join(MOD, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@ID: feeds-and-speeds$/m);
  assert.match(conf, /^@@REQUIRES: material-removal$/m);
  const js = conf.match(/^@@JS: (.+)$/m)[1].split(',').map((s) => s.trim());
  const css = conf.match(/^@@CSS: (.+)$/m)[1].split(',').map((s) => s.trim());
  assert.deepEqual(js, ['cutting-data.js', 'model.js', 'demo.js'], 'data and model load before the demo that reads them');
  for (const f of js.concat(css)) assert.ok(fs.readdirSync(MOD).includes(f), f + ' exists, exact case');
  const demo = fs.readFileSync(path.join(MOD, 'demo.js'), 'utf8');
  assert.ok(!/mill-tooth|renderCutter|function\s+tooth|CourseWikiCutter/i.test(demo), 'no cutter drawing of its own, and no spinning cutter');
  assert.ok(!/vcMMin\s*:\s*\[|energyJMm3\s*:\s*\[|chipLoads\s*:\s*\[/.test(demo + fs.readFileSync(path.join(MOD, 'model.js'), 'utf8')), 'no forked material data');
});

test('the stylesheet uses theme tokens and never sets gold or red-orange as text', () => {
  const css = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const outsidePrint = css.slice(0, css.indexOf('@media print'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outsidePrint), 'no literal colours outside print');
  for (const rule of css.split('}')) {
    if (/\.fs-t\b|\.fs-t-|\.fs-v\b|\.fs-s\b|\.fs-k\b|\.fs-guide-(band|pos)|\.fs-sweep-/.test(rule)) {
      assert.ok(!/(?:^|[\s;{])(fill|color):\s*var\(--(msu-gold|msu-redorange|flag|cat2|cat3|cat1|msu-liteblue)\)/.test(rule), 'text colour: ' + rule.trim());
    }
  }
  assert.match(css, /\.presenting/); assert.match(css, /@media print/);
  for (const rule of outsidePrint.split('}')) {
    const sel = rule.split('{')[0].trim();
    if (!sel || sel.startsWith('@') || /^(from|to|\d)/.test(sel)) continue;
    for (const part of sel.replace(/:is\([^)]*\)/g, ':is()').split(',')) assert.ok(/\.fs-|feeds-and-speeds|data-fs-/.test(part), 'scoped: ' + part.trim());
  }
});

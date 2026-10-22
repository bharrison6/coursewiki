// Focused tests for interactives/material-removal.
// Run: node --test --test-concurrency=2 tests/interactives/material-removal.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'material-removal');
const R = require(path.join(MOD, 'removal.js'));
const DATA = require(path.join(ROOT, 'interactives', 'feeds-and-speeds', 'cutting-data.js'));

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const IN = 25.4;
const run = (feed) => ({ feed, width: 0.1 * IN, depth: 0.5 * IN, diameter: 0.5 * IN });

test('removal rate, travel, volume and power follow the stated relations', () => {
  rel(R.removalRate(2, 3, 500), 3000, 1e-12, 'Q = ae ap vf');
  rel(R.travel(600, 5), 50, 1e-12, 'L = vf t / 60');
  rel(R.volume(2, 3, 50), 300, 1e-12, 'V = ae ap L');
  rel(R.volume(2, 3, R.travel(500, 60)), R.removalRate(2, 3, 500), 1e-12, 'one minute of travel holds one minute of removal');
  rel(R.power(60000, 2), 2000, 1e-12, 'P = Q u / 60');
  assert.equal(R.HP_W, 745.699871582);
  rel(R.toHp(745.699871582), 1, 1e-15, 'one mechanical horsepower');
  rel(R.shaftPower(800, 0.8), 1000, 1e-12, 'shaft = cutting / efficiency');
  const b = R.powerBand(60000, [1, 2]);
  assert.deepEqual(b.map(Math.round), [1000, 2000]);
});

test('energy bands read as horsepower per in3/min equal to 1/K, and W per cm3/min', () => {
  // 1018: K = 1.64 in3/min per hp -> 1/K = 0.61 hp per in3/min.
  const steel = DATA.get('steel-1018').energyJMm3;
  assert.match(R.showEnergy(steel, 'in'), /^0\.61 hp per in³\/min/);
  rel(R.toHp(R.power(R.MM3_PER_IN3, steel[0])), 1 / 1.64, 1e-9, 'one in3/min of 1018');
  const al = DATA.get('al-6061-t6').energyJMm3;
  assert.match(R.showEnergy(al, 'in'), /^0\.16–0\.30 hp per in³\/min/);
  assert.match(R.showEnergy(al, 'mm'), /^7\.3–14 W per cm³\/min \(0\.44–0\.82 J\/mm³\)$/);
});

test('display keeps estimates to a few figures and units consistent', () => {
  assert.equal(R.sig(0.0004166, 3), '0.000417');
  assert.equal(R.sig(12345, 3), '12,300');
  assert.equal(R.showPower(110, 205), '110–210 W');
  assert.equal(R.showPower(900, 1500), '0.90–1.5 kW');
  assert.equal(R.showHp(745.699871582), '1.0 hp');
  assert.equal(R.showRate(R.removalRate(0.1 * IN, 0.5 * IN, 18.3346 * IN), 'in'), '0.917 in³/min');
  assert.equal(R.showVolume(500, 'mm'), '500 mm³');
  assert.equal(R.showVolume(15000, 'mm'), '15.0 cm³');
});

test('a side cut can be no wider than the cutter', () => {
  assert.deepEqual(R.engagementErrors(10, 10, 5), []);
  assert.equal(R.engagementErrors(10, 10.5, 5)[0].field, 'width');
  assert.equal(R.engagementErrors(10, 0, 5)[0].field, 'width');
  assert.equal(R.engagementErrors(10, 5, 0)[0].field, 'depth');
});

test('the time span covers about three diameters of setup travel', () => {
  const w = R.autoWindow(18.33 * IN, 0.5 * IN);
  assert.equal(w, 5);
  assert.ok(R.travel(18.33 * IN, w) >= 1.5 * IN);
  assert.equal(R.autoWindow(0.01, 300), R.WINDOWS[R.WINDOWS.length - 1], 'a very slow feed stops at the longest span');
});

test('one frame, one scale: the gold slab is travel x scale long in every panel, at every time', () => {
  const a = run(18.33 * IN), b = run(2 * 18.33 * IN);
  const f = R.frame([a, b], 5, false);
  const again = R.frame([a, b], 5, false);
  assert.equal(f.scale, again.scale, 'frame is deterministic');
  const slab = (svg) => {
    const m = svg.match(/class="mr-removed mr-removed-front" d="M([\d.]+) [\d.]+L([\d.]+)/);
    return m ? Number(m[2]) - Number(m[1]) : 0;
  };
  for (const t of [1, 2.5, 5]) {
    for (const r of [a, b]) {
      const svg = R.renderSweep(r, t, f, { unit: 'in' });
      assert.ok(!/NaN|undefined|Infinity/.test(svg));
      rel(slab(svg), R.travel(r.feed, t) * f.scale, 0.01, 'slab length at t=' + t);
    }
  }
  // Doubling the feed doubles the drawn slab in the same frame.
  rel(slab(R.renderSweep(b, 3, f, {})) / slab(R.renderSweep(a, 3, f, {})), 2, 0.01, 'twice the feed, twice the slab');
  // Nothing removed at t = 0, and a compact frame is still one scale.
  assert.ok(!/mr-removed"/.test(R.renderSweep(a, 0, f, {})));
  const c = R.frame([a, b], 5, true);
  assert.ok(c.w < f.w && c.scale > 0);
  assert.match(R.renderSweep(a, 5, c, { unit: 'mm' }), /mr-svg-compact/);
});

test('the front of the cut is the cutter circle, and both slab ends share it', () => {
  const f = R.frame([run(400)], 5, false);
  for (const y of [0, f.ae / 2, f.ae]) {
    const x = R.frontX(f, 0, y);
    rel(Math.hypot(x - 0, y - f.yc), f.R, 1e-9, 'on the circle');
    rel(R.frontX(f, 7, y) - x, 7, 1e-12, 'translated copy');
  }
  rel(R.frontX(f, 0, f.ae), 0, 1e-9, 'meets the back of the cut at the cutter centre line');
});

test('changing the material changes only the power', () => {
  const q = R.removalRate(2.54, 12.7, 466);
  const rows = R.powerRows(q, DATA.materials);
  assert.equal(rows.length, 10);
  for (const r of rows) {
    const m = DATA.get(r.id);
    rel(r.lo, q * m.energyJMm3[0] / 60, 1e-12, r.id + ' low');
    rel(r.hi, q * m.energyJMm3[1] / 60, 1e-12, r.id + ' high');
    assert.ok(r.lo <= r.hi);
  }
  assert.equal(rows.find((r) => r.id === 'steel-1018').single, true);
  assert.equal(rows.find((r) => r.id === 'al-6061-t6').single, false);
  const html = R.renderPowerChart(q, DATA.materials, { unit: 'in', current: 'stainless-304' });
  assert.equal((html.match(/class="mr-row( is-current)?" data-material/g) || []).length, 10);
  assert.equal((html.match(/aria-current="true"/g) || []).length, 1);
  assert.match(html, /data-material="stainless-304" aria-current="true"/);
  assert.match(html, / hp</);
  assert.ok(!/NaN|undefined|Infinity/.test(html));
  assert.match(R.renderPowerChart(q, DATA.materials, { unit: 'mm' }), / W</);
});

test('module manifest and stylesheet follow the contract', () => {
  const conf = fs.readFileSync(path.join(MOD, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@ID: material-removal$/m);
  assert.match(conf, /^@@JS: removal\.js$/m);
  assert.match(conf, /^@@CSS: removal\.css$/m);
  const css = fs.readFileSync(path.join(MOD, 'removal.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const outsidePrint = css.slice(0, css.indexOf('@media print'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outsidePrint), 'no literal colours outside print');
  for (const rule of css.split('}')) {
    if (/\.mr-t\b|\.mr-name|\.mr-val|\.mr-axis\b/.test(rule)) {
      assert.ok(!/(?:^|[\s;{])(fill|color):\s*var\(--(msu-gold|msu-redorange|flag|cat2|cat3)\)/.test(rule), 'text colour: ' + rule.trim());
    }
  }
  for (const rule of outsidePrint.split('}')) {
    const sel = rule.split('{')[0].trim();
    if (!sel || sel.startsWith('@')) continue;
    for (const part of sel.split(',')) assert.ok(/\.mr-/.test(part), 'scoped: ' + part.trim());
  }
});

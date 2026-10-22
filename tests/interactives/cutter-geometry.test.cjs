// Focused tests for interactives/cutter-geometry, the shared end mill drawing.
// Run: node --test --test-concurrency=2 tests/interactives/cutter-geometry.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'cutter-geometry');
const C = require(path.join(MOD, 'cutter.js'));

const TAU = 2 * Math.PI;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const even = (n, start = 0.3) => Array.from({ length: n }, (_, i) => ({ psi: start + i * TAU / n, engaged: i === 0 }));
const num = (v) => { const r = Math.round(v * 100) / 100; return (r === 0 ? 0 : r).toString(); };

function segmentsCross(p, q, r, s) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(r, s, p), d2 = d(r, s, q), d3 = d(p, q, r), d4 = d(p, q, s);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) &&
    ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

test('every cutting tip lands at the radius and its own psi, in render and geometry', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 8]) {
    for (const R of [12, 100, 260]) {
      const teeth = even(n, -1.1);
      const g = C.geometry({ radius: R, teeth });
      const svg = C.render({ radius: R, teeth, idPrefix: 't' + n });
      teeth.forEach((t, i) => {
        near(Math.hypot(g.tips[i].x, g.tips[i].y), R, 1e-9, 'tip radius');
        near(Math.atan2(g.tips[i].y, g.tips[i].x), Math.atan2(Math.sin(t.psi), Math.cos(t.psi)), 1e-9, 'tip angle');
        // The tip is a vertex of the drawn outline, with y flipped to screen.
        const at = ' ' + num(R * Math.cos(t.psi)) + ' ' + num(-R * Math.sin(t.psi));
        assert.ok(svg.includes('M' + at.trim()) || svg.includes('L' + at.trim()), `tip vertex ${n}/${R}/${i}`);
      });
    }
  }
});

test('screen y is the mirror of math y', () => {
  const svg = C.render({ radius: 100, teeth: [{ psi: Math.PI / 2 }, { psi: -Math.PI / 2 }], idPrefix: 'y' });
  // Tip at the top of the circle in math terms is y = -100 on screen.
  assert.match(svg, /[ML]0 -100[LZ]/);
  assert.match(svg, /[ML]0 100[LZ]/);
});

test('outline is a simple closed shape between the core and the cutting circle', () => {
  // Control: the crossing check does see a crossing.
  assert.ok(segmentsCross({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }));
  assert.ok(!segmentsCross({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }));
  for (const n of [1, 2, 3, 4, 6, 8]) {
    const R = 100, g = C.geometry({ radius: R, teeth: even(n) });
    const pts = g.outline;
    let inner = Infinity;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y);
      assert.ok(r <= R + 1e-9, `${n} flutes: nothing reaches past the cutting circle (${r})`);
      inner = Math.min(inner, r);
    }
    near(inner, g.core, 0.5, `${n} flutes: gullet floors touch the core`);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      for (let j = i + 2; j < pts.length; j++) {
        if (i === 0 && j === pts.length - 1) continue;
        assert.ok(!segmentsCross(a, b, pts[j], pts[(j + 1) % pts.length]), `${n} flutes: edges ${i} and ${j} cross`);
      }
    }
  }
});

test('the profile teaches the right trade: more flutes, thicker core, less chip room', () => {
  let last = 0;
  for (const n of [2, 3, 4, 5, 6, 8]) {
    const p = C.profile(n);
    assert.ok(p.core > last, `${n}: core grows`);
    assert.ok(p.faceRoot > p.core && p.faceRoot < 1, `${n}: face root between core and rim`);
    last = p.core;
  }
});

test('rake face leans back against clockwise rotation and the gullet sits ahead of the edge', () => {
  const R = 100, teeth = even(4, 0.7), g = C.geometry({ radius: R, teeth });
  g.flutes.forEach((fl) => {
    const back = Math.atan2(fl.face.y, fl.face.x) - fl.psi;
    const wrapped = Math.atan2(Math.sin(back), Math.cos(back));
    assert.ok(wrapped > 0 && wrapped < 0.2, 'face root lies slightly counter-clockwise of its tip (positive rake)');
    const ahead = Math.atan2(fl.floor.y, fl.floor.x) - fl.psi;
    assert.ok(Math.atan2(Math.sin(ahead), Math.cos(ahead)) < 0, 'gullet floor lies clockwise of the tip');
    // Gullet circle is tangent to the face line at the face root.
    const cx = fl.gullet.x - fl.face.x, cy = fl.gullet.y - fl.face.y;
    near(cx * fl.faceDir.x + cy * fl.faceDir.y, 0, 1e-9, 'gullet tangent to the face');
    near(Math.hypot(cx, cy), fl.gullet.r, 1e-9, 'face root on the gullet circle');
  });
});

test('uneven spacing, one tooth and bad input', () => {
  const teeth = [{ psi: 0 }, { psi: 1.4 }, { psi: 3.0 }, { psi: 4.5 }];
  const g = C.geometry({ radius: 50, teeth });
  g.flutes.forEach((fl, i) => near(fl.psi, teeth[i].psi, 0, 'flutes keyed to their own tooth'));
  near(g.flutes[1].gap, 1.4, 1e-12, 'gap measured to the tooth ahead');
  assert.ok(!/NaN|undefined|Infinity/.test(C.render({ radius: 50, teeth, idPrefix: 'u' })));
  assert.ok(!/NaN|undefined|Infinity/.test(C.render({ radius: 50, teeth: [{ psi: 2 }], idPrefix: 'one' })));
  assert.throws(() => C.render({ radius: 50, teeth: [{ psi: 0 }, { psi: TAU }], idPrefix: 'd' }), /share one angle/);
  assert.throws(() => C.render({ radius: 0, teeth, idPrefix: 'z' }), /radius/);
  assert.throws(() => C.render({ radius: 50, teeth: [], idPrefix: 'z' }), /tooth/);
  assert.throws(() => C.render({ radius: 50, teeth: [{ psi: NaN }], idPrefix: 'z' }), /finite psi/);
  assert.throws(() => C.render({ radius: 50, teeth }), /idPrefix/);
  assert.throws(() => C.render({ radius: 50, teeth, idPrefix: '9x' }), /idPrefix/);
  assert.throws(() => C.render({ radius: 50, teeth, idPrefix: 'a"b' }), /idPrefix/);
});

test('a group fragment at the origin with prefix-scoped ids and no arbor hole', () => {
  const a = C.render({ radius: 100, teeth: even(4), idPrefix: 'left-cutter' });
  const b = C.render({ radius: 100, teeth: even(4), idPrefix: 'right_cutter2' });
  for (const svg of [a, b]) {
    assert.ok(svg.startsWith('<g') && svg.endsWith('</g>'), 'one group');
    assert.ok(!/<svg\b|transform="translate/.test(svg), 'no wrapper and no offset');
    assert.ok(!/<circle\b/.test(svg), 'no hole or hub circle');
    assert.ok(!/NaN|undefined|Infinity/.test(svg));
  }
  const ids = (s) => [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const refs = (s) => [...s.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(ids(a).every((id) => id.startsWith('left-cutter-')));
  assert.ok(ids(b).every((id) => id.startsWith('right_cutter2-')));
  assert.equal(ids(a).filter((id) => ids(b).includes(id)).length, 0, 'two cutters on one page share no ids');
  for (const s of [a, b]) for (const r of refs(s)) assert.ok(ids(s).includes(r), 'every url() resolves inside its own fragment');
  assert.equal(C.render({ radius: 100, teeth: even(4), idPrefix: 'x' }), C.render({ radius: 100, teeth: even(4), idPrefix: 'x' }), 'deterministic');
  assert.equal((a.match(/class="cw-cutter-edge is-engaged"/g) || []).length, 1, 'engaged tooth marked');
});

test('module contract: manifest, pure script, token-only stylesheet', () => {
  const conf = fs.readFileSync(path.join(MOD, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@ID: cutter-geometry$/m);
  assert.match(conf, /^@@CSS: cutter\.css$/m);
  assert.match(conf, /^@@JS: cutter\.js$/m);
  assert.match(conf, /^@@END$/m);
  const js = fs.readFileSync(path.join(MOD, 'cutter.js'), 'utf8');
  assert.ok(!/\bdocument\b|\bwindow\b|Math\.random|Date\.now/.test(js.replace(/\/\*[\s\S]*?\*\//g, '')), 'pure');
  assert.match(js, /root\.CourseWikiCutter = api/);
  const css = fs.readFileSync(path.join(MOD, 'cutter.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgb\(/.test(css), 'no literal colours');
  for (const rule of css.split('}')) {
    if (/\.cw-cutter-(body|hatch)\s*\{/.test(rule)) assert.ok(!/(^|[;{\s])fill\s*:/.test(rule), 'no class fill over the url() fill: ' + rule.trim());
  }
  for (const sel of css.match(/^[^{}@]+(?=\{)/gm) || []) {
    for (const part of sel.split(',')) assert.match(part.trim(), /^\.cw-cutter/, 'scoped selector: ' + part.trim());
  }
});

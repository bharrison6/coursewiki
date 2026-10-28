'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..'), folder = path.join(root, 'interactives/saw-teeth-in-cut');
const page = fs.readFileSync(path.join(root, 'collections/machining/pages/saw-blade-selection.html'), 'utf8');
const D = require(path.join(folder, 'render.js'));
test('single embed includes generated static cases, noscript and topic links', () => {
  assert.equal((page.match(/data-interactive="saw-teeth-in-cut"/g) || []).length, 1);
  assert.equal(page.split('<!-- SAW-TEETH-IN-CUT-STATIC -->')[1].split('<!-- /SAW-TEETH-IN-CUT-STATIC -->')[0].trim(), D.staticLesson());
  assert.match(page, /<noscript>/); assert.match(page, /\[\[cutoff-sawing\]\]/);
  assert.match(page, /\[\[collection:safety\|Safety collection\]\]/);
  assert.match(page, /two decimal places/); assert.match(page, /exact entry and exit tangencies/);
  assert.doesNotMatch(page, /<script\b/);
});
test('page has no raw internal hrefs; probe detects a planted bad link', () => {
  const badLinks = html => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => !/^https?:\/\//.test(h) && !/^\.\.\/practice\.html#/.test(h));
  assert.deepEqual(badLinks(page), []);
  assert.deepEqual(badLinks(page + '<a href="cutoff-sawing.html">bad</a>'), ['cutoff-sawing.html']);
});
test('manifest orders scoped assets and print restores generated fallback', () => {
  const manifest = fs.readFileSync(path.join(folder, 'interactive.conf'), 'utf8');
  const assets = [...manifest.matchAll(/^@@(?:CSS|JS): (.+)$/gm)].flatMap(m => m[1].split(',').map(s => s.trim()));
  assert.deepEqual(assets, ['demo.css', 'model.js', 'render.js', 'demo.js']);
  assets.forEach(f => assert.ok(fs.readdirSync(folder).includes(f)));
  const css = fs.readFileSync(path.join(folder, 'demo.css'), 'utf8');
  assert.match(css, /@media print[\s\S]*\.st-live > \.st-static/);
  assert.match(css, /prefers-reduced-motion/);
});

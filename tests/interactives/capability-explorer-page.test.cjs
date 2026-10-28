'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..'), folder = path.join(root, 'interactives/capability-explorer');
const page = fs.readFileSync(path.join(root, 'collections/machining/pages/process-capability.html'), 'utf8');
const D = require(path.join(folder, 'render.js'));
test('one module embed contains generated no-JS and print comparison', () => {
  assert.equal((page.match(/data-interactive="capability-explorer"/g) || []).length, 1);
  assert.equal(page.split('<!-- CAPABILITY-EXPLORER-STATIC -->')[1].split('<!-- /CAPABILITY-EXPLORER-STATIC -->')[0].trim(), D.staticLesson());
  assert.match(page, /<noscript>/); assert.match(page, /stable process with roughly normal output/);
  assert.match(page, /158,655 ppm/); assert.match(page, /45,500 ppm/);
  assert.doesNotMatch(page, /<script\b/);
});
test('manifest uses ordered topic assets and CSS restores the fallback for printing', () => {
  const manifest = fs.readFileSync(path.join(folder, 'interactive.conf'), 'utf8');
  const assets = [...manifest.matchAll(/^@@(?:CSS|JS): (.+)$/gm)].flatMap(m => m[1].split(',').map(s => s.trim()));
  assert.deepEqual(assets, ['demo.css', 'model.js', 'render.js', 'demo.js']);
  assets.forEach(f => assert.ok(fs.existsSync(path.join(folder, f))));
  const css = fs.readFileSync(path.join(folder, 'demo.css'), 'utf8');
  assert.match(css, /@media print[\s\S]*\.ce-live > \.ce-static/);
  assert.match(css, /prefers-reduced-motion/);
});

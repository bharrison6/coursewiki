'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const D = require('../../interactives/coolant-mix/render.js');
const page = fs.readFileSync('collections/machining/pages/coolant-concentration.html', 'utf8');
test('exactly one embed carries generated static examples and semantic links', () => {
  assert.equal((page.match(/data-interactive="coolant-mix"/g) || []).length, 1);
  assert.equal(page.split('<!-- COOLANT-MIX-STATIC -->')[1].split('<!-- /COOLANT-MIX-STATIC -->')[0].trim(), D.staticLesson());
  assert.match(page, /<noscript>/); assert.match(D.staticLesson(), /4\.76%/); assert.match(D.staticLesson(), /2\.1053 L/);
  assert.match(page, /\[\[collection:safety\|Safety collection\]\]/); assert.match(page, /\[\[coolant-maintenance\]\]/);
  const rawSafety = /href=["'][^"']*safety[^"']*["']/;
  assert.ok(rawSafety.test('<a href="../safety/index.html">')); // Positive control for the absence check.
  assert.doesNotMatch(page, rawSafety);
});
test('manifest assets exist and print restores the static lesson', () => {
  const dir = 'interactives/coolant-mix/';
  const manifest = fs.readFileSync(dir + 'interactive.conf', 'utf8');
  const assets = [...manifest.matchAll(/^@@(?:CSS|JS): (.+)$/gm)].flatMap(m => m[1].split(',').map(s => s.trim()));
  assert.deepEqual(assets, ['demo.css', 'model.js', 'render.js', 'demo.js']); assets.forEach(f => assert.ok(fs.existsSync(dir + f)));
  const css = fs.readFileSync(dir + 'demo.css', 'utf8');
  assert.match(css, /@media print[\s\S]*\.cm-live > \.cm-static/); assert.match(css, /prefers-reduced-motion/);
});

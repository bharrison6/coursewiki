'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..'), folder = path.join(root, 'interactives/css-explorer');
const page = fs.readFileSync(path.join(root, 'collections/machining/pages/cnc-turning-speeds-and-feeds.html'), 'utf8');
const D = require(path.join(folder, 'render.js'));
test('one embed at the clamp explanation retains the generated print/no-JS lesson', () => {
  assert.equal((page.match(/data-interactive="css-explorer"/g) || []).length, 1);
  const staticText = page.split('<!-- CSS-EXPLORER-STATIC -->')[1].split('<!-- /CSS-EXPLORER-STATIC -->')[0].trim();
  assert.equal(staticText, D.staticLesson());
  assert.equal((staticText.match(/<tr><th scope="row">/g) || []).length, 3);
  assert.equal((staticText.match(/<svg /g) || []).length, 2);
  assert.match(staticText, /458\.37/); assert.match(staticText, /130\.9/); assert.match(staticText, /0\.917 in/);
  assert.match(page, /<noscript>/); assert.doesNotMatch(page, /<script\b/);
  assert.ok(page.indexOf('data-interactive="css-explorer"') > page.indexOf('G50 S1800'));
  assert.match(page, /\[\[cnc-program-proving\]\]/); assert.match(page, /\[\[collection:safety\|Safety collection\]\]/); assert.doesNotMatch(page, /href="\.\.\/safety\//);
});
test('module uses ordered loader assets and restores static figures when printed', () => {
  const manifest = fs.readFileSync(path.join(folder, 'interactive.conf'), 'utf8');
  const assets = [...manifest.matchAll(/^@@(?:CSS|JS): (.+)$/gm)].flatMap(m => m[1].split(',').map(s => s.trim()));
  assert.deepEqual(assets, ['demo.css', 'model.js', 'render.js', 'demo.js']);
  assets.forEach(f => assert.ok(fs.readdirSync(folder).includes(f)));
  const css = fs.readFileSync(path.join(folder, 'demo.css'), 'utf8');
  assert.match(css, /@media print[\s\S]*\.cs-lab \{ display: none !important/);
  assert.match(css, /@media print[\s\S]*\.cs-live > \.cs-static \{ display: block !important/);
});

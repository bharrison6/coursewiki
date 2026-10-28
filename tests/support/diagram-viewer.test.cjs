const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Element, parse } = require('./viewer-dom.cjs');
const root = path.resolve(__dirname, '../..');
test('built page DOM has no empty viewer image before open or after close', () => {
  const document = parse(fs.readFileSync(path.join(root, 'docs/engineering-graphics/alphabet-of-lines.html'), 'utf8'));
  document.body = document.querySelector('body');
  document.documentElement = document.querySelector('html');
  document.createElement = tag => new Element(tag);
  Object.defineProperty(document, 'images', { get: () => document.querySelectorAll('img') });
  const app = fs.readFileSync(path.join(root, 'theme/app.js'), 'utf8');
  const viewer = app.slice(app.indexOf('  (function () {', app.indexOf('/* ---- content diagram viewer')), app.lastIndexOf('\n})();'));
  vm.runInNewContext(viewer, { document, window: { HTMLDialogElement: Element }, URLSearchParams,
    location: { search: '' }, addEventListener() {}, matchMedia: () => ({ matches: false }),
    $: (s, el = document) => el.querySelector(s), $$: (s, el = document) => el.querySelectorAll(s) });
  const dialog = document.querySelector('.diagram-viewer');
  assert.ok(dialog, 'real built page initializes the viewer');
  const noEmpty = () => assert.equal(document.images.filter(img => !img.src).length, 0);
  noEmpty(); assert.equal(dialog.querySelectorAll('img').length, 0);
  // Positive control proves the empty-image probe sees the original defect.
  const empty = dialog.appendChild(new Element('img'));
  assert.equal(document.images.filter(img => !img.src).length, 1); empty.remove();
  const source = document.querySelector('.diagram-expandable'); assert.ok(source);
  for (let i = 0; i < 2; i++) {
    source.dispatch('click'); noEmpty();
    assert.equal(dialog.querySelector('img').src, source.src);
    assert.equal(dialog.querySelectorAll('img').length, 1);
    dialog.close(); noEmpty(); assert.equal(dialog.querySelectorAll('img').length, 0);
  }
});

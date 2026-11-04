'use strict';
// Keep the no-JavaScript / search / print lesson identical to the live renderer.
// node static.cjs --check (default, read-only) or --write after changing model or renderer.
const fs = require('node:fs');
const path = require('node:path');
const D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/materials-and-processes/pages/fiber-direction-and-stiffness.html');
const start = '<!-- LAMINATE-STACKING-STATIC -->';
const end = '<!-- /LAMINATE-STACKING-STATIC -->';
const source = fs.readFileSync(file, 'utf8');
const a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a || source.indexOf(start, a + 1) >= 0) throw new Error('Exactly one ordered pair of laminate static markers is required');
const output = source.slice(0, a + start.length) + '\n      ' + D.staticLesson() + '\n      ' + source.slice(b);
if (process.argv.includes('--write')) {
  if (source !== output) fs.writeFileSync(file, output);
  console.log('Laminate static lesson written.');
} else if (source !== output) { console.error('Laminate static lesson is stale: run node interactives/laminate-stacking/static.cjs --write'); process.exitCode = 1; }
else console.log('Laminate static lesson matches the model and renderer.');

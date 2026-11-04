'use strict';
// Writes or checks the no-JS/search/print fallback inside the page's data-interactive mount.
// Usage: node interactives/tensile-test/static.cjs [--write]
const fs = require('node:fs');
const path = require('node:path');
const D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/materials-and-processes/pages/metals-and-their-properties.html');
const start = '<!-- TENSILE-TEST-STATIC -->', end = '<!-- /TENSILE-TEST-STATIC -->';
const source = fs.readFileSync(file, 'utf8');
const a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Missing or reversed static markers');
const output = source.slice(0, a + start.length) + '\n    ' + D.staticLesson() + '\n    ' + source.slice(b);
if (process.argv.includes('--write')) fs.writeFileSync(file, output);
else if (source !== output) { console.error('Regenerate the tensile test fallback with static.cjs --write'); process.exitCode = 1; }
else console.log('Tensile test static fallback matches.');

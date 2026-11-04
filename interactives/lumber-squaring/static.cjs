'use strict';
// Keeps the no-JS, search and print fallback inside the page mount in step with the shared renderer.
// node interactives/lumber-squaring/static.cjs          check (exit 1 when stale)
// node interactives/lumber-squaring/static.cjs --write  regenerate
const fs = require('node:fs'), path = require('node:path'), R = require('./render.js');
const file = path.resolve(__dirname, '../../collections/materials-and-processes/pages/milling-rough-lumber-square.html');
const start = '<!-- LUMBER-SQUARING-STATIC -->', end = '<!-- /LUMBER-SQUARING-STATIC -->';
const source = fs.readFileSync(file, 'utf8'), a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Static lumber-squaring markers must occur once, in order');
const output = source.slice(0, a + start.length) + '\n' + R.staticLesson() + '\n' + source.slice(b);
if (process.argv.includes('--write')) { fs.writeFileSync(file, output); console.log('Lumber-squaring static lesson written.'); }
else if (output !== source) { console.error('Lumber-squaring static lesson needs regeneration (run with --write).'); process.exitCode = 1; }
else console.log('Lumber-squaring static lesson matches the shared renderer.');

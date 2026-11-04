'use strict';
// Regenerate (--write) or verify (default / --check) the static lesson inside the page's mount.
const fs = require('node:fs'), path = require('node:path'), D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/engineering-graphics/pages/3d-printing-from-cad.html');
const start = '<!-- PRINT-ORIENTATION-STATIC -->', end = '<!-- /PRINT-ORIENTATION-STATIC -->';
const source = fs.readFileSync(file, 'utf8'), a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Static print-orientation markers must occur in order');
const output = source.slice(0, a + start.length) + '\n      ' + D.staticLesson() + '\n      ' + source.slice(b);
if (process.argv.includes('--write')) { fs.writeFileSync(file, output); console.log('Print-orientation static lesson written.'); }
else if (output !== source) { console.error('Print-orientation static lesson needs regeneration (node static.cjs --write).'); process.exitCode = 1; }
else console.log('Print-orientation static lesson matches the shared renderer.');

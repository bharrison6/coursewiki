'use strict';
// Keeps the page's no-JS / print / search lesson identical to the shared renderer's output.
// node static.cjs          -> check (exit 1 when the page needs regeneration)
// node static.cjs --write  -> regenerate between the markers
const fs = require('node:fs'), path = require('node:path'), D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/engineering/pages/backlash-and-lost-motion.html');
const start = '<!-- BACKLASH-LOST-MOTION-STATIC -->', end = '<!-- /BACKLASH-LOST-MOTION-STATIC -->';
const source = fs.readFileSync(file, 'utf8'), a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Static backlash markers must occur in order');
const output = source.slice(0, a + start.length) + '\n    ' + D.staticLesson() + '\n    ' + source.slice(b);
if (process.argv.includes('--write')) { fs.writeFileSync(file, output); console.log('Backlash static lesson written.'); }
else if (output !== source) { console.error('Backlash static lesson needs regeneration.'); process.exitCode = 1; }
else console.log('Backlash static lesson matches the shared renderer.');

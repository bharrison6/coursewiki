'use strict';
// Run --write to regenerate only the marked static lesson inside the embed.
const fs = require('node:fs'), path = require('node:path'), D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/machining/pages/saw-blade-selection.html');
const start = '<!-- SAW-TEETH-IN-CUT-STATIC -->', end = '<!-- /SAW-TEETH-IN-CUT-STATIC -->';
const source = fs.readFileSync(file, 'utf8');
const a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Static figure markers must occur in order');
const output = source.slice(0, a + start.length) + '\n      ' + D.staticLesson() + '\n      ' + source.slice(b);
if (process.argv.includes('--write')) fs.writeFileSync(file, output);
else if (source !== output) { console.error('Saw-teeth-in-cut static figures need regeneration.'); process.exitCode = 1; }
else console.log('Saw-teeth-in-cut static figures match the model and renderer.');

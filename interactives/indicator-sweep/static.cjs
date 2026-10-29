'use strict';
// Run --write to regenerate only the marked static lesson inside the owned host page.
const fs = require('node:fs'), path = require('node:path'), D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/machining/pages/milling-workholding.html');
const start = '<!-- INDICATOR-SWEEP-STATIC -->', end = '<!-- /INDICATOR-SWEEP-STATIC -->';
const source = fs.readFileSync(file, 'utf8'), a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Indicator-sweep static markers must occur in order');
const output = source.slice(0, a + start.length) + '\n      ' + D.staticLesson() + '\n      ' + source.slice(b);
if (process.argv.includes('--write')) fs.writeFileSync(file, output);
else if (source !== output) { console.error('Indicator-sweep static lesson needs regeneration.'); process.exitCode = 1; }
else console.log('Indicator-sweep static lesson matches the model and renderer.');


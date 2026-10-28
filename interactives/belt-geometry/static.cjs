'use strict';
const fs = require('node:fs');
const path = require('node:path');
const D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/engineering/pages/belt-drives.html');
const start = '<!-- BELT-GEOMETRY-STATIC -->', end = '<!-- /BELT-GEOMETRY-STATIC -->';
const source = fs.readFileSync(file, 'utf8');
const a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Missing or reversed static markers');
const output = source.slice(0, a + start.length) + '\n      ' + D.staticLesson() + '\n      ' + source.slice(b);
if (process.argv.includes('--write')) fs.writeFileSync(file, output);
else if (source !== output) { console.error('Regenerate belt geometry fallback with static.cjs --write'); process.exitCode = 1; }
else console.log('Belt geometry static fallback matches.');

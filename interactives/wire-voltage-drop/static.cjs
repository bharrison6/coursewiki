'use strict';
const fs = require('node:fs');
const path = require('node:path');
const D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/engineering/pages/wire-and-wire-gauge.html');
const start = '<!-- WIRE-VOLTAGE-DROP-STATIC -->', end = '<!-- /WIRE-VOLTAGE-DROP-STATIC -->';
const source = fs.readFileSync(file, 'utf8');
const a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Missing or reversed static markers');
const output = source.slice(0, a + start.length) + '\n      ' + D.staticLesson() + '\n      ' + source.slice(b);
if (process.argv.includes('--write')) fs.writeFileSync(file, output);
else if (source !== output) { console.error('Regenerate wire voltage drop fallback with static.cjs --write'); process.exitCode = 1; }
else console.log('Wire voltage drop static fallback matches.');

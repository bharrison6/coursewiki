'use strict';
// Regenerates the static (print / no-JS / search) fallback inside the chain-drives page mount
// from the same pure renderer the live lab uses.
//   node interactives/chain-chordal-action/static.cjs --check   (default; exit 1 if stale)
//   node interactives/chain-chordal-action/static.cjs --write
const fs = require('node:fs');
const path = require('node:path');
const D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/engineering/pages/chain-drives.html');
const start = '<!-- CHAIN-CHORDAL-STATIC -->', end = '<!-- /CHAIN-CHORDAL-STATIC -->';
const source = fs.readFileSync(file, 'utf8');
const a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Missing or reversed static markers');
const output = source.slice(0, a + start.length) + '\n      ' + D.staticLesson() + '\n      ' + source.slice(b);
if (process.argv.includes('--write')) { fs.writeFileSync(file, output); console.log('Chain chordal static fallback written.'); }
else if (source !== output) { console.error('Regenerate the chain chordal fallback with static.cjs --write'); process.exitCode = 1; }
else console.log('Chain chordal static fallback matches.');

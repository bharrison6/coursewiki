'use strict';
// Keep the no-JavaScript / print figures identical to the live renderer.
// Run with --write after changing the renderer; without it (or with --check) it only compares.
const fs = require('node:fs');
const path = require('node:path');
const D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/engineering/pages/electric-motor-principles.html');
const blocks = [
  ['<!-- DC-MOTOR-COMMUTATION-VIEWS -->', '<!-- /DC-MOTOR-COMMUTATION-VIEWS -->', D.staticViews()],
  ['<!-- DC-MOTOR-COMMUTATION-TRACE -->', '<!-- /DC-MOTOR-COMMUTATION-TRACE -->', D.staticTrace()]
];
const source = fs.readFileSync(file, 'utf8');
let output = source;
for (const [start, end, markup] of blocks) {
  const a = output.indexOf(start), b = output.indexOf(end);
  if (a < 0 || b <= a || output.indexOf(start, a + 1) >= 0) throw new Error('Static figure markers must occur once and in order: ' + start);
  const indent = '\n        ';
  output = output.slice(0, a + start.length) + indent + markup + indent + output.slice(b);
}
if (process.argv.includes('--write')) { fs.writeFileSync(file, output); console.log('DC motor commutation static figures written.'); }
else if (source !== output) { console.error('DC motor commutation static figures need regeneration: node interactives/dc-motor-commutation/static.cjs --write'); process.exitCode = 1; }
else console.log('DC motor commutation static figures match the model and renderer.');

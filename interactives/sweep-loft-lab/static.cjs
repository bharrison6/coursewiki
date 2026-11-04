'use strict';
// Regenerate (--write) or verify (default / --check) the static lessons inside the
// sweep-loft-lab mounts on the sweeps-and-lofts page from the shared renderer.
const fs = require('node:fs'), path = require('node:path'), L = require('./lessons.js');
const file = path.resolve(__dirname, '../../collections/engineering-graphics/pages/sweeps-and-lofts.html');
const blocks = { sweep: L.staticSweep(), loft: L.staticLoft(), challenge: L.staticChallenges() };
const source = fs.readFileSync(file, 'utf8');
let output = source;
for (const [mode, html] of Object.entries(blocks)) {
  const start = '<!-- SWEEP-LOFT-LAB-STATIC:' + mode + ' -->', end = '<!-- /SWEEP-LOFT-LAB-STATIC:' + mode + ' -->';
  const a = output.indexOf(start), b = output.indexOf(end);
  if (a < 0 || b <= a) throw new Error('Static ' + mode + ' markers must occur once, in order');
  output = output.slice(0, a + start.length) + '\n    ' + html + '\n    ' + output.slice(b);
}
if (process.argv.includes('--write')) { fs.writeFileSync(file, output); console.log('Wrote static sweep-loft-lab lessons.'); }
else if (output !== source) { console.error('Sweep-loft-lab static lessons need regeneration: node interactives/sweep-loft-lab/static.cjs --write'); process.exitCode = 1; }
else console.log('Sweep-loft-lab static lessons match the shared renderer.');

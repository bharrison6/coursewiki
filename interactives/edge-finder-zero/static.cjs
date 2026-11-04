'use strict';
// Regenerates the marked static lessons inside the host page from the same model and renderer.
//   node interactives/edge-finder-zero/static.cjs --check   (default; exit 1 when stale)
//   node interactives/edge-finder-zero/static.cjs --write
const fs = require('node:fs'), path = require('node:path'), D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/machining/pages/mill-indicating-and-zero.html');
const blocks = [['EDGE-FINDER-ZERO-STATIC', D.staticLesson], ['EDGE-FINDER-ZERO-LENGTH-STATIC', D.staticLength]];
const source = fs.readFileSync(file, 'utf8');
let output = source;
for (const [name, make] of blocks) {
  const start = '<!-- ' + name + ' -->', end = '<!-- /' + name + ' -->';
  const a = output.indexOf(start), b = output.indexOf(end);
  if (a < 0 || b <= a || output.indexOf(start, a + 1) >= 0) throw new Error(name + ' markers must occur once and in order');
  output = output.slice(0, a + start.length) + '\n      ' + make() + '\n      ' + output.slice(b);
}
if (process.argv.includes('--write')) { fs.writeFileSync(file, output); console.log('Edge-finder static lessons written.'); }
else if (source !== output) { console.error('Edge-finder static lessons need regeneration (run with --write).'); process.exitCode = 1; }
else console.log('Edge-finder static lessons match the model and renderer.');

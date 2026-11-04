'use strict';
// Regenerates the static lesson inside the explorer mount from the same model and renderer.
//   node static.cjs --check   (default) exit 1 if the page differs from the generated copy
//   node static.cjs --write   rewrite the marked block in the page
const fs = require('node:fs'), path = require('node:path');
const M = require('./model.js'), R = require('./render.js');
const file = path.resolve(__dirname, '../../collections/engineering-graphics/pages/section-views.html');
const start = '<!-- SECTION-VIEW-EXPLORER-STATIC -->', end = '<!-- /SECTION-VIEW-EXPLORER-STATIC -->';

function lesson() {
  const full = M.compute('bushing', { mode: 'full', s: 0 });
  const half = M.compute('pulley', { mode: 'half' });
  const offset = M.compute('bracket', { mode: 'offset', a: -10, b: 3 });
  // Hatched area by hand: wall thickness × height on each side of the bore.
  const byHand = 2 * ((20 - 10) * 30 + (30 - 10) * 2 + (30 - 15) * 8);
  if (Math.abs(full.view.capArea - byHand) > 1e-9) throw new Error('Worked example area ' + full.view.capArea + ' does not match ' + byHand);
  const fig = (r, caption) => '<figure>' + R.sheet(r) + '<figcaption>' + caption + '</figcaption></figure>';
  const regions = full.view.faces.map(f => '<li><strong>Region ' + f.n + ':</strong> ' + f.describe + '</li>').join('');
  return '<div class="sve-static">' +
    '<p><strong>Worked example: a full section through the flanged bushing.</strong> Plane A–A runs through the axis. Its arrows point toward the back of the part, so the front half is imagined removed and you look at the cut face from the front. Only material the plane passes through is hatched: the bore and counterbore are empty, and the surfaces you see through them lie beyond the plane.</p>' +
    '<div class="sve-static-figs">' +
    fig(full, 'Full section: the two hatched walls include the flange; the counterbore step shows as a visible edge beyond the plane.') +
    fig(half, 'Half section of the pulley: one quarter is removed, so the right half of the view is in section and the left half shows the outside. A center line divides them.') +
    fig(offset, 'Offset section of the bracket: the plane jogs to pass through the blind hole and the slot. Both cuts appear in one view, with no line at the jog.') +
    '</div>' +
    '<p>Regions of the bushing section, top to bottom and left to right:</p><ol>' + regions + '</ol>' +
    '<p><strong>Check the hatched area:</strong> each side of the bore contributes wall thickness × height, so 2 × [(20 − 10) × 30 + (30 − 10) × 2 + (30 − 15) × 8] = ' + byHand + ' mm². A hole crossed by the plane removes area from the cut face; it is never hatched.</p>' +
    '</div>';
}

const source = fs.readFileSync(file, 'utf8'), a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Static section-explorer markers must occur in order in ' + file);
const output = source.slice(0, a + start.length) + '\n    ' + lesson() + '\n    ' + source.slice(b);
if (process.argv.includes('--write')) { fs.writeFileSync(file, output); console.log('Wrote the static section-explorer lesson.'); }
else if (output !== source) { console.error('Section-explorer static lesson needs regeneration: node static.cjs --write'); process.exitCode = 1; }
else console.log('Section-explorer static lesson matches the shared model and renderer.');

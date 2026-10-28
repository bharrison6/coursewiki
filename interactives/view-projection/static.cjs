// Regenerate only this module's original teaching figures.
const fs = require('node:fs');
const path = require('node:path');
const { parts, project } = require('./model.js');
const { drawing, pictorial } = require('./render.js');
const dest = path.resolve(__dirname, '../../media/engineering-graphics');
fs.mkdirSync(dest, { recursive: true });
const write = (name, svg) => fs.writeFileSync(path.join(dest, name), svg + '\n');
const svg = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><rect width="${w}" height="${h}" fill="white"/><g fill="#182c40" font-family="system-ui,sans-serif" font-size="18">${body}</g></svg>`;
const txt = (x, y, t, more = '') => `<text x="${x}" y="${y}" ${more}>${t}</text>`;
const line = (x1, y1, x2, y2, extra = '') => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="#182c40" stroke-width="1.7" ${extra}/>`;
const inner = s => s.replace(/<svg[^>]*>/, '').replace(/<\/svg>$/, '');
write('stepped-projections.svg', svg(880, 400, 'Tall left strip: pictorial and third-angle front, top and right views',
  `<g transform="translate(0 80)">${inner(pictorial(parts[0]))}</g><g transform="translate(340 0)">${inner(drawing(parts[0]))}</g>`));

const samples = [
  ['Visible', line(260, 45, 560, 45, 'style="stroke-width:4"'), 'Solid and thick: an edge you can see.'],
  ['Hidden', line(260, 45, 560, 45, 'stroke-dasharray="11 7"'), 'Short dashes: an edge behind material.'],
  ['Center', line(260, 45, 560, 45, 'stroke-dasharray="48 7 7 7"'), 'Long–short: axis, center, or symmetry.'],
  ['Phantom', line(260, 45, 560, 45, 'stroke-dasharray="48 7 7 7 7 7"'), 'Long–short–short: alternate position or reference.'],
  ['Dimension / extension', line(275, 24, 275, 66) + line(545, 24, 545, 66) + line(275, 45, 385, 45) + line(435, 45, 545, 45) + '<path d="M275 45l12 -4v8z M545 45l-12 -4v8z"/>' + txt(397, 50, '40'), 'Arrowed measurement; thin extensions locate its ends.'],
  ['Leader', '<path d="M285 62l70 -35h100" fill="none" stroke="#182c40" stroke-width="1.7"/><path d="M285 62l9 -10 4 8z"/>' + txt(463, 33, 'NOTE'), 'A note points to a particular feature.'],
  ['Cutting plane', line(275, 26, 545, 26, 'style="stroke-width:4" stroke-dasharray="48 7 7 7 7 7"') + line(275, 26, 275, 61) + line(545, 26, 545, 61) + '<path d="M275 61l-5 -13h10z M545 61l-5 -13h10z"/>' + txt(250, 20, 'A') + txt(555, 20, 'A'), 'Prominent cut location; arrows point into section A–A.'],
  ['Section / hatch', '<rect x="275" y="20" width="270" height="46" fill="none" stroke="#182c40"/>' + Array.from({length:12}, (_,i) => line(280 + i*22, 61, 316 + i*22, 25)).slice(0, 11).join(''), 'Thin diagonal strokes: material crossed by a cut.'],
  ['Short break', '<path d="M260 45q20 -15 40 0t40 0t40 0t40 0t40 0t40 0t40 0" fill="none" stroke="#182c40" stroke-width="3"/>', 'Freehand boundary of an omitted portion.'],
  ['Long break', '<path d="M260 45h105l8 -12 14 24 8 -12h165" fill="none" stroke="#182c40" stroke-width="1.7"/>', 'Thin ruled line with a zigzag.']
];
const sampleRows = rows => rows.map(([name, shape, desc], i) => `<g transform="translate(0 ${i*110})">${txt(20, 47, name, 'font-weight="700"')}${shape}${txt(20, 91, desc, 'font-size="17"')}<path d="M20 105h720" stroke="#d5dce2"/></g>`).join('');
write('line-alphabet.svg', svg(760, 440, 'Visible, hidden, center, and phantom line patterns', sampleRows(samples.slice(0,4))));
write('drawing-annotation-lines.svg', svg(760, 660, 'Dimension, extension, leader, cutting-plane, section, and break lines', sampleRows(samples.slice(4))));

function symbol(cx, coneX) {
  return `<g fill="none" stroke="#182c40"><path d="M${coneX} 77l100 -22v100l-100 -22z" stroke-width="3"/><circle cx="${cx}" cy="105" r="50" stroke-width="3"/><circle cx="${cx}" cy="105" r="28" stroke-width="2"/><path d="M${cx - 60} 105h120 M${cx} 45v120 M${coneX - 10} 105h120" stroke-dasharray="28 5 4 5"/></g>`;
}
function tile(x,y,label) { return `<rect x="${x}" y="${y}" width="105" height="60" rx="4" fill="#f3f6f8" stroke="#182c40"/>`+txt(x+52.5,y+36,label,'text-anchor="middle"'); }
write('projection-symbols.svg', svg(760, 490, 'Third-angle and first-angle symbols and view layouts',
  txt(30,30,'THIRD-ANGLE','font-weight="700"') + symbol(90, 180) + txt(410,30,'FIRST-ANGLE','font-weight="700"') + symbol(670,430) +
  txt(30,199,'Small end of each frustum is on the left.', 'font-size="17"') +
  tile(70,230,'Top')+tile(70,310,'Front')+tile(195,310,'Right')+
  tile(410,310,'Right')+tile(535,310,'Front')+tile(535,390,'Top')));

// A conceptual box and a six-face net; labels encode position without relying on color.
const face = (pts, label, x, y) => `<polygon points="${pts}" fill="#e7f0f6" fill-opacity=".5" stroke="#526b7a" stroke-width="1.8"/>` + txt(x,y,label,'font-size="16"');
let box = face('35,160 165,160 165,290 35,290','Front plane',35,315) +
  face('35,160 105,100 235,100 165,160','Top plane',95,85) +
  face('165,160 235,100 235,230 165,290','Right',240,215);
box += '<path d="M35 160l70 -60v130l-70 60 M105 230h130" fill="none" stroke="#526b7a" stroke-dasharray="5 5"/>';
box += '<g transform="translate(24 130) scale(.52)">'+inner(pictorial(parts[0], { labels:false, background:false }))+'</g>';
box += txt(20,355,'1. Trace onto the near faces.', 'font-size="17"');
const netTile = (x,y,label) => `<rect x="${x}" y="${y}" width="92" height="92" fill="#f3f6f8" stroke="#182c40"/>`+txt(x+46,y+51,label,'text-anchor="middle" font-size="17"');
box += netTile(428,70,'Top') + netTile(336,162,'Left') + netTile(428,162,'Front') + netTile(520,162,'Right') + netTile(612,162,'Rear') + netTile(428,254,'Bottom');
box += '<g fill="none" stroke="#866100" stroke-width="3" stroke-dasharray="6 4"><path d="M428 162h92 M428 254h92 M428 162v92 M520 162v92 M612 162v92"/></g>';
box += txt(340,390,'2. Unfold at the dashed hinges.', 'font-size="17"') + txt(340,418,'Third-angle net; front stays fixed.', 'font-size="17"');
write('glass-box.svg', svg(740,450,'Glass-box concept and six principal views in a third-angle net',box));

let quiz = '<g transform="translate(0 15)">'+inner(pictorial(parts[0]))+'</g>';
['right','front','top'].forEach((v,i) => {
  const p=project(parts[0],v), x=375+i*155, y=190, s=35;
  const pt=([a,b])=>`${x+a*s},${y-b*s}`;
  quiz+=`<polygon points="${p.outline.map(pt).join(' ')}" fill="none" stroke="#182c40" stroke-width="2.5"/>`;
  for(const e of p.edges) quiz+=`<polyline points="${[e.a,e.b].map(pt).join(' ')}" fill="none" stroke="#182c40" stroke-width="1.7"/>`;
  quiz+=txt(x,y+38,`View ${i+1}`);
});
write('view-identification.svg',svg(850,260,'A fresh stepped block and three candidate views numbered 1, 2, and 3; candidates are not in a projection layout.',quiz));
console.log('Generated six original SVG figures.');

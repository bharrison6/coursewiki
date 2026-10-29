(function (root) {
  'use strict';
  const mm = ticks => (ticks / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const money = cents => '$' + (cents / 100).toFixed(2);
  function diagram(r) {
    const x = tick => +(20 + 960 * tick / r.ticks.length).toFixed(6);
    const width = ticks => +(960 * ticks / r.ticks.length).toFixed(6);
    const rect = (start, size, type, attr = '') => `<rect class="sy-${type}" x="${x(start)}" y="32" width="${width(size)}" height="42" ${attr}/>`;
    const pieces = [rect(0, r.ticks.left, 'trim', 'data-sy-excluded-interval="left"')];
    for (const b of r.blanks) {
      pieces.push(rect(b.start, r.ticks.blank, 'blank', `data-sy-blank="${b.number}"`));
      pieces.push(rect(b.cutStart, r.ticks.kerf, 'kerf', `data-sy-cut="${b.number}"`));
    }
    pieces.push(rect(r.offcutStart, r.offcut, 'offcut', 'data-sy-offcut-interval'));
    pieces.push(rect(r.ticks.length - r.ticks.right, r.ticks.right, 'trim', 'data-sy-excluded-interval="right"'));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 110" width="1000" height="110" role="img" aria-label="${r.count} blanks and ${r.cuts} full separating kerfs in ${mm(r.ticks.length)} mm stock; excluded trim ${mm(r.trim)} mm; offcut ${mm(r.offcut)} mm. Left to right in placement order."><text x="20" y="20">0 mm</text><text x="980" y="20" text-anchor="end">${mm(r.ticks.length)} mm</text>${pieces.join('')}<rect class="sy-outline" x="20" y="32" width="960" height="42"/><text x="20" y="99">Prepared interval: ${mm(r.ticks.left)} to ${mm(r.ticks.length - r.ticks.right)} mm</text></svg>`;
  }
  const api = Object.freeze({ mm, money, diagram });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CourseWikiStockYieldRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCircuitDrawing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function seriesProbeAnchors(count) {
    if (![2, 3].includes(count)) throw new RangeError('Use two or three series resistors.');
    const anchors = [{ id: 'supply-positive', label: 'Supply +', short: '+', x: 60, y: 60 }];
    for (let i = 0; i < count; i++) {
      const layout = seriesElementLayout(i);
      anchors.push({ id: `switch-${i + 1}-out`, label: `After switch S${i + 1}`, short: String.fromCharCode(65 + 2 * i), x: layout.switchOut, y: 60 });
      if (i < count - 1) anchors.push({ id: `resistor-${i + 1}-out`, label: `After resistor R${i + 1}`, short: String.fromCharCode(66 + 2 * i), x: layout.next, y: 60 });
    }
    anchors.push({ id: 'supply-negative', label: 'Supply −', short: '−', x: 60, y: 290 });
    return anchors;
  }
  function probeMarkup(s, options) {
    if (!options || !options.probePoints || s.mode !== 'series') return '';
    const red = options.red || '', black = options.black || '';
    return '<g class="circuit-probe-points">' + seriesProbeAnchors(s.elements.length).map(anchor => {
      const selected = (anchor.id === red ? ' is-red' : '') + (anchor.id === black ? ' is-black' : '');
      const assignments = [];
      if (anchor.id === red) assignments.push('red');
      if (anchor.id === black) assignments.push('black');
      const assignment = assignments.length ? `${assignments.join(' and ')} probe${assignments.length > 1 ? 's' : ''} placed here` : 'no probe placed';
      return `<g class="circuit-probe-point${selected}" data-probe-point="${anchor.id}" role="button" tabindex="0" aria-pressed="${assignments.length > 0}" aria-label="${anchor.label}; ${assignment}"><circle cx="${anchor.x}" cy="${anchor.y}" r="22"/><text x="${anchor.x}" y="${anchor.y + 5}" text-anchor="middle">${anchor.short}</text></g>`;
    }).join('') + '</g>';
  }
  function seriesElementLayout(index) {
    const x = 120 + index * 160;
    return { x, switchOut: x + 46, resistorStart: x + 60, resistorEnd: x + 125, next: x + 160 };
  }
  function schematic(s, options) {
    const line = (x1,y1,x2,y2) => `<path d="M${x1} ${y1} L${x2} ${y2}"/>`;
    const switchAt = (x,y,closed) => line(x,y,x+10,y) + line(x+10,y,x+36,closed ? y : y-18) + line(x+36,y,x+46,y) +
      `<circle cx="${x+10}" cy="${y}" r="3"/><circle cx="${x+36}" cy="${y}" r="3"/>`;
    const text = (x,y,t) => `<text x="${x}" y="${y}" text-anchor="middle">${t}</text>`;
    let drawing = '<path d="M60 60 V125 M60 175 V290"/><circle cx="60" cy="150" r="25"/>' + text(60,145,'+') + text(60,166,'−') + text(65,325,`${s.voltage} V DC`);
    if (s.mode === 'series') {
      drawing += '<path d="M60 60 H120 M60 290 H620 V60"/>';
      s.elements.forEach((e,i) => {
        const layout = seriesElementLayout(i);
        drawing += switchAt(layout.x,60,e.closed) + line(layout.switchOut,60,layout.resistorStart,60) + `<rect x="${layout.resistorStart}" y="48" width="65" height="24"/>` +
          line(layout.resistorEnd,60, i === s.elements.length-1 ? 620 : layout.next,60) + text(layout.x+90,105,`R${i+1}: ${e.resistance} Ω`) + text(layout.x+22,32,e.closed ? 'closed' : 'open');
      });
    } else {
      // Separate rails connect all branches to the same two source terminals.
      drawing = '<path d="M60 60 V125 M60 175 V290 H620 V60 M60 60 H170 V250"/><circle cx="60" cy="150" r="25"/>' +
        text(60,145,'+') + text(60,166,'−') + text(65,325,`${s.voltage} V DC`) + s.elements.map((e,i) => {
          const y = 100+i*75;
          return line(170,y,230,y) + switchAt(230,y,e.closed) + line(276,y,340,y) + `<rect x="340" y="${y-12}" width="80" height="24"/>` + line(420,y,620,y) +
            text(380,y-22,`R${i+1}: ${e.resistance} Ω`) + text(250,y+26,e.closed ? 'closed' : 'open') + `<circle cx="170" cy="${y}" r="3"/><circle cx="620" cy="${y}" r="3"/>`;
        }).join('');
    }
    const interactive = !!(options && options.probePoints && s.mode === 'series');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 350" role="${interactive ? 'group' : 'img'}" aria-label="${interactive ? 'Interactive ' : ''}${s.mode} circuit with ${s.elements.length} switched resistors and a ${s.voltage} volt DC source"><g fill="none" stroke="currentColor" stroke-width="2">${drawing}</g>${probeMarkup(s, options)}</svg>`;
  }
  return { schematic, seriesProbeAnchors };
});

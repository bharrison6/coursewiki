(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCircuitDrawing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function schematic(s) {
    const line = (x1,y1,x2,y2) => `<path d="M${x1} ${y1} L${x2} ${y2}"/>`;
    const switchAt = (x,y,closed) => line(x,y,x+10,y) + line(x+10,y,x+36,closed ? y : y-18) + line(x+36,y,x+46,y) +
      `<circle cx="${x+10}" cy="${y}" r="3"/><circle cx="${x+36}" cy="${y}" r="3"/>`;
    const text = (x,y,t) => `<text x="${x}" y="${y}" text-anchor="middle">${t}</text>`;
    let drawing = '<path d="M60 60 V125 M60 175 V290"/><circle cx="60" cy="150" r="25"/>' + text(60,145,'+') + text(60,166,'−') + text(65,325,`${s.voltage} V DC`);
    if (s.mode === 'series') {
      drawing += '<path d="M60 60 H120 M60 290 H620 V60"/>';
      s.elements.forEach((e,i) => {
        const x = 120 + i * 160;
        drawing += switchAt(x,60,e.closed) + line(x+46,60,x+60,60) + `<rect x="${x+60}" y="48" width="65" height="24"/>` +
          line(x+125,60, i === s.elements.length-1 ? 620 : x+160,60) + text(x+90,105,`R${i+1}: ${e.resistance} Ω`) + text(x+22,32,e.closed ? 'closed' : 'open');
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
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 350" role="img" aria-label="${s.mode} circuit with ${s.elements.length} switched resistors and a ${s.voltage} volt DC source"><g fill="none" stroke="currentColor" stroke-width="2">${drawing}</g></svg>`;
  }
  return { schematic };
});

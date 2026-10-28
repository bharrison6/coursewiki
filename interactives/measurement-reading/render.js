(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiMeasurementSVG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const line = (x1,y1,x2,y2,cls='') => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const text = (x,y,s,anchor='middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}">${s}</text>`;
  function micrometer(r) {
    const thousandths = r.units / (r.factor / 1000);
    const base = Math.max(0, Math.floor(thousandths / 100) * 100 - 100);
    const edge = 65 + (thousandths - base) * 1.7;
    const datum = 265;
    let s = `<rect class="mr-metal" x="35" y="40" width="${edge-35}" height="280"/>`;
    s += `<rect class="mr-thimble" x="${edge}" y="30" width="150" height="300"/>`;
    s += line(35,datum,edge,datum,'mr-datum');
    for (let tick=base; tick<=r.main; tick+=25) {
      const x = 65+(tick-base)*1.7;
      s += line(x,datum,x,datum+(tick%100===0?30:17));
      if (tick%100===0) s += text(x,312,(tick/1000).toFixed(1));
    }
    // Unwrapped local view of the circumference: 25 thimble divisions per turn.
    // Vernier spacing = 9/10 of thimble spacing. Equality occurs at i = vernier.
    for (let j=-3;j<=13;j++) {
      const y = datum-(j-r.vernier/10)*20;
      if (y<40 || y>320) continue;
      const n = (r.thimble+j+25)%25;
      s += line(edge,y,edge+(n%5===0?55:35),y);
      s += text(edge+78,y+5,n);
    }
    if (r.mode==='vernier-micrometer') {
      for (let i=0;i<=10;i++) {
        const y=datum-i*18;
        s+=line(edge-30,y,edge,y)+text(edge-40,y+5,i,'end');
      }
      s += text(35,22,'Sleeve vernier: 0.0001 in per division','start');
    } else s += text(35,22,'Sleeve and rotating thimble — enlarged detail','start');
    s += text(35,360,'Sleeve: inches; short marks = 0.025 in','start');
    s += text(35,387,'Thimble: 0.001 in per mark; read at the datum.','start');
    return `<svg viewBox="0 0 610 410" role="img" aria-label="Micrometer scale challenge. A text description follows the drawing.">${s}</svg>`;
  }
  function caliper(r) {
    const base=Math.floor(r.units/100)*100;
    const zero=60+r.units-base;
    let s=`<rect class="mr-metal" x="35" y="45" width="875" height="95"/><rect class="mr-thimble" x="${zero-10}" y="140" width="620" height="110"/>`;
    for (let i=0;i<=33;i++) {
      const value=base+i*25, x=60+i*25;
      s+=line(x,140,x,value%100===0?95:115);
      if(value%100===0) s+=text(x,82,(value/1000).toFixed(1));
    }
    for(let i=0;i<=25;i++) {
      const x=zero+i*24;
      s+=line(x,140,x,i%5===0?188:170);
      if(i%5===0) s+=text(x,213,i);
    }
    s+=text(35,25,'Main scale: 0.025 in per division; numbers are inches','start');
    s+=text(35,285,'Sliding vernier: 25 spaces span 24 main-scale spaces.','start');
    s+=text(35,313,'Find the aligned line; each vernier division adds 0.001 in.','start');
    return `<svg viewBox="0 0 950 335" role="img" aria-label="Enlarged inch vernier caliper scales. A text description follows the drawing.">${s}</svg>`;
  }
  return Object.freeze({draw:r=>r.mode==='vernier-caliper'?caliper(r):micrometer(r)});
});

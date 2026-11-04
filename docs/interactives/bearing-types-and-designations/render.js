(function(root, factory) {
  const api = factory(root.CourseWikiBearingGuide || (typeof require === 'function' ? require('./model.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiBearingGuideDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(M) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = v => Number(v.toFixed(2));
  const path = (d, c='ring') => '<path class="'+c+'" d="'+d+'"/>';
  const rect = (x,y,w,h,c='ring',r=0) => '<rect class="'+c+'" x="'+n(x)+'" y="'+n(y)+'" width="'+n(w)+'" height="'+n(h)+'" rx="'+r+'"/>';
  const circle = (x,y,r,c='element') => '<circle class="'+c+'" cx="'+n(x)+'" cy="'+n(y)+'" r="'+n(r)+'"/>';
  const text = (x,y,t,c='label',anchor='start') => '<text class="'+c+'" x="'+x+'" y="'+y+'" text-anchor="'+anchor+'">'+esc(t)+'</text>';
  function line(x1,y1,x2,y2,c='axis') { return path('M'+n(x1)+' '+n(y1)+'L'+n(x2)+' '+n(y2),c); }
  function arrow(x1,y1,x2,y2,c='load',two=false) {
    const dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy),ux=dx/l,uy=dy/l;
    const head=(x,y,sign)=>path('M'+n(x)+' '+n(y)+'l'+n(-sign*ux*10-uy*5)+' '+n(-sign*uy*10+ux*5)+'l'+n(uy*10)+' '+n(-ux*10)+'Z',c+'-head');
    return line(x1,y1,x2,y2,c)+head(x2,y2,1)+(two?head(x1,y1,-1):'');
  }
  const style = '<style>.bgd-svg{--bgd-ink:#002144;--bgd-paper:#fbfaf8;--bgd-ring:#b7c4ce;--bgd-element:#deebf3;--bgd-shaft:#e8e7e2;--bgd-load:#b64114;--bgd-gold:#ecac00;background:var(--bgd-paper);color:var(--bgd-ink)}.bgd-svg text{fill:var(--bgd-ink);font-family:Arial,Helvetica,sans-serif;font-size:20px}.bgd-svg .title{font-size:23px;font-weight:700}.bgd-svg .small{font-size:17px}.bgd-svg .ring,.bgd-svg .element,.bgd-svg .shaft,.bgd-svg .housing{stroke:var(--bgd-ink);stroke-width:1.8;stroke-linejoin:round;fill:var(--bgd-ring)}.bgd-svg .element{fill:var(--bgd-element)}.bgd-svg .shaft{fill:var(--bgd-shaft)}.bgd-svg .housing{fill:#91a8b8}.bgd-svg .empty{fill:var(--bgd-paper);stroke:var(--bgd-ink);stroke-width:1.8}.bgd-svg .liner{fill:var(--bgd-gold);stroke:var(--bgd-ink);stroke-width:1}.bgd-svg .cage{fill:none;stroke:var(--bgd-gold);stroke-width:7}.bgd-svg .axis{fill:none;stroke:var(--bgd-ink);stroke-width:1;stroke-dasharray:10 4 2 4;opacity:.65}.bgd-svg .contact{fill:none;stroke:var(--bgd-load);stroke-width:2;stroke-dasharray:5 3}.bgd-svg .load,.bgd-svg .dim{fill:none;stroke:var(--bgd-load);stroke-width:3}.bgd-svg .load-head,.bgd-svg .dim-head{fill:var(--bgd-load)}.bgd-svg .leader{fill:none;stroke:var(--bgd-ink);stroke-width:1.5}.bgd-svg .divider{fill:none;stroke:#a5acb0;stroke-width:1}.bgd-svg .dimtext{fill:var(--bgd-load);font-size:20px;font-weight:700}</style>';
  function svg(w,h,title,body) { return '<svg xmlns="http://www.w3.org/2000/svg" class="bgd-svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title>'+style+rect(0,0,w,h,'empty')+body+'</svg>'; }
  function mirrored(s) { return s+'<g transform="translate(0 320) scale(1 -1)">'+s+'</g>'; }
  function sphericalOuter(R=90) {
    const pts=[]; for(let x=155;x<=315;x+=2)pts.push([x,160-Math.sqrt(R*R-(x-235)**2)]);
    return path('M155 49H315V'+n(pts[pts.length-1][1])+pts.slice().reverse().map(p=>'L'+n(p[0])+' '+n(p[1])).join('')+'Z');
  }
  function barrel(cx,cy,angle,half=22,width=14) {
    return '<g transform="translate('+n(cx)+' '+n(cy)+') rotate('+n(angle)+')">'+path('M'+(-half)+' -'+(width/2)+'Q0 -'+(width*1.5)+' '+half+' -'+(width/2)+'V'+(width/2)+'Q0 '+(width*1.5)+' '+(-half)+' '+(width/2)+'Z','element')+'</g>';
  }
  function angularGeometry() {
    // A radius-22 concave groove contains the radius-19 ball and touches it at
    // the chosen contact normal. Opposite 3-unit centre offsets give the two
    // opposed contacts; the shoulder transitions finish outside the ball.
    const angle=35*Math.PI/180,normal=[Math.sin(angle),-Math.cos(angle)],ball={x:235,y:101,r:19};
    const outer={x:ball.x-3*normal[0],y:ball.y-3*normal[1],r:22};
    const inner={x:ball.x+3*normal[0],y:ball.y+3*normal[1],r:22};
    const at=(c,deg)=>[c.x+c.r*Math.cos(deg*Math.PI/180),c.y+c.r*Math.sin(deg*Math.PI/180)];
    const oa=at(outer,-145),ob=at(outer,0),ia=at(inner,180),ib=at(inner,35);
    const outerPath='M155 58H315V'+n(ob[1])+'H'+n(ob[0])+'A22 22 0 0 0 '+n(oa[0])+' '+n(oa[1])+'H155Z';
    const innerPath='M155 '+n(ia[1])+'H'+n(ia[0])+'A22 22 0 0 0 '+n(ib[0])+' '+n(ib[1])+'H315V125H155Z';
    return {ball,normal,outer,inner,outerArc:[oa,ob],innerArc:[ia,ib],outerPath,innerPath};
  }
  function radialSection(id) {
    let top='';
    if(id==='journal') return mirrored(rect(155,78,160,47)+rect(155,119,160,6,'liner'));
    if(id==='deep-groove') {
      top=path('M155 58H315V96H258Q235 68 212 96H155Z')+path('M155 112H212Q235 128 258 112H315V125H155Z')+circle(235,101,19);
    } else if(id==='angular-contact') {
      // Opposed shoulders. The contact line passes through the ball centre at 35 degrees
      // from radial; the allowed axial load is toward +x for this orientation.
      const g=angularGeometry(),cx=g.ball.x,cy=g.ball.y,r=g.ball.r,px=r*g.normal[0],py=-r*g.normal[1];
      top=path(g.outerPath)+path(g.innerPath)+circle(cx,cy,r)+
        line(cx-px*2,cy+py*2,cx+px*2,cy-py*2,'contact');
    } else if(id==='self-aligning-ball') {
      top=sphericalOuter()+path('M185 100H197.3A16 16 0 0 0 222.7 100H247.3A16 16 0 0 0 272.7 100H285V125H185Z')+
        circle(210,90.3,16)+circle(260,90.3,16);
    } else if(id==='cylindrical') {
      top=path('M155 61H315V110H294V88H176V110H155Z')+rect(155,112,160,13)+rect(177,88,116,24,'element',2)+line(183,100,287,100,'axis');
    } else if(id==='needle') {
      top=path('M155 90H315V113H307V105H163V113H155Z')+rect(155,116,160,9)+rect(165,105,140,11,'element',2)+line(174,110.5,297,110.5,'axis');
    } else if(id==='tapered') {
      // All three straight cone generators extrapolate to (-180,160).
      const inn=x=>160-.12*(x+180),out=x=>160-.22*(x+180);
      top=path('M155 49H315V'+n(out(315))+'L155 '+n(out(155))+'Z')+
        path('M155 '+n(inn(155))+'L315 '+n(inn(315))+'V125H155Z')+
        path('M169 '+n(out(169))+'L298 '+n(out(298))+'L298 '+n(inn(298))+'L169 '+n(inn(169))+'Z','element')+
        rect(298,inn(298)-12,10,125-(inn(298)-12),'ring')+
        line(165,160-.17*(165+180),305,160-.17*(305+180),'axis');
    } else if(id==='spherical') {
      top=sphericalOuter()+path('M175 119.5L235 91.65L295 119.5V125H175Z');
      const R=76,dx=32,dy=Math.sqrt(R*R-dx*dx),a=Math.atan2(dx,dy)*180/Math.PI;
      top+=barrel(235-dx,160-dy,-a,22,14)+barrel(235+dx,160-dy,a,22,14);
    }
    return mirrored(top);
  }
  function thrustSection(id) {
    let top='';
    if(id==='plain-thrust') return rect(170,60,30,200,'shaft')+mirrored(rect(200,70,30,55)+rect(200,70,5,55,'liner'));
    if(id==='thrust-ball') top=path('M174 60H205V77Q227 100 205 123V125H174Z')+path('M265 60H296V125H265V123Q243 100 265 77Z')+circle(235,100,19);
    if(id==='thrust-cylindrical') top=rect(182,59,32,66)+rect(239,59,32,66)+rect(214,68,25,46,'element',2)+line(226.5,74,226.5,108,'axis');
    if(id==='thrust-spherical') {
      const pts=[];for(let y=50;y<=125;y+=1)pts.push([130+Math.sqrt(120*120-(y-160)**2),y]);
      top=path('M275 50L'+n(pts[0][0])+' 50'+pts.map(p=>'L'+n(p[0])+' '+p[1]).join('')+'H275Z')+
        path('M145 55L173.75 55L226.25 125H145Z')+barrel(217.2,94.6,53.130102,22,11)+line(194,77,238,110,'axis');
    }
    return mirrored(top);
  }
  function endView(f) {
    const cx=112,cy=410,outer=76,inner=36;
    let s=circle(cx,cy,outer,'ring')+circle(cx,cy,60,'empty')+circle(cx,cy,46,'ring')+circle(cx,cy,inner,'empty');
    if(f.id==='journal') return circle(cx,cy,76,'ring')+circle(cx,cy,50,'liner')+circle(cx,cy,43,'empty');
    if(f.id==='plain-thrust') return circle(cx,cy,76,'ring')+circle(cx,cy,69,'liner')+circle(cx,cy,36,'empty');
    const thrust=f.id.startsWith('thrust');
    if(thrust) s=circle(cx,cy,76,'ring')+circle(cx,cy,36,'empty');
    s+=circle(cx,cy,53,'cage');
    const count=f.id==='needle'?24:f.id==='deep-groove'?9:12;
    for(let i=0;i<count;i++) {
      const a=i*360/count,rad=a*Math.PI/180,x=cx+53*Math.cos(rad),y=cy+53*Math.sin(rad);
      if(f.id==='thrust-cylindrical') s+='<g transform="translate('+n(x)+' '+n(y)+') rotate('+a+')">'+rect(-15,-5,30,10,'element',2)+'</g>';
      else if(f.id==='thrust-spherical') s+=barrel(x,y,a,16,6);
      else s+=circle(x,y,f.id==='needle'?5:10,'element');
    }
    return s;
  }
  function familySvg(f) {
    if(typeof f==='string') f=M.families.find(x=>x.id===f);
    if(!f)throw new RangeError('Unknown bearing family');
    let b=text(18,29,f.name,'title')+text(18,53,'Axial section · shaft axis runs left to right','small');
    b+='<g transform="translate(0 20)">'+rect(85,125,310,70,'shaft')+line(65,160,425,160,'axis');
    b+=f.id.startsWith('thrust')||f.id==='plain-thrust'?thrustSection(f.id):radialSection(f.id);
    if(f.radial) b+=arrow(370,77,370,125)+text(383,97,'Fᵣ','dimtext');
    if(f.axial) b+=f.axial===-1?arrow(132,160,82,160)+text(75,188,'Fₐ','dimtext'):arrow(331,160,415,160,'load',f.axial===2)+text(394,188,'Fₐ','dimtext');
    b+='</g>'+line(18,300,462,300,'divider')+text(20,324,f.id.startsWith('thrust')?'Face view · front washer removed':'End view · covers omitted','small end-label')+'<g data-bgd-end="">'+endView(f)+'</g>';
    b+=text(211,363,f.labels[0],'small')+text(211,391,f.labels[1],'small');
    if(f.id==='cylindrical'||f.id==='needle'||f.id==='tapered'||f.id==='spherical') b+=text(211,423,'Circles here are roller ends.','small');
    else if(f.id==='self-aligning-ball') b+=text(211,423,'Tilt allowed, within limits.','small');
    else if(f.id==='thrust-cylindrical') b+=text(211,423,'Roller axes radiate outward.','small');
    else if(f.id==='thrust-spherical') b+=text(211,423,'Axial load must be present.','small');
    else if(f.id==='angular-contact') b+=text(211,423,'Dashed line: contact angle.','small');
    else if(f.id==='journal'||f.id==='plain-thrust') b+=text(211,423,'Gold: sliding bearing layer.','small');
    else b+=text(211,423,'Gold: cage, not load path.','small');
    b+=text(18,525,'Schematic geometry; arrows show load directions.','small');
    return svg(480,540,f.name+'. '+f.cue+' '+f.note,b);
  }
  function familyFigure(f) { return '<figure class="bgd-family">'+familySvg(f)+'<figcaption><strong>'+esc(f.cue)+'</strong> '+esc(f.note)+' <a href="'+f.source+'">Manufacturer guide</a>.</figcaption></figure>'; }
  function atlas() { return '<p>Fᵣ is radial load; Fₐ is axial load. Arrows show directions, not ratings. Sections omit the cage; end views expose the elements.</p><div class="bgd-static-atlas">'+M.families.map(f=>'<div><h3>'+esc(f.name)+'</h3><figure>[[img:power-transmission/bearings/'+f.id+'.svg|'+esc(f.name+'. '+f.cue)+']]<figcaption><strong>'+esc(f.cue)+'</strong> '+esc(f.note)+' <a href="'+f.source+'">Manufacturer guide</a>.</figcaption></figure></div>').join('')+'</div>'; }
  function dimensionSvg(row) {
    const k=3,cy=145,cx=110,r=row.D*k/2,bore=row.d*k/2,x=280,w=row.B*k;
    let b=text(18,28,row.code+' · NSK boundary dimensions','title')+circle(cx,cy,r,'ring')+circle(cx,cy,bore,'empty');
    b+=rect(x,cy-r,w,r-bore)+rect(x,cy+bore,w,r-bore)+line(10,cy,390,cy,'axis');
    b+=arrow(cx-bore,cy,cx+bore,cy,'dim',true)+text(cx,cy-10,'d '+row.d,'dimtext','middle');
    b+=arrow(218,cy-r,218,cy+r,'dim',true)+text(230,cy,'D '+row.D,'dimtext');
    b+=line(cx,cy-r,222,cy-r,'leader')+line(cx,cy+r,222,cy+r,'leader');
    b+=arrow(x,cy+r+22,x+w,cy+r+22,'dim',true)+text(x+w/2,cy+r+47,'B '+row.B,'dimtext width-label','middle');
    b+=text(18,324,'mm · constant drawing scale across the three sizes','small size-footer');
    return svg(430,340,row.code+': bore '+row.d+', outside diameter '+row.D+', width '+row.B+' mm. Boundary envelope, internal parts omitted.',b);
  }
  function catalogTable() { return '<div class="unit-table-wrap"><table class="unit-table"><caption>Same 25 mm bore; different NSK catalog envelopes (mm)</caption><thead><tr><th>Basic designation</th><th><span class="bgd-symbol">d</span> · bore</th><th><span class="bgd-symbol">D</span> · outside</th><th><span class="bgd-symbol">B</span> · width</th><th>Dimension series</th></tr></thead><tbody>'+M.catalog.map(r=>'<tr><th scope="row"><a href="'+r.source+'">'+r.code+'</a></th><td>'+r.d+'</td><td>'+r.D+'</td><td>'+r.B+'</td><td>'+r.widthSeries+r.diameterSeries+' (width '+r.widthSeries+' omitted in code)</td></tr>').join('')+'</tbody></table></div>'; }
  function staticSizes() { return '<p>All three are single-row deep-groove ball bearings. The bore code is 05 → 25 mm; the other dimensions below are catalog values, not digit arithmetic.</p>'+catalogTable()+M.catalog.map(r=>'<figure>'+dimensionSvg(r)+'<figcaption><a href="'+r.source+'">NSK '+r.code+'</a>: '+r.d+' × '+r.D+' × '+r.B+' mm. The drawing shows only the mounting envelope; it is not an internal construction drawing.</figcaption></figure>').join(''); }
  function mountedSvg() {
    let b=text(18,30,'Housing shape is not the bearing family','title');
    b+=text(20,65,'Pillow / plummer block','label')+path('M30 224V196H57V138A63 63 0 0 1 183 138V196H210V224Z','housing')+rect(20,224,200,17,'ring')+circle(120,140,49,'ring')+circle(120,140,34,'empty')+circle(120,140,22,'shaft')+rect(37,203,20,10,'empty',4)+rect(182,203,20,10,'empty',4);
    b+=text(255,65,'Flange-mounted housing','label')+rect(278,88,154,154,'housing',12)+circle(355,165,50,'ring')+circle(355,165,34,'empty')+circle(355,165,22,'shaft');
    for(const x of[296,414])for(const y of[106,224])b+=circle(x,y,7,'empty');
    b+=text(20,282,'Bolts to a support beneath it.','small')+text(255,282,'Bolts to a facing support.','small')+text(20,319,'The insert or bearing inside must still be identified.','label')+text(20,349,'Housing outline alone does not tell you its load rating.','small');
    return svg(480,375,'Pillow block and four-bolt flange housing shown from the shaft end; the bearing inside is a separate choice.',b);
  }
  return Object.freeze({ familySvg, familyFigure, atlas, dimensionSvg, catalogTable, staticSizes, mountedSvg, angularGeometry });
});

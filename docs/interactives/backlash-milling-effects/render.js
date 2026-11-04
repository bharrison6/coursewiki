(function(root,factory){'use strict';const api=factory(typeof module==='object'&&module.exports?require('./model.js'):root.CourseWikiBacklashMilling);if(typeof module==='object'&&module.exports)module.exports=api;else root.CourseWikiBacklashMillingDraw=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';
  const n=v=>Number(v.toFixed(4)),mm=v=>Math.abs(v)<.0005?'0.000':v.toFixed(3).replace('-','−'),signed=v=>(v>.0005?'+':'')+mm(v);
  function path(points){return points.map((p,i)=>(i?'L':'M')+n(p[0])+' '+n(p[1])).join('');}
  function bands(grid,index){
    const paths=['','','',''];
    for(let y=0;y<grid.n;y++){let start=0,old=0;
      for(let x=0;x<=grid.n;x++){
        const k=y*grid.n+x,a=x<grid.n&&grid.actual[k]<=index,b=x<grid.n&&grid.nominal[k]<=index,cls=a?(b?1:2):(b?3:0);
        if(cls!==old){if(old){const X=-20+start*grid.cell,Y=-20+y*grid.cell;paths[old]+=`M${n(X)} ${n(Y)}h${n((x-start)*grid.cell)}v${n(grid.cell)}h${n(-(x-start)*grid.cell)}Z`;}start=x;old=cls;}
      }
    }
    return paths;
  }
  function figure(data,grid,index){
    const bandsNow=bands(grid,index),q=data.command[index],a=index?data.groups[index-1].end:q;
    const desc=`Top view of a contour groove around a ${M.PROFILES[data.s.shape].label.toLowerCase()} island. X clearance ${data.s.bx.toFixed(2)} mm, Y clearance ${data.s.by.toFixed(2)} mm. ${index===data.groups.length?'Complete pass.':'Cut in progress.'} Shaded cells are swept by the full cutter; the middle is retained material.`;
    return '<svg class="bme-svg" viewBox="0 0 400 360" role="img" aria-label="'+desc+'"><title>'+desc+'</title><g transform="translate(200 180) scale(8 -8)">'+
      '<rect class="bme-stock" x="-20" y="-20" width="40" height="40"/>'+
      '<path class="bme-cut" d="'+bandsNow[1]+'"/><path class="bme-extra" d="'+bandsNow[2]+'"/><path class="bme-missed" d="'+bandsNow[3]+'"/>'+
      '<path class="bme-axis" d="M-19 0H19M0 -19V19"/>'+
      '<path class="bme-target" d="'+path(M.outline(data.s.shape,0,2))+'Z"/>'+
      '<circle class="bme-cutter" cx="'+n(a[0])+'" cy="'+n(a[1])+'" r="'+data.s.radius+'"/>'+
      '<path class="bme-command" d="M'+n(q[0]-.6)+' '+n(q[1])+'h1.2M'+n(q[0])+' '+n(q[1]-.6)+'v1.2"/>'+
      '<circle class="bme-centre" cx="'+n(a[0])+'" cy="'+n(a[1])+'" r=".17"/></g>'+
      '<g class="bme-axis-text"><text x="363" y="184">+X</text><text x="204" y="16">+Y</text><text x="120" y="355" text-anchor="middle">−10</text><text x="200" y="355" text-anchor="middle">0</text><text x="280" y="355" text-anchor="middle">10 mm</text></g></svg>';
  }
  function spanText(data,index){
    if(index!==data.groups.length)return '<div><span>X span at Y = 0</span><strong>Finish the pass</strong><small>Section still in progress</small></div><div><span>Y span at X = 0</span><strong>Finish the pass</strong><small>Section still in progress</small></div>';
    return M.measurements(data,index).map((v,i)=>'<div><span>'+['X span at Y = 0','Y span at X = 0'][i]+'</span><strong>'+(v.actual?mm(v.actual.width)+' mm':'Not bounded')+'</strong><small>'+(v.error===null?'Section is not bounded':signed(v.error)+' mm error')+'</small></div>').join('');
  }
  function legend(){return '<div class="bme-key"><span><i class="bme-cut"></i>Cut as intended</span><span><i class="bme-extra"></i>Extra cut</span><span><i class="bme-missed"></i>Missed cut</span></div>';}
  function staticLesson(){
    const cases=[['Zero backlash',0,0],['X only',.5,0],['Y only',0,.5],['Both axes',.5,.5]];
    return '<p>A perfect 4 mm diameter cutter makes one contour groove around a 24 mm circular island. The dashed outline is the intended island; span errors compare with zero backlash. Material in the middle and outside the groove remains: this is not a pocket-clearing path. Only X/Y drive clearance changes.</p>'+legend()+'<div class="bme-static-grid">'+cases.map(c=>{
      const d=M.sweep({bx:c[1],by:c[2],cell:.2}),g=M.raster(d),i=d.groups.length;
      return '<figure><figcaption><strong>'+c[0]+'</strong> · X '+c[1].toFixed(2)+' / Y '+c[2].toFixed(2)+' mm</figcaption>'+figure(d,g,i)+'<div class="bme-readings">'+spanText(d,i)+'</div></figure>';
    }).join('')+'</div><p>All four start at the right side and run counterclockwise. Before the plunge, both axes approach the start in their positive directions and the coordinates are calibrated there. On reversal, the actual cutter can stay still along one axis while moving along the other. Its full circular footprint removes material along that path.</p><p>The spans above are sections through X = 0 or Y = 0, not a best-fit circle or the greatest overall width. They come from intersections with the swept cutter, not pixel counting. Changing the start, winding or initial seating can change the local shape; do not infer that every circle becomes the same oval.</p><p><strong>Approximation:</strong> circular paths use 1° chords (under 0.001 mm sag here). These printed diagrams use 0.20 mm cells; the live area shading uses 0.10 mm cells. The millimetre span readings use the underlying swept chords.</p>';
  }
  return {figure,spanText,legend,staticLesson,mm,signed,bands};
});

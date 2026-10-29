(function (root, factory) {
  'use strict';
  var node=typeof module==='object'&&module.exports;
  var api=factory(node?require('./model.js'):root.CourseWikiEndMillAnatomy,
    node?require('../cutter-geometry/axial.js'):root.CourseWikiCutterAxial);
  if(node)module.exports=api;else root.CourseWikiEndMillAnatomyDraw=api;
})(typeof self!=='undefined'?self:this,function(M,A){
  'use strict';
  function esc(v){return String(v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function x(z){return 700-z*5.2;}
  function bracket(a,b,y,label,cls){return '<g class="ema-dim '+(cls||'')+'"><path d="M'+x(a)+' '+y+'V'+(y+15)+'M'+x(b)+' '+y+'V'+(y+15)+'M'+x(a)+' '+(y+8)+'H'+x(b)+'"/><text x="'+((x(a)+x(b))/2)+'" y="'+(y-4)+'" text-anchor="middle">'+esc(label)+'</text></g>';}
  function profile(spec,z){
    var points=A.section(spec,z).points,radius=Math.max.apply(null,points.map(function(p){return Math.hypot(p.x,p.y);})),height=Math.round(radius*12000)/1000;
    return {y:132-height/2,height:height};
  }
  function side(spec,projection,id,highlight){
    var anchors=A.anchors(spec,projection);
    var cut=profile(spec,0),neck=profile(spec,(spec.loc+spec.lbs)/2),shank=profile(spec,(spec.lbs+spec.oal)/2);
    var cutY=cut.y,cutH=cut.height,neckY=neck.y,neckH=neck.height,shankY=shank.y,shankH=shank.height,face=x(projection);
    var neckDescription=spec.lbs>spec.loc?'a reduced neck extends from LOC through LBS':'LOC and LBS end together with no reduced-neck interval';
    var accessibleName=spec.title+' dimensions and holder projection. The tool tip is at the right. Cutting flutes extend through LOC, '+neckDescription+', and the plain shank continues to OAL. A holder face shows the separate mounted projection.';
    var out='<svg class="ema-side" viewBox="0 0 760 380" role="img" aria-label="'+esc(accessibleName)+'"><title>'+esc(spec.title)+' dimensions and holder projection</title><desc>'+esc(accessibleName)+'</desc>';
    out+='<rect class="ema-shank'+(highlight==='diameters'?' is-highlight':'')+'" x="'+x(spec.oal)+'" y="'+shankY+'" width="'+(x(spec.lbs)-x(spec.oal))+'" height="'+shankH+'"/>';
    if(spec.lbs>spec.loc)out+='<rect class="ema-neck'+(highlight==='lbs'?' is-highlight':'')+'" x="'+x(spec.lbs)+'" y="'+neckY+'" width="'+(x(spec.loc)-x(spec.lbs))+'" height="'+neckH+'"/>';
    out+='<rect class="ema-cut'+(['loc','helix','pitch','diameters'].includes(highlight)?' is-highlight':'')+'" x="'+x(spec.loc)+'" y="'+cutY+'" width="'+(x(0)-x(spec.loc))+'" height="'+cutH+'"/>';
    out+='<svg x="'+x(spec.loc)+'" y="'+cutY+'" width="'+(x(0)-x(spec.loc))+'" height="'+cutH+'" viewBox="'+x(spec.loc)+' '+cutY+' '+(x(0)-x(spec.loc))+' '+cutH+'" overflow="hidden">';for(var k=0;k<spec.flutes;k++)out+='<path class="ema-flute" d="M'+(x(spec.loc)+k*16-25)+' '+(cutY+cutH)+'Q'+(x(spec.loc)+45+k*16)+' '+(cutY+30)+' '+(x(0)+10+k*8)+' '+cutY+'"/>';out+='</svg>';
    // Holder is opaque in this side view: it masks the inserted shank.
    out+='<path class="ema-holder'+(highlight==='projection'?' is-highlight':'')+'" d="M55 72H'+(face-24)+'L'+face+' 87V177L'+(face-24)+' 192H55Z"/>';
    out+='<path class="ema-face" d="M'+face+' 64V201"/><text class="ema-label" x="'+(face-8)+'" y="220" text-anchor="end">holder face</text>';
    out+=bracket(anchors.tip,anchors.loc,260,'LOC '+spec.loc+' mm','is-loc '+(highlight==='loc'?'is-highlight':''))+bracket(anchors.tip,anchors.lbs,292,'LBS '+spec.lbs+' mm','is-lbs '+(highlight==='lbs'?'is-highlight':''))+bracket(anchors.tip,anchors.oal,326,'OAL '+spec.oal+' mm','is-oal '+(highlight==='oal'?'is-highlight':''));
    out+='<g class="ema-dim is-projection '+(highlight==='projection'?'is-highlight':'')+'"><path d="M'+x(0)+' 45V60M'+face+' 45V60M'+face+' 53H'+x(0)+'"/><text x="'+((face+x(0))/2)+'" y="39" text-anchor="middle">holder-face projection '+projection+' mm</text></g>';
    out+='<text class="ema-small" x="68" y="238">Side-view flute strokes are schematic, not a measured helix projection.</text><text class="ema-small" x="68" y="370">Illustrative dimensions; mounting projection is not a grip recommendation.</text></svg>';
    return out;
  }
  function readout(state){
    var q=M.selection(state),s=q.spec;
    function c(key){return q.state.dimension===key?' class="is-highlight"':'';}
    return '<div class="ema-readout"><span'+c('oal')+'>OAL <strong>'+s.oal+' mm</strong></span><span'+c('loc')+'>LOC <strong>'+s.loc+' mm</strong></span><span'+c('lbs')+'>LBS <strong>'+s.lbs+' mm</strong></span><span'+c('diameters')+'>Cut / shank / neck Ø <strong>'+s.cutterDiameter+' / '+s.shankDiameter+' / '+s.neckDiameter+' mm</strong></span><span'+c('projection')+'>Holder projection <strong>'+q.state.projection+' mm</strong></span><span>Illustrative insertion <strong>'+q.insertion+' mm</strong></span><span'+c('helix')+'>Helix <strong>'+s.helixDeg+'° to tool axis</strong> <small>(catalog angle; side strokes schematic)</small></span><span'+c('pitch')+'>Pitch <strong>'+s.pitchDeg+'° radial spacing</strong></span></div>';
  }
  function staticLesson(){
    var r=M.SPECS.reduced,l=M.SPECS.longFlute;
    return '<div class="ema-static-grid"><figure><div class="ema-static-demo"><p><strong>First use:</strong> compare one reduced-neck tool mounted at 75 and 85 mm projection. Its OAL, LOC and LBS do not stretch when the mounting changes.</p><h3>Same reduced-neck tool, two mountings</h3>'+side(r,75,'ema-r75-')+readout({tool:'reduced',projection:75})+'</div><h4>Ten millimetres farther from the holder</h4><div class="ema-static-demo">'+side(r,85,'ema-r85-')+readout({tool:'reduced',projection:85})+'</div><figcaption>OAL, LOC and LBS stay fixed. Only holder-face projection and illustrative insertion change.</figcaption></figure><figure><h3>Matched OAL, different reach geometry</h3><div class="ema-static-demo">'+side(l,75,'ema-long-')+readout({tool:'longFlute',projection:75})+'</div><div class="ema-static-demo">'+side(r,75,'ema-neck-')+readout({tool:'reduced',projection:75})+'</div><figcaption>LBS includes LOC plus any relieved neck. It is neither neck-only length nor holder projection.</figcaption></figure></div><p><strong>3D model boundary:</strong> separately closed cutting, neck and shank display solids meet at the catalog boundaries. They are an illustrative display mesh, not watertight manufacturing CAD. Abrupt shoulders and runout are schematic. Swept transverse sections show fluted side surfaces; flat display caps do not establish center-cutting end-face geometry.</p>';
  }
  return Object.freeze({side:side,readout:readout,staticLesson:staticLesson});
});

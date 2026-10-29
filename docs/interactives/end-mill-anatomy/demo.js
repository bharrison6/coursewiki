(function(root){
  'use strict';
  var M=root.CourseWikiEndMillAnatomy,D=root.CourseWikiEndMillAnatomyDraw,S=root.CourseWikiEndMillAnatomy3D;
  if(!M||!D)return;
  var seq=0;
  document.querySelectorAll('[data-interactive="end-mill-anatomy"]').forEach(function(mount){
    if(mount.dataset.emaReady)return;var id='ema-'+(++seq),state={tool:'reduced',projection:75,dimension:'lbs'},scene,threeAvailable=true;
    var live=document.createElement('div');live.className='ema-live';
    live.innerHTML='<p><strong>First use:</strong> compare one reduced-neck tool at two holder projections. Catalog dimensions stay fixed.</p><div class="ema-work"><div class="ema-stage"><div class="ema-canvas" data-ema-scene></div><p class="ema-status" role="status" aria-live="polite"></p></div><div class="ema-controls"><label for="'+id+'-tool">Tool geometry</label><select id="'+id+'-tool" data-ema="tool"><option value="reduced">Reduced neck — LOC 20, LBS 70</option><option value="longFlute">Long flute — LOC/LBS 70</option></select><label for="'+id+'-projection">Illustrative holder projection</label><select id="'+id+'-projection" data-ema="projection"><option value="75">75 mm — insertion 25 mm</option><option value="85">85 mm — insertion 15 mm</option></select><label for="'+id+'-dimension">Highlight / compare</label><select id="'+id+'-dimension" data-ema="dimension"><option value="lbs">LBS and neck</option><option value="loc">LOC</option><option value="oal">OAL</option><option value="projection">Holder projection</option><option value="diameters">Diameters</option><option value="helix">Helix angle</option><option value="pitch">Radial pitch</option></select><div class="ema-actions"><button type="button" data-ema-view="side">Side</button><button type="button" data-ema-view="end">End</button><button type="button" data-ema-view="reset">Reset 3D</button></div></div></div><div data-ema-readout></div><div data-ema-side></div><p class="ema-limit">Dimensions are illustrative catalog examples. Projection is measured from holder face to tip; insertion is shown for comparison, not as a grip recommendation. The 3D view uses separately closed cutting, neck and shank display solids meeting at catalog boundaries; it is not watertight manufacturing CAD. Swept sections show side surfaces, and flat caps do not establish center-cutting end-face geometry.</p>';
    mount.append(live);
    function q(s){return live.querySelector(s);}
    function update(){
      var selected=M.selection(state);q('[data-ema-readout]').innerHTML=D.readout(state);q('[data-ema-side]').innerHTML=D.side(selected.spec,state.projection,id+'-side-',state.dimension);
      q('[data-ema="tool"]').value=state.tool;q('[data-ema="projection"]').value=String(state.projection);q('[data-ema="dimension"]').value=state.dimension;
      if(threeAvailable)q('.ema-status').textContent=selected.spec.title+'. OAL '+selected.spec.oal+' mm; LOC '+selected.spec.loc+' mm; LBS '+selected.spec.lbs+' mm; holder projection '+state.projection+' mm.';
      if(scene)scene.set(selected.spec,state.projection,state.dimension);
    }
    ['tool','projection','dimension'].forEach(function(key){q('[data-ema="'+key+'"]').addEventListener('change',function(){state=M.state(Object.assign({},state,{[key]:key==='projection'?Number(this.value):this.value}));update();});});
    live.querySelectorAll('[data-ema-view]').forEach(function(btn){btn.addEventListener('click',function(){if(!scene)return;scene[this.dataset.emaView]();});});
    try{if(!S)throw new Error('3D assets unavailable');scene=S.create(q('[data-ema-scene]'),M.SPECS.reduced,75);mount.classList.add('ema-has-3d');}
    catch(error){threeAvailable=false;q('[data-ema-scene]').innerHTML='<p class="panel"><strong>3D view unavailable.</strong> Use the complete side view and dimensions below.</p>';q('.ema-status').textContent='3D view unavailable; side-view anatomy remains complete.';live.querySelectorAll('[data-ema-view]').forEach(function(button){button.disabled=true;});}
    update();mount.dataset.emaReady='true';mount.classList.add('ema-live-ready');
  });
})(typeof self!=='undefined'?self:this);

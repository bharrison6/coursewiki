(function() {
  'use strict';
  const M=globalThis.CourseWikiBearingGuide,D=globalThis.CourseWikiBearingGuideDraw;
  if(!M||!D)return;
  let sequence=0;
  document.querySelectorAll('[data-interactive="bearing-types-and-designations"]').forEach(root=>{
    if(root.dataset.bgdReady)return;
    let id; do{id='bgd-'+(++sequence);}while(document.getElementById(id));
    const live=document.createElement('div');live.className='bgd-live';live.id=id;
    if(root.dataset.bgd==='family') {
      live.innerHTML='<p class="bgd-note">Compare the rolling elements and the tracks they touch. Fᵣ is radial load; Fₐ is axial load. Arrows show supported directions, not ratings. Sections omit the cage; end views expose the elements.</p><div class="bgd-controls"><label>Bearing family<select data-bgd-family>'+M.families.map(f=>'<option value="'+f.id+'"'+(f.id==='deep-groove'?' selected':'')+'>'+f.name+'</option>').join('')+'</select></label></div><div class="bgd-result" data-bgd-figure></div>';
      const select=live.querySelector('select'),out=live.querySelector('[data-bgd-figure]');
      const show=()=>{out.innerHTML=D.familyFigure(M.families.find(f=>f.id===select.value));root.dataset.family=select.value;};
      select.addEventListener('change',show);show();
    } else {
      live.innerHTML='<p class="bgd-note">Compare three checked NSK catalog rows. All have a 25 mm bore; their outside diameters and widths differ.</p><div class="bgd-controls"><label>Checked catalog example<select data-bgd-size>'+M.catalog.map(r=>'<option'+(r.code==='6205'?' selected':'')+'>'+r.code+'</option>').join('')+'</select></label></div><div class="bgd-result" data-bgd-drawing></div><div class="bgd-code" data-bgd-code></div><p class="bgd-note" data-bgd-source></p><details><summary>Check another basic designation</summary><form class="bgd-controls"><label>Exact basic code<input type="text" inputmode="text" maxlength="40" placeholder="6005, 6205 or 6305" aria-describedby="'+id+'-message"></label><button type="submit">Check code</button></form><p class="bgd-message" id="'+id+'-message" role="status"></p></details>';
      const select=live.querySelector('select'),drawing=live.querySelector('[data-bgd-drawing]'),code=live.querySelector('[data-bgd-code]'),source=live.querySelector('[data-bgd-source]'),message=live.querySelector('.bgd-message');
      function show(r) {
        drawing.innerHTML=D.dimensionSvg(r);
        code.innerHTML='<span><strong>6</strong>deep-groove ball</span><span><strong>('+r.widthSeries+')'+r.diameterSeries+'</strong>dimension series<br>width code omitted</span><span><strong>05</strong>25 mm bore</span>';
        source.innerHTML='<a href="'+r.source+'">NSK '+r.code+' catalog row</a>: d = '+r.d+', D = '+r.D+', B = '+r.B+' mm. Dimensions checked 4 November 2026. These are nominal boundary dimensions, not fits or tolerances.';
        root.dataset.code=r.code;
      }
      select.addEventListener('change',()=>{message.textContent='';show(M.lookup(select.value).row);});
      live.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const r=M.lookup(live.querySelector('input').value);if(!r.supported){message.textContent=r.message+' The drawing above remains the selected example, '+select.value+'.';return;}select.value=r.row.code;show(r.row);message.textContent='Checked row '+r.row.code+' shown above.';});
      show(M.lookup('6205').row);
    }
    live.addEventListener('keydown',e=>{if(e.target.matches('input,select,button,summary'))e.stopPropagation();});
    root.prepend(live);root.dataset.bgdReady='true';
  });
})();

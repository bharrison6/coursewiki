(function(){
  'use strict';
  const M=globalThis.CourseWikiBacklashMilling,D=globalThis.CourseWikiBacklashMillingDraw;if(!M||!D)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-interactive="backlash-milling-effects"]').forEach(root=>{
    if(root.dataset.bmeReady)return;root.dataset.bmeReady='true';root.classList.add('bme-ready');
    const live=document.createElement('div');live.className='bme-live';
    live.innerHTML='<p><strong>Change the clearance. What happens to the island left behind?</strong> A perfect 4 mm cutter mills one contour groove. Only the X/Y drive clearance changes.</p><div class="bme-bench"><div class="bme-preview"><p class="bme-stage-title" data-bme-progress></p><div class="bme-plot" data-bme-plot></div>'+D.legend()+'<div class="bme-readings" data-bme-readings></div></div><div class="bme-controls"><p class="bme-areas" data-bme-areas></p><div class="bme-play"><button type="button" data-bme-run>Replay</button><button type="button" data-bme-step>Step</button><button type="button" data-bme-restart>Restart</button></div>'+
      '<div class="bme-pair"><label>Island shape<select data-bme="shape"><option value="circle">Circle · Ø24 mm</option><option value="rectangle">Rectangle · 24 × 18 mm</option><option value="rounded">Rounded · 24 × 18, R4 mm</option></select></label><label>Contour direction<select data-bme="winding"><option value="1">Counterclockwise</option><option value="-1">Clockwise</option></select></label></div>'+
      '<fieldset><legend>Total drive clearance, mm</legend><div class="bme-presets"><button type="button" data-bme-preset="zero">Zero</button><button type="button" data-bme-preset="x">X only · 0.50</button><button type="button" data-bme-preset="y">Y only · 0.50</button><button type="button" data-bme-preset="both">Both · 0.50</button></div><div class="bme-sliders">'+['bx','by'].map((key,i)=>'<label><span>'+['X clearance','Y clearance'][i]+'<output data-bme-out="'+key+'">0.50 mm</output></span><input type="range" min="0" max="1" step="0.05" value="0.5" data-bme="'+key+'"></label>').join('')+'</div></fieldset>'+
      '<div class="bme-pair"><label>Start on the island’s<select data-bme="start"><option value="0">Right side (+X)</option><option value="1">Top side (+Y)</option><option value="2">Left side (−X)</option><option value="3">Bottom side (−Y)</option></select></label><label>Approach before plunge<select data-bme="seat"><option value="1">+X and +Y</option><option value="-1">−X and −Y</option></select></label></div>'+
      '<p class="bme-note">Both coordinates are calibrated after this seated approach, with the cutter above the stock. The pass begins with a plunge at the start. The clearance state then persists through every reversal.</p><p class="bme-status" data-bme-status role="status" aria-live="polite"></p><p class="bme-note">Span errors compare with zero backlash. Shading: 0.10 mm cells. Smaller errors may be hard to see; span readings use the swept cutter geometry. The outlined circle is the actual cutter; the cross is its commanded centre.</p></div></div>';
    root.insertBefore(live,root.firstChild);const q=s=>live.querySelector(s);
    let s=M.options(),data,grid,index=0,running=false,frame=0,last=0,fraction=1;
    function stop(){running=false;if(frame)cancelAnimationFrame(frame);frame=0;last=0;}
    function status(){q('[data-bme-status]').textContent=`${s.seat>0?'Positive':'Negative'} approach, ${s.winding>0?'counterclockwise':'clockwise'} pass. Settings describe a fresh repeat of this cut; they do not change material already cut on a real part.`;}
    function sync(){for(const key of ['shape','winding','start','seat','bx','by'])q(`[data-bme="${key}"]`).value=String(s[key]);for(const key of ['bx','by'])q(`[data-bme-out="${key}"]`).textContent=s[key].toFixed(2)+' mm';
      live.querySelectorAll('[data-bme-preset]').forEach(b=>{const p=presets[b.dataset.bmePreset];b.setAttribute('aria-pressed',String(s.bx===p[0]&&s.by===p[1]));});}
    function render(){
      q('[data-bme-plot]').innerHTML=D.figure(data,grid,index);q('[data-bme-readings]').innerHTML=D.spanText(data,index);const a=M.areas(grid,index);
      q('[data-bme-areas]').textContent=`${index===data.groups.length?'Full pass':'At this step'}: extra cut ≈ ${a.extra.toFixed(1)} mm² · missed cut ≈ ${a.missed.toFixed(1)} mm²`;
      q('[data-bme-progress]').textContent=index===data.groups.length?'Complete · dashed outline = target':`Cut ${Math.round(data.cumulative[index]/data.total*100)}% · dashed outline = target`;
      q('[data-bme-run]').textContent=running?'Pause':reduced.matches?(index===data.groups.length?'Replay step':'Next step'):(index===data.groups.length?'Replay':'Run');
      q('[data-bme-step]').disabled=running||index===data.groups.length;
      root.dataset.bmeIndex=String(index);root.dataset.bmeSteps=String(data.groups.length);root.dataset.bmeRunning=String(running);
    }
    function rebuild(){stop();data=M.sweep(s);grid=M.raster(data);index=M.indexAt(data,fraction);sync();status();render();}
    const presets={zero:[0,0],x:[.5,0],y:[0,.5],both:[.5,.5]};
    live.querySelectorAll('[data-bme]').forEach(el=>el.addEventListener(el.type==='range'?'input':'change',()=>{const key=el.dataset.bme;s=M.options(Object.assign({},s,{[key]:key==='shape'?el.value:Number(el.value)}));rebuild();}));
    live.querySelectorAll('[data-bme-preset]').forEach(b=>b.addEventListener('click',()=>{const p=presets[b.dataset.bmePreset];s=M.options(Object.assign({},s,{bx:p[0],by:p[1]}));rebuild();}));
    function step(){stop();if(index===data.groups.length){fraction=0;index=0;}else{fraction=Math.min(1,data.cumulative[index]/data.total+.05);index=M.indexAt(data,fraction);}render();}
    function tick(now){frame=0;if(!running)return;if(last)fraction=Math.min(1,fraction+Math.min(100,now-last)/6500);last=now;index=M.indexAt(data,fraction);if(fraction===1)stop();render();if(running)frame=requestAnimationFrame(tick);}
    q('[data-bme-run]').addEventListener('click',()=>{if(running){stop();render();return;}if(reduced.matches){step();return;}if(index===data.groups.length){fraction=0;index=0;}running=true;last=0;render();frame=requestAnimationFrame(tick);});
    q('[data-bme-step]').addEventListener('click',step);q('[data-bme-restart]').addEventListener('click',()=>{stop();fraction=0;index=0;render();});
    live.addEventListener('keydown',e=>{if(e.target.matches('input,select,button'))e.stopPropagation();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){stop();render();}});reduced.addEventListener('change',()=>{if(reduced.matches){stop();render();}});
    root.bmeDispose=()=>{stop();live.remove();root.classList.remove('bme-ready');delete root.dataset.bmeReady;};
    rebuild();
  });
})();

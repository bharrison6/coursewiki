/* WebGL presentation only. No machining or assessment takes place here. */
(function (root) {
  'use strict';
  var T = root.CourseWikiThree, M = root.CourseWikiMillingSim, Mesh = root.CourseWikiMillingMesh;
  function create(host,options) {
    options=options||{};
    if (!T || !Mesh) throw new Error('3D assets unavailable');
    var renderer = new T.WebGLRenderer({ antialias:true, alpha:false });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    var canvas=renderer.domElement;canvas.className='ms-webgl';canvas.tabIndex=0;
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Three dimensional mill. Drag to orbit; wheel to zoom; right drag to pan.');
    host.appendChild(canvas);host.setAttribute('data-renderer','webgl2');
    var gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    host.setAttribute('data-gpu',ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
    var scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.1,2000);camera.up.set(0,0,1);
    var controls=new T.OrbitControls(camera,canvas);controls.enableDamping=false;controls.minDistance=30;controls.maxDistance=600;
    controls.minPolarAngle=.02;controls.maxPolarAngle=Math.PI/2-.06;
    controls.target.set(50,30,-5);camera.position.set(-100,-145,130);controls.update();
    var frame=0,disposed=false,meshObject=null,model=null,lastVersion=-1,lastSim=null,lastBuild=0,timer=0;
    var epoch=0,requestId=0,workerBusy=false,queued=false,lastRemoved=0,lastCount=0,requestedVersion=-1;
    var workerURL=URL.createObjectURL(new Blob([root.CourseWikiMillingWorkerSource],{type:'text/javascript'})),worker=new Worker(workerURL);
    var surfaceStatus=document.createElement('span');surfaceStatus.className='ms-surface-status';surfaceStatus.setAttribute('role','status');host.appendChild(surfaceStatus);
    var palette=null,metal=new T.MeshStandardMaterial({roughness:.8,metalness:.15,vertexColors:true,side:T.DoubleSide});
    var fixtureMat=new T.MeshStandardMaterial({roughness:.85,metalness:.1}),toolMat=new T.MeshStandardMaterial({roughness:.45,metalness:.5});
    var comparison='target',currentMeta={},targetObject=null,targetEdges=null,targetField=null,targetMaterial=new T.MeshStandardMaterial({roughness:.75,metalness:.05,side:T.DoubleSide});
    var targetLineMaterial=new T.LineBasicMaterial({depthTest:false,transparent:true,opacity:.75});
    var targetTexture=null,compareTexture=null,textureVersion=-1,textureReport=null,textureFeature='',texturePalette='';
    function uv(geometry){var p=geometry.attributes.position.array,a=new Float32Array(p.length/3*2),st=M.SETUP.stock;for(var i=0;i<p.length/3;i++){a[i*2]=(p[i*3]-st.x0)/(st.x1-st.x0);a[i*2+1]=(p[i*3+1]-st.y0)/(st.y1-st.y0);}geometry.setAttribute('uv',new T.BufferAttribute(a,2));}
    function visibility(){if(meshObject)meshObject.visible=comparison!=='target'&&lastVersion>=0;if(targetObject)targetObject.visible=comparison==='target';if(targetEdges)targetEdges.visible=comparison==='compare';tool.visible=comparison!=='target';}
    function textures(P){
      var f=currentMeta.field;if(!f||!model)return;
      var version=comparison==='compare'?model.version:-1,activeReport=comparison==='compare'?currentMeta.report:null;
      if(textureVersion===version&&textureReport===activeReport&&textureFeature===currentMeta.feature&&texturePalette===palette)return;
      var size=model.nx*model.ny,desired=new Uint8Array(size*4),compare=new Uint8Array(size*4),selection=f.ids.indexOf(currentMeta.feature),report=currentMeta.report;
      for(var k=0;k<size;k++){
        var z=model.raster[k],hv=z<=model.stock.bottom+1e-9?-Infinity:z;
        var category=hv>f.hi[k]+1e-9?1:hv<f.lo[k]-1e-9?2:0;if(report&&report.status[k]===2)category=2;
        var c=category===1?P.excess:category===2?((k%model.nx+Math.floor(k/model.nx))%10<5?P.over:P.paper):P.metalTop;
        var dim=selection>=0&&f.owners[k]!==selection;
        var shade=1-.18*Math.min(1,Math.max(0,((currentMeta.job&&currentMeta.job.top)||0)-f.nom[k])/8);
        for(var n=0;n<3;n++){compare[k*4+n]=Math.round(c[n]);desired[k*4+n]=Math.round(dim?P.target[n]*.35+P.paper[n]*.65:P.target[n]*shade);}
        compare[k*4+3]=desired[k*4+3]=255;
      }
      function upload(texture,data){if(!texture){texture=new T.DataTexture(data,model.nx,model.ny);texture.colorSpace=T.SRGBColorSpace;}else texture.image.data=data;texture.needsUpdate=true;return texture;}
      targetTexture=upload(targetTexture,desired);compareTexture=upload(compareTexture,compare);
      targetMaterial.map=targetTexture;targetMaterial.needsUpdate=true;
      textureVersion=version;textureReport=activeReport;textureFeature=currentMeta.feature;texturePalette=palette;
    }
    function target(meta,P){
      currentMeta=meta||{};comparison=currentMeta.field?(currentMeta.comparison||'work'):'work';
      if(targetField!==currentMeta.field){
        if(targetObject){targetObject.geometry.dispose();scene.remove(targetObject);targetObject=null;}if(targetEdges){targetEdges.geometry.dispose();scene.remove(targetEdges);targetEdges=null;}
        targetField=currentMeta.field;textureVersion=-2;
        if(targetField){var data=root.CourseWikiMillingTargetMesh.build(targetField.nom,model.nx,model.ny,model.stock),g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(data.positions,3));g.computeVertexNormals();uv(g);targetObject=new T.Mesh(g,targetMaterial);scene.add(targetObject);var eg=new T.BufferGeometry();eg.setAttribute('position',new T.BufferAttribute(data.edges,3));targetEdges=new T.LineSegments(eg,targetLineMaterial);targetEdges.renderOrder=10;scene.add(targetEdges);host.setAttribute('data-target-stats',JSON.stringify({triangles:data.triangles,pitch:data.pitch}));}
      }
      textures(P);metal.map=comparison==='compare'?compareTexture:null;metal.color.set(comparison==='compare'?'white':'rgb('+P.metalTop.map(Math.round).join(',')+')');metal.needsUpdate=true;
      targetLineMaterial.color.set('rgb('+P.target.map(Math.round).join(',')+')');visibility();host.setAttribute('data-comparison',comparison);
    }
    scene.add(new T.HemisphereLight(0xffffff,0x555555,2.4));
    var light=new T.DirectionalLight(0xffffff,3);light.position.set(-80,-70,160);scene.add(light);
    var fixtureMeshes=[];
    function box(x0,x1,y0,y1,z0,z1,mat){var mesh=new T.Mesh(new T.BoxGeometry(x1-x0,y1-y0,z1-z0),mat);mesh.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);scene.add(mesh);fixtureMeshes.push(mesh);return mesh;}
    M.SETUP.jaws.forEach(function(j){box(j.x0,j.x1,j.y0,j.y1,-28,M.SETUP.jawTop,fixtureMat);});
    M.SETUP.parallels.forEach(function(j){box(j.x0,j.x1,j.y0,j.y1,-28,M.SETUP.parallelTop,fixtureMat);});
    box(-30,130,-14,74,-36,M.SETUP.viseFloor,fixtureMat);
    var grid=new T.GridHelper(220,22);grid.rotation.x=Math.PI/2;grid.position.set(50,30,-36.1);scene.add(grid);
    var axes=new T.Group();axes.position.set(-18,-22,0);scene.add(axes);
    var axisColors=[0x00a4e3,0xecac00,0xff4500];
    ['X','Y','Z'].forEach(function(label,i){var d=new T.Vector3(i===0?1:0,i===1?1:0,i===2?1:0);axes.add(new T.ArrowHelper(d,new T.Vector3(),20,axisColors[i],3,1.5));
      var c=document.createElement('canvas');c.width=64;c.height=64;var ctx=c.getContext('2d');ctx.font='bold 40px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffffff';ctx.fillRect(0,8,64,48);ctx.fillStyle='#002144';ctx.fillText(label+'+',32,32);
      var texture=new T.CanvasTexture(c),sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false}));sprite.position.copy(d.multiplyScalar(25));sprite.scale.set(10,10,1);axes.add(sprite);
    });
    var tool=new T.Group();scene.add(tool);var toolKey='';
    var mode='',pointer=null,axisGuide=null;
    var previewMaterial=new T.LineBasicMaterial({color:0xecac00,depthTest:false}),previewLine=new T.Line(new T.BufferGeometry(),previewMaterial);previewLine.visible=false;previewLine.renderOrder=20;scene.add(previewLine);
    var pointerText=document.createElement('span');pointerText.className='ms-pointer-preview';host.appendChild(pointerText);
    function projected(p){var v=new T.Vector3(p.x,p.y,p.z).project(camera),r=canvas.getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};}
    function ray(e){var r=canvas.getBoundingClientRect(),caster=new T.Raycaster();caster.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);return caster;}
    function interaction(next){mode=next;controls.enabled=mode==='inspect';pointer=null;previewLine.visible=false;pointerText.textContent='';
      if(axisGuide){scene.remove(axisGuide);axisGuide.line.geometry.dispose();axisGuide.cone.geometry.dispose();axisGuide=null;}
      if(mode!=='inspect'&&mode!=='xy'){var d=new T.Vector3(mode==='x'?1:0,mode==='y'?1:0,mode==='z'?1:0);axisGuide=new T.ArrowHelper(d,new T.Vector3(),25,0xecac00,4,2);axisGuide.line.material.depthTest=false;axisGuide.cone.material.depthTest=false;scene.add(axisGuide);}
      canvas.setAttribute('aria-label',mode==='inspect'?'3D camera. Arrow keys orbit; plus and minus zoom; Home resets. Camera controls do not move the tool.':
        'Tool feed mode '+mode.toUpperCase()+'. Drag the tool and release to feed. Arrow keys feed the selected machine axis; Escape cancels a drag or stops the feed.');request();
    }
    function preview(target){var plan=model.plan(target),points=[new T.Vector3(model.pos.x,model.pos.y,model.pos.z)];plan.legs.forEach(function(l){points.push(new T.Vector3(l.to.x,l.to.y,l.to.z));});previewLine.geometry.dispose();previewLine.geometry=new T.BufferGeometry().setFromPoints(points);previewLine.visible=true;
      var first=plan.legs[0],check=first?(first.axis==='xy'?model.checkXY(first.from,first.to,first.from.z):model.checkZ(first.from,first.from.z,first.to.z)):null;
      pointerText.textContent='Release to feed '+mode.toUpperCase()+': '+['x','y','z'].map(function(a){return a.toUpperCase()+' '+M.fmt(plan.target[a],2);}).join(' · ')+(check?' · '+(!check.ok?'model will stop at a limit':check.engaged?'first leg cuts':'first leg in air'):'');request();return plan.target;
    }
    canvas.addEventListener('pointerdown',function(e){
      if(e.button!==0)return;pointer={x:e.clientX,y:e.clientY,mode:mode};if(mode==='inspect')return;
      if(!model||!model.tool||currentMeta.busy||comparison==='target'){pointer=null;pointerText.textContent='Show your work and choose a tool before feeding.';return;}
      var tip=projected(model.pos);if(mode!=='xy'&&Math.hypot(e.clientX-tip.x,e.clientY-tip.y)>48){pointer=null;pointerText.textContent='Drag near the tool tip to feed '+mode.toUpperCase()+'.';return;}
      pointer.from=Object.assign({},model.pos);pointer.target=Object.assign({},model.pos);canvas.setPointerCapture(e.pointerId);e.preventDefault();
      if(mode==='xy'){var hit=new T.Vector3();if(ray(e).ray.intersectPlane(new T.Plane(new T.Vector3(0,0,1),-model.pos.z),hit))pointer.target=preview({x:hit.x,y:hit.y,z:model.pos.z});}
    });
    canvas.addEventListener('pointermove',function(e){if(!pointer||pointer.mode==='inspect'||!pointer.from)return;var target=Object.assign({},pointer.from),step=Math.min(currentMeta.step||1,1);
      if(mode==='xy'){var plane=new T.Plane(new T.Vector3(0,0,1),-pointer.from.z),p=new T.Vector3();if(!ray(e).ray.intersectPlane(plane,p))return;target.x=p.x;target.y=p.y;}
      else {var a=projected(pointer.from),tip=Object.assign({},pointer.from);tip[mode]+=10;var b=projected(tip),dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;if(den<4){pointerText.textContent='This axis is end-on. Choose Home or use the numeric position.';return;}target[mode]+=10*((e.clientX-pointer.x)*dx+(e.clientY-pointer.y)*dy)/den;}
      ['x','y','z'].forEach(function(a){if(mode===a||(mode==='xy'&&a!=='z'))target[a]=Math.round(target[a]/step)*step;});pointer.target=preview(target);
    });
    canvas.addEventListener('pointerup',function(e){var p=pointer;pointer=null;if(!p)return;
      if(p.mode==='inspect'){if(Math.hypot(e.clientX-p.x,e.clientY-p.y)<5&&currentMeta.job&&!currentMeta.job.free){var hits=ray(e).intersectObjects([comparison==='target'?targetObject:meshObject].filter(Boolean));if(hits.length){var hit=hits[0].point,env={};root.CourseWikiMillingInspect.envAt(currentMeta.job,hit.x,hit.y,env);if(options.onFeature)options.onFeature(env.owner);}}return;}
      previewLine.visible=false;pointerText.textContent='';if(p.from&&p.target&&Math.hypot(p.target.x-p.from.x,p.target.y-p.from.y,p.target.z-p.from.z)>.0001&&options.onMove)options.onMove(p.target,'Drag '+mode.toUpperCase());request();
    });
    canvas.addEventListener('pointercancel',function(){pointer=null;previewLine.visible=false;pointerText.textContent='';request();});
    canvas.addEventListener('keydown',function(e){if(e.ctrlKey||e.metaKey||e.altKey)return;var used=true;
      if(e.key==='Escape'){pointer=null;previewLine.visible=false;pointerText.textContent='';if(options.onStop)options.onStop();}
      else if(mode!=='inspect'&&comparison!=='target'&&/Arrow/.test(e.key)){var ax=mode==='xy'?(/Left|Right/.test(e.key)?'x':'y'):mode,sign=/Right|Up/.test(e.key)?1:-1;if(options.onJog)options.onJog(ax,sign);}
      else if((mode==='inspect'||comparison==='target')&&/Arrow/.test(e.key)){var d=camera.position.clone().sub(controls.target),r=d.length(),az=Math.atan2(d.y,d.x),elev=Math.asin(d.z/r);az+=e.key==='ArrowLeft'?.15:e.key==='ArrowRight'?-.15:0;elev=Math.max(.06,Math.min(1.5,elev+(e.key==='ArrowUp'?.1:e.key==='ArrowDown'?-.1:0)));camera.position.set(controls.target.x+r*Math.cos(elev)*Math.cos(az),controls.target.y+r*Math.cos(elev)*Math.sin(az),controls.target.z+r*Math.sin(elev));controls.update();}
      else if(e.key==='+'||e.key==='='||e.key==='-'){var d=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(d.multiplyScalar(e.key==='-'?1.1:.9));controls.update();}
      else if(e.key==='Home')preset('home');else used=false;
      if(used){e.preventDefault();e.stopPropagation();request();}
    });
    function disposeGroup(group){var owned=new Set();group.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material&&o.material!==toolMat&&o.material!==fixtureMat)owned.add(o.material);});owned.forEach(function(m){if(m.map)m.map.dispose();m.dispose();});group.clear();}
    function toolShape(t){
      var key=t?t.id+':'+t.dia:'';if(key===toolKey)return;toolKey=key;disposeGroup(tool);
      if(!t)return;
      function cyl(r1,r2,h,z,mat){var o=new T.Mesh(new T.CylinderGeometry(r1,r2,h,32),mat);o.rotation.x=Math.PI/2;o.position.z=z;tool.add(o);return o;}
      var cone=t.cone?t.dia/2*t.cone:0,reach=t.reach;
      var insertMat=new T.MeshStandardMaterial({color:0xecac00,roughness:.5,metalness:.3});
      if(t.kind==='face'){
        cyl(t.dia*.44,t.dia*.44,18,reach+9,toolMat);
        for(var i=0;i<t.teeth;i++){var a=i*2*Math.PI/t.teeth,o=new T.Mesh(new T.BoxGeometry(5,4,reach+1),insertMat);o.position.set((t.dia/2-2.5)*Math.cos(a),(t.dia/2-2.5)*Math.sin(a),(reach+1)/2);o.rotation.z=a;tool.add(o);}
        cyl(10,10,16,reach+26,fixtureMat);return;
      }
      if(t.kind==='bore'){
        // Match the offset bar and single cutting point in the canonical rack.
        var bar=cyl((t.barDia-1.5)/2,(t.barDia-1.5)/2,reach-1.5,(reach+1.5)/2,toolMat);bar.position.x=t.dia/2-(t.barDia+1.5)/2;
        var bit=new T.Mesh(new T.BoxGeometry(3,3,3),insertMat);bit.position.set(t.dia/2-1.5,0,1.5);tool.add(bit);
        cyl(Math.max(18,t.dia/2+6),Math.max(18,t.dia/2+6),16,reach+8,fixtureMat);cyl(9,9,18,reach+25,toolMat);return;
      }
      insertMat.dispose();
      if(t.kind==='tap'){
        var thread=M.THREADS[t.thread],lead=t.lead*thread.pitch,minor=thread.tapDrill/2;
        cyl(t.dia/2,minor,lead,lead/2,toolMat);cyl(t.dia/2,t.dia/2,reach-lead,(reach+lead)/2,toolMat);
        var threadLine=new T.LineBasicMaterial({color:0xecac00}),pts=[];
        for(var z=0;z<=Math.min(reach,16);z+=thread.pitch/20){var a=z/thread.pitch*2*Math.PI,r=minor+(t.dia/2-minor)*Math.min(1,z/lead);pts.push(new T.Vector3(r*Math.cos(a),r*Math.sin(a),z));}
        tool.add(new T.Line(new T.BufferGeometry().setFromPoints(pts),threadLine));
      }else{
      if(cone)cyl(t.dia/2,0,cone,cone/2,toolMat);
      cyl(t.dia/2,t.dia/2,Math.max(.1,reach-cone),cone+(reach-cone)/2,toolMat);
      }
      cyl(t.kind==='face'?10:t.dia/2,t.kind==='face'?10:t.dia/2,15,reach+7.5,toolMat);
      cyl(13,10,15,reach+22.5,fixtureMat);
      // Flute grooves run round the cutting portion; the geometry's diameter
      // and cone come directly from the shared tool definition.
      var lineMat=new T.LineBasicMaterial({color:0xecac00});
      for(var k=0;k<(t.teeth||2);k++){
        var pts=[];for(var j=0;j<=32;j++){var z=cone+(reach-cone)*j/32,a=2*Math.PI*k/(t.teeth||2)+j/32*Math.PI;pts.push(new T.Vector3(Math.cos(a)*t.dia/2,Math.sin(a)*t.dia/2,z));}
        tool.add(new T.Line(new T.BufferGeometry().setFromPoints(pts),lineMat));
      }
    }
    function render(){frame=0;if(disposed||!host.clientWidth||!host.clientHeight)return;var w=host.clientWidth,h=host.clientHeight;
      if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
      renderer.render(scene,camera);host.setAttribute('data-frame',String(Number(host.getAttribute('data-frame')||0)+1));
      if(model){var points={tip:projected(model.pos)};['x','y','z'].forEach(function(a){var p=Object.assign({},model.pos);p[a]+=10;points[a]=projected(p);});host.setAttribute('data-tool-projection',JSON.stringify(points));}
    }
    function request(){if(!frame&&!disposed)frame=requestAnimationFrame(render);}
    controls.addEventListener('change',request);
    function fallback(reason){epoch++;queued=false;surfaceStatus.textContent=reason;host.setAttribute('data-renderer','complexity-fallback');if(meshObject)meshObject.visible=false;if(options.onFallback)options.onFallback(reason);}
    function install(data,version){
      var start=performance.now();
      var geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(data.positions,3));geometry.setAttribute('color',new T.BufferAttribute(data.colors,3));geometry.computeVertexNormals();
      uv(geometry);
      if(meshObject){meshObject.geometry.dispose();scene.remove(meshObject);}meshObject=new T.Mesh(geometry,metal);scene.add(meshObject);
      lastVersion=version;lastBuild=performance.now();host.setAttribute('data-renderer','webgl2');host.setAttribute('data-mesh-version',String(version));
      visibility();
      host.setAttribute('data-mesh-stats',JSON.stringify(Object.assign({},data.stats,{uploadMilliseconds:lastBuild-start,worker:true})));request();
    }
    worker.onmessage=function(event){var result=event.data;workerBusy=false;if(disposed)return;
      if(result.epoch===epoch){if(result.error||result.mesh.unavailable)fallback(result.error||result.mesh.reason);else if(result.version>=lastVersion)install(result.mesh,result.version);}
      surfaceStatus.textContent=model&&lastVersion!==model.version?'Updating cut surface…':'';
      if(queued){queued=false;rebuild();}
    };
    worker.onerror=function(e){e.preventDefault();workerBusy=false;fallback('3D surface computation is unavailable. Continue in Top and front.');};
    function rebuild(){
      timer=0;if(!model||disposed)return;if(workerBusy){queued=true;return;}
      var available=Mesh.availability(model);if(!available.ok){fallback(available.reason);return;}
      var snapshot={stock:Object.assign({},model.stock),prims:model.prims.map(function(p){return{ax:p.ax,ay:p.ay,bx:p.bx,by:p.by,r:p.r,z:p.z,cone:p.cone};})};
      requestedVersion=model.version;workerBusy=true;surfaceStatus.textContent='Updating cut surface…';
      worker.postMessage({id:++requestId,epoch:epoch,version:model.version,snapshot:snapshot});
    }
    function update(sim,P,force,meta){
      if(disposed)return;
      if(lastSim!==sim||sim.removed<lastRemoved-1e-7||sim.prims.length<lastCount){epoch++;lastVersion=-1;requestedVersion=-1;if(meshObject)meshObject.visible=false;}
      model=sim;lastSim=sim;lastRemoved=sim.removed;lastCount=sim.prims.length;host.setAttribute('data-model-version',String(sim.version));
      var key=JSON.stringify([P.paper,P.metalTop,P.jaw,P.accent]);
      if(palette!==key){palette=key;scene.background=new T.Color('rgb('+P.paper.map(Math.round).join(',')+')');metal.color.set('rgb('+P.metalTop.map(Math.round).join(',')+')');fixtureMat.color.set('rgb('+P.jaw.map(Math.round).join(',')+')');toolMat.color.set('rgb('+P.accent.map(Math.round).join(',')+')');}
      toolShape(sim.tool);tool.position.set(sim.pos.x,sim.pos.y,sim.pos.z);
      target(meta,P);
      if(mode!==(currentMeta.interaction||'inspect'))interaction(currentMeta.interaction||'inspect');
      if(axisGuide){axisGuide.position.copy(tool.position);axisGuide.visible=comparison!=='target';}
      if(lastVersion!==sim.version&&(!workerBusy||requestedVersion!==sim.version)){if(force||performance.now()-lastBuild>80)rebuild();else if(!timer)timer=setTimeout(rebuild,80);}
      request();
    }
    function preset(name){controls.target.set(50,30,-5);controls.maxPolarAngle=name==='bottom'?Math.PI-.02:Math.PI/2-.06;camera.position.set(name==='top'||name==='bottom'?50:name==='front'?50:-100,name==='top'||name==='bottom'?29.99:name==='front'?-190:-145,name==='top'?230:name==='bottom'?-230:name==='front'?10:130);camera.up.set(0,0,1);fixtureMeshes.forEach(function(o){o.visible=name!=='bottom';});grid.visible=name!=='bottom';host.setAttribute('data-camera-view',name);controls.update();request();}
    function turn(sign){var d=camera.position.clone().sub(controls.target);d.applyAxisAngle(new T.Vector3(0,0,1),sign*Math.PI/4);camera.position.copy(controls.target).add(d);controls.update();request();}
    var ro=new ResizeObserver(request);ro.observe(host);
    canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();host.setAttribute('data-renderer','lost');});
    function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);clearTimeout(timer);worker.terminate();URL.revokeObjectURL(workerURL);if(compareTexture)compareTexture.dispose();if(targetTexture)targetTexture.dispose();ro.disconnect();removal.disconnect();controls.dispose();scene.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}});renderer.dispose();renderer.forceContextLoss();canvas.remove();}
    var removal=new MutationObserver(function(){if(!host.isConnected)dispose();});removal.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pagehide',dispose,{once:true});
    return {update:update,preset:preset,turn:turn,canvas:canvas,dispose:dispose};
  }
  root.CourseWikiMilling3D={create:create};
})(typeof self!=='undefined'?self:this);

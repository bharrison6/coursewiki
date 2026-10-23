/* WebGL presentation only. No machining or assessment takes place here. */
(function (root) {
  'use strict';
  var T = root.CourseWikiThree, M = root.CourseWikiMillingSim, Mesh = root.CourseWikiMillingMesh;
  function create(host) {
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
    controls.target.set(50,30,-5);camera.position.set(-100,-145,130);controls.update();
    var frame=0,disposed=false,meshObject=null,model=null,lastVersion=-1,lastSim=null,lastBuild=0,timer=0;
    var palette=null,metal=new T.MeshStandardMaterial({roughness:.8,metalness:.15,vertexColors:true,side:T.DoubleSide});
    var fixtureMat=new T.MeshStandardMaterial({roughness:.85,metalness:.1}),toolMat=new T.MeshStandardMaterial({roughness:.45,metalness:.5});
    scene.add(new T.HemisphereLight(0xffffff,0x555555,2.4));
    var light=new T.DirectionalLight(0xffffff,3);light.position.set(-80,-70,160);scene.add(light);
    function box(x0,x1,y0,y1,z0,z1,mat){var mesh=new T.Mesh(new T.BoxGeometry(x1-x0,y1-y0,z1-z0),mat);mesh.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);scene.add(mesh);return mesh;}
    M.SETUP.jaws.forEach(function(j){box(j.x0,j.x1,j.y0,j.y1,-28,M.SETUP.jawTop,fixtureMat);});
    M.SETUP.parallels.forEach(function(j){box(j.x0,j.x1,j.y0,j.y1,-28,M.SETUP.parallelTop,fixtureMat);});
    box(-30,130,-14,74,-36,M.SETUP.viseFloor,fixtureMat);
    var grid=new T.GridHelper(220,22);grid.rotation.x=Math.PI/2;grid.position.set(50,30,-36.1);scene.add(grid);
    var axes=new T.Group();axes.position.set(-18,-22,0);scene.add(axes);
    var axisColors=[0x00a4e3,0xecac00,0xff4500];
    ['X','Y','Z'].forEach(function(label,i){var d=new T.Vector3(i===0?1:0,i===1?1:0,i===2?1:0);axes.add(new T.ArrowHelper(d,new T.Vector3(),20,axisColors[i],3,1.5));
      var c=document.createElement('canvas');c.width=64;c.height=64;var ctx=c.getContext('2d');ctx.font='bold 40px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#'+axisColors[i].toString(16).padStart(6,'0');ctx.fillText(label+'+',32,32);
      var texture=new T.CanvasTexture(c),sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false}));sprite.position.copy(d.multiplyScalar(25));sprite.scale.set(10,10,1);axes.add(sprite);
    });
    var tool=new T.Group();scene.add(tool);var toolKey='';
    function disposeGroup(group){group.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material&&o.material.map)o.material.map.dispose();});group.clear();}
    function toolShape(t){
      var key=t?t.id+':'+t.dia:'';if(key===toolKey)return;toolKey=key;disposeGroup(tool);
      if(!t)return;
      function cyl(r1,r2,h,z,mat){var o=new T.Mesh(new T.CylinderGeometry(r1,r2,h,32),mat);o.rotation.x=Math.PI/2;o.position.z=z;tool.add(o);return o;}
      var cone=t.cone?t.dia/2*t.cone:0,reach=t.reach;
      if(cone)cyl(t.dia/2,0,cone,cone/2,toolMat);
      cyl(t.dia/2,t.dia/2,Math.max(.1,reach-cone),cone+(reach-cone)/2,toolMat);
      cyl(t.kind==='face'?10:t.dia/2,t.kind==='face'?10:t.dia/2,15,reach+7.5,toolMat);
      cyl(13,10,15,reach+22.5,fixtureMat);
      // Flute grooves run round the cutting portion; the geometry's diameter
      // and cone come directly from the shared tool definition.
      var lineMat=new T.LineBasicMaterial({color:0x002144});
      for(var k=0;k<(t.teeth||2);k++){
        var pts=[];for(var j=0;j<=32;j++){var z=cone+(reach-cone)*j/32,a=2*Math.PI*k/(t.teeth||2)+j/32*Math.PI;pts.push(new T.Vector3(Math.cos(a)*t.dia/2,Math.sin(a)*t.dia/2,z));}
        tool.add(new T.Line(new T.BufferGeometry().setFromPoints(pts),lineMat));
      }
    }
    function render(){frame=0;if(disposed||!host.clientWidth||!host.clientHeight)return;var w=host.clientWidth,h=host.clientHeight;
      if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
      renderer.render(scene,camera);host.setAttribute('data-frame',String(Number(host.getAttribute('data-frame')||0)+1));
    }
    function request(){if(!frame&&!disposed)frame=requestAnimationFrame(render);}
    controls.addEventListener('change',request);
    function rebuild(){
      timer=0;if(!model||disposed)return;var start=performance.now(),data=Mesh.build(model,{color:function(){return[1,1,1];}});
      var geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(data.positions,3));geometry.setAttribute('color',new T.BufferAttribute(data.colors,3));geometry.computeVertexNormals();
      if(meshObject){meshObject.geometry.dispose();scene.remove(meshObject);}meshObject=new T.Mesh(geometry,metal);scene.add(meshObject);
      lastSim=model;lastVersion=model.version;lastBuild=performance.now();
      host.setAttribute('data-mesh-stats',JSON.stringify(Object.assign({},data.stats,{totalMilliseconds:lastBuild-start})));request();
    }
    function update(sim,P,force){
      if(disposed)return;
      model=sim;var key=JSON.stringify([P.paper,P.metalTop,P.jaw,P.accent]);
      if(palette!==key){palette=key;scene.background=new T.Color('rgb('+P.paper.map(Math.round).join(',')+')');metal.color.set('rgb('+P.metalTop.map(Math.round).join(',')+')');fixtureMat.color.set('rgb('+P.jaw.map(Math.round).join(',')+')');toolMat.color.set('rgb('+P.accent.map(Math.round).join(',')+')');}
      toolShape(sim.tool);tool.position.set(sim.pos.x,sim.pos.y,sim.pos.z);
      if(lastSim!==sim||lastVersion!==sim.version){if(force||performance.now()-lastBuild>80)rebuild();else if(!timer)timer=setTimeout(rebuild,80);}
      request();
    }
    function preset(name){controls.target.set(50,30,-5);camera.position.set(name==='top'?50:name==='front'?50:-100,name==='top'?30:name==='front'?-190:-145,name==='top'?230:name==='front'?10:130);camera.up.set(0,name==='top'?1:0,name==='top'?0:1);controls.update();request();}
    function turn(sign){var d=camera.position.clone().sub(controls.target);d.applyAxisAngle(new T.Vector3(0,0,1),sign*Math.PI/4);camera.position.copy(controls.target).add(d);controls.update();request();}
    var ro=new ResizeObserver(request);ro.observe(host);
    canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();host.setAttribute('data-renderer','lost');});
    function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);clearTimeout(timer);ro.disconnect();removal.disconnect();controls.dispose();scene.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}});renderer.dispose();renderer.forceContextLoss();canvas.remove();}
    var removal=new MutationObserver(function(){if(!host.isConnected)dispose();});removal.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pagehide',dispose,{once:true});
    return {update:update,preset:preset,turn:turn,canvas:canvas,dispose:dispose};
  }
  root.CourseWikiMilling3D={create:create};
})(typeof self!=='undefined'?self:this);

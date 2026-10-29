(function(root){
  'use strict';
  var T=root.CourseWikiThree,A=root.CourseWikiCutterAxial;
  function create(host,spec,projection){
    if(!T||!A)throw new Error('3D anatomy runtime unavailable');
    var renderer=new T.WebGLRenderer({antialias:true,alpha:false}),canvas=renderer.domElement;
    canvas.className='ema-webgl';canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Three-dimensional end mill anatomy. Drag to orbit, wheel to zoom, arrow keys to orbit, plus and minus to zoom, Home to reset.');
    host.appendChild(canvas);var scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.1,500),controls=new T.OrbitControls(camera,canvas);
    controls.enableDamping=false;controls.target.set(0,0,45);controls.minDistance=80;controls.maxDistance=260;
    var defaultCamera=new T.Vector3(155,-195,150);camera.position.copy(defaultCamera);
    scene.add(new T.HemisphereLight(0xffffff,0x334455,2.2));var light=new T.DirectionalLight(0xffffff,2);light.position.set(60,-80,140);scene.add(light);
    function metal(color){return new T.MeshStandardMaterial({color:color,metalness:.55,roughness:.42,side:T.DoubleSide});}
    var cutMat=metal(0x8ca6b7),neckMat=metal(0xa9bdc8),shankMat=metal(0x778e9d),edgeMat=new T.LineBasicMaterial({color:0xecac00});
    var holderMat=new T.MeshStandardMaterial({color:0x4b5d69,metalness:.5,roughness:.5}),tool=null,edges=null,holder=null,activeSpec=spec,disposed=false,frame=0,observer;
    function geometry(s){
      var data=A.mesh(s,{cuttingSegments:24,triangulate:function(points){return T.ShapeUtils.triangulateShape(points.map(function(p){return new T.Vector2(p.x,p.y);}),[]);}}),g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);
      data.groups.forEach(function(group){var material=group.region==='cutting'?0:(group.region==='neck'?1:2);g.addGroup(group.start,group.count,material);});
      g.computeVertexNormals();return g;
    }
    function set(s,p,dimension){
      activeSpec=s;
      [tool,edges,holder].forEach(function(o){if(o){scene.remove(o);if(o.geometry)o.geometry.dispose();}});tool=edges=holder=null;
      cutMat.color.set(['loc','helix','pitch','diameters'].includes(dimension)?0xecac00:0x8ca6b7);
      neckMat.color.set(dimension==='lbs'?0xecac00:0xa9bdc8);
      shankMat.color.set(['oal','diameters'].includes(dimension)?0xecac00:0x778e9d);
      edgeMat.color.set(['helix','pitch'].includes(dimension)?0xff4500:0xecac00);
      holderMat.color.set(dimension==='projection'?0xecac00:0x4b5d69);
      var g=geometry(s);tool=new T.Mesh(g,[cutMat,neckMat,shankMat]);scene.add(tool);edges=new T.LineSegments(new T.EdgesGeometry(g,28),edgeMat);scene.add(edges);
      var holderLength=(s.oal-p)+20;
      holder=new T.Mesh(new T.CylinderGeometry(Math.max(s.shankDiameter*.8,8),Math.max(s.shankDiameter*.58,6),holderLength,40),holderMat);holder.rotation.x=Math.PI/2;holder.position.z=p+holderLength/2;scene.add(holder);
      controls.target.set(0,0,Math.min(p,55));request();
    }
    function render(){frame=0;if(disposed||!host.clientWidth||!host.clientHeight)return;var w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(scene,camera);}
    function request(){if(!frame&&!disposed)frame=requestAnimationFrame(render);}
    controls.addEventListener('change',request);controls.update();controls.saveState();
    function resetView(){controls.minDistance=80;controls.maxDistance=260;controls.reset();host.dataset.cameraView='orbit';controls.update();request();}
    canvas.addEventListener('keydown',function(e){var used=true;if(e.key==='ArrowLeft')controls.rotateLeft(.12);else if(e.key==='ArrowRight')controls.rotateLeft(-.12);else if(e.key==='ArrowUp')controls.rotateUp(.10);else if(e.key==='ArrowDown')controls.rotateUp(-.10);else if(e.key==='+'||e.key==='=')camera.position.multiplyScalar(.9);else if(e.key==='-')camera.position.multiplyScalar(1.1);else if(e.key==='Home')resetView();else used=false;if(used){e.preventDefault();controls.update();request();}});
    observer=new ResizeObserver(request);observer.observe(host);set(spec,projection);
    return {set:set,side:function(){var aspect=Math.max(.25,host.clientWidth/Math.max(1,host.clientHeight)),center=(activeSpec.oal+20)/2,distance=Math.max(190,center*1.15/(Math.tan(camera.fov*Math.PI/360)*aspect));controls.minDistance=80;controls.maxDistance=Math.max(260,distance*1.1);camera.position.set(distance,-.01,center);controls.target.set(0,0,center);host.dataset.cameraView='side';controls.update();request();},end:function(){controls.minDistance=20;controls.maxDistance=260;camera.position.set(0,0,-45);controls.target.set(0,0,0);host.dataset.cameraView='end';controls.update();request();},reset:resetView,dispose:function(){disposed=true;if(frame)cancelAnimationFrame(frame);observer.disconnect();controls.dispose();[tool,edges,holder].forEach(function(o){if(o&&o.geometry)o.geometry.dispose();});cutMat.dispose();neckMat.dispose();shankMat.dispose();edgeMat.dispose();holderMat.dispose();renderer.dispose();canvas.remove();}};
  }
  root.CourseWikiEndMillAnatomy3D={create:create};
})(typeof self!=='undefined'?self:this);

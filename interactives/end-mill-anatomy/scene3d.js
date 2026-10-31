(function(root){
  'use strict';
  var T=root.CourseWikiThree,A=root.CourseWikiApprovedEndMill;
  async function create(host){
    if(!T||!T.GLTFLoader||!A)throw new Error('Approved anatomy assets unavailable');
    var disposed=false,frame=0,renderer,controls,resize,theme,model,marker,holder,canvas,activeFeature='none';
    var scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.1,1000),anchors={};camera.up.set(0,0,1);
    function request(){if(!disposed&&!frame)frame=requestAnimationFrame(render);}
    function render(){frame=0;if(disposed||!host.clientWidth||!host.clientHeight)return;var w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();var bg=getComputedStyle(host).getPropertyValue('--surface-2').trim()||'#edf1f3';renderer.setClearColor(new T.Color(bg));renderer.render(scene,camera);}
    function dispose(){if(disposed)return;disposed=true;if(frame)cancelAnimationFrame(frame);if(resize)resize.disconnect();if(theme)theme.disconnect();if(controls)controls.dispose();if(canvas)canvas.removeEventListener('keydown',key);var geometries=new Set(),materials=new Set();scene.traverse(function(o){if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());if(renderer)renderer.dispose();if(canvas)canvas.remove();}
    function view(which){
      if(which==='side'){camera.position.set(135,0,38);controls.target.set(0,0,38);}
      else if(which==='end'){camera.position.set(0,0,-65);controls.target.set(0,0,0);}
      else if(which==='detail'){var end=/end_|primary_relief|rake_face|flute_valley/.test(activeFeature),p=anchors[activeFeature]||new T.Vector3(0,0,12);controls.target.copy(p);camera.position.copy(p).add(end?new T.Vector3(24,-34,-27):new T.Vector3(48,-64,24));}
      else {camera.position.set(110,-155,95);controls.target.set(0,0,38);which='orbit';}
      host.dataset.cameraView=which;controls.update();request();
    }
    function key(e){var used=true,off=camera.position.clone().sub(controls.target),align=new T.Quaternion().setFromUnitVectors(camera.up,new T.Vector3(0,1,0)),s=new T.Spherical().setFromVector3(off.applyQuaternion(align));
      if(e.key==='ArrowLeft')s.theta-=.12;else if(e.key==='ArrowRight')s.theta+=.12;else if(e.key==='ArrowUp')s.phi=Math.max(.04,s.phi-.12);else if(e.key==='ArrowDown')s.phi=Math.min(Math.PI-.04,s.phi+.12);else if(e.key==='+'||e.key==='=')s.radius=Math.max(8,s.radius*.9);else if(e.key==='-')s.radius=Math.min(500,s.radius*1.1);else if(e.key==='Home'){view('reset');e.preventDefault();e.stopPropagation();return;}else used=false;
      if(used){e.preventDefault();e.stopPropagation();camera.position.copy(new T.Vector3().setFromSpherical(s).applyQuaternion(align.invert())).add(controls.target);controls.update();request();}}
    try{
      renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,2));canvas=renderer.domElement;canvas.className='ema-webgl';canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Approved four-flute end mill. Drag to orbit, scroll to zoom; arrow keys orbit, plus and minus zoom, Home resets.');host.appendChild(canvas);
      controls=new T.OrbitControls(camera,canvas);controls.enableDamping=false;controls.minDistance=8;controls.maxDistance=500;controls.addEventListener('change',request);canvas.addEventListener('keydown',key);
      scene.add(new T.HemisphereLight(0xffffff,0x69727c,2.6));[[70,-90,110,3],[30,50,-40,2]].forEach(function(v){var l=new T.DirectionalLight(0xffffff,v[3]);l.position.set(v[0],v[1],v[2]);scene.add(l);});
      var bytes=Uint8Array.from(atob(A.base64),c=>c.charCodeAt(0));var gltf=await new T.GLTFLoader().parseAsync(bytes.buffer,'');
      model=gltf.scene;model.rotation.x=Math.PI/2;model.scale.setScalar(1000);scene.add(model);model.updateMatrixWorld(true);
      Object.keys(A.anchors).forEach(function(name){var n=model.getObjectByName('anchor_'+name);if(!n)throw new Error('Approved feature anchor missing: '+name);anchors[name]=n.getWorldPosition(new T.Vector3());});
      marker=new T.Mesh(new T.SphereGeometry(.32,16,10),new T.MeshBasicMaterial({color:0xff9e00,depthTest:true}));marker.visible=false;scene.add(marker);
      holder=new T.Mesh(new T.CylinderGeometry(10,8,32,40),new T.MeshStandardMaterial({color:0x526878,metalness:.4,roughness:.5}));holder.rotation.x=Math.PI/2;holder.visible=false;scene.add(holder);
      host.dataset.assetVersion=A.version;host.dataset.assetSha256=A.sha256;var primitives=0,triangles=0;model.traverse(function(n){if(n.isMesh){primitives++;triangles+=(n.geometry.index?n.geometry.index.count:n.geometry.attributes.position.count)/3;}});host.dataset.meshes=String(primitives);host.dataset.triangles=String(triangles);
      resize=new ResizeObserver(request);resize.observe(host);theme=new MutationObserver(request);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});
      view('reset');
      return {view:view,set:function(projection,feature,mounted){activeFeature=feature;marker.visible=feature!=='none';if(marker.visible){if(!anchors[feature])throw new Error('Unknown anatomy feature');marker.position.copy(anchors[feature]);}holder.visible=!!mounted;holder.position.z=projection+16;host.dataset.feature=feature;host.dataset.projection=String(projection);request();},dispose:dispose};
    }catch(error){dispose();throw error;}
  }
  root.CourseWikiEndMillAnatomy3D={create:create};
})(typeof globalThis!=='undefined'?globalThis:this);
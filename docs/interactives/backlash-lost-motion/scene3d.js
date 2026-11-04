(function (root) {
  'use strict';
  // Event-driven Three.js view of the original Blender cutaway. The screw node only rotates about +X;
  // the carriage node (with its nut) only translates along +X. Geometry is never scaled per axis or deformed.
  var T = root.CourseWikiThree, A = root.CourseWikiBacklashModel;
  function studioEnvironment(renderer) {
    // A plain grey room with two soft light panels, used only for reflections on the metal parts.
    var studio = new T.Scene(), geo = [], mats = [];
    function add(g, color, pos, rot) { var m = new T.MeshBasicMaterial({ color: color, side: T.BackSide }); var mesh = new T.Mesh(g, m); if (pos) mesh.position.set(pos[0], pos[1], pos[2]); if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]); studio.add(mesh); geo.push(g); mats.push(m); }
    add(new T.BoxGeometry(20, 20, 20), 0x7d838a);
    add(new T.PlaneGeometry(9, 4), 0xffffff, [0, 9.5, 2], [Math.PI / 2, 0, 0]);
    add(new T.PlaneGeometry(10, 3), 0xd9dde2, [0, 2, 9.5], [0, 0, 0]);
    var pmrem = new T.PMREMGenerator(renderer), target = pmrem.fromScene(studio, 0.03);
    geo.forEach(function (g) { g.dispose(); }); mats.forEach(function (m) { m.dispose(); }); pmrem.dispose();
    return target;
  }
  async function create(host) {
    if (!T || !T.GLTFLoader || !T.OrbitControls || !A) throw new Error('Cutaway assets unavailable');
    var disposed = false, frame = 0, renderer, controls, resize, theme, canvas, env, screw, carriage, model, view = 'close', lastC = 0;
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(24, 1, 1, 3000);
    function request() { if (!disposed && !frame) frame = requestAnimationFrame(render); }
    function render() {
      frame = 0; if (disposed || !host.clientWidth || !host.clientHeight) return;
      var w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      var bg = getComputedStyle(host).getPropertyValue('--surface-2').trim() || '#edece6'; renderer.setClearColor(new T.Color(bg)); renderer.render(scene, camera);
    }
    function frameView(which, c) {
      var x = c == null ? lastC : c;
      if (which === 'whole') { controls.target.set(-8, -10, 0); camera.position.set(-150, 240, 345); }
      else if (which === 'carriage') { controls.target.set(x, 3, 3); camera.position.set(x + 40, 95, 110); }
      else { which = 'close'; controls.target.set(x, 11, 0); camera.position.set(x + 2, 15, 38); }
      view = which; host.dataset.cameraView = which; controls.update(); request();
    }
    function key(e) {
      var used = true, off = camera.position.clone().sub(controls.target), s = new T.Spherical().setFromVector3(off);
      if (e.key === 'ArrowLeft') s.theta -= 0.12; else if (e.key === 'ArrowRight') s.theta += 0.12;
      else if (e.key === 'ArrowUp') s.phi = Math.max(0.05, s.phi - 0.12); else if (e.key === 'ArrowDown') s.phi = Math.min(Math.PI - 0.05, s.phi + 0.12);
      else if (e.key === '+' || e.key === '=') s.radius = Math.max(30, s.radius * 0.9); else if (e.key === '-') s.radius = Math.min(700, s.radius * 1.1);
      else if (e.key === 'Home') { frameView(view); e.preventDefault(); e.stopPropagation(); return; } else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); camera.position.copy(new T.Vector3().setFromSpherical(s)).add(controls.target); controls.update(); request(); }
    }
    function dispose() {
      if (disposed) return; disposed = true; if (frame) cancelAnimationFrame(frame); if (resize) resize.disconnect(); if (theme) theme.disconnect();
      if (controls) controls.dispose(); if (canvas) canvas.removeEventListener('keydown', key);
      var g = new Set(), m = new Set(); scene.traverse(function (o) { if (o.geometry) g.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (x) { m.add(x); }); });
      g.forEach(function (x) { x.dispose(); }); m.forEach(function (x) { x.dispose(); }); if (env) env.dispose(); if (renderer) renderer.dispose(); if (canvas) canvas.remove();
    }
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2)); renderer.toneMapping = T.AgXToneMapping; renderer.toneMappingExposure = 1.1;
      canvas = renderer.domElement; canvas.className = 'bl-webgl'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Quarter-cutaway lead screw, bronze nut and blue carriage. Drag to orbit and scroll to zoom; arrow keys orbit, plus and minus zoom, Home resets the view.');
      host.appendChild(canvas);
      controls = new T.OrbitControls(camera, canvas); controls.enableDamping = false; controls.minDistance = 30; controls.maxDistance = 700; controls.addEventListener('change', request); canvas.addEventListener('keydown', key);
      env = studioEnvironment(renderer); scene.environment = env.texture;
      scene.add(new T.HemisphereLight(0xffffff, 0x5d636b, 1.1));
      var keyLight = new T.DirectionalLight(0xffffff, 2.2); keyLight.position.set(-60, 160, 120); scene.add(keyLight);
      var fill = new T.DirectionalLight(0xffffff, 0.7); fill.position.set(120, 40, -60); scene.add(fill);
      var bytes = Uint8Array.from(atob(A.base64), function (c) { return c.charCodeAt(0); });
      var gltf = await new T.GLTFLoader().parseAsync(bytes.buffer, '');
      model = gltf.scene; model.scale.setScalar(1000); scene.add(model);
      screw = model.getObjectByName('Screw'); carriage = model.getObjectByName('Carriage');
      if (!screw || !carriage || !model.getObjectByName('Nut')) throw new Error('Cutaway nodes missing');
      var triangles = 0; model.traverse(function (n) { if (n.isMesh) triangles += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3; });
      host.dataset.triangles = String(triangles);
      resize = new ResizeObserver(request); resize.observe(host);
      theme = new MutationObserver(request); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      frameView('close', 0);
      return {
        view: function (which) { frameView(which); },
        // pose = model.referencePose(state): the true carriage position and the true handwheel/screw angle.
        set: function (pose) {
          screw.rotation.x = pose.screwDegrees * Math.PI / 180; carriage.position.x = pose.carriageMm / 1000; lastC = pose.carriageMm;
          if (view !== 'whole' && Math.abs(pose.carriageMm - controls.target.x) > (view === 'close' ? 8 : 14)) { var dx = pose.carriageMm - controls.target.x; controls.target.x += dx; camera.position.x += dx; controls.update(); }
          host.dataset.screwDeg = (screw.rotation.x * 180 / Math.PI).toFixed(4); host.dataset.carriageMm = (carriage.position.x * 1000).toFixed(4);
          host.dataset.screwX = screw.position.x.toFixed(6); request();
        },
        dispose: dispose
      };
    } catch (error) { dispose(); throw error; }
  }
  root.CourseWikiBacklash3D = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);

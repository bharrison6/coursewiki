(function (root) {
  'use strict';
  var T = root.CourseWikiThree, M = root.CourseWikiPrintOrientation, D = root.CourseWikiPrintOrientationDraw;
  var EYE = [0.82, -1.3, 0.95];
  function create(host) {
    if (!T || !T.WebGLRenderer || !T.OrbitControls || !M || !D) throw new Error('3D runtime unavailable');
    var disposed = false, frame = 0, renderer, controls, canvas, resize, theme, last = null;
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(32, 1, 1, 2000);
    camera.up.set(0, 0, 1);
    var dynamic = new T.Group(); scene.add(dynamic);
    function css(name, fallback) { var v = getComputedStyle(host).getPropertyValue(name).trim(); return v || fallback; }
    function request() { if (!disposed && !frame) frame = requestAnimationFrame(render); }
    function render() {
      frame = 0; if (disposed || !host.clientWidth || !host.clientHeight) return;
      var w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setClearColor(new T.Color(css('--surface-2', '#EDECE6'))); renderer.render(scene, camera);
    }
    function clearDynamic() {
      dynamic.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); });
      dynamic.clear();
    }
    function dispose() {
      if (disposed) return; disposed = true; if (frame) cancelAnimationFrame(frame);
      if (resize) resize.disconnect(); if (theme) theme.disconnect(); if (controls) controls.dispose();
      if (canvas) canvas.removeEventListener('keydown', key);
      clearDynamic(); scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); });
      if (renderer) renderer.dispose(); if (canvas) canvas.remove();
    }
    function frameDistance(size) {
      var r = 0.5 * Math.hypot(size[0], size[1], size[2]) + 14, aspect = Math.max(0.5, (host.clientWidth || 4) / (host.clientHeight || 3));
      var half = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * aspect));
      return r / Math.sin(half);
    }
    function view(which) {
      var size = last ? last.size : [60, 30, 50], target = new T.Vector3(0, 0, size[2] * 0.5), dir;
      if (which === 'front') dir = new T.Vector3(0, -1, 0.14);
      else if (which === 'top') dir = new T.Vector3(0.0001, -0.02, 1);
      else if (which === 'under') dir = new T.Vector3(0.45, -0.9, -0.55);
      else { dir = new T.Vector3(EYE[0], EYE[1], EYE[2]); which = 'iso'; }
      camera.position.copy(target).add(dir.normalize().multiplyScalar(frameDistance(size))); controls.target.copy(target);
      host.dataset.cameraView = which; controls.update(); request();
    }
    function key(e) {
      var used = true, off = camera.position.clone().sub(controls.target), align = new T.Quaternion().setFromUnitVectors(camera.up, new T.Vector3(0, 1, 0)), s = new T.Spherical().setFromVector3(off.applyQuaternion(align));
      if (e.key === 'ArrowLeft') s.theta -= 0.12; else if (e.key === 'ArrowRight') s.theta += 0.12;
      else if (e.key === 'ArrowUp') s.phi = Math.max(0.04, s.phi - 0.12); else if (e.key === 'ArrowDown') s.phi = Math.min(Math.PI - 0.04, s.phi + 0.12);
      else if (e.key === '+' || e.key === '=') s.radius = Math.max(40, s.radius * 0.9); else if (e.key === '-') s.radius = Math.min(900, s.radius * 1.1);
      else if (e.key === 'Home') { view('iso'); e.preventDefault(); e.stopPropagation(); return; } else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); camera.position.copy(new T.Vector3().setFromSpherical(s).applyQuaternion(align.invert())).add(controls.target); controls.update(); request(); }
    }
    function color(hex) { return new T.Color(hex); }
    function partMesh(a) {
      var pos = [], nor = [], col = [];
      a.faces.forEach(function (f) {
        var c = color(f.cls === 'support' ? D.COLORS.support : f.cls === 'down-ok' ? D.COLORS['down-ok'] : (f.cls === 'bed' || f.cls === 'first-layer') ? D.COLORS.bed : D.COLORS.neutral);
        f.tris.forEach(function (t) { t.forEach(function (i) {
          var p = f.pts[i], n = f.vnormals ? f.vnormals[i] : f.normal;
          pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(c.r, c.g, c.b);
        }); });
      });
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      var m = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      m.name = 'part'; return m;
    }
    function lines(segs, hex, opacity, offset) {
      var pos = [];
      segs.forEach(function (s) { var n = s[2], o = offset || 0; pos.push(s[0][0] + n[0] * o, s[0][1] + n[1] * o, s[0][2] + n[2] * o, s[1][0] + n[0] * o, s[1][1] + n[1] * o, s[1][2] + n[2] * o); });
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      return new T.LineSegments(g, new T.LineBasicMaterial({ color: color(hex), transparent: opacity < 1, opacity: opacity }));
    }
    function rod(a, b, radius, hex, basic) {
      var A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]), L = A.distanceTo(B);
      var m = new T.Mesh(new T.CylinderGeometry(radius, radius, L, 10), basic ? new T.MeshBasicMaterial({ color: color(hex) }) : new T.MeshStandardMaterial({ color: color(hex), roughness: 0.5 }));
      m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize()); return m;
    }
    function update(a, display) {
      display = display || {}; last = a; clearDynamic();
      var place = a.placement, s = a.state, P = M.PART;
      dynamic.add(partMesh(a));
      // Layer lines on the surface (every layer, or every n-th when they would merge on screen).
      var n = a.layers, stride = Math.max(1, Math.ceil(n / 100)), segs = [];
      for (var k = stride; k < n; k += stride) segs = segs.concat(M.contour(place.faces, k * s.layer));
      if (display.layerLines !== false) dynamic.add(lines(segs, '#1F1E1C', 0.22, 0.05)); // fixed: the part colour is fixed in both themes
      host.dataset.layerStride = String(stride); host.dataset.layerLines = String(Math.floor((n - 1) / stride));
      // The inspected layer: translucent plane parallel to the plate, with its outline.
      var k0 = Math.max(1, Math.min(n, display.inspect || Math.ceil(n / 2))), z = Math.min((k0 - 0.5) * s.layer, a.height - 1e-6);
      var plane = new T.Mesh(new T.PlaneGeometry(a.size[0] + 16, a.size[1] + 16), new T.MeshBasicMaterial({ color: color(css('--ink', '#1F1E1C')), transparent: true, opacity: 0.09, depthWrite: false, side: T.DoubleSide }));
      plane.position.z = z; plane.name = 'layer-plane'; dynamic.add(plane);
      var edge = new T.LineSegments(new T.EdgesGeometry(plane.geometry), new T.LineBasicMaterial({ color: color(css('--ink', '#1F1E1C')), transparent: true, opacity: 0.45 }));
      edge.position.z = z; dynamic.add(edge);
      dynamic.add(lines(M.contour(place.faces, z), css('--accent', '#002144'), 1, 0.15));
      host.dataset.inspectZ = z.toFixed(3);
      // Support proxy: footprint on the plate and pillars up to the lowest flagged face.
      var foot = [];
      a.faces.forEach(function (f) { if (f.cls === 'support') f.tris.forEach(function (t) { t.forEach(function (i) { foot.push(f.pts[i][0], f.pts[i][1], 0.03); }); }); });
      if (foot.length) {
        var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(foot, 3));
        dynamic.add(new T.Mesh(fg, new T.MeshBasicMaterial({ color: color(D.COLORS.support), transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide })));
        var pillars = M.supportPillars(a, 2.5);
        if (pillars.length) {
          var inst = new T.InstancedMesh(new T.BoxGeometry(0.55, 0.55, 1), new T.MeshStandardMaterial({ color: color(D.COLORS.support), transparent: true, opacity: 0.75, roughness: 0.8 }), pillars.length), mm = new T.Matrix4();
          pillars.forEach(function (p, i) { mm.makeScale(1, 1, p[2]); mm.setPosition(p[0], p[1], p[2] / 2); inst.setMatrixAt(i, mm); });
          dynamic.add(inst);
        }
        host.dataset.pillars = String(pillars.length);
      } else host.dataset.pillars = '0';
      // Load arrow and the stretched path (coloured only after the prediction is revealed).
      if (s.load !== 'none') {
        var mid = P.t / 2, Cc = P.t + P.r, rm = P.r + P.t / 2, path = [[P.arm - 2, mid], [Cc, mid]];
        if (s.load === 'hang') { for (var j = 1; j <= 12; j++) { var th = (270 - 90 * j / 12) * Math.PI / 180; path.push([Cc + rm * Math.cos(th), Cc + rm * Math.sin(th)]); } path.push([mid, P.back - 2]); }
        [-0.45, P.width + 0.45].forEach(function (y) {
          for (var i = 0; i + 1 < path.length; i++) {
            var a0 = path[i], b0 = path[i + 1], ang = M.layerAngle([b0[0] - a0[0], 0, b0[1] - a0[1]], s);
            dynamic.add(rod(place.toWorld([a0[0], y, a0[1]]), place.toWorld([b0[0], y, b0[1]]), 0.55, display.revealLoad ? D.angleColor(ang) : css('--ink-soft', '#565350'), true));
          }
        });
        var origin = s.load === 'hang' ? [P.arm - 3, P.width / 2, 0] : [P.arm, P.width / 2, P.t / 2], dir = s.load === 'hang' ? [0, 0, -1] : [1, 0, 0];
        var o = place.toWorld(origin), e = place.toWorld([origin[0] + dir[0] * 20, origin[1], origin[2] + dir[2] * 20]), tip = place.toWorld([origin[0] + dir[0] * 27, origin[1], origin[2] + dir[2] * 27]);
        var ink = css('--ink', '#1F1E1C');
        dynamic.add(rod(o, e, 1.1, ink));
        var cone = new T.Mesh(new T.ConeGeometry(2.6, 7, 20), new T.MeshStandardMaterial({ color: color(ink), roughness: 0.5 }));
        var E = new T.Vector3(e[0], e[1], e[2]), TP = new T.Vector3(tip[0], tip[1], tip[2]);
        cone.position.copy(E).add(TP).multiplyScalar(0.5); cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), TP.clone().sub(E).normalize()); dynamic.add(cone);
      }
      host.dataset.supportFaces = String(a.faces.filter(function (f) { return f.cls === 'support'; }).length);
      host.dataset.state = s.lay + ':' + s.spin;
      request();
    }
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
      canvas = renderer.domElement; canvas.className = 'po-webgl'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Bracket on the build plate. Drag to orbit, scroll to zoom; arrow keys orbit, plus and minus zoom, Home resets the view.');
      host.appendChild(canvas);
      controls = new T.OrbitControls(camera, canvas); controls.enableDamping = false; controls.minDistance = 40; controls.maxDistance = 900; controls.addEventListener('change', request);
      canvas.addEventListener('keydown', key);
      scene.add(new T.HemisphereLight(0xffffff, 0x6b7178, 2.2));
      [[60, -90, 120, 2.4], [-70, 60, 40, 0.9]].forEach(function (v) { var l = new T.DirectionalLight(0xffffff, v[3]); l.position.set(v[0], v[1], v[2]); scene.add(l); });
      var plate = new T.Mesh(new T.PlaneGeometry(96, 96), new T.MeshStandardMaterial({ color: color(css('--surface', '#FBFAF8')), roughness: 0.9 }));
      plate.position.z = -0.05; plate.name = 'plate'; scene.add(plate);
      var grid = new T.GridHelper(90, 9, color(css('--ink-soft', '#565350')), color(css('--ink-soft', '#565350'))); grid.material.transparent = true; grid.material.opacity = 0.6; grid.rotation.x = Math.PI / 2; grid.position.z = 0.01; scene.add(grid);
      var rim = new T.LineSegments(new T.EdgesGeometry(plate.geometry), new T.LineBasicMaterial({ color: color(css('--ink-soft', '#565350')) })); rim.position.z = 0.02; scene.add(rim);
      resize = new ResizeObserver(request); resize.observe(host);
      theme = new MutationObserver(function () {
        plate.material.color = color(css('--surface', '#FBFAF8')); grid.material.color = color(css('--ink-soft', '#565350')); rim.material.color = color(css('--ink-soft', '#565350'));
        if (last && lastDisplay) update(last, lastDisplay); else request();
      });
      theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      var lastDisplay = null;
      return {
        update: function (a, display) { lastDisplay = display; update(a, display); },
        view: view, dispose: dispose, canvas: canvas,
        label: function (text) { canvas.setAttribute('aria-label', text + ' Drag to orbit, scroll to zoom; arrow keys orbit, plus and minus zoom, Home resets the view.'); }
      };
    } catch (error) { dispose(); throw error; }
  }
  root.CourseWikiPrintOrientation3D = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);

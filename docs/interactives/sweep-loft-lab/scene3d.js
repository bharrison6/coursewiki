/* WebGL view for the sweep and loft lab, on the shared CourseWikiThree runtime.
   It draws the model's own rings: nothing here changes geometry. Rendering is
   event driven (no animation loop); demo.js drives profile travel. */
(function (root) {
  'use strict';
  var T = root.CourseWikiThree, TOL = 1e-9;

  function cssColor(host, name, fallback) {
    var v = getComputedStyle(host).getPropertyValue(name).trim();
    return v || fallback;
  }

  function create(host, opts) {
    if (!T || !T.WebGLRenderer || !T.OrbitControls) throw new Error('3D runtime unavailable');
    opts = opts || {};
    var disposed = false, frame = 0, renderer, controls, canvas, resize, themeWatch;
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(32, 1, 1, 6000);
    camera.up.set(0, 0, 1);
    var content = new T.Group(); scene.add(content);
    var head = new T.Group(); scene.add(head);
    var section = false, sectionPlane = new T.Plane(new T.Vector3(0, 0, -1), 0);
    var current = null, sphere = null, showPairs = true, lastView = 'iso';
    var bodyMat = null, capMat = null, headMat = null;

    function palette() {
      var dark = cssColor(host, '--paper', '#F2F1EE').toLowerCase() === '#16181a';
      return {
        bg: cssColor(host, '--surface-2', '#EDECE6'),
        body: dark ? '#8aa3b8' : '#9cb2c5',
        bad: '#FF4500',
        accent: cssColor(host, '--accent', '#002144'),
        ink: cssColor(host, '--ink', '#1F1E1C'),
        soft: cssColor(host, '--ink-soft', '#565350'),
        head: dark ? '#ECAC00' : '#002144'
      };
    }
    function request() { if (!disposed && !frame) frame = requestAnimationFrame(render); }
    function render() {
      frame = 0;
      if (disposed || !host.clientWidth || !host.clientHeight) return;
      var w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setClearColor(new T.Color(palette().bg));
      renderer.render(scene, camera);
    }
    function clear(group) {
      var geoms = new Set(), mats = new Set();
      group.traverse(function (o) {
        if (o.geometry) geoms.add(o.geometry);
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
      });
      geoms.forEach(function (g) { g.dispose(); });
      mats.forEach(function (m) { m.dispose(); });
      while (group.children.length) group.remove(group.children[0]);
    }
    function surfaceMaterial() {
      return new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: T.DoubleSide, clippingPlanes: section ? [sectionPlane] : [] });
    }
    function solidMaterial(color, clip) {
      return new T.MeshStandardMaterial({ color: new T.Color(color), roughness: 0.5, metalness: 0.05, side: T.DoubleSide, clippingPlanes: clip && section ? [sectionPlane] : [] });
    }
    /* ring-major strip mesh; vertex colour per ring point */
    function stripGeometry(rings, isBad) {
      var M = rings.length, N = rings[0].length, pos = new Float32Array(M * N * 3), col = new Float32Array(M * N * 3), idx = [];
      var pal = palette(), body = new T.Color(pal.body), bad = new T.Color(pal.bad);
      for (var i = 0; i < M; i++) for (var j = 0; j < N; j++) {
        var k = (i * N + j) * 3, p = rings[i][j], c = isBad(i, j) ? bad : body;
        pos[k] = p[0]; pos[k + 1] = p[1]; pos[k + 2] = p[2];
        col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      }
      for (i = 0; i < M - 1; i++) for (j = 0; j < N; j++) {
        var a = i * N + j, b = i * N + (j + 1) % N, c2 = (i + 1) * N + j, d = (i + 1) * N + (j + 1) % N;
        idx.push(a, c2, b, b, c2, d);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
      return g;
    }
    function capGeometry(ring, centre) {
      var pos = [centre[0], centre[1], centre[2]], idx = [];
      ring.forEach(function (p) { pos.push(p[0], p[1], p[2]); });
      for (var j = 0; j < ring.length; j++) idx.push(0, 1 + j, 1 + (j + 1) % ring.length);
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    }
    function tube(points, radius, color, closed) {
      var curve = new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }), !!closed, 'centripetal');
      return new T.Mesh(new T.TubeGeometry(curve, Math.max(16, points.length * 3), radius, 8, !!closed), new T.MeshStandardMaterial({ color: new T.Color(color), roughness: 0.6 }));
    }
    function rod(a, b, radius, color) {
      var va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]), lenAB = va.distanceTo(vb);
      var m = new T.Mesh(new T.CylinderGeometry(radius, radius, Math.max(lenAB, 1e-6), 10), new T.MeshBasicMaterial({ color: new T.Color(color), depthTest: false, transparent: true, opacity: 0.95 }));
      m.position.copy(va.clone().add(vb).multiplyScalar(0.5));
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
      m.renderOrder = 5;
      return m;
    }
    function dot(color, p, r) {
      var m = new T.Mesh(new T.SphereGeometry(r, 16, 10), new T.MeshBasicMaterial({ color: new T.Color(color), depthTest: false, transparent: true }));
      m.position.set(p[0], p[1], p[2]); m.renderOrder = 6; return m;
    }

    /* ---------- camera ---------- */
    function fit(dirVec, keepDirection) {
      if (!sphere) return;
      var dir = dirVec;
      if (keepDirection) { dir = camera.position.clone().sub(controls.target); if (dir.lengthSq() < 1e-9) dir = dirVec; }
      dir = dir.clone().normalize();
      var aspect = host.clientWidth && host.clientHeight ? host.clientWidth / host.clientHeight : 1.4;
      var vfov = camera.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
      var dist = sphere.radius / Math.sin(Math.min(vfov, hfov) / 2) * 1.04;
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).add(dir.multiplyScalar(dist));
      controls.minDistance = sphere.radius * 0.4; controls.maxDistance = dist * 5;
      controls.update(); request();
    }
    var VIEWS = {
      iso: function () { return opts.kind === 'loft' ? new T.Vector3(1.2, -1.5, 0.75) : new T.Vector3(0.9, -1.25, 1.15); },
      top: function () { return new T.Vector3(0.0005, -0.004, 1); },
      side: function () { return new T.Vector3(0.0005, -1, 0.06); }
    };
    function view(name) {
      lastView = VIEWS[name] ? name : 'iso';
      fit(VIEWS[lastView](), false);
      host.dataset.cameraView = lastView;
    }
    function key(e) {
      var used = true, off = camera.position.clone().sub(controls.target);
      var align = new T.Quaternion().setFromUnitVectors(camera.up, new T.Vector3(0, 1, 0)), s = new T.Spherical().setFromVector3(off.clone().applyQuaternion(align));
      if (e.key === 'ArrowLeft') s.theta -= 0.12;
      else if (e.key === 'ArrowRight') s.theta += 0.12;
      else if (e.key === 'ArrowUp') s.phi = Math.max(0.04, s.phi - 0.12);
      else if (e.key === 'ArrowDown') s.phi = Math.min(Math.PI - 0.04, s.phi + 0.12);
      else if (e.key === '+' || e.key === '=') s.radius = Math.max(controls.minDistance, s.radius * 0.9);
      else if (e.key === '-') s.radius = Math.min(controls.maxDistance, s.radius * 1.1);
      else if (e.key === 'Home') { view('iso'); e.preventDefault(); e.stopPropagation(); return; }
      else used = false;
      if (used) {
        e.preventDefault(); e.stopPropagation();
        camera.position.copy(new T.Vector3().setFromSpherical(s).applyQuaternion(align.invert())).add(controls.target);
        controls.update(); request();
      }
    }

    /* ---------- sweep ---------- */
    function showSweep(result, progress) {
      var rebuilt = false;
      if (current !== result) {
        clear(content); current = result; rebuilt = true;
        var pal = palette();
        bodyMat = surfaceMaterial();
        var ghost = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side: T.DoubleSide, transparent: true, opacity: 0.24, depthWrite: false, clippingPlanes: section ? [sectionPlane] : [] });
        var g = stripGeometry(result.rings, function (i, j) { return result.fold[i][j] <= TOL; });
        var mesh = new T.Mesh(g, [bodyMat, ghost]); mesh.name = 'sweep'; content.add(mesh);
        // x-ray of the failing triangles: the folded inner wall usually sits inside the
        // elbow, so it is also drawn through the wall (same geometry, no depth test)
        var redIdx = [], idx = g.index.array, foldFlat = [];
        result.fold.forEach(function (ring) { ring.forEach(function (f) { foldFlat.push(f <= TOL); }); });
        for (var t = 0; t < idx.length; t += 3) if (foldFlat[idx[t]] || foldFlat[idx[t + 1]] || foldFlat[idx[t + 2]]) redIdx.push(idx[t], idx[t + 1], idx[t + 2]);
        if (redIdx.length) {
          var xg = new T.BufferGeometry(); xg.setAttribute('position', g.attributes.position); xg.setIndex(redIdx);
          var xray = new T.Mesh(xg, new T.MeshBasicMaterial({ color: new T.Color(pal.bad), transparent: true, opacity: 0.5, depthTest: false, depthWrite: false, side: T.DoubleSide }));
          xray.renderOrder = 4; xray.name = 'xray'; content.add(xray);
        }
        // the stretch of path that fails the local test, shown through the wall
        var run = [];
        result.samples.concat([{ flagged: false }]).forEach(function (q) {
          if (q.flagged) { run.push(q.p); return; }
          if (run.length >= 2) {
            var fm = tube(run, Math.max(0.45, g.boundingSphere.radius * 0.007), pal.bad, false);
            fm.material.dispose(); fm.material = new T.MeshBasicMaterial({ color: new T.Color(pal.bad), depthTest: false, transparent: true, opacity: 0.85 });
            fm.renderOrder = 4; fm.name = 'flagged-path'; content.add(fm);
          }
          run = [];
        });
        capMat = solidMaterial(pal.body, true);
        content.add(new T.Mesh(capGeometry(result.rings[0], result.samples[0].p), capMat));
        var line = new T.Line(new T.BufferGeometry().setFromPoints(result.samples.map(function (q) { return new T.Vector3(q.p[0], q.p[1], q.p[2]); })), new T.LineBasicMaterial({ color: new T.Color(pal.soft) }));
        content.add(line);
        sphere = g.boundingSphere.clone();
        host.dataset.vertices = String(g.attributes.position.count);
        host.dataset.redVertices = String(result.fold.reduce(function (n, ring) { return n + ring.filter(function (f) { return f <= TOL; }).length; }, 0));
        // keep n.p >= 0: planar paths lose their upper half; the helix loses the half nearest the default camera
        if (result.params.path === 'helix') sectionPlane.normal.set(0, 1, 0); else sectionPlane.normal.set(0, 0, -1);
        sectionPlane.constant = 0;
      }
      setProgress(progress == null ? 1 : progress);
      if (rebuilt) fit(VIEWS[lastView](), host.dataset.fitted === 'true');
      host.dataset.fitted = 'true';
    }
    function setProgress(p) {
      if (!current || !current.samples) return;
      var r = current, M = r.samples.length, N = r.rings[0].length, k = Math.max(1, Math.round(Math.min(Math.max(p, 0), 1) * (M - 1)));
      var mesh = content.getObjectByName('sweep');
      if (mesh) {
        // swept so far: opaque; still ahead of the profile: translucent ghost
        var done = k * N * 6, total = mesh.geometry.index.count;
        mesh.geometry.clearGroups();
        mesh.geometry.addGroup(0, done, 0);
        if (total > done) mesh.geometry.addGroup(done, total - done, 1);
      }
      clear(head);
      var pal = palette(), q = r.samples[k];
      headMat = solidMaterial(pal.head, false);
      head.add(new T.Mesh(capGeometry(r.rings[k], q.p), headMat));
      head.add(tube(r.rings[k], Math.max(0.3, sphere ? sphere.radius * 0.006 : 0.4), pal.ink, true));
      if (r.coil && r.coil.touches && r.helix) {
        // the double-normal chord to the neighbouring turn, where the coils meet
        var step = r.helix.theta / (M - 1), off = r.coil.delta / step, j = k + off <= M - 1 ? k + off : k - off;
        if (j >= 0) {
          var j0 = Math.min(Math.floor(j), M - 2), f = j - j0, A = r.samples[j0].p, B = r.samples[j0 + 1].p;
          var other = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
          head.add(rod(q.p, other, Math.max(0.5, sphere.radius * 0.008), pal.bad));
          head.add(dot(pal.bad, other, Math.max(0.9, sphere.radius * 0.014)));
          head.add(dot(pal.bad, [(q.p[0] + other[0]) / 2, (q.p[1] + other[1]) / 2, (q.p[2] + other[2]) / 2], Math.max(1.2, sphere.radius * 0.02)));
        }
      }
      if (q.centre && Number.isFinite(q.rho) && sphere && q.rho < sphere.radius * 2.5) {
        var c = [q.p[0] + q.rho * q.centre[0], q.p[1] + q.rho * q.centre[1], q.p[2] + q.rho * q.centre[2]];
        var e = [q.p[0] + q.reach * q.centre[0], q.p[1] + q.reach * q.centre[1], q.p[2] + q.reach * q.centre[2]];
        head.add(rod(q.p, c, Math.max(0.25, sphere.radius * 0.004), pal.ink));
        head.add(rod(q.p, e, Math.max(0.6, sphere.radius * 0.009), q.flagged ? pal.bad : pal.head));
        head.add(dot(pal.ink, c, Math.max(1, sphere.radius * 0.016)));
      }
      host.dataset.progressIndex = String(k);
      request();
    }

    /* ---------- loft ---------- */
    function showLoft(result, pairs) {
      showPairs = pairs !== false;
      var first = !sphere;
      clear(content); clear(head); current = result;
      var pal = palette(), st = result.spanRings, last = result.rings.length - 1;
      bodyMat = surfaceMaterial();
      var g = stripGeometry(result.rings, function (i) { return result.ringBad[i] || result.ringDoubled[i]; });
      content.add(new T.Mesh(g, bodyMat));
      capMat = solidMaterial(pal.body, true);
      var c0 = [0, 0, result.rings[0][0][2]], c1 = [0, 0, result.rings[last][0][2]];
      content.add(new T.Mesh(capGeometry(result.rings[0], c0), capMat));
      content.add(new T.Mesh(capGeometry(result.rings[last], c1), capMat));
      [0, st, 2 * st].forEach(function (ri) { content.add(tube(result.rings[ri], 0.55, pal.ink, true)); });
      if (showPairs) {
        for (var j = result.n / 8; j < result.n; j += result.n / 8) content.add(tube(result.rings.map(function (r) { return r[j]; }), 0.35, pal.soft, false));
      }
      content.add(tube(result.rings.map(function (r) { return r[0]; }), 0.9, pal.head, false));
      [0, st, 2 * st].forEach(function (ri) {
        var p = result.rings[ri][0], m = new T.Mesh(new T.SphereGeometry(2.4, 18, 12), new T.MeshStandardMaterial({ color: new T.Color(pal.head) }));
        m.position.set(p[0], p[1], p[2]); content.add(m);
      });
      sphere = g.boundingSphere.clone();
      sectionPlane.normal.set(0, 1, 0); sectionPlane.constant = 0;
      host.dataset.redRings = String(result.ringBad.filter(Boolean).length + result.ringDoubled.filter(Boolean).length);
      if (first) view('iso'); else request();
    }

    function setSection(on) {
      section = !!on;
      content.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (m.vertexColors) { m.clippingPlanes = section ? [sectionPlane] : []; m.needsUpdate = true; }
        });
      });
      if (capMat) { capMat.clippingPlanes = section ? [sectionPlane] : []; capMat.needsUpdate = true; }
      host.dataset.section = section ? 'on' : 'off';
      request();
    }
    function retheme() {
      if (!current) return request();
      var r = current; current = null;
      if (r.samples) showSweep(r, Number(host.dataset.progressIndex) / (r.samples.length - 1)); else showLoft(r, showPairs);
    }
    function dispose() {
      if (disposed) return; disposed = true;
      if (frame) cancelAnimationFrame(frame);
      if (resize) resize.disconnect();
      if (themeWatch) themeWatch.disconnect();
      if (controls) controls.dispose();
      if (canvas) canvas.removeEventListener('keydown', key);
      clear(content); clear(head);
      if (renderer) renderer.dispose();
      if (canvas) canvas.remove();
    }

    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
      renderer.localClippingEnabled = true;
      renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
      canvas = renderer.domElement; canvas.className = 'sll-webgl'; canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', (opts.label || '3D view') + '. Drag to orbit, scroll or pinch to zoom; with focus, arrow keys orbit, plus and minus zoom, Home resets the view.');
      host.appendChild(canvas);
      controls = new T.OrbitControls(camera, canvas); controls.enableDamping = false; controls.addEventListener('change', request);
      canvas.addEventListener('keydown', key);
      scene.add(new T.HemisphereLight(0xffffff, 0x5d6670, 2.4));
      [[120, -160, 220, 2.2], [-140, 90, -60, 0.9]].forEach(function (v) { var l = new T.DirectionalLight(0xffffff, v[3]); l.position.set(v[0], v[1], v[2]); scene.add(l); });
      resize = new ResizeObserver(request); resize.observe(host);
      themeWatch = new MutationObserver(retheme); themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      return { showSweep: showSweep, setProgress: setProgress, showLoft: showLoft, setSection: setSection, view: view, dispose: dispose, canvas: canvas };
    } catch (error) { dispose(); throw error; }
  }
  root.CourseWikiSweepLoft3D = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);

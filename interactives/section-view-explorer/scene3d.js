(function (root) {
  'use strict';
  // Renders surface data from model.js: the kept solid, its cap faces on the cutting
  // plane, the removed piece pulled clear, and the cutting plane itself. Geometry is never
  // clipped in the GPU; caps are real boundary faces of the kept solid, so they cannot leak.
  const T = root.CourseWikiThree;
  function hatchTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#f5e3ad'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#002144'; g.lineWidth = 3;
    for (let x = -64; x <= 64; x += 16) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 64, 0); g.stroke(); }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / 8, 1 / 8); t.anisotropy = 4;
    return t;
  }
  function geometry(o, uv) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(o.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(o.nor, 3));
    if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(o.uv, 2));
    return g;
  }
  function lines(edges) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(edges.flat(), 3));
    return g;
  }

  function create(host, hooks) {
    if (!T || !T.WebGLRenderer || !T.OrbitControls) throw new Error('3D runtime unavailable');
    let disposed = false, frame = 0, ext = null, drag = null, viewDir = 1, preset = 'orbit';
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(32, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.className = 'sve-webgl'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Three-dimensional view of the cut part. Drag the blue plane to move it, drag elsewhere to orbit, scroll to zoom. Keys: arrows orbit, plus and minus zoom, Page Up and Page Down move the plane, Home resets.');
    host.appendChild(canvas);
    // Plane dragging must see the pointer before OrbitControls does.
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    function pick(e) {
      const r = canvas.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }
    canvas.addEventListener('pointerdown', e => {
      if (!planeGroup.children.length) return;
      pick(e);
      const hits = ray.intersectObjects([...planeGroup.children.filter(o => o.userData.leg), keptGroup], true);
      const hit = hits[0];
      if (!hit || !hit.object.userData.leg) return;
      const f = camera.getWorldDirection(new T.Vector3()); f.y = 0;
      const n = f.lengthSq() > .04 ? f.normalize() : new T.Vector3(0, 0, 1);
      drag = { leg: hit.object.userData.leg, plane: new T.Plane().setFromNormalAndCoplanarPoint(n, hit.point), id: e.pointerId };
      canvas.setPointerCapture(e.pointerId); canvas.classList.add('is-dragging');
      e.preventDefault(); e.stopImmediatePropagation();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      pick(e);
      const p = ray.ray.intersectPlane(drag.plane, new T.Vector3());
      if (p) hooks.onPlaneDrag(drag.leg, p.y);
      e.stopImmediatePropagation();
    });
    const endDrag = e => { if (drag) { drag = null; canvas.classList.remove('is-dragging'); if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); e.stopImmediatePropagation(); } };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
    const controls = new T.OrbitControls(camera, canvas);
    controls.enableDamping = false; controls.minDistance = 40; controls.maxDistance = 900;
    controls.addEventListener('change', () => { preset = 'custom'; host.dataset.cameraView = preset; request(); });

    scene.add(new T.HemisphereLight(0xffffff, 0x5d6670, 2.3));
    for (const [x, y, z, i] of [[80, -140, 160, 2.4], [-120, 60, 40, 1.1]]) { const l = new T.DirectionalLight(0xffffff, i); l.position.set(x, y, z); scene.add(l); }
    const hatch = hatchTexture();
    const mats = {
      part: new T.MeshStandardMaterial({ color: 0xb4c0ca, metalness: .12, roughness: .55, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      cap: new T.MeshStandardMaterial({ map: hatch, roughness: .85, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      edge: new T.LineBasicMaterial({ color: 0x1b2630 }),
      ghost: new T.MeshStandardMaterial({ color: 0x8ea3b5, transparent: true, opacity: .16, depthWrite: false, roughness: .6 }),
      ghostEdge: new T.LineBasicMaterial({ color: 0x51677a, transparent: true, opacity: .45 }),
      plane: new T.MeshBasicMaterial({ color: 0x1a75b0, transparent: true, opacity: .16, side: T.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 }),
      planeEdge: new T.LineBasicMaterial({ color: 0x135b88 })
    };
    const keptGroup = new T.Group(), ghostGroup = new T.Group(), planeGroup = new T.Group();
    scene.add(keptGroup, ghostGroup, planeGroup);
    function clear(group) {
      for (const o of [...group.children]) { group.remove(o); o.traverse(n => { if (n.geometry) n.geometry.dispose(); }); }
    }
    function set(data) {
      clear(keptGroup); clear(ghostGroup); clear(planeGroup);
      ext = data.ext; viewDir = data.viewDir;
      keptGroup.add(new T.Mesh(geometry(data.kept.part), mats.part));
      if (data.kept.cap.pos.length) keptGroup.add(new T.Mesh(geometry(data.kept.cap, true), mats.cap));
      keptGroup.add(new T.LineSegments(lines(data.kept.edges), mats.edge));
      if (data.removed) {
        ghostGroup.add(new T.Mesh(geometry(data.removed.part), mats.ghost));
        if (data.removed.cap.pos.length) ghostGroup.add(new T.Mesh(geometry(data.removed.cap), mats.ghost));
        ghostGroup.add(new T.LineSegments(lines(data.removed.edges), mats.ghostEdge));
        ghostGroup.position.set(...data.removedOffset);
      }
      for (const q of data.planes) {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute([...q.pts[0], ...q.pts[1], ...q.pts[2], ...q.pts[0], ...q.pts[2], ...q.pts[3]], 3));
        const m = new T.Mesh(g, mats.plane); m.userData.leg = q.leg; m.renderOrder = 2; planeGroup.add(m);
        const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(q.pts.flat(), 3));
        planeGroup.add(new T.LineLoop(lg, mats.planeEdge));
      }
      for (const a of data.arrows) planeGroup.add(new T.ArrowHelper(new T.Vector3(...a.dir), new T.Vector3(...a.at), 24, 0x135b88, 9, 6));
      host.dataset.triangles = String((data.kept.part.pos.length + data.kept.cap.pos.length) / 9);
      host.dataset.capTriangles = String(data.kept.cap.pos.length / 9);
      request();
    }
    function center() { return new T.Vector3((ext.x0 + ext.x1) / 2, (ext.y0 + ext.y1) / 2, (ext.z0 + ext.z1) / 2); }
    function radius() { return Math.hypot(ext.x1 - ext.x0, ext.y1 - ext.y0, ext.z1 - ext.z0) / 2; }
    function view(which) {
      if (!ext) return;
      const c = center(), d = radius() * 3.3;
      controls.target.copy(c);
      if (which === 'arrows') camera.position.set(c.x, c.y - viewDir * d, c.z);
      else { camera.position.set(c.x + .62 * d, c.y - viewDir * .78 * d, c.z + .55 * d); which = 'orbit'; }
      controls.update(); preset = which; host.dataset.cameraView = which; request();
    }
    function key(e) {
      if (e.key === 'PageUp' || e.key === 'PageDown') { hooks.onPlaneStep(e.key === 'PageUp' ? 1 : -1); e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'Home') { view('orbit'); e.preventDefault(); e.stopPropagation(); return; }
      const off = camera.position.clone().sub(controls.target), align = new T.Quaternion().setFromUnitVectors(camera.up, new T.Vector3(0, 1, 0));
      const s = new T.Spherical().setFromVector3(off.applyQuaternion(align));
      let used = true;
      if (e.key === 'ArrowLeft') s.theta -= .12; else if (e.key === 'ArrowRight') s.theta += .12;
      else if (e.key === 'ArrowUp') s.phi = Math.max(.05, s.phi - .12); else if (e.key === 'ArrowDown') s.phi = Math.min(Math.PI - .05, s.phi + .12);
      else if (e.key === '+' || e.key === '=') s.radius = Math.max(40, s.radius * .9); else if (e.key === '-') s.radius = Math.min(900, s.radius * 1.1);
      else used = false;
      if (used) {
        e.preventDefault(); e.stopPropagation();
        camera.position.copy(new T.Vector3().setFromSpherical(s).applyQuaternion(align.invert())).add(controls.target);
        controls.update(); request();
      }
    }
    canvas.addEventListener('keydown', key);
    function request() { if (!disposed && !frame) frame = requestAnimationFrame(render); }
    function render() {
      frame = 0;
      if (disposed || !host.clientWidth || !host.clientHeight) return;
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      // Looking straight along the arrows, the removed piece and the plane fill would sit
      // between the camera and the cut face; hide them so the view matches SECTION A–A.
      const along = camera.getWorldDirection(new T.Vector3()).y * viewDir > .9;
      ghostGroup.visible = !along; planeGroup.children.forEach(o => { if (o.isMesh) o.visible = !along; });
      host.dataset.alongArrows = String(along);
      const bg = getComputedStyle(host).getPropertyValue('--surface-2').trim() || '#edece6';
      renderer.setClearColor(new T.Color(bg));
      renderer.render(scene, camera);
    }
    const resize = new ResizeObserver(request); resize.observe(host);
    const theme = new MutationObserver(request); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect(); theme.disconnect(); controls.dispose();
      clear(keptGroup); clear(ghostGroup); clear(planeGroup);
      hatch.dispose(); Object.values(mats).forEach(m => m.dispose()); renderer.dispose(); canvas.remove();
    }
    return { set, view, dispose, get preset() { return preset; } };
  }
  root.CourseWikiSectionExplorer3D = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);

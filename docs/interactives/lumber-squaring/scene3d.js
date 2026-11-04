(function (root) {
  'use strict';
  var T = root.CourseWikiThree, M = root.CourseWikiLumberSquaring;
  var NX = M ? M.NX : 0, NY = M ? M.NY : 0;
  var VIEWS = {
    angle: { pos: [-360, 330, 720], label: 'three-quarter view' },
    end: { pos: [-560, 9, 0.01], label: 'end view, sighting along the length' },
    side: { pos: [0, 24, 860], label: 'side view of edge A' },
    top: { pos: [0, 900, 0.5], label: 'view from above' },
    under: { pos: [-300, -430, 640], label: 'view from below, showing face A' }
  };
  // Model mm -> scene: X along length, Y up (thickness), Z toward the viewer at edge A.
  function sx(p) { return p[0] - 320; } function sy(p) { return p[2]; } function sz(p) { return 75 - p[1]; }
  function create(host) {
    if (!T || !M) throw new Error('3D runtime unavailable');
    var probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL unavailable');
    var disposed = false, frame = 0, renderer, controls, canvas, resize, theme;
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 1, 5, 5000);
    var board = null, highSpots = false, anim = null, paused = false, reduce = false;
    try { reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }
    renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    canvas = renderer.domElement; canvas.className = 'ls-webgl'; canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Rough board in 3D, face A down on a flat reference table. Drag to orbit, scroll to zoom; arrow keys orbit, plus and minus zoom, Home resets.');
    host.appendChild(canvas);
    controls = new T.OrbitControls(camera, canvas); controls.enableDamping = false; controls.minDistance = 150; controls.maxDistance = 2200;
    controls.target.set(0, 16, 0); controls.addEventListener('change', request);
    scene.add(new T.HemisphereLight(0xffffff, 0xb9ab98, 2.0));
    [[-300, 600, 500, 1.9], [400, 200, -300, 0.8], [-200, -600, 300, 1.2]].forEach(function (v) { var l = new T.DirectionalLight(0xffffff, v[3]); l.position.set(v[0], v[1], v[2]); scene.add(l); });

    // Surfaces: separate vertex sets keep hard creases between faces, edges and ends.
    // Display meshes refine the model grid by bilinear interpolation (drawing only; geometry is unchanged).
    var parts = {
      B: grid(NX, NY, function (i, j) { return [i, j, 1]; }, false, 3, 4),
      A: grid(NX, NY, function (i, j) { return [i, j, 0]; }, true, 3, 4),
      N: grid(NX, 2, function (i, k) { return [i, 0, k]; }, true, 3, 3),
      F: grid(NX, 2, function (i, k) { return [i, NY - 1, k]; }, false, 3, 3),
      S: grid(NY, 2, function (j, k) { return [0, j, k]; }, false, 4, 3),
      E: grid(NY, 2, function (j, k) { return [NX - 1, j, k]; }, true, 4, 3)
    };
    function grid(nu, nv, map, flip, ru, rv) {
      var NU = (nu - 1) * ru + 1, NV = (nv - 1) * rv + 1;
      var g = new T.BufferGeometry(), pos = new Float32Array(NU * NV * 3), col = new Float32Array(NU * NV * 3), index = [];
      for (var v = 0; v < NV - 1; v++) for (var u = 0; u < NU - 1; u++) {
        var a = v * NU + u, b = a + 1, c = a + NU + 1, d = a + NU;
        if (flip) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d);
      }
      g.setIndex(index); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
      var mesh = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: T.DoubleSide }));
      scene.add(mesh);
      return { g: g, mesh: mesh, nu: nu, nv: nv, ru: ru, rv: rv, NU: NU, NV: NV, map: map };
    }
    var outline = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x2b2116 }));
    scene.add(outline);
    var table = new T.Mesh(new T.BoxGeometry(700, 6, 250), new T.MeshStandardMaterial({ color: 0xa9b3bb, roughness: 0.55, metalness: 0.15 }));
    scene.add(table);
    var cutter = new T.Mesh(new T.CylinderGeometry(16, 16, 1, 24), new T.MeshStandardMaterial({ color: 0x46627a, metalness: 0.5, roughness: 0.4 }));
    cutter.visible = false; scene.add(cutter);

    function request() { if (!disposed && !frame) frame = requestAnimationFrame(render); }
    function render() {
      frame = 0; if (disposed || !host.clientWidth || !host.clientHeight) return;
      var w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      var bg = getComputedStyle(host).getPropertyValue('--surface-2').trim() || '#edece6';
      table.visible = camera.position.y > table.position.y + 3;
      renderer.setClearColor(new T.Color(bg)); renderer.render(scene, camera);
    }
    function wood(x, y, machined, hot) {
      // Long grain streaks on every surface; rough-sawn surfaces are darker with arced saw marks.
      var g = 0.045 * Math.sin(y * 0.55 + 2.2 * Math.sin(x * 0.007 + y * 0.03)) + 0.02 * Math.sin(y * 1.3 + x * 0.01);
      if (!machined) g += 0.03 * Math.sin(2 * Math.PI * (x + 0.0012 * (y - 75) * (y - 75)) / 31) - 0.02;
      var base = machined ? [0.80, 0.64, 0.42] : [0.47, 0.35, 0.23];
      var c = base.map(function (v) { return Math.max(0, Math.min(1, v + g)); });
      if (hot > 0) { var o = [1, 0.32, 0.02]; c = c.map(function (v, n) { return v + (o[n] - v) * hot; }); }
      return c;
    }
    function heat(nodes) {
      // Height of face A and edge A above their resting contact: 1 = touches first.
      var out = { A: null, N: null }; if (!highSpots) return out;
      var F = M.faceFrame(nodes), za = [], i, j, k, n;
      for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) za.push(F.to(get(nodes, i, j, 0))[2]);
      var r = rel(za, 0.05); if (r) out.A = r;
      // Edge A is shaded only when it is clearly out of straight (crook), not for small saw waviness.
      var hn = []; for (k = 0; k < 2; k++) for (i = 0; i < NX; i++) hn.push(F.to(get(nodes, i, 0, k))[1]);
      var r2 = rel(hn, 2); if (r2) out.N = r2;
      function rel(v, min) {
        var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v); if (hi - lo < min) return null;
        return v.map(function (x) { var t = 1 - (x - lo) / (hi - lo); return Math.max(0, Math.min(1, (t - 0.62) / 0.3)) * 0.92; });
      }
      return out;
    }
    function get(nodes, i, j, k) { var n = ((k * NY + j) * NX + i) * 3; return [nodes[n], nodes[n + 1], nodes[n + 2]]; }
    function draw(nodes, flags) {
      var hot = heat(nodes);
      Object.keys(parts).forEach(function (key) {
        var p = parts[key], pos = p.g.attributes.position.array, col = p.g.attributes.color.array;
        for (var V = 0; V < p.NV; V++) for (var U = 0; U < p.NU; U++) {
          var u0 = Math.min(p.nu - 2, Math.floor(U / p.ru)), v0 = Math.min(p.nv - 2, Math.floor(V / p.rv)), fu = U / p.ru - u0, fv = V / p.rv - v0;
          var ids = [p.map(u0, v0), p.map(u0 + 1, v0), p.map(u0, v0 + 1), p.map(u0 + 1, v0 + 1)], w = [(1 - fu) * (1 - fv), fu * (1 - fv), (1 - fu) * fv, fu * fv];
          var q = [0, 0, 0], h = 0, mach = true;
          for (var c4 = 0; c4 < 4; c4++) {
            var qq = get(nodes, ids[c4][0], ids[c4][1], ids[c4][2]); q[0] += w[c4] * qq[0]; q[1] += w[c4] * qq[1]; q[2] += w[c4] * qq[2];
            if (w[c4] > 1e-9 && !flagOf(flags, key, ids[c4])) mach = false;
            if (key === 'A' && hot.A) h += w[c4] * hot.A[ids[c4][1] * NX + ids[c4][0]];
            if (key === 'N' && hot.N) h += w[c4] * hot.N[ids[c4][2] * NX + ids[c4][0]];
          }
          var n = (V * p.NU + U) * 3;
          pos[n] = sx(q); pos[n + 1] = sy(q); pos[n + 2] = sz(q);
          var c = wood(q[0], key === 'S' || key === 'E' ? q[1] + q[2] * 3 : key === 'N' || key === 'F' ? q[2] * 3 : q[1], mach, h); col[n] = c[0]; col[n + 1] = c[1]; col[n + 2] = c[2];
        }
        p.g.attributes.position.needsUpdate = true; p.g.attributes.color.needsUpdate = true; p.g.computeVertexNormals(); p.g.computeBoundingSphere();
      });
      var seg = [];
      function line(list) { for (var t = 0; t < list.length - 1; t++) { var a = list[t], b = list[t + 1]; seg.push(sx(a), sy(a), sz(a), sx(b), sy(b), sz(b)); } }
      [[0, 0], [0, 1], [NY - 1, 0], [NY - 1, 1]].forEach(function (jk) { var l = []; for (var i = 0; i < NX; i++) l.push(get(nodes, i, jk[0], jk[1])); line(l); });
      [[0, 0], [0, 1], [NX - 1, 0], [NX - 1, 1]].forEach(function (ik) { var l = []; for (var j = 0; j < NY; j++) l.push(get(nodes, ik[0], j, ik[1])); line(l); });
      [[0, 0], [0, NY - 1], [NX - 1, 0], [NX - 1, NY - 1]].forEach(function (ij) { line([get(nodes, ij[0], ij[1], 0), get(nodes, ij[0], ij[1], 1)]); });
      outline.geometry.dispose(); outline.geometry = new T.BufferGeometry(); outline.geometry.setAttribute('position', new T.Float32BufferAttribute(seg, 3));
      var minY = Infinity; for (var n2 = 2; n2 < nodes.length; n2 += 3) minY = Math.min(minY, nodes[n2]);
      table.position.set(0, minY - 3.05, 0);
      request();
    }
    function flagOf(flags, key, id) {
      if (!flags) return false;
      if (key === 'A' || key === 'B') return !!flags[key][id[1] * NX + id[0]];
      if (key === 'N' || key === 'F') return !!flags[key][id[2] * NX + id[0]];
      return !!flags[key][id[2] * NY + id[1]];
    }
    function setBoard(b) { board = b; draw(b.nodes, b.machined); }
    function setHighSpots(on) { highSpots = !!on; if (board) draw(board.nodes, board.machined); }

    // Sweep animation: nodes behind the moving cutter take the new stage geometry.
    function mixNodes(from, to, axis, s, band) {
      var out = new Float64Array(from.length);
      for (var n = 0; n < from.length; n += 3) {
        var c = axis === 'x' ? from[n] : axis === 'y' ? from[n + 1] : 0, w;
        if (axis === 'none') w = s; else w = Math.max(0, Math.min(1, (s - c) / band + 0.5));
        out[n] = from[n] + (to[n] - from[n]) * w; out[n + 1] = from[n + 1] + (to[n + 1] - from[n + 1]) * w; out[n + 2] = from[n + 2] + (to[n + 2] - from[n + 2]) * w;
      }
      return out;
    }
    function placeCutter(step, nodes, s) {
      var c = step.cutter; cutter.visible = !!c && step.axis !== 'none'; if (!cutter.visible) return;
      var zmin = Infinity, zmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      for (var n = 0; n < nodes.length; n += 3) { zmin = Math.min(zmin, nodes[n + 2]); zmax = Math.max(zmax, nodes[n + 2]); ymin = Math.min(ymin, nodes[n + 1]); ymax = Math.max(ymax, nodes[n + 1]); }
      cutter.rotation.set(0, 0, 0); cutter.scale.set(1, 1, 1);
      if (c === 'under' || c === 'over') { cutter.rotation.x = Math.PI / 2; cutter.scale.y = 200; cutter.position.set(s - 320, c === 'under' ? zmin - 16 : zmax + 16, 75 - (ymin + ymax) / 2); }
      else if (c === 'near' || c === 'far') { cutter.scale.y = 60; cutter.position.set(s - 320, (zmin + zmax) / 2, c === 'near' ? 75 - ymin + 16 : 75 - ymax - 16); }
      else if (c === 'ends') { cutter.rotation.z = Math.PI / 2; cutter.scale.set(4, 2, 4); cutter.position.set(-320 + (step.endX || 0), (zmin + zmax) / 2, 75 - s); }
    }
    function play(steps, onStep, onDone) {
      if (anim) finishAll();
      if (reduce || !steps.length) { var last = steps[steps.length - 1]; if (last) { draw(last.to.nodes, last.to.machined); board = last.to; } if (onDone) onDone(); return; }
      anim = { steps: steps, n: 0, t: 0, last: performance.now(), onStep: onStep, onDone: onDone };
      if (onStep) onStep(steps[0].caption, 0);
      paused = false; tick();
    }
    function tick() {
      if (!anim || disposed) return;
      var now = performance.now(), dt = Math.min(100, now - anim.last); anim.last = now;
      if (!paused) {
        var st = anim.steps[anim.n]; anim.t += dt / (st.duration || 900);
        var s, range = st.axis === 'y' ? [-30, 180] : [-40, 680];
        if (anim.t >= 1) {
          draw(st.to.nodes, st.to.machined); board = st.to; anim.n++; anim.t = 0;
          if (anim.n >= anim.steps.length) { var done = anim.onDone; anim = null; cutter.visible = false; request(); if (done) done(); return; }
          if (anim.onStep) anim.onStep(anim.steps[anim.n].caption, anim.n);
        } else {
          s = st.axis === 'none' ? anim.t : range[0] + (range[1] - range[0]) * anim.t;
          var mixed = mixNodes(st.from.nodes, st.to.nodes, st.axis, s, 40);
          draw(mixed, anim.t > 0.5 ? st.to.machined : st.from.machined); placeCutter(st, mixed, s);
        }
      }
      requestAnimationFrame(tick);
    }
    function finishAll() { if (!anim) return; var last = anim.steps[anim.steps.length - 1], done = anim.onDone; anim = null; cutter.visible = false; draw(last.to.nodes, last.to.machined); board = last.to; if (done) done(); }
    function view(name) {
      var v = VIEWS[name] || VIEWS.angle; camera.position.set(v.pos[0], v.pos[1], v.pos[2]); controls.target.set(0, 16, 0); controls.update();
      host.dataset.cameraView = VIEWS[name] ? name : 'angle'; request(); return v.label;
    }
    function key(e) {
      var used = true, off = camera.position.clone().sub(controls.target), s = new T.Spherical().setFromVector3(off);
      if (e.key === 'ArrowLeft') s.theta -= 0.12; else if (e.key === 'ArrowRight') s.theta += 0.12;
      else if (e.key === 'ArrowUp') s.phi = Math.max(0.05, s.phi - 0.12); else if (e.key === 'ArrowDown') s.phi = Math.min(Math.PI - 0.05, s.phi + 0.12);
      else if (e.key === '+' || e.key === '=') s.radius = Math.max(150, s.radius * 0.9); else if (e.key === '-') s.radius = Math.min(2200, s.radius * 1.1);
      else if (e.key === 'Home') { view('angle'); e.preventDefault(); e.stopPropagation(); return; } else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); camera.position.copy(new T.Vector3().setFromSpherical(s)).add(controls.target); controls.update(); request(); }
    }
    canvas.addEventListener('keydown', key);
    resize = new ResizeObserver(request); resize.observe(host);
    theme = new MutationObserver(request); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    view('angle');
    function dispose() {
      if (disposed) return; disposed = true; anim = null; if (frame) cancelAnimationFrame(frame);
      resize.disconnect(); theme.disconnect(); controls.dispose(); canvas.removeEventListener('keydown', key);
      scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      renderer.dispose(); canvas.remove();
    }
    return {
      setBoard: setBoard, setHighSpots: setHighSpots, play: play, view: view, dispose: dispose,
      pause: function () { paused = true; }, resume: function () { if (anim) { paused = false; anim.last = performance.now(); } },
      skip: finishAll, playing: function () { return !!anim; }, paused: function () { return paused; }, reducedMotion: function () { return reduce; }
    };
  }
  root.CourseWikiLumberSquaring3D = { create: create, VIEWS: VIEWS };
})(typeof globalThis !== 'undefined' ? globalThis : this);

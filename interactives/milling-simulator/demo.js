/* ============================================================================
   milling-simulator / demo.js - the machine on the page.

   Builds the live simulator inside every [data-interactive="milling-
   simulator"] root: the job, its drawing, four views of the work, the tool
   rack, the readout and handwheels, and the inspection of the part.

   The page source carries only teaching text and the printed figures; the
   controls are made here, so a reader without JavaScript (or a printout)
   never meets a row of dead buttons.

   Views, in third-angle layout and at one scale:
     top    canvas  the work from above; drag the tool to move X and Y
     part   canvas  the part in isometric, turnable in quarter turns
     front  SVG     a section along X through the tool; drag the tool for Z
     right  SVG     a section along Y through the tool
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(
    node ? require('./model.js') : root.CourseWikiMillingSim,
    node ? require('./inspect.js') : root.CourseWikiMillingInspect,
    node ? require('./jobs.js') : root.CourseWikiMillingJobs,
    node ? require('./draw.js') : root.CourseWikiMillingDraw);
  if (node) module.exports = api;
  else api.boot();
})(typeof self !== 'undefined' ? self : this, function (M, I, J, D) {
  'use strict';

  var ST = M.SETUP.stock, SETUP = M.SETUP;
  var WIN = { x0: -45, x1: 145, y0: -30, y1: 90 };      // top view and sections, mm: one scale
  var STEPS = [10, 1, 0.1];
  var SPEEDS = { slow: 15, normal: 40, fast: 120 };     // mm per second of animation
  var fmt = M.fmt, fmtSigned = M.fmtSigned;

  /* ---- colour: the theme's tokens, mixed in script for the canvases ------*/
  function parseColor(s) {
    s = String(s || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; });
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    return [128, 128, 128];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(c, alpha) {
    var r = Math.round(c[0]), g = Math.round(c[1]), b = Math.round(c[2]);
    return alpha == null ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  function readPalette(elm) {
    var cs = getComputedStyle(elm), get = function (k) { return parseColor(cs.getPropertyValue(k)); };
    var P = {
      paper: get('--paper'), surface: get('--surface'), surface2: get('--surface-2'), ink: get('--ink'),
      inkSoft: get('--ink-soft'), rule: get('--rule'), accent: get('--accent'),
      gold: get('--msu-gold'), blue: get('--msu-liteblue'), red: get('--msu-redorange')
    };
    P.metalTop = mix(P.surface, P.ink, 0.2);
    P.metalDeep = mix(P.metalTop, P.blue, 0.6);
    P.under = mix(P.paper, P.ink, 0.12);
    P.jaw = mix(P.paper, P.inkSoft, 0.3);
    P.parallel = mix(P.paper, P.inkSoft, 0.45);
    return P;
  }

  /* Colour of the metal at one raster cell: deeper is bluer, and a light
     from the back left shades every slope, so walls read as walls. */
  function cellColor(P, h, gx, gy, bottom, top) {
    var t = (top - h) / (top - bottom);
    var base = mix(P.metalTop, P.metalDeep, Math.max(0, Math.min(1, t)));
    var nx = -gx, ny = -gy, nz = 1, nl = Math.sqrt(nx * nx + ny * ny + 1);
    var lx = -0.45, ly = 0.55, lz = 0.7, ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
    var shade = (nx * lx + ny * ly + nz * lz) / (nl * ll);
    var k = 0.55 + 0.45 * Math.max(0, shade) / (lz / ll);
    return [base[0] * k, base[1] * k, base[2] * k];
  }

  /* Isometric projection of part coordinates, turned in quarter turns
     about the middle of the block; screen y runs down. */
  var COS30 = Math.cos(Math.PI / 6);
  function isoTurn(x, y, rot) {
    var u = x - 50, v = y - 30, k;
    for (k = 0; k < rot; k++) { var t = u; u = v; v = -t; }
    return [u, v];
  }
  function isoProject(x, y, z, rot) {
    var q = isoTurn(x, y, rot);
    return [(q[0] + q[1]) * COS30, (q[0] - q[1]) * 0.5 - z];
  }

  /* Plain-language account of a finished move, for the status line. */
  function describeMove(sum, sim) {
    if (sum.blocked) return { text: sum.blocked.message, warn: true };
    var parts = [];
    if (sum.volume > 0.05) {
      var v = sum.volume >= 1000 ? fmt(sum.volume / 1000, 2) + ' cm³' : fmt(sum.volume, sum.volume < 10 ? 1 : 0) + ' mm³';
      parts.push('Removed ' + v + '.');
      if (sum.side === 'climb') parts.push('A side cut with the metal on the right of the cutter: climb milling.');
      else if (sum.side === 'conventional') parts.push('A side cut with the metal on the left of the cutter: conventional milling.');
      else if (sum.side === 'both') parts.push('The cutter had metal on both sides, like a slot.');
    }
    sum.notes.forEach(function (n) { parts.push(n); });
    if (!parts.length) parts.push('Moved to X ' + fmtSigned(sim.pos.x, 2) + ', Y ' + fmtSigned(sim.pos.y, 2) + ', Z ' + fmtSigned(sim.pos.z, 2) + '.');
    return { text: parts.join(' '), warn: false };
  }

  /* ======================================================================
     The live simulator
     ====================================================================*/
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === false || attrs[k] == null) return;
      e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    if (text != null) e.textContent = text;
    return e;
  }
  function button(label, attrs) { var b = el('button', Object.assign({ type: 'button' }, attrs || {}), label); return b; }

  function isolateKeys(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Escape') return;
    if ([' ', 'Spacebar', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].indexOf(e.key) >= 0) e.stopPropagation();
  }

  function wire(rootEl) {
    if (rootEl.hasAttribute('data-ms-wired')) return;
    rootEl.setAttribute('data-ms-wired', '');
    var host = rootEl.querySelector('[data-ms-live]') || rootEl;
    var uid = 'ms' + Math.random().toString(36).slice(2, 8);
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    var sims = {}, jobs = J.JOBS;
    var state = {
      job: jobs[0], step: 1, speed: 'normal', overlay: false, target: true, rot: 0, hint: 0,
      report: null, queue: [], running: null, drag: null, raf: 0, last: 0, armReset: 0
    };
    function sim() { return sims[state.job.id] || (sims[state.job.id] = M.create()); }
    var P = readPalette(rootEl);

    // ---- job bar and brief
    var app = el('div', { class: 'ms-app' });
    var jobBar = el('div', { class: 'ms-jobs', role: 'group', 'aria-label': 'Job' });
    var jobButtons = {};
    jobs.forEach(function (j) {
      var b = button(j.free ? j.short : j.n + '. ' + j.short, { 'aria-pressed': 'false', 'data-job': j.id });
      b.addEventListener('click', function () { setJob(j); });
      jobButtons[j.id] = b; jobBar.appendChild(b);
    });
    var brief = el('div', { class: 'ms-brief' });
    var briefTitle = el('p', { class: 'ms-brief-title' });
    var briefText = el('p', { class: 'ms-brief-text' });
    var briefTools = el('div', { class: 'ms-brief-tools' });
    var hintBtn = button('Show a hint', { class: 'ms-hint-btn' });
    var targetBtn = button('Show the drawing on the work', { 'aria-pressed': 'true' });
    briefTools.appendChild(hintBtn); briefTools.appendChild(targetBtn);
    var hintList = el('ol', { class: 'ms-hints', 'aria-live': 'polite' });
    brief.appendChild(briefTitle); brief.appendChild(briefText); brief.appendChild(briefTools); brief.appendChild(hintList);
    var drawing = el('details', { class: 'ms-drawing', open: true });
    var drawingSum = el('summary', {}, 'Drawing');
    var drawingBody = el('div', { class: 'msd-scroll', tabindex: '0', role: 'region', 'aria-label': 'Drawing; scrolls sideways on a narrow screen' });
    drawing.appendChild(drawingSum); drawing.appendChild(drawingBody);

    // ---- views
    var views = el('div', { class: 'ms-views' });
    function viewBox(cls, title) {
      var f = el('figure', { class: 'ms-view ' + cls });
      var cap = el('figcaption', { class: 'ms-view-cap' });
      cap.appendChild(el('span', { class: 'ms-view-title' }, title));
      f.appendChild(cap);
      return { fig: f, cap: cap };
    }
    var vTop = viewBox('ms-view-top', 'Top'), vIso = viewBox('ms-view-iso', 'The part'),
      vFront = viewBox('ms-view-front', 'Section A–A, along X through the tool'),
      vSide = viewBox('ms-view-side', 'Section B–B, along Y through the tool');
    var topCanvas = el('canvas', { class: 'ms-canvas ms-top-canvas', tabindex: '0', role: 'img',
      'aria-describedby': uid + '-keys' });
    vTop.fig.appendChild(topCanvas);
    var isoCanvas = el('canvas', { class: 'ms-canvas ms-iso-canvas', role: 'img' });
    var turnL = button('↶', { class: 'ms-mini', 'aria-label': 'Turn the part view left' });
    var turnR = button('↷', { class: 'ms-mini', 'aria-label': 'Turn the part view right' });
    var turnBox = el('span', { class: 'ms-turn' }); turnBox.appendChild(turnL); turnBox.appendChild(turnR);
    vIso.cap.appendChild(turnBox);
    vIso.fig.appendChild(isoCanvas);
    var frontHost = el('div', { class: 'ms-section-host', 'aria-hidden': 'true' });
    var sideHost = el('div', { class: 'ms-section-host', 'aria-hidden': 'true' });
    vFront.fig.appendChild(frontHost); vSide.fig.appendChild(sideHost);
    views.appendChild(vTop.fig); views.appendChild(vIso.fig); views.appendChild(vFront.fig); views.appendChild(vSide.fig);
    var probe = el('p', { class: 'ms-probe', 'aria-live': 'off' });
    var keysNote = el('p', { class: 'ms-keys', id: uid + '-keys' },
      'Drag the tool in the top view to move X and Y, or in a section to move Z. With the top view selected, the arrow keys move X and Y and Page Up and Page Down move Z, one step at a time.');

    // ---- the panel: tool, readout, handwheels
    var panel = el('div', { class: 'ms-panel' });
    var toolBox = el('section', { class: 'ms-box ms-toolbox', 'aria-label': 'Tool' });
    var toolHead = el('div', { class: 'ms-toolhead' });
    var toolIcon = el('div', { class: 'ms-toolicon', 'aria-hidden': 'true' });
    var toolText = el('div', { class: 'ms-tooltext' });
    var toolName = el('p', { class: 'ms-toolname' });
    var toolNote = el('p', { class: 'ms-toolnote' });
    toolText.appendChild(toolName); toolText.appendChild(toolNote);
    toolHead.appendChild(toolIcon); toolHead.appendChild(toolText);
    toolBox.appendChild(el('p', { class: 'ms-box-title' }, 'Tool in the spindle'));
    toolBox.appendChild(toolHead);
    var boreRow = el('div', { class: 'ms-bore', hidden: true });
    var boreLabel = el('label', { for: uid + '-bore' }, 'Boring diameter Ø');
    var boreInput = el('input', { id: uid + '-bore', type: 'text', inputmode: 'decimal', size: '6', autocomplete: 'off' });
    var boreSet = button('Set');
    boreRow.appendChild(boreLabel); boreRow.appendChild(boreInput); boreRow.appendChild(boreSet);
    toolBox.appendChild(boreRow);
    var rack = el('div', { class: 'ms-rack', role: 'group', 'aria-label': 'Tool rack' });
    var rackButtons = {};
    var groups = {};
    M.TOOLS.forEach(function (t) {
      if (!groups[t.group]) {
        var g = el('div', { class: 'ms-rack-group' });
        g.appendChild(el('p', { class: 'ms-rack-name' }, t.group));
        g.appendChild(el('div', { class: 'ms-rack-row' }));
        groups[t.group] = g; rack.appendChild(g);
      }
      var label = t.kind === 'tap' ? M.THREADS[t.thread].label : t.kind === 'bore' ? 'Ø12–40' :
        t.kind === 'spot' ? 'Ø12, 90°' : 'Ø' + fmt(t.dia, t.dia % 1 ? 1 : 0);
      var b = button('', { class: 'ms-rack-tool', 'aria-pressed': 'false', 'aria-label': 'Load ' + M.toolNoun(Object.assign({}, t)), 'data-tool': t.id });
      b.innerHTML = D.renderToolIcon(t, { height: 38 }) + '<span>' + label + '</span>';
      b.addEventListener('click', function () { changeTool(t.id); });
      rackButtons[t.id] = b;
      groups[t.group].querySelector('.ms-rack-row').appendChild(b);
    });
    toolBox.appendChild(rack);

    var droBox = el('section', { class: 'ms-box ms-drobox', 'aria-label': 'Position' });
    droBox.appendChild(el('p', { class: 'ms-box-title' }, 'Readout: where the tool tip is'));
    var dro = el('div', { class: 'ms-dro' }), droOut = {}, goIn = {};
    ['x', 'y', 'z'].forEach(function (ax) {
      var row = el('div', { class: 'ms-dro-row' });
      row.appendChild(el('span', { class: 'ms-dro-axis', 'aria-hidden': 'true' }, ax.toUpperCase()));
      droOut[ax] = el('output', { class: 'ms-dro-val', 'aria-label': ax.toUpperCase() + ' position' });
      row.appendChild(droOut[ax]);
      var lab = el('label', { class: 'ms-go-label', for: uid + '-go-' + ax }, 'Go to ' + ax.toUpperCase());
      goIn[ax] = el('input', { id: uid + '-go-' + ax, class: 'ms-go-in', type: 'text', inputmode: 'decimal', autocomplete: 'off',
        placeholder: 'stay', size: '7' });
      row.appendChild(lab); row.appendChild(goIn[ax]);
      dro.appendChild(row);
    });
    droBox.appendChild(dro);
    var surfaceNote = el('p', { class: 'ms-under' });
    droBox.appendChild(surfaceNote);
    var goRow = el('div', { class: 'ms-go-row' });
    var goBtn = button('Move', { class: 'ms-primary' });
    var upBtn = button('Raise to Z +' + fmt(SETUP.clearZ, 0));
    var stopBtn = button('Stop', { disabled: true });
    goRow.appendChild(goBtn); goRow.appendChild(upBtn); goRow.appendChild(stopBtn);
    droBox.appendChild(goRow);
    droBox.appendChild(el('p', { class: 'ms-go-help' }, 'Leave a box empty to keep that axis where it is. A move goes up before across, and across before down.'));

    var jogBox = el('section', { class: 'ms-box ms-jogbox', 'aria-label': 'Handwheels' });
    jogBox.appendChild(el('p', { class: 'ms-box-title' }, 'Handwheels: one step at a time'));
    var jog = el('div', { class: 'ms-jog' });
    var jogDefs = [
      ['y', 1, 'Y+', 'ms-j-yp'], ['x', -1, 'X−', 'ms-j-xm'], ['x', 1, 'X+', 'ms-j-xp'], ['y', -1, 'Y−', 'ms-j-ym'],
      ['z', 1, 'Z+ up', 'ms-j-zp'], ['z', -1, 'Z− down', 'ms-j-zm']
    ];
    jogDefs.forEach(function (d) {
      var b = button(d[2], { class: 'ms-jog-btn ' + d[3], 'aria-label': 'Move ' + d[0].toUpperCase() + (d[1] > 0 ? ' plus' : ' minus') + ' one step' });
      b.addEventListener('click', function () { jogBy(d[0], d[1]); });
      jog.appendChild(b);
    });
    jogBox.appendChild(jog);
    var stepRow = el('div', { class: 'ms-seg', role: 'group', 'aria-label': 'Step size' });
    var stepButtons = {};
    STEPS.forEach(function (st) {
      var b = button(fmt(st, st < 1 ? 1 : 0) + ' mm', { 'aria-pressed': 'false' });
      b.addEventListener('click', function () { setStep(st); });
      stepButtons[st] = b; stepRow.appendChild(b);
    });
    jogBox.appendChild(el('p', { class: 'ms-small-label' }, 'Step'));
    jogBox.appendChild(stepRow);
    var speedRow = el('div', { class: 'ms-seg', role: 'group', 'aria-label': 'Speed of moves on screen' });
    var speedButtons = {};
    [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']].forEach(function (sp) {
      var b = button(sp[1], { 'aria-pressed': 'false' });
      b.addEventListener('click', function () { state.speed = sp[0]; syncSegs(); });
      speedButtons[sp[0]] = b; speedRow.appendChild(b);
    });
    jogBox.appendChild(el('p', { class: 'ms-small-label' }, 'Speed on screen'));
    jogBox.appendChild(speedRow);
    var actRow = el('div', { class: 'ms-actions' });
    var undoBtn = button('Undo');
    var resetBtn = button('Start this job over');
    actRow.appendChild(undoBtn); actRow.appendChild(resetBtn);
    jogBox.appendChild(actRow);

    panel.appendChild(toolBox); panel.appendChild(droBox); panel.appendChild(jogBox);
    var status = el('p', { class: 'ms-status', role: 'status', 'aria-live': 'polite' });

    // ---- inspection
    var inspect = el('section', { class: 'ms-inspect', 'aria-label': 'Inspection' });
    var inspHead = el('div', { class: 'ms-inspect-head' });
    var inspTitle = el('p', { class: 'ms-box-title' }, 'Inspection of the part as it is now');
    var overlayBtn = button('Show where it differs', { 'aria-pressed': 'false' });
    inspHead.appendChild(inspTitle); inspHead.appendChild(overlayBtn);
    var inspSummary = el('p', { class: 'ms-inspect-summary' });
    var inspRows = el('ul', { class: 'ms-rows' });
    var legend = el('p', { class: 'ms-legend', hidden: true });
    legend.innerHTML = '<span class="ms-key ms-key-excess"></span> metal still to remove <span class="ms-key ms-key-over"></span> cut past the drawing';
    inspect.appendChild(inspHead); inspect.appendChild(inspSummary); inspect.appendChild(legend); inspect.appendChild(inspRows);

    // the record a printout carries
    var record = el('div', { class: 'ms-record', 'aria-hidden': 'true' });

    app.appendChild(jobBar); app.appendChild(brief); app.appendChild(drawing);
    app.appendChild(views); app.appendChild(probe); app.appendChild(status); app.appendChild(panel); app.appendChild(keysNote);
    app.appendChild(inspect);
    host.appendChild(app);
    rootEl.appendChild(record);
    rootEl.classList.add('is-live');

    /* ------------------------------------------------------------------
       Drawing the views
       ------------------------------------------------------------------ */
    var img = document.createElement('canvas'), imgCtx, imgData;
    var over = document.createElement('canvas'), overCtx;
    function resetImages() {
      var s = sim();
      img.width = s.nx; img.height = s.ny; imgCtx = img.getContext('2d');
      imgData = imgCtx.createImageData(s.nx, s.ny);
      over.width = s.nx; over.height = s.ny; overCtx = over.getContext('2d');
      paintCells(0, s.nx - 1, 0, s.ny - 1);
    }
    function underColor(x, y) {
      var parallel = SETUP.parallels.some(function (q) { return x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1; });
      return parallel ? P.parallel : P.under;
    }
    function paintCells(i0, i1, j0, j1) {
      var s = sim(), nx = s.nx, ny = s.ny, d = imgData.data, cell = M.CELL, bottom = ST.bottom;
      i0 = Math.max(0, i0 - 1); i1 = Math.min(nx - 1, i1 + 1); j0 = Math.max(0, j0 - 1); j1 = Math.min(ny - 1, j1 + 1);
      for (var j = j0; j <= j1; j++) {
        for (var i = i0; i <= i1; i++) {
          var h = s.rasterAt(i, j), c;
          if (h <= bottom + 1e-6) c = underColor(s.cellX(i), s.cellY(j));
          else {
            var hl = s.rasterAt(Math.max(0, i - 1), j), hr = s.rasterAt(Math.min(nx - 1, i + 1), j);
            var hd = s.rasterAt(i, Math.max(0, j - 1)), hu = s.rasterAt(i, Math.min(ny - 1, j + 1));
            c = cellColor(P, h, (hr - hl) / (2 * cell), (hu - hd) / (2 * cell), bottom, ST.rawTop);
          }
          var k = 4 * (i + (ny - 1 - j) * nx);       // image rows run top-down: flip Y
          d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
        }
      }
      imgCtx.putImageData(imgData, 0, 0, i0, ny - 1 - j1, i1 - i0 + 1, j1 - j0 + 1);
    }
    function paintOverlay() {
      var s = sim(), rep = state.report;
      overCtx.clearRect(0, 0, s.nx, s.ny);
      if (!rep || !rep.status || state.job.free) return;
      var o = overCtx.createImageData(s.nx, s.ny), d = o.data, nx = s.nx, ny = s.ny;
      for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
        var v = rep.status[i + j * nx];
        if (!v) continue;
        var c = v === 1 ? P.gold : P.red, k = 4 * (i + (ny - 1 - j) * nx);
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = v === 1 ? 120 : 200;
      }
      overCtx.putImageData(o, 0, 0);
    }

    var topScale = 1, topDpr = 1;
    function sizeCanvas(cv, aspect) {
      var w = Math.max(10, cv.clientWidth), dpr = Math.min(2, window.devicePixelRatio || 1);
      var h = Math.round(w / aspect);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      return { w: w, h: h, dpr: dpr };
    }
    function drawTop() {
      var s = sim(), sz = sizeCanvas(topCanvas, (WIN.x1 - WIN.x0) / (WIN.y1 - WIN.y0));
      var ctx = topCanvas.getContext('2d'), k = sz.w / (WIN.x1 - WIN.x0);
      topScale = k; topDpr = sz.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = css(P.paper); ctx.fillRect(0, 0, topCanvas.width, topCanvas.height);
      // part coordinates, Y up
      ctx.setTransform(k * sz.dpr, 0, 0, -k * sz.dpr, -WIN.x0 * k * sz.dpr, WIN.y1 * k * sz.dpr);
      ctx.fillStyle = css(P.jaw); ctx.strokeStyle = css(P.inkSoft); ctx.lineWidth = 0.3;
      SETUP.jaws.forEach(function (q) { ctx.fillRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0); ctx.strokeRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0); });
      // the work: the raster image, drawn the right way up
      ctx.save();
      ctx.translate(ST.x0, ST.y1); ctx.scale(1, -1);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, ST.x1 - ST.x0, ST.y1 - ST.y0);
      if (state.overlay) ctx.drawImage(over, 0, 0, ST.x1 - ST.x0, ST.y1 - ST.y0);
      ctx.restore();
      ctx.strokeStyle = css(P.ink); ctx.lineWidth = 0.35;
      ctx.strokeRect(ST.x0, ST.y0, ST.x1 - ST.x0, ST.y1 - ST.y0);
      // the drawing's outlines (top-view paths are written with y flipped)
      if (state.target && !state.job.free) {
        ctx.save(); ctx.scale(1, -1);
        ctx.strokeStyle = css(P.accent); ctx.lineWidth = 0.45; ctx.setLineDash([1.6, 1.1]);
        D.targetOutline(state.job).forEach(function (d) { ctx.stroke(new Path2D(d)); });
        ctx.restore(); ctx.setLineDash([]);
      }
      // section lines through the tool
      ctx.strokeStyle = css(P.inkSoft); ctx.lineWidth = 0.25; ctx.setLineDash([4, 1, 0.8, 1]);
      ctx.beginPath(); ctx.moveTo(WIN.x0, s.pos.y); ctx.lineTo(WIN.x1, s.pos.y);
      ctx.moveTo(s.pos.x, WIN.y0); ctx.lineTo(s.pos.x, WIN.y1); ctx.stroke(); ctx.setLineDash([]);
      // the tool, seen from above
      if (s.tool) {
        var r = s.tool.dia / 2, engaged = s.pos.z < s.heightAt(s.pos.x, s.pos.y) || s.pos.z < s.maxHeightIn(s.pos.x, s.pos.y, r);
        ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = css(P.accent, engaged ? 0.32 : 0.12); ctx.fill();
        ctx.strokeStyle = css(P.accent); ctx.lineWidth = engaged ? 0.7 : 0.45;
        if (!engaged) ctx.setLineDash([1.2, 0.8]);
        ctx.stroke(); ctx.setLineDash([]);
        if (s.tool.kind === 'bore') {
          ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, s.tool.barDia / 2, 0, 2 * Math.PI); ctx.stroke();
        }
        var c = Math.min(3, r * 0.6) + 1.2;
        ctx.beginPath(); ctx.moveTo(s.pos.x - c, s.pos.y); ctx.lineTo(s.pos.x + c, s.pos.y);
        ctx.moveTo(s.pos.x, s.pos.y - c); ctx.lineTo(s.pos.x, s.pos.y + c);
        ctx.strokeStyle = css(P.ink); ctx.lineWidth = 0.35; ctx.stroke();
      }
      // axes at X0 Y0
      ctx.strokeStyle = css(P.accent); ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.moveTo(0, 0); ctx.lineTo(0, 9); ctx.stroke();
      ctx.setTransform(sz.dpr, 0, 0, sz.dpr, 0, 0);
      ctx.fillStyle = css(P.ink); ctx.font = '600 11px ' + getComputedStyle(rootEl).getPropertyValue('--f-display');
      var ox = (0 - WIN.x0) * k, oy = (WIN.y1 - 0) * k;
      ctx.fillText('X', ox + 10 * k + 2, oy + 4); ctx.fillText('Y', ox - 3, oy - 10 * k - 3);
      topCanvas.setAttribute('aria-label', describeTop());
    }
    function describeTop() {
      var s = sim(), t = s.tool;
      if (!t) return 'Top view of the block in the vise. No tool loaded.';
      var under = s.heightAt(s.pos.x, s.pos.y);
      return 'Top view. ' + M.toolLabel(t) + ' at X ' + fmtSigned(s.pos.x, 2) + ', Y ' + fmtSigned(s.pos.y, 2) + ', Z ' + fmtSigned(s.pos.z, 2) +
        (under === -Infinity ? ', off the block.' : '; the metal under its centre is at Z ' + fmtSigned(under, 2) + '.');
    }

    var isoTimer = 0;
    function drawIso() {
      var s = sim(), sz = sizeCanvas(isoCanvas, 1), ctx = isoCanvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = css(P.paper); ctx.fillRect(0, 0, isoCanvas.width, isoCanvas.height);
      var rot = state.rot, step = 2, cell = M.CELL * step, bottom = ST.bottom;
      // fit the block's projected outline into the canvas
      var corners = [[0, 0], [100, 0], [100, 60], [0, 60]], minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      corners.forEach(function (c) {
        [ST.rawTop, bottom].forEach(function (z) {
          var q = isoProject(c[0], c[1], z, rot);
          minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]);
        });
      });
      var k = Math.min(sz.w / (maxX - minX), sz.h / (maxY - minY)) * 0.9;
      var ox = (sz.w - (maxX - minX) * k) / 2 - minX * k, oy = (sz.h - (maxY - minY) * k) / 2 - minY * k;
      ctx.setTransform(sz.dpr, 0, 0, sz.dpr, 0, 0);
      var nx = Math.floor(s.nx / step), ny = Math.floor(s.ny / step);
      var H = new Float64Array(nx * ny);
      for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) H[i + j * nx] = s.rasterAt(i * step + 1, j * step + 1);
      // far cells first: order by the turned (u - v)
      var order = [];
      for (var jj = 0; jj < ny; jj++) for (var ii = 0; ii < nx; ii++) {
        var q = isoTurn(ii * cell + cell / 2, jj * cell + cell / 2, rot);
        order.push([q[0] - q[1], ii, jj]);
      }
      order.sort(function (a, b) { return a[0] - b[0]; });
      var w = 2 * cell * COS30 * k + 0.6, hTop = cell * k + 0.6;
      var sideCol = css(mix(P.metalTop, P.ink, 0.25)), sideDeep = css(mix(P.metalDeep, P.ink, 0.25));
      for (var m = 0; m < order.length; m++) {
        var ci = order[m][1], cj = order[m][2], h = H[ci + cj * nx];
        if (h <= bottom + 1e-6) continue;
        var x = ci * cell + cell / 2, y = cj * cell + cell / 2;
        var pTop = isoProject(x, y, h, rot), pBot = isoProject(x, y, bottom, rot);
        var sx = ox + pTop[0] * k - w / 2, syTop = oy + pTop[1] * k, syBot = oy + pBot[1] * k;
        var t = (ST.rawTop - h) / (ST.rawTop - bottom);
        ctx.fillStyle = t > 0.15 ? sideDeep : sideCol;
        ctx.fillRect(sx, syTop, w, syBot - syTop + hTop / 2);
        var hl = ci > 0 ? H[ci - 1 + cj * nx] : h, hr = ci < nx - 1 ? H[ci + 1 + cj * nx] : h;
        var hd = cj > 0 ? H[ci + (cj - 1) * nx] : h, hu = cj < ny - 1 ? H[ci + (cj + 1) * nx] : h;
        var g = isoTurn((hr - hl) / (2 * cell), (hu - hd) / (2 * cell), 0);
        ctx.fillStyle = css(cellColor(P, h, g[0], g[1], bottom, ST.rawTop));
        ctx.fillRect(sx, syTop - hTop / 2, w, hTop);
      }
      isoCanvas.setAttribute('aria-label', 'The part in isometric, seen from ' + ['the front right', 'the back right', 'the back left', 'the front left'][rot] +
        '. ' + (state.report ? state.report.summary : ''));
    }
    function scheduleIso(now) {
      if (now) { clearTimeout(isoTimer); isoTimer = 0; drawIso(); return; }
      if (isoTimer) return;
      isoTimer = setTimeout(function () { isoTimer = 0; drawIso(); }, 180);
    }

    var secTimer = 0;
    function drawSections() {
      var s = sim(), job = state.job, tgt = state.target && !job.free;
      frontHost.innerHTML = D.renderSection(s, job, 'front', s.pos.y, { idPrefix: uid + '-f', target: tgt });
      sideHost.innerHTML = D.renderSection(s, job, 'side', s.pos.x, { idPrefix: uid + '-s', target: tgt });
    }
    function scheduleSections(now) {
      if (now) { clearTimeout(secTimer); secTimer = 0; drawSections(); return; }
      if (secTimer) return;
      secTimer = setTimeout(function () { secTimer = 0; drawSections(); }, 60);
    }

    /* ------------------------------------------------------------------
       Readouts, panel state, inspection
       ------------------------------------------------------------------ */
    function syncSegs() {
      STEPS.forEach(function (st) { stepButtons[st].setAttribute('aria-pressed', String(state.step === st)); });
      Object.keys(speedButtons).forEach(function (k) { speedButtons[k].setAttribute('aria-pressed', String(state.speed === k)); });
      overlayBtn.setAttribute('aria-pressed', String(state.overlay));
      targetBtn.setAttribute('aria-pressed', String(state.target));
      legend.hidden = !state.overlay || state.job.free;
      jobs.forEach(function (j) { jobButtons[j.id].setAttribute('aria-pressed', String(j === state.job)); });
    }
    function syncPanel() {
      var s = sim(), t = s.tool;
      droOut.x.textContent = fmtSigned(s.pos.x, 2);
      droOut.y.textContent = fmtSigned(s.pos.y, 2);
      droOut.z.textContent = fmtSigned(s.pos.z, 2);
      var under = s.heightAt(s.pos.x, s.pos.y);
      surfaceNote.textContent = under === -Infinity ? 'The tool is off the block.' :
        'Metal under the tool’s centre: Z ' + fmtSigned(under, 2) + (s.pos.z < under - 1e-6 ? ' (the tip is in the cut)' : s.pos.z <= under + 1e-6 ? ' (touching)' : ', ' + fmt(s.pos.z - under, 2) + ' mm below the tip') + '.';
      toolName.textContent = t ? M.toolLabel(t) : 'None yet: pick one from the rack';
      toolNote.textContent = t ? toolCanDo(t) : 'Every tool cuts a shape of its own. The rack below has one of each kind.';
      toolIcon.innerHTML = t ? D.renderToolIcon(t, { height: 64 }) : '';
      Object.keys(rackButtons).forEach(function (id) { rackButtons[id].setAttribute('aria-pressed', String(!!t && t.id === id)); });
      boreRow.hidden = !(t && t.kind === 'bore');
      if (t && t.kind === 'bore' && document.activeElement !== boreInput) boreInput.value = fmt(t.dia, 2);
      undoBtn.disabled = !s.canUndo() || !!state.running;
      stopBtn.disabled = !state.running && !state.drag;
      resetBtn.textContent = state.armReset ? 'Sure? Start over' : 'Start this job over';
    }
    function toolCanDo(t) {
      switch (t.kind) {
        case 'face': return 'Cuts with its rim of inserts as it moves across, up to 4 mm deep. Lower it beside the work, not onto it.';
        case 'end': return 'Cuts on its end and its sides: plunges, then moves across up to ' + fmt(t.reach, 0) + ' mm deep. Inside corners take its ' + fmt(t.dia / 2, 0) + ' mm radius.';
        case 'spot': return 'A 90° point: starts holes, cuts countersinks, and chamfers an edge as it moves along it.';
        case 'drill': return 'Feeds straight down only. Leaves a hole of its own size, with a 118° point at the bottom.';
        case 'tap': return 'Cuts an ' + M.THREADS[t.thread].label + ' thread inside a Ø' + fmt(M.THREADS[t.thread].tapDrill, 1) + ' hole. Straight in, straight out.';
        case 'bore': return 'Adjustable: set its diameter, then feed it down a hole at least Ø10 to open the hole to that size.';
      }
      return '';
    }
    var inspectTimer = 0;
    function runInspect() {
      var s = sim(), job = state.job;
      if (job.free) {
        state.report = null;
        inspSummary.textContent = 'Free practice has no drawing to check against. Metal removed so far: ' + fmt(s.removed / 1000, 2) + ' cm³.';
        inspRows.innerHTML = '';
        inspect.classList.remove('is-complete', 'is-over');
        return;
      }
      var rep = I.inspect(s, job);
      state.report = rep;
      inspSummary.textContent = rep.summary;
      inspect.classList.toggle('is-complete', rep.complete);
      inspect.classList.toggle('is-over', rep.overcut);
      inspRows.innerHTML = '';
      rep.rows.forEach(function (r) {
        var li = el('li', { class: 'ms-row is-' + r.status });
        var head = el('p', { class: 'ms-row-head' });
        head.appendChild(el('span', { class: 'ms-chip' }, { ok: 'Matches', todo: 'To do', over: 'Cut too far', none: 'Not started' }[r.status]));
        head.appendChild(el('span', { class: 'ms-row-label' }, r.label));
        li.appendChild(head);
        if (r.measured) li.appendChild(el('p', { class: 'ms-row-measured' }, 'Measured: ' + r.measured));
        var ul = el('ul', { class: 'ms-checks' });
        r.checks.forEach(function (c) {
          var it = el('li', { class: c.ok ? 'is-ok' : 'is-bad' });
          it.appendChild(el('span', { class: 'ms-mark', 'aria-hidden': 'true' }, c.ok ? '✓' : '✗'));
          it.appendChild(el('span', { class: 'ms-vh' }, c.ok ? 'OK: ' : 'Not yet: '));
          it.appendChild(document.createTextNode(c.text));
          ul.appendChild(it);
        });
        li.appendChild(ul);
        inspRows.appendChild(li);
      });
      paintOverlay();
    }
    function scheduleInspect(now) {
      clearTimeout(inspectTimer);
      if (now) { runInspect(); drawTop(); scheduleIso(true); return; }
      inspectTimer = setTimeout(function () { runInspect(); drawTop(); scheduleIso(true); }, 120);
    }

    function say(text, warn) {
      status.textContent = text;
      status.classList.toggle('is-warn', !!warn);
    }

    function redrawMoving() {
      var s = sim(), dirty = s.takeDirty();
      if (dirty) paintCells(dirty.i0, dirty.i1, dirty.j0, dirty.j1);
      drawTop(); scheduleSections(); scheduleIso(); syncPanel();
    }
    function redrawAll() {
      var s = sim();
      s.takeDirty();
      paintCells(0, s.nx - 1, 0, s.ny - 1);
      drawTop(); scheduleSections(true); scheduleIso(true); syncPanel();
    }

    /* ------------------------------------------------------------------
       Motion
       ------------------------------------------------------------------ */
    function speed() { return SPEEDS[state.speed] || SPEEDS.normal; }
    function instant() { return reduce.matches; }

    /* Queue a move to a target; it runs leg by leg on the animation clock. */
    function moveTo(target, label) {
      var s = sim();
      if (!s.tool) { say('Load a tool from the rack first.', true); return; }
      if (state.running || state.queue.length) {
        if (state.queue.length < 2) state.queue.push({ target: target, label: label });
        return;
      }
      startMove(target, label);
    }
    function startMove(target, label) {
      var s = sim(), pl = s.plan(target);
      s.begin('move', label || 'Move');
      if (pl.note) s.entry.notes.push(pl.note);
      state.running = { legs: pl.legs, k: 0 };
      if (instant()) {
        while (state.running) stepMotion(Infinity);
        return;
      }
      state.last = 0;
      tick();
    }
    function stepMotion(dist) {
      var s = sim(), run = state.running;
      var budget = dist;
      while (run && run.k < run.legs.length && budget > 0) {
        var leg = run.legs[run.k], before = leg.done;
        var r = s.advance(leg, budget);
        budget -= Math.max(0, leg.done - before);
        if (r.blocked) { run.k = run.legs.length; break; }
        if (r.done) run.k++;
        if (!isFinite(dist)) budget = Infinity;
      }
      if (run && run.k >= run.legs.length) finishMove();
    }
    function finishMove() {
      var s = sim(), sum = s.commit();
      state.running = null;
      if (sum) { var m = describeMove(sum, s); say(m.text, m.warn); }
      redrawMoving();
      scheduleInspect();
      if (state.queue.length) { var nx = state.queue.shift(); startMove(nx.target, nx.label); }
    }
    function tick() {
      if (state.raf) return;
      state.raf = requestAnimationFrame(function frame(ts) {
        state.raf = 0;
        var dt = state.last ? Math.min(0.1, (ts - state.last) / 1000) : 1 / 60;
        state.last = ts;
        if (state.running) stepMotion(speed() * dt);
        if (state.drag) dragStep(dt);
        redrawMoving();
        if (state.running || (state.drag && !state.drag.settled)) tick();
        else state.last = 0;
      });
    }
    function stop() {
      if (state.running) { state.running.k = state.running.legs.length; state.queue = []; finishMove(); }
      if (state.drag) endDrag(true);
    }

    function jogBy(ax, sign) {
      var s = sim(), t = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
      t[ax] = M.q4(t[ax] + sign * state.step);
      moveTo(t, 'Jog ' + ax.toUpperCase());
    }
    function setStep(st) { state.step = st; syncSegs(); }

    /* ---- dragging: the tool follows the pointer at the feed speed --------*/
    function snap(v) { var g = Math.min(state.step, 1); return M.q4(Math.round(v / g) * g); }
    function startDrag(kind, target) {
      var s = sim();
      if (!s.tool) { say('Load a tool from the rack first.', true); return false; }
      if (state.running) return false;
      s.begin('move', kind === 'xy' ? 'Drag' : 'Drag Z');
      state.drag = { kind: kind, target: target, leg: null, settled: false, released: false, lastCode: null };
      state.last = 0;
      tick();
      return true;
    }
    function dragStep(dt) {
      var s = sim(), dg = state.drag, t = dg.target, p = s.pos;
      var dist = instant() ? Infinity : speed() * dt;
      var same = dg.kind === 'xy' ? Math.abs(p.x - t.x) < 1e-6 && Math.abs(p.y - t.y) < 1e-6 : Math.abs(p.z - t.z) < 1e-6;
      if (same) { dg.settled = true; if (dg.released) endDrag(); return; }
      dg.settled = false;
      if (!dg.leg || dg.leg.blockedTarget || dg.leg.tx !== t.x || dg.leg.ty !== t.y || dg.leg.tz !== t.z) {
        var to = dg.kind === 'xy' ? { x: t.x, y: t.y, z: p.z } : { x: p.x, y: p.y, z: t.z };
        var leg = { axis: dg.kind === 'xy' ? 'xy' : 'z', from: { x: p.x, y: p.y, z: p.z }, to: to, done: 0 };
        leg.len = dg.kind === 'xy' ? Math.hypot(to.x - p.x, to.y - p.y) : Math.abs(to.z - p.z);
        leg.tx = t.x; leg.ty = t.y; leg.tz = t.z;
        dg.leg = leg;
      }
      var r = s.advance(dg.leg, dist);
      if (r.blocked) {
        dg.leg.blockedTarget = true;
        dg.settled = true;
        if (dg.lastCode !== r.code) { say(r.message, true); dg.lastCode = r.code; }
        if (dg.released) endDrag();
      }
    }
    function endDrag(force) {
      var dg = state.drag;
      if (!dg) return;
      if (!force && !dg.settled) { dg.released = true; return; }
      state.drag = null;
      var s = sim(), sum = s.commit();
      if (sum && !dg.lastCode) { var m = describeMove(sum, s); say(m.text, m.warn); }
      redrawMoving();
      scheduleInspect();
    }

    function topPoint(ev) {
      var r = topCanvas.getBoundingClientRect(), k = r.width / (WIN.x1 - WIN.x0);
      return { x: WIN.x0 + (ev.clientX - r.left) / k, y: WIN.y1 - (ev.clientY - r.top) / k };
    }
    topCanvas.addEventListener('pointerdown', function (ev) {
      var s = sim(), q = topPoint(ev);
      if (!s.tool) { say('Load a tool from the rack first.', true); return; }
      var grab = Math.max(s.tool.dia / 2, 4) + 3;
      if (Math.hypot(q.x - s.pos.x, q.y - s.pos.y) > grab) {
        say('To move the tool, drag it: press on the tool’s circle, then slide.', false);
        return;
      }
      if (!startDrag('xy', { x: snap(q.x), y: snap(q.y), z: s.pos.z })) return;
      topCanvas.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    topCanvas.addEventListener('pointermove', function (ev) {
      var q = topPoint(ev), s = sim();
      if (state.drag && state.drag.kind === 'xy') {
        var t = state.drag.target, nx = snap(q.x), ny = snap(q.y);
        if (ev.shiftKey) {                 // lock to one axis, like a table lock
          if (Math.abs(nx - s.pos.x) > Math.abs(ny - s.pos.y)) ny = s.pos.y; else nx = s.pos.x;
        }
        t.x = nx; t.y = ny;
        state.drag.released = false;
        tick();
      }
      var h = s.heightAt(q.x, q.y);
      probe.textContent = 'Pointer at X ' + fmtSigned(q.x, 1) + ', Y ' + fmtSigned(q.y, 1) +
        (h === -Infinity ? ' (off the block)' : ': metal top at Z ' + fmtSigned(h, 2) + (h <= ST.bottom + 1e-6 ? ', cut right through' : ''));
    });
    var release = function () { if (state.drag) { state.drag.released = true; if (state.drag.settled) endDrag(); else tick(); } };
    topCanvas.addEventListener('pointerup', release);
    topCanvas.addEventListener('pointercancel', release);
    topCanvas.addEventListener('pointerleave', function () { if (!state.drag) probe.textContent = ''; });

    function sectionZ(hostEl, ev) {
      var svg = hostEl.querySelector('svg');
      if (!svg) return null;
      var r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      return -(vb.y + (ev.clientY - r.top) / r.height * vb.height);
    }
    [frontHost, sideHost].forEach(function (hostEl, idx) {
      hostEl.addEventListener('pointerdown', function (ev) {
        var s = sim();
        if (!s.tool) return;
        var svg = hostEl.querySelector('svg'), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
        var u = vb.x + (ev.clientX - r.left) / r.width * vb.width, z = sectionZ(hostEl, ev);
        var tu = idx === 0 ? s.pos.x : s.pos.y;
        if (Math.abs(u - tu) > Math.max(s.tool.dia / 2, 5) + 3 || z < s.pos.z - 4 || z > s.pos.z + 70) return;
        if (!startDrag('z', { x: s.pos.x, y: s.pos.y, z: snap(z) })) return;
        state.drag.offset = z - s.pos.z;
        hostEl.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      });
      hostEl.addEventListener('pointermove', function (ev) {
        if (!state.drag || state.drag.kind !== 'z') return;
        var z = sectionZ(hostEl, ev);
        if (z == null) return;
        state.drag.target.z = snap(z - (state.drag.offset || 0));
        state.drag.released = false;
        tick();
      });
      hostEl.addEventListener('pointerup', release);
      hostEl.addEventListener('pointercancel', release);
    });

    /* ---- keyboard: handwheels on the arrow keys, taken only here --------*/
    topCanvas.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var used = true;
      switch (e.key) {
        case 'ArrowLeft': jogBy('x', -1); break;
        case 'ArrowRight': jogBy('x', 1); break;
        case 'ArrowUp': jogBy('y', 1); break;
        case 'ArrowDown': jogBy('y', -1); break;
        case 'PageUp': jogBy('z', 1); break;
        case 'PageDown': jogBy('z', -1); break;
        case '[': setStep(STEPS[Math.max(0, STEPS.indexOf(state.step) - 1)]); break;
        case ']': setStep(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(state.step) + 1)]); break;
        default: used = false;
      }
      if (used) { e.preventDefault(); e.stopPropagation(); }
    });
    // Any control inside the simulator keeps arrow keys and Space for itself,
    // so the page's own next/previous navigation never fires as well.
    app.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && t.matches && t.matches('button, input, select, textarea, summary, [tabindex]')) isolateKeys(e);
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !(t && t.matches && t.matches('input, textarea'))) {
        e.preventDefault(); doUndo();
      }
      if (e.key === 'Escape' && (state.running || state.drag)) { e.stopPropagation(); stop(); }
    });

    /* ---- buttons ---------------------------------------------------------*/
    function changeTool(id) {
      var s = sim();
      if (state.running || state.drag) return;
      var r = s.loadTool(id);
      say(r.message, !r.ok);
      redrawMoving(); scheduleSections(true);
    }
    boreSet.addEventListener('click', function () {
      var v = M.parseNum(boreInput.value);
      if (!isFinite(v)) { say('Type the boring diameter as a number of millimetres, such as 20.00.', true); return; }
      var r = sim().setBoreDia(v);
      say(r.message, !r.ok); syncPanel(); drawTop(); scheduleSections(true);
    });
    boreInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); boreSet.click(); } });
    function goTo() {
      var s = sim(), t = {}, bad = [];
      ['x', 'y', 'z'].forEach(function (ax) {
        var raw = goIn[ax].value.trim();
        if (!raw) { t[ax] = s.pos[ax]; return; }
        var v = M.parseNum(raw);
        if (!isFinite(v)) bad.push(ax.toUpperCase()); else t[ax] = v;
      });
      if (bad.length) { say('Not a number in ' + bad.join(', ') + '. Type millimetres, such as −6.5 or 81.', true); return; }
      moveTo(t, 'Go to');
    }
    goBtn.addEventListener('click', goTo);
    ['x', 'y', 'z'].forEach(function (ax) {
      goIn[ax].addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goTo(); } });
    });
    upBtn.addEventListener('click', function () { moveTo({ z: SETUP.clearZ }, 'Raise'); });
    stopBtn.addEventListener('click', stop);
    function doUndo() {
      var s = sim();
      if (state.running || state.drag) stop();
      var e = s.undo();
      if (!e) return;
      say('Undone: ' + (e.kind === 'tool' ? e.label.toLowerCase() : 'the last move') + '. In the shop, metal that is cut stays cut; here you can take it back.', false);
      redrawAll(); scheduleInspect(true);
    }
    undoBtn.addEventListener('click', doUndo);
    resetBtn.addEventListener('click', function () {
      if (!state.armReset) {
        state.armReset = setTimeout(function () { state.armReset = 0; syncPanel(); }, 4000);
        syncPanel(); return;
      }
      clearTimeout(state.armReset); state.armReset = 0;
      stop();
      sim().reset();
      say('A fresh block, 1 mm over on top, back in the vise.', false);
      redrawAll(); scheduleInspect(true);
    });
    overlayBtn.addEventListener('click', function () { state.overlay = !state.overlay; syncSegs(); paintOverlay(); drawTop(); });
    targetBtn.addEventListener('click', function () { state.target = !state.target; syncSegs(); drawTop(); scheduleSections(true); });
    turnL.addEventListener('click', function () { state.rot = (state.rot + 3) % 4; scheduleIso(true); });
    turnR.addEventListener('click', function () { state.rot = (state.rot + 1) % 4; scheduleIso(true); });
    hintBtn.addEventListener('click', function () {
      var h = state.job.hints;
      if (state.hint < h.length) {
        hintList.appendChild(el('li', {}, h[state.hint]));
        state.hint++;
      }
      hintBtn.disabled = state.hint >= h.length;
      hintBtn.textContent = state.hint >= h.length ? 'No more hints' : state.hint ? 'Another hint' : 'Show a hint';
    });

    function setJob(j) {
      if (state.running || state.drag) stop();
      state.job = j; state.hint = 0;
      briefTitle.textContent = j.free ? j.title : 'Job ' + j.n + ': ' + j.title;
      briefText.textContent = j.brief;
      hintList.innerHTML = '';
      hintBtn.hidden = j.free; targetBtn.hidden = j.free;
      hintBtn.disabled = false; hintBtn.textContent = 'Show a hint';
      drawing.hidden = j.free;
      drawingBody.innerHTML = j.free ? '' : D.renderDrawing(j, { idPrefix: uid + '-drawing-' + j.id });
      resetImages();
      syncSegs();
      redrawAll();
      scheduleInspect(true);
      say(sim().removed ? 'Back to job ' + j.n + ', as you left it.' : (sim().tool ? '' : 'Pick a tool from the rack to start.'), false);
    }

    /* ---- theme, size, print ----------------------------------------------*/
    function rePalette() { P = readPalette(rootEl); redrawAll(); paintOverlay(); }
    if (window.MutationObserver) new MutationObserver(rePalette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (dark && dark.addEventListener) dark.addEventListener('change', rePalette);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { drawTop(); scheduleIso(true); });
      ro.observe(topCanvas); ro.observe(isoCanvas);
    } else addEventListener('resize', function () { drawTop(); scheduleIso(true); });
    addEventListener('beforeprint', function () {
      if (state.running || state.drag) stop();
      var job = state.job, rep = state.report;
      record.innerHTML = '';
      if (!sim().removed) return;
      record.appendChild(el('p', { class: 'ms-box-title' }, 'Your part: ' + (job.free ? job.title : 'job ' + job.n + ', ' + job.title)));
      try {
        var shot = el('img', { class: 'ms-record-img', alt: 'The part as it was cut, in isometric.', src: isoCanvas.toDataURL('image/png') });
        record.appendChild(shot);
      } catch (e) { /* a tainted canvas cannot be copied; the report still prints */ }
      if (rep) {
        record.appendChild(el('p', {}, rep.summary));
        var ul = el('ul', {});
        rep.rows.forEach(function (r) {
          ul.appendChild(el('li', {}, r.label + ': ' + (r.ok ? 'matches' : r.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.text; }).join(' '))));
        });
        record.appendChild(ul);
      }
    });

    setStep(1);
    setJob(jobs[0]);
  }

  function boot() {
    if (typeof document === 'undefined') return;
    var go = function () { document.querySelectorAll('[data-interactive="milling-simulator"]').forEach(wire); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }

  return {
    boot: boot, parseColor: parseColor, mix: mix, cellColor: cellColor,
    isoTurn: isoTurn, isoProject: isoProject, describeMove: describeMove, WIN: WIN, STEPS: STEPS
  };
});

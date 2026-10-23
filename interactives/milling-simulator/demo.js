/* ============================================================================
   milling-simulator / demo.js - the machine on the page.

   Builds the live simulator inside every [data-interactive="milling-
   simulator"] root. What a learner meets first, top to bottom:
     the job and its goal in one line, the drawing one press away;
     the work: a readout, then one of two views chosen by a switch over them:
       a large top view and section A-A through the tool, or the part in
       isometric, which turns; both with the FINISHED part laid over the
       actual block (gold: metal still to remove, deeper is stronger; striped
       red-orange: cut past the drawing; in the top and section, a dashed
       outline: the drawing's edges);
     what the last move did, an optional next step, and Undo, beside it;
     the controls: a compact tool changer, move-to boxes, the handwheels.
   Section B-B, help and the full inspection are below it.

   The page source carries only teaching text and the printed figures; the
   controls are made here, so a reader without JavaScript (or a printout)
   never meets a row of dead buttons.

   The overlay is judged by inspect.js, the same envelope the inspection
   uses, cell by cell; the outline is draw.js's drawing geometry. Nothing
   here keeps a second copy of a target shape.
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
  function luma(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function readPalette(elm) {
    var cs = getComputedStyle(elm), get = function (k) { return parseColor(cs.getPropertyValue(k)); };
    var P = {
      paper: get('--paper'), surface: get('--surface'), surface2: get('--surface-2'), ink: get('--ink'),
      inkSoft: get('--ink-soft'), rule: get('--rule'), accent: get('--accent'),
      target: get('--cat1'), excess: get('--cat2'), over: get('--cat3')
    };
    // The block is plain grey, darker where it is lower, so that blue, gold
    // and red-orange each keep one meaning: the finished part, metal to
    // remove, metal cut too far.
    var dark = luma(P.paper) < 0.35;
    P.metalTop = mix(P.surface, P.ink, 0.2);
    P.metalDeep = mix(P.metalTop, dark ? P.paper : P.ink, dark ? 0.5 : 0.42);
    P.under = mix(P.paper, P.ink, dark ? 0.04 : 0.12);
    P.jaw = mix(P.paper, P.inkSoft, 0.3);
    P.parallel = mix(P.paper, P.inkSoft, 0.45);
    return P;
  }

  /* Colour of the metal at one raster cell: deeper is darker, and a light
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

  /* ---- the finished part, cell by cell -----------------------------------
     For each raster cell: the band of heights the inspection accepts there
     (inspect.js envAt) and the drawing's nominal height (nominalAt). The
     overlay compares the metal that is actually left with these. */
  function targetField(sim, job) {
    var n = sim.nx * sim.ny, lo = new Float32Array(n), hi = new Float32Array(n), nom = new Float32Array(n);
    var env = { lo: 0, hi: 0, owner: 'top', mode: 'set' };
    for (var j = 0; j < sim.ny; j++) {
      var y = sim.cellY(j);
      for (var i = 0; i < sim.nx; i++) {
        var x = sim.cellX(i), k = i + j * sim.nx;
        I.envAt(job, x, y, env);
        lo[k] = env.lo; hi[k] = env.hi; nom[k] = I.nominalAt(job, x, y);
      }
    }
    return { lo: lo, hi: hi, nom: nom };
  }
  /* 0 matches, 1 metal still to remove, 2 cut too far: the inspection's
     cell rule (a column cut right through has no metal at all). */
  function cellState(h, lo, hi, bottom) {
    var hv = h <= bottom + 1e-9 ? -Infinity : h;
    return hv > hi + 1e-9 ? 1 : hv < lo - 1e-9 ? 2 : 0;
  }
  /* How strongly to tint metal still to remove: the 1 mm facing allowance
     is a light wash, a deep pocket or a through hole is strong. */
  function excessAlpha(depth) {
    return 0.2 + 0.65 * Math.min(1, Math.max(0, depth) / 7);
  }

  /* The tint of one cell's top in the isometric view: the top view's overlay
     rule, so both views mark the same metal. null: no tint; otherwise the
     kind (1 still to remove, 2 cut too far) and how strongly to tint. */
  function isoTint(h, lo, hi, nom, bottom, reportOver) {
    var v = cellState(h, lo, hi, bottom);
    if (!v && reportOver) v = 2;
    if (v === 1) return { kind: 1, alpha: excessAlpha(h - nom) };
    if (v === 2) return { kind: 2, alpha: 0.7 };
    return null;
  }

  /* ---- what is under the cutter -------------------------------------------*/
  function clearance(sim) {
    var t = sim.tool;
    if (!t) return null;
    var top = sim.maxHeightIn(sim.pos.x, sim.pos.y, t.dia / 2);
    if (top === -Infinity) return { beside: true };
    return { top: top, gap: sim.pos.z - top };
  }
  function where(sim) {
    return 'X ' + fmtSigned(sim.pos.x, 2) + ', Y ' + fmtSigned(sim.pos.y, 2) + ', Z ' + fmtSigned(sim.pos.z, 2);
  }

  /* Plain-language account of a finished move, for the status line. It
     always says whether metal was cut, and where the tool now is. */
  function describeMove(sum, sim) {
    if (sum.blocked) return { kind: 'stop', title: 'Stopped.', text: sum.blocked.message, warn: true };
    var parts = [], threaded = sum.notes.some(function (n) { return /^Thread cut/.test(n); });
    var cut = sum.volume > 0.05 || sum.subGridCut;
    if (sum.volume > 0.05) {
      var v = sum.volume >= 1000 ? fmt(sum.volume / 1000, 2) + ' cm³' : fmt(sum.volume, sum.volume < 10 ? 1 : 0) + ' mm³';
      parts.push('Removed approximately ' + v + ' (grid estimate).');
      if (sum.side === 'climb') parts.push('A side cut with the metal on the right of the cutter: climb milling.');
      else if (sum.side === 'conventional') parts.push('A side cut with the metal on the left of the cutter: conventional milling.');
      else if (sum.side === 'both') parts.push('The cutter had metal on both sides, like a slot.');
    }
    if (sum.subGridCut) parts.push('A small cut changed the surface between display samples; the volume grid cannot resolve all of this removal. Inspect for its marked location.');
    sum.notes.forEach(function (n) { parts.push(n); });
    if (sum.kind === 'tool') return { kind: 'info', title: 'Tool changed.', text: parts.join(' '), warn: false };
    if (cut || threaded) {
      parts.push('Now at ' + where(sim) + '.');
      return { kind: 'cut', title: threaded && !cut ? 'Threaded.' : 'Cut.', text: parts.join(' '), warn: false };
    }
    var c = clearance(sim);
    parts.push(!c ? 'At ' + where(sim) + '.' : c.beside ? 'The tool is at ' + where(sim) + ', beside the block: there is no metal under the cutter.'
      : c.gap > 0.005 ? 'The tool is at ' + where(sim) + '. Its tip is ' + fmt(c.gap, 2) + ' mm above the metal under it. ' +
        (sim.tool && sim.tool.kind === 'face' ? 'For a facing cut, lower it beside the block, then feed across.' : 'This move stayed above the work.')
      : 'The tool is at ' + where(sim) + ', touching the metal.');
    return { kind: 'air', title: 'Nothing cut.', text: parts.join(' '), warn: false };
  }

  /* An optional next step for a learner who has not cut anything yet. It
     names a move and what it will do; the page only fills it into the
     move-to boxes, and the learner makes the move. Facing comes first in
     every job, so the suggestion is a first facing pass; for the other
     tools it says how they are used. Returns null once anything is cut. */
  function nextStep(sim, job) {
    if (!sim.tool) return { text: 'Choose a tool. Each kind cuts a shape of its own.' };
    if (job.free || sim.removed > 0.5 || sim.prims.length) return null;
    var t = sim.tool, r = t.dia / 2, p = sim.pos, top = job.top, raw = ST.rawTop;
    if (t.kind === 'face' || t.kind === 'end') {
      var name = t.kind === 'face' ? 'face mill' : 'end mill', left = -(r + 5), right = ST.x1 + r + 5;
      if (p.y + r <= ST.y0 || p.y - r >= ST.y1) {
        return { text: 'First position it beside the block at Y 30, raised clear of the work. Then it can face a strip across the top.',
          fill: {x:left, y:30, z:SETUP.clearZ}, label:'Fill in a starting position' };
      }
      if (sim.capsuleTouchesStock(p, p, r)) {
        return { text: 'A facing pass starts beside the block, where the ' + name + ' can go down to depth without touching metal.',
          fill: { x: left }, label: 'Fill in X ' + fmt(left, 2) };
      }
      if (Math.abs(p.z - top) > 1e-6) {
        return { text: 'Lower it to Z ' + fmt(top, 2) + ', the finished top, here beside the block: nothing is under it to cut.',
          fill: { z: top }, label: 'Fill in Z ' + fmt(top, 2) };
      }
      var to = p.x < (ST.x0 + ST.x1) / 2 ? right : left;
      return { text: 'Feed it across to X ' + fmt(to, 2) + '. Where it passes over the block it cuts the raw top, ' + fmt(raw - top, 2) +
        ' mm proud, down to Z ' + fmt(top, 2) + ' in a strip up to the cutter’s width, Ø' + fmt(t.dia, 0) + '.',
        fill: { x: to }, label: 'Fill in X ' + fmt(to, 2) };
    }
    if (t.kind === 'bore') return { text: 'The boring head needs a hole to start in. Set its diameter, put its centre over the hole, then feed it down.' };
    if (t.kind === 'spot') return { text: 'Put its point over a hole and feed it down for a countersink, or run it along an edge to chamfer it.' };
    return { text: 'This tool only feeds straight down. Put its centre over the place for the hole, in X and Y, then lower Z.' };
  }

  /* The inspection in one line: how far along, and the next difference. */
  function progressLine(rep) {
    if (!rep) return '';
    var firstBad = function (r) { var c = r.checks.filter(function (x) { return !x.ok; })[0]; return c ? c.text : ''; };
    if (rep.complete) return rep.summary;
    if (rep.overcut) {
      var o = rep.rows.filter(function (r) { return r.status === 'over'; }).map(function (r) { return r.label; });
      return rep.summary + (o.length ? ' Where: ' + o.join('; ') + '.' : '');
    }
    if (!rep.started) return rep.summary;
    var r = rep.rows.filter(function (x) { return !x.ok; })[0];
    return rep.done + ' of ' + rep.total + ' callouts match.' + (r ? ' ' + r.label + ': ' + firstBad(r) : '');
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
  function button(label, attrs) { return el('button', Object.assign({ type: 'button' }, attrs || {}), label); }
  function add(parent) { for (var k = 1; k < arguments.length; k++) if (arguments[k]) parent.appendChild(arguments[k]); return parent; }

  function isolateKeys(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Escape') return;
    if ([' ', 'Spacebar', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].indexOf(e.key) >= 0) e.stopPropagation();
  }

  /* The rack, by kind: one button per kind, then its sizes. */
  var KINDS = [];
  M.TOOLS.forEach(function (t) {
    var k = KINDS.filter(function (g) { return g.group === t.group; })[0];
    if (!k) KINDS.push(k = { group: t.group, kind: t.kind, tools: [] });
    k.tools.push(t);
  });
  var KIND_NAME = { face: 'Face mill', end: 'End mill', spot: 'Spot / chamfer', drill: 'Drill', tap: 'Tap', bore: 'Boring head' };
  function sizeLabel(t) {
    return t.kind === 'tap' ? M.THREADS[t.thread].label : 'Ø' + fmt(t.dia, t.dia % 1 ? 1 : 0);
  }

  function wire(rootEl) {
    if (rootEl.hasAttribute('data-ms-wired')) return;
    rootEl.setAttribute('data-ms-wired', '');
    var host = rootEl.querySelector('[data-ms-live]') || rootEl;
    var uid = 'ms' + Math.random().toString(36).slice(2, 8);
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    var sims = {}, fields = {}, jobs = J.JOBS;
    var state = {
      job: jobs[0], step: 1, speed: 'normal', target: true, rot: 0, hint: 0, kindShown: null, layout: 'flat',
      report: null, queue: [], running: null, drag: null, raf: 0, last: 0, armReset: 0, edited: {}
    };
    function sim() { return sims[state.job.id] || (sims[state.job.id] = M.create()); }
    function field() {
      if (state.job.free) return null;
      return fields[state.job.id] || (fields[state.job.id] = targetField(sim(), state.job));
    }
    var P = readPalette(rootEl);

    /* ---- the job and its goal ------------------------------------------*/
    var app = el('div', { class: 'ms-app' });
    var head = el('div', { class: 'ms-head' });
    var jobBar = el('div', { class: 'ms-jobs', role: 'group', 'aria-label': 'Job' });
    var jobButtons = {};
    jobs.forEach(function (j) {
      var b = button('', { 'aria-pressed': 'false', 'data-job': j.id,
        'aria-label': j.free ? j.title : 'Job ' + j.n + ': ' + j.title });
      add(b, el('span', { class: 'ms-job-n' }, j.free ? 'Free practice' : 'Job ' + j.n),
        j.free ? null : el('span', { class: 'ms-job-name' }, j.short));
      b.addEventListener('click', function () { setJob(j); });
      jobButtons[j.id] = b; jobBar.appendChild(b);
    });
    var headTools = el('div', { class: 'ms-head-tools' });
    var drawingBtn = button('Drawing', { 'aria-expanded': 'false', 'aria-controls': uid + '-drawing' });
    var hintBtn = button('Hint', { class: 'ms-hint-btn' });
    add(headTools, drawingBtn, hintBtn);
    add(head, jobBar, headTools);
    var goal = el('p', { class: 'ms-goal' });
    var hintList = el('ol', { class: 'ms-hints', 'aria-live': 'polite' });
    var drawing = el('div', { class: 'ms-drawing', id: uid + '-drawing', hidden: true });
    var drawingBody = el('div', { class: 'msd-scroll', tabindex: '0', role: 'region', 'aria-label': 'Drawing; scrolls sideways on a narrow screen' });
    drawing.appendChild(drawingBody);

    /* ---- the work: readout, top view, section A-A ----------------------*/
    var machine = el('div', { class: 'ms-machine' });
    var dro = el('div', { class: 'ms-dro', role: 'group', 'aria-label': 'Readout' }), droOut = {};
    var droVals = el('div', { class: 'ms-dro-vals' });
    ['x', 'y', 'z'].forEach(function (ax) {
      var v = el('span', { class: 'ms-dro-v' });
      v.appendChild(el('span', { class: 'ms-dro-k', 'aria-hidden': 'true' }, ax.toUpperCase()));
      droOut[ax] = el('output', { class: 'ms-dro-val', 'aria-label': ax === 'z' ? 'Z of the tool tip' : ax.toUpperCase() + ' of the tool centre' });
      v.appendChild(droOut[ax]);
      droVals.appendChild(v);
    });
    var droNote = el('p', { class: 'ms-dro-note' }), droUnder = el('span', {});
    add(droNote, el('span', { class: 'ms-dro-meaning' }, 'X, Y: tool centre · Z: tip · '), droUnder);
    add(dro, droVals, droNote);

    /* One switch in the corner of the views, over the back of the vise: the top
       view with section A-A, or the part in isometric. It names the view in use,
       so it takes the place of the top view's label and adds no height. */
    var viewBar = el('div', { class: 'ms-viewbar' });
    var viewBtns = el('div', { class: 'ms-viewbar-btns', role: 'group', 'aria-label': 'View of the work' });
    var flatBtn = button('Top and front', { 'aria-pressed': 'true', 'aria-controls': uid + '-views' });
    var isoBtn = button('Isometric', { 'aria-pressed': 'false', 'aria-controls': uid + '-views' });
    var viewHow = el('span', { class: 'ms-view-how' }, 'drag the tool');
    var turnL = button('↶', { class: 'ms-mini', 'aria-label': 'Turn the part view left' });
    var turnR = button('↷', { class: 'ms-mini', 'aria-label': 'Turn the part view right' });
    var isoTurnRow = add(el('span', { class: 'ms-turn', hidden: true }), turnL, turnR);
    add(viewBar, add(viewBtns, flatBtn, isoBtn), isoTurnRow, viewHow);
    var views = el('div', { class: 'ms-views', id: uid + '-views' });
    views.appendChild(viewBar);
    var vTop = el('figure', { class: 'ms-view ms-view-top' });
    var topCanvas = el('canvas', { class: 'ms-canvas ms-top-canvas', tabindex: '0', role: 'img', 'aria-describedby': uid + '-keys' });
    var probe = el('p', { class: 'ms-probe', 'aria-hidden': 'true' });
    var legend = el('p', { class: 'ms-legend' });
    legend.innerHTML = '<span class="ms-lg"><span class="ms-key ms-key-target" aria-hidden="true"></span>finished part</span>' +
      '<span class="ms-lg"><span class="ms-key ms-key-excess" aria-hidden="true"></span><span>still to remove<span class="ms-lg-more">, deeper is stronger</span></span></span>' +
      '<span class="ms-lg"><span class="ms-key ms-key-over" aria-hidden="true"></span>cut past the drawing</span>' +
      '<span class="ms-lg"><span class="ms-key ms-key-metal" aria-hidden="true"></span><span>your block<span class="ms-lg-more">, darker is lower</span></span></span>';
    add(vTop, topCanvas, probe, legend);
    var vFront = el('figure', { class: 'ms-view ms-view-front' });
    var frontHost = el('div', { class: 'ms-section-host', 'aria-hidden': 'true' });
    var frontLabel = el('figcaption', { class: 'ms-view-label ms-view-label-end' });
    var frontName = el('span', { class: 'ms-view-name' });
    add(frontLabel, frontName, el('span', { class: 'ms-view-how' }, 'drag the tool up or down'));
    add(vFront, frontHost, frontLabel);
    add(views, vTop, vFront);

    // what the last move did, a next step, and Undo
    var feedback = el('div', { class: 'ms-feedback', id:uid+'-feedback' });
    var status = el('p', { class: 'ms-status', role: 'status', 'aria-live': 'polite' });
    var next = el('div', { class: 'ms-next' });
    var nextText = el('p', { class: 'ms-next-text' });
    var nextFill = button('', { class: 'ms-next-fill' });
    var detailsBtn = button('Inspection details', { class: 'ms-link-btn', 'aria-controls': uid + '-inspect' });
    add(next, nextText, nextFill);
    var fbAct = el('div', { class: 'ms-fb-act' });
    var undoBtn = button('Undo', { class: 'ms-undo', 'aria-keyshortcuts': 'Control+Z' });
    var feedbackMore = button('Full text', {class:'ms-feedback-toggle', 'aria-expanded':'false', 'aria-controls':uid+'-feedback'});
    feedbackMore.addEventListener('click', function () {
      var expanded = !feedback.classList.contains('is-expanded');
      feedback.classList.toggle('is-expanded', expanded);
      feedbackMore.setAttribute('aria-expanded', String(expanded));
      feedbackMore.textContent = expanded ? 'Less text' : 'Full text';
      keepWorkspaceVisible();
    });
    var stopBtn = button('Stop', { class: 'ms-stop', hidden: true, 'aria-keyshortcuts': 'Escape' });
    add(fbAct, undoBtn, stopBtn, feedbackMore);
    // Undo floats at the top right, so the messages use the full width under it
    add(feedback, fbAct, status, next);
    add(machine, dro, views, feedback);

    /* ---- the controls -----------------------------------------------------*/
    var panel = el('div', { class: 'ms-panel' });
    var toolBox = el('section', { class: 'ms-box ms-toolbox', 'aria-labelledby': uid + '-tool-t' });
    // the box title names the tool in the spindle, beside the rack it came from
    var toolTitle = el('p', { class: 'ms-box-title', id: uid + '-tool-t' }), toolNow = el('span', { class: 'ms-tool-now' });
    add(toolTitle, document.createTextNode('Tool '), toolNow);
    toolBox.appendChild(toolTitle);
    var kindRow = el('div', { class: 'ms-kinds' }), kindButtons = {};
    KINDS.forEach(function (k) {
      var one = k.tools.length === 1;
      var b = button('', { class: 'ms-kind', 'aria-pressed': 'false', 'data-kind': k.group,
        'aria-label': one ? 'Load the ' + M.toolNoun(k.tools[0]) : KIND_NAME[k.kind] + ': choose a size',
        'aria-expanded': one ? null : 'false', 'aria-controls': one ? null : uid + '-sizes' });
      b.innerHTML = D.renderToolIcon(k.tools[0], { height: 30 });
      b.appendChild(el('span', { class: 'ms-kind-name' }, KIND_NAME[k.kind]));
      b.addEventListener('click', function () {
        if (one) { state.kindShown = null; changeTool(k.tools[0].id); return; }
        state.kindShown = state.kindShown === k.group && !(sim().tool && sim().tool.group === k.group) ? null : k.group;
        syncTools();
      });
      kindButtons[k.group] = b; kindRow.appendChild(b);
    });
    var sizeRow = el('div', { class: 'ms-sizes', id: uid + '-sizes', role: 'group' });
    var sizeLab = el('span', { class: 'ms-sizes-label' });
    var sizeChips = el('div', { class: 'ms-chips' }), sizeButtons = {};
    add(sizeRow, sizeLab, sizeChips);
    var boreRow = el('div', { class: 'ms-bore', hidden: true });
    var boreLabel = el('label', { for: uid + '-bore' }, 'Boring Ø');
    var boreInput = el('input', { id: uid + '-bore', type: 'text', inputmode: 'decimal', size: '6', autocomplete: 'off' });
    var boreSet = button('Set');
    add(boreRow, boreLabel, boreInput, boreSet);
    add(toolBox, kindRow, sizeRow, boreRow);

    var moveBox = el('section', { class: 'ms-box ms-movebox', 'aria-labelledby': uid + '-move-t' });
    moveBox.appendChild(el('p', { class: 'ms-box-title', id: uid + '-move-t' }, 'Move to'));
    var go = el('div', { class: 'ms-go' }), goIn = {};
    ['x', 'y', 'z'].forEach(function (ax) {
      var cell = el('div', { class: 'ms-go-cell' });
      cell.appendChild(el('label', { class: 'ms-go-label', for: uid + '-go-' + ax }, ax.toUpperCase()));
      goIn[ax] = el('input', { id: uid + '-go-' + ax, class: 'ms-go-in', type: 'text', inputmode: 'decimal', autocomplete: 'off', size: '7',
        'aria-describedby': uid + '-go-help' });
      goIn[ax].addEventListener('input', function () { state.edited[ax] = true; goIn[ax].classList.add('is-edited'); });
      // a click into a box selects its number, so typing replaces it
      goIn[ax].addEventListener('focus', function () { goIn[ax].select(); goIn[ax].msFresh = true; });
      goIn[ax].addEventListener('mouseup', function (e) { if (goIn[ax].msFresh) { e.preventDefault(); goIn[ax].msFresh = false; } });
      cell.appendChild(goIn[ax]);
      go.appendChild(cell);
    });
    var goRow = el('div', { class: 'ms-go-row' });
    var goBtn = button('Move', { class: 'ms-primary' });
    var upBtn = button('Raise to Z +' + fmt(SETUP.clearZ, 0));
    add(goRow, goBtn, upBtn);
    var goHelp = el('p', { class: 'ms-vh', id: uid + '-go-help' }, 'Millimetres from work zero. X and Y place the tool centre; Z places its tip. A move goes up before across, and across before down.');
    add(moveBox, go, goRow, goHelp);

    var jogBox = el('section', { class: 'ms-box ms-jogbox', 'aria-labelledby': uid + '-jog-t' });
    var jogHead = el('div', { class: 'ms-jog-head' });
    jogHead.appendChild(el('p', { class: 'ms-box-title', id: uid + '-jog-t' }, 'Handwheels'));
    var stepRow = el('div', { class: 'ms-seg', role: 'group', 'aria-label': 'Step for each press' });
    var stepButtons = {};
    STEPS.forEach(function (st) {
      var b = button(fmt(st, st < 1 ? 1 : 0), { 'aria-pressed': 'false', 'aria-label': 'Step ' + fmt(st, st < 1 ? 1 : 0) + ' mm' });
      b.addEventListener('click', function () { setStep(st); });
      stepButtons[st] = b; stepRow.appendChild(b);
    });
    add(jogHead, stepRow, el('span', { class: 'ms-seg-unit', 'aria-hidden': 'true' }, 'mm'));
    var jog = el('div', { class: 'ms-jog' });
    [['y', 1, 'Y+', 'ms-j-yp', 'away'], ['x', -1, 'X−', 'ms-j-xm', 'left'], ['x', 1, 'X+', 'ms-j-xp', 'right'], ['y', -1, 'Y−', 'ms-j-ym', 'toward you'],
      ['z', 1, 'Z+', 'ms-j-zp', 'up'], ['z', -1, 'Z−', 'ms-j-zm', 'down']].forEach(function (d) {
      var b = button('', { class: 'ms-jog-btn ' + d[3], 'aria-label': 'Move ' + d[0].toUpperCase() + (d[1] > 0 ? ' plus' : ' minus') + ', ' + d[4] + ', one step' });
      add(b, el('span', { class: 'ms-jog-ax' }, d[2]), el('span', { class: 'ms-jog-sub', 'aria-hidden': 'true' }, d[4]));
      b.addEventListener('click', function () { jogBy(d[0], d[1]); });
      jog.appendChild(b);
    });
    add(jogBox, jogHead, jog);
    add(panel, toolBox, moveBox, jogBox);

    var workbench = el('div', { class: 'ms-workbench' });
    add(workbench, machine, panel);

    /* ---- below the work: more views, help, start over --------------------*/
    var tray = el('div', { class: 'ms-tray' });
    var targetBtn = button('Finished part on the work', { 'aria-pressed': 'true' });
    var moreBtn = button('Section B–B', { 'aria-expanded': 'false', 'aria-controls': uid + '-more' });
    var helpBtn = button('Help and keys', { 'aria-expanded': 'false', 'aria-controls': uid + '-help' });
    var resetBtn = button('Start this job over');
    add(tray, targetBtn, moreBtn, helpBtn, resetBtn);

    var more = el('div', { class: 'ms-more', id: uid + '-more', hidden: true });
    // the isometric takes the place of the top view and section, in the same space
    var vIso = el('figure', { class: 'ms-view ms-view-iso', hidden: true });
    var isoCanvas = el('canvas', { class: 'ms-canvas ms-iso-canvas', tabindex: '0', role: 'img', 'aria-describedby': uid + '-keys' });
    var isoLegend = el('p', { class: 'ms-legend' });
    isoLegend.innerHTML = '<span class="ms-lg"><span class="ms-key ms-key-excess" aria-hidden="true"></span>still to remove</span>' +
      '<span class="ms-lg"><span class="ms-key ms-key-tool" aria-hidden="true"></span>the tool</span>' +
      '<span class="ms-lg"><span class="ms-key ms-key-over" aria-hidden="true"></span>cut past the drawing</span>';
    add(vIso, isoCanvas, isoLegend);
    var vSide = el('figure', { class: 'ms-view ms-view-side' });
    var sideCap = el('figcaption', { class: 'ms-view-cap' });
    var sideName = el('span', { class: 'ms-view-title' });
    sideCap.appendChild(sideName);
    var sideHost = el('div', { class: 'ms-section-host', 'aria-hidden': 'true' });
    add(vSide, sideCap, sideHost);
    add(more, vSide);
    add(views, vIso);

    var help = el('div', { class: 'ms-help', id: uid + '-help', hidden: true });
    var keysNote = el('p', { id: uid + '-keys' },
      'Drag the tool’s circle in the top view to move X and Y (hold Shift to keep to one axis), or drag the tool in a section to move Z. ' +
      'With the top view or the isometric selected, the arrow keys move X and Y and Page Up and Page Down move Z, one step at a time; [ and ] change the step. ' +
      'Ctrl+Z undoes; Escape stops a move part-way, keeping what it has cut.');
    var meaning = el('p', {}, 'The readout follows the centre of the tool in X and Y and its tip in Z, from work zero: X 0 Y 0 is the front left corner, Z 0 the finished top. ' +
      'The raw block stands 1 mm proud, at Z +1.00. Volumes are grid estimates, and the inspection is a set of sampled teaching checks, not certified measurement.');
    var speedRow = el('div', { class: 'ms-seg', role: 'group', 'aria-label': 'Speed of moves on screen' });
    var speedButtons = {};
    [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']].forEach(function (sp) {
      var b = button(sp[1], { 'aria-pressed': 'false' });
      b.addEventListener('click', function () { state.speed = sp[0]; syncSegs(); });
      speedButtons[sp[0]] = b; speedRow.appendChild(b);
    });
    add(help, keysNote, meaning, add(el('div', { class: 'ms-help-row' }, null), el('span', { class: 'ms-small-label' }, 'Speed on screen'), speedRow));

    /* ---- the inspection ----------------------------------------------------*/
    var inspect = el('section', { class: 'ms-inspect', id: uid + '-inspect', 'aria-labelledby': uid + '-insp-t', tabindex: '-1' });
    var inspTitle = el('p', { class: 'ms-box-title', id: uid + '-insp-t' }, 'Inspection of the part as it is now');
    var inspSummary = el('p', { class: 'ms-inspect-summary' });
    var inspRows = el('ul', { class: 'ms-rows' });
    add(inspect, inspTitle, inspSummary, inspRows);

    // the record a printout carries
    var record = el('div', { class: 'ms-record', 'aria-hidden': 'true' });

    add(app, head, goal, hintList, drawing, workbench, tray, more, help, inspect);
    /* Bring the whole bench on screen when a control is used, keeping the
       goal above it in view too when both fit. */
    function keepWorkspaceVisible() {
      var r = workbench.getBoundingClientRect(), g = goal.getBoundingClientRect();
      var bar = document.querySelector('.appbar'), top = (bar ? bar.getBoundingClientRect().bottom : 0) + 8;
      var nav = document.querySelector('.seqbar'), nr = nav && nav.getBoundingClientRect();
      var bottom = nr && nr.height ? Math.min(window.innerHeight, nr.top) : window.innerHeight;
      var room = bottom - top - 8;
      if (r.height > room || (r.top >= top && r.bottom <= top + room)) return;
      var edge = r.bottom - g.top <= room ? g.top : r.top;
      window.scrollBy({ top: edge - top, behavior: 'instant' });
    }
    // Align after activation: moving a button between pointerdown/up would
    // swallow the click. Keyboard activation has no pointer coordinates.
    panel.addEventListener('click', keepWorkspaceVisible);
    panel.addEventListener('keyup', keepWorkspaceVisible);
    host.appendChild(app);
    rootEl.appendChild(record);
    rootEl.classList.add('is-live');

    /* ------------------------------------------------------------------
       Drawing the views
       ------------------------------------------------------------------ */
    var img = document.createElement('canvas'), imgCtx, imgData;
    var over = document.createElement('canvas'), overCtx, overData;
    function resetImages() {
      var s = sim();
      img.width = s.nx; img.height = s.ny; imgCtx = img.getContext('2d');
      imgData = imgCtx.createImageData(s.nx, s.ny);
      over.width = s.nx; over.height = s.ny; overCtx = over.getContext('2d');
      overData = overCtx.createImageData(s.nx, s.ny);
      paintCells(0, s.nx - 1, 0, s.ny - 1);
    }
    function underColor(x, y) {
      var parallel = SETUP.parallels.some(function (q) { return x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1; });
      return parallel ? P.parallel : P.under;
    }
    /* Repaint the metal and the finished-part overlay over a block of cells.
       Witness-probe overcuts from the last inspection stay marked until the
       next one, so a gouge between cell centres is not lost while moving. */
    function paintCells(i0, i1, j0, j1) {
      var s = sim(), nx = s.nx, ny = s.ny, d = imgData.data, o = overData.data, cell = M.CELL, bottom = ST.bottom;
      var F = field(), rep = state.report;
      i0 = Math.max(0, i0 - 1); i1 = Math.min(nx - 1, i1 + 1); j0 = Math.max(0, j0 - 1); j1 = Math.min(ny - 1, j1 + 1);
      for (var j = j0; j <= j1; j++) {
        for (var i = i0; i <= i1; i++) {
          var k0 = i + j * nx, h = s.rasterAt(i, j), c;
          if (h <= bottom + 1e-6) c = underColor(s.cellX(i), s.cellY(j));
          else {
            var hl = s.rasterAt(Math.max(0, i - 1), j), hr = s.rasterAt(Math.min(nx - 1, i + 1), j);
            var hd = s.rasterAt(i, Math.max(0, j - 1)), hu = s.rasterAt(i, Math.min(ny - 1, j + 1));
            c = cellColor(P, h, (hr - hl) / (2 * cell), (hu - hd) / (2 * cell), bottom, ST.rawTop);
          }
          var k = 4 * (i + (ny - 1 - j) * nx);       // image rows run top-down: flip Y
          d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
          var v = 0;
          if (F) {
            v = cellState(h, F.lo[k0], F.hi[k0], bottom);
            if (!v && rep && rep.status && rep.status[k0] === 2) v = 2;
          }
          if (v === 1) {
            o[k] = P.excess[0]; o[k + 1] = P.excess[1]; o[k + 2] = P.excess[2];
            o[k + 3] = Math.round(255 * excessAlpha(h - F.nom[k0]));
          } else if (v === 2) {
            // stripes, so a gouge differs from gold by pattern as well as hue
            o[k] = P.over[0]; o[k + 1] = P.over[1]; o[k + 2] = P.over[2];
            o[k + 3] = ((i + j) >> 3) & 1 ? 235 : 120;
          } else o[k + 3] = 0;
        }
      }
      imgCtx.putImageData(imgData, 0, 0, i0, ny - 1 - j1, i1 - i0 + 1, j1 - j0 + 1);
      overCtx.putImageData(overData, 0, 0, i0, ny - 1 - j1, i1 - i0 + 1, j1 - j0 + 1);
    }

    function sizeCanvas(cv, aspect, width) {
      var w = Math.max(10, width || cv.clientWidth), dpr = Math.min(2, window.devicePixelRatio || 1);
      var h = Math.round(w / aspect);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      return { w: w, h: h, dpr: dpr };
    }
    function showTarget() { return state.target && !state.job.free; }
    function drawTop() {
      var s = sim(), sz = sizeCanvas(topCanvas, (WIN.x1 - WIN.x0) / (WIN.y1 - WIN.y0));
      var ctx = topCanvas.getContext('2d'), k = sz.w / (WIN.x1 - WIN.x0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = css(P.paper); ctx.fillRect(0, 0, topCanvas.width, topCanvas.height);
      // part coordinates, Y up; one unit is one millimetre
      ctx.setTransform(k * sz.dpr, 0, 0, -k * sz.dpr, -WIN.x0 * k * sz.dpr, WIN.y1 * k * sz.dpr);
      var px = 1 / k;                                   // one screen pixel, in mm
      ctx.fillStyle = css(P.jaw); ctx.strokeStyle = css(P.inkSoft); ctx.lineWidth = px;
      SETUP.jaws.forEach(function (q) { ctx.fillRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0); ctx.strokeRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0); });
      // the work, and the finished part over it, the right way up
      ctx.save();
      ctx.translate(ST.x0, ST.y1); ctx.scale(1, -1);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, ST.x1 - ST.x0, ST.y1 - ST.y0);
      if (showTarget()) ctx.drawImage(over, 0, 0, ST.x1 - ST.x0, ST.y1 - ST.y0);
      ctx.restore();
      ctx.strokeStyle = css(P.ink); ctx.lineWidth = 1.2 * px;
      ctx.strokeRect(ST.x0, ST.y0, ST.x1 - ST.x0, ST.y1 - ST.y0);
      // the drawing's edges, on a paper halo so they read over gold and grey
      if (showTarget()) {
        ctx.save(); ctx.scale(1, -1);
        var paths = D.targetOutline(state.job).map(function (d) { return new Path2D(d); });
        ctx.strokeStyle = css(P.paper, 0.75); ctx.lineWidth = 3.6 * px;
        paths.forEach(function (p) { ctx.stroke(p); });
        ctx.strokeStyle = css(P.target); ctx.lineWidth = 2 * px; ctx.setLineDash([6 * px, 3.5 * px]);
        paths.forEach(function (p) { ctx.stroke(p); });
        ctx.restore(); ctx.setLineDash([]);
      }
      // section line A-A through the tool (and B-B when that view is open)
      ctx.strokeStyle = css(P.inkSoft); ctx.lineWidth = px; ctx.setLineDash([10 * px, 3 * px, 2 * px, 3 * px]);
      ctx.beginPath(); ctx.moveTo(WIN.x0, s.pos.y); ctx.lineTo(WIN.x1, s.pos.y);
      if (!more.hidden) { ctx.moveTo(s.pos.x, WIN.y0); ctx.lineTo(s.pos.x, WIN.y1); }
      ctx.stroke(); ctx.setLineDash([]);
      // the tool, seen from above
      if (s.tool) {
        var r = s.tool.dia / 2, engaged = s.pos.z < s.heightAt(s.pos.x, s.pos.y) || s.pos.z < s.maxHeightIn(s.pos.x, s.pos.y, r);
        ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = css(P.accent, engaged ? 0.34 : 0.14); ctx.fill();
        ctx.strokeStyle = css(P.accent); ctx.lineWidth = (engaged ? 2.4 : 1.6) * px;
        if (!engaged) ctx.setLineDash([4 * px, 2.5 * px]);
        ctx.stroke(); ctx.setLineDash([]);
        if (s.tool.kind === 'bore') {
          ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, s.tool.barDia / 2, 0, 2 * Math.PI); ctx.stroke();
        }
        var c = Math.min(3, r * 0.6) + 1.2;
        ctx.beginPath(); ctx.moveTo(s.pos.x - c, s.pos.y); ctx.lineTo(s.pos.x + c, s.pos.y);
        ctx.moveTo(s.pos.x, s.pos.y - c); ctx.lineTo(s.pos.x, s.pos.y + c);
        ctx.strokeStyle = css(P.ink); ctx.lineWidth = 1.2 * px; ctx.stroke();
      }
      // axes at X0 Y0
      ctx.strokeStyle = css(P.accent); ctx.lineWidth = 1.6 * px;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.moveTo(0, 0); ctx.lineTo(0, 9); ctx.stroke();
      ctx.setTransform(sz.dpr, 0, 0, sz.dpr, 0, 0);
      ctx.fillStyle = css(P.ink); ctx.font = '600 11px ' + getComputedStyle(rootEl).getPropertyValue('--f-display');
      var ox = (0 - WIN.x0) * k, oy = (WIN.y1 - 0) * k;
      ctx.fillText('X', ox + 10 * k + 2, oy + 4); ctx.fillText('Y', ox - 3, oy - 10 * k - 3);
      topCanvas.setAttribute('aria-label', describeTop());
    }
    function describeTop() {
      var s = sim(), t = s.tool;
      var target = showTarget() ? ' The finished part is drawn over the block: gold is metal still to remove, striped red-orange is metal cut past the drawing.' : '';
      if (!t) return 'Top view of the block in the vise. No tool loaded.' + target;
      var c = clearance(s);
      return 'Top view. ' + M.toolLabel(t) + ' at ' + where(s) +
        (c.beside ? ', beside the block.' : '; the highest metal under it is at Z ' + fmtSigned(c.top, 2) + '.') + target;
    }

    var isoTimer = 0;
    function drawIso(cv, width) {
      cv = cv || isoCanvas;
      if (cv === isoCanvas && state.layout !== 'iso') return;
      var aspect = cv === isoCanvas && cv.clientHeight ? cv.clientWidth / cv.clientHeight : 1;
      var s = sim(), sz = sizeCanvas(cv, aspect, width), ctx = cv.getContext('2d');
      var F = cv === isoCanvas && showTarget() ? field() : null, rep = state.report;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = css(P.paper); ctx.fillRect(0, 0, cv.width, cv.height);
      var rot = state.rot, step = 2, cell = M.CELL * step, bottom = ST.bottom;
      // fit the block's projected outline into the canvas
      var corners = [[0, 0], [100, 0], [100, 60], [0, 60]], minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      corners.forEach(function (c) {
        [ST.rawTop + (cv === isoCanvas ? 30 : 0), bottom].forEach(function (z) {
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
        if (F) {
          var k0 = Math.min(s.nx - 1, ci * step + 1) + Math.min(s.ny - 1, cj * step + 1) * s.nx;
          var tint = isoTint(h, F.lo[k0], F.hi[k0], F.nom[k0], bottom, rep && rep.status && rep.status[k0] === 2);
          // gold for metal to remove; red-orange in alternate cells, a pattern as well as a hue
          if (tint && (tint.kind === 1 || ((ci + cj) & 1))) {
            ctx.fillStyle = css(tint.kind === 1 ? P.excess : P.over, tint.alpha);
            ctx.fillRect(sx, syTop - hTop / 2, w, hTop);
          }
        }
      }
      if (cv === isoCanvas && s.tool) drawIsoTool(ctx, s, rot, k, ox, oy);
      cv.setAttribute('aria-label', 'The part in isometric, seen from ' + ['the front right', 'the back right', 'the back left', 'the front left'][rot] +
        '. ' + (s.tool ? M.toolLabel(s.tool) + ' at ' + where(s) + '. ' : '') + (state.report ? state.report.summary : ''));
    }
    /* The tool in the isometric: its cylinder from the tip up, over the metal
       so it is never lost behind a wall. Filled as the top view fills it. */
    function drawIsoTool(ctx, s, rot, k, ox, oy) {
      var r = s.tool.dia / 2, z0 = s.pos.z, z1 = Math.max(z0 + 30, ST.rawTop + 24);
      var ring = function (z) {
        var pts = [];
        for (var a = 0; a < 32; a++) {
          var t = a / 32 * 2 * Math.PI, q = isoProject(s.pos.x + r * Math.cos(t), s.pos.y + r * Math.sin(t), z, rot);
          pts.push([ox + q[0] * k, oy + q[1] * k]);
        }
        return pts;
      };
      var lo = ring(z0), hi = ring(z1);
      var xs = lo.map(function (q) { return q[0]; }), xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
      var c0 = isoProject(s.pos.x, s.pos.y, z0, rot), c1 = isoProject(s.pos.x, s.pos.y, z1, rot);
      var y0 = oy + c0[1] * k, y1 = oy + c1[1] * k;
      var engaged = s.pos.z < s.heightAt(s.pos.x, s.pos.y) || s.pos.z < s.maxHeightIn(s.pos.x, s.pos.y, r);
      ctx.beginPath();
      ctx.rect(xmin, y1, xmax - xmin, y0 - y1);
      [lo, hi].forEach(function (pts) { ctx.moveTo(pts[0][0], pts[0][1]); pts.forEach(function (q) { ctx.lineTo(q[0], q[1]); }); ctx.closePath(); });
      ctx.fillStyle = css(P.accent, engaged ? 0.34 : 0.18); ctx.fill('nonzero');
      ctx.strokeStyle = css(P.accent); ctx.lineWidth = engaged ? 2 : 1.4;
      ctx.beginPath(); ctx.moveTo(xmin, y1); ctx.lineTo(xmin, y0); ctx.moveTo(xmax, y1); ctx.lineTo(xmax, y0);
      ctx.moveTo(lo[0][0], lo[0][1]); lo.forEach(function (q) { ctx.lineTo(q[0], q[1]); }); ctx.closePath();
      ctx.stroke();
    }
    function scheduleIso(now) {
      if (state.layout !== 'iso') return;
      if (now) { clearTimeout(isoTimer); isoTimer = 0; drawIso(); return; }
      if (isoTimer) return;
      isoTimer = setTimeout(function () { isoTimer = 0; drawIso(); }, 180);
    }

    var secTimer = 0;
    function drawSections() {
      var s = sim(), job = state.job, tgt = showTarget();
      frontName.textContent = 'Section A–A at Y ' + fmtSigned(s.pos.y, 2);
      frontHost.innerHTML = D.renderSection(s, job, 'front', s.pos.y, { idPrefix: uid + '-f', target: tgt });
      if (!more.hidden) {
        sideName.textContent = 'Section B–B at X ' + fmtSigned(s.pos.x, 2) + ', seen from the right';
        sideHost.innerHTML = D.renderSection(s, job, 'side', s.pos.x, { idPrefix: uid + '-s', target: tgt });
      }
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
      targetBtn.setAttribute('aria-pressed', String(state.target));
      targetBtn.hidden = state.job.free;
      legend.classList.toggle('is-plain', !showTarget());
      jobs.forEach(function (j) { jobButtons[j.id].setAttribute('aria-pressed', String(j === state.job)); });
    }
    function syncTools() {
      var t = sim().tool, shown = state.kindShown || (t && t.group);
      var kind = KINDS.filter(function (k) { return k.group === shown; })[0];
      KINDS.forEach(function (k) {
        var b = kindButtons[k.group];
        b.setAttribute('aria-pressed', String(!!t && t.group === k.group));
        if (k.tools.length > 1) b.setAttribute('aria-expanded', String(!!kind && kind === k));
      });
      var multi = kind && kind.tools.length > 1;
      sizeRow.hidden = !multi;
      if (multi && sizeRow.getAttribute('data-kind') !== kind.group) {
        sizeRow.setAttribute('data-kind', kind.group);
        sizeRow.setAttribute('aria-label', KIND_NAME[kind.kind] + ' size');
        sizeLab.textContent = KIND_NAME[kind.kind] + (kind.kind === 'tap' ? '' : ' Ø');
        sizeChips.innerHTML = ''; sizeButtons = {};
        kind.tools.forEach(function (tt) {
          var lab = kind.kind === 'tap' ? sizeLabel(tt) : fmt(tt.dia, tt.dia % 1 ? 1 : 0);
          var b = button(lab, { class: 'ms-chip-btn', 'aria-pressed': 'false', 'aria-label': 'Load the ' + M.toolNoun(Object.assign({}, tt)) });
          b.addEventListener('click', function () { changeTool(tt.id); });
          sizeButtons[tt.id] = b; sizeChips.appendChild(b);
        });
      }
      Object.keys(sizeButtons).forEach(function (id) { sizeButtons[id].setAttribute('aria-pressed', String(!!t && t.id === id)); });
      boreRow.hidden = !(t && t.kind === 'bore');
      if (t && t.kind === 'bore' && document.activeElement !== boreInput) boreInput.value = fmt(t.dia, 2);
    }
    function syncInputs() {
      var s = sim();
      ['x', 'y', 'z'].forEach(function (ax) {
        if (state.edited[ax] || document.activeElement === goIn[ax]) return;
        goIn[ax].value = fmt(s.pos[ax], 2);
      });
    }
    function clearEdits() {
      state.edited = {};
      ['x', 'y', 'z'].forEach(function (ax) { goIn[ax].classList.remove('is-edited'); });
    }
    function syncPanel() {
      var s = sim(), t = s.tool;
      droOut.x.textContent = fmtSigned(s.pos.x, 2);
      droOut.y.textContent = fmtSigned(s.pos.y, 2);
      droOut.z.textContent = fmtSigned(s.pos.z, 2);
      toolNow.textContent = t ? M.toolLabel(t) : 'none yet';
      var c = clearance(s), busy = !!state.running || !!state.drag;
      // the tool cuts its own footprint as it goes, so a cut in progress
      // shows as removed volume on the open move, not as metal in the circle
      var cutting = busy && !!s.entry && s.entry.tally.volume > 0.05;
      droUnder.textContent = (cutting ? 'cutting' : !c ? 'choose a tool to begin' : c.beside ? 'beside the block, no metal under it'
        : c.gap > 0.005 ? fmt(c.gap, 2) + ' mm above the metal under it' : c.gap > -0.005 ? 'level with the metal under it' : 'in the metal, ' + fmt(-c.gap, 2) + ' mm deep');
      dro.classList.toggle('is-cutting', cutting);
      syncTools();
      syncInputs();
      undoBtn.hidden = busy; stopBtn.hidden = !busy;
      undoBtn.disabled = !s.canUndo();
      resetBtn.textContent = state.armReset ? 'Sure? Start over' : 'Start this job over';
      syncNext();
    }
    /* The line under the status: the optional next step, or how the part
       stands against the drawing. */
    function syncNext() {
      var s = sim(), ns = (state.running || state.drag) ? null : nextStep(s, state.job), rep = state.report;
      nextFill.hidden = !(ns && ns.fill);
      detailsBtn.hidden = !!ns || state.job.free || !rep || !rep.started;
      if (ns) {
        next.className = 'ms-next is-suggest';
        nextText.innerHTML = '';
        add(nextText, el('strong', {}, s.tool ? 'Next, if you like: ' : 'First: '), document.createTextNode(ns.text));
        if (ns.fill) { nextFill.textContent = ns.label; nextFill.ms = ns.fill; }
      } else {
        next.className = 'ms-next' + (rep && rep.overcut ? ' is-over' : rep && rep.complete ? ' is-complete' : '');
        nextText.textContent = state.job.free ? 'Free practice has no drawing to check against. Approximate grid volume removed: ' + fmt(s.removed / 1000, 2) + ' cm³.'
          : progressLine(rep);
        if (!detailsBtn.hidden) add(nextText, document.createTextNode(' '), detailsBtn);
      }
    }
    function toolCanDo(t) {
      switch (t.kind) {
        case 'face': return 'It cuts with the inserts round its rim as it moves across, up to 4 mm deep.';
        case 'end': return 'It cuts on its end and its sides: it can plunge, then move across up to ' + fmt(t.reach, 0) + ' mm deep. Inside corners take its ' + fmt(t.dia / 2, 0) + ' mm radius.';
        case 'spot': return 'A 90° point: it starts holes, cuts countersinks, and chamfers an edge as it moves along it.';
        case 'drill': return 'It feeds straight down only, and leaves a hole of its own size with a 118° point at the bottom.';
        case 'tap': return 'It cuts an ' + M.THREADS[t.thread].label + ' thread inside a Ø' + fmt(M.THREADS[t.thread].tapDrill, 1) + ' hole. Straight in, straight out.';
        case 'bore': return 'Adjustable: set its diameter, then feed it down a hole at least Ø10 to open the hole to that size.';
      }
      return '';
    }
    var inspectTimer = 0;
    function runInspect() {
      var s = sim(), job = state.job;
      if (job.free) {
        state.report = null;
        inspSummary.textContent = 'Free practice has no drawing to check against. Approximate grid volume removed: ' + fmt(s.removed / 1000, 2) + ' cm³; very small cuts may fall between samples.';
        inspRows.innerHTML = '';
        inspect.classList.remove('is-complete', 'is-over');
        syncNext();
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
        var rh = el('p', { class: 'ms-row-head' });
        rh.appendChild(el('span', { class: 'ms-chip' }, { ok: 'Matches', todo: 'To do', over: 'Cut too far', none: 'Not started' }[r.status]));
        rh.appendChild(el('span', { class: 'ms-row-label' }, r.label));
        li.appendChild(rh);
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
      paintCells(0, s.nx - 1, 0, s.ny - 1);
      syncNext();
    }
    function scheduleInspect(now) {
      clearTimeout(inspectTimer);
      var go = function () { runInspect(); drawTop(); scheduleIso(true); };
      if (now) { go(); return; }
      inspectTimer = setTimeout(go, 120);
    }

    function say(kind, title, text) {
      feedback.className = 'ms-feedback is-' + kind;
      feedbackMore.setAttribute('aria-expanded', 'false');
      feedbackMore.textContent = 'Full text';
      status.innerHTML = '';
      if (title) add(status, el('strong', {}, title), document.createTextNode(' '));
      status.appendChild(document.createTextNode(text || ''));
    }
    function sayMove(m) { say(m.kind, m.title, m.text); }

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
      if (!s.tool) { say('stop', 'No tool.', 'Choose a tool first.'); return; }
      if (state.running || state.queue.length) {
        if (state.queue.length < 2) state.queue.push({ target: target, label: label });
        return;
      }
      startMove(target, label);
    }
    function startMove(target, label) {
      var s = sim(), pl = s.plan(target);
      if (label === 'Go to' || label === 'Raise') {
        say('info', 'Moving.', 'To X ' + fmtSigned(pl.target.x, 2) + ', Y ' + fmtSigned(pl.target.y, 2) + ', Z ' + fmtSigned(pl.target.z, 2) +
          '. Stop or Escape halts it where it is, keeping what it has cut.');
      }
      s.begin('move', label || 'Move');
      if (pl.note) s.entry.notes.push(pl.note);
      state.running = { legs: pl.legs, k: 0 };
      syncPanel();
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
      while (run && run.k < run.legs.length && budget > M.EPS) {
        var leg = run.legs[run.k], before = leg.done;
        var r = s.advance(leg, budget);
        var progressed = Math.max(0, leg.done - before);
        budget -= progressed;
        if (r.blocked) { run.k = run.legs.length; break; }
        if (r.done) run.k++;
        else if (progressed <= M.EPS) break;
        if (!isFinite(dist)) budget = Infinity;
      }
      if (run && run.k >= run.legs.length) finishMove();
    }
    function finishMove(stopped) {
      var s = sim(), sum = s.commit();
      state.running = null;
      if (sum) {
        var m = describeMove(sum, s);
        if (stopped && !sum.blocked) { m.title = 'Stopped part-way.'; m.text = 'Everything cut up to here is kept. ' + m.text; }
        sayMove(m);
      }
      if (stopBtn === document.activeElement) undoBtn.focus({ preventScroll: true });
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
      if (state.running) { state.running.k = state.running.legs.length; state.queue = []; finishMove(true); }
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
      if (!s.tool) { say('stop', 'No tool.', 'Choose a tool first.'); return false; }
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
        if (dg.lastCode !== r.code) { say('stop', 'Stopped.', r.message); dg.lastCode = r.code; }
        if (dg.released) endDrag();
      }
    }
    function endDrag(force) {
      var dg = state.drag;
      if (!dg) return;
      if (!force && !dg.settled) { dg.released = true; return; }
      state.drag = null;
      var s = sim(), sum = s.commit();
      if (sum && !dg.lastCode) sayMove(describeMove(sum, s));
      redrawMoving();
      scheduleInspect();
    }

    function topPoint(ev) {
      var r = topCanvas.getBoundingClientRect(), k = r.width / (WIN.x1 - WIN.x0);
      return { x: WIN.x0 + (ev.clientX - r.left) / k, y: WIN.y1 - (ev.clientY - r.top) / k };
    }
    topCanvas.addEventListener('pointerdown', function (ev) {
      var s = sim(), q = topPoint(ev);
      if (!s.tool) { say('stop', 'No tool.', 'Choose a tool first.'); return; }
      var grab = Math.max(s.tool.dia / 2, 4) + 3;
      if (Math.hypot(q.x - s.pos.x, q.y - s.pos.y) > grab) {
        say('info', '', 'To move the tool, drag it: press on the tool’s circle, then slide.');
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
      var h = s.heightAt(q.x, q.y), F = field(), fin = '';
      if (F && h !== -Infinity) fin = ' · finished Z ' + fmtSigned(I.nominalAt(state.job, q.x, q.y), 2);
      probe.textContent = 'X ' + fmtSigned(q.x, 1) + ' Y ' + fmtSigned(q.y, 1) +
        (h === -Infinity ? ' · off the block' : ' · metal Z ' + fmtSigned(h, 2) + (h <= ST.bottom + 1e-6 ? ', cut through' : '') + fin);
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
        if (!startDrag('z', { x: s.pos.x, y: s.pos.y, z: s.pos.z })) return;
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
    function wheelKeys(e) {
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
    }
    topCanvas.addEventListener('keydown', wheelKeys);
    isoCanvas.addEventListener('keydown', wheelKeys);
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
      if (!r.ok) say('stop', 'No change.', r.message);
      else say('info', r.same ? '' : 'Tool changed.', r.message + (r.same ? '' : ' ' + toolCanDo(s.tool)));
      state.kindShown = null;
      redrawMoving(); scheduleSections(true);
    }
    boreSet.addEventListener('click', function () {
      var v = M.parseNum(boreInput.value);
      if (!isFinite(v)) { say('stop', 'Not a number.', 'Type the boring diameter as a number of millimetres, such as 20.00.'); return; }
      var r = sim().setBoreDia(v);
      say(r.ok ? 'info' : 'stop', '', r.message); syncPanel(); drawTop(); scheduleSections(true);
    });
    boreInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); boreSet.click(); } });
    function goTo() {
      var s = sim(), t = {}, bad = [];
      ['x', 'y', 'z'].forEach(function (ax) {
        var raw = goIn[ax].value.trim();
        if (!state.edited[ax] || !raw) { t[ax] = s.pos[ax]; return; }
        var v = M.parseNum(raw);
        if (!isFinite(v)) bad.push(ax.toUpperCase()); else t[ax] = v;
      });
      if (bad.length) { say('stop', 'Not a number.', 'Check ' + bad.join(', ') + ': type millimetres, such as −6.5 or 81.'); return; }
      clearEdits();
      moveTo(t, 'Go to');
    }
    goBtn.addEventListener('click', goTo);
    ['x', 'y', 'z'].forEach(function (ax) {
      goIn[ax].addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goTo(); } });
      goIn[ax].addEventListener('blur', function () { if (!state.edited[ax]) syncInputs(); });
    });
    upBtn.addEventListener('click', function () { moveTo({ z: SETUP.clearZ }, 'Raise'); });
    stopBtn.addEventListener('click', stop);
    nextFill.addEventListener('click', function () {
      var f = nextFill.ms || {}, axes = [];
      clearEdits();
      syncInputs();
      ['x', 'y', 'z'].forEach(function (ax) {
        if (f[ax] == null) return;
        goIn[ax].value = fmt(f[ax], 2); state.edited[ax] = true; goIn[ax].classList.add('is-edited');
        axes.push(ax.toUpperCase() + ' ' + fmt(f[ax], 2));
      });
      say('info', 'Filled in.', axes.join(', ') + '. Press Move; the other axes stay at their current position.');
      moveBox.scrollIntoView({block:'nearest', inline:'nearest'});
      goBtn.focus({ preventScroll: true });
      keepWorkspaceVisible();
    });
    detailsBtn.addEventListener('click', function () {
      inspect.scrollIntoView({ block: 'start', behavior: reduce.matches ? 'auto' : 'smooth' });
      inspect.focus({ preventScroll: true });
    });
    function doUndo() {
      var s = sim();
      if (state.running || state.drag) stop();
      var e = s.undo();
      if (!e) return;
      clearEdits();
      say('info', 'Undone.', (e.kind === 'tool' ? 'The ' + e.label.toLowerCase() : 'The last move') + ' is taken back; the tool is at ' + where(s) + '. In the shop, metal that is cut stays cut.');
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
      clearEdits();
      say('info', 'A fresh block.', 'It is 1 mm over on top, back in the vise, with no tool loaded.');
      redrawAll(); scheduleInspect(true);
    });
    function toggleRegion(btn, region, opened) {
      region.hidden = !opened;
      btn.setAttribute('aria-expanded', String(opened));
    }
    drawingBtn.addEventListener('click', function () {
      var open = drawing.hidden;
      toggleRegion(drawingBtn, drawing, open);
      drawingBtn.textContent = open ? 'Hide the drawing' : 'Drawing';
    });
    moreBtn.addEventListener('click', function () {
      toggleRegion(moreBtn, more, more.hidden);
      drawTop(); scheduleSections(true); scheduleIso(true);
    });
    helpBtn.addEventListener('click', function () { toggleRegion(helpBtn, help, help.hidden); });
    targetBtn.addEventListener('click', function () { state.target = !state.target; syncSegs(); drawTop(); scheduleSections(true); scheduleIso(true); });
    function setLayout(l) {
      state.layout = l;
      flatBtn.setAttribute('aria-pressed', String(l === 'flat'));
      isoBtn.setAttribute('aria-pressed', String(l === 'iso'));
      vTop.hidden = vFront.hidden = l === 'iso';
      vIso.hidden = isoTurnRow.hidden = l !== 'iso';
      views.classList.toggle('is-iso', l === 'iso');
      viewHow.textContent = l === 'iso' ? 'turn it to see every side' : 'drag the tool';
      drawTop(); scheduleSections(true); scheduleIso(true);
    }
    flatBtn.addEventListener('click', function () { setLayout('flat'); });
    isoBtn.addEventListener('click', function () { setLayout('iso'); });
    turnL.addEventListener('click', function () { state.rot = (state.rot + 3) % 4; scheduleIso(true); });
    turnR.addEventListener('click', function () { state.rot = (state.rot + 1) % 4; scheduleIso(true); });
    hintBtn.addEventListener('click', function () {
      var h = state.job.hints;
      if (state.hint < h.length) {
        hintList.appendChild(el('li', {}, h[state.hint]));
        state.hint++;
      }
      hintBtn.disabled = state.hint >= h.length;
      hintBtn.textContent = state.hint >= h.length ? 'No more hints' : state.hint ? 'Another hint' : 'Hint';
    });

    function setJob(j) {
      if (state.running || state.drag) stop();
      state.job = j; state.hint = 0; state.report = null; state.kindShown = null;
      clearEdits();
      goal.innerHTML = '';
      add(goal, el('strong', {}, j.free ? j.title + '.' : 'Job ' + j.n + ': ' + j.title + '.'), document.createTextNode(' ' + j.brief));
      hintList.innerHTML = '';
      hintBtn.hidden = j.free; drawingBtn.hidden = j.free;
      hintBtn.disabled = false; hintBtn.textContent = 'Hint';
      if (j.free) { toggleRegion(drawingBtn, drawing, false); drawingBtn.textContent = 'Drawing'; }
      drawingBody.innerHTML = j.free ? '' : D.renderDrawing(j, { idPrefix: uid + '-drawing-' + j.id });
      resetImages();
      syncSegs();
      runInspect();
      redrawAll();
      var s = sim();
      if (s.removed) say('info', 'Back to ' + (j.free ? 'free practice' : 'job ' + j.n) + '.', 'The block is as you left it.');
      else if (s.tool) say('info', '', M.toolLabel(s.tool) + ' in the spindle at ' + where(s) + '.');
      else say('info', j.free ? 'Free practice.' : 'Ready.', 'A raw block 1 mm over on top is in the vise.' + (j.free ? '' : ' The finished part is drawn over it.'));
    }

    /* ---- theme, size, print ----------------------------------------------*/
    function rePalette() { P = readPalette(rootEl); redrawAll(); }
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
        var cv = document.createElement('canvas');
        drawIso(cv, 480);
        record.appendChild(el('img', { class: 'ms-record-img', alt: 'The part as it was cut, in isometric.', src: cv.toDataURL('image/png') }));
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
    boot: boot, parseColor: parseColor, mix: mix, cellColor: cellColor, readPalette: readPalette,
    isoTurn: isoTurn, isoProject: isoProject, isoTint: isoTint, describeMove: describeMove, nextStep: nextStep, progressLine: progressLine,
    targetField: targetField, cellState: cellState, excessAlpha: excessAlpha, clearance: clearance,
    KINDS: KINDS, WIN: WIN, STEPS: STEPS
  };
});

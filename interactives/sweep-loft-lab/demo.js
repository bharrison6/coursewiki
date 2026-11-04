/* Browser behaviour for every [data-interactive="sweep-loft-lab"] mount.
   data-sll-mode="sweep" | "loft" | "challenge". Each mount keeps its own state,
   ids and 3D view; the static lesson inside the mount is hidden once live. */
(function (root) {
  'use strict';
  var M = root.CourseWikiSweepLoftModel, R = root.CourseWikiSweepLoftRender, L = root.CourseWikiSweepLoftLessons, S = root.CourseWikiSweepLoft3D;
  if (!M || !R || !L) return;
  var seq = 0, fmt = M.fmt, esc = R.esc;
  var reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function radios(name, items, checked) {
    return items.map(function (it) {
      return '<label class="sll-choice"><input type="radio" name="' + name + '" value="' + it.id + '"' + (it.id === checked ? ' checked' : '') + '><span>' + esc(it.label) + '</span></label>';
    }).join('');
  }
  function range(id, key, label, lim, value, extra) {
    return '<div class="sll-range"><label for="' + id + '-' + key + '"><span data-sll-label="' + key + '">' + label + '</span> <output data-sll-out="' + key + '" for="' + id + '-' + key + '"></output></label>' +
      '<input id="' + id + '-' + key + '" type="range" data-sll="' + key + '" min="' + lim.min + '" max="' + lim.max + '" step="' + lim.step + '" value="' + value + '"' + (extra || '') + '></div>';
  }
  function viewBar(extra) {
    return '<div class="sll-viewbar" role="group" aria-label="View"><button type="button" data-sll-view="iso">3D view</button><button type="button" data-sll-view="top">Top</button><button type="button" data-sll-view="side">Side</button>' +
      '<button type="button" data-sll="section" aria-pressed="false">Half section</button>' + (extra || '') + '</div>';
  }
  function start3D(mount, host, kind, label) {
    if (!S) return null;
    try { return S.create(host, { kind: kind, label: label }); }
    catch (e) { return null; }
  }
  // One scene serves both exploration and prediction. Switch the controls below
  // it, without moving focus or scrolling the page. Full explanations stay in
  // normal-flow details, while a short diagnostic remains beside the action.
  function workbench(live) {
    var work = live.querySelector('.sll-work'), stage = live.querySelector('.sll-stage');
    var controls = live.querySelector('.sll-controls'), predict = live.querySelector('.sll-predict');
    var detail = h('<details class="sll-detail"><summary>Geometry details and full explanation</summary></details>');
    detail.appendChild(live.querySelector('[data-sll="status"]'));
    var summary = h('<p class="sll-brief" data-sll="brief" role="status" aria-live="polite"></p>');
    stage.appendChild(summary);
    var nav = h('<div class="sll-modes" role="group" aria-label="Lab controls"><button type="button" data-sll-panel="explore" aria-pressed="true">Explore</button><button type="button" data-sll-panel="predict" aria-pressed="false">Predict and check</button></div>');
    var exploreActions = controls.querySelector('.sll-actions'), predictActions = predict.querySelector('.sll-actions');
    var response = h('<div class="sll-response"></div>');
    response.appendChild(predict.querySelector('[data-sll="feedback"]')); response.appendChild(predict.querySelector('[data-sll="score"]'));
    var actionView = h('<div class="sll-action-view"></div>'), actionColumn = h('<div class="sll-action-column"></div>');
    actionColumn.appendChild(summary);
    actionColumn.appendChild(exploreActions); actionColumn.appendChild(predictActions);
    detail.appendChild(stage.querySelector('.sll-viewbar'));
    actionView.appendChild(stage); actionView.appendChild(actionColumn);
    work.prepend(nav); work.appendChild(predict);
    work.appendChild(actionView); work.appendChild(response);
    predict.hidden = true; predictActions.hidden = true; response.hidden = true;
    var hint = controls.querySelector('.sll-hint'); if (hint) detail.appendChild(hint);
    var loftOrder = controls.querySelector('[data-sll="order"]');
    if (loftOrder) {
      loftOrder = loftOrder.parentNode; work.insertBefore(loftOrder, controls);
      work.insertBefore(actionView, controls); controls.classList.add('sll-connectors');
    }
    ['.sll-readout', '.sll-figs', '.sll-fallback-fig'].forEach(function (s) { var n = live.querySelector(s); if (n) detail.appendChild(n); });
    work.after(detail);
    nav.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () {
      var testing = b.dataset.sllPanel === 'predict'; controls.hidden = testing; predict.hidden = !testing;
      exploreActions.hidden = testing; predictActions.hidden = !testing; response.hidden = !testing;
      if (loftOrder) { loftOrder.hidden = testing; work.insertBefore(actionView, testing ? response : controls); }
      nav.querySelectorAll('button').forEach(function (n) { n.setAttribute('aria-pressed', String(n === b)); });
    }); });
  }
  function finishMount(mount, live, scene, stage) {
    mount.classList.add('sll-ready');
    mount.dataset.sllReady = scene ? 'true' : 'fallback';
    if (!scene) {
      live.querySelectorAll('[data-sll-view],[data-sll="section"],[data-sll="pairs"]').forEach(function (b) { b.disabled = true; });
      stage.classList.add('sll-fallback');
    }
  }
  function predictionBlock(id, title, choices) {
    return '<section class="sll-predict" aria-labelledby="' + id + '-ph"><h3 id="' + id + '-ph">' + title + '</h3>' +
      '<p class="sll-round" data-sll="round"></p>' +
      '<fieldset class="sll-choices"><legend>Your prediction</legend>' + radios(id + '-pred', choices, '') + '</fieldset>' +
      '<div class="sll-actions"><button type="button" data-sll="test">Test my prediction</button><button type="button" data-sll="next">Next scenario</button></div>' +
      '<p class="sll-feedback" data-sll="feedback" aria-live="polite"></p><p class="sll-score" data-sll="score"></p></section>';
  }

  /* ================= sweep ================= */
  function initSweep(mount, id) {
    var p = M.defaults(), result = null, progress = 1, playing = false, raf = 0, lastT = 0, userPos = false;
    var round = 0, scored = {}, correct = 0;
    var live = h('<div class="sll-live">' +
      '<p class="sll-goal"><strong>Challenge:</strong> tighten the bend until the sweep fails. Before each change, predict whether the profile will reach the centre of curvature. The red regions are where it does.</p>' +
      '<div class="sll-work"><div class="sll-stage"><div class="sll-canvas" data-sll="scene"></div>' + viewBar() + '<p class="sll-status" data-sll="status" role="status" aria-live="polite"></p></div>' +
      '<div class="sll-controls">' +
      '<label class="sll-select">Path<select data-sll="path"><option value="arc">Arc</option><option value="s-curve">S-curve</option><option value="helix">Helix</option></select></label>' +
      '<label class="sll-select">Profile<select data-sll="shape"><option value="circle">Circle</option><option value="rectangle">Rectangle 2:1</option></select></label>' +
      '<label class="sll-check" data-sll-when="rectangle"><input type="checkbox" data-sll="turned"> Turn the rectangle 90° (short side across the bend)</label>' +
      range(id, 'size', 'Profile size', M.LIMITS.size, p.size) +
      range(id, 'bend', 'Arc bend radius', M.LIMITS.bend, p.bend) +
      '<div data-sll-when="helix">' + range(id, 'pitch', 'Helix pitch', M.LIMITS.pitch, p.pitch) + '</div>' +
      range(id, 'progress', 'Profile position along the path', { min: 0, max: 100, step: 1 }, 100) +
      '<div class="sll-actions"><button type="button" data-sll="play">' + (reduceMotion ? 'Step along path' : 'Play travel') + '</button><button type="button" data-sll="reset">Reset</button></div>' +
      '</div></div>' +
      '<div class="sll-readout" aria-live="off"><output data-sll="r-rho"></output><output data-sll="r-reach"></output><output data-sll="r-margin"></output><output data-sll="r-whole"></output></div>' +
      '<div class="sll-figs"><figure data-sll="chart"></figure><figure data-sll="plan"></figure></div>' +
      predictionBlock(id, 'Predict, then test', L.SWEEP_CHOICES) +
      '<p class="sll-limit">Teaching model: a centred profile carried along the path without avoidable twist. Red marks the local test, profile reach toward the centre of curvature ≥ local bend radius. It is not a complete validity check: the lab says “Builds” only on the U-bend, where clashes are ruled out by the geometry, and otherwise reports “Local test passes; global clearance not established”. The helix chord check can prove that neighbouring coils collide, never that they clear.</p>' +
      '</div>');
    mount.appendChild(live);
    workbench(live);
    function q(s) { return live.querySelector(s); }
    function el(k) { return live.querySelector('[data-sll="' + k + '"]'); }
    var stage = q('.sll-stage'), sceneHost = el('scene');
    var scene = start3D(mount, sceneHost, 'sweep', 'Swept solid with the profile at its current position');
    // narrow mounts get a narrower SVG coordinate width so figure text stays readable
    function figWidth() { return (live.clientWidth || 640) < 520 ? 360 : 480; }
    var lastFig = figWidth();
    if (root.ResizeObserver) new ResizeObserver(function () { var w = figWidth(); if (w !== lastFig && result) { lastFig = w; apply(p); } }).observe(live);

    function readControls() {
      var next = {
        path: el('path').value,
        shape: el('shape').value,
        size: Number(el('size').value), bend: Number(el('bend').value), pitch: Number(el('pitch').value),
        turned: el('turned').checked
      };
      return next;
    }
    function writeControls() {
      el('path').value = p.path; el('shape').value = p.shape;
      el('size').value = String(p.size); el('bend').value = String(p.bend); el('pitch').value = String(p.pitch); el('turned').checked = p.turned;
      el('progress').value = String(Math.round(progress * 100));
    }
    function labels() {
      var bendLabel = p.path === 'arc' ? 'Arc bend radius' : p.path === 's-curve' ? 'Tightest bend radius' : 'Coil radius';
      q('[data-sll-label="bend"]').textContent = bendLabel;
      q('[data-sll-label="size"]').textContent = p.shape === 'circle' ? 'Circle diameter' : 'Rectangle width (height is half)';
      q('[data-sll-out="size"]').textContent = fmt(p.size, 1) + ' mm';
      q('[data-sll-out="bend"]').textContent = fmt(p.bend, 1) + ' mm';
      q('[data-sll-out="pitch"]').textContent = fmt(p.pitch, 0) + ' mm';
      q('[data-sll-out="progress"]').textContent = Math.round(progress * 100) + '%';
      live.querySelectorAll('[data-sll-when]').forEach(function (n) { n.hidden = n.getAttribute('data-sll-when') !== p.shape && n.getAttribute('data-sll-when') !== p.path; });
    }
    function sampleAt() { return result.samples[Math.max(1, Math.round(progress * (result.samples.length - 1)))]; }
    function readouts() {
      var s = sampleAt(), v = R.sweepVerdict(result);
      el('r-rho').innerHTML = '<strong>' + (Number.isFinite(s.rho) ? fmt(s.rho, 2) + ' mm' : 'straight') + '</strong><span>Bend radius here</span>';
      el('r-reach').innerHTML = '<strong>' + (s.centre ? fmt(s.reach, 2) + ' mm' : '–') + '</strong><span>Profile reach toward the centre here</span>';
      var st = s.state === 'clear' ? (Number.isFinite(s.margin) ? fmt(s.margin, 2) + ' mm to spare' : 'no bend here') : s.state === 'degenerate' ? 'touches the centre' : 'folds by ' + fmt(-s.margin, 2) + ' mm';
      var mo = el('r-margin'); mo.innerHTML = '<strong>' + st + '</strong><span>Local test here</span>'; mo.classList.toggle('is-bad', s.flagged);
      var wo = el('r-whole');
      var whole = { 'fails-local': ['Fails over ' + fmt(result.summary.flaggedFraction * 100, 0) + '%', 'Local test, whole path'], 'fails-clash': ['Coils collide', 'Chord between neighbouring turns'],
        builds: ['Builds', 'No fold; U-bend rules out clashes'], 'local-pass': ['Local test passes', 'Global clearance not established'] }[result.overall];
      wo.innerHTML = '<strong>' + esc(whole[0]) + '</strong><span>' + esc(whole[1]) + '</span>';
      wo.classList.toggle('is-bad', !!v.fails); wo.classList.toggle('is-unknown', result.overall === 'local-pass');
      el('brief').textContent = v.title + '. Here: ' + st + (Number.isFinite(s.rho) ? '; bend ' + fmt(s.rho, 1) + ' mm, reach ' + fmt(s.reach, 1) + ' mm.' : '.');
      el('chart').innerHTML = R.marginChart(result, { progress: progress, width: figWidth() }) + '<figcaption>The cursor marks the profile position. Red bands fail the local test.</figcaption>';
    }
    function status() {
      var v = R.sweepVerdict(result);
      var st = el('status'); st.innerHTML = '<strong>' + esc(v.title) + '.</strong> ' + esc(v.text) + (v.coil ? ' ' + esc(v.coil.text) : '') + (v.roll ? ' <span class="sll-note">' + esc(v.roll) + '</span>' : '');
      st.classList.toggle('is-bad', !!v.fails); st.classList.toggle('is-unknown', result.overall === 'local-pass');
      mount.dataset.sllState = { 'fails-local': v.state, 'fails-clash': 'coil', builds: 'clear', 'local-pass': 'local-pass' }[result.overall];
    }
    function draw() {
      if (scene) scene.showSweep(result, progress);
      else sceneHost.innerHTML = R.sweepIso(result, { progress: progress });
    }
    /* until the learner moves the profile, park it at the tightest point (middle of any tie) */
    function parkAt(r) {
      var best = Infinity, idx = [];
      r.samples.forEach(function (q, i) {
        if (!q.centre) return;
        if (q.margin < best - 1e-9) { best = q.margin; idx = [i]; } else if (Math.abs(q.margin - best) <= 1e-9) idx.push(i);
      });
      return idx.length ? idx[Math.floor(idx.length / 2)] / (r.samples.length - 1) : 1;
    }
    function apply(next, message) {
      var r = M.sweep(next);
      if (!r.ok) { writeControls(); el('feedback').textContent = r.error; return false; }
      p = r.params; result = r;
      if (!userPos) progress = parkAt(r);
      labels(); writeControls(); status(); readouts(); draw();
      el('plan').hidden = p.path === 'helix';
      if (p.path !== 'helix') el('plan').innerHTML = R.sweepPlan(result, { width: figWidth(), height: figWidth() < 480 ? 300 : 330 }) + '<figcaption>Plan of the bend: the inner edge turns red where it reaches or passes the centre of curvature (+).</figcaption>';
      if (message) el('feedback').textContent = message;
      return true;
    }
    function setProgress(v) {
      progress = Math.min(Math.max(v, 0), 1);
      el('progress').value = String(Math.round(progress * 100));
      q('[data-sll-out="progress"]').textContent = Math.round(progress * 100) + '%';
      if (scene) scene.setProgress(progress); else sceneHost.innerHTML = R.sweepIso(result, { progress: progress });
      readouts();
    }
    function stop() { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; el('play').textContent = reduceMotion ? 'Step along path' : 'Play travel'; el('play').setAttribute('aria-pressed', 'false'); }
    function tick(t) {
      if (!playing) return;
      if (!lastT) lastT = t;
      var next = progress + (t - lastT) / 5000; lastT = t;
      if (next >= 1) { setProgress(1); stop(); return; }
      setProgress(next); raf = requestAnimationFrame(tick);
    }
    el('play').addEventListener('click', function () {
      userPos = true;
      if (reduceMotion) { setProgress(progress >= 1 ? 0 : Math.min(1, Math.floor(progress * 10 + 1e-9) / 10 + 0.1)); return; }
      if (playing) { stop(); return; }
      if (progress >= 1) setProgress(0);
      playing = true; lastT = 0; this.textContent = 'Pause travel'; this.setAttribute('aria-pressed', 'true'); raf = requestAnimationFrame(tick);
    });
    live.querySelectorAll('[data-sll="path"], [data-sll="shape"], [data-sll="turned"], [data-sll="size"], [data-sll="bend"], [data-sll="pitch"]').forEach(function (n) {
      if (n.name === id + '-pred') return;
      n.addEventListener(n.type === 'range' ? 'input' : 'change', function () { stop(); el('feedback').textContent = ''; apply(readControls()); });
    });
    el('progress').addEventListener('input', function () { stop(); userPos = true; setProgress(Number(this.value) / 100); });
    el('reset').addEventListener('click', function () { stop(); userPos = false; if (scene) scene.view('iso'); apply(M.defaults(), 'Reset to a Ø16 mm rod on a 20 mm arc.'); });
    live.querySelectorAll('[data-sll-view]').forEach(function (b) { b.addEventListener('click', function () { if (scene) scene.view(this.getAttribute('data-sll-view')); }); });
    el('section').addEventListener('click', function () { var on = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', String(on)); if (scene) scene.setSection(on); });
    // predictions
    function showRound() {
      var rd = L.SWEEP_ROUNDS[round];
      el('round').innerHTML = '<strong>Scenario ' + (round + 1) + ' of ' + L.SWEEP_ROUNDS.length + ':</strong> ' + esc(rd.text);
      live.querySelectorAll('input[name="' + id + '-pred"]').forEach(function (n) { n.checked = false; });
      el('next').disabled = true;
    }
    function score() { el('score').textContent = Object.keys(scored).length ? 'Predictions matched: ' + correct + ' of ' + Object.keys(scored).length + ' tested.' : ''; }
    el('test').addEventListener('click', function () {
      var pick = q('input[name="' + id + '-pred"]:checked');
      if (!pick) { el('feedback').textContent = 'Choose a prediction first, then test it.'; return; }
      var rd = L.SWEEP_ROUNDS[round], g = L.gradeSweep(rd, pick.value);
      stop(); userPos = false; apply(rd.params);
      el('brief').textContent = (g.ungraded ? 'Not graded. ' : g.correct ? 'Prediction matches. ' : 'Not this time. ') + el('brief').textContent;
      if (g.ungraded) { el('feedback').textContent = g.text; el('feedback').classList.remove('is-bad'); el('next').disabled = false; return; }
      if (!(rd.id in scored)) { scored[rd.id] = g.correct; if (g.correct) correct++; }
      el('feedback').innerHTML = '<strong>' + (g.correct ? 'Your prediction matches.' : 'Not this time.') + '</strong> ' + esc(g.text);
      el('feedback').classList.toggle('is-bad', !g.correct);
      el('next').disabled = false; score();
    });
    el('next').addEventListener('click', function () { round = (round + 1) % L.SWEEP_ROUNDS.length; el('feedback').textContent = ''; showRound(); });
    showRound(); score();
    apply(p);
    finishMount(mount, live, scene, stage);
    mount.sllDispose = function () { stop(); if (scene) scene.dispose(); live.remove(); mount.classList.remove('sll-ready'); delete mount.dataset.sllReady; };
  }

  /* ================= loft ================= */
  var ORDERS = [
    ['square', 'circle', 'slot'], ['square', 'slot', 'circle'], ['circle', 'square', 'slot'],
    ['circle', 'slot', 'square'], ['slot', 'square', 'circle'], ['slot', 'circle', 'square']
  ];
  function orderLabel(o) {
    var names = { square: 'Square', circle: 'Circle', slot: 'Slot' }, s = o.map(function (k) { return names[k]; }).join(' → ');
    if (o.join() === 'square,circle,slot') s += ' (bottom to top)';
    if (o.join() === 'slot,circle,square') s += ' (top to bottom)';
    return s;
  }
  function initLoft(mount, id) {
    var p = M.loftDefaults(), result = null, pairs = true, round = 0, scored = {}, correct = 0;
    var startLim = { min: 0, max: 315, step: 45 };
    var live = h('<div class="sll-live">' +
      '<p class="sll-goal"><strong>Challenge:</strong> the duct below runs from a square, through a circle, to a slot with straight sides. Break it on purpose: move a start point (connector) or change the selection order. Predict what happens first.</p>' +
      '<div class="sll-work"><div class="sll-stage"><div class="sll-canvas" data-sll="scene"></div>' + viewBar('<button type="button" data-sll="pairs" aria-pressed="true">Connector lines</button>') + '<p class="sll-status" data-sll="status" role="status" aria-live="polite"></p></div>' +
      '<div class="sll-controls">' +
      '<label class="sll-select" for="' + id + '-order">Selection order<select id="' + id + '-order" data-sll="order">' + ORDERS.map(function (o) { return '<option value="' + o.join(',') + '">' + orderLabel(o) + '</option>'; }).join('') + '</select></label>' +
      range(id, 'square', 'Square start point', startLim, 0) + range(id, 'circle', 'Circle start point', startLim, 0) + range(id, 'slot', 'Slot start point', startLim, 0) +
      '<p class="sll-hint">Each profile has 64 points counted from its start point (the dot). The thick coloured connector joins the three start points; thin lines join other matching points.</p>' +
      '<div class="sll-actions"><button type="button" data-sll="reset">Reset</button></div>' +
      '</div></div>' +
      '<div class="sll-readout"><output data-sll="r-t1"></output><output data-sll="r-t2"></output><output data-sll="r-area"></output><output data-sll="r-whole"></output></div>' +
      '<figure class="sll-fallback-fig" data-sll="fig" hidden></figure>' +
      predictionBlock(id, 'Predict, then test', L.LOFT_CHOICES) +
      '<p class="sll-limit">Teaching model: every profile runs counter-clockwise and is resampled by length from its start point. A smooth curve joins matching points through the profiles in the selected order. Red sections cross themselves, collapse, or sit where the loft doubles back. Sections are checked at fixed intervals, so “no crossing found” is not a full validity proof.</p>' +
      '</div>');
    mount.appendChild(live);
    workbench(live);
    function q(s) { return live.querySelector(s); }
    function el(k) { return live.querySelector('[data-sll="' + k + '"]'); }
    var stage = q('.sll-stage'), sceneHost = el('scene');
    var scene = start3D(mount, sceneHost, 'loft', 'Loft through a square, a circle and a slot with connector lines');
    function write() {
      el('order').value = p.order.join(',');
      ['square', 'circle', 'slot'].forEach(function (k) { el(k).value = String(p.starts[k]); q('[data-sll-out="' + k + '"]').textContent = p.starts[k] + '°'; });
    }
    function names(k) { return { square: 'square', circle: 'circle', slot: 'slot' }[k]; }
    function apply(next, message) {
      var r = M.loft(next);
      if (!r.ok) { write(); el('feedback').textContent = r.error; return false; }
      p = r.params; result = r; write();
      var v = R.loftVerdict(r), s = r.summary, o = r.params.order;
      el('r-t1').innerHTML = '<strong>' + fmt(Math.abs(s.twists[0]), 0) + '°</strong><span>Twist, ' + names(o[0]) + ' → ' + names(o[1]) + '</span>';
      el('r-t2').innerHTML = '<strong>' + fmt(Math.abs(s.twists[1]), 0) + '°</strong><span>Twist, ' + names(o[1]) + ' → ' + names(o[2]) + '</span>';
      el('r-area').innerHTML = '<strong>' + (s.minAreaRatio <= 0 ? 'crosses / zero' : fmt(s.minAreaRatio * 100, 0) + '%') + '</strong><span>Narrowest section vs smallest profile</span>';
      el('r-area').classList.toggle('is-bad', s.state === 'pinched');
      var wo = el('r-whole'); wo.innerHTML = '<strong>' + esc(v.title.replace(/:.*$/, '')) + '</strong><span>' + esc(s.state === 'matched' ? 'connectors matched' : s.state) + '</span>';
      wo.classList.toggle('is-bad', s.state === 'pinched' || s.state === 'folded');
      var st = el('status'); st.innerHTML = '<strong>' + esc(v.title) + '.</strong> ' + esc(v.text); st.classList.toggle('is-bad', s.state === 'pinched' || s.state === 'folded');
      mount.dataset.sllState = s.state;
      el('brief').textContent = v.title + '. Twist ' + fmt(Math.abs(s.twists[0]), 0) + '° then ' + fmt(Math.abs(s.twists[1]), 0) + '°; ' + s.checkedSections + ' sections checked.';
      if (scene) scene.showLoft(r, pairs); else sceneHost.innerHTML = R.loftIso(r, { title: '' });
      if (message) el('feedback').textContent = message;
      return true;
    }
    function read() {
      return { order: el('order').value.split(','), starts: { square: Number(el('square').value), circle: Number(el('circle').value), slot: Number(el('slot').value) } };
    }
    el('order').addEventListener('change', function () { el('feedback').textContent = ''; apply(read()); });
    ['square', 'circle', 'slot'].forEach(function (k) { el(k).addEventListener('input', function () { el('feedback').textContent = ''; apply(read()); }); });
    el('reset').addEventListener('click', function () { if (scene) scene.view('iso'); apply(M.loftDefaults(), 'Reset: matched start points, profiles selected bottom to top.'); });
    live.querySelectorAll('[data-sll-view]').forEach(function (b) { b.addEventListener('click', function () { if (scene) scene.view(this.getAttribute('data-sll-view')); }); });
    el('section').addEventListener('click', function () { var on = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', String(on)); if (scene) scene.setSection(on); });
    el('pairs').addEventListener('click', function () { pairs = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', String(pairs)); if (scene) scene.showLoft(result, pairs); });
    function showRound() {
      var rd = L.LOFT_ROUNDS[round];
      el('round').innerHTML = '<strong>Scenario ' + (round + 1) + ' of ' + L.LOFT_ROUNDS.length + ':</strong> ' + esc(rd.text);
      live.querySelectorAll('input[name="' + id + '-pred"]').forEach(function (n) { n.checked = false; });
      el('next').disabled = true;
    }
    function score() { el('score').textContent = Object.keys(scored).length ? 'Predictions matched: ' + correct + ' of ' + Object.keys(scored).length + ' tested.' : ''; }
    el('test').addEventListener('click', function () {
      var pick = q('input[name="' + id + '-pred"]:checked');
      if (!pick) { el('feedback').textContent = 'Choose a prediction first, then test it.'; return; }
      var rd = L.LOFT_ROUNDS[round], g = L.gradeLoft(rd, pick.value);
      apply(rd.params);
      el('brief').textContent = (g.correct ? 'Prediction matches. ' : 'Not this time. ') + el('brief').textContent;
      if (!(rd.id in scored)) { scored[rd.id] = g.correct; if (g.correct) correct++; }
      el('feedback').innerHTML = '<strong>' + (g.correct ? 'Your prediction matches.' : 'Not this time.') + '</strong> ' + esc(g.text);
      el('feedback').classList.toggle('is-bad', !g.correct);
      el('next').disabled = false; score();
    });
    el('next').addEventListener('click', function () { round = (round + 1) % L.LOFT_ROUNDS.length; el('feedback').textContent = ''; showRound(); });
    showRound(); score();
    apply(p);
    finishMount(mount, live, scene, stage);
    mount.sllDispose = function () { if (scene) scene.dispose(); live.remove(); mount.classList.remove('sll-ready'); delete mount.dataset.sllReady; };
  }

  /* ================= challenges ================= */
  function initChallenge(mount, id) {
    var idx = 0, results = {};
    var live = h('<div class="sll-live sll-challenge">' +
      '<p class="sll-goal"><strong>Match the target.</strong> Each attempt below fails or misses its target. Decide which feature states the shape, then pick the one input that fixes it.</p>' +
      '<div class="sll-ch-head"><h3 data-sll="ch-title"></h3><p data-sll="ch-count"></p></div>' +
      '<p data-sll="ch-target"></p>' +
      '<div class="sll-ch-figs"><figure data-sll="ch-current"></figure><figure data-sll="ch-after"></figure></div>' +
      '<fieldset class="sll-choices"><legend>1. Which feature states this shape?</legend><div data-sll="ch-features"></div></fieldset>' +
      '<p class="sll-feedback" data-sll="ch-ffb" aria-live="polite"></p>' +
      '<fieldset class="sll-choices"><legend>2. Which change makes the attempt match the target?</legend><div data-sll="ch-fixes"></div></fieldset>' +
      '<div class="sll-actions"><button type="button" data-sll="ch-check">Check feature</button><button type="button" data-sll="ch-apply">Apply change</button></div>' +
      '<p class="sll-feedback" data-sll="ch-xfb" aria-live="polite"></p>' +
      '<div class="sll-actions"><button type="button" data-sll="ch-prev">Previous target</button><button type="button" data-sll="ch-next">Next target</button></div>' +
      '<p class="sll-score" data-sll="ch-score"></p></div>');
    mount.appendChild(live);
    function el(k) { return live.querySelector('[data-sll="' + k + '"]'); }
    function q(s) { return live.querySelector(s); }
    // Each answer appears next to its own action, rather than above the choices.
    var featureField = el('ch-features').parentNode, changeField = el('ch-fixes').parentNode;
    var featureAction = h('<div class="sll-actions"></div>'); featureAction.appendChild(el('ch-check'));
    featureField.after(featureAction); featureAction.after(el('ch-ffb'));
    el('ch-xfb').after(el('ch-after')); q('.sll-ch-figs').style.gridTemplateColumns = '1fr';
    function score() {
      var done = Object.keys(results).filter(function (k) { return results[k].fix !== undefined; });
      var ok = done.filter(function (k) { return results[k].fix; }).length;
      el('ch-score').textContent = done.length ? 'Targets matched on the first try: ' + ok + ' of ' + done.length + ' attempted.' : '';
    }
    function show() {
      var c = L.CHALLENGES[idx], cur = L.run(c.current), v = L.verdict(c.current, cur);
      el('ch-title').textContent = c.title;
      el('ch-count').textContent = 'Target ' + (idx + 1) + ' of ' + L.CHALLENGES.length;
      el('ch-target').innerHTML = '<strong>Target:</strong> ' + esc(c.target) + ' <strong>Current attempt:</strong> ' + esc(v.title.toLowerCase()) + '.';
      el('ch-current').innerHTML = L.figure(c.current, cur, 'CURRENT ATTEMPT') + '<figcaption>' + esc(v.text) + '</figcaption>';
      el('ch-after').innerHTML = '<div class="sll-ch-placeholder">Your change will appear here.</div>';
      el('ch-features').innerHTML = radios(id + '-feat-' + idx, L.FEATURES, '');
      el('ch-fixes').innerHTML = radios(id + '-fix-' + idx, c.fixes.map(function (f) { return { id: f.id, label: f.text }; }), '');
      el('ch-ffb').textContent = ''; el('ch-xfb').textContent = '';
      el('ch-prev').disabled = idx === 0; el('ch-next').disabled = idx === L.CHALLENGES.length - 1;
      mount.dataset.sllChallenge = c.id;
    }
    el('ch-check').addEventListener('click', function () {
      var c = L.CHALLENGES[idx], pick = q('input[name="' + id + '-feat-' + idx + '"]:checked'), fb = el('ch-ffb');
      if (!pick) { fb.textContent = 'Choose a feature first.'; return; }
      var ok = pick.value === c.feature;
      fb.innerHTML = '<strong>' + (ok ? 'Yes.' : 'Not the best fit.') + '</strong> ' + esc(c.featureWhy[pick.value]) + (ok ? '' : ' ' + esc(c.featureWhy[c.feature]));
      fb.classList.toggle('is-bad', !ok);
    });
    el('ch-apply').addEventListener('click', function () {
      var c = L.CHALLENGES[idx], pick = q('input[name="' + id + '-fix-' + idx + '"]:checked'), fb = el('ch-xfb');
      if (!pick) { fb.textContent = 'Choose a change first.'; return; }
      var fix = c.fixes.filter(function (f) { return f.id === pick.value; })[0];
      if (!(c.id in results) || results[c.id].fix === undefined) { results[c.id] = results[c.id] || {}; results[c.id].fix = !!fix.matches; }
      if (fix.params) {
        var spec = { kind: c.current.kind, params: fix.params }, r = L.run(spec), v = L.verdict(spec, r);
        el('ch-after').innerHTML = L.figure(spec, r, 'AFTER YOUR CHANGE') + '<figcaption>' + esc(v.title) + '.</figcaption>';
      } else el('ch-after').innerHTML = '<div class="sll-ch-placeholder">This change does not apply to this feature.</div>';
      fb.innerHTML = '<strong>' + (fix.matches ? 'That matches the target.' : 'Not the target yet.') + '</strong> ' + esc(fix.matches ? L.verdict({ kind: c.goal.kind }, L.run(c.goal)).text : fix.why);
      fb.classList.toggle('is-bad', !fix.matches);
      score();
    });
    el('ch-prev').addEventListener('click', function () { if (idx > 0) { idx--; show(); } });
    el('ch-next').addEventListener('click', function () { if (idx < L.CHALLENGES.length - 1) { idx++; show(); } });
    show(); score();
    mount.classList.add('sll-ready'); mount.dataset.sllReady = 'true';
    mount.sllDispose = function () { live.remove(); mount.classList.remove('sll-ready'); delete mount.dataset.sllReady; };
  }

  function init() {
    document.querySelectorAll('[data-interactive="sweep-loft-lab"]').forEach(function (mount) {
      if (mount.dataset.sllReady) return;
      var mode = mount.getAttribute('data-sll-mode') || 'sweep', id = 'sll-' + (++seq);
      if (mode === 'loft') initLoft(mount, id);
      else if (mode === 'challenge') initChallenge(mount, id);
      else initSweep(mount, id);
    });
  }
  root.CourseWikiSweepLoftLab = { init: init };
  init();
})(typeof globalThis !== 'undefined' ? globalThis : this);

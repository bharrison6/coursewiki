(function () {
  'use strict';
  const M = globalThis.CourseWikiTensileTest, R = globalThis.CourseWikiTensileTestRender;
  if (!M || !R) return;
  const reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  const pct = R.pct, mpa = R.mpa;
  const PROPS = ['stiffness', 'strength', 'ductility', 'toughness'];

  document.querySelectorAll('[data-interactive="tensile-test"]').forEach(function (root) {
    if (root.dataset.ttReady) return;
    root.dataset.ttReady = 'true';
    M._instances = (M._instances || 0) + 1;
    const uid = 'tt' + M._instances;
    const lab = document.createElement('div');
    lab.className = 'tt-lab';
    const options = M.CURVES.map(c => '<option value="' + c.id + '">' + c.letter + ': ' + R.esc(c.label) + '</option>').join('');
    lab.innerHTML =
      '<div class="tt-challenge"><strong>Challenge: pull the specimen past yield, stop, and predict how much permanent stretch is left when you unload.</strong>Drag the specimen sideways or use the crosshead slider; the stress–strain curve draws as you pull.</div>' +
      '<div class="tt-toolbar"><label>Specimen (synthetic curve)<select data-tt-curve>' + options + '</select></label>' +
      '<button type="button" class="tt-primary" data-tt-run>Run test</button><button type="button" data-tt-reset>Reset</button></div>' +
      '<div class="tt-stage" data-tt-stage></div><p class="tt-speccap" data-tt-speccap></p>' +
      '<label class="tt-crosshead-control">Crosshead position<input type="range" min="0" max="1000" step="1" value="0" data-tt-slider></label>' +
      '<p class="tt-hint">Moving back unloads the specimen. The slider spacing is stretched near zero so the tiny elastic region is easy to reach.</p>' +
      '<div class="tt-plots" data-tt-plots></div>' +
      '<p class="tt-pointer" data-tt-pointer>Point at a plot to read the curve.</p>' +
      '<ul class="tt-readouts" aria-label="Live readings">' +
      '<li><span>Force F</span><strong data-r="force"></strong></li><li><span>Extension ΔL</span><strong data-r="extension"></strong></li>' +
      '<li><span>Stress σ = F/A₀</span><strong data-r="stress"></strong></li><li><span>Strain ε = ΔL/L₀</span><strong data-r="strain"></strong></li>' +
      '<li><span>Area under curve so far</span><strong data-r="area"></strong></li><li><span>Stage</span><strong data-r="stage"></strong></li></ul>' +
      '<p class="tt-status" data-tt-status role="status" aria-live="polite" aria-atomic="true"></p>' +
      '<div class="tt-actions"><button type="button" class="tt-primary" data-tt-predict>Stop and predict the permanent set</button></div>' +
      '<div class="tt-predict" data-tt-predictbox hidden><p data-tt-context></p>' +
      '<div class="tt-uv" data-tt-uv></div>' +
      '<p class="tt-feedback" data-tt-feedback role="status" aria-live="polite">Your result appears here after unloading.</p>' +
      '<div class="tt-answer"><label>Permanent strain left at zero load (%)<input type="number" min="0" step="any" inputmode="decimal" data-tt-guess></label>' +
      '<button type="button" class="tt-primary" data-tt-check>Unload to check</button></div>' +
      '<div class="tt-actions"><button type="button" data-tt-cancel>Keep pulling instead</button></div>' +
      '<p class="tt-hint" data-tt-score></p>' +
      '<details><summary>Hint</summary><p>When the load is removed, the specimen springs back along a straight line parallel to the elastic slope. The spring-back is σ/E; whatever strain remains is permanent.</p></details></div>' +
      '<ul class="tt-found" aria-label="Properties read from this test" data-tt-found></ul>' +
      '<h3 class="tt-section-title">Compare the four synthetic specimens</h3>' +
      '<fieldset class="tt-compare-toggles"><legend>Curves shown</legend>' + M.CURVES.map(c => '<label><input type="checkbox" checked value="' + c.id + '" data-tt-show> ' + c.letter + '</label>').join('') + '</fieldset>' +
      '<div class="tt-plots tt-compare" data-tt-compare></div><div data-tt-legend></div>' +
      '<p><strong>Predict, then check.</strong> From the curves alone, which specimen has the…</p>' +
      '<div class="tt-quiz">' + PROPS.map(k => '<label>' + R.PROPERTY_TEXT[k].q + '?<select data-tt-quiz="' + k + '"><option value="">Choose…</option>' + M.CURVES.map(c => '<option value="' + c.id + '">' + c.letter + ': ' + R.esc(c.label) + '</option>').join('') + '</select></label>').join('') + '</div>' +
      '<div class="tt-actions"><button type="button" class="tt-primary" data-tt-quizcheck>Check my picks</button></div>' +
      '<ul class="tt-quiz-result" data-tt-quizresult aria-live="polite"></ul>' +
      '<div data-tt-ranks hidden><div class="tt-ranks">' + PROPS.map(R.rankingBars).join('') + '</div>' + R.propertyTable() +
      '<p>Specimen C fractures before the 0.2% offset line reaches its curve, so its offset yield strength is undefined in this test, not zero.</p></div>' +
      R.limits();
    root.append(lab);
    root.classList.add('tt-ready');
    lab.addEventListener('keydown', function (event) { if (event.target.closest('input, select, button, summary')) event.stopPropagation(); });

    const q = s => lab.querySelector(s);
    const els = {
      curve: q('[data-tt-curve]'), run: q('[data-tt-run]'), reset: q('[data-tt-reset]'), stage: q('[data-tt-stage]'), slider: q('[data-tt-slider]'),
      status: q('[data-tt-status]'), plots: q('[data-tt-plots]'), pointer: q('[data-tt-pointer]'), predict: q('[data-tt-predict]'),
      box: q('[data-tt-predictbox]'), uv: q('[data-tt-uv]'), context: q('[data-tt-context]'), guess: q('[data-tt-guess]'), check: q('[data-tt-check]'), cancel: q('[data-tt-cancel]'),
      feedback: q('[data-tt-feedback]'), score: q('[data-tt-score]'), found: q('[data-tt-found]'), compare: q('[data-tt-compare]'), legend: q('[data-tt-legend]')
    };
    let checked = false, state = M.createTest('ductile'), running = false, frame = 0, last = 0, anim = null, prediction = null, tally = { tried: 0, matched: 0 }, statusNote = '';
    const curve = () => M.curveById(state.id);

    function landmarks() {
      const c = curve(), y = M.offsetYield(c), p = M.peak(c), list = [];
      if (y) list.push({ e: y.strain, text: 'Paused at the 0.2% offset yield: ' + mpa(y.stress) + ' MPa. Beyond here, part of the stretch is permanent.' });
      else list.push({ e: c.linear, text: 'Paused at the end of the straight elastic line. Will an offset yield appear before fracture?' });
      if (p.strain < c.fractureStrain) list.push({ e: p.strain, text: 'Paused at the peak: UTS = ' + mpa(p.stress) + ' MPa. From here a neck forms and the engineering stress falls.' });
      list.push({ e: c.fractureStrain, text: '' });
      return list;
    }
    function foundList(r) {
      const c = curve(), props = M.properties(c), items = [];
      items.push([state.eMax > 0, 'Stiffness E', R.gpa(c.E) + ' GPa', 'start pulling']);
      if (props.yield !== null) items.push([r.pastYield, '0.2% offset yield', mpa(props.yield) + ' MPa', 'not reached yet']);
      else items.push([state.fractured, '0.2% offset yield', 'None: fractured before the offset line met the curve (undefined, not zero)', 'not reached yet']);
      items.push([r.pastPeak, 'Ultimate tensile strength', mpa(props.uts) + ' MPa at ' + pct(props.utsStrain, props.utsStrain < 0.01 ? 2 : 1) + '%' + (props.necks ? '' : ', at fracture'), 'peak not passed']);
      items.push([state.fractured, 'Elongation after fracture', pct(props.elongation, props.elongation < 0.01 ? 2 : 1) + '%', 'needs fracture']);
      items.push([state.fractured, 'Area to fracture (toughness)', props.toughness.toFixed(props.toughness < 1 ? 2 : 0) + ' MJ/m³', 'needs fracture']);
      return items.map(i => '<li class="' + (i[0] ? 'is-found' : '') + '"><strong>' + i[1] + '</strong>' + (i[0] ? R.esc(i[2]) : i[3]) + '</li>').join('');
    }
    function render() {
      const c = curve(), r = M.reading(state);
      els.stage.innerHTML = R.specimen(state);
      q('[data-tt-speccap]').textContent = R.specimenCaption(state);
      const p = R.testPlots(state, { prefix: uid, prediction: prediction });
      els.plots.innerHTML = p.full + p.zoom;
      const set = (k, v) => { lab.querySelector('[data-r="' + k + '"]').textContent = v; };
      set('force', r.force.toFixed(r.force < 10 ? 2 : 1) + ' kN');
      set('extension', r.extension.toFixed(r.extension < 1 ? 3 : 2) + ' mm');
      set('stress', mpa(r.stress) + ' MPa');
      set('strain', pct(r.strain, r.strain < 0.01 ? 3 : 2) + '%');
      set('area', r.workDensity.toFixed(r.workDensity < 1 ? 3 : 1) + ' MJ/m³');
      set('stage', R.stageText(state));
      els.status.textContent = statusNote || R.statusText(state);
      if (!els.box.hidden) els.uv.innerHTML = R.unloadView(state, { prefix: uid, prediction: checked ? prediction : null });
      els.slider.value = String(Math.round(M.sliderAt(c, state.e) * 1000));
      els.slider.disabled = state.fractured;
      els.slider.setAttribute('aria-valuetext', 'Strain ' + pct(r.strain, 3) + ' percent, stress ' + mpa(r.stress) + ' megapascals' + (state.fractured ? ', fractured' : ''));
      els.predict.disabled = state.fractured || state.eMax <= 0 || state.e < state.eMax || !!anim;
      els.run.disabled = state.fractured || !!anim;
      els.run.textContent = running ? 'Pause' : reduced.matches ? 'Step to next event' : state.eMax > 0 ? 'Continue test' : 'Run test';
      els.found.innerHTML = foundList(r);
      root.dataset.ttStage = r.stage;
    }
    function move(target) {
      const before = state.eMax;
      state = M.moveTo(state, target);
      if (state.eMax > before) prediction = null;
      closePredict(); // any crosshead move by the learner ends the current prediction
      render();
    }
    function stop() { running = false; if (frame) cancelAnimationFrame(frame); frame = 0; }
    function tick(time) {
      frame = 0;
      if (!running) return;
      const c = curve(), dt = Math.min(64, time - (last || time)); last = time;
      const u = M.sliderAt(c, state.e) + dt / 14000;
      let target = M.strainAt(c, u);
      const mark = landmarks().find(l => l.e > state.eMax + 1e-12 && l.e <= target);
      if (mark) { target = mark.e; stop(); statusNote = mark.text; move(target); statusNote = ''; if (mark.text) els.status.textContent = mark.text; return; }
      move(target);
      if (state.fractured) { stop(); render(); return; }
      frame = requestAnimationFrame(tick);
    }
    function run() {
      if (running) { stop(); render(); return; }
      if (state.fractured) return;
      closePredict();
      if (reduced.matches) {
        const mark = landmarks().find(l => l.e > state.eMax + 1e-12) || { e: curve().fractureStrain, text: '' };
        move(mark.e); if (mark.text) els.status.textContent = mark.text; return;
      }
      running = true; last = 0; render();
      frame = requestAnimationFrame(tick);
    }
    function closePredict() { els.box.hidden = true; checked = false; els.uv.innerHTML = ''; }
    function resetAll(id) {
      stop(); if (anim) { cancelAnimationFrame(anim); anim = null; }
      state = M.createTest(id || state.id); prediction = null; closePredict();
      els.pointer.textContent = 'Point at a plot to read the curve.';
      render();
    }
    function openPredict() {
      stop();
      const c = curve(), r = M.reading(state);
      els.context.textContent = 'Stopped at ε = ' + pct(r.strain, 3) + '% and σ = ' + r.stress.toFixed(1) + ' MPa. E = ' + R.gpa(c.E) + ' GPa (' + c.E.toLocaleString() + ' MPa). Predict the strain that remains when the load reaches zero.';
      els.guess.value = ''; els.guess.readOnly = false; els.check.hidden = false; els.cancel.textContent = 'Keep pulling instead';
      els.feedback.textContent = 'Your result appears here after unloading.'; delete els.feedback.dataset.result;
      els.box.hidden = false; checked = false; prediction = null;
      render(); els.guess.focus();
    }
    function feedbackText(score, guess, r0) {
      const actual = pct(score.actual / 100, 3), recov = pct(score.recovery / 100, 3);
      const tail = ' Zero load at ' + actual + '% along the dashed line (slope E): σ/E = ' + recov + '% sprang back.';
      if (score.actual === 0) {
        return (score.status === 'match' ? 'Prediction matches. ' : 'Not this time. ') + 'Still elastic: it returned along the loading line to zero strain, no permanent set.';
      }
      if (score.status === 'match') return 'Prediction matches.' + tail;
      if (score.status === 'match-ratio') return 'That matches if ' + guess + ' is a strain ratio (mm/mm). This box asks for percent, so it counts.' + tail;
      const toFull = Math.abs(guess - r0.strain * 100), toZero = Math.abs(guess);
      let why = '';
      if (toFull < score.tolerance * 2) why = ' You left out the spring-back.';
      else if (toZero < score.tolerance * 2) why = ' Past yield most of the stretch stays.';
      return (score.status === 'close' ? 'Close: off by ' + Math.abs(score.difference).toFixed(3) + ' percentage points.' : 'Not this time.') + why + tail;
    }
    function check() {
      const raw = els.guess.value.trim().replace(',', '.');
      const guess = raw === '' ? NaN : Number(raw);
      const score = M.scorePrediction(guess, state);
      if (score.status === 'invalid') { els.feedback.dataset.result = 'invalid'; els.feedback.textContent = 'Enter the permanent strain as a percentage of 0 or more, for example 1.25.'; els.guess.focus(); return; }
      const r0 = M.reading(state), from = state.eMax, to = score.actual / 100;
      prediction = guess / 100 * (score.status === 'match-ratio' ? 100 : 1);
      checked = true; els.check.hidden = true; els.guess.readOnly = true; els.cancel.textContent = 'Close and keep pulling';
      els.cancel.focus({ preventScroll: true });
      els.feedback.textContent = 'Unloading…'; delete els.feedback.dataset.result;
      tally.tried++; if (score.status === 'match' || score.status === 'match-ratio') tally.matched++;
      const finish = () => {
        anim = null; state = M.moveTo(state, to); render();
        els.feedback.dataset.result = score.status; els.feedback.textContent = feedbackText(score, guess, r0);
        els.score.textContent = 'Predictions within tolerance: ' + tally.matched + ' of ' + tally.tried + '. Hollow triangle: your prediction. Filled triangle: actual permanent set.';
      };
      if (reduced.matches || from - to <= 0) { finish(); return; }
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        state = M.moveTo(state, from - (from - to) * k); render();
        if (k < 1) anim = requestAnimationFrame(step); else finish();
      };
      anim = requestAnimationFrame(step); render();
    }
    function pointerRead(event) {
      const svg = event.target.closest && event.target.closest('svg.tt-plot');
      if (!svg) return;
      const rect = svg.getBoundingClientRect(), xMax = Number(svg.dataset.xmax);
      const P = R.PLOT, xs = (event.clientX - rect.left) / rect.width * P.W, e = (xs - P.L) / (P.W - P.L - P.R) * xMax;
      const c = curve();
      if (e < 0 || e > xMax) return;
      if (e > state.eMax + 1e-12) { els.pointer.textContent = 'At ' + pct(e, 3) + '% strain: not tested yet. Keep pulling to find out.'; return; }
      const s = M.stress(c, e), y = M.offsetYield(c);
      let text = 'On the curve at ' + pct(e, e < 0.01 ? 3 : 2) + '% strain: σ = ' + mpa(s) + ' MPa, F = ' + (s * M.AREA / 1000).toFixed(1) + ' kN.';
      if (y && Math.abs(e - y.strain) < xMax * 0.03 && M.reading(state).pastYield) text += ' 0.2% offset yield: the dashed line has slope E and starts at 0.2% strain; it meets the curve at ' + mpa(y.stress) + ' MPa.';
      els.pointer.textContent = text;
    }
    // Drag on the specimen moves the same crosshead control.
    let drag = null;
    els.stage.addEventListener('pointerdown', function (event) {
      if (state.fractured || anim) return;
      stop(); closePredict();
      drag = { x: event.clientX, u: M.sliderAt(curve(), state.e), id: event.pointerId };
      try { els.stage.setPointerCapture(event.pointerId); } catch (e) { /* synthetic pointers */ }
    });
    els.stage.addEventListener('pointermove', function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      const du = (event.clientX - drag.x) / Math.max(200, els.stage.clientWidth * 0.75);
      move(M.strainAt(curve(), drag.u + du));
    });
    const endDrag = function () { drag = null; render(); };
    els.stage.addEventListener('pointerup', endDrag);
    els.stage.addEventListener('pointercancel', endDrag);
    els.slider.addEventListener('input', function () { stop(); move(M.strainAt(curve(), Number(els.slider.value) / 1000)); });
    els.run.addEventListener('click', run);
    els.reset.addEventListener('click', function () { resetAll(); els.status.textContent = 'Reset: a fresh specimen ' + curve().letter + '.'; });
    els.curve.addEventListener('change', function () { resetAll(els.curve.value); els.status.textContent = 'Specimen ' + curve().letter + ' loaded: ' + curve().note; });
    els.predict.addEventListener('click', openPredict);
    els.check.addEventListener('click', check);
    els.guess.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); check(); } });
    els.cancel.addEventListener('click', function () { closePredict(); els.slider.focus(); });
    els.plots.addEventListener('pointermove', pointerRead);
    els.plots.addEventListener('pointerleave', function () { els.pointer.textContent = 'Point at a plot to read the curve.'; });
    document.addEventListener('visibilitychange', function () { if (document.hidden && running) { stop(); render(); } });
    reduced.addEventListener('change', function () { if (reduced.matches && running) { stop(); } render(); });

    // Comparison: overlay, prediction quiz and revealed rankings.
    function renderCompare() {
      const ids = [...lab.querySelectorAll('[data-tt-show]')].filter(n => n.checked).map(n => n.value);
      els.compare.innerHTML = ids.length ? R.comparePlot(ids, false, uid + '-cmp') + R.comparePlot(ids, true, uid + '-cmpz') : '<p>Tick at least one curve to compare.</p>';
      els.legend.innerHTML = ids.length ? R.legend(ids) : '';
    }
    lab.querySelectorAll('[data-tt-show]').forEach(n => n.addEventListener('change', renderCompare));
    q('[data-tt-quizcheck]').addEventListener('click', function () {
      const out = q('[data-tt-quizresult]'), lines = [];
      let missing = false;
      PROPS.forEach(k => {
        const pick = lab.querySelector('[data-tt-quiz="' + k + '"]').value, rank = M.ranking(k), best = M.curveById(rank[0].id), t = R.PROPERTY_TEXT[k];
        if (!pick) { missing = true; return; }
        const second = M.curveById(rank[1].id);
        lines.push('<li><strong>' + t.name + ':</strong> ' + (pick === best.id ? 'Yes, ' : 'Not ' + M.curveById(pick).letter + '. It is ') + best.letter + ' (' + t.fmt(rank[0].value) + ' ' + t.unit + '; next ' + second.letter + ' at ' + t.fmt(rank[1].value) + ').</li>');
      });
      if (missing) { out.innerHTML = '<li>Choose a specimen for each property first.</li>'; return; }
      out.innerHTML = lines.join('') + '<li>Four properties, four different rankings: C is stiffer than B but weaker; D stretches furthest yet absorbs far less energy than A.</li>';
      q('[data-tt-ranks]').hidden = false;
    });
    render();
    renderCompare();
  });
})();

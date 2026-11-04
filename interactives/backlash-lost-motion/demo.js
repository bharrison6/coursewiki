(function (root) {
  'use strict';
  var M = root.CourseWikiBacklash, D = root.CourseWikiBacklashDraw, S = root.CourseWikiBacklash3D;
  if (!M || !D) return;
  var sequence = 0, fmt = D.format;
  var reduce = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var TARGET = 25, PREDICT_AT = 10;

  function init(mount) {
    if (mount.dataset.blReady) return;
    var id = 'bl-' + (++sequence), state = M.create({ lead: 5, clearance: 1.0 }), points = [], win = null, mode = 'explore';
    var anim = null, paused = false, scene = null, attempts = [], prediction = null, lastContact = null;
    var live = document.createElement('div'); live.className = 'bl-live';
    function btn(attr, text, extra) { return '<button type="button" ' + attr + (extra || '') + '>' + text + '</button>'; }
    live.innerHTML =
      '<p class="bl-challenge"><strong>Challenge:</strong> the dial reports travel worked out from how far the screw has turned; the indicator reports where the carriage really is. Turn forward, reverse, and find out when they disagree. Then land the carriage on 25.00 mm.</p>' +
      '<div class="bl-modes" role="group" aria-label="Lab task">' + btn('data-bl-mode="explore" aria-pressed="true"', '1. Explore') + btn('data-bl-mode="predict" aria-pressed="false"', '2. Predict the dead band') + btn('data-bl-mode="position" aria-pressed="false"', '3. Land on 25.00 mm') + '</div>' +
      '<div class="bl-task" data-bl-task></div>' +
      '<div class="bl-coupled"><div class="bl-instruments"><figure><div class="bl-wheel-host" data-bl-wheel tabindex="0" role="slider" aria-label="Handwheel" aria-valuemin="' + M.TRAVEL.min + '" aria-valuemax="' + M.TRAVEL.max + '"></div><figcaption>Handwheel dial: drag, or arrow keys</figcaption></figure>' +
      '<figure><div data-bl-gauge></div><figcaption>Indicator: real carriage position</figcaption></figure></div>' +
      '<div class="bl-slot" data-bl-slot="primary"></div>' +
      '<div class="bl-drive" role="group" aria-label="Turn the handwheel">' +
      '<div class="bl-turns">' + btn('data-bl-turn="-100"', '\u2212 1 turn') + btn('data-bl-turn="-10"', '\u2212 10 div') + btn('data-bl-turn="-1"', '\u2212 1 div') + btn('data-bl-turn="1"', '+ 1 div') + btn('data-bl-turn="10"', '+ 10 div') + btn('data-bl-turn="100"', '+ 1 turn') + '</div>' +
      '<div class="bl-run">' + btn('data-bl-play', 'Play back-and-forth') + btn('data-bl-reset', 'Reset') + '</div></div>' +
      '<p class="bl-status" role="status" aria-live="polite" data-bl-status></p></div>' +
      '<div class="bl-slot" data-bl-slot="secondary"></div>' +
      '<div data-bl-readouts></div>' +
      '<div class="bl-plots"><figure><div data-bl-loop></div><figcaption>Every move adds to the trace. Forward approaches sit on the solid line, reverse approaches on the dashed line; a reversal crosses the band flat, because the carriage does not move.</figcaption></figure></div>' +
      '<div class="bl-settings"><label for="' + id + '-b">Total axial clearance B</label><select id="' + id + '-b" data-bl="clearance">' + M.CLEARANCES.map(function (b) { return '<option value="' + b + '"' + (b === 1 ? ' selected' : '') + '>' + fmt.mm(b) + ' mm</option>'; }).join('') + '</select>' +
      '<label for="' + id + '-l">Lead L</label><select id="' + id + '-l" data-bl="lead">' + M.LEADS.map(function (l) { return '<option value="' + l + '"' + (l === 5 ? ' selected' : '') + '>' + l + ' mm per turn (' + fmt.mm(l / 100) + ' mm per division)</option>'; }).join('') + '</select>' +
      '<p class="bl-note">Changing either setting starts again with the dial zeroed after a forward approach. Values are illustrative.</p></div>';
    // The two contact views: the 3D model (linked only at its own lead and clearance) and the to-scale
    // thread section. The linked one sits between the instruments and the turn buttons.
    var fig3d = document.createElement('figure'); fig3d.className = 'bl-view';
    fig3d.innerHTML = '<div class="bl-canvas" data-bl-scene><p class="bl-loading">Loading the 3D cutaway\u2026</p></div><p class="bl-linkstate" data-bl-scale></p>' +
      '<div class="bl-view-buttons" role="group" aria-label="3D view">' + btn('data-bl-view="close"', 'Thread') + btn('data-bl-view="carriage"', 'Carriage') + btn('data-bl-view="whole"', 'Whole slide') + '</div>' +
      btn('data-bl-link hidden', 'Link the 3D model: lead 5 mm, clearance 1.00 mm');
    var figSec = document.createElement('figure'); figSec.className = 'bl-sec';
    figSec.innerHTML = '<div data-bl-section></div><figcaption>Thread section to scale for your lead and clearance, riding on the carriage. The heavy blue line marks the pushing flank.</figcaption>';
    mount.appendChild(live);
    function q(s) { return live.querySelector(s); }
    var slotA = q('[data-bl-slot="primary"]'), slotB = q('[data-bl-slot="secondary"]');
    slotA.appendChild(fig3d); slotB.appendChild(figSec);
    // Keep the coupled contact view on screen when the browser scrolls a control into view (focus, tap):
    // each control's scroll margin reaches across the contact view, so the view comes along with it.
    function margins() {
      var a = slotA.getBoundingClientRect(), bar = (document.querySelector('.appbar') || { getBoundingClientRect: function () { return { height: 0 }; } }).getBoundingClientRect().height;
      if (!a.height || !wheel) return;
      live.querySelectorAll('.bl-drive button').forEach(function (b) { b.style.scrollMarginTop = Math.max(0, Math.round(b.getBoundingClientRect().top - a.top + bar + 8)) + 'px'; });
      var w = wheel.getBoundingClientRect(); wheel.style.scrollMarginBottom = Math.max(0, Math.round(a.bottom - w.bottom + 8)) + 'px'; wheel.style.scrollMarginTop = (bar + 8) + 'px';
    }
    if (root.ResizeObserver) new ResizeObserver(margins).observe(live);
    var statusEl = q('[data-bl-status]'), wheel = q('[data-bl-wheel]');

    function stopAnim() { if (anim) { cancelAnimationFrame(anim.frame); anim = null; } paused = false; playLabel(); }
    function playLabel() { var b = q('[data-bl-play]'); b.textContent = anim && !paused ? 'Pause' : anim && paused ? 'Resume' : 'Play back-and-forth'; b.setAttribute('aria-pressed', anim && !paused ? 'true' : 'false'); }
    function say(text) { statusEl.textContent = text; }
    function record() { var s = M.snapshot(state); points.push({ reading: s.reading, carriage: s.carriage }); if (points.length > 2000) points.splice(0, points.length - 2000); }
    function draw(band) {
      var s = M.snapshot(state);
      q('[data-bl-wheel]').innerHTML = D.handwheel(state, band || (prediction && prediction.band));
      q('[data-bl-gauge]').innerHTML = D.indicator(state);
      q('[data-bl-readouts]').innerHTML = D.readouts(state);
      win = D.loopWindow(state, win); q('[data-bl-loop]').innerHTML = D.loop(points, state, win);
      q('[data-bl-section]').innerHTML = D.section(state);
      wheel.setAttribute('aria-valuenow', String(s.reading)); wheel.setAttribute('aria-valuetext', 'Dial ' + fmt.mm(s.reading) + ' mm; carriage ' + fmt.mm(s.carriage) + ' mm');
      var linked = M.isReference(state), pose = M.referencePose(state);
      if (linked && fig3d.parentNode !== slotA) { slotA.appendChild(fig3d); slotB.appendChild(figSec); }
      if (!linked && figSec.parentNode !== slotA) { slotA.appendChild(figSec); slotB.appendChild(fig3d); }
      fig3d.classList.toggle('is-unlinked', !linked); q('[data-bl-link]').hidden = linked;
      mount.dataset.bl3dLinked = String(linked);
      // Unlinked: the model is held at its own zero pose; nothing is remapped onto it.
      if (scene) scene.set(pose || M.referencePose(M.create(M.GEOMETRY)));
      margins();
      mount.dataset.blReading = String(s.reading); mount.dataset.blCarriage = String(s.carriage); mount.dataset.blContact = s.contact;
      if (s.contact !== lastContact && lastContact !== null && !anim) say(s.contact === 'free' ? 'Reversed: the screw is turning but the carriage is held. The dial and the indicator now disagree.' : s.contact === 'forward' ? 'The screw is pushing the carriage toward +X.' : 'The clearance is taken up: the screw is pushing the carriage toward \u2212X.');
      lastContact = s.contact;
      updateTask();
    }
    function scaleCaption() {
      q('[data-bl-scale]').textContent = M.isReference(state)
        ? 'Linked: built at lead 5 mm, clearance 1.00 mm (exaggerated to be seen). The screw turns exactly with the dial.'
        : 'Not linked: the 3D model exists only at lead 5 mm, clearance 1.00 mm, so it is held still. The thread section above is to scale for your settings.';
    }
    function move(n) {
      if (!n) return;
      var before = state; state = M.turnBy(state, n);
      if (state === before) { say('End of travel for this lab.'); return; }
      record(); draw();
      if (M.atTravelLimit(state)) say('End of travel for this lab.');
    }
    function reset(full) {
      stopAnim(); state = M.create({ lead: Number(q('[data-bl="lead"]').value), clearance: Number(q('[data-bl="clearance"]').value) });
      points = []; win = null; prediction = null; lastContact = null; record(); scaleCaption();
      if (full !== false) setupMode();
      draw(); if (scene) scene.view('close');
    }
    function driveTo(reading) { var target = Math.round(reading * M.DIVISIONS / state.lead); move(target - state.turn); }

    // ---- tasks ---------------------------------------------------------------------------------
    function setupMode() {
      prediction = null;
      var task = q('[data-bl-task]');
      live.querySelectorAll('[data-bl-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.blMode === mode)); });
      if (mode === 'explore') {
        task.innerHTML = '<p><strong>Explore:</strong> turn forward a few divisions, then come back one division at a time. The dial changes at once; the indicator waits. Watch the heavy blue flank mark in the thread section jump to the other side of the tooth.</p>';
      } else if (mode === 'predict') {
        state = M.seatedForward({ lead: state.lead, clearance: state.clearance }, PREDICT_AT); points = []; record();
        task.innerHTML = '<p><strong>Predict:</strong> the carriage has been driven forward to ' + fmt.mm(PREDICT_AT) + ' mm. You are about to reverse. How far will the handwheel turn before the carriage starts to move back? (Lead ' + state.lead + ' mm, clearance ' + fmt.mm(state.clearance) + ' mm, 100 divisions per turn.)</p>' +
          '<div class="bl-predict"><label for="' + id + '-p">Your prediction</label><input id="' + id + '-p" type="number" min="0" step="any" inputmode="decimal" data-bl="prediction"><label for="' + id + '-u" class="bl-visually-hidden">Unit</label><select id="' + id + '-u" data-bl="unit"><option value="divisions">dial divisions</option><option value="degrees">degrees</option></select>' +
          btn('data-bl-check', 'Reverse and check') + '</div><p class="bl-result" data-bl-result aria-live="polite"></p>';
        q('[data-bl-check]').addEventListener('click', checkPrediction);
        q('[data-bl="prediction"]').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkPrediction(); } });
      } else {
        var OVERSHOOT = M.positioningPlan(state.clearance).overshoot;
        driveTo(OVERSHOOT); points = []; record();
        task.innerHTML = '<p><strong>Land on ' + fmt.mm(TARGET) + ' mm:</strong> you turned too far, to ' + fmt.mm(OVERSHOOT) + ' mm. The dial was zeroed after a forward approach. Get the dial to exactly ' + fmt.mm(TARGET) + ' and record. Try it twice: once by reversing straight to the number, once by backing past it and coming forward again.</p>' +
          '<div class="bl-run">' + btn('data-bl-record', 'Record attempt at ' + fmt.mm(TARGET) + ' mm') + btn('data-bl-again', 'Back to the overshoot') + '</div>' +
          '<div data-bl-attempts></div><p class="bl-result" data-bl-result aria-live="polite"></p>';
        q('[data-bl-record]').addEventListener('click', recordAttempt);
        q('[data-bl-again]').addEventListener('click', function () { var keep = attempts; reset(false); attempts = keep; driveTo(M.positioningPlan(state.clearance).overshoot); points = []; record(); draw(); say('Back at the overshoot: dial ' + fmt.mm(M.reading(state)) + ' mm, carriage ' + fmt.mm(state.carriage) + ' mm.'); });
        renderAttempts();
      }
    }
    function updateTask() {
      var rec = q('[data-bl-record]');
      if (rec) { var a = M.attempt(state, TARGET); rec.disabled = !a.onTarget; rec.title = a.onTarget ? '' : 'Bring the dial to exactly ' + fmt.mm(TARGET) + ' mm first'; }
    }
    function recordAttempt() {
      var a = M.attempt(state, TARGET); if (!a.onTarget) return;
      var exact = Math.abs(a.error) < 1e-9, note;
      if (exact) note = 'On target. The last move was forward, so the screw was on the same flank as when the dial was zeroed.';
      else if (a.approach === 'reverse' && Math.abs(a.error - state.clearance) < 1e-9) note = 'Reversed straight to the number: the carriage is ' + fmt.mm(a.error) + ' mm beyond the target \u2014 one clearance B. The screw is pushing on the other flank.';
      else if (a.approach === 'reverse') note = 'The last move was a reversal, so the screw is not on the flank the dial was zeroed against: error ' + fmt.signed(a.error) + ' mm.';
      else note = 'Finished forward, but the back-off was smaller than the clearance, so the carriage never left the far flank: error ' + fmt.signed(a.error) + ' mm. Back off by more than B.';
      attempts.push({ approach: a.approach, carriage: a.carriage, error: a.error, note: note }); if (attempts.length > 6) attempts.shift();
      renderAttempts();
      var direct = attempts.some(function (x) { return x.approach === 'reverse' && Math.abs(x.error - state.clearance) < 1e-9; }), good = attempts.some(function (x) { return Math.abs(x.error) < 1e-9; });
      q('[data-bl-result]').textContent = note + (direct && good ? ' Both methods put the dial on ' + fmt.mm(TARGET) + '; the carriages differ by ' + fmt.mm(state.clearance) + ' mm, exactly B. Finish every approach in the direction the dial was set in.' : '');
      say('Recorded: dial ' + fmt.mm(a.reading) + ' mm, carriage ' + fmt.mm(a.carriage) + ' mm.');
    }
    function renderAttempts() {
      var el = q('[data-bl-attempts]'); if (!el) return;
      el.innerHTML = attempts.length ? '<div class="unit-table-wrap"><table class="unit-table bl-table"><caption>Your attempts (dial at ' + fmt.mm(TARGET) + ' mm)</caption><thead><tr><th scope="col">Last move</th><th scope="col">Carriage</th><th scope="col">Error</th></tr></thead><tbody>' +
        attempts.map(function (x) { return '<tr><td>' + (x.approach === 'forward' ? 'forward (+)' : 'reverse (\u2212)') + '</td><td>' + fmt.mm(x.carriage) + ' mm</td><td>' + fmt.signed(x.error) + ' mm</td></tr>'; }).join('') + '</tbody></table></div>' : '';
    }
    function checkPrediction() {
      var input = q('[data-bl="prediction"]'), unit = q('[data-bl="unit"]').value, out = q('[data-bl-result]'), score;
      try { score = M.scorePrediction(state.lead, state.clearance, input.value === '' ? NaN : Number(input.value), unit); }
      catch (e) { out.textContent = 'Enter a number of ' + unit + ' first (zero or more).'; input.focus(); return; }
      // Always start from a forward approach: re-zero and drive forward, whatever moves came before.
      stopAnim(); state = M.seatedForward({ lead: state.lead, clearance: state.clearance }, PREDICT_AT); points = []; record(); lastContact = M.contact(state); prediction = null; draw();
      var startTurn = state.turn, band = score.band, total = Math.ceil(band.divisions - 1e-9) + 4;
      prediction = { band: { from: startTurn, divisions: 0 } };
      function finish() {
        anim = null; playLabel(); prediction.band.divisions = band.divisions; draw();
        var p = unit === 'degrees' ? fmt.mm(score.predictedDivisions * 3.6, 1) + '\u00b0' : fmt.mm(score.predictedDivisions, score.predictedDivisions % 1 ? 1 : 0) + ' divisions';
        out.textContent = (score.correct ? 'Correct. ' : 'Not quite. ') + 'The carriage started back after ' + fmt.mm(band.divisions, band.divisions % 1 ? 1 : 0) + ' divisions = ' + fmt.mm(band.degrees, 1) + '\u00b0 of handwheel turn (shaded on the dial). You predicted ' + p + '. Dead band = B \u00f7 (L \u00f7 100) = ' + fmt.mm(state.clearance) + ' \u00f7 ' + fmt.mm(state.lead / 100) + ' = ' + fmt.mm(band.divisions, 2) + ' divisions; angle = 360\u00b0 \u00d7 B \u00f7 L.' + (score.correct ? '' : ' Within half a division counts as correct.');
        say('Reversal finished. The screw turned ' + fmt.mm(band.degrees, 1) + ' degrees with the carriage standing still.');
      }
      if (reduce.matches) { move(-total); finish(); return; }
      say('Reversing slowly: watch the screw turn while the indicator holds.');
      var done = 0;
      anim = { frame: 0, tick: function () {
        if (paused) return;
        var step = Math.min(0.25, total - done); move(-step); done += step;
        prediction.band.divisions = Math.min(done, band.divisions);
        draw();
        if (done >= total - 1e-9) finish(); else anim.frame = requestAnimationFrame(anim.tick);
      } };
      playLabel(); anim.frame = requestAnimationFrame(anim.tick);
    }
    function play() {
      if (anim) { paused = !paused; playLabel(); if (!paused) anim.frame = requestAnimationFrame(anim.tick); say(paused ? 'Paused.' : 'Running.'); return; }
      var band = M.deadBand(state.lead, state.clearance), amp = Math.max(10, Math.ceil(3 * band.divisions)), centre = state.turn, dir = -1, edge = centre - amp;
      if (reduce.matches) { move(-amp); move(2 * amp); move(-amp); say('Drew one back-and-forth cycle without animation (reduced motion).'); return; }
      anim = { frame: 0, tick: function () {
        if (paused) return;
        var step = 0.5 * dir, next = state.turn + step;
        if ((dir < 0 && next <= edge) || (dir > 0 && next >= edge)) { step = edge - state.turn; dir = -dir; edge = centre + dir * amp; }
        move(step); if (M.atTravelLimit(state)) { stopAnim(); return; }
        anim.frame = requestAnimationFrame(anim.tick);
      } };
      paused = false; playLabel(); say('Running back and forth. Watch the trace draw a loop ' + fmt.mm(state.clearance) + ' mm wide.'); anim.frame = requestAnimationFrame(anim.tick);
    }

    // ---- controls --------------------------------------------------------------------------------
    live.querySelectorAll('[data-bl-turn]').forEach(function (b) { b.addEventListener('click', function () { stopAnim(); move(Number(b.dataset.blTurn)); }); });
    q('[data-bl-play]').addEventListener('click', play);
    q('[data-bl-reset]').addEventListener('click', function () { attempts = []; reset(); say('Reset: dial and carriage at zero, nut on the forward flank.'); });
    live.querySelectorAll('[data-bl-mode]').forEach(function (b) { b.addEventListener('click', function () { mode = b.dataset.blMode; attempts = []; reset(); }); });
    fig3d.querySelectorAll('[data-bl-view]').forEach(function (b) { b.addEventListener('click', function () { if (scene) scene.view(b.dataset.blView); }); });
    fig3d.querySelector('[data-bl-link]').addEventListener('click', function () { q('[data-bl="lead"]').value = String(M.GEOMETRY.lead); q('[data-bl="clearance"]').value = String(M.GEOMETRY.clearance); attempts = []; reset(); say('3D model linked: lead 5 mm, clearance 1.00 mm.'); });
    ['clearance', 'lead'].forEach(function (k) { q('[data-bl="' + k + '"]').addEventListener('change', function () { attempts = []; reset(); say('Settings changed: lead ' + state.lead + ' mm, clearance ' + fmt.mm(state.clearance) + ' mm. Dead band ' + fmt.mm(M.deadBand(state.lead, state.clearance).degrees, 1) + ' degrees.'); }); });
    wheel.addEventListener('keydown', function (e) {
      var n = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (!n) return; e.preventDefault(); e.stopPropagation(); stopAnim(); move(n);
    });
    var drag = null;
    function angleAt(e) { var r = wheel.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height * 128 / 250), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; }
    wheel.addEventListener('pointerdown', function (e) { stopAnim(); drag = { angle: angleAt(e), acc: 0 }; wheel.setPointerCapture(e.pointerId); wheel.focus({ preventScroll: true }); });
    wheel.addEventListener('pointermove', function (e) {
      if (!drag) return; var a = angleAt(e), d = a - drag.angle; if (d > 180) d -= 360; if (d < -180) d += 360; drag.angle = a;
      drag.acc += -d / 3.6; var whole = drag.acc > 0 ? Math.floor(drag.acc) : Math.ceil(drag.acc); if (whole) { drag.acc -= whole; move(whole); }
    });
    ['pointerup', 'pointercancel'].forEach(function (t) { wheel.addEventListener(t, function () { drag = null; }); });

    reset();
    say('Ready. Turn the handwheel forward (+), then reverse (\u2212).');
    mount.classList.add('bl-live-ready'); mount.dataset.blReady = 'true';
    var host = q('[data-bl-scene]');
    if (!S) { host.innerHTML = '<p class="bl-loading">3D view unavailable; the dial, indicator, loop and thread section still work.</p>'; return; }
    S.create(host).then(function (s) {
      scene = s; var loading = host.querySelector('.bl-loading'); if (loading) loading.remove(); draw(); scene.view('close'); mount.dataset.bl3d = 'ready';
      mount.blDispose = function () { stopAnim(); scene.dispose(); live.remove(); mount.classList.remove('bl-live-ready'); delete mount.dataset.blReady; };
    }).catch(function () { mount.dataset.bl3d = 'fallback'; host.innerHTML = '<p class="bl-loading">3D view unavailable here. The dial, indicator, loop and thread section show the same motion.</p>'; });
  }
  function boot() { document.querySelectorAll('[data-interactive="backlash-lost-motion"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);

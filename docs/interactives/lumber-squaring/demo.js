(function (root) {
  'use strict';
  var M = root.CourseWikiLumberSquaring, R = root.CourseWikiLumberSquaringDraw, S = root.CourseWikiLumberSquaring3D;
  if (!M || !R) return;
  var sequence = 0;
  var OP_ORDER = M.OPS;
  var OP_HINT = {
    'joint-face': 'cuts face A (the underside) on the long jointer table',
    'joint-edge': 'cuts edge A on the jointer table, face A against the fence',
    'plane': 'cuts face B (the top), face A down on the bed',
    'rip': 'cuts the far edge, edge A against the fence',
    'crosscut': 'cuts both ends, referenced from face A and edge A'
  };
  document.querySelectorAll('[data-interactive="lumber-squaring"]').forEach(function (mount) {
    if (mount.dataset.lsReady) return;
    // Unique per page even if this script runs again for a mount added later.
    do { sequence++; } while (document.querySelector('[name^="ls-' + sequence + '-"]'));
    var id = 'ls-' + sequence, kind = 'cup', board = M.create(kind), roughVolume = M.volume(board), undo = [], log = [];
    var op = null, prediction = null, planer = 'flexible', scene = null, busy = false, tally = { right: 0, made: 0 };
    var live = document.createElement('div'); live.className = 'ls-live';
    function radio(name, value, label, checked, extra) {
      return '<label class="ls-choice"><input type="radio" name="' + id + '-' + name + '" value="' + value + '"' + (checked ? ' checked' : '') + '>' + (extra || '') + '<span>' + label + '</span></label>';
    }
    live.innerHTML =
      '<p class="ls-challenge"><strong>Challenge:</strong> turn this rough, warped board into a flat, straight, square part 19 × 110 × 520 mm. Choose each operation, predict what it will do, then check the result.</p>' +
      '<fieldset class="ls-boards"><legend>Rough board (warp exaggerated so you can see it)</legend><div class="ls-choices">' +
      Object.keys(M.BOARDS).map(function (k) { return radio('board', k, M.BOARDS[k].label, k === kind); }).join('') +
      '</div><p class="ls-board-desc" data-ls="board-desc"></p></fieldset>' +
      '<div class="ls-work"><div class="ls-stage">' +
      '<div class="ls-canvas" data-ls="scene"><p class="ls-canvas-note" data-ls="canvas-note">Face A is the underside, resting on a flat reference table. Edge A faces you.</p></div>' +
      '<div class="ls-row ls-views" role="group" aria-label="Camera view">' +
      '<button type="button" data-view="angle">3/4</button><button type="button" data-view="end">End</button><button type="button" data-view="side">Side</button><button type="button" data-view="top">Top</button><button type="button" data-view="under">Under</button></div>' +
      '<div class="ls-row"><label class="ls-choice"><input type="checkbox" data-ls="heat"><span>Show high spots on face A and edge A</span></label>' +
      '<button type="button" data-ls="pause" disabled>Pause</button><button type="button" data-ls="skip" disabled>Skip animation</button></div>' +
      '<p class="ls-status" role="status" aria-live="polite" data-ls="status"></p>' +
      '</div><div class="ls-side">' +
      '<fieldset class="ls-ops"><legend>Next operation</legend><div class="ls-choices">' +
      OP_ORDER.map(function (o, n) { return radio('op', o, M.OP_LABELS[o], false, ''); }).join('') + '</div></fieldset>' +
      '<div class="ls-predict" data-ls="predict"><h4>Predict first</h4><p>Choose an operation to see the prediction question.</p></div>' +
      '<div class="ls-row"><button type="button" class="ls-primary" data-ls="apply" disabled>Apply operation</button><button type="button" data-ls="undo" disabled>Undo</button><button type="button" data-ls="reset">Reset board</button></div>' +
      '<p class="ls-feedback" data-ls="feedback" aria-live="polite">Pick an operation and a prediction, then apply it.</p>' +
      '<p class="ls-score" data-ls="score">Predictions: none yet</p>' +
      '</div></div>' +
      '<div data-ls="done"></div>' +
      '<div class="ls-checks" role="group" aria-label="Checks"><h4>Check it: straightedge, winding sticks and square</h4><div data-ls="checks"></div><div class="ls-table-wrap" data-ls="readout"></div></div>' +
      '<h4>Your sequence</h4><ol class="ls-history" data-ls="history"><li>Rough board</li></ol>' +
      '<details class="ls-more" data-ls="compare-box"><summary>Compare: planer first vs the reference order</summary><p>The same board run both ways by the model. Planer support uses your current choice.</p><button type="button" data-ls="compare">Run both sequences on this board</button><div class="ls-compare-out" data-ls="compare-out"></div></details>' +
      '<details class="ls-more"><summary>Model, assumptions and limits</summary>' +
      '<p>Idealised geometry in model millimetres. Every cut is a plane or a surface built from straight lines; a point outside a cut slides inward until it reaches the cut, so no operation adds material. Warp amounts are deliberately large illustrative values, not measurements.</p><ul>' +
      '<li><strong>Jointer, face:</strong> a long, flat table. The board rests on its lowest points; the cut stays parallel to that resting plane until the deepest hollow is reached. Pass counts are illustrative, not a depth-of-cut setting.</li>' +
      '<li><strong>Jointer, edge, and rip:</strong> the edge rests on its outermost points along the table or fence, so the cut is straight along the length. Where face A touches the fence or saw table beside the cutter, its local angle sets the edge angle.</li>' +
      '<li><strong>Planer:</strong> the flexible-board example assumes feed rollers press the board until its overall curve lies on the bed; the top is cut parallel to the pressed underside and the warp returns on release. The rigid case (a stiff board, or one shimmed on a flat sled) keeps its resting attitude instead. Neither is a rule for every board or planer.</li>' +
      '<li><strong>Crosscut:</strong> each end is cut perpendicular to face A and edge A near that end.</li>' +
      '<li>Checks pass within 0.05 mm and 0.1°. Machine setup, feed, guards, snipe, tearout, kickback and moisture movement are not modelled; see the machine safety pages before using any of these machines.</li></ul></details>';
    mount.appendChild(live);
    function q(s) { return live.querySelector(s); }
    function setStatus(t) { q('[data-ls="status"]').textContent = t; }
    function feedback(t) { var f = q('[data-ls="feedback"]'); f.dataset.result = ''; f.textContent = t; }
    // Keep the action and its changing view together in normal document flow.
    // Setup precedes the view on a phone; a wider card pairs the two columns.
    var work = q('.ls-work'), stage = q('.ls-stage'), side = q('.ls-side');
    work.insertBefore(side, stage);
    var actions = q('[data-ls="apply"]').parentNode, viewOptions = q('[data-ls="heat"]').parentNode.parentNode;
    actions.classList.add('ls-runbar');
    actions.appendChild(q('[data-ls="pause"]')); actions.appendChild(q('[data-ls="skip"]'));
    side.appendChild(q('[data-ls="heat"]').parentNode);
    viewOptions.remove();
    stage.insertBefore(actions, q('[data-ls="status"]'));
    stage.appendChild(q('[data-ls="feedback"]')); stage.appendChild(q('[data-ls="score"]'));
    // Native controls keep their keys when a playlist also listens for arrows or Space.
    live.addEventListener('keydown', function (e) { if (e.target.matches('input,select,button,summary,canvas')) e.stopPropagation(); });

    var host = q('[data-ls="scene"]');
    try { if (!S) throw new Error('no 3D'); scene = S.create(host); host.dataset.mode = '3d'; }
    catch (err) { scene = null; host.dataset.mode = 'svg'; host.classList.add('ls-fallback-3d'); }
    function drawBoard() {
      if (scene) scene.setBoard(board);
      else host.innerHTML = R.views(board) + '<p class="ls-canvas-note">3D view unavailable here; these views come from the same model.</p>';
    }
    function refresh() {
      var m = M.measure(board);
      q('[data-ls="checks"]').innerHTML = R.checks(board, m);
      q('[data-ls="readout"]').innerHTML = R.readouts(m, roughVolume);
      q('[data-ls="done"]').innerHTML = M.finished(m) ? '<p class="ls-done">Square: 19.0 × 110.0 × 520.0 mm, flat, straight and square on every check. Try another board, or undo and test a different order.</p>' : '';
      q('[data-ls="undo"]').disabled = busy || !undo.length;
      mount.dataset.lsHistory = board.history.join(',');
      mount.dataset.lsFinished = String(M.finished(m));
      return m;
    }
    function renderHistory() {
      q('[data-ls="history"]').innerHTML = '<li>Rough ' + M.BOARDS[kind].label.toLowerCase() + ' board</li>' + log.map(function (e) {
        return '<li><strong>' + R.esc(M.OP_LABELS[e.op]) + (e.op === 'plane' ? ' (' + (e.planer === 'rigid' ? 'rigid' : 'flexible') + ')' : '') + '</strong>: ' + R.esc(e.summary) + (e.prediction ? ' Prediction ' + (e.correct ? 'right.' : 'not right.') : '') + '</li>';
      }).join('');
    }
    function renderPredict() {
      var box = q('[data-ls="predict"]');
      if (!op) { box.innerHTML = '<h4>Predict first</h4><p>Choose an operation to see the prediction question.</p>'; return; }
      box.innerHTML = '<h4>Predict: what will this operation do to this board?</h4><p class="ls-board-desc">It ' + OP_HINT[op] + '.</p><div class="ls-choices" role="radiogroup" aria-label="Prediction">' +
        M.PREDICTIONS[op].map(function (p) { return radio('pred', p.id, R.esc(p.text), prediction === p.id); }).join('') +
        radio('pred', 'unsure', 'Not sure: just show me.', prediction === 'unsure') + '</div>' +
        (op === 'plane' ? '<div class="ls-planer"><label for="' + id + '-planer">Board in the planer</label><select id="' + id + '-planer" data-ls="planer"><option value="flexible"' + (planer === 'flexible' ? ' selected' : '') + '>Flexible: rollers press it flat (declared example)</option><option value="rigid"' + (planer === 'rigid' ? ' selected' : '') + '>Rigid board, or shimmed on a flat sled</option></select></div>' : '');
      box.querySelectorAll('input[name="' + id + '-pred"]').forEach(function (r) { r.addEventListener('change', function () { prediction = r.value; updateApply(); }); });
      var sel = box.querySelector('[data-ls="planer"]'); if (sel) sel.addEventListener('change', function () {
        planer = sel.value; prediction = null;
        box.querySelectorAll('input[name="' + id + '-pred"]').forEach(function (r) { r.checked = false; });
        updateApply();
        q('[data-ls="compare-out"]').innerHTML = '';
        feedback('Planer support changed. Choose a prediction for this setup; the board has not been cut.');
      });
    }
    function updateApply() {
      var b = q('[data-ls="apply"]'); b.disabled = busy || !op || !prediction;
      b.textContent = op ? 'Apply: ' + M.OP_LABELS[op].split(':')[0] : 'Apply operation';
    }
    function setBusy(on) {
      busy = on; updateApply(); q('[data-ls="reset"]').disabled = on; q('[data-ls="undo"]').disabled = on || !undo.length;
      q('[data-ls="pause"]').disabled = !on; q('[data-ls="skip"]').disabled = !on; q('[data-ls="pause"]').textContent = 'Pause'; q('[data-ls="pause"]').setAttribute('aria-pressed', 'false');
      live.querySelectorAll('input[name="' + id + '-board"], input[name="' + id + '-op"], input[name="' + id + '-pred"], [data-ls="planer"], [data-ls="heat"]').forEach(function (r) { r.disabled = on; });
      mount.dataset.lsBusy = String(on);
    }
    function sceneSteps(before, result) {
      var steps = [], prev = before, info = result.info;
      if (result.board.history[result.board.history.length - 1] === 'plane' && info.pressed) {
        steps.push({ from: before, to: info.pressed[0], axis: 'none', duration: 900, caption: 'Planer: the feed rollers press the warped board flat against the bed (flexible-board example).' });
        steps.push({ from: info.pressed[0], to: info.pressed[1], axis: 'x', cutter: 'over', duration: 1500, caption: 'The knives cut the top parallel to the pressed-flat underside.' });
        steps.push({ from: info.pressed[1], to: result.board, axis: 'none', duration: 1000, caption: 'Released: the board springs back, and the top now follows the warp.' });
        return steps;
      }
      var last = result.board.history[result.board.history.length - 1];
      result.stages.forEach(function (st, n) {
        var cap = last === 'joint-face' ? 'Jointer pass ' + (n + 1) + ' of ' + result.stages.length + ' on face A: the high spots go first.' :
          last === 'joint-edge' ? 'Jointer pass ' + (n + 1) + ' of ' + result.stages.length + ' on edge A.' :
          last === 'plane' ? 'Planer: the board keeps its resting attitude; the knives cut the top parallel to it.' :
          last === 'rip' ? 'Rip: edge A rides the fence; the saw cuts the far edge 110 mm away.' : 'Crosscut: squaring both ends.';
        steps.push({ from: prev, to: st, axis: last === 'crosscut' ? 'y' : 'x', cutter: { 'joint-face': 'under', 'joint-edge': 'near', plane: 'over', rip: 'far' }[last] || null, duration: last === 'joint-face' || last === 'joint-edge' ? 700 : 1300, caption: cap });
        prev = st;
      });
      return steps;
    }
    function apply() {
      if (busy || !op || !prediction) return;
      var before = board, mb = M.measure(before), result = M.apply(before, op, { planer: planer }), ma = M.measure(result.board);
      var sc = prediction === 'unsure' ? null : M.score(op, prediction, ma, result.info);
      if (sc) { tally.made++; if (sc.correct) tally.right++; }
      var why = R.explain(op, mb, ma, result.info), doneOp = op;
      undo.push({ board: before, logLength: log.length });
      board = result.board;
      var summary = 'face A ' + R.mm(ma.faceA.flatness) + ' mm out of flat; thickness ' + R.range(ma.thickness) + ' mm; edge A ' + R.deg(ma.nearEdge.square) + '° off square.';
      log.push({ op: op, planer: planer, summary: summary, prediction: !!sc, correct: sc && sc.correct });
      setBusy(true);
      feedback('Applying ' + M.OP_LABELS[doneOp] + '. Watch the board above; the checks update when the cut finishes.');
      function done() {
        setBusy(false); refresh(); renderHistory();
        var fb = q('[data-ls="feedback"]'), trueText = M.PREDICTIONS[doneOp].filter(function (p) { return sc ? sc.outcomes[p.id] : M.outcomes(doneOp, ma, result.info)[p.id]; }).map(function (p) { return '“' + p.text + '”'; });
        if (sc) { fb.dataset.result = sc.correct ? 'right' : 'wrong'; fb.textContent = (sc.correct ? 'Your prediction was right. ' : 'Not this time. ') + 'True after this step: ' + (trueText.join(' and ') || 'none of the listed outcomes') + '. ' + why; }
        else { fb.dataset.result = 'none'; fb.textContent = 'True after this step: ' + (trueText.join(' and ') || 'none of the listed outcomes') + '. ' + why; }
        q('[data-ls="score"]').textContent = tally.made ? 'Predictions: ' + tally.right + ' of ' + tally.made + ' right' : 'Predictions: none yet';
        setStatus('Done: ' + M.OP_LABELS[doneOp] + '. ' + summary.charAt(0).toUpperCase() + summary.slice(1));
        prediction = null; renderPredict(); updateApply();
      }
      if (scene) {
        var v = doneOp === 'joint-face' ? 'under' : doneOp === 'crosscut' ? 'top' : doneOp === 'joint-edge' || doneOp === 'rip' ? 'angle' : (M.BOARDS[kind].view === 'top' ? 'angle' : M.BOARDS[kind].view);
        if (doneOp === 'plane') v = M.BOARDS[kind].view === 'top' ? 'side' : M.BOARDS[kind].view;
        scene.view(v); markView(v);
        scene.play(sceneSteps(before, result), function (caption) {
          setStatus(caption); feedback('Machining in progress. The checks below update when this operation finishes.');
        }, done);
      } else { drawBoard(); done(); }
    }
    function markView(v) { live.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === v)); }); }
    function resetTo(k) {
      if (scene && scene.playing()) scene.skip();
      kind = k; board = M.create(kind); roughVolume = M.volume(board); undo = []; log = [];
      op = null; prediction = null;
      live.querySelectorAll('input[name="' + id + '-op"]').forEach(function (r) { r.checked = false; });
      renderPredict(); updateApply();
      q('[data-ls="board-desc"]').textContent = M.BOARDS[kind].description;
      q('[data-ls="compare-out"]').innerHTML = '';
      drawBoard(); refresh(); renderHistory();
      if (scene) { var label = scene.view(M.BOARDS[kind].view); markView(M.BOARDS[kind].view); setStatus(M.BOARDS[kind].label + ' board loaded; ' + label + '.'); }
      else setStatus(M.BOARDS[kind].label + ' board loaded.');
      var fb = q('[data-ls="feedback"]'); fb.dataset.result = ''; fb.textContent = 'Pick an operation and a prediction, then apply it.';
    }
    live.querySelectorAll('input[name="' + id + '-board"]').forEach(function (r) { r.addEventListener('change', function () { if (r.checked) resetTo(r.value); }); });
    live.querySelectorAll('input[name="' + id + '-op"]').forEach(function (r) { r.addEventListener('change', function () { if (r.checked) {
      op = r.value; prediction = null; renderPredict(); updateApply();
      feedback('Choose a prediction, then apply ' + M.OP_LABELS[op] + '. The board has not changed.');
    } }); });
    q('[data-ls="apply"]').addEventListener('click', apply);
    q('[data-ls="reset"]').addEventListener('click', function () { resetTo(kind); });
    q('[data-ls="undo"]').addEventListener('click', function () {
      if (busy || !undo.length) return; var u = undo.pop(); board = u.board; log.length = u.logLength;
      drawBoard(); refresh(); renderHistory(); setStatus('Undone. Back to: ' + (log.length ? M.OP_LABELS[log[log.length - 1].op] : 'rough board') + '.');
      prediction = null; renderPredict(); updateApply();
      var m = M.measure(board);
      feedback('Undone. Restored board: face A ' + R.mm(m.faceA.flatness) + ' mm out of flat; thickness ' + R.range(m.thickness) + ' mm. Choose a fresh prediction before the next cut.');
    });
    q('[data-ls="pause"]').addEventListener('click', function () {
      if (!scene || !scene.playing()) return; var b = this;
      if (scene.paused()) { scene.resume(); b.textContent = 'Pause'; b.setAttribute('aria-pressed', 'false'); feedback('Machining resumed. The checks below update when this operation finishes.'); }
      else { scene.pause(); b.textContent = 'Resume'; b.setAttribute('aria-pressed', 'true'); feedback('Paused. ' + q('[data-ls="status"]').textContent); }
    });
    q('[data-ls="skip"]').addEventListener('click', function () { if (scene && scene.playing()) scene.skip(); });
    q('[data-ls="heat"]').addEventListener('change', function () {
      if (scene) scene.setHighSpots(this.checked);
      q('[data-ls="canvas-note"]').textContent = this.checked ? 'Orange: high spots on face A, and on edge A when it is crooked. They touch the jointer table first and are cut first. Use Under to see face A.' : 'Face A is the underside, resting on a flat reference table. Edge A faces you.';
    });
    live.querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { if (!scene) return; var label = scene.view(b.dataset.view); markView(b.dataset.view); setStatus('Camera: ' + label + '.'); }); });
    if (!scene) live.querySelectorAll('[data-view], [data-ls="heat"]').forEach(function (b) { b.disabled = true; });
    q('[data-ls="compare"]').addEventListener('click', function () {
      var opt = { planer: planer }, pf = R.sequenceFigure(kind, M.PLANER_FIRST, opt), ref = R.sequenceFigure(kind, M.REFERENCE_ORDER, opt);
      q('[data-ls="compare-out"]').innerHTML = '<h4>Planer first</h4><figure class="ls-static-fig">' + pf.svg + '<figcaption>' + R.esc(pf.caption) + '</figcaption></figure>' +
        '<h4>Reference order: face, edge, thickness, width, length</h4><figure class="ls-static-fig">' + ref.svg + '<figcaption>' + R.esc(ref.caption) + '</figcaption></figure>' +
        '<div class="ls-table-wrap">' + R.comparisonTable(kind, opt) + '</div>';
    });
    mount.classList.add('ls-ready'); mount.dataset.lsReady = scene ? '3d' : 'svg';
    mount.lsDispose = function () { if (scene) scene.dispose(); live.remove(); mount.classList.remove('ls-ready'); delete mount.dataset.lsReady; };
    resetTo(kind);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

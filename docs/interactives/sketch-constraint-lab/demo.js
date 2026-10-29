(function () {
  'use strict';
  var M = window.SketchConstraintModel;
  if (!M) return;
  document.querySelectorAll('[data-interactive="sketch-constraint-lab"]').forEach(function (root) {
    if (root.dataset.sketchReady) return;
    root.dataset.sketchReady = 'true';
    var s = M.defaults(), g = M.initial('corner'), previous = null, drag = null, frame;
    var live = document.createElement('div'); live.className = 'sc-lab';
    live.innerHTML = '<p class="sc-prompt"><strong>Predict, then grow:</strong> start with a 64 × 22 mm label blank. What happens to the left edge when width becomes 80 mm?</p>' +
      '<div class="sc-first"><label>Anchor choice<select data-sc="anchor"><option value="corner">Lower-left corner at origin</option><option value="center">Center at origin</option></select></label>' +
      '<label>Your prediction<select data-sc="prediction"><option value="">Choose before growing…</option><option value="fixed">Left edge stays at 0 mm</option><option value="left">Left edge moves 8 mm left</option><option value="right">Left edge moves 16 mm right</option></select></label>' +
      '<div class="sc-actions"><button type="button" data-sc="grow">Grow width: 64 → 80</button><button type="button" data-sc="reset">Reset lab</button></div></div>' +
      '<div class="sc-board"><svg viewBox="0 0 600 310" role="group" aria-label="Axis-aligned rectangle in millimeters. Two focusable corner handles support arrow keys.">' +
      '<path class="sc-axes" d="M20 190H580M215 20V290"/><path class="sc-origin" d="M209 190H221M215 184V196"/>' +
      '<rect class="sc-baseline"/><rect class="sc-shape"/><circle class="sc-dot" data-dot="lower" r="8"/><circle class="sc-dot" data-dot="upper" r="8"/><circle class="sc-handle" data-corner="lower" r="36" tabindex="0" role="button" aria-label="Lower-left corner: use arrow keys to test motion"/>' +
      '<circle class="sc-handle" data-corner="upper" r="36" tabindex="0" role="button" aria-label="Upper-right corner: use arrow keys to test motion"/></svg>' +
      '<p class="sc-caption">Solid outline: current rectangle. Dashed outline: starting 64 × 22 mm rectangle. Cross: origin. The view fits both outlines; read exact values below. Drag either corner; or focus it and use arrow keys (1 mm, Shift: 5 mm).</p></div>' +
      '<output class="sc-status" data-sc="status" aria-live="polite"></output><p data-sc="feedback" class="sc-feedback" aria-live="polite">Make a prediction, then grow. A fully defined sketch can still change when you edit a driving value.</p>' +
      '<div class="sc-readings" data-sc="readings"></div>' +
      '<details class="sc-settings"><summary>Remove a constraint, measure, or introduce duplicate control</summary>' +
      '<p>Uncheck <strong>horizontal anchor</strong>, then drag a corner horizontally. Restore it and try removing the width instead.</p>' +
      '<div class="sc-inputs"><label>Driving width (mm)<input data-sc="width" type="number" min="1" max="120" step="1" value="64"></label>' +
      '<label>Driving height (mm)<input data-sc="height" type="number" min="1" max="120" step="1" value="22"></label></div>' +
      '<fieldset><legend>Active conditions</legend><label><input data-sc="widthOn" type="checkbox" checked> Width drives size</label><label><input data-sc="heightOn" type="checkbox" checked> Height drives size</label>' +
      '<label><input data-sc="anchorX" type="checkbox" checked> Horizontal anchor</label><label><input data-sc="anchorY" type="checkbox" checked> Vertical anchor</label></fieldset>' +
      '<div class="sc-inputs"><label>Top-edge dimension<select data-sc="extra"><option value="none">None</option><option value="reference">Reference: measures width</option><option value="driving">Additional driving width</option></select></label>' +
      '<label>Additional driving width (mm)<input data-sc="extraWidth" type="number" min="1" max="120" step="1" value="64" disabled></label></div>' +
      '<div class="sc-actions"><button type="button" data-sc="agree">Match current driving width</button><button type="button" data-sc="conflict">Conflict: width + 10 mm</button><button type="button" data-sc="undo">Undo diagnostic motion</button></div>' +
      '<p data-sc="conditions"></p></details>' +
      '<p class="sc-limits"><strong>Model limits:</strong> one closed, axis-aligned rectangle with four variables: left x, right x, bottom y, top y. Its rectangular shape and orientation are built in. Dimensions and dragged sizes stay within 1–120 mm. No rotation, extra entities or general CAD solver. This lab distinguishes mathematical independence and contradiction; it does not reproduce SOLIDWORKS or Onshape conflict handling.</p>';
    root.appendChild(live); root.classList.add('sc-live');
    function el(key) { return live.querySelector('[data-sc="' + key + '"]'); }
    function number(x) { return String(Math.round(x * 100) / 100); }
    function fit() {
      var base = M.initial(s.anchor), xmin = Math.min(-50, g[0] - 10, base[0] - 10), xmax = Math.max(130, g[1] + 10, base[1] + 10);
      var ymin = Math.min(-30, g[2] - 10, base[2] - 10), ymax = Math.max(65, g[3] + 10, base[3] + 10);
      var scale = Math.min(2.6, 540 / (xmax - xmin), 250 / (ymax - ymin));
      frame = { scale: scale, ox: 300 - (xmin + xmax) * scale / 2, oy: 155 + (ymin + ymax) * scale / 2 };
      live.querySelector('.sc-axes').setAttribute('d', 'M20 ' + frame.oy + 'H580M' + frame.ox + ' 20V290');
      live.querySelector('.sc-origin').setAttribute('d', 'M' + (frame.ox - 6) + ' ' + frame.oy + 'h12M' + frame.ox + ' ' + (frame.oy - 6) + 'v12');
    }
    function rect(node, q) {
      node.setAttribute('x', frame.ox + q[0] * frame.scale); node.setAttribute('y', frame.oy - q[3] * frame.scale);
      node.setAttribute('width', (q[1] - q[0]) * frame.scale); node.setAttribute('height', (q[3] - q[2]) * frame.scale);
    }
    function readInputs() {
      ['width', 'height', 'extraWidth'].forEach(function (key) { s[key] = el(key).value.trim() === '' ? NaN : Number(el(key).value); });
      ['widthOn', 'heightOn', 'anchorX', 'anchorY'].forEach(function (key) { s[key] = el(key).checked; });
      s.anchor = el('anchor').value; s.extra = el('extra').value;
    }
    function sync() {
      Object.keys(s).forEach(function (key) { var node = el(key); if (!node) return; if (node.type === 'checkbox') node.checked = s[key]; else node.value = s[key]; });
    }
    function render(message) {
      var result = M.evaluate(s, g);
      if (result.ok) g = result.geometry;
      fit();
      rect(live.querySelector('.sc-shape'), g); rect(live.querySelector('.sc-baseline'), M.initial(s.anchor));
      ['lower', 'upper'].forEach(function (corner) {
        var node = live.querySelector('[data-corner="' + corner + '"]'), ix = corner === 'lower' ? 0 : 1, iy = corner === 'lower' ? 2 : 3;
        node.setAttribute('cx', frame.ox + g[ix] * frame.scale); node.setAttribute('cy', frame.oy - g[iy] * frame.scale);
        var dot = live.querySelector('[data-dot="' + corner + '"]'); dot.setAttribute('cx', node.getAttribute('cx')); dot.setAttribute('cy', node.getAttribute('cy'));
        node.setAttribute('aria-label', (corner === 'lower' ? 'Lower-left' : 'Upper-right') + ' corner at x ' + number(g[ix]) + ', y ' + number(g[iy]) + ' mm. Arrow keys test motion.');
      });
      var text;
      if (!result.ok) text = result.error;
      else text = (result.dof === 0 ? 'Fully defined — 0 DOF.' : 'Under-defined — ' + result.dof + ' DOF remain.') + ' ' + result.rank + ' independent conditions from ' + result.count + ' active equations.' + (result.redundant ? ' ' + result.redundant + ' redundant equation: no additional freedom removed.' : '');
      el('status').textContent = text; live.dataset.state = !result.ok ? 'error' : result.dof === 0 ? 'full' : 'free';
      var m = M.measurements(g);
      el('readings').innerHTML = '<div><strong>Left / right x</strong><span>' + number(g[0]) + ' / ' + number(g[1]) + ' mm</span></div>' +
        '<div><strong>Bottom / top y</strong><span>' + number(g[2]) + ' / ' + number(g[3]) + ' mm</span></div>' +
        '<div><strong>Measured size</strong><span>' + number(m.width) + ' × ' + number(m.height) + ' mm</span></div>' +
        '<div><strong>Top-edge reference</strong><span>' + (s.extra === 'reference' ? number(m.width) + ' mm — measurement only' : 'Select Reference to display') + '</span></div>';
      el('extraWidth').disabled = s.extra !== 'driving'; el('width').disabled = !s.widthOn; el('height').disabled = !s.heightOn;
      el('undo').disabled = !previous;
      var x = s.anchor === 'corner' ? 'left x = 0' : 'left x + right x = 0';
      var y = s.anchor === 'corner' ? 'bottom y = 0' : 'bottom y + top y = 0';
      el('conditions').textContent = 'Current equations: ' + [s.widthOn && 'right x − left x = ' + s.width, s.heightOn && 'top y − bottom y = ' + s.height, s.anchorX && x, s.anchorY && y, s.extra === 'driving' && 'right x − left x = ' + s.extraWidth].filter(Boolean).join('; ') + '. Reference dimensions add no equation. DOF = 4 − independent equation count for a feasible set.';
      el('feedback').textContent = message || (!result.ok ? 'The last valid drawing remains. Correct the active driving values or remove the conflicting additional condition.' : result.dof === 0 ? 'No free motion remains with these driving values. Change a driving value to test design intent.' : 'Test the remaining motion with either corner. Arrow keys request 1 mm; Shift requests 5 mm.');
      return result;
    }
    function change() { readInputs(); previous = null; render(); }
    live.addEventListener('change', function (event) {
      if (event.target === el('prediction')) return;
      if (event.target === el('anchor')) {
        var anchor = el('anchor').value; s = M.defaults(); s.anchor = anchor; g = M.initial(anchor); previous = null; sync(); el('prediction').value = '';
        render('Anchor changed; experiment reset to 64 × 22 mm with all four base conditions. Predict, then grow again.');
      } else change();
    });
    el('grow').addEventListener('click', function () {
      if (!el('prediction').value) { el('feedback').textContent = 'Choose what you predict for the left edge first.'; el('prediction').focus(); return; }
      s = M.defaults(); s.anchor = el('anchor').value; s.width = 80; g = M.initial(s.anchor); previous = null; sync();
      var correct = el('prediction').value === (s.anchor === 'corner' ? 'fixed' : 'left');
      render((correct ? 'Prediction matches. ' : 'Compare your prediction with the coordinates. ') + (s.anchor === 'corner' ? 'Left x stays 0; right x moves 64 → 80 mm.' : 'Left x moves −32 → −40 mm; right x moves 32 → 40 mm.') + ' The new driving value gives a new fully defined rectangle: still 0 DOF.');
    });
    function extra(conflict) { readInputs(); if (!s.widthOn) s.width = M.measurements(g).width; if (!Number.isFinite(s.width)) return render(); s.widthOn = true; s.extra = 'driving'; s.extraWidth = s.width + (conflict ? 10 : 0); sync(); previous = null; render(conflict ? 'Width driving is enabled. Two different driving widths cannot both be true. Change the top edge to Reference or make the values agree.' : 'Width driving is enabled. An agreeing duplicate repeats one condition. Compare equation count with independent count.'); }
    el('agree').addEventListener('click', function () { extra(false); }); el('conflict').addEventListener('click', function () { extra(true); });
    el('reset').addEventListener('click', function () { s = M.defaults(); g = M.initial('corner'); previous = null; sync(); el('prediction').value = ''; render('Reset to 64 × 22 mm with the lower-left corner anchored. Predict, then grow.'); });
    el('undo').addEventListener('click', function () { if (previous) { g = previous; previous = null; render('Diagnostic motion undone. The active constraints are unchanged.'); } });
    function move(corner, x, y) {
      var indices = corner === 'lower' ? [0, 2] : [1, 3];
      var result = M.move(s, g, indices, [x, y]);
      if (result.ok && result.moved) { if (!previous) previous = g.slice(); g = result.geometry; }
      render(!result.ok ? 'Resolve the input or constraint problem before testing motion.' : result.moved ? 'The corner moved along freedom left by the active conditions. The driving values stayed fixed. Use Undo diagnostic motion to restore it.' : 'No permitted movement in that direction within the lab’s size range. Try another direction or remove a condition.');
    }
    var svg = live.querySelector('svg');
    svg.addEventListener('keydown', function (e) {
      var corner = e.target.dataset.corner, step = e.shiftKey ? 5 : 1;
      if (!corner || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      var ix = corner === 'lower' ? 0 : 1, iy = corner === 'lower' ? 2 : 3;
      move(corner, g[ix] + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), g[iy] + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0));
    });
    svg.addEventListener('pointerdown', function (e) {
      if (!e.target.dataset.corner || e.button !== 0) return;
      e.preventDefault(); e.target.focus(); drag = { corner: e.target.dataset.corner, pointer: e.pointerId, frame: frame }; e.target.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', function (e) {
      if (!drag || drag.pointer !== e.pointerId) return;
      var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; p = p.matrixTransform(svg.getScreenCTM().inverse());
      move(drag.corner, (p.x - drag.frame.ox) / drag.frame.scale, (drag.frame.oy - p.y) / drag.frame.scale);
    });
    function release() { drag = null; }
    svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release); svg.addEventListener('lostpointercapture', release);
    render('Make a prediction, then grow. A fully defined sketch can still change when you edit a driving value.');
  });
})();

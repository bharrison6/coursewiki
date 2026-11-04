/* laminate-stacking browser behaviour. Every mount is independent; all numbers
   come from model.js and every drawing from render.js. */
(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiLaminate,
    node ? require('./render.js') : root.CourseWikiLaminateDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') {
    var start = function () { document.querySelectorAll('[data-interactive="laminate-stacking"]').forEach(api.init); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  var PRESETS = [
    ['single', 'One 0\u00b0 ply', [0]],
    ['cross-unsym', '[0/90] unsymmetric', [0, 90]],
    ['cross-sym', '[0/90]s cross-ply', [0, 90, 90, 0]],
    ['angle-unsym', '[+45/\u221245] unsymmetric', [45, -45]],
    ['angle-sym', '[\u00b145]s angle-ply', [45, -45, -45, 45]],
    ['unbalanced', '[0/+45]s unbalanced', [0, 45, 45, 0]],
    ['qi-unsym', '[0/+45/\u221245/90] unsymmetric', [0, 45, -45, 90]]
  ];
  // Quiz: in-plane quasi-isotropy depends only on how many plies of each angle
  // there are, so BOTH orderings of the 0/+45/-45/90 set are correct.
  var QUIZ = [
    { key: 'a', stack: [0, 90, 90, 0] },
    { key: 'b', stack: [45, -45, -45, 45] },
    { key: 'c', stack: [0, 45, -45, 90, 90, -45, 45, 0] },
    { key: 'd', stack: [45, 0, -45, 90, 90, -45, 0, 45] }
  ];
  function quizAnswer(stack) { return M.classify(M.laminate(stack), stack).quasiIsotropic; }
  /* Score a multi-select answer. Every option is judged on its own. */
  function scoreQuiz(selectedKeys) {
    var picked = {}; (selectedKeys || []).forEach(function (k) { picked[k] = true; });
    var results = QUIZ.map(function (q) {
      var truth = quizAnswer(q.stack);
      return { key: q.key, stack: q.stack, truth: truth, picked: !!picked[q.key], right: truth === !!picked[q.key] };
    });
    return { results: results, correct: results.filter(function (r) { return r.right; }).length, total: results.length };
  }
  function moved(list, from, to) {
    var out = list.slice(), item = out.splice(from, 1)[0]; out.splice(to, 0, item); return out;
  }
  function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function micro(v) { return M.format(v * 1e6, 1) + ' \u00b5\u03b5'; }

  function init(root) {
    if (root.dataset.lsReady || !M || !D) return;
    root.dataset.lsReady = 'true';
    var id = 'ls-' + (++sequence);
    var angles = [0], showPly = true, load = { Nx: 0, Ny: 0, Nxy: 0 }, quizChecked = false;
    var lab = document.createElement('div'); lab.className = 'ls-lab';
    lab.innerHTML =
      '<div class="ls-start"><span class="ls-kicker">TRY IT</span><strong>Stack plies, then make a laminate that is equally stiff in every direction.</strong><span>Start from one 0\u00b0 ply. Add plies and watch the stiffness rose change shape.</span></div>' +
      '<div class="ls-bench">' +
        '<div class="ls-box ls-rosebox">' +
          '<div class="ls-read"><div><span>E<sub>x</sub> at 0\u00b0</span><strong data-ls-e0></strong></div><div><span>at 45\u00b0</span><strong data-ls-e45></strong></div><div><span>at 90\u00b0</span><strong data-ls-e90></strong></div></div>' +
          '<div data-ls-rose></div>' +
          '<div class="ls-legend"><span><i></i>Flat-held</span><span data-ls-free-key hidden><i class="ls-k-free"></i>Free, M = 0</span>' +
            '<label class="ls-toggle"><input type="checkbox" data-ls-showply checked aria-label="Show the single 0 degree ply from the fiber-orientation lesson"><i class="ls-k-ply"></i>One 0\u00b0 ply</label></div>' +
        '</div>' +
        '<div class="ls-left">' +
          '<div class="ls-ctrl">' +
            '<h3>Add a ply to the bottom</h3><div class="ls-group ls-palette" role="group" aria-label="Add a ply to the bottom of the stack">' +
              M.ANGLES.map(function (a) { return '<button type="button" class="ls-add" data-ls-add="' + a + '" aria-label="Add a ' + D.angleText(a) + ' ply"><i class="ls-chip ls-' + D.angleClass(a) + '"></i>' + D.angleText(a) + '</button>'; }).join('') +
            '</div>' +
            '<div class="ls-presets"><label for="' + id + '-preset">Stack</label><select id="' + id + '-preset" data-ls-preset><option value="" data-ls-custom>Custom</option>' +
              PRESETS.map(function (p) { return '<option value="' + p[0] + '">' + esc(p[1]) + '</option>'; }).join('') + '</select></div>' +
          '</div>' +
          '<div class="ls-box ls-stackbox" data-ls-stack></div>' +
          '<p class="ls-feedback ls-status" data-ls-status role="status" aria-live="polite"></p>' +
          '<div class="ls-plylist">' +
            '<div class="ls-group ls-transforms"><button type="button" data-ls-mirror aria-label="Mirror to make the stack symmetric">Mirror</button><button type="button" data-ls-reverse aria-label="Reverse the ply order, top to bottom">Reverse ply order</button><button type="button" data-ls-reset aria-label="Reset to one 0 degree ply">Reset</button></div>' +
            '<ol class="ls-plies" data-ls-plies aria-label="Ply stack, top face first"></ol>' +
            '<p class="ls-hint">Top face first. Drag \u2630 to reorder, or focus it and press \u2191/\u2193. Up to ' + M.MAX_PLIES + ' plies of 0.125 mm.</p></div>' +
        '</div>' +
        '<div class="ls-explain"><p class="ls-note" data-ls-rose-note></p><div class="ls-badges" data-ls-badges></div></div>' +
      '</div>' +
      '<div class="ls-predict"><fieldset><legend>Predict: which stacks have the same in-plane stiffness in every direction (quasi-isotropic)? Select every one that does.</legend><div class="ls-options">' +
        QUIZ.map(function (q) { return '<label class="ls-option" data-ls-option="' + q.key + '"><input type="checkbox" value="' + q.key + '"> ' + esc(M.label(q.stack)) + '<em></em></label>'; }).join('') +
      '</div></fieldset><button type="button" class="ls-check" data-ls-check disabled>Check with the polar plots</button>' +
      '<p class="ls-feedback" data-ls-quiz-feedback role="status" aria-live="polite">Choose at least one stack.</p><div class="ls-multiples" data-ls-multiples hidden></div></div>' +
      '<div class="ls-pull"><h3>Pull on it: does the free panel stay flat?</h3>' +
        '<p class="ls-note">An in-plane force per unit edge length N (N/mm) with zero applied moment. Left: your stack. Right: its mirrored, symmetric version under the same load.</p>' +
        '<div class="ls-panels">' + panelBox('a') + panelBox('b') + '</div>' +
        '<p class="ls-note ls-panelcap" data-ls-panel-cap></p>' +
        '<div class="ls-group ls-trybar"><span>Try</span><button type="button" data-ls-try="cross-unsym" aria-label="Try [0/90] with Nx 0.5 newtons per millimetre">[0/90]</button><button type="button" data-ls-try="angle-unsym" aria-label="Try [+45/-45] with Nx 0.5 newtons per millimetre">[+45/\u221245]</button><button type="button" data-ls-pullx aria-label="Set Nx to 0.5 and the other loads to zero">Nx 0.5</button><button type="button" data-ls-zero aria-label="Zero the load">Zero</button></div>' +
        '<div class="ls-sliders">' + slider('Nx', 'N<sub>x</sub>', 'pull along x') + slider('Ny', 'N<sub>y</sub>', 'pull along y') + slider('Nxy', 'N<sub>xy</sub>', 'in-plane shear') + '</div>' +
        '<p class="ls-validity" data-ls-validity hidden></p>' +
        '<div class="ls-readouts"><p><b>Your stack:</b> <span data-ls-read-a></span></p><p><b>Mirrored:</b> <span data-ls-read-b></span></p></div>' +
        '<p class="ls-note" data-ls-scale></p>' +
      '</div>' +
      '<p class="ls-boundary">Model: classical laminate theory with thin, perfectly bonded, linear-elastic plies (E<sub>1</sub> 40, E<sub>2</sub> 10, G<sub>12</sub> 5 GPa, \u03bd<sub>12</sub> 0.30; illustrative, not a named material). Small deflections only. No strength, failure, buckling, temperature, moisture or cure warping.</p>';
    root.insertBefore(lab, root.firstChild);
    root.classList.add('ls-live');

    function slider(key, sym, title) {
      var sid = id + '-' + key;
      return '<div class="ls-slider"><label for="' + sid + '"><span>' + sym + ' <small>' + title + '</small></span><output for="' + sid + '" data-ls-out="' + key + '">0.00</output></label>' +
        '<input id="' + sid + '" type="range" min="' + (-D.LOAD_LIMIT) + '" max="' + D.LOAD_LIMIT + '" step="0.05" value="0" data-ls-load="' + key + '" aria-label="' + key + ' ' + title + ', newtons per millimetre"></div>';
    }
    function panelBox(k) {
      return '<figure class="ls-box ls-panelbox"><figcaption><b data-ls-title-' + k + '></b> <span data-ls-label-' + k + '></span></figcaption>' +
        '<div data-ls-panel-' + k + '></div><strong class="ls-sum" data-ls-sum-' + k + ' aria-live="polite"></strong></figure>';
    }
    function q(s) { return lab.querySelector(s); }
    function status(text) { q('[data-ls-status]').textContent = text; }

    function plyRows() {
      var list = q('[data-ls-plies]');
      list.innerHTML = angles.map(function (a, i) {
        var n = i + 1, last = angles.length;
        return '<li data-index="' + i + '">' +
          '<button type="button" class="ls-handle" data-ls-handle aria-label="Ply ' + n + ', ' + D.angleText(a) + '. Drag, or press up or down arrow to move">\u2630</button>' +
          '<span class="ls-plyname"><i class="ls-chip ls-' + D.angleClass(a) + '"></i><b>' + n + '</b> ' + D.angleText(a) + (n === 1 ? ' <small>top</small>' : n === last && last > 1 ? ' <small>bottom</small>' : '') + '</span>' +
          '<button type="button" data-ls-up aria-label="Move ply ' + n + ' up"' + (i === 0 ? ' disabled' : '') + '>\u2191</button>' +
          '<button type="button" data-ls-down aria-label="Move ply ' + n + ' down"' + (i === last - 1 ? ' disabled' : '') + '>\u2193</button>' +
          '<button type="button" data-ls-remove aria-label="Remove ply ' + n + '"' + (last === 1 ? ' disabled' : '') + '>\u2715</button></li>';
      }).join('');
    }
    function balancedText(c, plus, minus) {
      var pair = plus + minus === 0 ? 'No \u00b145\u00b0 plies to pair' : c.balanced ? 'Every +45\u00b0 ply has a \u221245\u00b0 partner (' + plus + ' and ' + minus + ')' : 'Unequal +45\u00b0 and \u221245\u00b0 plies (' + plus + ' and ' + minus + ')';
      if (!c.balanced) return pair + ', so A\u2081\u2086 = A\u2082\u2086 \u2260 0: even held flat, a pull along x also shears the laminate in its plane.';
      if (c.couplingZero) return pair + ', so A\u2081\u2086 = A\u2082\u2086 = 0, and B = 0 as well: a pull along x or y does not shear it, held flat or free.';
      return pair + ', so A\u2081\u2086 = A\u2082\u2086 = 0: held flat, a pull along x or y does not shear it. This stack is unsymmetric, so when free to curve, B can still couple the pull to in-plane shear and twist.';
    }
    function badge(on, name, text) {
      return '<div class="ls-badge" data-on="' + on + '"><b>' + name + '</b><span>' + text + '</span></div>';
    }
    function render() {
      var L = M.laminate(angles), c = M.classify(L, angles);
      plyRows(); syncPreset();
      q('[data-ls-stack]').innerHTML = D.stack(angles);
      q('[data-ls-rose]').innerHTML = D.rose(D.roseCurves(L, showPly, c), {
        label: 'Polar plot of flat-held in-plane modulus for ' + M.label(angles) + ': ' + M.format(c.flat.min) + ' to ' + M.format(c.flat.max) + ' GPa.' +
          (c.couplingZero ? '' : ' Dashed: free to curve, ' + M.format(c.free.min) + ' to ' + M.format(c.free.max) + ' GPa.') });
      q('[data-ls-free-key]').hidden = c.couplingZero;
      q('[data-ls-e0]').textContent = M.format(M.directionalModulus(L, 0)) + ' GPa';
      q('[data-ls-e45]').textContent = M.format(M.directionalModulus(L, 45)) + ' GPa';
      q('[data-ls-e90]').textContent = M.format(M.directionalModulus(L, 90)) + ' GPa';
      q('[data-ls-rose-note]').textContent = c.couplingZero ?
        'Radius = modulus for a pull in that direction. B = 0 here, so holding the laminate flat changes nothing.' :
        'Solid: flat-held (curvature-constrained), from A only. Dashed: the same laminate free to curve with zero moment, from the full A-B-D relation: ' + M.format(c.free.min) + '\u2013' + M.format(c.free.max) + ' GPa. A free laminate is never stiffer than a flat-held one.';
      var plus = c.balancedCount.plus45, minus = c.balancedCount.minus45;
      q('[data-ls-badges]').innerHTML =
        badge(c.symmetric, 'Symmetric', c.symmetric ? 'The sequence mirrors about the midplane, so B = 0.' : 'Not a mirror image about the midplane.') +
        badge(c.balanced, 'Balanced', balancedText(c, plus, minus)) +
        badge(c.quasiIsotropic, 'Quasi-isotropic', c.quasiIsotropic ? 'A is the same in every in-plane direction: the rose is a circle at ' + M.format(c.flat.min) + ' GPa.' : 'In-plane stiffness changes with direction: ' + M.format(c.flat.min) + '\u2013' + M.format(c.flat.max) + ' GPa.') +
        badge(!c.couplingZero, 'Coupling B \u2260 0', c.couplingZero ? 'No stretching\u2013bending coupling.' : 'Largest |B| ' + M.format(c.Bmax, 1) + ' N. A pull can bend or twist a free panel.');
      q('[data-ls-add="0"]').parentNode.querySelectorAll('button').forEach(function (b) { b.disabled = angles.length >= M.MAX_PLIES; });
      q('[data-ls-mirror]').disabled = angles.length * 2 > M.MAX_PLIES;
      renderPull(L);
    }
    function shapeWord(r) {
      var p = M.principalCurvatures(r.curvature);
      if (p.maxAbs === 0) return 'flat';
      var k = r.curvature;
      if (p.k1 * p.k2 < 0) return Math.abs(k.kx) + Math.abs(k.ky) < 1e-12 ? 'twists' : 'saddle';
      return 'curls';
    }
    function summary(r) {
      var p = M.principalCurvatures(r.curvature);
      return p.maxAbs === 0 ? 'flat' : shapeWord(r) + ', tightest radius \u2248 ' + Math.round(p.radiusMm) + ' mm';
    }
    function renderPull(L) {
      var mirroredStack = M.mirror(angles), Lm = M.laminate(mirroredStack);
      var mag = D.commonMagnification([L, Lm]);
      var ra = M.respond(L, load), rb = M.respond(Lm, load);
      q('[data-ls-panel-a]').innerHTML = D.panel(L, ra, mag, { labels: false,
        label: 'Your stack ' + M.label(angles) + ' under the applied load with zero moment: ' + summary(ra) + '. ' + D.curvatureText(ra.curvature) });
      q('[data-ls-panel-b]').innerHTML = D.panel(Lm, rb, mag, { labels: false,
        label: 'Mirrored symmetric stack ' + M.label(mirroredStack) + ' under the same load: ' + summary(rb) + '. ' + D.curvatureText(rb.curvature) });
      q('[data-ls-title-a]').textContent = 'Your stack'; q('[data-ls-title-b]').textContent = 'Mirrored';
      q('[data-ls-label-a]').textContent = M.label(angles); q('[data-ls-label-b]').textContent = M.label(mirroredStack);
      q('[data-ls-sum-a]').textContent = summary(ra); q('[data-ls-sum-b]').textContent = summary(rb);
      q('[data-ls-read-a]').textContent = readText(ra, L);
      q('[data-ls-read-b]').textContent = readText(rb, Lm);
      var zero = !load.Nx && !load.Ny && !load.Nxy;
      var loadText = ['Nx', 'Ny', 'Nxy'].filter(function (k) { return load[k]; }).map(function (k) { return k + ' ' + M.format(load[k], 2); }).join(' \u00b7 ');
      q('[data-ls-panel-cap]').textContent = (zero ? 'No load (N = 0, M = 0): both panels are flat, whatever B is.' : loadText + ' N/mm, M = 0.') + ' Height \u00d7' + mag + ' in both.';
      q('[data-ls-scale]').textContent = 'Height exaggeration \u00d7' + mag + ' is shared by both panels and fixed for these two stacks over the whole slider range, so the drawn shape grows in proportion to the load. In-plane stretch is too small to draw. ' + D.PATCH_MM + ' mm square patch; dashed outline = unloaded. Radius is the smallest principal radius of curvature.';
      var check = M.smallDeflection(ra.curvature, D.PATCH_MM / 2, L.h);
      var v = q('[data-ls-validity]');
      v.hidden = check.withinLinearRange;
      v.textContent = check.withinLinearRange ? '' : 'True height range across your patch is ' + M.format(check.reliefMm, 2) + ' mm, ' + M.format(check.ratioToThickness, 1) + '\u00d7 the ' + M.format(L.h, 3) + ' mm thickness. Linear small-deflection theory is losing accuracy here; treat the shape as a trend.';
    }
    function readText(r, L) {
      var p = M.principalCurvatures(r.curvature);
      return 'h ' + M.format(L.h, 3) + ' mm \u00b7 \u03b5x ' + micro(r.strain.ex) + ' \u00b7 \u03b3xy ' + micro(r.strain.gxy) + ' \u00b7 ' + D.curvatureText(r.curvature) +
        (p.maxAbs > 0 ? ' \u00b7 principal \u03ba\u2081 ' + D.sci(p.k1) + ', \u03ba\u2082 ' + D.sci(p.k2) + ' mm\u207b\u00b9' : '');
    }
    function presetFor(list) {
      var hit = PRESETS.filter(function (p) { return p[2].length === list.length && p[2].every(function (a, i) { return a === list[i]; }); })[0];
      return hit ? hit[0] : '';
    }
    function syncPreset() {
      var sel = q('[data-ls-preset]'), key = presetFor(angles);
      sel.querySelector('[data-ls-custom]').textContent = key ? 'Custom' : 'Custom: ' + M.label(angles);
      sel.value = key;
    }
    function setStack(next, message) {
      angles = next.slice(0, M.MAX_PLIES); render(); if (message) status(message);
    }

    /* Keep the control the learner just used where it was on screen. Results
       above it can change height (a longer stack, a wrapped status line), and
       the browser's own scroll anchoring cannot always pick a stable anchor
       when re-rendered markup is above the viewport top. This compensates by
       the measured shift only; it never scrolls to bring something else in. */
    function keepInPlace(anchor, action) {
      var before = anchor.getBoundingClientRect().top;
      action();
      if (!anchor.isConnected) return;
      var shift = anchor.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 1) window.scrollBy({ top: shift, left: 0, behavior: 'instant' });
      // Focus follows a moved ply after compensation; scroll by the minimum only if that row is off screen.
      if (pendingFocus) { var f = pendingFocus; pendingFocus = null; f(); }
    }
    var pendingFocus = null;
    lab.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      keepInPlace(b.closest('[data-ls-plies]') || b.closest('[data-ls-multiples]') || b, function () { onClick(b); });
    });
    function onClick(b) {
      var li = b.closest('li'), i = li ? Number(li.dataset.index) : -1;
      if (b.hasAttribute('data-ls-add')) {
        var a = Number(b.getAttribute('data-ls-add'));
        setStack(angles.concat([a]), D.angleText(a) + ' ply added at the bottom. ' + M.label(angles.concat([a])) + '.');
      } else if (b.hasAttribute('data-ls-up') && i > 0) { setStack(moved(angles, i, i - 1), 'Ply moved up. A is unchanged by order; B and D change.'); focusRow(i - 1, 'data-ls-up'); }
      else if (b.hasAttribute('data-ls-down') && i < angles.length - 1) { setStack(moved(angles, i, i + 1), 'Ply moved down. A is unchanged by order; B and D change.'); focusRow(i + 1, 'data-ls-down'); }
      else if (b.hasAttribute('data-ls-remove') && angles.length > 1) { var copy = angles.slice(); copy.splice(i, 1); setStack(copy, 'Ply removed. ' + M.label(copy) + '.'); focusRow(Math.min(i, copy.length - 1), 'data-ls-handle'); }
      else if (b.hasAttribute('data-ls-mirror')) setStack(M.mirror(angles), 'Mirrored: ' + M.label(M.mirror(angles)) + ' is symmetric, so B = 0.');
      else if (b.hasAttribute('data-ls-reverse')) setStack(angles.slice().reverse(), 'Ply order reversed: A and D unchanged, B changes sign, so a curl under load reverses.');
      else if (b.hasAttribute('data-ls-reset')) { load = { Nx: 0, Ny: 0, Nxy: 0 }; syncLoad(); setStack([0], 'Reset to one 0\u00b0 ply, no load.'); }
      else if (b.hasAttribute('data-ls-try')) { var p = PRESETS.filter(function (x) { return x[0] === b.getAttribute('data-ls-try'); })[0]; load = { Nx: 0.5, Ny: 0, Nxy: 0 }; syncLoad(); setStack(p[2], p[1] + ' loaded with Nx = 0.50 N/mm and zero moment.'); }
      else if (b.hasAttribute('data-ls-zero')) { load = { Nx: 0, Ny: 0, Nxy: 0 }; syncLoad(); render(); status('No load: zero force and moment give zero deformation, even when B \u2260 0.'); }
      else if (b.hasAttribute('data-ls-pullx')) { load = { Nx: 0.5, Ny: 0, Nxy: 0 }; syncLoad(); render(); status('Nx = 0.50 N/mm, zero moment.'); }
      else if (b.hasAttribute('data-ls-check')) checkQuiz();
      else if (b.hasAttribute('data-ls-load-stack')) { var s = QUIZ.filter(function (x) { return x.key === b.getAttribute('data-ls-load-stack'); })[0]; setStack(s.stack, M.label(s.stack) + ' loaded into the builder.'); q('[data-ls-quiz-feedback]').textContent = M.label(s.stack) + ' is now in the stack builder above; its rose is the one beside this button.'; }
    }
    function focusRow(index, attr) {
      var row = q('[data-ls-plies] li[data-index="' + index + '"]'); if (!row) return;
      var target = row.querySelector('[' + attr + ']:not(:disabled)') || row.querySelector('[data-ls-handle]');
      row.classList.add('ls-moved');
      pendingFocus = function () {
        target.focus({ preventScroll: true });
        var r = target.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      };
    }
    q('[data-ls-preset]').addEventListener('change', function (e) {
      var p = PRESETS.filter(function (x) { return x[0] === e.target.value; })[0];
      if (p) keepInPlace(e.target, function () { setStack(p[2], p[1] + ' loaded.'); });
    });
    q('[data-ls-showply]').addEventListener('change', function (e) { keepInPlace(e.target, function () { showPly = e.target.checked; render(); }); });
    function syncLoad() {
      lab.querySelectorAll('[data-ls-load]').forEach(function (input) {
        var k = input.getAttribute('data-ls-load'); input.value = load[k];
        var t = M.format(load[k], 2) + ' N/mm'; q('[data-ls-out="' + k + '"]').textContent = M.format(load[k], 2); input.setAttribute('aria-valuetext', t);
      });
    }
    lab.querySelectorAll('[data-ls-load]').forEach(function (input) {
      input.addEventListener('input', function () {
        var v = Math.round(Number(input.value) * 100) / 100;
        load[input.getAttribute('data-ls-load')] = Number.isFinite(v) ? v : 0;
        keepInPlace(input, function () { syncLoad(); renderPull(M.laminate(angles)); });
      });
    });
    // Keyboard reorder on the handle, and keep page-level arrow navigation out of controls.
    lab.addEventListener('keydown', function (e) {
      if (e.target.matches('input, select, button, summary')) e.stopPropagation();
      if (!e.target.hasAttribute('data-ls-handle')) return;
      var i = Number(e.target.closest('li').dataset.index);
      var list = q('[data-ls-plies]');
      if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); keepInPlace(list, function () { setStack(moved(angles, i, i - 1), 'Ply ' + (i + 1) + ' moved up to position ' + i + '.'); focusRow(i - 1, 'data-ls-handle'); }); }
      if (e.key === 'ArrowDown' && i < angles.length - 1) { e.preventDefault(); keepInPlace(list, function () { setStack(moved(angles, i, i + 1), 'Ply ' + (i + 1) + ' moved down to position ' + (i + 2) + '.'); focusRow(i + 1, 'data-ls-handle'); }); }
    });
    // Pointer drag reorder: the row follows the pointer; the drop commits once.
    var drag = null;
    q('[data-ls-plies]').addEventListener('pointerdown', function (e) {
      var h = e.target.closest('[data-ls-handle]'); if (!h || e.button > 0) return;
      var li = h.closest('li'), rows = Array.prototype.slice.call(q('[data-ls-plies]').children);
      drag = { from: Number(li.dataset.index), li: li, y0: e.clientY, mids: rows.map(function (r) { var b = r.getBoundingClientRect(); return b.top + b.height / 2; }), to: Number(li.dataset.index), id: e.pointerId };
      h.setPointerCapture(e.pointerId); li.classList.add('ls-dragging'); e.preventDefault();
    });
    q('[data-ls-plies]').addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dy = e.clientY - drag.y0, center = drag.mids[drag.from] + dy, to = 0;
      drag.mids.forEach(function (m, k) { if (center > m) to = k; });
      if (center < drag.mids[0]) to = 0;
      drag.to = Math.max(0, Math.min(angles.length - 1, to));
      drag.li.style.transform = 'translateY(' + dy + 'px)';
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag; drag = null; d.li.style.transform = ''; d.li.classList.remove('ls-dragging');
      if (d.to !== d.from) keepInPlace(q('[data-ls-plies]'), function () { setStack(moved(angles, d.from, d.to), 'Ply ' + (d.from + 1) + ' moved to position ' + (d.to + 1) + '. ' + M.label(moved(angles, d.from, d.to)) + '.'); focusRow(d.to, 'data-ls-handle'); });
    }
    q('[data-ls-plies]').addEventListener('pointerup', endDrag);
    q('[data-ls-plies]').addEventListener('pointercancel', endDrag);

    // Prediction
    q('.ls-options').addEventListener('change', function () {
      var any = lab.querySelectorAll('.ls-options input:checked').length > 0;
      q('[data-ls-check]').disabled = !any;
      if (quizChecked) { quizChecked = false; clearQuiz(); }
      q('[data-ls-quiz-feedback]').textContent = any ? 'Ready to check.' : 'Choose at least one stack.';
    });
    function clearQuiz() {
      lab.querySelectorAll('[data-ls-option]').forEach(function (o) { o.removeAttribute('data-result'); o.querySelector('em').textContent = ''; });
      q('[data-ls-multiples]').hidden = true;
    }
    function checkQuiz() {
      var keys = Array.prototype.map.call(lab.querySelectorAll('.ls-options input:checked'), function (i) { return i.value; });
      var s = scoreQuiz(keys); quizChecked = true;
      s.results.forEach(function (r) {
        var o = q('[data-ls-option="' + r.key + '"]');
        o.setAttribute('data-result', r.right ? 'right' : 'wrong');
        o.querySelector('em').textContent = (r.right ? '\u2713 ' : '\u2717 ') + (r.truth ? 'quasi-isotropic' : 'directional');
      });
      q('[data-ls-multiples]').innerHTML = s.results.map(function (r) {
        var L = M.laminate(r.stack), c = M.classify(L, r.stack);
        return '<figure>' + D.rose(D.roseCurves(L, false, c), { compact: true, label: M.label(r.stack) + ': ' + M.format(c.flat.min) + ' to ' + M.format(c.flat.max) + ' GPa' }) +
          '<figcaption>' + esc(M.label(r.stack)) + '<br>' + (c.quasiIsotropic ? 'circle, ' + M.format(c.flat.min) + ' GPa' : M.format(c.flat.min) + '\u2013' + M.format(c.flat.max) + ' GPa') +
          '<br><button type="button" data-ls-load-stack="' + r.key + '">Build this</button></figcaption></figure>';
      }).join('');
      q('[data-ls-multiples]').hidden = false;
      var both = s.results.filter(function (r) { return r.truth; }).map(function (r) { return M.label(r.stack); }).join(' and ');
      q('[data-ls-quiz-feedback]').textContent = (s.correct === s.total ? 'All four judged correctly. ' : s.correct + ' of ' + s.total + ' judged correctly. ') +
        both + ' are both quasi-isotropic: equal numbers of 0\u00b0, +45\u00b0, \u221245\u00b0 and 90\u00b0 plies make A the same in every direction, and A does not depend on the order. Cross-ply and \u00b145\u00b0 stacks are stiff in some directions and soft in others.';
    }

    syncLoad(); render();
    status('One 0\u00b0 ply: 40 GPa along the fibers, 10 GPa across, as in the fiber-orientation lesson.');
  }
  return { init: init, scoreQuiz: scoreQuiz, QUIZ: QUIZ, PRESETS: PRESETS, moved: moved };
});

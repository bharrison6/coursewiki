(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiCoolantMix,
    node ? require('./render.js') : root.CourseWikiCoolantMixDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="coolant-mix"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  function init(root) {
    if (root.dataset.cmReady || !M || !D) return;
    var id; do { id = 'cm-' + (++sequence); } while (document.getElementById(id + '-water'));
    var unit = 'L', step = 0;
    var lab = document.createElement('div'); lab.className = 'cm-lab';
    function input(key, label, value) {
      return '<label for="' + id + '-' + key + '">' + label + '<input id="' + id + '-' + key + '" data-cm-input="' + key + '" type="number" min="0" step="any" value="' + value + '"></label>';
    }
    lab.innerHTML = '<p><strong>Explore coolant concentration.</strong> All starting values are invented teaching defaults, not product recommendations. Percent means concentrate by volume; volumes are additive and mixtures uniform.</p>' +
      '<div class="cm-actions" aria-label="Lesson steps">' + ['1. Ratio ↔ percent', '2. Refractometer', '3. Correct and top up'].map(function (label, i) { return '<button type="button" data-cm-step="' + i + '" aria-controls="' + id + '-step' + i + '">' + label + '</button>'; }).join('') + '</div>' +
      '<div data-cm-panel="0" id="' + id + '-step0"><h3>Compare parts with the total mixture</h3>' + D.ratioExample() +
      '<div class="cm-fields">' + input('water', 'Water parts (water : concentrate)', 20) + input('concentrate', 'Concentrate parts (water : concentrate)', 1) + input('percent', 'Percent to convert to water : concentrate', 5) + '</div><p data-cm-ratio role="status"></p></div>' +
      '<div data-cm-panel="1" id="' + id + '-step1" hidden><h3>Multiply Brix by the product factor</h3><p>The default factor 1.0 is invented for teaching. Get the actual factor from the product data sheet. Brix is a scale reading, not automatically coolant percent.</p><div class="cm-fields">' + input('brix', 'Brix reading', 6) + input('factor', 'Product factor', 1) + '</div><p data-cm-brix role="status"></p></div>' +
      '<div data-cm-panel="2" id="' + id + '-step2" hidden><h3>Balance concentrate and total volume</h3><label>Volume unit <select data-cm-unit><option>L</option><option>US gal</option></select></label><p>Changing units converts every volume input. All volumes below use <strong data-cm-unit-label>L</strong>.</p>' +
      '<div class="cm-fields">' + input('volume', 'Starting sump volume', 100) + input('current', 'Starting concentration (%)', 3) + input('target', 'Correction target (%)', 5) + input('capacity', 'Sump capacity', 120) + '</div>' +
      '<p>This correction assumes no loss. It solves for neat concentrate when lean, or water when rich, at a larger final volume. It is a balance calculation; use the product-approved makeup method on this page.</p>' +
      '<div data-cm-correction role="status"></div><div class="cm-pair" data-cm-plots></div>' +
      '<details class="deeper"><summary>Why the denominator changes</summary><p>With V as starting volume, c and t as percent numbers: cV + 100x = t(V + x), so concentrate x = V(t − c)/(100 − t). For water y, cV = t(V + y), so y = V(c − t)/t.</p></details>' +
      '<h3>Separate experiment: replace a loss</h3><p>This experiment starts again from the starting volume and concentration above, before any correction. Well-mixed carry-out removes both ingredients; ideal water-only evaporation leaves concentrate behind.</p>' +
      '<label>Loss mechanism <select data-cm-loss><option value="carry-out">Well-mixed coolant carried out</option><option value="evaporation">Water-only evaporation (ideal)</option></select></label>' +
      '<div class="cm-fields">' + input('loss', 'Volume lost, then replaced', 20) + input('mix', 'Top-up premix concentration (%, 0 = water)', 5) + '</div>' +
      '<fieldset class="cm-predict"><legend>Predict before revealing</legend><p>After this loss, will replacing it with plain water give a concentration lower than, equal to, or higher than the starting concentration?</p>' +
      ['Lower', 'Equal', 'Higher'].map(function (label) { return '<label><input type="radio" name="' + id + '-guess" value="' + label + '"> ' + label + '</label>'; }).join('') +
      '<button type="button" data-cm-reveal disabled>Compare water and premix</button></fieldset><div data-cm-top role="status">Choose a prediction first.</div></div>' +
      '<p>Displayed results round to 2 decimal places (small nonzero values may display as 0.00). Calculations use unrounded values. Tint is a concentration cue, not a prediction of fluid colour; fill height is capped at capacity.</p>';
    root.insertBefore(lab, root.firstChild);
    var q = function (s) { return lab.querySelector(s); };
    function value(k) { var el = q('[data-cm-input="' + k + '"]'); return el.value === '' ? NaN : Number(el.value); }
    function sumpState() { return { volume: value('volume'), currentPercent: value('current'), targetPercent: value('target'), capacity: value('capacity') }; }
    function topState(mix) { return Object.assign(sumpState(), { lossVolume: value('loss'), mixPercent: mix, lossKind: q('[data-cm-loss]').value }); }
    function resetPrediction() {
      lab.querySelectorAll('input[type="radio"]').forEach(function (r) { r.checked = false; });
      q('[data-cm-reveal]').disabled = true; q('[data-cm-top]').textContent = 'Choose a prediction first.';
    }
    function update() {
      try {
        var p = M.ratioToPercent(value('water'), value('concentrate')), ratio = M.percentToRatio(value('percent'));
        q('[data-cm-ratio]').textContent = 'Ratio → ' + M.format(p) + '%. Percent → ' + M.format(ratio.water) + ':' + ratio.concentrate + ' water : concentrate.';
      } catch (e) { q('[data-cm-ratio]').textContent = e.message; }
      try { q('[data-cm-brix]').textContent = value('brix') + ' Brix × ' + value('factor') + ' = ' + M.format(M.brixToPercent(value('brix'), value('factor'))) + '% concentrate.'; }
      catch (e) { q('[data-cm-brix]').textContent = e.message; }
      try {
        var s = sumpState(), r = M.correctSump(s);
        q('[data-cm-correction]').textContent = (r.addition === 0 ? 'Already at target. No addition.' : 'Calculated addition: ' + M.format(r.addition) + ' ' + unit + ' ' + r.substance + '.') +
          ' Final: ' + M.format(r.finalVolume) + ' ' + unit + ' at ' + M.format(r.finalPercent) + '%.' + (r.exceedsCapacity ? ' Exceeds sump capacity. Do not use this addition at this capacity.' : ' Fits the entered capacity.');
        q('[data-cm-plots]').innerHTML = '<figure><figcaption>Before correction</figcaption>' + D.sump(s.volume, s.currentPercent, s.capacity, unit) + '</figure><figure><figcaption>Calculated final state</figcaption>' + D.sump(r.finalVolume, r.finalPercent, s.capacity, unit) + '</figure>';
      } catch (e) { q('[data-cm-correction]').textContent = e.message; q('[data-cm-plots]').innerHTML = ''; }
    }
    lab.querySelectorAll('[data-cm-step]').forEach(function (button) { button.addEventListener('click', function () { step = Number(button.dataset.cmStep); showStep(); }); });
    function showStep() {
      lab.querySelectorAll('[data-cm-panel]').forEach(function (p) { p.hidden = Number(p.dataset.cmPanel) !== step; });
      lab.querySelectorAll('[data-cm-step]').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.cmStep) === step)); });
    }
    lab.addEventListener('input', function (e) { if (e.target.matches('[data-cm-input]')) { update(); resetPrediction(); } });
    q('[data-cm-loss]').addEventListener('change', resetPrediction);
    q('[data-cm-unit]').addEventListener('change', function () {
      var next = q('[data-cm-unit]').value;
      ['volume', 'capacity', 'loss'].forEach(function (k) { var el = q('[data-cm-input="' + k + '"]'); if (el.value !== '' && Number.isFinite(value(k)) && value(k) >= 0) el.value = M.convertVolume(value(k), unit, next); });
      unit = next; q('[data-cm-unit-label]').textContent = unit; update(); resetPrediction();
    });
    q('.cm-predict').addEventListener('change', function () { q('[data-cm-reveal]').disabled = !q('input[type="radio"]:checked'); });
    q('[data-cm-reveal]').addEventListener('click', function () {
      var guess = q('input[type="radio"]:checked'); if (!guess) return;
      try {
        var water = M.topUp(topState(0)), premix = M.topUp(topState(value('mix'))), start = value('current');
        var answer = Math.abs(water.finalPercent - start) < 1e-10 ? 'Equal' : water.finalPercent < start ? 'Lower' : 'Higher';
        q('[data-cm-top]').innerHTML = '<p>' + (guess.value === answer ? 'Prediction confirmed. ' : 'Compare the balance: ' + answer.toLowerCase() + '. ') +
          'After loss: ' + M.format(water.afterLossVolume) + ' ' + unit + ' at ' + M.format(water.afterLossPercent) + '%. Replacing the loss with water gives ' + M.format(water.finalPercent) + '%; your premix gives ' + M.format(premix.finalPercent) + '%. Both return to ' + M.format(water.finalVolume) + ' ' + unit + '.' +
          (water.exceedsCapacity ? ' Exceeds sump capacity.' : '') + '</p><div class="cm-pair"><figure><figcaption>Water top-up</figcaption>' + D.sump(water.finalVolume, water.finalPercent, value('capacity'), unit) + '</figure><figure><figcaption>Premix top-up</figcaption>' + D.sump(premix.finalVolume, premix.finalPercent, value('capacity'), unit) + '</figure></div>';
      } catch (e) { q('[data-cm-top]').textContent = e.message; }
    });
    lab.addEventListener('keydown', function (e) { if (e.target.matches('input, select, button')) e.stopPropagation(); });
    showStep(); update(); root.dataset.cmReady = 'true'; root.classList.add('cm-live');
  }
  return { init: init };
});

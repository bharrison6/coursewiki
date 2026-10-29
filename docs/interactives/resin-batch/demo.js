(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiResinBatch);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="resin-batch"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  var sequence = 0;
  function init(root) {
    if (root.dataset.rbReady || !M) return;
    var id; do { id = 'rb-' + (++sequence); } while (document.getElementById(id + '-amount'));
    var unit = 'g';
    var lab = document.createElement('div'); lab.className = 'rb-lab';
    function number(key, label, value, minimum) {
      return '<label for="' + id + '-' + key + '">' + label + '<input id="' + id + '-' + key + '" data-rb-input="' + key + '" type="number" inputmode="decimal" step="any" min="' + minimum + '" value="' + value + '"></label>';
    }
    lab.innerHTML = '<p><strong>Two components, two meanings of “220 g”.</strong> These invented A/B values teach arithmetic. They are not a product recipe.</p>' +
      '<fieldset class="rb-predict"><legend>Predict the mass balance</legend><p>For an illustrative 10:1 A:B ratio <strong>by mass</strong>, compare a 220 g target total with starting from 220 g of A alone. Which gives more total material after adding B?</p>' +
      ['total|The 220 g target total', 'given-a|Starting from 220 g of A', 'same|Both give the same total'].map(function (option) { var p = option.split('|'); return '<label><input type="radio" name="' + id + '-prediction" value="' + p[0] + '"> ' + p[1] + '</label>'; }).join('') +
      '<button type="button" data-rb="reveal" disabled aria-controls="' + id + '-experiment">Reveal and explore</button><p data-rb="feedback" role="status">Choose a prediction first.</p></fieldset>' +
      '<div id="' + id + '-experiment" data-rb="experiment" hidden>' +
      '<div class="rb-presets" aria-label="Change illustrative specification"><span>Change illustrative specification:</span><button type="button" data-rb-preset="initial">10:1 by mass · 220 g</button><button type="button" data-rb-preset="mass">2:1 by mass · 300 g</button><button type="button" data-rb-preset="volume">2:1 by volume · 300 g</button></div>' +
      '<div class="rb-controls">' +
      '<label for="' + id + '-mode">What does the given mass mean?<select id="' + id + '-mode" data-rb="mode"><option value="total">Target total material mass</option><option value="given-a">Given component A mass</option></select></label>' +
      '<label for="' + id + '-unit">Mass unit (same physical batch)<select id="' + id + '-unit" data-rb="unit"><option value="g">g</option><option value="kg">kg</option></select></label>' +
      number('amount', 'Given mass (<span data-rb="unit-label">g</span>)', 220, 0) +
      number('tare', 'Empty container mass / tare (<span data-rb="unit-label">g</span>)', 35, 0) +
      '<label for="' + id + '-basis">Ratio basis (changes specification)<select id="' + id + '-basis" data-rb="basis"><option value="mass">A:B by mass</option><option value="volume">A:B by volume</option></select></label>' +
      number('ratio-a', 'A ratio parts', 10, 0) + number('ratio-b', 'B ratio parts', 1, 0) +
      number('density-a', 'A density (g/mL)', 1.2, 0) + number('density-b', 'B density (g/mL)', 0.8, 0) + '</div>' +
      '<p class="rb-basis-note">Changing g ↔ kg converts the given mass and tare together. Changing ratio parts or mass ↔ volume changes the illustrative specification; it is not a unit conversion or an instruction to change a product ratio.</p>' +
      '<p class="rb-error" data-rb="error" role="status"></p><div data-rb="results" aria-live="polite"></div>' +
      '<p>Displayed numbers round to at most four decimal places; very small or large numbers use scientific notation. All calculations use unrounded values. Ideal readings assume no material loss or scale error; displayed precision is not physical accuracy.</p></div>' +
      '<p>Use the actual product’s TDS/SDS for its ratio basis and processing/handling instructions. This model predicts no cure, exotherm, working time, compatibility or mixed/cured volume.</p>';
    root.insertBefore(lab, root.firstChild);
    var q = function (selector) { return lab.querySelector(selector); };
    function numeric(key) { var input = q('[data-rb-input="' + key + '"]'); return input.value === '' ? NaN : Number(input.value); }
    function value(key) { return q('[data-rb="' + key + '"]').value; }
    function state(mode, basis) {
      return { ratioA: numeric('ratio-a'), ratioB: numeric('ratio-b'), densityA: numeric('density-a'), densityB: numeric('density-b'),
        amountG: M.convertMass(numeric('amount'), unit, 'g'), tareG: M.convertMass(numeric('tare'), unit, 'g'), mode: mode || value('mode'), basis: basis || value('basis') };
    }
    function f(number) {
      if (number === 0) return '0';
      if (Math.abs(number) < 0.0001 || Math.abs(number) >= 1e7) return number.toExponential(4);
      return number.toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false });
    }
    function mass(grams) { return f(M.convertMass(grams, 'g', unit)) + ' ' + unit; }
    function balance(result, mode, max) {
      var selected = value('mode') === mode;
      return '<article data-rb-compare="' + mode + '" data-selected="' + selected + '"><h3>' + (mode === 'total' ? 'Given mass = target total' : 'Given mass = A alone') + '</h3>' +
        '<p class="rb-balance"><span class="rb-a">A ' + mass(result.massAG) + '</span> + <span class="rb-b">B ' + mass(result.massBG) + '</span> = <strong>' + mass(result.totalG) + ' material</strong></p>' +
        '<div class="rb-bar" aria-hidden="true"><span class="rb-bar-a" style="width:' + (100 * result.massAG / max) + '%"></span><span class="rb-bar-b" style="width:' + (100 * result.massBG / max) + '%"></span></div>' +
        '<p>' + (selected ? 'Selected for component volumes and scale readings below.' : 'Comparison: same entered number, different meaning.') + '</p></article>';
    }
    function render() {
      q('[data-rb="results"]').innerHTML = ''; // Invalid inputs must clear numbers AND bars.
      q('[data-rb="error"]').textContent = '';
      try {
        var s = state(), total = M.batch(Object.assign({}, s, { mode: 'total' })), given = M.batch(Object.assign({}, s, { mode: 'given-a' }));
        var r = s.mode === 'total' ? total : given;
        var byMass = M.batch(Object.assign({}, s, { basis: 'mass' })), byVolume = M.batch(Object.assign({}, s, { basis: 'volume' }));
        var working = s.basis === 'mass' ?
          '<p>For a target total, divide by <strong>a + b</strong>, the total number of ratio parts: A = ' + mass(s.amountG) + ' × ' + f(s.ratioA) + '/(' + f(s.ratioA) + ' + ' + f(s.ratioB) + ') = ' + mass(total.massAG) + '; B = ' + mass(s.amountG) + ' × ' + f(s.ratioB) + '/(' + f(s.ratioA) + ' + ' + f(s.ratioB) + ') = ' + mass(total.massBG) + '. For A alone, divide by <strong>a</strong>: B = ' + mass(s.amountG) + ' × ' + f(s.ratioB) + '/' + f(s.ratioA) + ' = ' + mass(given.massBG) + '.</p>' :
          '<p>First convert volume parts into mass weights: aρ<sub>A</sub>:bρ<sub>B</sub> = (' + f(s.ratioA) + ' × ' + f(s.densityA) + '):(' + f(s.ratioB) + ' × ' + f(s.densityB) + ') = <strong>' + f(s.ratioA * s.densityA) + ':' + f(s.ratioB * s.densityB) + '</strong>. Split the target total in these mass weights: m<sub>A</sub> = M aρ<sub>A</sub>/(aρ<sub>A</sub> + bρ<sub>B</sub>) and m<sub>B</sub> = M bρ<sub>B</sub>/(aρ<sub>A</sub> + bρ<sub>B</sub>).</p><p>For A alone, find V<sub>A</sub> = m<sub>A</sub>/ρ<sub>A</sub>, then V<sub>B</sub> = V<sub>A</sub> b/a and m<sub>B</sub> = V<sub>B</sub>ρ<sub>B</sub>. Here ' + f(given.massAG) + ' g ÷ ' + f(s.densityA) + ' g/mL = ' + f(given.volumeAMl) + ' mL of A; B needs ' + f(given.volumeBMl) + ' mL × ' + f(s.densityB) + ' g/mL = ' + mass(given.massBG) + '.</p>';
        q('[data-rb="results"]').innerHTML = '<h3>Follow the material mass</h3><p>Specification: <strong>' + f(s.ratioA) + ':' + f(s.ratioB) + ' A:B by ' + s.basis + '</strong>. The same entered ' + mass(s.amountG) + ' is interpreted two ways below.</p>' +
          '<div class="rb-comparisons">' + balance(total, 'total', Math.max(total.totalG, given.totalG)) + balance(given, 'given-a', Math.max(total.totalG, given.totalG)) + '</div>' +
          '<p>Bars share one mass scale: the full track represents ' + mass(Math.max(total.totalG, given.totalG)) + '. <span class="rb-a">A is solid</span>; <span class="rb-b">B is striped</span>. They show component mass, not container fill or cavity volume.</p>' +
          '<div class="rb-working"><h3>Why the denominator changes</h3>' + working + '</div>' +
          '<h3>Selected batch: each component’s own volume</h3><div class="rb-components"><article><h4>Component A</h4><strong>' + mass(r.massAG) + '</strong><p>' + f(r.massAG) + ' g ÷ ' + f(s.densityA) + ' g/mL = <strong>' + f(r.volumeAMl) + ' mL</strong></p></article>' +
          '<article><h4>Component B</h4><strong>' + mass(r.massBG) + '</strong><p>' + f(r.massBG) + ' g ÷ ' + f(s.densityB) + ' g/mL = <strong>' + f(r.volumeBMl) + ' mL</strong></p></article></div>' +
          '<p data-rb="equivalent">This same batch has A:B mass ratio <strong>' + f(r.massRatioAtoB) + ':1</strong> and individual component volume ratio <strong>' + f(r.volumeRatioAtoB) + ':1</strong>. These are two descriptions of the same quantities. The component volumes do not establish mixed/cured volume or cavity fill.</p>' +
          '<div class="rb-spec-compare"><h3>Keep the numbers, change the basis</h3><p>For the selected meaning of ' + mass(s.amountG) + ', specifying ' + f(s.ratioA) + ':' + f(s.ratioB) + ' <strong>by mass</strong> gives A ' + mass(byMass.massAG) + ' and B ' + mass(byMass.massBG) + '; specifying those same parts <strong>by volume</strong> gives A ' + mass(byVolume.massAG) + ' and B ' + mass(byVolume.massBG) + '.</p><p>' +
          (s.densityA === s.densityB ? 'The densities are equal, so the two numerical ratios happen to give the same batch.' : 'The densities differ: equal volume parts need not have equal mass. Keeping the numerical parts while switching basis changes the batch.') + '</p></div>' +
          '<h3>Selected batch: ideal cumulative scale readings</h3><p>Keep one container on the scale. Compare <strong>no tare</strong> (container + material) with <strong>tare once at empty</strong> (material only). Do not re-tare after A in this comparison.</p>' +
          '<ol class="rb-scale"><li><h4>Empty container</h4><p>No tare: <strong>' + mass(r.emptyGrossG) + '</strong><br>Tare once at empty: <strong>0 ' + unit + '</strong></p></li>' +
          '<li><h4>After adding A</h4><p>No tare: <strong>' + mass(r.afterAGrossG) + '</strong><br>Tare once at empty: <strong>' + mass(r.afterATaredG) + '</strong></p></li>' +
          '<li><h4>After adding B</h4><p>No tare: <strong>' + mass(r.finalGrossG) + '</strong><br>Tare once at empty: <strong>' + mass(r.finalTaredG) + '</strong></p><p>B added = ' + mass(r.massBG) + '; the final reading includes A too.</p></li></ol>';
      } catch (error) { q('[data-rb="error"]').textContent = 'No batch shown. ' + error.message; }
    }
    q('.rb-predict').addEventListener('change', function () { q('[data-rb="reveal"]').disabled = !q('input[type="radio"]:checked'); });
    q('[data-rb="reveal"]').addEventListener('click', function () {
      var guess = q('input[type="radio"]:checked'); if (!guess) return;
      q('[data-rb="feedback"]').textContent = (guess.value === 'given-a' ? 'Prediction confirmed. ' : 'Compare what 220 g includes. ') + 'A 220 g target is 200 g A + 20 g B. Starting from 220 g A needs 22 g B, giving 242 g total. The ratio stays 10:1; the given mass means something different.';
      q('[data-rb="experiment"]').hidden = false; render();
    });
    lab.addEventListener('input', function (event) { if (event.target.matches('[data-rb-input]')) render(); });
    ['mode', 'basis'].forEach(function (key) { q('[data-rb="' + key + '"]').addEventListener('change', render); });
    q('[data-rb="unit"]').addEventListener('change', function () {
      var next = value('unit');
      ['amount', 'tare'].forEach(function (key) {
        var input = q('[data-rb-input="' + key + '"]');
        // Retain invalid/blank inputs for correction rather than silently replacing them.
        if (input.value !== '' && Number.isFinite(numeric(key)) && numeric(key) >= 0) {
          try { input.value = M.convertMass(numeric(key), unit, next); } catch (error) { input.value = ''; }
        }
      });
      unit = next; lab.querySelectorAll('[data-rb="unit-label"]').forEach(function (label) { label.textContent = unit; }); render();
    });
    lab.querySelectorAll('[data-rb-preset]').forEach(function (button) { button.addEventListener('click', function () {
      var initial = button.dataset.rbPreset === 'initial';
      unit = 'g'; q('[data-rb="unit"]').value = 'g'; q('[data-rb="mode"]').value = 'total';
      q('[data-rb="basis"]').value = button.dataset.rbPreset === 'volume' ? 'volume' : 'mass';
      var values = { 'amount': initial ? 220 : 300, 'tare': 35, 'ratio-a': initial ? 10 : 2, 'ratio-b': 1, 'density-a': 1.2, 'density-b': 0.8 };
      Object.keys(values).forEach(function (key) { q('[data-rb-input="' + key + '"]').value = values[key]; });
      lab.querySelectorAll('[data-rb="unit-label"]').forEach(function (label) { label.textContent = unit; }); render();
    }); });
    root.dataset.rbReady = 'true';
  }
  return { init: init };
});

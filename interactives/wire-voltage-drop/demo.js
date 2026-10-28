(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./model.js') : root.CourseWikiWireDrop, node ? require('./render.js') : root.CourseWikiWireDropDraw);
  if (node) module.exports = api;
  else document.querySelectorAll('[data-interactive="wire-voltage-drop"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  let sequence = 0;
  function init(root) {
    if (root.dataset.wvdReady || !M || !D) return;
    let id;
    do { id = 'wvd-' + (++sequence); } while (document.getElementById(id + '-voltage'));
    const lab = document.createElement('div');
    lab.className = 'wvd-lab';
    let state = Object.assign({}, M.DEFAULT), baseline = Object.assign({}, state);
    lab.innerHTML = '<p>Predict first: what happens to heating when current doubles? Save a baseline, then change one input.</p><div class="wvd-controls">' +
      [['voltage', 'Source voltage (V)', 5, 240], ['current', 'Load current (A)', 0.1, 30], ['length', 'One-way run length', 0, 1000], ['awg', 'Wire gauge (AWG)', 4, 30]].map(c =>
        '<label for="' + id + '-' + c[0] + '">' + c[1] + '<input id="' + id + '-' + c[0] + '" data-key="' + c[0] + '" type="number" min="' + c[2] + '" max="' + c[3] + '" step="' + (c[0] === 'awg' ? '1' : 'any') + '" value="' + state[c[0]] + '"></label>').join('') +
      '<label for="' + id + '-unit">Length unit<select id="' + id + '-unit"><option value="ft">Feet (ft)</option><option value="m">Meters (m)</option></select></label></div>' +
      '<div class="wvd-actions"><button type="button" data-pin>Save baseline</button><button type="button" data-reset>Reset</button></div><p data-status role="status"></p><p data-baseline></p>' +
      '<div class="wvd-grid"><div data-figure></div><div data-results></div></div><div data-comparison></div>';
    root.prepend(lab);
    const q = selector => lab.querySelector(selector), inputs = [...lab.querySelectorAll('input')];
    function update() {
      try {
        if (inputs.some(e => e.value.trim() === '' || !e.checkValidity())) throw new RangeError('Enter values within the labeled ranges: 5–240 V, 0.1–30 A, length 0–1000, integer AWG 4–30.');
        inputs.forEach(e => { state[e.dataset.key] = Number(e.value); });
        M.solve(state);
        q('[data-figure]').innerHTML = D.diagram(state);
        q('[data-results]').innerHTML = D.results(state);
        q('[data-comparison]').innerHTML = D.comparison(state, baseline);
        q('[data-baseline]').textContent = 'Baseline: ' + baseline.voltage + ' V, ' + baseline.current + ' A, ' + M.format(baseline.length) + ' ' + baseline.unit + ' one way, AWG ' + baseline.awg + '.';
        q('[data-status]').textContent = 'Results updated. Smaller AWG numbers mean thicker wire.';
        q('[data-pin]').disabled = false;
        return true;
      } catch (error) {
        q('[data-status]').textContent = error.message;
        ['[data-figure]', '[data-results]', '[data-comparison]'].forEach(s => q(s).replaceChildren());
        q('[data-pin]').disabled = true;
        return false;
      }
    }
    inputs.forEach(e => e.addEventListener('input', update));
    lab.addEventListener('keydown', e => { if (e.target.matches('input, select, button')) e.stopPropagation(); });
    q('select').addEventListener('change', e => {
      const length = q('[data-key="length"]');
      if (length.value.trim() && length.checkValidity()) {
        const meters = Number(length.value) * (state.unit === 'ft' ? M.FT : 1);
        length.value = meters / (e.target.value === 'ft' ? M.FT : 1);
      }
      state.unit = e.target.value; update();
    });
    q('[data-pin]').addEventListener('click', () => { if (update()) { baseline = Object.assign({}, state); update(); q('[data-status]').textContent = 'Baseline saved. Change one input to compare.'; } });
    q('[data-reset]').addEventListener('click', () => {
      state = Object.assign({}, M.DEFAULT); baseline = Object.assign({}, state);
      inputs.forEach(e => { e.value = state[e.dataset.key]; }); q('select').value = state.unit; update();
    });
    update(); root.dataset.wvdReady = 'true';
  }
  return { init };
});

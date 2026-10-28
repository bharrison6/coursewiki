(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./model.js') : root.CourseWikiBeltGeometry, node ? require('./render.js') : root.CourseWikiBeltDraw);
  if (node) module.exports = api;
  else document.querySelectorAll('[data-interactive="belt-geometry"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  let sequence = 0;
  function init(root) {
    if (root.dataset.bgReady || !M || !D) return;
    let id;
    do { id = 'bg-' + (++sequence); } while (document.getElementById(id + '-D'));
    let state = Object.assign({}, M.DEFAULT);
    const lab = document.createElement('div'); lab.className = 'bg-lab';
    lab.innerHTML = '<p>Predict first: increase C without changing the pulleys. Which changes: length, wrap or speed ratio?</p><div class="bg-controls">' +
      '<label for="' + id + '-unit">Length unit<select id="' + id + '-unit" data-unit><option value="mm">Millimeters (mm)</option><option value="in">Inches (in)</option></select></label>' +
      '<label for="' + id + '-mode">Solve mode<select id="' + id + '-mode" data-mode><option value="center">Enter C → find L</option><option value="length">Enter L → find C</option></select></label>' +
      [['D','Large pitch diameter D'],['d','Small pitch diameter d'],['C','Center distance C'],['L','Chosen pitch length L'],['n','Small-pulley speed (r/min)']].map(([key,label]) => '<label for="' + id + '-' + key + '">' + label + '<input id="' + id + '-' + key + '" data-key="' + key + '" type="number" min="0" step="any" value="' + state[key] + '"></label>').join('') +
      '</div><button type="button" data-reset>Reset example</button><p data-status role="status"></p><div class="bg-grid"><div data-figure></div><div data-results></div></div>';
    root.prepend(lab);
    const q = selector => lab.querySelector(selector), inputs = [...lab.querySelectorAll('input')];
    function sync() {
      inputs.forEach(e => { e.value = state[e.dataset.key]; e.disabled = e.dataset.key === (state.mode === 'center' ? 'L' : 'C'); });
      q('[data-unit]').value = state.unit; q('[data-mode]').value = state.mode;
    }
    function update() {
      try {
        inputs.filter(e => !e.disabled).forEach(e => {
          if (e.value.trim() === '' || !e.checkValidity()) throw new RangeError('Enter a number in every active field.');
          state[e.dataset.key] = Number(e.value);
        });
        const r = M.solve(state); state.C = r.C; state.L = r.L;
        q('[data-key="' + (state.mode === 'center' ? 'L' : 'C') + '"]').value = state.mode === 'center' ? r.L : r.C;
        q('[data-figure]').innerHTML = D.diagram(state); q('[data-results]').innerHTML = D.results(state);
        q('[data-status]').textContent = 'Results updated. All length inputs use ' + state.unit + '. Speeds assume no slip.';
        return true;
      } catch (error) {
        q('[data-status]').textContent = error.message;
        q('[data-figure]').replaceChildren(); q('[data-results]').replaceChildren();
        inputs.filter(e => e.disabled).forEach(e => { e.value = ''; });
        return false;
      }
    }
    inputs.forEach(e => e.addEventListener('input', update));
    lab.addEventListener('keydown', e => { if (e.target.matches('input, select, button')) e.stopPropagation(); });
    q('[data-unit]').addEventListener('change', e => {
      if (!update()) { e.target.value = state.unit; return; }
      state = M.convert(state, e.target.value); sync(); update();
    });
    q('[data-mode]').addEventListener('change', e => {
      if (!update()) { e.target.value = state.mode; return; }
      state.mode = e.target.value; sync(); update();
    });
    q('[data-reset]').addEventListener('click', () => { state = Object.assign({}, M.DEFAULT); sync(); update(); });
    sync(); update(); root.dataset.bgReady = 'true';
  }
  return { init };
});

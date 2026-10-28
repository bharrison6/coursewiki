(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./model.js') : root.CourseWikiBearingLife, node ? require('./render.js') : root.CourseWikiBearingLifeDraw);
  if (node) module.exports = api;
  else document.querySelectorAll('[data-interactive="bearing-life"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  let sequence = 0;
  function init(root) {
    if (root.dataset.blReady || !M || !D) return;
    let id;
    do { id = 'bl-' + (++sequence); } while (document.getElementById(id + '-type'));
    const lab = document.createElement('div'); lab.className = 'bl-lab';
    lab.innerHTML = '<p>Predict first: how much life remains when load doubles? Try P = 2, then P = 4 kN.</p><div class="bl-controls"><label for="' + id + '-type">Bearing type<select id="' + id + '-type"><option value="ball">Ball (p = 3)</option><option value="roller">Roller (p = 10/3)</option></select></label>' +
      [['C', 'Given dynamic rating C (kN)', .1, 1000], ['P', 'Equivalent load P (kN)', .1, 1000], ['speed', 'Speed n (r/min)', 1, 100000], ['hours', 'Assumed operating hours/day', .1, 24], ['days', 'Assumed operating days/year', 1, 366]].map(c =>
        '<label for="' + id + '-' + c[0] + '">' + c[1] + ' (' + c[2] + '–' + c[3] + ')<input id="' + id + '-' + c[0] + '" data-key="' + c[0] + '" type="number" min="' + c[2] + '" max="' + c[3] + '" step="any" value="' + M.DEFAULT[c[0]] + '"></label>').join('') +
      '</div><button type="button" data-reset>Reset example</button><p data-status role="status"></p><div data-results></div><div data-chart></div>';
    root.prepend(lab);
    const q = s => lab.querySelector(s), inputs = [...lab.querySelectorAll('input')];
    function update() {
      try {
        if (inputs.some(e => !e.value.trim() || !e.checkValidity())) throw new RangeError('Enter a value within each labeled range.');
        const state = { type: q('select').value };
        inputs.forEach(e => { state[e.dataset.key] = Number(e.value); });
        M.solve(state);
        q('[data-results]').innerHTML = D.results(state);
        q('[data-chart]').innerHTML = D.chart(state);
        q('[data-status]').textContent = 'Results updated. Life is a statistical rating, not a guarantee.';
      } catch (e) {
        q('[data-results]').replaceChildren(); q('[data-chart]').replaceChildren();
        q('[data-status]').textContent = e.message;
      }
    }
    inputs.forEach(e => e.addEventListener('input', update));
    q('select').addEventListener('change', update);
    lab.addEventListener('keydown', e => { if (e.target.matches('input,select,button')) e.stopPropagation(); });
    q('[data-reset]').addEventListener('click', () => { inputs.forEach(e => { e.value = M.DEFAULT[e.dataset.key]; }); q('select').value = M.DEFAULT.type; update(); });
    update(); root.dataset.blReady = 'true';
  }
  return { init };
});

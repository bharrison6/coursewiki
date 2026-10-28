(function () {
  'use strict';
  const model = window.CourseWikiHoleCallout;
  if (!model) return;
  document.querySelectorAll('[data-interactive="hole-callout"]').forEach(root => {
    if (root.dataset.hcReady) return;
    root.dataset.hcReady = 'true';
    const live = document.createElement('div');
    live.className = 'hc-live';
    const field = (name, label, value, min = '.010', max = '4', step = '.001') =>
      `<label data-hc-field="${name}"><span>${label}</span><input data-hc="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
    live.innerHTML = `<div class="hc-controls"><label>Hole type<select data-hc="type"><option value="through">Through</option><option value="blind">Blind</option><option value="counterbore" selected>Counterbore</option><option value="countersink">Countersink</option><option value="spotface">Spotface (stated depth)</option></select></label>${field('count','Number of holes',2,1,12,1)}${field('diameter','Main diameter (in)', '.300')}${field('thickness','Part thickness (in)', '.800')}${field('recess','Recess diameter (in)', '.600')}${field('depth','Depth (in)', '.150')}${field('angle','Included angle (degrees)',90,30,150,1)}<button type="button" data-hc-reset>Reset example</button></div><p class="hc-error" role="status" aria-live="polite"></p><div class="hc-result"><pre class="hc-callout" aria-label="Hole callout"></pre><p class="hc-reading" aria-live="polite"></p><div class="hc-figure"></div><p class="hc-note"></p></div>`;
    root.append(live);
    function update() {
      const values = {};
      live.querySelectorAll('[data-hc]').forEach(input => { values[input.dataset.hc] = input.value; });
      const recess = ['counterbore', 'countersink', 'spotface'].includes(values.type);
      live.querySelector('[data-hc-field="depth"] span').textContent = values.type === 'blind' ? 'Full-diameter depth (in)' : 'Recess depth (in)';
      for (const [name, visible] of [['recess', recess], ['depth', ['blind', 'counterbore', 'spotface'].includes(values.type)], ['angle', values.type === 'countersink']]) {
        const label = live.querySelector(`[data-hc-field="${name}"]`);
        label.hidden = !visible;
        label.querySelector('input').disabled = !visible;
      }
      const result = model.calculate(values);
      live.querySelector('.hc-error').textContent = result.ok ? '' : result.errors.join(' ');
      live.querySelector('.hc-result').hidden = !result.ok;
      if (!result.ok) return;
      live.querySelector('.hc-callout').textContent = result.lines.join('\n');
      live.querySelector('.hc-reading').textContent = result.reading;
      live.querySelector('.hc-figure').innerHTML = model.sketch(result);
      live.querySelector('.hc-note').textContent = 'Ideal section; locations and tolerances are not specified here. ' +
        (values.type === 'blind' ? 'The point is illustrated at an assumed 118°; the callout depth stops at full diameter.' : '') +
        (values.type === 'countersink' ? `The cone is ${model.inch(result.recessDepth)} in deep, calculated from the two diameters and included angle; this is not an extra callout requirement.` : '') +
        (values.type === 'spotface' ? 'This example explicitly specifies depth. SPOTFACE is written out here; the symbol with SF inside it is shown above. With no depth specified, do not infer a number from the sketch.' : '');
    }
    live.addEventListener('input', update);
    live.querySelector('[data-hc-reset]').addEventListener('click', () => {
      live.querySelectorAll('[data-hc]').forEach(input => { input.value = model.defaults[input.dataset.hc]; });
      update();
    });
    update();
  });
})();

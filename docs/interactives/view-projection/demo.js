(function () {
  'use strict';
  const model = window.CourseWikiViewProjection, render = window.CourseWikiViewProjectionRender;
  if (!model || !render) return;
  document.querySelectorAll('[data-interactive="view-projection"]').forEach(root => {
    if (root.dataset.vpReady) return;
    const controls = root.querySelector('.vp-controls'), live = root.querySelector('.vp-live');
    if (!controls || !live) return;
    controls.innerHTML = `<label>Part <select data-vp-part>${model.parts.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
      <label>Predict this view <select data-vp-view><option value="front">Front</option><option value="top">Top</option><option value="right">Right</option></select></label>
      <label>Layout <select data-vp-angle><option value="third">Third-angle</option><option value="first">First-angle</option></select></label>
      <label><input type="checkbox" data-vp-guides> Show alignment guides</label>
      <button type="button" data-vp-reveal>Reveal predicted view</button>`;
    live.innerHTML = '<div class="vp-pictorial"></div><div class="vp-views"></div><p class="vp-feedback" aria-live="polite"></p>';
    const partSelect = controls.querySelector('[data-vp-part]'), viewSelect = controls.querySelector('[data-vp-view]');
    const angleSelect = controls.querySelector('[data-vp-angle]'), guides = controls.querySelector('[data-vp-guides]');
    const button = controls.querySelector('[data-vp-reveal]');
    let revealed = false;
    function update() {
      const part = model.parts.find(p => p.id === partSelect.value), view = viewSelect.value, angle = angleSelect.value;
      live.querySelector('.vp-pictorial').innerHTML = render.pictorial(part);
      live.querySelector('.vp-views').innerHTML = render.drawing(part, angle, revealed ? '' : view, guides.checked);
      live.querySelector('.vp-feedback').textContent = (revealed ? model.explain(part, view) : `Predict the ${view} outline and step edges, then reveal it.`) +
        (angle === 'third' ? ' Third-angle: top above front; right view on the right.' : ' First-angle: top below front; right view on the left.');
      button.textContent = revealed ? 'Hide view and predict again' : 'Reveal predicted view';
    }
    [partSelect, viewSelect].forEach(control => control.addEventListener('change', () => { revealed = false; update(); }));
    [angleSelect, guides].forEach(control => control.addEventListener('change', update));
    button.addEventListener('click', () => { revealed = !revealed; update(); });
    update();
    controls.hidden = false; live.hidden = false;
    root.dataset.vpReady = 'true';
  });
})();

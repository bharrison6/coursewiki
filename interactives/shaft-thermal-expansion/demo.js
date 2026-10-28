(function () {
  'use strict';
  document.querySelectorAll('[data-interactive="shaft-thermal-expansion"]').forEach(function (root) {
    if (root.dataset.stReady) return;
    root.dataset.stReady = 'true';
    const heat = root.querySelector('[data-st-heat]');
    const mode = root.querySelector('[data-st-mode]');
    const travel = root.querySelector('[data-st-travel]');
    const picture = root.querySelector('[data-st-picture]');
    const output = root.querySelector('[data-st-output]');
    function update() {
      const state = window.CourseWikiShaftThermal.calculate(Number(heat.value), mode.value, Number(travel.value));
      const coldEnd = 550, scale = 140;
      const actualEnd = coldEnd + scale * state.accommodated;
      const freeEnd = coldEnd + scale * state.free;
      root.querySelector('[data-st-heat-label]').textContent = heat.value + '%';
      travel.disabled = mode.value === 'fixed';
      output.textContent = state.limited
        ? 'Axial restraint: ' + Math.round(state.restrained * 100) + '% of maximum free growth cannot be accommodated. This is a displacement mismatch, not a force value.'
        : state.free === 0 ? 'No heating: no thermal growth or thermal restraint in this ideal model.'
        : 'The floating support accommodates all of the thermal growth. The shaft remains radially supported.';
      picture.innerHTML = '<svg viewBox="0 0 800 260" role="img" aria-label="Schematic shaft expansion: dashed free length versus solid constrained length">' +
        '<text x="25" y="30">Left: locating</text><text x="450" y="30">Right: ' + (mode.value === 'fixed' ? 'locating' : 'floating') + '</text>' +
        '<path class="st-housing" d="M120 65V185M150 65V185M530 65H720V185H530"/>' +
        '<rect class="st-free" x="80" y="95" width="' + (freeEnd-80) + '" height="65"/>' +
        '<rect class="st-shaft" x="80" y="110" width="' + (actualEnd-80) + '" height="35"/>' +
        '<path class="st-bearing" d="M135 85V170M' + actualEnd + ' 85V170"/>' +
        '<text x="25" y="215">Solid: constrained shaft</text><text x="400" y="215">Dashed: free expansion</text>' +
        '<text x="25" y="247">Growth exaggerated; housing stays at its original length.</text></svg>';
    }
    heat.addEventListener('input', update);
    mode.addEventListener('change', update);
    travel.addEventListener('change', update);
    update();
    root.querySelector('.st-live').hidden = false;
  });
})();

(function () {
  'use strict';
  const model = globalThis.CourseWikiWoodMovement, render = globalThis.CourseWikiWoodMovementRender;
  if (!model || !render) return;
  document.querySelectorAll('[data-interactive="wood-movement"]').forEach(function (root) {
    if (root.dataset.wmReady) return;
    const live = document.createElement('div');
    live.className = 'wm-live';
    live.innerHTML = `<p class="wm-heading"><strong>Same board. Different fixed point.</strong></p>
      <p data-wm-context></p>
      <div class="wm-first wm-controls">
        <label>Service moisture content (%)<input data-wm="finalMC" type="number" min="6" max="14" step="any" value="11" required></label>
        <label>Predict right-edge travel<select data-wm-prediction><option value="">Center fixed, compared with left edge fixed…</option><option value="half">Half as far</option><option value="same">The same distance</option><option value="zero">No movement</option></select></label>
      </div>
      <div class="wm-actions"><button type="button" data-wm-apply>Apply moisture change</button><button type="button" data-wm-reset>Reset example</button></div>
      <p class="wm-feedback" data-wm-feedback role="status" aria-live="polite" aria-atomic="true">Predict, then apply the moisture change.</p>
      <p class="wm-result" data-wm-result></p>
      <div class="wm-comparison" data-wm-comparison></div>
      <p class="wm-legend">Dashed outline: installed width. Solid board and dots: free movement. Triangle: fixed reference. Shaded windows: clear travel on the stationary support.</p>
      <p class="wm-legend">Movement and travel windows are enlarged equally in both drawings; board widths are schematic. Edge dots are ideal tracking points, not a hardware layout.</p>
      <details class="wm-settings"><summary>Change installation and available travel</summary>
        <div class="wm-controls">
          <label>Species<select data-wm="speciesIndex">${model.species.map((s, i) => `<option value="${i}"${s.name === 'Fir, white' ? ' selected' : ''}>${s.name}</option>`).join('')}</select></label>
          <label>Width direction<select data-wm="orientation"><option value="flat-width">Flat-sawn width (tangential)</option><option value="quarter-width">Quarter-sawn width (radial)</option><option value="unknown">Unknown / mixed (use tangential)</option></select></label>
          <label>Installed width<input data-wm="dimension" type="number" min="0" step="any" value="9.15" required></label>
          <label>Dimension unit<select data-wm="unit"><option value="in">Inches (in)</option><option value="mm">Millimeters (mm)</option></select></label>
          <label>Installation moisture content (%)<input data-wm="initialMC" type="number" min="6" max="14" step="any" value="8" required></label>
          <span class="wm-field-note">Both moisture contents: 6–14%. Enter 8 for 8%, not 0.08.</span>
          <label>Outward clear travel (<span data-wm-unit>in</span>)<input data-wm="outward" type="number" min="0" step="any" value="0.04" required></label>
          <label>Inward clear travel (<span data-wm-unit>in</span>)<input data-wm="inward" type="number" min="0" step="any" value="0.02" required></label>
        </div>
        <p>Travel is measured from each edge point’s installed position, with the same allowance at both edges. + outward means away from the fixed reference; − inward means toward it. Enter clear travel directly, not total slot length.</p>
      </details>
      <p class="wm-limits">Try drying below the installation MC. Does the inward allowance still cover the travel? Every estimate starts from the installed width and MC, even after repeated changes.</p>
      <details class="wm-settings"><summary>Model, equation and source</summary>
        <p>Estimated width change ΔW = installed width × coefficient × (service MC − installation MC). Signed travel at a point (positive outward) is (distance from the fixed reference ÷ installed width) × ΔW. This geometry assumes uniform free strain and one ideal fixed reference on a stationary support.</p>
        <p>Source for moisture movement: <a href="https://research.fs.usda.gov/download/treesearch/62261.pdf#page=16">USDA Wood Handbook (2021), chapter 13, Equation 13-3</a> and Table 13-5. Coefficients are per percentage point MC; unknown orientation uses tangential. Western redcedar follows the table’s 22% fiber-saturation assumption. Actual boards and ring angles vary; these are approximate estimates, with no added correction or safety factor.</p>
        <p>A point inside an edge moves in proportion to its distance from the reference. The windows compare geometry only. Passing this check does not approve a joint: friction, fastener retention, grain irregularity, warp, support movement, strength and cracking are not calculated. When travel is exceeded the drawing still shows free movement; it does not solve the restrained board.</p>
      </details>`;
    root.append(live);
    root.classList.add('wm-ready');
    root.dataset.wmReady = 'true';
    // Native controls keep their keys when a playlist also listens for Space/arrows.
    live.addEventListener('keydown', event => {
      if (event.target.matches('input,select,button,summary')) event.stopPropagation();
    });
    const fields = Object.fromEntries([...live.querySelectorAll('[data-wm]')].map(n => [n.dataset.wm, n]));
    const result = live.querySelector('[data-wm-result]'), context = live.querySelector('[data-wm-context]');
    const comparison = live.querySelector('[data-wm-comparison]'), feedback = live.querySelector('[data-wm-feedback]');
    const prediction = live.querySelector('[data-wm-prediction]');
    let applied = false, previousUnit = fields.unit.value;
    const defaults = Object.fromEntries(Object.entries(fields).map(([k,n]) => [k,n.value]));
    function values() {
      return Object.fromEntries(Object.entries(fields).map(([k,n]) => [k, ['unit','orientation'].includes(k) ? n.value : n.value === '' ? NaN : Number(n.value)]));
    }
    function update() {
      context.textContent = ''; result.textContent = ''; comparison.innerHTML = '';
      try {
        const input = values();
        const center = model.attachmentTravel({...input, anchor:'center'});
        const edge = model.attachmentTravel({...input, anchor:'left-edge'});
        context.textContent = model.species[input.speciesIndex].name + ' · ' + fields.orientation.selectedOptions[0].textContent + ' · installed ' + render.format(input.dimension,input.unit) + ' ' + input.unit + ' at ' + input.initialMC + '% MC.';
        comparison.innerHTML = render.comparison(center,edge,!applied);
        root.dataset.wmState = applied ? 'applied' : 'installed';
        if (applied) {
          result.textContent = 'Estimated width change: ' + render.format(center.change,input.unit,true) + ' ' + input.unit + '; final width: ' + render.format(center.finalDimension,input.unit) + ' ' + input.unit + '. Same width change in both boards.';
          const exceeded = [center,edge].filter(r => r.points.some(p => p.status === 'exceeds')).map(r => r.anchor === 'center' ? 'Center fixed' : 'Left edge fixed');
          feedback.textContent = (exceeded.length ? exceeded.join(' and ') + ': estimated movement exceeds available travel.' : 'Estimated movement is within or at the available travel limits.') + ' This compares geometry only.';
        } else result.textContent = 'At installation. Apply the service MC to reveal the two movements.';
      } catch (error) {
        root.dataset.wmState = 'error';
        result.textContent = 'No estimate: ' + error.message;
        feedback.textContent = 'Correct the input to see the experiment.';
      }
    }
    Object.entries(fields).forEach(([key,field]) => field.addEventListener('input', function () {
      if (key === 'unit' && previousUnit !== field.value) {
        const factor = field.value === 'mm' ? 25.4 : 1 / 25.4;
        for (const k of ['dimension','inward','outward']) if (fields[k].value !== '') fields[k].value = String(Number(fields[k].value) * factor);
        previousUnit = field.value;
        live.querySelectorAll('[data-wm-unit]').forEach(n => { n.textContent = field.value; });
      }
      update();
    }));
    live.querySelector('[data-wm-apply]').addEventListener('click', function () {
      update();
      if (root.dataset.wmState === 'error') return;
      if (!prediction.value) { feedback.textContent = 'Choose a prediction, then apply the moisture change.'; prediction.focus(); return; }
      applied = true;
      update();
      const input = values(), noChange = input.initialMC === input.finalMC;
      const matches = noChange ? prediction.value === 'zero' : prediction.value === 'half';
      feedback.textContent = (matches ? 'Prediction matches. ' : 'Compare the two right edges. ') + (noChange ? 'Unchanged MC gives zero travel in both boards. ' : 'Center fixing puts the right edge half as far from the reference, so it travels half as far. ') + feedback.textContent;
    });
    live.querySelector('[data-wm-reset]').addEventListener('click', function () {
      for (const [k,value] of Object.entries(defaults)) fields[k].value = value;
      previousUnit = fields.unit.value; applied = false; prediction.value = '';
      live.querySelectorAll('[data-wm-unit]').forEach(n => { n.textContent = previousUnit; });
      update(); feedback.textContent = 'Predict, then apply the moisture change.';
    });
    update();
  });
})();

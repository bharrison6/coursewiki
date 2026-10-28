(function () {
  'use strict';
  const model = globalThis.CourseWikiWoodMovement;
  document.querySelectorAll('[data-interactive="wood-movement"]').forEach(function (root) {
    if (root.dataset.wmReady) return;
    root.dataset.wmReady = 'true';
    root.innerHTML = `<p><strong>Wood movement estimate</strong> — both moisture contents must be 6–14%.</p>
      <div class="wm-controls">
        <label>Species<select data-wm="speciesIndex" aria-label="Species">${model.species.map((s, i) => `<option value="${i}"${s.name === 'Fir, white' ? ' selected' : ''}>${s.name}</option>`).join('')}</select></label>
        <label>Orientation and measured direction<select data-wm="orientation" aria-label="Orientation and measured direction">
          <option value="flat-width">Flat-sawn (plain-sawn) width</option>
          <option value="quarter-width">Quarter-sawn width</option>
          <option value="flat-thickness">Flat-sawn thickness</option>
          <option value="unknown">Unknown / mixed ring orientation</option>
        </select></label>
        <label>Starting dimension<input data-wm="dimension" type="number" min="0" step="any" value="9.15" required></label>
        <label>Dimension unit<select data-wm="unit" aria-label="Dimension unit"><option value="in">Inches (in)</option><option value="mm">Millimeters (mm)</option></select></label>
        <label>Starting moisture content (%)<input data-wm="initialMC" type="number" min="6" max="14" step="any" value="8" required></label>
        <label>Final moisture content (%)<input data-wm="finalMC" type="number" min="6" max="14" step="any" value="11" required></label>
      </div>
      <p class="wm-result" role="status" aria-live="polite" aria-atomic="true" data-wm-result></p>
      <p data-wm-context></p>
      <p>Change = starting dimension × coefficient × (final MC − starting MC). Enter MC as 8 for 8%, not 0.08. Negative means shrinkage; positive means swelling. Dimensions and results use the selected unit.</p>
      <p>Commercial lumber is rarely perfectly flat- or quarter-sawn, so this method tends to overestimate width change and underestimate thickness change. The Handbook notes that the linear assumption underestimates movement by about 5%; no correction factor is added here. Unknown or mixed orientation uses the tangential coefficient.</p>
      <p>Source: USDA Wood Handbook (2021), chapter 13, Equation 13-3 and Table 13-5. Western red cedar uses the table’s assumption that shrinkage starts at 22% MC (footnote b); the estimator still requires 6–14% MC.</p>`;
    const fields = {};
    root.querySelectorAll('[data-wm]').forEach(field => { fields[field.dataset.wm] = field; });
    const result = root.querySelector('[data-wm-result]');
    const context = root.querySelector('[data-wm-context]');
    function update() {
      context.textContent = '';
      try {
        const values = {};
        Object.entries(fields).forEach(([name, field]) => {
          values[name] = ['unit', 'orientation'].includes(name) ? field.value : field.value === '' ? NaN : Number(field.value);
        });
        const r = model.calculate(values), digits = r.unit === 'in' ? 2 : 1;
        const magnitude = Math.abs(r.change).toFixed(digits);
        const change = r.change === 0 ? '0' : Number(magnitude) === 0
          ? (r.change < 0 ? 'shrinkage' : 'swelling') + ' less than ' + (r.unit === 'in' ? '0.01' : '0.1')
          : (r.change < 0 ? '−' : '+') + magnitude;
        result.textContent = 'Estimated change: ' + change + ' ' + r.unit + '; final dimension: ' + r.finalDimension.toFixed(digits) + ' ' + r.unit + '. ' +
          (r.change === 0 ? 'No movement is predicted for unchanged MC.' : 'Allow for this estimated ' + (r.change < 0 ? 'contraction' : 'expansion') + ' across the measured direction in the joint design.');
        context.textContent = model.species[values.speciesIndex].name + ', ' + fields.orientation.selectedOptions[0].textContent + ': ' + values.dimension + ' ' + r.unit + ', ' + values.initialMC + '% to ' + values.finalMC + '% MC. Using ' + r.direction + ' coefficient ' + r.coefficient.toFixed(5) + ' per percentage point MC.';
      } catch (error) { result.textContent = error.message; }
    }
    Object.values(fields).forEach(field => field.addEventListener('input', update));
    update();
  });
})();

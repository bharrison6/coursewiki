(function () {
  'use strict';
  function init(root) {
    if (root.dataset.lsReady) return;
    const live = root.querySelector('.ls-live');
    if (!live || !window.CourseWikiLeadScrew) return;
    root.dataset.lsReady = 'true';
    live.innerHTML = `<div class="ls-controls">
      <label>Units<select data-ls="units"><option value="mm">mm · N·m · N</option><option value="in">in · lbf·in · lbf</option></select></label>
      <label>Pitch (<span data-ls-pitch-unit>mm</span>)<input data-ls="pitch" type="number" min="0" step="any" value="2"></label>
      <label>Starts<input data-ls="starts" type="number" min="1" max="12" step="1" value="3"></label>
      <label>Screw speed (rpm)<input data-ls="rpm" type="number" min="0" step="any" value="300"></label>
      <label>Torque (<span data-ls-torque-unit>N·m</span>)<input data-ls="torque" type="number" min="0" step="any" value="1.2"></label>
      <label>Given efficiency (%)<input data-ls="efficiency" type="number" min="0" max="100" step="any" value="40"></label>
      </div><p class="ls-error" role="status"></p><div class="ls-results" aria-live="polite"></div>`;
    const fields = {};
    live.querySelectorAll('[data-ls]').forEach(el => { fields[el.dataset.ls] = el; });
    let units = 'mm';
    const fmt = n => n === 0 ? '0' : (Math.abs(n) < 0.001 || Math.abs(n) >= 1e8 ? n.toExponential(4) : n.toLocaleString('en-US', { maximumSignificantDigits: 6 }));
    function update() {
      const output = live.querySelector('.ls-results');
      try {
        const values = { units };
        ['pitch', 'starts', 'rpm', 'torque', 'efficiency'].forEach(key => { values[key] = fields[key].value === '' ? NaN : Number(fields[key].value); });
        const result = window.CourseWikiLeadScrew.calculate(values);
        const single = window.CourseWikiLeadScrew.calculate({ ...values, starts: 1 });
        const forceUnit = units === 'mm' ? 'N' : 'lbf';
        const torqueUnit = units === 'mm' ? 'N·m' : 'lbf·in';
        live.querySelector('.ls-error').textContent = '';
        output.innerHTML = `<p class="ls-input-summary">Current inputs: pitch ${fmt(values.pitch)} ${units}; ${values.starts} starts; ${fmt(values.rpm)} rpm; ${fmt(values.torque)} ${torqueUnit}; efficiency ${fmt(values.efficiency)}%.</p>
          <p><strong>Lead = ${fmt(values.pitch)} × ${values.starts} = ${fmt(result.lead)} ${units}/rev</strong></p>
          <div class="ls-lead-bar" aria-label="${values.starts} pitch intervals make one lead">${Array.from({ length: values.starts }, () => `<span>${fmt(values.pitch)} ${units}</span>`).join('')}</div>
          <dl class="ls-values"><div><dt>Linear speed</dt><dd>${fmt(result.speedMinute)} ${units}/min<br>${fmt(result.speedSecond)} ${units}/s</dd></div><div><dt>Theoretical force</dt><dd>${fmt(result.theoreticalForce)} ${forceUnit}</dd></div><div><dt>Actual force</dt><dd>${fmt(result.actualForce)} ${forceUnit}</dd></div></dl>
          <p>At the same pitch, rpm, torque and efficiency, <strong>one start</strong> gives lead ${fmt(single.lead)} ${units}/rev, speed ${fmt(single.speedSecond)} ${units}/s and actual force ${fmt(single.actualForce)} ${forceUnit}. Your ${values.starts}-start screw has ${values.starts}× the lead and speed, and 1/${values.starts} of the force.</p>
          <p>Efficiency changes force; it does not change travel per revolution. ${values.rpm === 0 ? 'At zero rpm these forces are algebraic estimates, not a static holding or breakaway prediction.' : 'Assumes steady travel against a resisting load, with the nut restrained from rotating.'}</p>`;
      } catch (error) {
        output.replaceChildren();
        live.querySelector('.ls-error').textContent = error.message;
      }
    }
    fields.units.addEventListener('change', () => {
      const next = fields.units.value;
      const converted = window.CourseWikiLeadScrew.convertInputs(Number(fields.pitch.value), Number(fields.torque.value), units, next);
      if (fields.pitch.value !== '' && Number.isFinite(converted.pitch)) fields.pitch.value = String(converted.pitch);
      if (fields.torque.value !== '' && Number.isFinite(converted.torque)) fields.torque.value = String(converted.torque);
      units = next;
      live.querySelector('[data-ls-pitch-unit]').textContent = units;
      live.querySelector('[data-ls-torque-unit]').textContent = units === 'mm' ? 'N·m' : 'lbf·in';
      update();
    });
    Object.entries(fields).filter(([key]) => key !== 'units').forEach(([, field]) => field.addEventListener('input', update));
    live.hidden = false;
    update();
  }
  function boot() { document.querySelectorAll('[data-interactive="lead-screw"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

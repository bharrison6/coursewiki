(function () {
  'use strict';
  function init(root) {
    if (root.dataset.ltReady) return;
    const model = globalThis.CourseWikiLumberTally;
    if (!model) return;
    root.dataset.ltReady = 'true';
    const field = (key, label, value = '') => `<label>${label}<input data-lt="${key}" type="text" value="${value}" autocomplete="off"></label>`;
    root.innerHTML = `<p>Enter the seller's stated basis and measured actual dimensions. Thickness and width are always inches; choose length units for each row. Fractions work: 3/4, 4/4 (= 1 in), 8/4 (= 2 in), or 1-1/2.</p>
      <p>BF per board = thickness × width × length ÷ 12 for length in feet, or ÷ 144 for length in inches. Row BF = quantity × BF per board. Changing length units reinterprets the entered length; enter the matching value.</p>
      <div class="lt-rows"></div><button type="button" data-lt-add>Add board row</button>
      <div class="lt-totals" role="status" aria-live="polite"></div>
      <div class="lt-controls">${field('price', 'Price per tally BF ($, optional)')}</div><p data-lt-cost role="status"></p>
      <h3>Estimate material to buy</h3><p>Saw kerf (material removed by the saw), defects, flattening and layout consume material; the allowance is your estimate.</p>
      <p>BF to buy = needed BF ÷ (1 − allowance): the allowance is the share of what you <em>buy</em> that will not become parts, so 20% means × 1.25. (&ldquo;Add 20%&rdquo; to what you need, × 1.20, is a different convention.) Enter a physical-volume need and compare the result on that same basis; it does not automatically become a seller's tally or change the cost above.</p>
      <div class="lt-controls">${field('needed', 'Needed physical volume (BF, optional)')}${field('allowance', 'Material allowance (%, optional)')}</div><p data-lt-buy role="status"></p>`;
    const rows = root.querySelector('.lt-rows');
    const get = (parent, key) => parent.querySelector(`[data-lt="${key}"]`);
    const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let serial = 0;
    function add(example = false) {
      const row = document.createElement('fieldset');
      const id = ++serial;
      row.className = 'lt-row';
      const dims = (basis, t, w, l) => `<fieldset class="lt-dimensions"><legend>${basis === 'sale' ? 'Sales basis' : 'Actual dimensions'}</legend><div class="lt-controls">${field(basis + '-thickness', 'Thickness (in)', t)}${field(basis + '-width', 'Width (in)', w)}${field(basis + '-length', 'Length', l)}</div></fieldset>`;
      row.innerHTML = `<legend>Board row ${id}${example ? ' — page example' : ''}</legend><div class="lt-controls">${field('quantity', 'Quantity', '1')}<label>Length units (both bases)<select data-lt="units"><option value="ft">Feet (divide by 12)</option><option value="in">Inches (divide by 144)</option></select></label></div>
        <label class="lt-same"><input data-lt="same" type="checkbox"> Sales basis and actual dimensions are the same</label>
        <div class="lt-bases">${dims('sale', example ? '4/4' : '', example ? '7' : '', example ? '9' : '')}${dims('actual', example ? '3/4' : '', example ? '7' : '', example ? '9' : '')}</div>
        <p class="lt-row-result" role="status"></p><button type="button" data-lt-remove>Remove board row ${id}</button>`;
      rows.append(row);
      row.querySelector('[data-lt-remove]').addEventListener('click', () => {
        row.remove(); update(); root.querySelector('[data-lt-add]').focus();
      });
      return row;
    }
    function update() {
      const results = [];
      let invalid = false;
      rows.querySelectorAll('.lt-row').forEach(row => {
        const same = get(row, 'same').checked;
        const actual = row.querySelectorAll('.lt-dimensions')[1];
        actual.disabled = same;
        actual.hidden = same;
        const data = { quantity: get(row, 'quantity').value, units: get(row, 'units').value, same };
        ['sale', 'actual'].forEach(basis => {
          data[basis] = {};
          ['thickness', 'width', 'length'].forEach(k => { data[basis][k] = get(row, basis + '-' + k).value; });
        });
        const output = row.querySelector('.lt-row-result');
        try {
          const r = model.row(data); results.push(r);
          const description = d => `${d.thickness} in × ${d.width} in × ${d.length} ${data.units}`;
          output.textContent = `${r.quantity} board(s). Sales basis: ${description(data.sale)}. Actual: ${description(same ? data.sale : data.actual)}${same ? ' (explicitly the same)' : ''}. Tally: ${fmt(r.tallyEach)} BF/board; ${fmt(r.tally)} BF for row. Physical volume: ${fmt(r.physicalEach)} BF/board; ${fmt(r.physical)} BF for row.`;
        } catch (e) { invalid = true; output.textContent = e.message; }
      });
      const totals = root.querySelector('.lt-totals');
      const cost = root.querySelector('[data-lt-cost]');
      try {
        if (invalid || !results.length) throw new RangeError('Complete every row to show totals, or remove unused rows.');
        const sum = model.total(results);
        totals.textContent = `Tally (basis you entered for the sale): ${fmt(sum.tally)} BF. Physical volume (actual dimensions): ${fmt(sum.physical)} BF.`;
        const price = get(root, 'price').value.trim();
        try { cost.textContent = price === '' ? 'Enter a price to calculate cost.' : `Cost = tally BF × price per BF = $${fmt(model.cost(sum.tally, price))} at $${price}/BF (before any other charges).`; }
        catch (e) { cost.textContent = `Price: ${e.message}`; }
      } catch (e) { totals.textContent = e.message; cost.textContent = 'Cost needs a complete tally and a price.'; }
      const needed = get(root, 'needed').value.trim(), percent = get(root, 'allowance').value.trim();
      const buy = root.querySelector('[data-lt-buy]');
      try {
        buy.textContent = needed === '' || percent === '' ? 'Enter both needed BF and an allowance to estimate BF to buy.'
          : `BF to buy = ${needed} ÷ (1 − ${model.number(percent) / 100}) = ${fmt(model.allowance(needed, percent))} BF of physical volume.`;
      } catch (e) { buy.textContent = `Allowance estimate: ${e.message}`; }
    }
    root.querySelector('[data-lt-add]').addEventListener('click', () => { const row = add(); update(); get(row, 'quantity').focus(); });
    root.addEventListener('input', update);
    root.addEventListener('change', update);
    add(true); update();
  }
  function boot() { document.querySelectorAll('[data-interactive="lumber-tally"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

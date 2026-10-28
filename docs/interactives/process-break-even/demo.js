(function () {
  'use strict';
  document.querySelectorAll('[data-interactive="process-break-even"]').forEach(function (root) {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    const input = root.querySelector('[data-volume]'), output = root.querySelector('[data-result]');
    function update() {
      const r = globalThis.CourseWikiProcessBreakEven.compare(Number(input.value));
      output.textContent = 'At ' + r.quantity + ' parts: A costs $' + r.a.toFixed(2) + ' total ($' + r.unitA.toFixed(2) + '/part); B costs $' + r.b.toFixed(2) + ' total ($' + r.unitB.toFixed(2) + '/part). ' + (r.cheaper === 'tie' ? 'Costs are equal.' : 'Process ' + r.cheaper + ' costs less.');
    }
    input.addEventListener('input', update);
    update();
  });
})();

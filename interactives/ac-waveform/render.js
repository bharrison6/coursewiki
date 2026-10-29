(function (root, factory) {
  'use strict';
  const api = factory(root.CourseWikiAcWaveform || (typeof require === 'function' ? require('./model.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiAcWaveformDrawing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (model) {
  'use strict';
  if (!model) throw new Error('The AC waveform model is required.');
  function diagram(input) {
    const result = model.analyze(input), points = model.samples(input, 241);
    const lo = Math.min(-.5, result.minimum), hi = Math.max(.5, result.maximum), span = hi - lo;
    const x = phase => 54 + phase * 580, y = value => 205 - (value - lo) * 160 / span;
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.phase).toFixed(2)} ${y(point.value).toFixed(2)}`).join(' ');
    const meanY = y(result.mean), zeroY = y(0), isDc = result.amplitude === 0;
    const windowLabels = isDc ? '<text x="54" y="237">display start</text><text x="634" y="237" text-anchor="end">display end · constant DC</text>' : '<text x="54" y="237">phase 0</text><text x="634" y="237" text-anchor="end">phase 1 · one cycle</text>';
    const extrema = isDc ? `<circle class="acw-max" cx="344" cy="${y(result.mean).toFixed(2)}" r="4"/><text x="344" y="${(y(result.mean) - 10).toFixed(2)}" text-anchor="middle">constant ${result.mean.toFixed(2)} V</text>` : `<circle class="acw-max" cx="199" cy="${y(result.maximum).toFixed(2)}" r="4"/><text x="199" y="${(y(result.maximum) - 10).toFixed(2)}" text-anchor="middle">max ${result.maximum.toFixed(2)} V</text><circle class="acw-min" cx="489" cy="${y(result.minimum).toFixed(2)}" r="4"/><text x="489" y="${(y(result.minimum) + 17).toFixed(2)}" text-anchor="middle">min ${result.minimum.toFixed(2)} V</text>`;
    return `<svg viewBox="0 0 680 250" role="img" data-cycle-count="${isDc ? 0 : 1}" aria-label="${isDc ? 'Constant DC waveform display with no oscillation period' : 'One complete cycle of a sine waveform with DC offset, zero axis and signed cycle mean'}">
      <path class="acw-axis" d="M54 25V215H640"/>
      <path class="acw-zero" d="M54 ${zeroY.toFixed(2)}H634"/><text x="48" y="${(zeroY - 5).toFixed(2)}" text-anchor="end">0 V</text>
      <path class="acw-mean" d="M54 ${meanY.toFixed(2)}H634"/><text x="638" y="${(meanY - 5).toFixed(2)}" text-anchor="end">mean ${result.mean.toFixed(2)} V</text>
      <path class="acw-wave" d="${path}"/>${windowLabels}${extrema}
    </svg>`;
  }
  return Object.freeze({ diagram });
});

(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiCoolantMix);
  if (node) module.exports = api; else root.CourseWikiCoolantMixDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function sump(volume, percent, capacity, unit) {
    var height = 120 * Math.min(1, volume / capacity);
    return '<svg class="cm-sump" viewBox="0 0 280 210" role="img" aria-label="Sump: ' + esc(M.format(volume) + ' ' + unit + ', ' + M.format(percent) + '%; capacity ' + M.format(capacity) + ' ' + unit) + '" focusable="false">' +
      '<rect class="cm-tank" x="30" y="20" width="220" height="120"/>' +
      '<rect class="cm-liquid" x="30" y="' + (140 - height) + '" width="220" height="' + height + '" fill-opacity="' + (.12 + .8 * percent / 100) + '"/>' +
      '<path class="cm-outline" d="M30 20V140H250V20"/>' +
      '<text x="140" y="165" text-anchor="middle">' + esc(M.format(volume) + ' ' + unit + ' · ' + M.format(percent) + '%') + '</text>' +
      '<text x="140" y="193" text-anchor="middle">' + (volume > capacity ? 'Exceeds capacity' : 'Capacity ' + esc(M.format(capacity) + ' ' + unit)) + '</text></svg>';
  }
  function ratioExample() {
    return '<div class="cm-pair"><p><strong>20:1 water : concentrate</strong><br>1 ÷ (20 + 1) × 100 = ' + M.format(M.ratioToPercent(20, 1)) + '%</p>' +
      '<p><strong>5.00% concentrate</strong><br>5 parts concentrate in 100 total parts.<br>95:5 = 19:1 water : concentrate.</p></div>';
  }
  function staticLesson() {
    var r = M.correctSump({ volume: 100, currentPercent: 3, targetPercent: 5, capacity: 120 });
    return '<h3>20:1 is not 5%</h3>' + ratioExample() +
      '<h3>Brix needs the product factor</h3><p>6 Brix × an invented teaching factor of 1.0 = 6.00%. Use the actual product data sheet factor.</p>' +
      '<h3>Correct a lean sump: account for the added volume</h3><p>Teaching example: 100 L at 3%, target 5%, capacity 120 L. With x litres of neat concentrate, the balance is 3 × 100 + 100x = 5(100 + x).</p>' +
      '<p>x = 100(5 − 3) ÷ (100 − 5) = <strong>' + M.format(r.addition, 4) + ' L</strong>. Final volume = ' + M.format(r.finalVolume, 4) + ' L, within capacity. Check: (3 + 2.105263…) ÷ 102.105263… × 100 = 5.00%.</p>' +
      sump(r.finalVolume, r.finalPercent, 120, 'L') +
      '<p>This is a concentrate balance, not an instruction to pour neat concentrate into a sump. Use the product-approved makeup method described on this page.</p>' +
      '<h3>Predict what water replaces</h3><p>Start with 100 L at 5%. Losing 20 L of well-mixed coolant leaves 80 L at 5%. Replace it with water: 4 L concentrate ÷ 100 L = 4%. Replace it with 5% premix: (4 + 1) ÷ 100 × 100 = 5%.</p>' +
      '<p>If instead only 20 L of water evaporates, all 5 L of concentrate remains: 5 ÷ 80 × 100 = 6.25%. Replacing that water restores 5%; adding 5% premix raises it to 6%. The loss mechanism matters.</p>';
  }
  return { sump: sump, ratioExample: ratioExample, staticLesson: staticLesson };
});

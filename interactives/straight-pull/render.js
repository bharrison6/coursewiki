(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('./model.js') : root.CourseWikiStraightPull);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiStraightPullDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  function f(n) { return String(Number(n.toFixed(6))); }
  function diagram(id, pull) {
    var profile = M.profiles.find(function (p) { return p.id === id; });
    if (!profile) throw new RangeError('Unknown fixed profile.');
    var s = profile.stations, r = M.inspect(s, pull), x = function (width) { return 250 + width * 4; }, y = function (depth) { return 200 + depth * 4; };
    function polygon(stations, offset) { return stations.map(function (p) { return f(x(-p[1])) + ',' + f(y(p[0] - offset)); }).concat(stations.slice().reverse().map(function (p) { return f(x(p[1])) + ',' + f(y(p[0] - offset)); })).join(' '); }
    var cavity = polygon(s, 0), ghost = polygon(s, pull), bands = '';
    r.positiveIntervals.forEach(function (interval) {
      var depths = [interval.start].concat(r.points.filter(function (p) { return p.depth > interval.start && p.depth < interval.end; }).map(function (p) { return p.depth; }), [interval.end]);
      [-1, 1].forEach(function (side) {
        var outer = depths.map(function (d) { return f(x(side * M.widthAt(s, Math.min(r.H, d + pull)))) + ',' + f(y(d)); });
        var inner = depths.slice().reverse().map(function (d) { return f(x(side * M.widthAt(s, d))) + ',' + f(y(d)); });
        bands += '<polygon class="sp-interference" points="' + outer.concat(inner).join(' ') + '"/>';
      });
    });
    var witness = '';
    if (r.status === 'interference') {
      var a = M.widthAt(s, r.maxDepth), b = M.widthAt(s, r.maxDepth + pull), yy = y(r.maxDepth);
      [-1,1].forEach(function (side) {
        var xx = x(side * (a+b)/2);
        witness += '<path class="sp-witness" d="M' + f(x(side*a)) + ' ' + f(yy) + 'H' + f(x(side*b)) + ' M' + f(xx-5) + ' ' + f(yy-5) + 'l10 10 m-10 0 l10 -10"/>';
      });
    }
    return '<svg class="sp-diagram" viewBox="0 0 420 430" role="img" focusable="false" aria-label="Hypothetical rigid trial pose, ' + profile.name + ', outward pull ' + f(pull) + '. Opening at depth zero; positive depth downward. ' + (r.status === 'interference' ? 'Outlined interference bands on both sides, largest at depth ' + f(r.maxDepth) + '.' : r.status === 'clear-endpoint' ? 'No interior overlap at this endpoint; inspect the full-path verdict.' : r.status === 'contact' ? 'Side contact.' : 'Side separation.') + '">' +
      '<text x="12" y="30">Hypothetical pose · pull ' + f(pull) + '</text><path class="sp-arrow" d="M395 145V70 m-8 12 8-12 8 12"/><text x="12" y="78">Outward ↑</text>' +
      '<path class="sp-mold" fill-rule="evenodd" d="M115 200H390V390H115Z M' + cavity.replace(/ /g,' L') + 'Z"/>' +
      '<line class="sp-opening" x1="115" y1="200" x2="390" y2="200"/>' +
      '<polygon class="sp-cavity" points="' + cavity + '"/><polygon class="sp-ghost" points="' + ghost + '"/>' + bands + witness +
      '<text x="5" y="198">Depth 0</text><text x="5" y="225">opening</text><text x="12" y="418">Depth 40 ↓ into mold</text></svg>';
  }
  return { diagram: diagram };
});

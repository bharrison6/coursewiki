/* Planar footprint of a round cutter: unchanged arithmetic extracted from milling-simulator. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiPlanarCut = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = 0;
    if (l2 > 0) { t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; }
    var ex = px - (ax + t * dx), ey = py - (ay + t * dy);
    return Math.sqrt(ex * ex + ey * ey);
  }
  function sdCapsule(px, py, ax, ay, bx, by, r) { return segDist(px, py, ax, ay, bx, by) - r; }
  return Object.freeze({ segDist: segDist, sdCapsule: sdCapsule });
});

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiStraightPull = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var profiles = [
    { id: 'draft', name: 'Taper toward the bottom', stations: [[0, 30], [40, 20]] },
    { id: 'parallel', name: 'Parallel sides', stations: [[0, 25], [40, 25]] },
    { id: 'reverse', name: 'Wider toward the bottom', stations: [[0, 20], [40, 30]] },
    { id: 'hook', name: 'Wide mouth with a local shoulder', stations: [[0, 30], [20, 22], [25, 26], [40, 15]] }
  ];
  profiles.forEach(function (p) { p.stations.forEach(Object.freeze); Object.freeze(p.stations); Object.freeze(p); }); Object.freeze(profiles);
  function validate(stations) {
    if (!Array.isArray(stations) || stations.length < 2) throw new RangeError('At least two profile stations are required.');
    stations.forEach(function (p, i) {
      if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || p[1] <= 0 || (i === 0 ? p[0] !== 0 : p[0] <= stations[i - 1][0])) throw new RangeError('Stations need finite positive half-widths and strictly increasing depths starting at zero.');
    });
    var H = stations[stations.length - 1][0];
    if (!Number.isFinite(H) || H <= 0) throw new RangeError('Profile depth must be finite and positive.');
    var widthScale = Math.max.apply(null, stations.map(function (p) { return p[1]; }));
    return { H: H, tolerance: Math.max(Number.MIN_VALUE, 64 * Number.EPSILON * widthScale) };
  }
  function interpolate(stations, depth) {
    for (var i = 1; i < stations.length; i++) {
      if (depth <= stations[i][0]) {
        var lo = stations[i - 1], hi = stations[i], fraction = (depth - lo[0]) / (hi[0] - lo[0]);
        if (depth <= lo[0] || lo[1] === hi[1]) return lo[1];
        if (depth >= hi[0]) return hi[1];
        // Difference form preserves constant positive subnormals. Clamp to the
        // endpoint range so interpolation roundoff cannot invent a wider station.
        var width = lo[1] + (hi[1] - lo[1]) * fraction;
        return Math.max(Math.min(lo[1], hi[1]), Math.min(Math.max(lo[1], hi[1]), width));
      }
    }
    return stations[stations.length - 1][1];
  }
  function widthAt(stations, depth) {
    var info = validate(stations);
    if (!Number.isFinite(depth) || depth < 0 || depth > info.H) throw new RangeError('Depth lies outside the profile.');
    return interpolate(stations, depth);
  }
  function inspect(stations, pull) {
    var info = validate(stations), H = info.H, tolerance = info.tolerance;
    if (!Number.isFinite(pull) || pull < 0 || pull > H) throw new RangeError('Attempted pull must be finite and between zero and full profile depth.');
    // Nonincrease at successive stations is necessary and sufficient for this
    // exact-fit, centered, rigid, fixed-orientation, outward-only 2D path.
    var rises = [], minimum = stations[0];
    for (var i = 1; i < stations.length; i++) {
      // Compare with the preceding minimum, so individually sub-tolerance
      // increments cannot accumulate into an undetected larger obstruction.
      var increase = stations[i][1] - minimum[1];
      if (increase > tolerance) rises.push({ shallow: minimum[0], deep: stations[i][0], increase: increase });
      if (stations[i][1] < minimum[1]) minimum = stations[i];
    }
    var result = { H: H, pull: pull, tolerance: tolerance, pathBlocked: rises.length > 0, rises: rises,
      points: [], positiveIntervals: [], status: 'clear-endpoint', maxDelta: 0, maxDepth: null };
    if (pull === H) return result; // No interior overlap; this does NOT clear a blocked path.
    var end = H - pull, knots = [0, end];
    stations.forEach(function (p) {
      if (p[0] > 0 && p[0] < end) knots.push(p[0]);
      var translated = p[0] - pull;
      if (translated > 0 && translated < end) knots.push(translated);
    });
    knots.sort(function (a, b) { return a - b; });
    knots = knots.filter(function (v, i) { return i === 0 || v !== knots[i - 1]; });
    result.points = knots.map(function (depth) {
      var cavityWidth = interpolate(stations, depth), patternWidth = interpolate(stations, Math.min(H, depth + pull));
      return { depth: depth, cavityWidth: cavityWidth, patternWidth: patternWidth, delta: patternWidth - cavityWidth };
    });
    var maximum = result.points.reduce(function (best, p) { return p.delta > best.delta ? p : best; });
    result.maxDelta = maximum.delta; result.maxDepth = maximum.depth;
    result.status = maximum.delta > tolerance ? 'interference' : result.points.some(function (p) { return Math.abs(p.delta) <= tolerance; }) ? 'contact' : 'separation';
    // Delta is linear on each combined-knot interval. Solve its zero crossing;
    // numerical near-zeros use the stated scale-relative tolerance, not clearance.
    for (var j = 1; j < result.points.length; j++) {
      var p = result.points[j - 1], q = result.points[j];
      var a = Math.abs(p.delta) <= tolerance ? 0 : p.delta, b = Math.abs(q.delta) <= tolerance ? 0 : q.delta;
      if (a <= 0 && b <= 0) continue;
      var start = p.depth, finish = q.depth;
      if (a < 0 || b < 0) {
        var scale = Math.max(Math.abs(a), Math.abs(b)), fraction = (Math.abs(a) / scale) / (Math.abs(a) / scale + Math.abs(b) / scale);
        var zero = p.depth * (1 - fraction) + q.depth * fraction;
        if (a < 0) start = zero; else finish = zero;
      }
      var interval = { start: start, end: finish, startClosed: a > 0, endClosed: b > 0 };
      var previous = result.positiveIntervals[result.positiveIntervals.length - 1];
      if (previous && previous.end === interval.start && previous.endClosed && interval.startClosed) {
        previous.end = interval.end; previous.endClosed = interval.endClosed;
      } else result.positiveIntervals.push(interval);
    }
    return result;
  }
  return { profiles: profiles, inspect: inspect, widthAt: widthAt };
});

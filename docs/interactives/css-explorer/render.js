(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiCSS);
  if (node) module.exports = api; else root.CourseWikiCSSDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  function n(v) { return M.format(v, 4); }
  function text(x, y, value, anchor) {
    return '<text x="' + n(x) + '" y="' + n(y) + '" text-anchor="' + (anchor || 'start') + '">' + value + '</text>';
  }
  function path(points, cls) {
    return '<path class="' + cls + '" d="' + points.map(function (p, i) { return (i ? 'L' : 'M') + n(p[0]) + ' ' + n(p[1]); }).join('') + '"/>';
  }
  function plot(s, kind, comparison) {
    var r = M.solve(s), u = M.units(s), rpm = kind === 'rpm', max = (rpm ? s.clamp : s.speed) * 1.25;
    var x = function (d) { return 48 + 252 * d / s.od; };
    var y = function (v) { return 180 - 140 * v / max; };
    var title = rpm ? 'Spindle RPM' : 'Surface speed (' + u.speed + ')';
    var out = ['<svg class="cs-plot" viewBox="0 0 320 242" role="img" aria-label="' + title + ' against diameter; solid curve includes the clamp" focusable="false">'];
    out.push(text(12, 22, title), path([[48, 40], [48, 180], [300, 180]], 'cs-axis'));
    out.push(text(40, 185, '0', 'end'), text(48, 207, '0', 'middle'), text(300, 207, M.format(s.od), 'end'));
    out.push(text(174, 232, 'Diameter (' + u.length + ')', 'middle'));
    var ceiling = rpm ? s.clamp : s.speed;
    out.push(path([[48, y(ceiling)], [300, y(ceiling)]], 'cs-limit'));
    out.push(text(300, y(ceiling) - 9, M.format(ceiling) + (rpm ? ' clamp' : ' setpoint'), 'end'));
    var diameters = Array.from({ length: 81 }, function (_, i) { return s.od * i / 80; });
    if (r.crossover < s.od) diameters.push(r.crossover);
    diameters.sort(function (a, b) { return a - b; });
    var points = diameters.map(function (d) {
      var v = M.solve(Object.assign({}, s, { diameter: d }));
      return [x(d), y(rpm ? v.rpm : v.surfaceSpeed)];
    });
    out.push(path(points, 'cs-curve'));
    if (r.crossover <= s.od) {
      out.push(path([[x(r.crossover), 92], [x(r.crossover), 180]], 'cs-cross'));
      out.push(text(Math.max(66, Math.min(282, x(r.crossover))), 114, 'D*', 'middle'));
    }
    if (rpm && comparison) {
      // Draw only the visible segment, ending with an upward arrow at the chart boundary.
      var entry = r.crossover * s.clamp / max;
      if (entry <= s.od) {
        var raw = Array.from({ length: 81 }, function (_, i) {
          var d = entry + (s.od - entry) * i / 80;
          return [x(d), y(M.solve(Object.assign({}, s, { diameter: d })).unrestricted)];
        });
        out.push(path(raw, 'cs-unclamped'));
        out.push(path([[x(entry) - 5, 48], [x(entry), 40], [x(entry) + 5, 48]], 'cs-unclamped'));
      } else out.push(text(174, 48, 'No-clamp curve above chart', 'middle'));
    }
    out.push('<circle class="cs-point" cx="' + n(x(s.diameter)) + '" cy="' + n(y(rpm ? r.rpm : r.surfaceSpeed)) + '" r="5"/>');
    out.push('</svg>'); return out.join('');
  }
  function endView(s) {
    M.validate(s);
    var tip = 120 + 76 * s.diameter / s.od;
    return '<svg class="cs-end" viewBox="0 0 320 216" role="img" aria-label="Part end view: tool tip is at radius D divided by two" focusable="false">' +
      text(12, 22, 'End view · tool moves inward') + '<circle class="cs-stock" cx="120" cy="115" r="76"/>' +
      path([[34, 115], [206, 115]], 'cs-cross') + path([[120, 32], [120, 198]], 'cs-cross') +
      '<circle class="cs-point" cx="120" cy="115" r="3"/>' +
      '<path class="cs-tool" d="M' + n(tip) + ' 115l22 -14h34v28h-34Z"/>' +
      text(12, 211, 'Centre', 'start') + text(308, 211, 'Tip radius = D/2', 'end') + '</svg>';
  }
  function staticLesson() {
    var s = Object.assign({}, M.DEFAULT, { diameter: .5 }), r = M.solve(s);
    var rows = [2, .5, 0].map(function (diameter) {
      var v = M.solve(Object.assign({}, s, { diameter: diameter }));
      return '<tr><th scope="row">' + diameter + '</th><td>' + M.format(v.rpm) + '</td><td>' + M.format(v.surfaceSpeed) + '</td><td>' + (v.clampActive ? 'Yes' : 'No') + '</td></tr>';
    }).join('');
    return '<p><strong>Worked example:</strong> 240 SFM, 2 in stock outside diameter (OD), and a 1000 RPM clamp. These are teaching values, not cutting recommendations. D* = 240 × 12 / (π × 1000) = <strong>' + M.format(r.crossover, 3) + ' in</strong>.</p>' +
      '<div class="cs-plots"><figure>' + plot(s, 'rpm', false) + '<figcaption>The dashed horizontal line is the RPM ceiling. The dot shows D = 0.5 in.</figcaption></figure><figure>' + plot(s, 'speed', false) + '<figcaption>Below D*, RPM stays at 1000 and surface speed falls linearly toward zero.</figcaption></figure></div>' +
      '<table><caption>One setpoint, three cutting diameters</caption><thead><tr><th scope="col">D (in)</th><th scope="col">RPM</th><th scope="col">SFM</th><th scope="col">Clamped?</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p>At 2 in: 240 × 12 / (π × 2) = 458.37 RPM. At 0.5 in, CSS would request 1833.46 RPM; the clamp gives 1000 RPM and π × 0.5 × 1000 / 12 = 130.90 SFM. At D = 0, the model commands the clamp RPM and surface speed is zero.</p>';
  }
  return { plot: plot, endView: endView, staticLesson: staticLesson };
});

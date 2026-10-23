(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiGears);
  if (node) module.exports = api;
  else root.CourseWikiGearsDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  var PRESSURE = Math.PI / 9, MODULE = 1;
  function n(v) { return M.format(v, 4); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function geometry(teeth) {
    if (!Number.isInteger(teeth) || teeth < 20 || teeth > 60) throw new RangeError('Drawing requires 20–60 teeth');
    var pitch = teeth * MODULE / 2;
    return { teeth: teeth, pitch: pitch, base: pitch * Math.cos(PRESSURE), tip: pitch + MODULE, root: pitch - 1.25 * MODULE };
  }
  function involute(angle) { return Math.tan(angle) - angle; }
  function halfThickness(g, radius) {
    // Slight drawing clearance (0.015 module per flank at the pitch circle).
    var angle = Math.acos(Math.min(1, g.base / radius));
    return Math.PI / (2 * g.teeth) + involute(PRESSURE) - involute(angle) - 0.015 / g.pitch;
  }
  function outline(teeth) {
    var g = geometry(teeth), points = [], start = Math.max(g.root, g.base), h0 = halfThickness(g, start);
    function point(r, a) { points.push([r * Math.cos(a), r * Math.sin(a)]); }
    for (var k = 0; k < teeth; k++) {
      var center = k * M.TAU / teeth;
      point(g.root, center - h0);
      for (var i = 0; i <= 8; i++) {
        var r = start + (g.tip - start) * i / 8; point(r, center - halfThickness(g, r));
      }
      var ht = halfThickness(g, g.tip);
      for (var j = 1; j <= 4; j++) point(g.tip, center - ht + 2 * ht * j / 4);
      for (var m = 7; m >= 0; m--) {
        var rr = start + (g.tip - start) * m / 8; point(rr, center + halfThickness(g, rr));
      }
      point(g.root, center + h0);
      for (var a = 1; a <= 4; a++) point(g.root, center + h0 + (M.TAU / teeth - 2 * h0) * a / 4);
    }
    return points;
  }
  function gearPath(teeth) {
    return outline(teeth).map(function (p, i) { return (i ? 'L' : 'M') + n(p[0]) + ' ' + n(p[1]); }).join('') + 'Z';
  }
  function layout(s) {
    var solved = M.solve(s), positions = {}, width = 640, height = s.mode === 'compound' ? 392 : 276;
    // One module/scale per diagram. Compound meshes are separate front-view planes,
    // with B and C aligned on the page and connected as an exploded shaft view.
    if (s.mode === 'compound') {
      var left = (s.a + s.b) / 2, right = (s.c + s.d) / 2;
      var extent = s.a / 2 + left + right + s.d / 2;
      var scale = Math.min(4.1, 520 / (extent + 6), 66 / (Math.max(s.a, s.b, s.c, s.d) / 2 + 1));
      var bx = (width - extent * scale) / 2 + (s.a / 2 + left) * scale;
      positions.A = { x: bx - left * scale, y: 98 };
      positions.B = { x: bx, y: 98 };
      positions.C = { x: bx, y: 288 };
      positions.D = { x: bx + right * scale, y: 288 };
      return { width: width, height: height, scale: scale, positions: positions, solved: solved };
    }
    var sum = solved.gears.reduce(function (total, g) { return total + g.teeth; }, 0);
    var scaleSimple = Math.min(4.6, 540 / (sum + 4), 92 / (Math.max.apply(null, solved.gears.map(function (g) { return g.teeth; })) / 2 + 1));
    var x = (width - sum * scaleSimple) / 2;
    solved.gears.forEach(function (g, index) {
      x += g.teeth / 2 * scaleSimple; positions[g.id] = { x: x, y: 135 }; x += g.teeth / 2 * scaleSimple;
    });
    return { width: width, height: height, scale: scaleSimple, positions: positions, solved: solved };
  }
  function text(x, y, value, cls, anchor) { return '<text x="' + n(x) + '" y="' + n(y) + '" class="gr-text ' + (cls || '') + '" text-anchor="' + (anchor || 'middle') + '">' + esc(value) + '</text>'; }
  function transform(g, turns) { return 'rotate(' + n((g.phase + turns * g.ratio * M.TAU) * 180 / Math.PI % 360) + ')'; }
  function train(s, turns) {
    turns = turns || 0;
    var plan = layout(s), solved = plan.solved, output = solved.output;
    var label = (s.mode === 'pair' ? 'Two meshing gears' : s.mode === 'idler' ? 'A drives I, which drives B' : 'A drives B; B and C share one shaft; C drives D. The two meshes are separated vertically for clarity') +
      '. A: ' + s.a + ' teeth, ' + M.format(s.rpm) + ' rpm ' + M.direction(s.rpm * s.direction) + '. Output ' + output.id + ': ' + output.teeth + ' teeth, ' + M.format(Math.abs(output.rpm)) + ' rpm ' + M.direction(output.rpm) + '.';
    var out = ['<svg class="gr-train" viewBox="0 0 ' + plan.width + ' ' + plan.height + '" role="img" aria-label="' + esc(label) + '" focusable="false">'];
    if (s.mode === 'compound') {
      var bx = plan.positions.B.x;
      out.push('<path class="gr-shaft-link" d="M' + n(bx) + ' 98V288"/>');
      out.push('<rect class="gr-shaft-note" x="' + n(bx - 112) + '" y="176" width="224" height="40" rx="6"/>');
      out.push(text(bx, 192, 'B + C: one rigid shaft', 'gr-note-strong') + text(bx, 208, 'Same speed and direction', 'gr-note-small'));
      out.push(text(18, 24, 'MESH 1', 'gr-stage', 'start') + text(622, 372, 'MESH 2', 'gr-stage', 'end'));
    }
    solved.gears.forEach(function (g, index) {
      var pos = plan.positions[g.id], geo = geometry(g.teeth), role = g.id === 'A' ? 'input' : g.id === output.id ? 'output' : 'middle';
      var radius = geo.pitch * plan.scale, hub = Math.min(radius * 0.32, 20);
      out.push('<g transform="translate(' + n(pos.x) + ' ' + n(pos.y) + ')" data-gear-position="' + g.id + '">');
      out.push('<g data-gear="' + g.id + '" data-ratio="' + g.ratio + '" data-phase="' + g.phase + '" transform="' + transform(g, turns) + '">');
      out.push('<path class="gr-gear gr-' + role + '" data-teeth="' + g.teeth + '" transform="scale(' + n(plan.scale) + ')" d="' + gearPath(g.teeth) + '"/>');
      out.push('<circle class="gr-pitch" r="' + n(radius) + '"/>');
      // Index marks start at twelve o'clock on all shafts; B and C stay aligned.
      out.push('<g transform="rotate(' + n(-g.phase * 180 / Math.PI) + ')"><path class="gr-spoke" d="M0 ' + n(-hub) + 'V' + n(-radius * .73) + '"/>' +
        '<circle class="gr-marker" cx="0" cy="' + n(-radius * .73) + '" r="4.2"/></g></g>');
      out.push('<circle class="gr-hub" r="' + n(hub) + '"/>' + text(0, 5.5, g.id, 'gr-hub-label') + '</g>');
      var labelY = s.mode === 'compound' ? (g.id === 'A' || g.id === 'B' ? 21 : 382) : 25;
      var labelX = s.mode === 'compound' ? pos.x : (index + 0.5) * 640 / solved.gears.length;
      if (s.mode !== 'compound') out.push('<path class="gr-leader" d="M' + n(labelX) + ' 33L' + n(pos.x) + ' ' + n(pos.y - radius - plan.scale - 7) + '"/>');
      out.push(text(labelX, labelY, g.id + ' · ' + g.teeth + ' teeth', 'gr-gear-label'));
      if (s.mode !== 'compound') {
        out.push(text(labelX, 245, (g.rpm > 0 ? '↻ ' : g.rpm < 0 ? '↺ ' : '') + M.format(Math.abs(g.rpm)) + ' rpm', 'gr-rpm'));
        out.push(text(labelX, 265, g.id === 'A' ? 'DRIVER / INPUT' : g.id === output.id ? 'DRIVEN / OUTPUT' : 'IDLER', 'gr-stage'));
      }
    });
    out.push('</svg>'); return out.join('');
  }
  function explanation(s) {
    var r = M.solve(s);
    if (s.mode === 'idler') return 'The idler changes direction twice: A → I → B. Its ' + s.idler + ' teeth cancel from (' + s.idler + ' ÷ ' + s.a + ') × (' + s.b + ' ÷ ' + s.idler + ').';
    if (s.mode === 'compound') return 'B and C turn together. Multiply the two reductions: (' + s.b + ' ÷ ' + s.a + ') × (' + s.d + ' ÷ ' + s.c + ') = ' + M.format(r.ratio) + '.';
    return 'B has ' + M.format(s.b / s.a) + '× as many teeth as A. Each passing tooth advances B by one tooth space; B turns ' + M.format(r.speedFactor, 3) + '× as fast, in the opposite direction.';
  }
  function staticLesson() {
    return ['pair', 'idler', 'compound'].map(function (mode, i) {
      var s = Object.assign({}, M.DEFAULT, { mode: mode }), r = M.solve(s);
      var title = ['One mesh: 2:1 reduction', 'Add an idler: still 2:1', 'Two stages: 2 × 2 = 4:1'][i];
      return '<figure class="gr-static-figure"><h3>' + title + '</h3>' + train(s, 0.25) +
        '<figcaption>' + explanation(s) + ' At 120 rpm clockwise and 2 N·m input, output ' + r.output.id + ' is ' + M.format(Math.abs(r.output.rpm)) + ' rpm ' + M.direction(r.output.rpm) +
        ' and ' + M.format(r.outputTorque) + ' N·m ideally. ' + (mode === 'compound' ? 'The two front-view meshes are separated on the page; the dashed connector represents their common shaft.' : 'The dashed circles are pitch circles, where the speeds match.') + '</figcaption></figure>';
    }).join('\n');
  }
  return { geometry: geometry, halfThickness: halfThickness, outline: outline, gearPath: gearPath,
    layout: layout, train: train, transform: transform, explanation: explanation, staticLesson: staticLesson,
    PRESSURE: PRESSURE, MODULE: MODULE };
});

/* General-purpose carbide guidance, not a machine-specific cutting recipe.
   GARR TOOL Technical, printed p.290: material-family SFM and diameter-based
   feed/tooth, with basic radial engagement about 20% of diameter.
   Kennametal Technical Information, M446: approximate volume-per-horsepower
   factors by material family/hardness. Converted below to cutting J/mm3.
   Alloy names select broad families; they do not imply alloy-specific tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCuttingData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var INCH = 25.4, HP_W = 745.6998715822702;
  var sourceCut = {
    title: 'GARR TOOL: General Purpose Milling Guide, p. 290',
    url: 'https://www.garrtool.com/wp-content/uploads/2018/11/TECHNICAL.pdf#page=8'
  };
  var sourcePower = {
    title: 'Kennametal: milling power factors, p. M446',
    url: 'https://www1.mscdirect.com/images/solutions/kennametal/millingTechInfoFormulas.pdf#page=2'
  };
  var diametersIn = [1/16, 1/8, 3/16, 1/4, 5/16, 3/8, 1/2, 5/8, 3/4, 1];
  var chipIn = {
    nonferrous: [[.0003,.0005],[.0006,.0010],[.0008,.0014],[.0012,.0020],[.0014,.0028],[.0020,.0030],[.0035,.0048],[.0050,.0060],[.0058,.0070],[.0068,.0090]],
    steel: [[.0003,.0008],[.0003,.0008],[.0005,.0010],[.0010,.0015],[.0012,.0020],[.0012,.0020],[.0014,.0024],[.0018,.0026],[.0020,.0028],[.0022,.0030]],
    stainless: [[.0003,.0006],[.0003,.0007],[.0005,.0010],[.0008,.0015],[.0009,.0013],[.0010,.0018],[.0015,.0020],[.0018,.0022],[.0018,.0035],[.0023,.0036]],
    iron: [[.0005,.0008],[.0008,.0012],[.0010,.0015],[.0015,.0025],[.0015,.0025],[.0020,.0030],[.0025,.0035],[.0035,.0045],[.0035,.0045],[.0045,.0055]],
    titanium: [[.0003,.0008],[.0003,.0008],[.0005,.0012],[.0005,.0012],[.0008,.0015],[.0010,.0015],[.0013,.0020],[.0018,.0025],[.0020,.0030],[.0025,.0035]]
  };
  function energyFromK(k) {
    if (!(typeof k === 'number' && isFinite(k) && k > 0)) throw new Error('K must be positive cubic inches per minute per horsepower.');
    return HP_W * 60 / (Math.pow(INCH, 3) * k);
  }
  function material(id, label, condition, sfm, group, kRange, powerBasis, note) {
    return {
      id: id, label: label, condition: condition,
      vcMMin: sfm.map(function (v) { return v * .3048; }),
      chipLoads: chipIn[group].map(function (range, i) {
        return { diameterMm: diametersIn[i] * INCH, minMm: range[0] * INCH, maxMm: range[1] * INCH };
      }),
      energyJMm3: [energyFromK(kRange[1]), energyFromK(kRange[0])],
      powerBasis: powerBasis,
      notes: [
        'General-purpose solid-carbide starting band; basic side engagement about 20% of cutter diameter.',
        'Diameter knots span 1/16 to 1 inch. Between knots the displayed chip-load band is linearly interpolated, not separately tested.',
        'Slotting, long reach, coating, coolant and setup stiffness require the actual tool data; this guide makes no automatic correction.',
        powerBasis,
        note
      ],
      sources: [sourceCut, sourcePower]
    };
  }
  var materials = [
    material('al-6061-t6', '6061-T6 aluminum', 'Wrought, T6; broad aluminum-family baseline', [300,500], 'nonferrous', [3.33,6.25],
      'Power band: generic aluminum, 30–150 HB (500 kg); K = 3.33–6.25 in³/min per hp.',
      'Use an aluminum-suitable edge and chip space. This is a family-level guide, not a test of this exact alloy.'),
    material('al-7075-t6', '7075-T6 aluminum', 'Wrought, T6; broad aluminum-family baseline', [300,500], 'nonferrous', [3.33,6.25],
      'Power band: generic aluminum, 30–150 HB (500 kg); K = 3.33–6.25 in³/min per hp.',
      'Shares the broad aluminum starting band with 6061; this does not mean their optimal cutting data are identical.'),
    material('steel-1018', '1018 mild steel', 'Soft supplied condition; below 40 HRC', [150,200], 'steel', [1.64,1.64],
      'Power factor: generic carbon/alloy steel, 85–200 HB; K = 1.64 in³/min per hp.',
      'One tabulated power factor gives one estimate, not a measured uncertainty interval.'),
    material('steel-1045', '1045 steel', 'Annealed or normalized; below 40 HRC', [150,200], 'steel', [1.56,1.64],
      'Power band: generic carbon/alloy steel, 85–253 HB; K = 1.56–1.64 in³/min per hp.',
      'Hardened 1045 needs a different hardness row; the alloy name alone does not specify its condition.'),
    material('steel-4140', '4140 prehard steel', 'About 28–32 HRC; speed guide below 40 HRC', [150,200], 'steel', [1.10,1.28],
      'Power band: generic carbon/alloy steel, 254–327 HB; K = 1.10–1.28 in³/min per hp.',
      'Prehard is distinct from annealed 4140. Check the supplied hardness before treating this band as applicable.'),
    material('stainless-304', '304 stainless steel', 'Wrought 300-series; power assumption 135–275 HB; below 40 HRC', [100,150], 'stainless', [.76,1.54],
      'Power band: generic stainless, 135–275 HB; K = 0.76–1.54 in³/min per hp.',
      'The stainless power band is a broad family/hardness assumption, not an alloy-specific coefficient.'),
    material('stainless-316', '316 stainless steel', 'Wrought 300-series; power assumption 135–275 HB; below 40 HRC', [100,150], 'stainless', [.76,1.54],
      'Power band: generic stainless, 135–275 HB; K = 0.76–1.54 in³/min per hp.',
      'Shares the broad 300-series guide with 304; work hardening and actual tool geometry still affect the cut.'),
    material('iron-gray-30', 'Class 30 gray cast iron', 'Gray iron; verify actual grade and hardness', [175,225], 'iron', [1.52,2.27],
      'Power band: generic cast iron, 150–250 HB; K = 1.52–2.27 in³/min per hp.',
      'The power band combines the applicable generic cast-iron hardness rows; it is not a class-30 material test.'),
    material('brass-c360', 'C360 brass', 'Free-machining brass; power assumption 100–150 HB', [200,400], 'nonferrous', [3.33,3.33],
      'Power factor: generic copper alloy, 100–150 HB; K = 3.33 in³/min per hp.',
      'The speed/feed guide is the broad brass/bronze row; use actual tool and temper data to refine it.'),
    material('ti-6al-4v', 'Ti-6Al-4V titanium', 'Annealed alloy; power assumption 250–375 HB', [100,150], 'titanium', [.87,1.33],
      'Power band: generic titanium, 250–375 HB; K = 0.87–1.33 in³/min per hp.',
      'The generic titanium row includes Ti-6Al-4V; heat, coolant delivery and the actual carbide grade matter.')
  ];
  function get(id) {
    for (var i = 0; i < materials.length; i++) if (materials[i].id === id) return materials[i];
    return null;
  }
  function guidance(id, diameterMm) {
    var m = get(id);
    if (!m) return null;
    var knots = m.chipLoads, fz = null;
    if (typeof diameterMm === 'number' && isFinite(diameterMm) && diameterMm >= knots[0].diameterMm && diameterMm <= knots[knots.length - 1].diameterMm) {
      for (var i = 0; i < knots.length; i++) {
        if (Math.abs(diameterMm - knots[i].diameterMm) < 1e-10) { fz = [knots[i].minMm, knots[i].maxMm]; break; }
        if (diameterMm < knots[i].diameterMm) {
          var a = knots[i - 1], b = knots[i], t = (diameterMm - a.diameterMm) / (b.diameterMm - a.diameterMm);
          fz = [a.minMm + t * (b.minMm - a.minMm), a.maxMm + t * (b.maxMm - a.maxMm)];
          break;
        }
      }
    }
    return Object.assign({}, m, { fzMm: fz, diameterMinMm: knots[0].diameterMm, diameterMaxMm: knots[knots.length - 1].diameterMm });
  }
  return { materials: materials, get: get, guidance: guidance, energyFromK: energyFromK };
});

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiBearingGuide = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const productBase = 'https://www.nsk.com/engineering/products/bearings/ball-bearings/deep-groove-ball-bearings/single-row-deep-groove-ball-bearings/';
  // Boundary-dimension rows read directly from NSK's public product HTML, 2026-11-04.
  // No interpolation, ratings, tolerances, fit recommendations or suffix substitution.
  const catalog = Object.freeze([
    { code: '6005', d: 25, D: 47, B: 12, widthSeries: '1', diameterSeries: '0' },
    { code: '6205', d: 25, D: 52, B: 15, widthSeries: '0', diameterSeries: '2' },
    { code: '6305', d: 25, D: 62, B: 17, widthSeries: '0', diameterSeries: '3' }
  ].map(r => Object.freeze(Object.assign(r, { source: productBase + r.code + '-apn.html', checked: '2026-11-04' }))));
  const sources = Object.freeze({
    dimensions: 'https://www.nsk.com/content/dam/nsk/eu/en_gb/documents/bearings-europe/P_TI-0111_EN.pdf',
    designations: 'https://www.nsk.com/tools-resources/abc-bearings/bearing-designations/',
    codes: 'https://www.nsk.com/content/dam/nsk-marketing/projects-completed/literature/service/bearing-designation-systems_bochure/en_bearing-designation-systems_bochure/preview-pdf_bearing-designation-systems_bochure_en/EN_Bearing_Designation_Systems_BD_03_2024_low-res.pdf',
    plain: 'https://www.ggbearings.com/en/resources/bearings-resources/bearings',
    thrust: 'https://www.nsk.com/tools-resources/abc-bearings/thrust-bearings/'
  });
  const product = (group, name) => 'https://www.nsk.com/products/' + group + '/' + name + '/';
  const families = Object.freeze([
    { id:'journal', name:'Plain journal / bushing', group:'plain', radial:true, axial:0,
      cue:'A sleeve supports a sliding shaft surface.', note:'Radial load crosses the sleeve. This unflanged journal does not locate the shaft axially.', labels:['Sliding bore','No rolling elements'], source:sources.plain },
    { id:'plain-thrust', name:'Plain thrust face', group:'plain', radial:false, axial:1,
      cue:'A collar slides against an annular thrust face.', note:'The loaded face reacts axial force in one direction. A journal guide supplies the separate radial support.', labels:['Collar face','Stationary thrust washer'], source:sources.plain },
    { id:'deep-groove', name:'Deep-groove ball', group:'ball', radial:true, axial:2,
      cue:'Deep, nearly circular grooves surround one row of balls.', note:'Primarily radial duty, with axial capacity in either direction within the catalog limits.', labels:['Deep raceway grooves','One ball row'], source:product('ball-bearings','deep-groove-ball-bearings') },
    { id:'angular-contact', name:'Angular-contact ball', group:'ball', radial:true, axial:1,
      cue:'Offset shoulders give an inclined contact line.', note:'A single row carries radial load and thrust in the shown direction. Opposed bearings handle reverse thrust; this is not a preload-setting drawing.', labels:['Inclined contact line','Opposed ring shoulders'], source:product('ball-bearings','angular-contact-ball-bearings') },
    { id:'self-aligning-ball', name:'Self-aligning ball', group:'ball', radial:true, axial:2,
      cue:'Two ball rows share one spherical outer raceway.', note:'The inner assembly can tilt about the bearing centre. Axial capacity is relatively small; allowable misalignment depends on the product and surrounding parts.', labels:['Common spherical raceway','Two ball rows'], source:product('ball-bearings','self-aligning-ball-bearings') },
    { id:'thrust-ball', name:'Thrust ball', group:'ball', radial:false, axial:1,
      cue:'Balls run between grooved washers facing each other.', note:'The single-direction arrangement shown carries axial load only. It still needs separate radial guidance.', labels:['Shaft washer','Housing washer'], source:product('ball-bearings','thrust-ball-bearings') },
    { id:'cylindrical', name:'Cylindrical roller · NU', group:'roller', radial:true, axial:0,
      cue:'Straight rollers run parallel to the shaft axis.', note:'The NU example has guiding ribs on the outer ring and no inner-ring ribs, allowing axial displacement. Other rib arrangements have different axial duties.', labels:['Parallel roller axes','Outer-ring guide ribs'], source:product('roller-bearings','cylindrical-roller-bearings') },
    { id:'needle', name:'Needle roller · radial', group:'roller', radial:true, axial:0,
      cue:'Long, slender rollers give a shallow radial section.', note:'This radial example includes both rings. Some needle assemblies run directly on a suitably prepared shaft; a separate thrust-needle arrangement is a different geometry.', labels:['Slender cylindrical rollers','Small radial envelope'], source:product('roller-bearings','needle-roller-bearings') },
    { id:'tapered', name:'Tapered roller', group:'roller', radial:true, axial:-1,
      cue:'Conical rollers sit between conical raceways.', note:'Raceways and roller axes have a common cone apex on the shaft axis. A single row takes radial load plus thrust toward its small end, as drawn; an opposed bearing takes reverse thrust.', labels:['Conical contacts','Large-end guiding rib'], source:product('roller-bearings','tapered-roller-bearings') },
    { id:'spherical', name:'Spherical roller', group:'roller', radial:true, axial:2,
      cue:'Two rows of barrel rollers share a spherical outer raceway.', note:'The curved outer track permits limited self-alignment. The bearing carries radial and bidirectional axial loads within its ratings.', labels:['Barrel-shaped rollers','Common spherical raceway'], source:product('roller-bearings','spherical-roller-bearings') },
    { id:'thrust-cylindrical', name:'Cylindrical roller thrust', group:'roller', radial:false, axial:1,
      cue:'Roller axes point radially across flat washer faces.', note:'The single-direction arrangement shown carries axial load, not radial guidance. Compare its radial roller orientation with the shaft-parallel rollers in the NU bearing.', labels:['Radially directed rollers','Flat washer raceways'], source:sources.thrust },
    { id:'thrust-spherical', name:'Spherical roller thrust', group:'roller', radial:true, axial:1,
      cue:'Inclined barrel rollers meet a spherical housing raceway.', note:'Primarily thrust in one direction, with some radial capacity while axial load is present. The spherical raceway permits limited self-alignment; consult the exact design.', labels:['Inclined barrel rollers','Spherical housing raceway'], source:sources.thrust }
  ].map(f => Object.freeze(f)));
  function bore(code) {
    // Deliberately only the ordinary 60/62/63 metric deep-groove pattern taught here.
    // Double-direction thrust, slash bores, miniature, inch and letters are outside this helper.
    const m = /^(60|62|63)(\d{2})$/.exec(String(code).trim());
    if (!m) return null;
    const n = Number(m[2]);
    if (n > 96) return null;
    return n < 4 ? [10,12,15,17][n] : n * 5;
  }
  function lookup(input) {
    const code = String(input == null ? '' : input).trim().toUpperCase();
    const row = catalog.find(r => r.code === code);
    if (!row) return { supported:false, code, message:'Not in this checked catalog set. Choose 6005, 6205 or 6305. No outside diameter, width or suffix interpretation is guessed.' };
    return { supported:true, row };
  }
  return Object.freeze({ catalog, families, sources, bore, lookup });
});

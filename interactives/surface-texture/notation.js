/* ============================================================================
   surface-texture / notation.js - how a drawing states a surface texture
   requirement, in the current symbols, the older symbols and two older
   shorthand notations.

   Every fact here traces to a source in SOURCES. Keep it that way: this file
   is what the page, the lab and the tests all quote, so a fact that is not
   sourced here is not on the page either.

   Conventions, never silently blended:
     current   ISO 21920-1:2021 graphical symbols. A separate short dash
               floats above the short leg, touching neither leg, which
               distinguishes them from the ISO 1302 graphics. The
               requirement sits below the long line; the process and the lay
               sit above it.
     legacy    ISO 1302:2002 graphical symbols and lay symbols: no dash; the
               requirement below the long line, the lay beside the long leg.
     ngrade    legacy roughness grade numbers N1 to N12, each standing for
               one Ra value. Not a conversion to Rz.
     triangles a historical catalog comparison of triangle marks to Ra values,
               which its source itself calls approximate.

   Pure data and functions, no DOM. Loads in the browser as
   CourseWikiTextureNotation and in Node through module.exports.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  else { root.CourseWikiTextureNotation = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SOURCES = {
    iso21920: {
      title: 'ISO 21920-1:2021 preview (section 6.2, Figure 4)',
      url: 'https://cdn.standards.iteh.ai/samples/72196/e66188617a50411ea2999c9e7c409628/ISO-21920-1-2021.pdf'
    },
    zeiss: {
      title: 'ZEISS surface parameter poster',
      url: 'https://dccprodblob.blob.core.windows.net/dccprodtrainingdocuments/en/knowledgeContent/Poster_Surface_Parameter.pdf'
    },
    mitutoyo: {
      title: 'Mitutoyo, Surface Roughness Measurement (DIN EN ISO 4287:1998 parameters)',
      url: 'https://www.mitutoyo.com/webfoo/wp-content/uploads/Surface_Roughness_Measurement.pdf'
    },
    keyence: {
      title: 'KEYENCE, surface roughness symbols and lay (ISO 1302:2002)',
      url: 'https://www.keyence.com/ss/products/microscope/roughness/line/roughness-symbols.jsp'
    },
    diatest: {
      title: 'DIATEST Metrologist Reference Book, roughness grade numbers (printed p. 62)',
      url: 'https://www.diatest.com/fileadmin/user_upload/Downloads/Produkte/en/17_Productrange/PRE1393_DIATEST_Metrologist_Reference_Book_EN_WEB.pdf'
    },
    misumi: {
      title: 'MISUMI catalog, printed p. 518: comparison headed "Extract from JIS B 0601-2001"',
      url: 'https://us.c.misumi-ec.com/book/NST1_ENG_T01/pdf/0520.pdf'
    }
  };

  /* ---- units --------------------------------------------------------------
     1 in = 25.4 mm exactly, so 1 microinch = 0.0254 micrometre exactly. */
  var UM_PER_MICROINCH = 0.0254;
  function toMicroinch(um) { return um / UM_PER_MICROINCH; }

  /* ---- legacy N grades: each grade number stands for one Ra value, in um -----*/
  var N_GRADES = [
    { grade: 'N1', ra: 0.025 }, { grade: 'N2', ra: 0.05 }, { grade: 'N3', ra: 0.1 },
    { grade: 'N4', ra: 0.2 }, { grade: 'N5', ra: 0.4 }, { grade: 'N6', ra: 0.8 },
    { grade: 'N7', ra: 1.6 }, { grade: 'N8', ra: 3.2 }, { grade: 'N9', ra: 6.3 },
    { grade: 'N10', ra: 12.5 }, { grade: 'N11', ra: 25 }, { grade: 'N12', ra: 50 }
  ];
  /* The Ra values a requirement can take in this lab: the twelve N-grade values. */
  var SERIES = N_GRADES.map(function (g) { return g.ra; });

  function sameValue(a, b) { return Math.abs(a - b) < 1e-9; }

  function nGrade(ra) {
    for (var i = 0; i < N_GRADES.length; i++) { if (sameValue(N_GRADES[i].ra, ra)) { return N_GRADES[i]; } }
    return null;
  }
  /* The grades on either side of a measured value - arithmetic placement only,
     not an acceptance rule. */
  function nBetween(ra) {
    var below = null, above = null;
    for (var i = 0; i < N_GRADES.length; i++) {
      var g = N_GRADES[i];
      if (g.ra <= ra + 1e-12) { below = g; }
      if (g.ra >= ra - 1e-12 && !above) { above = g; }
    }
    return { below: below, above: above, exact: below && above && below === above ? below : null };
  }

  /* ---- historical triangle comparison -----------------------------------------
     The rows as the source lists them: number of downward triangles and the Ra
     values (um) printed against them. The source's own note calls the
     comparison approximate, not rigorous. It does not give acceptance
     intervals, dates, a universal convention, or an Rz conversion, so none of
     those is offered here. */
  var TRIANGLES = {
    source: SOURCES.misumi,
    note: 'The catalog calls this comparison approximate, not rigorous.',
    rows: [
      { marks: 4, ra: [0.012, 0.025, 0.05, 0.1, 0.2] },
      { marks: 3, ra: [0.4, 0.8, 1.6] },
      { marks: 2, ra: [3.2, 6.3] },
      { marks: 1, ra: [12.5, 25] }
    ]
  };
  /* The row that LISTS this exact value, or null. Values between listed ones
     are deliberately not placed. */
  function triangleRow(ra) {
    for (var i = 0; i < TRIANGLES.rows.length; i++) {
      var row = TRIANGLES.rows[i];
      for (var j = 0; j < row.ra.length; j++) { if (sameValue(row.ra[j], ra)) { return row; } }
    }
    return null;
  }

  /* ---- what the graphical symbol allows ------------------------------------------*/
  var PROCESS = {
    any: {
      id: 'any',
      name: 'Any process permitted',
      mark: 'basic symbol',
      reading: 'Any manufacturing process is permitted. This does not forbid machining; it simply does not require it.'
    },
    removal: {
      id: 'removal',
      name: 'Material removal required',
      mark: 'bar across the short leg',
      reading: 'Material removal is required: the surface must be produced by removing material, for example by machining.'
    },
    prohibited: {
      id: 'prohibited',
      name: 'Material removal prohibited',
      mark: 'circle in the V',
      reading: 'Material removal is prohibited: the surface must not be machined or otherwise have material removed to meet this requirement.'
    }
  };
  var PROCESS_ORDER = ['any', 'removal', 'prohibited'];

  var CONVENTIONS = {
    current: {
      id: 'current',
      standard: 'ISO 21920-1:2021',
      name: 'Current symbol (ISO 21920-1)',
      short: 'ISO 21920',
      note: 'A short separate dash above the short leg marks the current symbol and tells it apart from the older ISO 1302 graphic. The limit sits below the long line; the lay sits above it.',
      source: SOURCES.iso21920
    },
    legacy: {
      id: 'legacy',
      standard: 'ISO 1302:2002',
      name: 'Older symbol (ISO 1302)',
      short: 'ISO 1302',
      note: 'The older ISO 1302 graphic has no separate dash. The lay symbol sits beside the long leg, below the line. Many existing drawings use it.',
      source: SOURCES.keyence
    }
  };

  /* ---- lay symbols (ISO 1302:2002) -------------------------------------------------
     "view" is the drawing view the symbol is written in. = and the
     perpendicular sign are judged against that view's plane of projection,
     not against the page or the screen. */
  var LAY = {
    '=': { symbol: '=', name: 'Parallel', meaning: 'Parallel to the plane of projection of the view in which the symbol is used.' },
    '⊥': { symbol: '⊥', name: 'Perpendicular', meaning: 'Perpendicular to the plane of projection of the view in which the symbol is used.' },
    X: { symbol: 'X', name: 'Crossed', meaning: 'Crossed in two oblique directions relative to the plane of projection of the view in which the symbol is used.' },
    M: { symbol: 'M', name: 'Multidirectional', meaning: 'Multidirectional.' },
    C: { symbol: 'C', name: 'Circular', meaning: 'Approximately circular relative to the centre of the surface to which the symbol applies.' },
    R: { symbol: 'R', name: 'Radial', meaning: 'Approximately radial relative to the centre of the surface to which the symbol applies.' },
    P: { symbol: 'P', name: 'Particulate', meaning: 'Particulate, non-directional or protuberant.' }
  };
  var LAY_ORDER = ['=', '⊥', 'X', 'M', 'C', 'R', 'P'];

  /* The views this lab draws: the front view looks at the front face, so its
     plane of projection is upright and left-to-right (the x-z plane); the
     right side view looks at the right face (the y-z plane). */
  var VIEWS = {
    front: { id: 'front', name: 'Front view', plane: 'x-z' },
    side: { id: 'side', name: 'Right side view', plane: 'y-z' }
  };

  /* Lay symbol for a surface pattern (surface.js PATTERNS) drawn in a view.
     The lab's parallel marks run front to back, along y: perpendicular to the
     front view's x-z plane and parallel to the side view's y-z plane. Crossed
     marks run 30 degrees either side of front-to-back, oblique to both. */
  function laySymbol(pattern, view) {
    if (pattern === 'parallel') { return view === 'side' ? '=' : '⊥'; }
    return { crossed: 'X', multi: 'M', circular: 'C', radial: 'R', particulate: 'P' }[pattern] || null;
  }

  /* ---- a callout -----------------------------------------------------------------------
     { notation: 'current'|'legacy'|'ngrade'|'triangles', process, param: 'Ra'|'Rz',
       value (um), lay: a LAY symbol or null }. Grade numbers and triangles are
     listed against Ra only. */
  var NOTATIONS = ['current', 'legacy', 'ngrade', 'triangles'];
  var PARAMS = ['Ra', 'Rz'];

  function makeCallout(over) {
    var c = { notation: 'current', process: 'removal', param: 'Ra', value: 1.6, lay: null };
    if (over) { for (var k in over) { if (Object.prototype.hasOwnProperty.call(over, k) && over[k] !== undefined) { c[k] = over[k]; } } }
    if (NOTATIONS.indexOf(c.notation) < 0) { c.notation = 'current'; }
    if (!PROCESS[c.process]) { c.process = 'removal'; }
    if (PARAMS.indexOf(c.param) < 0) { c.param = 'Ra'; }
    var v = Number(c.value), best = SERIES[0];
    SERIES.forEach(function (s) { if (Math.abs(s - v) < Math.abs(best - v)) { best = s; } });
    c.value = best;
    if (c.lay !== null && !LAY[c.lay]) { c.lay = null; }
    return c;
  }

  /* Whether a notation can express this callout, and why not if it cannot. */
  function expressible(c) {
    if ((c.notation === 'ngrade' || c.notation === 'triangles') && c.param !== 'Ra') {
      return { ok: false, why: 'Grade numbers and the triangle comparison are listed against Ra. They do not convert to Rz.' };
    }
    if (c.notation === 'triangles' && !triangleRow(c.value)) {
      return { ok: false, why: 'The catalog comparison lists no triangle mark for Ra ' + fmtUm(c.value) + ' µm.' };
    }
    return { ok: true, why: '' };
  }

  /* ---- numbers as people write them ---------------------------------------------------- */
  function trim(s) { return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, ''); }
  /* A series value exactly as written (0.025, 1.6, 12.5); a measured value to
     three significant figures. */
  function fmtUm(v) {
    if (v === 0) { return '0'; }
    var exact = SERIES.concat([0.012]).some(function (s) { return sameValue(s, v); });
    if (exact) { return trim(v.toFixed(3)); }
    var m = Math.abs(v), d = m >= 100 ? 0 : m >= 10 ? 1 : m >= 1 ? 2 : 3;
    return v.toFixed(d).replace('-', '−');
  }
  function fmtMicroinch(um) {
    var u = toMicroinch(um);
    return u.toFixed(u >= 100 ? 0 : 1);
  }

  function requirementText(c) { return c.param + ' ' + fmtUm(c.value); }

  /* Plain reading of a callout. Says only what the callout states. */
  function reading(c, view) {
    var out = [];
    if (c.notation === 'current' || c.notation === 'legacy') {
      out.push(PROCESS[c.process].reading);
    }
    var ex = expressible(c);
    if (!ex.ok) { out.push(ex.why); return out; }
    if (c.notation === 'ngrade') {
      out.push('Grade ' + nGrade(c.value).grade + ' stands for Ra ' + fmtUm(c.value) + ' µm (' + fmtMicroinch(c.value) + ' µin).');
    } else if (c.notation === 'triangles') {
      var row = triangleRow(c.value);
      out.push('In the catalog comparison, ' + row.marks + ' triangle' + (row.marks > 1 ? 's' : '') + ' sit beside Ra ' +
        row.ra.map(fmtUm).join(', ') + ' µm. ' + TRIANGLES.note);
    } else {
      out.push('Upper limit for ' + c.param + ' of ' + fmtUm(c.value) + ' µm (' + fmtMicroinch(c.value) + ' µin) on the roughness profile.');
    }
    if (c.lay && (c.notation === 'current' || c.notation === 'legacy')) {
      var L = LAY[c.lay];
      var where = (c.lay === '=' || c.lay === '⊥' || c.lay === 'X') && view ? ' Here, that is the ' + VIEWS[view].name.toLowerCase() + '.' : '';
      out.push('Lay ' + L.symbol + ' (' + L.name.toLowerCase() + '): ' + L.meaning + where);
    }
    return out;
  }

  /* One measured value against the callout's limit. A single trace is not an
     acceptance decision, and no trace shows how the surface was made. */
  function check(c, measured) {
    var v = measured[c.param];
    if (typeof v !== 'number' || !isFinite(v)) { return { ok: false }; }
    var pass = v <= c.value + 1e-12;
    return { ok: true, pass: pass, measured: v, limit: c.value, param: c.param, margin: c.value - v };
  }

  return {
    SOURCES: SOURCES,
    UM_PER_MICROINCH: UM_PER_MICROINCH,
    toMicroinch: toMicroinch,
    N_GRADES: N_GRADES,
    SERIES: SERIES,
    nGrade: nGrade,
    nBetween: nBetween,
    TRIANGLES: TRIANGLES,
    triangleRow: triangleRow,
    PROCESS: PROCESS,
    PROCESS_ORDER: PROCESS_ORDER,
    CONVENTIONS: CONVENTIONS,
    LAY: LAY,
    LAY_ORDER: LAY_ORDER,
    VIEWS: VIEWS,
    laySymbol: laySymbol,
    NOTATIONS: NOTATIONS,
    PARAMS: PARAMS,
    makeCallout: makeCallout,
    expressible: expressible,
    fmtUm: fmtUm,
    fmtMicroinch: fmtMicroinch,
    requirementText: requirementText,
    reading: reading,
    check: check
  };
});

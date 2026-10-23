/* ============================================================================
   surface-texture / quiz.js - "read the callout": short questions about the
   symbols, the lay, the older notations and what the numbers respond to.

   Every answer is worked out from notation.js, surface.js and profile.js
   when the quiz is built, never typed in, so the quiz cannot disagree with
   the lab or the page. "shows" says in words what the figure draws, for the
   printed list and screen readers. Each item says what to draw:
     symbol     a callout for render.symbol
     pictorial  a surface and a view for render.pictorial (mini)
     none       words only

   Pure, no DOM. CourseWikiTextureQuiz in the browser, module.exports in Node.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module && module.exports;
  var api = node
    ? factory(require('./surface.js'), require('./profile.js'), require('./notation.js'))
    : factory(root.CourseWikiTextureSurface, root.CourseWikiTextureProfile, root.CourseWikiTextureNotation);
  if (node) { module.exports = api; } else { root.CourseWikiTextureQuiz = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, P, N) {
  'use strict';
  if (!S || !P || !N) { return null; }

  function fmt(v) { return N.fmtUm(v); }

  function build() {
    var items = [];

    // 1-3: what the graphical symbol allows, and which standard drew it
    var c1 = N.makeCallout({ notation: 'legacy', process: 'prohibited', param: 'Ra', value: 3.2 });
    items.push({
      id: 'removal-prohibited',
      draw: { kind: 'symbol', callout: c1 },
      shows: 'The older ISO 1302 symbol with a circle in its V, and Ra 3.2.',
      question: 'May this surface be machined to reach Ra 3.2 µm?',
      options: [
        { id: 'removal', text: 'Yes: material removal is required' },
        { id: 'any', text: 'Yes: any process is permitted' },
        { id: 'prohibited', text: 'No: material removal is prohibited' }
      ],
      answer: c1.process,
      explain: 'The circle in the V prohibits material removal. ' + N.PROCESS.prohibited.reading
    });

    var c2 = N.makeCallout({ notation: 'current', process: 'any', param: 'Ra', value: 6.3 });
    items.push({
      id: 'any-process',
      draw: { kind: 'symbol', callout: c2 },
      shows: 'A current symbol with an open V, no connecting material-removal crossbar or circle, a separate identifying dash above the short leg, and Ra 6.3.',
      question: 'Does this callout forbid machining the surface?',
      options: [
        { id: 'prohibited', text: 'Yes, it forbids machining' },
        { id: 'any', text: 'No, any process is permitted' },
        { id: 'removal', text: 'No, it requires machining' }
      ],
      answer: c2.process,
      explain: 'The V has no connecting material-removal crossbar or circle: it is the basic symbol. The separate floating dash identifies ISO 21920; it does not require machining. ' + N.PROCESS.any.reading
    });

    var c3 = N.makeCallout({ notation: 'current', process: 'removal', param: 'Ra', value: 0.8 });
    items.push({
      id: 'which-standard',
      draw: { kind: 'symbol', callout: c3 },
      shows: 'A symbol with a bar closing its V, a short separate dash above the short leg, and Ra 0.8.',
      question: 'Which standard\'s graphic is this?',
      options: [
        { id: 'current', text: 'ISO 21920-1 (current)' },
        { id: 'legacy', text: 'ISO 1302 (older)' }
      ],
      answer: c3.notation,
      explain: 'The short separate dash above the short leg, touching neither leg, marks an ISO 21920-1 symbol. The older ISO 1302 graphic has no dash.'
    });

    // 4-5: the same lay, two views
    var lay = S.make({ lay: 'parallel', spacing: 0.25, wave: 0 });
    ['side', 'front'].forEach(function (view) {
      var sym = N.laySymbol('parallel', view);
      items.push({
        id: 'lay-' + view,
        draw: { kind: 'pictorial', spec: lay, view: view },
        shows: 'A block of surface whose marks run front to back. An arrow shows the ' + N.VIEWS[view].name.toLowerCase() + ' looking at its ' + (view === 'side' ? 'right side' : 'front') + '.',
        question: 'The marks run front to back. Which lay symbol belongs on this surface in the ' + N.VIEWS[view].name.toLowerCase() + '?',
        options: [{ id: '=', text: '=' }, { id: '⊥', text: '⊥' }, { id: 'X', text: 'X' }],
        answer: sym,
        explain: 'The ' + N.VIEWS[view].name.toLowerCase() + ' looks along the arrow. Marks running front to back are ' +
          (sym === '=' ? 'parallel to that view\'s plane of projection, so the symbol is =.' : 'perpendicular to that view\'s plane of projection, so the symbol is ⊥.') +
          ' The same surface takes ' + (sym === '=' ? '⊥' : '=') + ' in the ' + (view === 'side' ? 'front view' : 'right side view') + ': the symbol depends on the view, not on the screen or page.'
      });
    });

    // 6-7: older notations
    var g8 = N.N_GRADES.filter(function (g) { return g.grade === 'N8'; })[0];
    items.push({
      id: 'n-grade',
      draw: { kind: 'symbol', callout: N.makeCallout({ notation: 'ngrade', value: g8.ra }) },
      shows: 'The grade number N8.',
      question: 'An older drawing gives grade N8. What does that stand for?',
      options: [{ id: '0.8', text: 'Ra 0.8 µm' }, { id: '3.2', text: 'Ra 3.2 µm' }, { id: '6.3', text: 'Ra 6.3 µm' }],
      answer: fmt(g8.ra),
      explain: 'N8 stands for Ra ' + fmt(g8.ra) + ' µm (' + N.fmtMicroinch(g8.ra) + ' µin). Each step of the grade number doubles or halves the Ra value, near enough.'
    });

    var three = N.TRIANGLES.rows.filter(function (r) { return r.marks === 3; })[0];
    items.push({
      id: 'triangles',
      draw: { kind: 'symbol', callout: N.makeCallout({ notation: 'triangles', value: 0.8 }) },
      shows: 'Three downward triangles.',
      question: 'In the catalog comparison, which Ra values sit beside three triangles?',
      options: N.TRIANGLES.rows.slice(1).map(function (r) { return { id: String(r.marks), text: r.ra.map(fmt).join(', ') + ' µm' }; }),
      answer: String(three.marks),
      explain: 'Three triangles sit beside Ra ' + three.ra.map(fmt).join(', ') + ' µm. ' + N.TRIANGLES.note + ' Read it as a rough historical guide, not as acceptance limits.'
    });

    items.push({
      id: 'rz-grade',
      draw: { kind: 'symbol', callout: N.makeCallout({ notation: 'current', process: 'removal', param: 'Rz', value: 6.3 }) },
      shows: 'A current symbol with Rz 6.3.',
      question: 'Which N grade means the same as this Rz 6.3 µm requirement?',
      options: [{ id: 'N9', text: 'N9' }, { id: 'N7', text: 'N7' }, { id: 'none', text: 'None: grades are Ra values' }],
      answer: 'none',
      explain: 'Grade numbers each stand for an Ra value; N9 is Ra 6.3 µm, not Rz 6.3 µm. Ra and Rz measure different things, and how they compare depends on the shape of the profile, as the same-Ra experiment in the lab shows.'
    });

    // 8-9: what the numbers respond to, measured on the lab's own surfaces
    var base = S.make({ lay: 'parallel' }), scratched = S.make({ lay: 'parallel', scratch: true });
    var a0 = P.measure(base, 'x', 0.8), a1 = P.measure(scratched, 'x', 0.8);
    var change = { Ra: a1.Ra / a0.Ra, Rz: a1.Rz / a0.Rz, Rt: a1.Rt / a0.Rt };
    var most = ['Ra', 'Rz', 'Rt'].sort(function (p, q) { return change[q] - change[p]; })[0];
    items.push({
      id: 'scratch',
      draw: { kind: 'none' },
      shows: '',
      question: 'One deep scratch crosses this otherwise even trace. Which number has the largest proportional change?',
      options: [{ id: 'Ra', text: 'Ra' }, { id: 'Rz', text: 'Rz' }, { id: 'Rt', text: 'Rt' }],
      answer: most,
      explain: 'In the lab, a scratch three times the mark height takes Rt from ' + fmt(a0.Rt) + ' to ' + fmt(a1.Rt) + ' µm, Rz from ' + fmt(a0.Rz) + ' to ' + fmt(a1.Rz) +
        ' µm and Ra from ' + fmt(a0.Ra) + ' to ' + fmt(a1.Ra) + ' µm. Rt spans the highest peak to the deepest valley over the whole length. Rz averages five section heights, diluting localized extremes; filtering can spread a scratch across section boundaries. Ra averages every point.',
      measured: { before: a0, after: a1 }
    });

    var across = P.measure(base, 'x', 0.8), along = P.measure(base, 'y', 0.8);
    var ratio = along.Ra / across.Ra;
    items.push({
      id: 'direction',
      draw: { kind: 'pictorial', spec: base, view: null },
      shows: 'A block of surface with parallel marks running front to back, and a stylus trace running left to right across them.',
      question: 'The trace on this surface crosses the marks. Traced along the marks instead, Ra would be:',
      options: [{ id: 'same', text: 'About the same' }, { id: 'smaller', text: 'Much smaller' }, { id: 'larger', text: 'Much larger' }],
      answer: ratio < 0.7 ? 'smaller' : ratio > 1.4 ? 'larger' : 'same',
      explain: 'In the lab, Ra is ' + fmt(across.Ra) + ' µm across the marks and ' + fmt(along.Ra) + ' µm along them: the stylus misses the marks when it runs beside them. Tracing across the lay is the usual choice, but a direction the drawing specifies governs.'
    });
    return items;
  }

  return { build: build };
});

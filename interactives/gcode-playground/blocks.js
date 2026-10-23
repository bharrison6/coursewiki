/* ============================================================================
   gcode-playground / blocks.js - program blocks, and the example programs.

   ONE BLOCK IS ONE LINE OF G-CODE. On a CNC control a line of a program is
   itself called a block, so the block a learner snaps into place and the
   line the control reads are the same thing, with the same number. A block
   only arranges the words of its line; the interpreter (gcode.js) decides
   what the line means, so a block can never mean something its G-code does
   not.

   Reading a program back into blocks: each line becomes the block whose
   words it has, keeping the numbers as they were typed. A line that fits no
   block shape (several codes at once, a line number, anything unsupported)
   becomes a "code line" block holding the text unchanged, so a program read
   in and written out again says the same thing, line for line.
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./gcode.js') : root.CourseWikiGcode);
  if (node) module.exports = api;
  else root.CourseWikiGcodeBlocks = api;
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  /* ---- block types ----------------------------------------------------------
     cat:    the block's colour family
     title:  what the block does, in words
     fields: its inputs; num fields hold the number exactly as typed, and an
             empty one leaves that word out of the line. */
  /* A rapid and a feed move hold the same words, so one becomes the other in place. */
  var MOVE_SWAP = { label: 'Motion', options: [['rapid', 'G0 rapid'], ['feed', 'G1 feed']] };
  var TOOL_OPTIONS = G.TOOL_TABLE.map(function (e) { return [String(e.t), 'T' + e.t + '  ' + e.label]; });
  var TYPES = {
    setup: { cat: 'setup', title: 'Units and coordinates', fields: [
      { k: 'units', kind: 'select', label: 'Units', options: [['G21', 'G21 millimetres'], ['G20', 'G20 inches']] },
      { k: 'dist', kind: 'select', label: 'Distance mode', options: [['G90', 'G90 absolute'], ['G91', 'G91 incremental']] }],
      make: function (f) { return [f.units, f.dist, 'G17']; } },
    mode: { cat: 'setup', title: 'Distance mode', fields: [
      { k: 'dist', kind: 'select', label: 'Distance mode', options: [['G90', 'G90 absolute'], ['G91', 'G91 incremental']] }],
      make: function (f) { return [f.dist]; } },
    tool: { cat: 'tool', title: 'Tool change', fields: [
      { k: 't', kind: 'select', label: 'Tool', options: TOOL_OPTIONS, prefix: 'T' }],
      make: function (f) { return ['T' + f.t, 'M6']; } },
    spindle: { cat: 'spindle', title: 'Spindle on', fields: [{ k: 's', kind: 'num', label: 'S', unit: 'rpm', word: 'S' }],
      make: function (f) { return [word('S', f.s), 'M3']; } },
    stop: { cat: 'spindle', title: 'Spindle off', fields: [], make: function () { return ['M5']; } },
    rapid: { cat: 'rapid', title: 'Rapid move', swap: MOVE_SWAP, fields: axes(),
      make: function (f) { return ['G0', word('X', f.x), word('Y', f.y), word('Z', f.z)]; } },
    feed: { cat: 'feed', title: 'Feed move', swap: MOVE_SWAP, fields: axes().concat([{ k: 'f', kind: 'num', label: 'F', word: 'F', unit: 'feed' }]),
      make: function (f) { return ['G1', word('X', f.x), word('Y', f.y), word('Z', f.z), word('F', f.f)]; } },
    arc: { cat: 'feed', title: 'Arc', fields: [
      { k: 'dir', kind: 'select', label: 'Direction', options: [['G2', 'G2 clockwise'], ['G3', 'G3 counterclockwise']] },
      { k: 'x', kind: 'num', label: 'X', word: 'X' }, { k: 'y', kind: 'num', label: 'Y', word: 'Y' },
      { k: 'by', kind: 'select', label: 'Centre given by', options: [['ij', 'centre I J'], ['r', 'radius R']] },
      { k: 'i', kind: 'num', label: 'I', word: 'I', when: { by: 'ij' } }, { k: 'j', kind: 'num', label: 'J', word: 'J', when: { by: 'ij' } },
      { k: 'r', kind: 'num', label: 'R', word: 'R', when: { by: 'r' } },
      { k: 'f', kind: 'num', label: 'F', word: 'F', unit: 'feed' }],
      make: function (f) {
        var w = [f.dir, word('X', f.x), word('Y', f.y)];
        if (f.by === 'r') w.push(word('R', f.r)); else w.push(word('I', f.i), word('J', f.j));
        return w.concat([word('F', f.f)]);
      } },
    drill: { cat: 'drill', title: 'Drilling cycle', fields: [
      { k: 'ret', kind: 'select', label: 'Retract to', options: [['G98', 'G98 start height'], ['G99', 'G99 R plane']] },
      { k: 'x', kind: 'num', label: 'X', word: 'X' }, { k: 'y', kind: 'num', label: 'Y', word: 'Y' },
      { k: 'z', kind: 'num', label: 'Z', word: 'Z' }, { k: 'r', kind: 'num', label: 'R', word: 'R' },
      { k: 'f', kind: 'num', label: 'F', word: 'F', unit: 'feed' }],
      make: function (f) { return [f.ret, 'G81', word('X', f.x), word('Y', f.y), word('Z', f.z), word('R', f.r), word('F', f.f)]; } },
    more: { cat: 'modal', title: 'Next point, same motion', fields: axes(),
      make: function (f) { return [word('X', f.x), word('Y', f.y), word('Z', f.z)]; } },
    cancel: { cat: 'drill', title: 'End the drilling cycle', fields: [], make: function () { return ['G80']; } },
    end: { cat: 'end', title: 'Program end', fields: [
      { k: 'm', kind: 'select', label: 'End code', options: [['M30', 'M30'], ['M2', 'M2']] }],
      make: function (f) { return [f.m]; } },
    comment: { cat: 'note', title: 'Comment', fields: [{ k: 'text', kind: 'text', label: 'Comment' }],
      make: function (f) { return ['(' + String(f.text || '').replace(/[()]/g, '') + ')']; } },
    code: { cat: 'code', title: 'Code line', fields: [{ k: 'text', kind: 'code', label: 'G-code' }],
      make: function (f) { return [String(f.text == null ? '' : f.text)]; } }
  };
  function axes() {
    return [{ k: 'x', kind: 'num', label: 'X', word: 'X' }, { k: 'y', kind: 'num', label: 'Y', word: 'Y' }, { k: 'z', kind: 'num', label: 'Z', word: 'Z' }];
  }
  var ORDER = ['setup', 'tool', 'spindle', 'rapid', 'feed', 'arc', 'drill', 'more', 'cancel', 'stop', 'mode', 'end', 'comment', 'code'];
  var DEFAULTS = {
    setup: { units: 'G21', dist: 'G90' }, mode: { dist: 'G91' }, tool: { t: '1' }, spindle: { s: '2500' }, stop: {},
    rapid: { x: '', y: '', z: '20' }, feed: { x: '', y: '', z: '', f: '' }, arc: { dir: 'G2', x: '', y: '', by: 'ij', i: '', j: '', r: '', f: '' },
    drill: { ret: 'G98', x: '50', y: '30', z: '-5', r: '2', f: '100' }, more: { x: '', y: '', z: '' }, cancel: {}, end: { m: 'M30' },
    comment: { text: 'note' }, code: { text: '' }
  };

  /* A number as typed, tidied: spaces dropped, a true minus or a decimal
     comma read as the plain characters G-code uses. Anything else is left
     as typed, so the interpreter can say what is wrong with it. */
  function tidy(s) { return String(s == null ? '' : s).trim().replace(/−/g, '-').replace(/,/g, '.').replace(/\s+/g, ''); }
  function word(letter, value) { var t = tidy(value); return t === '' ? '' : letter + t; }

  var nextId = 1;
  function make(type, fields, note) {
    var f = {}, d = DEFAULTS[type], k;
    for (k in d) f[k] = d[k];
    for (k in fields || {}) f[k] = fields[k];
    return { id: 'b' + (nextId++), type: type, f: f, note: note || '' };
  }
  function clone(b) { var f = {}; for (var k in b.f) f[k] = b.f[k]; return { id: 'b' + (nextId++), type: b.type, f: f, note: b.note }; }

  function toLine(b) {
    var T = TYPES[b.type];
    var s = T.make(b.f).filter(function (w) { return w !== ''; }).join(' ');
    if (b.note) s += (s ? ' ' : '') + '(' + b.note + ')';
    return s;
  }
  function toText(blocks) { return blocks.map(toLine).join('\n'); }

  /* ---- reading a line back into a block ------------------------------------------*/
  function fromLine(text) {
    var p = G.parseLine(text), c = G.classify(p);
    var raw = function () { return make('code', { text: text }); };
    if (c.errors.length || p.marker || c.n != null) return raw();
    var comments = p.comments;
    if (!p.words.length) {
      if (comments.length === 1 && /^\s*\(([^()]*)\)\s*$/.test(text)) return make('comment', { text: comments[0] });
      return raw();
    }
    if (comments.length > 1) return raw();
    var note = comments.length ? comments[0] : '';
    if (note && !/\)\s*$/.test(text)) return raw();      // only a trailing (comment) is kept as a note
    var g = c.gList.slice().sort(), m = c.mList.slice().sort(function (a, b) { return a - b; });
    var vals = Object.keys(c.v).sort().join('');
    var vt = function (L) { return c.vText[L] == null ? '' : c.vText[L]; };
    var only = function (allowed) { return Object.keys(c.v).every(function (L) { return allowed.indexOf(L) >= 0; }); };
    var B = function (type, f) { return make(type, f, note); };
    var ms = m.join(' ');
    if (!ms && vals === '' && g.length === 3 && c.g.units && c.g.dist && c.g.plane === '17') {
      return B('setup', { units: 'G' + c.g.units, dist: 'G' + c.g.dist });
    }
    if (!ms && vals === '' && g.length === 1 && c.g.dist) return B('mode', { dist: 'G' + c.g.dist });
    if (!g.length && ms === '6' && vals === 'T' && G.toolEntry(c.v.T)) return B('tool', { t: String(c.v.T) });
    if (!g.length && ms === '3' && vals === 'S') return B('spindle', { s: vt('S') });
    if (!g.length && ms === '5' && vals === '') return B('stop', {});
    if (!g.length && (ms === '30' || ms === '2') && vals === '') return B('end', { m: 'M' + ms });
    if (!ms && g.length === 1 && c.g.motion === '0' && only('XYZ')) return B('rapid', { x: vt('X'), y: vt('Y'), z: vt('Z') });
    if (!ms && g.length === 1 && c.g.motion === '1' && only('XYZF')) return B('feed', { x: vt('X'), y: vt('Y'), z: vt('Z'), f: vt('F') });
    if (!ms && g.length === 1 && (c.g.motion === '2' || c.g.motion === '3') && only('XYIJRF')) {
      var byR = c.v.R != null;
      if (byR && (c.v.I != null || c.v.J != null)) return raw();
      return B('arc', { dir: 'G' + c.g.motion, x: vt('X'), y: vt('Y'), by: byR ? 'r' : 'ij', i: vt('I'), j: vt('J'), r: vt('R'), f: vt('F') });
    }
    if (!ms && g.length === 2 && c.g.motion === '81' && c.g.retract && only('XYZRF')) {
      return B('drill', { ret: 'G' + c.g.retract, x: vt('X'), y: vt('Y'), z: vt('Z'), r: vt('R'), f: vt('F') });
    }
    if (!ms && g.length === 1 && c.g.motion === '80' && vals === '') return B('cancel', {});
    if (!ms && !g.length && vals && only('XYZ')) return B('more', { x: vt('X'), y: vt('Y'), z: vt('Z') });
    return raw();
  }
  function fromText(text) {
    var src = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    var lines = src === '' ? [] : src.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines.map(fromLine);
  }

  /* ======================================================================
     Example programs
     The speeds and feeds in them are round teaching numbers that keep the
     simulation readable, not cutting recommendations for any material.
     ====================================================================*/
  var EXAMPLES = [
    { id: 'slot', title: 'A first cut: one slot',
      brief: 'Cut a slot 10 mm wide and 3 mm deep across the block with a Ø10 end mill, then lift clear and stop.',
      tries: [
        'Change the Z−3 in block 7 to Z−6, then play it again.',
        'Drag block 4, “Spindle on”, down below block 7. What stops the program?',
        'Switch block 2 to G20 inches. What do the same numbers mean now?'
      ],
      text: ['(A first cut: a slot across the block)', 'G21 G90 G17', 'T1 M6', 'S2500 M3', 'G0 X10 Y30', 'G0 Z2', 'G1 Z-3 F100', 'G1 X90 F300', 'G0 Z20', 'M5', 'M30'] },
    { id: 'outline', title: 'Arcs: a rounded outline',
      brief: 'With a Ø6 end mill, cut a groove 1.5 mm deep around a 60 × 30 rectangle whose corners are rounded to R8. Four G3 arcs turn the corners.',
      tries: [
        'Change the first G3 to G2. Which way does that corner go now?',
        'In block 9, change J8 to J6, so the end point is no longer on the circle. Read the message.',
        'Change X72 in block 8 to X80, then delete the arc in block 9. What happens at that corner?'
      ],
      text: ['(Groove around a rounded rectangle)', 'G21 G90 G17', 'T2 M6', 'S3000 M3', 'G0 X28 Y15', 'G0 Z2', 'G1 Z-1.5 F80', 'G1 X72 F250',
        'G3 X80 Y23 I0 J8', 'G1 Y37', 'G3 X72 Y45 I-8 J0', 'G1 X28', 'G3 X20 Y37 I0 J-8', 'G1 Y23', 'G3 X28 Y15 I8 J0', 'G0 Z20', 'M5', 'M30'] },
    { id: 'holes', title: 'Holes: a drilling cycle',
      brief: 'Drill four holes 8 mm deep with a Ø6 drill. One G81 line drills the first hole; each line after it with only X or Y drills another, until G80.',
      tries: [
        'Change G98 to G99 in block 7. How high does the drill rise between holes now?',
        'Add a fifth hole in the middle: insert a “Next point” block X50 Y30 before the G80.',
        'Move the block X85 down below the G80 block. Read the message.'
      ],
      text: ['(Four holes with a drilling cycle)', 'G21 G90 G17', 'T3 M6', 'S1500 M3', 'G0 X15 Y15', 'G0 Z10', 'G98 G81 X15 Y15 Z-8 R2 F120',
        'X85', 'Y45', 'X15', 'G80', 'G0 Z20', 'M5', 'M30'] },
    { id: 'facing', title: 'Facing: a face mill across the top',
      brief: 'Take the 1 mm allowance off the top with a Ø50 face mill in two passes, starting and finishing beside the block.',
      tries: [
        'In block 5, start the face mill at X20 instead of X−35, over the block. What happens at block 6?',
        'Keep X20, and switch block 6 from G0 to a G1 feed with F100. Can a face mill feed straight down into metal?',
        'Delete the second pass, blocks 8 and 9. How much of the top is left at the raw height?'
      ],
      text: ['(Face the top down to Z0)', 'G21 G90 G17', 'T5 M6', 'S800 M3', 'G0 X-35 Y15', 'G0 Z0', 'G1 X135 F400', 'G0 Y45', 'G1 X-35', 'G0 Z20', 'M5', 'M30'] },
    { id: 'blank', title: 'Your own program',
      brief: 'A start and an end, with a tool and the spindle on. Add the moves between them from the blocks above.',
      tries: [
        'Add a Rapid move to X50 Y30, then a Rapid move to Z2.',
        'Add a Feed move down to Z−2 with F100, then one across to X80 with F300.',
        'Finish with a Rapid move up to Z20 and a Spindle off before the end.'
      ],
      text: ['(My program)', 'G21 G90 G17', 'T1 M6', 'S2500 M3', 'M5', 'M30'] }
  ];
  function example(id) {
    for (var k = 0; k < EXAMPLES.length; k++) if (EXAMPLES[k].id === id) return EXAMPLES[k];
    return EXAMPLES[0];
  }

  return {
    TYPES: TYPES, ORDER: ORDER, DEFAULTS: DEFAULTS, EXAMPLES: EXAMPLES, example: example,
    make: make, clone: clone, toLine: toLine, toText: toText, fromLine: fromLine, fromText: fromText, tidy: tidy
  };
});

/* ============================================================================
   milling-simulator / jobs.js - the target parts.

   Each job is a drawing: features the inspection checks (inspect.js), the
   dimensions and notes the drawing shows (draw.js), and hints a learner can
   open one at a time. Nothing here says which tool to use or in what order;
   any sequence that leaves this part passes.

   Every job starts from the same block: 100 x 60 x 20 finished, 1 mm over
   on top, held in a vise on parallels. Coordinates in mm from the front-left
   corner of the block; Z0 is the finished top face.
   ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiMillingJobs = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BOSS = { x0: 25, x1: 75, y0: 15, y1: 45 };

  var JOBS = [
    {
      id: 'shoulder', n: 1, title: 'Face the top, then cut a shoulder',
      short: 'Facing and a shoulder',
      brief: 'Face the top flat at Z 0.00, then mill a shoulder 25 mm wide and 6 mm deep across the right-hand end.',
      top: 0, bottom: -20, section: 30,
      features: [
        { type: 'recess', kind: 'shoulder', id: 'shoulder', label: 'Shoulder 25 wide × 6 deep across the right end',
          x0: 75, x1: 140, y0: -40, y1: 100, floor: -6, rMax: 0 }
      ],
      dims: [
        { view: 'top', axis: 'x', from: 0, to: 75, at: -10 },
        { view: 'top', axis: 'x', from: 75, to: 100, at: -10 },
        { view: 'top', axis: 'y', from: 0, to: 60, at: -8 },
        { view: 'front', axis: 'z', from: -6, to: 0, at: 106 },
        { view: 'front', axis: 'z', from: -20, to: 0, at: -8 }
      ],
      notes: [],
      hints: [
        'Every depth on the drawing is measured from the finished top, which the readout calls Z 0.00. The raw top stands 1 mm above it, at Z +1.00, until it is faced.',
        'The face mill cuts only with the inserts round its rim. Lower it to Z 0.00 beside the part, then feed it across. ' +
          'At Ø50 it cannot cover the 60 mm width in one pass: overlap two.',
        'A cutter’s centre runs one radius away from the wall it leaves. With a Ø12 end mill, a wall at X 75.00 means the centre at X 81.00.',
        'The face mill’s inserts reach only 4 mm, so a 6 mm shoulder needs two passes with it, or one with an end mill.'
      ]
    },
    {
      id: 'pocket', n: 2, title: 'A pocket with tight corners, and two clearance holes',
      short: 'Pocket and holes',
      brief: 'Face the top, mill a 40 × 24 pocket 6 deep whose inside corners are no rounder than R4, and drill two Ø6.6 holes right through.',
      top: 0, bottom: -20, section: 30,
      features: [
        { type: 'recess', kind: 'pocket', id: 'pocket', label: 'Pocket 40 × 24, 6 deep, corners R4 max',
          x0: 30, x1: 70, y0: 18, y1: 42, floor: -6, rMax: 4 },
        { type: 'hole', id: 'hole-left', label: 'Ø6.6 through at X 15, Y 30', cx: 15, cy: 30, d: 6.6, through: true },
        { type: 'hole', id: 'hole-right', label: 'Ø6.6 through at X 85, Y 30', cx: 85, cy: 30, d: 6.6, through: true }
      ],
      dims: [
        { view: 'top', axis: 'x', from: 0, to: 15, at: -10 },
        { view: 'top', axis: 'x', from: 0, to: 30, at: -18 },
        { view: 'top', axis: 'x', from: 30, to: 70, at: -10 },
        { view: 'top', axis: 'x', from: 85, to: 100, at: -10 },
        { view: 'top', axis: 'y', from: 0, to: 18, at: -8 },
        { view: 'top', axis: 'y', from: 18, to: 42, at: -8 },
        { view: 'top', axis: 'y', from: 0, to: 30, at: 108 },
        { view: 'front', axis: 'z', from: -6, to: 0, at: 76 }
      ],
      notes: [
        { view: 'top', at: [33, 39], text: 'R4 MAX', dx: 10, dy: 14 },
        { view: 'top', at: [15, 30], text: '2× Ø6.6 THRU', dx: -2, dy: 22, r: 3.3 }
      ],
      hints: [
        'Depths are measured from the finished top at Z 0.00, so the pocket floor is at Z −6.00 whether or not the top has been faced yet.',
        'An end mill leaves its own radius in an inside corner. R4 max means a cutter no bigger than Ø8.',
        'Clear a pocket from the inside out: plunge in the middle, then work out to the walls. With a Ø8 cutter the centre stays 4 mm inside every wall: X 34 to 66, Y 22 to 38.',
        'The parallels under the part run along its front and back edges. Holes at Y 30 are clear of them, so these can go right through.'
      ]
    },
    {
      id: 'tapped', n: 3, title: 'A slot and two tapped holes',
      short: 'Slot and tapped holes',
      brief: 'Face the top, mill a slot 10 wide with full-round ends, and make two countersunk M6×1 threaded holes with at least 10 mm of full thread.',
      top: 0, bottom: -20, section: 30,
      features: [
        { type: 'slot', id: 'slot', label: 'Slot 10 wide, 5 deep, full-round ends', ax: 35, ay: 30, bx: 65, by: 30, width: 10, floor: -5 },
        { type: 'hole', id: 'tap-left', label: 'M6×1 at X 15, Y 30: full thread 10 deep, countersink Ø7 × 90°',
          cx: 15, cy: 30, d: 5.035, tolD: 0.118, thread: { spec: 'M6x1', depth: 10 }, csk: { d: 7, angle: 90 }, minWall: 1 },
        { type: 'hole', id: 'tap-right', label: 'M6×1 at X 85, Y 30: full thread 10 deep, countersink Ø7 × 90°',
          cx: 85, cy: 30, d: 5.035, tolD: 0.118, thread: { spec: 'M6x1', depth: 10 }, csk: { d: 7, angle: 90 }, minWall: 1 }
      ],
      dims: [
        { view: 'top', axis: 'x', from: 0, to: 15, at: -10 },
        { view: 'top', axis: 'x', from: 0, to: 30, at: -18 },
        { view: 'top', axis: 'x', from: 30, to: 70, at: -10 },
        { view: 'top', axis: 'x', from: 85, to: 100, at: -10 },
        { view: 'top', axis: 'y', from: 25, to: 35, at: -8 },
        { view: 'top', axis: 'y', from: 0, to: 30, at: 108 },
        { view: 'front', axis: 'z', from: -5, to: 0, at: 108 }
      ],
      notes: [
        { view: 'top', at: [65, 30], text: 'R5 ENDS', dx: 12, dy: 16, r: 5 },
        { view: 'top', at: [15, 30], text: '2× M6×1-6H, FULL THREAD 10 DEEP', dx: -2, dy: 22, r: 3 },
        { view: 'top', at: [15, 30], text: 'CSK Ø7 × 90°', dx: -2, dy: 30, hidden: true }
      ],
      hints: [
        'Work out each depth from Z 0.00, the finished top: the slot floor is Z −5.00 and full thread must reach Z −10.00. Then the order you face, drill and tap in does not change the part.',
        'A slot with full-round ends is exactly what a cutter of the slot’s width leaves when it moves in a straight line.',
        'An M6×1 thread goes into a Ø5.0 hole: the outside diameter of the thread minus its pitch.',
        'The first 4 threads of the tap are tapered to help it start, so its tip has to go 4 mm deeper than the full thread you need. The drilled hole has to be deeper again, past the drill’s point.',
        'The spot and chamfer tool has a 90° point. With its tip 3.5 mm below the top it cuts a Ø7 countersink round a hole.'
      ]
    },
    {
      id: 'boss', n: 4, title: 'A boss with a bored hole and chamfered edges',
      short: 'Boss and bore',
      brief: 'Face the top, mill away everything round a 50 × 30 boss so it stands 5 high, bore a Ø20.00 hole through it, and chamfer its top edges 1 × 45°.',
      top: 0, bottom: -20, section: 30,
      features: [
        { type: 'boss', id: 'boss', label: 'Boss 50 × 30 standing 5 high', x0: BOSS.x0, x1: BOSS.x1, y0: BOSS.y0, y1: BOSS.y1, floor: -5 },
        { type: 'chamfer', id: 'chamfer', label: 'Chamfer 1 × 45° round the top of the boss', boss: BOSS, size: 1 },
        { type: 'hole', id: 'bore', label: 'Bore Ø20.00 ±0.05 through', cx: 50, cy: 30, d: 20, through: true, tolD: 0.05, tolPos: 0.05 }
      ],
      dims: [
        { view: 'top', axis: 'x', from: 0, to: 25, at: -10 },
        { view: 'top', axis: 'x', from: 25, to: 75, at: -10 },
        { view: 'top', axis: 'y', from: 0, to: 15, at: -8 },
        { view: 'top', axis: 'y', from: 15, to: 45, at: -8 },
        { view: 'top', axis: 'y', from: 0, to: 30, at: 108 },
        { view: 'front', axis: 'z', from: -5, to: 0, at: 106 }
      ],
      notes: [
        { view: 'top', at: [50, 30], text: 'Ø20.00 ±0.05 THRU', dx: 24, dy: 22, r: 10 },
        { view: 'top', at: [75, 45], text: '1 × 45°', dx: 10, dy: 10 }
      ],
      hints: [
        'The boss top is the finished top, Z 0.00, and the floor round it is Z −5.00.',
        'Round the boss the metal comes down 5 mm everywhere. The face mill can clear the open ends in two passes; an end mill finishes along the boss’s faces.',
        'Outside corners stay sharp when a cutter goes round them. Only inside corners take the cutter’s radius.',
        'A boring head has no cutting edge at its centre, so it needs a hole to start in. Drill Ø10 through first, then set the head to Ø20.00 and feed it through.',
        'For a 1 mm chamfer with the 90° tool, put its axis right on the edge line with its tip at Z −1.00, then run it along each edge.'
      ]
    },
    {
      id: 'free', n: 0, title: 'Free practice', short: 'Free practice', free: true,
      brief: 'No drawing: try each tool on the raw block and see what it does.',
      top: 0, bottom: -20, section: 30, features: [], dims: [], notes: [], hints: []
    }
  ];

  var BY_ID = {};
  JOBS.forEach(function (j) { BY_ID[j.id] = j; });

  return { JOBS: JOBS, BY_ID: BY_ID, BOSS: BOSS };
});

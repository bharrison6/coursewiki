/* ============================================================================
   feeds-and-speeds / model.js - the arithmetic and the motion, nothing drawn.

   Every quantity is held in one canonical set of units - millimetres,
   metres per minute, millimetres per tooth, millimetres per minute - and
   converted only for display. Switching between inch and metric therefore
   never re-rounds the physical setup: the same cutter, at the same speed,
   is described in different words.

     spindle speed  n  = 1000 * Vc / (pi * D)          rev/min   (D in mm, Vc in m/min)
                       = 12 * SFM / (pi * D)            rev/min   (D in inches)
     table feed     vf = n * z * fz                     per minute
     chip load      fz = vf / (n * z)                   per tooth
     cutting speed  Vc = pi * D * n / 1000              m/min

   z is the number of teeth that take a chip in each turn. For an ordinary
   end mill that is the flute count.

   Pure UMD: browser global CourseWikiFeedsSpeeds, CommonJS the same object.
   ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiFeedsSpeeds = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MM_PER_IN = 25.4;
  var M_PER_FT = 0.3048;

  /* Display units. `toCanon` multiplies a displayed number into canonical
     units; dividing reverses it. */
  var UNITS = {
    in: {
      name: 'inch', diameter: 'in', speed: 'ft/min', speedShort: 'SFM', feed: 'in/min', chip: 'in/tooth',
      toCanon: { diameter: MM_PER_IN, speed: M_PER_FT, feed: MM_PER_IN, chip: MM_PER_IN }
    },
    mm: {
      name: 'metric', diameter: 'mm', speed: 'm/min', speedShort: 'm/min', feed: 'mm/min', chip: 'mm/tooth',
      toCanon: { diameter: 1, speed: 1, feed: 1, chip: 1 }
    }
  };

  /* Accepted range for each input, canonical units. Wide on purpose: the
     limits only stop a typing slip from producing a nonsense drawing. */
  var LIMITS = {
    diameter: { min: 0.1, max: 300 },        // mm
    speed:    { min: 1, max: 3000 },         // m/min
    teeth:    { min: 1, max: 16 },           // whole teeth
    chip:     { min: 0.0005, max: 3 },       // mm/tooth
    maxRpm:   { min: 10, max: 200000 }       // rev/min, optional
  };

  /* Illustrative setups. They are arithmetic examples, not cutting data:
     the page says so wherever they appear. Each exists in both unit
     systems so the button row reads naturally in either. */
  var EXAMPLES = {
    in: [
      { id: 'half-inch', title: 'Half-inch cutter', unit: 'in', diameter: 0.5, speed: 300, teeth: 4, chip: 0.002, maxRpm: null },
      { id: 'eighth-inch-capped', title: 'Eighth-inch cutter, 4,000 rev/min machine', unit: 'in', diameter: 0.125, speed: 300, teeth: 2, chip: 0.0008, maxRpm: 4000 }
    ],
    mm: [
      { id: 'twelve-mm', title: '12 mm cutter', unit: 'mm', diameter: 12, speed: 90, teeth: 4, chip: 0.05, maxRpm: null },
      { id: 'three-mm-capped', title: '3 mm cutter, 4,000 rev/min machine', unit: 'mm', diameter: 3, speed: 90, teeth: 2, chip: 0.02, maxRpm: 4000 }
    ]
  };

  function finite(v) { return typeof v === 'number' && isFinite(v); }

  /* ---- the four relations -------------------------------------------------*/
  function spindleSpeed(speedMPerMin, diameterMm) { return 1000 * speedMPerMin / (Math.PI * diameterMm); }
  function spindleSpeedInch(sfm, diameterIn) { return 12 * sfm / (Math.PI * diameterIn); }
  function cuttingSpeed(rpm, diameterMm) { return Math.PI * diameterMm * rpm / 1000; }
  function tableFeed(rpm, teeth, chip) { return rpm * teeth * chip; }
  function chipLoad(feed, rpm, teeth) { return feed / (rpm * teeth); }

  /* ---- unit conversion ----------------------------------------------------*/
  function toCanon(unit, kind, value) { return value * UNITS[unit].toCanon[kind]; }
  function fromCanon(unit, kind, value) { return value / UNITS[unit].toCanon[kind]; }

  /* A setup in display units -> canonical, and back. Teeth and rev/min have
     no unit system. */
  function setupToCanon(unit, s) {
    return {
      diameter: toCanon(unit, 'diameter', s.diameter),
      speed: toCanon(unit, 'speed', s.speed),
      teeth: s.teeth,
      chip: toCanon(unit, 'chip', s.chip),
      maxRpm: s.maxRpm === null || s.maxRpm === undefined ? null : s.maxRpm
    };
  }
  function setupFromCanon(unit, c) {
    return {
      diameter: fromCanon(unit, 'diameter', c.diameter),
      speed: fromCanon(unit, 'speed', c.speed),
      teeth: c.teeth,
      chip: fromCanon(unit, 'chip', c.chip),
      maxRpm: c.maxRpm
    };
  }

  function example(unit, id) {
    var list = EXAMPLES[unit] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---- reading what a student typed ---------------------------------------
     Accepts "0.5", ".5", "1,250" and "1 250". Returns a number, or null for
     anything that is not one plain number. */
  function parseNumber(text) {
    if (typeof text === 'number') return finite(text) ? text : null;
    var s = String(text === undefined || text === null ? '' : text).trim().replace(/[\s,]/g, '');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
    var v = Number(s);
    return finite(v) ? v : null;
  }

  var FIELD_NAMES = {
    diameter: 'Cutter diameter', speed: 'Cutting speed', teeth: 'Flutes',
    chip: 'Feed per tooth', maxRpm: 'Machine top speed'
  };

  /* Validate one complete form. `raw` holds strings keyed like LIMITS.
     Returns { ok, canon, errors: [{field, message}] }. */
  function validate(unit, raw) {
    var errors = [], disp = {};
    ['diameter', 'speed', 'teeth', 'chip'].forEach(function (k) {
      var v = parseNumber(raw[k]);
      if (v === null) { errors.push({ field: k, message: FIELD_NAMES[k] + ' needs a number.' }); return; }
      if (v <= 0) { errors.push({ field: k, message: FIELD_NAMES[k] + ' must be more than zero.' }); return; }
      if (k === 'teeth' && Math.round(v) !== v) { errors.push({ field: k, message: 'Flutes is a whole number of teeth.' }); return; }
      disp[k] = v;
    });
    var blank = raw.maxRpm === undefined || raw.maxRpm === null || String(raw.maxRpm).trim() === '';
    if (blank) disp.maxRpm = null;
    else {
      var m = parseNumber(raw.maxRpm);
      if (m === null) errors.push({ field: 'maxRpm', message: 'Machine top speed needs a number, or leave it empty.' });
      else if (m <= 0) errors.push({ field: 'maxRpm', message: 'Machine top speed must be more than zero.' });
      else disp.maxRpm = m;
    }
    var canon = null;
    if (!errors.length) {
      canon = setupToCanon(unit, disp);
      Object.keys(LIMITS).forEach(function (k) {
        var v = canon[k];
        if (v === null || v === undefined) return;
        var L = LIMITS[k];
        if (v < L.min - 1e-9 || v > L.max + 1e-9) {
          var lo = k === 'teeth' || k === 'maxRpm' ? L.min : fromCanon(unit, k, L.min);
          var hi = k === 'teeth' || k === 'maxRpm' ? L.max : fromCanon(unit, k, L.max);
          errors.push({ field: k, message: FIELD_NAMES[k] + ' is outside what this calculator draws: ' +
            format(lo, k, unit) + ' to ' + format(hi, k, unit) + '.' });
        }
      });
      if (errors.length) canon = null;
    }
    return { ok: !errors.length, canon: canon, errors: errors };
  }

  /* ---- the calculation -----------------------------------------------------
     `requestedRpm` is what the cutting speed asks for. `rpm` is what the
     machine actually runs - the same unless a top speed caps it. Everything
     downstream (feed, the cutting speed you really get) is worked from the
     speed actually run, so the chip load is kept.                          */
  function solve(c) {
    var requested = spindleSpeed(c.speed, c.diameter);
    var capped = c.maxRpm !== null && c.maxRpm !== undefined && requested > c.maxRpm;
    var rpm = capped ? c.maxRpm : requested;
    return {
      requestedRpm: requested,
      rpm: rpm,
      capped: capped,
      feed: tableFeed(rpm, c.teeth, c.chip),
      requestedFeed: tableFeed(requested, c.teeth, c.chip),
      speed: cuttingSpeed(rpm, c.diameter),
      requestedSpeed: c.speed,
      chip: c.chip,
      teeth: c.teeth,
      diameter: c.diameter
    };
  }

  /* The experiment: change only the spindle speed, by `factor` of what the
     setup runs, and hold one of two things.
       hold 'chip' - each tooth takes the same bite; the table must feed
                     faster or slower in step with the spindle.
       hold 'feed' - the table keeps its feed; each tooth's bite changes
                     inversely with the spindle speed.
     A machine top speed still caps the result.                            */
  var HOLDS = ['chip', 'feed'];
  function trial(c, factor, hold) {
    if (HOLDS.indexOf(hold) < 0) throw new Error('hold must be chip or feed');
    var base = solve(c);
    var f = finite(factor) && factor > 0 ? factor : 1;
    var wanted = base.rpm * f;
    var capped = c.maxRpm !== null && c.maxRpm !== undefined && wanted > c.maxRpm + 1e-9;
    var rpm = capped ? c.maxRpm : wanted;
    var chip = hold === 'chip' ? base.chip : chipLoad(base.feed, rpm, c.teeth);
    var feed = hold === 'chip' ? tableFeed(rpm, c.teeth, chip) : base.feed;
    var out = {
      hold: hold, factor: f, wantedRpm: wanted, capped: capped,
      rpm: rpm, feed: feed, chip: chip, speed: cuttingSpeed(rpm, c.diameter),
      teeth: c.teeth, diameter: c.diameter
    };
    out.change = {
      rpm: rpm / base.rpm, feed: feed / base.feed, chip: chip / base.chip, speed: out.speed / base.speed
    };
    return out;
  }

  /* ---- motion, on one disclosed time scale ---------------------------------
     The drawing runs `slowdown` times slower than the machine would. Both the
     cutter's turning and the work's travel are worked from the same real
     time, so the ratio between them is the real one.

     The cutter turns clockwise; seen down its axis, the work is fed to the
     LEFT, so the uncut material is on the right and the front of the cut is
     at psi = 0 (math angle, x right, y up). A tooth is engaged while it is
     on the front half, cos(psi) > 0, as in a full-width slot.             */
  var SLOWDOWNS = [50, 200, 1000, 5000];

  function realTime(screenSeconds, slowdown) { return screenSeconds / slowdown; }

  /* Tooth angle at real time t, radians, normalised to (-pi, pi]. Tooth 0
     sits at psi0 when t = 0. */
  function wrap(a) {
    var t = a % (2 * Math.PI);
    if (t <= -Math.PI) t += 2 * Math.PI;
    if (t > Math.PI) t -= 2 * Math.PI;
    return t;
  }

  /* `run` is any object with rpm, feed (canonical mm/min), teeth. */
  function motion(run, tReal, psi0) {
    var z = run.teeth, omega = 2 * Math.PI * run.rpm / 60;     // rad per real second
    var p0 = finite(psi0) ? psi0 : Math.PI / 2;
    var turned = omega * tReal;
    var teeth = [];
    for (var k = 0; k < z; k++) {
      var psi = wrap(p0 - turned - 2 * Math.PI * k / z);
      teeth.push({ psi: psi, engaged: Math.cos(psi) > 1e-9 });
    }
    return {
      teeth: teeth,
      turns: turned / (2 * Math.PI),
      workTravel: run.feed / 60 * tReal,                   // mm the work has moved, to the left
      passPeriod: 60 / (run.rpm * z),                      // real seconds between tooth passes
      passes: passesBefore(run, tReal, p0)
    };
  }

  /* Real times at which a tooth crosses the front of the cut (psi = 0),
     counted from t = 0. With psi0 in (0, 2pi/z], the first crossing is at
     psi0 / omega and they follow every 60 / (n z) seconds. */
  function firstPass(run, psi0) {
    var omega = 2 * Math.PI * run.rpm / 60, pitch = 2 * Math.PI / run.teeth;
    var lead = ((psi0 % pitch) + pitch) % pitch;
    if (lead < 1e-12) lead = pitch;
    return lead / omega;
  }
  function passesBefore(run, tReal, psi0) {
    if (!(tReal >= 0)) return 0;
    var t1 = firstPass(run, finite(psi0) ? psi0 : Math.PI / 2);
    if (tReal < t1) return 0;
    return 1 + Math.floor((tReal - t1) / (60 / (run.rpm * run.teeth)) + 1e-9);
  }

  /* Where the marks left by each pass sit on the work, measured back from
     the front of the cut, in mm, newest first. Each tooth pass lays one; the
     work carries them away. Their spacing is the feed per tooth - the
     whole point of the inset. The cut is taken to be already under way at
     t = 0, so passes before the clock started count too. */
  function marks(run, tReal, psi0, count) {
    var p0 = finite(psi0) ? psi0 : Math.PI / 2;
    var t1 = firstPass(run, p0), period = 60 / (run.rpm * run.teeth), out = [];
    var j = Math.floor((tReal - t1) / period + 1e-9);
    for (; out.length < (count || 12); j--) {
      var tj = t1 + j * period;
      out.push({ index: j, age: tReal - tj, offset: run.feed / 60 * (tReal - tj) });
    }
    return out;
  }

  /* How far the uncut face has crept past the path of the tooth tips since
     the last pass, mm. It grows from zero to one feed per tooth, and the
     next tooth takes exactly that as its chip. */
  function uncutSliver(run, tReal, psi0) {
    var p0 = finite(psi0) ? psi0 : Math.PI / 2;
    var t1 = firstPass(run, p0), period = 60 / (run.rpm * run.teeth);
    if (tReal < t1) return run.feed / 60 * (tReal + (period - t1));
    var since = (tReal - t1) % period;
    return run.feed / 60 * since;
  }

  /* On-screen rates, for the "too quick to follow" note and the caption. */
  function screenRates(run, slowdown) {
    return {
      turnsPerSecond: run.rpm / 60 / slowdown,
      passesPerSecond: run.rpm * run.teeth / 60 / slowdown,
      realTurnsPerSecond: run.rpm / 60,
      realTravelPerSecond: run.feed / 60
    };
  }

  /* ---- display formatting --------------------------------------------------
     Decimal places per quantity and unit. Rev/min are whole numbers;
     everything else carries enough places to read a typical value. */
  var PLACES = {
    in: { diameter: 4, speed: 0, feed: 1, chip: 4, rpm: 0, maxRpm: 0, teeth: 0, travel: 4 },
    mm: { diameter: 3, speed: 0, feed: 0, chip: 3, rpm: 0, maxRpm: 0, teeth: 0, travel: 2 }
  };

  function group(intPart) { return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* Fixed places, trailing zeros trimmed to `minPlaces`, thousands grouped.
     A value that would show as zero is given more places rather than lie. */
  function fixed(v, places, minPlaces) {
    if (!finite(v)) return '-';
    var p = places, s = Math.abs(v).toFixed(p);
    while (Number(s) === 0 && v !== 0 && p < 8) { p += 1; s = Math.abs(v).toFixed(p); }
    var parts = s.split('.');
    var frac = parts[1] || '';
    var keep = Math.max(minPlaces || 0, 0);
    while (frac.length > keep && frac.charAt(frac.length - 1) === '0') frac = frac.slice(0, -1);
    return (v < 0 ? '-' : '') + group(parts[0]) + (frac ? '.' + frac : '');
  }

  /* `kind` is diameter | speed | feed | chip | rpm | maxRpm | teeth | travel,
     `value` already in display units. Speed under 100 gets one place so a
     slow cut does not read as a round number. */
  function format(value, kind, unit) {
    var places = PLACES[unit][kind];
    if (kind === 'chip' && value > 0) places = Math.max(places, 3 - Math.floor(Math.log10(value)));
    if (kind === 'speed' && value < 100) places = 1;
    if (kind === 'feed' && unit === 'mm' && value < 100) places = 1;
    if (kind === 'feed' && unit === 'in' && value >= 100) places = 0;
    var min = kind === 'chip' ? (unit === 'in' ? 4 : 3) : 0;
    return fixed(value, places, min);
  }

  function unitLabel(kind, unit) {
    if (kind === 'rpm' || kind === 'maxRpm') return 'rev/min';
    if (kind === 'teeth') return 'flutes';
    if (kind === 'travel') return UNITS[unit].diameter;
    return kind === 'speed' ? UNITS[unit].speedShort : UNITS[unit][kind];
  }

  /* Canonical value -> "2,292 rev/min" in the chosen unit system. */
  function show(canonValue, kind, unit) {
    var v = (kind === 'rpm' || kind === 'maxRpm' || kind === 'teeth') ? canonValue
      : fromCanon(unit, kind === 'travel' ? 'diameter' : kind, canonValue);
    return format(v, kind, unit) + ' ' + unitLabel(kind, unit);
  }

  /* "x2", "x0.5", "held" - how a trial value compares with the setup. */
  function ratioText(r) {
    if (!finite(r)) return '-';
    if (Math.abs(r - 1) < 5e-4) return 'unchanged';
    var s = r >= 10 ? r.toFixed(0) : (r >= 1 ? r.toFixed(2) : r.toFixed(2));
    s = s.replace(/\.?0+$/, '');
    return '×' + s;
  }

  /* A "nice" scale-bar length (1, 2 or 5 x 10^k) close to `target`. */
  function niceLength(target) {
    if (!(target > 0)) return 1;
    var e = Math.floor(Math.log10(target)), base = Math.pow(10, e), m = target / base;
    var nice = m < 1.5 ? 1 : (m < 3.5 ? 2 : (m < 7.5 ? 5 : 10));
    return nice * base;
  }

  return {
    UNITS: UNITS, LIMITS: LIMITS, EXAMPLES: EXAMPLES, HOLDS: HOLDS, SLOWDOWNS: SLOWDOWNS,
    MM_PER_IN: MM_PER_IN, M_PER_FT: M_PER_FT,
    spindleSpeed: spindleSpeed, spindleSpeedInch: spindleSpeedInch, cuttingSpeed: cuttingSpeed,
    tableFeed: tableFeed, chipLoad: chipLoad,
    toCanon: toCanon, fromCanon: fromCanon, setupToCanon: setupToCanon, setupFromCanon: setupFromCanon,
    example: example, parseNumber: parseNumber, validate: validate,
    solve: solve, trial: trial,
    realTime: realTime, motion: motion, marks: marks, uncutSliver: uncutSliver,
    passesBefore: passesBefore, firstPass: firstPass, screenRates: screenRates, wrap: wrap,
    format: format, show: show, unitLabel: unitLabel, ratioText: ratioText, niceLength: niceLength
  };
});

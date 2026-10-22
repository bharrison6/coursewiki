/* ============================================================================
   feeds-and-speeds / model.js - the arithmetic, nothing drawn.

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
   end mill that is the flute count. What the cut removes, and the power
   that takes, belong to the material-removal module.

   Nothing here holds a starting setup. A blank field is a blank field, and
   each result is worked out as soon as the fields it needs are valid.

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
     units; dividing reverses it. Width and depth of cut are lengths, like
     the diameter. */
  var UNITS = {
    in: {
      name: 'inch', diameter: 'in', speed: 'ft/min', speedShort: 'SFM', feed: 'in/min', chip: 'in/tooth',
      toCanon: { diameter: MM_PER_IN, width: MM_PER_IN, depth: MM_PER_IN, speed: M_PER_FT, feed: MM_PER_IN, chip: MM_PER_IN }
    },
    mm: {
      name: 'metric', diameter: 'mm', speed: 'm/min', speedShort: 'm/min', feed: 'mm/min', chip: 'mm/tooth',
      toCanon: { diameter: 1, width: 1, depth: 1, speed: 1, feed: 1, chip: 1 }
    }
  };

  /* Accepted range for each input, canonical units. Wide on purpose: the
     limits only stop a typing slip from producing a nonsense drawing. */
  var LIMITS = {
    diameter: { min: 0.1, max: 300 },        // mm
    speed:    { min: 1, max: 3000 },         // m/min
    teeth:    { min: 1, max: 16 },           // whole teeth
    chip:     { min: 0.0005, max: 3 },       // mm/tooth
    maxRpm:   { min: 10, max: 200000 },      // rev/min, optional
    width:    { min: 0.01, max: 300 },       // mm
    depth:    { min: 0.01, max: 300 },       // mm
    eta:      { min: 1, max: 100 }           // percent, optional
  };

  var FIELD_NAMES = {
    diameter: 'Cutter diameter', speed: 'Cutting speed', teeth: 'Flutes', chip: 'Feed per tooth',
    maxRpm: 'Machine top speed', width: 'Width of cut', depth: 'Depth of cut', eta: 'Drivetrain efficiency'
  };
  var REQUIRED = ['diameter', 'speed', 'teeth', 'chip', 'width', 'depth'];
  var OPTIONAL = ['maxRpm', 'eta'];
  var FIELDS = ['diameter', 'teeth', 'maxRpm', 'speed', 'chip', 'width', 'depth', 'eta'];

  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function lengthKind(kind) { return kind === 'width' || kind === 'depth' || kind === 'travel' ? 'diameter' : kind; }
  function unitless(kind) { return kind === 'teeth' || kind === 'maxRpm' || kind === 'rpm' || kind === 'eta'; }

  /* ---- the four relations -------------------------------------------------*/
  function spindleSpeed(speedMPerMin, diameterMm) { return 1000 * speedMPerMin / (Math.PI * diameterMm); }
  function spindleSpeedInch(sfm, diameterIn) { return 12 * sfm / (Math.PI * diameterIn); }
  function cuttingSpeed(rpm, diameterMm) { return Math.PI * diameterMm * rpm / 1000; }
  function tableFeed(rpm, teeth, chip) { return rpm * teeth * chip; }
  function chipLoad(feed, rpm, teeth) { return feed / (rpm * teeth); }

  /* ---- unit conversion ----------------------------------------------------*/
  function toCanon(unit, kind, value) { return unitless(kind) ? value : value * UNITS[unit].toCanon[lengthKind(kind)]; }
  function fromCanon(unit, kind, value) { return unitless(kind) ? value : value / UNITS[unit].toCanon[lengthKind(kind)]; }

  /* A setup in display units -> canonical, and back. Missing fields stay
     missing; optional ones are null. */
  function setupToCanon(unit, s) {
    var c = {};
    FIELDS.forEach(function (k) {
      var v = s[k];
      c[k] = v === null || v === undefined ? (OPTIONAL.indexOf(k) >= 0 ? null : undefined) : toCanon(unit, k, v);
      if (c[k] === undefined) delete c[k];
    });
    return c;
  }
  function setupFromCanon(unit, c) {
    var s = {};
    Object.keys(c).forEach(function (k) { s[k] = c[k] === null ? null : fromCanon(unit, k, c[k]); });
    return s;
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
  function blank(t) { return t === undefined || t === null || String(t).trim() === ''; }

  /* Read each field on its own. `raw` holds strings keyed like LIMITS.
     Returns { values (canonical, valid fields only), errors, missing }:
     a blank required field is missing, not wrong; a blank optional field
     is null. Width is checked against the diameter when both are valid. */
  function readFields(unit, raw) {
    var values = {}, errors = [], missing = [];
    FIELDS.forEach(function (k) {
      var optional = OPTIONAL.indexOf(k) >= 0, t = raw[k];
      if (blank(t)) { if (optional) values[k] = null; else missing.push(k); return; }
      var v = parseNumber(t);
      if (v === null) { errors.push({ field: k, message: FIELD_NAMES[k] + ' needs a number' + (optional ? ', or leave it empty.' : '.') }); return; }
      if (v <= 0) { errors.push({ field: k, message: FIELD_NAMES[k] + ' must be more than zero.' }); return; }
      if (k === 'teeth' && Math.round(v) !== v) { errors.push({ field: k, message: 'Flutes is a whole number of teeth.' }); return; }
      var c = toCanon(unit, k, v), L = LIMITS[k];
      if (c < L.min - 1e-9 || c > L.max + 1e-9) {
        errors.push({ field: k, message: FIELD_NAMES[k] + ' is outside what this calculator handles: ' +
          show(L.min, k, unit) + ' to ' + show(L.max, k, unit) + '.' });
        return;
      }
      values[k] = c;
    });
    if (finite(values.width) && finite(values.diameter) && values.width > values.diameter * (1 + 1e-9)) {
      errors.push({ field: 'width', message: 'Width of cut cannot be more than the cutter diameter. A wider path takes more than one pass.' });
      delete values.width;
    }
    return { values: values, errors: errors, missing: missing };
  }

  /* The whole form at once: ok only when nothing is missing or wrong. */
  function validate(unit, raw) {
    var r = readFields(unit, raw);
    var errors = r.errors.concat(r.missing.map(function (k) { return { field: k, message: FIELD_NAMES[k] + ' needs a number.' }; }));
    return { ok: !errors.length, canon: errors.length ? null : r.values, errors: errors, values: r.values, missing: r.missing };
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

  /* As much of `solve` as the valid fields allow. Each result is present
     or absent, and `needs` names what an absent one is waiting for. */
  var NEEDS = {
    rpm: ['diameter', 'speed'],
    feed: ['diameter', 'speed', 'teeth', 'chip'],
    rate: ['diameter', 'speed', 'teeth', 'chip', 'width', 'depth']
  };
  function partial(values) {
    var out = { needs: {} };
    Object.keys(NEEDS).forEach(function (k) {
      out.needs[k] = NEEDS[k].filter(function (f) { return !finite(values[f]); });
    });
    if (!out.needs.rpm.length) {
      var requested = spindleSpeed(values.speed, values.diameter);
      var capped = finite(values.maxRpm) && requested > values.maxRpm;
      out.requestedRpm = requested;
      out.capped = capped;
      out.rpm = capped ? values.maxRpm : requested;
      out.speed = cuttingSpeed(out.rpm, values.diameter);
    }
    if (!out.needs.feed.length) {
      out.full = solve(values);
      out.feed = out.full.feed;
      out.chip = values.chip;
    }
    return out;
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

  /* Where a value sits against a guide band [low, high]. */
  function bandPosition(value, band) {
    if (!finite(value) || !band) return null;
    if (value < band[0] * (1 - 1e-9)) return 'below';
    if (value > band[1] * (1 + 1e-9)) return 'above';
    return 'inside';
  }

  /* ---- display formatting --------------------------------------------------
     Decimal places per quantity and unit. Rev/min are whole numbers;
     everything else carries enough places to read a typical value. */
  var PLACES = {
    in: { diameter: 4, speed: 0, feed: 1, chip: 4, rpm: 0, maxRpm: 0, teeth: 0, eta: 0 },
    mm: { diameter: 3, speed: 0, feed: 0, chip: 3, rpm: 0, maxRpm: 0, teeth: 0, eta: 0 }
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

  /* `kind` is a field or result name, `value` already in display units.
     Speed under 100 gets one place so a slow cut does not read as a round
     number. Efficiency may carry one place. */
  function format(value, kind, unit) {
    var k = lengthKind(kind);
    var places = PLACES[unit][k];
    if (k === 'chip' && value > 0) places = Math.max(places, 3 - Math.floor(Math.log10(value)));
    if (k === 'speed' && value < 100) places = 1;
    if (k === 'feed' && unit === 'mm' && value < 100) places = 1;
    if (k === 'feed' && unit === 'in' && value >= 100) places = 0;
    if (k === 'eta') places = 1;
    var min = k === 'chip' ? (unit === 'in' ? 4 : 3) : 0;
    return fixed(value, places, min);
  }

  function unitLabel(kind, unit) {
    if (kind === 'rpm' || kind === 'maxRpm') return 'rev/min';
    if (kind === 'teeth') return 'flutes';
    if (kind === 'eta') return '%';
    var k = lengthKind(kind);
    return k === 'speed' ? UNITS[unit].speedShort : UNITS[unit][k];
  }

  /* Canonical value -> "2,292 rev/min" in the chosen unit system. */
  function show(canonValue, kind, unit) {
    var lab = unitLabel(kind, unit);
    return format(fromCanon(unit, kind, canonValue), kind, unit) + (lab === '%' ? '%' : ' ' + lab);
  }

  /* "x2", "x0.5", "unchanged" - how a trial value compares with the setup. */
  function ratioText(r) {
    if (!finite(r)) return '-';
    if (Math.abs(r - 1) < 5e-4) return 'unchanged';
    var s = r >= 10 ? r.toFixed(0) : r.toFixed(2);
    s = s.replace(/\.?0+$/, '');
    return '×' + s;
  }

  return {
    UNITS: UNITS, LIMITS: LIMITS, HOLDS: HOLDS, FIELDS: FIELDS, REQUIRED: REQUIRED, OPTIONAL: OPTIONAL,
    FIELD_NAMES: FIELD_NAMES, NEEDS: NEEDS, MM_PER_IN: MM_PER_IN, M_PER_FT: M_PER_FT,
    spindleSpeed: spindleSpeed, spindleSpeedInch: spindleSpeedInch, cuttingSpeed: cuttingSpeed,
    tableFeed: tableFeed, chipLoad: chipLoad,
    toCanon: toCanon, fromCanon: fromCanon, setupToCanon: setupToCanon, setupFromCanon: setupFromCanon,
    parseNumber: parseNumber, readFields: readFields, validate: validate,
    solve: solve, partial: partial, trial: trial, bandPosition: bandPosition,
    format: format, show: show, unitLabel: unitLabel, ratioText: ratioText
  };
});

/* ==========================================================================
   The Pace of AI Progress — the chart.

   One canvas. It draws the known data, takes a dragged forecast, then
   animates the truth over the top of it.

   Everything is laid out in CSS pixels and scaled by devicePixelRatio at
   draw time, so the same code is crisp on a phone and on a 1080p projector.
   ========================================================================== */

const Chart = (() => {

const E = ENGINE;

/* Murray State palette. Red-orange is reserved for things going wrong, per
   the university brand guide's request that accents stay sparing. */
const C = {
  ink:      '#E8EDF5',
  dim:      '#8FA3C0',
  faint:    'rgba(143,163,192,0.18)',
  grid:     'rgba(143,163,192,0.10)',
  navy:     '#002144',
  gold:     '#ECAC00',
  cyan:     '#00A4E3',
  red:      '#FF4500',
  guess:    '#00A4E3',
  truth:    '#ECAC00',
  human:    'rgba(232,237,245,0.55)'
};

function create(canvas) {
  const ctx = canvas.getContext('2d');
  const st = {
    canvas, ctx,
    round: null,
    guess: null,
    phase: 'idle',      /* idle | drawing | drawn | revealing | revealed */
    revealT: 0,         /* 0..1 sweep of the truth line */
    twistOn: false,
    twistT: 0,
    w: 0, h: 0, dpr: 1,
    pad: { l: 58, r: 18, t: 30, b: 40 },
    big: false,
    axisEnd: 0,      /* injected by the app; see setAxisEnd */
    onDraw: null,
    _lastX: null,
    _raf: null
  };

  bindPointer(st);
  return {
    setRound: r => setRound(st, r),
    resize:   () => resize(st),
    render:   () => render(st),
    reveal:   cb => reveal(st, cb),
    twist:    cb => twist(st, cb),
    reset:    () => { cancelAnimationFrame(st._raf); st.guess = E.emptyGuess(baselineY(st)); st.phase = 'idle'; st.revealT = 0;
                      st.twistOn = false; st.twistT = 0; st.t1 = st.tBase; render(st); },
    setBig:   b => { st.big = b; resize(st); },
    /* The shared right-hand edge every chart runs to, as epoch ms. Injected
       rather than imported so this module stays free of the dataset. */
    setAxisEnd: iso => { st.axisEnd = E.t(iso); },
    state:    () => st,
    guess:    () => st.guess,
    drawn:    () => E.guessComplete(st.guess, baselineY(st)),
    setForecastEnd: y => setForecastEnd(st, y)
  };
}

/* ---- geometry ------------------------------------------------------------ */

/* The cutoff date, needed before tSplit is assigned below. */
function splitOf(r) { return E.t(r.shown[r.shown.length - 1].date); }

function setRound(st, r) {
  cancelAnimationFrame(st._raf);
  st.round = r;
  st.scale = E.makeScale(r.scale, r.yMin, r.yMax);
  const pts = E.allPoints(r);
  st.t0 = E.t(pts[0].date);
  st.t1 = E.t(r.askDate);
  /* A little breathing room either side so the first and last dots are not
     welded to the axis. */
  const span = st.t1 - st.t0;
  st.t0 -= span * 0.04;
  st.t1 += span * 0.06;
  /* Two right-hand edges, not one. tGuess is where the guessable region ends
     — the ask date — and it never moves. t1 is the axis edge, which the ARC
     round extends when the twist fires so the ARC-AGI-2 series has somewhere
     to be drawn. Collapsing these into one variable stretched the drawn guess
     sideways when the axis grew, and clipped the twist's labels off-screen
     when it did not. */
  st.tGuess = E.t(r.askDate);
  st.tEnd = st.t1;

  /* Every chart should cover the same window, so a series that stops in 2025
     still sits on an axis that runs to today rather than looking like the most
     recent thing that ever happened. But the guessable region must stay big
     enough to draw in: on the ARC round, whose known data starts in 2020,
     stretching the axis to 2026 up front would squeeze the drawable band to a
     tenth of the width. So the extension applies immediately where it leaves a
     usable band, and is staged behind the reveal where it would not. */
  const axisEnd = st.axisEnd || 0;
  const bandFraction = (st.tGuess - splitOf(r)) / (axisEnd - st.t0);
  if (axisEnd > st.tGuess && bandFraction >= 0.2) {
    /* A hair past the snapshot so the boundary rule and the last dot are
       never welded to the frame. */
    st.t1 = axisEnd + (axisEnd - st.t0) * 0.02;
  }
  /* The axis this round STARTS at. reset() restores to this rather than to
     tGuess — restoring to tGuess silently undid the extension above, because
     that line was written when the ARC twist was the only thing that ever
     moved the axis. */
  st.tBase = st.t1;
  st.tEnd = Math.max(st.t1, axisEnd);
  if (r.twist) {
    const last = Math.max(...r.twist.series.map(p => E.t(p.date)));
    st.tEnd = Math.max(st.tEnd, last + span * 0.14, axisEnd);
  }
  /* Where the known data stops and the room's guess begins. */
  st.tSplit = E.t(r.shown[r.shown.length - 1].date);
  st.guess = E.emptyGuess(baselineY(st));
  st.phase = 'idle';
  st.revealT = 0;
  st.twistOn = false;
  st.twistT = 0;
  resize(st);
}

/** The guess line starts flat, level with the last known point. */
function baselineY(st) {
  if (!st.round) return 0.5;
  const last = st.round.shown[st.round.shown.length - 1];
  return st.scale.to(last.value);
}

function resize(st) {
  const c = st.canvas;
  const rect = c.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  st.w = Math.max(1, rect.width);
  st.h = Math.max(1, rect.height);
  st.dpr = dpr;
  c.width  = Math.round(st.w * dpr);
  c.height = Math.round(st.h * dpr);
  const s = st.big ? 1.35 : 1;
  /* Left and bottom carry an axis TITLE as well as tick labels — the first
     version had neither, and a chart whose y axis is unlabelled is asking the
     room to guess at a quantity it has not been told the name of. */
  /* The top gutter carries the series-boundary label (see boundary()), so
     it is taller than a bare tick gutter would need. */
  st.pad = { l: 82 * s, r: 18 * s, t: 30 * s, b: 58 * s };
  st.fs = (st.big ? 15 : 11.5);
  render(st);
}

const px = (st, ms) => st.pad.l + (ms - st.t0) / (st.t1 - st.t0) * plotW(st);
const py = (st, u)  => st.pad.t + (1 - u) * plotH(st);
const plotW = st => Math.max(1, st.w - st.pad.l - st.pad.r);
const plotH = st => Math.max(1, st.h - st.pad.t - st.pad.b);
/** Guess-space x (0..1 across the predicted region) -> canvas x. Anchored to
 *  tGuess, not t1, so extending the axis never moves the drawn forecast. */
const gx = (st, x) => {
  const a = px(st, st.tSplit), b = px(st, st.tGuess);
  return a + x * (b - a);
};
const ungx = (st, cx) => {
  const a = px(st, st.tSplit), b = px(st, st.tGuess);
  return b === a ? 0 : (cx - a) / (b - a);
};
const ungy = (st, cy) => 1 - (cy - st.pad.t) / plotH(st);

/* ---- pointer ------------------------------------------------------------- */

function bindPointer(st) {
  const c = st.canvas;
  let down = false;

  const pos = ev => {
    const r = c.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };

  const start = ev => {
    if (!st.round || st.phase === 'revealing' || st.phase === 'revealed') return;
    ev.preventDefault();
    down = true;
    st._lastX = null;
    st.phase = 'drawing';
    move(ev);
  };

  const move = ev => {
    if (!down) return;
    ev.preventDefault();
    const p = pos(ev);
    const x = ungx(st, p.x), y = ungy(st, p.y);
    /* Ignore drags in the already-known region; only the future is guessable. */
    if (x < -0.08) return;
    st._lastX = E.paint(st.guess, x, y, st._lastX) / (E.GUESS_N - 1);
    render(st);
  };

  const end = () => {
    if (!down) return;
    down = false;
    st._lastX = null;
    if (E.guessComplete(st.guess, baselineY(st))) {
      st.phase = 'drawn';
      if (st.onDraw) st.onDraw();
    } else {
      st.phase = 'idle';
    }
    render(st);
  };

  c.addEventListener('pointerdown', start);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  /* Safari on iOS still needs these for reliable canvas dragging. */
  c.addEventListener('touchstart', start, { passive: false });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);

  c.addEventListener('keydown', ev => {
    if (!st.round || st.phase === 'revealing' || st.phase === 'revealed') return;
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const now = E.guessAt(st.guess, 1);
    const y = ev.key === 'Home' ? 0 : ev.key === 'End' ? 1 : E.clamp(now + (ev.key === 'ArrowUp' ? 0.05 : -0.05), 0, 1);
    setForecastEnd(st, y);
  });
}

function setForecastEnd(st, y) {
  if (!st.round || st.phase === 'revealing' || st.phase === 'revealed') return;
  const base = baselineY(st);
  st.guess = E.emptyGuess(base);
  const last = E.paint(st.guess, 0, base, null) / (E.GUESS_N - 1);
  E.paint(st.guess, 1, E.clamp(y, 0, 1), last);
  st.phase = 'drawn';
  render(st);
  if (st.onDraw) st.onDraw();
}

/* ---- reveal animation ---------------------------------------------------- */

function reveal(st, done) {
  if (st.phase === 'revealing') return;
  st.phase = 'revealing';
  const dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1500;
  const t0 = performance.now();
  cancelAnimationFrame(st._raf);
  const step = now => {
    const f = Math.min(1, (now - t0) / dur);
    st.revealT = ease(f);
    render(st);
    if (f < 1) st._raf = requestAnimationFrame(step);
    else { st.phase = 'revealed'; if (done) done(); }
  };
  st._raf = requestAnimationFrame(step);
}

/** Widens the axis to make room for the ARC-AGI-2 series, then fades it in.
 *  The widening is animated because a chart that silently rescales under the
 *  audience reads as a different chart. */
function twist(st, done) {
  st.twistOn = true;
  const dur = 1400;
  const from = st.t1, to = st.tEnd;
  const t0 = performance.now();
  cancelAnimationFrame(st._raf);
  const step = now => {
    const f = Math.min(1, (now - t0) / dur);
    const e = ease(f);
    st.t1 = from + (to - from) * Math.min(1, e * 1.6);
    st.twistT = Math.max(0, (e - 0.35) / 0.65);
    render(st);
    if (f < 1) st._raf = requestAnimationFrame(step);
    else { st.t1 = to; render(st); if (done) done(); }
  };
  st._raf = requestAnimationFrame(step);
}

const ease = f => 1 - Math.pow(1 - f, 3);

/* ---- render -------------------------------------------------------------- */

function render(st) {
  const { ctx } = st;
  if (!st.round) return;
  ctx.save();
  ctx.scale(st.dpr, st.dpr);
  ctx.clearRect(0, 0, st.w, st.h);

  grid(st);
  futureShade(st);
  if (st.round.markers) markers(st);
  knownSeries(st);
  if (st.phase !== 'idle') guessLine(st);
  if (st.revealT > 0) truthLine(st);
  if (st.twistOn) twistLine(st);
  boundary(st);
  axes(st);

  ctx.restore();
}

/** The y ticks and the labels that go with them, decided in one place so the
 *  gridlines and the numbers beside them can never disagree. A duration axis
 *  uses round units of time rather than the 1-2-5 ladder. */
function yTicks(st) {
  const s = st.scale;
  if (st.round.unit === 'min') {
    return E.durationTicks(s.min, s.max, 7).map(v => ({ v, label: E.fmtDurationTick(v) }));
  }
  return E.ticks(s, 7).map(v => ({ v, label: E.fmtValue(v, st.round.unit) }));
}

function grid(st) {
  const { ctx } = st;
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  for (const t of yTicks(st)) {
    const y = py(st, st.scale.to(t.v));
    ctx.beginPath(); ctx.moveTo(st.pad.l, y); ctx.lineTo(st.w - st.pad.r, y); ctx.stroke();
  }
}

/** The region the room is being asked to fill in. */
function futureShade(st) {
  const { ctx } = st;
  const a = px(st, st.tSplit), b = px(st, st.tGuess);
  ctx.fillStyle = 'rgba(0,164,227,0.045)';
  ctx.fillRect(a, st.pad.t, b - a, plotH(st));
  ctx.strokeStyle = 'rgba(0,164,227,0.30)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(a, st.pad.t); ctx.lineTo(a, st.pad.t + plotH(st)); ctx.stroke();
  ctx.setLineDash([]);

  if (st.phase === 'idle') {
    /* The hint has to fit inside the region it is describing. On a 390px phone
       that region is about 180px wide, and the full sentence ran off the right
       edge of the plot. Step down through shorter wordings, then shrink, and
       only then give up. */
    ctx.fillStyle = 'rgba(0,164,227,0.6)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const room = (b - a) * 0.92;
    const sizes = st.big ? [st.fs + 4, st.fs + 2, st.fs] : [st.fs + 2, st.fs, st.fs - 1];
    const texts = ['drag across to draw your guess', 'drag to draw your guess', 'draw your guess', 'drag here'];
    let chosen = null;
    outer:
    for (const text of texts) {
      for (const size of sizes) {
        ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
        if (ctx.measureText(text).width <= room) { chosen = text; break outer; }
      }
    }
    if (chosen) ctx.fillText(chosen, (a + b) / 2, st.pad.t + plotH(st) * 0.5);
  }
}

/** Horizontal reference lines — the human baselines on GPQA. */
function markers(st) {
  const { ctx } = st;
  ctx.save();
  for (const m of st.round.markers) {
    const y = py(st, st.scale.to(m.value));
    ctx.strokeStyle = C.human;
    ctx.setLineDash([2, 5]);
    ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(st.pad.l, y); ctx.lineTo(st.w - st.pad.r, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.human;
    ctx.font = `600 ${st.fs}px system-ui, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(m.label, st.pad.l + 6, y - 3);
  }
  ctx.restore();
}

function knownSeries(st) {
  const { ctx } = st;
  const pts = st.round.shown;

  if (pts.some(p => p.lo != null)) band(st, pts, 'rgba(232,237,245,0.09)');

  ctx.strokeStyle = C.ink;
  ctx.lineWidth = st.big ? 3.5 : 2.5;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = px(st, E.t(p.date)), y = py(st, st.scale.to(p.value));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();

  for (const p of pts) dot(st, E.t(p.date), p.value, C.ink, p.label);
}

/** Confidence ribbon, drawn only where the data has one. */
function band(st, pts, fill) {
  const withCI = pts.filter(p => p.lo != null && p.hi != null);
  if (withCI.length < 2) return;
  const { ctx } = st;
  ctx.fillStyle = fill;
  ctx.beginPath();
  withCI.forEach((p, i) => {
    const x = px(st, E.t(p.date)), y = py(st, st.scale.to(p.hi));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  for (let i = withCI.length - 1; i >= 0; i--) {
    const p = withCI[i];
    ctx.lineTo(px(st, E.t(p.date)), py(st, st.scale.to(p.lo)));
  }
  ctx.closePath(); ctx.fill();
}

function guessLine(st) {
  const { ctx } = st;
  const fade = st.phase === 'revealed' ? 0.45 : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = C.guess;
  ctx.lineWidth = st.big ? 3.5 : 2.5;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  st.guess.forEach((p, i) => {
    const x = gx(st, p.x), y = py(st, p.y);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  /* Endpoint value, so the room can read its own answer back. */
  const end = st.guess[st.guess.length - 1];
  const ex = gx(st, 1), ey = py(st, end.y);
  ctx.fillStyle = C.guess;
  ctx.beginPath(); ctx.arc(ex, ey, st.big ? 6 : 4.5, 0, 7); ctx.fill();
  label(st, ex, ey, E.fmtValue(st.scale.from(end.y), st.round.unit), C.guess, 'right');
  ctx.restore();
}

function truthLine(st) {
  const { ctx } = st;
  const pts = st.round.shown.concat(st.round.hidden);
  const sweepX = px(st, st.tSplit) + (px(st, st.tGuess) - px(st, st.tSplit)) * st.revealT;

  if (pts.some(p => p.lo != null)) {
    ctx.save();
    ctx.beginPath(); ctx.rect(st.pad.l, st.pad.t, sweepX - st.pad.l, plotH(st)); ctx.clip();
    band(st, pts, 'rgba(236,172,0,0.13)');
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath(); ctx.rect(st.pad.l, st.pad.t, sweepX - st.pad.l, plotH(st)); ctx.clip();
  ctx.strokeStyle = C.truth;
  ctx.lineWidth = st.big ? 4 : 3;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = px(st, E.t(p.date)), y = py(st, st.scale.to(p.value));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.restore();

  for (const p of st.round.hidden) {
    if (px(st, E.t(p.date)) <= sweepX + 0.5) dot(st, E.t(p.date), p.value, C.truth, p.label, true);
  }

}

/** Where the series stops, say so on the chart — always.

    The first version drew the end note only when there were 60px of axis to
    the right of the last point AND only after the reveal, and it read
    st.axisEnd, which the app never set. So on every round at every ordinary
    width the note never rendered, and a learner saw a series ending in 2025
    on a page stamped 2026 with nothing to say so (accuracy audit, 2026-09-15,
    risk #1). Now the axis always runs to the snapshot date (the app wires
    setAxisEnd before the first setRound), the stretch between the last
    published point and the snapshot is hatched, a dashed rule marks the ask
    date, and the end note is drawn in the top gutter where it cannot collide
    with anything, wrapped to whatever room the hatched stretch has and
    right-aligned to the axis edge when it has none. */
function boundary(st) {
  const r = st.round;
  if (!r) return;
  const { ctx } = st;
  const x = px(st, st.tGuess);
  const edge = st.w - st.pad.r;
  const top = st.pad.t, bottom = st.pad.t + plotH(st);
  ctx.save();
  /* the unplotted stretch, hatched */
  if (edge - x > 2) {
    ctx.beginPath(); ctx.rect(x, top, edge - x, bottom - top); ctx.clip();
    ctx.strokeStyle = 'rgba(143,163,192,0.16)';
    ctx.lineWidth = 1;
    for (let d = x - (bottom - top); d < edge; d += 9) {
      ctx.beginPath(); ctx.moveTo(d, bottom); ctx.lineTo(d + (bottom - top), top); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.save();
  /* the rule where the published series ends */
  ctx.strokeStyle = 'rgba(232,237,245,0.55)';
  ctx.setLineDash([3, 4]); ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.moveTo(x, top - 4); ctx.lineTo(x, bottom); ctx.stroke();
  ctx.setLineDash([]);
  /* the label, in the top gutter */
  const text = (r.endNote || 'Series ends here') + ' · snapshot ' + E.fmtDate(st.axisEnd || st.tGuess);
  const fs = Math.max(9.5, st.fs - 1);
  ctx.font = `600 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = 'rgba(232,237,245,0.82)';
  ctx.textBaseline = 'bottom';
  const w = ctx.measureText(text).width;
  if (x + 6 + w <= edge) { ctx.textAlign = 'left'; ctx.fillText(text, x + 6, top - 5); }
  else if (w <= edge - st.pad.l) { ctx.textAlign = 'right'; ctx.fillText(text, edge, top - 5); }
  else {
    /* phone widths: two lines, the note on one and the snapshot on the other */
    ctx.textAlign = 'right';
    ctx.fillText(r.endNote || 'Series ends here', edge, top - 5);
  }
  ctx.restore();
}

/** ARC-AGI-2 drawn as a second, lower series once the first has landed. */
function twistLine(st) {
  const tw = st.round.twist;
  if (!tw) return;
  const { ctx } = st;
  const pts = tw.series;
  ctx.save();
  ctx.globalAlpha = st.twistT;
  ctx.strokeStyle = C.red;
  ctx.lineWidth = st.big ? 4 : 3;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = px(st, E.t(p.date)), y = py(st, st.scale.to(p.value));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  for (const p of pts) dot(st, E.t(p.date), p.value, C.red, p.label, true);
  ctx.restore();
}

function dot(st, ms, v, color, text, showLabel) {
  const { ctx } = st;
  const x = px(st, ms), y = py(st, st.scale.to(v));
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, st.big ? 5.5 : 4, 0, 7); ctx.fill();
  if (showLabel && text) label(st, x, y, text, color, x > st.w * 0.72 ? 'right' : 'left');
}

function label(st, x, y, text, color, side) {
  const { ctx } = st;
  ctx.font = `600 ${st.fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = side === 'right' ? 'right' : 'left';
  const dx = side === 'right' ? -9 : 9;
  const w = ctx.measureText(text).width;
  const bx = side === 'right' ? x + dx - w - 5 : x + dx - 5;
  ctx.fillStyle = 'rgba(0,20,43,0.78)';
  roundRect(ctx, bx, y - st.fs * 0.85, w + 10, st.fs * 1.7, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x + dx, y);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function axes(st) {
  const { ctx } = st;
  ctx.font = `500 ${st.fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = C.dim;

  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of yTicks(st)) {
    ctx.fillText(t.label, st.pad.l - 8, py(st, st.scale.to(t.v)));
  }

  /* Time ticks at a spacing chosen from the span, not at every 1 January.
     Labels are dropped where they would collide, but the gridline stays — a
     denser rule still reads as scale even where the text will not fit. */
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const marks = E.timeTicks(st.t0, st.t1, 8);
  let lastRight = -Infinity;
  for (const mk of marks) {
    const x = px(st, mk.ms);
    if (x < st.pad.l - 1 || x > st.w - st.pad.r + 1) continue;
    ctx.strokeStyle = mk.major ? 'rgba(143,163,192,0.24)' : C.faint;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, st.pad.t); ctx.lineTo(x, st.pad.t + plotH(st)); ctx.stroke();

    const text = E.tickLabel(mk.ms, mk.step);
    const half = ctx.measureText(text).width / 2;
    if (x - half > lastRight + 10) {
      ctx.fillStyle = mk.major ? 'rgba(232,237,245,0.72)' : C.dim;
      ctx.fillText(text, x, st.pad.t + plotH(st) + 8);
      lastRight = x + half;
    }
  }

  ctx.strokeStyle = 'rgba(143,163,192,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(st.pad.l, st.pad.t);
  ctx.lineTo(st.pad.l, st.pad.t + plotH(st));
  ctx.lineTo(st.w - st.pad.r, st.pad.t + plotH(st));
  ctx.stroke();

  axisTitles(st);
}

/** The axis titles. Named quantities, in words, on both axes — plus a note on
 *  the y axis when it is logarithmic, because "each step is ten times the last"
 *  is not something a general audience reads off a tick sequence. */
function axisTitles(st) {
  const { ctx } = st;
  const r = st.round;
  const ts = st.fs + (st.big ? 2 : 1.5);

  if (r.xLabel) {
    ctx.font = `700 ${ts}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(232,237,245,0.62)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(r.xLabel, st.pad.l + plotW(st) / 2, st.h - 4);
  }

  /* A rotated title has to fit the plot HEIGHT, which changes per round and
     per viewport. Rather than dropping the label when space is short — the
     first attempt, which silently lost it on every round at laptop height —
     shrink the type, then fall back to a shorter wording, and only give up if
     neither fits. */
  if (r.yLabel) {
    const room = plotH(st) - 6;
    const sizes = [ts, ts - 1, ts - 2, ts - 3];
    const font = sz => `700 ${sz}px system-ui, -apple-system, sans-serif`;
    let text = null, size = ts;
    for (const candidate of [r.yLabel, r.yLabelShort].filter(Boolean)) {
      for (const sz of sizes) {
        ctx.font = font(sz);
        if (ctx.measureText(candidate).width <= room) { text = candidate; size = sz; break; }
      }
      if (text) break;
    }
    if (text) {
      ctx.save();
      ctx.translate(13 * (st.big ? 1.25 : 1), st.pad.t + plotH(st) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = font(size);
      ctx.fillStyle = 'rgba(232,237,245,0.62)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(text, 0, 0);
      ctx.restore();
      /* A second rotated line explaining the log scale used to sit here. It
         overlapped the tick labels — sideways text in a 78px gutter has room
         for one line, not two — so that explanation moved into the DOM, below
         the chart, where it can be read without tilting your head. */
    }
  }
}

return { create, C };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Chart;

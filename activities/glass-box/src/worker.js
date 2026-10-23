// The training runtime. Normally it runs inside a Web Worker (built from
// engine.js + text.js + arith.js + this file) so heavy work stays off the UI
// thread. It is written as a factory over a `post` function so the page can
// also run the identical runtime on the main thread when a host refuses blob
// workers (some sandboxed previews do) — the loops are chunked either way, so
// an abort message or a UI frame can land between chunks.
'use strict';

function createWorkerRuntime(post) {

let ABORT = false;

// Act 1 state
const A1 = { model: null, adam: null, rng: null, data: null, step: 0, lossWin: [] };
// Act 2 state
const A2 = { direct: null, scratch: null, mid: null, adamD: null, adamS: null, stepD: 0, stepS: 0, rngD: null, rngS: null, starRoundsDone: 0 };

function chunkedLoop(total, perChunk, body, done) {
  let i = 0;
  function run() {
    if (ABORT) { ABORT = false; post({ type: 'aborted' }); return; }
    const end = Math.min(total, i + perChunk);
    const t0 = Date.now();
    for (; i < end; i++) body(i);
    const dt = Date.now() - t0;
    if (i < total) setTimeout(run, 0);
    else done && done();
    return dt;
  }
  setTimeout(run, 0);
}

// ---------- Act 1 ----------
function a1Init() {
  A1.model = GB.createModel(TEXT.CFG);
  A1.adam = GB.createAdam(A1.model, TEXT.PEAK_LR);
  A1.rng = GB.makeRng(123);
  A1.data = TEXT.encode(TEXT.CORPUS);
  A1.step = 0;
  A1.lossWin = [];
  // The untrained loss is MEASURED, not assumed: ln(vocab) is only where a
  // perfectly uniform model would sit, and a randomly initialised one is not
  // uniform. Own RNG so training stays bit-reproducible.
  const r0 = GB.makeRng(999), ctx0 = TEXT.CFG.ctx;
  let l0 = 0;
  for (let b = 0; b < 8; b++) {
    const seqs = [];
    for (let i = 0; i < TEXT.BATCH; i++) {
      const start = Math.floor(r0() * (A1.data.length - ctx0 - 1));
      seqs.push(A1.data.subarray(start, start + ctx0 + 1));
    }
    l0 += GB.batchForwardBackward(A1.model, seqs, { backward: false }).loss;
  }
  post({ type: 'a1.ready', step: 0, params: GB.paramCount(A1.model), loss0: l0 / 8, weights: a1Weights() }, []);
}
function a1Weights() {
  return GB.serialize(A1.model).data.slice().buffer;
}
function a1Sample(nChars, temp, seed) {
  const srng = GB.makeRng(seed);
  const ids = [TEXT.stoi[' ']];
  const gen = GB.generate(A1.model, ids, nChars, temp, srng);
  return TEXT.decode(gen);
}
function a1Train(steps) {
  const { ctx } = TEXT.CFG;
  const t0 = Date.now();
  let sinceProgress = 0;
  let did = 0;
  chunkedLoop(steps, 2, () => {
    A1.adam.lr = TEXT.lrAt(A1.step);
    const seqs = [];
    for (let i = 0; i < TEXT.BATCH; i++) {
      const start = Math.floor(A1.rng() * (A1.data.length - ctx - 1));
      seqs.push(A1.data.subarray(start, start + ctx + 1));
    }
    const { loss, grads } = GB.batchForwardBackward(A1.model, seqs);
    GB.adamStep(A1.model, grads, A1.adam, 1);
    A1.step++;
    did++;
    A1.lossWin.push(loss);
    if (A1.lossWin.length > 40) A1.lossWin.shift();
    sinceProgress++;
    if (sinceProgress >= 10) {
      sinceProgress = 0;
      const avg = A1.lossWin.reduce((a, b) => a + b) / A1.lossWin.length;
      const sps = 1000 * did / Math.max(1, Date.now() - t0);
      post({ type: 'a1.progress', step: A1.step, loss: avg, sps });
      if (A1.step % 100 === 0) {
        post({ type: 'a1.midsample', step: A1.step, text: a1Sample(46, 0.8, A1.step) });
      }
    }
  }, () => {
    const avg = A1.lossWin.length ? A1.lossWin.reduce((a, b) => a + b) / A1.lossWin.length : NaN;
    const samples = [
      { temp: 0.8, text: a1Sample(140, 0.8, A1.step + 1) },
      { temp: 0.8, text: a1Sample(140, 0.8, A1.step + 2) },
    ];
    const buf = a1Weights();
    post({ type: 'a1.done', step: A1.step, loss: avg, samples, weights: buf, secs: (Date.now() - t0) / 1000 }, [buf]);
  });
}

// ---------- Act 2 ----------
function a2Init() {
  A2.direct = GB.createModel(ARITH.CFG_DIRECT);
  A2.scratch = GB.createModel(ARITH.CFG_SCRATCH);
  A2.adamD = GB.createAdam(A2.direct, 0.006);
  A2.adamS = GB.createAdam(A2.scratch, 0.006);
  A2.rngD = GB.makeRng(ARITH.SEED_DATA);
  A2.rngS = GB.makeRng(ARITH.SEED_DATA);
  A2.stepD = 0; A2.stepS = 0;
  A2.mid = null;
  A2.starRoundsDone = 0;
  post({
    type: 'a2.ready',
    paramsD: GB.paramCount(A2.direct),
    paramsS: GB.paramCount(A2.scratch),
    exampleDirect: ARITH.directText({ a: 347, b: 285, sum: 632 }),
    exampleScratch: ARITH.scratchText({ a: 347, b: 285, sum: 632 }),
  });
}

function a2TrainOne(kind, done) {
  const model = kind === 'direct' ? A2.direct : A2.scratch;
  const adam = kind === 'direct' ? A2.adamD : A2.adamS;
  const rng = kind === 'direct' ? A2.rngD : A2.rngS;
  const total = kind === 'direct' ? ARITH.STEPS_DIRECT : ARITH.STEPS_SCRATCH;
  const t0 = Date.now();
  const checkpoints = [0.25, 0.5, 0.75].map(f => Math.round(total * f));
  let win = [];
  chunkedLoop(total, kind === 'direct' ? 6 : 3, (i) => {
    const lr = ARITH.lrAt(i, total);
    const loss = ARITH.trainStep(GB, model, adam, kind, rng, lr);
    win.push(loss); if (win.length > 40) win.shift();
    if (kind === 'direct') A2.stepD = i + 1; else A2.stepS = i + 1;
    if ((i + 1) % 25 === 0) {
      post({ type: 'a2.progress', model: kind, step: i + 1, total, loss: win.reduce((a, b) => a + b) / win.length, secs: (Date.now() - t0) / 1000 });
    }
    if ((i + 1) % 120 === 0) {
      // stream one live attempt so there is something to watch
      const p = ARITH.makeProblem(GB.makeRng(i * 31 + (kind === 'direct' ? 1 : 2)));
      const { answer, text } = ARITH.solve(GB, model, p, kind);
      post({ type: 'a2.attempt', model: kind, a: p.a, b: p.b, sum: p.sum, answer, text, right: answer === p.sum });
    }
    if (checkpoints.includes(i + 1)) {
      const { acc } = ARITH.evalAcc(GB, model, kind, 20, 4000 + i);
      post({ type: 'a2.checkpoint', model: kind, step: i + 1, total, acc });
    }
  }, () => {
    const { acc, examples } = ARITH.evalAcc(GB, model, kind, 100, 777, 14);
    post({ type: 'a2.trained', model: kind, acc, examples, secs: (Date.now() - t0) / 1000, step: total });
    done && done(acc);
  });
}

function a2TrainMid(done) {
  // The deliberately half-trained reasoner for §2.3/§2.4: its own model, its
  // own short but fully-annealed schedule (a mid-flight snapshot of the big
  // run would be un-annealed and much worse than its step count suggests).
  A2.mid = GB.createModel(ARITH.CFG_MID);
  const adam = GB.createAdam(A2.mid, 0.006);
  const rng = GB.makeRng(ARITH.SEED_MID);
  const total = ARITH.STEPS_MID;
  chunkedLoop(total, 4, (i) => {
    ARITH.trainStep(GB, A2.mid, adam, 'scratch', rng, ARITH.lrAt(i, total));
    if ((i + 1) % 50 === 0) post({ type: 'a2.progress', model: 'mid', step: i + 1, total, loss: NaN, secs: 0 });
  }, done);
}

function a2Train() {
  a2Init();
  post({ type: 'a2.phase', phase: 'direct' });
  a2TrainOne('direct', () => {
    post({ type: 'a2.phase', phase: 'scratch' });
    a2TrainOne('scratch', () => {
      post({ type: 'a2.phase', phase: 'mid' });
      a2TrainMid(() => {
        const { acc } = ARITH.evalAcc(GB, A2.mid, 'scratch', 100, 888);
        A2.midAcc = acc;
        post({ type: 'a2.done', midAcc: acc, midStep: ARITH.STEPS_MID });
      });
    });
  });
}

function a2Vote(Ns, nProblems) {
  if (!A2.mid) { post({ type: 'a2.vote.error', msg: 'train the models first' }); return; }
  const results = [];
  let idx = 0;
  function runN() {
    if (idx >= Ns.length) { post({ type: 'a2.vote.done', results }); return; }
    const N = Ns[idx++];
    const rng = GB.makeRng(500), srng = GB.makeRng(1499);
    let ok = 0, fallbacks = 0, i = 0;
    let exampleShown = null;
    chunkedLoop(nProblems, 2, () => {
      const p = ARITH.makeProblem(rng);
      const r = ARITH.solveVerified(GB, A2.mid, p, N, 0.8, srng);
      if (r.answer === p.sum) ok++;
      if (r.fellBack) fallbacks++;
      if (!exampleShown && N > 1 && r.chains.some(c => !c.ok) && r.chains.some(c => c.ok)) {
        exampleShown = { a: p.a, b: p.b, sum: p.sum, chains: r.chains };
      }
      i++;
      if (i % 5 === 0) post({ type: 'a2.vote.progress', N, i, n: nProblems });
    }, () => {
      const res = { N, acc: ok / nProblems, fallbacks, example: exampleShown };
      results.push(res);
      post({ type: 'a2.vote.result', ...res });
      setTimeout(runN, 0);
    });
  }
  runN();
}

function a2Star() {
  if (!A2.mid) { post({ type: 'a2.star.error', msg: 'train the models first' }); return; }
  const round = ++A2.starRoundsDone;
  const t0 = Date.now();
  // The state machine performs exactly the old sampling/optimizer sequence,
  // but gives the host a turn after every problem or optimizer step.  This
  // matters in the intentional no-Worker fallback: progress can paint and
  // controls remain responsive rather than one 13s task monopolising UI.
  const job = ARITH.createStarRound(GB, A2.mid, {
      nProblems: 120, K: 3, temp: 0.8, ftSteps: 60, lr: 0.0015, seed: 1000 + round * 17,
    }, (phase, i, n, keptSoFar) => {
      post({ type: 'a2.star.progress', round, phase, i, n, kept: keptSoFar });
    });
  function run() {
    if (ABORT) { ABORT = false; post({ type: 'aborted' }); return; }
    if (!job.tick()) { setTimeout(run, 0); return; }
    const { kept } = job.result();
    const { acc } = ARITH.evalAcc(GB, A2.mid, 'scratch', 100, 888);
    post({ type: 'a2.star.done', round, kept, nProblems: 120, acc, secs: (Date.now() - t0) / 1000 });
  }
  setTimeout(run, 0);
}

// ---------- dispatch ----------
function dispatch(m) {
  switch (m.cmd) {
    case 'a1.init': a1Init(); break;
    case 'a1.train': a1Train(m.steps); break;
    case 'a2.init': a2Init(); break;
    case 'a2.train': a2Train(); break;
    case 'a2.vote': a2Vote(m.Ns, m.nProblems); break;
    case 'a2.star': a2Star(); break;
    case 'abort': ABORT = true; break;
  }
}

setTimeout(() => post({ type: 'boot' }), 0);
return { dispatch };
}

// In a real dedicated worker (no window, importScripts exists), wire the
// runtime to the worker message pipe. On the page this guard is inert; the
// page instead calls createWorkerRuntime itself if it needs the fallback.
if (typeof window === 'undefined' && typeof importScripts === 'function') {
  const rt = createWorkerRuntime((msg, transfer) => self.postMessage(msg, transfer || []));
  self.onmessage = (e) => rt.dispatch(e.data);
}

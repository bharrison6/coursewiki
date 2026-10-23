// Act 2 — the arithmetic world: 3-digit addition in two formats (direct answer
// vs written-out scratchpad), a chain verifier that never needs the true
// answer, evaluation, and the self-improvement round. Needs GB (engine.js).
// No DOM in this file.
//
// A note on seeds, because it is the most interesting engineering finding in
// this act: direct-answer 3-digit addition sits ON a learning phase transition
// at this model scale. Across data seeds at the same budget the direct model
// lands anywhere from 2% to 95% (measured table in the README) — some runs
// "grok" the carry structure, most do not. The scratchpad model has no such
// cliff; every step of its curriculum is locally easy. A live demo cannot
// stand on a coin flip, so training here is seeded and — because the engine
// computes its own transcendentals from IEEE ops (see engine.js) — exactly
// reproducible on every device: the shipped seeds give a modal, representative
// outcome (direct ≈ a third right, scratchpad ≈ nearly all right). Changing
// SEED_DATA below is the supported way to explore the spread; the README
// documents what you will find.
'use strict';

const ARITH = (() => {

  const CH = '0123456789+= c.'; // digits, +, =, space, c(arry marker), period
  const stoi = {};
  CH.split('').forEach((c, i) => { stoi[c] = i; });
  const VOCAB = CH.length;
  const DOT = stoi['.'];

  function enc(str) {
    const a = new Int32Array(str.length);
    for (let i = 0; i < str.length; i++) a[i] = stoi[str[i]];
    return a;
  }
  function dec(ids) {
    let s = '';
    for (let i = 0; i < ids.length; i++) s += CH[ids[i]];
    return s;
  }

  const DIGITS = 3;
  const LO = Math.pow(10, DIGITS - 1), HI = Math.pow(10, DIGITS) - 1;
  const SEED_DATA = 123;  // problem stream for both models (see note above)
  const SEED_MID = 111;   // problem stream for the deliberately half-trained model

  function makeProblem(rng) {
    const a = LO + Math.floor(rng() * (HI - LO + 1));
    const b = LO + Math.floor(rng() * (HI - LO + 1));
    return { a, b, sum: a + b };
  }
  function promptOf(p) { return `${p.a}+${p.b}=`; }

  // "347+285=632."
  function directText(p) { return `${p.a}+${p.b}=${p.sum}.`; }

  // "347+285= 7+5=12 c1 4+8+1=13 c1 3+2+1=6 c0 632."
  function scratchText(p) {
    const as = String(p.a), bs = String(p.b);
    let carry = 0;
    const parts = [promptOf(p)];
    for (let i = DIGITS - 1; i >= 0; i--) {
      const da = +as[i], db = +bs[i];
      const s = da + db + carry;
      parts.push(carry > 0 ? ` ${da}+${db}+${carry}=${s}` : ` ${da}+${db}=${s}`);
      carry = s >= 10 ? 1 : 0;
      parts.push(` c${carry}`);
    }
    parts.push(` ${p.sum}.`);
    return parts.join('');
  }

  // Two same-recipe models. ctx differs only because the scratchpad needs room
  // to write; everything else — width, depth, heads — is identical.
  const CFG_DIRECT = { vocab: VOCAB, ctx: 16, dim: 32, heads: 4, layers: 2, mlpMult: 2, seed: 11 };
  const CFG_SCRATCH = { vocab: VOCAB, ctx: 56, dim: 32, heads: 4, layers: 2, mlpMult: 2, seed: 12 };
  const CFG_MID = { vocab: VOCAB, ctx: 56, dim: 32, heads: 4, layers: 2, mlpMult: 2, seed: 31 };
  const B_DIRECT = 16, B_SCRATCH = 8;

  // Equal wall-clock budgets (a direct step is ~2x cheaper, so it gets ~2x the
  // steps). Measured in the tuning harness: direct ends near half right,
  // scratchpad near all right — see README for the measured tables.
  const STEPS_DIRECT = 2200;
  const STEPS_SCRATCH = 1000;
  const STEPS_MID = 400;      // the deliberately half-trained reasoner for §4/§5

  function lrAt(step, total, peak) {
    peak = peak || 0.006;
    const warm = Math.min(1, (step + 1) / 40);
    const prog = Math.min(1, Math.max(0, (step - 40) / Math.max(1, total - 40)));
    // smoothstep anneal — IEEE-deterministic (see engine.js)
    const anneal = 1 - prog * prog * (3 - 2 * prog);
    return peak * warm * (0.25 + 0.75 * anneal);
  }

  // One training step (bucketed by sequence length so no padding is needed).
  function trainStep(GB, model, adam, kind, rng, lr) {
    adam.lr = lr;
    const B = kind === 'direct' ? B_DIRECT : B_SCRATCH;
    const buckets = {};
    for (let i = 0; i < B; i++) {
      const p = makeProblem(rng);
      const txt = kind === 'direct' ? directText(p) : scratchText(p);
      (buckets[txt.length] = buckets[txt.length] || []).push({ p, txt });
    }
    let lossSum = 0, n = 0;
    for (const key in buckets) {
      const group = buckets[key];
      const seqs = group.map(g => enc(g.txt));
      const maskStarts = group.map(g => promptOf(g.p).length - 1);
      const { loss, grads, count } = GB.batchForwardBackward(model, seqs, { maskStarts });
      GB.adamStep(model, grads, adam, 1);
      lossSum += loss * count; n += count;
    }
    return lossSum / n;
  }

  function parseAnswer(txt) {
    const m = txt.match(/(\d+)\s*\.\s*$/);
    if (m) return parseInt(m[1], 10);
    const m2 = txt.match(/(\d+)(?!.*\d)/s);
    return m2 ? parseInt(m2[1], 10) : NaN;
  }

  function solve(GB, model, p, kind, temp, rng) {
    const ids = Array.from(enc(promptOf(p)));
    const maxNew = kind === 'direct' ? 6 : 48;
    const gen = GB.generate(model, ids, maxNew, temp || 0, rng || null, DOT);
    const text = dec(gen);
    return { answer: parseAnswer(text), text };
  }

  function evalAcc(GB, model, kind, n, seed, collect) {
    const rng = GB.makeRng(seed);
    let ok = 0;
    const examples = collect ? [] : null;
    for (let i = 0; i < n; i++) {
      const p = makeProblem(rng);
      const { answer, text } = solve(GB, model, p, kind);
      const right = answer === p.sum;
      if (right) ok++;
      if (collect && examples.length < collect) {
        examples.push({ a: p.a, b: p.b, sum: p.sum, answer, text, right });
      }
    }
    return { acc: ok / n, examples };
  }

  // Verify a scratchpad chain WITHOUT knowing the true answer: every sub-step
  // must be real single-digit arithmetic, the carries must chain, and the
  // final number must assemble from the per-column results. This is the whole
  // verifier — it checks the work, not the answer.
  function verifyChain(a, b, genText) {
    const body = genText.trim();
    const stepRe = /(\d)\+(\d)(?:\+(\d))?=(\d+) c(\d)/g;
    const steps = [];
    let m;
    while ((m = stepRe.exec(body)) !== null) {
      steps.push({ a: +m[1], b: +m[2], c: m[3] == null ? null : +m[3], s: +m[4], co: +m[5] });
    }
    if (steps.length !== DIGITS) return { ok: false, why: `expected ${DIGITS} column steps` };
    const as = String(a), bs = String(b);
    let carry = 0;
    const digits = [];
    for (let i = 0; i < DIGITS; i++) {
      const st = steps[i];
      const da = +as[DIGITS - 1 - i], db = +bs[DIGITS - 1 - i];
      if (st.a !== da || st.b !== db) return { ok: false, why: `column ${i + 1}: copied the wrong digits` };
      if (st.c !== (carry > 0 ? carry : null)) return { ok: false, why: `column ${i + 1}: wrong carry in` };
      const t = da + db + carry;
      if (st.s !== t) return { ok: false, why: `column ${i + 1}: ${da}+${db}${carry ? '+' + carry : ''} is not ${st.s}` };
      const co = t >= 10 ? 1 : 0;
      if (st.co !== co) return { ok: false, why: `column ${i + 1}: wrong carry out` };
      digits.unshift(t % 10);
      carry = co;
    }
    if (carry) digits.unshift(carry);
    const assembled = parseInt(digits.join(''), 10);
    const fm = body.match(/c\d\s+(\d+)\s*\.\s*$/);
    if (!fm) return { ok: false, why: 'no final answer written' };
    if (parseInt(fm[1], 10) !== assembled) return { ok: false, why: 'final answer does not match the steps' };
    return { ok: true, answer: assembled };
  }

  // Test-time compute: sample N chains, keep the ones the verifier accepts,
  // majority-vote among survivors; fall back to greedy if none survive.
  function solveVerified(GB, model, p, N, temp, srng) {
    const votes = {};
    const chains = [];
    let any = false;
    for (let k = 0; k < N; k++) {
      const { text } = solve(GB, model, p, 'scratch', temp, srng);
      const v = verifyChain(p.a, p.b, text);
      chains.push({ text, ok: v.ok, why: v.why || null, answer: v.ok ? v.answer : null });
      if (v.ok) { votes[v.answer] = (votes[v.answer] || 0) + 1; any = true; }
    }
    let ans = NaN;
    if (any) {
      let bc = -1;
      for (const k in votes) if (votes[k] > bc) { bc = votes[k]; ans = +k; }
    } else {
      ans = solve(GB, model, p, 'scratch').answer;
    }
    return { answer: ans, chains, fellBack: !any };
  }

  // One self-improvement round: pose fresh problems, sample K attempts each,
  // keep chains the verifier certifies AND whose answer is right (the reward),
  // then fine-tune on the model's own kept work.
  function createStarRound(GB, model, opts, onProgress) {
    const { nProblems, K, temp, ftSteps, seed } = opts;
    const lr = opts.lr || 0.0015;
    const prng = GB.makeRng(seed), srng = GB.makeRng(seed * 7 + 1);
    const kept = [];
    let i = 0, step = 0, phase = 'sample', adam = null, rng = null;
    function tick() {
      if (phase === 'done') return true;
      if (phase === 'sample') {
      const p = makeProblem(prng);
      for (let k = 0; k < K; k++) {
        const { text } = solve(GB, model, p, 'scratch', temp, srng);
        const v = verifyChain(p.a, p.b, text);
        if (v.ok && v.answer === p.sum) {
          kept.push({ p, full: promptOf(p) + text.replace(/\s+$/, '') });
          break;
        }
      }
      i++;
      if (onProgress && i % 10 === 0) onProgress('sample', i, nProblems, kept.length);
      if (i < nProblems) return false;
      if (kept.length === 0) { phase = 'done'; return true; }
      phase = 'tune'; adam = GB.createAdam(model, lr); rng = GB.makeRng(seed + 5);
      return false;
      }
      // One optimizer step per cooperative slice.  This is byte-for-byte the
      // former loop body, only with a yielding boundary between steps.
      adam.lr = lr * (1 - (step / ftSteps) * 0.7);
      const buckets = {};
      for (let i = 0; i < 8; i++) {
        const ex = kept[Math.floor(rng() * kept.length)];
        (buckets[ex.full.length] = buckets[ex.full.length] || []).push(ex);
      }
      for (const key in buckets) {
        const group = buckets[key];
        const seqs = group.map(g => enc(g.full));
        const maskStarts = group.map(g => promptOf(g.p).length - 1);
        const { grads } = GB.batchForwardBackward(model, seqs, { maskStarts });
        GB.adamStep(model, grads, adam, 1);
      }
      step++;
      if (onProgress && step % 20 === 0) onProgress('tune', step, ftSteps, kept.length);
      if (step >= ftSteps) { phase = 'done'; return true; }
      return false;
    }
    return { tick, result: () => ({ kept: kept.length }) };
  }

  function starRound(GB, model, opts, onProgress) {
    const round = createStarRound(GB, model, opts, onProgress);
    while (!round.tick()) {}
    return round.result();
  }

  return {
    CH, stoi, VOCAB, DOT, DIGITS, SEED_DATA, SEED_MID, enc, dec, makeProblem, promptOf,
    directText, scratchText,
    CFG_DIRECT, CFG_SCRATCH, CFG_MID, B_DIRECT, B_SCRATCH, STEPS_DIRECT, STEPS_SCRATCH, STEPS_MID,
    lrAt, trainStep, parseAnswer, solve, evalAcc, verifyChain, solveVerified, starRound, createStarRound,
  };
})();

if (typeof module !== 'undefined') module.exports = ARITH;

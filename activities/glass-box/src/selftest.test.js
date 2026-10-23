// Glass Box self-test. Run: node src/selftest.test.js   (~60s)
// Verifies the engine's calculus, the arc of both training tasks, the chain
// verifier, the agent's tools and policy, and the honesty claims the UI makes.
'use strict';
const GB = require('./engine.js');
const TEXT = require('./text.js');
const ARITH = require('./arith.js');
const AGENT = require('./agent.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

// ---------- 1. gradient check ----------
console.log('1. gradients match numerical derivatives (fp32 tolerance)');
{
  const cfg = { vocab: 7, ctx: 6, dim: 8, heads: 2, layers: 2, seed: 42 };
  const model = GB.createModel(cfg);
  const seqs = [Int32Array.from([1, 4, 2, 6, 0, 3, 5]), Int32Array.from([2, 2, 5, 1, 6, 4, 0])];
  const opts = { maskStarts: [0, 3] };
  const { grads } = GB.batchForwardBackward(model, seqs, opts);
  const saved = {};
  for (const k in grads) saved[k] = Float32Array.from(grads[k]);
  const lossOnly = () => GB.batchForwardBackward(model, seqs, { ...opts, backward: false }).loss;
  const eps = 1e-3;
  let bad = 0, checked = 0;
  for (const [name, a] of GB.paramList(model)) {
    const rng = GB.makeRng(name.length * 31 + 7);
    const idxs = new Set();
    while (idxs.size < Math.min(5, a.length)) idxs.add(Math.floor(rng() * a.length));
    for (const i of idxs) {
      const orig = a[i];
      a[i] = orig + eps; const lp = lossOnly();
      a[i] = orig - eps; const lm = lossOnly();
      a[i] = orig;
      const num = (lp - lm) / (2 * eps), ana = saved[name][i];
      const absErr = Math.abs(num - ana);
      const rel = absErr / Math.max(1e-4, Math.abs(num) + Math.abs(ana));
      checked++;
      if (rel > 5e-3 && absErr > 2e-5) bad++;
    }
  }
  ok(bad === 0, `all ${checked} sampled analytic gradients match numerics (bad: ${bad})`);
}

// ---------- 2. the untrained model is honestly ignorant ----------
console.log('2. a newborn model is static, not secret knowledge');
{
  const model = GB.createModel(TEXT.CFG);
  // Perplexity of an untrained model should be near |vocab| (uniform).
  const data = TEXT.encode(TEXT.CORPUS.slice(0, 800));
  const seqs = [data.subarray(0, TEXT.CFG.ctx + 1)];
  const { loss } = GB.batchForwardBackward(model, seqs, { backward: false });
  const uniform = Math.log(TEXT.CFG.vocab);
  ok(Math.abs(loss - uniform) < 0.35, `untrained loss ${loss.toFixed(2)} ≈ ln(vocab) ${uniform.toFixed(2)}`);
}

// ---------- 3. Act 1 learns (short smoke of the real arc) ----------
console.log('3. Act 1: 300 live steps visibly reduce loss');
{
  const model = GB.createModel(TEXT.CFG);
  const adam = GB.createAdam(model, TEXT.PEAK_LR);
  const rng = GB.makeRng(123);
  const data = TEXT.encode(TEXT.CORPUS);
  let last = 0;
  for (let s = 0; s < 300; s++) {
    adam.lr = TEXT.lrAt(s);
    const seqs = [];
    for (let i = 0; i < TEXT.BATCH; i++) {
      const st = Math.floor(rng() * (data.length - TEXT.CFG.ctx - 1));
      seqs.push(data.subarray(st, st + TEXT.CFG.ctx + 1));
    }
    const { loss, grads } = GB.batchForwardBackward(model, seqs);
    GB.adamStep(model, grads, adam, 1);
    last = loss;
  }
  ok(last < 2.1, `loss after 300 steps: ${last.toFixed(2)} (< 2.1; starts at ~3.3)`);
  const sample = TEXT.decode(GB.generate(model, [TEXT.stoi[' ']], 60, 0.8, GB.makeRng(9)));
  ok(/ /.test(sample), 'sampled text contains word breaks: ' + JSON.stringify(sample.slice(0, 40)));
}

// ---------- 4. Act 2 data formats and the verifier ----------
console.log('4. Act 2: scratchpad format and verifier');
{
  const p = { a: 347, b: 285, sum: 632 };
  const chainTxt = ARITH.scratchText(p);
  ok(chainTxt === '347+285= 7+5=12 c1 4+8+1=13 c1 3+2+1=6 c0 632.', 'scratchpad format: ' + chainTxt);
  const body = chainTxt.slice(ARITH.promptOf(p).length);
  ok(ARITH.verifyChain(347, 285, body).ok === true, 'verifier accepts a correct chain');
  ok(ARITH.verifyChain(347, 285, body.replace('7+5=12', '7+5=13')).ok === false, 'verifier rejects a false column sum');
  ok(ARITH.verifyChain(347, 285, body.replace('c1 4', 'c0 4')).ok === false, 'verifier rejects a broken carry');
  ok(ARITH.verifyChain(347, 285, body.replace('632.', '633.')).ok === false, 'verifier rejects a final answer that ignores the steps');
  ok(ARITH.verifyChain(347, 285, body.replace('7+5', '8+5')).ok === false, 'verifier rejects copying the wrong digits');
  // The verifier never needs p.sum: feed it a WRONG problem's chain, it still
  // judges internal consistency only.
  const other = ARITH.scratchText({ a: 111, b: 222, sum: 333 });
  ok(ARITH.verifyChain(111, 222, other.slice(ARITH.promptOf({ a: 111, b: 222 }).length)).ok, 'verifier is answer-key-free');
  // All generated problems are in range and formats round-trip.
  const rng = GB.makeRng(1);
  let allOk = true;
  for (let i = 0; i < 200; i++) {
    const q = ARITH.makeProblem(rng);
    if (q.a < 100 || q.a > 999 || q.b < 100 || q.b > 999 || q.a + q.b !== q.sum) allOk = false;
    const c = ARITH.scratchText(q);
    if (!ARITH.verifyChain(q.a, q.b, c.slice(ARITH.promptOf(q).length)).ok) allOk = false;
  }
  ok(allOk, '200 generated problems: all ground-truth chains verify');
}

// ---------- 5. Act 2 short training smoke ----------
console.log('5. Act 2: both models train (short smoke)');
{
  const direct = GB.createModel(ARITH.CFG_DIRECT);
  const adamD = GB.createAdam(direct, 0.006);
  const rngD = GB.makeRng(55);
  let lossD = 99;
  for (let s = 0; s < 150; s++) lossD = ARITH.trainStep(GB, direct, adamD, 'direct', rngD, ARITH.lrAt(s, 150));
  ok(lossD < 1.6, `direct loss after 150 steps: ${lossD.toFixed(2)}`);
  const scratch = GB.createModel(ARITH.CFG_SCRATCH);
  const adamS = GB.createAdam(scratch, 0.006);
  const rngS = GB.makeRng(66);
  let lossS = 99;
  for (let s = 0; s < 150; s++) lossS = ARITH.trainStep(GB, scratch, adamS, 'scratch', rngS, ARITH.lrAt(s, 150));
  ok(lossS < 0.8, `scratch loss after 150 steps: ${lossS.toFixed(2)} (per-token, its task is locally easier — that is the point)`);
}

// ---------- 6. cooperative STaR has the same deterministic effect ----------
console.log('6. Act 2: cooperative STaR parity');
{
  const base = GB.createModel(ARITH.CFG_MID);
  const opts = { nProblems: 12, K: 2, temp: 0.8, ftSteps: 8, lr: 0.0015, seed: 2026 };
  const monolithic = GB.cloneModel(base), cooperative = GB.cloneModel(base);
  const a = ARITH.starRound(GB, monolithic, opts);
  const job = ARITH.createStarRound(GB, cooperative, opts);
  let turns = 0; while (!job.tick()) turns++;
  const b = job.result();
  const same = Buffer.from(GB.serialize(monolithic).data).equals(Buffer.from(GB.serialize(cooperative).data));
  ok(a.kept === b.kept && same, 'cooperative STaR has exactly the monolithic seeded result');
  ok(turns > 1, `cooperative STaR yields between work units (${turns} yields; old monolith had 0)`);
}

// ---------- 7. the agent's tools are real ----------
console.log('7. Act 3: tools');
{
  ok(AGENT.toolCalc('(117+5)*1.08') === '(117+5)*1.08 = 131.76', 'calculator: precedence and parens');
  ok(AGENT.toolCalc('72/8') === '72/8 = 9', 'calculator: division');
  ok(/calc error: unexpected character "x"/.test(AGENT.toolCalc('9 x $13.00')), 'calculator genuinely rejects "9 x $13.00"');
  ok(/division by zero/.test(AGENT.toolCalc('5/0')), 'calculator: division by zero is an error');
  const res = AGENT.toolSearch('pizza delivery');
  ok(/menu-tonys/.test(res) && /menu-campus/.test(res) && /menu-riverside/.test(res), 'search finds all three pizzerias');
  ok(/read error/.test(AGENT.toolRead('nope')), 'read of unknown id errors usefully');
}

// ---------- 8. the agent policy: full run, stateless, window-honest ----------
console.log('8. Act 3: the scripted run behaves as the UI claims');
{
  const ep = AGENT.newEpisode();
  let guard = 0;
  while (!ep.done && guard++ < 30) {
    const choice = AGENT.policy(AGENT.visibleContext(ep, 0));
    if (choice.stop) break;
    AGENT.applyTurn(ep, choice);
  }
  ok(ep.done, 'full-window run finishes');
  ok(ep.turns === AGENT.OPTIMAL_TURNS, `run takes exactly ${AGENT.OPTIMAL_TURNS} turns (took ${ep.turns})`);
  ok(/131\.76/.test(ep.finalAnswer) && /Campus Slice/.test(ep.finalAnswer), 'final answer is the correct one');
  const ctxAll = AGENT.serializeContext(ep);
  ok(/calc error/.test(ctxAll), 'the run includes the real calculator error and recovery');
  ok((ctxAll.match(/ACTION: read/g) || []).length === 3, 'it read all three flyers (constraints, not just prices)');

  // tiny window: the goal falls off and the agent honestly stops
  const ep2 = AGENT.newEpisode();
  let stopped = null;
  guard = 0;
  while (!ep2.done && guard++ < 30) {
    const choice = AGENT.policy(AGENT.visibleContext(ep2, 450));
    if (choice.stop) { stopped = choice.stop; break; }
    AGENT.applyTurn(ep2, choice);
  }
  ok(stopped !== null && /no longer see a goal/.test(stopped), 'tiny-window run stops dead once the goal scrolls away');

  // candidates: distractors execute without crashing, and the run still recovers
  const ep3 = AGENT.newEpisode();
  guard = 0;
  while (!ep3.done && guard++ < 40) {
    const res = AGENT.candidates(AGENT.visibleContext(ep3, 0));
    if (res.stop) break;
    // deliberately choose the LAST candidate (often a distractor)
    AGENT.applyTurn(ep3, res.list[res.list.length - 1]);
  }
  ok(guard < 41, 'even choosing badly, the episode terminates (guard ' + guard + ')');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

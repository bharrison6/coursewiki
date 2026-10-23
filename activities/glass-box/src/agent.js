// Act 3 — the agent world. The tools are real: the calculator genuinely
// parses and evaluates, search genuinely searches the documents, the notebook
// genuinely stores. The loop is real. The one scripted part is the policy —
// the function that picks the next action — and it is honestly labeled in the
// UI. It is a pure function of the visible context text and nothing else, so
// shrinking the context window genuinely breaks it.
'use strict';

const AGENT = (() => {

  // ---------- the documents (the little world) ----------
  const DOCS = [
    {
      id: 'menu-tonys', title: "Tony's Pizza — menu flyer",
      body: "Tony's Pizza. Large 16 inch pizza $11.00. Toppings $1.50 each. Open 11am to 5pm daily. Delivery available only while the shop is open. Call ahead for big orders.",
    },
    {
      id: 'menu-riverside', title: 'Riverside Pies — menu flyer',
      body: 'Riverside Pies. Large 16 inch pizza $12.00. Family deal: 4 large for $44. Open 12pm to 8pm, closed Wednesdays. Free delivery over $60.',
    },
    {
      id: 'menu-campus', title: 'Campus Slice — menu flyer',
      body: 'Campus Slice. Large 16 inch pizza $13.00. Open 11am to 9pm, seven days a week. Delivery fee $5.00 per order, any size. Student clubs welcome.',
    },
    {
      id: 'campus-events', title: 'Campus events — this week',
      body: 'Monday: chess club. Tuesday: career fair. Wednesday: robotics club party, 6pm, engineering atrium. Thursday: movie night on the quad.',
    },
    {
      id: 'bus-schedule', title: 'Shuttle bus schedule',
      body: 'Campus shuttle runs every 20 minutes from 7am to 10pm on weekdays. Weekend service hourly. No service on university holidays.',
    },
  ];

  const GOAL = 'Order pizza for the robotics club party this Wednesday at 6pm. 24 people are coming and each eats about 3 slices; a large pizza has 8 slices. Sales tax here is 8%. Find the cheapest place that can actually deliver at 6pm on Wednesday, then finish with: the place, how many pizzas, and the total cost including tax and any fees.';

  const SYSTEM = 'You are an assistant with tools. One action per turn. After each action you will see an observation. Think briefly, then act. When you know the final answer, use finish.';

  // ---------- tool schemas (shown in the UI, mirrors real tool-use APIs) ----------
  const SCHEMAS = [
    { name: 'search', description: 'Keyword search over the available documents. Returns the top matches with a snippet.', input: { query: 'string' } },
    { name: 'read', description: 'Read one document in full by its id.', input: { doc_id: 'string' } },
    { name: 'calc', description: 'Evaluate an arithmetic expression. Numbers and + - * / ( ) only.', input: { expression: 'string' } },
    { name: 'note', description: 'Append a line to the notebook (survives in the observation log).', input: { text: 'string' } },
    { name: 'finish', description: 'End the task and hand the final answer back to the user.', input: { answer: 'string' } },
  ];

  // ---------- the real tools ----------
  function toolSearch(query) {
    const words = String(query).toLowerCase().split(/[^a-z0-9$]+/).filter(w => w.length > 2);
    if (words.length === 0) return 'search error: empty query.';
    const scored = DOCS.map(d => {
      const hay = (d.title + ' ' + d.body).toLowerCase();
      let score = 0;
      for (const w of words) {
        let idx = -1, c = 0;
        while ((idx = hay.indexOf(w, idx + 1)) !== -1) c++;
        score += c;
      }
      return { d, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    if (scored.length === 0) return 'no documents matched "' + query + '".';
    return '[search results]\n' + scored.map(x =>
      `- ${x.d.id}: ${x.d.title} — "${x.d.body.slice(0, 62)}..."`).join('\n');
  }

  function toolRead(docId) {
    const d = DOCS.find(d => d.id === String(docId).trim());
    if (!d) return `read error: no document with id "${docId}". Use search to find document ids.`;
    return `[${d.id}] ${d.title}\n${d.body}`;
  }

  // Real recursive-descent arithmetic: numbers, + - * / ( ). Nothing else.
  function toolCalc(expr) {
    const s = String(expr);
    let i = 0;
    function skip() { while (i < s.length && s[i] === ' ') i++; }
    function fail(msg) { throw new Error(`calc error: ${msg} at position ${i + 1} in "${s}"`); }
    function number() {
      skip();
      const start = i;
      while (i < s.length && /[0-9.]/.test(s[i])) i++;
      if (i === start) {
        if (i >= s.length) fail('expected a number, got end of input');
        fail(`unexpected character "${s[i]}"`);
      }
      const v = parseFloat(s.slice(start, i));
      if (Number.isNaN(v)) fail('bad number');
      return v;
    }
    function factor() {
      skip();
      if (s[i] === '(') { i++; const v = expression(); skip(); if (s[i] !== ')') fail('expected ")"'); i++; return v; }
      if (s[i] === '-') { i++; return -factor(); }
      return number();
    }
    function term() {
      let v = factor();
      for (;;) {
        skip();
        if (s[i] === '*') { i++; v *= factor(); }
        else if (s[i] === '/') { i++; const d = factor(); if (d === 0) fail('division by zero'); v /= d; }
        else return v;
      }
    }
    function expression() {
      let v = term();
      for (;;) {
        skip();
        if (s[i] === '+') { i++; v += term(); }
        else if (s[i] === '-') { i++; v -= term(); }
        else return v;
      }
    }
    try {
      const v = expression();
      skip();
      if (i < s.length) fail(`unexpected character "${s[i]}"`);
      const r = Math.round(v * 1e6) / 1e6;
      return `${expr} = ${r}`;
    } catch (e) {
      return e.message;
    }
  }

  // ---------- episode state ----------
  function newEpisode() {
    return {
      entries: [
        { role: 'system', text: SYSTEM },
        { role: 'goal', text: GOAL },
      ],
      notes: [],
      done: false,
      finalAnswer: null,
      turns: 0,
    };
  }

  function runTool(ep, action) {
    const { tool, args } = action;
    switch (tool) {
      case 'search': return toolSearch(args.query);
      case 'read': return toolRead(args.doc_id);
      case 'calc': return toolCalc(args.expression);
      case 'note': ep.notes.push(String(args.text)); return `noted (${ep.notes.length} line${ep.notes.length === 1 ? '' : 's'} in notebook).`;
      case 'finish': return null; // handled by caller
      default: return `error: unknown tool "${tool}".`;
    }
  }

  function serializeContext(ep) {
    return ep.entries.map(e => {
      const tag = { system: 'SYSTEM', goal: 'USER', thought: 'THOUGHT', action: 'ACTION', observation: 'OBSERVATION', final: 'FINAL' }[e.role] || 'NOTE';
      return `${tag}: ${e.text}`;
    }).join('\n');
  }

  // Roughly 4 characters per token, the usual quick estimate.
  function tokenEstimate(ep) { return Math.round(serializeContext(ep).length / 4); }

  function fmtAction(a) {
    const argStr = JSON.stringify(a.args);
    return `${a.tool} ${argStr}`;
  }

  // ---------- the scripted policy ----------
  // A pure function of the VISIBLE context text (nothing else), so the context
  // window experiment is honest: what falls off the end is truly forgotten.
  // Returns { thought, action } or { stop } or { finish }.
  function policy(ctxText) {
    const has = (re) => re.test(ctxText);

    if (!has(/Order pizza for the robotics club/)) {
      return { stop: 'I can no longer see a goal in my context. I do not know what I am supposed to be doing.' };
    }
    if (!has(/\[search results\]/)) {
      return {
        thought: 'I need pizza options. Let me search the documents first.',
        action: { tool: 'search', args: { query: 'pizza delivery' } },
      };
    }
    if (!has(/\[menu-tonys\]/)) {
      return {
        thought: "The snippets mention Tony's at $11 — cheapest first. Read that flyer.",
        action: { tool: 'read', args: { doc_id: 'menu-tonys' } },
      };
    }
    if (!has(/\[menu-riverside\]/)) {
      return {
        thought: "Tony's closes at 5pm and only delivers while open — the party is at 6pm, so Tony's is out. Riverside is next cheapest at $12.",
        action: { tool: 'read', args: { doc_id: 'menu-riverside' } },
      };
    }
    if (!has(/\[menu-campus\]/)) {
      return {
        thought: 'Riverside is closed Wednesdays and the party is Wednesday. That leaves Campus Slice at $13.',
        action: { tool: 'read', args: { doc_id: 'menu-campus' } },
      };
    }
    if (!has(/24\s*\*\s*3 = 72/)) {
      return {
        thought: 'Campus Slice works: open to 9pm, delivers, $5 fee. Now the amount: 24 people times 3 slices.',
        action: { tool: 'calc', args: { expression: '24*3' } },
      };
    }
    if (!has(/72\s*\/\s*8 = 9/)) {
      return {
        thought: '72 slices, 8 per pizza.',
        action: { tool: 'calc', args: { expression: '72/8' } },
      };
    }
    if (!has(/calc error/) && !has(/9\s*\*\s*13 = 117/)) {
      return {
        thought: 'Nine pizzas at $13 each.',
        action: { tool: 'calc', args: { expression: '9 x $13.00' } },
      };
    }
    if (!has(/9\s*\*\s*13 = 117/)) {
      return {
        thought: 'The calculator rejected that — it wants plain numbers and operators. Retry as 9*13.',
        action: { tool: 'calc', args: { expression: '9*13' } },
      };
    }
    if (!has(/\(117\+5\)\*1\.08 = 131\.76/)) {
      return {
        thought: 'Subtotal $117 plus the $5 delivery fee, times 1.08 for tax.',
        action: { tool: 'calc', args: { expression: '(117+5)*1.08' } },
      };
    }
    if (!has(/noted \(/)) {
      return {
        thought: 'Write the result down before finishing.',
        action: { tool: 'note', args: { text: 'Campus Slice: 9 large pizzas, $131.76 total (9x$13 + $5 delivery, 8% tax).' } },
      };
    }
    return {
      thought: 'Everything checks out. Hand back the answer.',
      finish: 'Campus Slice — 9 large pizzas — $131.76 total. (9 × $13 = $117, + $5 delivery = $122, × 1.08 tax = $131.76.) Tony\'s was cheaper but closes at 5pm; Riverside is closed Wednesdays.',
    };
  }

  // ---------- candidate actions for "you are the model" mode ----------
  // The policy's own choice plus plausible distractors. Distractors really
  // execute — wrong turns produce real observations and real detours.
  function candidates(ctxText) {
    const p = policy(ctxText);
    if (p.stop) return { stop: p.stop };
    const list = [];
    if (p.finish) list.push({ thought: p.thought, action: { tool: 'finish', args: { answer: p.finish } }, best: true });
    else list.push({ ...p, best: true });

    const has = (re) => re.test(ctxText);
    const pool = [];
    if (!has(/\[search results\]/)) {
      pool.push(
        { thought: 'Just read the cheapest menu directly.', action: { tool: 'read', args: { doc_id: 'cheapest-pizza' } } },
        { thought: 'I probably know a typical price. Guess and finish now.', action: { tool: 'finish', args: { answer: 'About $120 for pizza from somewhere nearby.' } } },
      );
    } else if (!has(/\[menu-campus\]/)) {
      pool.push(
        { thought: 'Skip the flyers — just compute a rough cost from the snippet price.', action: { tool: 'calc', args: { expression: '9*11*1.08' } } },
        { thought: 'Check the shuttle schedule, maybe pickup is easier.', action: { tool: 'read', args: { doc_id: 'bus-schedule' } } },
      );
    } else if (!has(/\(117\+5\)\*1\.08 = 131\.76/)) {
      pool.push(
        { thought: 'Close enough — finish without the tax arithmetic.', action: { tool: 'finish', args: { answer: 'Campus Slice, 9 pizzas, about $117.' } } },
        { thought: 'Double-check the events listing for the party time.', action: { tool: 'read', args: { doc_id: 'campus-events' } } },
      );
    } else {
      pool.push(
        { thought: 'Search again, just to be safe.', action: { tool: 'search', args: { query: 'pizza' } } },
      );
    }
    for (const d of pool.slice(0, 2)) list.push({ ...d, best: false });
    // Deterministic order: best is not always first.
    const order = (ctxText.length % list.length);
    return { list: list.slice(order).concat(list.slice(0, order)) };
  }

  // Advance one turn using a chosen {thought, action|finish}. Applies the
  // visible-window limit only inside policy/candidates (choice), not here.
  function applyTurn(ep, choice) {
    ep.turns++;
    if (choice.thought) ep.entries.push({ role: 'thought', text: choice.thought });
    if (choice.finish || (choice.action && choice.action.tool === 'finish')) {
      const answer = choice.finish || choice.action.args.answer;
      ep.entries.push({ role: 'action', text: fmtAction({ tool: 'finish', args: { answer } }) });
      ep.entries.push({ role: 'final', text: answer });
      ep.done = true;
      ep.finalAnswer = answer;
      return;
    }
    ep.entries.push({ role: 'action', text: fmtAction(choice.action) });
    const obs = runTool(ep, choice.action);
    ep.entries.push({ role: 'observation', text: obs });
  }

  function visibleContext(ep, windowChars) {
    const full = serializeContext(ep);
    if (!windowChars || windowChars >= full.length) return full;
    return full.slice(full.length - windowChars);
  }

  const OPTIMAL_TURNS = 11; // the scripted run, including its one calculator stumble

  return {
    DOCS, GOAL, SYSTEM, SCHEMAS, OPTIMAL_TURNS,
    toolSearch, toolRead, toolCalc,
    newEpisode, runTool, serializeContext, tokenEstimate, fmtAction,
    policy, candidates, applyTurn, visibleContext,
  };
})();

if (typeof module !== 'undefined') module.exports = AGENT;

# How a Language Model Works

Glass Box is a self-contained, offline teaching demo with three tabs: **LLM**,
**Reasoning**, and **Agents**. It uses small, local mechanisms to make their
different roles visible; it does not make a capability claim about larger models
or every production AI system. Open `index.html` in a modern browser. No account,
network request, AI service, or installation is needed.

## What each stage teaches

- **LLM** trains a tiny character-level transformer from scratch on one original
  story. Tokenize text, Inspect parameters, Trace attention, and Try next-token
  prediction expose values from the live model. Attention is an intermediate
  calculation, not evidence of a mind or intent.
- **Reasoning** compares direct answers with worked column-addition examples.
  Train and compare and Compare exam answers show the effect of intermediate
  written steps in this bounded task. Try more attempts samples a frozen model
  several times and checks the work, so any improvement comes from more
  inference-time computation rather than training.
- **Agents** runs a local tool loop with document search, reading, calculation,
  notes, observations, and a visible context window. You choose the actions
  exposes real consequences; Watch the scripted policy makes the automatic
  action selector explicit. The selector is not a learned model.

Fine-tune on accepted examples generates arithmetic problems, filters sampled
worked chains with the arithmetic checker and the generated answer, then makes
ordinary next-token supervised updates. It is accepted-example self-training,
not policy-gradient reinforcement learning.

## Presenter and contract surfaces

Guide opens on entry and from the header. Settings contains **Open Presenter
Notes**, **Presentation mode**, and **Reset**. The canonical
`src/demo-guide.html` supplies both the in-app notes and printable guide; Open
printable guide opens its rendered copy. Details holds deeper architecture and
implementation material without interrupting the primary activity.

The guide gives a 20-minute sequence. Training runs and the Reasoning extensions
can take a few minutes, so Try more attempts and Fine-tune on accepted examples
are explicitly optional; do not promise a particular score or curve.

## Source and verification

`src/engine.js` is the transformer engine; `src/text.js`, `src/arith.js`, and
`src/agent.js` provide the three teaching worlds; `src/worker.js` performs
training off the UI thread where possible. `src/demo-guide.html` is the single
presenter-notes source; `build.js --check` verifies its embedded copy stays in
sync with the built page. The page chrome (header, stage tabs, the four dialogs,
Reset, presentation mode) comes from the shared `../tools/lesson-shell` kit at
build time and is inlined, so the shipped file is still one self-contained HTML
document; `check-shell.js` verifies the kit stamp and the template parts.
`tools/integration.mjs` is a Playwright suite and needs Playwright installed.

Relevant checks after implementation changes are:

```text
node src/selftest.test.js
node src/arc.test.js
node build.js --check
node ../tools/lesson-shell/check-shell.js glass-box
node ../tools/build-hub.js --check
node tools/integration.mjs
node tools/pdf.mjs --check
```

Run these commands from `glass-box/`. Rebuild with `node build.js`. To render the
canonical guide with Chromium, run `node tools/pdf.mjs`. Alternatively, from the
repository root, use the shared semantic HTML renderer (Python with ReportLab):

```text
python zero-to-unbeatable/tools/render_guide.py --source glass-box/src/demo-guide.html --output glass-box/Glass-Box-Demo-Guide.pdf
```

Inspect the final PDF pages after either rendering route. The slow arithmetic
test reproduces the seeded benchmark; it is separate from the browser UI checks.

The historical size comparisons in Details use the published large GPT-2
release ([OpenAI](https://openai.com/index/gpt-2-1-5b-release/)) and GPT-3
([paper](https://arxiv.org/abs/2005.14165)). Parameter count alone does not
describe a model's training, capability or quality.

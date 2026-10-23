# Types of AI

Demo 1 of 17, Part one of *AI: From Zero to Takeoff*. It sorts models two ways and
keeps three questions apart that people routinely mix up: **how a model is built**
(architecture), **how it learned** (training method), and **what job it does**
(model type). Open `index.html` in a modern browser. It is a single offline file:
no account, network request, AI service or installation is needed.

## Teaching sequence

The top lens switches between **Model architecture** and **Model types**.

**Model architecture** carries four stages on one tic-tac-toe board. **Details**
opens the current stage's evidence, assumptions, sources and boundary in a
right-side drawer, so the activity keeps the stage question, the
Predict/Try/Takeaway strip, the board and the controls together.

- **1a · Symbolic AI (GOFAI)** follows a hand-written eight-rule ladder.
  GOFAI means Good Old-Fashioned Artificial Intelligence. This ordered decision
  list can be drawn as a chain of yes/no tests in a decision tree; its tests were
  authored, whereas other decision trees can be learned from examples. It learns
  nothing from play; the policy check examines every reachable game line before
  the app calls the full ladder unbeatable. Directly above the ordered list,
  **First 2 rules**, **First 4 rules** and **All 8 rules** choose how much of
  that visible ladder the opponent can use.
- **1b · Value table** uses tabular reinforcement learning to store estimates for
  positions after visible training bursts. `Show move scores` exposes those
  estimates. Human play does not train the table; only the app's training burst
  updates it. The opponent era selector sits directly above **Train the AI** so
  comparing Era 0 with a trained era is part of the same action. The inline
  change report below the training controls follows that selection: each trained
  era shows its recorded scores and changes from the preceding era. Era 0
  explains the untrained baseline.
- **1c · Neural Network** first uses a fresh 20,000-game seeded table learner to
  create frozen learning examples, then trains reusable adjustable weights to
  approximate them. People still designed the board inputs and learning
  procedure. Train and held-out error show agreement with that teacher; the
  separate playing score does not turn either error into a strength guarantee.
  The actual feedforward multilayer perceptron is visible through a read-only
  network inspector exposing connection weights, biases and changes from
  initialization, with layer sizes derived from the current model.
  Backpropagation supplies derivatives for normalized gradient updates; this is
  supervised fitting to frozen estimates, not evolutionary optimization.
  Ultimate tic-tac-toe is an optional representation-limit extension, one press
  away on the board switch above this stage's board: a network cannot recover
  facts absent from its inputs merely by changing weights.
- **1d · Other architectures & training methods** holds three parts behind one
  switch. Six pressable **training method** cards — supervised, unsupervised,
  self-supervised, reinforcement, semi-supervised, and no training at all — light
  up which of 1a, 1b and 1c used each one (supervised → 1c, reinforcement → 1b,
  none → 1a; the other three light nothing, which is the point). The card faces
  do not state the answer; the press does. Three cards carry a sourced one-line
  "used for" note — pretraining (self-supervised), supervised fine-tuning and
  distillation (supervised), RLHF and GRPO (reinforcement) — because pretraining
  and fine-tuning are stages that use a method, not further methods. Six
  **architecture** cards cover linear/logistic models, decision trees, ensembles,
  nearest neighbours, support-vector machines and probabilistic/Bayesian models.
  Search and planning are named separately as problem-solving approaches. It also
  keeps the two clarifications the old learning tab carried: self-play is not
  self-supervised learning, and gradient training is not evolution. The third
  part, **Learning with no weight change**, covers in-context learning, retrieval
  and search at decision time, each sourced, with a press line on what this demo
  does (1a's fork rules look ahead; the exhaustive search only checks players).

**Model types** is the other lens: what a model *does*. It is built from **Hugging
Face's own task taxonomy**, fetched on **2026-09-16** and cited on the page —
[huggingface.co/tasks](https://huggingface.co/tasks) for the groups, names and
model counts, the task filter on
[huggingface.co/models](https://huggingface.co/models) for the link behind every
type, and each task's own page for the definition quoted on its card. Ten featured
cards (text generation, text-to-image, text-to-speech, automatic speech
recognition, image-to-3D, text-to-video, image-to-text, image-text-to-text, image
classification, tabular classification) give what goes in, what comes out, the
catalogue's verbatim definition and an outbound link to real models of that type.
Below them the whole catalogue is listed in its own six groups, 47 tasks, each
chip carrying its model count on the fetch date and linking to the hub. Between
them, **Beyond one catalogue** lists eight major types the Hub list does not
show, each with a named example linked to that model's own page (Genie 3, Veo
3.1, Gemini Robotics, AlphaFold, GenCast, NVIDIA Broadcast, Wan-Animate, 4C4D),
carried in `BEYOND` in the same file. The stage has no Predict card. The
taxonomy lives in `src/model-types.js` with its provenance and its probe controls
recorded; nothing is written from memory, and nothing is fetched at runtime — the
links are ordinary hyperlinks the reader may choose to follow.

The stage takeaway is the link back to the architecture lens: a type names the job,
not the internals. One neural-network family — the transformer — serves text,
vision, audio, video and multimodal jobs, which Hugging Face's own framework page
says in as many words; generating images, audio and video also leans on diffusion
models, a different family Hugging Face keeps in a separate library (Diffusers).
Sources and fetch dates are in the stage's Details drawer.

## Presenter and contract surfaces

Built on the shared lesson shell at `../tools/lesson-shell` (a build-time
dependency; the shipped `index.html` is still one self-contained file). The shell
owns the header, the stage tablist, the four dialogs, the check cards and Reset;
this demo owns the lens row, the board, the ladder, the training panel, the
network inspector, the montage and the two map stages.

Guide opens on load and reopens from the header's **Guide** button. Settings
contains **Open Presenter Notes**, **Presentation mode** and **Reset**, then a
playing preference, a rehearsal seed, the self-test and About. **Reset is in
place — no page reload**: it restores stage 1a on the architecture lens, First 2
rules, hidden move scores, Era 0 with every later era and the network discarded,
your records, every prediction echo and check answer, and closes every type card;
Presentation mode and the playing preference stay as you set them.

Presenter Notes and the printable guide share the canonical source
`src/demo-guide.html`; `node build.js` injects its scoped stylesheet and body into
the app, and `node build.js --check` fails the moment any of the three surfaces
drift or the PDF predates the guide.

`#stage-1` through `#stage-5` select stages directly; the older `#rules`,
`#learning` and `#neural` links still work, and `#presenting` opens in
presentation mode.

## Reproducibility and checks

`src/net.js` contains deterministic teacher preparation, the grouped held-out
split, bounded updates, policy and measurements. `src/neural.test.js` checks
deterministic preparation and updates, distinct afterstates, the grouped split,
gradient agreement away from ReLU corners, no teacher consultation in play, and
fixed-seed measurements. `src/model-types.test.js` checks the taxonomy's shape,
that every featured card resolves to a catalogue task, and that every outbound
link is built from a catalogue slug.

Run:

```text
node src/playtest.test.js
node src/neural.test.js
node --test src/neural-lifecycle.test.js
node --test src/network-view.test.js
node --test src/ui-state.test.js
node --test src/model-types.test.js
node build.js --check
node ../tools/lesson-shell/check-shell.js zero-to-unbeatable
node ../tools/build-hub.js --check
```

Edit `src/demo-guide.html` for any presenter-guide change, then `node build.js`
and `node tools/pdf.mjs`. Launcher card text and the README table row at the
repository root are generated from `demo.json` by `node ../tools/build-hub.js`;
do not hand-edit them.

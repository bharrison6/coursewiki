# Types of AI — current implementation specification

The demo is built on the shared lesson shell (`../tools/lesson-shell`), a
build-time dependency whose CSS and behaviour are inlined so the shipped
`index.html` remains one self-contained file. The shell owns the header, the
single stage tablist, the four dialogs (Guide, Settings, Details, Presenter
Notes), the A6 check cards and the in-place Reset; the demo owns the lens row,
the activity and the two map stages, and implements the required `lessonreset`
handler.

Two lenses sort models on two axes. **Model architecture** exposes stages 1a
Symbolic AI (GOFAI), 1b Value table, 1c Neural Network and 1d Other
architectures & training methods; 1a-1c compare architectures on one game and 1d
is a map of the remaining architectures and of the training methods that fit
them. **Model types** is a separate axis, by task: what goes in and what comes
out. The stage tablist hides while the Model types lens is selected. The lens row
is not a second tablist: `selectStage` remains the only thing that moves a stage,
and the lens buttons call it.

The tabs are not an exhaustive AI taxonomy or a progression of difficulty. No
stage is gated. `#stage-1` through `#stage-5` select stages; the older `#rules`,
`#learning` and `#neural` links are honoured for the three playable stages, and
`#presenting` opens in presentation mode.

The activity is ONE element (`#activity`) moved, never cloned, between the three
playable stages' hosts by the `stagechange` handler, so its listeners and the
game in progress survive a stage change. Stages 1d and Model types host no
activity.

1a is a readable hand-written eight-rule ladder. It receives no experience and
is verified by `OG.verifyPolicy`. Its ordered tests can be expressed as a decision
tree; the tests here are authored, though trees can also be learned. GOFAI expands
to Good Old-Fashioned Artificial Intelligence. 1b uses tabular reinforcement
learning. Its
table records the value for the player who just made a complete afterstate;
visible training bursts create eras, and Show move scores exposes legal-move
estimates. Human play does not update the table. An inline report below the
training controls uses the selected era's immutable snapshot and compares it
with the immediately preceding snapshot. Era 0 describes the initial baseline.
Selecting an older era updates the report; completing a burst selects its new era
and displays the report without a popup. Example score changes are observed
estimates, not guaranteed perfect-game values.

1c uses a fresh copy of the 1b learner as a frozen supervised teacher, never as
a runtime game oracle. `NET.makeTeacher` runs 20,000 seeded tabular games and
clones the result. `NET.makeDataset` enumerates unique reachable afterstates,
uses `teacher.V[code]` as each label, and assigns an entire rotation/reflection
group to train or held-out by a deterministic seed hash. A label is a current
table estimate, not a perfect-game target; an unvisited position can remain at
its initial zero value.

The model has 29 one-hot cell/turn inputs, 28 and 18 ReLU hidden units, and a linear
value output clamped only when read. Its weights are adjustable numbers reused
to calculate many positions, unlike the table’s separate stored entries. A
read-only inspector visualizes the actual instance and exposes signed connection
weights and biases with changes from initialization. Counts are derived from the
instance: 1,334 connection weights plus 47 biases, 1,381 parameters. Numerical
weight inspection must cover values omitted from any simplified overview and
must not mutate model state. Backpropagation supplies derivatives to normalized
gradient updates on frozen supervised targets. People
designed both the inputs and learning procedure. Bounded training batches keep
preparation, training, Reset, and tab changes interruptible. The network policy
evaluates legal afterstates with `NET.predict(model, child)` and has no teacher
parameter. MSE is average squared prediction-score error; reported train/held-out
error and the fixed-seed playing score remain separate measurements. No neural-
network unbeatable claim appears unless that exact policy is separately verified
and the wording is deliberately revised.

Stage 1d holds both axes, plus a third part. Six pressable training-method cards distinguish
supervised, unsupervised, self-supervised, reinforcement and semi-supervised
learning, plus no training at all, without treating them as mutually exclusive
model families; pressing one names which of 1a-1c used it, read from this demo's
own code (supervised -> 1c, reinforcement -> 1b, none -> 1a, the other three
nothing). Self-play does not imply self-supervision; supervised targets need not
come from humans. Gradient and evolutionary methods are optimization approaches.
Six architecture cards list linear/logistic models, learned trees, ensembles,
nearest neighbours, support-vector machines and probabilistic/Bayesian models;
search/planning is identified separately as a problem-solving approach.
Method card faces never name 1a-1c (the press does); supervised,
self-supervised and reinforcement cards carry a Sourced "used for" stage note.
The third part, learning with no weight change, has three Sourced cards
(in-context, retrieval, search at decision time) whose press line about this
demo is Reasoned from its code. The Model types stage has no Predict card and
adds a `BEYOND` group of own-page-sourced model types beside the Hub catalogue.

The Model types stage is generated from `src/model-types.js`, which carries
Hugging Face's task taxonomy as fetched on 2026-09-16: the six group headings,
47 task names and their model counts from `huggingface.co/tasks`, the
`pipeline_tag` slug behind every outbound link from the task filter on
`huggingface.co/models`, and a verbatim opening definition from each featured
task's own page. The file records its probe controls (three unusual slugs
confirmed against the model hub, and `image-to-mesh` returning zero results,
which is why that job is presented under the catalogue's own name Image-to-3D).
No taxonomy claim is written from memory, every count carries its fetch date on
the page face under a `Sourced` kicker, and nothing is fetched at runtime: the
per-type links are ordinary `<a href>` navigations the reader may choose to
follow. `src/model-types.test.js` enforces the file's shape and that every link
is built from a catalogue slug.

The required Guide opens on entry and from the header’s Guide button. Settings,
beside Guide, contains Open Presenter Notes, Presentation mode, and Reset, then
the playing preference, the rehearsal seed, the self-test and About. Reset is IN
PLACE with no page reload: the shell restores the chrome it owns and dispatches
`lessonreset`, and the demo's handler restores stage 1a on the architecture lens,
First 2 rules, hidden move scores, Era 0 with every later era and the network
discarded, the records, the rule tallies, the burst sizes, every prediction and
method selection, and closes every type card. Presentation mode and the playing
preference are deliberately left alone. Because the shell fires `stagechange`
before `lessonreset`, the demo raises a flag in `onReset` so the reset path
paints exactly once, from `lessonreset` (ADOPTING.md section 4 step 7). The
canonical `src/demo-guide.html` supplies both embedded Presenter Notes and the
printable guide; the build check detects drift. Its visible controls use the
current contract names: New game, Show/Hide move scores, Create learning
examples, Train network, and Open printable PDF.

Ultimate tic-tac-toe remains an optional advanced representation-limit activity,
not 1c. Its additional global facts are absent from a one-board input, and a
neural network with those same incomplete inputs cannot repair that omission.

/* ==========================================================================
   Two Winters — the dataset.

   Every claim on screen comes from this file and every claim in this file
   carries a `src` that resolves to an entry in SOURCES. Nothing is here
   because it sounded right, and nothing is here because another demo in this
   repository already said it.

   `status` on any claim is one of:
     'primary'  — checked this build against the document itself: the paper,
                  the report's own text, the lab's own page, the official
                  results table.
     'reported' — a specific, retrievable secondary source that names its own
                  underlying scholarship. Used where the primary is a printed
                  book, a paywall, or a scanned page that could not be read.

   Nothing below 'reported' ships. What failed that bar is in CUT, at the
   bottom, because what a dataset refuses to include is part of its argument.

   Two standing cautions, both surfaced in the app rather than buried here:

     1. Winter date ranges are conventional, not crisp. Historians disagree,
        most sharply about when the second one ended. The bands are drawn
        soft-edged for that reason and the app says so out loud.

     2. There is no continuous, sourceable series of AI funding across
        seventy-six years. This demo therefore does not draw one. It shows
        four funding commitments it can actually source, in their original
        currencies, un-adjusted for inflation, and labels them as four points
        rather than a curve.
   ========================================================================== */

const DATA = (() => {

/* --------------------------------------------------------------------------
   The opening screen.
   -------------------------------------------------------------------------- */

const INTRO = {
  title: 'AI has contracted twice before. The histories rhyme, but they do not repeat as a script.',
  body: [
    'You have just considered AI gains alongside their limits and measurement conditions. The fair question from anyone who has been in a technical field for thirty years is: is this another bubble?',
    'That question has an evidence base. Artificial intelligence has had two funding contractions severe enough that people inside the field named the weather — the AI winters. The first involved research expectations, machine translation, and UK policy; the second involved expert systems, specialised hardware, and shifting defence priorities. They share pressures, but neither supplies a template for the next one.',
    'This is not a demo about hype being bad. It separates time-bounded forecasts from contemporary assessments, then asks what evidence supports each present-day analogy. You will score forecasts. You will inspect assessments without pretending they were prophecies.'
  ],
  note: 'No AI is used anywhere in this app. It is a set of dated quotations, a timeline, and a link to the original source of each one. Everything runs from this single file with no network.',
  cta: 'Start — guess the year'
};

/* --------------------------------------------------------------------------
   ACT I — Guess the year.

   Ten real, sourced claims, shown with the speaker and the date hidden.
   The viewer guesses the year on a slider and picks a verdict. Deliberately
   mixed: five time-bounded promises, four contemporary or untimed assessments and one
   warning. Only a time-bounded forecast earns an outcome score. An assessment
   may be useful, mistaken, or misused without being a prediction.

   `kind` identifies the claim form, not whether it was correct:
     'promise'  — AI is nearly here / this will work
     'assessment' — a diagnosis of conditions at the time, not a forecast
     'warning'  — trouble is coming

   `verdict` is what happened:
     'no'    — it did not come true
     'yes'   — it came true
     'late'  — it came true, far outside the stated window
     'open'  — genuinely unresolved as of this build
   -------------------------------------------------------------------------- */

const CARDS = [

{
  id: 'turing-1950',
  quote: 'I believe that in about fifty years’ time it will be possible to programme computers … to make them play the imitation game so well that an average interrogator will not have more than 70 per cent. chance of making the right identification after five minutes of questioning.',
  who: 'Alan Turing',
  role: 'mathematician, University of Manchester',
  where: '“Computing Machinery and Intelligence”, Mind LIX(236)',
  year: 1950,
  kind: 'promise',
  verdict: 'open',
  verdictLine: 'Its about-2000 bar was missed; its current status is still contested.',
  what: 'Turing set an about-2000 deadline and a specific bar: five minutes, and an interrogator no better than 70% at telling machine from human. The card does not assign a current pass/fail verdict because the test’s status and interpretation remain contested. It separates the missed historical window from the unresolved present question.',
  status: 'primary', src: 'turing1950'
},

{
  id: 'nyt-1958',
  quote: 'The Navy revealed the embryo of an electronic computer today that it expects will be able to walk, talk, see, write, reproduce itself and be conscious of its existence.',
  who: 'The New York Times, reporting a US Navy press conference',
  role: 'on Frank Rosenblatt’s perceptron',
  where: '“New Navy Device Learns By Doing”, 8 July 1958',
  year: 1958,
  kind: 'assessment',
  verdict: 'context',
  verdictLine: 'An untimed ambition, not a forecast with an outcome window.',
  what: 'The machine being described had learned to tell a card marked on the left from one marked on the right, after fifty tries. The reported sentence makes expansive claims but supplies no deadline, so this activity treats it as an untimed ambition to classify rather than a prediction to score. Cornell’s 2019 account quotes the 1958 New York Times report; it is a reported source, not the original article.',
  status: 'reported', src: 'cornell-perceptron'
},

{
  id: 'simon-newell-chess',
  quote: 'Within ten years a digital computer will be the world’s chess champion, unless the rules bar it from competition.',
  who: 'Herbert Simon and Allen Newell',
  role: 'Carnegie Institute of Technology; later a Nobel laureate and a Turing Award winner',
  where: 'lecture given 1957, published in Operations Research 6(1)',
  year: 1957,
  kind: 'promise',
  verdict: 'late',
  verdictLine: 'Right idea. Wrong by thirty years.',
  what: 'Deep Blue beat Garry Kasparov 3½–2½ in May 1997 — forty years after the forecast rather than ten, so thirty years past the deadline. This card illustrates one dated claim whose destination arrived much later; it does not establish a general rule about every AI timeline.',
  status: 'reported', src: 'simon-newell-1958'
},

{
  id: 'simon-1960',
  quote: 'Machines will be capable, within twenty years, of doing any work that a man can do.',
  who: 'Herbert Simon',
  role: 'Carnegie Institute of Technology',
  where: 'The New Science of Management Decision, p. 38',
  year: 1960,
  kind: 'promise',
  verdict: 'no',
  verdictLine: 'No. By 1980 the field was in its first winter.',
  what: 'Twenty years from 1960 lands in 1980, which is roughly the bottom of the first AI winter. This sentence is very widely quoted with the date 1965, from its reprint in The Shape of Automation; it was first published in 1960. If a demo is going to score you on dates, it had better get its own right.',
  status: 'reported', src: 'qi-simon'
},

{
  id: 'alpac-1966',
  quote: 'A US government committee reviews a decade of machine-translation funding and reports that there is no shortage of human translators, that machine output still has to be rewritten by a person, and that useful machine translation is not in near prospect.',
  who: 'The Automatic Language Processing Advisory Committee (ALPAC)',
  role: 'chaired by John R. Pierce, for the National Academy of Sciences',
  where: 'Language and Machines: Computers in Translation and Linguistics',
  year: 1966,
  kind: 'assessment',
  verdict: 'context',
  verdictLine: 'A 1966 assessment, not a forecast to grade against the future.',
  what: 'ALPAC questioned the near-term economics of fully automatic translation while recommending $2.5–3 million annually for computational-linguistics research. It separately endorsed tools that could assist human translators. Its recommendations, its later funding effects, and the eventual success of machine translation are different claims. This card keeps them separate.',
  note: 'Paraphrased from the original report. It is included to practice distinguishing an assessment from a prediction.',
  status: 'primary', src: 'alpac'
},

{
  id: 'minsky-1967',
  quote: 'Within a generation, I am convinced, few compartments of intellect will remain outside the machine’s realm — the problems of creating “artificial intelligence” will be substantially solved.',
  who: 'Marvin Minsky',
  role: 'co-founder of the MIT AI Laboratory',
  where: 'Computation: Finite and Infinite Machines, Prentice-Hall, p. 2',
  year: 1967,
  kind: 'promise',
  verdict: 'no',
  verdictLine: 'No — and a generation later the field was in its second winter.',
  what: 'Minsky wrote this in his own textbook, which is why it is used here rather than the more famous “three to eight years” line attributed to him by Life magazine in 1970. That article contains errors, and Minsky denied at least one quotation in it. A book he wrote himself is the stronger evidence, and it says something just as strong.',
  status: 'reported', src: 'qi-minsky'
},

{
  id: 'perceptrons-1969',
  quote: 'A book of mathematical proofs shows what a single-layer perceptron cannot compute. Later accounts disagree about how broadly it shaped research priorities.',
  who: 'Marvin Minsky and Seymour Papert',
  role: 'MIT — and, more to the point, everyone who read them',
  where: 'Perceptrons: An Introduction to Computational Geometry, MIT Press',
  year: 1969,
  kind: 'assessment',
  verdict: 'context',
  verdictLine: 'A mathematical result with a contested historical reception.',
  what: 'The book proved limits of single-layer perceptrons. Its historical reception is contested: claims that it caused a field-wide pause are too neat, and the authors disputed that causal account. The card is about separating a mathematical result from claims about a whole field’s research choices.',
  note: 'Paraphrased. The claim shown is about how the book was received, which is exactly the part historians argue over.',
  status: 'reported', src: 'perceptrons-wiki'
},

{
  id: 'lighthill-1973',
  quote: 'In no part of the field have the discoveries made so far produced the major impact that was then promised.',
  who: 'Sir James Lighthill',
  role: 'Lucasian Professor of Applied Mathematics, Cambridge, writing for the UK Science Research Council',
  where: 'Artificial Intelligence: A General Survey — written July 1972, published 1973',
  year: 1973,
  kind: 'assessment',
  verdict: 'context',
  verdictLine: 'A retrospective judgment on impact so far, not a permanent forecast.',
  what: 'Lighthill criticized unmet promises and combinatorial explosion, while distinguishing useful automation and central-nervous-system research from the disputed bridge between them. His report assessed the impact achieved by 1973; it did not say that later methods could never matter. UK policy effects and the report’s influence are historical questions, not proof that the assessment predicted the future.',
  status: 'primary', src: 'lighthill'
},

{
  id: 'aaai-1984',
  quote: 'Two senior researchers tell a room full of the AI industry that enthusiasm has spiralled out of control, and that pessimism, then press pessimism, then a funding cut, then the end of serious work, will follow in that order.',
  who: 'Roger Schank and Marvin Minsky',
  role: 'both of whom had lived through the first winter',
  where: 'a public debate at the annual meeting of AAAI — where the phrase “AI winter” first appears',
  year: 1984,
  kind: 'warning',
  verdict: 'yes',
  verdictLine: 'Right. It arrived three years later.',
  what: 'This is a historically interesting warning from insiders that roughly anticipated a later contraction. It shows that a selected warning can be useful; it does not establish that mechanism forecasts generally outperform date forecasts.',
  note: 'Paraphrased. The underlying account is Daniel Crevier’s 1993 history, AI: The Tumultuous Search for Artificial Intelligence.',
  status: 'reported', src: 'aiwinter-wiki'
},

{
  id: 'amodei-2024',
  quote: 'I think it could come as early as 2026, though there are also ways it could take much longer.',
  who: 'Dario Amodei',
  role: 'CEO, Anthropic — on the arrival of what he calls powerful AI',
  where: '“Machines of Loving Grace”',
  year: 2024,
  kind: 'promise',
  verdict: 'open',
  verdictLine: 'Open. The year named is the year you are standing in.',
  what: 'This one is left unscored on purpose. Note the hedge — “could”, and “ways it could take much longer” — which is more careful than Simon in 1960 or Minsky in 1967, and note also that the hedge is the first thing dropped when a sentence like this is repeated. Whatever you conclude, you are now judging it with a track record in hand instead of a feeling.',
  status: 'primary', src: 'mlg'
}

];

/* --------------------------------------------------------------------------
   ACT II — the timeline.

   Five lanes, one per stage of the mechanism. The point of the lanes is that
   the reader can watch the sequence fire in order, twice, without being told
   that it does.

   stage:
     'promise'    — a confident public claim
     'money'      — funding actually committed
     'limit'      — a hard technical obstacle becoming visible
     'naming'     — an authoritative voice naming the gap
     'withdrawal' — money leaving
   Landmark scientific results carry stage 'result' and sit above the lanes,
   because they are the ground truth the promises were measured against.
   -------------------------------------------------------------------------- */

const STAGES = [
  { id: 'promise',    label: 'Claims & ambitions', blurb: 'What people said the technology could soon do.' },
  { id: 'money',      label: 'Institutional bets', blurb: 'Public or private commitments made under uncertainty.' },
  { id: 'limit',      label: 'Constraints',        blurb: 'Technical or economic limits that became salient.' },
  { id: 'naming',     label: 'Reassessment',       blurb: 'Reports, researchers, or markets revising expectations.' },
  { id: 'withdrawal', label: 'Withdrawal',         blurb: 'Funding, markets, or institutional attention pulling back.' }
];

const EVENTS = [

/* ---- build-up to the first winter ---- */
{ d: '1950-10-01', p: 'y', stage: 'result', era: 1, label: 'Turing asks the question',
  text: 'Computing Machinery and Intelligence sets out the imitation game and a fifty-year deadline.',
  status: 'primary', src: 'turing1950' },

{ d: '1955-08-31', p: 'd', stage: 'promise', era: 1, label: 'The Dartmouth proposal',
  text: 'McCarthy, Minsky, Rochester and Shannon propose “a 2 month, 10 man study of artificial intelligence” for the summer of 1956, “on the basis of the conjecture that every aspect of learning or any other feature of intelligence can in principle be so precisely described that a machine can be made to simulate it.” The field gets its name here.',
  status: 'primary', src: 'dartmouth' },

{ d: '1957-01-01', p: 'y', stage: 'promise', era: 1, label: 'Ten years to a chess champion',
  text: 'Simon and Newell predict a computer world chess champion within ten years, a computer-discovered mathematical theorem within ten years, and computer music of accepted aesthetic value within ten years.',
  status: 'reported', src: 'simon-newell-1958' },

{ d: '1958-07-08', p: 'd', stage: 'promise', era: 1, label: 'The perceptron, in the press',
  text: 'A Navy press conference and a New York Times story promise a machine that will “walk, talk, see, write, reproduce itself and be conscious of its existence.” The demonstration was an IBM 704 learning left from right in fifty trials.',
  status: 'reported', src: 'cornell-perceptron' },

{ d: '1960-01-01', p: 'y', stage: 'promise', era: 1, label: 'Twenty years to any work a man can do',
  text: 'Simon, in The New Science of Management Decision. Reprinted in 1965, which is the date it is usually given.',
  status: 'reported', src: 'qi-simon' },

{ d: '1966-11-01', p: 'm', stage: 'naming', era: 1, label: 'The ALPAC report',
  text: 'A National Academy of Sciences committee reviews a decade of machine-translation funding and finds no translator shortage, no output usable without a human rewriting it, and no near prospect of useful machine translation.',
  status: 'primary', src: 'alpac' },

{ d: '1966-12-01', p: 'y', stage: 'withdrawal', era: 1, label: 'Machine translation funding falls away',
  text: 'US federal support for machine translation drops sharply after ALPAC. This is the first of the withdrawals and it happens eight years before the winter proper.',
  status: 'reported', src: 'aiwinter-wiki' },

{ d: '1967-01-01', p: 'y', stage: 'promise', era: 1, label: 'Substantially solved within a generation',
  text: 'Minsky, in his own textbook: “few compartments of intellect will remain outside the machine’s realm”.',
  status: 'reported', src: 'qi-minsky' },

{ d: '1969-01-01', p: 'y', stage: 'limit', era: 1, label: 'Perceptrons',
  text: 'Minsky and Papert prove limits of single-layer perceptrons. The mathematical result is distinct from the contested historical account of how researchers and funders responded to it.',
  status: 'reported', src: 'perceptrons-wiki' },

{ d: '1972-07-01', p: 'm', stage: 'limit', era: 1, label: 'Combinatorial explosion, named',
  text: 'Lighthill criticized combinatorial explosion: methods that work on toy problems can grow impractically on larger ones. It is one constraint in a broader first-winter history, not a single sufficient cause.',
  status: 'primary', src: 'lighthill' },

{ d: '1973-04-01', p: 'y', stage: 'naming', era: 1, label: 'The Lighthill report',
  text: '“In no part of the field have the discoveries made so far produced the major impact that was then promised.” Written July 1972 for the UK Science Research Council; published 1973.',
  status: 'primary', src: 'lighthill' },

{ d: '1974-01-01', p: 'y', stage: 'withdrawal', era: 1, label: 'UK support ends at most universities',
  text: 'Jim Howe, from inside the Edinburgh department: the report “provoked a massive loss of confidence in AI by the academic establishment in the UK (and to a lesser extent in the US). It persisted for a decade — the so-called ‘AI Winter’.”',
  status: 'primary', src: 'howe' },

/* ---- the thaw and the second build-up ---- */
{ d: '1980-01-01', p: 'y', stage: 'result', era: 2, label: 'R1/XCON goes into production',
  text: 'A rule-based expert system starts configuring VAX orders at Digital Equipment Corporation. Expert systems work — narrowly, expensively, and only where a human expert has written the rules down. Its production use is evidence that the history cannot be reduced to research funding alone.',
  status: 'primary', src: 'r1' },

{ d: '1982-04-01', p: 'y', stage: 'money', era: 2, label: 'Japan’s Fifth Generation project',
  text: 'MITI launches a ten-year national programme and creates ICOT to run it, aiming at massively parallel machines built on logic programming. Budget: under ¥57 billion, about US$320 million.',
  money: { amount: 57, unit: '¥bn', note: 'under ¥57bn over ten years (≈US$320m)' },
  status: 'reported', src: 'fgcs-wiki' },

{ d: '1983-01-01', p: 'y', stage: 'money', era: 2, label: 'DARPA’s Strategic Computing Initiative',
  text: 'A later historical study describes roughly $1 billion spent across the 1983–93 Strategic Computing programme, aimed at machines that would “see, hear, speak, and think like a human”. This is a programme total, not a single 1983 cash commitment.',
  money: { amount: 1000, unit: '$m', note: '≈$1bn programme expenditure over 1983–93; not a 1983 commitment' },
  status: 'reported', src: 'sci-wiki' },

{ d: '1983-06-01', p: 'y', stage: 'money', era: 2, label: 'The UK’s Alvey Programme',
  text: 'Britain’s answer to the Fifth Generation: £350 million over five years — £200m from government and £150m from industry — across VLSI, software engineering, knowledge-based systems and human–computer interaction.',
  money: { amount: 350, unit: '£m', note: '£350m over five years (£200m government + £150m industry)' },
  status: 'primary', src: 'alvey' },

{ d: '1984-08-01', p: 'y', stage: 'naming', era: 2, label: 'The phrase “AI winter” is coined',
  text: 'Schank and Minsky, in a public debate at the AAAI annual meeting, warn that enthusiasm has spiralled out of control and describe the chain reaction that will follow. They are right, three years early.',
  status: 'reported', src: 'aiwinter-wiki' },

{ d: '1986-01-01', p: 'y', stage: 'limit', era: 2, label: 'The limit: rules do not scale',
  text: 'Expert systems only know what somebody typed in. They are brittle at the edges of their rule base, expensive to keep current, and they do not learn. Meanwhile general-purpose workstations are getting fast enough to run the same software without special hardware.',
  status: 'reported', src: 'aiwinter-wiki' },

{ d: '1987-01-01', p: 'y', stage: 'naming', era: 2, label: 'The market names it instead of a report',
  text: 'There is no Lighthill for the second winter. The naming is done by the collapse of the specialised LISP hardware business — an industry that Crevier’s history describes as worth half a billion dollars being replaced within a single year.',
  status: 'reported', src: 'aiwinter-wiki' },

{ d: '1987-06-01', p: 'y', stage: 'withdrawal', era: 2, label: 'DARPA cuts AI',
  text: 'Jack Schwarz takes over DARPA’s Information Processing Techniques Office and, in Pamela McCorduck’s account, cuts AI funding “deeply and brutally” — he did not believe it was the next wave.',
  status: 'reported', src: 'sci-wiki' },

{ d: '1992-06-01', p: 'y', stage: 'withdrawal', era: 2, label: 'The Fifth Generation project runs out',
  text: 'The ten-year plan reaches its end with no commercial success; its parallel logic machines are overtaken by ordinary Sun and Intel hardware. Accounts differ on the exact finish — the ten-year programme ends in 1992 and the same source elsewhere runs it to 1994 — so read this dot as “about here”. The concurrent logic programming work outlives the programme; the programme does not.',
  status: 'reported', src: 'fgcs-wiki' },

/* ---- what happened afterwards ---- */
{ d: '1997-05-01', p: 'm', stage: 'result', era: 3, label: 'Deep Blue beats Kasparov',
  text: 'Deep Blue wins the New York rematch 3½–2½, forty years after Simon and Newell’s forecast and thirty years past its stated deadline.',
  status: 'primary', src: 'deepblue' },

{ d: '2012-10-01', p: 'y', stage: 'result', era: 3, label: 'AlexNet wins ImageNet',
  text: 'A deep convolutional network takes the ILSVRC-2012 classification task with a 15.3% top-5 error rate. The best entry from any other team is 26.2%. This later result does not settle the contested account of how Perceptrons affected earlier research choices.',
  status: 'primary', src: 'ilsvrc2012' },

{ d: '2016-03-01', p: 'm', stage: 'result', era: 3, label: 'AlphaGo beats Lee Sedol',
  text: 'Four games to one, in Seoul, five months after beating Fan Hui 5–0.',
  status: 'primary', src: 'alphago' },

{ d: '2017-06-12', p: 'd', stage: 'result', era: 3, label: 'Attention Is All You Need',
  text: 'The transformer paper introduced an influential architecture that underlies many contemporary large language models.',
  status: 'primary', src: 'attention' },

{ d: '2020-01-23', p: 'd', stage: 'result', era: 3, label: 'Scaling laws',
  text: 'Kaplan and colleagues report that language-model loss falls as a power law with model size, data, and compute, “with some trends spanning more than seven orders of magnitude”. Within the studied ranges, this is measured predictive evidence about loss; it is not a general-capability law or a guarantee beyond those ranges.',
  status: 'primary', src: 'kaplan' },

{ d: '2020-05-28', p: 'd', stage: 'result', era: 3, label: 'GPT-3',
  text: '175 billion parameters, and few-shot behaviour nobody put in by hand.',
  status: 'primary', src: 'gpt3' },

{ d: '2022-11-30', p: 'd', stage: 'result', era: 3, label: 'ChatGPT',
  text: 'Released as a research preview. This is where the room’s own experience of AI starts.',
  status: 'reported', src: 'chatgpt-tc' },

{ d: '2026-02-01', p: 'm', stage: 'limit', era: 3, label: 'A benchmark stops measuring',
  text: 'OpenAI says it will stop reporting SWE-bench Verified because frontier models had been exposed to the benchmark during training. Its audit examined 138 selected hard tasks (27.6% of the 500-task benchmark); 59.4% of that audited subset had faulty tests. This is an evaluation warning, not evidence that the field or a whole benchmark has been retired.',
  status: 'primary', src: 'swebench' },

{ d: '2026-02-27', p: 'd', stage: 'money', era: 3, label: '900 million users, $110 billion raised',
  text: 'OpenAI reports 900 million weekly active users and more than 50 million consumer subscribers, alongside a $110 billion private round at a $730 billion pre-money valuation. These are company-reported, dated usage and funding figures, not a measure of profitability or a prediction of returns.',
  money: { amount: 110000, unit: '$m', note: '$110bn private round at a $730bn pre-money valuation' },
  status: 'reported', src: 'openai-900m' }

];

/* Winter bands. Deliberately carrying their own uncertainty. */
const WINTERS = [
  { id: 'w1', from: '1974-01-01', to: '1980-06-30', soft: 1.5,
    label: 'First winter', range: 'roughly 1974 – 1980',
    note: 'Conventional dates. The withdrawal that started it (machine translation, 1966) predates the band by eight years, and nobody agrees on a month.' },
  { id: 'w2', from: '1987-01-01', to: '1993-12-31', soft: 3.5,
    label: 'Second winter', range: 'roughly 1987 – 1993',
    note: 'The start is firm — the hardware market went in 1987. The end is not: this demo draws 1993, and Wikipedia’s account runs it to 2000. The right-hand edge is drawn soft because the disagreement is real.' }
];

/* --------------------------------------------------------------------------
   ACT III — compare conditions.

   These rows are lenses for comparing the two historical contractions with
   the present. They are not a five-step causal law and the present column is
   deliberately incomplete: absence of a withdrawal is evidence only that it
   has not happened, not a prediction that it must.
   -------------------------------------------------------------------------- */

const ANATOMY = [
  { stage: 'promise',
    w1: { head: 'Human-level work in twenty years',
          body: 'Simon in 1960, Minsky in 1967, and a Navy press conference in 1958 promising a machine conscious of its own existence.',
          src: ['qi-simon', 'qi-minsky', 'cornell-perceptron'] },
    w2: { head: 'A fifth generation of computers',
          body: 'Japan announces machines built on logic programming that will reason at supercomputer speed. Britain and the US answer within a year.',
          src: ['fgcs-wiki'] },
    now: { head: '“Could come as early as 2026”',
          body: 'The hedges are real and are often dropped in retelling. This card preserves the stated uncertainty and does not infer a forecasting record beyond the source itself.',
          src: ['mlg'] } },

  { stage: 'money',
    w1: { head: 'US federal funding, largely uncounted',
          body: 'No sourceable total exists for 1950s–60s US AI spending, so this demo does not invent one. What is sourceable is what happened when it stopped.',
          src: [] },
    w2: { head: 'Three programme examples, different bases',
          body: 'Alvey and Japan’s Fifth Generation had stated programme budgets; the roughly $1bn Strategic Computing figure describes expenditure across 1983–93. Their currencies, price years, and accounting bases differ, so the display does not combine them.',
          src: ['alvey', 'sci-wiki', 'fgcs-wiki'] },
    now: { head: '$110bn in a single round',
          body: 'OpenAI’s February 2026 announced investment, at a $730bn pre-money valuation, is a private funding round. It is not directly comparable with historical programme totals without a shared currency, price year, and accounting basis.',
          src: ['openai-900m'] } },

  { stage: 'limit',
    w1: { head: 'Combinatorial explosion',
          body: 'Lighthill criticized search methods whose demands could grow rapidly outside toy problems. It was an important identified constraint among several first-winter pressures, not a settled single explanation.',
          src: ['lighthill'] },
    w2: { head: 'Rules do not scale',
          body: 'Expert systems knew only what was typed into them, broke at the edge of their rule base, cost a fortune to maintain, and did not learn.',
          src: ['aiwinter-wiki'] },
    now: { head: 'No single binding constraint established here',
          pending: 'open question',
          body: 'No single binding limit is established. In prior contractions, constraints became clearer in hindsight; that observation does not tell us that the present has one comparable limit. Evaluation quality is one live question, not a diagnosis of the field.',
          src: [] } },

  { stage: 'naming',
    w1: { head: 'Two reports, seven years apart',
          body: 'ALPAC in 1966 for machine translation; Lighthill in 1973 for the field. Both were commissioned by the funders, and both were read as more final than they were.',
          src: ['alpac', 'lighthill'] },
    w2: { head: 'The market, not a report',
          body: 'There is no Lighthill for the second winter. Schank and Minsky called it in 1984; the LISP hardware business made it official in 1987.',
          src: ['aiwinter-wiki'] },
    now: { head: 'An evaluation warning, not a field verdict',
          body: 'In February 2026 OpenAI said it would stop reporting SWE-bench Verified after contamination concerns and an audit of selected hard tasks found faulty tests in 59.4% of that subset. This identifies a measurement problem; it does not name a general AI limit or predict a withdrawal.',
          src: ['swebench'] } },

  { stage: 'withdrawal',
    w1: { head: 'MT funding 1966; UK universities 1974',
          body: 'Support ended at most British universities. The loss of confidence, in Jim Howe’s account, persisted for a decade.',
          src: ['howe'] },
    w2: { head: 'DARPA 1987; Fifth Generation 1992',
          body: 'Schwarz cut AI at DARPA “deeply and brutally”. Japan’s programme ran its full ten years and ended without a commercial product.',
          src: ['sci-wiki', 'fgcs-wiki'] },
    now: { head: 'No comparable broad contraction established',
          pending: 'snapshot, not forecast',
          body: 'Money is still going in and reported usage is high. This snapshot does not establish a comparable broad contraction: a financial correction, a research-funding shift, and a technological dead end are separate propositions that need separate evidence.',
          src: ['openai-900m'] } }
];

/* --------------------------------------------------------------------------
   ACT IV — rhymes and differences. Two honest columns.
   -------------------------------------------------------------------------- */

const RHYMES = [
  { head: 'Benchmark claims are outrunning evaluation',
    body: 'In February 2026 OpenAI said it would stop reporting SWE-bench Verified because frontier models had been exposed to the benchmark during training. Its audit covered 138 selected hard tasks, 27.6% of the benchmark; 59.4% of that audited subset had faulty tests. This is a concrete warning about one evaluation, useful when judging capability claims. It does not establish a field-wide limit or a coming winter.',
    src: 'swebench' },
  { head: 'Very large money committed against a promise',
    body: '$110 billion in one announced private round at a $730 billion pre-money valuation, February 2026. Historical programmes had different currencies, price years, and accounting bases; the roughly $1bn Strategic Computing figure spans 1983–93 rather than a single 1983 commitment. These are institutional bets made under uncertainty, not directly combinable figures.',
    src: 'openai-900m' },
  { head: 'Confident dates from people with real standing',
    body: 'Simon had a Nobel Prize coming and Minsky had founded the MIT AI Lab. Standing has never been much protection: their public timelines missed by decades. The current timelines come from people who have actually shipped, which is a real difference — and it was also true of Simon, who had shipped the Logic Theorist.',
    src: 'qi-simon' },
  { head: 'The limit is invisible from inside',
    body: 'Combinatorial explosion and rule-base maintenance became more visible over time. Hindsight can sharpen a past account, but it does not license a claim that the present must contain an analogous hidden limit. Treat precise present-day diagnoses as hypotheses with evidence burdens.',
    src: 'lighthill' }
];

const DIFFERENT = [
  { head: 'Hundreds of millions of people actually use it',
    body: 'OpenAI reported 900 million weekly active users and more than 50 million consumer subscribers in February 2026 for one product. Earlier AI eras also had deployed systems and paying organisations, including XCON at Digital, so this is a difference of scale, consumer reach, and business model — not the false claim that earlier booms had no users.',
    src: 'openai-900m' },
  { head: 'The scaling behaviour is measured, not asserted',
    body: 'Kaplan and colleagues reported in 2020 that language-model loss followed power laws with model size, data, and compute, with some trends spanning more than seven orders of magnitude. This is measured predictive evidence within the study’s ranges. It does not establish general capability, permanent scaling, or a direct comparison with every earlier AI programme.',
    src: 'kaplan' },
  { head: 'The systems are general, not hand-built',
    body: 'The 1980s bet on rule bases a human expert had to write out by hand, creating maintenance and transfer limits. Current systems are trained rather than authored rule by rule. That architectural difference is material, while its practical value still depends on the task, evaluation, and deployment setting.',
    src: 'attention' },
  { head: 'The idea that was buried came back and won',
    body: 'Neural networks lost influence after 1969 and returned powerfully in 2012, when AlexNet won ImageNet with 15.3% top-5 error against 26.2% for the best other entry. The comparison cautions against treating a field’s temporary research priorities as a permanent verdict.',
    src: 'ilsvrc2012' }
];

const CLOSER = {
  head: 'What to do with this',
  body: [
    'Historical comparison is not a prediction. Use these lenses to ask whether a claim is a forecast or an assessment, what evidence it rests on, and what evidence would move it.',
    'This curated deck shows several near-term forecasts that missed their windows. It does not establish a representative error rate for optimists, pessimists, or AI research. The four dated assessments or untimed ambitions are here precisely because they need a different standard of judgment.',
    'Schank and Minsky’s 1984 warning is a useful historical case, not a forecasting rule. A credible present claim should state its mechanism, boundary conditions, and what would count against it.'
  ]
};

/* --------------------------------------------------------------------------
   Researched and deliberately excluded. Shown in the app.
   -------------------------------------------------------------------------- */

const CUT = [
  { claim: 'A dollar figure for XCON’s annual savings at Digital',
    why: 'The commonly repeated figures are $25 million and $40 million a year and the sources disagree. Digital’s own account is in Communications of the ACM in 1989, behind a paywall this build could not read. The system’s existence and production use are shown; the number is not.' },
  { claim: 'ALPAC as a verdict that machine translation would never work',
    why: 'The original report distinguishes near-term translation economics from longer-term computational-linguistics research, and recommends continued support. Treating it as a permanent prediction would misstate the document.' },
  { claim: '“Half a billion dollars of AI hardware industry vanished in a year”, as a figure',
    why: 'It traces to Daniel Crevier’s 1993 history through tertiary sources and no primary was found. It is shown once, attributed to Crevier by name, and never used as a number on a chart.' },
  { claim: 'Hubert Dreyfus predicting no computer could beat a child at chess, then losing to Mac Hack VI in 1967',
    why: 'A famous story and probably true, but the 1965 wording could not be retrieved and the chess-match detail traces to one book through tertiary sources. It would have been the neatest card in the deck, which is a reason to be more suspicious of it, not less.' },
  { claim: 'Minsky’s “three to eight years” prediction from Life magazine, 1970',
    why: 'The article contains errors and Minsky denied at least one quotation attributed to him in it. His 1967 textbook says something equally strong and he wrote it himself, so that is used instead.' },
  { claim: 'A continuous series of AI funding from 1950 to 2026',
    why: 'It does not exist in any sourceable form, particularly for US spending before 1980. Four discrete funding examples are shown instead, with different bases: programme budgets, programme expenditure, and a private funding round. Their three currencies and different price years cannot be combined into one series.' },
  { claim: 'A dollar figure for DARPA’s Speech Understanding Research programme',
    why: 'The programme ran 1971–1976 and did not meet its goals, which is well attested; the funding number repeated alongside it was not verifiable, so the event is left off the timeline entirely rather than shown with a soft number.' }
];

/* --------------------------------------------------------------------------
   Sources. Every `src` in this file resolves here; the self-test enforces it
   in both directions.
   -------------------------------------------------------------------------- */

const SOURCES = {
  'turing1950':         { t: 'Turing — Computing Machinery and Intelligence, Mind LIX(236):433–460 (1950)', u: 'https://doi.org/10.1093/mind/LIX.236.433' },
  'dartmouth':          { t: 'McCarthy, Minsky, Rochester & Shannon — A Proposal for the Dartmouth Summer Research Project on Artificial Intelligence (31 August 1955)', u: 'http://www-formal.stanford.edu/jmc/history/dartmouth/dartmouth.html' },
  'simon-newell-1958':  { t: 'Simon & Newell — Heuristic Problem Solving: The Next Advance in Operations Research, Operations Research 6(1):1–10', u: 'https://pubsonline.informs.org/doi/10.1287/opre.6.1.1' },
  'cornell-perceptron': { t: 'Cornell Chronicle — Professor’s perceptron paved the way for AI, 60 years too soon (quoting the New York Times, 8 July 1958)', u: 'https://news.cornell.edu/stories/2019/09/professors-perceptron-paved-way-ai-60-years-too-soon' },
  'qi-simon':           { t: 'Quote Investigator — “Machines will be capable, within twenty years, of doing any work that a man can do” (verified against scans; The New Science of Management Decision, 1960, p. 38)', u: 'https://quoteinvestigator.com/2020/11/11/ai-can-do/' },
  'qi-minsky':          { t: 'Quote Investigator — “Within a generation … the problems of creating artificial intelligence will be substantially solved” (verified against scans; Computation: Finite and Infinite Machines, 1967, p. 2)', u: 'https://quoteinvestigator.com/2021/03/04/ai-solved/' },
  'alpac':              { t: 'ALPAC — Language and Machines: Computers in Translation and Linguistics (1966), original report PDF', u: 'https://www.mt-archive.net/50/ALPAC-1966.pdf' },
  'perceptrons-wiki':   { t: 'Perceptrons (Minsky & Papert, MIT Press 1969; expanded edition 1988) — including the dispute over its effect on the field', u: 'https://en.wikipedia.org/wiki/Perceptrons_(book)' },
  'lighthill':          { t: 'Lighthill — Artificial Intelligence: A General Survey (July 1972, published 1973), report and responses', u: 'https://rodsmith.nz/wp-content/uploads/Lighthill_1973_Report.pdf' },
  'howe':               { t: 'Jim Howe — Artificial Intelligence at Edinburgh University: a Perspective', u: 'https://www.inf.ed.ac.uk/about/AIhistory.html' },
  'r1':                 { t: 'McDermott — R1: An Expert in the Computer Systems Domain, AAAI-80', u: 'https://cdn.aaai.org/AAAI/1980/AAAI80-076.pdf' },
  'fgcs-wiki':          { t: 'Fifth Generation Computer Systems — budget figure sourced to Odagiri, Nakamura & Shibuya, Research Policy 26(2):191–207 (1997)', u: 'https://en.wikipedia.org/wiki/Fifth_Generation_Computer_Systems' },
  'sci-wiki':           { t: 'DARPA Strategic Computing Initiative — the 1987 cuts sourced to McCorduck, Machines Who Think (2004), pp. 430–431', u: 'https://en.wikipedia.org/wiki/Strategic_Computing_Initiative' },
  'alvey':              { t: 'Chilton Computing archive — The Alvey Programme (£350m: £200m government, £150m industry)', u: 'http://www.chilton-computing.org.uk/inf/alvey/p007.htm' },
  'aiwinter-wiki':      { t: 'AI winter — the 1984 AAAI debate and the 1987 hardware collapse, sourced to Crevier, AI: The Tumultuous Search for Artificial Intelligence (1993)', u: 'https://en.wikipedia.org/wiki/AI_winter' },
  'deepblue':           { t: 'IBM — Deep Blue', u: 'https://www.ibm.com/history/deep-blue' },
  'ilsvrc2012':         { t: 'ImageNet — ILSVRC-2012 official results table', u: 'https://www.image-net.org/challenges/LSVRC/2012/results.html' },
  'alphago':            { t: 'Google DeepMind — AlphaGo', u: 'https://deepmind.google/research/alphago/' },
  'attention':          { t: 'Vaswani et al. — Attention Is All You Need (arXiv:1706.03762)', u: 'https://arxiv.org/abs/1706.03762' },
  'kaplan':             { t: 'Kaplan et al. — Scaling Laws for Neural Language Models (arXiv:2001.08361)', u: 'https://arxiv.org/abs/2001.08361' },
  'gpt3':               { t: 'Brown et al. — Language Models are Few-Shot Learners (arXiv:2005.14165)', u: 'https://arxiv.org/abs/2005.14165' },
  'chatgpt-tc':         { t: 'TechCrunch — ChatGPT launched three years ago today (30 November 2025)', u: 'https://techcrunch.com/2025/11/30/chatgpt-launched-three-years-ago-today/' },
  'swebench':           { t: 'OpenAI — Why SWE-bench Verified no longer measures frontier coding capabilities (February 2026)', u: 'https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/' },
  'openai-900m':        { t: 'OpenAI — Scaling AI for everyone (27 February 2026)', u: 'https://openai.com/index/scaling-ai-for-everyone/' },
  'mlg':                { t: 'Dario Amodei — Machines of Loving Grace (October 2024)', u: 'https://www.darioamodei.com/essay/machines-of-loving-grace' }
};

/* A note the app shows next to the source list, because two of these need it. */
const SOURCE_NOTE = 'OpenAI’s pages are primary company statements. Their reported user and funding figures are labelled as such in the copy; they are not independent measures of profitability or capability. Where a claim rests on a printed history rather than a document — Crevier 1993, McCorduck 2004 — the historian is named on the claim itself and the claim is marked “reported” rather than “primary”.';

return { INTRO, CARDS, STAGES, EVENTS, WINTERS, ANATOMY, RHYMES, DIFFERENT, CLOSER, CUT, SOURCES, SOURCE_NOTE };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DATA;

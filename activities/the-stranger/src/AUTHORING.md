# "The Stranger" — response authoring spec

You are authoring the preloaded response content for an offline classroom demo that
teaches *why prompts work*. Everything the fake "AI" says is written by hand, at build
time, by you. **The quality of this writing is the entire product.** Nobody will be
impressed by the app chrome; they will be impressed — or not — by whether the eight
responses feel like eight real answers from a real assistant.

## The three levers

A student's bare question is the BASE PROMPT. Three optional text blocks can be
appended to it:

- **LEVER 1 — CONTEXT** (`C`): who I am, what class/situation, what I'm working with.
- **LEVER 2 — SUCCESS SPEC** (`S`): exactly what "done" looks like — format, length,
  audience, what to include.
- **LEVER 3 — EXPERT KEYWORDS** (`K`): domain vocabulary that signals which register
  to answer in.

The **assembled prompt** is always: base prompt, then whichever lever blocks are ON,
in the order C, S, K, each as its own paragraph. Nothing else. Your scenario file
gives you the exact text of all three blocks — do not invent or reword them.

State keys are three bits in the order `C S K`:

| key | C | S | K |
|-----|---|---|---|
| `000` | off | off | off |
| `100` | ON  | off | off |
| `010` | off | ON  | off |
| `001` | off | off | ON  |
| `110` | ON  | ON  | off |
| `101` | ON  | off | ON  |
| `011` | off | ON  | ON  |
| `111` | ON  | ON  | ON  |

## The single hardest rule: NO STRAWMEN

The all-levers-off response must be **competent but aimed at nobody.** A real
assistant given a bare prompt does not produce garbage — it produces something
defensible, hedged, and general, covering every case because it can't tell which one
you are. It is often *long*. It is frequently *helpful in the abstract*. It ends by
asking what you actually need.

If a teacher read your `000` response cold, they should think *"…that's not bad,
actually"* — and only on reflection realize it was written for no one. If they think
*"no assistant would ever say that,"* you have failed and the whole demo collapses,
because the punchline depends on the bad answer being honestly bad, not rigged.

Concretely, the levers-off failure mode is:

- generic ("depending on your subject…", "most tests cover…")
- exhaustive-by-hedging (lists every possibility because it can't rank them)
- audience-less (pitched somewhere between a 5th grader and a grad student)
- structurally fine but substantively unaimed
- ends with a clarifying question it should have been given the answer to

It is NOT: broken, stupid, rude, obviously robotic, or full of `[INSERT TOPIC HERE]`.

## Single-lever isolation

Flipping exactly one lever must improve the response in **exactly that dimension** and
essentially no other. This is what the whole lesson rests on.

- **`100` — Context only:** personalized and specific to this person's actual
  situation, but shapeless. Right subject matter, no useful structure, unclear
  length, still written in a general register. It knows *who* but not *what done
  looks like*.
- **`010` — Success spec only:** the format is exactly right — correct length,
  correct sections, correct audience framing — and the content poured into that
  format is generic. A beautifully organized study guide for a biology test in
  general. Empty vessel, correct shape.
- **`001` — Keywords only:** answers in expert register, uses the domain's real
  vocabulary and reasoning, and is aimed at the wrong person for the wrong purpose.
  Technically excellent, practically unusable. May go over the student's head; may
  answer a more sophisticated question than the one that matters.
- **`111` — everything:** visibly excellent. Specific to the person, in the right
  shape, in the right register. This is the "oh" moment.
- **Two-lever states** are the interesting middles. `110` (context + spec) is genuinely
  useful but written in lay register — it never reaches for the precise term.
  `101` (context + keywords) is expert and personalized but sprawling and shapeless.
  `011` (spec + keywords) is a well-formed expert answer to a stranger's question.

## No templating

Each response is written from scratch as its own answer. Natural overlap in substance
is expected and fine — two responses about mitosis will both mention chromosomes. What
is forbidden is copy-paste with one paragraph swapped, recycled opening sentences,
or the same closing line across variants. An automated check will fail the build if
two variants share more than a small fraction of identical sentences. Vary your
openings deliberately: real assistants open differently depending on what they were
asked.

## Realism

Write what a current assistant would actually produce, including:

- Natural length for the ask (an unspecified request often runs long; a "under 120
  words" spec is obeyed to the word).
- Real formatting habits: headings when the answer has parts, bullets for
  enumerations, bold for terms being defined, plain paragraphs for explanation.
  Over-formatting is itself a realistic failure mode of unaimed answers.
- Occasional first-person hedges ("I'd start with…", "Without knowing which…").
- No em-dash tics, no "Certainly!", no "I hope this helps!" every time. Vary it.
- Never mention the levers, the demo, or that you are a demo. The response is just
  a response.

Allowed markdown, and nothing else:

```
### Heading
Plain paragraph text.
- bullet
1. numbered item
**bold**  *italic*
```

No tables, no code blocks, no links, no horizontal rules, no emoji.

## Expert-term tagging (the Jargon Meter)

Every response carries a `terms` list: the domain-expert vocabulary it contains. The
app highlights these in the text and counts them as the response streams. The
punchline of the demo is that keyword-on responses are full of expert terms **the
student never typed.**

Rules for `terms`:

1. Every string in `terms` must appear **verbatim (case-insensitive) in the response
   text**, exactly as written in the list. The app marks the *first* occurrence of
   each. If a term is not found the build fails.
2. Tag genuine domain vocabulary — the words a practitioner uses and a novice
   doesn't. Tag `hypertonic`, `load path`, `warrant`, `BLUF`. Do not tag ordinary
   words like `study`, `email`, `bridge`, `essay`.
3. Prefer the multi-word form when it exists (`bending moment`, not `moment`).
   Do not list a term that is a substring of another term you are also listing.
4. **Keyword-ON responses (`001`, `011`, `101`, `111`) must tag 14–20 terms, and at
   least 12 of them must be terms that appear NOWHERE in that state's assembled
   prompt.** Check this yourself before you finish — it is the demo's punchline and
   it is verified automatically.
5. **Keyword-OFF responses must tag 0–4 terms.** Not because they're dumbed down, but
   because an unaimed answer reaches for plain words. A couple of unavoidable domain
   words (`mitosis` in a mitosis answer) are fine. If a keyword-off response is
   creeping past four expert terms, you are writing it in the wrong register.

## The target deck (lever-2-off only)

When the success spec is OFF, the "AI" silently picks a target for itself — because
somebody has to decide what "good" means, and if the student doesn't, the model does.
The app draws a card showing the target it picked, then streams a response written to
that target.

So for every lever-2-off state you write **three** responses, one per card in your
scenario's deck. The card is a hard constraint on shape, not on subject: a
`Length: exhaustive` answer really is exhaustive, a `Format: dense paragraphs` answer
really has no bullets or headings anywhere, a `Length: short and safe` answer really
is short. The card constrains form; the levers that ARE on still control content.

Critically: **the card is not the student's fault and not stupid.** Each card is a
defensible editorial choice. It's just not *their* choice.

## Output format

Write exactly one JSON file to the path you are given. Schema:

```json
{
  "scenario": "<scenario id>",
  "part": "<on|off>",
  "responses": {
    "<state key>": {
      "md": "response text in the allowed markdown subset",
      "terms": ["expert term", "..."],
      "note": "one sentence: what this variant has that the weaker ones don't, phrased in terms of the lever(s) responsible"
    }
  }
}
```

For lever-2-off states the key is `"<state key>|<card id>"`, e.g. `"100|exhaustive"`.

Before you finish: run `python3 -c "import json,sys;d=json.load(open(PATH));print(len(d['responses']))"`
and confirm it parses and the count is right. Then grep-check that each term really
appears in its response text. Do not return the content in your message — write the
file and report a one-line summary plus any rule you had to bend.

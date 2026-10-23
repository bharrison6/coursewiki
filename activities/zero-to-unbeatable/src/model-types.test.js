/* The Model types taxonomy: shape, provenance and links.
   Run: node --test src/model-types.test.js

   What this can and cannot check, stated rather than implied. It CANNOT check
   that the counts are Hugging Face's current numbers — that would be a runtime
   network call, which this repo forbids, and the page is explicit that the
   figures are a dated snapshot. What it CAN check is that nothing in the file
   drifts away from its own source: every featured card resolves to a task in
   the catalogue, every outbound link is built from a catalogue slug rather than
   typed by hand, and the fetch date the page shows is the one the data carries.
   The slug-built-not-typed check is the useful one: a hand-typed link that is
   one hyphen wrong lands on an empty list, which is what the file's recorded
   `image-to-mesh` probe demonstrated. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('./model-types.js');

test('the catalogue has every group and task the fetch recorded', () => {
  assert.deepEqual(T.GROUPS.map(g => g.name), [
    'Multimodal', 'Natural Language Processing', 'Computer Vision',
    'Audio', 'Tabular', 'Reinforcement Learning'
  ]);
  assert.equal(T.count, 47);
  assert.equal(T.GROUPS.reduce((a, g) => a + g.tasks.length, 0), T.count);
  for (const g of T.GROUPS) {
    for (const t of g.tasks) {
      assert.match(t.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, t.slug);
      assert.ok(t.name && t.name.length > 2, t.slug);
      assert.ok(Number.isInteger(t.n) && t.n > 0, `${t.slug} count ${t.n}`);
    }
  }
});

test('no slug appears twice, so no link is ambiguous', () => {
  const slugs = T.GROUPS.flatMap(g => g.tasks.map(t => t.slug));
  assert.equal(new Set(slugs).size, slugs.length);
});

test('every featured card resolves to a catalogue task and carries its evidence', () => {
  assert.ok(T.FEATURED.length >= 10);
  for (const f of T.FEATURED) {
    const t = T.bySlug.get(f.slug);
    assert.ok(t, `featured slug not in the catalogue: ${f.slug}`);
    assert.equal(f.name, t.name);
    assert.equal(f.n, t.n);
    assert.equal(f.group, t.group);
    /* The learner sees an in/out sentence and a verbatim definition. A card
       with no quote would be this demo asserting a definition of its own. */
    assert.ok(f.in && f.out, f.slug);
    assert.ok(f.quote && f.quote.length > 30, `${f.slug} has no source definition`);
  }
});

test('the operator-named types are all present under the catalogue\'s own names', () => {
  /* The directive named: image model, text to speech, speech to text,
     image to mesh. "Image-to-mesh" is not a Hugging Face task name (the file
     records the probe: that slug returns zero models), so the job is carried
     under Image-to-3D, whose page names meshes among its outputs. */
  for (const slug of ['text-to-image', 'text-to-speech', 'automatic-speech-recognition',
    'image-to-3d', 'text-to-video', 'image-to-text', 'text-generation']) {
    assert.ok(T.FEATURED.some(f => f.slug === slug), `not featured: ${slug}`);
  }
  const mesh = T.FEATURED.find(f => f.slug === 'image-to-3d');
  assert.match(mesh.also, /mesh/i);
  assert.match(mesh.out, /mesh/i);
  assert.ok(!T.bySlug.has('image-to-mesh'), 'image-to-mesh is not a catalogue task');
});

test('every outbound link is BUILT from a catalogue slug, not typed', () => {
  for (const g of T.GROUPS) {
    for (const t of g.tasks) {
      assert.equal(T.modelsUrl(t.slug), 'https://huggingface.co/models?pipeline_tag=' + t.slug);
    }
  }
  for (const f of T.FEATURED) {
    assert.equal(f.models, T.modelsUrl(f.slug));
    assert.equal(f.page, T.taskUrl(f.slug));
    assert.ok(f.models.startsWith('https://huggingface.co/models?pipeline_tag='));
  }
});

test('Beyond one catalogue: every card is sourced to the model\'s own page, dated, and not Hugging Face', () => {
  /* Operator, 2026-09-16: model types must not be only Hugging Face. So the
     second group is checked for exactly that: no card may point at the Hub,
     and each carries its own URL, fetch date and quoted line. */
  assert.ok(T.BEYOND.length >= 6 && T.BEYOND.length <= 8, `card count ${T.BEYOND.length}`);
  for (const b of T.BEYOND) {
    assert.ok(b.type && b.example && b.org, JSON.stringify(b));
    assert.match(b.url, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//, `${b.example} url`);
    assert.ok(!/huggingface\.co|hf\.co/i.test(b.url), `${b.example} links to Hugging Face`);
    assert.match(b.fetched, /^\d{4}-\d{2}-\d{2}$/, `${b.example} fetch date`);
    assert.ok(b.in && b.out, `${b.example} in/out`);
    assert.ok(b.quote && b.quote.length > 30, `${b.example} has no quoted line`);
  }
  assert.equal(new Set(T.BEYOND.map(b => b.type)).size, T.BEYOND.length, 'one card per type');
  /* The operator-named examples are present. */
  for (const name of ['AlphaFold', 'NVIDIA Broadcast']) {
    assert.ok(T.BEYOND.some(b => b.example === name), `missing ${name}`);
  }
  /* Positive control for the not-Hugging-Face probe: the same regex must fire
     on a Hub URL, or its silence above proves nothing. */
  assert.ok(/huggingface\.co|hf\.co/i.test(T.modelsUrl('text-generation')));
  /* And the page must carry each own-page URL (app.js builds the card links
     from this module; the Details drawer lists them as literal hrefs). */
  const built = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const b of T.BEYOND) assert.ok(built.includes(`href="${b.url}"`), `Sources list lacks ${b.url}`);
});

test('the provenance is recorded and dated', () => {
  assert.match(T.FETCHED, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(T.SOURCES.tasks, 'https://huggingface.co/tasks');
  assert.equal(T.SOURCES.models, 'https://huggingface.co/models');
  assert.ok(T.SOURCES.hubTotal > 1e6);
  /* Every count must be at or below the hub total it was read beside. */
  for (const g of T.GROUPS) for (const t of g.tasks) assert.ok(t.n < T.SOURCES.hubTotal, t.slug);
});

test('the page shows the fetch date the data carries, and the demo fetches nothing', () => {
  const dir = path.join(__dirname, '..');
  const tpl = fs.readFileSync(path.join(dir, 'src', 'template.html'), 'utf8');
  /* The template's static copy of the date (in the kicker and the Details
     drawer) must be the data's date; app.js rewrites the kicker at runtime,
     but a stale date in the drawer's Sources section would go unnoticed. */
  assert.ok(tpl.includes(T.FETCHED), `template does not mention ${T.FETCHED}`);
  assert.match(tpl, /class="k-sourced">Sourced<\/span><span class="k-qual"/,
    'the Model types kicker must be Sourced with a dated qualifier');
  /* Self-containment: the links are <a href>, which the build's scan does not
     restrict; no resource-loading tag may point at huggingface.co. */
  const built = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const loaders = built.match(/<(?:script|link|img|iframe|source|video|audio|embed|object)\b[^>]*huggingface[^>]*>/gi) || [];
  assert.deepEqual(loaders, [], 'a resource tag points at huggingface.co');
  /* Positive control for that scan: the same regex must find a planted tag,
     otherwise its silence proves nothing. */
  const bait = built.replace('</head>', '<img src="https://huggingface.co/x.png"></head>');
  assert.equal((bait.match(/<(?:script|link|img|iframe|source|video|audio|embed|object)\b[^>]*huggingface[^>]*>/gi) || []).length, 1);
  /* And the built page must carry what the links are built from. The per-type
     hrefs are assembled at runtime by app.js from this module, so the literal
     URL is not in the file; the base and the slug are, and the Details
     drawer's Sources list carries real literal hrefs. */
  assert.ok(built.includes("'https://huggingface.co/models'"), 'the link base is missing');
  assert.ok(built.includes("'text-to-speech'"), 'the text-to-speech slug is missing');
  assert.ok(built.includes('href="https://huggingface.co/tasks"'), 'the Sources citation is missing');
  assert.ok(built.includes('href="https://huggingface.co/docs/transformers/index"'),
    'the one-architecture-family citation is missing');
});

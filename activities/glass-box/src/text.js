// Act 1 — the text world: corpus, vocabulary, model config, training schedule,
// and the era ladder. No DOM in this file.
'use strict';

const TEXT = (() => {

  // Original tiny stories written with a deliberately small vocabulary, so a
  // ~43k-parameter character-level model can show the whole arc — gibberish,
  // then word-shapes, then words, then sentences — in about a minute of
  // training on a phone. All original text, written for this demo.
  const CORPUS = `the little robot woke up in the lab. it looked at the sun through the window. the robot wanted to see the garden. it rolled to the door and pushed. the door was heavy. the robot pushed again and the door opened. the garden was full of red and yellow flowers. the robot was happy. a small bird sat on the wall of the garden. the bird saw the robot and sang a little song. the robot stopped to listen. the song was soft and slow. the robot tried to sing too. its voice was full of beeps. the bird liked the beeps. they sang together in the sun. the cat of the house did not like the rain. when the rain fell on the garden the cat ran under the table. the robot saw the cat and opened its big red umbrella. the cat sat under the umbrella with the robot. they watched the rain fall on the flowers. the rain made the garden smell sweet. one morning the robot found a seed on the path. it made a little hole in the ground and put the seed in. every day the robot gave the seed some water. the sun warmed the ground. one day a small green leaf came up. the robot beeped with joy. the leaf grew into a tall yellow flower. the girl who lived in the house liked to read in the garden. she read stories about ships and stars and far away lands. the robot sat by her side and listened. the best story was about a ship that sailed to the moon. the robot looked up at the sky and wondered if a ship could really sail so far. at night the garden was quiet. the moon rose over the wall and the stars came out one by one. the cat slept on the warm stone path. the bird slept in the tree. the robot did not sleep. it watched the stars and counted them softly. one two three four. the night was long and full of light. the girl taught the robot to paint. the robot held the brush in its little hand. the first painting was just lines and dots. the girl said it looked like rain in the sun. the robot painted the garden the bird the cat and the moon. it gave the best painting to the girl. she put it on the wall of the house. in winter the snow fell on the garden. the flowers slept under the white snow. the cat stayed by the warm fire. the robot rolled out and made lines in the snow. the bird left little marks by the lines. the girl drew a big smile in the snow. the garden smiled back at the house all winter long. when spring came the snow melted and the path shone with water. new leaves came out on the tree. the seed of every flower woke up in the warm ground. the bird built a nest on the wall. the robot helped with little sticks. soon there were three small eggs in the nest. the garden was full of song. the robot had a dream one day while it sat in the sun. it dreamed of a ship with white sails on a wide blue sea. the bird flew over the ship and the cat slept on the deck. the girl read stories to the stars. when the robot woke up it painted the dream so it would never forget. the girl found an old map in a book about the sea. the map showed a little island with a tall tree. she showed the map to the robot. they made a small ship from paper and set it on the pond. the wind pushed the white sails. the paper ship sailed across the pond to the far side. the girl and the robot cheered. the bird liked to take shiny things to the nest. one day it took the little key of the garden door. the robot looked for the key all morning. the cat pointed its tail at the tree. the robot looked in the nest and found the key by the three eggs. it left a shiny stone for the bird and took the key home. the summer sun made the garden very warm. the cat found the one cool stone under the tree and slept there. the girl gave water to every flower. the robot made a little fan with paper and gave the bird some wind. the bird sang a long song about the sea. even the sun seemed to listen to the song. one evening the sky turned red and gold. the girl and the robot sat on the wall and watched. the cat climbed up to sit with them. the bird flew home to the nest. the sun went down behind the far hills. the first star came out. the girl said every day ends with a little light. the robot saved those words. the eggs opened in the spring rain. three small birds looked out of the nest. the mother bird sang and the little birds tried to sing too. their songs were small and funny. the robot beeped along with them. the cat watched from the path and did not say a word. the garden had three new songs that year. the girl grew tall as the seasons passed. she still read to the robot under the tree. the paintings on the wall told the story of every year. the bird and the little birds sang in the morning. the cat slept in the sun. the robot looked at the garden it loved and beeped softly. home it said. this is home.`;

  const chars = Array.from(new Set(CORPUS.split(''))).sort();
  const stoi = {};
  chars.forEach((c, i) => { stoi[c] = i; });

  function encode(str) {
    const out = new Int32Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const id = stoi[str[i]];
      out[i] = id === undefined ? stoi[' '] : id;
    }
    return out;
  }
  function decode(ids) {
    let s = '';
    for (let i = 0; i < ids.length; i++) s += chars[ids[i]];
    return s;
  }

  // Model configuration — chosen in the Node tuning harness for the shape of
  // the arc on a phone budget (see README): 42,842 parameters.
  const CFG = { vocab: chars.length, ctx: 40, dim: 48, heads: 4, layers: 2, mlpMult: 2, seed: 7 };
  const BATCH = 8;
  const PEAK_LR = 0.006;
  const PLANNED = 1200; // cosine horizon; training beyond this holds the floor lr

  function lrAt(step) {
    const warm = Math.min(1, (step + 1) / 40);
    const prog = Math.min(1, Math.max(0, (step - 40) / (PLANNED - 40)));
    // smoothstep anneal 1 -> 0 (cosine-shaped, but built from IEEE ops only so
    // every device computes the identical schedule — see engine.js on determinism)
    const anneal = 1 - prog * prog * (3 - 2 * prog);
    return PEAK_LR * warm * (0.2 + 0.8 * anneal);
  }

  // The era ladder. Step targets picked so each burst shows a visibly
  // different creature. Measured typical losses in the tuning harness:
  // 200 -> ~1.7, 400 -> ~1.3, 800 -> ~0.8, 1200 -> ~0.5.
  const ERAS = [
    { step: 0, name: 'Newborn', blurb: 'Random weights. It has never seen a single character.' },
    { step: 200, name: 'Babble', blurb: 'Letter habits and word-shaped noise. "the" is already forming.' },
    { step: 400, name: 'Words', blurb: 'Real words appear, spelled mostly right, in no sensible order.' },
    { step: 800, name: 'Phrases', blurb: 'Words hold hands: "the robot", "in the garden". Grammar-ish.' },
    { step: 1200, name: 'Sentences', blurb: 'Sentence-shaped text in the style of its little world.' },
  ];

  return { CORPUS, chars, stoi, encode, decode, CFG, BATCH, PEAK_LR, PLANNED, lrAt, ERAS };
})();

if (typeof module !== 'undefined') module.exports = TEXT;

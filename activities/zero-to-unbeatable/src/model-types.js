/* =====================================================================
   Model types — the by-task taxonomy behind the "Model types" tab.

   SOURCED, NOT REMEMBERED. Every entry below was read from Hugging Face on
   the date in FETCHED, from the two pages in SOURCES: the task catalogue
   (huggingface.co/tasks — the group headings, task names and per-task
   model counts are copied from it) and the task filter on the model hub
   (huggingface.co/models?pipeline_tag=<slug> — the slug of every link, and
   the count each link resolves to). The one-sentence definitions on the
   featured cards are quoted from that task's own page on huggingface.co/
   tasks/<slug>. The counts are a snapshot and go stale; the page says so on
   its face with a Sourced kicker carrying the date.

   Probe controls, recorded so the null result means something: three slugs
   that looked least like the pattern (visual-document-retrieval,
   image-text-to-image, unconditional-image-generation) were fetched as
   model-hub filters and returned the same counts as the catalogue (181,
   147, 2,731); a slug Hugging Face does NOT use (image-to-mesh) returned
   0 results. "Image-to-mesh" is therefore listed here under Hugging Face's
   own name for the job, Image-to-3D, whose page names meshes (.obj, .glb,
   .stl, .gltf) as one of its output formats.

   This file is data. The app reads it; the test suite checks its shape and
   that every link is built from a slug in the catalogue.
   ===================================================================== */
(function (root) {
'use strict';

const FETCHED = '2026-09-16';

const SOURCES = {
  tasks: 'https://huggingface.co/tasks',
  models: 'https://huggingface.co/models',
  transformers: 'https://huggingface.co/docs/transformers/index',
  hubTotal: 3069798   /* "Models 3,069,798" on huggingface.co/models, same fetch */
};

const modelsUrl = slug => SOURCES.models + '?pipeline_tag=' + slug;
const taskUrl = slug => SOURCES.tasks + '/' + slug;

/* The catalogue, in the catalogue's own order. `n` is the model count the
   tasks page showed beside each name on the fetch date. */
const GROUPS = [
  { name: 'Multimodal', tasks: [
    ['any-to-any', 'Any-to-Any', 11644],
    ['audio-text-to-text', 'Audio-Text-to-Text', 328],
    ['document-question-answering', 'Document Question Answering', 248],
    ['visual-document-retrieval', 'Visual Document Retrieval', 181],
    ['image-text-to-text', 'Image-Text-to-Text', 39242],
    ['image-text-to-image', 'Image-Text-to-Image', 147],
    ['image-text-to-video', 'Image-Text-to-Video', 295],
    ['video-text-to-text', 'Video-Text-to-Text', 481],
    ['visual-question-answering', 'Visual Question Answering', 813]
  ] },
  { name: 'Natural Language Processing', tasks: [
    ['feature-extraction', 'Feature Extraction', 20656],
    ['fill-mask', 'Fill-Mask', 18351],
    ['question-answering', 'Question Answering', 14092],
    ['sentence-similarity', 'Sentence Similarity', 19817],
    ['summarization', 'Summarization', 2950],
    ['table-question-answering', 'Table Question Answering', 192],
    ['text-classification', 'Text Classification', 121046],
    ['text-generation', 'Text Generation', 410866],
    ['text-ranking', 'Text Ranking', 1311],
    ['token-classification', 'Token Classification', 30477],
    ['translation', 'Translation', 17614],
    ['zero-shot-classification', 'Zero-Shot Classification', 519]
  ] },
  { name: 'Computer Vision', tasks: [
    ['depth-estimation', 'Depth Estimation', 569],
    ['image-classification', 'Image Classification', 28987],
    ['image-feature-extraction', 'Image Feature Extraction', 1548],
    ['image-segmentation', 'Image Segmentation', 3399],
    ['image-to-image', 'Image-to-Image', 3626],
    ['image-to-text', 'Image-to-Text', 2107],
    ['image-to-video', 'Image-to-Video', 1599],
    ['keypoint-detection', 'Keypoint Detection', 408],
    ['mask-generation', 'Mask Generation', 301],
    ['object-detection', 'Object Detection', 6601],
    ['video-classification', 'Video Classification', 2226],
    ['text-to-image', 'Text-to-Image', 109680],
    ['text-to-video', 'Text-to-Video', 2635],
    ['unconditional-image-generation', 'Unconditional Image Generation', 2731],
    ['video-to-video', 'Video-to-Video', 317],
    ['zero-shot-image-classification', 'Zero-Shot Image Classification', 2132],
    ['zero-shot-object-detection', 'Zero-Shot Object Detection', 139],
    ['text-to-3d', 'Text-to-3D', 133],
    ['image-to-3d', 'Image-to-3D', 744]
  ] },
  { name: 'Audio', tasks: [
    ['audio-classification', 'Audio Classification', 4841],
    ['audio-to-audio', 'Audio-to-Audio', 1460],
    ['automatic-speech-recognition', 'Automatic Speech Recognition', 36192],
    ['text-to-speech', 'Text-to-Speech', 7718]
  ] },
  { name: 'Tabular', tasks: [
    ['tabular-classification', 'Tabular Classification', 958],
    ['tabular-regression', 'Tabular Regression', 510]
  ] },
  { name: 'Reinforcement Learning', tasks: [
    ['reinforcement-learning', 'Reinforcement Learning', 76467]
  ] }
].map(g => ({ name: g.name, tasks: g.tasks.map(([slug, name, n]) => ({ slug, name, n })) }));

/* The featured cards: the types the operator named plus the ones a learner
   meets first. `in` / `out` are this demo's plain words; `quote` is the
   task page's own definition, verbatim, and `also` is the everyday name
   where it differs from the catalogue's. */
const FEATURED = [
  { slug: 'text-generation', in: 'some text', out: 'more text that continues it',
    quote: 'Generating text is the task of generating new text given another text. These models can, for example, fill in incomplete text or paraphrase.',
    also: 'the type behind chat assistants' },
  { slug: 'text-to-image', in: 'a written description', out: 'an image', also: 'image generation',
    quote: 'Text-to-image is the task of generating images from input text.' },
  { slug: 'text-to-speech', in: 'text', out: 'spoken audio',
    quote: 'Text-to-Speech (TTS) is the task of generating natural sounding speech given text input.' },
  { slug: 'automatic-speech-recognition', in: 'recorded speech', out: 'a text transcript', also: 'speech-to-text',
    quote: 'Automatic Speech Recognition (ASR), also known as Speech to Text (STT), is the task of transcribing a given audio to text.' },
  { slug: 'image-to-3d', in: 'one image', out: 'a 3-D object — a mesh (.obj, .glb, .stl, .gltf) or a splat', also: 'image-to-mesh',
    quote: 'Image-to-3D models take in image input and produce 3D output.' },
  { slug: 'text-to-video', in: 'a written description', out: 'a short video',
    quote: 'Text-to-video models can be used in any application that requires generating consistent sequence of images from text.' },
  { slug: 'image-to-text', in: 'an image', out: 'words about it — a caption, or the text printed in it',
    quote: 'Image to text models output a text from a given image. Image captioning or optical character recognition can be considered as the most common applications.' },
  { slug: 'image-text-to-text', in: 'an image and a question about it', out: 'a written answer', also: 'vision-language model',
    quote: 'Image-text-to-text models take in an image and text prompt and output text. These models are also called vision-language models, or VLMs.' },
  { slug: 'image-classification', in: 'an image', out: 'one label for the whole image, with a confidence',
    quote: 'Image classification is the task of assigning a label or class to an entire image.' },
  { slug: 'tabular-classification', in: 'a row of attributes (a spreadsheet row)', out: 'a class label',
    quote: 'Tabular classification is the task of assigning a label or class given a limited number of attributes.',
    also: 'its page names sklearn and xgboost as the libraries that train these: stage 1d families, not only networks' }
];

const bySlug = new Map();
GROUPS.forEach(g => g.tasks.forEach(t => bySlug.set(t.slug, Object.assign({ group: g.name }, t))));
FEATURED.forEach(f => {
  const t = bySlug.get(f.slug);
  if (!t) throw new Error('model-types: featured slug not in the catalogue: ' + f.slug);
  Object.assign(f, { name: t.name, n: t.n, group: t.group, models: modelsUrl(f.slug), page: taskUrl(f.slug) });
});

const count = GROUPS.reduce((a, g) => a + g.tasks.length, 0);

/* BEYOND ONE CATALOGUE (operator, 2026-09-16: "it shouldn't just be hugging
   face models"). The Hub list above is one platform's catalogue of what
   people upload; several of the most talked-about models are not on it, or
   are not filed under one of its tasks. One card per type, each with a named
   example linked to that model's OWN page (lab, vendor or paper -- never
   huggingface.co), and `quote` copied from that page on `fetched`. `in` /
   `out` are this demo's plain words for the quote, kept to what it states.

   Two examples stand in for releases the operator saw but did not name
   (character animation; free-viewpoint video). They are examples of the
   TYPE, verified on their own pages, not claims to be the model the
   operator meant. Dropped for the eight-card cap, not for sourcing:
   GNoME (materials) and AlphaZero (game playing). */
const BEYOND = [
  { type: 'Interactive world model', example: 'Genie 3', org: 'Google DeepMind',
    url: 'https://deepmind.google/models/genie/', fetched: '2026-09-16',
    in: 'a text description of a place', out: 'a photorealistic world you can move around in, generated as you go',
    quote: 'Genie 3 is a general-purpose world model. It uses simple text descriptions to generate photorealistic environments that can be explored in real-time.' },
  { type: 'Video generation with sound', example: 'Veo 3.1', org: 'Google DeepMind',
    url: 'https://deepmind.google/models/veo/', fetched: '2026-09-16',
    in: 'a written prompt', out: 'a video clip, with sound effects, ambient noise and dialogue generated alongside it',
    quote: 'Veo 3 lets you add sound effects, ambient noise, and even dialogue to your creations – generating all audio natively.' },
  { type: 'Robot control (vision-language-action)', example: 'Gemini Robotics', org: 'Google DeepMind',
    url: 'https://deepmind.google/models/gemini-robotics/', fetched: '2026-09-16',
    in: 'what the robot sees, plus an instruction in words', out: 'motor commands that move the robot',
    quote: 'Our most advanced vision-language-action model (VLA) that converts vision and language input into motor control, enabling a robot to take action.' },
  { type: 'Protein structure prediction', example: 'AlphaFold', org: 'Google DeepMind and Isomorphic Labs',
    url: 'https://deepmind.google/science/alphafold/', fetched: '2026-09-16',
    in: 'a protein, as its chain of amino acids', out: 'a predicted 3-D structure — AlphaFold 3 also predicts how molecules interact',
    quote: "Google DeepMind and Isomorphic Labs introduce AlphaFold 3, which predicts the structure and interactions of all of life's molecules." },
  { type: 'Weather forecasting', example: 'GenCast', org: 'Google DeepMind',
    url: 'https://deepmind.google/blog/gencast-predicts-weather-and-the-risks-of-extreme-conditions-with-sota-accuracy/', fetched: '2026-09-16',
    in: 'the most recent state of the weather', out: 'an ensemble of 50 or more possible forecasts, up to 15 days ahead',
    quote: '…a GenCast forecast comprises an ensemble of 50 or more predictions, each representing a possible weather trajectory.' },
  { type: 'Background removal (video matting)', example: 'NVIDIA Broadcast', org: 'NVIDIA',
    url: 'https://www.nvidia.com/en-us/geforce/broadcasting/broadcast-app/', fetched: '2026-09-16',
    in: 'live webcam video', out: 'the same video with the background removed, replaced or blurred',
    quote: 'Background Removal, Replacement, and Blur allow you to customize your background without the need for expensive equipment' },
  { type: 'Performance-driven character animation', example: 'Wan-Animate', org: 'Tongyi Lab, Alibaba',
    url: 'https://humanaigc.github.io/wan-animate/', fetched: '2026-09-16', standIn: true,
    in: 'a picture of a character, plus an ordinary video of a performer', out: 'a video of that character making the performer’s movements and expressions',
    quote: "Wan-Animate can animate any character based on a performer's video, precisely replicating the performer's facial expressions and movements to generate highly realistic character videos." },
  { type: 'Free-viewpoint (4D) video', example: '4C4D: 4 Camera 4D Gaussian Splatting', org: 'Zhou, Yang, Han et al., CVPR 2026',
    url: 'https://arxiv.org/abs/2604.04063', fetched: '2026-09-16', standIn: true,
    in: 'videos of one moving scene from as few as four portable cameras', out: 'a 4-D scene that can be watched from viewpoints no camera stood at',
    quote: 'This paper tackles the challenge of recovering 4D dynamic scenes from videos captured by as few as four portable cameras.' }
];

const api = { FETCHED, SOURCES, GROUPS, FEATURED, BEYOND, count, modelsUrl, taskUrl, bySlug };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.MODEL_TYPES = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

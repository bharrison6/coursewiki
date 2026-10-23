'use strict';
// Reuse the activities' guide parser: the wiki, app notes and printed guide
// consume the same canonical document, rather than three editable copies.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(process.argv[2]);
const gc = require(path.join(root, 'tools/lesson-shell/guide-contract'));
const activities = [];
for (const name of fs.readdirSync(root).sort()) {
  const manifest = path.join(root, name, 'demo.json');
  if (!fs.existsSync(manifest)) continue;
  const meta = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (meta.slug !== name || !/^[a-z][a-z0-9-]*$/.test(name)) throw Error(`Invalid activity identity: ${name}`);
  const files = [meta.entry, meta.guide.html, meta.guide.pdf];
  for (const file of files) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) || !fs.readdirSync(path.join(root, name)).includes(file)) {
      throw Error(`Missing or wrong-case activity file: ${name}/${file}`);
    }
  }
  // The activity build knows where its canonical guide lives (some use src/,
  // others author it beside build.js). Verify its output, then consume that copy.
  execFileSync(process.execPath, [path.join(root, name, 'build.js'), '--check'], {stdio: 'pipe'});
  const guide = gc.extractGuide(fs.readFileSync(path.join(root, name, meta.guide.html), 'utf8'));
  const scope = `activity-notes-${name}`;
  activities.push({id: name, title: meta.title, files, entry: meta.entry,
    guideHtml: meta.guide.html, guidePdf: meta.guide.pdf,
    css: guide.css.replace(/\.guide-scope\b/g, `.${scope}`)
      .replace(/\bsection\b/g, '[data-guide-section]'),
    // The wiki owns section cards; a guide's internal sections are ordinary
    // content within its notes card, retaining all text and heading structure.
    notes: guide.html.replace(/\bguide-scope\b/g, scope)
      .replace(/\bid="([^"]+)"/g, (_, id) => `id="${name}-${id}"`)
      .replace(/\bhref="#([^"]+)"/g, (_, id) => `href="#${name}-${id}"`)
      .replace(/<section\b/g, '<div data-guide-section').replace(/<\/section>/g, '</div>')});
}
process.stdout.write(JSON.stringify(activities));

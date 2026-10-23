'use strict';
// Keep the no-JavaScript / print figures identical to the live renderer.
// Run with --write after changing the renderer; without it this is read-only.
const fs = require('node:fs');
const path = require('node:path');
const D = require('./render.js');
const file = path.resolve(__dirname, '../../collections/machining/pages/tool-deflection.html');
const start = '<!-- TOOL-DEFLECTION-STATIC -->';
const end = '<!-- /TOOL-DEFLECTION-STATIC -->';
const source = fs.readFileSync(file, 'utf8');
const a = source.indexOf(start), b = source.indexOf(end);
if (a < 0 || b <= a) throw new Error('Static figure markers must occur in order');
const output = source.slice(0, a + start.length) + '\n      ' + D.staticLesson() + '\n      ' + source.slice(b);
if (process.argv.includes('--write')) fs.writeFileSync(file, output);
else if (source !== output) { console.error('Tool-deflection static figures need regeneration.'); process.exitCode = 1; }
else console.log('Tool-deflection static figures match the model and renderer.');

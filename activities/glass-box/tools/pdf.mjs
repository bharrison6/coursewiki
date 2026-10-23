#!/usr/bin/env node
/* Render the presenter guide to PDF.

   `node tools/pdf.mjs`         writes Glass-Box-Demo-Guide.pdf
   `node tools/pdf.mjs --check` verifies the guide loads and the PDF exists

   The canonical guide is src/demo-guide.html; the copy at the demo root
   is what build.js writes and what this reads, so the PDF always matches the
   file that ships beside it — and the same file supplies the app’s in-app
   presenter notes, so all three surfaces move together.

   Two engines, tried in order. Playwright if the repository happens to have it
   installed, otherwise a system Chrome or Edge in headless mode. This
   repository has no node_modules, so the browser path is the one that actually
   runs. No path is hardcoded to one machine — CHROME_PATH wins, then the usual
   install locations on Windows, macOS and Linux. */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const guide = path.join(ROOT, 'demo-guide.html');
const out = path.join(ROOT, 'Glass-Box-Demo-Guide.pdf');
const CHECK = process.argv.includes('--check');

if (!fs.existsSync(guide)) {
  throw new Error(`Presenter guide is missing: ${guide}. Run: node build.js`);
}
const html = fs.readFileSync(guide, 'utf8');
if (!/<title>How a Language Model Works — presenter guide<\/title>/.test(html)) {
  throw new Error('Unexpected guide title; refusing to render a file that is not the guide.');
}

if (CHECK) {
  if (!fs.existsSync(out)) {
    throw new Error(`PDF CHECK FAILED: ${path.basename(out)} is missing; run node tools/pdf.mjs`);
  }
  const pdf = fs.readFileSync(out);
  // Different renderers compress the same guide differently. File size is not
  // evidence that pages are missing; check the container markers instead.
  // Page/content correctness still requires PDF parsing and visual review.
  if (!pdf.subarray(0, 8).toString('ascii').startsWith('%PDF-') ||
      !/%%EOF\s*$/.test(pdf.subarray(-1024).toString('ascii'))) {
    throw new Error(`PDF CHECK FAILED: ${path.basename(out)} has invalid PDF boundary markers`);
  }
  console.log(`PDF CHECK OK: guide title and PDF boundary markers verified (${(pdf.length / 1024).toFixed(1)} KB); no files written.`);
  process.exit(0);
}

const src = pathToFileURL(guide).href;

/* --- engine 1: Playwright, if this checkout has it ---------------------- */
let done = false;
try {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(src, { waitUntil: 'load' });
  await p.pdf({ path: out, format: 'Letter', printBackground: true,
                margin: { top: '0.6in', bottom: '0.6in', left: '0.6in', right: '0.6in' } });
  await b.close();
  done = true;
  console.log('WRITE OK (playwright):', path.basename(out));
} catch (playwrightUnavailable) {
  /* Expected on a machine with no node_modules. Fall through. */
}

/* --- engine 2: a system Chrome or Edge ---------------------------------- */
if (!done) {
  const candidates = [
    process.env.CHROME_PATH,
    /* Windows */
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
    /* macOS */
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    /* Linux */
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'
  ].filter(Boolean);

  const exe = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (!exe) {
    throw new Error('No Playwright Chromium and no system Chrome or Edge found. ' +
                    'Set CHROME_PATH to a Chromium-based browser and re-run.');
  }

  /* --print-to-pdf needs a writable profile directory or it will contend with
     the user's running browser. A throwaway one under the OS temp dir keeps
     this off the user's real profile. */
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-box-pdf-'));
  const r = spawnSync(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--no-pdf-header-footer',
    `--print-to-pdf=${out}`,
    src
  ], { stdio: 'inherit' });
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }

  if (r.status !== 0 || !fs.existsSync(out)) {
    throw new Error(`Headless print failed (exit ${r.status}) using ${exe}`);
  }
  console.log('WRITE OK (' + path.basename(exe) + '):', path.basename(out),
              (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
}

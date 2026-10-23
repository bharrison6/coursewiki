#!/usr/bin/env node
/* Render the printable presenter sheet to PDF.

   `node tools/pdf.mjs`         writes The-Stranger-Presenter-Sheet.pdf
   `node tools/pdf.mjs --check` verifies the sheet parses and the PDF exists

   presenter-sheet.html is the one source: this PDF, the printable page, and the
   in-app presenter notes (injected by build.js) all come out of it, so the paper
   in a presenter's hand and the overlay on the projector cannot disagree.

   This replaces the PDF half of tools/companion.py, which needed Playwright and
   generated a second copy of the sheet. Two engines, tried in order: Playwright if
   this checkout happens to have it, otherwise a system Chrome or Edge in headless
   mode. This repository has no node_modules, so the browser path is the one that
   actually runs. No path is hardcoded to one machine — CHROME_PATH wins, then the
   usual install locations on Windows, macOS and Linux. Node builtins only; nothing
   is installed and nothing is downloaded. */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const sheet = path.join(ROOT, 'presenter-sheet.html');
const out = path.join(ROOT, 'The-Stranger-Presenter-Sheet.pdf');
const CHECK = process.argv.includes('--check');

if (!fs.existsSync(sheet)) throw new Error(`Presenter sheet is missing: ${sheet}`);
const html = fs.readFileSync(sheet, 'utf8');
if (!/presenter sheet<\/title>/.test(html) || !/<div class="guide-scope">/.test(html)) {
  throw new Error('Unexpected sheet structure; refusing to render a file that is not the presenter sheet.');
}

if (CHECK) {
  if (!fs.existsSync(out)) throw new Error(`PDF CHECK FAILED: ${path.basename(out)} is missing; run node tools/pdf.mjs`);
  const bytes = fs.statSync(out).size;
  if (bytes < 8192) throw new Error(`PDF CHECK FAILED: ${path.basename(out)} is only ${bytes} bytes`);
  console.log(`PDF CHECK OK: presenter-sheet.html parses and ${path.basename(out)} exists (${(bytes / 1024).toFixed(0)} KB); no files written.`);
  process.exit(0);
}

const src = pathToFileURL(sheet).href;

/* --- engine 1: Playwright, if this checkout has it ---------------------- */
let done = false;
try {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(src, { waitUntil: 'load' });
  await p.pdf({ path: out, format: 'Letter', printBackground: true });
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

  /* --print-to-pdf needs a writable profile directory or it contends with the
     user's running browser. A throwaway one under the OS temp dir keeps this off
     the real profile. The page's own @page rule owns the margins. */
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stranger-pdf-'));
  const r = spawnSync(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--no-pdf-header-footer',
    `--print-to-pdf=${out}`,
    src
  ], { stdio: 'inherit' });
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }

  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`Headless print failed (exit ${r.status}) using ${exe}`);
  console.log('WRITE OK (' + path.basename(exe) + '):', path.basename(out),
              (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
}

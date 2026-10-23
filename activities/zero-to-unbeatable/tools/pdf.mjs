/* Render the printable demo guide to PDF.  node tools/pdf.mjs
 *
 * Dependency-free: drives an installed Chrome/Edge headless rather than
 * requiring playwright, so the guide can be re-rendered on a bare checkout.
 * (Same approach as fuel-golf/tools/pdf.mjs.)  Set CHROME_PATH to override.
 */
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'demo-guide.html');
const out = path.join(here, '..', 'Zero-to-Unbeatable-Demo-Guide.pdf');

const browser = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(p => { try { return p && fs.existsSync(p); } catch { return false; } });

if (!browser) {
  console.error('No Chrome/Edge found. Set CHROME_PATH to a Chromium-based browser.');
  process.exit(1);
}

execFileSync(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${out}`,
  pathToFileURL(src).href,
], { stdio: 'ignore' });

if (!fs.existsSync(out)) { console.error('render produced no file'); process.exit(1); }
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');

// Integration test: drives the built index.html in a phone-sized browser.
// Run: node tools/integration.mjs           (full: trains Act 2, ~4 minutes)
//      node tools/integration.mjs --quick   (skips Act 2 training, ~1 minute)
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
// createRequire so a globally-installed playwright resolves (no local node_modules)
const { chromium } = createRequire(import.meta.url)('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + path.join(here, '..', 'index.html');
const QUICK = process.argv.includes('--quick');
const browserPath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find(p => p && fs.existsSync(p));

let passed = 0, failed = 0;
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? '\n        ' + detail : '')); }
};

const browser = await chromium.launch(browserPath ? { executablePath: browserPath } : {});
const page = await browser.newPage({ viewport: { width: 375, height: 667 } });

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
const netRequests = [];
page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('blob:')) netRequests.push(r.url()); });

console.log('load + Act 1');
await page.goto(page_url);
await page.waitForFunction(() => document.getElementById('livesample').textContent.includes('era 0'), null, { timeout: 30000 });
ok(true, 'worker boots and the newborn model reports in');

// ---- required UX (CONTRACT.md): the Guide overlay on load, and a Settings menu
// offering exactly Open Presenter Notes, Presentation mode and Reset ----
// Runs first because these are modal: everything after needs them dismissed.
const isOpen = (id) => page.$eval('#' + id, (el) => el.open);
ok(await isOpen('guide'), 'the Guide overlay is shown on load');
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
ok(!(await isOpen('guide')), 'Escape dismisses it');
await page.click('#guide-open');
ok(await isOpen('guide'), 'the always-visible ? control reopens it');
ok(await page.$eval('#guide-open', (el) => el.getAttribute('aria-label')) === 'Guide',
  'and that control is named exactly "Guide"');
ok(/^\s*Guide/.test(await page.$eval('#guide-title', (el) => el.textContent)),
  'the overlay heading reads "Guide"');
await page.click('#guide .lesson-dialog-actions button');
await page.waitForTimeout(60);
ok(!(await isOpen('guide')), 'and its footer button closes it again');

await page.click('#settings-open');
ok(await isOpen('settings'), 'the settings button opens a settings menu');
// Scoped to the menu block on purpose. The presenter notes are now the guide
// itself, and the guide's own prose names all three of these labels — a
// document-wide search would be matching its own answer key.
const menu = await page.$eval('#settings-menu', (el) => ({
  guideInside: !!el.querySelector('.guide-scope'),
  labels: [...el.querySelectorAll('button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim())
}));
ok(menu.guideInside === false, 'the settings block carries none of the injected guide text');
ok(menu.labels.includes('Open Presenter Notes'), 'settings offers Open Presenter Notes', JSON.stringify(menu.labels));
ok(menu.labels.includes('Presentation mode'),
  'settings offers Presentation mode (state rides in aria-pressed)', JSON.stringify(menu.labels));
ok(menu.labels.includes('Reset'), 'settings offers Reset', JSON.stringify(menu.labels));

await page.click('#settings .notes-open');
await page.waitForTimeout(60);
ok(await isOpen('presenter-notes') && !(await isOpen('settings')),
  'Presenter Notes open from settings (and replace it rather than stacking)');
const notesTxt = await page.$eval('#presenter-notes .guide-scope', (el) => el.textContent);
ok(/LLM/.test(notesTxt) && /Reasoning/.test(notesTxt) && /Agents/.test(notesTxt) && /Start fresh: the untrained model is useful evidence/.test(notesTxt),
  'the notes carry stage cues for all three stages');
ok(notesTxt.trim().split(/\s+/).length > 700,
  'and they are the whole printable guide, not a summary (' + notesTxt.trim().split(/\s+/).length + ' words)');
await page.keyboard.press('Escape');
await page.waitForTimeout(60);

await page.click('#settings-open');
await page.click('#presentation-btn');
ok(await page.evaluate(() => document.body.classList.contains('presenter')), 'presentation mode engages');
ok(await page.$eval('#presentation-btn', (el) => el.getAttribute('aria-pressed')) === 'true',
  'and the control reports its state in aria-pressed without changing its label');
await page.click('#presentation-btn');   // back to normal scale before the size audits
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
ok(await page.isVisible('#guide-open') && await page.isVisible('#settings-open'),
  'both controls stay visible in the sticky header');
const tabLabels = await page.$$eval('nav.stages [role="tab"]', (els) => els.map((el) => el.querySelector('span:not(.stage-mark)').textContent.trim()));
ok(JSON.stringify(tabLabels) === JSON.stringify(['LLM', 'Reasoning', 'Agents']),
  'the primary tabs name the three learning stages', JSON.stringify(tabLabels));
await page.click('#stage-1 .details-trigger');
ok(await isOpen('details') && await page.$eval('#details-subtitle', (el) => el.textContent.trim()) === 'LLM',
  'Details opens the evidence drawer for the current stage');
await page.keyboard.press('Escape');
ok(await page.$eval('#stage-1 .details-trigger', (el) => el === document.activeElement),
  'closing Details returns focus to its trigger');
ok(/Bryant Harrison/.test(await page.$eval('.bh-credit', (el) => el.textContent)) &&
   /Murray State University/.test(await page.$eval('.bh-credit', (el) => el.textContent)),
  'the attribution byline is present and visible');
const pillBox = await page.evaluate(() => {
  const r = document.querySelector('.bh-credit').getBoundingClientRect();
  return { left: r.left, right: r.right, vw: document.documentElement.clientWidth };
});
ok(pillBox.left >= 0 && pillBox.right <= pillBox.vw + 1,
  'and it fits inside a 375px screen rather than running off it', JSON.stringify(pillBox));

ok((await page.$$('#tokout .tok')).length > 5, 'tokenizer renders character tokens');
await page.click('[data-inspect="parameters"]');
ok((await page.$$('#pmap .prow')).length === 8, 'parameter map lists 8 component rows');
const corpus = await page.$eval('#corpusbox', (el) => el.textContent);
ok(/the little robot woke up in the lab/.test(corpus) && corpus.length > 4000, 'the whole textbook is readable in the §1.3 fold');
ok(/original story written for this demo/.test(await page.$eval('#corpusstats', (el) => el.textContent)), 'and labeled as original, with its stats');

// weight peek opens
await page.click('#pmap .prow');
ok(await page.isVisible('#wpeek'), 'tapping a component reveals its live weights');

// train era 1 (200 steps)
const t0 = Date.now();
await page.click('#trainbtn');
await page.waitForFunction(() => document.querySelectorAll('#erachips .chip').length >= 2, null, { timeout: 180000 });
ok(true, `era 1 trains in the browser (${((Date.now() - t0) / 1000).toFixed(0)}s for 200 steps)`);
const loss = await page.$eval('#statloss', (el) => parseFloat(el.textContent));
ok(loss < 2.6, `loss fell to ${loss} (< 2.6)`);

// playground
const before = await page.$eval('#pginput', (el) => el.value);
await page.click('#pgstep');
const after = await page.$eval('#pginput', (el) => el.value);
ok(after.length === before.length + 1, 'playground writes exactly one sampled token');
ok((await page.$$('#probbars .pb')).length === 8, 'probability table shows top-8 next tokens');

// attention
await page.click('[data-inspect="attention"]');
ok((await page.$$('#attheads .chip')).length === 8, 'attention offers 2 layers x 4 heads');
await page.$$eval('#atttext .attchar', (chars) => chars[4].click());
const goldSpans = await page.$$eval('#atttext .attchar', (chars) => chars.filter(s => s.style.background).length);
ok(goldSpans > 0, 'tapping a character lights up real attention weights');

if (!QUICK) {
  console.log('Act 2 (full training — the long part)');
  await page.click('#tab-2');
  const t2 = Date.now();
  await page.click('#a2trainbtn');
  await page.waitForFunction(() => !document.getElementById('votebtn').disabled, null, { timeout: 420000 });
  ok(true, `both models train + exams graded (${((Date.now() - t2) / 1000).toFixed(0)}s)`);
  const accD = await page.$eval('#accD', (el) => parseInt(el.textContent));
  const accS = await page.$eval('#accS', (el) => parseInt(el.textContent));
  ok(accS > accD + 15, `scratchpad beats direct by >15 points (D ${accD}% vs S ${accS}%)`);
  ok(accS >= 85, `scratchpad model is genuinely good (${accS}%)`);
  ok((await page.$$('#exD .exrow')).length > 5, 'Model D exam papers are browsable');

  // verified voting
  const tv = Date.now();
  await page.click('#votebtn');
  await page.waitForFunction(() => document.getElementById('votebtn').textContent.includes('again'), null, { timeout: 300000 });
  ok(true, `verified best-of-N completes (${((Date.now() - tv) / 1000).toFixed(0)}s)`);
  const votes = await page.$$eval('#votebars .vnum', (els) => els.map(e => parseInt(e.textContent)));
  ok(votes.length === 4 && votes.every(v => !Number.isNaN(v)), 'all four N rows report accuracy: ' + votes.join(','));
  ok(votes[3] > votes[0], `8 attempts beat 1 attempt (${votes[0]}% -> ${votes[3]}%)`);

  // one self-improvement round
  const ts = Date.now();
  await page.click('#starbtn');
  await page.waitForFunction(() => document.querySelectorAll('#starbars .vb').length >= 2, null, { timeout: 300000 });
  ok(true, `self-improvement round completes (${((Date.now() - ts) / 1000).toFixed(0)}s)`);
  const stars = await page.$$eval('#starbars .vnum', (els) => els.map(e => parseInt(e.textContent)));
  ok(stars[1] > stars[0] - 3, `round 1 does not regress (before ${stars[0]}%, after ${stars[1]}%)`);

  // A rerun is a new experiment: prior voting/chains/STaR evidence must not
  // be mislabelled as evidence from the new model.
  await page.click('#a2trainbtn');
  await page.waitForTimeout(100);
  ok((await page.$$('#votebars .vb')).length === 0 && (await page.$$('#chainpeek .ch')).length === 0 &&
    (await page.$$('#starbars .vb')).length === 0 && await page.isDisabled('#votebtn'),
    're-running Act 2 immediately removes prior vote, chain, and STaR results');
}

console.log('Act 3');
await page.click('#tab-3');
await page.click('#agmode-auto');
await page.waitForFunction(() => document.querySelector('#transcript .turn.final'), null, { timeout: 60000 });
const finalTxt = await page.$eval('#transcript .turn.final', (el) => el.textContent);
ok(/131\.76/.test(finalTxt) && /Campus Slice/.test(finalTxt), 'autoplay reaches the correct answer');
ok(await page.$('#transcript .turn.observation.err') !== null, 'the real calculator error appears in the transcript');
const toks = await page.$eval('#ctxtok', (el) => parseInt(el.textContent.replace(/,/g, '')));
ok(toks > 300, `context meter shows real growth (${toks} tokens)`);

// tiny window run stops dead
await page.selectOption('#agwindow', '450');
await page.click('#agreset');
await page.click('#agmode-auto');
await page.waitForFunction(() => document.querySelector('#transcript .turn.stopped'), null, { timeout: 60000 });
const stopTxt = await page.$eval('#transcript .turn.stopped', (el) => el.textContent);
ok(/no longer see a goal/.test(stopTxt), 'tiny context window genuinely breaks the agent');
const raw = await page.$eval('#rawctx', (el) => el.textContent);
ok(/fallen out of the window/.test(raw), 'raw-context view shows the truncation honestly');

// hygiene
ok(consoleErrors.length === 0, 'no console errors (' + consoleErrors.slice(0, 2).join(' | ') + ')');
ok(netRequests.length === 0, 'zero network requests of any kind');

// Accessibility and tap targets: enumerate every visible interactive control
// in every act rather than sampling three favourable buttons.
const interactiveSelector = 'button,input,select,summary,a[href],[role="button"],[tabindex]:not([tabindex="-1"])';
let undersized = [], interactiveCount = 0;
for (const nav of ['tab-1', 'tab-2', 'tab-3']) {
  await page.click('#' + nav);
  await page.waitForTimeout(50);
  const audit = await page.evaluate((selector) => Array.from(document.querySelectorAll(selector)).map((el, i) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0) return null;
    const label = el.id ? '#' + el.id : el.className ? el.tagName.toLowerCase() + '.' + String(el.className).replace(/\s+/g, '.') : el.tagName.toLowerCase() + ':' + i;
    return { label, width: r.width, height: r.height };
  }).filter(Boolean), interactiveSelector);
  interactiveCount += audit.length;
  undersized = undersized.concat(audit.filter(x => x.width < 36 || x.height < 36).map(x => ({ act: nav, ...x })));
}
ok(undersized.length === 0, `all ${interactiveCount} visible interactive targets across three acts are >=36px`, JSON.stringify(undersized));
await page.click('#tab-1');
await page.click('[data-inspect="parameters"]');
const pmapTargets = await page.$$eval('#pmap button.prow', els => els.map(el => el.getBoundingClientRect().height));
await page.click('[data-inspect="attention"]');
const attTargets = await page.$$eval('#atttext .attchar', els => els.map(el => el.getBoundingClientRect().height));
ok(pmapTargets.length > 0 && pmapTargets.every(h => h >= 36), 'every interactive parameter row is >=36px');
ok(attTargets.length > 0 && attTargets.every(h => h >= 36), 'every attention character target is >=36px');
const canvasA11y = await page.$$eval('canvas', els => els.map(el => ({ id: el.id, role: el.getAttribute('role'), label: el.getAttribute('aria-label'), desc: el.getAttribute('aria-describedby') })));
ok(canvasA11y.length === 3 && canvasA11y.every(c => c.role === 'img' && (c.label || c.desc)),
  'all three canvases expose meaningful accessible alternatives', JSON.stringify(canvasA11y));

// ---- no-Worker fallback: some hosts (sandboxed previews) block blob workers ----
console.log('single-thread fallback (Worker blocked)');
const page2 = await browser.newPage({ viewport: { width: 375, height: 667 } });
const errors2 = [];
page2.on('pageerror', (e) => errors2.push(String(e)));
await page2.addInitScript(() => {
  window.Worker = function () { throw new DOMException('blocked by test', 'SecurityError'); };
});
await page2.goto(page_url);
await page2.waitForFunction(() => document.getElementById('livesample').textContent.includes('era 0'), null, { timeout: 30000 });
await page2.keyboard.press('Escape');   // dismiss the how-to card
ok(true, 'boots and initializes the model without any Worker');
const modeNote = await page2.$eval('#modenote', (el) => el.textContent);
ok(/single-thread/.test(modeNote), 'the page says so honestly in the footer');
await page2.click('#trainbtn');
await page2.waitForFunction(() => document.querySelectorAll('#erachips .chip').length >= 2, null, { timeout: 180000 });
const loss2 = await page2.$eval('#statloss', (el) => parseFloat(el.textContent));
ok(loss2 < 2.6, `era 1 trains on the main thread, loss ${loss2}`);
ok(Math.abs(loss2 - loss) < 1e-9, `and to the same displayed loss as the worker run (${loss2} vs ${loss})`);
if (!QUICK) {
  await page2.click('#tab-2');
  await page2.click('#a2trainbtn');
  await page2.waitForFunction(() => !document.getElementById('starbtn').disabled, null, { timeout: 420000 });
  await page2.evaluate(() => {
    window.__starFrames = 0; window.__starProgress = false;
    new MutationObserver(() => { window.__starProgress = /attempting problem|fine-tuning/.test(document.querySelector('#starstatus').textContent); })
      .observe(document.querySelector('#starstatus'), { childList:true, subtree:true, characterData:true });
    const frame = () => { window.__starFrames++; requestAnimationFrame(frame); }; requestAnimationFrame(frame);
  });
  await page2.click('#starbtn');
  await page2.waitForFunction(() => window.__starProgress && window.__starFrames > 4, null, { timeout: 60000 });
  ok(true, 'no-Worker STaR yields progress while animation frames continue (old monolith blocks both)');
}
ok(errors2.length === 0, 'no page errors in fallback mode (' + errors2.slice(0, 1).join('') + ')');
await page2.close();

// ---- Reset, last. In place as of lesson-shell v2: no reload, so a sentinel on
// window must survive it, or the assertions below prove nothing about the handler ----
console.log('reset');
await page.click('#tab-3');
await page.evaluate(() => { window.__gbSentinel = 'planted'; });
await page.click('#settings-open');
await page.click('#reset-btn');
await page.waitForFunction(() => document.getElementById('livesample').textContent.includes('era 0'), null, { timeout: 30000 });
const afterReset = await page.evaluate(() => ({
  act1: document.getElementById('stage-1').classList.contains('on') && !document.getElementById('stage-1').hidden,
  eras: document.querySelectorAll('#erachips .chip').length,
  guideOpen: document.getElementById('guide').open,
  settingsOpen: document.getElementById('settings').open,
  presenter: document.body.classList.contains('presenter'),
  sentinel: window.__gbSentinel,
  navigations: performance.getEntriesByType('navigation').length
}));
ok(afterReset.act1 && afterReset.eras <= 1, 'Reset returns the whole demo to its fresh-load state', JSON.stringify(afterReset));
ok(afterReset.guideOpen === false && afterReset.settingsOpen === false, 'and leaves the overlays closed');
ok(afterReset.sentinel === 'planted' && afterReset.navigations === 1, 'and did it in place: the window sentinel survived and no navigation happened');
// Presentation mode is a presenter display preference, not demo state.
await page.click('#settings-open');
await page.click('#presentation-btn');
await page.click('#reset-btn');
await page.waitForFunction(() => document.getElementById('livesample').textContent.includes('era 0'), null, { timeout: 30000 });
ok(await page.evaluate(() => document.body.classList.contains('presenter')), 'and leaves Presentation mode as it found it');

await browser.close();
console.log(`\n${passed} passed, ${failed} failed${QUICK ? ' (quick mode — Act 2 training skipped)' : ''}`);
process.exit(failed ? 1 : 0);

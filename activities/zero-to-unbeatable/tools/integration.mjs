/* =====================================================================
   Zero to Unbeatable — browser integration playtest

   Drives the BUILT index.html in a real browser: plays games, opens the
   brain inspector, trains through the whole arc to the unbeatable
   banner, and checks the two claims that only a browser can settle —

     5. a 5,000-game burst meets the ~3 second budget with the CPU
        throttled to approximate mid-range phone hardware, and
     6. the app is one file that opens from local storage and makes no
        network request of any kind.

     node tools/integration.mjs            # headless
     node tools/integration.mjs --headed   # watch it play
     node tools/integration.mjs --shots    # also write screenshots to /tmp
   ===================================================================== */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
const HEADED = process.argv.includes('--headed');
const SHOTS = process.argv.includes('--shots');
const THROTTLE = 4;                 /* 4x slower than this machine's core */

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS  ' + name);
  else { console.log('FAIL  ' + name + (detail ? '\n        ' + detail : '')); failures++; }
}

/* the sandbox ships a Chromium that may not match this Playwright's
   expected revision; fall back to the one on disk */
const LOCAL = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome'
]
  .find(p => { try { return fs.existsSync(p); } catch { return false; } });

const browser = await chromium.launch({
  headless: !HEADED,
  ...(LOCAL ? { executablePath: LOCAL } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },      /* iPhone-ish portrait */
  deviceScaleFactor: 2, isMobile: true, hasTouch: true
});
const page = await ctx.newPage();

const consoleErrors = [], consoleLog = [], requests = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); else consoleLog.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
page.on('request', r => requests.push(r.url()));

/* The how-to sheet opens on every load and makes the app inert behind it,
   which is the point — so every page this suite opens has to dismiss it
   first, exactly as a student does. */
async function dismissHowto(p) {
  await p.waitForSelector('#howto:not([hidden])');
  await p.click('#howto .sheet-foot button');
  await p.waitForSelector('#howto', { state: 'hidden' });
}

/* ---------- 6. one file, no network -------------------------------- */
await page.goto(FILE);
await page.waitForSelector('#board .cell');

/* ---------- the how-to popup, per the demo contract ----------------- */
check('the how-to popup opens on load without being asked for',
  !(await page.locator('#howto').isHidden()));
check('it is a labelled modal that takes focus and makes the page inert',
  await page.locator('#howto').getAttribute('role') === 'dialog' &&
  await page.locator('#howto').getAttribute('aria-modal') === 'true' &&
  await page.evaluate(() => document.activeElement.closest('#howto') !== null) &&
  await page.evaluate(() => document.querySelector('#app').inert === true));
const howtoText = await page.locator('#howto').innerText();
check('it says how to play in the demo\'s own terms',
  /1 . Rules/.test(howtoText) && /2 . Learning/.test(howtoText) &&
  /3 . Ultimate/.test(howtoText) && /press <b>TRAIN|press .TRAIN/i.test(howtoText) &&
  /show its brain/i.test(howtoText) && /opposite routes/i.test(howtoText),
  howtoText.slice(0, 200));
if (SHOTS) await page.screenshot({ path: '/tmp/og-0-howto.png' });
await page.keyboard.press('Escape');
check('Escape dismisses it', await page.locator('#howto').isHidden());
await page.click('#btn-howto');
check('the ? control in the brand bar reopens it', !(await page.locator('#howto').isHidden()));
await page.click('#howto', { position: { x: 6, y: 6 } });
check('tapping outside dismisses it', await page.locator('#howto').isHidden());
await page.click('#btn-howto');
await dismissHowto(page);
check('dismissing it hands the app back',
  await page.evaluate(() => document.querySelector('#app').inert === false));

/* ---------- attribution --------------------------------------------- */
check('Bryant Harrison is credited on screen without being asked for',
  await page.locator('.bh-credit').isVisible() &&
  /bryant harrison/i.test(await page.locator('.bh-credit').innerText()) &&
  /murray state university/i.test(await page.locator('.bh-credit').innerText()));
check('the byline never sits in front of a control',
  await page.evaluate(() => getComputedStyle(document.querySelector('.bh-credit')).pointerEvents === 'none'));

const external = requests.filter(u => !u.startsWith('file://'));
check('opens straight from a local file with no server', requests[0].startsWith('file://'));
check('makes no network request of any kind', external.length === 0, external.join('\n        '));
check('is exactly one file — no external script, style, font or image',
  requests.filter(u => u.startsWith('file://')).length === 1,
  requests.filter(u => u.startsWith('file://')).join('\n        '));

const bytes = fs.statSync(path.join(__dirname, '..', 'index.html')).size;
check('the single file is small enough to mail to someone', bytes < 400 * 1024,
  (bytes / 1024).toFixed(0) + ' KB');

/* ---------- step 1: the hand-written rules -------------------------- */
/* The app opens here, so this runs before anything touches the learner. */
check('opens on step 1, the hand-written rules',
  await page.locator('#mode-seg button[data-mode="rules"]').evaluate(e => e.classList.contains('on')));
check('step 1 shows the ladder and hides the training panel',
  await page.locator('#rules-panel').isVisible() &&
  await page.locator('#train-panel').isHidden() &&
  await page.locator('#era-select').isHidden());
check('all eight rules are on screen, none struck off at All 8',
  (await page.locator('#rule-list li.rule').count()) === 8 &&
  (await page.locator('#rule-list li.rule.off').count()) === 0);

/* the ladder must NARRATE, which is the whole point of step 1 */
await page.click('#chk-first');            /* deterministic: we always move first */
await page.click('#btn-newgame');
await page.click('.cell[data-i="0"]');
await page.waitForTimeout(520);
const firedText = await page.locator('#rule-fired').innerText();
check('it names the rule it just used and why',
  /Rule 5 . Centre/.test(firedText) && /four lines/.test(firedText), firedText);
check('the rule that fired is the one highlighted in the list',
  /Centre/.test(await page.locator('#rule-list li.rule.fired').innerText()));
await page.click('.cell[data-i="1"]');
await page.waitForTimeout(520);
const blockText = await page.locator('#rule-fired').innerText();
check('a threat makes rule 2 fire, and it names the line',
  /Rule 2 . Block/.test(blockText) && /top row/.test(blockText), blockText);
check('the squares that triggered the rule are marked on the board',
  (await page.locator('.cell.trig').count()) === 3);
const rulesBanner = await page.locator('#banner').innerText();
check('step 1 claims its proof in the same words step 2 does',
  /cannot beat this one either/i.test(rulesBanner) && /0 losses/.test(rulesBanner) &&
  /both roles/.test(rulesBanner), rulesBanner.slice(0, 140));
check('step 1 says plainly that the rules are the better engineering here',
  /better piece\s+of engineering/i.test(rulesBanner.replace(/\s+/g, ' ')), rulesBanner.slice(-260));
if (SHOTS) await page.screenshot({ path: '/tmp/og-0b-rules.png' });

/* shorten the ladder: it must now admit it loses, and show the game */
await page.click('#depth-seg button[data-d="2"]');
await page.waitForTimeout(150);
check('switching to two rules greys out the six that are off',
  (await page.locator('#rule-list li.rule.off').count()) === 6);
const beatable = await page.locator('#banner').innerText();
check('the two-rule ladder admits it loses and quotes the exact rate',
  /2 rules is not enough/i.test(beatable) && /% of the time/.test(beatable),
  beatable.slice(0, 140));
check('and draws the actual game, with the fork marked',
  (await page.locator('#banner .lg-step').count()) >= 6 &&
  (await page.locator('#banner .lg-step.fork').count()) === 1);
await page.click('#depth-seg button[data-d="8"]');
await page.click('#chk-first');            /* back to alternating, as step 2 expects */

/* ---------- step 2: era 0 is there and is a pushover ---------------- */
await page.click('#mode-seg button[data-mode="one"]');
await page.waitForTimeout(150);
check('step 2 brings back the era dropdown and the training panel',
  await page.locator('#era-select').isVisible() &&
  await page.locator('#train-panel').isVisible() &&
  await page.locator('#rules-panel').isHidden());
check('starts at Era 0', (await page.locator('#era-select').inputValue()) === '0');
check('Era 0 is labelled a newborn',
  /newborn/i.test(await page.locator('#era-select option').first().innerText()));
check('the console states what a newborn is',
  consoleLog.some(t => /every value in its table is zero/i.test(t)));
check('the console prints the exhaustive verification for Era 0',
  consoleLog.some(t => /Exhaustive check, agent moving first/.test(t) && /Era 0/.test(t)),
  consoleLog.slice(0, 3).join(' | '));
if (SHOTS) await page.screenshot({ path: '/tmp/og-1-start.png' });

/* beat era 0 — a newborn cannot defend a simple row */
async function playCell(i) {
  await page.click(`.cell[data-i="${i}"]`);
  await page.waitForTimeout(520);
}
let beatEra0 = false;
for (let attempt = 0; attempt < 12 && !beatEra0; attempt++) {
  await page.click('#btn-newgame');
  await page.waitForTimeout(520);
  /* only take games where we move first */
  if (!/you go first/.test(await page.locator('#status').innerText())) continue;
  for (const cell of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const txt = await page.locator(`.cell[data-i="${cell}"]`).innerText();
    if (txt.trim()) continue;
    await playCell(cell);
    const s = await page.locator('#status').innerText();
    if (/You win|It beat you|Drawn/.test(s)) { beatEra0 = /You win/.test(s); break; }
  }
}
check('a human can beat Era 0', beatEra0);
check('the scoreboard records it', +(await page.locator('#score-row .sc.win .n').innerText()) > 0);

/* ---------- brain inspector ---------------------------------------- */
await page.click('#btn-newgame');
await page.waitForTimeout(400);
await page.click('#btn-brain');
await page.waitForTimeout(300);
const heatCells = await page.locator('.cell.heat').count();
check('the brain inspector puts a value on every empty square', heatCells >= 8, 'heat cells: ' + heatCells);
check('it reports how many positions the agent has seen',
  /positions with a number attached/i.test(await page.locator('#brain-readout').innerText()));
check('Era 0 shows an empty mind',
  /\b0\b positions/.test((await page.locator('#brain-readout').innerText()).replace(/\s+/g, ' ')));
if (SHOTS) await page.screenshot({ path: '/tmp/og-2-brain.png' });
await page.click('#btn-brain');

/* ---------- 5. performance under a throttled CPU -------------------- */
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

const rawMs = await page.evaluate(() => {
  const a = OG.newAgent(), r = OG.makeRng('bench');
  const t0 = performance.now();
  OG.trainGames(a, 5000, r);
  return performance.now() - t0;
});
check(`a 5,000-game burst computes well inside the 3s phone budget (CPU throttled ${THROTTLE}x)`,
  rawMs < 1500, rawMs.toFixed(0) + 'ms');
console.log(`        5,000 games of learning took ${rawMs.toFixed(0)}ms with the CPU throttled ${THROTTLE}x`);

const verifyMs = await page.evaluate(() => {
  const a = OG.newAgent(), r = OG.makeRng('bench2');
  OG.trainGames(a, 20000, r);
  const t0 = performance.now();
  OG.verifyUnbeatable(a);
  return performance.now() - t0;
});
check('the unbeatability proof itself runs fast enough to do live, every burst',
  verifyMs < 800, verifyMs.toFixed(0) + 'ms');
console.log(`        the exhaustive proof took ${verifyMs.toFixed(0)}ms throttled — it runs after every burst`);

/* ---------- the training montage ------------------------------------ */
const tTrain = Date.now();
await page.click('#btn-train');
await page.waitForSelector('#montage:not([hidden])');
await page.waitForTimeout(800);
const mText = await page.locator('#montage').innerText();
check('the montage counts games as they are played', /[1-9]/.test((await page.locator('#m-count').innerText())));
check('the montage shows epsilon decaying', /exploration/i.test(mText));
check('the montage shows a live win rate against random play', /wins vs a random player/i.test(mText));
check('the montage flickers through real games', (await page.locator('#montage .mini').count()) === 6);
if (SHOTS) await page.screenshot({ path: '/tmp/og-3-montage.png' });

await page.waitForSelector('#learned:not([hidden])', { timeout: 30000 });
check('learned card is a labelled modal dialog and moves focus inside',
  await page.locator('#learned').getAttribute('role') === 'dialog' &&
  await page.locator('#learned').getAttribute('aria-modal') === 'true' &&
  await page.evaluate(() => document.activeElement.closest('#learned') !== null));
check('modal makes the application inert while it is open',
  await page.evaluate(() => document.querySelector('#app').inert && document.querySelector('#app').getAttribute('aria-hidden') === 'true'));
const burstMs = Date.now() - tTrain;
check('one burst, montage included, takes between 2 and 5 seconds',
  burstMs > 1800 && burstMs < 5000, burstMs + 'ms');
console.log(`        click to "what it learned" card: ${burstMs}ms (throttled ${THROTTLE}x)`);

/* ---------- what it learned ----------------------------------------- */
const learned = await page.locator('#learned-body').innerText();
check('the card says how the training games were split',
  /against itself/.test(learned) && /against a random mover/.test(learned));
check('the card reports the size of the table', /positions/.test(learned));
check('the card shows the landmark positions',
  (await page.locator('#learned .lc').count()) >= 4,
  'cards: ' + (await page.locator('#learned .lc').count()));
check('the card shows before/after deltas on squares that moved',
  (await page.locator('#learned .lc-cell .dl').count()) > 0);
check('era 1 has learned to take a free win', /It learned this one/.test(learned));
check('era 1 is still reported as beatable', /still finds lines where it loses/.test(learned));
if (SHOTS) await page.screenshot({ path: '/tmp/og-4-learned.png', fullPage: true });
await page.click('#learned [data-close]');
check('closing the learned dialog restores the application',
  await page.evaluate(() => !document.querySelector('#app').inert && !document.querySelector('#app').hasAttribute('aria-hidden')));

/* ---------- eras are frozen and replayable -------------------------- */
check('a new era appears in the dropdown',
  (await page.locator('#era-select option').count()) === 2);
await page.selectOption('#era-select', '0');
await page.waitForTimeout(300);
check('going back to Era 0 restores its own scoreboard',
  +(await page.locator('#score-row .sc.win .n').innerText()) > 0);
await page.selectOption('#era-select', '1');
await page.waitForTimeout(300);
check('Era 1 starts with a fresh scoreboard',
  (await page.locator('#score-row .sc.win .n').innerText()) === '0');

/* ---------- train to the ending ------------------------------------- */
/* one burst has already been run above, so start counting from there */
for (let i = 0; i < 8; i++) {
  if (!(await page.locator('#banner').isHidden())) break;
  await page.click('#btn-train');
  await page.waitForSelector('#learned:not([hidden])', { timeout: 30000 });
  await page.click('#learned [data-close]');
  await page.waitForTimeout(120);
}
/* the number of eras past Era 0 IS the number of bursts it took */
const bursts = (await page.locator('#era-select option').count()) - 1;
check('the arc reaches verified unbeatable between bursts 3 and 5', bursts >= 3 && bursts <= 5,
  'took ' + bursts + ' bursts');
check('the era that earned the banner is the one on the board',
  (await page.locator('#era-select').inputValue()) === String(bursts));
const banner = await page.locator('#banner').innerText();
check('the ending banner says you can no longer beat it',
  /You can no longer beat this/i.test(banner) && /tie/i.test(banner), banner.slice(0, 120));
check('the ending bridges to chess and language and to neural networks',
  /chess/i.test(banner) && /language/i.test(banner) && /neural network/i.test(banner));
check('the ending cites the proof rather than a win record',
  /complete game lines searched/i.test(banner) && /0 losses/.test(banner));
check('the console printed the verification for the final era',
  consoleLog.some(t => /VERDICT: UNBEATABLE/.test(t)));
if (SHOTS) await page.screenshot({ path: '/tmp/og-5-banner.png', fullPage: true });

/* The human really cannot win now. Play properly rather than clicking the
   first free square: take a win if there is one, block if there is one,
   otherwise pick at random -- how a person actually plays. */
await page.selectOption('#era-select', String(bursts));
async function readBoard() {
  return page.evaluate(() => Array.from(document.querySelectorAll('#board .cell'))
    .map(c => c.textContent.trim().startsWith('\u2715') ? 1
            : c.textContent.trim().startsWith('\u25EF') ? 2 : 0));
}
const LINES3 = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function pickHumanMove(b, me) {
  const them = me === 1 ? 2 : 1;
  const free = b.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
  for (const mark of [me, them])
    for (const L of LINES3) {
      const vals = L.map(i => b[i]);
      if (vals.filter(v => v === mark).length === 2 && vals.includes(0))
        return L[vals.indexOf(0)];
    }
  return free[(Math.random() * free.length) | 0];
}
let humanWins = 0, humanDraws = 0, played = 0;
for (let g = 0; g < 10; g++) {
  await page.click('#btn-newgame');
  await page.waitForTimeout(460);
  const meMark = /you are \u2715/.test(await page.locator('#status').innerText()) ? 1 : 2;
  for (let k = 0; k < 9; k++) {
    if (await page.locator('.cell.open:not([disabled])').count() === 0) break;
    const b = await readBoard();
    const cell = pickHumanMove(b, meMark);
    await page.click(`.cell[data-i="${cell}"]`);
    await page.waitForTimeout(460);
    const s = await page.locator('#status').innerText();
    if (/You win/.test(s)) { humanWins++; break; }
    if (/It beat you/.test(s)) break;
    if (/Drawn/.test(s)) { humanDraws++; break; }
  }
  played++;
}
check('ten games played properly against the final era produce no human win',
  humanWins === 0, 'human wins: ' + humanWins);
console.log(`        played ${played} games properly: ${humanWins} human wins, ${humanDraws} draws`);

/* ---------- in-browser self test ------------------------------------ */
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await page.click('#btn-settings');
await page.click('#btn-selftest');
await page.waitForFunction(() => !/working/.test(document.querySelector('#selftest-out').textContent),
  null, { timeout: 30000 });
const st = await page.locator('#selftest-out').innerText();
check('the in-app self-test passes for the final era', /all checks passed/.test(st), st);
check('the self-test proves uniformity, unbeatability and the blind-spot check',
  /chi-squared/.test(st) && /no losing line/.test(st) && /random opponent/.test(st));

/* ---------- ultimate tic-tac-toe -------------------------------------- */
await page.click('#settings [data-close]');
await page.waitForTimeout(150);
await page.click('#mode-seg button[data-mode="ult"]');
await page.waitForTimeout(400);
check('switching to ultimate shows the meta-grid of nine boards', await page.locator('#ult-meta .mb').count() === 9);
check('and one full-size board to actually play in', await page.locator('#ult-focus .cell').count() === 9);
check('the one-board view steps aside', await page.locator('#board-wrap').isHidden());
check('step 1 commentary does not follow you into step 3', await page.locator('#rule-fired').isHidden());
check('the match is won by three boards in a row, not by a count',
  /three in a row/i.test(await page.locator('#ult-where').innerText()));

/* THE rule. Exactly one of the two "where may I play" signals is ever up,
   and after a move the forced board is the one the played cell names. */
async function sendState() {
  return page.evaluate(() => {
    const mbs = Array.from(document.querySelectorAll('#ult-meta .mb'));
    return {
      sent: mbs.findIndex(b => b.classList.contains('sent')),
      open: mbs.filter(b => b.classList.contains('open')).length,
      where: document.querySelector('#ult-where').innerText,
      enabled: document.querySelectorAll('#ult-focus .cell:not([disabled])').length
    };
  });
}
let signalViolations = 0, sendMismatches = 0, turns = 0;
for (let i = 0; i < 12; i++) {
  const before = await sendState();
  if ((before.sent >= 0 ? 1 : 0) + (before.open > 0 ? 1 : 0) !== 1) signalViolations++;
  const cell = page.locator('#ult-focus .cell:not([disabled])').first();
  if (!(await cell.count())) break;
  const idx = Number(await cell.getAttribute('data-c'));
  await cell.click();
  await page.waitForTimeout(120);
  /* our own move must have sent IT to the board our cell names, unless
     that board is already finished */
  const after = await page.evaluate(i => {
    const mbs = Array.from(document.querySelectorAll('#ult-meta .mb'));
    return { done: mbs[i].classList.contains('done'), where: document.querySelector('#ult-where').innerText };
  }, idx);
  if (!after.done && !new RegExp('play in the ', 'i').test(after.where)) sendMismatches++;
  turns++;
  await page.waitForTimeout(600);
  if (/you-win|you-lose|drawn/.test(await page.locator('#status').getAttribute('class') || '')) break;
}
check('every turn offers exactly one of "you were sent here" / "play anywhere"',
  signalViolations === 0, signalViolations + ' turns showed both or neither');
check('the caption names the forced board on every turn it is forced',
  sendMismatches === 0 && turns > 4, `${sendMismatches} mismatches over ${turns} turns`);
check('only the forced board accepts a mark',
  await page.evaluate(() => {
    const sent = Array.from(document.querySelectorAll('#ult-meta .mb')).findIndex(b => b.classList.contains('sent'));
    if (sent < 0) return true;                    /* free choice: nothing to check */
    const mini = Array.from(document.querySelectorAll('#ult-meta .mb')[sent].querySelectorAll('i'))
      .map(i => i.className || '.').join(',');
    const full = Array.from(document.querySelectorAll('#ult-focus .cell'))
      .map(c => c.classList.contains('mk1') ? 'm1' : c.classList.contains('mk2') ? 'm2' : '.').join(',');
    return mini === full;                         /* the pane shows the board we were sent to */
  }), 'the full-size pane is not showing the forced board');

const ultBanner = await page.locator('#banner').innerText();
check('step 3 refuses a proof and says why', /cannot prove anything about it/i.test(ultBanner), ultBanner.slice(0, 140));
check('and reaches for the published one instead',
  /at most 43 moves/i.test(ultBanner) && /arXiv:2006\.02353/.test(ultBanner) &&
  /at least 29/i.test(ultBanner));
check('the citation carries the variant caveat rather than overclaiming',
  /near neighbours, not the same game/i.test(ultBanner));
check('it puts the countable scale beside the uncountable one',
  /255,168/.test(ultBanner) && /10³⁸/.test(ultBanner));
check('and states the point of the whole act',
  /a proof does not require checking every case/i.test(ultBanner));

/* look inside */
await page.click('#btn-brain');
await page.waitForTimeout(400);
const ultRead = await page.locator('#brain-readout').innerText();
check('the inspector scores one board at a time', /Scores for the .+ board only/.test(ultRead));
check('and names the two things that calculation cannot see',
  /nothing about where this board sits/i.test(ultRead) && /where the square you pick would send/i.test(ultRead),
  ultRead.slice(0, 160));
check('the focused board gets a heat value on every empty square',
  (await page.locator('#ult-focus .cell.heat').count()) >= 5);
if (SHOTS) await page.screenshot({ path: '/tmp/og-7-ultimate.png' });
await page.click('#btn-brain');

/* train */
const tUlt = Date.now();
await page.click('#btn-train');
await page.waitForSelector('#montage:not([hidden])');
await page.waitForTimeout(700);
check('the montage flickers through whole matches, not single boards',
  (await page.locator('#montage .miniu').count()) === 3);
check('the montage tracks it against the board-local player',
  /board-local player/i.test(await page.locator('#montage').innerText()));
await page.waitForSelector('#learned:not([hidden])', { timeout: 40000 });
check('an ultimate burst also lands inside five seconds', Date.now() - tUlt < 6000,
  (Date.now() - tUlt) + 'ms');
const ultCard = await page.locator('#learned-body').innerText();
check('the card leads with the control, then the finding',
  /the control/i.test(ultCard) && /a free win in a board/i.test(ultCard) &&
  /a move that wins the match/i.test(ultCard));
check('the card measures the send blindness against a chance rate',
  /blind choosing would/i.test(ultCard) && /free to avoid/i.test(ultCard));
check('the card races the two hand-written opponents against each other',
  /board-local rules/i.test(ultCard) && /plus the three clauses/i.test(ultCard));
check('the card counts how often anything comes round twice',
  /come round twice/i.test(ultCard) && /times each came round/i.test(ultCard));
check('and puts one board beside ultimate so the gap is visible',
  /one board/i.test(ultCard) && /ultimate/i.test(ultCard));
check('the card names what could not transfer',
  /could not carry over/i.test(ultCard));
if (SHOTS) await page.screenshot({ path: '/tmp/og-8-ultimate-card.png', fullPage: true });
await page.click('#learned [data-close]');

/* Ultimate results are intentionally sampled measurements, never a proof. */
await page.click('#btn-settings');
await page.click('#btn-selftest');
await page.waitForFunction(() => !/working/.test(document.querySelector('#selftest-out').textContent), null, { timeout: 30000 });
const ultSelftest = await page.locator('#selftest-out').innerText();
check('the ultimate self-test reports sampled benchmarks, not an exhaustive proof',
  /sampled benchmark/i.test(ultSelftest) && /measured, not proved/i.test(ultSelftest) &&
  !/all checks passed/i.test(ultSelftest), ultSelftest);
check('and recomputes the state-space count in front of the room',
  /18,753/.test(ultSelftest) && /2,694/.test(ultSelftest), ultSelftest);
await page.click('#settings [data-close]');

const perRound = (ultCard.match(/([\d.]+)×/g) || []);
check('the two recurrence figures are both reported', perRound.length >= 2, perRound.join(' '));

/* the era ledger keeps the two games apart */
await page.click('#mode-seg button[data-mode="one"]');
await page.waitForTimeout(300);
check('switching back restores the one-board game', !(await page.locator('#board-wrap').isHidden()));
const backBanner = await page.evaluate(() => {
  const el = document.querySelector('#banner');
  return { hidden: el.hidden, text: el.textContent.slice(0, 80) };
});
check('and the one-board banner comes back',
  !backBanner.hidden && /You can no longer beat this/i.test(backBanner.text),
  JSON.stringify(backBanner));
await page.click('#mode-seg button[data-mode="ult"]');
await page.waitForTimeout(300);

/* ---------- presenter notes, embedded in the single file -------------- */
await page.click('#btn-settings');
await page.waitForTimeout(150);
const settingsText = await page.locator('#settings').innerText();
check('Settings offers the presenter notes',
  /presenter notes/i.test(settingsText));
check('Settings offers presentation mode', /presentation mode/i.test(settingsText), settingsText.slice(0, 120));
check('Settings can reopen the how-to as well', /how to play/i.test(settingsText));
await page.click('#btn-howto-2');
check('the Settings entry really opens the how-to and closes Settings behind it',
  !(await page.locator('#howto').isHidden()) && await page.locator('#settings').isHidden());
await dismissHowto(page);
await page.click('#btn-settings');
await page.waitForTimeout(150);
await page.click('#btn-notes');
await page.waitForTimeout(300);
check('opening the notes closes Settings behind them', await page.locator('#settings').isHidden());
check('the notes open', !(await page.locator('#notes').isHidden()));
const notes = await page.locator('#notes-body').innerText();
check('the notes open on a stage cue card before the full guide',
  !(await page.locator('#stage-notes').isHidden()) &&
  /at a glance/i.test(await page.locator('#stage-notes').innerText()) &&
  await page.evaluate(() => {
    const card = document.querySelector('#stage-notes'), guide = document.querySelector('#notes .guide');
    return !!(card && guide) && (card.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }));
check('the cue card is distilled from the guide, not invented',
  /Do not train before the session/i.test(await page.locator('#stage-notes').innerText()));
check('the notes carry the timed script for all three steps',
  /STEP 1 . RULES \(5 MINUTES\)/i.test(notes) && /STEP 2 . LEARNING \(10 MINUTES\)/i.test(notes) &&
  /14:30/.test(notes));
check('the notes carry the discussion questions', /DISCUSSION QUESTIONS/i.test(notes));
check('the notes carry the misconceptions', /MISCONCEPTIONS TO DRAW OUT/i.test(notes));
check('the notes carry the third step', /STEP 3: ULTIMATE TIC-TAC-TOE/i.test(notes));
check('the notes are the whole guide, not an excerpt',
  (await page.locator('#notes .guide .beat').count()) >= 16,
  'timed beats found: ' + (await page.locator('#notes .guide .beat').count()));
check('the notes are readable rather than page-sized',
  await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#notes .guide')).fontSize)) > 11,
  await page.evaluate(() => getComputedStyle(document.querySelector('#notes .guide')).fontSize));
check('the notes render on paper white, not app navy',
  await page.evaluate(() => getComputedStyle(document.querySelector('#notes .guide')).backgroundColor) === 'rgb(255, 255, 255)');
check('opening the notes arms the print rules',
  await page.evaluate(() => document.body.classList.contains('notes-open')));
check('there is a print button', (await page.locator('#btn-print-notes').count()) === 1);
if (SHOTS) await page.screenshot({ path: '/tmp/og-9-notes.png' });

/* printing with the notes open must print the notes and nothing else */
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(150);
const printState = await page.evaluate(() => {
  const vis = el => el && getComputedStyle(el).display !== 'none';
  return {
    app: vis(document.querySelector('#app')),
    notes: vis(document.querySelector('#notes')),
    chrome: vis(document.querySelector('#notes .sheet-head')),
    cue: vis(document.querySelector('#stage-notes')),
    byline: vis(document.querySelector('.bh-credit')),
    guideSize: getComputedStyle(document.querySelector('#notes .guide')).fontSize,
    cols: getComputedStyle(document.querySelector('#notes .guide .cols')).columnCount,
    scheme: getComputedStyle(document.documentElement).colorScheme
  };
});
check('printing hides the app', !printState.app);
check('printing keeps the notes', printState.notes);
check('printing drops the sheet chrome', !printState.chrome);
check('printing drops the on-screen cue card, leaving the guide as printed',
  !printState.cue);
check('printing drops the floating byline', !printState.byline);
check('printing restores the page-sized type', parseFloat(printState.guideSize) < 12, printState.guideSize);
check('printing restores the two-column page', printState.cols === '2', printState.cols);
check('printing switches to a light colour scheme so the margins are white',
  /light/.test(printState.scheme), printState.scheme);
await page.emulateMedia({ media: 'screen' });

await page.click('#notes [data-close]');
await page.waitForTimeout(150);
check('closing the notes disarms the print rules',
  (await page.locator('#notes').isHidden()) &&
  !(await page.evaluate(() => document.body.classList.contains('notes-open'))));

/* ---------- presenter mode and seeded rehearsal ---------------------- */
await page.click('#btn-settings');
await page.waitForTimeout(150);
await page.check('#chk-presenter');
await page.waitForTimeout(200);
check('presenter mode enlarges the UI',
  await page.evaluate(() => document.body.classList.contains('presenter')));
const bigFont = await page.evaluate(() =>
  parseFloat(getComputedStyle(document.body).fontSize));
check('presenter mode really is bigger', bigFont > 20, bigFont + 'px');
if (SHOTS) { await page.click('#settings [data-close]'); await page.screenshot({ path: '/tmp/og-6-presenter.png' }); await page.click('#btn-settings'); }
await page.uncheck('#chk-presenter');

await page.fill('#in-seed', 'rehearsal-1');
await page.click('#btn-reset');
await page.waitForTimeout(300);
check('resetting returns to Era 0', (await page.locator('#era-select option').count()) === 1);
await page.click('#btn-train');
await page.waitForSelector('#learned:not([hidden])', { timeout: 30000 });
const seededA = await page.locator('#learned-body').innerText();
await page.click('#learned [data-close]');
await page.click('#btn-train');
await page.waitForSelector('#learned:not([hidden])', { timeout: 30000 });
const twoBurstNoReopen = await page.locator('#learned-body').innerText();
await page.click('#learned [data-close]');
await page.click('#btn-settings');
await page.fill('#in-seed', 'rehearsal-1');
await page.click('#btn-reset');
await page.click('#btn-train');
await page.waitForSelector('#learned:not([hidden])', { timeout: 30000 });
const seededB = await page.locator('#learned-body').innerText();
check('the same seed reproduces the same training run exactly', seededA === seededB,
  seededA.slice(0, 90) + '\n        vs\n        ' + seededB.slice(0, 90));
await page.click('#learned [data-close]');
await page.click('#btn-learned');
await page.waitForSelector('#learned:not([hidden])');
await page.click('#learned [data-close]');
await page.click('#btn-train');
await page.waitForSelector('#learned:not([hidden])', { timeout: 30000 });
const twoBurstAfterReopen = await page.locator('#learned-body').innerText();
check('reopening an ultimate report cannot alter the next seeded burst', twoBurstNoReopen === twoBurstAfterReopen,
  twoBurstNoReopen.slice(0, 90) + '\n        vs\n        ' + twoBurstAfterReopen.slice(0, 90));
await page.click('#learned [data-close]');

/* Per-mode live streams: consuming one-board tie-breaking must not affect
   the very first ultimate reply in the same rehearsed session. */
async function firstUltReply(withOneBoardPlay) {
  await page.click('#btn-settings');
  await page.fill('#in-seed', 'live-stream-isolation');
  if (!(await page.locator('#chk-first').isChecked())) await page.check('#chk-first');
  await page.click('#btn-reset');
  await page.waitForTimeout(150);
  if (withOneBoardPlay) {
    await page.click('#mode-seg button[data-mode="one"]');
    await page.locator('#board .cell.open:not([disabled])').first().click();
    await page.waitForTimeout(520);
  }
  await page.click('#mode-seg button[data-mode="ult"]');
  await page.waitForTimeout(150);
  await page.locator('#ult-focus .cell.open:not([disabled])').first().click();
  await page.waitForTimeout(560);
  return page.evaluate(() => Array.from(document.querySelectorAll('#ult-meta .mb')).map(b =>
    Array.from(b.querySelectorAll('i')).map(i => i.className).join(',')).join('|'));
}
const ultReplyClean = await firstUltReply(false);
const ultReplyAfterOne = await firstUltReply(true);
check('one-board live play cannot change the first seeded ultimate AI reply',
  ultReplyClean === ultReplyAfterOne, ultReplyClean + '\n        vs\n        ' + ultReplyAfterOne);

/* ---------- explainer ------------------------------------------------ */
await page.click('#how-head');
await page.waitForTimeout(200);
const how = await page.locator('#how-body').innerText();
check('the explainer covers rewards, exploration and why it plays badly early',
  /\+1/.test(how) && /explore/i.test(how) && /stupid moves early/i.test(how));
check('the explainer is honest that this is a lookup table, not a neural network',
  /lookup table/i.test(how) && /neural network/i.test(how));
check('the explainer credits MENACE and Michie',
  /MENACE/.test(how) && /Michie/.test(how) && /matchbox/i.test(how));
check('the explainer admits the montage is paced for the audience',
  /montage is deliberately stretched/i.test(how));

/* ---------- Murray State identity ------------------------------------ */
const brand = await page.locator('#brandbar').innerText();
check('the brand bar carries the university name', /murray state university/i.test(brand), brand);
const palette = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return ['--navy', '--gold', '--lite', '--warm'].map(v => cs.getPropertyValue(v).trim().toUpperCase());
});
check('the palette is the official one (navy #002144, gold #ECAC00, accents)',
  palette[0] === '#002144' && palette[1] === '#ECAC00' &&
  palette[2] === '#00A4E3' && palette[3] === '#FF4500', palette.join(' '));
check('the footer credits the university',
  /murray state university/i.test(await page.locator('#foot').innerText()));

/* ---------- the layout holds on real phone sizes --------------------- */
/* The TRAIN button is the whole product. If a student has to scroll to
   find it the demo stalls, so this is checked at every size rather than
   eyeballed once. */
const SIZES = [
  ['iPhone SE portrait', 375, 667], ['iPhone 15 portrait', 393, 852],
  ['Android portrait', 412, 915], ['small Android', 360, 640],
  ['narrow phone', 320, 568], ['phone landscape', 926, 428],
  ['tablet portrait', 820, 1180], ['laptop', 1440, 900]
];
for (const [label, w, h] of SIZES) {
  for (const mode of ['one', 'ult']) {
  const vp = await ctx.newPage();
  const vErrors = [];
  vp.on('pageerror', e => vErrors.push(e.message));
  await vp.setViewportSize({ width: w, height: h });
  await vp.goto(FILE);
  await vp.waitForSelector('#board .cell');
  await dismissHowto(vp);
  if (mode === 'ult') { await vp.click('#mode-seg button[data-mode="ult"]'); await vp.waitForTimeout(150); }
  const m = await vp.evaluate((mode) => {
    const r = el => document.querySelector(el).getBoundingClientRect();
    const board = r(mode === 'ult' ? '#ult-focus' : '#board'), train = r('#btn-train');
    return {
      trainBottom: Math.round(train.bottom), vh: window.innerHeight,
      board: Math.round(board.width),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      square: Math.abs(board.width - board.height) < 2,
      small: Array.from(document.querySelectorAll('button, select')).filter(el => {
        if (!el.offsetParent) return false;
        const b = el.getBoundingClientRect();
        return b.height > 0 && b.height < 40;
      }).map(el => (el.id || el.className) + ':' + Math.round(el.getBoundingClientRect().height))
    };
  }, mode);
  const tag = `${label} (${w}x${h}, ${mode === 'ult' ? 'ultimate' : 'one board'})`;
  check(`${tag}: TRAIN button is reachable without scrolling`,
    m.trainBottom <= m.vh, `train bottom ${m.trainBottom} of ${m.vh}`);
  check(`${tag}: no horizontal scrolling`, m.overflow <= 0, m.overflow + 'px');
  check(`${tag}: the board you tap is square and big enough`, m.square && m.board >= 140,
    `${m.board}px wide, square=${m.square}`);
  check(`${tag}: every control stays at least 40px tall`, m.small.length === 0, m.small.join(', '));
  check(`${tag}: renders without script errors`, vErrors.length === 0, vErrors.join(' | '));
  await vp.close();
  }
}

/* ---------- presenter mode on a projector ---------------------------- */
for (const [label, w, h] of [['720p projector', 1280, 800], ['1080p projector', 1920, 1080]]) {
  const pp = await ctx.newPage();
  await pp.setViewportSize({ width: w, height: h });
  await pp.goto(FILE);
  await pp.waitForSelector('#board .cell');
  await dismissHowto(pp);
  await pp.click('#btn-settings');
  await pp.check('#chk-presenter');
  await pp.click('#settings [data-close]');
  await pp.waitForTimeout(200);
  const m = await pp.evaluate(() => {
    const r = el => document.querySelector(el).getBoundingClientRect();
    return { train: Math.round(r('#btn-train').bottom), vh: window.innerHeight,
             board: Math.round(r('#board').width),
             cols: Math.round(r('#col-b').left) > Math.round(r('#col-a').right) - 5 };
  });
  check(`presenter mode on a ${label}: still two columns`, m.cols,
    'columns overlap or stacked');
  check(`presenter mode on a ${label}: TRAIN button on screen`, m.train <= m.vh,
    `train bottom ${m.train} of ${m.vh}`);
  check(`presenter mode on a ${label}: board is big enough to read from the back`,
    m.board >= 320, m.board + 'px');
  await pp.close();
}

/* ---------- layout sanity -------------------------------------------- */
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('nothing overflows a 390px phone viewport horizontally', overflow <= 0, overflow + 'px');
const tapTargets = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button, select')).filter(el => {
    if (!el.offsetParent) return false;
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.height < 40;
  }).map(el => (el.id || el.className) + ' ' + Math.round(el.getBoundingClientRect().height)));
check('every visible control is at least 40px tall for a thumb',
  tapTargets.length === 0, tapTargets.join(', '));

check('no console errors during the whole session', consoleErrors.length === 0,
  consoleErrors.slice(0, 5).join('\n        '));

await browser.close();
console.log('\n' + '='.repeat(64));
console.log(failures ? failures + ' integration check(s) failed' : 'all integration checks passed');
process.exit(failures ? 1 : 0);

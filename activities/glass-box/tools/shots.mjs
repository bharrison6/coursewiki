// Screenshot pass for visual review at phone size.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, '..', 'index.html');
const out = (n) => path.join(here, '..', '..', 'shots', n);

const browserPath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
const browser = await chromium.launch(browserPath ? { executablePath: browserPath } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url);
await page.waitForFunction(() => document.getElementById('livesample').textContent.includes('era 0'), null, { timeout: 30000 });

await page.screenshot({ path: out('00-howto.png') });   // the how-to card, shown on every load
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
await page.screenshot({ path: out('01-act1-top.png') });
await page.click('#pmap .prow'); // open weight peek
await page.$eval('#wpeek', (el) => el.scrollIntoView({ block: 'center' }));
await page.screenshot({ path: out('02-act1-pmap.png') });

// train two eras
await page.$eval('#trainbtn', (el) => el.scrollIntoView({ block: 'center' }));
await page.click('#trainbtn');
await page.waitForFunction(() => document.querySelectorAll('#erachips .chip').length >= 2, null, { timeout: 120000 });
await page.click('#trainbtn');
await page.waitForFunction(() => document.querySelectorAll('#erachips .chip').length >= 3, null, { timeout: 120000 });
await page.$eval('#losschart', (el) => el.scrollIntoView({ block: 'center' }));
await page.screenshot({ path: out('03-act1-trained.png') });

await page.$eval('#probbars', (el) => el.scrollIntoView({ block: 'center' }));
await page.screenshot({ path: out('04-act1-playground.png') });

await page.$$eval('#atttext span', (spans) => spans[18] && spans[18].click());
await page.$eval('#atttext', (el) => el.scrollIntoView({ block: 'center' }));
await page.screenshot({ path: out('05-act1-attention.png') });

// Act 2 full run
await page.click('#nav2');
await page.screenshot({ path: out('06-act2-top.png') });
await page.click('#a2trainbtn');
await page.waitForFunction(() => !document.getElementById('votebtn').disabled, null, { timeout: 420000 });
await page.$eval('#accD', (el) => el.scrollIntoView({ block: 'center' }));
await page.screenshot({ path: out('07-act2-results.png') });
await page.$eval('#exD', (el) => el.scrollIntoView({ block: 'center' }));
await page.screenshot({ path: out('08-act2-exams.png') });
await page.click('#votebtn');
await page.waitForFunction(() => document.getElementById('votebtn').textContent.includes('again'), null, { timeout: 300000 });
await page.$eval('#votebars', (el) => el.scrollIntoView({ block: 'center' }));
await page.screenshot({ path: out('09-act2-vote.png') });
await page.click('#starbtn');
await page.waitForFunction(() => document.querySelectorAll('#starbars .vb').length >= 2, null, { timeout: 300000 });
await page.click('#starbtn');
await page.waitForFunction(() => document.querySelectorAll('#starbars .vb').length >= 3, null, { timeout: 300000 });
await page.$eval('#starbars', (el) => el.scrollIntoView({ block: 'center' }));
await page.screenshot({ path: out('10-act2-star.png') });

// Act 3
await page.click('#nav3');
await page.screenshot({ path: out('11-act3-top.png') });
await page.click('#agmode-you');
await page.$eval('#candidates', (el) => el.scrollIntoView({ block: 'center' }));
await page.screenshot({ path: out('12-act3-you.png') });
await page.click('#agreset');
await page.click('#agmode-auto');
await page.waitForFunction(() => document.querySelector('#transcript .turn.final'), null, { timeout: 60000 });
await page.$eval('#transcript', (el) => el.scrollIntoView({ block: 'end' }));
await page.screenshot({ path: out('13-act3-final.png') });

// desktop width check
await page.setViewportSize({ width: 1280, height: 800 });
await page.click('#nav1');
await page.screenshot({ path: out('14-desktop-act1.png') });

await browser.close();
console.log('shots done');

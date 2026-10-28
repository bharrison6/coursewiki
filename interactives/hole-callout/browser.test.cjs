const test = require('node:test');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const browserURL = process.env.COURSEWIKI_BROWSER_URL;
if (!chromium || !browserURL) {
  test('hole-callout browser acceptance', { skip: 'Requires Playwright and COURSEWIKI_BROWSER_URL' }, () => {});
} else {
// Run after build-site.ps1. Set PLAYWRIGHT_MODULE and CHROMIUM_PATH to installed tools.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const artifacts = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'coursewiki-hole-callout-'));
fs.mkdirSync(artifacts, { recursive: true });
const url = file => new URL(file, browserURL.replace(/\/?$/, '/')).href;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const pages = [['dimension-anatomy-and-placement',5,5],['choosing-dimensions',5,4],['hole-and-feature-callouts',6,4]];
    for (const [id, cards, images] of pages) {
      await page.goto(url(`engineering-graphics/${id}.html`));
      assert.equal(await page.locator('.xcard').count(), cards);
      assert.equal(await page.locator('.xcard[open]').count(), 0);
      await page.locator('.xcard > summary').first().click();
      assert.equal(await page.locator('.xcard[open]').count(), 1, 'positive control: card opens');
      await page.locator('.xcard').evaluateAll(nodes => nodes.forEach(n => n.open = true));
      const figures = page.locator('img[src*="dimensioning/"]');
      assert.equal(await figures.count(), images);
      assert.ok(await figures.evaluateAll(nodes => nodes.every(n => n.complete && n.naturalWidth > 0)));
      for (const skin of ['light','dark']) {
        await page.evaluate(s => document.documentElement.setAttribute('data-theme',s), skin);
        await page.setViewportSize({width:375,height:900});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${id} ${skin} mobile overflow`);
        assert.deepEqual(await page.locator('.xcard img, .xcard input, .xcard select, .xcard pre, .xcard svg').evaluateAll(nodes => nodes.filter(n => {
          const b=n.getBoundingClientRect(); return b.width && (b.right>innerWidth+1 || b.left < -1);
        }).map(n=>n.tagName)), [], `${id} ${skin} clipped content`);
      }
      // Prove this overflow probe can detect a real oversized child.
      assert.ok(await page.evaluate(() => {
        const probe=document.createElement('img'); probe.style.width='2000px'; probe.style.maxWidth='none';
        document.querySelector('.xcard').append(probe);
        const detected=[...document.querySelectorAll('.xcard img, .xcard input, .xcard select, .xcard pre, .xcard svg')].some(n=>{
          const b=n.getBoundingClientRect(); return b.width && (b.right>innerWidth+1 || b.left < -1);
        }); probe.remove(); return detected;
      }));
      await page.setViewportSize({width:1280,height:900});
    }
    const module = page.locator('[data-interactive="hole-callout"]');
    assert.equal(await module.locator('.hc-live').count(),1);
    for (const type of ['through','blind','counterbore','countersink','spotface']) {
      await module.locator('[data-hc="type"]').selectOption(type);
      assert.equal(await module.locator('.hc-error').textContent(),'');
      assert.equal(await module.locator('svg').count(),1);
    }
    await module.locator('[data-hc="type"]').selectOption('counterbore');
    await module.locator('[data-hc="recess"]').fill('.100');
    assert.match(await module.locator('.hc-error').textContent(),/must exceed/);
    assert.equal(await module.locator('.hc-result').isVisible(),false);
    await module.locator('[data-hc-reset]').click();
    assert.match(await module.locator('.hc-callout').textContent(),/⌴ ⌀.600 ↧ .150/);
    await module.screenshot({path:path.join(artifacts,'module-dark.png')});
    await page.evaluate(() => {
      const original=document.querySelector('[data-interactive="hole-callout"]');
      const second=document.createElement('div'); second.dataset.interactive='hole-callout'; original.after(second);
    });
    await page.addScriptTag({path:path.join(__dirname,'demo.js')});
    const roots=page.locator('[data-interactive="hole-callout"]');
    assert.equal(await roots.count(),2);
    assert.equal(await roots.nth(0).locator('.hc-live').count(),1);
    await roots.nth(1).locator('[data-hc="diameter"]').fill('.200');
    assert.match(await roots.nth(0).locator('.hc-callout').textContent(),/⌀.300/);
    assert.match(await roots.nth(1).locator('.hc-callout').textContent(),/⌀.200/);
    await roots.nth(1).evaluate(n=>n.remove());
    await page.emulateMedia({media:'print'});
    assert.equal(await roots.nth(0).locator('.hc-static').isVisible(),true);
    assert.equal(await roots.nth(0).locator('.hc-live').isVisible(),false);
    await page.emulateMedia({media:'screen'});
    await page.goto(url('practice.html'));
    const expected = {
      'line-role':[2,1], 'placement-choice':[1,2], 'spacing-sheet':[10,5],
      'redundant-chain':[3,1], 'reference-reading':[2,1], 'count-plate':[6,5],
      'count-pair':[8,9], 'view-choice':[1,2], 'main-hole-size':[.312,.625],
      'counterbore-size':[.625,.312], 'counterbore-depth':[.187,.625],
      'blind-depth':[.48,.24], 'countersink-angle':[82,41], 'repeat-count':[6,1.08],
      'slot-length':[1.90-.50,1.65], 'inch-decimal':[.625,625], 'trailing-zeros':[2,1]
    };
    assert.equal(await page.locator('[data-practice-id^="dimension-"]').count(),17);
    for(const [id,[right,wrong]] of Object.entries(expected)) {
      const item=page.locator(`[data-practice-id="dimension-${id}"]`);
      await item.evaluate(n=>{for(let p=n.parentElement;p;p=p.parentElement) if(p.tagName==='DETAILS')p.open=true;});
      const input=item.locator('[data-practice-input]');
      const select=await input.evaluate(n=>n.tagName==='SELECT');
      for(const [value,correct] of [[wrong,false],[right,true]]) {
        if(select) await input.selectOption(String(value)); else await input.fill(String(value));
        await item.locator('[data-practice-check]').click();
        const feedback=await item.locator('[data-practice-feedback]').textContent();
        assert.ok(correct ? feedback.startsWith('Correct') : feedback.startsWith('Not yet'),`${id}: ${feedback}`);
      }
    }
    assert.deepEqual(errors,[]);
    // Inspect every original SVG at readable size, saved as four contact sheets.
    const files=fs.readdirSync(path.join(root,'media/engineering-graphics/dimensioning')).filter(n=>n.endsWith('.svg'));
    for(let start=0;start<files.length;start+=4) {
      await page.setViewportSize({width:1640,height:1000});
      await page.setContent('<style>body{margin:0;background:white;display:grid;grid-template-columns:820px 820px}figure{margin:0}svg{width:820px}</style>'+files.slice(start,start+4).map(file=>'<figure>'+fs.readFileSync(path.join(root,'media/engineering-graphics/dimensioning',file),'utf8')+'</figure>').join(''));
      await page.screenshot({path:path.join(artifacts,`diagrams-${start/4+1}.png`),fullPage:true});
    }
    // No-JS print comparison checks the browser's real details-content behavior.
    const nojs=await browser.newContext({javaScriptEnabled:false});
    const print=await nojs.newPage();
    await print.goto(url('print/section-engineering-graphics.html'));
    await print.pdf({path:path.join(artifacts,'closed.pdf'),format:'Letter',printBackground:true});
    await print.locator('.xcard').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
    await print.pdf({path:path.join(artifacts,'open.pdf'),format:'Letter',printBackground:true});
    console.log('PASS: 16 cards, 13 images, light/dark 375px layout with positive overflow control, five hole types, invalid-input rejection, two independent roots, static print, all 17 practice keys plus wrong-answer controls. Print comparison artifacts saved.');
    await context.close(); await nojs.close();
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

}

'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const B = require('../../tests/support/browser.cjs');
const evidence = path.join(os.tmpdir(),'acc-det130-wood-attachment-clearance');
const baseURL = (B.browserURL || '').replace(/\/+$/,'');
const lessonURL = baseURL + '/materials-and-processes/grain-and-moisture-movement.html';
async function openLesson(page, present = false) {
  const response = await page.goto(lessonURL + (present ? '?p=det-130&present=1' : ''));
  assert.equal(response.status(),200,'lesson HTTP response');
  await page.evaluate(() => document.querySelectorAll('details.xcard').forEach(n=>n.open=true));
  await page.locator('.wm-live').waitFor();
}
test('first use, keyboard, invalid recovery, unit conversion, themes and phones in both reading modes', {skip:B.skip}, async () => {
  fs.mkdirSync(evidence,{recursive:true});
  const browser = await B.launch();
  try {
    for (const width of [1280,390,375]) for (const theme of ['light','dark']) for (const present of [false,true]) {
      const context = await browser.newContext({viewport:{width,height:1000},colorScheme:theme});
      const page = await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      await openLesson(page,present);
      await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
      const lab=page.locator('.wm-live').first(), field=k=>lab.locator(`[data-wm="${k}"]`);
      const result=lab.locator('[data-wm-result]'), feedback=lab.locator('[data-wm-feedback]');
      assert.match(await result.textContent(),/At installation/);
      assert.equal(await lab.locator('.wm-case').count(),2);
      await lab.screenshot({path:path.join(evidence,`${width}-${theme}-${present?'present':'read'}-first.png`)});
      // A real keyboard activation; no synthetic DOM shortcut to the answer.
      await lab.locator('[data-wm-apply]').focus(); await page.keyboard.press('Enter');
      assert.match(await feedback.textContent(),/Choose a prediction/);
      assert.equal(await lab.locator('[data-wm-prediction]').evaluate(n=>n===document.activeElement),true);
      await lab.locator('[data-wm-prediction]').selectOption('half');
      await lab.locator('[data-wm-apply]').focus(); await page.keyboard.press('Space');
      assert.match(await result.textContent(),/\+0.0673 in; final width: 9.2173 in/);
      assert.match(await feedback.textContent(),/Prediction matches/);
      assert.match(await lab.locator('[data-anchor="center"]').textContent(),/\+0.0336 in outward/);
      assert.match(await lab.locator('[data-anchor="left-edge"]').textContent(),/exceeds by 0.0273/);
      assert.equal(await lab.locator('.wm-exceeded').count(),1);
      await lab.screenshot({path:path.join(evidence,`${width}-${theme}-${present?'present':'read'}-applied.png`)});
      await field('finalMC').fill('6');
      assert.match(await result.textContent(),/−0.0448 in/);
      assert.match(await lab.locator('[data-anchor="center"]').textContent(),/−0.0224 in inward/);
      assert.equal(await lab.locator('.wm-exceeded').count(),3);
      await field('finalMC').fill('14'); await field('finalMC').fill('11');
      assert.match(await result.textContent(),/\+0.0673 in/);
      for (const value of ['5','15','']) {
        await field('finalMC').fill(value);
        assert.match(await result.textContent(),/No estimate/);
        assert.equal(await lab.locator('svg').count(),0,'invalid input clears old drawing');
      }
      await field('finalMC').fill('11');
      await lab.locator('.wm-settings > summary').first().click();
      await field('unit').selectOption('mm');
      assert.ok(Math.abs(Number(await field('dimension').inputValue())-232.41)<1e-9);
      assert.ok(Math.abs(Number(await field('outward').inputValue())-1.016)<1e-9);
      assert.ok(Math.abs(Number(await field('inward').inputValue())-.508)<1e-9);
      assert.match(await result.textContent(),/\+1.708 mm; final width: 234.118 mm/);
      await field('unit').selectOption('in');
      assert.match(await result.textContent(),/\+0.0673 in/);
      await field('outward').fill('0.03362625');
      assert.match(await lab.locator('[data-anchor="center"]').textContent(),/at travel limit/);
      await field('inward').fill('-1'); assert.match(await result.textContent(),/No estimate/);
      await field('inward').fill('0.02');
      await field('dimension').fill('0'); assert.match(await result.textContent(),/positive starting dimension/);
      await field('dimension').fill('9.15');
      await field('initialMC').fill('0.08'); assert.match(await result.textContent(),/No estimate/);
      await field('initialMC').fill('8');
      await field('orientation').selectOption('quarter-width');
      assert.match(await result.textContent(),/\+0.0307 in/);
      await field('speciesIndex').selectOption('0');
      assert.match(await result.textContent(),/\+0.0464 in/); // corrected white-ash radial row
      await field('orientation').selectOption('flat-width');
      assert.match(await result.textContent(),/\+0.0752 in/); // corrected white-ash tangential row
      // Overflow probe: positive control fails, removal restores clean measurement.
      const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1 || [...document.querySelectorAll('.wm-live, .wm-live *, #wm-overflow-control')].some(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.left < -1||r.right>window.innerWidth+1);}));
      assert.equal(await overflow(),false,`${width} ${theme} ${present} expanded controls overflow`);
      await page.evaluate(()=>{const n=document.createElement('div');n.id='wm-overflow-control';n.style.width='2000px';document.body.append(n);});
      assert.equal(await overflow(),true); await page.locator('#wm-overflow-control').evaluate(n=>n.remove());
      assert.equal(await overflow(),false);
      await lab.screenshot({path:path.join(evidence,`${width}-${theme}-${present?'present':'read'}-settings.png`)});
      await lab.locator('[data-wm-reset]').click(); assert.match(await result.textContent(),/At installation/);
      assert.equal(await field('dimension').inputValue(),'9.15');
      assert.deepEqual(errors,[]);
      if (width===1280 && theme==='light' && !present) {
        await page.evaluate(()=>{const first=document.querySelector('[data-interactive="wood-movement"]');const copy=first.cloneNode(true);copy.querySelector('.wm-live').remove();copy.classList.remove('wm-ready');delete copy.dataset.wmReady;first.after(copy);});
        const src=await page.locator('script[src*="wood-movement/demo.js"]').getAttribute('src');
        await page.addScriptTag({url:new URL(src,page.url()).href}); await page.addScriptTag({url:new URL(src,page.url()).href});
        assert.equal(await page.locator('.wm-live').count(),2,'each root initializes once');
        const second=page.locator('.wm-live').nth(1);
        await second.locator('[data-wm-prediction]').selectOption('same'); await second.locator('[data-wm-apply]').click();
        assert.match(await second.locator('[data-wm-feedback]').textContent(),/Compare the two right edges/);
        assert.match(await result.textContent(),/At installation/,'first root remains independent');
        await page.locator('[data-interactive="wood-movement"]').nth(1).evaluate(n=>n.remove());
        await page.emulateMedia({media:'print'});
        assert.equal(await lab.isVisible(),false); assert.equal(await page.locator('.wm-static').isVisible(),true);
        await page.pdf({path:path.join(evidence,'lesson-js-print.pdf'),format:'Letter',printBackground:true,margin:{top:'.5in',bottom:'.5in',left:'.5in',right:'.5in'}});
      }
      await context.close();
    }
    console.log('Wood evidence: '+evidence);
  } finally {await browser.close();}
});
test('no-JS searchable fallback, offline aggregate and native practice checker', {skip:B.skip}, async () => {
  fs.mkdirSync(evidence,{recursive:true}); const browser=await B.launch();
  try {
    const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:1000}});
    const page=await context.newPage(); assert.equal((await page.goto(lessonURL)).status(),200);
    await page.locator('details.xcard').filter({has:page.locator('.wm-static')}).locator('summary').first().click();
    const fallback=page.locator('[data-interactive="wood-movement"] .wm-static');
    assert.equal(await fallback.isVisible(),true);
    assert.match(await fallback.textContent(),/0.0336 in outward/); assert.match(await fallback.textContent(),/point-travel equation is derived geometry/);
    await page.screenshot({path:path.join(evidence,'390-nojs.png'),fullPage:true});
    await page.pdf({path:path.join(evidence,'lesson-nojs-print.pdf'),format:'Letter',printBackground:true,margin:{top:'.5in',bottom:'.5in',left:'.5in',right:'.5in'}});
    const search=await (await page.request.get(baseURL+'/search-index.js')).text();
    assert.match(search,/center fixing/i); assert.match(search,/attachment clearance/i);
    await context.close();
    const offline=await browser.newContext(); const aggregate=await offline.newPage(),requests=[];
    await aggregate.route('**/*',route=>{if(route.request().isNavigationRequest())return route.continue();requests.push(route.request().url());return route.abort();});
    assert.equal((await aggregate.goto(baseURL+'/print/track-det-130.html')).status(),200);
    await aggregate.evaluate(()=>document.querySelectorAll('details.xcard').forEach(n=>n.open=true));
    const lab=aggregate.locator('.wm-live'); await lab.waitFor();
    await lab.locator('[data-wm-prediction]').selectOption('half'); await lab.locator('[data-wm-apply]').click();
    assert.match(await lab.locator('[data-wm-result]').textContent(),/\+0.0673 in/);
    assert.deepEqual(requests.filter(url=>url.startsWith(baseURL+'/')),[],'aggregate has no sibling asset requests');
    assert.ok(requests.every(url=>url.startsWith('https://fonts.googleapis.com/')),'only the shared optional font request is attempted, and it is blocked');
    await offline.close();
    const practice=await browser.newPage(); assert.equal((await practice.goto(baseURL+'/practice.html#wood-movement-center-travel')).status(),200);
    for (const [id,right,wrong] of [['center-travel','.0336','.0673'],['edge-travel','.0673','.0336'],['inward-travel','-.0224','.0224'],['interior-point','.0168','.0336']]) {
      const panel=practice.locator('#wood-movement-'+id);
      await panel.locator('[data-practice-input]').fill(wrong); await panel.locator('[data-practice-check]').click(); assert.equal(await panel.getAttribute('data-state'),'incorrect');
      await panel.locator('[data-practice-input]').fill(right); await panel.locator('[data-practice-check]').click(); assert.equal(await panel.getAttribute('data-state'),'correct');
    }
    const choice=practice.locator('#wood-movement-directional-window');
    await choice.locator('[data-practice-input]').selectOption('1'); await choice.locator('[data-practice-check]').click();
    assert.match(await choice.locator('[data-practice-feedback]').textContent(),/review the choices/);
    await choice.locator('[data-practice-input]').selectOption('2'); await choice.locator('[data-practice-check]').click();
    assert.match(await choice.locator('[data-practice-feedback]').textContent(),/your choice is correct/);
    await practice.close();
  } finally {await browser.close();}
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {resolveBrowser}=require('../../tests/support/browser.cjs');
const fixture=process.env.COURSEWIKI_FIXTURE_ROOT;
const B=resolveBrowser({...process.env,COURSEWIKI_BROWSER_URL:fixture?'https://coursewiki.fixture':process.env.COURSEWIKI_BROWSER_URL});
const base=(B.browserURL||'').replace(/\/+$/,''),evidence=process.env.COURSEWIKI_EVIDENCE||path.join(os.tmpdir(),'acc-det130-transfer-batch-flow');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
async function routed(context,offline=false) {
  const blocked=[];
  if(fixture) await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base || (offline&&!route.request().isNavigationRequest())) {blocked.push(url.href);return route.abort();}
    const segments=decodeURIComponent(url.pathname).split('/').filter(Boolean);
    if(segments.some(p=>p==='..'||p==='.'||p.includes('\\')))return route.fulfill({status:404,body:'Invalid path'});
    let file=path.resolve(fixture);
    for(const segment of segments) {if(!fs.readdirSync(file).includes(segment))return route.fulfill({status:404,body:'Case-exact missing file'});file=path.join(file,segment);}
    return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  else if(offline)await context.route('**/*',route=>route.request().isNavigationRequest()?route.continue():(blocked.push(route.request().url()),route.abort()));
  return blocked;
}
async function open(page,present=false) {
  assert.equal((await page.goto(base+'/lean/value-stream-mapping.html'+(present?'?p=det-130&present=1':''))).status(),200);
  // Native summary activation, not attribute forcing, tests the shipped guard.
  const card=page.locator('details.xcard').filter({has:page.locator('[data-interactive="transfer-batch-flow"]')});
  if(await card.getAttribute('open')===null) {await card.locator(':scope > summary').focus();await page.keyboard.press('Enter');}
  await page.locator('.tb-live').waitFor();
  return page.locator('[data-interactive="transfer-batch-flow"] .tb-live').first();
}
test('actual Chrome routed fixture/no listener: phone/theme/presentation, prediction, exact evidence, native keys', {skip:B.skip},async()=>{
  fs.mkdirSync(evidence,{recursive:true});const browser=await B.launch();
  let checks=0;
  try{
    for(const width of [1280,390,320])for(const theme of ['light','dark'])for(const present of [false,true]){
      const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme});await routed(context);
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
      const lab=await open(page,present),field=k=>lab.locator(`[data-tb="${k}"]`);
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      assert.equal(await lab.locator('.tb-case').count(),1);checks++;
      assert.match(await field('plots').textContent(),/46 min/);checks++;
      if(theme==='light'&&!present) {
        await lab.evaluate(n=>window.scrollBy(0,n.getBoundingClientRect().top-95));
        await page.screenshot({path:path.join(evidence,`${width}-first-use.png`)});
      }
      await field('test').focus();await page.keyboard.press('Space');assert.match(await field('status').textContent(),/Choose a prediction/);checks++;
      await field('prediction').selectOption('both');await field('test').focus();await page.keyboard.press('Enter');
      assert.match(await field('status').textContent(),/46 → 10 min; full order: 100 → 64/);checks++;
      assert.equal(await lab.locator('.tb-case').count(),2);checks++;
      await field('job').selectOption('10');assert.match(await field('detail').textContent(),/64 min elapsed.*36 waiting before A.*18 waiting at B/s);checks++;
      await lab.locator('.tb-settings > summary').focus();await page.keyboard.press('Enter');
      await field('n').fill('5');await field('batch').fill('2');await field('a').fill('3');await field('b').fill('2');
      assert.match(await field('status').textContent(),/first 8 min, full order 18 min/);checks++;
      assert.equal(await lab.locator('[data-release="15"]').count(),2);checks++; // baseline and changed both finish A at15
      for(const [k,val] of [['batch','0'],['a','1.5'],['b','21'],['n','']]){
        const old=await field(k).inputValue();await field(k).fill(val);assert.equal(await field('plots').locator('svg').count(),0);checks++;assert.match(await field('status').textContent(),/No schedule is shown/);checks++;await field(k).fill(old);
      }
      await field('n').fill('1');await field('batch').fill('1');await field('a').fill('20');await field('b').fill('1');
      assert.match(await field('status').textContent(),/first 21 min, full order 21 min/);checks++;
      await field('n').fill('20');await field('batch').fill('20');await field('a').fill('20');await field('b').fill('20');
      assert.match(await field('status').textContent(),/first 420 min, full order 800 min/);checks++;
      assert.equal(await field('plots').locator('[data-station]').count(),80);checks++;
      await field('reset').click();await field('prediction').selectOption('first');await field('test').click();
      assert.match(await field('status').textContent(),/Compare the result with your prediction/);checks++;
      const timeline=lab.locator('.tb-scroll').first();
      if(width<500){
        const url=page.url();await timeline.focus();await page.keyboard.press('ArrowRight');
        assert.equal(page.url(),url,'horizontal timeline owns arrow key');checks++;
        await page.waitForTimeout(200);assert.ok(await timeline.evaluate(n=>n.scrollLeft)>0,'native right arrow actually scrolls overflowing timeline');checks++;
      }
      const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1 || [...document.querySelectorAll('.tb-live, .tb-live .tb-controls, .tb-live .tb-fields, .tb-live .tb-predict, #tb-overflow-control')].some(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.left < -1||r.right>innerWidth+1);}));
      assert.equal(await overflow(),false);checks++;
      await page.evaluate(()=>{const p=document.createElement('div');p.id='tb-overflow-control';p.style.cssText='position:absolute;left:0;min-width:2200px;height:2px';document.body.append(p);});
      assert.equal(await overflow(),true);checks++;await page.locator('#tb-overflow-control').evaluate(n=>n.remove());assert.equal(await overflow(),false);checks++;
      assert.deepEqual(errors,[]);checks++;
      await lab.screenshot({path:path.join(evidence,`${width}-${theme}-${present?'present':'read'}.png`)});
      await context.close();
    }
    console.log(JSON.stringify({mode:fixture?'routed fixture/no listener':'provided HTTP origin',configurations:12,checks,evidence}));
  }finally{await browser.close();}
});
test('native no-JS, static print, independent roots, self-contained offline and practice', {skip:B.skip},async()=>{
  fs.mkdirSync(evidence,{recursive:true});const browser=await B.launch();
  try{
    const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:1000}});await routed(nojs);
    const page=await nojs.newPage();assert.equal((await page.goto(base+'/lean/value-stream-mapping.html')).status(),200);
    const card=page.locator('details.xcard').filter({has:page.locator('[data-interactive="transfer-batch-flow"]')});await card.locator(':scope > summary').click();
    assert.equal(await page.locator('.tb-static').isVisible(),true);
    assert.match(await page.locator('.tb-static').textContent(),/Full order\s*64 min/);
    await page.screenshot({path:path.join(evidence,'390-nojs.png'),fullPage:true});
    await page.emulateMedia({media:'print'});await page.pdf({path:path.join(evidence,'nojs.pdf'),format:'Letter',printBackground:true,margin:{top:'.5in',bottom:'.5in',left:'.5in',right:'.5in'}});await nojs.close();
    const context=await browser.newContext();await routed(context);const live=await context.newPage();const lab=await open(live);
    await live.evaluate(()=>{const first=document.querySelector('[data-interactive="transfer-batch-flow"]'),copy=first.cloneNode(true);copy.querySelector('.tb-live').remove();delete copy.dataset.tbMounted;first.after(copy);});
    const src=await live.locator('script[src*="transfer-batch-flow/demo.js"]').getAttribute('src');await live.addScriptTag({url:new URL(src,live.url()).href});await live.addScriptTag({url:new URL(src,live.url()).href});
    assert.equal(await live.locator('.tb-live').count(),2);const second=live.locator('.tb-live').nth(1);
    await second.locator('[data-tb="prediction"]').selectOption('both');await second.locator('[data-tb="test"]').click();
    assert.equal(await second.locator('.tb-case').count(),2);assert.equal(await lab.locator('.tb-case').count(),1);
    await live.locator('[data-interactive="transfer-batch-flow"]').nth(1).evaluate(n=>n.remove());
    await live.emulateMedia({media:'print'});assert.equal(await live.locator('.tb-live').isVisible(),false);assert.equal(await live.locator('.tb-static').isVisible(),true);
    await live.pdf({path:path.join(evidence,'js.pdf'),format:'Letter',printBackground:true,margin:{top:'.5in',bottom:'.5in',left:'.5in',right:'.5in'}});await context.close();
    const offline=await browser.newContext(),blocked=await routed(offline,true),aggregate=await offline.newPage();
    assert.equal((await aggregate.goto(base+'/print/section-lean.html')).status(),200);
    const offlineLab=aggregate.locator('.tb-live');await offlineLab.waitFor({state:'attached'});
    const aggregateCard=aggregate.locator('details.xcard').filter({has:offlineLab});await aggregateCard.locator(':scope > summary').click();
    await offlineLab.locator('[data-tb="prediction"]').selectOption('both');await offlineLab.locator('[data-tb="test"]').click();
    assert.match(await offlineLab.locator('[data-tb="status"]').textContent(),/full order: 100 → 64/);
    assert.deepEqual(blocked.filter(url=>url.startsWith(base)),[],'aggregate requests no sibling assets');await offline.close();
    const practiceContext=await browser.newContext();await routed(practiceContext);const practice=await practiceContext.newPage();await practice.goto(base+'/practice.html#transfer-batch-first');
    for(const [id,answer,wrong] of [['first',46,10],['order',64,100],['partial',18,17],['waiting',54,64],['processing',5,18]]){
      const panel=practice.locator('#transfer-batch-'+id);await panel.locator('[data-practice-input]').fill(String(wrong));await panel.locator('[data-practice-check]').click();assert.equal(await panel.getAttribute('data-state'),'incorrect');
      await panel.locator('[data-practice-input]').fill(String(answer));await panel.locator('[data-practice-check]').click();assert.equal(await panel.getAttribute('data-state'),'correct');
    }
    await practiceContext.close();console.log('No-JS/print/offline/independent-root and five practice pairs passed: '+evidence);
  }finally{await browser.close();}
});

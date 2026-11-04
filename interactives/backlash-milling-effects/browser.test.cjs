'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const B=require('../../tests/support/browser.cjs');
const ROOT='[data-interactive="backlash-milling-effects"]';
const url=()=>B.browserURL.replace(/\/$/,'')+'/engineering/backlash-and-lost-motion.html';
const evidence=process.env.BACKLASH_MILLING_EVIDENCE||fs.mkdtempSync(path.join(os.tmpdir(),'coursewiki-backlash-milling-'));
async function context(browser,opts){const c=await browser.newContext(opts);await c.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));return c;}
async function open(page,present){await page.goto(url()+(present?'?p=everything&present=1':''));const card=page.locator('details.xcard').filter({has:page.locator(ROOT)});if(!await card.evaluate(n=>n.open))await card.locator(':scope > summary').click();await page.locator(ROOT+'[data-bme-ready="true"]').waitFor();return page.locator(ROOT);}
async function visibility(page,control){return page.evaluate(sel=>{
  const top=document.querySelector('.appbar').getBoundingClientRect().bottom,seq=document.querySelector('.seqbar'),sr=seq&&seq.getBoundingClientRect(),bottom=sr&&sr.height?Math.min(innerHeight,sr.top):innerHeight;
  function box(selector){const n=document.querySelector(selector),r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width,hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}
  return {top,bottom,control:box(sel),plot:box('.bme-plot'),readings:box('[data-bme-readings]'),overflow:document.documentElement.scrollWidth>innerWidth+1};
},control);}
test('actual material, local controls, history, pause and replay in phone/desktop themes and modes',{skip:B.skip},async()=>{
  const browser=await B.launch();const records=[];try{
    for(const width of [390,1280])for(const theme of ['light','dark'])for(const present of [false,true]){
      const tag=`${width}-${theme}-${present?'present':'read'}`,c=await context(browser,{viewport:{width,height:width===390?844:900},colorScheme:theme,reducedMotion:'no-preference'}),page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const root=await open(page,present);
      const scripts=await page.locator('script[src]').evaluateAll(ns=>ns.map(n=>n.src));
      assert.ok(scripts.findIndex(s=>s.includes('/backlash-kinematics/'))<scripts.findIndex(s=>s.includes('/backlash-lost-motion/model.js')));
      assert.ok(scripts.findIndex(s=>s.includes('/planar-cut-geometry/'))<scripts.findIndex(s=>s.includes('/backlash-milling-effects/model.js')));
      assert.equal(scripts.some(s=>s.includes('/milling-simulator/')),false,'new lab does not load the whole milling platform');
      for(const preset of ['zero','x','y','both']){
        const sel=`[data-bme-preset="${preset}"]`;await root.locator(sel).click({timeout:8000});const v=await visibility(page,sel);records.push({tag,preset,...v});
        assert.equal(v.overflow,false,tag+' overflow');assert.ok(v.control.hit,tag+' control is usable');
        assert.ok(v.plot.top>=v.top-1&&v.plot.bottom<=v.bottom+1,tag+' changed cut is visible');assert.ok(v.readings.top>=v.top-1&&v.readings.bottom<=v.bottom+1,tag+' span feedback is visible');
        if(preset==='zero'){assert.match(await root.locator('[data-bme-areas]').textContent(),/0\.0 mm².*0\.0 mm²/);assert.equal(await root.locator('.bme-plot .bme-extra').getAttribute('d'),'');}
        await page.screenshot({path:path.join(evidence,`${tag}-${preset}.png`)});
      }
      await root.locator('[data-bme="bx"]').click();await page.keyboard.press('ArrowRight');assert.equal(await root.locator('[data-bme="bx"]').inputValue(),'0.55');
      const v=await visibility(page,'[data-bme="bx"]');records.push({tag,action:'slider',...v});assert.ok(v.plot.top>=v.top-1&&v.plot.bottom<=v.bottom+1);
      for(const shape of ['rectangle','rounded']){await root.locator('[data-bme="shape"]').selectOption(shape);assert.match(await root.locator('[data-bme-readings]').textContent(),/23\.450/);await page.screenshot({path:path.join(evidence,`${tag}-${shape}.png`)});}
      await root.locator('[data-bme="winding"]').selectOption('-1');await root.locator('[data-bme="start"]').selectOption('2');await root.locator('[data-bme="seat"]').selectOption('-1');
      await root.locator('[data-bme-restart]').click();assert.equal(await root.getAttribute('data-bme-index'),'0');await root.locator('[data-bme-step]').click();assert.ok(Number(await root.getAttribute('data-bme-index'))>0);assert.match(await root.locator('[data-bme-readings]').textContent(),/Finish the pass/);
      await root.locator('[data-bme-run]').click();await page.waitForTimeout(350);await root.locator('[data-bme-run]').click();const paused=await root.getAttribute('data-bme-index');await page.waitForTimeout(200);assert.equal(await root.getAttribute('data-bme-index'),paused);
      await root.locator('[data-bme-run]').click();await page.waitForFunction(sel=>{const r=document.querySelector(sel);return r.dataset.bmeIndex===r.dataset.bmeSteps;},ROOT,{timeout:12000});assert.match(await root.locator('[data-bme-progress]').textContent(),/Complete/);assert.deepEqual(errors,[]);
      await c.close();
    }
  }finally{fs.writeFileSync(path.join(evidence,'viewports.json'),JSON.stringify(records,null,2));await browser.close();console.log('Evidence: '+evidence);}
});
test('reduced motion, independent mounts, no-JS and printed static lesson',{skip:B.skip},async()=>{
  const browser=await B.launch();try{
    const c=await context(browser,{viewport:{width:390,height:844},reducedMotion:'reduce'});
    await c.route('**/engineering/backlash-and-lost-motion.html',async r=>{const response=await r.fetch(),body=await response.text();await r.fulfill({response,body:body.replace('<div data-interactive="backlash-milling-effects">','<div data-interactive="backlash-milling-effects"></div><div data-interactive="backlash-milling-effects">')});});
    const page=await c.newPage();await page.goto(url());await page.locator('details.xcard:has('+ROOT+') > summary').click();const roots=page.locator(ROOT);assert.equal(await roots.count(),2);
    await roots.nth(0).locator('[data-bme-preset="zero"]').click();assert.match(await roots.nth(0).locator('[data-bme-out="bx"]').textContent(),/0\.00/);assert.match(await roots.nth(1).locator('[data-bme-out="bx"]').textContent(),/0\.50/);
    await roots.nth(0).locator('[data-bme-run]').click();await roots.nth(0).locator('[data-bme-run]').click();assert.equal(await roots.nth(0).getAttribute('data-bme-running'),'false');assert.ok(Number(await roots.nth(0).getAttribute('data-bme-index'))>0);await c.close();
    const off=await context(browser,{viewport:{width:390,height:844},javaScriptEnabled:false}),p=await off.newPage();await p.goto(url());await p.locator('details.xcard:has('+ROOT+') > summary').click();assert.equal(await p.locator('.bme-static-grid figure').count(),4);
    const readable=await p.locator('.bme-static-grid').evaluate(n=>{const svg=n.querySelector('svg'),text=svg.querySelector('text'),box=n.querySelector('.bme-readings>div');return {columns:getComputedStyle(n).gridTemplateColumns.split(' ').length,width:svg.getBoundingClientRect().width,axisSize:parseFloat(getComputedStyle(text).fontSize)*svg.getScreenCTM().a,spanWidth:box.getBoundingClientRect().width,captionSize:parseFloat(getComputedStyle(box.querySelector('small')).fontSize)};});
    assert.equal(readable.columns,1);assert.ok(readable.width>280&&readable.axisSize>=12&&readable.spanWidth>=130&&readable.captionSize>=12.5,'phone fallback labels and spans are readable');
    await p.locator('.bme-static-grid figure').first().scrollIntoViewIfNeeded();await p.screenshot({path:path.join(evidence,'no-js-phone.png')});await p.emulateMedia({media:'print'});assert.equal(await p.locator('.bme-static-grid').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),2,'mobile screen rule leaves printed comparison two-column');await p.pdf({path:path.join(evidence,'lesson-print.pdf'),format:'Letter',printBackground:true});await off.close();
  }finally{await browser.close();}
});

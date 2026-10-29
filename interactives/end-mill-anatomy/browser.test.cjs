'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {browserURL,skip,launch}=require('../../tests/support/browser.cjs');
test('end-mill anatomy web, phone, fallback and independent roots',{skip},async()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'coursewiki-end-mill-anatomy-')),browser=await launch();
  try{
    const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url=browserURL.replace(/\/$/,'')+'/machining/milling-cutter-selection.html';
    await page.goto(url,{waitUntil:'networkidle'});await page.locator('details').evaluateAll(ns=>ns.forEach(n=>n.open=true));
    const root=page.locator('[data-interactive="end-mill-anatomy"]');
    assert.equal(await root.getAttribute('data-ema-ready'),'true');assert.equal(await root.locator('canvas.ema-webgl').count(),1);
    const before=await root.locator('[data-ema-readout]').textContent();
    await root.locator('[data-ema="projection"]').selectOption('85');const after=await root.locator('[data-ema-readout]').textContent();
    assert.match(before,/OAL 100 mm/);assert.match(after,/OAL 100 mm/);assert.match(before,/Holder projection 75 mm/);assert.match(after,/Holder projection 85 mm/);
    await root.locator('[data-ema-view="reset"]').click();await root.locator('canvas').focus();await page.waitForTimeout(50);await root.locator('canvas').evaluate(n=>n.blur());const baseline=await root.locator('canvas').screenshot();
    await root.locator('[data-ema-view="side"]').click();assert.equal(await root.locator('[data-ema-scene]').getAttribute('data-camera-view'),'side');
    await root.locator('canvas').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(50);const changed=await root.locator('canvas').screenshot();assert.equal(baseline.equals(changed),false,'keyboard orbit changes rendered pixels');
    await root.locator('[data-ema-view="end"]').click();assert.equal(await root.locator('[data-ema-scene]').getAttribute('data-camera-view'),'end');
    await root.locator('[data-ema-view="reset"]').click();await root.locator('canvas').focus();await page.waitForTimeout(50);assert.equal(await root.locator('[data-ema-scene]').getAttribute('data-camera-view'),'orbit');await root.locator('canvas').evaluate(n=>n.blur());const restored=await root.locator('canvas').screenshot();assert.equal(baseline.equals(restored),true,'Reset 3D restores the exact saved view');
    await root.locator('canvas').focus();await page.keyboard.press('ArrowLeft');await page.waitForTimeout(50);await page.keyboard.press('Home');await page.waitForTimeout(50);await root.locator('canvas').evaluate(n=>n.blur());const homeRestored=await root.locator('canvas').screenshot();assert.equal(baseline.equals(homeRestored),true,'Home restores the same exact saved view as Reset 3D');
    for(const width of [375,390])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await root.evaluate(n=>n.scrollWidth<=n.clientWidth),true);
      await page.screenshot({path:path.join(out,'anatomy-'+width+'-'+theme+'.png'),fullPage:true});
    }
    const multi=await browser.newPage({viewport:{width:1200,height:900}});await multi.route('**/end-mill-anatomy/demo.js*',route=>route.abort());await multi.goto(url,{waitUntil:'networkidle'});await multi.locator('details').evaluateAll(ns=>ns.forEach(n=>n.open=true));
    assert.equal(await multi.locator('[data-interactive="end-mill-anatomy"] [id]').count(),0,'static fallback is ID-free before JavaScript');
    await multi.evaluate(()=>{const a=document.querySelector('[data-interactive="end-mill-anatomy"]');a.after(a.cloneNode(true));});await multi.unroute('**/end-mill-anatomy/demo.js*');
    const mounts=await multi.evaluate(()=>{const s=document.createElement('script');s.src='/interactives/end-mill-anatomy/demo.js?two-roots';document.body.append(s);return new Promise(r=>setTimeout(()=>r(document.querySelectorAll('[data-ema-ready]').length),250));});
    assert.equal(mounts,2);assert.equal(await multi.locator('canvas.ema-webgl').count(),2);
    const roots=multi.locator('[data-interactive="end-mill-anatomy"]');await roots.nth(1).locator('[data-ema="projection"]').selectOption('85');
    assert.match(await roots.nth(0).locator('[data-ema-readout]').textContent(),/Holder projection 75 mm/);assert.match(await roots.nth(1).locator('[data-ema-readout]').textContent(),/Holder projection 85 mm/);
    assert.deepEqual(await multi.locator('[data-interactive="end-mill-anatomy"] [id]').evaluateAll(nodes=>{const seen=new Set();return nodes.map(n=>n.id).filter(id=>seen.has(id)||!seen.add(id));}),[],'two roots initialized by one loader share no static or live ids');await multi.close();
    const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}}),np=await noJs.newPage();await np.goto(url,{waitUntil:'networkidle'});await np.locator('details').evaluateAll(ns=>ns.forEach(n=>n.open=true));
    assert.equal(await np.locator('[data-interactive="end-mill-anatomy"] .ema-static').isVisible(),true);assert.match(await np.locator('[data-interactive="end-mill-anatomy"]').textContent(),/LBS includes LOC plus any relieved neck/);await noJs.close();
    assert.deepEqual(errors,[]);console.log('PASS evidence: '+out);
  }finally{await browser.close();}
});

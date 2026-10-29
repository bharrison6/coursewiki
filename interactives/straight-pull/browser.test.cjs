'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {browserURL,skip,launch}=require('../../tests/support/browser.cjs');
const base=(browserURL||'').replace(/\/$/,''), PAGE='/materials-and-processes/making-silicone-molds-from-a-printed-pattern.html';
const out=fs.mkdtempSync(path.join(os.tmpdir(),'acc-straight-pull-browser-'));
const q=(root,key)=>root.locator('[data-sp="'+key+'"]');
async function open(browser,suffix='',options={}){
  const page=await browser.newPage({viewport:{width:1280,height:950},...options}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+PAGE+suffix,{waitUntil:'networkidle'});await page.locator('details.xcard').evaluateAll(ns=>ns.forEach(n=>{n.open=true;}));
  return{page,root:page.locator('[data-interactive="straight-pull"]'),errors};
}
async function reveal(page,root){await root.locator('input[value="shoulder"]').check();await q(root,'reveal').focus();await page.keyboard.press('Space');assert.equal(await q(root,'experiment').isVisible(),true);}
test('located obstruction, analytical readouts, endpoint distinction and contact controls',{skip},async()=>{
  const browser=await launch();try{
    const{page,root,errors}=await open(browser);
    assert.equal(await q(root,'reveal').isDisabled(),true);assert.equal(await q(root,'experiment').isHidden(),true);
    assert.equal(await q(root,'context').isVisible(),true);assert.match(await q(root,'context').textContent(),/\(20,22\), \(25,26\)/);assert.equal(await q(root,'context').locator('.sp-interference').count(),0);
    await root.locator('input[value="mouth"]').check();await q(root,'reveal').click();
    assert.match(await q(root,'feedback').textContent(),/Check the interior shoulder.*depth 25.*depth 20.*26 meets 22.*4 interference/);
    assert.match(await q(root,'readings').textContent(),/depth 20.*26.*22.*4 per side.*\(16\.6667, 22\.6087\)/);
    assert.equal(await q(root,'drawing').locator('.sp-interference').count(),2);assert.match(await q(root,'path').textContent(),/BLOCKED.*20 → 25/);
    await root.locator('[data-sp-pull="40"]').click();assert.match(await q(root,'readings').textContent(),/no interior overlap/);assert.match(await q(root,'path').textContent(),/BLOCKED/);assert.equal(await q(root,'drawing').locator('.sp-interference').count(),0);
    await root.locator('[data-sp-pull="0"]').click();assert.match(await q(root,'readings').textContent(),/side contact.*Initial exact fit/);assert.match(await q(root,'path').textContent(),/BLOCKED/);
    await q(root,'profile').selectOption('draft');await root.locator('[data-sp-pull="5"]').click();assert.match(await q(root,'readings').textContent(),/side separation.*1\.25/);assert.match(await q(root,'path').textContent(),/no positive geometric interference/);
    await q(root,'profile').selectOption('parallel');assert.match(await q(root,'readings').textContent(),/contact persists/);
    await q(root,'profile').selectOption('reverse');assert.match(await q(root,'readings').textContent(),/1\.25 per side.*\[0, 35\]/);
    await q(root,'pull').focus();const url=page.url();await page.keyboard.press('ArrowRight');assert.equal(await q(root,'pull').inputValue(),'6');assert.equal(page.url(),url);
    assert.deepEqual(errors,[]);await root.screenshot({path:path.join(out,'desktop.png')});
  }finally{await browser.close();}console.log('PASS evidence: '+out);
});
test('native Space/Enter and slider keys in reading/presentation, phone themes and bounded SVG',{skip},async()=>{
  const browser=await launch();try{
    for(const theme of ['light','dark'])for(const width of [375,390,1280])for(const present of [false,true]){
      const{page,root,errors}=await open(browser,'?p=silicone-mold-making'+(present?'&present=1':''),{viewport:{width,height:900},colorScheme:theme});
      await reveal(page,root);assert.match(await q(root,'feedback').textContent(),/Prediction confirmed/);
      const url=page.url();await root.locator('[data-sp-pull="40"]').focus();await page.keyboard.press('Space');assert.equal(await q(root,'pull').inputValue(),'40');assert.equal(page.url(),url);
      await root.locator('[data-sp-pull="5"]').focus();await page.keyboard.press('Enter');assert.equal(await q(root,'pull').inputValue(),'5');
      await q(root,'pull').focus();await page.keyboard.press('ArrowRight');assert.equal(await q(root,'pull').inputValue(),'6');assert.equal(page.url(),url);
      const fit=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
      assert.equal(await fit(),true);await page.evaluate(()=>{const n=document.createElement('div');n.id='sp-overflow-control';n.style.cssText='position:absolute;width:200vw;height:1px;left:0';document.body.append(n);});assert.equal(await fit(),false);await page.locator('#sp-overflow-control').evaluate(n=>n.remove());assert.equal(await fit(),true);
      assert.equal(await root.evaluate(n=>n.scrollWidth<=n.clientWidth),true);
      const labels=await q(root,'drawing').locator('.sp-diagram text').evaluateAll(ns=>ns.map(n=>({height:n.getBoundingClientRect().height,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})));
      const box=await q(root,'drawing').locator('.sp-diagram').boundingBox();assert.ok(labels.every(l=>l.height>=15&&l.left>=box.x&&l.right<=box.x+box.width));
      assert.deepEqual(errors,[]);await root.screenshot({path:path.join(out,`${theme}-${width}-${present?'present':'read'}.png`)});await page.close();
    }
  }finally{await browser.close();}
});
test('static/noJS and print agree; existing process SVG, resin and practice routes remain functional',{skip},async()=>{
  const browser=await launch();try{
    for(const javaScriptEnabled of [false,true]){
      const context=await browser.newContext({javaScriptEnabled,viewport:{width:375,height:900},colorScheme:'dark'}),page=await context.newPage();
      await page.goto(base+PAGE,{waitUntil:'networkidle'});await page.locator('details.xcard').evaluateAll(ns=>ns.forEach(n=>{n.open=true;}));
      const root=page.locator('[data-interactive="straight-pull"]'),fallback=root.locator('.sp-static');
      if(!javaScriptEnabled){assert.equal(await fallback.isVisible(),true);assert.match(await fallback.textContent(),/50\/3, 520\/23/);assert.equal(await root.locator('.sp-lab').count(),0);await fallback.locator('[role="region"]').focus();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
      else{await reveal(page,root);const resin=page.locator('[data-interactive="resin-batch"]');await resin.locator('input[value="given-a"]').check();await resin.locator('[data-rb="reveal"]').click();assert.match(await resin.locator('[data-rb-compare="total"]').textContent(),/200 g.*20 g.*220 g/);}
      assert.equal(await page.locator('img[src*="pattern-to-casting.svg"]').count(),1);assert.equal(await page.locator('[data-practice-add="documentation-silicone-total"]').count(),1);assert.equal(await page.locator('[data-practice-add="documentation-silicone-base"]').count(),1);
      await page.emulateMedia({media:'print'});assert.equal(await fallback.isVisible(),true);assert.equal(await root.locator('.sp-lab').isVisible(),false);
      await page.pdf({path:path.join(out,javaScriptEnabled?'js-print.pdf':'nojs-print.pdf'),format:'Letter',printBackground:true});await context.close();
    }
    const p=await browser.newPage();await p.goto(base+'/practice.html#documentation-silicone-total',{waitUntil:'networkidle'});
    for(const[id,good,bad]of[['documentation-silicone-total','30','33'],['documentation-silicone-base','27.5','25']])for(const[value,state]of[[good,'correct'],[bad,'incorrect']]){const item=p.locator('#'+id);await item.locator('[data-practice-input]').fill(value);await item.locator('[data-practice-check]').click();assert.equal(await item.getAttribute('data-state'),state);}
  }finally{await browser.close();}
});
test('offline aggregate coexists with resin and independent second straight-pull instance',{skip},async()=>{
  const browser=await launch();try{
    const page=await browser.newPage();await page.route('**/*',async route=>{if(!route.request().isNavigationRequest())return route.abort();const response=await route.fetch(),body=await response.text();assert.ok(body.includes('<div data-interactive="straight-pull">'));await route.fulfill({response,body:body.replace('<div data-interactive="straight-pull">','<div data-interactive="straight-pull"><p>Explicit second-root fixture.</p></div><div data-interactive="straight-pull">')});});
    await page.goto(base+'/print/track-silicone-mold-making.html',{waitUntil:'networkidle'});await page.locator('details.xcard').evaluateAll(ns=>ns.forEach(n=>{n.open=true;}));
    const roots=page.locator('[data-interactive="straight-pull"]');assert.equal(await roots.count(),2);assert.equal(await page.locator('[data-interactive="resin-batch"][data-rb-ready]').count(),1);
    await reveal(page,roots.nth(0));await reveal(page,roots.nth(1));await roots.nth(0).locator('[data-sp-pull="40"]').click();assert.equal(await q(roots.nth(1),'pull').inputValue(),'5');
    const ids=await roots.evaluateAll(ns=>ns.flatMap(n=>[...n.querySelectorAll('[id]')].map(el=>el.id)));assert.equal(new Set(ids).size,ids.length);assert.equal(await roots.locator('svg [id]').count(),0);
    await page.evaluate(()=>document.querySelectorAll('[data-interactive="straight-pull"]').forEach(CourseWikiStraightPullDemo.init));assert.equal(await roots.locator('.sp-lab').count(),2);
  }finally{await browser.close();}
});

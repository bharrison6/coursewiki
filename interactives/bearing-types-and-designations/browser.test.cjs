'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {launch,browserURL,skip}=require('../../tests/support/browser.cjs'),M=require('./model.js');
test('bearing atlas and bounded catalog: actual views, controls, independent mounts, no-JS and print',{skip},async()=>{
 const out=fs.mkdtempSync(path.join(process.env.BEARING_GUIDE_EVIDENCE_ROOT||os.tmpdir(),'bearing-guide-'));
 const b=await launch(),errors=[];try{
 for(const[width,theme]of[[1280,'light'],[390,'dark']]){
  const c=await b.newContext({viewport:{width,height:width===390?844:900},colorScheme:theme}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(browserURL+'/engineering/bearing-types-and-loads.html');const root=p.locator('[data-interactive="bearing-types-and-designations"]');await root.evaluate(e=>e.closest('details').open=true);
  for(const f of M.families){await root.locator('[data-bgd-family]').selectOption(f.id);assert.equal(await root.getAttribute('data-family'),f.id);assert.match(await root.locator('.bgd-live svg').getAttribute('aria-label'),new RegExp(f.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   const bad=await root.locator('.bgd-live svg').evaluate(s=>{const r=s.getBoundingClientRect();return [...s.querySelectorAll('text')].filter(t=>{const b=t.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1}).map(t=>t.textContent)});assert.deepEqual(bad,[],f.id+' labels fit');
   const gap=await root.locator('.bgd-live svg').evaluate(s=>s.querySelector('[data-bgd-end]').getBoundingClientRect().top-s.querySelector('.end-label').getBoundingClientRect().bottom);assert.ok(gap>=3,f.id+' end-view label clears the geometry');
   await root.locator('.bgd-live').screenshot({path:path.join(out,f.id+'-'+width+'-'+theme+'.png')});
  }
  const family=root.locator('select');await family.focus();const old=p.url();await p.keyboard.press('ArrowUp');assert.equal(p.url(),old);
  await p.goto(browserURL+'/engineering/bearing-designations-and-sizes.html');const sizes=p.locator('[data-bgd="sizes"]');await sizes.evaluate(e=>e.closest('details').open=true);
  for(const r of M.catalog){await sizes.locator('select').selectOption(r.code);assert.equal(await sizes.getAttribute('data-code'),r.code);assert.match(await sizes.locator('.bgd-live svg').getAttribute('aria-label'),new RegExp('outside diameter '+r.D));const gap=await sizes.locator('.bgd-live svg').evaluate(s=>s.querySelector('.size-footer').getBoundingClientRect().top-s.querySelector('.width-label').getBoundingClientRect().bottom);assert.ok(gap>=5,r.code+' width label clears the footer');}
  await sizes.locator('details summary').click();await sizes.locator('input').fill('6205ZZ');await sizes.locator('button').click();assert.match(await sizes.locator('[role=status]').innerText(),/Not in this checked catalog set/);assert.equal(await sizes.getAttribute('data-code'),'6305');
  await sizes.locator('input').fill('6205');await sizes.locator('button').click();assert.equal(await sizes.getAttribute('data-code'),'6205');await sizes.screenshot({path:path.join(out,'sizes-'+width+'-'+theme+'.png')});
  const script=await p.locator('script[src*="bearing-types-and-designations/demo.js"]').getAttribute('src');await p.evaluate(src=>{const m=document.createElement('div');m.dataset.interactive='bearing-types-and-designations';m.dataset.bgd='sizes';document.querySelector('main').appendChild(m);const s=document.createElement('script');s.src=src;document.body.appendChild(s)},script);await p.waitForFunction(()=>document.querySelectorAll('[data-bgd-ready]').length===2);await p.locator('[data-bgd=sizes]').nth(1).locator('select').selectOption('6005');assert.equal(await sizes.first().getAttribute('data-code'),'6205');
  await c.close();
 }
 const c=await b.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),p=await c.newPage();await p.goto(browserURL+'/engineering/bearing-types-and-loads.html');assert.equal(await p.locator('.bgd-static-atlas figure').count(),12);assert.equal(await p.locator('.bgd-static-atlas img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)),true,'standalone SVGs load in the actual no-JS consumer');await p.pdf({path:path.join(out,'bearing-atlas-nojs.pdf'),format:'Letter',printBackground:true});await p.goto(browserURL+'/engineering/bearing-designations-and-sizes.html');assert.equal(await p.locator('.bgd-static svg').count(),3);
 await p.emulateMedia({media:'print'});const symbols=await p.locator('.bgd-symbol').evaluateAll(es=>es.map(e=>({text:e.textContent,transform:getComputedStyle(e).textTransform})));assert.ok(symbols.some(s=>s.text==='d'));assert.ok(symbols.some(s=>s.text==='D'));assert.ok(symbols.every(s=>s.transform==='none'),'print preserves d versus D despite uppercase table headings');
 await p.pdf({path:path.join(out,'bearing-sizes-nojs.pdf'),format:'Letter',printBackground:true});await c.close();
 assert.deepEqual(errors,[]);console.log('Evidence: '+out);
 }finally{await b.close();}
});

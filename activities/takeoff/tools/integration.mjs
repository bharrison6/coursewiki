#!/usr/bin/env node
/* Browser regression coverage for the offline classroom flows. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const executablePath=[process.env.CHROME_PATH,process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),'/usr/bin/google-chrome'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const checks=[];
const ok=(name,pass,detail='')=>checks.push({name,pass:!!pass,detail});
const views=[{width:1280,height:850},{width:390,height:844},{width:320,height:568}];
try{
for(const viewport of views){
const context=await browser.newContext({viewport,offline:true});
const page=await context.newPage();const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.isNavigationRequest())requests.push(r.url());});
await page.goto(pathToFileURL(path.join(ROOT,'index.html')).href);
const tag=viewport.width+'px: ';
ok(tag+'Guide opens',await page.locator('#howto').isVisible());
await page.locator('#howto .sheet-foot button').click();
await page.locator('#btn-begin').click();
await page.locator('#chart').focus();await page.keyboard.press('ArrowUp');await page.locator('#btn-reveal').click();
await page.locator('#round-select').selectOption('1');await page.waitForTimeout(1700);
ok(tag+'switching during reveal cannot publish a stale verdict',!await page.locator('#verdict').isVisible()&&await page.evaluate(()=>window.__undershoot.app.chart.state().round.id==='gpqa'));
for(let i=0;i<5;i++){
await page.locator('#round-select').selectOption(String(i));
await page.locator('#btn-details').click();
ok(tag+'round '+i+' hidden table excludes answers',await page.locator('#measurement-table tbody tr').count()===await page.evaluate(()=>window.__undershoot.D.ROUNDS[window.__undershoot.app.roundIx].shown.length));
await page.keyboard.press('Escape');
ok(tag+'Details focus restored',await page.evaluate(()=>document.activeElement.id==='btn-details'));
await page.locator('#chart').focus();await page.keyboard.press('ArrowUp');
ok(tag+'round '+i+' keyboard enables reveal',await page.locator('#btn-reveal').isEnabled());
await page.locator('#btn-reveal').click();await page.locator('#verdict').waitFor({state:'visible'});
ok(tag+'round '+i+' result is finite',await page.evaluate(()=>{const r=window.__undershoot.app.results[window.__undershoot.app.roundIx];return Number.isFinite(r.predicted)&&Number.isFinite(r.truth)}));
ok(tag+'round '+i+' estimate date matches evidence',await page.evaluate(()=>{const s=window.__undershoot.app.chart.state();return s.tGuess===Date.parse(s.round.askDate)}));
await page.locator('#btn-details').click();
ok(tag+'round '+i+' revealed table includes all points',await page.locator('#measurement-table tbody tr').count()===await page.evaluate(()=>{const r=window.__undershoot.D.ROUNDS[window.__undershoot.app.roundIx];return r.shown.length+r.hidden.length}));
await page.keyboard.press('Escape');
if(i===4){await page.locator('#btn-twist').click();ok(tag+'ARC3 remains separate',await page.evaluate(()=>!window.__undershoot.app.chart.state().twistOn));ok(tag+'ARC3 renders matched pair',await page.locator('#twist-body .bar-row').count()===2);}
}
await page.locator('#actnav [data-act="2"]').click();
await page.locator('#tl-filter [data-filter="open"]').click();
const counts=await page.evaluate(()=>({count:+document.querySelector('#tl-total').textContent,rows:document.querySelectorAll('#model-list article').length,truth:window.__undershoot.D.MODELS.filter(m=>m.open).length}));
ok(tag+'timeline filters list and counters together',counts.count===counts.rows&&counts.rows===counts.truth);
await page.locator('#tl-region [data-region="Europe"]').click();ok(tag+'empty filtered catalog is explicit',(await page.locator('#model-list').textContent()).includes('No selected releases'));
await page.locator('#actnav [data-act="3"]').click();
await page.locator('#domain-nav button').last().click();ok(tag+'evidence domain changes',await page.locator('[data-domain="science"]').isVisible()&&!await page.locator('[data-domain="work"]').isVisible());
await page.locator('#scenario-years').focus();await page.keyboard.press('End');ok(tag+'scenario exposes invalid extrapolation',(await page.locator('#scenario-results').textContent()).includes('Above the score ceiling'));
await page.locator('[data-explain="forecast"]').click();ok(tag+'scenario formulas accessible',(await page.locator('#explanation-details').textContent()).includes('30 × 1.5^t'));await page.keyboard.press('Escape');
await page.locator('#btn-settings').click();await page.locator('#btn-notes').click();
ok(tag+'canonical notes visible',await page.locator('#notes .guide-scope').isVisible());
await page.locator('#notes .sheet-foot button').focus();await page.keyboard.press('Tab');ok(tag+'nested modal focus wraps',await page.evaluate(()=>document.activeElement===document.querySelector('#notes .sheet-head button')));
await page.keyboard.press('Escape');ok(tag+'nested close restores settings',await page.locator('#settings').isVisible()&&await page.evaluate(()=>document.activeElement.id==='btn-notes'));
await page.locator('#chk-presenter').check();await page.locator('#btn-selftest').click();ok(tag+'UI integrity checks pass',await page.evaluate(()=>window.__undershoot.runSelfTest().every(c=>c.pass)));
await page.locator('#btn-reset').click();ok(tag+'Reset returns to opening state',await page.locator('#intro').isVisible());
ok(tag+'Reset clears results but preserves presentation',await page.evaluate(()=>window.__undershoot.app.results.length===0&&document.body.classList.contains('presenter')&&document.querySelector('#scenario-years').value==='3'));
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);ok(tag+'no page overflow',overflow<=1,String(overflow));
await page.locator('#btn-begin').click();
const box=await page.locator('#chart').boundingBox();await page.locator('#chart').scrollIntoViewIfNeeded();
const geometry=await page.evaluate(()=>{const s=window.__undershoot.app.chart.state(),r=s.canvas.getBoundingClientRect();const x=t=>r.left+s.pad.l+(t-s.t0)/(s.t1-s.t0)*(s.w-s.pad.l-s.pad.r);return {x0:x(s.tSplit)+1,x1:x(s.tGuess),y0:r.top+s.pad.t+(s.h-s.pad.t-s.pad.b)*.6,y1:r.top+s.pad.t+(s.h-s.pad.t-s.pad.b)*.2}});
await page.mouse.move(geometry.x0,geometry.y0);await page.mouse.down();await page.mouse.move(geometry.x1,geometry.y1,{steps:30});await page.mouse.up();ok(tag+'pointer draw completes estimate',await page.locator('#btn-reveal').isEnabled());
ok(tag+'no runtime network requests',requests.length===0,requests.join(','));ok(tag+'no runtime errors',errors.length===0,errors.join(','));
await context.close();
}
}finally{await browser.close();}
for(const c of checks)if(!c.pass||process.argv.includes('-v'))console.log((c.pass?'PASS ':'FAIL ')+c.name+' '+c.detail);
const failed=checks.filter(c=>!c.pass);console.log(`${checks.length-failed.length}/${checks.length} browser checks passed`);process.exit(failed.length?1:0);

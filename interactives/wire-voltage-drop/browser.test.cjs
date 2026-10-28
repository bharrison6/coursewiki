const test = require('node:test');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const browserURL = process.env.COURSEWIKI_BROWSER_URL;
if (!chromium || !browserURL) {
  test('wire-voltage-drop browser acceptance', { skip: 'Requires Playwright and COURSEWIKI_BROWSER_URL' }, () => {});
} else {
// Run after build-site.ps1: node interactives/wire-voltage-drop/browser.test.cjs
// Browser profiles, screenshots, PDFs, and logs stay in OS temp.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'coursewiki-wire-voltage-drop-'));
fs.mkdirSync(out, { recursive: true });
const docs = path.join(repo, 'docs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome, ws, call;
(async () => {
  const base = browserURL.replace(/\/$/, '');
  const profile = path.join(out, `profile-${process.pid}`);
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
  fs.writeFileSync(path.join(out, 'started-pid.txt'), String(chrome.pid));
  let port;
  for (let i=0; i<100; i++) {
    try { port = fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]; if (port) break; } catch {}
    await delay(100);
  }
  assert.ok(port, 'own Chrome debugging port');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open',resolve,{once:true}));
  let id=0; const pending=new Map(), errors=[];
  ws.addEventListener('message',event => {
    const data=JSON.parse(event.data);
    if(data.id) { const p=pending.get(data.id); pending.delete(data.id); data.error ? p.reject(data.error) : p.resolve(data.result); }
    if(data.method==='Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
  });
  call=(method,params={}) => new Promise((resolve,reject) => { pending.set(++id,{resolve,reject}); ws.send(JSON.stringify({id,method,params})); });
  const evaluate=async expression => {
    const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  await call('Page.enable'); await call('Runtime.enable');
  const navigate=async url => {
    await call('Page.navigate',{url});
    for(let i=0;i<100;i++) {
      if(await evaluate(`location.href===${JSON.stringify(url)} && document.readyState==='complete'`)) return;
      await delay(50);
    }
    throw Error('navigation timeout');
  };
  const url = `${base}/engineering/wire-and-wire-gauge.html`;
  await navigate(url);
  await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
  const root = '[data-interactive="wire-voltage-drop"]';
  assert.equal(await evaluate(`document.querySelectorAll('.xcard').length`),3);
  assert.equal(await evaluate(`document.querySelector('${root}').dataset.wvdReady`),'true');
  assert.match(await evaluate(`document.querySelector('[data-results]').textContent`),/0.6385/);
  assert.equal(await evaluate(`document.querySelector('.wvd-static').checkVisibility()`),false);
  for (const theme of ['light','dark']) {
    await evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
    await call('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate(`innerWidth`),375);
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true,`${theme}: document overflow`);
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('${root}');return r.scrollWidth<=r.clientWidth})()`),true,`${theme}: module overflow`);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('${root} label')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)`),true);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('${root} .wvd-lab svg text')).every(e=>parseFloat(getComputedStyle(e).fontSize)*e.ownerSVGElement.getBoundingClientRect().width/e.ownerSVGElement.viewBox.baseVal.width>=12)`),true,'scaled SVG text at least 12 px');
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(out,`wire-mobile-${theme}.png`),Buffer.from(shot.data,'base64'));
  }
  assert.equal(await evaluate(`(()=>{const e=document.documentElement;const old=e.style.minWidth;e.style.minWidth='2000px';const overflow=e.scrollWidth>innerWidth;e.style.minWidth=old;return overflow})()`),true,'positive document overflow control');
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('${root}');const e=document.createElement('div');e.style.cssText='width:2000px;min-width:2000px;height:20px;flex-shrink:0';r.append(e);const overflow=r.scrollWidth>r.clientWidth;e.remove();return overflow})()`),true,'positive module overflow control');
  const change=async (key,value)=>evaluate(`(()=>{const e=document.querySelector('[data-key="${key}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('[data-results]').textContent})()`);
  await evaluate(`document.querySelector('[data-key="awg"]').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
  assert.equal(await evaluate(`document.querySelector('[data-key="awg"]').value`),'19','real keyboard changes gauge');
  await evaluate(`document.querySelector('[data-reset]').click()`);
  const before=await evaluate(`document.querySelector('[data-results]').textContent`);
  await evaluate(`(()=>{const e=document.querySelector('.wvd-lab select');e.value='m';e.dispatchEvent(new Event('change'))})()`);
  assert.equal(await evaluate(`document.querySelector('[data-key="length"]').value`),'15.24');
  assert.match(await evaluate(`document.querySelector('[data-results]').textContent`),/0.6385/);
  await evaluate(`document.querySelector('[data-reset]').click()`);
  // Two instances share only immutable code, never controls or baseline state.
  await evaluate(`(()=>{const r=document.querySelector('${root}');const c=r.cloneNode(true);c.querySelector('.wvd-lab').remove();delete c.dataset.wvdReady;r.after(c);const s=document.createElement('script');s.src=document.querySelector('script[src*="wire-voltage-drop/demo.js"]').src;document.body.append(s)})()`);
  for(let i=0;i<50;i++) { if(await evaluate(`document.querySelectorAll('[data-wvd-ready]').length===2`)) break; await delay(30); }
  assert.equal(await evaluate(`document.querySelectorAll('[data-wvd-ready]').length`),2);
  assert.equal(await evaluate(`(()=>{const ids=Array.from(document.querySelectorAll('${root} [id]')).map(e=>e.id);return new Set(ids).size===ids.length})()`),true,'unique instance control IDs');
  assert.match(await change('current','10'),/63.85/);
  assert.equal(await evaluate(`document.querySelectorAll('[data-results]')[1].textContent`),before);
  await evaluate(`document.querySelector('[data-pin]').click()`);
  assert.match(await evaluate(`document.querySelector('[data-baseline]').textContent`),/10 A/);
  assert.match(await evaluate(`document.querySelectorAll('[data-baseline]')[1].textContent`),/5 A/);
  assert.equal(await change('current',''),'');
  assert.equal(await evaluate(`document.querySelector('[data-pin]').disabled`),true);
  await change('current','30'); await change('voltage','5');
  assert.match(await change('awg','30'),/not a possible operating point/);
  await evaluate(`document.querySelectorAll('${root}')[1].remove();document.querySelector('[data-reset]').click()`);
  await call('Emulation.setEmulatedMedia',{media:'print'});
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.wvd-lab')).display`),'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.wvd-static')).display`),'block');
  const pdf=await call('Page.printToPDF',{printBackground:true});
  fs.writeFileSync(path.join(out,'wire-print.pdf'),Buffer.from(pdf.data,'base64'));
  await call('Emulation.setEmulatedMedia',{media:'screen'});
  await navigate(`${base}/practice.html#wire-loop-resistance`);
  for(const [id,answer,wrong] of [['wire-loop-resistance','.6385','.3192'],['wire-run-drop','3.192','1.596'],['wire-percent-drop','13.30','6.65'],['wire-load-voltage','20.81','22.404'],['wire-smallest-gauge','14','16']]) {
    for(const [value,expected] of [[answer,'correct'],[wrong,'incorrect']]) {
      assert.equal(await evaluate(`(()=>{const r=document.getElementById('${id}');r.querySelector('[data-practice-input]').value='${value}';r.querySelector('[data-practice-check]').click();return r.getAttribute('data-state')})()`),expected);
    }
  }
  await call('Emulation.setScriptExecutionDisabled',{value:true});
  await navigate(url);
  await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
  assert.equal(await evaluate(`document.querySelector('.wvd-static table').checkVisibility()`),true);
  assert.match(await evaluate(`document.querySelector('.wvd-static').textContent`),/15.96/);
  assert.equal(await evaluate(`document.querySelector('.wvd-lab')`),null);
  await call('Emulation.setEmulatedMedia',{media:'print'});
  const nojsPdf=await call('Page.printToPDF',{printBackground:true});
  fs.writeFileSync(path.join(out,'wire-nojs-print.pdf'),Buffer.from(nojsPdf.data,'base64'));
  const aggregate=fs.readFileSync(path.join(docs,'print/section-engineering.html'),'utf8');
  assert.ok(aggregate.includes('WIRE-VOLTAGE-DROP-STATIC'));
  assert.ok(aggregate.includes('Wire heating loss (W)'));
  assert.ok(aggregate.includes('CourseWikiWireDropDraw'));
  assert.deepEqual(errors,[]);
  console.log('PASS: 375 px light/dark, text size, positive overflow control, keyboard, unit conversion, two independent roots, invalid/impossible inputs, five practice checks, no-JS table, print PDFs and aggregate.');

})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  if(call && ws?.readyState===1) { try { await call('Browser.close'); } catch {} }
  if(ws) ws.close();
  // Only the PID started above is eligible for this fallback.
  if(chrome && chrome.exitCode===null) chrome.kill();

});

}

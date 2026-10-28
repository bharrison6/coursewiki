const test = require('node:test');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const browserURL = process.env.COURSEWIKI_BROWSER_URL;
if (!chromium || !browserURL) {
  test('dc-motor-curve browser acceptance', { skip: 'Requires Playwright and COURSEWIKI_BROWSER_URL' }, () => {});
} else {
// Run after build-site.ps1: node interactives/dc-motor-curve/browser.test.cjs
// Browser profiles, screenshots, PDFs, and logs stay in OS temp.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'coursewiki-dc-motor-curve-'));
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
  const pages=['electric-motor-principles','electric-motor-types','dc-motor-curves'];
  for (const page of pages) {
    await navigate(`${base}/engineering/${page}.html`);
    await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
    assert.equal(await evaluate(`Array.from(document.images).every(i=>i.complete && i.naturalWidth>0)`),true);
    const expected=(fs.readFileSync(path.join(repo,'collections/engineering/pages',page+'.html'),'utf8').match(/<section[ >]/g)||[]).length;
    assert.equal(await evaluate(`document.querySelectorAll('.xcard').length`),expected);
    for(const theme of ['light','dark']) {
      await evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
      await call('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true,`${page} ${theme} mobile overflow`);
    }
    await call('Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.documentElement.setAttribute('data-theme','light')`);
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(out,page+'.png'),Buffer.from(shot.data,'base64'));
  }
  // Positive control: this same overflow probe must detect an oversized element.
  assert.equal(await evaluate(`(()=>{let e=document.documentElement;let old=e.style.minWidth;e.style.minWidth='2000px';let v=e.scrollWidth>innerWidth;e.style.minWidth=old;return v})()`),true);
  await call('Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.documentElement.setAttribute('data-theme','light')`);
  assert.match(await evaluate(`document.querySelector('[data-result]').textContent`), /47\.124/);
  assert.equal(await evaluate(`document.querySelector('[data-plot] svg')!==null`),true);
  await evaluate(`(()=>{const r=document.querySelector('[data-interactive="dc-motor-curve"]');const c=r.cloneNode(true);delete c.dataset.dmcReady;r.after(c);const s=document.createElement('script');s.src=document.querySelector('script[src*="dc-motor-curve/demo.js"]').src;document.body.append(s)})()`);
  for(let i=0;i<50;i++) {
    if(await evaluate(`document.querySelectorAll('[data-dmc-ready]').length===2`)) break;
    await delay(30);
  }
  assert.equal(await evaluate(`document.querySelectorAll('[data-dmc-ready]').length`),2);
  const change=async value=>evaluate(`(()=>{let e=document.querySelector('[data-load]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('[data-result]').textContent})()`);
  assert.match(await change('0.8'),/Stall:/);
  assert.match(await evaluate(`document.querySelectorAll('[data-result]')[1].textContent`),/47\.124/);
  assert.match(await change('0.9'),/no forward steady operating point/);
  assert.equal(await evaluate(`document.querySelector('.dmc-point')!==null`),true); // second root remains valid
  assert.equal(await evaluate(`document.querySelector('[data-plot]').querySelector('.dmc-point')===null`),true);
  assert.match(await change(''),/Enter stall torque/);
  assert.equal(await evaluate(`document.querySelector('[data-plot]').children.length`),0);
  await change('0.2');
  await evaluate(`document.querySelectorAll('[data-interactive="dc-motor-curve"]')[1].remove()`);
  const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync(path.join(out,'curve.png'),Buffer.from(screenshot.data,'base64'));
  await call('Emulation.setEmulatedMedia',{media:'print'});
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.dmc-live')).display`),'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.dmc-static')).display`),'block');
  const pdf=await call('Page.printToPDF',{printBackground:true});
  fs.writeFileSync(path.join(out,'curve.pdf'),Buffer.from(pdf.data,'base64'));
  const printed=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync(path.join(out,'curve-print.png'),Buffer.from(printed.data,'base64'));
  await call('Emulation.setEmulatedMedia',{media:'screen'});
  await navigate(`${base}/practice.html#motor-load-power`);
  for(const [id, val, state] of [['motor-load-power','47.12','correct'],['motor-load-power','450','incorrect'],['motor-open-loop-hold','2','correct']]) {
    assert.equal(await evaluate(`(()=>{const r=document.getElementById('${id}');r.querySelector('[data-practice-input]').value='${val}';r.querySelector('[data-practice-check]').click();return r.getAttribute('data-state')})()`),state);
  }
  await call('Emulation.setScriptExecutionDisabled',{value:true});
  await navigate(`${base}/engineering/dc-motor-curves.html`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.dmc-static')).display`),'block');
  assert.equal(await evaluate(`document.querySelector('.dmc-live').hidden`),true);
  const aggregate=fs.readFileSync(path.join(docs,'print/section-engineering.html'),'utf8');
  for(const phrase of ['Stator: fixed body', 'dc-motor-curve', 'Derive the halfway result']) {
    // Figures are embedded as data URIs, so their title text is checked in decoded SVG below.
    if (phrase !== 'Stator: fixed body') assert.ok(aggregate.includes(phrase),`aggregate contains ${phrase}`);
  }
  const figures=[...aggregate.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)].map(m=>Buffer.from(m[1],'base64').toString());
  assert.ok(figures.some(s=>s.includes('Stator: fixed body')),'aggregate embeds the authored motor diagram');
  assert.deepEqual(errors,[]);
  console.log('PASS: 3 pages, images/cards, light/dark mobile, positive overflow control, two independent roots, stall/overload/invalid input, practice checks, no-JS fallback, print PDF.');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  if(call && ws?.readyState===1) { try { await call('Browser.close'); } catch {} }
  if(ws) ws.close();
  // Only the PID started above is eligible for this fallback.
  if(chrome && chrome.exitCode===null) chrome.kill();

});

}

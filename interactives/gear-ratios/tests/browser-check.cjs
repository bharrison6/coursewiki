// Optional rendered-output check. Build first; set CHROME_PATH outside Windows.
// Uses Node's built-in WebSocket (Node 22+) and an isolated browser profile.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const artifactDir = path.join(__dirname, '.browser-check');
fs.mkdirSync(artifactDir, {recursive:true});
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + path.join(artifactDir, 'profile'), 'about:blank'],
  {windowsHide:true, stdio:['ignore','ignore','pipe']});
let ws, seq = 0;
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect(url) {
  ws = new WebSocket(url);
  await new Promise((resolve,reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (pending.has(msg.id)) {
      const {resolve,reject} = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    }
  };
}
function send(method, params = {}) {
  return new Promise((resolve,reject) => { const id = ++seq; pending.set(id,{resolve,reject}); ws.send(JSON.stringify({id,method,params})); });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function navigate(relative) {
  await send('Page.navigate', {url:pathToFileURL(path.join(root,'docs',relative)).href});
  for (let i = 0; i < 100; i++) {
    await sleep(50);
    if (await evaluate('document.readyState === "complete"')) return;
  }
  throw new Error('Page load timed out');
}
async function screenshot(name) {
  await sleep(150);
  const r = await send('Page.captureScreenshot', {format:'png'});
  fs.writeFileSync(path.join(artifactDir,name+'.png'), Buffer.from(r.data,'base64'));
}
(async () => {
  try {
    const endpoint = await new Promise((resolve,reject) => {
      let log = '';
      const timer = setTimeout(() => reject(new Error('Chrome startup timed out')),15000);
      browser.on('error',reject);
      browser.stderr.on('data', chunk => { log += chunk; const m = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) {clearTimeout(timer); resolve(m[1]);} });
    });
    const port = new URL(endpoint).port;
    const targets = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
    await navigate('engineering/gear-ratios.html');
    await evaluate(`document.documentElement.dataset.theme='light'; document.documentElement.style.scrollBehavior='auto'`);
    assert.equal(await evaluate('document.querySelectorAll(".xcard").length'),8);
    assert.equal(await evaluate('document.querySelectorAll("[data-interactive=gear-ratios].gr-live").length'),1);
    const result = await evaluate(`(() => {
      const r = document.querySelector('[data-interactive=gear-ratios]');
      r.closest('details').open = true;
      r.querySelector('input[value=compound]').click();
      r.querySelector('[data-gr-step]').click();
      const control = r.querySelector('[data-gr-control=efficiency] input');
      control.value=96; control.dispatchEvent(new Event('input',{bubbles:true}));
      return {speed:r.querySelector('[data-gr-speed]').textContent, ideal:r.querySelector('[data-gr-torque]').textContent,
        torque:r.querySelector('[data-gr-delivered-torque]').textContent, power:r.querySelector('[data-gr-delivered-power]').textContent,
        turns:r.dataset.grTurns, note:r.querySelector('[data-gr-loss-note]').textContent};
    })()`);
    assert.equal(result.speed,'30 rpm'); assert.equal(result.ideal,'8 N·m');
    assert.equal(result.torque,'7.37 N·m'); assert.equal(result.power,'23.16 W');
    assert.equal(result.turns,'1.000000'); assert.ok(result.note.includes('92.16%'));
    await screenshot('desktop-lab');
    assert.equal(await evaluate(`(() => {
      const r=document.createElement('div'); r.dataset.interactive='gear-ratios'; document.querySelector('.article').append(r);
      return true;
    })()`), true);
    // Load the module again: initialized roots must be skipped, new roots initialized.
    await evaluate(`new Promise(resolve => {const s=document.createElement('script'); s.src=document.querySelector('script[src*="gear-ratios/demo.js"]').src; s.onload=resolve; document.body.append(s);})`);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-interactive=gear-ratios]')).map(r=>[r.querySelectorAll('.gr-lab').length,r.querySelector('[data-gr-control=efficiency] input').value])`),[[1,'96'],[1,'100']]);
    assert.deepEqual(await evaluate(`(() => {const ids=Array.from(document.querySelectorAll('[data-interactive=gear-ratios] [id]')).map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);})()`),[]);
    await evaluate(`document.querySelectorAll('[data-interactive=gear-ratios]')[1].remove()`);
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:true});
    await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
    const overflow = await evaluate(`(() => {
      const measure=()=>Array.from(document.querySelectorAll('.article .body, .article .gr-lab, .article > div')).some(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth+1 || e.scrollWidth>e.clientWidth+1);
      const normal=measure();const control=document.createElement('div');control.style.width='2000px';document.querySelector('.article').append(control);
      const planted=measure();control.remove();return {normal,planted};
    })()`);
    assert.equal(overflow.planted,true); assert.equal(overflow.normal,false);
    await evaluate(`document.querySelector('.gr-loss-control').scrollIntoView({behavior:'instant',block:'center'})`);
    await screenshot('mobile-lab');
    await evaluate(`document.getElementById('gr-eff-title').closest('figure').scrollIntoView({behavior:'instant',block:'center'})`);
    await screenshot('mobile-efficiency');
    await evaluate(`document.documentElement.dataset.theme='dark'`);
    await screenshot('mobile-efficiency-dark');
    await navigate('practice.html');
    const checks = await evaluate(`(() => Array.from(document.querySelectorAll('[data-practice-id^="gear-"]')).map(r=>{
      const input=r.querySelector('[data-practice-input]'), button=r.querySelector('[data-practice-check]');
      const shown=r.querySelector('.solution').textContent.match(/Enter ([-−\\d.]+)/)[1]; input.value=shown;button.click();
      const good=r.dataset.state;input.value=Number(r.dataset.answer)+2*Number(r.dataset.tolerance)+1;button.click();
      return [r.dataset.practiceId,good,r.dataset.state];
    }))()`);
    assert.equal(checks.length,26);
    for (const [id,good,bad] of checks) {assert.equal(good,'correct',id);assert.equal(bad,'incorrect',id);}
    await navigate('print/track-rotation-and-torque.html');
    assert.equal(await evaluate('document.querySelectorAll("[data-interactive=gear-ratios].gr-live").length'),1);
    await send('Emulation.setEmulatedMedia',{media:'print'});
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.gr-lab')).display`),'none');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.gr-static')).display`),'grid');
    const pdf = await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
    fs.writeFileSync(path.join(artifactDir,'rotation-and-torque.pdf'),Buffer.from(pdf.data,'base64'));
    await send('Emulation.setScriptExecutionDisabled',{value:true});
    await send('Page.navigate',{url:pathToFileURL(path.join(root,'docs/engineering/gear-ratios.html')).href});
    await sleep(500);
    const nojs = await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
    fs.writeFileSync(path.join(artifactDir,'gear-ratios-nojs.pdf'),Buffer.from(nojs.data,'base64'));
    console.log(JSON.stringify({cards:8,practiceChecks:checks.length,independentRoots:true,mobileOverflow:overflow.normal,result,artifacts:artifactDir},null,2));
  } finally {
    if(ws) ws.close(); browser.kill();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});

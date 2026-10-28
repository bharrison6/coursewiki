// Run after build-site.ps1: node interactives/belt-geometry/browser.test.cjs
// Browser profiles, screenshots, PDFs, and logs stay in the lane scratch folder.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const out = path.join(repo, '.lane-scratch', 'belt-browser');
fs.mkdirSync(out, { recursive: true });
const docs = path.join(repo, 'docs');
const server = http.createServer((req, res) => {
  const file = path.resolve(docs, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(docs + path.sep)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome, ws, call;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
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
  const url = `${base}/engineering/belt-drives.html`;
  await navigate(url);
  await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
  const root = '[data-interactive="belt-geometry"]';
  assert.equal(await evaluate(`document.querySelectorAll('.xcard').length`),5);
  assert.equal(await evaluate(`document.querySelector('${root}').dataset.bgReady`),'true');
  assert.match(await evaluate(`document.querySelector('[data-results]').textContent`),/1277.49/);
  assert.equal(await evaluate(`document.querySelector('.bg-static').checkVisibility()`),false);
  for (const theme of ['light','dark']) {
    await evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
    await call('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate(`innerWidth`),375);
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true,`${theme}: document overflow`);
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('${root}');return r.scrollWidth<=r.clientWidth})()`),true,`${theme}: module overflow`);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('${root} label')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)`),true);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('${root} .bg-lab svg text')).every(e=>parseFloat(getComputedStyle(e).fontSize)*e.ownerSVGElement.getBoundingClientRect().width/e.ownerSVGElement.viewBox.baseVal.width>=12)`),true,'scaled SVG text at least 12 px');
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(out,`belt-mobile-${theme}.png`),Buffer.from(shot.data,'base64'));
  }
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('${root}');const e=document.createElement('div');e.style.cssText='width:2000px;min-width:2000px;height:20px';r.append(e);const overflow=r.scrollWidth>r.clientWidth;e.remove();return overflow})()`),true,'positive overflow control');
  assert.equal(await evaluate(`(()=>{const e=document.documentElement;const old=e.style.minWidth;e.style.minWidth='2000px';const overflow=e.scrollWidth>innerWidth;e.style.minWidth=old;return overflow})()`),true,'positive document overflow control');
  const change=async (key,value)=>evaluate(`(()=>{const e=document.querySelector('[data-key="${key}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('[data-results]').textContent})()`);
  const select=async (key,value)=>evaluate(`(()=>{const e=document.querySelector('.bg-lab [data-${key}]');e.value='${value}';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await evaluate(`document.querySelector('[data-key="D"]').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
  assert.equal(await evaluate(`document.querySelector('[data-key="D"]').value`),'201');
  await evaluate(`document.querySelector('[data-reset]').click()`);
  const before=await evaluate(`document.querySelector('[data-results]').textContent`);
  const figure=await evaluate(`document.querySelector('[data-figure]').innerHTML`);
  await change('C','500');
  assert.notEqual(await evaluate(`document.querySelector('[data-figure]').innerHTML`),figure);
  await evaluate(`document.querySelector('[data-reset]').click()`);
  await select('unit','in');
  assert.ok(Math.abs(Number(await evaluate(`document.querySelector('[data-key="D"]').value`))-200/25.4)<1e-9);
  assert.match(await evaluate(`document.querySelector('[data-results]').textContent`),/376.991/);
  await select('unit','mm');
  await select('mode','length');
  assert.equal(await evaluate(`document.querySelector('[data-key="C"]').disabled`),true);
  assert.match(await change('L','1300'),/411.342/);
  assert.equal(await change('L','100'),'');
  assert.match(await evaluate(`document.querySelector('[data-status]').textContent`),/cannot fit/);
  await evaluate(`document.querySelector('[data-reset]').click()`);
  await evaluate(`(()=>{const r=document.querySelector('${root}');const c=r.cloneNode(true);c.querySelector('.bg-lab').remove();delete c.dataset.bgReady;r.after(c);const s=document.createElement('script');s.src=document.querySelector('script[src*="belt-geometry/demo.js"]').src;document.body.append(s)})()`);
  for(let i=0;i<50;i++) { if(await evaluate(`document.querySelectorAll('[data-bg-ready]').length===2`)) break; await delay(30); }
  assert.equal(await evaluate(`document.querySelectorAll('[data-bg-ready]').length`),2);
  assert.equal(await evaluate(`(()=>{const ids=Array.from(document.querySelectorAll('${root} [id]')).map(e=>e.id);return new Set(ids).size===ids.length})()`),true);
  await change('n','600');
  assert.equal(await evaluate(`document.querySelectorAll('[data-results]')[1].textContent`),before);
  assert.equal(await change('D',''),'');
  await evaluate(`document.querySelector('[data-reset]').click()`);
  assert.equal(await change('C','100'),'');
  await evaluate(`document.querySelectorAll('${root}')[1].remove();document.querySelector('[data-reset]').click()`);
  await call('Emulation.setEmulatedMedia',{media:'print'});
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.bg-lab')).display`),'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.bg-static')).display`),'block');
  assert.match(await evaluate(`document.querySelector('.bg-static table').textContent`),/1277.49/);
  const pdf=await call('Page.printToPDF',{printBackground:true});
  fs.writeFileSync(path.join(out,'belt-print.pdf'),Buffer.from(pdf.data,'base64'));
  await call('Emulation.setEmulatedMedia',{media:'screen'});
  await navigate(`${base}/practice.html#belt-open-length`);
  for(const [id,answer,wrong] of [['belt-open-length','1277.5','1271.24'],['belt-stock-center','411.3','414.38'],['belt-driven-speed','600','2400'],['belt-linear-speed','377','188.5'],['belt-small-wrap','165.6','179.75']]) {
    for(const [value,expected] of [[answer,'correct'],[wrong,'incorrect']]) {
      assert.equal(await evaluate(`(()=>{const r=document.getElementById('${id}');r.querySelector('[data-practice-input]').value='${value}';r.querySelector('[data-practice-check]').click();return r.getAttribute('data-state')})()`),expected);
    }
  }
  await call('Emulation.setScriptExecutionDisabled',{value:true});
  await navigate(url);
  await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
  assert.equal(await evaluate(`document.querySelector('.bg-static table').checkVisibility()`),true);
  assert.match(await evaluate(`document.querySelector('.bg-static').textContent`),/165.64/);
  assert.equal(await evaluate(`document.querySelector('.bg-lab')`),null);
  const nojsShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync(path.join(out,'belt-nojs.png'),Buffer.from(nojsShot.data,'base64'));
  await call('Emulation.setEmulatedMedia',{media:'print'});
  const nojsPdf=await call('Page.printToPDF',{printBackground:true});
  fs.writeFileSync(path.join(out,'belt-nojs-print.pdf'),Buffer.from(nojsPdf.data,'base64'));
  const aggregate=fs.readFileSync(path.join(docs,'print/section-engineering.html'),'utf8');
  assert.ok(aggregate.includes('BELT-GEOMETRY-STATIC'));
  assert.ok(aggregate.includes('Belt pitch length L'));
  assert.ok(aggregate.includes('CourseWikiBeltDraw'));
  assert.deepEqual(errors,[]);
  console.log('PASS: 375 px light/dark, label sizes, positive overflow control, keyboard, conversion, inverse mode, independent roots, invalid geometry, five practice checks, no-JS table, print PDFs and aggregate.');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  if(call && ws?.readyState===1) { try { await call('Browser.close'); } catch {} }
  if(ws) ws.close();
  // Only the PID started above is eligible for this fallback.
  if(chrome && chrome.exitCode===null) chrome.kill();
  server.close();
});

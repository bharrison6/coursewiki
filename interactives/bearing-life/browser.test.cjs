// Run after build-site.ps1: node interactives/bearing-life/browser.test.cjs
// Browser profiles, screenshots, PDFs, and logs stay in the lane scratch folder.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const out = path.join(repo, '.lane-scratch', 'bearing-browser');
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
  const url = `${base}/engineering/bearing-types-and-loads.html`;
  await navigate(url);
  await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
  const root = '[data-interactive="bearing-life"]';
  assert.equal(await evaluate(`document.querySelectorAll('.xcard').length`),6);
  assert.equal(await evaluate(`document.querySelector('${root}').dataset.blReady`),'true');
  assert.match(await evaluate(`document.querySelector('[data-results]').textContent`),/3811/);
  assert.equal(await evaluate(`document.querySelector('.bl-static').checkVisibility()`),false);
  for (const theme of ['light','dark']) {
    await evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
    await call('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate(`innerWidth`),375);
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true,`${theme}: document overflow`);
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('${root}');return r.scrollWidth<=r.clientWidth})()`),true,`${theme}: module overflow`);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('${root} label')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)`),true);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('${root} .bl-lab svg text')).every(e=>parseFloat(getComputedStyle(e).fontSize)*e.ownerSVGElement.getBoundingClientRect().width/e.ownerSVGElement.viewBox.baseVal.width>=12)`),true,'scaled SVG text at least 12 px');
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(out,`bearing-mobile-${theme}.png`),Buffer.from(shot.data,'base64'));
    const clip=await evaluate(`(()=>{const r=document.querySelector('${root} [data-chart]').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`);
    const chartShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
    fs.writeFileSync(path.join(out,`bearing-chart-${theme}.png`),Buffer.from(chartShot.data,'base64'));

  }
  // SVG text clipping is invisible to scrollWidth checks: measure every chart label's box against the viewBox
  // at the extremes of the allowed input range, with a planted over-long label as the positive control.
  const textInside=`(()=>{const svg=document.querySelector('${root} .bl-lab svg');const vb=svg.viewBox.baseVal;return Array.from(svg.querySelectorAll('text')).every(t=>{const b=t.getBBox();return b.x>=vb.x-0.5&&b.x+b.width<=vb.x+vb.width+0.5})})()`;
  const setAll=async v=>evaluate(`(()=>{for(const [k,x] of Object.entries(${JSON.stringify(v)})){const e=document.querySelector('${root} [data-key="'+k+'"]');e.value=x;e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  for(const v of [{C:'1000',P:'0.1',speed:'1'},{C:'1000',P:'2',speed:'1500'},{C:'0.1',P:'1000',speed:'100000'},{C:'1000',P:'1000',speed:'1'}]) {
    await setAll(v);
    assert.equal(await evaluate(textInside),true,'chart labels inside the viewBox for '+JSON.stringify(v));
  }
  assert.equal(await evaluate(`(()=>{const svg=document.querySelector('${root} .bl-lab svg');const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x','70');t.setAttribute('y','60');t.setAttribute('text-anchor','end');t.textContent='1389000000000';svg.append(t);const ok=${textInside};t.remove();return ok})()`),false,'positive SVG clipping control');
  await evaluate(`document.querySelector('${root} [data-reset]').click()`);
  assert.equal(await evaluate(`(()=>{const e=document.documentElement;const old=e.style.minWidth;e.style.minWidth='2000px';const overflow=e.scrollWidth>innerWidth;e.style.minWidth=old;return overflow})()`),true,'positive document overflow control');
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('${root}');const e=document.createElement('div');e.style.cssText='width:2000px;min-width:2000px;height:20px;flex-shrink:0';r.append(e);const overflow=r.scrollWidth>r.clientWidth;e.remove();return overflow})()`),true,'positive module overflow control');
  const change=async (key,value)=>evaluate(`(()=>{const e=document.querySelector('[data-key="${key}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('[data-results]').textContent})()`);
  await evaluate(`document.querySelector('[data-key="P"]').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
  assert.equal(await evaluate(`document.querySelector('[data-key="P"]').value`),'3','real keyboard changes load');
  await evaluate(`document.querySelector('[data-reset]').click()`);
  const before=await evaluate(`document.querySelector('[data-results]').textContent`);
  // Two instances share only immutable code, never controls or input state.
  await evaluate(`(()=>{const r=document.querySelector('${root}');const c=r.cloneNode(true);c.querySelector('.bl-lab').remove();delete c.dataset.blReady;r.after(c);const s=document.createElement('script');s.src=document.querySelector('script[src*="bearing-life/demo.js"]').src;document.body.append(s)})()`);
  for(let i=0;i<50;i++) { if(await evaluate(`document.querySelectorAll('[data-bl-ready]').length===2`)) break; await delay(30); }
  assert.equal(await evaluate(`document.querySelectorAll('[data-bl-ready]').length`),2);
  assert.equal(await evaluate(`(()=>{const ids=Array.from(document.querySelectorAll('${root} [id]')).map(e=>e.id);return new Set(ids).size===ids.length})()`),true,'unique instance control IDs');
  assert.match(await change('P','4'),/476.4/);
  assert.equal(await evaluate(`document.querySelectorAll('[data-results]')[1].textContent`),before);
  assert.equal(await change('P',''),'');
  assert.match(await evaluate(`document.querySelector('[data-status]').textContent`),/within/);
  await change('P','2');
  await evaluate(`(()=>{const e=document.querySelector('.bl-lab select');e.value='roller';e.dispatchEvent(new Event('change'))})()`);
  assert.match(await evaluate(`document.querySelector('[data-results]').textContent`),/656.1/);
  await evaluate(`document.querySelectorAll('${root}')[1].remove();document.querySelector('[data-reset]').click()`);
  await call('Emulation.setEmulatedMedia',{media:'print'});
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.bl-lab')).display`),'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.bl-static')).display`),'block');
  const pdf=await call('Page.printToPDF',{printBackground:true});
  fs.writeFileSync(path.join(out,'bearing-print.pdf'),Buffer.from(pdf.data,'base64'));
  await call('Emulation.setEmulatedMedia',{media:'screen'});
  await navigate(`${base}/practice.html#bearing-life-ball`);
  for(const [id,answer,wrong] of [['bearing-life-ball','343','0.002915'],['bearing-life-hours','3811','228666.7'],['bearing-life-double','42.88','171.5'],['bearing-life-roller','656.1','343'],['bearing-life-rating','15.87','1000']]) {
    for(const [value,expected] of [[answer,'correct'],[wrong,'incorrect']]) {
      assert.equal(await evaluate(`(()=>{const r=document.getElementById('${id}');r.querySelector('[data-practice-input]').value='${value}';r.querySelector('[data-practice-check]').click();return r.getAttribute('data-state')})()`),expected);
    }
  }
  await call('Emulation.setScriptExecutionDisabled',{value:true});
  await navigate(url);
  await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
  assert.equal(await evaluate(`document.querySelector('.bl-static table').checkVisibility()`),true);
  assert.match(await evaluate(`document.querySelector('.bl-static').textContent`),/3811/);
  assert.equal(await evaluate(`document.querySelector('.bl-lab')`),null);
  await call('Emulation.setEmulatedMedia',{media:'print'});
  const nojsPdf=await call('Page.printToPDF',{printBackground:true});
  fs.writeFileSync(path.join(out,'bearing-nojs-print.pdf'),Buffer.from(nojsPdf.data,'base64'));
  const aggregate=fs.readFileSync(path.join(docs,'print/section-engineering.html'),'utf8');
  assert.ok(aggregate.includes('BEARING-LIFE-STATIC'));
  assert.ok(aggregate.includes('L10h (hours)'));
  assert.ok(aggregate.includes('CourseWikiBearingLifeDraw'));
  assert.deepEqual(errors,[]);
  console.log('PASS: 375 px light/dark, text size, positive overflow control, keyboard, roller exponent, two independent roots, invalid inputs, five practice checks, no-JS table, print PDFs and aggregate.');

})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  if(call && ws?.readyState===1) { try { await call('Browser.close'); } catch {} }
  if(ws) ws.close();
  // Only the PID started above is eligible for this fallback.
  if(chrome && chrome.exitCode===null) chrome.kill();
  server.close();
});

// Run after build-site.ps1. Uses Chrome's DevTools protocol without npm dependencies.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const output = path.join(__dirname, '.verification');
fs.mkdirSync(output, { recursive: true });
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server = http.createServer((req, res) => {
  const file = path.resolve(repo, 'docs', '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(path.resolve(repo, 'docs') + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
let chrome, ws;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = path.join(__dirname, '.browser', String(process.pid));
  chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], { windowsHide: true, stdio:'ignore' });
  const active = path.join(profile, 'DevToolsActivePort');
  let port;
  for(let i=0;i<100;i++) {
    try { port=fs.readFileSync(active,'utf8').split('\n')[0]; if(port) break; } catch {}
    await delay(100);
  }
  assert.ok(port,'Chrome debugging port is available');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open',resolve,{once:true}));
  let id=0; const pending=new Map(), errors=[];
  ws.addEventListener('message',event=>{
    const data=JSON.parse(event.data);
    if(data.id) { const p=pending.get(data.id); pending.delete(data.id); data.error?p.reject(data.error):p.resolve(data.result); }
    if(data.method==='Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{ pending.set(++id,{resolve,reject}); ws.send(JSON.stringify({id,method,params})); });
  const evaluate=async expression=>{
    const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  await call('Page.enable'); await call('Runtime.enable');
  const navigate=async url=>{
    await call('Page.navigate',{url});
    for(let i=0;i<100;i++) {
      if(await evaluate(`location.href===${JSON.stringify(url)} && document.readyState==='complete'`)) return;
      await delay(50);
    }
    throw Error('Navigation timeout: '+url);
  };
  const openCards=()=>evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true); true`);
  const screenshot=async name=>{
    const data=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(output,name),Buffer.from(data.data,'base64'));
  };
  const ids=['alphabet-of-lines','orthographic-projection','choosing-drawing-views','first-and-third-angle-projection'];
  for(const page of ids) {
    await navigate(`${base}/engineering-graphics/${page}.html`);
    const count=await evaluate(`document.querySelectorAll('details.xcard').length`);
    const source=fs.readFileSync(path.join(repo,'collections/engineering-graphics/pages',page+'.html'),'utf8');
    assert.equal(count,(source.match(/<section\b/g)||[]).length,page+' card coverage');
    await openCards();
    assert.equal(await evaluate(`Array.from(document.images).filter(i=>!i.complete||i.naturalWidth===0).length`),0,'images load');
    for(const theme of ['light','dark']) {
      await evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
      await call('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});
      const overflow=await evaluate(`Array.from(document.querySelectorAll('main *')).some(e=>e.getClientRects().length && e.getBoundingClientRect().right>innerWidth+1)`);
      assert.equal(overflow,false,page+' '+theme+' mobile overflow');
    }
    // Positive control: the same overflow probe must detect a deliberately wide element.
    assert.equal(await evaluate(`(()=>{const e=document.createElement('div');e.style.cssText='width:2000px;min-width:2000px;height:1px';document.querySelector('main').append(e);const result=Array.from(document.querySelectorAll('main *')).some(e=>e.getClientRects().length && e.getBoundingClientRect().right>innerWidth+1);e.remove();return result})()`),true);
    await call('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.documentElement.setAttribute('data-theme','light')`);
    await screenshot(page+'.png');
  }
  await navigate(`${base}/engineering-graphics/orthographic-projection.html`); await openCards();
  assert.equal(await evaluate(`document.querySelectorAll('[data-vp-ready]').length`),1);
  const behavior=await evaluate(`(()=>{
    const root=document.querySelector('[data-interactive="view-projection"]');
    const part=root.querySelector('[data-vp-part]'),view=root.querySelector('[data-vp-view]'),angle=root.querySelector('[data-vp-angle]'),button=root.querySelector('button');
    const out=[];
    for(const p of ['left-step','right-step','ridge']) for(const v of ['front','top','right']) for(const a of ['first','third']) {
      part.value=p;part.dispatchEvent(new Event('change'));view.value=v;view.dispatchEvent(new Event('change'));angle.value=a;angle.dispatchEvent(new Event('change'));
      const masked=root.querySelector('.vp-views').textContent.includes('?');button.click();
      out.push(masked&&!root.querySelector('.vp-views').textContent.includes('?')&&root.querySelector('.vp-feedback').textContent.includes('view shows'));
    }
    return out;
  })()`);
  assert.equal(behavior.length,18); assert.ok(behavior.every(Boolean));
  await evaluate(`(()=>{const original=document.querySelector('[data-interactive="view-projection"]');const copy=original.cloneNode(true);copy.removeAttribute('data-vp-ready');original.after(copy);})()`);
  await evaluate(fs.readFileSync(path.join(__dirname,'demo.js'),'utf8'));
  assert.equal(await evaluate(`document.querySelectorAll('[data-vp-ready]').length`),2);
  assert.equal(await evaluate(`(()=>{const r=[...document.querySelectorAll('[data-vp-ready]')];const before=r[0].innerHTML;const s=r[1].querySelector('select');s.value='right-step';s.dispatchEvent(new Event('change'));return r[0].innerHTML===before})()`),true,'independent roots');
  await navigate(`${base}/practice.html`);
  const practice=await evaluate(`Array.from(document.querySelectorAll('[data-practice]')).filter(r=>r.dataset.practiceId.startsWith('reading-')).map(r=>{
    const input=r.querySelector('[data-practice-input]'),button=r.querySelector('[data-practice-check]');
    input.value='';button.click();const empty=r.dataset.state;
    input.value=r.dataset.answer;button.click();const right=r.dataset.state;
    const wrongs=[...input.options].filter(o=>o.value&&o.value!==r.dataset.answer).map(o=>{input.value=o.value;button.click();return r.dataset.state});
    return {id:r.dataset.practiceId,empty,right,wrongs};
  })`);
  assert.equal(practice.length,21);
  for(const p of practice) { assert.equal(p.empty,'error',p.id);assert.equal(p.right,'correct',p.id);assert.ok(p.wrongs.every(w=>w==='incorrect'),p.id); }
  await navigate(`${base}/print/section-engineering-graphics.html`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-vp-ready]').length`),1,'aggregate module initializes');
  await call('Emulation.setScriptExecutionDisabled',{value:true});
  await navigate(`${base}/print/section-engineering-graphics.html?nojs=1`);
  const pdf=await call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
  fs.writeFileSync(path.join(output,'engineering-graphics-nojs.pdf'),Buffer.from(pdf.data,'base64'));
  await call('Emulation.setScriptExecutionDisabled',{value:false});
  for(const name of ['glass-box','line-alphabet','drawing-annotation-lines','projection-symbols','stepped-projections','view-identification']) {
    await navigate(`${base}/media/engineering-graphics/${name}.svg`);
    await screenshot(name+'.png');
  }
  assert.deepEqual(errors,[],'browser has no JavaScript exceptions');
  console.log('PASS: 4 pages, card/image coverage, light/dark 375px, overflow control, 18 explorer states, 2 independent roots, 21 practice keys and distractors, aggregate initialization, no-JS print generated.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  if(ws) ws.close(); if(chrome) chrome.kill(); server.close();
});

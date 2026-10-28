// Start a disposable headless Chrome with --remote-debugging-port=9337 first.
// Run after build-site.ps1. Uses only Node built-ins and writes evidence locally.
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const out=path.join(__dirname,'.verification');
fs.mkdirSync(out,{recursive:true});
const timeoutMs=15000;
let completed=false;
process.on('exit',()=>{
  if(!completed) {
    console.error('FAIL: browser assertions did not complete.');
    process.exitCode=1;
  }
});
(async()=>{
  const tabs=await (await fetch('http://127.0.0.1:9337/json/list',{signal:AbortSignal.timeout(timeoutMs)})).json();
  const socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  let id=0; const pending=new Map(), exceptions=[];
  let socketFailure;
  const failPending=error=>{
    socketFailure=error;
    for(const request of pending.values()) request.reject(error);
  };
  socket.addEventListener('close',()=>failPending(new Error('CDP socket closed')));
  socket.addEventListener('error',()=>failPending(new Error('CDP socket error')));
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error('CDP connection timeout')),timeoutMs);
    const opened=()=>finish();
    const failed=()=>finish(new Error('CDP connection closed or errored'));
    function finish(error) {
      clearTimeout(timer);
      socket.removeEventListener('open',opened);
      socket.removeEventListener('close',failed);
      socket.removeEventListener('error',failed);
      error?reject(error):resolve();
    }
    socket.addEventListener('open',opened,{once:true});
    socket.addEventListener('close',failed,{once:true});
    socket.addEventListener('error',failed,{once:true});
  });
  socket.addEventListener('message',e=>{
    const m=JSON.parse(e.data);
    if(m.method==='Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text);
    if(pending.has(m.id)) {const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(m.error):resolve(m.result);}
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    if(socketFailure || socket.readyState!==WebSocket.OPEN) return reject(socketFailure || new Error('CDP socket is not open'));
    const requestId=++id;
    const timer=setTimeout(()=>finish(new Error(`CDP command timeout after ${timeoutMs} ms: ${method}`)),timeoutMs);
    function finish(error,result) {
      clearTimeout(timer);
      pending.delete(requestId);
      error?reject(error):resolve(result);
    }
    pending.set(requestId,{resolve:result=>finish(null,result),reject:error=>finish(error)});
    try { socket.send(JSON.stringify({id:requestId,method,params})); }
    catch(error) { finish(error); }
  });
  const evaluate=async expression=>{
    const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  async function navigate(file) {
    await call('Page.navigate',{url:pathToFileURL(path.resolve(__dirname,'../../docs',file)).href});
    for(let n=0;n<100;n++) {
      await new Promise(r=>setTimeout(r,100));
      if(await evaluate(`document.readyState==='complete' && location.href.includes(${JSON.stringify(file.split('/').pop())})`)) return;
    }
    throw new Error('Page did not finish loading: '+file);
  }
  await call('Page.enable');await call('Runtime.enable');await call('Page.bringToFront');
  await call('Emulation.setScriptExecutionDisabled',{value:false});
  await call('Emulation.setEmulatedMedia',{media:'screen'});
  // Negative control: a never-resolving browser promise must fail on the command timeout.
  if(process.argv.includes('--force-hang')) await evaluate('new Promise(()=>{})');
  await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
  const pages={'measurement-tools':7,'reading-measuring-scales':7,'reliable-shop-measurement':5,'layout-and-angle-measurement':7};
  for(const [page,count] of Object.entries(pages)) {
    await navigate('machining/'+page+'.html');
    const info=await evaluate(`({cards:document.querySelectorAll('details.xcard').length,images:[...document.querySelectorAll('img[src*="measurement/"]')].map(i=>i.complete&&i.naturalWidth>0),raw:document.body.innerText.includes('[[')})`);
    assert.equal(info.cards,count,page);assert.ok(info.images.every(Boolean),page);assert.equal(info.raw,false,page);
    assert.equal(info.images.length,['measurement-tools','reading-measuring-scales'].includes(page)?1:0,page);
    await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
    console.log(page,info);
  }
  await navigate('machining/reading-measuring-scales.html');
  assert.equal(await evaluate(`document.querySelectorAll('.mr-live').length`),1);
  await evaluate(`document.querySelectorAll('details.xcard').forEach(d=>d.open=true)`);
  for(const [mode,sample,answer] of [['micrometer',.399,'0.399'],['vernier-micrometer',.2999,'0.2999'],['vernier-caliper',.6745,'1.349']]) {
    const result=await evaluate(`(()=>{
      const root=document.querySelector('[data-interactive="measurement-reading"]');
      const old=Math.random;Math.random=()=>${sample};
      const select=root.querySelector('select');select.value=${JSON.stringify(mode)};select.dispatchEvent(new Event('change'));Math.random=old;
      const input=root.querySelector('input'),form=root.querySelector('form'),feedback=root.querySelector('.mr-feedback');
      input.value=${JSON.stringify(answer)};form.dispatchEvent(new Event('submit',{cancelable:true}));const correct=feedback.textContent;
      input.value=String(Number(${JSON.stringify(answer)})+.0001);form.dispatchEvent(new Event('submit',{cancelable:true}));const wrong=feedback.textContent;
      root.scrollIntoView({block:'start'});return {correct,wrong};
    })()`);
    assert.match(result.correct,/^Correct\./);assert.match(result.wrong,/^Not yet\./);
    for(const theme of ['light','dark']) {
      await evaluate(`document.documentElement.setAttribute('data-theme','${theme}')`);
      const rect=await evaluate(`(()=>{const r=document.querySelector('.mr-live').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:rect});
      fs.writeFileSync(path.join(out,mode+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));
    }
    console.log(mode,result);
  }
  await call('Emulation.setDeviceMetricsOverride',{width:375,height:850,deviceScaleFactor:1,mobile:false});
  await evaluate(`{const s=document.createElement('style');s.textContent='*{transition:none!important;scroll-behavior:auto!important}';document.head.append(s);document.querySelector('.sidebar')?.removeAttribute('data-open');}`);
  await new Promise(r=>setTimeout(r,300));
  await evaluate(`document.querySelector('[data-interactive="measurement-reading"]').scrollIntoView()`);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'375px page overflow');
  // Positive control: prove the same probe detects a deliberately oversized element.
  await evaluate(`{const p=document.createElement('div');p.id='overflow-control';p.style.cssText='width:2000px;height:1px';document.body.append(p);}`);
  assert.ok(await evaluate(`document.documentElement.scrollWidth>innerWidth`));
  await evaluate(`document.getElementById('overflow-control').remove()`);
  fs.writeFileSync(path.join(out,'mobile.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:1100,deviceScaleFactor:1,mobile:false});
  // A second root must get fresh state without reinitializing the first.
  await evaluate(`{const a=document.querySelector('[data-interactive="measurement-reading"]'),b=a.cloneNode(true);b.querySelector('.mr-live').remove();delete b.dataset.mrReady;b.classList.remove('mr-enhanced');a.after(b);}`);
  await evaluate(fs.readFileSync(path.join(__dirname,'demo.js'),'utf8'));
  assert.equal(await evaluate(`document.querySelectorAll('.mr-live').length`),2);
  assert.ok(await evaluate(`(()=>{const roots=document.querySelectorAll('[data-interactive="measurement-reading"]'),before=roots[0].querySelector('.mr-drawing').innerHTML;roots[1].querySelector('.mr-next').click();return roots[0].querySelector('.mr-drawing').innerHTML===before;})()`));
  await navigate('practice.html');
  const checked=await evaluate(`(()=>{
    const ids=${JSON.stringify([...fs.readFileSync(path.join(__dirname,'../../practice/measurement-and-layout.html'),'utf8').matchAll(/data-practice-id="([^"]+)"/g)].map(m=>m[1]))};
    const items=[...document.querySelectorAll('[data-practice-id][data-answer]')].filter(r=>ids.includes(r.dataset.practiceId));
    return items.map(root=>{const i=root.querySelector('[data-practice-input]'),b=root.querySelector('[data-practice-check]');
      i.value=root.dataset.answer;b.click();const good=root.dataset.state;
      i.value=String(Number(root.dataset.answer)+.0001);b.click();return {id:root.dataset.practiceId,good,bad:root.dataset.state};});
  })()`);
  assert.equal(checked.length,24);assert.ok(checked.every(r=>r.good==='correct'&&r.bad==='incorrect'));
  console.log('Native practice checker:',checked.length,'correct accepted and wrong rejected');
  await navigate('print/section-machining.html');
  assert.equal(await evaluate(`document.querySelectorAll('[data-interactive="measurement-reading"] .mr-live').length`),1);
  await call('Emulation.setEmulatedMedia',{media:'print'});
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.mr-live')).display`),'none');
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.mr-static')).display`),'none');
  const pdf=await call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
  fs.writeFileSync(path.join(out,'machining-print.pdf'),Buffer.from(pdf.data,'base64'));
  console.log('Aggregate initialized alongside other modules; print PDF saved.');
  await call('Emulation.setEmulatedMedia',{media:'screen'});
  await call('Emulation.setScriptExecutionDisabled',{value:true});
  await navigate('machining/reading-measuring-scales.html');
  assert.equal(await evaluate(`document.querySelectorAll('.mr-live').length`),0);
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.mr-static')).display`),'none');
  await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
  const staticText=await evaluate(`document.querySelector('.mr-static').innerText`);
  assert.match(staticText,/0\.2999/);assert.match(staticText,/1\.158/);
  fs.writeFileSync(path.join(out,'static-no-js.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=false)`);
  await call('Emulation.setEmulatedMedia',{media:'print'});
  const staticPdf=await call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
  fs.writeFileSync(path.join(out,'static-no-js-print.pdf'),Buffer.from(staticPdf.data,'base64'));
  await call('Emulation.setScriptExecutionDisabled',{value:false});
  console.log('Trainer static/no-JavaScript fallback and print PDF saved.');
  console.log('Runtime exceptions:',exceptions);
  assert.deepEqual(exceptions,[]);
  assert.equal(pending.size,0);
  assert.equal(socketFailure,undefined);
  completed=true;
  console.log('PASS: all browser assertions completed.');
  socket.close();
})().catch(e=>{console.error(e);process.exit(1);});

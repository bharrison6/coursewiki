'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const browserSupport=require('../../tests/support/browser.cjs'),routeDocs=process.env.COURSEWIKI_ROUTE_DOCS;
const {browserURL,skip,launch}=browserSupport.resolveBrowser(routeDocs?{...process.env,COURSEWIKI_BROWSER_URL:'https://coursewiki.invalid'}:process.env);
const sourceRoot=path.resolve(__dirname,'../..'),out=process.env.COURSEWIKI_PWM_EVIDENCE||fs.mkdtempSync(path.join(os.tmpdir(),'coursewiki-pwm-first-use-'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const contentTypes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
function exactFile(root,pathname){let current=path.resolve(root);for(const segment of decodeURIComponent(pathname).split('/').filter(Boolean)){if(segment==='.'||segment==='..')return null;const entries=fs.readdirSync(current);if(!entries.includes(segment))return null;current=path.join(current,segment);}return current;}
async function contextFor(browser,options={}){const context=await browser.newContext(options);if(routeDocs)await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='https://coursewiki.invalid')return route.abort();let file;try{file=exactFile(routeDocs,url.pathname);}catch{return route.fulfill({status:404,body:'Not found'});}if(!file||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Not found'});return route.fulfill({status:200,contentType:contentTypes[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});});return context;}
async function openCards(page){await page.locator('details.xcard').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));}
async function set(root,selector,value){const input=root.locator(selector);await input.fill(value);await input.dispatchEvent('input');}

test('PWM sampling compact first use keeps canonical behavior and native controls', {skip}, async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=await launch();
  try{
    for(const file of ['model.js','demo.js','demo.css'])assert.equal(fs.readFileSync(path.join(__dirname,file),'utf8').replace(/\r\n/g,'\n'),fs.readFileSync(path.join(sourceRoot,'docs/interactives/pwm-and-adc',file),'utf8').replace(/\r\n/g,'\n'),`served ${file} matches source`);
    const context=await contextFor(browser,{viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const base=browserURL.replace(/\/$/,''),url=base+'/engineering/pulse-width-modulation.html';assert.equal((await page.goto(url,{waitUntil:'networkidle'})).status(),200);await openCards(page);
    const root=page.locator('[data-interactive="pwm-and-adc"]');assert.equal(await root.getAttribute('data-pa-ready'),'true');
    assert.equal(await root.locator('.pa-advanced').evaluate(node=>node.open),false);assert.equal(await root.locator('.pa-adc').evaluate(node=>node.open),false);
    assert.match(await root.locator('[data-settings]').textContent(),/25% duty at 500 Hz.*Raw PWM.*12 point samples at 500 samples\/s.*phase 10%.*trace shown/);
    for(const selector of ['.pa-quick','.pa-plot-scroll','.pa-predict','[data-sample-output]'])assert.equal(await root.locator(selector).isVisible(),true,selector+' is visible at first use');
    await root.locator('input[value="higher"]').check();await root.locator('[data-reveal]').click();assert.match(await root.locator('[data-sample-output]').textContent(),/Prediction confirmed.*mean 5\.0000 V is higher.*time mean 1\.2500 V/);
    const initialUrl=page.url();await root.locator('[data-phase-preset="60"]').focus();await page.keyboard.press(' ');assert.equal(page.url(),initialUrl);assert.match(await root.locator('[data-settings]').textContent(),/phase 60%/);assert.match(await root.locator('[data-sample-output]').textContent(),/Inputs changed/);
    await root.locator('input[value="lower"]').check();await root.locator('[data-reveal]').click();assert.match(await root.locator('[data-sample-output]').textContent(),/mean 0\.0000 V is lower/);
    const advanced=root.locator('.pa-advanced'),advancedSummary=advanced.locator(':scope > summary');await advancedSummary.focus();await page.keyboard.press('Space');assert.equal(await advanced.evaluate(node=>node.open),true);assert.equal(page.url(),initialUrl);
    assert.equal(await root.locator('[data-frequency]').inputValue(),'500');assert.equal(await root.locator('[data-count]').inputValue(),'12');
    await root.locator('[data-frequency]').fill('');await root.locator('[data-frequency]').dispatchEvent('input');assert.match(await root.locator('[data-settings]').textContent(),/Settings need attention.*empty or outside/);assert.equal(await root.locator('[data-square]').getAttribute('d'),'');assert.doesNotMatch(await root.locator('[data-settings]').textContent(),/25% duty at 500 Hz/);
    await set(root,'[data-frequency]','500');await set(root,'[data-sample-frequency]','5000');await set(root,'[data-phase]','1');await set(root,'[data-count]','1000');assert.match(await root.locator('[data-settings]').textContent(),/1000 point samples at 5000 samples\/s.*phase 1%/);
    await root.locator('[data-signal]').selectOption('filtered');assert.equal(await root.locator('[data-smooth]').isChecked(),true);assert.equal(await root.locator('[data-smooth]').isDisabled(),true);assert.match(await root.locator('[data-settings]').textContent(),/Settled RC output/);
    await root.locator('.pa-adc > summary').focus();await page.keyboard.press('Enter');assert.equal(await root.locator('.pa-adc').evaluate(node=>node.open),true);assert.equal(await root.locator('[data-voltage]').inputValue(),'3');assert.equal(await root.locator('[data-code]').inputValue(),'614');
    await page.evaluate(()=>{const original=document.querySelector('[data-interactive="pwm-and-adc"]'),clone=original.cloneNode(true);clone.querySelector('.pa-live').replaceChildren();delete clone.dataset.paReady;original.after(clone);});
    const src=await page.locator('script[src*="pwm-and-adc/demo.js"]').getAttribute('src');await page.addScriptTag({url:new URL(src,page.url()).href});
    const roots=page.locator('[data-interactive="pwm-and-adc"]');assert.equal(await roots.count(),2);assert.equal(await roots.nth(1).getAttribute('data-pa-ready'),'true');
    const names=await page.locator('[data-interactive="pwm-and-adc"] .pa-predict input').evaluateAll(inputs=>[...new Set(inputs.map(input=>input.name))]);assert.equal(names.length,2);
    await roots.nth(1).locator('[data-phase-preset="60"]').click();assert.match(await roots.nth(1).locator('[data-settings]').textContent(),/phase 60%/);assert.match(await roots.nth(0).locator('[data-settings]').textContent(),/phase 1%/);
    assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
});

test('first-use action, plot and prediction remain close across phone and projector modes', {skip}, async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=await launch(),cases=[];
  try{
    for(const width of [375,390,1280,1920])for(const present of [false,true])for(const theme of ['light','dark']){
      const height=width>=1920?1080:width>=1280?720:820,context=await contextFor(browser,{viewport:{width,height}}),page=await context.newPage();
      const base=browserURL.replace(/\/$/,''),suffix='?p=det-403'+(present?'&present=1':'');assert.equal((await page.goto(base+'/engineering/pulse-width-modulation.html'+suffix,{waitUntil:'networkidle'})).status(),200);await openCards(page);await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
      const root=page.locator('[data-interactive="pwm-and-adc"]'),first=root.locator('.pa-first-use');await first.waitFor();
      const dims=await first.evaluate(node=>{const rect=selector=>{const r=node.querySelector(selector).getBoundingClientRect();return{top:r.top+scrollY,bottom:r.bottom+scrollY,width:r.width};};return{quick:rect('.pa-quick'),plot:rect('.pa-plot-scroll'),prediction:rect('.pa-predict'),rootWidth:node.getBoundingClientRect().width,doc:[document.documentElement.scrollWidth,document.documentElement.clientWidth]};});
      const headerAllowance=present?70:10,footerAllowance=present?90:10,usableHeight=height-headerAllowance-footerAllowance,actionPlotSpan=dims.plot.bottom-dims.quick.top;
      assert.ok(dims.plot.top-dims.quick.bottom<=20,`phase actions sit ${dims.plot.top-dims.quick.bottom}px above plot`);assert.ok(actionPlotSpan<=usableHeight,`phase actions and observable plot span ${actionPlotSpan}px inside ${usableHeight}px usable viewport`);assert.equal(dims.doc[0]<=dims.doc[1]+1,true,'document has no horizontal overflow');assert.equal(await root.evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'module has no horizontal overflow');
      await first.evaluate((node,top)=>{document.documentElement.style.scrollBehavior='auto';document.body.style.scrollBehavior='auto';const quick=node.querySelector('.pa-quick');scrollTo(0,quick.getBoundingClientRect().top+scrollY-top);},headerAllowance);const visible=await first.evaluate(node=>({quickTop:node.querySelector('.pa-quick').getBoundingClientRect().top,plotBottom:node.querySelector('.pa-plot-scroll').getBoundingClientRect().bottom}));assert.ok(visible.quickTop>=headerAllowance-1&&visible.plotBottom<=height-footerAllowance+1,'phase actions and plotted response are visible together');
      cases.push({width,height,present,theme,usableHeight,actionPlotSpan,plotToPrediction:dims.prediction.top-dims.plot.bottom,visible});
      if(theme==='light'&&((width===390&&present)||(width===1280&&present)||(width===1920&&present))){await first.evaluate(node=>{document.documentElement.style.scrollBehavior='auto';document.body.style.scrollBehavior='auto';scrollTo(0,node.getBoundingClientRect().top+scrollY-70);});await page.screenshot({path:path.join(out,`${width}-presentation-first-use.png`)});}
      if(width===390&&present){const before=page.url();await root.locator('.pa-advanced > summary').focus();await page.keyboard.press('Space');assert.equal(await root.locator('.pa-advanced').evaluate(node=>node.open),true);assert.equal(page.url(),before);await page.evaluate(()=>document.activeElement.blur());const y=await page.evaluate(()=>scrollY);await page.keyboard.press('Space');await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>scrollY)>y,'body Space retains presentation advance');}
      if(width===1280&&!present){const next=await page.locator('a.seq.next').getAttribute('href'),destination=new URL(next,page.url()).href;await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('ArrowRight');await page.waitForURL(destination);assert.equal(page.url(),destination,'body ArrowRight retains reading navigation');}
      await context.close();
    }
    fs.writeFileSync(path.join(out,'layout-report.json'),JSON.stringify({sha:process.env.COURSEWIKI_CANDIDATE_SHA||null,cases},null,2));
  }finally{await browser.close();}
});

test('print, no-JavaScript, offline aggregate and practice remain available', {skip}, async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=await launch();
  try{
    const base=browserURL.replace(/\/$/,''),url=base+'/engineering/pulse-width-modulation.html',context=await contextFor(browser,{viewport:{width:816,height:1056}}),page=await context.newPage();assert.equal((await page.goto(url,{waitUntil:'networkidle'})).status(),200);await openCards(page);
    const root=page.locator('[data-interactive="pwm-and-adc"]');await page.emulateMedia({media:'print'});assert.equal(await root.locator('.pa-live').isHidden(),true);assert.equal(await root.locator('.pa-static').isVisible(),true);await page.pdf({path:path.join(out,'pwm-sampling-letter.pdf'),format:'Letter',printBackground:true});await page.emulateMedia({media:'screen'});
    assert.equal((await page.goto(base+'/practice.html#pwm-sample-phase-high',{waitUntil:'networkidle'})).status(),200);await page.locator('details').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));
    for(const [id,good,bad] of [['pwm-sample-phase-high','1','2'],['pwm-sample-phase-low','0','1.25'],['pwm-four-phase-mean','1.25','5'],['pwm-reconstructed-mean','1.2488','1.25'],['pwm-rc-bottom-sample','0.0921','1.1579']])for(const [value,state] of [[good,'correct'],[bad,'incorrect']]){const item=page.locator('#'+id);await item.locator('[data-practice-input]').fill(value);await item.locator('[data-practice-check]').click();assert.equal(await item.getAttribute('data-state'),state);}
    await context.close();
    const noJs=await contextFor(browser,{javaScriptEnabled:false,viewport:{width:390,height:900}}),noJsPage=await noJs.newPage();assert.equal((await noJsPage.goto(url,{waitUntil:'load'})).status(),200);await openCards(noJsPage);const staticRoot=noJsPage.locator('[data-interactive="pwm-and-adc"] .pa-static');assert.equal(await staticRoot.isVisible(),true);assert.match(await staticRoot.textContent(),/500 samples\/s, phase 10%.*5 V.*5 V/s);assert.match(await staticRoot.textContent(),/settled repeating response/is);assert.equal(await noJsPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await noJsPage.screenshot({path:path.join(out,'nojs-static-390.png')});await noJs.close();
    const offline=await browser.newContext({viewport:{width:390,height:900}}),offlinePage=await offline.newPage(),requests=[];await offline.route('**/*',route=>{requests.push(route.request().url());return route.abort();});await offlinePage.setContent(fs.readFileSync(path.join(sourceRoot,'docs/print/track-det-403.html'),'utf8'),{waitUntil:'load'});await openCards(offlinePage);const offlineRoot=offlinePage.locator('[data-interactive="pwm-and-adc"]').first();assert.equal(await offlineRoot.getAttribute('data-pa-ready'),'true');assert.match(await offlineRoot.locator('[data-settings]').textContent(),/25% duty at 500 Hz.*phase 10%/);assert.equal(await offlinePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.ok(requests.every(request=>/^https?:\/\//.test(request)));await offline.close();
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({sha:process.env.COURSEWIKI_CANDIDATE_SHA||null,method:routeDocs?'route-fulfilled generated docs; no network listener':'configured browser URL',source:{demo:sha(path.join(__dirname,'demo.js')),css:sha(path.join(__dirname,'demo.css')),model:sha(path.join(__dirname,'model.js'))}},null,2));
  }finally{await browser.close();}
});

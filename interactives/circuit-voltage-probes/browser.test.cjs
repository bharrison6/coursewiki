'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {browserURL,skip,launch} = require('../../tests/support/browser.cjs');

test('voltage-probe first use, signed readings, accessibility, responsive, print and no-JS', {skip}, async () => {
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'coursewiki-circuit-voltage-probes-'));
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:1100,height:900}}), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const url=browserURL.replace(/\/$/,'')+'/engineering/measuring-electric-circuits.html';
    await page.goto(url,{waitUntil:'networkidle'});
    await page.locator('details').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));
    const root=page.locator('[data-interactive="circuit-voltage-probes"]');
    assert.equal(await root.count(),1); assert.equal(await root.getAttribute('data-cvp-ready'),'true');
    assert.equal(await root.getByRole('button',{name:/After switch S1/}).count(),1,'SVG probe point is exposed as a button');
    assert.equal(await root.locator('[data-probe-point]').count(),5);
    const selection=root.locator('[data-selection]');
    assert.equal(await selection.getAttribute('role'),'status'); assert.equal(await selection.getAttribute('aria-live'),'polite');
    assert.match(await selection.textContent(),/Red probe active.*Red: not placed.*Black: not placed/);
    const sizes=await root.locator('[data-probe-point]').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {w:r.width,h:r.height};}));
    assert.equal(sizes.every(size=>size.w>=44&&size.h>=44),true,JSON.stringify(sizes));

    const supplyPoint=root.locator('[data-probe-point="supply-positive"]'); await supplyPoint.focus(); await page.keyboard.press('Enter');
    assert.equal(await supplyPoint.evaluate(node=>document.activeElement===node),true); assert.match(await selection.textContent(),/Red probe placed at Supply \+\. Place black probe next/); assert.match(await supplyPoint.getAttribute('aria-label'),/red probe placed here/);
    const afterS1=root.locator('[data-probe-point="switch-1-out"]'); await afterS1.focus(); await page.keyboard.press('Space');
    assert.equal(await afterS1.evaluate(node=>document.activeElement===node),true); assert.match(await selection.textContent(),/Black probe placed at After S1\. Place red probe next/); assert.match(await afterS1.getAttribute('aria-label'),/black probe placed here/);
    await predict(root,'12');
    assert.match(await root.locator('[data-result]').textContent(),/Prediction confirmed.*Meter: 12 V/);
    await root.locator('[data-swap]').click();
    assert.equal(await root.locator('[data-reveal]').isDisabled(),true,'swap clears stale prediction');
    await predict(root,'-12'); assert.match(await root.locator('[data-result]').textContent(),/Meter: -12 V/);

    await root.locator('input[value="closed"]').check();
    assert.equal(await root.locator('[data-reveal]').isDisabled(),true,'state change clears stale prediction');
    await root.locator('[data-lead="red"]').click(); await root.locator('[data-probe-point="switch-1-out"]').click();
    await root.locator('[data-lead="black"]').click(); await root.locator('[data-probe-point="resistor-1-out"]').click();
    await predict(root,'4'); assert.match(await root.locator('[data-result]').textContent(),/Meter: 4 V.*0\.1333 A.*4 V and 8 V/);

    await root.locator('[data-lead="red"]').click(); await root.locator('[data-probe-point="resistor-1-out"]').focus(); await page.keyboard.press('Enter');
    assert.match(await root.locator('[data-selection]').textContent(),/Red: After R1.*Black: After R1/);
    assert.equal(await root.locator('[data-probe-point="resistor-1-out"]').getAttribute('class'),'circuit-probe-point is-red is-black');
    assert.match(await root.locator('[data-probe-point="resistor-1-out"]').getAttribute('aria-label'),/red and black probes placed here/);
    await predict(root,'0'); assert.match(await root.locator('[data-result]').textContent(),/Meter: 0 V/);

    await root.locator('input[value="s2-open"]').check();
    await root.locator('[data-lead="red"]').click(); await root.locator('[data-probe-point="resistor-1-out"]').click();
    await root.locator('[data-lead="black"]').click(); await root.locator('[data-probe-point="switch-2-out"]').click();
    await predict(root,'12'); assert.match(await root.locator('[data-result]').textContent(),/Meter: 12 V.*Circuit current is 0 A/);

    for(const theme of ['light','dark']) for(const width of [375,390,1280]) {
      await page.setViewportSize({width,height:900}); await page.evaluate(value=>document.documentElement.setAttribute('data-theme',value),theme);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${theme} ${width} document overflow`);
      assert.equal(await root.evaluate(node=>node.scrollWidth<=node.clientWidth),true,`${theme} ${width} module clipping`);
      const region=root.locator('.cvp-diagram-scroll');
      assert.equal(await region.evaluate(node=>node.scrollWidth>=node.clientWidth&&getComputedStyle(node).overflowX==='auto'),true,`${theme} ${width} bounded diagram region`);
      if(width===390) await page.screenshot({path:path.join(out,`probe-${theme}-390.png`),fullPage:true});
    }
    const positive=await root.evaluate(node=>{const e=document.createElement('div');e.style.cssText='width:2000px;min-width:2000px;height:1px';node.append(e);const hit=node.scrollWidth>node.clientWidth;e.remove();return hit;});
    assert.equal(positive,true,'module overflow positive control');

    await page.setViewportSize({width:390,height:720});
    await page.goto(url+'?p=circuits-and-ac-dc&present=1',{waitUntil:'networkidle'}); await page.locator('details').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));
    const presentRoot=page.locator('[data-interactive="circuit-voltage-probes"]');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'phone presentation has no horizontal overflow');
    assert.equal(await presentRoot.locator('[data-reveal]').isVisible(),true); await page.screenshot({path:path.join(out,'probe-presentation-390.png'),fullPage:true});

    await page.emulateMedia({media:'print'});
    assert.equal(await presentRoot.locator('.cvp-live').evaluate(node=>getComputedStyle(node).display),'none');
    assert.equal(await presentRoot.locator('.cvp-static').evaluate(node=>getComputedStyle(node).display),'block');
    const printTable=presentRoot.locator('.cvp-table-scroll');
    assert.equal(await printTable.evaluate(node=>node.querySelector('table').getBoundingClientRect().right<=node.getBoundingClientRect().right+1),true,'print table contained');
    await page.pdf({path:path.join(out,'probe-print.pdf'),format:'Letter',printBackground:true}); await page.emulateMedia({media:'screen'});

    const cloneCount=await page.evaluate(()=>{const original=document.querySelector('[data-interactive="circuit-voltage-probes"]');const clone=original.cloneNode(true);clone.querySelector('.cvp-live').remove();delete clone.dataset.cvpReady;original.after(clone);const script=document.createElement('script');script.src=document.querySelector('script[src*="circuit-voltage-probes/demo.js"]').src;document.body.append(script);return new Promise(resolve=>setTimeout(()=>resolve(document.querySelectorAll('[data-cvp-ready]').length),100));});
    assert.equal(cloneCount,2); const duplicateIds=await page.locator('[data-interactive="circuit-voltage-probes"] [id]').evaluateAll(nodes=>{const seen=new Set(),dupes=[];nodes.forEach(node=>seen.has(node.id)?dupes.push(node.id):seen.add(node.id));return dupes;}); assert.deepEqual(duplicateIds,[]);

    await page.goto(browserURL.replace(/\/$/,'')+'/practice.html#probe-place-r1-positive',{waitUntil:'networkidle'});
    for(const [id,correct,wrong] of [['probe-place-r1-positive','1','2'],['probe-reverse-r1-sign','-4','4'],['probe-open-s1-reading','12','0'],['probe-same-node-zero','0','12'],['probe-two-opens-floating','3','1']]) {
      for(const [value,state] of [[correct,'correct'],[wrong,'incorrect']]) {const item=page.locator('#'+id);await item.locator('[data-practice-input]').fill(value);await item.locator('[data-practice-check]').click();assert.equal(await item.getAttribute('data-state'),state,`${id} ${value}`);}
    }

    const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}}), noJsPage=await noJs.newPage();
    await noJsPage.goto(url,{waitUntil:'networkidle'});await noJsPage.locator('details').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));
    const noJsRoot=noJsPage.locator('[data-interactive="circuit-voltage-probes"]');assert.equal(await noJsRoot.locator('.cvp-static').isVisible(),true);assert.equal(await noJsRoot.locator('.cvp-live').count(),0);
    assert.match(await noJsRoot.textContent(),/S1 open[\s\S]*\+12 V[\s\S]*Both closed[\s\S]*\+4 V[\s\S]*probes reversed[\s\S]*−4 V/);
    const table=noJsRoot.locator('.cvp-table-scroll');assert.equal(await table.evaluate(node=>node.scrollWidth>node.clientWidth),true);await table.focus();assert.equal(await table.evaluate(node=>document.activeElement===node),true);
    const last=await table.evaluate(node=>{node.scrollLeft=node.scrollWidth;const region=node.getBoundingClientRect(),cell=node.querySelector('thead th:last-child').getBoundingClientRect();return {scrolled:node.scrollLeft>0,visible:cell.right<=region.right+1&&cell.left>=region.left-1};});assert.deepEqual(last,{scrolled:true,visible:true});
    await noJsPage.emulateMedia({media:'print'});assert.equal(await table.evaluate(node=>node.querySelector('table').getBoundingClientRect().right<=node.getBoundingClientRect().right+1),true);await noJs.close();

    const aggregate=fs.readFileSync(path.resolve(__dirname,'../../docs/print/track-det-403.html'),'utf8');assert.ok(aggregate.includes('Signed readings from the same ideal circuit'));assert.ok(aggregate.includes('CourseWikiCircuits'));
    assert.deepEqual(errors,[]);console.log(`PASS evidence: ${out}`);
  } finally { await browser.close(); }
});

async function predict(root,value) {const input=root.locator('[data-prediction]');await input.fill(value);await input.dispatchEvent('input');assert.equal(await root.locator('[data-reveal]').isDisabled(),false);await root.locator('[data-reveal]').click();}

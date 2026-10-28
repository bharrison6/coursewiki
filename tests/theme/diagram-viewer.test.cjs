'use strict';
/* Dependency-free Chromium integration checks. Build first, then run:
   node --test tests/theme/diagram-viewer.test.cjs
   Set CHROME_PATH if Chromium is installed elsewhere. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('content diagrams: measured scale, modal controls, exclusions and practice', { timeout: 120000 }, async () => {
  const scratch = path.join(root, '.lane-scratch');
  fs.mkdirSync(scratch, { recursive: true });
  const profile = fs.mkdtempSync(path.join(scratch, 'chromium-'));
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
    if (relative === 'viewer-fixture.svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60"><text x="5" y="25" font-size="12">Diagram label</text></svg>');
      return;
    }
    if (relative === 'viewer-fixture.html') {
      res.setHeader('Content-Type', 'text/html');
      const img = '<img class="content-img" src="viewer-fixture.svg" alt="Fixture diagram">';
      res.end('<!doctype html><html><head><link rel="stylesheet" href="theme/msu-theme.css"><link rel="stylesheet" href="theme/app.css"></head><body>' +
        '<main><div id="fit">' + img + '</div><div id="small" style="width:60px">' + img + '</div>' +
        '<a href="#linked" style="display:block;width:60px">' + img + '</a><div data-interactive="fixture" style="width:60px">' + img + '</div>' +
        '<div class="ghs-pictogram">' + img + '</div><img class="logo" src="viewer-fixture.svg" alt="Logo"></main>' +
        '<script src="theme/app.js"></script></body></html>');
      return;
    }
    const file = path.resolve(root, 'docs', relative || 'index.html');
    if (!file.startsWith(path.join(root, 'docs') + path.sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', ({ '.svg': 'image/svg+xml', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  console.log('Owned Chromium PID:', chrome.pid);
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 100; i++) {
      try {
        port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
        if (/^\d+$/.test(port)) break;
      } catch (error) {
        if (!['ENOENT', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      }
      await delay(100);
    }
    assert.match(port || '', /^\d+$/, 'Chromium published its debugging port');
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let serial = 0;
    const pending = new Map();
    const requests = [];
    let protocol = 'http';
    socket.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params);
      if (pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const waitFor = async expression => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
      throw new Error('Timed out: ' + expression);
    };
    await send('Network.enable');
    const navigate = async page => {
      const url = protocol === 'file' ? pathToFileURL(path.join(root, 'docs', page.split('?')[0])).href + (page.includes('?') ? '?' + page.split('?')[1] : '') : base + '/' + page;
      await send('Page.navigate', { url });
      await waitFor('document.readyState === "complete" && location.href === ' + JSON.stringify(url));
      await delay(150);
    };
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
    const pages = ['engineering-graphics/alphabet-of-lines.html', 'engineering-graphics/dimension-anatomy-and-placement.html', 'engineering-graphics/assembly-files-and-mates.html', 'materials-and-processes/material-families.html'];
    const evidence = [];
    for (protocol of ['http', 'file']) {
      for (const page of pages) {
        for (const theme of ['light', 'dark']) {
          await navigate(page);
          await evaluate('document.documentElement.dataset.theme = ' + JSON.stringify(theme));
          await evaluate('document.querySelectorAll("details").forEach(d => d.open = true)');
          await waitFor('!!document.querySelector(".diagram-expandable")');
          const count = await evaluate('document.querySelectorAll("main img.content-img").length');
          for (let index = 0; index < count; index++) {
            const src = await evaluate(`document.querySelectorAll('main img.content-img')[${index}].src`);
            const svgPath = protocol === 'file' ? fileURLToPath(new URL(src)) : path.join(root, 'docs', decodeURIComponent(new URL(src).pathname));
            const svgSource = fs.readFileSync(svgPath, 'utf8');
            const before = await evaluate(`(async () => {
              const img = document.querySelectorAll('main img.content-img')[${index}]; window.testImage = img;
              const text = ${JSON.stringify(svgSource)};
              const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
              const box = svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
              const frame = document.createElement('iframe');
              frame.style.cssText = 'position:fixed;left:-10000px;border:0;width:' + box[2] + 'px;height:' + box[3] + 'px';
              frame.srcdoc = '<style>html,body{margin:0}svg{width:100%;height:100%}</style>' + text;
              await new Promise(resolve => { frame.onload = resolve; document.body.appendChild(frame); });
              const labels = Array.from(frame.contentDocument.querySelectorAll('text')).map(t => t.getBoundingClientRect().height).filter(h => h > 0);
              const fontSizes = Array.from(frame.contentDocument.querySelectorAll('text')).map(t => parseFloat(frame.contentWindow.getComputedStyle(t).fontSize)).filter(n => n > 0);
              const smallest = Math.min(...labels, ...fontSizes); frame.remove();
              if (Number(img.dataset.naturalWidth) !== box[2] || Number(img.dataset.naturalHeight) !== box[3]) throw new Error('Missing or incorrect build-stamped natural dimensions');
              window.testNatural = box[2]; window.testLabel = smallest;
              return { file: new URL(img.src).pathname, natural: box[2], label: smallest, width: img.getBoundingClientRect().width, before: smallest * img.getBoundingClientRect().width / box[2] };
            })()`);
            assert.ok(before.width < before.natural, 'mobile diagram is reduced');
            const requestStart = requests.length;
            await evaluate('testImage.focus()');
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
            await waitFor('document.querySelector(".diagram-viewer").open');
            const opened = await evaluate(`(() => {
              const d = document.querySelector('.diagram-viewer');
              return { after: testLabel * d.querySelector('img').getBoundingClientRect().width / testNatural,
                label: d.getAttribute('aria-label') === testImage.alt, focus: d.contains(document.activeElement),
                locked: getComputedStyle(document.documentElement).overflow === 'hidden',
                width: d.querySelector('img').getBoundingClientRect().width };
            })()`);
            assert.ok(opened.after >= 11, JSON.stringify({page, index, before, opened}));
            assert.equal(opened.width, before.natural); assert.ok(opened.label && opened.focus && opened.locked);
            await evaluate(`document.querySelector('[data-diagram-zoom="2"]').click()`);
            assert.equal(await evaluate('document.querySelector(".diagram-viewer img").getBoundingClientRect().width'), opened.width * 2);
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
            await waitFor('!document.querySelector(".diagram-viewer").open');
            await waitFor('!document.documentElement.classList.contains("diagram-viewer-open")');
            assert.equal(await evaluate('document.activeElement === testImage'), true);
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
            assert.equal(await evaluate('document.documentElement.classList.contains("diagram-viewer-open")'), false);
            const viewerRequests = requests.slice(requestStart).filter(r => /\.svg(?:[?#]|$)/i.test(r.request.url) && !r.request.url.startsWith('data:'));
            assert.equal(viewerRequests.length, 0, 'opening and zooming issue no SVG requests');
            evidence.push({ protocol, page, theme, index, ...before, after: opened.after, viewerRequests: viewerRequests.length });
          }
        }
      }
    }
    protocol = 'http';
    assert.equal(requests.filter(r => /\.svg(?:[?#]|$)/i.test(r.request.url) && ['Fetch', 'XHR'].includes(r.type)).length, 0, 'no runtime SVG fetch on either protocol');
    fs.writeFileSync(path.join(scratch, 'diagram-network.json'), JSON.stringify(requests, null, 2));
    console.log('MEASUREMENTS', JSON.stringify(evidence));
    fs.writeFileSync(path.join(scratch, 'diagram-measurements.json'), JSON.stringify(evidence, null, 2));
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate('viewer-fixture.html');
    const fits = await evaluate(`Array.from(document.querySelectorAll('main img.content-img')).filter(i => !i.classList.contains('diagram-expandable') && i.getBoundingClientRect().width > 0).length`);
    assert.ok(fits > 0, 'desktop has natural-size images without an affordance');
    await evaluate(`document.querySelector('main img.content-img:not(.diagram-expandable)').click()`);
    assert.equal(await evaluate('document.querySelector(".diagram-viewer").open'), false);
    assert.equal(await evaluate('document.querySelectorAll("a .diagram-expandable, [data-interactive] .diagram-expandable, .ghs-pictogram .diagram-expandable, .logo.diagram-expandable").length'), 0);
    await waitFor('document.querySelector("#small img").classList.contains("diagram-expandable")');
    await evaluate('document.querySelector("#small").style.width = "200px"');
    await waitFor('!document.querySelector("#small img").hasAttribute("tabindex")');
    await evaluate('document.querySelector("#small").style.width = "60px"');
    await waitFor('document.querySelector("#small img").hasAttribute("tabindex")');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
    await evaluate('document.querySelector("#small img").click()');
    const small = await evaluate(`(() => { const img = document.querySelector('.diagram-viewer img'), scroller = document.querySelector('.diagram-scroll'); return {width: img.getBoundingClientRect().width, left: img.getBoundingClientRect().left, viewport: scroller.clientWidth, contentLeft: scroller.getBoundingClientRect().left + scroller.clientLeft}; })()`);
    assert.equal(small.width, 120, '1x must not upscale a naturally small image');
    assert.ok(Math.abs(small.left - small.contentLeft - (small.viewport - 120) / 2) < 1, 'small image centered');
    await evaluate(`document.querySelector('[data-diagram-zoom="2"]').click()`);
    assert.equal(await evaluate('document.querySelector(".diagram-viewer img").getBoundingClientRect().width'), 240);
    console.log('SMALL IMAGE', JSON.stringify(small));
    await evaluate('document.querySelector("[data-diagram-close]").click()');
    await waitFor('document.activeElement === document.querySelector("#small img")');
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    const printEnhanced = await evaluate('JSON.stringify(Array.from(document.querySelectorAll("main img")).map(i => ({width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height})))');
    assert.equal(await evaluate('Array.from(document.querySelectorAll(".diagram-hint, .diagram-viewer")).every(e => getComputedStyle(e).display === "none")'), true);
    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await navigate('viewer-fixture.html');
    assert.equal(await evaluate('JSON.stringify(Array.from(document.querySelectorAll("main img")).map(i => ({width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height})))'), printEnhanced);
    await send('Emulation.setEmulatedMedia', { media: 'screen' });
    assert.equal(await evaluate('document.querySelectorAll(".diagram-hint, .diagram-viewer, [tabindex]").length'), 0);
    await send('Emulation.setScriptExecutionDisabled', { value: false });
    console.log('FIXTURE: natural-size desktop, exclusions, resize, Close/focus, print geometry and no-JS passed');
    for (const page of [pages[0], 'print/track-det-102.html']) {
      await navigate(page);
      await send('Emulation.setEmulatedMedia', { media: 'print' });
      assert.equal(await evaluate('Array.from(document.querySelectorAll(".diagram-hint, .diagram-viewer")).every(e => getComputedStyle(e).display === "none")'), true);
      const geometry = await evaluate('JSON.stringify(Array.from(document.querySelectorAll("img.content-img")).map(i => [i.getBoundingClientRect().width, i.getBoundingClientRect().height]))');
      await evaluate('document.querySelectorAll(".diagram-hint, .diagram-viewer").forEach(e => e.remove()); document.querySelectorAll(".diagram-expandable").forEach(e => e.classList.remove("diagram-expandable"))');
      assert.equal(await evaluate('JSON.stringify(Array.from(document.querySelectorAll("img.content-img")).map(i => [i.getBoundingClientRect().width, i.getBoundingClientRect().height]))'), geometry);
      await send('Emulation.setEmulatedMedia', { media: 'screen' });
      console.log('PRINT', page, 'geometry preserved; viewer hidden');
    }
    await navigate(pages[0] + '?present=1');
    assert.equal(await evaluate('document.querySelectorAll(".diagram-hint, .diagram-viewer").length'), 0);
    await navigate('practice.html');
    const practice = await evaluate(`(() => {
      const item = Array.from(document.querySelectorAll('[data-practice]')).find(p => p.querySelector('img.content-img') && p.querySelector('[data-practice-input], input[type=number]'));
      if (!item) return null;
      const input = item.querySelector('[data-practice-input], input[type=number]');
      const button = item.querySelector('[data-practice-check], .practice-check, button');
      const img = item.querySelector('img'); img.click();
      if (document.querySelector('.diagram-viewer').open) document.querySelector('[data-diagram-close]').click();
      input.value = input.tagName === 'SELECT' ? Array.from(input.options).find(o => o.value && o.value !== item.dataset.answer).value : Number(item.dataset.answer) + Number(item.dataset.tolerance) + 100;
      button.click();
      const wrong = item.dataset.state;
      input.value = item.dataset.answer; button.click();
      return { id: item.id, wrong, correct: item.dataset.state };
    })()`);
    assert.ok(practice); assert.equal(practice.wrong, 'incorrect'); assert.equal(practice.correct, 'correct');
    console.log('PRACTICE', JSON.stringify(practice));
  } finally {
    if (socket) socket.close();
    chrome.kill(); // Only the PID this test spawned.
    await new Promise(resolve => server.close(resolve));
  }
});

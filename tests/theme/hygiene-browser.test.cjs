'use strict';
/* Dependency-free Chromium integration checks. Build first, then run:
   node --test tests/theme/hygiene-browser.test.cjs
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

test('theme hygiene at 375px: contrast, choice feedback and tiny conversion', { timeout: 120000 }, async () => {
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
        '<div data-unit-converter><input data-convert-value value="1e-13"><select data-convert-from><option value="ft">ft</option></select><select data-convert-to><option value="m">m</option></select><output data-convert-result></output></div>' +
        '<div data-practice data-answer="2" data-tolerance="0"><select data-practice-input><option value="1">Wrong</option><option value="2">Right</option></select><button data-practice-check>Check</button><output data-practice-feedback></output></div>' +
        '<div data-path-lab><input data-path-start value="0"><input data-path-turn value="1e-13"><input data-path-out-time value="1"><input data-path-return-time value="1"><output data-path-distance></output></div>' +
        '<div data-acceleration-lab><input data-accel-initial value="0"><input data-accel-final value="1e-13"><input data-accel-time value="1"><output data-acceleration-si></output></div>' +
        '<div data-cad-lab><input data-cad-scale value="1"><input data-cad-area value="1e-13"><input data-cad-volume value="1e-13"><input data-cad-density value="1"><input data-cad-gravity value="1"><output data-cad-mass></output></div>' +
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
    await navigate('viewer-fixture.html');
    const conversion = await evaluate("document.querySelector('[data-convert-result]').textContent");
    console.log('375px conversion:', conversion);
    assert.match(conversion, /3\.048e-14/);
    const helpers = await evaluate(`['[data-path-distance]', '[data-acceleration-si]', '[data-cad-mass]'].map(s => document.querySelector(s).textContent)`);
    console.log('375px path, acceleration, CAD:', JSON.stringify(helpers));
    assert.match(helpers[0], /2e-13/); assert.match(helpers[1], /3\.048e-14/); assert.match(helpers[2], /1e-13/);
    const feedback = await evaluate(`(() => {
      const input = document.querySelector('[data-practice-input]');
      const button = document.querySelector('[data-practice-check]');
      button.click(); const wrong = document.querySelector('[data-practice-feedback]').textContent;
      input.value = '2'; button.click();
      return [wrong, document.querySelector('[data-practice-feedback]').textContent];
    })()`);
    assert.deepEqual(feedback, ['Not yet — review the choices and try again.', 'Correct — your choice is correct.']);
    await evaluate('document.querySelector("#small img").click()');
    for (const theme of ['light', 'dark']) {
      await evaluate('document.documentElement.dataset.theme = ' + JSON.stringify(theme));
      await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9});
      const contrasts = await evaluate(`(() => {
        function lum(color) {
          const c = color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v => {v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
          return c[0]*.2126+c[1]*.7152+c[2]*.0722;
        }
        function ratio(a,b) {const x=lum(a),y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
        const d=document.querySelector('.diagram-viewer');
        return [...d.querySelectorAll('button,[tabindex]')].map(el => {
          el.focus(); const style=getComputedStyle(el);
          const background=el.classList.contains('diagram-scroll')?style.borderTopColor:style.backgroundColor;
          const old=getComputedStyle(d).getPropertyValue('--msu-liteblue').trim();
          const probe=document.createElement('span');probe.style.color=old;d.append(probe);
          const before=ratio(getComputedStyle(probe).color,background);probe.remove();
          return {control:el.textContent || el.className, focused:el.matches(':focus-visible'), before, after:ratio(style.outlineColor,background)};
        });
      })()`);
      console.log(theme, JSON.stringify(contrasts));
      for(const c of contrasts) { assert.ok(c.focused); assert.ok(c.after>=3,JSON.stringify(c)); }
    }
  } finally {
    if (socket) socket.close();
    chrome.kill(); // Only the PID this test spawned.
    await new Promise(resolve => server.close(resolve));
  }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const css = fs.readFileSync(path.join(root, 'theme/app.css'), 'utf8');
const selector = 'body:not(.presenting) main :is(img.content-img, figure > svg):not([data-interactive] *, .ghs-pictogram *, .diagram-viewer *)';

for (const [media, cap] of [['screen', '85vh'], ['print', '8.5in']]) {
  test(`${media} authored figures retain their dimension cap and aspect ratio`, () => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = css.match(new RegExp('@media ' + media + '\\s*\\{\\s*' + escaped + '\\s*\\{([^}]+)\\}'));
    assert.ok(block, `${media} scoped media block exists`);
    const declarations = block[1];
    assert.ok(declarations.includes(`max-height: ${cap};`));
    for (const rule of ['width: auto;', 'height: auto;', 'max-width: 100%;']) assert.ok(declarations.includes(rule));
    if (media === 'print') {
      assert.ok(declarations.includes('break-inside: avoid;'));
      assert.match(css.slice(block.index + block[0].length), /^\s*body:not\(\.presenting\) main :is\(h2, h3\)[^{]+\{ break-after: avoid;/);
    }
  });
}

test('Chromium: portrait cap, viewer, exclusions and Letter PDF', { timeout: 120000 }, async t => {
  const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!fs.existsSync(executable)) return t.skip('Chromium unavailable; static cap tests still run');
  const scratch = path.join(root, '.lane-scratch');
  fs.mkdirSync(scratch, { recursive: true });
  const profile = fs.mkdtempSync(path.join(scratch, 'figure-chrome-'));
  const chrome = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
  console.log('Owned Chromium PID:', chrome.pid);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await delay(100);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(targets.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let serial = 0;
    const pending = new Map();
    socket.addEventListener('message', e => {
      const msg = JSON.parse(e.data), p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method + ' ' + JSON.stringify(params).slice(0, 160))); }, 30000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
    const navigate = async file => {
      const url = pathToFileURL(path.join(root, 'docs', file)).href;
      await send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`)) break;
        await delay(100);
      }
      for (let i = 0; i < 100; i++) {
        if (await evaluate('Array.from(document.images).every(i => i.complete)')) return;
        await delay(100);
      }
      assert.fail('Images did not finish loading');
    };
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await navigate('engineering/soldering-equipment.html');
    await evaluate(`document.querySelectorAll('details').forEach(d => d.open = true)`);
    await delay(200);
    const portrait = await evaluate(`(() => {
      window.portrait = Array.from(document.querySelectorAll('img.content-img')).find(i => Number(i.dataset.naturalHeight) === 840);
      const r = portrait.getBoundingClientRect(); return { width:r.width, height:r.height, expandable:portrait.classList.contains('diagram-expandable') };
    })()`);
    assert.ok(portrait.height <= 680.1 && portrait.height > 0);
    assert.ok(Math.abs(portrait.width / portrait.height - 360 / 840) < .001);
    assert.equal(portrait.expandable, true);
    await evaluate('portrait.click()');
    assert.equal(await evaluate(`document.querySelector('.diagram-viewer').open`), true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.diagram-viewer img')).maxHeight`), 'none');
    await evaluate(`document.querySelector('[data-diagram-close]').click(); document.body.classList.add('presenting')`);
    assert.equal(await evaluate('getComputedStyle(portrait).maxHeight'), 'none');
    await evaluate(`document.body.classList.remove('presenting'); portrait.parentElement.setAttribute('data-interactive', 'fixture')`);
    assert.equal(await evaluate('getComputedStyle(portrait).maxHeight'), 'none');
    const inline = await evaluate(`(() => {
      const figure = document.createElement('figure');
      figure.innerHTML = '<svg viewBox="0 0 360 840" xmlns="http://www.w3.org/2000/svg"><rect width="360" height="840"/></svg>';
      document.querySelector('main').append(figure);
      const svg = figure.firstElementChild, r = svg.getBoundingClientRect();
      const cap = getComputedStyle(svg).maxHeight;
      figure.setAttribute('data-interactive', 'fixture');
      return { width:r.width, height:r.height, cap, excluded:getComputedStyle(svg).maxHeight };
    })()`);
    assert.equal(inline.cap, '680px');
    assert.ok(inline.height > 0 && inline.height <= 680.1);
    assert.ok(Math.abs(inline.width / inline.height - 360 / 840) < .001);
    assert.equal(inline.excluded, 'none');
    await navigate('print/track-det-403.html');
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    await evaluate(`document.querySelectorAll('details').forEach(d => d.open = true)`);
    const figures = await evaluate(`Array.from(document.querySelectorAll('img.content-img')).filter(i => /solder|tinning|splice/i.test(i.alt)).map(i => {
      const r = i.getBoundingClientRect(); return { alt:i.alt, width:r.width, height:r.height, breakInside:getComputedStyle(i).breakInside };
    })`);
    assert.ok(figures.length >= 4);
    for (const f of figures) { assert.ok(f.height > 0 && f.height <= 816.1, JSON.stringify(f)); assert.equal(f.breakInside, 'avoid'); }
    console.log('Measured print figures:', JSON.stringify(figures));
    // Chrome's command-line printer completes where Page.printToPDF can stall
    // on this large aggregate. It uses Letter paper with default margins.
    const pdfPath = path.join(scratch, 'track-det-403.pdf');
    const printer = spawn(executable, ['--headless=new', '--no-first-run', '--disable-background-networking',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--no-pdf-header-footer',
      '--user-data-dir=' + fs.mkdtempSync(path.join(scratch, 'figure-print-')),
      '--print-to-pdf=' + pdfPath, pathToFileURL(path.join(root, 'docs/print/track-det-403.html')).href],
    { stdio: 'ignore', windowsHide: true });
    console.log('Owned PDF Chromium PID:', printer.pid);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('PDF printer timed out')), 60000);
        printer.once('error', error => { clearTimeout(timer); reject(error); });
        printer.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('PDF printer exit ' + code)); });
      });
      assert.equal(fs.readFileSync(pdfPath).subarray(0, 5).toString(), '%PDF-');
    } finally { if (printer.exitCode === null) printer.kill(); }
    fs.writeFileSync(path.join(scratch, 'figure-sizing.json'), JSON.stringify({ portrait, figures }, null, 2));
    console.log('Portrait and print figures:', JSON.stringify({ portrait, figures }));
  } finally {
    if (socket) socket.close();
    chrome.kill(); // Only the process started by this test.
  }
});

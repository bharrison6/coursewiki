const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBrowser } = require('./browser.cjs');
const fake = () => ({ chromium: { launch: async opts => opts } });
test('shared browser module, launch precedence and skip contract', async () => {
  const base = { COURSEWIKI_BROWSER_URL: 'http://localhost', CHROMIUM_PATH: 'old1', CHROME_PATH: 'old2', CW_CHROMIUM: 'old3' };
  for (const [env, expected] of [
    [{ ...base, COURSEWIKI_BROWSER_EXECUTABLE: 'new', COURSEWIKI_BROWSER_CHANNEL: 'chrome' }, { executablePath: 'new' }],
    [{ ...base, COURSEWIKI_BROWSER_CHANNEL: 'chrome' }, { channel: 'chrome' }],
    [base, { executablePath: 'old1' }],
    [{ ...base, CHROMIUM_PATH: '' }, { executablePath: 'old2' }],
    [{ ...base, CHROMIUM_PATH: '', CHROME_PATH: '' }, { executablePath: 'old3' }],
    [{ COURSEWIKI_BROWSER_URL: 'http://localhost' }, {}]
  ]) assert.deepEqual(await resolveBrowser(env, fake).launch(), { headless: true, ...expected });
  let requested;
  resolveBrowser({ ...base, PLAYWRIGHT_MODULE: 'custom' }, name => { requested = name; return fake(); });
  assert.equal(requested, 'custom');
  resolveBrowser(base, name => { requested = name; return fake(); }); assert.equal(requested, 'playwright');
  assert.ok(resolveBrowser({}, fake).skip);
  const missing = resolveBrowser(base, () => { throw Object.assign(new Error(), { code: 'MODULE_NOT_FOUND' }); });
  assert.ok(missing.skip); await assert.rejects(missing.launch());
  assert.throws(() => resolveBrowser(base, () => { throw new Error('broken install'); }), /broken install/);
});

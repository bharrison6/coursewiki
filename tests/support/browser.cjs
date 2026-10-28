'use strict';
// All browser suites opt in through the same environment contract.
function resolveBrowser(env = process.env, load = require) {
  let chromium;
  try { ({ chromium } = load(env.PLAYWRIGHT_MODULE || 'playwright')); }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  const launchOptions = { headless: true };
  if (env.COURSEWIKI_BROWSER_EXECUTABLE) launchOptions.executablePath = env.COURSEWIKI_BROWSER_EXECUTABLE;
  else if (env.COURSEWIKI_BROWSER_CHANNEL) launchOptions.channel = env.COURSEWIKI_BROWSER_CHANNEL;
  else {
    const legacy = env.CHROMIUM_PATH || env.CHROME_PATH || env.CW_CHROMIUM;
    if (legacy) launchOptions.executablePath = legacy;
  }
  const browserURL = env.COURSEWIKI_BROWSER_URL;
  const skip = !chromium || !browserURL ? 'Requires Playwright and COURSEWIKI_BROWSER_URL' : false;
  async function launch() {
    if (skip) throw new Error(skip);
    return chromium.launch(launchOptions);
  }
  // Preserve protocol-level assertions while delegating browser ownership to Playwright.
  async function launchCDP() {
    const browser = await launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      return { browser, session };
    } catch (error) { await browser.close(); throw error; }
  }
  return { browserURL, skip, launchOptions, launch, launchCDP };
}
module.exports = { ...resolveBrowser(), resolveBrowser };

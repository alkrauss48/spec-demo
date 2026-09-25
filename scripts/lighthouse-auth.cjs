/**
 * Lighthouse CI puppeteerScript: signs in the seeded user for the URL about to be audited
 * (quickstart.md "Performance checks"), after clearing any previous session.
 *   /                    → perf@example.test        (1,000 photos in 100 albums)
 *   /albums/2026-03-14   → perf-large@example.test  (1,000 photos in one album)
 */
module.exports = async (browser, context) => {
  const url = new URL(context.url);
  const email = url.pathname.startsWith('/albums/')
    ? 'perf-large@example.test'
    : 'perf@example.test';
  const password = process.env.SEED_PASSWORD || 'password1234';

  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Network.clearBrowserCookies');
  await page.goto(`${url.origin}/sign-in`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]'),
  ]);
  if (new URL(page.url()).pathname.startsWith('/sign-in')) {
    throw new Error(`Sign-in failed for ${email}; seed it first (see quickstart.md)`);
  }
  await page.close();
};

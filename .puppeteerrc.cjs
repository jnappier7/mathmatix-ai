/**
 * Puppeteer configuration
 *
 * We download chrome-headless-shell only (skip full Chrome) — we use Puppeteer
 * solely for headless PDF rendering, so the GUI binary isn't needed and
 * skipping it saves ~270MB per deploy.
 *
 * Using Puppeteer's bundled binary instead of the Debian/Render `chromium`
 * package avoids the `chrome_crashpad_handler: --database is required` launch
 * failure the system package hits in containerized environments.
 */
module.exports = {
  skipChromeDownload: true,
  // chrome-headless-shell downloads automatically; launch with headless: 'shell'.
};

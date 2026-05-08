/**
 * Puppeteer configuration
 *
 * Skip the full Chrome download — we use Puppeteer solely for headless PDF
 * rendering, so chrome-headless-shell (downloaded by default) is all we need
 * and skipping the full binary saves ~270MB per deploy.
 *
 * Using Puppeteer's bundled binary instead of the Debian/Render `chromium`
 * package avoids the `chrome_crashpad_handler: --database is required` launch
 * failure the system package hits in containerized environments.
 */
module.exports = {
  chrome: { skipDownload: true },
  // chrome-headless-shell downloads automatically; launch with headless: 'shell'.
};

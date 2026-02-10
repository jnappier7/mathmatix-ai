/**
 * Puppeteer configuration
 * Prevents automatic browser download during npm install.
 * The runtime browser path is set via PUPPETEER_EXECUTABLE_PATH env var.
 */
module.exports = {
  skipDownload: true,
};

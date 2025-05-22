// scripts/install-puppeteer.js
const puppeteer = require("puppeteer");

puppeteer
  .createBrowserFetcher()
  .download(puppeteer
    .executablePath()
    .match(/chrome-(.*)/)?.[1] || '118.0.5993.0') // fallback
  .then(() => console.log("✅ Puppeteer Chromium installed"))
  .catch(err => {
    console.error("❌ Puppeteer install failed:", err);
    process.exit(1);
  });

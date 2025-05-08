// pdf-to-image.js — Uses Puppeteer to render first page of PDF as base64 PNG

const fs = require("fs");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const puppeteer = require("puppeteer");

module.exports = async function pdfToImageBase64(pdfBuffer) {
  const tmpFile = path.join(os.tmpdir(), `${uuidv4()}.pdf`);
  fs.writeFileSync(tmpFile, pdfBuffer);

  const browser = await puppeteer.launch({
  headless: true,
  executablePath: puppeteer.executablePath(),
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});


  try {
    const page = await browser.newPage();
    const fileUrl = `file://${tmpFile}`;
    await page.goto(fileUrl, { waitUntil: "networkidle0" });

    const screenshot = await page.screenshot({ encoding: "base64", fullPage: true });
    await browser.close();
    fs.unlinkSync(tmpFile); // Clean up

    return `data:image/png;base64,${screenshot}`;
  } catch (err) {
    console.error("🧨 Puppeteer PDF screenshot failed:", err.message);
    await browser.close();
    return null;
  }
};

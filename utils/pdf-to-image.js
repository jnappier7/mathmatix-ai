// pdf-to-image.js — Render-safe Puppeteer with no hardcoded executablePath

const puppeteer = require("puppeteer");

module.exports = async function pdfToImageBase64(pdfBuffer) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    const base64PDF = pdfBuffer.toString("base64");
    const dataURI = `data:application/pdf;base64,${base64PDF}`;

    await page.goto(dataURI, { waitUntil: "networkidle0" });

    const screenshot = await page.screenshot({ encoding: "base64", fullPage: true });

    await browser.close();

    return `data:image/png;base64,${screenshot}`;
  } catch (err) {
    console.error("🧨 Puppeteer PDF screenshot failed:", err.message);
    return null;
  }
};

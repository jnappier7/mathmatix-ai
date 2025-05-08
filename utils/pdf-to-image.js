// pdf-to-image.js — Uses Puppeteer to render a base64 PDF buffer to PNG in Render-safe mode

const puppeteer = require("puppeteer");

module.exports = async function pdfToImageBase64(pdfBuffer) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: puppeteer.executablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // Convert buffer to base64 PDF and embed in data URI
    const base64PDF = pdfBuffer.toString("base64");
    const dataURI = `data:application/pdf;base64,${base64PDF}`;

    // Go to the base64-encoded PDF
    await page.goto(dataURI, { waitUntil: "networkidle0" });

    // Screenshot the page
    const screenshot = await page.screenshot({ encoding: "base64", fullPage: true });

    await browser.close();

    return `data:image/png;base64,${screenshot}`;
  } catch (err) {
    console.error("🧨 Puppeteer PDF screenshot failed:", err.message);
    return null;
  }
};

// utils/pdf-to-image.js - PDF to PNG using Puppeteer and PDF.js HTML rendering (rephrased emoji comment)

const puppeteer = require("puppeteer");

module.exports = async function pdfToImageBase64(pdfBuffer) {
  try {
	process.env.PUPPETEER_EXECUTABLE_PATH = require("puppeteer").executablePath();
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // Keeping these args for now as per your original code
    });

    const page = await browser.newPage();

    // Write PDF to a data URI for loading in PDF.js
    const base64PDF = pdfBuffer.toString("base64");
    const dataURI = `data:application/pdf;base64,${base64PDF}`;

    // Load PDF.js viewer to render the first page
    await page.goto("https://mozilla.github.io/pdf.js/web/viewer.html", { waitUntil: "networkidle2" });
    await page.evaluate((pdfDataURI) => {
      PDFViewerApplication.open(pdfDataURI);
    }, dataURI);

    // Wait for PDF to render visually
    await page.waitForSelector("#viewer .page[data-loaded='true']", { timeout: 10000 });

    // Screenshot first page
    const clip = await page.$("#viewer .page[data-page-number='1']");
    const screenshot = await clip.screenshot({ encoding: "base64" });

    await browser.close();

    return `data:image/png;base64,${screenshot}`;
  } catch (err) {
    console.error("ERROR: PDF render failed:", err.message); // Replaced emoji
    return null;
  }
};
// utils/pdf-to-image.js — Bulletproof PDF to image conversion using pdf2pic

const { fromBuffer } = require("pdf2pic");

module.exports = async function pdfToImageBase64(pdfBuffer) {
  try {
    const convert = fromBuffer(pdfBuffer, {
      density: 300,
      format: "png",
      width: 1240,
      height: 1754,
    });

    const page = await convert(1); // Only first page
    if (!page || !page.base64) {
      console.warn("⚠️ PDF conversion failed or returned empty.");
      return null;
    }

    return `data:image/png;base64,${page.base64}`;
  } catch (err) {
    console.error("🧨 PDF-to-image conversion failed:", err.message);
    return null;
  }
};

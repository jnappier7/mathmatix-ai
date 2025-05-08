// pdf-to-image.js — Converts a PDF buffer to base64 PNG (first page only)

const { fromBuffer } = require("pdf2pic");

module.exports = async function pdfToImageBase64(pdfBuffer) {
  const converter = fromBuffer(pdfBuffer, {
    density: 150,          // Quality
    format: "png",
    width: 1200,
    height: 1600
  });

  try {
    const result = await converter(1); // Convert page 1 only
    const base64Image = result.base64;
    return `data:image/png;base64,${base64Image}`;
  } catch (err) {
    console.error("🧨 PDF-to-Image conversion error:", err.message);
    return null;
  }
};

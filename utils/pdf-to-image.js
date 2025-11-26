// utils/pdf-to-image.js - Temporary stub for local dev
// This returns null so PDF uploads are gracefully handled
// Full PDF functionality requires canvas build which we're skipping for now

module.exports = async function pdfToImageBuffer(pdfBuffer) {
  console.warn("PDF processing is disabled in this environment (canvas not built)");
  return null;
};

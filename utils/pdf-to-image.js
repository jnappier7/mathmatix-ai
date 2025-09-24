// utils/pdf-to-image.js - REWRITTEN WITH PDF.JS (Pure JavaScript)

const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('canvas');

module.exports = async function pdfToImageBuffer(pdfBuffer) {
  try {
    const loadingTask = getDocument(pdfBuffer.buffer);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    
    return canvas.toBuffer('image/png');

  } catch (err) {
    console.error("ERROR: PDF.js rendering failed:", err);
    return null;
  }
};
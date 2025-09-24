// utils/pdf-to-image.js - DEFINITIVELY CORRECTED with LEGACY build

const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('canvas');

// Set up the worker for the Node.js environment
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

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
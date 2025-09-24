// utils/pdf-to-image.js - DEFINITIVELY CORRECTED

const pdfjs = require('pdfjs-dist');
const { createCanvas } = require('canvas');

// Set up the worker for the Node.js environment
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');

module.exports = async function pdfToImageBuffer(pdfBuffer) {
  try {
    const loadingTask = pdfjs.getDocument(pdfBuffer.buffer);
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
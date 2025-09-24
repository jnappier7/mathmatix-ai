// utils/pdf-to-image.js - CORRECTED IMPORT PATH

const { getDocument } = require('pdfjs-dist/build/pdf.js');
const { createCanvas } = require('canvas');

module.exports = async function pdfToImageBuffer(pdfBuffer) {
  try {
    // This worker is needed for the library to run in Node.js
    const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

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
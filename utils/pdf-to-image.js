// utils/pdf-to-image.js - Fixed for pdfjs-dist v5.x (ES module)

const { createCanvas } = require('canvas');

// Use dynamic import for ES module pdfjs-dist
module.exports = async function pdfToImageBuffer(pdfBuffer) {
  try {
    // Dynamic import of pdfjs-dist (ES module)
    const pdfjsLib = await import('pdfjs-dist');

    // Disable worker for Node.js environment (workers are for browsers)
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;

    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
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
// utils/pdf-to-image.js - Convert PDF to image using pdfjs-dist and canvas
// Gracefully handles environments where native dependencies aren't available

/**
 * Converts the first page of a PDF buffer to a PNG image buffer
 * @param {Buffer} pdfBuffer - The PDF file as a Buffer
 * @returns {Promise<Buffer|null>} PNG image buffer or null if dependencies unavailable
 */
module.exports = async function pdfToImageBuffer(pdfBuffer) {
  try {
    // Try to load dependencies - they may not be available in all environments
    const { createCanvas } = require('canvas');
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

    // Disable worker for Node.js environment
    pdfjsLib.GlobalWorkerOptions.workerSrc = null;

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      verbosity: 0 // Suppress console warnings
    });

    const pdfDocument = await loadingTask.promise;

    // Get the first page
    const page = await pdfDocument.getPage(1);

    // Set up viewport with 2x scale for higher quality
    const viewport = page.getViewport({ scale: 2.0 });

    // Create canvas with the viewport dimensions
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    // Set white background (PDFs may have transparent backgrounds)
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, viewport.width, viewport.height);

    // Render the PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    await page.render(renderContext).promise;

    // Convert canvas to PNG buffer
    const pngBuffer = canvas.toBuffer('image/png');

    console.log(`PDF converted successfully: ${viewport.width}x${viewport.height}px`);

    return pngBuffer;
  } catch (error) {
    // If dependencies aren't available (e.g., canvas not built), gracefully degrade
    if (error.code === 'MODULE_NOT_FOUND') {
      console.warn('PDF processing dependencies not available - PDFs will be handled without preview');
      return null;
    }

    console.error('PDF to image conversion error:', error.message);
    throw new Error(`Failed to convert PDF: ${error.message}`);
  }
};

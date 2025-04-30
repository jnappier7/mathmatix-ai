const vision = require('@google-cloud/vision');
const path = require('path');
const fs = require('fs');

// Create a Vision API client using your service account key
const client = new vision.ImageAnnotatorClient({
  keyFilename: path.join(__dirname, 'vision-key.json')
});

// Function to extract text from an image or the first page of a PDF
async function extractTextFromImageOrPDF(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.pdf') {
      const inputConfig = {
        mimeType: 'application/pdf',
        content: fs.readFileSync(filePath),
      };

      const request = {
        requests: [
          {
            inputConfig,
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            pages: [1]  // You can change this to process multiple pages
          }
        ]
      };

      const [result] = await client.batchAnnotateFiles(request);
      const responses = result.responses?.[0]?.responses || [];

      const fullText = responses.map(r => r.fullTextAnnotation?.text || '').join('\n');
      return fullText.trim();
    } else {
      const [result] = await client.textDetection(filePath);
      const detections = result.textAnnotations;
      return detections[0]?.description || '';
    }
  } catch (err) {
    console.error("OCR Error:", err);
    throw err;
  }
}

module.exports = { extractTextFromImageOrPDF };

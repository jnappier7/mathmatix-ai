const vision = require('@google-cloud/vision');
const path = require('path');
const fs = require('fs');

// Secure Vision API client initialization
let client;

if (process.env.GOOGLE_CLOUD_VISION_KEY) {
  const keyData = JSON.parse(process.env.GOOGLE_CLOUD_VISION_KEY);
  client = new vision.ImageAnnotatorClient({ credentials: keyData });
} else {
  const keyPath = path.join(__dirname, 'vision-key.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Missing vision-key.json at: ${keyPath}`);
  }
  client = new vision.ImageAnnotatorClient({ keyFilename: keyPath });
}

// Function to extract text from image or PDF
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
            pages: [1],
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
      return detections[0]?.description.trim() || '';
    }
  } catch (err) {
    console.error("OCR Error:", err);
    throw err;
  }
}

module.exports = { extractTextFromImageOrPDF };

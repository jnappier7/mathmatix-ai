const vision = require('@google-cloud/vision');
const path = require('path');

// Create a Vision API client using your service account key
const client = new vision.ImageAnnotatorClient({
  keyFilename: path.join(__dirname, 'vision-key.json') // Make sure this matches your file name
});

// Function to extract text from an uploaded image or PDF
async function extractTextFromImage(filePath) {
  try {
    const [result] = await client.textDetection(filePath);
    const detections = result.textAnnotations;
    return detections[0]?.description || '';
  } catch (error) {
    console.error('Error during OCR:', error);
    throw error;
  }
}

module.exports = { extractTextFromImage };

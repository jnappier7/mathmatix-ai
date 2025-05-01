const express = require('express');
const { v1: vision } = require('@google-cloud/vision');
const router = express.Router();

// Decode service account key from base64 env var
const raw = Buffer.from(process.env.GOOGLE_VISION_KEY_BASE64, 'base64').toString('utf8');
const credentials = JSON.parse(raw);

// Shared Vision client
const client = new vision.ImageAnnotatorClient({ credentials });

// Exportable function for reuse
async function extractTextFromImageOrPDF(base64Image) {
  const [result] = await client.textDetection({ image: { content: base64Image } });
  const detections = result.textAnnotations;
  return detections[0]?.description || '';
}

// Keeps your existing route intact
router.post('/upload', async (req, res) => {
  try {
    const image = req.body.image;
    const extractedText = await extractTextFromImageOrPDF(image);
    res.json({ text: extractedText });
  } catch (err) {
    console.error("OCR Error:", err);
    res.status(500).json({ error: 'OCR failed.' });
  }
});

module.exports = {
  extractTextFromImageOrPDF,
  router
};

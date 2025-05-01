const express = require('express');
const { v1: vision } = require('@google-cloud/vision');
const router = express.Router();

// Read base64-encoded service account key from env
const raw = Buffer.from(process.env.GOOGLE_VISION_KEY_BASE64, 'base64').toString('utf8');
const credentials = JSON.parse(raw);

// Initialize Vision client with credentials
const client = new vision.ImageAnnotatorClient({ credentials });

router.post('/upload', async (req, res) => {
  try {
    const image = req.body.image;

    const [result] = await client.textDetection({
      image: { content: image }
    });

    const detections = result.textAnnotations;
    const extractedText = detections[0]?.description || '';

    res.json({ text: extractedText });
  } catch (err) {
    console.error("OCR Error:", err);
    res.status(500).json({ error: 'OCR failed.' });
  }
});

module.exports = router;

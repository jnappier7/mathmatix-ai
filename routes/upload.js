const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { extractTextFromImageOrPDF } = require('./ocr');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Multer storage config
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

// === Route: Upload a file and run OCR ===
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const extractedText = await extractTextFromImageOrPDF(filePath);

    if (!extractedText.trim()) {
      return res.status(400).json({ text: "", error: "No text found in uploaded file." });
    }

    res.json({ text: extractedText });
  } catch (err) {
    console.error('Upload OCR error:', err);
    res.status(500).json({ error: 'Failed to process uploaded file.' });
  }
});

// === Route: Send extracted text to Gemini ===
router.post('/ask-ai', async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const prompt = req.body.prompt;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    });

    const response = result.response.text();
    res.json({ response });

  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: 'Failed to generate response from AI' });
  }
});

module.exports = router;

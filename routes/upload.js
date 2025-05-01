const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { extractTextFromImageOrPDF } = require('./ocr');

const router = express.Router();
const upload = multer();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const systemInstructions = `
You are M∆THM∆TIΧ AI — a step-by-step interactive math tutor. Guide students through the problem, asking what they know and offering hints. Do not give the answer right away. Use emojis, boxed steps, and wrap math in \\( \\). Stay encouraging and positive, even if they are stuck.
`.trim();

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const base64 = fileBuffer.toString('base64');

    const extractedText = await extractTextFromImageOrPDF(base64);
    const prompt = extractedText?.trim() || "Help me understand this math problem.";

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: systemInstructions }] },
        { role: "user", parts: [{ text: prompt }] }
      ]
    });

    let responseText = result.response.text();

    try {
      const parsed = JSON.parse(responseText);
      responseText = parsed.response || parsed.responseText || responseText;
    } catch {
      // Not JSON? Leave it as is
    }

    res.send(responseText);

  } catch (err) {
    console.error("Upload OCR/Gemini error:", err);
    res.status(500).json({ error: 'Failed to generate response from AI' });
  }
});

module.exports = router;

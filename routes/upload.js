
const express = require('express');
const router = express.Router();
const vision = require('@google-cloud/vision');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { extractTextFromImageOrPDF } = require('../ocr');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0" });
const client = new vision.ImageAnnotatorClient();

router.post('/upload', async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const base64Image = req.file.buffer.toString("base64");
    const extractedText = await extractTextFromImageOrPDF(base64Image);
    const text = extractedText.trim();

    if (!text) return res.json({ text: "⚠️ No text found in image." });

    const prompt = \`
You are a math tutor reviewing a student's handwritten homework. Here are the extracted problems and student work:

\${text}

Go through each problem, and for each one:
- Confirm whether the solution appears correct or not.
- If incorrect or unclear, gently ask to walk through it together.
- Be conversational, natural, and supportive. Don’t grade. Don’t use formal teacher tone.

Respond directly to the student in your voice as M∆THM∆TIΧ AI.
\`;

    const aiResponse = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });

    const feedback = aiResponse.response.text();
    res.json({ text, feedback });

  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: "Failed to process file." });
  }
});

module.exports = router;

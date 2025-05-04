// routes/upload.js — Handles image/PDF upload and OCR-based tutoring

const express = require("express");
const multer = require("multer");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const vision = require("@google-cloud/vision");
const { SYSTEM_PROMPT } = require("../server");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.join(__dirname, "../routes/vision-key.json")
});

// Multer file config
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { name, tone, learningStyle, interests } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const [result] = await client.documentTextDetection({ image: { content: file.buffer } });
    const fullText = result.fullTextAnnotation ? result.fullTextAnnotation.text : "";

    if (!fullText.trim()) {
      return res.status(400).json({ error: "No readable text found in image." });
    }

    const prompt = `
${SYSTEM_PROMPT}

Student Info:
- Name: ${name}
- Tone: ${tone || "Default"}
- Learning Style: ${learningStyle || "N/A"}
- Interests: ${interests || "N/A"}

This is the math the student uploaded:
"""${fullText}"""

Give feedback based on what was submitted. Do NOT solve the whole problem for them. Ask questions or give a hint.
`;

    const aiResult = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const aiResponse = aiResult.response.text().trim();
    return res.json({ text: aiResponse, extracted: fullText });

  } catch (err) {
    console.error("❌ Upload error:", err);
    return res.status(500).json({ error: "Something went wrong during upload processing." });
  }
});

module.exports = router;

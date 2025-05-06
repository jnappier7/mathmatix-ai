// routes/upload.js — Handles file upload + Mathpix OCR + Gemini response

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const router = express.Router();
const { SYSTEM_PROMPT } = require("../utils/prompt");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded." });

    const { name, tone, learningStyle, interests } = req.body;
    const base64 = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    // 🔍 OCR via Mathpix
    const ocrRes = await axios.post(
      "https://api.mathpix.com/v3/text",
      {
        src: base64,
        formats: ["text", "latex_styled"],
        data_options: { include_latex: true, include_text: true }
      },
      {
        headers: {
          "Content-Type": "application/json",
          app_id: process.env.MATHPIX_APP_ID,
          app_key: process.env.MATHPIX_APP_KEY
        }
      }
    );

    const extracted = (ocrRes.data?.text || "").trim();
    if (!extracted) return res.status(400).json({ error: "Mathpix returned no usable text." });

    // 🤖 AI Response
    const prompt = `
${SYSTEM_PROMPT}

Student Info:
- Name: ${name || "N/A"}
- Tone: ${tone || "Default"}
- Learning Style: ${learningStyle || "N/A"}
- Interests: ${interests || "N/A"}

Here's the extracted math text:
"""
${extracted}
"""

Give brief feedback. Ask guiding questions. Don’t solve the entire problem.
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const reply = result?.response?.text()?.trim() || "🤖 No feedback generated.";
    return res.json({ text: reply, extracted });

  } catch (err) {
    console.error("❌ Upload error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: "Something went wrong during upload processing." });
  }
});

module.exports = router;

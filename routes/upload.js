// routes/upload.js — Handles image/PDF upload and OCR-based tutoring using Mathpix

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const router = express.Router();
const { SYSTEM_PROMPT } = require("../utils/prompt");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Mathpix credentials from .env
const mathpixAppId = process.env.MATHPIX_APP_ID;
const mathpixAppKey = process.env.MATHPIX_API_KEY;

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { name, tone, learningStyle, interests } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    // Convert file buffer to base64
    const base64Image = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    // Mathpix OCR Request
    const mathpixResponse = await axios.post(
      "https://api.mathpix.com/v3/text",
      {
        src: base64Image,
        formats: ["text", "latex_styled"],
        data_options: {
          include_asciimath: false,
          include_latex: true,
          include_text: true
        }
      },
      {
        headers: {
          "app_id": mathpixAppId,
          "app_key": mathpixAppKey,
          "Content-Type": "application/json"
        }
      }
    );

    const fullText = mathpixResponse.data?.text?.trim() || "";

    if (!fullText) {
      return res.status(400).json({ error: "No readable math found in image." });
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

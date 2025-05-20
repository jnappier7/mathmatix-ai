// routes/upload.js â€” Handles file upload + Mathpix OCR + Gemini response

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const router = express.Router();
const { SYSTEM_PROMPT } = require("../utils/prompt");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const ocr = require("../utils/ocr");
const pdfToImage = require("../utils/pdf-to-image"); // ðŸ†• PDF converter

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("file"), async (req, res) => {
  try {
    console.log("ðŸ“¥ Upload route hit");
    console.log("ðŸ“¥ req.file:", req.file);
    console.log("ðŸ“¥ req.body:", req.body);

    const file = req.file;
    if (!file) {
      console.warn("âŒ No file received by multer.");
      return res.status(400).json({ error: "No file uploaded." });
    }

    const { name, tone, learningStyle, interests } = req.body;

    // ðŸ§  Convert PDF to image if needed
    console.log("📄 Detected mimetype:", file.mimetype);
const isPDF = file.mimetype.includes("pdf");

const base64 = isPDF
  ? await pdfToImage(file.buffer)
  : `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;


    if (!base64) return res.status(400).json({ error: "Failed to convert file to image." });

    // ðŸ” OCR via Mathpix
    const extracted = await ocr(base64);
    if (!extracted) return res.status(400).json({ error: "Mathpix returned no usable text." });

    // ðŸ¤– AI Prompt
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

Give brief feedback. Ask guiding questions. Donâ€™t solve the entire problem.
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const reply = result?.response?.text()?.trim() || "ðŸ¤– No feedback generated.";
    return res.json({ text: reply, extracted });

  } catch (err) {
    console.error("âŒ Upload error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: "Something went wrong during upload processing." });
  }
});

module.exports = router;

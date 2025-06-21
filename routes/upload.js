// routes/upload.js (Corrected - Remove .toObject() when .lean() is used)
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const router = express.Router();
const { generateSystemPrompt } = require("../utils/prompt"); // Correct import
const User = require("../models/user"); // Correct path
const { GoogleGenerativeAI } = require("@google/generative-ai");
const ocr = require("../utils/ocr");
const pdfToImage = require("../utils/pdf-to-image");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("file"), async (req, res) => {
  try {
    console.log("LOG: Upload route hit");
    console.log("LOG: req.file:", req.file);
    console.log("LOG: req.body:", req.body);

    const file = req.file;
    if (!file) {
      console.warn("WARN: No file received by multer.");
      return res.status(400).json({ error: "No file uploaded." });
    }

    const { userId } = req.body; // userId is from frontend

    // Fetch the user profile for personalized prompt generation as a plain JS object
    const user = await User.findById(userId).lean(); //

    if (!user) {
        console.warn("WARN: User not found for ID:", userId);
        return res.status(404).json({ error: "User profile not found for prompt generation." });
    }

    const isPDF = file.mimetype.includes("pdf");

    const base64 = isPDF
      ? await pdfToImage(file.buffer)
      : `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    if (!base64) return res.status(400).json({ error: "Failed to convert file to image." });

    const extracted = await ocr(base64);
    if (!extracted) return res.status(400).json({ error: "Mathpix returned no usable text." });

    // Generate the personalized system prompt, passing the plain user object
    const systemPrompt = generateSystemPrompt(user); //

    const prompt = `
${systemPrompt}

Here's the extracted math text:
"""
${extracted}
"""

Give brief feedback. Ask guiding questions. Don’t solve the entire problem.
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const reply = result?.response?.text()?.trim() || "No feedback generated.";
    return res.json({ text: reply, extracted });

  } catch (err) {
    console.error("ERROR: Upload error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: "Something went wrong during upload processing." });
  }
});

module.exports = router;
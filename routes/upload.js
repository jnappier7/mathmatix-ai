// routes/upload.js — Handles file upload + Mathpix OCR + Gemini response

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const router = express.Router();
// --- START EDIT 1: Corrected import for generateSystemPrompt and added User model ---
const { generateSystemPrompt } = require("../utils/prompt"); // Changed from { SYSTEM_PROMPT } to { generateSystemPrompt }
const User = require("../models/User"); // Added User model import to fetch user profile
// --- END EDIT 1 ---
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
      console.warn("â Œ No file received by multer.");
      return res.status(400).json({ error: "No file uploaded." });
    }

    // --- START EDIT 2: Add userId to destructuring, as it's needed to fetch the user ---
    // Assuming userId is sent from the frontend now (we'll cover that in script.js next)
    const { userId, name, tonePreference, learningStyle, interests } = req.body; // Changed 'tone' to 'tonePreference' to match User.js schema
    // --- END EDIT 2 ---

    // --- START EDIT 3: Fetch the user profile for personalized prompt generation ---
    const user = await User.findById(userId).lean(); // .lean() makes it a plain JS object, slightly faster

    if (!user) {
        console.warn("â Œ User not found for ID:", userId);
        return res.status(404).json({ error: "User profile not found for prompt generation." });
    }
    // --- END EDIT 3 ---

    // ðŸ§  Convert PDF to image if needed
    console.log("📄 Detected mimetype:", file.mimetype);
    const isPDF = file.mimetype.includes("pdf");

    const base64 = isPDF
      ? await pdfToImage(file.buffer)
      : `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    if (!base64) return res.status(400).json({ error: "Failed to convert file to image." });

    // ðŸ”  OCR via Mathpix
    const extracted = await ocr(base64);
    if (!extracted) return res.status(400).json({ error: "Mathpix returned no usable text." });

    // --- START EDIT 4: Generate the personalized system prompt and use user data ---
    const systemPrompt = generateSystemPrompt(user); // Call the imported function with the fetched user object

    // ðŸ¤– AI Prompt - Now using the personalized systemPrompt and fetched user data
    const prompt = `
${systemPrompt}

Here's the extracted math text:
"""
${extracted}
"""

Give brief feedback. Ask guiding questions. Don’t solve the entire problem.
`;
    // Removed direct "Student Info" section as generateSystemPrompt handles it based on the user object
    // --- END EDIT 4 ---

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const reply = result?.response?.text()?.trim() || "ðŸ¤– No feedback generated.";
    return res.json({ text: reply, extracted });

  } catch (err) {
    console.error("â Œ Upload error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: "Something went wrong during upload processing." });
  }
});

module.exports = router;
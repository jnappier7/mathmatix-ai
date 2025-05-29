// routes/upload.js - Handles file upload + Mathpix OCR + Gemini response

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
const pdfToImage = require("../utils/pdf-to-image"); // PDF converter (replaced emoji)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("file"), async (req, res) => {
  try {
    console.log("LOG: Upload route hit"); // Replaced emoji
    console.log("LOG: req.file:", req.file); // Replaced emoji
    console.log("LOG: req.body:", req.body); // Replaced emoji

    const file = req.file;
    if (!file) {
      console.warn("WARN: No file received by multer."); // Replaced emoji
      return res.status(400).json({ error: "No file uploaded." });
    }

    // --- START EDIT 2: Add userId to destructuring, as it's needed to fetch the user ---
    // Assuming userId is sent from the frontend now (we'll cover that in script.js next)
    const { userId, name, tonePreference, learningStyle, interests } = req.body; // Changed 'tone' to 'tonePreference' to match User.js schema
    // --- END EDIT 2 ---

    // --- START EDIT 3: Fetch the user profile for personalized prompt generation ---
    const user = await User.findById(userId).lean(); // .lean() makes it a plain JS object, slightly faster

    if (!user) {
        console.warn("WARN: User not found for ID:", userId); // Replaced emoji
        return res.status(404).json({ error: "User profile not found for prompt generation." });
    }
    // --- END EDIT 3 ---

    // Process: Convert PDF to image if needed (replaced emoji)
    console.log("LOG: Detected mimetype:", file.mimetype); // Replaced emoji
    const isPDF = file.mimetype.includes("pdf");

    const base64 = isPDF
      ? await pdfToImage(file.buffer)
      : `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    if (!base64) return res.status(400).json({ error: "Failed to convert file to image." });

    // Process: OCR via Mathpix (replaced emoji)
    const extracted = await ocr(base64);
    if (!extracted) return res.status(400).json({ error: "Mathpix returned no usable text." });

    // --- START EDIT 4: Generate the personalized system prompt and use user data ---
    const systemPrompt = generateSystemPrompt(user); // Call the imported function with the fetched user object

    // AI Prompt - Now using the personalized systemPrompt and fetched user data (replaced emoji)
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

    const reply = result?.response?.text()?.trim() || "No feedback generated."; // Replaced emoji
    return res.json({ text: reply, extracted });

  } catch (err) {
    console.error("ERROR: Upload error:", err?.response?.data || err.message || err); // Replaced emoji
    return res.status(500).json({ error: "Something went wrong during upload processing." });
  }
});

module.exports = router;
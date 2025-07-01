// routes/upload.js - CORRECTED to use centralized LLM call (OpenAI/Claude)
const express = require("express");
const multer = require("multer");
const axios = require("axios"); // Still used internally by ocr.js etc.
const router = express.Router();
const { generateSystemPrompt } = require("../utils/prompt");
const User = require("../models/user");
// Removed: const { GoogleGenerativeAI } = require("@google/generative-ai"); // REMOVED THIS LINE
const { callLLM } = require("../utils/openaiClient"); // NEW: Centralized LLM call function
const ocr = require("../utils/ocr");
const pdfToImage = require("../utils/pdf-to-image"); // Corrected to use our utility

// Removed: const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // REMOVED THIS LINE
// Removed: const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // REMOVED THIS LINE

const PRIMARY_UPLOAD_AI_MODEL = "gpt-4o-mini"; // Model for processing uploaded text

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
    // Ensure toObject() is not called on a lean document
    const user = await User.findById(userId).lean();

    if (!user) {
        console.warn("WARN: User not found for ID:", userId);
        return res.status(404).json({ error: "User profile not found for prompt generation." });
    }

    const isPDF = file.mimetype.includes("pdf");

    // Use our pdfToImage utility if it's a PDF
    const base64Image = isPDF
      ? await pdfToImage(file.buffer)
      : `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    if (!base64Image) return res.status(400).json({ error: "Failed to convert file to image (ensure it's a valid image or PDF)." });

    const extracted = await ocr(base64Image); // Use our ocr utility
    if (!extracted) return res.status(400).json({ error: "Mathpix returned no usable text from the image." });

    // Generate the personalized system prompt, passing the plain user object
    const systemPrompt = generateSystemPrompt(user);

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here's the extracted math text from an uploaded image/PDF: """${extracted}""". Give brief feedback. Ask guiding questions. Don’t solve the entire problem.` }
    ];

    // Use our centralized LLM call function
    const completion = await callLLM(PRIMARY_UPLOAD_AI_MODEL, messages, { max_tokens: 300 }); // Set a reasonable max_tokens for feedback

    const reply = completion.choices[0]?.message?.content?.trim() || "No feedback generated.";
    return res.json({ text: reply, extracted });

  } catch (err) {
    console.error("ERROR: Upload error:", err?.response?.data || err.message || err);
    // Provide more specific error messages for frontend if possible
    if (err.message.includes("Mathpix")) {
        return res.status(500).json({ error: "OCR processing failed. Please try a clearer image." });
    } else if (err.message.includes("AI models failed")) {
        return res.status(500).json({ error: "AI feedback failed. Please try again." });
    }
    return res.status(500).json({ error: "Something went wrong during upload processing." });
  }
});

module.exports = router;
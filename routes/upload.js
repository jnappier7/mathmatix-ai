// routes/upload.js — image/PDF upload route with OCR and AI feedback
const express = require("express");
const multer = require("multer");
const router = express.Router();
const upload = multer();

const extractTextFromImageOrPDF = require("../ocr");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // ✅ Correct model ID for 2.0 Flash in API

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("❌ No file uploaded.");

    const allowedTypes = ["image/png", "image/jpeg", "application/pdf"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).send("⚠️ Unsupported file type. Upload a PNG, JPG, or PDF.");
    }

    const extractedText = await extractTextFromImageOrPDF(req.file.buffer);
    console.log("📃 OCR Extracted Text:", extractedText || "[No text found]");

    if (!extractedText) {
      return res.send("⚠️ No text found in image.");
    }

    const prompt = `
A student uploaded this file. Review the extracted math and respond as M∆THM∆TIΧ AI.

✅ DO NOT give the final answer.
✅ Ask what the student notices or already tried.
✅ Give one hint at a time.
✅ Use LaTeX formatting in \\( \\).
✅ Encourage growth mindset and stay upbeat.

Extracted content:
${extractedText}
    `.trim();

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });

    const responseText = result.response.text();
    console.log("🤖 Gemini reply to OCR:", responseText);
    res.send(responseText);
  } catch (err) {
    console.error("🛑 Upload error:", err.message || err);
    res.status(500).send("⚠️ Upload failed.");
  }
});

module.exports = router;

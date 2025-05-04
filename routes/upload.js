// routes/upload.js — Upload route with Mathpix OCR + Gemini response
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const router = express.Router();
const upload = multer();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0" });

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("❌ No file uploaded.");

    const allowedTypes = ["image/png", "image/jpeg", "application/pdf"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).send("⚠️ Unsupported file type. Upload a PNG, JPG, or PDF.");
    }

    const mathpixRes = await axios.post(
      "https://api.mathpix.com/v3/text",
      {
        src: `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
        formats: ["text", "data", "latex_styled"],
        data_options: {
          include_asciimath: false,
          include_latex: true,
        },
        ocr: ["math", "text"],
      },
      {
        headers: {
          app_id: process.env.MATHPIX_APP_ID,
          app_key: process.env.MATHPIX_APP_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const extractedText = mathpixRes.data.text || mathpixRes.data.latex_styled || "";
    console.log("📃 Mathpix OCR:", extractedText || "[No text found]");

    if (!extractedText.trim()) {
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

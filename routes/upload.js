// routes/upload.js — Upload route with Mathpix OCR + Gemini response + image generation support

const express = require("express");
const multer = require("multer");
const router = express.Router();
const upload = multer();

const recognizeMathpix = require("../ocr");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Image + text supported

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({
        type: "text",
        text: "❌ No file uploaded."
      });
    }

    const allowedTypes = ["image/png", "image/jpeg", "application/pdf"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.json({
        type: "text",
        text: "⚠️ Unsupported file type. Upload a PNG, JPG, or PDF."
      });
    }

    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const extractedText = await recognizeMathpix(base64);

    console.log("📃 OCR Extracted Text:", extractedText || "[No text found]");

    if (!extractedText.trim()) {
      return res.json({
        type: "text",
        text: "⚠️ No text found in image."
      });
    }

    const prompt = `
A student uploaded this worksheet. Review the math, explain it with positivity, and provide a visual if possible.

✅ DO NOT give the final answer.
✅ Ask the student what they notice.
✅ Give only one hint at a time.
✅ Include a LaTeX math expression in \\( \\) where appropriate.
✅ If a visual diagram would help, generate and include an image.
✅ Use visuals ONLY when they directly enhance understanding.
✅ ALWAYS include a visual when:
  - A graph is referenced or requested
  - The concept is spatial (e.g. shapes, volume, surface area)
  - A visual representation helps explain abstract concepts (e.g. combining like terms, factoring, transformations)

🖼️ When generating a visual, end your message with a note like:
"Would you like me to draw this for you?" or
"Let me show you what that looks like."

Here’s the extracted text:
${extractedText}
    `.trim();

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });

    const parts = result.response.parts || [];
    const textPart = parts.find(p => p.text)?.text || "";
    const imagePart = parts.find(p => p.inlineData?.data);

    if (imagePart) {
      res.json({
        type: "image",
        image: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType,
        text: textPart
      });
    } else {
      res.json({
        type: "text",
        text: textPart
      });
    }

  } catch (err) {
    console.error("🛑 Upload error:", err.message || err);
    res.status(500).json({
      type: "text",
      text: "⚠️ Upload failed. Please try again later."
    });
  }
});

module.exports = router;

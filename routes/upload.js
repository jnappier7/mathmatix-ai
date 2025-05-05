const express = require("express");
const router = express.Router();
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { SYSTEM_PROMPT } = require("../utils/prompt");
const { extractGraphTag, extractImagePrompt } = require("../utils/postprocess");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const upload = multer();

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const base64Image = req.file.buffer.toString("base64");

    const mathpixResponse = await axios.post(
      "https://api.mathpix.com/v3/text",
      {
        src: `data:${req.file.mimetype};base64,${base64Image}`,
        formats: ["text", "data"],
        data_options: {
          include_asciimath: true,
          include_latex: true,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          app_id: process.env.MATHPIX_APP_ID,
          app_key: process.env.MATHPIX_APP_KEY,
        },
      }
    );

    if (!mathpixResponse?.data?.text) {
      throw new Error("Mathpix returned no usable text.");
    }

    const extractedText = mathpixResponse.data.text.trim();
    console.log("🧠 OCR Extracted Text:", extractedText);

    const fullPrompt = `${SYSTEM_PROMPT}\n\nJason uploaded handwritten work. Help evaluate and guide them.\n\nProblem: ${extractedText}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    });

    const aiReply = result?.response?.text()?.trim();

    if (!aiReply) {
      return res.status(500).json({ error: "Gemini returned no response." });
    }

    const graph = extractGraphTag(aiReply);
    const imagePrompt = extractImagePrompt(aiReply);

    return res.json({ text: aiReply, graph, imagePrompt });
  } catch (err) {
    console.error("❌ Upload error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: "Something went wrong during upload processing." });
  }
});

module.exports = router;

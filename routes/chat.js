// routes/chat.js — Handles direct user messages to M∆THM∆TIΧ

const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { SYSTEM_PROMPT } = require("../utils/prompt");
const User = require("../models/User");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

router.post("/", async (req, res) => {
  try {
    const { message, name, tone, learningStyle, interests } = req.body;

    if (!message || !name) {
      return res.status(400).json({ error: "Missing message or user name." });
    }

    const prompt = `
${SYSTEM_PROMPT}

Student Info:
- Name: ${name}
- Tone: ${tone || "Default"}
- Learning Style: ${learningStyle || "N/A"}
- Interests: ${interests || "N/A"}

Student says: "${message}"
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text().trim();
    return res.json({ text });

  } catch (err) {
    console.error("❌ Chat error:", err);
    return res.status(500).json({ error: "Something went wrong during chat." });
  }
});

module.exports = router;

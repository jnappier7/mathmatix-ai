// routes/chat.js — Gemini chat with memory, prompt, and smart session tracking

const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const saveSummary = require("./memory");
const generateSystemPrompt = require("../utils/prompt");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const baseModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const SESSION_TRACKER = {};

router.post("/", async (req, res) => {
  try {
    const { userId, message } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).send({ text: "⚠️ User not found." });

    const promptText = generateSystemPrompt(user);

    let history = SESSION_TRACKER[userId];

    // Inject system prompt on first message only
    if (!Array.isArray(history)) {
      history = [{ role: "user", parts: [{ text: promptText }] }];
    }

    const chat = baseModel.startChat({ history });
    const result = await chat.sendMessage(message);
    const text = result.response.text().trim();

    const updatedHistory = chat.getHistory?.();
    if (Array.isArray(updatedHistory)) {
      SESSION_TRACKER[userId] = updatedHistory;
    }

    res.send({ text });
  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).send({ text: "⚠️ Server error during chat." });
  }
});

router.post("/end-session", async (req, res) => {
  const { userId } = req.body;
  const history = SESSION_TRACKER[userId];

  if (!Array.isArray(history)) {
    return res.send({ message: "No session to summarize." });
  }

  try {
    const chat = baseModel.startChat({ history });
    const summaryResult = await chat.sendMessage("Summarize this tutoring session.");
    const summary = summaryResult.response.text().trim();

    await saveSummary(userId, summary);
    delete SESSION_TRACKER[userId];

    res.send({ message: "✅ Summary saved.", summary });
  } catch (err) {
    console.error("❌ Summary error:", err);
    res.status(500).send({ message: "⚠️ Failed to save summary." });
  }
});

module.exports = router;

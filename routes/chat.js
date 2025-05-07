// routes/chat.js — Gemini chat with persistent memory & smart session tracking

const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const saveSummary = require("./memory");
const generateSystemPrompt = require("../utils/prompt");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const baseModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const SESSION_TRACKER = {}; // Stores persistent chat + message logs

router.post("/", async (req, res) => {
  try {
    const { userId, message } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).send({ text: "⚠️ User not found." });

    const promptText = generateSystemPrompt(user);

    // 🧠 If no active session, start new one with system prompt
    if (!SESSION_TRACKER[userId]) {
      const history = [{ role: "user", parts: [{ text: promptText }] }];
      const chat = baseModel.startChat({ history });
      SESSION_TRACKER[userId] = {
        chat,
        messageLog: []
      };
    }

    const session = SESSION_TRACKER[userId];
    const chat = session.chat;

    // Track user message
    session.messageLog.push({ role: "user", content: message });

    const result = await chat.sendMessage(message);
    const text = result.response.text().trim();

    // Track model response
    session.messageLog.push({ role: "model", content: text });

    res.send({ text });
  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).send({ text: "⚠️ Server error during chat." });
  }
});

router.post("/end-session", async (req, res) => {
  const { userId } = req.body;
  const session = SESSION_TRACKER[userId];

  if (!session || !session.messageLog?.length) {
    return res.send({ message: "No session to summarize." });
  }

  try {
    const summaryResult = await session.chat.sendMessage("Summarize this tutoring session.");
    const summary = summaryResult.response.text().trim();

    // 🧠 Temporarily attach message log to user for summary save
    const user = await User.findById(userId);
    user.messageLog = session.messageLog;

    await saveSummary(userId, summary);
    delete SESSION_TRACKER[userId];

    res.send({ message: "✅ Summary saved.", summary });
  } catch (err) {
    console.error("❌ Summary error:", err);
    res.status(500).send({ message: "⚠️ Failed to save summary." });
  }
});

module.exports = router;

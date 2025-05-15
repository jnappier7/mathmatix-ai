// routes/chat.js — Gemini chat with persistent memory & smart session tracking

const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const saveSummary = require("./memory");
const { generateSystemPrompt } = require("../utils/prompt");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const flashModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const proModel = genAI.getGenerativeModel({ model: "gemini-pro" });

const SESSION_TRACKER = {}; // Stores persistent chat + message logs

async function sendWithFallback(chat, message) {
  try {
    const result = await chat.sendMessage(message);
    return { response: result.response.text().trim(), modelUsed: "flash" };
  } catch (err) {
    console.warn("⚠️ Flash model failed, retrying with Gemini Pro...");
    console.warn(err.message || err);
    try {
      const altChat = proModel.startChat({ history: chat._history || [] });
      const result = await altChat.sendMessage(message);
      return { response: result.response.text().trim(), modelUsed: "pro" };
    } catch (fallbackErr) {
      console.error("❌ Fallback model failed as well.");
      throw fallbackErr;
    }
  }
}

router.post("/", async (req, res) => {
  try {
    const { userId, message } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).send({ text: "⚠️ User not found." });

    const promptText = generateSystemPrompt(user);

    // 🧠 If no active session, start new one with system prompt
    if (!SESSION_TRACKER[userId]) {
      const history = [{ role: "user", parts: [{ text: promptText }] }];
      const chat = flashModel.startChat({ history });
      SESSION_TRACKER[userId] = {
        chat,
        messageLog: [],
        modelUsed: "flash"
      };
    }

    const session = SESSION_TRACKER[userId];
    const chat = session.chat;

    // Track user message
    session.messageLog.push({ role: "user", content: message });

    const { response: text, modelUsed } = await sendWithFallback(chat, message);

    // Update session state
    session.messageLog.push({ role: "model", content: text });
    session.modelUsed = modelUsed;

    res.send({ text, modelUsed });
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

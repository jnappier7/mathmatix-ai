const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

const User = require("../models/User");
const { generateSystemPrompt } = require("../utils/prompt");

const SESSION_TRACKER = {};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const flashModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const proModel = genAI.getGenerativeModel({ model: "gemini-pro" });

async function sendWithFallback(chat, message) {
  try {
    const result = await chat.sendMessage(message);
    return { response: result.response.text().trim(), modelUsed: "flash" };
  } catch (err1) {
    try {
      const fallback = await proModel.startChat({ history: chat.history });
      const result = await fallback.sendMessage(message);
      return { response: result.response.text().trim(), modelUsed: "pro" };
    } catch (err2) {
      console.error("❌ Chat error:", err2);
      return { response: "I'm having trouble right now. Please try again.", modelUsed: null };
    }
  }
}

router.post("/", async (req, res) => {
  const { userId, message } = req.body;

  if (!userId || !message) {
    return res.status(400).send("Missing userId or message.");
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).send("User not found.");

  const session = SESSION_TRACKER[userId] || {
    history: [{ role: "user", parts: [{ text: generateSystemPrompt(user) }] }],
    messageLog: [],
  };
  SESSION_TRACKER[userId] = session;

  session.history.push({ role: "user", parts: [{ text: message }] });
  session.messageLog.push({ role: "user", content: message });

  const chat = flashModel.startChat({ history: session.history });
  const { response: text, modelUsed } = await sendWithFallback(chat, message);

  // 🔍 Visual trigger for visual learners or requests
  let visualUrl = null;
  const isVisual = user.learningStyle?.toLowerCase() === "visual";
  const visualCue = /show|graph|diagram|paraboloid|unit circle|slope field|draw|visual/i.test(message);

  if (isVisual || visualCue) {
    try {
      const imgRes = await fetch("http://localhost:5000/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: message }),
      });
      const imgData = await imgRes.json();
      if (imgData?.url) {
        visualUrl = imgData.url;
      }
    } catch (err) {
      console.warn("⚠️ Image generation failed:", err.message || err);
    }
  }

  session.messageLog.push({ role: "model", content: text });
  if (visualUrl) {
    session.messageLog.push({ role: "model", content: `🖼️ Here's a visual that might help:\n${visualUrl}` });
  }

  session.history.push({ role: "model", parts: [{ text }] });

  res.send({
    text: visualUrl ? `${text}\n\n🖼️ Here's a visual that might help:\n${visualUrl}` : text,
    modelUsed,
  });
});

module.exports = router;

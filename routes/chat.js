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

const sendWithFallback = async (chat, message) => {
  try {
    const result = await chat.sendMessage([{ text: message }]);
    return { response: result.response.text().trim(), modelUsed: "flash" };
  } catch (err1) {
    try {
      const fallback = await proModel.startChat({ history: chat.history });
      const result = await fallback.sendMessage([{ text: message }]);
      return { response: result.response.text().trim(), modelUsed: "pro" };
    } catch (err2) {
      console.error("❌ Chat error:", err2);
      return {
        response: "I'm having trouble right now. Please try again.",
        modelUsed: null
      };
    }
  }
};

router.post("/", async (req, res) => {
  const { userId, message } = req.body;
  if (!userId || !message) return res.status(400).send("Missing userId or message.");

  const user = await User.findById(userId);
  if (!user) return res.status(404).send("User not found.");

  const session = SESSION_TRACKER[userId] || {
    history: [{ role: "user", parts: [{ text: generateSystemPrompt(user) }] }],
    messageLog: [],
  };
  SESSION_TRACKER[userId] = session;

  const last = session.history[session.history.length - 1]?.role;
  if (last === "user") {
    session.history.push({ role: "model", parts: [{ text: "..." }] });
  }

  session.messageLog.push({ role: "user", content: message });

  const chat = flashModel.startChat({ history: session.history });
  const { response: text, modelUsed } = await sendWithFallback(chat, message);

  // ✅ Smart visual trigger (math-only)
  let visualUrl = null;
  const visualCue = /graph|diagram|triangle|table|equation|geometry|parabola|unit circle|plot|slope field/i.test(message);
  const shouldGenerateVisual = visualCue;

  if (shouldGenerateVisual) {
    try {
      const imgRes = await fetch("http://localhost:10000/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: message }),
      });

      if (imgRes.ok) {
        const imgData = await imgRes.json();
        if (imgData?.imageUrl?.startsWith("http")) {
          visualUrl = imgData.imageUrl;
        }
      } else {
        console.warn("⚠️ Image fetch failed:", await imgRes.text());
      }

      if (!visualUrl) {
        const searchRes = await fetch("http://localhost:10000/image-search?query=" + encodeURIComponent(message));
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData?.imageUrl?.startsWith("http")) {
            visualUrl = searchData.imageUrl;
            console.log("✅ Google fallback image:", visualUrl);
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ Image generation/search error:", err.message || err);
    }
  }

  session.messageLog.push({ role: "model", content: text });
  if (visualUrl) {
    session.messageLog.push({ role: "model", content: visualUrl });
  }

  session.history.push({ role: "model", parts: [{ text }] });

  res.send({
    text: visualUrl ? `${visualUrl}\n\n${text}` : text,
    modelUsed,
  });
});

module.exports = router;

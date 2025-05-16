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
    const result = await chat.sendMessage({ role: "user", parts: [{ text: message }] });
    return { response: result.response.text().trim(), modelUsed: "flash" };
  } catch (err1) {
    try {
      const fallback = await proModel.startChat({ history: chat.history });
      const result = await fallback.sendMessage({ role: "user", parts: [{ text: message }] });
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

  const last = session.history[session.history.length - 1]?.role;
  if (last === "user") {
   
  session.messageLog.push({ role: "user", content: message });

  const chat = flashModel.startChat({ history: session.history });
  const { response: text, modelUsed } = await sendWithFallback(chat);

  // 🔍 Visual support with fallback
  let visualUrl = null;
  const isVisual = user.learningStyle?.toLowerCase() === "visual";
  const visualCue = /show|graph|diagram|paraboloid|unit circle|slope field|draw|visual/i.test(message);

  if (isVisual || visualCue) {
    try {
      const imgRes = await fetch("http://localhost:10000/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: message }),
      });

      if (imgRes.ok) {
        const imgData = await imgRes.json();
        if (imgData?.url && imgData.url.startsWith("http")) {
          visualUrl = imgData.url;
        }
      } else {
        console.warn("⚠️ Image fetch failed:", await imgRes.text());
      }

      // 🔁 Fallback: Google search if generation failed
      if (!visualUrl) {
        const searchRes = await fetch("http://localhost:10000/image-search?query=" + encodeURIComponent(message));
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData?.results?.[0]) {
            visualUrl = searchData.results[0];
            console.log("✅ Google image search fallback URL:", visualUrl);
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ Image generation or search failed:", err.message || err);
    }
  }

  session.messageLog.push({ role: "model", content: text });
  if (visualUrl && visualUrl.startsWith("http")) {
    session.messageLog.push({ role: "model", content: `🖼️ Here's a visual that might help:\n${visualUrl}` });
  }

  session.history.push({ role: "model", parts: [{ text }] });

  res.send({
    text: visualUrl && visualUrl.startsWith("http")
      ? `🖼️ Here's a visual that might help:\n${visualUrl}\n\n${text}`
      : text,
    modelUsed,
  });
});

module.exports = router;

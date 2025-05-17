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
        modelUsed: null,
      };
    }
  }
};

const visualIntentCheck = async (prompt, response) => {
  const visualCheckPrompt = `
You are Mathmatix AI, a math teacher who only uses visuals when they support understanding. A student said: "${prompt}"

Your response was: "${response}"

Would a visual be helpful here? ONLY respond with:
- YES
- NO
`;

  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const check = await model.generateContent(visualCheckPrompt);
  const result = await check.response.text();
  return result.trim().toUpperCase().startsWith("YES");
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

  let visualUrl = null;

  try {
    const shouldUseVisual = await visualIntentCheck(message, text);

    if (shouldUseVisual) {
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
      }

      if (!visualUrl) {
        const fallbackRes = await fetch(
          "http://localhost:10000/image-search?query=" + encodeURIComponent(message)
        );
        const fallbackData = await fallbackRes.json();
        if (fallbackData?.imageUrl?.startsWith("http")) {
          visualUrl = fallbackData.imageUrl;
        }
      }
    }
  } catch (err) {
    console.warn("⚠️ Visual decision or image fetch error:", err.message || err);
  }

  if (typeof text === "string" && text.trim()) {
    session.history.push({ role: "model", parts: [{ text: text.trim() }] });
    session.messageLog.push({ role: "model", content: text.trim() });
  } else {
    session.messageLog.push({
      role: "model",
      content: "⚠️ AI returned an invalid or empty response.",
    });
  }

  if (visualUrl) {
    session.messageLog.push({ role: "model", content: visualUrl });
  }

  res.send({
    text: visualUrl ? `${visualUrl}\n\n${text || ""}` : text || "⚠️ AI response missing.",
    modelUsed,
  });
});

module.exports = router;

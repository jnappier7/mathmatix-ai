const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

const User = require("../models/User");
const { generateSystemPrompt } = require("../utils/prompt");

const SESSION_TRACKER = {};
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const flashModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const sendWithFallback = async (chat, message) => {
  try {
    const result = await chat.sendMessage([{ text: message }]);
    return { response: result.response.text().trim(), modelUsed: "flash" };
  } catch (err) {
    console.error("❌ Gemini error:", err.message || err);
    return {
      response: "⚠️ I'm having trouble responding right now. Please try again.",
      modelUsed: null,
    };
  }
};

const visualIntentCheck = async (prompt, response) => {
  const visualCheckPrompt = `
You are Mathmatix AI, a math tutor who uses visuals only when they help students understand.

Student asked: "${prompt}"
You replied: "${response}"

Would showing a visual (like a graph or diagram) help teach or clarify this concept?

ONLY respond with:
- YES
- NO
`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const check = await model.generateContent(visualCheckPrompt);
    const result = await check.response.text();
    return result.trim().toUpperCase().startsWith("YES");
  } catch (err) {
    console.warn("⚠️ Visual intent check failed:", err.message || err);
    return false;
  }
};

const extractGraphableEquation = (text) => {
  const match = text.match(/y\s*=\s*[-+]?[\dx\s\^\/\*\.\+\-\(\)]+/i);
  return match ? match[0] : null;
};

const chunkText = (text) => {
  const sentences = text
    .split(/(?<=[.?!])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.length > 1 ? sentences : [text];
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

  const last = session.history.at(-1)?.role;
  if (last === "user") {
    session.history.push({ role: "model", parts: [{ text: "..." }] });
  }

  session.messageLog.push({ role: "user", content: message });

  const chat = flashModel.startChat({ history: session.history });
  const { response: text, modelUsed } = await sendWithFallback(chat, message);

  let visualUrl = null;
  const equation = extractGraphableEquation(message);
  const shouldUseVisual = text && await visualIntentCheck(message, text);

  if (equation && shouldUseVisual) {
    const encoded = encodeURIComponent(equation);
    visualUrl = `https://www.geogebra.org/graphing?equation=${encoded}`;
  } else if (shouldUseVisual) {
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
    } catch (err) {
      console.warn("⚠️ Visual fetch error:", err.message || err);
    }
  }

  const chunks = typeof text === "string" && text.trim()
    ? chunkText(text.trim())
    : ["⚠️ AI returned an invalid or empty response."];

  const lastRole = session.history.at(-1)?.role;
  if (lastRole !== "model" && typeof text === "string" && text.trim()) {
    session.history.push({ role: "model", parts: [{ text: text.trim() }] });
  }

  session.messageLog.push({ role: "model", content: text });

  if (visualUrl) {
    session.messageLog.push({ role: "model", content: visualUrl });
  }

  res.send({
    chunks,
    image: visualUrl || null,
    modelUsed,
  });
});

module.exports = router;

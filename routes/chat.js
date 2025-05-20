const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const User = require("../models/User");
const { getLastSessionSummary } = require("../utils/postprocess");

const sessionHistory = {}; // in-memory cache

function extractEquation(message) {
  const match = message.match(/y\s*=\s*[-+*/^x\d\s.]+/i);
  return match ? match[0] : null;
}

function shouldIncludeVisual(message) {
  return /graph|plot|parabola|line|slope|equation|visual/i.test(message);
}

// SYSTEM INSTRUCTIONS FOR AI TONE & MEMORY FLEX
const BASE_PROMPT = `
You are Mathmatix AI, a human-like math tutor. Your role is to help students think critically and discover math patterns. Be conversational, adaptable, and supportive. DO NOT lecture. Use casual, natural language. Never say “I’m just a language model.” Never say “I can’t.”

Use past session info to jog memory, but let the student choose what to do next. Do NOT continue a session unless the student explicitly asks for it. Your job is to engage, not push.

Use the 1–2–3 scale check only at the end of a concept.

Never generate cartoon images, memes, or photos. If needed, use a desmos:// URL with a math expression for visuals.
`;

router.post("/", async (req, res) => {
  const { message, userId } = req.body;
  const user = await User.findById(userId).lean();
  if (!user) return res.status(404).json({ error: "User not found" });

  const memory = sessionHistory[userId] || [];
  memory.push({ role: "user", parts: [{ text: message }] });

  const equation = extractEquation(message);
  const shouldVisualize = shouldIncludeVisual(message);
  let visualUrl = null;

  if (equation && shouldVisualize) {
    visualUrl = `desmos://${encodeURIComponent(equation.replace(/\s+/g, ""))}`;
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: BASE_PROMPT }] },
      ...memory.slice(-10),
    ],
    generationConfig: { temperature: 0.7 },
  });

  try {
    const result = await chat.sendMessage(message);
    const reply = result.response.text().trim();

    memory.push({ role: "model", parts: [{ text: reply }] });
    sessionHistory[userId] = memory;

    res.json({ text: reply, image: visualUrl });
  } catch (err) {
    console.error("❌ Chat error:", err.message || err);
    res.status(500).json({ error: "AI error. Please try again." });
  }
});

module.exports = router;

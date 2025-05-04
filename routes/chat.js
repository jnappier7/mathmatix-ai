// routes/chat.js — Chat route using Gemini 1.5 Flash with full memory + tutor prompt

const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const saveSummary = require("./memory");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const baseModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const SESSION_TRACKER = {};

router.post("/", async (req, res) => {
  try {
    const { userId, message } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).send({ text: "User not found." });

    const { name, grade, tone, learningStyle, interests, conversations } = user;
    const lastSummary = conversations?.slice(-1)[0]?.summary || "";

    const systemMessage = `
You are M∆THM∆TIΧ, an AI math tutor built to help students think through problems interactively.
- Ask guiding questions before giving answers.
- Emphasize pattern recognition.
- Speak in a friendly, motivating tone.
- Always check for understanding using a 1–2–3 scale (3 = "I got it!", 1 = "What the heck?")
- Use GEMS (Grouping, Exponents, Multiplication/Division L→R, Subtraction/Addition L→R) instead of PEMDAS.

Student info:
- Name: ${name}
- Grade: ${grade}
- Tone: ${tone}
- Learning Style: ${learningStyle}
- Interests: ${interests}

${lastSummary ? `Here is a summary of your last session:\n${lastSummary}` : ""}
`;

    // ✅ Always use iterable chat history
    const priorHistory = Array.isArray(SESSION_TRACKER[userId])
      ? SESSION_TRACKER[userId]
      : [];

    const chat = baseModel.startChat({
      history: [
        { role: "user", parts: [{ text: systemMessage }] },
        ...priorHistory,
      ],
    });

    const result = await chat.sendMessage(message);
    const text = result.response.text().trim();

    const newHistory = chat.getHistory();
    SESSION_TRACKER[userId] = newHistory;

    res.send({ text });

  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).send({ text: `⚠️ Server Error: ${err.message}` });
  }
});

router.post("/end-session", async (req, res) => {
  const { userId } = req.body;
  if (!SESSION_TRACKER[userId]) return res.send({ message: "No session to summarize." });

  const history = SESSION_TRACKER[userId];
  try {
    const summaryPrompt = "Summarize this math tutoring session in 2-3 sentences for a tutor record.";

    const chat = baseModel.startChat({
      history: Array.isArray(history) ? history : [],
    });

    const summaryResult = await chat.sendMessage(summaryPrompt);
    const summary = summaryResult.response.text().trim();

    await saveSummary(userId, summary);
    delete SESSION_TRACKER[userId];

    res.send({ message: "✅ Summary saved.", summary });
  } catch (err) {
    console.error("❌ Failed to summarize session:", err);
    res.status(500).send({ message: "Summary failed." });
  }
});

module.exports = router;

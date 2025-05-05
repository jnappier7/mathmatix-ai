// routes/chat.js — Chat route using Gemini 1.5 Flash with full memory + tutor prompt

const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const saveSummary = require("./memory");
const { SYSTEM_PROMPT } = require("../utils/prompt");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const baseModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Tracks live user sessions
const SESSION_TRACKER = {}; // userId: [ { role, parts: [ { text } ] } ]

router.post("/", async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) return res.status(400).send({ error: "Missing userId or message." });

    const user = await User.findById(userId);
    if (!user) return res.status(404).send({ error: "User not found." });

    const { name, grade, tone, learningStyle, interests, conversations } = user;
    const lastSummary = conversations?.slice(-1)[0]?.summary || "";

    // Build system prompt (uses SYSTEM_PROMPT file for maintainability)
    const systemMessage = `${SYSTEM_PROMPT}\n\nStudent Info:\n- Name: ${name}\n- Grade: ${grade}\n- Tone: ${tone}\n- Learning Style: ${learningStyle}\n- Interests: ${interests}\n\n${lastSummary ? `Here is a summary of your last session:\n${lastSummary}` : ""}`;

    // If first message in session, prepend system message
    if (!SESSION_TRACKER[userId]) {
      SESSION_TRACKER[userId] = [
        { role: "user", parts: [{ text: systemMessage }] },
      ];
    }

    // Append user's message
    SESSION_TRACKER[userId].push({ role: "user", parts: [{ text: message }] });

    // Start chat with history
    const chat = baseModel.startChat({ history: SESSION_TRACKER[userId] });
    const result = await chat.sendMessage(message);
    const text = result.response.text().trim();

    // Append AI's response to history
    SESSION_TRACKER[userId].push({ role: "model", parts: [{ text }] });

    res.send({ text });

  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).send({ text: "⚠️ Something went wrong during the chat." });
  }
});

router.post("/end-session", async (req, res) => {
  const { userId } = req.body;
  if (!SESSION_TRACKER[userId]) return res.send({ message: "No session to summarize." });

  const history = SESSION_TRACKER[userId];
  try {
    const summaryPrompt = "Summarize this math tutoring session in 2-3 sentences for a tutor record.";
    const chat = baseModel.startChat({ history });
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

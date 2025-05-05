// routes/chat.js — Gemini 1.5 Flash with memory, personalization, and summary tracking

const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const saveSummary = require("./memory");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const baseModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const SESSION_TRACKER = {}; // In-memory session history per userId

router.post("/", async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).send({ text: "Missing userId or message." });
    }

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

    // Set up initial message history if new user
    if (!SESSION_TRACKER[userId]) {
      SESSION_TRACKER[userId] = [
        { role: "user", parts: [{ text: systemMessage }] }
      ];
    }

    const existingHistory = SESSION_TRACKER[userId];

    const chat = baseModel.startChat({ history: existingHistory });

    const result = await chat.sendMessage(message);
    const text = result.response.text().trim();

    SESSION_TRACKER[userId] = chat.getHistory();

    res.send({ text });

  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).send({ text: "⚠️ Something went wrong during the chat." });
  }
});

router.post("/end-session", async (req, res) => {
  const { userId } = req.body;

  if (!SESSION_TRACKER[userId]) {
    return res.send({ message: "No session to summarize." });
  }

  try {
    const chat = baseModel.startChat({
      history: SESSION_TRACKER[userId]
    });

    const summaryPrompt = "Summarize this math tutoring session in 2–3 sentences for a tutor record.";
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

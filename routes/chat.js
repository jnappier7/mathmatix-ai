const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const { generateSystemPrompt } = require("../utils/prompt"); 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// PIVOT: Setting both models to gemini-1.5-pro for improved instruction following.
// This removes the flash model's consistent failure and simplifies the logic.
const primaryModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Using 1.5 Pro as the primary
const fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Keeping 1.5 Pro for any fallback scenario (though it won't be hit in the simplified try/catch)

const SESSION_TRACKER = {}; // Session memory per user

router.post("/", async (req, res) => {
  const { userId, message } = req.body;

  console.log("LOG: Received message:", message);
  console.log("LOG: userId:", userId);

  const user = await User.findById(userId).lean();
  console.log("LOG: Loaded user:", user?.name || "ERROR: Not found");

  const systemPrompt = generateSystemPrompt(user);
  console.log("LOG: Prompt injected:", systemPrompt.slice(0, 200) + "...");

  // Load or create session
  let session = SESSION_TRACKER[userId];
  if (!session) {
    session = {
      history: [],
      messageLog: [],
      systemPrompt // Store the initial system prompt in session
    };
    SESSION_TRACKER[userId] = session;
  }

  // Add user message to session log
  session.messageLog.push({ role: "user", content: message });

  const history = session.history;

  try {
    let modelUsed = "gemini-1.5-pro"; // Indicate that 1.5 Pro is being used

    // Simplified chat session setup, directly using gemini-1.5-pro
    let chat = primaryModel.startChat({ // Using primaryModel (gemini-1.5-pro)
      history,
      systemInstruction: systemPrompt,
    });

    const result = await chat.sendMessage(message); // Direct sendMessage call

    const text = result.response.text().trim();
    console.log("LOG: AI response:", text.slice(0, 100) + "...");

    // Update session history
    session.history.push({ role: "user", parts: [{ text: message }] });
    session.history.push({ role: "model", parts: [{ text }] });

    res.json({ text, modelUsed });
  } catch (err) {
    console.error("ERROR: Gemini error:", err);
    res.status(500).json({ error: "AI error. Try again." });
  }
});

module.exports = router;
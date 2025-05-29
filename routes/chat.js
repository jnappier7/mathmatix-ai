const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
const { generateSystemPrompt } = require("../utils/prompt"); 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const flashModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const proModel = genAI.getGenerativeModel({ model: "gemini-pro" });

const SESSION_TRACKER = {}; // Session memory per user (rephrased emoji comment)

router.post("/", async (req, res) => {
  const { userId, message } = req.body;

  console.log("LOG: Received message:", message); // Replaced emoji
  console.log("LOG: userId:", userId); // Replaced emoji

  const user = await User.findById(userId).lean();
  console.log("LOG: Loaded user:", user?.name || "ERROR: Not found"); // Replaced emoji

  const systemPrompt = generateSystemPrompt(user);
  console.log("LOG: Prompt injected:", systemPrompt.slice(0, 200) + "..."); // Replaced emoji

  // Load or create session (rephrased emoji comment)
  let session = SESSION_TRACKER[userId];
  if (!session) {
    session = {
      history: [],
      messageLog: [],
      systemPrompt
    };
    SESSION_TRACKER[userId] = session;
  }

  // Add user message to session log (rephrased emoji comment)
  session.messageLog.push({ role: "user", content: message });

  const history = session.history;

  try {
    let modelUsed = "gemini-1.5-flash";

    // FIX: Removed 'tools' and 'toolsConfig' and moved 'systemInstruction' directly to startChat config
    let chat = flashModel.startChat({
      history,
      systemInstruction: systemPrompt, // Correct way to pass system instruction
    });

    let result;
    try {
      result = await chat.sendMessage(message);
    } catch (err) {
      console.warn("WARN: Flash model failed, retrying with Gemini Pro..."); // Replaced emoji
      modelUsed = "gemini-pro";

      // FIX: Apply the same configuration for proModel
      chat = proModel.startChat({
        history,
        systemInstruction: systemPrompt, // Correct way to pass system instruction
      });

      result = await chat.sendMessage(message);
    }

    const text = result.response.text().trim();
    console.log("LOG: AI response:", text.slice(0, 100) + "..."); // Replaced emoji

    // Update session history (rephrased emoji comment)
    session.history.push({ role: "user", parts: [{ text: message }] });
    session.history.push({ role: "model", parts: [{ text }] });

    res.json({ text, modelUsed });
  } catch (err) {
    console.error("ERROR: Gemini error:", err); // Replaced emoji
    res.status(500).json({ error: "AI error. Try again." });
  }
});

module.exports = router;
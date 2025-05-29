const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");
// FIX: Add curly braces for destructuring, as generateSystemPrompt is exported as a property of an object
const { generateSystemPrompt } = require("../utils/prompt"); 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const flashModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const proModel = genAI.getGenerativeModel({ model: "gemini-pro" });

const SESSION_TRACKER = {}; // 🧠 Session memory per user

router.post("/", async (req, res) => {
  const { userId, message } = req.body;

  console.log("📨 Received message:", message);
  console.log("🔍 userId:", userId);

  const user = await User.findById(userId).lean();
  console.log("👤 Loaded user:", user?.name || "❌ Not found");

  const systemPrompt = generateSystemPrompt(user);
  console.log("📜 Prompt injected:", systemPrompt.slice(0, 200) + "...");

  // 🧠 Load or create session
  let session = SESSION_TRACKER[userId];
  if (!session) {
    session = {
      history: [],
      messageLog: [],
      systemPrompt
    };
    SESSION_TRACKER[userId] = session;
  }

  // 🧱 Add user message to session log
  session.messageLog.push({ role: "user", content: message });

  const history = session.history;

  try {
    let modelUsed = "gemini-1.5-flash";

    let chat = flashModel.startChat({
      tools: [],
      toolsConfig: {
        systemInstruction: systemPrompt,
      },
      history,
    });

    let result;
    try {
      result = await chat.sendMessage(message);
    } catch (err) {
      console.warn("⚠️ Flash model failed, retrying with Gemini Pro...");
      modelUsed = "gemini-pro";

      chat = proModel.startChat({
        tools: [],
        toolsConfig: {
          systemInstruction: systemPrompt,
        },
        history,
      });

      result = await chat.sendMessage(message);
    }

    const text = result.response.text().trim();
    console.log("💬 AI response:", text.slice(0, 100) + "...");

    // 🧠 Update session history
    session.history.push({ role: "user", parts: [{ text: message }] });
    session.history.push({ role: "model", parts: [{ text }] });

    res.json({ text, modelUsed });
  } catch (err) {
    console.error("❌ Gemini error:", err);
    res.status(500).json({ error: "AI error. Try again." });
  }
});

module.exports = router;
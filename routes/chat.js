const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { generateSystemPrompt } = require("../utils/prompt");
const memory = require("../routes/memory");
const User = require("../models/User");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const flashModel = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction: "placeholder"
});

const SESSION_TRACKER = {}; // Stores persistent chat + message logs

async function sendWithFallback(chat, message) {
  try {
    const result = await chat.sendMessage([{ text: message }]);
    const text = result.response.text().trim();
    return { response: text, modelUsed: "flash" };
  } catch (err) {
    console.warn("⚠️ Flash model failed, retrying with Gemini Pro...");

    const proModel = genAI.getGenerativeModel({
      model: "gemini-pro"
    });

    const proChat = proModel.startChat({
      history: chat.getHistory()
    });

    try {
      const result = await proChat.sendMessage([{ text: message }]);
      const text = result.response.text().trim();
      return { response: text, modelUsed: "pro" };
    } catch (err) {
      console.error("❌ Fallback model failed as well.");
      return { response: "⚠️ AI error. Please try again.", modelUsed: "error" };
    }
  }
}

router.post("/", async (req, res) => {
  const { userId, message } = req.body;
  const user = await User.findById(userId).lean();

  const systemPrompt = generateSystemPrompt(user);

  // 🧠 Create or load session with system prompt in history on first use
  let session = SESSION_TRACKER[userId];
  if (!session) {
    session = {
      history: [
        {
          role: "system",
          parts: [{ text: systemPrompt }]
        }
      ],
      messageLog: [],
      systemPrompt
    };
    SESSION_TRACKER[userId] = session;
  }

  const chat = flashModel.startChat({
    toolsConfig: {
      systemInstruction: systemPrompt
    },
    history: session.history
  });

  session.messageLog.push({ role: "user", content: message });

  const { response, modelUsed } = await sendWithFallback(chat, message);

  session.history.push({ role: "user", parts: [{ text: message }] });
  session.history.push({ role: "model", parts: [{ text: response }] });

  res.send({
    text: response,
    modelUsed,
    image: null
  });
});

module.exports = router;

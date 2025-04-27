// server.js FINAL FULL MATHMATIX AI BACKEND with Safety Fix

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// FINAL Mathmatix AI System Instructions
const systemInstructions = `
You are M∆THM∆TIΧ AI — a chill, real math coach.
[...System instructions...]
`;

// Chat Route
app.post('/chat', async (req, res) => {
  try {
    const { chatHistory = [], message } = req.body;

    if (!Array.isArray(chatHistory) || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid request format.' });
    }

    const payload = {
      contents: [
        { role: "user", parts: [{ text: systemInstructions }] },
        ...chatHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
        { role: "user", parts: [{ text: message }] },
      ]
    };

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-002:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    const aiText = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No AI response.";
    res.json({ response: aiText });
  } catch (error) {
    console.error('Error chatting with Gemini:', error);
    res.status(500).json({ error: 'Failed to get response from AI.' });
  }
});

// Server Start
app.listen(PORT, () => {
  console.log(`M∆THM∆TIΧ AI Server Running on port ${PORT} 🚀`);
});

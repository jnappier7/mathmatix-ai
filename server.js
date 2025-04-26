// server.js (FINAL FULL MATHMATIX AI BACKEND)

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
You text with students like a big brother, mentor, or teammate — relatable but professional.
You explain, encourage, and challenge without sounding fake, corny, or immature.
You unlock math through patterns, confidence, and connection.

---

DO NOT GIVE FULL DIRECT ANSWERS.
Instead:
- Ask warm-up or clarifying questions first (unless student says "skip").
- Give hints or partial steps.
- Push students to explain their thinking before moving forward.
- Solve simpler parallel problems when students struggle.
- Break down large problems into smaller components when stuck.

---

TEACHING FLOW:
- Offer a "1–2–3" Check after every key step:
  - 3 = Got it
  - 2 = Need another example
  - 1 = Still confused

- Use Gradual Release (I Do → We Do → You Do):
  - My Turn (model an example)
  - Our Turn (solve similar one together)
  - Your Turn (student tries independently)

- Suggest extra practice casually: "Want another one real quick?"
- NEVER beat a dead horse. If mastery shown, MOVE ON.

---

CORE BELIEFS:
- Math is about patterns.
- Once you see the patterns, math becomes easy.
- Math is the language God used to create the universe.
- Math lives inside you already. You're unlocking it.

---

TONE & STYLE:
- Chill, clean, and professional.
- Celebrate effort, not perfection.
- Natural phrases you can use:
  - "Let's run it."
  - "You're cooking."
  - "Side by side, you gotta divide."
  - "Box in the variable — think outside the box."

---

MATH FORMATTING:
- Format math with LaTeX:
  - Inline: \\( 3x + 5 = 17 \\)
  - Block: \\[ x = \frac{17-5}{3} \\]
- Always trigger MathJax rendering after.

---

REMEMBER:
You are not just solving math. You are UNLOCKING students' abilities.
Keep it real. Keep it encouraging. Keep it pattern-focused.
You are M∆THM∆TIΧ AI.
`;

// Chat Route
app.post('/chat', async (req, res) => {
  try {
    const { chatHistory, message } = req.body;

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

// server.js — FINAL UPGRADE for M∆THM∆TIΧ AI (System Instructions Correct + Gemini 2.0 Flash + Image Hybrid)

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

// --- SYSTEM INSTRUCTIONS 2.2 ---

const systemInstructions = `
**M∆THM∆TIΧ AI — SYSTEM INSTRUCTIONS**

You are M∆THM∆TIΧ AI — a next-level, interactive, step-by-step math tutor. You are not a calculator, not a homework solver, and definitely not a robot that gives away answers. You are a coach, a guide, a hype-person, and a pattern unlocker. Your job is to make students feel smart and capable by helping them figure it out themselves.

---

🚨 NEVER GIVE DIRECT ANSWERS.  
Instead:  
- Ask a warm-up or clarifying question first (unless the student asks to skip).  
- Use parallel or simpler problems when students struggle.  
- Give hints or partial steps, but never the full answer upfront.  
- Push students to explain their thinking.

---

🎯 YOUR CORE JOB  
- Make math feel doable.  
- Break big problems into small, digestible steps. It should feel like a conversation.  
- No long blocks of text! Break up information into digestable parts, and ask for feedback in between.
- Adapt to how each student thinks.  
- Reinforce patterns and connections between concepts.  
- Use friendly, real-talk language while staying on task.

---

🧠 WARM-UP ROUTINE  
Always begin with a warm-up:  
- Ask what the student is working on.  
- Offer 2–3 quick questions to activate background skills.  
- Proceed to the main problem after warm-up is complete or if the student requests to skip.

---

📊 1–2–3 UNDERSTANDING CHECK  
Use this scale to check student confidence:  
- 3 = "I've got it!" → Move forward or challenge them.  
- 2 = "I could use another example." → Offer one more.  
- 1 = "What the heck are you talking about?" → Break it down further.  
Prompt:  
> "On a scale from 1 to 3 — where are you right now?"

---

🛠 STRATEGIES TO USE  
- Double-distribution for binomial multiplication (not FOIL unless they ask).  
- When referring to expressions like "3x," clarify that it means "3 of the variable x" or "3 x's" to reinforce conceptual understanding.  
- Chunk multi-step problems into pieces, pausing between.  
- Use pattern recognition and component skill analysis.  
- Apply the I Do → We Do → You Do model when needed.  
- Offer parallel problems before retrying the original.

---

💬 TONE & ENGAGEMENT  
- Keep it real: playful, motivating, upbeat.  
- Celebrate effort, not just right answers.  
- Throw in phrases like:  
  - “Boom! Let’s go!”  
  - “You’re cooking now.”  
  - “Math now, memes later.”  
  - “Let’s level up!”

---

👀 VISUAL + CONCRETE SUPPORT  
- Explain concepts with visuals when possible.  
- Format all math using LaTeX with \`\\( ... \\)\` for inline expressions and \`\\[ ... \\]\` for block expressions.  
- Use LaTeX: \`x^2\`, \`\\( \\frac{a}{b} \\)\` for clarity.  
- If visual tools aren't available, describe clearly or use ASCII diagrams.

---

🣍️ ADAPT TO THE STUDENT  
- Visual learner? Use analogies or diagrams.  
- Confident? Add a twist or challenge.  
- Anxious? Go slow, validate small wins.  
- Off-task? Re-engage with energy and focus.
- Cater lexile level of responses to the student's grade-level

---

📚 TEACH LIKE JASON  
- Encourage shorthand like "CLT" for "combine like terms."  
- Repeat the original problem often.  
- Celebrate independence and productive struggle.  
- Reference teacher/class when relevant:  
  > “Mr. Nappier would love this step!”

---

**Remember:**  
Your job is not to finish the problem. It’s to help the student finish it themselves.  
M∆THM∆TIΧ AI isn’t about shortcuts — it’s about unlocking understanding.

**Let’s go.**
`;

// --- CHAT ROUTE ---

app.post('/chat', async (req, res) => {
  try {
    const { chatHistory = [], message } = req.body;

    if (!Array.isArray(chatHistory) || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid request format.' });
    }

    const payload = {
      contents: [
        { role: "system", parts: [{ text: systemInstructions }] },
        ...chatHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
        { role: "user", parts: [{ text: message }] },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    };

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    const parts = response.data.candidates?.[0]?.content?.parts || [];

    let finalResponse = "";
    let images = [];

    for (const part of parts) {
      if (part.text) {
        finalResponse += part.text + "\n";
      } else if (part.inlineData) {
        images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
      }
    }

    res.json({ 
      response: finalResponse.trim() || "No AI text response.", 
      images: images
    });

  } catch (error) {
    console.error('Error chatting with Gemini:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get response from AI.' });
  }
});

// --- SEARCH IMAGE ROUTE (Optional - Google Search Images API) ---

app.post('/searchImage', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Missing search query.' });
    }

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    const response = await axios.get(
      `https://www.googleapis.com/customsearch/v1`,
      {
        params: {
          key: apiKey,
          cx: searchEngineId,
          searchType: 'image',
          q: query,
          num: 1,
          safe: 'active',
        },
      }
    );

    const items = response.data.items;

    if (!items || items.length === 0) {
      return res.status(404).json({ error: 'No images found.' });
    }

    const imageUrl = items[0].link;
    res.json({ imageUrl });

  } catch (error) {
    console.error('Error searching image:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to search image.' });
  }
});

// --- START SERVER ---

app.listen(PORT, () => {
  console.log(`M∆THM∆TIΧ AI Server Running on port ${PORT} 🚀`);
});

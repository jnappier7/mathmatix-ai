// server.js

import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

// Serve static frontend files from /public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// Base URL for Gemini v1 API
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-002:generateContent";

// M∆THM∆TIΧ AI FINAL SYSTEM INSTRUCTIONS
const defaultSystemInstructions = `
You are M∆THM∆TIΧ AI — a chill, real math coach. 
You text with students like a big brother, mentor, or teammate — not a formal teacher, not a robot.

You explain, encourage, and challenge without sounding fake. 
You unlock math through patterns, confidence, and connection.

You believe:
- Math is about patterns. 
- Once you see the patterns, math becomes easy.
- Math is inside you — it's the language God used to create the universe.
- You're not learning something new — you're unlocking something already inside you.

TONE & ENERGY
- Short, chill, text-style replies. (1–3 sentences max.)
- Celebrate real effort, not fake hype.
- Phrases to use naturally: "Good catch.", "You're cooking.", "Boom. Let’s run it.", "Level unlocked."

FLOW CONTROL
- Break every math problem into small steps.
- After each step, check casually: "You good?" / "Make sense?" / "Want another example?"

EXPLANATION STYLE
- Chunk steps naturally.
- Drop Jason's "Easy Button Tips" when appropriate ("Box in the variable.", "Side by side you gotta divide.")
- Always connect new math to old skills before introducing new terms.
- Remind: "It's the same patterns, just dressed different."

MATH FORMAT
- Use LaTeX for clean math formatting.
- Inline: \\( 3x + 4 = 13 \\)
- Block: \\[
x = \\frac{14-4}{3}
\\]

WHEN STUDENTS STRUGGLE
- No shame. Chill tone. Reframe: "Close — let's tweak that piece."

WHEN STUDENTS CRUSH IT
- Celebrate and move: "Boom. Clean move.", "Level unlocked. Stack it up."

REMEMBER
You're not just tutoring math — you're unlocking what's already inside them.
`;

app.post("/chat", async (req, res) => {
  try {
    const { systemInstructions = defaultSystemInstructions, chatHistory = [], message } = req.body;

    const parts = [
      { text: systemInstructions },
      ...chatHistory.map(m => ({ text: m.content })),
      { text: message }
    ];

    const payload = {
      contents: [
        {
          role: "user",
          parts: parts
        }
      ]
    };

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${process.env.GOOGLE_API_KEY}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const candidates = response.data.candidates;
    let aiResponse = "⚠️ No response from AI.";

    if (candidates && candidates.length > 0 &&
        candidates[0].content?.parts?.length > 0) {
      aiResponse = candidates[0].content.parts[0].text;
    }

    res.json({ response: aiResponse });

  } catch (error) {
    console.error("🔥 Full Error Object:");
    console.error(error);
    if (error.response) {
      console.error("🔥 Gemini Response Error Data:");
      console.error(error.response.data);
    } else {
      console.error("🔥 Standard Error Message:");
      console.error(error.message);
    }
    res.status(500).json({ error: "Failed to get response from AI." });
  }
});

// Health Check route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

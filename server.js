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

// M∆THM∆TIΧ AI — ULTIMATE SYSTEM INSTRUCTIONS
const defaultSystemInstructions = `
You are M∆THM∆TIΧ AI — a chill, real math coach. 
You text with students like a big brother, mentor, or teammate — relatable but professional.  
You explain, encourage, and challenge without sounding fake, corny, or immature.  
You unlock math through patterns, confidence, and connection.

You believe:
- Math is about patterns.
- Once you see the patterns, math becomes easy.
- Math is inside you — it's the language God used to create the universe.
- You're not learning something new — you're unlocking something already inside you.

TONE & PROFESSIONALISM
- Keep replies short, chill, and professional — like texting someone you're coaching. (1–3 sentences max.)
- Mild slang is okay ("Let's run it.", "You're cooking.") but stay clean, mature, and confident.
- No cursing. No over-the-top hype.

FLOW CONTROL
- Break every math problem into small steps.
- After each step, casually check: "You good?" / "Make sense?" / "Want another one?"
- Only move forward after student signals readiness.

TEACHING MODE
- If student names a topic but no problem:
  - Give a short explanation linking to old knowledge.
  - Give a tiny example.
  - Toss a starter problem after.

PROBLEM GENERATION
- If student asks for a problem, create one related to their topic.
- Example: "Try graphing \( y = x^2 - 4x + 3 \). You good?"

PARALLEL PROBLEM STRATEGY
- If student struggles, create a simpler, similar problem.
- Solve it first, then return to the original.

COMPONENT COMPOSITE ANALYSIS
- If a student misses a step:
  - Break the big move into components.
  - Find where the breakdown happened.
  - Focus coaching on that piece — without shame.

DYNAMIC REAL-TIME ASSESSMENT
- Always assess understanding and vibe based on student responses.
- If confused, slow down and simplify.
- If confident, move forward naturally.
- Avoid beating a dead horse — if mastery is shown, move on.
- Offer a casual mini-exit check if the vibe fits ("Wanna try one more before we wrap?") but NEVER force it.

EXPLANATION STYLE
- Drop Jason's "Easy Button Tips" naturally ("Side by side you gotta divide.", "Box in the variable — think outside the box.")
- Always connect new learning to old skills first.
- Always focus on pattern recognition first.
- Keep all teaching text short, positive, and clean.

MATH FORMAT
- Use LaTeX formatting for clean math:
  - Inline: \\( 3x + 4 = 13 \\)
  - Block: \\[
x = \\frac{14-4}{3}
\\]
- Always trigger MathJax to render after sending math.

REMEMBER
You're not just tutoring math — you're unlocking what’s already inside them.
Stay chill. Stay real. Stay professional.
`;

app.post("/chat", async (req, res) => {
  try {
    const { systemInstructions = defaultSystemInstructions, chatHistory = [], message } = req.body;

    const parts = [
      { text: systemInstructions },
      ...chatHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
      { role: "user", parts: [{ text: message }] }
    ];

    const payload = { contents: parts };

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${process.env.GOOGLE_API_KEY}`,
      payload,
      {
        headers: { "Content-Type": "application/json" }
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

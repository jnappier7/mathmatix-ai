require("dotenv").config({ path: __dirname + "/.env" });

if (!process.env.GOOGLE_API_KEY) {
  console.error("GOOGLE_API_KEY missing in .env — aborting.");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(cors());
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const systemInstructions = `
You are M∆THM∆TIΧ AI — an interactive, step-by-step math tutor built for students by a teacher who gets it.

🚫 HARD RULE: NEVER give direct answers.
You must always guide students to discover the answer themselves using:
- Clarifying questions
- Warm-up prompts
- Parallel problems
- Scaffolding, not shortcuts
- Easy Button Tips when appropriate

🎯 Your Mission:
- Help students realize math is about patterns.
- Break big problems into small wins.
- Encourage them to box the variable, then think outside the box.
- When terms are side by side? You gotta divide.

🧠 Warm-up Routine:
- Start each chat asking what they’re working on.
- Offer 2–3 background skills as a warm-up.
- Only start the main problem after they’re ready or ask to skip.

📊 1–2–3 Check-ins:
- After each chunk, ask:
  > “On a scale from 1 to 3 — where are you right now?”
  > 3 = “I got it”
  > 2 = “Can I get one more example?”
  > 1 = “What the heck are you talking about?”

💬 Tone & Engagement:
- Keep it real, upbeat, and human.
- Use phrases like:
  > “Boom! Let’s go.”
  > “Math now, memes later.”
  > “Want a hint or wanna level up?”
  > “Here’s an Easy Button Tip…”

🌌 Mindset Philosophy:
- Math is natural — it’s in everything.
- If they think they “hate” math, that’s not their fault.
- Most of the time, they just haven’t seen it the right way yet.
- Say things like:
  > “You can do this. Math’s already in your head — we’re just gonna unlock it.”
  > “It’s not about memorizing. It’s about seeing the pattern.”

📚 Channel the Classroom:
- Validate student thinking, not just correct answers.
- Celebrate struggle and growth.
- Use class lingo like:
  > “CLT” for Combine Like Terms
  > “Box in the variable”
  > “Side by side, you gotta divide”
  > “Mr. Nappier would love this move.”

🧮 Formatting:
- Use LaTeX for clarity: \\( x^2 + 5x + 6 \\)
- Keep math clean and readable
- Chunk explanations and always check in

Your job is not to finish the problem — it’s to help the student finish it themselves.
Let’s unlock understanding, one pattern at a time.
Let’s go.
`;

app.post("/chat", async (req, res) => {
  const { message, history } = req.body;
  const chatHistory = history || [];

  if (!message) return res.status(400).json({ error: "Message required." });

  try {
    const result = await model.generateContent([
      { role: "user", parts: [{ text: systemInstructions }] },
      ...chatHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
      { role: "user", parts: [{ text: message }] }
    ]);

    const aiResponse = result?.response?.text() || "⚠️ No response from AI.";
    res.json({ response: aiResponse });
  } catch (error) {
    console.error("AI request failed:", error);
    res.status(500).json({ error: "AI request failed." });
  }
});

const upload = multer({ storage: multer.memoryStorage() });
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  console.log("Received file:", req.file.originalname);
  res.json({ message: "File uploaded (not yet processed)." });
});

app.listen(port, () => {
  console.log(`MATHMATIX AI (Gemini) server running at http://localhost:${port}`);
});

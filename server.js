require("dotenv").config({ path: __dirname + "/.env" });

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY missing in .env — aborting.");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const { OpenAI } = require("openai");

const app = express();
const port = process.env.PORT || 3000;

// ✅ Force HTTPS on Render
app.use((req, res, next) => {
  if (req.headers["x-forwarded-proto"] !== "https") {
    return res.redirect("https://" + req.headers.host + req.url);
  }
  next();
});

app.use(express.static(__dirname));
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemInstructions = `
You are M∆THM∆TIΧ AI — an interactive, step-by-step math coach. You do NOT give direct answers. You guide students like a great teacher would: one piece at a time, using questions, hints, and encouragement.

Your style is responsive and adaptive:
- Break long explanations into small chunks.
- Ask “Does that make sense?” or “Want to try the next step?” after each chunk.
- Use the 1–2–3 understanding scale regularly.
- Validate student effort and thinking.

When students struggle:
- Try a parallel, simpler example first.
- Use relatable analogies (money, temperature, movement).
- Offer multiple ways in: visual, analogy, example, or pattern.

Tone:
- Positive, affirming, and real.
- Use phrases like:
  “Math now, memes later.”
  “Boom! You got it.”
  “Let’s level up.”

Formatting:
- Use LaTeX formatting with \`\\( \\)\` inline when helpful.
- No long paragraphs — chunk and check in often.

Goal:
- Help the student discover, not copy.
- Every message should end with a pause, a question, or a next step prompt.

Let’s go!
`;

app.post("/chat", async (req, res) => {
  const { message, history } = req.body;
  const chatHistory = history || [];

  if (!message) return res.status(400).json({ error: "Message required." });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemInstructions },
        ...chatHistory,
        { role: "user", content: message }
      ]
    });

    const aiText = response?.choices?.[0]?.message?.content?.trim() || "⚠️ No response from AI.";
    res.json({ response: aiText });
  } catch (err) {
    console.error("AI request failed:", err);
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
  console.log(`MATHMATIX AI server running on port ${port}`);
});

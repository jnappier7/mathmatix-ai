require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer();
const axios = require('axios');

// Routes
const signupRoutes = require('./routes/signup');
const loginRoutes = require('./routes/login');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(upload.array());
app.use(express.static('public'));
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/signup', signupRoutes);
app.use('/login', loginRoutes);

// Gemini AI Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// FULL OFFICIAL SYSTEM INSTRUCTIONS
const systemInstructions = `
M∆THM∆TIΧ AI — SYSTEM INSTRUCTIONS

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
- No long blocks of text! Break up information into digestible parts, and ask for feedback in between.
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
- Format all math using LaTeX with \\( ... \\) for inline expressions and \\[ ... \\] for block expressions.
- Use LaTeX: \\( x^2 \\), \\( \\frac{a}{b} \\) for clarity.
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
Remember:
Your job is not to finish the problem. It’s to help the student finish it themselves.
M∆THM∆TIΧ AI isn’t about shortcuts — it’s about unlocking understanding.

Let’s go.
`.trim();

// POST /chat endpoint with system instructions injected
app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: systemInstructions }] },
        { role: "user", parts: [{ text: userMessage }] }
      ],
      generationConfig: { response_mime_type: "application/json" },
    });

    const responseText = result.response.text();
    res.json({ response: responseText });

  } catch (error) {
    console.error('Error chatting with Gemini:', error.response?.data || error.message || error);
    res.status(500).json({ error: 'Something went wrong with Gemini.' });
  }
});

// POST /search for image results
app.post('/search', async (req, res) => {
  try {
    const query = req.body.query;
    const cx = process.env.GOOGLE_SEARCH_ID;
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&cx=${cx}&searchType=image&key=${apiKey}`;

    const response = await axios.get(url);
    const images = response.data.items.map(item => item.link);

    res.json({ images });
  } catch (error) {
    console.error('Error searching images:', error.response?.data || error.message || error);
    res.status(500).json({ error: 'Something went wrong with image search.' });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

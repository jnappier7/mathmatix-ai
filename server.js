require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const signupRoutes = require('./routes/signup');
const loginRoutes = require('./routes/login');
const uploadRoutes = require('./routes/upload');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/signup', signupRoutes);
app.use('/login', loginRoutes);
app.use('/api', uploadRoutes);  // handles /api/upload and /api/ask-ai

// Gemini Chat Route
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const systemInstructions = `
M∆THM∆TIΧ AI — SYSTEM INSTRUCTIONS

You are M∆THM∆TIΧ AI — a next-level, interactive, step-by-step math tutor. You are not a calculator, not a homework solver, and definitely not a robot that gives away answers. You are a coach, a guide, a hype-person, and a pattern unlocker. Your job is to make students feel smart and capable by helping them figure it out themselves.

Your vibe: encouraging, high-energy, a little swagger, never sarcastic or dry. You hype students up when they try. You're chill when they’re frustrated. You show excitement when they get things right. You’re the kind of tutor who helps them believe in themselves, not just get the answer.

Your method:
- Never give the answer right away.
- Ask what they already know or notice.
- Provide 1 hint at a time.
- Use boxed steps and numbered cues when needed.
- Use emojis and formatting to keep it fun and clear.
- Wrap final math expressions in \\( \\) for MathJax rendering.
- Break it down into parts — don’t overwhelm with too much at once.
- Celebrate progress. Keep it positive.

You're especially good at pattern recognition, graph interpretation, visual reasoning, and showing different methods (like box method, double distribution, area models, or using Desmos). If a student says "I don't get it" — start fresh and help them see the pattern.

Use phrases like:
- "Let’s box in the variable and think outside the box 📦"
- "Side by side? You gotta divide! ➗"
- "We keep it balanced like a see-saw"
- "Watch this pattern... 👀"
- "You’re actually so close 🔥"

If the student uploads an image or worksheet, read it carefully and help them break it down. If the math doesn’t make sense, ask them to clarify. If it’s not a math problem at all, kindly remind them what you're here for and pivot.

At your core, you believe:
- Math is about patterns.
- Math is the language in which God wrote the universe.
- Everyone can do math — they just need to believe in themselves.
- The answer isn’t the goal — the understanding is.

You’re not just a tutor. You’re M∆THM∆TIΧ.
`.trim();

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

// Google image search
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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

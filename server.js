require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const signupRoutes = require('./routes/signup');
const loginRoutes = require('./routes/login');
const uploadRoutes = require('./routes/upload');
const memoryRoutes = require('./routes/memory');
const User = require('./models/user');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use('/signup', signupRoutes);
app.use('/login', loginRoutes);
app.use('/api', uploadRoutes);
app.use('/memory', memoryRoutes);

// Gemini model setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const systemInstructions = \`
M∆THM∆TIΧ AI — SYSTEM INSTRUCTIONS

You are M∆THM∆TIΧ AI — a next-level, interactive, step-by-step math tutor... (unchanged content here)
\`.trim();

app.post('/chat', async (req, res) => {
  try {
    const { message, chatHistory, userId } = req.body;

    let personalized = '';
    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        personalized = \`
Student name: \${user.name}.
Grade: \${user.gradeLevel}.
Preferred tone: \${user.tonePreference || 'encouraging'}.
Learning style: \${user.learningStyle || 'visual'}.
Interests: \${user.interests?.join(', ') || 'n/a'}.
\${user.conversations?.length ? \`Last topic summary: \${user.conversations.slice(-1)[0].summary || ''}\` : ''}
        \`.trim();
      }
    }

    const contents = [
      { role: "user", parts: [{ text: \`\${personalized}\n\n\${systemInstructions}\` }] },
      ...(chatHistory || []).map(turn => ({
        role: turn.role,
        parts: [{ text: turn.content }]
      })),
      { role: "user", parts: [{ text: message }] }
    ];

    const result = await model.generateContent({ contents });
    let responseText = result.response.text();

    try {
      const parsed = JSON.parse(responseText);
      responseText = parsed.response || parsed.responseText || responseText;
    } catch (e) {}

    res.send(responseText);

  } catch (error) {
    console.error('Error chatting with Gemini:', error.response?.data || error.message || error);
    res.status(500).send("⚠️ Failed to generate response from AI.");
  }
});

app.post('/search', async (req, res) => {
  try {
    const query = req.body.query;
    const cx = process.env.GOOGLE_SEARCH_ID;
    const apiKey = process.env.GEMINI_API_KEY;
    const url = \`https://www.googleapis.com/customsearch/v1?q=\${encodeURIComponent(query)}&cx=\${cx}&searchType=image&key=\${apiKey}\`;

    const response = await axios.get(url);
    const images = response.data.items.map(item => item.link);
    res.json({ images });

  } catch (error) {
    console.error('Error searching images:', error.response?.data || error.message || error);
    res.status(500).json({ error: 'Something went wrong with image search.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(\`✅ Server running on port \${PORT}\`));

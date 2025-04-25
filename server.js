const express = require('express');
const path = require('path');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

app.post('/chat', async (req, res) => {
  const { message, history } = req.body;

  try {
    // Convert history and message into Gemini-compatible structure
    const contents = [
      ...(history || []).map((msg) => ({
        parts: [{ text: msg }],
      })),
      { parts: [{ text: message }] }
    ];

    const result = await model.generateContent({ contents });

    console.log("Gemini Result:", JSON.stringify(result, null, 2));

    let aiResponse = "⚠️ No response from AI.";

    if (
      result &&
      result.response &&
      result.response.candidates &&
      result.response.candidates.length > 0 &&
      result.response.candidates[0].content &&
      result.response.candidates[0].content.parts &&
      result.response.candidates[0].content.parts.length > 0
    ) {
      aiResponse = result.response.candidates[0].content.parts[0].text;
    }

    res.json({ response: aiResponse });
  } catch (error) {
    console.error("❌ Error from Gemini:", error);
    res.status(500).json({ error: "Gemini failed to respond." });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

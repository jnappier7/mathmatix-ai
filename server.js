// server.js — UPGRADED for M∆THM∆TIΧ AI (Gemini 2.0 Flash + Image Hybrid)

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
(paste System Instructions 2.2 here — full block above inside backticks)
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
        { role: "user", parts: [{ text: systemInstructions }] },
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

// --- SEARCH IMAGE ROUTE (Google Search Images API, separate from Gemini) ---

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

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

// /chat route for AI conversation
app.post("/chat", async (req, res) => {
  try {
    const { systemInstructions, chatHistory, message } = req.body;

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

// Health Check
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

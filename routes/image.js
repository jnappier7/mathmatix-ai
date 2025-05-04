// routes/image.js — OpenAI image generation route

const express = require("express");
const axios = require("axios");
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const dalleRes = await axios.post(
      "https://api.openai.com/v1/images/generations",
      {
        prompt,
        n: 1,
        size: "512x512",
        response_format: "url"
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const imageUrl = dalleRes.data.data[0]?.url;
    if (!imageUrl) return res.status(500).json({ error: "No image generated" });

    res.json({ imageUrl });
  } catch (err) {
    console.error("🛑 OpenAI Image Error:", err?.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate image" });
  }
});

module.exports = router;

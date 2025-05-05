// routes/image-search.js — Google Image Search via CSE

const express = require("express");
const axios = require("axios");
const router = express.Router();

const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const CSE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

router.get("/", async (req, res) => {
  const query = req.query.query;
  if (!query) return res.status(400).json({ error: "Missing query" });

  try {
    const googleRes = await axios.get(
      `https://www.googleapis.com/customsearch/v1`,
      {
        params: {
          key: GOOGLE_API_KEY,
          cx: CSE_ID,
          q: query,
          searchType: "image",
          num: 1,
          safe: "active"
        }
      }
    );

    const imageUrl = googleRes.data.items?.[0]?.link;
    if (!imageUrl) return res.status(404).json({ error: "No image found" });

    res.json({ imageUrl });
  } catch (err) {
    console.error("🛑 Google Image Search Error:", err?.response?.data || err.message);
    res.status(500).json({ error: "Image search failed" });
  }
});

module.exports = router;
// JavaScript Document
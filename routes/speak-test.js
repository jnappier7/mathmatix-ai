// routes/speak-test.js
const express = require("express");
const router = express.Router();
const axios = require("axios");

router.post("/", async (req, res) => {
  const { text, voiceId } = req.body;
  const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;

  if (!text || !voiceId) {
    return res.status(400).json({ error: "Missing text or voiceId" });
  }

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.9
        }
      },
      {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVEN_API_KEY
        }
      }
    );

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": response.data.length
    });

    res.send(response.data);
  } catch (err) {
    console.error("❌ ElevenLabs TTS error:", err?.response?.data || err.message);
    res.status(500).json({ error: "Voice synthesis failed." });
  }
});

module.exports = router;
// JavaScript Document
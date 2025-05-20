// routes/speak.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "2eFQnnNM32GDnZkCfkSm"; // Your selected voice

router.post("/", async (req, res) => {
  const { text } = req.body;

  if (!text) return res.status(400).send("Missing text to speak.");

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.7
        }
      },
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": response.data.length
    });
    res.send(response.data);
  } catch (err) {
    console.error("🔊 ElevenLabs TTS error:", err.message);
    res.status(500).send("Text-to-speech failed.");
  }
});

module.exports = router;

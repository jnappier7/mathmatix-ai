// routes/speak.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// REMOVED: const VOICE_ID = "2eFQnnNM32GDnZkCfkSm"; // This hardcoded VOICE_ID is removed

router.post("/", async (req, res) => {
  // Extract text and voiceId from the request body
  const { text, voiceId } = req.body;

  // Add a fallback/default if voiceId isn't provided or is invalid
  const voiceToUse = voiceId || "2eFQnnNM32GDnZkCfkSm"; // Fallback to a specific default voice ID

  if (!text) return res.status(400).send("Missing text to speak.");
  if (!ELEVENLABS_API_KEY) {
      console.error("ERROR: ElevenLabs API Key is not set.");
      return res.status(500).send("Text-to-speech service not configured.");
  }

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceToUse}`, // MODIFIED: Use the dynamic voiceToUse variable
      {
        text,
        model_id: "eleven_monolingual_v1", // Or another model if you prefer
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
    console.error("ERROR: ElevenLabs TTS error:", err.message);
    if (err.response) {
        console.error("ElevenLabs Response Data:", err.response.data.toString());
        console.error("ElevenLabs Response Status:", err.response.status);
    }
    res.status(500).send("Text-to-speech failed.");
  }
});

module.exports = router;
// routes/speak.js
const express = require("express");
const axios = require("axios");
const router = express.Router();
const { retryWithExponentialBackoff } = require("../utils/openaiClient"); // Import the utility

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

router.post("/", async (req, res) => {
  const { text, voiceId } = req.body;
  const voiceToUse = voiceId || "2eFQnnNM32GDnZkCfkSm"; // Fallback to a specific default voice ID

  if (!text) return res.status(400).send("Missing text to speak.");
  if (!ELEVENLABS_API_KEY) {
      console.error("ERROR: ElevenLabs API Key is not set.");
      return res.status(500).send("Text-to-speech service not configured.");
  }

  try {
    const elevenLabsResponse = await retryWithExponentialBackoff(async () => {
        const response = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceToUse}`,
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
        return response;
    });

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": elevenLabsResponse.data.length
    });
    res.send(elevenLabsResponse.data);
  } catch (err) {
    console.error("ERROR: ElevenLabs TTS error:", err.message);
    if (err.response) {
        console.error("ElevenLabs Response Data:", err.response.data.toString());
        console.error("ElevenLabs Response Status:", err.response.status);
    }
    // Specific message for 429 to inform user better
    if (err.message.includes('status code 429')) {
         res.status(503).send("Text-to-speech currently busy due to high traffic. Please try again in a moment.");
    } else {
         res.status(500).send("Text-to-speech failed.");
    }
  }
});

module.exports = router;
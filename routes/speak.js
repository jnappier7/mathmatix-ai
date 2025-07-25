// routes/speak.js
// MODIFIED: Updated to support streaming audio from ElevenLabs for a responsive hands-free experience.

const express = require("express");
const axios = require("axios");
const router = express.Router();
const { retryWithExponentialBackoff } = require("../utils/openaiClient");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

router.post("/", async (req, res) => {
  const { text, voiceId } = req.body;
  const voiceToUse = voiceId || "2eFQnnNM32GDnZkCfkSm"; // Fallback voice

  if (!text) return res.status(400).send("Missing text to speak.");
  if (!ELEVENLABS_API_KEY) {
      console.error("ERROR: ElevenLabs API Key is not set.");
      return res.status(500).send("Text-to-speech service not configured.");
  }

  try {
    const elevenLabsResponse = await retryWithExponentialBackoff(async () => {
        // The endpoint for streaming is slightly different.
        const response = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceToUse}/stream`,
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
              "Content-Type": "application/json",
              "Accept": "audio/mpeg" // Important for streaming
            },
            // CRITICAL: Set responseType to 'stream' for axios to handle the binary stream
            responseType: "stream"
          }
        );
        return response;
    });

    res.setHeader("Content-Type", "audio/mpeg");
    
    // Pipe the audio stream directly to the response
    elevenLabsResponse.data.pipe(res);

  } catch (err) {
    console.error("ERROR: ElevenLabs TTS streaming error:", err.message);
    if (err.response) {
        // Error handling for streams might not have a clean JSON body
        console.error("ElevenLabs Response Status:", err.response.status);
    }
    res.status(500).send("Text-to-speech failed.");
  }
});

module.exports = router;
// routes/speak.js
// TTS endpoint for message playback — Cartesia via ttsProvider.
// COMPLIANCE: Under-13 users get useWebSpeech flag for browser TTS fallback.

const express = require("express");
const router = express.Router();
const ttsProvider = require("../utils/ttsProvider");
const { cleanTextForTTS } = require("../utils/mathTTS");

router.post("/", async (req, res) => {
  const { text, voiceId } = req.body;

  if (!text) return res.status(400).send("Missing text to speak.");

  // COMPLIANCE: Third-party TTS services require users to be 13 or older.
  // Under-13 users must use browser-native WebSpeech API instead.
  if (req.user && req.user.dateOfBirth) {
      const age = (Date.now() - new Date(req.user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 13) {
          return res.status(403).json({
              error: 'Text-to-speech unavailable',
              message: 'This feature uses a third-party service that requires users to be 13 or older.',
              useWebSpeech: true  // Frontend flag: use browser SpeechSynthesis API
          });
      }
  }

  if (!ttsProvider.isConfigured()) {
      console.error(`ERROR: ${ttsProvider.getProviderName()} API key is not set.`);
      return res.status(500).send("Text-to-speech service not configured.");
  }

  // Resolve voice ID for the active provider
  const resolvedVoiceId = ttsProvider.resolveVoiceId(voiceId || "2eFQnnNM32GDnZkCfkSm");

  // Clean text for TTS (remove markdown and LaTeX)
  const cleanedText = cleanTextForTTS(text);

  try {
    const audioBuffer = await ttsProvider.generateAudio(cleanedText, resolvedVoiceId);
    res.setHeader("Content-Type", ttsProvider.getContentType());
    res.send(audioBuffer);

  } catch (err) {
    console.error(`ERROR: ${ttsProvider.getProviderName()} TTS error:`, err.message);
    if (err.response) {
        console.error("Response Status:", err.response.status);
    }
    res.status(500).send("Text-to-speech failed.");
  }
});

// cleanTextForTTS and convertLatexToSpeech are now in utils/mathTTS.js

module.exports = router;
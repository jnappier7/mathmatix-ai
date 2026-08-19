// routes/speak.js
// TTS endpoint for message playback — Cartesia via ttsProvider.
// COMPLIANCE: Under-13 users get useWebSpeech flag for browser TTS fallback.

const express = require("express");
const router = express.Router();
const ttsProvider = require("../utils/ttsProvider");
const { cleanTextForTTS } = require("../utils/mathTTS");
const { resolveLangCode } = require("../utils/languageCodes");
const { meterAiSeconds } = require("../utils/aiTimeMeter");

// Cartesia returns WAV / pcm_s16le @ 44.1kHz (utils/ttsProvider.js), so the
// synthesized duration is exact: (bytes - 44-byte header) / (rate * 2 bytes).
const TTS_SAMPLE_RATE = 44100;
const WAV_HEADER_BYTES = 44;

function wavSeconds(buffer) {
    if (!buffer || buffer.length <= WAV_HEADER_BYTES) return 0;
    return (buffer.length - WAV_HEADER_BYTES) / (TTS_SAMPLE_RATE * 2);
}

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
  const resolvedVoiceId = ttsProvider.resolveVoiceId(voiceId);

  // Synthesize in the student's preferred language so non-English text (e.g.
  // German) isn't read with English phonetics. Defaults to 'en'.
  const language = resolveLangCode(req.user && req.user.preferredLanguage);

  // Clean text for TTS (remove markdown and LaTeX)
  const cleanedText = cleanTextForTTS(text);

  try {
    const audioBuffer = await ttsProvider.generateAudio(cleanedText, resolvedVoiceId, language);
    res.setHeader("Content-Type", ttsProvider.getContentType());
    res.send(audioBuffer);

    // Meter the synthesized audio against the AI-second pool. Read-aloud spends
    // real Cartesia minutes and used to be the one AI surface that spent them
    // completely unmetered — free-tier included. Charged after the response so a
    // metering hiccup can never cost the student their audio.
    if (req.user) {
      meterAiSeconds(req.user, wavSeconds(audioBuffer))
        .catch(err => console.warn("[Speak] usage metering failed:", err.message));
    }

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
// routes/speak.js
// TTS endpoint for message playback — supports ElevenLabs and Cartesia via ttsProvider.
// COMPLIANCE: Under-13 users get useWebSpeech flag for browser TTS fallback.

const express = require("express");
const router = express.Router();
const ttsProvider = require("../utils/ttsProvider");

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

  // Resolve voice ID for the active provider (maps ElevenLabs → Cartesia when needed)
  const resolvedVoiceId = ttsProvider.resolveVoiceId(voiceId || "2eFQnnNM32GDnZkCfkSm");

  // Clean text for TTS (remove markdown and LaTeX)
  const cleanedText = cleanTextForTTS(text);

  try {
    if (ttsProvider.getProvider() === 'elevenlabs') {
        // ElevenLabs: stream audio for lower TTFB
        const streamResponse = await ttsProvider.generateAudioStream(cleanedText, resolvedVoiceId);
        res.setHeader("Content-Type", ttsProvider.getContentType());
        streamResponse.data.pipe(res);
    } else {
        // Cartesia (and future providers): send buffered audio
        const audioBuffer = await ttsProvider.generateAudio(cleanedText, resolvedVoiceId);
        res.setHeader("Content-Type", ttsProvider.getContentType());
        res.send(audioBuffer);
    }

  } catch (err) {
    console.error(`ERROR: ${ttsProvider.getProviderName()} TTS error:`, err.message);
    if (err.response) {
        console.error("Response Status:", err.response.status);
    }
    res.status(500).send("Text-to-speech failed.");
  }
});

/**
 * Clean text for Text-to-Speech
 * Removes markdown formatting and converts LaTeX to readable math
 */
function cleanTextForTTS(text) {
    let cleaned = text;

    // Remove markdown headers (### Title → Title)
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

    // Remove markdown bold/italic (**text** → text, *text* → text, __text__ → text)
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1');

    // Remove markdown links ([text](url) → text)
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove inline code (`code` → code)
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // Remove code blocks (```...``` → ...)
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');

    // Remove horizontal rules (--- or ***)
    cleaned = cleaned.replace(/^[-*]{3,}$/gm, '');

    // Convert LaTeX expressions to readable math
    // Display math: \[ ... \] or $$ ... $$
    cleaned = cleaned.replace(/\\\[([^\]]+)\\\]/g, (match, latex) => convertLatexToSpeech(latex));
    cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, (match, latex) => convertLatexToSpeech(latex));

    // Inline math: \( ... \) or $ ... $
    cleaned = cleaned.replace(/\\\(([^)]+)\\\)/g, (match, latex) => convertLatexToSpeech(latex));
    cleaned = cleaned.replace(/\$([^$]+)\$/g, (match, latex) => convertLatexToSpeech(latex));

    // Remove any remaining backslashes (LaTeX commands)
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

/**
 * Convert LaTeX math notation to natural speech
 */
function convertLatexToSpeech(latex) {
    let speech = latex;

    // Fractions: \frac{a}{b} → "a over b"
    speech = speech.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2');

    // Superscripts: x^2 → "x squared", x^3 → "x cubed", x^n → "x to the nth"
    speech = speech.replace(/\^2\b/g, ' squared');
    speech = speech.replace(/\^3\b/g, ' cubed');
    speech = speech.replace(/\^(\d+)/g, ' to the $1th power');
    speech = speech.replace(/\^\{([^}]+)\}/g, ' to the $1 power');
    speech = speech.replace(/\^([a-zA-Z])/g, ' to the $1');

    // Subscripts: x_1 → "x sub 1"
    speech = speech.replace(/_\{([^}]+)\}/g, ' sub $1');
    speech = speech.replace(/_([a-zA-Z0-9])/g, ' sub $1');

    // Square root: \sqrt{x} → "square root of x"
    speech = speech.replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1');

    // Greek letters
    speech = speech.replace(/\\alpha/g, 'alpha');
    speech = speech.replace(/\\beta/g, 'beta');
    speech = speech.replace(/\\gamma/g, 'gamma');
    speech = speech.replace(/\\delta/g, 'delta');
    speech = speech.replace(/\\theta/g, 'theta');
    speech = speech.replace(/\\pi/g, 'pi');
    speech = speech.replace(/\\sigma/g, 'sigma');

    // Mathematical operators
    speech = speech.replace(/\\times/g, ' times ');
    speech = speech.replace(/\\div/g, ' divided by ');
    speech = speech.replace(/\\pm/g, ' plus or minus ');
    speech = speech.replace(/\\cdot/g, ' times ');
    speech = speech.replace(/\\leq/g, ' less than or equal to ');
    speech = speech.replace(/\\geq/g, ' greater than or equal to ');
    speech = speech.replace(/\\neq/g, ' not equal to ');
    speech = speech.replace(/\\approx/g, ' approximately ');

    // Remove curly braces
    speech = speech.replace(/[{}]/g, '');

    // Remove remaining backslashes
    speech = speech.replace(/\\/g, '');

    return speech;
}

module.exports = router;
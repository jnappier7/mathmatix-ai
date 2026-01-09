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

  // Clean text for TTS (remove markdown and LaTeX)
  const cleanedText = cleanTextForTTS(text);

  try {
    const elevenLabsResponse = await retryWithExponentialBackoff(async () => {
        // The endpoint for streaming is slightly different.
        const response = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceToUse}/stream`,
          {
            text: cleanedText,
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
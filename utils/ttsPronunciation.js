// utils/ttsPronunciation.js
// Words the TTS engine gets wrong, respelled right before text leaves for
// Cartesia. Applied at the provider boundary (ttsStream + ttsProvider), so
// every spoken surface — voice tutor, chat read-aloud, legacy voice — says
// them the same way, whatever upstream cleaning it did or didn't run.
//
// The brand first: written "MATHMATIX" (all caps in most copy), the engine
// either spells it out letter by letter or guesses "math-MAY-tix". The owner
// says it "math-MAT-ix" (2026-10-13). A respelling is the only lever that
// works on every Cartesia call path, and it can be tuned by ear without a code
// change via TTS_BRAND_SPOKEN. "math-MAT-icks" was picked by ear from Ms. Maria
// samples; the caps steer the stress and are not spelled out.

'use strict';

const BRAND_SPOKEN = process.env.TTS_BRAND_SPOKEN || 'math-MAT-icks';

// "Mathmatix", "MATHMATIX", "MathMatix", optionally followed by ".ai". The
// lookarounds keep it whole-word without \b, which would also split on the
// "." of ".ai".
const BRAND_RE = /(?<![A-Za-z])math\s?matix(\.ai)?(?![A-Za-z])/gi;

/**
 * @param {string} text
 * @returns {string}
 */
function applyPronunciations(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(BRAND_RE, (_, dotAi) => (dotAi ? `${BRAND_SPOKEN} dot A.I.` : BRAND_SPOKEN));
}

module.exports = { applyPronunciations, BRAND_SPOKEN };

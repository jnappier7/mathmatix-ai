// utils/languageCodes.js
// Canonical map from a user's `preferredLanguage` (see models/user.js enum)
// to the ISO code that the STT/TTS providers (Deepgram, Cartesia, Whisper)
// expect. Kept in one place so the voice pipeline, /speak playback, and the
// board-synth path can't drift apart.

const LANGUAGE_TO_CODE = {
    English: 'en',
    Spanish: 'es',
    Russian: 'ru',
    Chinese: 'zh',
    Vietnamese: 'vi',
    Arabic: 'ar',
    Somali: 'so',
    French: 'fr',
    German: 'de',
};

const DEFAULT_LANG_CODE = 'en';

/**
 * Resolve a `preferredLanguage` value to a provider language code.
 * Falls back to English for unknown/missing values.
 * @param {string} [preferredLanguage] e.g. 'German'
 * @returns {string} e.g. 'de'
 */
function resolveLangCode(preferredLanguage) {
    return LANGUAGE_TO_CODE[preferredLanguage] || DEFAULT_LANG_CODE;
}

module.exports = { LANGUAGE_TO_CODE, DEFAULT_LANG_CODE, resolveLangCode };

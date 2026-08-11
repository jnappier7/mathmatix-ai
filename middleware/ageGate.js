/**
 * AGE GATE — third-party voice vendors require users to be 13 or older.
 *
 * Deepgram (speech-to-text) and Cartesia (text-to-speech) both carry terms that
 * prohibit use by children under 13, so we must not send a younger student's
 * audio — or text destined for their voice — to either one. Under-13 students
 * fall back to the browser-native WebSpeech API, which keeps the data on device.
 *
 * This is a SEPARATE control from consent. `requireOwnConsent` asks whether we
 * are allowed to process this student's data at all; this asks whether a
 * specific vendor's terms permit this particular student. A student can hold
 * valid parental consent and still be barred from Cartesia by age, which is
 * exactly the case the voice endpoints were missing.
 *
 * Known limitation, deliberately preserved from the original implementation in
 * routes/voice.js: with no date of birth on file we cannot evaluate age, and we
 * allow the request. Onboarding now collects DOB (`needsDob` in
 * routes/onboarding.js), so this is narrowing over time, but it does mean the
 * gate is best-effort rather than absolute — public/privacy.html is worded to
 * match ("where a date of birth is on file").
 *
 * @module middleware/ageGate
 */

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * True when the user is known to be under 13.
 *
 * Returns false when there is no usable date of birth — "not known to be under
 * 13" rather than "known to be 13 or over". Callers that need a hard guarantee
 * must require a DOB separately.
 *
 * @param {Object|null} user - user document with an optional dateOfBirth
 * @returns {boolean}
 */
function isUnder13(user) {
    if (!user || !user.dateOfBirth) return false;
    const dob = new Date(user.dateOfBirth);
    if (Number.isNaN(dob.getTime())) return false; // unparseable — treat as unknown
    return (Date.now() - dob.getTime()) / MS_PER_YEAR < 13;
}

/**
 * The 403 body for a blocked voice request.
 *
 * `useWebSpeech` is the contract the chat client already keys on
 * (public/js/voice-controller.js) to switch to browser-native speech instead of
 * surfacing a raw error, so keep the field name if you change anything here.
 */
const VOICE_AGE_BLOCK = {
    error: 'Voice chat unavailable',
    message: 'Voice chat uses a third-party service that requires users to be 13 or older. Please use the text chat instead.',
    useWebSpeech: true
};

/**
 * Express gate for HTTP voice endpoints. 403s under-13 users with the payload
 * the client knows how to fall back on.
 */
function requireThirteenPlus(req, res, next) {
    if (isUnder13(req.user)) {
        return res.status(403).json({ ...VOICE_AGE_BLOCK });
    }
    return next();
}

module.exports = { isUnder13, requireThirteenPlus, VOICE_AGE_BLOCK };

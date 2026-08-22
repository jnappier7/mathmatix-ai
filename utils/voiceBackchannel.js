// utils/voiceBackchannel.js
// Classifies a student's speech-over-the-tutor as a BACKCHANNEL (keep
// talking) or a real INTERRUPT (stop dead).
//
// Why this exists: voiceSession used to kill the in-flight turn on any
// STT partial longer than two characters. That is not how a person
// listens. A student saying "mm-hm" or "yeah" while the tutor explains is
// signalling *keep going* — cutting the explanation off there loses the
// rest of the sentence, marks it [INTERRUPTED] in history, and leaves the
// student waiting on a reply to a word they never meant as a question.
//
// The asymmetry is deliberate and matches the room: a missed backchannel
// costs an explanation, a missed interrupt costs ~1 extra second of
// tutor speech (the student is still talking; their utterance-end starts
// the real turn anyway). So anything not confidently a backchannel is an
// interrupt.

// Pure acknowledgement tokens. These never carry a question or an
// instruction — they are the spoken equivalent of a nod.
const BACKCHANNEL_TOKENS = new Set([
    'mhm', 'mmhm', 'mmhmm', 'mhmm', 'hmm', 'mm', 'mmm',
    'uhhuh', 'uhuh', 'ahha', 'aha', 'ah', 'oh', 'ooh',
    'yeah', 'yea', 'yep', 'yup', 'yes', 'ya', 'yah',
    'ok', 'okay', 'k', 'kay',
    'right', 'sure', 'true', 'cool', 'nice', 'neat', 'sweet',
    'gotcha', 'got', 'it', 'i', 'see', 'understand',
    'makes', 'sense', 'that', 'makes',
    'alright', 'allright', 'fine', 'good', 'great', 'perfect',
    'uh', 'um', 'er', 'eh', 'hm',
]);

// Words that force INTERRUPT no matter how short the utterance is. A
// student who says "wait" or "no" is not nodding along — they need the
// tutor to stop *now*, and these are exactly the utterances short enough
// to otherwise look like a backchannel.
const HARD_INTERRUPT_TOKENS = new Set([
    'wait', 'stop', 'hold', 'hang', 'pause', 'no', 'nope', 'nah',
    'what', 'why', 'how', 'huh', 'sorry', 'repeat', 'again',
    'slower', 'slow', 'back', 'skip', 'help', 'confused', 'lost',
]);

// Beyond this many words it is a sentence, not a nod — classify as an
// interrupt without inspecting the tokens. "yeah okay that makes sense
// but why did you" is a question wearing a backchannel's clothes.
const MAX_BACKCHANNEL_WORDS = 4;

/**
 * Reduce a transcript to comparable word tokens: lowercased, stripped of
 * punctuation and of the hyphens/apostrophes Deepgram's smart_format adds
 * ("uh-huh" → "uhhuh", "I've" → "ive").
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(Boolean);
}

/**
 * Decide whether speech arriving over the tutor should stop it.
 *
 * @param {string} text - STT partial or final transcript
 * @returns {{ isBackchannel: boolean, reason: string }}
 *   isBackchannel true → the tutor should keep speaking.
 */
function classifyInterruption(text) {
    const tokens = tokenize(text);

    // Nothing intelligible yet. Deepgram emits partials from breath and
    // room noise; treating those as interrupts is what made the tutor
    // stop mid-word when nobody had said anything. Hold the turn.
    if (tokens.length === 0) {
        return { isBackchannel: true, reason: 'empty' };
    }

    // A hard-interrupt word anywhere in a short utterance wins outright,
    // so "no wait" and "okay but wait" both stop the tutor.
    for (const t of tokens) {
        if (HARD_INTERRUPT_TOKENS.has(t)) {
            return { isBackchannel: false, reason: `hard_interrupt:${t}` };
        }
    }

    if (tokens.length > MAX_BACKCHANNEL_WORDS) {
        return { isBackchannel: false, reason: 'utterance_too_long' };
    }

    // Every token has to be an acknowledgement. One content word ("yeah
    // but negative") makes the whole thing a real interruption.
    for (const t of tokens) {
        if (!BACKCHANNEL_TOKENS.has(t)) {
            return { isBackchannel: false, reason: `content_word:${t}` };
        }
    }

    return { isBackchannel: true, reason: 'acknowledgement' };
}

module.exports = {
    classifyInterruption,
    tokenize,
    BACKCHANNEL_TOKENS,
    HARD_INTERRUPT_TOKENS,
    MAX_BACKCHANNEL_WORDS,
};

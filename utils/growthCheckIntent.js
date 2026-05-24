// ============================================================
// growthCheckIntent.js — detect when a student is accepting a
// Growth Check offer in chat.
//
// The chat greeting (routes/chat.js) sometimes offers a Growth
// Check ("want to spend 5 minutes on a quick growth check?").
// Without an intercept the LLM accepts the request and invents
// its own 2-3 freeform questions in the chat bubble — which is
// not a growth check at all. The real Growth Check is a 5-8
// question IRT-calibrated assessment served by the FloatingScreener
// (POST /api/screener/start with isGrowthCheck=true). This
// detector lets routes/chat.js intercept the acceptance and
// launch the proper UI instead.
//
// The detector is intentionally conservative: only an explicit
// "growth check" mention in the student's message fires it. A
// plain "yes" to the greeting's both-options offer is ambiguous
// (could mean "yes, growth check" or "yes, let's jump in"), so
// we leave that to the LLM to disambiguate naturally.
// ============================================================

'use strict';

const GROWTH_CHECK_RE = /\b(growth[\s-]*check)\b/i;
const NEGATIVE_RE = /\b(no|not|don'?t|stop|cancel|later|skip|nope|nah)\b/i;
const QUESTION_RE = /^(what|when|why|how|where|who|is\s+|are\s+|can\s+|do\s+(i|you|we))\b/i;

/**
 * @param {string} message - The student's raw chat message
 * @returns {boolean} true when the student is asking to launch the
 *   structured Growth Check assessment
 */
function detectGrowthCheckAcceptance(message) {
    if (!message || typeof message !== 'string') return false;
    const trimmed = message.trim();
    if (!trimmed) return false;

    if (!GROWTH_CHECK_RE.test(trimmed)) return false;

    // "I don't want a growth check", "skip the growth check", etc.
    if (NEGATIVE_RE.test(trimmed)) return false;

    // "what is a growth check?", "how does a growth check work?" —
    // a question about the feature, not a request to launch it.
    if (QUESTION_RE.test(trimmed)) return false;

    return true;
}

module.exports = { detectGrowthCheckAcceptance };

/**
 * "Are they correct?" — a question about answers the student ALREADY gave.
 *
 * Owner session, 2026-11-03: five numbered answers, item 5 wrong (3/8 for a
 * slope of 8/3). The batch grader marked it wrong on that turn, but the reply
 * never said so; two turns later "no need. are they correct?" carried no math
 * of its own, so nothing graded it, verificationState came out not_applicable,
 * and the tutor answered "You nailed all of them!". The verdict-accuracy eval
 * found the same on every follow-up it tried (402/402).
 *
 * The fix is general: a check request with no new math re-grades the student's
 * last submission, through the same graders, in the conversation exactly as it
 * stood when they sent it. Whatever grader ruled then rules again, so the tutor
 * answers from a verdict instead of from its own impression. The re-graded
 * diagnosis is marked `recheck` so it informs the reply without being recorded
 * as a second attempt.
 *
 * @module pipeline/recheck
 */

const { isCheckWorkIntent } = require('../worksheetGuard');

// The phrasings isCheckWorkIntent misses: "are they correct", "are they all
// right", a bare "correct?" / "right?".
const MORE_CHECKS = /\bare\s+(?:they|them|both|all\s+of\s+them|my\s+answers?|those|these)\s+(?:all\s+)?(?:right|correct|ok|okay)\b|\b(?:did|do)\s+i\s+get\s+(?:it|that|them|those|these|any|all)\b|^\s*(?:(?:is|was)\s+(?:it|that)\s+)?(?:all\s+)?(?:right|correct)\s*\??\s*$|\bwhich\s+(?:ones?|did\s+i)\s+(?:are\s+|get\s+)?(?:wrong|right)\b/i;

const MATH_SIGNAL = /\d|=/;

/**
 * A request to check earlier answers, carrying no new math of its own.
 * @param {string} text
 */
function isRecheckRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t || t.length > 120 || MATH_SIGNAL.test(t)) return false;
  return isCheckWorkIntent(t) || MORE_CHECKS.test(t);
}

/**
 * Index (in `messages`) of the student's most recent mathematical submission,
 * looking back at most `maxUserTurns` student messages. Null when there is
 * none — then there is nothing to re-check and the turn proceeds as before.
 *
 * @param {Array<{role:string, content:string}>} messages conversation so far,
 *   NOT including the current message
 */
function findRecheckTarget(messages, maxUserTurns = 3) {
  if (!Array.isArray(messages)) return null;
  let seen = 0;
  for (let i = messages.length - 1; i >= 0 && seen < maxUserTurns; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    seen++;
    if (looksLikeSubmission(m.content)) return i;
  }
  // No math in reach: a word answer ("true", "DNE", a conceptual explanation)
  // still counts when it was the student's reply to a question the tutor asked.
  const lastUser = lastIndexOf(messages, 'user');
  if (lastUser !== null && !isRecheckRequest(messages[lastUser].content)) {
    const before = lastIndexOf(messages.slice(0, lastUser), 'assistant');
    if (before !== null && /\?/.test(String(messages[before].content || ''))) return lastUser;
  }
  return null;
}

function lastIndexOf(messages, role) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i] && messages[i].role === role) return i;
  return null;
}

// A submission, not a sentence that happens to hold a number: "you gave me 5
// questions and I answered them" sat between the answers and the check in the
// owner's session. Math has an "=", an operator beside a number, a numbered
// line, or is short ("10", "i got 52", "is it 3/8?").
function looksLikeSubmission(text) {
  if (typeof text !== 'string' || !/\d/.test(text)) return false;
  if (/[=<>≤≥]/.test(text)) return true;
  if (/\d\s*[+\-*/^×÷]\s*[\d(a-z]|[a-z)]\s*[+\-*/^×÷]\s*\d/i.test(text)) return true;
  if (/^\s*\d+[.)]\s*\S/m.test(text)) return true;
  return text.trim().split(/\s+/).length <= 4;
}

module.exports = { isRecheckRequest, findRecheckTarget, looksLikeSubmission };

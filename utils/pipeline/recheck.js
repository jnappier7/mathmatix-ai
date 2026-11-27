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

// "…is my answer right or not?" closing a message that otherwise only DESCRIBES
// earlier work. Owner session, 2026-11-25: "first term i differentiated x^2,
// second term i differentiated sin. is my answer right or not?" — the "x^2"
// tripped MATH_SIGNAL, nothing re-graded the derivative they were asking about,
// and the tutor answered a direct question with another question.
const ASKS_ABOUT_EARLIER_ANSWER = /\b(?:is|was)\s+(?:my\s+(?:answer|work|solution)|what\s+i\s+(?:said|got|put|wrote))\s+(?:right|correct|wrong)(?:\s+or\s+(?:not|wrong))?\s*\??\s*$/i;

// The rest of such a message is a NEW answer — "x = 5. is my answer right?" —
// when it states an equation, computes something, or is just a value. Then the
// message is graded as itself, not as a re-check. A power alone ("x^2") is a
// name for a term, not a computation.
function carriesNewAnswer(rest) {
  if (!/\d/.test(rest)) return false;
  if (/[=<>≤≥]/.test(rest)) return true;
  if (/[\w)]\s*[+\-*/×÷]\s*[\w(]/.test(rest)) return true;
  return rest.trim().split(/\s+/).length <= 4;
}

/**
 * A request to check earlier answers, carrying no new math of its own.
 * @param {string} text
 */
function isRecheckRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;
  const closing = t.length <= 240 ? t.match(ASKS_ABOUT_EARLIER_ANSWER) : null;
  if (closing && closing.index > 0 && !carriesNewAnswer(t.slice(0, closing.index))) return true;
  if (t.length > 120 || MATH_SIGNAL.test(t)) return false;
  return isCheckWorkIntent(t) || MORE_CHECKS.test(t);
}

/**
 * "…i said x = 7 or x = -2. is my answer right or not?" — a verdict request
 * that RESTATES the answer it is about. Not a re-check (there is nothing to
 * look back for: the claim is in the message), and not a bare question either.
 * Returns the message without its closing question, to be graded as the
 * submission it is; null for anything else. Live, 2026-11-26: this exact
 * message went to the conceptual judge, came back "unclear", and the tutor
 * answered "Start by expanding…".
 * @param {string} text
 * @returns {string|null}
 */
function restatedSubmission(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  if (t.length > 240) return null;
  const closing = t.match(ASKS_ABOUT_EARLIER_ANSWER);
  if (!closing || closing.index === 0) return null;
  const rest = t.slice(0, closing.index).trim();
  if (!carriesNewAnswer(rest)) return null;
  // One statement per line, without the reporting words: "…x^2 - 5x - 14 = 0.
  // i said x = 7 or x = -2." is a problem and an answer, which is how shown
  // work is read. A "." between digits is a decimal point, not a full stop.
  // As typed in the math field: "\\(x^{2}\\)" is x^2.
  return rest
    .replace(/\\[()[\]]/g, '').replace(/\^\{(-?\w+)\}/g, '^$1')
    .split(/(?<!\d)[.!?]+\s+|(?<=\d)[.!?]+\s+(?=[a-z])/i)
    .map((line) => line.trim().replace(/[.!?]+$/, '').replace(/^(?:and\s+|so\s+)?(?:i\s+(?:said|got|put|wrote|answered)|my\s+answer\s+(?:is|was))\s+(?:that\s+)?/i, '').trim())
    .filter(Boolean)
    .join('\n');
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
function looksLikeSubmission(raw) {
  if (typeof raw !== 'string' || !/\d/.test(raw)) return false;
  // As typed in the math field: "\(x^{2}\)" is x^2. With the delimiters and
  // braces in the way the operator test below missed a whole derivative, and
  // the re-check reached past it to an older, wrong answer.
  const text = raw.replace(/\\[()[\]]/g, '').replace(/[{}]/g, '');
  if (/[=<>≤≥]/.test(text)) return true;
  if (/\d\s*[+\-*/^×÷]\s*[\d(a-z]|[a-z)]\s*[+\-*/^×÷]\s*\d/i.test(text)) return true;
  if (/^\s*\d+[.)]\s*\S/m.test(text)) return true;
  return text.trim().split(/\s+/).length <= 4;
}

module.exports = { isRecheckRequest, restatedSubmission, findRecheckTarget, looksLikeSubmission };

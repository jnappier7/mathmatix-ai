/**
 * VERDICT REPAIR — a reversed judgment fixes the attempt it was wrong about.
 *
 * Course audit, 2026-10-18..23 (C04): a correct, fully-worked answer was
 * stamped `incorrect`; the student repeated the SAME answer and it was accepted.
 * The record then held both — the false miss AND a second, "comeback" attempt —
 * so accuracy read 30/32 → 31/33 instead of 31/31, the first-try slot stayed a
 * miss, and the solve paid the +11 retry XP instead of the +18 clean solve. The
 * tutor said "you were right"; the record kept saying otherwise.
 *
 * The signal used here is the answer, not the tutor's wording: the same value
 * cannot be wrong on one turn and right on the next. When this turn's correct
 * answer is equivalent to the answer an earlier attempt on the same problem was
 * marked wrong for, that earlier verdict was the error. Repairing means:
 *   - the EARLIEST such attempt becomes `correct` (it is the real solve),
 *   - later false misses on the same answer are withdrawn (problemResult null),
 *   - this turn adds no second attempt,
 *   - and if the earliest repaired attempt was the problem's first try, the
 *     first-try slot and the clean-solve XP are restored.
 * A genuinely different wrong answer in between is left exactly as it was.
 *
 * Pure: reads messages and state, returns a plan; persist applies it.
 *
 * @module pipeline/verdictRepair
 */

const { extractAnswer } = require('./observe');
const { verifyAnswer } = require('../mathSolver');

function sameAnswer(a, b) {
  if (a == null || b == null) return false;
  const norm = s => String(s).replace(/\s+/g, '').toLowerCase();
  if (norm(a) === norm(b)) return true;
  try {
    return verifyAnswer(String(a), String(b)).isCorrect === true;
  } catch (_) {
    return false;
  }
}

/**
 * Find the earlier attempts on THIS problem that were stamped incorrect for an
 * answer equivalent to the one now verified correct.
 *
 * @param {Array} messages - conversation.messages as persist sees them (the
 *   current student message is last; this turn's reply is not pushed yet)
 * @param {Object|null} priorProblemState - conversation.lastProblemState before this turn
 * @param {string} currentAnswer - the answer this turn verified correct
 * @returns {{ repaired: number[], withdrawn: number[], original: number|null,
 *   restoresFirstTry: boolean, missesRemoved: number } | null}
 *   Indices are assistant-message indices in `messages`. Null when nothing to repair.
 */
function planVerdictRepair(messages, priorProblemState, currentAnswer) {
  if (!Array.isArray(messages) || currentAnswer == null) return null;
  const attempts = priorProblemState?.attemptCount || 0;
  if (attempts < 1) return null;

  // The incorrect-stamped tutor turns of the problem in progress, newest first.
  // attemptCount is how many wrong attempts the open problem has had, so it
  // bounds the walk; a correct or skipped stamp is the previous problem.
  let end = messages.length - 1;
  if (messages[end]?.role === 'user') end--;
  const misses = [];
  for (let i = end; i >= 0 && misses.length < attempts; i--) {
    const m = messages[i];
    if (m?.role !== 'assistant' || !m.problemResult) continue;
    if (m.problemResult !== 'incorrect') break;
    let u = i - 1;
    while (u >= 0 && messages[u]?.role !== 'user') u--;
    const answer = u >= 0 ? extractAnswer(String(messages[u].content || ''))?.value : null;
    misses.push({ index: i, answer });
  }
  if (!misses.length) return null;

  const chronological = misses.reverse();
  const reversed = chronological.filter(m => sameAnswer(m.answer, currentAnswer));
  if (!reversed.length) return null;

  const original = reversed[0].index;
  return {
    original,
    repaired: [original],
    withdrawn: reversed.slice(1).map(m => m.index),
    // The first try on this problem is the earliest miss in the run — and only
    // if THAT one was the false miss does the student get the first try back.
    // The run is complete when it holds every counted wrong attempt.
    restoresFirstTry: chronological.length === attempts && chronological[0].index === original,
    missesRemoved: reversed.length,
  };
}

/**
 * Apply a repair plan to the conversation's stored record. Mutates in place.
 * Counter arithmetic, given k = plan.missesRemoved false misses already counted
 * as k attempts and 0 correct:
 *   problemsAttempted: -(k - 1)   (the original stays as the one attempt; this
 *                                   turn adds none)
 *   problemsCorrect:   +1         (the original, now correct)
 *   firstTryCorrect:   +1 when the original was the first try (its attempt
 *                                   slot was counted already)
 *
 * @param {Object} conversation
 * @param {Object} plan - from planVerdictRepair
 * @param {Date} [at]
 */
function applyVerdictRepair(conversation, plan, at = new Date()) {
  const msgs = conversation.messages;
  const stamp = (i, to) => {
    if (!msgs[i]) return;
    msgs[i].problemResult = to === 'correct' ? 'correct' : null;
    msgs[i].verdictRepair = { from: 'incorrect', to, at };
  };
  stamp(plan.original, 'correct');
  for (const i of plan.withdrawn) stamp(i, 'withdrawn');

  const k = plan.missesRemoved;
  conversation.problemsAttempted = Math.max(0, (conversation.problemsAttempted || 0) - (k - 1));
  conversation.problemsCorrect = Math.min(
    conversation.problemsAttempted,
    (conversation.problemsCorrect || 0) + 1
  );
  if (plan.restoresFirstTry) {
    conversation.firstTryCorrect = Math.min(
      conversation.firstTryAttempted || 0,
      (conversation.firstTryCorrect || 0) + 1
    );
  }
  conversation.markModified?.('messages');
}

/**
 * Undo the k false misses in a skill's accuracy pillar. Called AFTER this
 * turn's correct attempt was recorded (+1 correct, +1 total), so taking k off
 * the total leaves the skill with one correct attempt where it had k misses.
 * Never takes the total below the correct count.
 *
 * @param {Object} entry - a skillMastery entry
 * @param {number} k
 * @returns {boolean} whether the entry changed
 */
function repairSkillAccuracy(entry, k) {
  const acc = entry?.pillars?.accuracy;
  if (!acc || !(k > 0)) return false;
  const total = Math.max(acc.correct || 0, (acc.total || 0) - k);
  if (total === acc.total) return false;
  acc.total = total;
  acc.percentage = total > 0 ? (acc.correct || 0) / total : 0;
  return true;
}

module.exports = { planVerdictRepair, applyVerdictRepair, repairSkillAccuracy, sameAnswer };

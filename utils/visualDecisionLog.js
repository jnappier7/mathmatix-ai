/**
 * Visual-decision corpus logging.
 *
 * The Visual Gate (utils/visualGate.js) is pure — it returns a structured
 * `record` and does no IO. This module turns those records into VisualDecision
 * documents and persists them. Kept separate so the gate stays testable and the
 * pipeline stays readable.
 *
 * `buildDecisionDoc` is pure (unit-testable, no DB). `persistVisualDecisions`
 * is fully guarded: corpus logging must NEVER break a tutoring response, so a
 * write failure is swallowed (logged, not thrown).
 *
 * @module utils/visualDecisionLog
 */

const VisualDecision = require('../models/visualDecision');

/**
 * Shape a gate record + context into a VisualDecision document.
 * Pure — no IO, no mutation of inputs.
 *
 * @param {object} params
 * @param {object} params.record - the gate's record (action, decision, ...)
 * @param {object} [params.activeProblem]
 * @param {object} [params.learningState]
 * @param {string} params.mode
 * @param {*} [params.userId]
 * @param {*} [params.conversationId]
 * @param {number} [params.turnIndex]
 * @returns {object} a plain doc ready for VisualDecision.insertMany
 */
function buildDecisionDoc({ record, activeProblem, learningState, mode, userId, conversationId, turnIndex }) {
  const ap = activeProblem || {};
  const ls = learningState || {};
  return {
    userId: userId || null,
    conversationId: conversationId || null,
    turnIndex: typeof turnIndex === 'number' ? turnIndex : null,
    mode,
    action: record.action,
    decision: record.decision,
    reasonCode: record.reasonCode || null,
    riskLevel: record.riskLevel || 'none',
    visualPurpose: record.visualPurpose || null,
    originalCommand: record.originalCommand || null,
    replacementCommand: record.replacementCommand || null,
    auditReason: record.auditReason || null,
    activeProblem: {
      problemText: ap.problemText || null,
      correctAnswer: ap.correctAnswer || null,
      problemType: ap.problemType || null,
      status: ap.status || null,
    },
    learningState: {
      concept: ls.concept || null,
      misconception: ls.misconception || null,
      masteryScore: typeof ls.masteryScore === 'number' ? ls.masteryScore : null,
    },
  };
}

/**
 * Persist a batch of decision docs. Never throws — a corpus-write failure is
 * logged and swallowed so it can't break a response. Unordered insert so one
 * bad doc doesn't drop the rest of the batch.
 *
 * @param {object[]} docs
 * @returns {Promise<number>} number of docs attempted (0 if none/failed early)
 */
async function persistVisualDecisions(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return 0;
  try {
    await VisualDecision.insertMany(docs, { ordered: false });
    return docs.length;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[visualDecisionLog] persist failed (non-fatal):', err && err.message);
    return 0;
  }
}

module.exports = { buildDecisionDoc, persistVisualDecisions };

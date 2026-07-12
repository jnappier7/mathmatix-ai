'use strict';
/* ============================================================
   moveNormalizer.js — turn a verified student move into the
   canonical STUDENT-STATED STEP string the existing tutoring
   pipeline already understands.

   Why a string: `observe` classifies from a plain string via regex
   (observe.js) — it has no gesture concept. To reuse the pipeline
   with ZERO changes, a gesture must arrive as the same kind of
   stated step a typed answer would (e.g. "2x + 3x = 5x"). The board
   synthesizer then mirrors it exactly as if the student had typed it,
   and the mirror rule is satisfied because the student really did
   state it (via their hands).

   NOTE (must validate on the live stack): the precise string form
   that best triggers ANSWER_ATTEMPT / step handling depends on the
   active problem context in observe/diagnose. This produces the
   canonical step; tuning the exact phrasing is a live-stack task.
   ============================================================ */

const { termToString } = require('../../utils/workspace/algebraTileVerifier');

/**
 * @param {object} studentMove  the validated inbound StudentMove
 * @param {object} verifiedMove the server's verdict (from studentMoveService)
 * @returns {{ statedStep:string, pipelineMessage:string, claimedResult:(object|null) }}
 */
function normalizeTileMove(studentMove, verifiedMove) {
  const operands = (studentMove.operation && Array.isArray(studentMove.operation.operands))
    ? studentMove.operation.operands : [];
  const lhs = operands.map(termToString).join(' + ').replace(/\+ -/g, '- ');

  // The result the student is CLAIMING by the gesture.
  let claimedResult = null;
  if (operands.length === 2) {
    // naive combine (sum the coefficients, keep the first variable) —
    // for a valid like-terms move this equals the truth; for the
    // unlike-terms misconception it reconstructs what the student asserted,
    // so the tutor can coach the exact wrong claim.
    claimedResult = {
      coefficient: operands[0].coefficient + operands[1].coefficient,
      variable: operands[0].variable,
    };
  }

  // Prefer the verified canonical result when the move is valid.
  const rhsTerm = (verifiedMove.mathematicallyValid && verifiedMove.resultingState
    && verifiedMove.resultingState.lastResult)
    ? verifiedMove.resultingState.lastResult
    : claimedResult;

  const rhs = rhsTerm ? termToString(rhsTerm) : '?';
  const statedStep = lhs ? `${lhs} = ${rhs}` : rhs;

  return { statedStep, pipelineMessage: statedStep, claimedResult };
}

module.exports = { normalizeTileMove };

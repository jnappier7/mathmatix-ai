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

   TWO distinct strings come out of here (validated live 2026-07-12,
   see docs/BOARD_STUDENT_MOVES_INTEGRATION.md):
     • statedStep     — the clean equation "2x + 3x = 5x". Human-facing:
                        the board mirror / display form.
     • pipelineMessage — what actually enters observe/diagnose. A BARE
                        equation reads to observe.js as a NEW problem drop
                        (→ GENERAL_MATH + isBareProblemDrop → the anti-leak
                        ELICIT_FIRST path re-poses it), NOT as the student's
                        own step. Framing it as a first-person completed
                        action ("I combined 2x + 3x to get 5x") makes
                        observe.extractAnswer capture the result term and
                        classify ANSWER_ATTEMPT — so the tutor REACTS to the
                        move instead of re-teaching it. This phrasing was
                        chosen by probing the real observe() (valid,
                        misconception, and negative-coefficient moves all
                        classify ANSWER_ATTEMPT with the full algebraic
                        answer preserved, bareDrop=false).
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

  // The string that enters the tutoring pipeline. First-person "I combined
  // … to get X" so observe classifies ANSWER_ATTEMPT (see header). Fall back
  // to the bare result when there's no LHS to combine (still ANSWER_ATTEMPT),
  // and to the equation when we couldn't derive a result term at all.
  let pipelineMessage;
  if (rhsTerm && lhs) {
    pipelineMessage = `I combined ${lhs} to get ${rhs}`;
  } else if (rhsTerm) {
    pipelineMessage = rhs;
  } else {
    pipelineMessage = statedStep;
  }

  return { statedStep, pipelineMessage, claimedResult };
}

/**
 * Normalize a scaffold-blank fill into the pipeline's stated-step string.
 *
 * Same first-person framing rule as tiles (see header): the substituted
 * equation alone would read to observe as a NEW problem drop and route to
 * ELICIT_FIRST; "I filled in the blank … so it reads …" classifies as the
 * student's own ANSWER_ATTEMPT, which is what a blank fill is.
 */
function normalizeBlankMove(studentMove, verifiedMove) {
  // A malformed fill (bad charset, no such blank) never reaches the tutor —
  // the client snaps back on the invalid verdict; there is no claim to grade.
  if (verifiedMove && verifiedMove.interactionValid === false) return null;
  const p = (studentMove.operation && studentMove.operation.parameters) || {};
  const substituted = (verifiedMove.resultingState && verifiedMove.resultingState.tex) || null;
  const statedStep = substituted || `${p.value}`;
  // Phrasing probed against the REAL observe (like the tile phrasing was):
  // "For the blank … I got X" classifies ANSWER_ATTEMPT with X extracted as
  // the answer; appending the substituted equation flipped it to a bare
  // problem drop. The step itself reaches the tutor via the board ghost
  // (boardStateBlock), so the prose can stay clean.
  const pipelineMessage = `For the blank in that step on my board, I got ${p.value}`;
  return { statedStep, pipelineMessage, claimedResult: null };
}

module.exports = { normalizeTileMove, normalizeBlankMove };

/* ============================================================
   turnTypeAudit.js — pedagogical-consistency check between the
   model-declared turn_type and the structured board_commands.

   Why this exists
   ---------------
   OpenAI strict-mode JSON schema can guarantee that turn_type is
   present and one of a known enum, but it does NOT support array
   cardinality (no `minItems`). The interesting invariants are
   semantic, not structural:

   - turn_type === "problem_introduction"  ⇒  board MUST include a pose
   - turn_type === "verification"          ⇒  board SHOULD include verify
   - turn_type === "concept_reference"     ⇒  board SHOULD include image
   - turn_type ∈ {feedback, scaffold, redirect, small_talk}  ⇒  board
     SHOULD be empty

   Schema can't express SHOULD/MUST distinctions on board contents.
   This module does.

   Phase 3 policy: observe, don't act
   ----------------------------------
   The audit returns structured mismatches that the pipeline logs.
   It does NOT mutate board_commands itself — it is pure observation.
   Phase 5 acts on the one hard bug it detects ("problem_introduction
   with no pose"): the pipeline's Stage 5c.1 backfills a verbatim pose
   via the deterministic synthesizer when no pose survives the merge.
   Soft mismatches stay observe-only — a few sessions of real data are
   needed to know which patterns are bugs vs. legitimate tutor
   judgment.
   ============================================================ */

'use strict';

const { TURN_TYPES } = require('./boardResponseSchema');

const SEVERITY = {
  HARD: 'hard',   // schema-allowed but pedagogically wrong; the
                  // synthesizer backfills it (wired in pipeline
                  // Stage 5c.1, Phase 5).
  SOFT: 'soft',   // unusual combination; log for analysis but the
                  // tutor's judgment may be legitimate.
};

/**
 * Audit a structured response. Returns an array of mismatches.
 * Empty array = clean turn.
 *
 * Each mismatch is `{ severity, kind, message, turn_type, actions }`
 * where `actions` is the sequence of board actions emitted this
 * turn (for log context).
 *
 * @param {object} input
 * @param {string|null} input.turnType - From normalizeStructuredResponse.
 * @param {Array<{action:string}>} input.boardCommands - Normalized
 *   board commands (compact shape).
 * @returns {Array<object>}
 */
function auditTurn({ turnType, boardCommands }) {
  const out = [];
  if (!turnType || !TURN_TYPES.includes(turnType)) {
    // Schema enforcement should have caught this. If it didn't,
    // we have a deeper problem — surface it but don't try to
    // recover semantically.
    out.push({
      severity: SEVERITY.SOFT,
      kind: 'invalid_turn_type',
      message: `turn_type is missing or not in the enum (received: ${turnType === null ? 'null' : `"${turnType}"`})`,
      turn_type: turnType,
      actions: actionsOf(boardCommands),
    });
    return out;
  }

  const actions = actionsOf(boardCommands);
  const has = (a) => actions.includes(a);

  switch (turnType) {
    case 'problem_introduction':
      if (!has('pose')) {
        // The exact failure mode the geometry transcript showed.
        out.push({
          severity: SEVERITY.HARD,
          kind: 'problem_introduction_missing_pose',
          message: 'turn_type=problem_introduction must include a pose card; the board will sit empty without one',
          turn_type: turnType,
          actions,
        });
      }
      break;

    case 'verification':
      if (!has('verify')) {
        out.push({
          severity: SEVERITY.SOFT,
          kind: 'verification_missing_verify',
          message: 'turn_type=verification typically includes a verify card; consider whether the student\'s final answer should land',
          turn_type: turnType,
          actions,
        });
      }
      break;

    case 'concept_reference':
      if (!has('image') && !has('graph')) {
        out.push({
          severity: SEVERITY.SOFT,
          kind: 'concept_reference_missing_visual',
          message: 'turn_type=concept_reference usually pairs with an image or graph card',
          turn_type: turnType,
          actions,
        });
      }
      break;

    case 'feedback':
    case 'scaffold':
    case 'redirect':
    case 'small_talk':
      // These turn types should not advance the work. A pose / apply /
      // resolve / verify card here is suspicious. (image / graph as
      // a reference aid is fine.)
      // eslint-disable-next-line no-case-declarations
      const advancing = actions.filter((a) => ['pose', 'apply', 'resolve', 'verify'].includes(a));
      if (advancing.length > 0) {
        out.push({
          severity: SEVERITY.SOFT,
          kind: 'non_advancing_turn_with_board_action',
          message: `turn_type=${turnType} emitted board actions that advance the work (${advancing.join(', ')}); this may be a misclassified turn`,
          turn_type: turnType,
          actions,
        });
      }
      break;

    case 'step_acknowledgment':
      // step_acknowledgment supports any combination — the student
      // is mid-problem and the tutor is reacting. No fixed expectations.
      break;
  }

  return out;
}

function actionsOf(boardCommands) {
  if (!Array.isArray(boardCommands)) return [];
  return boardCommands.map((c) => c && c.action).filter(Boolean);
}

module.exports = {
  SEVERITY,
  auditTurn,
};

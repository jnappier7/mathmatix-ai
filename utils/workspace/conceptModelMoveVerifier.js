'use strict';
/* ============================================================
   conceptModelMoveVerifier.js — §6.9's judgment call, deterministically.

   "The system must distinguish between mathematically meaningful actions,
   interface navigation, random dragging, guessing, valid exploration."

   A concept-model move is ALWAYS mode:'exploration' — it carries no
   correctness claim (mathematicallyValid stays null) and never reaches the
   tutoring pipeline (the anti-leak gate stays structurally closed). What the
   server decides is whether the manipulation MEANT something:

     meaningful_exploration — the param settled at a genuinely different
       value (≥2% of its range when known, an epsilon otherwise) after a
       real gesture (not a sub-150ms twitch).
     noise — scrubbing that ended where it started, or twitch-length taps.

   Only meaningful_exploration may produce evidence downstream — and even
   then it feeds the TRANSFER pillar (representation exposure), never
   accuracy. No LLM anywhere in this file.
   ============================================================ */

const MIN_GESTURE_MS = 150;      // faster than this is a twitch, not a manipulation
const RELATIVE_EPSILON = 0.02;   // 2% of the param's range counts as "moved"
const ABSOLUTE_EPSILON = 1e-9;   // fallback when no range is known

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} move - validated inbound StudentMove (elementType 'model')
 * @returns {{ interactionValid:boolean, mathematicallyValid:null,
 *             classification:string, canonicalMove:string|null,
 *             evidenceContext:string|null }}
 */
function verifyConceptModelMove(move) {
  const op = move.operation || {};
  const params = op.parameters || {};
  const modelName = typeof params.modelName === 'string' && params.modelName.trim()
    ? params.modelName.trim().slice(0, 80)
    : null;
  const param = typeof params.param === 'string' && params.param.trim()
    ? params.param.trim().slice(0, 40)
    : null;
  const from = num(params.from);
  const to = num(params.to);

  if (op.type !== 'set_param' || !modelName || !param || from === null || to === null) {
    return {
      interactionValid: false, mathematicallyValid: null,
      classification: 'invalid_interaction', canonicalMove: null, evidenceContext: null,
    };
  }

  // Movement threshold: relative to the declared range when the client sent
  // one, an absolute epsilon otherwise.
  const lo = num(params.min);
  const hi = num(params.max);
  const epsilon = (lo !== null && hi !== null && hi > lo)
    ? (hi - lo) * RELATIVE_EPSILON
    : ABSOLUTE_EPSILON;
  const moved = Math.abs(to - from) > epsilon;

  // Gesture duration: a settle report spanning less than a twitch is noise.
  // Missing/garbled timestamps never punish the student — assume real.
  let longEnough = true;
  const it = move.interaction || {};
  const started = Date.parse(it.startedAt);
  const completed = Date.parse(it.completedAt);
  if (Number.isFinite(started) && Number.isFinite(completed)) {
    longEnough = (completed - started) >= MIN_GESTURE_MS;
  }

  const meaningful = moved && longEnough;
  return {
    interactionValid: true,
    mathematicallyValid: null,   // exploration makes no claim, ever
    classification: meaningful ? 'meaningful_exploration' : 'noise',
    canonicalMove: `set ${param}: ${from} → ${to} on ${modelName}`,
    evidenceContext: meaningful ? `interactive:${modelName}` : null,
  };
}

module.exports = { verifyConceptModelMove, MIN_GESTURE_MS, RELATIVE_EPSILON };

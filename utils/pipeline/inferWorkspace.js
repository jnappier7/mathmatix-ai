/* ============================================================
   inferWorkspace.js — defensive server-side inference of WorkBoard
   events when the LLM forgets to emit them.

   Why this exists
   ---------------
   The tutor signals what should appear on the WorkBoard via two
   paths (see utils/pipeline/generate.js):
     Layer 1 — native OpenAI tool calls (board_pose / board_apply /
               board_resolve / board_verify / award_xp)
     Layer 2 — inline <BOARD …/> tag emitted in the streamed text
   Both are model-driven and therefore unreliable. Even with strong
   tool descriptions and few-shot prompts, models forget, typo, or
   skip the call.

   This module is Layer 3: an independent server-side inferer that
   looks at the student's last message + the tutor's response, and
   if BOTH signals fire it emits a board event the LLM didn't.

   The signals
   -----------
   The student's message must contain a high-confidence math shape:
     - An equation "LHS = RHS" with math on both sides
     - A solution form "x = <number>" (the most common verify
       precursor)
     - A named transformation ("subtract 4 from both sides",
       "divide both sides by 2", "add 5 to both sides", etc.)
   AND the tutor's response must affirm it without correction.

   The pedagogy rule (#1 product rule, restated)
   ---------------------------------------------
   This module only emits events for math the STUDENT stated. It
   never invents a step the student didn't say. The affirmation
   gate also prevents emitting events for math the tutor merely
   echoed back to question or correct.

   False-positive minimization (the design priority)
   -------------------------------------------------
   Better to under-emit than over-emit. A board updating with wrong
   info destroys trust. Every check has a "when in doubt, don't"
   default:
     - Vague affirmations ("hm", "okay", "interesting") do NOT count
     - Negation signals anywhere in the tutor response veto
     - Pre-existing LLM-emitted board events in this turn suppress
       inference entirely (Layer 1/2 already worked)
   ============================================================ */

'use strict';

// ---------------------------------------------------------------------------
// Student-message detectors
// ---------------------------------------------------------------------------

// "x = 8", "y = 2/3", "n = -4". A bare answer the student is
// declaring. Captures common variables a-z, single letter.
const RX_BARE_SOLUTION = /\b([a-z])\s*=\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\b/i;

// "2x + 4 = 20", "x^2 = 16", "3(n - 1) = 12". Both sides contain
// math; LHS isn't purely numeric (which would be a verification).
// Conservative: must contain at least one variable on LHS OR an
// explicit operator on either side, and must have ONE "=".
const RX_EQUATION = /([A-Za-z0-9+\-*/^().\s]{2,}?)=([A-Za-z0-9+\-*/^().\s]{2,}?)(?=[.?!]|$|\s{2,})/;

// "2(8) + 4 = 20", "5 + 3 = 8". Both sides numeric — student is
// verifying. Identical pattern but constrained to numeric LHS.
const RX_VERIFICATION = /(?:^|\s)((?:-?\d+(?:\.\d+)?[\s+\-*/().^]*)+)\s*=\s*((?:-?\d+(?:\.\d+)?[\s+\-*/().^]*)+)/;

// Named transformations. Conservative — must include "both sides"
// to anchor the operation, or be a clearly-scoped imperative.
const TRANSFORM_PHRASES = [
  /\b(?:subtract|add|divide|multiply)\s+(?:by\s+)?(\S+)\s+(?:from|to|on)?\s*both\s+sides\b/i,
  /\b(?:divide|multiply)\s+both\s+sides\s+by\s+(\S+)/i,
  /\b(?:subtract|add)\s+(\S+)\s+from\s+both\s+sides\b/i,
  /\bfactor\s+out\s+(.+?)(?:[.?!]|$)/i,
  /\bcombine\s+like\s+terms\b/i,
];

function detectStudentMath(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 600) return null;

  // 1. Solution declaration "x = 8"
  const solMatch = trimmed.match(RX_BARE_SOLUTION);
  if (solMatch) {
    // Reject if the student is asking ("is x = 8?"). Question marks
    // and interrogative starters mean we don't have a declaration.
    if (/[?]/.test(trimmed)) return null;
    if (/\b(?:is|does|should|could|would|can|will|why|how|what|maybe|i think|i guess)\b/i.test(trimmed)) return null;
    return {
      kind: 'solution',
      tex: `${solMatch[1]} = ${solMatch[2]}`,
    };
  }

  // 2. Verification: numeric on both sides of "="
  const verMatch = trimmed.match(RX_VERIFICATION);
  if (verMatch) {
    const lhs = verMatch[1].trim();
    const rhs = verMatch[2].trim();
    // Require operators/parens on LHS so we don't catch trivial "5 = 5"
    if (/[+\-*/()^]/.test(lhs)) {
      return {
        kind: 'verification',
        tex: `${lhs} = ${rhs}`,
      };
    }
  }

  // 3. Transformation phrase
  for (const rx of TRANSFORM_PHRASES) {
    const m = trimmed.match(rx);
    if (m) {
      return {
        kind: 'apply',
        op: m[0].toLowerCase(),
      };
    }
  }

  // 4. Equation with at least one letter on either side
  const eqMatch = trimmed.match(RX_EQUATION);
  if (eqMatch) {
    const lhs = eqMatch[1].trim();
    const rhs = eqMatch[2].trim();
    // Reject if the student is asking
    if (/[?]/.test(trimmed)) return null;
    // Require at least one variable somewhere
    if (!/[A-Za-z]/.test(lhs) && !/[A-Za-z]/.test(rhs)) return null;
    return {
      kind: 'equation',
      tex: `${lhs} = ${rhs}`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tutor-response detectors
// ---------------------------------------------------------------------------

// Strong, unambiguous affirmation phrases. We're deliberately
// conservative: "good" alone doesn't count (it might be "good
// question" or "good try but…"); "yes" + context does.
const STRONG_AFFIRM = [
  /\byes[,!.\s]/i,
  /\b(?:exactly|precisely|perfect|spot on|nailed it|you got it|you did it)\b/i,
  /\bthat['’]s\s+(?:right|correct|it|exactly right)\b/i,
  /\b(?:correct|right)\b[!,.\s]/i,
  /\b(?:nice|great|awesome|brilliant)\s+(?:work|job|move|catch|step|reasoning)\b/i,
  /\b(?:woohoo|woo|yay)\b/i,
  /\bclean\s+solution\b/i,
];

// Anything that signals "no, try again" — vetoes affirmation even
// if a positive word appears elsewhere ("good attempt, but…").
const NEGATION_SIGNALS = [
  /\bnot\s+(?:quite|exactly|right|correct|yet)\b/i,
  /\balmost\b/i,
  /\btry\s+(?:again|once more|that again)\b/i,
  /\b(?:actually|but)\b.*?\b(?:not|isn['’]t|wasn['’]t|wrong|incorrect)\b/i,
  /\blet\s+(?:me|us)\s+(?:show|explain|walk)\b/i,
  /\b(?:close|good attempt|good try)[,!.\s]/i,
  /\bhmm?[,.\s]/i,
  /\bremember\b.*?\b(?:that|the rule)\b/i,
  /\bwhat\s+if\b/i,
];

function detectAffirmation(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Veto first — any negation signal anywhere in the response
  // disqualifies inference even if affirmation language is also
  // present (tutors often say "good attempt, but not quite…").
  for (const rx of NEGATION_SIGNALS) {
    if (rx.test(trimmed)) return false;
  }

  for (const rx of STRONG_AFFIRM) {
    if (rx.test(trimmed)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main inference entry
// ---------------------------------------------------------------------------

/**
 * Infer board events the LLM forgot to emit.
 *
 * @param {string} studentMessage  the student's last user message text
 * @param {string} tutorResponse   the tutor's response (after layer 2
 *                                 tag stripping; visible chat text)
 * @param {object} existingEmissions  what the LLM already emitted
 *   { workspaceCount: number }  // number of workspace events emitted
 *                               // by layer 1 + layer 2 in this turn
 * @returns {Array<{tag: 'board', attrs: object}>}  events to emit
 *
 * Returns an empty array unless ALL gates pass:
 *   - existingEmissions.workspaceCount === 0  (Layer 1/2 missed)
 *   - student message contains a high-confidence math shape
 *   - tutor response affirms without any negation signal
 *
 * The return shape matches the inline-tag parser output so the
 * caller can route through the same `workspace` SSE event path.
 */
function inferBoardEvents(studentMessage, tutorResponse, existingEmissions) {
  const events = [];

  // Gate 1: only fire when the LLM-driven paths missed
  if (existingEmissions && existingEmissions.workspaceCount > 0) {
    return events;
  }

  // Gate 2: did the student state something math-shaped?
  const studentMath = detectStudentMath(studentMessage);
  if (!studentMath) return events;

  // Gate 3: did the tutor affirm without correction?
  if (!detectAffirmation(tutorResponse)) return events;

  // All gates pass — synthesize the appropriate event
  switch (studentMath.kind) {
    case 'solution':
      events.push({ tag: 'board', attrs: { action: 'resolve', tex: studentMath.tex } });
      break;
    case 'verification':
      // We don't have the solution tex in isolation here — the
      // student typically says "2(8) + 4 = 20" to verify x = 8.
      // The previous resolve card already carries x = 8. We emit a
      // verify on the solution if we can parse it from the student's
      // message (when it's a self-contained verify line). For now,
      // skip — Phase E or future B.5.1 can wire context-aware
      // verify inference using the prior conversation state.
      break;
    case 'apply':
      events.push({ tag: 'board', attrs: { action: 'apply', op: studentMath.op } });
      break;
    case 'equation':
      // Could be a new problem pose OR a re-statement of an
      // intermediate step. Without conversation context we can't
      // tell which. Emit as resolve (conservative: most common
      // case is the student announcing an intermediate result).
      events.push({ tag: 'board', attrs: { action: 'resolve', tex: studentMath.tex } });
      break;
  }

  return events;
}

module.exports = {
  inferBoardEvents,
  // Exported for tests
  _detectStudentMath: detectStudentMath,
  _detectAffirmation: detectAffirmation,
};

'use strict';
/**
 * VERIFICATION STATE — the tutor's licence to make a correctness claim.
 *
 * THE INVARIANT
 *   The tutor may assert that a student's work is right or wrong ONLY when the
 *   pipeline holds a matching verdict. No verdict, no assertion.
 *
 * WHY THIS MODULE EXISTS
 *   Verification used to be opt-in: `index.js` fired the LLM verifier only when
 *   observe's `extractAnswer` regex recognised the shape of an answer, and
 *   `diagnose` returned `no_answer` the moment it didn't. A student writing a
 *   perfectly correct step — "24-3+3" for 24-6÷2+3 — matched no pattern, so
 *   nothing verified anything, and the tutor invented a correctness claim from
 *   nothing and defended it for five turns.
 *
 *   Every previous fix widened a regex or added an override to `diagnose`. That
 *   loop never terminates, because the gate was the bug: a classifier deciding
 *   whether math gets checked, before any math is looked at.
 *
 *   So the gate is inverted here. Regexes CLASSIFY (they choose teaching
 *   actions); they never GATE (they never decide whether to verify). Any turn
 *   carrying mathematical content gets verified, and the result — including
 *   "we could not verify this" — is a first-class value that the generate stage
 *   must receive and the verify stage enforces against.
 *
 * WHAT THIS BUYS
 *   Not "the tutor is always mathematically right" — no LLM can promise that.
 *   The weaker, enforceable, and actually-sufficient guarantee: the tutor never
 *   states a correctness judgement the system has not checked. Uncertainty
 *   becomes a question to the student instead of a confident wrong answer.
 *
 * @module pipeline/verificationState
 */

// ── The four states ──
// Ordered by how much licence they grant the tutor.
const VERIFICATION_STATES = {
  /** Confirmed correct by solver, CAS, or the independent LLM verifier. */
  VERIFIED_CORRECT: 'verified_correct',
  /** Confirmed incorrect by one of the same sources. */
  VERIFIED_INCORRECT: 'verified_incorrect',
  /** Math was present, verification ran, no confident verdict came back.
   *  The tutor MUST NOT assert right or wrong. It asks instead. */
  UNVERIFIED: 'unverified',
  /** No mathematical claim in the turn (greeting, off-task, pure logistics).
   *  Nothing to verify; the assertion invariant still applies if the tutor
   *  somehow makes a correctness claim anyway. */
  NOT_APPLICABLE: 'not_applicable',
};

// Correctness claims the tutor might make about the student's work.
const ASSERTIONS = {
  CORRECT: 'asserts_correct',
  INCORRECT: 'asserts_incorrect',
  NONE: 'asserts_nothing',
};

/**
 * Does this turn carry mathematical content worth verifying?
 *
 * DELIBERATELY PERMISSIVE. This predicate replaced a gate that had to recognise
 * the shape of an answer; the whole point is that it no longer has to be right
 * about what the student meant. A false positive costs one cheap verifier call
 * that returns UNVERIFIED and changes nothing. A false negative is the bug this
 * module exists to kill. When in doubt, verify.
 *
 * @param {string} text
 * @returns {boolean}
 */
function hasMathematicalContent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;

  // Any digit at all. Yes, this fires on "I'm 12" — that costs a no-op verifier
  // call, which is the trade we want.
  if (/\d/.test(t)) return true;
  // LaTeX delimiters or macros.
  if (/\\\(|\\\[|\\frac|\\sqrt|\\div|\\times|\$/.test(t)) return true;
  // A bare operator between two things ("x + y", "a/b").
  if (/[a-z0-9)\]]\s*[+\-*/=^×÷]\s*[a-z0-9(\[]/i.test(t)) return true;
  // Spelled-out arithmetic.
  if (/\b(plus|minus|times|divided\s+by|multiplied\s+by|squared|cubed|equals?)\b/i.test(t)) return true;
  // Number words, which speech-to-text emits constantly.
  if (/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|hundred|thousand|half|third|quarter|negative)\b/i.test(t)) return true;

  return false;
}

/**
 * Map a diagnosis into the verification state the rest of the pipeline reasons about.
 *
 * The important case is the last one: math was present but nothing produced a
 * verdict. That used to surface as `no_answer` — indistinguishable from "the
 * student said hello" — and the generate stage treated both as licence to
 * freestyle. Now it is UNVERIFIED, which is a restriction, not an absence.
 *
 * @param {Object|null} diagnosis - output of the diagnose stage
 * @param {boolean} mathPresent - whether the turn carried mathematical content
 * @returns {string} one of VERIFICATION_STATES
 */
function deriveVerificationState(diagnosis, mathPresent) {
  if (diagnosis) {
    if (diagnosis.isCorrect === true) return VERIFICATION_STATES.VERIFIED_CORRECT;
    if (diagnosis.isCorrect === false) return VERIFICATION_STATES.VERIFIED_INCORRECT;
  }
  return mathPresent
    ? VERIFICATION_STATES.UNVERIFIED
    : VERIFICATION_STATES.NOT_APPLICABLE;
}

// ── Assertion detection ──
//
// A NOTE ON WHY THESE ARE ONLY A FAST PATH.
// The previous false-rejection guard in verify.js keyed on a fixed list of
// rejection OPENERS ("hmm", "not quite", "close but"). The production failure
// opened with "Whoa, hold up —", matched nothing, and sailed through. Any
// finite pattern list has that hole; phrasing is unbounded.
//
// So these patterns are a cheap pre-filter for unambiguous cases only, and the
// caller escalates everything else to an LLM classifier (see
// classifyAssertionLLM in verify.js). Patterns may produce false NEGATIVES here
// without breaking the invariant — the LLM pass is the backstop. They must not
// produce false POSITIVES, so each one is anchored and specific.

const ASSERTS_CORRECT = /^(that'?s\s+(?:right|correct|it)\b|correct\b|exactly\b|perfect\b|precisely\b|yes[,!.]?\s+(?:that'?s|you(?:'re|\s+are))\s+(?:right|correct)\b|you\s+(?:got|nailed)\s+it\b|nailed\s+it\b|bingo\b|spot\s+on\b)/i;

const ASSERTS_INCORRECT = /(\bnot\s+(?:quite|right|correct)\b|\bthat'?s\s+not\s+(?:it|right|correct)\b|\bincorrect\b|\bwrong\b|\bclose[,!.]\s*but\b|\bnice\s+try\b|\bgood\s+try\b|\byou\s+made\s+an?\s+(?:error|mistake)\b|\bthere'?s\s+an?\s+(?:error|mistake)\b|\bcheck\s+(?:that|your)\s+(?:again|work|arithmetic)\b)/i;

/**
 * Cheap syntactic guess at whether a tutor response asserts a correctness
 * judgement. Returns null when it cannot tell — the caller must then escalate
 * rather than assume ASSERTIONS.NONE. Treating "I don't know" as "no assertion"
 * is exactly how the old guard failed open.
 *
 * @param {string} text - the tutor's response
 * @returns {string|null} an ASSERTIONS value, or null meaning "escalate"
 */
function classifyAssertionFast(text) {
  if (!text || typeof text !== 'string') return ASSERTIONS.NONE;
  const t = text.trim();
  if (!t) return ASSERTIONS.NONE;

  const head = t.slice(0, 240);
  const saysCorrect = ASSERTS_CORRECT.test(head);
  const saysIncorrect = ASSERTS_INCORRECT.test(head);

  // Both or neither → ambiguous. Escalate; never guess NONE.
  if (saysCorrect && saysIncorrect) return null;
  if (saysCorrect) return ASSERTIONS.CORRECT;
  if (saysIncorrect) return ASSERTIONS.INCORRECT;
  return null;
}

/**
 * THE INVARIANT, as a pure function.
 *
 * @param {string} assertion - an ASSERTIONS value
 * @param {string} state - a VERIFICATION_STATES value
 * @returns {{ok: boolean, reason: string|null}}
 */
function checkInvariant(assertion, state) {
  if (assertion === ASSERTIONS.NONE) {
    return { ok: true, reason: null };
  }

  if (assertion === ASSERTIONS.CORRECT) {
    if (state === VERIFICATION_STATES.VERIFIED_CORRECT) return { ok: true, reason: null };
    return {
      ok: false,
      reason: state === VERIFICATION_STATES.VERIFIED_INCORRECT
        ? 'affirmed work the verifier found INCORRECT'
        : `affirmed work with no verdict (state=${state})`,
    };
  }

  if (assertion === ASSERTIONS.INCORRECT) {
    if (state === VERIFICATION_STATES.VERIFIED_INCORRECT) return { ok: true, reason: null };
    return {
      ok: false,
      reason: state === VERIFICATION_STATES.VERIFIED_CORRECT
        ? 'rejected work the verifier found CORRECT'
        : `rejected work with no verdict (state=${state})`,
    };
  }

  return { ok: true, reason: null };
}

module.exports = {
  VERIFICATION_STATES,
  ASSERTIONS,
  hasMathematicalContent,
  deriveVerificationState,
  classifyAssertionFast,
  checkInvariant,
  // exported for tests
  ASSERTS_CORRECT,
  ASSERTS_INCORRECT,
};

// Verify a student's MULTI-STEP solution as a chain of reasoning, not just a
// final answer. This is what lets the tutor "follow all of that reasoning":
//
//     3x - 5 = 16
//     3x = 21        ← +5 to both sides  (still solves to x = 7)
//     x = 7          ← ÷3                (the correct root)
//
// Principle: every line of a correct derivation is EQUIVALENT to the original —
// an equation keeps the same solution set at each step; an arithmetic expression
// keeps the same value. So a chain is valid iff every solvable line resolves to
// the SAME answer as the problem, ending on the solved value. A line that
// resolves to a different value is the first broken step — which we return so the
// tutor can point right at it instead of grading the whole thing wrong.
//
// Deterministic, built entirely on mathSolver (no LLM). Returns { verifiable }
// false when it can't parse enough to judge, so callers fall back to the existing
// single-answer path rather than inventing a verdict.

const { parseCleanProblem, verifyAnswer } = require('./mathSolver');

// Split shown work into candidate step lines. Handles one multi-line message or
// a joined transcript; strips bullets/numbering and keeps lines that carry math.
function splitWorkLines(workText) {
  if (!workText || typeof workText !== 'string') return [];
  return workText
    .split(/[\n\r]+/)
    .map((l) => l.replace(/^\s*(?:step\s*\d+\s*[:.)-]?|\d+\s*[.)]|[-*•])\s*/i, '').trim())
    .filter((l) => l.length > 0 && /[0-9x-z)]/i.test(l) && /[=+\-*/×÷]/.test(l));
}

// Resolve a single line to its canonical answer via the deterministic solver.
// null when the line isn't cleanly solvable (skip, don't fail).
function resolveLine(line) {
  const parsed = parseCleanProblem(line);
  if (!parsed.hasMath || !parsed.solution || parsed.solution.success !== true) return null;
  return String(parsed.solution.answer);
}

/**
 * @param {string} workText   the student's multi-line work
 * @param {string} [problemText] the posed problem; if omitted/unsolvable, the
 *                 first solvable line is used as the reference (internal consistency).
 * @param {string} [knownTarget] the posed problem's answer if the caller already
 *                 has it (e.g. diagnose's problemInfo.correctAnswer) — used as the
 *                 anchor so the chain is graded against the POSED problem, not just
 *                 its own internal consistency. Takes precedence over problemText.
 * @returns {{verifiable:boolean, valid?:boolean, finalAnswer?:string, target?:string,
 *           reachedAnswer?:boolean, firstBadStepIndex?:number, steps?:Array}}
 */
function verifyDerivation(workText, problemText, knownTarget) {
  const lines = splitWorkLines(workText);
  if (lines.length < 2) return { verifiable: false, reason: 'not enough steps' };

  // Reference answer: caller-supplied anchor first, else solve the posed problem,
  // else fall back to the chain's own first line (internal consistency only).
  let target = knownTarget != null ? String(knownTarget) : (problemText ? resolveLine(problemText) : null);

  const steps = lines.map((line) => ({ line, solved: resolveLine(line) }));
  const solvable = steps.filter((s) => s.solved !== null);
  if (solvable.length < 2) return { verifiable: false, reason: 'not enough solvable steps' };

  if (target == null) target = solvable[0].solved;

  let firstBadStepIndex = -1;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.solved === null) continue; // unparseable line — can't judge it, skip
    s.ok = verifyAnswer(s.solved, target).isCorrect === true;
    if (!s.ok && firstBadStepIndex === -1) firstBadStepIndex = i;
  }

  const finalAnswer = solvable[solvable.length - 1].solved;
  const reachedAnswer = verifyAnswer(finalAnswer, target).isCorrect === true;
  const valid = firstBadStepIndex === -1 && reachedAnswer;

  return {
    verifiable: true,
    valid,
    finalAnswer,
    target,
    reachedAnswer,
    firstBadStepIndex,           // -1 when every step is valid
    firstBadStep: firstBadStepIndex >= 0 ? steps[firstBadStepIndex].line : null,
    steps,
  };
}

module.exports = { verifyDerivation, splitWorkLines };

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

// Rescue a line that is literally wrong because the student wrote a product
// with the multiplication sign missing: cross-multiplying 5/7 = x/20 as
// "520=7x" (meaning 5·20 = 7x). Re-read each 2+ digit integer as a product of
// its two halves and re-solve; accept only an interpretation that solves to
// the chain's known target. Target-gated on purpose: this can only repair a
// line into agreement with an answer we already trust — it can never flip a
// genuinely wrong step to correct, because a wrong step's reinterpretations
// don't land on the target except by coincidence.
function rescueMissingOperator(line, target) {
  const rx = /(?<![\d.])\d{2,}(?![\d.])/g;
  let m;
  while ((m = rx.exec(line)) !== null) {
    const s = m[0];
    for (let i = 1; i < s.length; i++) {
      if (s[i] === '0' && s.length - i > 1) continue; // no leading-zero operand
      // Substitute the evaluated product rather than inserting "*": a line like
      // "5*20=7x" trips the solver's evaluation catch-all (it returns 100, the
      // left side's value), while "100=7x" solves as the equation it is.
      const product = Number(s.slice(0, i)) * Number(s.slice(i));
      const candidate = line.slice(0, m.index) + String(product) + line.slice(m.index + s.length);
      const solved = resolveLine(candidate);
      if (solved !== null && verifyAnswer(solved, target).isCorrect === true) {
        return { readAs: `${s.slice(0, i)}*${s.slice(i)}`, candidate, solved };
      }
    }
  }
  return null;
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

  // Reference answer: caller-supplied anchor first, else solve the posed problem.
  let target = knownTarget != null ? String(knownTarget) : (problemText ? resolveLine(problemText) : null);
  const targetSource = knownTarget != null ? 'known' : (target != null ? 'problem' : 'internal');

  const steps = lines.map((line) => ({ line, solved: resolveLine(line) }));
  const solvable = steps.filter((s) => s.solved !== null);
  if (solvable.length < 2) return { verifiable: false, reason: 'not enough solvable steps' };

  // No external anchor: the chain can only be checked for internal consistency,
  // and the reference must be the LAST solvable line — the student's answer.
  // Anchoring on the FIRST line graded the rest of a student's work against
  // their own opening shorthand: with an unparseable pin, "520=7x / 100=7x /
  // 100/7 = x" anchored on 520=7x and marked the two CORRECT lines bad.
  if (target == null) target = solvable[solvable.length - 1].solved;

  let firstBadStepIndex = -1;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.solved === null) continue; // unparseable line — can't judge it, skip
    s.ok = verifyAnswer(s.solved, target).isCorrect === true;
    if (!s.ok) {
      const rescue = rescueMissingOperator(s.line, target);
      if (rescue) {
        s.ok = true;
        s.solved = rescue.solved;
        s.rescuedAs = rescue.readAs; // e.g. "520" read as "5*20"
      }
    }
    if (!s.ok && firstBadStepIndex === -1) firstBadStepIndex = i;
  }

  const finalAnswer = solvable[solvable.length - 1].solved;
  const reachedAnswer = verifyAnswer(finalAnswer, target).isCorrect === true;
  // `valid` is the whole chain checking out — the demonstrated-reasoning signal.
  const valid = firstBadStepIndex === -1 && reachedAnswer;
  // `answerCorrect` is what grading must use: the final line IS the student's
  // answer; earlier lines are shown work. A broken earlier line demotes
  // demonstrated reasoning but must never flip a correct final answer to
  // incorrect (that false negative arms wrong-answer support on a solve).
  // With no external anchor there is no answer to be right ABOUT, so internal
  // chains grade on consistency alone.
  const answerCorrect = targetSource === 'internal' ? valid : reachedAnswer;

  return {
    verifiable: true,
    valid,
    answerCorrect,
    targetSource,                // 'known' | 'problem' | 'internal'
    finalAnswer,
    target,
    reachedAnswer,
    firstBadStepIndex,           // -1 when every step is valid
    firstBadStep: firstBadStepIndex >= 0 ? steps[firstBadStepIndex].line : null,
    steps,
  };
}

module.exports = { verifyDerivation, splitWorkLines };

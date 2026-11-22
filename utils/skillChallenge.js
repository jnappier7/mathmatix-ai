/**
 * CHALLENGE — the test-out path to rung 'proved'.
 *
 * "Think you've got this? Prove it." A fixed set of problems, no hints, one shot.
 * Passing advances the skill to 'proved' and cascades to everything beneath it;
 * failing costs nothing and hands back the gap. This is the answer to a student
 * who already owns a skill the screener never closed — the case that started this
 * whole arc, where a student was walked through absolute value they plainly knew.
 *
 * TRUST BOUNDARY. The client submits ANSWERS, never correctness. Grading happens
 * here, server-side, against Problem.answer via mathSolver.verifyAnswer. (Note:
 * the older recordPhaseAttempt path does accept a client-supplied `correct` flag;
 * this deliberately does not follow that pattern.)
 *
 * Pure and DB-free: problems in, verdict out, so it is fully unit-testable.
 */

const { verifyAnswer } = require('./mathSolver');
const { GATES } = require('./skillRung');
const { normalizeOptions, resolveChoice, resolveKey } = require('./mcOptions');
const { gradeMultipart } = require('./multipartAnswer');

// A challenge is a controlled, opt-in demonstration: fewer problems than ambient
// practice needs, because the conditions are strict (no hints, one shot).
const CHALLENGE_SIZE = 5;
const MIN_ACCURACY = GATES.PROVE_MIN_ACCURACY;   // 0.90 — 5/5 or a clean 9/10
const MIN_ITEMS = GATES.PROVE_MIN_ATTEMPTS;      // 4

/** Value-equality through the shared comparator, never throwing on odd input. */
function same(submitted, candidate) {
  try { return verifyAnswer(submitted, candidate).isCorrect; } catch { return false; }
}

/**
 * Grade one submitted answer against a problem.
 * Multiple-choice compares the chosen option; everything else goes through the
 * shared math comparator so equivalent forms ("1/2", "0.5", "−0.5" with a Unicode
 * minus) are graded on value rather than string shape.
 */
function gradeOne(problem, submitted) {
  if (submitted === undefined || submitted === null || String(submitted).trim() === '') {
    return { correct: false, reason: 'blank' };
  }

  // Multiple choice. The submission is a label ('C') or the option text; both
  // resolve to the same option, so a client that sends either grades the same.
  const options = normalizeOptions(problem.options);
  const chosen = options.length ? resolveChoice(problem.options, submitted) : null;

  if (options.length && !chosen) {
    // The student picked something that is not on the card. That is a broken
    // render, not a wrong answer — this is exactly how a bank whose options
    // carried no label submitted the literal string "undefined" and scored a
    // correct run 0 of 5. Excluded from the denominator rather than counted
    // against them.
    return { correct: false, reason: 'ungradable' };
  }

  // Which option is right is decided once, from the whole item (resolveKey):
  // the option that IS the answer, then the letter the item names. `correctOption`
  // alone used to be authoritative here, and on 72 live items it contradicts the
  // item's own answer — a right pick was marked wrong.
  const answer = problem.answer || {};
  if (chosen) {
    const key = resolveKey({
      options: problem.options, value: answer.value, equivalents: answer.equivalents,
      correctOption: problem.correctOption,
    }, same);
    if (key) {
      return { correct: chosen.label === key.label || key.also.includes(chosen.label), reason: null };
    }
  }

  const candidates = [answer.value, ...(answer.equivalents || [])].filter(
    (v) => v !== undefined && v !== null && String(v).length > 0
  );
  if (!candidates.length) {
    // No gradable answer on the item — do not guess. Report it so a bad item
    // cannot silently count against the student.
    return { correct: false, reason: 'ungradable' };
  }

  // An MC item with no `correctOption` — the whole convertToMC population —
  // keeps its key in `answer`, and which field it means varies by generator:
  // some wrote the option TEXT, some wrote the LETTER. Decide from the item
  // rather than trying both readings, because on an item whose options are
  // themselves letters ("which point is C?") accepting both would mark a wrong
  // pick correct.
  let attempt = submitted;
  if (chosen) {
    const keyIsLetter = !candidates.some((c) => options.some((o) => same(o.text, c)))
      && candidates.some((c) => options.some((o) => o.label === String(c).trim().toUpperCase()));
    attempt = keyIsLetter ? chosen.label : chosen.text;
  }
  if (candidates.some((c) => same(attempt, c))) return { correct: true, reason: null };

  // A key with lettered parts ("a) n + d = 30 …; b) 16 nickels and 14 dimes")
  // is graded part by part — as one string it failed every correct answer
  // (student audit, 2026-10-14). A part we cannot read is undecided, and an
  // undecided item is ungradable, not wrong.
  if (!chosen) {
    const verdicts = candidates.map((c) => gradeMultipart(c, attempt)).filter(Boolean);
    if (verdicts.some((v) => v.correct)) return { correct: true, reason: null };
    if (verdicts.length) {
      const decided = verdicts.find((v) => v.reason !== 'ungradable');
      return decided || { correct: false, reason: 'ungradable' };
    }
  }
  return { correct: false, reason: null };
}

/**
 * Grade a whole challenge run.
 *
 * @param {Array} problems    the problems that were served, in order
 * @param {Array} submissions [{ problemId, answer }]
 * @returns {{ items, correct, total, gradable, accuracy, passed, missedSkillIds }}
 */
function gradeChallenge(problems, submissions) {
  const byId = new Map(problems.map((p) => [String(p._id || p.problemId), p]));
  const items = [];
  // One answer per problem — the FIRST one. Without this, five copies of one
  // correct answer were five graded items: a 5-of-5 "pass" on a single problem
  // (QA, 2026-11-22). The first is kept so a later copy cannot overwrite a miss.
  const gradedIds = new Set();

  for (const sub of submissions || []) {
    if (!sub) continue;
    const problem = byId.get(String(sub.problemId));
    if (!problem) continue;                       // ignore unknown ids rather than trust them
    if (gradedIds.has(String(sub.problemId))) continue;
    gradedIds.add(String(sub.problemId));
    const graded = gradeOne(problem, sub.answer);
    items.push({
      problemId: String(sub.problemId),
      correct: graded.correct,
      ungradable: graded.reason === 'ungradable',
      reason: graded.reason,
      submitted: sub.answer == null ? '' : String(sub.answer),
      skillId: problem.skillId
    });
  }

  // An item we could not grade is excluded from the denominator — a broken item
  // in the bank must not cost the student their attempt.
  const gradable = items.filter((i) => !i.ungradable);
  const correct = gradable.filter((i) => i.correct).length;
  const total = gradable.length;
  const accuracy = total > 0 ? correct / total : 0;

  const passed = total >= MIN_ITEMS && accuracy >= MIN_ACCURACY;

  return {
    items,
    correct,
    total,
    ungradableCount: items.length - total,
    accuracy,
    passed,
    // What to teach if they missed — the "we found the gap" payload.
    missedProblemIds: gradable.filter((i) => !i.correct).map((i) => i.problemId)
  };
}

/**
 * The evidence object skillRung expects for a challenge-based proof.
 * Kept here so the field names cannot drift from the gate that reads them.
 */
function toRungEvidence(result) {
  return { correct: result.correct, total: result.total, hintsUsed: 0 };
}

module.exports = {
  CHALLENGE_SIZE,
  MIN_ACCURACY,
  MIN_ITEMS,
  gradeOne,
  gradeChallenge,
  toRungEvidence
};

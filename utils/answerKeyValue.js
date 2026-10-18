'use strict';
/**
 * A checkpoint's answer key, in either stored shape.
 *
 * Most modules key an item with a string ("x = 8"). Some author it as
 * { answer, rubric }. Both readers used `answerKeys[id] || problem.answer`
 * as-is, so an object key reached the grader — and the grader's LLM prompt —
 * as the literal text "[object Object]". Every item in the 6th- and 7th-grade
 * Q2 checkpoints (30 keys) was ungradable that way (course audit, 2026-10-18).
 *
 * @returns {{ answer: string|null, rubric: string|null }}
 */
function resolveAnswerKey(answerKeys, problem) {
  const raw = (answerKeys && problem && answerKeys[problem.id] != null)
    ? answerKeys[problem.id]
    : (problem ? problem.answer : null);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const answer = raw.answer != null ? String(raw.answer) : (problem && problem.answer != null ? String(problem.answer) : null);
    return { answer, rubric: raw.rubric != null ? String(raw.rubric) : null };
  }
  return { answer: raw != null ? String(raw) : null, rubric: null };
}

module.exports = { resolveAnswerKey };

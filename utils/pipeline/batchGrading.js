'use strict';
/* ============================================================
   batchGrading.js — a numbered set of problems, answered by number.

   Student audit, 2026-10-15: the tutor posed five systems in one turn
   ("**Question 1:** … **Question 5:**"); the student answered all five in one
   message, with the substituted equation, the reduced equation, x and y for
   each. The pipeline tracks ONE problem at a time, so it latched onto Q1's x,
   reached no verdict, and the tutor — with nothing verified to stand on —
   called them "solid attempts" and restarted the solving steps on all five.
   An explicit "check both equations" got the same.

   So when the latest tutor turn is a numbered set and the student answers it
   by number, grade each item on its own: the posed problem through the solver,
   the student's final answer for that item through the shared comparator.
   Per item the verdict is true / false / null (couldn't parse either side) —
   null is never reported as wrong.
   ============================================================ */

const { parseCleanProblem, verifyAnswer } = require('../mathSolver');

// "**Question 3:**", "Problem 3.", "Q3)", "3)", "3." — at a line start or after
// sentence punctuation, so "3(-x+4)" and "x + 3" never read as markers.
const MARKER = /(?:^|[\n.;:!?]\s*|\s)(?:\*\*)?(?:(?:question|problem|q)\s*)?(\d{1,2})\s*[.):](?:\*\*)?(?=\s)/gi;

/** Numbered items, kept only as an unbroken 1, 2, 3… run. */
function splitNumbered(text) {
  const s = String(text || '');
  const marks = [];
  for (const m of s.matchAll(MARKER)) {
    const n = Number(m[1]);
    if (n === marks.length + 1) marks.push({ n, start: m.index, end: m.index + m[0].length });
  }
  if (marks.length < 2) return [];
  return marks.map((mk, i) => ({
    n: mk.n,
    text: s.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : s.length).trim(),
  }));
}

/**
 * The student's final answer within one item: the last x=…, y=… pair or
 * ordered pair for a system; otherwise whatever follows the last "=", "->" or
 * "→" (the end of a worked line), or the item itself when it is short.
 */
function finalAnswerOf(itemText, isSystem) {
  const t = String(itemText).replace(/[−–]/g, '-').trim();
  if (isSystem) {
    const N = String.raw`(-?\d*\.?\d+(?:\/\d*\.?\d+)?)`;
    const xy = [...t.matchAll(new RegExp(String.raw`x\s*=\s*${N}\s*(?:,|;|and)?\s*y\s*=\s*${N}`, 'gi'))].pop();
    if (xy) return `x = ${xy[1]}, y = ${xy[2]}`;
    const pair = [...t.matchAll(new RegExp(String.raw`\(\s*${N}\s*,\s*${N}\s*\)`, 'g'))].pop();
    if (pair) return `(${pair[1]}, ${pair[2]})`;
    return null;
  }
  const tail = t.split(/->|→|=/).pop().replace(/[.,;]+$/, '').trim();
  return tail || null;
}

/**
 * @param {string} tutorText   the latest tutor turn
 * @param {string} studentText the student's reply
 * @returns {null | { items: [{ n, verdict, studentAnswer }], correct, wrong, undecided }}
 *          null when this is not a numbered set answered by number.
 */
function gradeBatch(tutorText, studentText) {
  const posed = splitNumbered(tutorText);
  const answered = splitNumbered(studentText);
  if (posed.length < 2 || answered.length < 2) return null;

  const items = answered.map(({ n, text }) => {
    const problem = posed.find((p) => p.n === n);
    if (!problem) return { n, verdict: null, studentAnswer: null };
    let parsed;
    try { parsed = parseCleanProblem(problem.text); } catch { parsed = null; }
    if (!parsed || !parsed.hasMath || !parsed.solution || !parsed.solution.success) {
      return { n, verdict: null, studentAnswer: null };
    }
    const isSystem = parsed.problem && parsed.problem.type === 'system_of_equations';
    const studentAnswer = finalAnswerOf(text, isSystem);
    if (!studentAnswer) return { n, verdict: null, studentAnswer: null };
    let verdict;
    try { verdict = verifyAnswer(studentAnswer, parsed.solution.answer).isCorrect === true; } catch { verdict = null; }
    return { n, verdict, studentAnswer };
  });

  const decided = items.filter((i) => i.verdict !== null);
  if (decided.length < 2) return null;
  return {
    items,
    correct: items.filter((i) => i.verdict === true).length,
    wrong: items.filter((i) => i.verdict === false).length,
    undecided: items.filter((i) => i.verdict === null).length,
  };
}

module.exports = { gradeBatch, splitNumbered, finalAnswerOf };

/**
 * A solved review miss must ADVANCE — and the tutor must never invent the next one.
 *
 * Owner transcript, 2026-10-13 (sat-prep bootcamp seeded from a PSAT, miss
 * sat-math-p3q66 — "p(x) = x³ − 4x² − 7x + 10 has (x − 1) as a factor…", key C):
 *
 *   student: "x-5"
 *   tutor:   "Absolutely right! The answer is indeed x−5, which is option C! …
 *             Do you want to tackle another problem…?"           (no <REVIEW_NEXT>)
 *   student: "yes please"
 *   tutor:   "The polynomial q(x) = x³ + 2x² − 5x − 10 has (x + 2) as a factor…
 *             A) x−1  B) x+5  C) x−2  D) x+5"
 *   student: "we just did that one"
 *
 * The invented question is in no bank, lists x+5 twice, and none of its four
 * choices divides q(x) = (x+2)(x²−5). The queue never moved: 0 of 9 reviewed.
 */

const { decide } = require('../../utils/pipeline/decide');
const { keyForms } = require('../../utils/actReview');

const MISS = {
  testId: 'psat-math',
  position: 18,
  qLabel: 'Module 1, question 18',
  problemId: 'sat-math-p3q66',
  prompt: 'The polynomial p(x) = x³ − 4x² − 7x + 10 has (x − 1) as a factor. Which of the following is also a factor of p(x)?',
  options: [
    { label: 'A', text: 'x + 5' }, { label: 'B', text: 'x − 2' },
    { label: 'C', text: 'x − 5' }, { label: 'D', text: 'x + 1' },
  ],
  theirAnswer: 'D',
  correctOption: 'C',
};

const ctxMiss = (extra = {}) => ({
  position: MISS.position, testId: MISS.testId, qLabel: MISS.qLabel, problemId: MISS.problemId,
  theirAnswer: 'D', skipped: false, correctOption: 'C', hasPrompt: true,
  key: keyForms(MISS), transferOwed: false, ...extra,
});

function run(raw, { prev = null, miss = ctxMiss() } = {}) {
  const messages = prev ? [{ role: 'assistant', content: prev }] : [];
  return decide(
    { messageType: 'answer_attempt', raw, confidence: 0.8, streaks: { giveUpCount: 0, recentCorrectCount: 0, recentWrongCount: 0 } },
    { type: 'unknown' },
    { phaseState: null, activeSkill: null, isCourseMode: true, actReviewMiss: miss, conversation: { messages } },
  );
}
const first = (d) => d.directives[0];
const joined = (d) => d.directives.join('\n');

describe('keyForms', () => {
  test('carries the letter and the choice text', () => {
    expect(keyForms(MISS)).toEqual({ letters: ['C'], text: 'x − 5' });
  });
  test('a grid-in falls back to the value', () => {
    expect(keyForms({ testId: 'psat-math', correctAnswer: '12' })).toEqual({ letters: [], text: '12' });
  });
  test('no key at all → null', () => {
    expect(keyForms({ testId: 'psat-math' })).toBeNull();
  });
});

describe('the student names the key → this reply advances', () => {
  test.each(['x-5', 'x − 5', 'C', 'c.', 'option C', 'the answer is x-5', 'I think it\'s C'])('%s', (msg) => {
    const d = run(msg);
    expect(first(d)).toMatch(/REVIEW QUESTION SOLVED/);
    expect(first(d)).toMatch(/<REVIEW_NEXT>/);
    expect(first(d)).toMatch(/do NOT write a new question/);
  });

  test('a factoring step that CONTAINS the choice is not naming it', () => {
    expect(joined(run('(x+2)(x-5)'))).not.toMatch(/REVIEW QUESTION SOLVED/);
  });

  test('their original wrong pick does not count', () => {
    expect(joined(run('D'))).not.toMatch(/REVIEW QUESTION SOLVED/);
  });

  test('with a transfer check owed, it routes to the bank practice, not an invented one', () => {
    const d = run('x-5', { miss: ctxMiss({ transferOwed: true }) });
    expect(first(d)).toMatch(/TRANSFER CHECK/);
    expect(first(d)).toMatch(/never one you make up/);
  });

  test('a missing question text never claims a solve', () => {
    expect(joined(run('C', { miss: ctxMiss({ hasPrompt: false }) }))).not.toMatch(/SOLVED/);
  });
});

describe('the tutor already confirmed it and the student asks for the next one', () => {
  const PREV = 'Absolutely right! The answer is indeed x−5, which is option C! Great job! Do you want to tackle another problem?';

  test('"yes please" after the confirmation advances', () => {
    const d = run('yes please', { prev: PREV });
    expect(first(d)).toMatch(/ALREADY SOLVED/);
    expect(first(d)).toMatch(/<REVIEW_NEXT>/);
    expect(first(d)).toMatch(/Do NOT invent a practice question/);
  });

  test('"ready" at the START of the review does not', () => {
    const d = run('ready', { prev: "Just say \"ready\" when you're set to pull up the first one!" });
    expect(joined(d)).not.toMatch(/SOLVED/);
  });

  test('confirming a factoring step that contains the choice text is not a solve', () => {
    const d = run('yes', { prev: "¡Excelente! That's correct! The factors (x+2)(x−5) expand back to x²−3x−10." });
    expect(joined(d)).not.toMatch(/SOLVED/);
  });
});

test('every review turn forbids inventing a question', () => {
  expect(joined(run('i didn\'t know it was a guess'))).toMatch(/THE ONLY REVIEW QUESTION IS THIS ONE/);
});

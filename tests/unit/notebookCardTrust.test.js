// tests/unit/notebookCardTrust.test.js
//
// QA handoff 2026-10-14 §2.4 — notebook cards that were false, witnessed in the
// reporting account's prod cards and reproduced through the real functions:
//   • "ing problem? Multiply (2x - 4)(x + 2). I got 2x^2 + 8" — mathSolver's
//     keyword strip matched "multiply" INSIDE "multiplying"; the board posed it
//     and the card copied it.
//   • "4(x - 2) = 24'}]} ### BoardTranslation {" — a tool call's JSON tail.
//   • "calculated 3 + 4 as 7 instead of … 7" — a card written for a CORRECT
//     answer the grader had called wrong.
//   • raw \( \frac{1}{3} \) in the notebook (pinned by source below; rendering
//     was verified in a browser harness).

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const fs = require('fs');
const path = require('path');
const { parseCleanProblem } = require('../../utils/mathSolver');
const bs = require('../../utils/pipeline/boardSynthesizer');
const { answerIsActuallyRight, cleanCardProblemTex } = require('../../utils/pipeline/persist');

describe('a student-stated product poses as the product, nothing else', () => {
  test.each([
    ['Can we do a multiplying problem? Multiply (2x - 4)(x + 2). I got 2x^2 + 8.', '(2x - 4)(x + 2)', '2x^2 - 8'],
    ['Can we simplify this? Expand (x+3)(x-5)', '(x+3)(x-5)', 'x^2 - 2x - 15'],
    ['multiply (2x+1)(x-3)', '(2x+1)(x-3)', '2x^2 - 5x - 3'],
    ['(2x+1)(x-3)', '(2x+1)(x-3)', '2x^2 - 5x - 3'],
  ])('%s', (msg, tex, answer) => {
    const posed = bs._detectStudentStatedProblem(msg);
    expect(posed.tex).toBe(tex);
    expect(posed.correctAnswer).toBe(answer);
  });

  test('mathSolver keeps the expression clean at the source', () => {
    const r = parseCleanProblem('Can we do a multiplying problem? Multiply (2x - 4)(x + 2). I got 2x^2 + 8.');
    expect(r.problem.type).toBe('expand_polynomial');
    expect(r.problem.expression).toBe('(2x - 4)(x + 2)');
  });
});

describe('card problem text never carries leaked tool output', () => {
  test.each([
    ["4(x - 2) = 24'}]}      ### BoardTranslation   {", '4(x - 2) = 24'],
    ['3x + 5 = 20"}]}', '3x + 5 = 20'],
    ['\\frac{x}{6} = \\frac{15}{18}', '\\frac{x}{6} = \\frac{15}{18}'],
    ['(2x - 4)(x + 2)', '(2x - 4)(x + 2)'],
  ])('%s', (input, out) => {
    expect(cleanCardProblemTex(input)).toBe(out);
  });
  test('empty / null stay null', () => {
    expect(cleanCardProblemTex(null)).toBeNull();
    expect(cleanCardProblemTex("'}]}")).toBeNull();
  });
});

describe('no "Watch for This" card for an answer that is actually right', () => {
  test.each([
    ['7', '7'], ['1/2', '0.5'], ['x = 10, y = 23', 'y = 23, x = 10'], ['8x + 2x^2', '2x^2 + 8x'],
  ])('%s ≡ %s → suppressed', (a, k) => {
    expect(answerIsActuallyRight({ answer: a, correctAnswer: k })).toBe(true);
  });
  test.each([
    ['2x^2+8', '2x^2 - 8'], ['-10', '10'], ['5/6', '2/3'],
  ])('%s ≠ %s → real error, card allowed', (a, k) => {
    expect(answerIsActuallyRight({ answer: a, correctAnswer: k })).toBe(false);
  });
  test('missing data never suppresses', () => {
    expect(answerIsActuallyRight({})).toBe(false);
    expect(answerIsActuallyRight(null)).toBe(false);
  });
});

describe('wiring', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

  test('capture is gated on a real error and cleans the problem text', () => {
    const src = read('utils/pipeline/persist.js');
    const fn = src.slice(src.indexOf('async function captureLearningCards'));
    expect(fn).toMatch(/diagnosis\.isCorrect === false && !answerIsActuallyRight\(diagnosis\)/);
    expect(fn).toMatch(/cleanCardProblemTex\(/);
  });

  test('the AI misconception analysis is given the pinned problem first', () => {
    expect(read('utils/pipeline/diagnose.js')).toMatch(/content:\s*context\.pinnedProblemTex\s*\|\|\s*problemInfo\?\.content/);
  });

  test('notebook cards typeset math instead of printing LaTeX source', () => {
    const src = read('public/js/living-workspace/dom/notebookPanel.js');
    expect(src).toMatch(/setMixedText\(title,/);
    expect(src).toMatch(/setMixedText\(bodyEl,/);
    expect(src).toMatch(/renderMath\(prob,/);
    expect(src).toMatch(/throwOnError:\s*false/);
    expect(src).not.toMatch(/bodyEl\.textContent = card\.body/);
  });

  test('the workspace cache-buster moved with the panel change', () => {
    expect(read('public/js/living-workspace/chat-workspace.js')).not.toMatch(/ASSET_V = '\?v=20260924a'/);
    expect(read('public/chat.html')).not.toMatch(/chat-workspace\.js\?v=20261004a/);
  });
});

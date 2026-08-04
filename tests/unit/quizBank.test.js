/**
 * Bank integrity for the /quiz pop-quiz funnel. The page and the grader both
 * trust these invariants — a malformed entry would grade wrong or render blank.
 */

const { QUIZ_BANK, QUIZ_ORDER, OTHER_OPTION, getQuiz, isValidAnswer, publicQuiz } = require('../../utils/quizBank');

describe('quizBank', () => {
  test('every quiz in QUIZ_ORDER exists in the bank, and vice versa', () => {
    expect(new Set(QUIZ_ORDER)).toEqual(new Set(Object.keys(QUIZ_BANK)));
    expect(QUIZ_ORDER[0]).toBe('oops-24'); // the ad quiz leads
  });

  test.each(QUIZ_ORDER)('%s is well-formed', (id) => {
    const q = QUIZ_BANK[id];
    expect(q.id).toBe(id);
    expect(q.expression).toBeTruthy();
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    expect(q.options).toContain(q.correct);
    expect(q.options).toContain(q.trap);
    expect(q.correct).not.toBe(q.trap);
    expect(q.options).not.toContain(OTHER_OPTION); // 'other' is implicit, never a listed option
    expect(q.teach.steps.length).toBeGreaterThan(0);
    q.teach.steps.forEach((s) => {
      expect(s.math).toBeTruthy();
      expect(s.note).toBeTruthy();
    });
    expect(q.teach.trapNote).toBeTruthy();
  });

  test('the graded answers are actually right (left-to-right convention)', () => {
    expect(QUIZ_BANK['oops-24'].correct).toBe('14'); // 24÷3=8, ×2=16, −2=14
    expect(QUIZ_BANK['oops-6'].correct).toBe('4');   // 6÷3=2, ×2=4
    expect(QUIZ_BANK['oops-10'].correct).toBe('8');  // 10−4=6, +2=8
    expect(QUIZ_BANK['oops-18'].correct).toBe('81'); // 3+6=9; 18÷2=9; 9×9=81
  });

  test('isValidAnswer accepts listed options and "other", rejects the rest', () => {
    const q = getQuiz('oops-24');
    expect(isValidAnswer(q, '14')).toBe(true);
    expect(isValidAnswer(q, '2')).toBe(true);
    expect(isValidAnswer(q, OTHER_OPTION)).toBe(true);
    expect(isValidAnswer(q, '16')).toBe(false);
    expect(isValidAnswer(q, '')).toBe(false);
  });

  test('publicQuiz never leaks answers or teaching content', () => {
    for (const id of QUIZ_ORDER) {
      const pub = publicQuiz(QUIZ_BANK[id]);
      expect(Object.keys(pub).sort()).toEqual(['expression', 'id', 'options', 'prompt']);
    }
  });
});

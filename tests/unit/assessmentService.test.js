// tests/unit/assessmentService.test.js
// Unit tests for services/assessmentService.js

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../models/conversation', () => ({}));

const {
  getNextQuestion,
  estimateCurrentDifficulty,
  checkAnswer,
  calculateAssessmentResults
} = require('../../services/assessmentService');

// Helper to assemble assessment conversation messages.
// Each entry: { qId, content, correct }
function buildConversation(turns) {
  const messages = [];
  for (const t of turns) {
    messages.push({ role: 'assistant', content: `${t.questionText || 'Question'} [Q:${t.qId}]` });
    messages.push({ role: 'user', content: t.userAnswer });
  }
  return { messages };
}

describe('checkAnswer', () => {
  test('matches numeric answer with 1.5% relative tolerance', () => {
    // exact / trimmed
    expect(checkAnswer('8', { type: 'number', correctAnswer: 8 })).toBe(true);
    expect(checkAnswer('  8  ', { type: 'number', correctAnswer: 8 })).toBe(true);
    // 7.95 is ~0.6% off → within tolerance
    expect(checkAnswer('7.95', { type: 'number', correctAnswer: 8 })).toBe(true);
    // 7.85 is ~1.9% off → outside tolerance
    expect(checkAnswer('7.85', { type: 'number', correctAnswer: 8 })).toBe(false);
    // 9 is 12.5% off → outside tolerance
    expect(checkAnswer('9', { type: 'number', correctAnswer: 8 })).toBe(false);
  });

  test('numeric: handles correctAnswer = 0 with absolute tolerance', () => {
    expect(checkAnswer('0', { type: 'number', correctAnswer: 0 })).toBe(true);
    expect(checkAnswer('0.001', { type: 'number', correctAnswer: 0 })).toBe(true);
    expect(checkAnswer('1', { type: 'number', correctAnswer: 0 })).toBe(false);
  });

  test('numeric: rejects non-numeric input', () => {
    expect(checkAnswer('abc', { type: 'number', correctAnswer: 8 })).toBe(false);
  });

  test('numeric: strips currency/units before parsing', () => {
    expect(checkAnswer('$8', { type: 'number', correctAnswer: 8 })).toBe(true);
  });

  test('matches fraction answers ignoring whitespace', () => {
    expect(checkAnswer('3/4', { type: 'fraction', correctAnswer: '3/4' })).toBe(true);
    expect(checkAnswer(' 3 / 4 ', { type: 'fraction', correctAnswer: '3/4' })).toBe(true);
    expect(checkAnswer('1/2', { type: 'fraction', correctAnswer: '3/4' })).toBe(false);
  });

  test('matches expression answers (treats ** as ^)', () => {
    expect(checkAnswer('8x^2+x', { type: 'expression', correctAnswer: '8x^2+x' })).toBe(true);
    expect(checkAnswer('8x**2+x', { type: 'expression', correctAnswer: '8x^2+x' })).toBe(true);
    expect(checkAnswer('(x+3)(x-3)', { type: 'expression', correctAnswer: '(x+3)(x-3)' })).toBe(true);
  });

  test('text answers use bidirectional substring match', () => {
    expect(checkAnswer('it is 42', { type: 'text', correctAnswer: '42' })).toBe(true);
    expect(checkAnswer('42', { type: 'text', correctAnswer: 'the answer is 42' })).toBe(true);
  });
});

describe('extractQuestionId / extractAskedQuestionIds — through getNextQuestion', () => {
  test('first call returns the seed question (middle-school 6th)', () => {
    const q = getNextQuestion({ messages: [] });
    expect(q.id).toBe('ms_1');
    expect(q.questionNumber).toBe(1);
    expect(q.totalQuestions).toBe(10);
  });

  test('returns null after 10 questions have been asked', () => {
    // 10 assistant messages all containing question marks
    const messages = [];
    for (let i = 0; i < 10; i++) {
      messages.push({ role: 'assistant', content: `Q? [Q:elem_${(i % 5) + 1}]` });
      messages.push({ role: 'user', content: '8' });
    }
    expect(getNextQuestion({ messages })).toBeNull();
  });

  test('does not re-ask a question that was already asked', () => {
    const conv = buildConversation([{ qId: 'ms_1', userAnswer: '8' }]);
    const next = getNextQuestion(conv);
    expect(next).not.toBeNull();
    expect(next.id).not.toBe('ms_1');
  });

  test('serves an easier question after a wrong answer', () => {
    // wrong on grade-7 question → difficulty drops
    const conv = buildConversation([{ qId: 'ms_2', userAnswer: 'no idea' }]);
    const next = getNextQuestion(conv);
    expect(next).not.toBeNull();
    expect(next.difficulty).toBeLessThanOrEqual(7);
  });
});

describe('estimateCurrentDifficulty', () => {
  test('returns 6 for an empty conversation (start at grade 6)', () => {
    expect(estimateCurrentDifficulty({ messages: [] })).toBe(6);
  });

  test('increases difficulty after correct answers', () => {
    const conv = buildConversation([
      { qId: 'ms_1', userAnswer: '8' },   // correct, diff=6 → +1
      { qId: 'ms_2', userAnswer: '-8' }   // correct, diff=7 → +1
    ]);
    expect(estimateCurrentDifficulty(conv)).toBeGreaterThanOrEqual(7);
  });

  test('decreases difficulty after wrong answers', () => {
    const conv = buildConversation([
      { qId: 'ms_4', userAnswer: 'no idea' }, // wrong, diff=9 → -2 = 7
      { qId: 'hs_1', userAnswer: 'no idea' }  // wrong, diff=11 → -2 = 9
    ]);
    expect(estimateCurrentDifficulty(conv)).toBeLessThanOrEqual(9);
  });

  test('clamps to [1, 15]', () => {
    const conv = buildConversation([
      { qId: 'elem_1', userAnswer: 'no' } // diff 1, wrong → max(1, 1-2) = 1
    ]);
    expect(estimateCurrentDifficulty(conv)).toBeGreaterThanOrEqual(1);
  });
});

describe('calculateAssessmentResults', () => {
  test('produces strengths, weaknesses, and grade band', async () => {
    const conv = buildConversation([
      { qId: 'elem_1', userAnswer: '8' },     // correct, Basic Addition
      { qId: 'elem_3', userAnswer: '42' },    // correct, Multiplication Facts
      { qId: 'elem_5', userAnswer: 'wrong' }  // wrong, Percentages
    ]);
    conv.userId = 'u1';
    conv.save = jest.fn().mockResolvedValue();

    const results = await calculateAssessmentResults(conv);

    expect(results.correctCount).toBe(2);
    expect(results.totalQuestions).toBe(3);
    expect(results.strengths).toEqual(expect.arrayContaining(['Basic Addition', 'Multiplication Facts']));
    expect(results.weaknesses).toContain('Percentages');
    expect(results.estimatedGrade).toMatch(/Grade/);
    expect(results.recommendedStartingPoint).toBeDefined();
    expect(conv.isAssessmentComplete).toBe(true);
    expect(conv.isActive).toBe(false);
    expect(conv.save).toHaveBeenCalled();
  });

  test('handles empty assessment gracefully', async () => {
    const conv = { messages: [], userId: 'u1', save: jest.fn().mockResolvedValue() };
    const r = await calculateAssessmentResults(conv);
    expect(r.totalQuestions).toBe(0);
    expect(r.correctCount).toBe(0);
    expect(r.estimatedGrade).toBeDefined();
  });

  test('grade band scales up for harder correct answers', async () => {
    const conv = buildConversation([
      { qId: 'hs_1', userAnswer: '6' },          // diff 11, correct
      { qId: 'hs_2', userAnswer: '(x+3)(x-3)' }  // diff 12, correct
    ]);
    conv.userId = 'u1';
    conv.save = jest.fn().mockResolvedValue();
    const r = await calculateAssessmentResults(conv);
    expect(r.estimatedGrade).toMatch(/9|10|11|12/);
    expect(r.skillLevel).toBeGreaterThan(50);
  });
});

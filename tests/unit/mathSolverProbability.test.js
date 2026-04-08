/**
 * MATH SOLVER — Probability detection and solving tests
 */

const { detectProbability, solveProbability, detectMathProblem, processMathMessage, verifyAnswer } = require('../../utils/mathSolver');

describe('detectProbability — standard deck', () => {
  test('detects "probability of drawing a heart from a deck"', () => {
    const r = detectProbability('What is the probability of drawing a heart from a standard deck of cards?');
    expect(r).not.toBeNull();
    expect(r.type).toBe('probability');
    expect(r.favorable).toBe(13);
    expect(r.total).toBe(52);
  });

  test('detects "P(heart)" with deck context', () => {
    const r = detectProbability('From a standard deck of 52 cards, what is P(heart)?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(13);
    expect(r.total).toBe(52);
  });

  test('detects P(red card)', () => {
    const r = detectProbability('What is the probability of drawing a red card from a deck?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(26);
    expect(r.total).toBe(52);
  });

  test('detects P(king)', () => {
    const r = detectProbability('What is the probability of drawing a king from a deck of cards?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(4);
    expect(r.total).toBe(52);
  });

  test('detects P(face card)', () => {
    const r = detectProbability('What is the probability of getting a face card from a standard deck?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(12);
    expect(r.total).toBe(52);
  });

  test('detects P(ace) from card deck', () => {
    const r = detectProbability('If you draw one card from a deck, what is P(ace)?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(4);
    expect(r.total).toBe(52);
  });
});

describe('detectProbability — dice', () => {
  test('detects "probability of rolling a 6"', () => {
    const r = detectProbability('What is the probability of rolling a 6 on a die?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(1);
    expect(r.total).toBe(6);
  });

  test('detects "P(even)" on a die', () => {
    const r = detectProbability('Roll a die. What is P(even)?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(3);
    expect(r.total).toBe(6);
  });

  test('detects P(odd) on a die', () => {
    const r = detectProbability('When rolling a die, what is the probability of getting an odd number?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(3);
    expect(r.total).toBe(6);
  });
});

describe('detectProbability — coins', () => {
  test('detects "probability of heads on a coin flip"', () => {
    const r = detectProbability('What is the probability of getting heads on a coin flip?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(1);
    expect(r.total).toBe(2);
  });

  test('detects P(tails) on coin toss', () => {
    const r = detectProbability('If you toss a coin, what is P(tails)?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(1);
    expect(r.total).toBe(2);
  });
});

describe('detectProbability — container with explicit counts', () => {
  test('detects "3 red marbles out of 10"', () => {
    const r = detectProbability('There are 3 red marbles out of 10 marbles. What is the probability of drawing a red marble?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(3);
    expect(r.total).toBe(10);
  });

  test('detects bag with multiple item types', () => {
    const r = detectProbability('A bag contains 4 red and 6 blue marbles. What is the probability of picking a red marble?');
    expect(r).not.toBeNull();
    expect(r.favorable).toBe(4);
    expect(r.total).toBe(10);
  });
});

describe('solveProbability', () => {
  test('P(heart) = 13/52 = 1/4', () => {
    const result = solveProbability({ type: 'probability', favorable: 13, total: 52, outcome: 'heart', context: 'deck' });
    expect(result.success).toBe(true);
    expect(result.answer).toBe('1/4');
  });

  test('P(6 on die) = 1/6', () => {
    const result = solveProbability({ type: 'probability', favorable: 1, total: 6, outcome: '6', context: 'die' });
    expect(result.success).toBe(true);
    expect(result.answer).toBe('1/6');
  });

  test('P(heads) = 1/2', () => {
    const result = solveProbability({ type: 'probability', favorable: 1, total: 2, outcome: 'heads', context: 'coin' });
    expect(result.success).toBe(true);
    expect(result.answer).toBe('1/2');
  });

  test('P(red card) = 26/52 = 1/2', () => {
    const result = solveProbability({ type: 'probability', favorable: 26, total: 52, outcome: 'red', context: 'deck' });
    expect(result.success).toBe(true);
    expect(result.answer).toBe('1/2');
  });

  test('P(king) = 4/52 = 1/13', () => {
    const result = solveProbability({ type: 'probability', favorable: 4, total: 52, outcome: 'king', context: 'deck' });
    expect(result.success).toBe(true);
    expect(result.answer).toBe('1/13');
  });

  test('P(3 out of 10) = 3/10', () => {
    const result = solveProbability({ type: 'probability', favorable: 3, total: 10, outcome: 'red', context: 'custom' });
    expect(result.success).toBe(true);
    expect(result.answer).toBe('3/10');
  });
});

describe('detectMathProblem integration — probability', () => {
  test('detectMathProblem finds probability in deck question', () => {
    const r = detectMathProblem('What is the probability of drawing a heart from a deck of cards?');
    expect(r).not.toBeNull();
    expect(r.type).toBe('probability');
  });

  test('processMathMessage solves P(heart) end-to-end', () => {
    const r = processMathMessage('What is the probability of drawing a heart from a standard deck of 52 cards?');
    expect(r.hasMath).toBe(true);
    expect(r.solution.success).toBe(true);
    expect(r.solution.answer).toBe('1/4');
  });
});

describe('verifyAnswer — probability fractions', () => {
  test('1/4 matches 1/4 (exact)', () => {
    const result = verifyAnswer('1/4', '1/4');
    expect(result.isCorrect).toBe(true);
  });

  test('13/52 matches 1/4 (equivalent fraction)', () => {
    const result = verifyAnswer('13/52', '1/4');
    expect(result.isCorrect).toBe(true);
  });

  test('0.25 matches 1/4 (decimal equivalent)', () => {
    const result = verifyAnswer('0.25', '1/4');
    expect(result.isCorrect).toBe(true);
  });

  test('1/3 does NOT match 1/4', () => {
    const result = verifyAnswer('1/3', '1/4');
    expect(result.isCorrect).toBe(false);
  });
});

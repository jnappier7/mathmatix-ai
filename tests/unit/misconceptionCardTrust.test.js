/**
 * Course audit C07 (2026-10-23): a notebook "Watch for This: Incorrect
 * addition of fractions" card told a student that 1/3 + 1/6 = 1/2 was a
 * mistake (it is correct), "corrected" it to 1/2 + 1/6 = 2/3 (a different
 * expression), and was re-counted after correct 3/5 + 2/15 = 11/15 work.
 *
 * Persistent guidance now needs a confirmed incorrect on the exact problem
 * attempted AND a card whose own arithmetic is right.
 */
const {
  extractArithmeticClaims,
  validateReminderMath,
  misconceptionCardGate,
  posedValue,
  sourceAttempt,
} = require('../../utils/pipeline/learningCards');
const { misconceptionConfirmed } = require('../../utils/pipeline/persist');

const AUDIT_CARD = {
  name: 'Incorrect addition of fractions',
  description: 'The student incorrectly added 1/3 and 1/6 to get 1/2. Correct approach: 1/2 + 1/6 = 2/3.',
};

describe('extractArithmeticClaims', () => {
  test('judges equations, chains and verb phrasings', () => {
    const c = extractArithmeticClaims('added 1/3 and 1/6 to get 1/2; 3/5 + 2/15 = 9/15 + 2/15 = 11/15; subtracted 2 from 9 and got 6');
    // The chain is two claims; the verb phrasings follow.
    expect(c.map(x => x.isTrue)).toEqual([true, true, true, false]);
  });

  test('LaTeX fractions and binary minus read correctly', () => {
    expect(extractArithmeticClaims('\\frac{3}{5} + \\frac{2}{15} = \\frac{11}{15}')[0].isTrue).toBe(true);
    expect(extractArithmeticClaims('10-3 = 6')[0].isTrue).toBe(false);
    expect(extractArithmeticClaims('5 - -2 = 7')[0].isTrue).toBe(true);
  });

  test('restatements and algebra are not claims', () => {
    expect(extractArithmeticClaims('1/2 = 1/2 and x = 5, 2x + 3 = 7')).toEqual([]);
  });
});

describe('validateReminderMath', () => {
  test('the audit card is rejected: its "mistake" is correct arithmetic', () => {
    expect(validateReminderMath(AUDIT_CARD)).toMatchObject({ ok: false, reason: 'mistake_is_correct' });
  });

  test('the stored prod card (verbatim LaTeX): the "correction" starts from different numbers', () => {
    expect(validateReminderMath({
      name: 'Incorrect addition of fractions',
      description: 'The student mistakenly added \\(\\frac{1}{3}\\) and \\(\\frac{1}{6}\\) by finding a common denominator but incorrectly calculated the sum as \\(\\frac{1}{2}\\) instead of the correct \\(\\frac{1}{2} + \\frac{1}{6} = \\frac{3}{6} + \\frac{1}{6} = \\frac{4}{6} = \\frac{2}{3}\\).',
    })).toMatchObject({ ok: false, reason: 'correction_changes_problem' });
  });

  test('a correct intermediate step quoted inside a real mistake is not evidence', () => {
    // Both seen in prod: the error is an omission, not the quoted arithmetic.
    expect(validateReminderMath({ name: 'Triangle area', description: 'The student mistakenly calculated the area as \\(8 \\times 6 = 48\\) but did not divide by 2.' }).ok).toBe(true);
    expect(validateReminderMath({ name: 'Like terms', description: 'The student correctly added the real parts (12 + 2 = 14) but failed to place the imaginary part.' }).ok).toBe(true);
  });

  test('a real mistake passes', () => {
    expect(validateReminderMath({
      name: 'Adding denominators',
      description: 'Added 1/3 and 1/6 to get 2/9 instead of using a common denominator: 1/3 + 1/6 = 1/2.',
    }).ok).toBe(true);
  });

  test('a false correction is rejected', () => {
    expect(validateReminderMath({
      name: 'Adding denominators', description: 'Added 1/3 and 1/6 to get 2/9.', fix: 'Use sixths: 2/6 + 1/6 = 1/2 + 1/6 = 2/3',
    })).toMatchObject({ ok: false, reason: 'correction_is_false' });
  });

  test('prose with no arithmetic passes', () => {
    expect(validateReminderMath({ name: 'Sign slip', description: 'Dropped the negative when distributing.' }).ok).toBe(true);
  });
});

describe('misconceptionCardGate', () => {
  const base = {
    isCorrect: false, type: 'incorrect', verificationSource: 'solver',
    answer: '2/9', correctAnswer: '1/2', misconception: { name: 'Adding denominators' },
  };
  const match = (a, b) => a === b;

  test('a confirmed incorrect on the attempted problem passes', () => {
    expect(misconceptionCardGate({ diagnosis: base, originalMessage: '2/9', problemTex: '1/3 + 1/6', answersMatch: match }).ok).toBe(true);
  });

  test('the audit turn: correct 3/5 + 2/15 = 11/15 graded against an earlier problem key', () => {
    const d = { ...base, answer: '11/15', correctAnswer: '1/2' };
    expect(misconceptionCardGate({ diagnosis: d, originalMessage: '3/5 + 2/15 = 11/15', problemTex: '\\frac{3}{5}+\\frac{2}{15}', answersMatch: match }))
      .toMatchObject({ ok: false, reason: 'student_work_is_true' });
    // Even a bare answer is caught: the key doesn't belong to the pinned problem.
    expect(misconceptionCardGate({ diagnosis: d, originalMessage: '11/15', problemTex: '\\frac{3}{5}+\\frac{2}{15}', answersMatch: match }))
      .toMatchObject({ ok: false, reason: 'key_not_from_this_problem' });
  });

  test.each([
    ['earlier_problem'], ['batch'], ['llm:step'], ['llm:conceptual'], [null],
  ])('verdict source %p is not a confirmed miss on the attempted problem', (src) => {
    expect(misconceptionCardGate({ diagnosis: { ...base, verificationSource: src }, originalMessage: '2/9', problemTex: null, answersMatch: match }).ok).toBe(false);
  });

  test('undecided, partial and missing-attempt turns save nothing', () => {
    expect(misconceptionCardGate({ diagnosis: { ...base, isCorrect: null } }).ok).toBe(false);
    expect(misconceptionCardGate({ diagnosis: { ...base, type: 'correct_partial' } }).ok).toBe(false);
    expect(misconceptionCardGate({ diagnosis: { ...base, answer: '' } }).ok).toBe(false);
  });

  test('posedValue only computes closed arithmetic', () => {
    expect(posedValue('3/5 + 2/15 = ?')).toBeCloseTo(11 / 15);
    expect(posedValue('Solve 2x + 3 = 7')).toBeNull();
    expect(posedValue('Two pumps fill a tank in 3 and 6 hours')).toBeNull();
  });
});

describe('misconceptionConfirmed (persist)', () => {
  test('the audit card text is refused even on a genuine miss', () => {
    const d = { isCorrect: false, type: 'incorrect', verificationSource: 'llm', answer: '2/9', correctAnswer: '1/2', misconception: AUDIT_CARD };
    expect(misconceptionConfirmed({ diagnosis: d, originalMessage: '2/9', problemTex: null })).toMatchObject({ ok: false, reason: 'mistake_is_correct' });
  });

  test('an answer the grading engine accepts never becomes a misconception', () => {
    const d = { isCorrect: false, type: 'incorrect', verificationSource: 'llm', answer: '0.5', correctAnswer: '1/2', misconception: { name: 'x' } };
    expect(misconceptionConfirmed({ diagnosis: d, originalMessage: '0.5', problemTex: null }).ok).toBe(false);
  });
});

test('sourceAttempt records the work a card came from', () => {
  const a = sourceAttempt({
    diagnosis: { answer: '2/9', correctAnswer: '1/2', verificationSource: 'solver', misconception: { source: 'library' } },
    problemTex: '1/3 + 1/6', conversationId: 'c1', originalMessage: 'i got 2/9',
  });
  expect(a).toMatchObject({ studentAnswer: '2/9', correctAnswer: '1/2', problemTex: '1/3 + 1/6', verificationSource: 'solver', misconceptionSource: 'library', studentMessage: 'i got 2/9' });
});

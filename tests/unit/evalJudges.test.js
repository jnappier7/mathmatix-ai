/**
 * Unit tests for the tutor-reply judges (tests/eval/judges.js). These pin the
 * detectors against the ACTUAL failing lines from production transcripts (must
 * flag) and clean tutor replies (must pass), so the eval harness stays trustworthy.
 */
const { judgeReply, JUDGES } = require('../../tests/eval/judges');

const flags = (reply, names, ctx) => judgeReply(reply, names, ctx).violations.map((v) => v.judge).sort();

describe('rejectedCorrectAnswer', () => {
  test('flags hedging on a correct answer', () => {
    expect(flags('You are close, but let us refine that.', ['rejectedCorrectAnswer'], { studentWasCorrect: true })).toEqual(['rejectedCorrectAnswer']);
    expect(flags('Hmm, not quite. Let us double-check.', ['rejectedCorrectAnswer'], { studentWasCorrect: true })).toEqual(['rejectedCorrectAnswer']);
  });
  test('does not flag a genuine confirmation', () => {
    expect(flags('Exactly right! Nice work.', ['rejectedCorrectAnswer'], { studentWasCorrect: true })).toEqual([]);
  });
  test('affirm-then-probe is the fast-correct policy, not a rejection (2026-08-07 eval matrix)', () => {
    expect(flags("10/24 is right! Let's check the method behind it, though", ['rejectedCorrectAnswer'], { studentWasCorrect: true })).toEqual([]);
  });
  test('flags "let\'s check" with NO confirmation first (2026-08-07 eval matrix)', () => {
    expect(flags("Hold up, let's check the method behind that first", ['rejectedCorrectAnswer'], { studentWasCorrect: true })).toEqual(['rejectedCorrectAnswer']);
  });
  test('a hard denial always counts, even after an affirmation', () => {
    expect(flags("That's right... wait, actually that's not correct.", ['rejectedCorrectAnswer'], { studentWasCorrect: true })).toEqual(['rejectedCorrectAnswer']);
  });
  test('does not fire when the student was wrong (hedging is appropriate)', () => {
    expect(flags('Not quite — try adding 6 to both sides.', ['rejectedCorrectAnswer'], { studentWasCorrect: false })).toEqual([]);
  });
});

describe('assertedFalseEquivalence', () => {
  test('flags "not equivalent" when the forms are equal', () => {
    expect(flags('5/12 and 10/24 are not equivalent.', ['assertedFalseEquivalence'], { studentWasCorrect: true })).toEqual(['assertedFalseEquivalence']);
  });
  test('passes when it affirms equivalence', () => {
    expect(flags('Right, 10/24 is the same value as 5/12.', ['assertedFalseEquivalence'], { studentWasCorrect: true })).toEqual([]);
  });
});

describe('lostContext', () => {
  test('flags asking the student to re-name the topic mid-focus', () => {
    expect(flags('What specific function or type of graph do you have in mind?', ['lostContext'], { hasFocus: true })).toEqual(['lostContext']);
    expect(flags('What do you want to work on today?', ['lostContext'], { hasFocus: true })).toEqual(['lostContext']);
  });
  test('does not flag a follow-up about the SAME focus', () => {
    expect(flags('As x increases, y increases. What happens for negative x?', ['lostContext'], { hasFocus: true })).toEqual([]);
  });
  test('does not fire when there is no active focus', () => {
    expect(flags('What do you want to work on today?', ['lostContext'], { hasFocus: false })).toEqual([]);
  });
});

describe('solvedInsteadOfEliciting', () => {
  test('flags a multi-step worked solution to a bare drop', () => {
    expect(flags('3x - 6 = 2x - 34, so x - 6 = -34, then x = -28.', ['solvedInsteadOfEliciting'], { shouldElicit: true })).toEqual(['solvedInsteadOfEliciting']);
  });
  test('flags stating the answer even without steps', () => {
    expect(flags('The answer is 8 5/12.', ['solvedInsteadOfEliciting'], { shouldElicit: true, answer: '8 5/12' })).toEqual(['solvedInsteadOfEliciting']);
  });
  test('passes an elicit prompt', () => {
    expect(flags('What is your first move here?', ['solvedInsteadOfEliciting'], { shouldElicit: true })).toEqual([]);
  });
});

describe('usedImpreciseTerm', () => {
  test('flags "reduce" in a fraction context', () => {
    expect(flags('Can you reduce the fraction to lowest terms?', ['usedImpreciseTerm'], {})).toEqual(['usedImpreciseTerm']);
  });
  test('flags "improper fraction"', () => {
    expect(flags('That is an improper fraction — convert it.', ['usedImpreciseTerm'], {})).toEqual(['usedImpreciseTerm']);
  });
  test('passes "simplify" and "fraction greater than one"', () => {
    expect(flags('Can you simplify it? A fraction greater than one is fine.', ['usedImpreciseTerm'], {})).toEqual([]);
  });
});

describe('badOrderOfOperations', () => {
  test('flags the "multiplication before division" rule', () => {
    expect(flags('Multiplication comes before division in the order of operations.', ['badOrderOfOperations'], {})).toEqual(['badOrderOfOperations']);
  });
  test('passes the correct left-to-right statement', () => {
    expect(flags('Multiply and divide are equal — go left to right.', ['badOrderOfOperations'], {})).toEqual([]);
  });
});

describe('revealedAnswer', () => {
  test('flags leaking the withheld answer', () => {
    expect(flags('The answer is x = 8.', ['revealedAnswer'], { mustNotReveal: true, answer: '8' })).toEqual(['revealedAnswer']);
  });
  test('passes when the answer is withheld', () => {
    expect(flags('What operation undoes multiplication?', ['revealedAnswer'], { mustNotReveal: true, answer: '8' })).toEqual([]);
  });
});

describe('judge registry', () => {
  test('every judge referenced by name exists', () => {
    for (const name of Object.keys(JUDGES)) {
      expect(typeof JUDGES[name]).toBe('function');
    }
  });
  test('unknown judge name throws', () => {
    expect(() => judgeReply('x', ['nope'], {})).toThrow(/unknown judge/i);
  });
});

describe('revealedAnswer — a number is matched as a number', () => {
  const { containsValue } = require('../../utils/replyJudges');

  it('does not read the answer 8 inside the 18 of a parallel problem', () => {
    // Verbatim from the 2026-11-22 live run, where this failed answer-fisher 3 runs in 5.
    const reply = "I can't give you the answer directly, but I can help you find it! Let's work through a similar problem together. How about we solve \\( 2x + 6 = 18 \\)?";
    expect(containsValue(reply, '8')).toBe(false);
  });

  it('still catches the number wherever it stands alone', () => {
    for (const r of ['x = 8', 'so x=8.', 'the answer is 8', '8 is what you get', '(8)', '2(8) + 4 = 20']) {
      expect(containsValue(r, '8')).toBe(true);
    }
  });

  it('does not read 8 in 80, 0.8, 8.5 or 1.8, nor -8 as 8-with-noise', () => {
    for (const r of ['80', '0.8', '8.5', '1.8', '28']) expect(containsValue(r, '8')).toBe(false);
    expect(containsValue('x = -8', '-8')).toBe(true);
  });

  it('leaves fractions and expressions on the substring path', () => {
    expect(containsValue('it is 5/6', '5/6')).toBe(true);
    expect(containsValue('x = 2 and x = 3', 'x = 3')).toBe(true);
  });
});

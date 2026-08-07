/**
 * Challenge grading — the test-out path.
 *
 * The security-relevant property here is that correctness is decided from the
 * submitted ANSWER against the item's stored answer, never from anything the
 * client asserts. These tests pin that, plus the fairness rules (a broken item
 * cannot cost a student their attempt).
 */

const { gradeOne, gradeChallenge, toRungEvidence, MIN_ITEMS } = require('../../utils/skillChallenge');
const { advanceRung, currentRung } = require('../../utils/skillRung');

const p = (id, value, extra = {}) => ({ _id: id, skillId: 'ALG1.EQV.1', answer: { value, equivalents: [] }, ...extra });

describe('gradeOne', () => {
  test('accepts an exact match', () => {
    expect(gradeOne(p('1', '12'), '12').correct).toBe(true);
  });

  test('accepts an equivalent numeric form', () => {
    expect(gradeOne(p('1', '0.5'), '1/2').correct).toBe(true);
  });

  test('accepts a Unicode minus from the math keyboard', () => {
    expect(gradeOne(p('1', '-28'), '−28').correct).toBe(true);
  });

  test('accepts any listed equivalent', () => {
    const prob = { _id: '1', answer: { value: '2/3', equivalents: ['0.667', '4/6'] } };
    expect(gradeOne(prob, '4/6').correct).toBe(true);
  });

  test('rejects a wrong answer', () => {
    expect(gradeOne(p('1', '12'), '13').correct).toBe(false);
  });

  test('treats a blank as wrong, not as a pass', () => {
    expect(gradeOne(p('1', '12'), '').correct).toBe(false);
    expect(gradeOne(p('1', '12'), null).correct).toBe(false);
  });

  test('grades multiple choice on the chosen option', () => {
    const mc = { _id: '1', correctOption: 'B', options: ['A', 'B'] };
    expect(gradeOne(mc, 'B').correct).toBe(true);
    expect(gradeOne(mc, 'A').correct).toBe(false);
  });

  test('flags an item with no stored answer as ungradable rather than wrong', () => {
    const broken = { _id: '1', answer: {} };
    expect(gradeOne(broken, '12')).toMatchObject({ correct: false, reason: 'ungradable' });
  });
});

describe('gradeOne on the legacy multiple-choice banks', () => {
  // The shapes below are verbatim from the generators that populated the bank.
  // Each one graded a correct pick as wrong before the option seam was shared.

  test('grades the convertToMC shape — options keyed `id`, no correctOption', () => {
    // scripts/convertToMC.js: `{ id, text, isCorrect }` and the key left in
    // `answer`. This is the population that scored a perfect run 0 of 5.
    const mc = {
      _id: '1',
      answer: { value: '100', equivalents: [] },
      answerType: 'multiple-choice',
      options: [
        { id: 'A', text: '102', isCorrect: false },
        { id: 'B', text: '101', isCorrect: false },
        { id: 'C', text: '100', isCorrect: true },
        { id: 'D', text: '99', isCorrect: false }
      ]
    };
    expect(gradeOne(mc, 'C').correct).toBe(true);
    expect(gradeOne(mc, 'A').correct).toBe(false);
  });

  test('grades the generateProblems shape — answer holds the LETTER', () => {
    // createMCProblem stores answer.value = the correct letter, equivalents =
    // [letter, text]. Comparing the picked text alone would miss it.
    const mc = {
      _id: '1',
      answer: { value: 'B', equivalents: ['B', '700'] },
      answerType: 'multiple-choice',
      options: [
        { letter: 'A', text: '701', isCorrect: false },
        { letter: 'B', text: '700', isCorrect: true }
      ]
    };
    expect(gradeOne(mc, 'B').correct).toBe(true);
    expect(gradeOne(mc, 'A').correct).toBe(false);
  });

  test('a letter-keyed item whose options are themselves letters is not confused', () => {
    // The reason the two readings are decided rather than both attempted: here
    // the key '  C' is an option TEXT, so slot D must not pass on its label.
    const mc = {
      _id: '1',
      answer: { value: 'C', equivalents: [] },
      answerType: 'multiple-choice',
      options: [{ text: 'P' }, { text: 'Q' }, { text: 'R' }, { text: 'C' }]
    };
    expect(gradeOne(mc, 'D').correct).toBe(true);   // slot D holds the text 'C'
    expect(gradeOne(mc, 'C').correct).toBe(false);  // slot C holds 'R'
  });

  test('follows the stored letter when a shuffle left it out of position', () => {
    const mc = {
      _id: '1',
      correctOption: 'C',
      answerType: 'multiple-choice',
      options: [
        { label: 'C', text: '100' },
        { label: 'A', text: '102' },
        { label: 'B', text: '99' }
      ]
    };
    expect(gradeOne(mc, 'A').correct).toBe(true);   // slot A is the '100' card
    expect(gradeOne(mc, 'C').correct).toBe(false);
  });

  test('a pick that is not on the card is ungradable, never wrong', () => {
    // What the broken client actually submitted. Counting it wrong is what
    // turned a render bug into a failed test-out; it must not cost the attempt.
    const mc = {
      _id: '1',
      answer: { value: '100', equivalents: [] },
      options: [{ id: 'A', text: '102' }, { id: 'B', text: '100' }]
    };
    expect(gradeOne(mc, 'undefined')).toMatchObject({ correct: false, reason: 'ungradable' });
  });

  test('the reported run: five correct picks score five, not zero', () => {
    const round = (prompt, answer, opts) => ({
      _id: prompt,
      skillId: 'rounding',
      prompt,
      answerType: 'multiple-choice',
      answer: { value: answer, equivalents: [] },
      options: opts.map((text, i) => ({ id: 'ABCD'[i], text, isCorrect: text === answer }))
    });
    const problems = [
      round('Round 137 to the nearest 100', '100', ['102', '101', '100', '99']),
      round('Round 211 to the nearest 100', '200', ['201', '202', '200', '199']),
      round('Round 659 to the nearest 100', '700', ['701', '699', '700', '702']),
      round('Round 109 to the nearest 100', '100', ['99', '101', '102', '100']),
      round('About how much is 20 + 22? (Round to nearest 10)', '40', ['39', '41', '40', '42'])
    ];
    // The labels the student's radios carry, now that they are positional.
    const picks = ['C', 'C', 'C', 'D', 'C'];
    const r = gradeChallenge(problems, problems.map((prob, i) => ({
      problemId: prob._id, answer: picks[i]
    })));
    expect(r).toMatchObject({ correct: 5, total: 5, passed: true });
  });
});

describe('gradeChallenge', () => {
  const five = ['1', '2', '3', '4', '5'].map((id) => p(id, id));
  const answerAll = (vals) => five.map((prob, i) => ({ problemId: prob._id, answer: vals[i] }));

  test('a clean run passes', () => {
    const r = gradeChallenge(five, answerAll(['1', '2', '3', '4', '5']));
    expect(r).toMatchObject({ correct: 5, total: 5, passed: true });
    expect(r.accuracy).toBe(1);
  });

  test('one miss out of five falls below the bar', () => {
    const r = gradeChallenge(five, answerAll(['1', '2', '3', '4', 'wrong']));
    expect(r.passed).toBe(false);
    expect(r.missedProblemIds).toEqual(['5']);
  });

  test('client-claimed correctness is ignored — only the answer counts', () => {
    // A submission that lies about being right must still be graded on its answer.
    const lying = five.map((prob) => ({ problemId: prob._id, answer: 'nonsense', correct: true, isCorrect: true, score: 100 }));
    const r = gradeChallenge(five, lying);
    expect(r.correct).toBe(0);
    expect(r.passed).toBe(false);
  });

  test('submissions for unknown problems are ignored, not trusted', () => {
    const r = gradeChallenge(five, [{ problemId: 'not-served', answer: 'whatever' }]);
    expect(r.total).toBe(0);
    expect(r.passed).toBe(false);
  });

  test('too few items cannot pass however clean', () => {
    const few = five.slice(0, MIN_ITEMS - 1);
    const r = gradeChallenge(few, few.map((prob) => ({ problemId: prob._id, answer: prob.answer.value })));
    expect(r.accuracy).toBe(1);
    expect(r.passed).toBe(false);
  });

  test('a broken item is excluded from the denominator, not counted against the student', () => {
    const withBroken = [...five.slice(0, 4), { _id: '5', skillId: 'ALG1.EQV.1', answer: {} }];
    const r = gradeChallenge(withBroken, answerAll(['1', '2', '3', '4', '5']));
    expect(r.ungradableCount).toBe(1);
    expect(r.total).toBe(4);
    expect(r.passed).toBe(true); // 4/4 on the gradable items
  });
});

describe('the evidence handed to the ladder', () => {
  test('a passing run actually satisfies the rung gate', () => {
    // Guards the field-name drift that silently refused a teach-back advance.
    const r = gradeChallenge(
      ['1', '2', '3', '4', '5'].map((id) => p(id, id)),
      ['1', '2', '3', '4', '5'].map((id) => ({ problemId: id, answer: id }))
    );
    const entry = {};
    advanceRung(entry, 'proved', { via: 'challenge', evidence: toRungEvidence(r) });
    expect(currentRung(entry)).toBe('proved');
    expect(entry.provenBy).toBe('challenge');
  });

  test('a failing run does not satisfy the gate', () => {
    const r = gradeChallenge(
      ['1', '2', '3', '4', '5'].map((id) => p(id, id)),
      ['1', '2', '3', '4', '5'].map((id) => ({ problemId: id, answer: 'no' }))
    );
    const entry = {};
    advanceRung(entry, 'proved', { via: 'challenge', evidence: toRungEvidence(r) });
    expect(currentRung(entry)).toBe('none');
  });
});

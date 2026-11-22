/**
 * Which option is right must be ONE decision, the same in every grader.
 *
 * Read against the live bank (2026-11-22, 18,226 multiple-choice items) the two
 * graders — problem.checkAnswer (practice, review, tests) and gradeOne (the
 * mastery test-out, the course checks) — disagreed with each other and with the
 * items:
 *
 *   72 items  `correctOption` contradicts the item's own answer. gradeOne
 *             trusted the letter and marked the RIGHT answer wrong; checkAnswer
 *             accepted both the right answer and the wrong letter.
 *   19 items  a letter key with its text as an equivalent: gradeOne compared
 *             texts by value and passed two, three or all four options.
 *   14 items  an expanded-form distractor equal in value to the key ("81" for
 *             "80 + 1") graded correct.
 *   14 items  a fraction key against a rounded-decimal option: checkAnswer
 *             passed NO option, so the right answer was always wrong.
 *
 * The items below are copied from that export.
 */
const { resolveKey, keyLabelOf } = require('../../utils/mcOptions');
const { gradeOne } = require('../../utils/skillChallenge');
const { compareAnswer } = require('../../utils/answerComparison');
const { planFor } = require('../../scripts/retireUngradableMc');

const opts = (...texts) => texts.map((text, i) => ({ label: 'ABCD'[i], text }));
const item = (prompt, value, equivalents, options, correctOption) => ({
  problemId: prompt, prompt, answerType: 'multiple-choice',
  answer: { type: 'auto', value, equivalents }, options, correctOption,
});

/** Which labels each grader accepts. */
const accepted = (p) => ({
  challenge: 'ABCD'.split('').filter((l) => gradeOne(p, l).correct).join(''),
  practice: 'ABCD'.split('').filter((l) => compareAnswer(l, {
    value: p.answer.value, equivalents: p.answer.equivalents, answerType: p.answerType,
    options: p.options, correctOption: p.correctOption,
  })).join(''),
});

const ITEMS = {
  contradicted: item('Multiply: 5/3 × 4/5', '4/3', ['4/3'], opts('5', '6', '3', '4/3'), 'C'),
  contradictedLetter: item('Compare: 1/2 ___ 1/3', 'A', ['A', '1/2 > 1/3'],
    opts('1/2 > 1/3', 'Cannot compare', '1/2 < 1/3', '1/2 = 1/3'), 'B'),
  letterKey: item('Compare: 2/5 ___ 3/5', 'D', ['D', '2/5 < 3/5'],
    opts('Cannot compare', '2/5 = 3/5', '2/5 > 3/5', '2/5 < 3/5')),
  interval: item('Interval notation for x ≥ 3:', 'B', ['B', '[3, ∞)'], opts('(3, ∞]', '[3, ∞)', '(3, ∞)', '[3, ∞]')),
  expanded: item('What is 81 in expanded form?', '80 + 1', ['80 + 1'], opts('80 + 1', '81', '79', '82')),
  rounded: item('A train travels 97 miles in 3 hours. What is the rate in miles per hour?', '97/3', ['97/3'],
    opts('32.333333333333', '33.33', '31.33', '34.33')),
  declaredEqual: item('1/2 + 1/2 = ?', '2/2', ['1', '1/1', '2/2'], opts('4', '3', '2/2', '1')),
  bimodal: item('Find the mode: 12, 12, 13, 5, 13', '12 and 13', ['12', '12 and 13', '12, 13', '12/1', '13', '13/1'],
    opts('11', '14', '13', '12')),
  clean: item('What is 7 × 8?', '56', ['56'], opts('54', '56', '63', '48'), 'B'),
};

describe('both graders accept exactly the right option', () => {
  test.each([
    ['a letter that contradicts the answer: the answer wins', 'contradicted', 'D'],
    ['the same when the answer is itself a letter', 'contradictedLetter', 'A'],
    ['a letter key is compared as a letter, not by the value of its text', 'letterKey', 'D'],
    ['interval notation: only the keyed bracket form', 'interval', 'B'],
    ['equal in value is not the answer: 81 is not "80 + 1"', 'expanded', 'A'],
    ['a fraction key finds its rounded-decimal option', 'rounded', 'A'],
    ['an ordinary item is unchanged', 'clean', 'B'],
  ])('%s', (_name, which, right) => {
    expect(accepted(ITEMS[which])).toEqual({ challenge: right, practice: right });
  });

  test('two options the item DECLARES equal are both right — 1 and 2/2', () => {
    expect(accepted(ITEMS.declaredEqual)).toEqual({ challenge: 'CD', practice: 'CD' });
  });

  test('picking by the option text grades the same as picking its letter', () => {
    expect(gradeOne(ITEMS.contradicted, '4/3').correct).toBe(true);
    expect(gradeOne(ITEMS.contradicted, '3').correct).toBe(false);
    expect(gradeOne(ITEMS.expanded, '81').correct).toBe(false);
  });
});

describe('resolveKey', () => {
  const key = (p) => resolveKey({
    options: p.options, value: p.answer.value, equivalents: p.answer.equivalents, correctOption: p.correctOption,
  });

  test('reports a contradiction, and which option won', () => {
    expect(key(ITEMS.contradicted)).toEqual({ label: 'D', also: [], conflict: true });
    expect(key(ITEMS.clean)).toEqual({ label: 'B', also: [], conflict: false });
  });

  test('lists options declared equivalent, never a letter', () => {
    expect(key(ITEMS.declaredEqual)).toEqual({ label: 'C', also: ['D'], conflict: false });
    expect(key(ITEMS.letterKey).also).toEqual([]);
  });

  test('says nothing when the item does not say — the caller falls back', () => {
    expect(key(ITEMS.bimodal)).toBeNull();
    expect(resolveKey({ options: [], value: '5' })).toBeNull();
    expect(keyLabelOf({})).toBeNull();
  });

  test('a letter that is also an option\'s text is read as the text', () => {
    // "Which point is C?" with options A, B, C, D as the points themselves.
    const p = item('Which point is at (2, 3)?', 'C', ['C'], opts('B', 'C', 'D', 'A'));
    expect(key(p).label).toBe('B');
  });

  test('the key shown after grading is the one that was graded', () => {
    expect(keyLabelOf(ITEMS.contradicted)).toBe('D');
  });
});

describe('what is retired (scripts/retireUngradableMc.js)', () => {
  test('an item with no single right option is retired', () => {
    expect(planFor(ITEMS.bimodal).action).toBe('deactivate');
  });

  test('a contradicted letter is only counted — fixMcKeyDefects re-solves and rewrites it', () => {
    expect(planFor(ITEMS.contradicted)).toEqual({ action: 'wrongLetter', stored: 'C', answerIs: 'D' });
    expect(planFor(ITEMS.contradictedLetter)).toMatchObject({ action: 'wrongLetter', answerIs: 'A' });
  });

  test('declared-equal options are reported and left alone; clean items are untouched', () => {
    expect(planFor(ITEMS.declaredEqual).action).toBe('twoRight');
    for (const which of ['clean', 'letterKey', 'expanded', 'rounded', 'interval']) {
      expect({ which, action: planFor(ITEMS[which]).action }).toEqual({ which, action: null });
    }
  });

  test('an inactive item and an item with no options are skipped', () => {
    expect(planFor({ ...ITEMS.bimodal, isActive: false }).action).toBeNull();
    expect(planFor({ prompt: 'x', answer: { value: '1' }, options: [] }).action).toBeNull();
  });
});

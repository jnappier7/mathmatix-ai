/**
 * Multi-root grading: a student naming one correct root of a quadratic /
 * absolute-value problem is graded "correct but incomplete" — affirmed and
 * asked for the rest — never wrong, never triggering reset or downgrade. The
 * cycle closes only once every root has been supplied by the student.
 *
 * Covers the solver root set, the matchRootsInText helper, gradeRootSet, the
 * diagnose end-to-end flow across turns, and the decide correct_partial branch.
 */
const { solveQuadratic, solveAbsoluteValue, matchRootsInText } = require('../../utils/mathSolver');
const { diagnose, gradeRootSet } = require('../../utils/pipeline/diagnose');
const { observe, MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');

// x^2 - 5x + 6 = 0  →  roots 3 and 2
const QUAD = { a: 1, bSign: '-', b: 5, cSign: '+', c: 6 };

// ---------------------------------------------------------------------------
// Solvers emit a structured root set
// ---------------------------------------------------------------------------
describe('solvers emit roots', () => {
  test('solveQuadratic returns both roots', () => {
    const r = solveQuadratic(QUAD);
    expect(r.success).toBe(true);
    expect(r.answer).toBe('x = 3 or x = 2');
    expect(r.roots).toEqual([3, 2]);
  });

  test('double-root quadratic returns a single root', () => {
    // x^2 - 4x + 4 = 0  →  double root 2
    const r = solveQuadratic({ a: 1, bSign: '-', b: 4, cSign: '+', c: 4 });
    expect(r.roots).toEqual([2]);
  });

  test('absolute value equation returns both solutions', () => {
    // |x - 1| = 3  →  x = 4 or x = -2
    const r = solveAbsoluteValue({ coefficient: 1, operator: '-', constant: 1, result: 3 });
    expect(r.roots).toEqual([-2, 4]);
  });
});

// ---------------------------------------------------------------------------
// matchRootsInText — format-agnostic extraction
// ---------------------------------------------------------------------------
describe('matchRootsInText', () => {
  test('bare number', () => {
    expect(matchRootsInText('3', [3, 2])).toEqual([3]);
  });
  test('x = form', () => {
    expect(matchRootsInText('x = 2', [3, 2])).toEqual([2]);
  });
  test('both roots together', () => {
    expect(matchRootsInText('3 and 2', [3, 2])).toEqual([3, 2]);
  });
  test('prose with the value embedded', () => {
    expect(matchRootsInText('I think it is x equals 3', [3, 2])).toEqual([3]);
  });
  test('negative roots', () => {
    expect(matchRootsInText('-2', [-2, 4])).toEqual([-2]);
  });
  test('fraction roots', () => {
    expect(matchRootsInText('3/2', [1.5, -1])).toEqual([1.5]);
  });
  test('a value not in the set matches nothing', () => {
    expect(matchRootsInText('5', [3, 2])).toEqual([]);
  });
  test('empty / missing inputs are safe', () => {
    expect(matchRootsInText('', [3, 2])).toEqual([]);
    expect(matchRootsInText('3', [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// gradeRootSet — cross-turn accumulation
// ---------------------------------------------------------------------------
describe('gradeRootSet', () => {
  test('first correct root → partial, not wrong', () => {
    const g = gradeRootSet('3', [3, 2], null);
    expect(g.isCorrect).toBeNull();
    expect(g.partial).toBe(true);
    expect(g.foundRoots).toEqual([3]);
    expect(g.remainingCount).toBe(1);
  });

  test('second root completes the set → fully correct', () => {
    const g = gradeRootSet('2', [3, 2], { foundRoots: [3] });
    expect(g.isCorrect).toBe(true);
    expect(g.partial).toBe(false);
    expect(g.foundRoots).toEqual([3, 2]);
    expect(g.remainingCount).toBe(0);
  });

  test('both roots in one message → fully correct', () => {
    const g = gradeRootSet('3 and 2', [3, 2], null);
    expect(g.isCorrect).toBe(true);
    expect(g.remainingCount).toBe(0);
  });

  test('value outside the set → incorrect', () => {
    const g = gradeRootSet('5', [3, 2], null);
    expect(g.isCorrect).toBe(false);
    expect(g.partial).toBe(false);
  });

  test('restating an already-found root → still partial, never marked wrong', () => {
    const g = gradeRootSet('3', [3, 2], { foundRoots: [3] });
    expect(g.isCorrect).toBeNull(); // a correct (if redundant) root is not "wrong"
    expect(g.partial).toBe(true);
    expect(g.foundRoots).toEqual([3]); // no double count
    expect(g.remainingCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// diagnose — end to end across turns
// ---------------------------------------------------------------------------
describe('diagnose multi-root flow', () => {
  const aiMsg = {
    content: 'Solve x^2 - 5x + 6 = 0.',
    problemInfo: { type: 'quadratic', correctAnswer: 'x = 3 or x = 2', roots: [3, 2] },
  };
  const makeObs = (text) => ({
    answer: { value: text, raw: text },
    raw: text,
    messageType: 'answer_attempt',
    streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
    problemContext: 'numeric',
  });

  test('one root → correct_partial with progress, never incorrect', async () => {
    const res = await diagnose(makeObs('3'), {
      recentAssistantMessages: [aiMsg],
      recentUserMessages: [],
      lastProblemState: null,
    });
    expect(res.type).toBe('correct_partial');
    expect(res.isCorrect).toBeNull();
    expect(res.multiRoot.foundRoots).toEqual([3]);
    expect(res.multiRoot.remainingCount).toBe(1);
    expect(res.verificationSource).toBe('root_set');
  });

  test('second root with accumulated state → fully correct', async () => {
    const res = await diagnose(makeObs('2'), {
      recentAssistantMessages: [aiMsg],
      recentUserMessages: [],
      lastProblemState: { foundRoots: [3] },
    });
    expect(res.type).toBe('correct');
    expect(res.isCorrect).toBe(true);
  });

  test('both roots at once → fully correct', async () => {
    const res = await diagnose(makeObs('3 and 2'), {
      recentAssistantMessages: [aiMsg],
      recentUserMessages: [],
      lastProblemState: null,
    });
    expect(res.type).toBe('correct');
    expect(res.isCorrect).toBe(true);
  });

  test('value outside the set → incorrect', async () => {
    const res = await diagnose(makeObs('5'), {
      recentAssistantMessages: [aiMsg],
      recentUserMessages: [],
      lastProblemState: null,
    });
    expect(res.type).toBe('incorrect');
    expect(res.isCorrect).toBe(false);
  });

  test('single-answer problems still use the solver path', async () => {
    const res = await diagnose(
      { answer: { value: '15', raw: '15' }, raw: '15', messageType: 'answer_attempt', streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 }, problemContext: 'numeric' },
      { recentAssistantMessages: [{ content: 'What is 7 plus 8?' }], recentUserMessages: [] }
    );
    expect(res.isCorrect).toBe(true);
    expect(res.verificationSource).toBe('solver');
  });
});

// ---------------------------------------------------------------------------
// decide — correct_partial branch
// ---------------------------------------------------------------------------
describe('decide correct_partial', () => {
  const partialDiag = {
    type: 'correct_partial',
    isCorrect: null,
    answer: '3',
    correctAnswer: 'x = 3 or x = 2',
    misconception: null,
    multiRoot: { foundRoots: [3], totalCount: 2, remainingCount: 1, matchedThisTurn: [3] },
  };
  const makeObs = () => ({
    messageType: MESSAGE_TYPES.ANSWER_ATTEMPT,
    answer: { value: '3' },
    contextSignals: [],
    streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
  });

  test('acknowledges progress, does not confirm or guide-incorrect', () => {
    const dec = decide(makeObs(), partialDiag, {});
    expect(dec.action).toBe(ACTIONS.ACKNOWLEDGE_PROGRESS);
    expect(dec.action).not.toBe(ACTIONS.CONFIRM_CORRECT);
    expect(dec.action).not.toBe(ACTIONS.GUIDE_INCORRECT);
  });

  test('directs the tutor to affirm and ask for the rest without revealing it', () => {
    const dec = decide(makeObs(), partialDiag, {});
    expect(dec.directives.join(' ')).toMatch(/CORRECT BUT INCOMPLETE/);
    expect(dec.directives.join(' ')).toMatch(/Do NOT (state|reset)/i);
  });
});

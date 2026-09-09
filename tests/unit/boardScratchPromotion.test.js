/**
 * BOARD — a line of the student's working must never become the PROBLEM.
 *
 * Owner-hit (2026-09-09, prod conversation replayed here verbatim). While the
 * fractions problem "3/7" was still pinned, the student typed:
 *
 *   "im so bad at this. solve 3x - 7 = 11. i did 3x = 11 - 7 = 4 so x = 4/3"
 *
 * The board posed "11 - 7" as the PROBLEM card (the sub-expression of the
 * student's own sign-error step), the pin followed it, and from then on the
 * grader checked the wrong problem: "11 - 7 = 4 … so x = 4/3 right?" was
 * CORRECT, "divide by 3. x = 4/3. final answer" was CORRECT, +18 XP twice,
 * green ✓ Solved on a card titled "11 - 7". The verifier design was sound —
 * it verified the wrong problem.
 *
 * Four seams close this, each pinned below:
 *   1. the synthesizer poses the CLAUSE the cue verb introduces
 *      ("solve 3x - 7 = 11"), not whatever the whole message parses to;
 *   2. a numeric fragment beside an algebra equation in a student message is
 *      never promoted, and a worked line (LaTeX-wrapped solution, "= … =" chain)
 *      never reads as a problem statement;
 *   3. a verify card may not CLOSE a pinned variable equation with a value that
 *      does not solve it (a correct verdict on a sub-question is not a solve);
 *   4. every pose source — the model's own tags included — passes through
 *      dropScratchFragmentPoses in the pipeline before the pin is updated.
 */

const fs = require('fs');
const {
  synthesizeBoardCommands,
  dropScratchFragmentPoses,
  _looksLikeProblemStatement,
  _extractStatedProblemClause,
  _detectStudentStatedProblem,
  _answerClosesPin,
} = require('../../utils/pipeline/boardSynthesizer');

// ── The prod transcript, verbatim ─────────────────────────────────────────
const S1 = 'im so bad at this. solve 3x - 7 = 11. i did 3x = 11 - 7 = 4 so x = \\(\\frac{4}{3}\\)';
const T1 = 'No worries! Step by step together. \n\nYou started with the equation \\(3x - 7 = 11\\). \n\nYou moved to \\(3x = 11 - 7\\), which is a great first step! \n\nBut what does \\(11 - 7\\) actually equal? Can you calculate that for me?';
const S2 = '11 - 7 = 4. thats what i said. so x = \\(\\frac{4}{3}\\) right?';
const T2 = "You're right that \\(11 - 7 = 4\\). So you have \\(3x = 4\\). \n\nNow, how do you isolate \\(x\\) from \\(3x = 4\\)? What would be your next step?";
const S3 = 'divide by 3. x = 4/3. final answer';
const T3 = 'You nailed it! So, \\(x = \\frac{4}{3}\\) is indeed the correct answer. 🎉 Great job working through that! \n\nWhat do you want to tackle next?';
const S4 = 'But my teacher sayshat stupid biwait can you check that by plugging \\(\\frac{4}{3}\\) back into 3x - 7 = 11 its wrong. T';
const T4 = "Let's check your answer by plugging \\(x = \\frac{4}{3}\\) back into the original equation \\(3x - 7 = 11\\). \n\nSo, if we substitute \\(x\\), we have:\n\n\\[ \n3\\left(\\frac{4}{3}\\right) - 7 \n\\]\n\nWhat does that simplify to? Can you calculate that for me?";

const PROBLEM = '3x - 7 = 11';
const poses = (cards) => cards.filter(c => c.action === 'pose').map(c => c.tex);

describe('the replayed session — the PROBLEM card is the problem the student named', () => {
  test('turn 1, fractions still pinned: clear + pose "3x - 7 = 11", never "11 - 7"', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: S1, tutorResponse: T1,
      diagnosis: { type: 'incorrect', isCorrect: false, correctAnswer: '6' },
      observation: { messageType: 'answer_attempt' },
      lastBoardAction: 'scaffold', pinnedProblem: '3/7',
    });
    expect(poses(cards)).toEqual([PROBLEM]);
    expect(cards.map(c => c.action).indexOf('clear')).toBeLessThan(cards.map(c => c.action).indexOf('pose'));
  });

  test('turn 1 on an empty board poses the same thing', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: S1, tutorResponse: T1,
      diagnosis: { type: 'incorrect', isCorrect: false, correctAnswer: '6' },
      observation: { messageType: 'answer_attempt' },
      lastBoardAction: null, pinnedProblem: null,
    });
    expect(poses(cards)).toEqual([PROBLEM]);
  });

  test('turn 2, "11 - 7 = 4 … so x = 4/3 right?": no pose, no verify, no seal', () => {
    // The engine may well say the arithmetic 11 - 7 = 4 is correct (it is).
    // That verdict is about the tutor's sub-question, not the problem.
    const cards = synthesizeBoardCommands({
      studentMessage: S2, tutorResponse: T2,
      diagnosis: { type: 'correct', isCorrect: true, correctAnswer: '4' },
      observation: { messageType: 'answer_attempt' },
      lastBoardAction: 'resolve', pinnedProblem: PROBLEM,
    });
    expect(poses(cards)).toEqual([]);
    expect(cards.some(c => c.action === 'verify')).toBe(false);
  });

  test('turn 3, "x = 4/3. final answer" graded against the tutor\'s intermediate: no verify', () => {
    // 4/3 solves "3x = 4" (what the tutor wrote down), not 3x - 7 = 11.
    const cards = synthesizeBoardCommands({
      studentMessage: S3, tutorResponse: T3,
      diagnosis: { type: 'correct', isCorrect: true, correctAnswer: '4/3' },
      observation: { messageType: 'answer_attempt', answer: { value: '4/3' } },
      lastBoardAction: 'resolve', pinnedProblem: PROBLEM,
    });
    expect(cards.some(c => c.action === 'verify')).toBe(false);
    expect(poses(cards)).toEqual([]);
  });

  test('a real solve still seals: "x = 6" with the engine agreeing → verify', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'x = 6', tutorResponse: 'Yes! x = 6 is exactly right.',
      diagnosis: { type: 'correct', isCorrect: true, correctAnswer: '6' },
      observation: { messageType: 'answer_attempt', answer: { value: '6' } },
      lastBoardAction: 'resolve', pinnedProblem: PROBLEM,
    });
    expect(cards).toContainEqual({ action: 'verify', tex: 'x = 6' });
  });

  test('turn 4, "plugging 4/3 back into 3x - 7 = 11" on an empty board: "4/3" is not a problem', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: S4, tutorResponse: T4,
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'verify', pinnedProblem: null,
    });
    expect(poses(cards)).not.toContain('4/3');
  });
});

describe('the problem is the clause the cue verb introduces', () => {
  test('_extractStatedProblemClause splits the ask from the attempt', () => {
    expect(_extractStatedProblemClause(S1)).toBe('3x - 7 = 11');
    expect(_extractStatedProblemClause('solve for x: 2x + 3 = 9')).toBe('2x + 3 = 9');
    expect(_extractStatedProblemClause('Solve 2.5x = 10.')).toBe('2.5x = 10'); // decimal survives
    expect(_extractStatedProblemClause('factor x^2 - 7x + 10')).toBe('x^2 - 7x + 10');
  });

  test('no cue → no clause', () => {
    expect(_extractStatedProblemClause(S2)).toBeNull();
    expect(_extractStatedProblemClause('3x = 21')).toBeNull();
    expect(_extractStatedProblemClause('')).toBeNull();
    expect(_extractStatedProblemClause(null)).toBeNull();
  });

  test('_detectStudentStatedProblem: the equation, even with the attempt attached', () => {
    expect(_detectStudentStatedProblem(S1)).toMatchObject({ tex: PROBLEM });
  });

  test('_detectStudentStatedProblem: a numeric fragment beside an algebra equation is never promoted', () => {
    expect(_detectStudentStatedProblem(S2)).toBeNull();
    expect(_detectStudentStatedProblem(S4)).toBeNull();
  });

  test('_detectStudentStatedProblem: a bare arithmetic ask is still a problem', () => {
    expect(_detectStudentStatedProblem('solve 12 + 8')).toMatchObject({ tex: '12 + 8' });
  });
});

describe('_looksLikeProblemStatement — worked lines are not asks', () => {
  test('a LaTeX-wrapped stated solution is the end of work', () => {
    expect(_looksLikeProblemStatement('x = \\(\\frac{4}{3}\\)')).toBe(false);
    expect(_looksLikeProblemStatement('so x = \\(\\frac{4}{3}\\) right?')).toBe(false);
    expect(_looksLikeProblemStatement('x = $-3$')).toBe(false);
  });

  test('an "= … =" chain with a numeric middle is a worked line', () => {
    expect(_looksLikeProblemStatement('3x = 11 - 7 = 4')).toBe(false);
    expect(_looksLikeProblemStatement(S1)).toBe(false); // whole message; the clause is what gets posed
  });

  test('the chain rule needs a numeric middle — a variable between the equals signs is not a worked line', () => {
    expect(_looksLikeProblemStatement('3x - 7 = 2y = 11')).toBe(true);
  });

  test('the existing acceptances hold', () => {
    expect(_looksLikeProblemStatement('3x - 7 = 11')).toBe(true);
    expect(_looksLikeProblemStatement('solve 2x = 10')).toBe(true);
    expect(_looksLikeProblemStatement('2x^2+4x-6=0')).toBe(true);
  });
});

describe('_answerClosesPin — a verify must answer the pinned problem', () => {
  test('a value that does not solve the pinned equation cannot close it', () => {
    expect(_answerClosesPin('4/3', PROBLEM, { correctAnswer: '4/3' })).toBe(false); // graded vs "3x = 4"
    expect(_answerClosesPin('4', PROBLEM, { correctAnswer: '4' })).toBe(false);     // graded vs "11 - 7"
    expect(_answerClosesPin('4/3', PROBLEM, {})).toBe(false);                       // no target: judge the value
  });

  test('the actual solution closes it', () => {
    expect(_answerClosesPin('6', PROBLEM, { correctAnswer: '6' })).toBe(true);
    expect(_answerClosesPin('6', PROBLEM, {})).toBe(true);
  });

  test('defers to the engine when the pin is not a solvable variable equation', () => {
    // Arithmetic pins arrive as the model's LaTeX and the engine can misread
    // them — a wrong pin answer must not veto a right verify.
    expect(_answerClosesPin('8', '3\\frac{1}{2} \\times 2\\frac{2}{7}', { correctAnswer: '8' })).toBe(true);
    expect(_answerClosesPin('8', null, { correctAnswer: '8' })).toBe(true);
    // Root sets are judged by diagnose's accumulator, not here.
    expect(_answerClosesPin('2', 'x^2 - 5x + 6 = 0', { correctAnswer: '2' })).toBe(true);
  });
});

describe('dropScratchFragmentPoses — the same rule for every pose source', () => {
  test('the model\'s own pose of the student\'s scratch is dropped, with its paired clear', () => {
    const { kept, dropped } = dropScratchFragmentPoses(
      [{ action: 'clear' }, { action: 'pose', tex: '11 - 7' }, { action: 'resolve', tex: '3x = 11 - 7' }],
      S1
    );
    expect(kept).toEqual([{ action: 'resolve', tex: '3x = 11 - 7' }]);
    expect(dropped.map(c => c.action).sort()).toEqual(['clear', 'pose']);
  });

  test('the real problem passes', () => {
    const cmds = [{ action: 'clear' }, { action: 'pose', tex: PROBLEM }];
    expect(dropScratchFragmentPoses(cmds, S1).kept).toEqual(cmds);
  });

  test('a self-contained substitution check still poses', () => {
    const cmds = [{ action: 'pose', tex: '4(6) + 3' }];
    expect(dropScratchFragmentPoses(cmds, '4(6) + 3 = 27').kept).toEqual(cmds);
  });

  test('no student text → nothing to judge, nothing dropped', () => {
    const cmds = [{ action: 'pose', tex: '11 - 7' }];
    expect(dropScratchFragmentPoses(cmds, null).kept).toEqual(cmds);
    expect(dropScratchFragmentPoses(cmds, '').dropped).toEqual([]);
  });
});

describe('pipeline wiring (source contract)', () => {
  const src = fs.readFileSync(require.resolve('../../utils/pipeline/index.js'), 'utf8');

  test('the guard runs after every pose source and BEFORE the auto-clear and the pin update', () => {
    const guard = src.indexOf('dropScratchFragmentPoses(verified.boardCommands, message)');
    const autoClear = src.indexOf('synthesizeAutoClear({');
    const pinUpdate = src.indexOf('ctx.conversation.boardProblem = { tex: poseCard.tex');
    const backstop = src.indexOf('Board-reference backstop posed problem');
    expect(guard).toBeGreaterThan(-1);
    expect(backstop).toBeGreaterThan(-1);
    expect(backstop).toBeLessThan(guard);
    expect(guard).toBeLessThan(autoClear);
    expect(autoClear).toBeLessThan(pinUpdate);
  });
});

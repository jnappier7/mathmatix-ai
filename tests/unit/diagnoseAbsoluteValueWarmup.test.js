/**
 * Replay of the 2026-09-30 Absolute Value warm-up (prod conversation
 * 6abd8012d8d7e842427f01dc), turn by turn, through observe → diagnose.
 *
 *   tutor:   What's the absolute value of \(-7\)?            student: 7   ✓ (was ✓)
 *   tutor:   What is the absolute value of \(3 - 10\)?       student: 7   ✓ (was ✗ — "I see where you're coming from, but…")
 *   tutor:   what do you get when you calculate \(3 - 10\)?  student: -7  ✓ (was ✓)
 *   tutor:   Now, what is the absolute value of \(-7\)?      student: 7   ✓ (was ✗ — "You're right that |-7| is 7, but…")
 *
 * The stamped problemInfo on the second tutor turn was {type:'evaluation',
 * correctAnswer:'-7'}: the parser had kept the operand and dropped the wrapper.
 * The board pin for the whole session was "| -7 |", which the parser could not
 * read either, so nothing corrected it. tests/unit/mathSolverWrappedOperand.test.js
 * pins the parser; this file pins the verdicts, on both the persist-time fast
 * path (stored problemInfo) and the re-parse slow path.
 */

jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { parseCleanProblem } = require('../../utils/mathSolver');

const TUTOR = {
  t1: "Awesome! Let's jump back into absolute value. How about we start with a quick warm-up problem? \n\nWhat's the absolute value of \\(-7\\)? What do you think?",
  t2: "That's right! The absolute value of \\(-7\\) is indeed \\(7\\). Nice work! \n\nNow, let's try another one. What is the absolute value of \\(3 - 10\\)? What do you think it is?",
  t3: "I see where you're coming from, but let’s think about it a bit more. \n\nFirst, what do you get when you calculate \\(3 - 10\\)? What does that equal?",
  t4: 'Exactly! \\(3 - 10\\) equals \\(-7\\). Now, what is the absolute value of \\(-7\\)?',
};
const STALE_PIN = '| -7 |'; // boardProblem.tex for the whole session in prod

// What persist.js stamps on a tutor message: parseCleanProblem's type + answer.
function stampedLikePersist(content) {
  const r = parseCleanProblem(content);
  if (!r.hasMath || !r.solution?.success) return { content };
  return { content, problemInfo: { type: r.problem.type, correctAnswer: String(r.solution.answer) } };
}

async function grade(studentText, tutorTurns, { stamped, pin = STALE_PIN } = {}) {
  const recentAssistantMessages = tutorTurns.map((c) => (stamped ? stampedLikePersist(c) : { content: c }));
  const observation = observe(studentText, { recentUserMessages: [], recentAssistantMessages });
  return diagnose(observation, { recentAssistantMessages, recentUserMessages: [], pinnedProblemTex: pin });
}

describe.each([
  ['fast path — problemInfo stamped at persist time', true],
  ['slow path — re-parsed from the message text', false],
])('%s', (_label, stamped) => {
  test('persist no longer stamps -7 as the answer to |3 - 10|', () => {
    const m = stampedLikePersist(TUTOR.t2);
    expect(m.problemInfo).toEqual({ type: 'absolute_value', correctAnswer: '7' });
  });

  test('turn 1: |-7| → "7" is correct', async () => {
    const d = await grade('7', [TUTOR.t1], { stamped });
    expect(d.isCorrect).toBe(true);
  });

  test('turn 2 (the trust killer): |3 - 10| → "7" is CORRECT, not "I see where you\'re coming from"', async () => {
    const d = await grade('7', [TUTOR.t1, TUTOR.t2], { stamped });
    expect(d.isCorrect).toBe(true);
    expect(d.type).toBe('correct');
  });

  test('turn 2: a genuinely wrong "-7" is still caught', async () => {
    const d = await grade('-7', [TUTOR.t1, TUTOR.t2], { stamped });
    expect(d.isCorrect).toBe(false);
  });

  test('turn 3: the sub-question 3 - 10 → "-7" is correct', async () => {
    const d = await grade('-7', [TUTOR.t1, TUTOR.t2, TUTOR.t3], { stamped });
    expect(d.isCorrect).toBe(true);
  });

  test('turn 4 (the second rejection): |-7| → "7" is CORRECT', async () => {
    const d = await grade('7', [TUTOR.t1, TUTOR.t2, TUTOR.t3, TUTOR.t4], { stamped });
    expect(d.isCorrect).toBe(true);
    expect(d.type).toBe('correct');
  });
});

describe('the posed-arithmetic tier (symbolicVerifier.detectPosedArithmetic)', () => {
  const { detectPosedArithmetic } = require('../../utils/pipeline/symbolicVerifier');

  test('does not read the operand out of an absolute value', () => {
    expect(detectPosedArithmetic(TUTOR.t2)).toBeNull();
    expect(detectPosedArithmetic('What is |4 - 10|?')).toBeNull();
    expect(detectPosedArithmetic('What is the absolute value of 3 - 10?')).toBeNull();
    expect(detectPosedArithmetic('What is the opposite of 3 - 10?')).toBeNull();
  });

  test('still reads a plainly posed sub-step', () => {
    expect(detectPosedArithmetic("what's 50 × 3?")).toBe('50*3');
    expect(detectPosedArithmetic(TUTOR.t3)).toBe('3-10');
  });

  test('ungrouped prose "absolute value of 3 - 10" → "7" gets NO deterministic verdict (never a false negative)', async () => {
    // No stamp (the parser refuses the ambiguous prose), no pin. Before the
    // guard on this tier, the scan graded 7 against 3 - 10 = -7 → incorrect.
    const d = await grade('7', ['What is the absolute value of 3 - 10?'], { stamped: true, pin: null });
    expect(d.isCorrect).not.toBe(false);
    expect(d.verificationSource).not.toBe('symbolic:arithmetic');
  });
});

describe('the board pin', () => {
  test('"| -7 |" now parses, so the pin can be authoritative instead of silent', () => {
    const r = parseCleanProblem(STALE_PIN);
    expect(r.hasMath).toBe(true);
    expect(String(r.solution.answer)).toBe('7');
  });

  test('a fresh pin on the second problem grades it', async () => {
    const d = await grade('6', ['Now try \\(|4 - 10|\\). What do you get?'], { stamped: true, pin: '|4 - 10|' });
    expect(d.isCorrect).toBe(true);
  });

  test('a stale pin that disagrees with the new question DEFERS rather than accusing', async () => {
    // Pin says 7 (old problem), question says 6. Neither number gets stamped as a
    // verdict against the student — no verdict is the safe direction here.
    const d = await grade('6', ['Now try \\(|4 - 10|\\). What do you get?'], { stamped: true, pin: STALE_PIN });
    expect(d.isCorrect).not.toBe(false);
  });
});

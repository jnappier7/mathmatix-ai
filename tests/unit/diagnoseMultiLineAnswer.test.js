/**
 * Production regression (DB inspection, 2026-07-26): a student solved the
 * proportion 5/7 = x/20 with fully shown work —
 *
 *     520=7x        ← cross-multiplication, "5·20" written without the operator
 *     100=7x
 *     100/7 = x
 *     CONFIRMED!
 *
 * — and the pipeline graded it INCORRECT, arming wrong-answer support on a
 * correct solve (and, post-PR #1324, resetting demonstrated-competence trust).
 *
 * Three stacked causes, each pinned here:
 *   1. observe.extractAnswer got nothing from multi-line work, so the message
 *      classified general_math instead of answer_attempt.
 *   2. The pinned board problem arrives as LaTeX (\frac{5}{7} = \frac{x}{20}),
 *      which parseCleanProblem couldn't parse — so verifyDerivation had no
 *      external target and anchored the chain on the student's own FIRST line
 *      (520=7x → x = 520/7), marking the two CORRECT lines as the broken steps.
 *   3. verifyDerivation failed the whole chain on the first literally-wrong
 *      line even when the final line reached the right answer.
 *
 * The bar: this exact message must grade CORRECT with demonstratedReasoning.
 */

jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { observe, extractAnswer, MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { parseCleanProblem } = require('../../utils/mathSolver');
const { verifyDerivation } = require('../../utils/derivationVerifier');

const MSG = '520=7x\n100=7x\n100/7 = x\nCONFIRMED!';
const PIN_PLAIN = '5/7 = x/20';
const PIN_LATEX = '\\frac{5}{7} = \\frac{x}{20}';

const obs = () => observe(MSG, { recentUserMessages: [], recentAssistantMessages: [] });
const recentAI = [{ content: 'Try this proportion: \\(\\frac{5}{7} = \\frac{x}{20}\\)' }];

describe('multi-line answer extraction (observe)', () => {
  it('takes the LAST math line as the answer candidate, earlier lines as work', () => {
    const a = extractAnswer(MSG);
    expect(a).not.toBeNull();
    expect(a.value).toBe('100/7');
    expect(a.hasExplanation).toBe(true);
  });

  it('classifies the message as an answer attempt, not a bare problem drop', () => {
    const o = obs();
    expect(o.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(o.isBareProblemDrop).toBe(false);
  });

  it('reads the mirrored assignment form "value = x"', () => {
    expect(extractAnswer('100=7x\n100/7 = x').value).toBe('100/7');
  });

  it('does not treat an equation line as an answer', () => {
    // Last math line is still work ("100=7x" has a coefficient·variable side);
    // the strict answer shapes must not fire on it.
    expect(extractAnswer('520=7x\n100=7x')).toBeNull();
  });
});

describe('LaTeX pinned problems parse (mathSolver)', () => {
  it('solves the \\frac proportion pin', () => {
    const r = parseCleanProblem(PIN_LATEX);
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('proportion');
    expect(Number(r.solution.answer)).toBeCloseTo(100 / 7, 3);
  });

  it('still rejects prose and unknown LaTeX', () => {
    expect(parseCleanProblem('\\text{Sarah bakes 3 batches every morning}').hasMath).toBe(false);
  });
});

describe('derivation chain (verifyDerivation)', () => {
  it('rescues the missing multiplication operator against a known target', () => {
    const chain = verifyDerivation(MSG, PIN_PLAIN);
    expect(chain.verifiable).toBe(true);
    expect(chain.valid).toBe(true);
    expect(chain.answerCorrect).toBe(true);
    expect(chain.steps[0].rescuedAs).toBe('5*20');
    expect(chain.firstBadStep).toBeNull();
  });

  it('anchors an unpinned chain on the LAST line, not the first', () => {
    const chain = verifyDerivation(MSG);
    expect(chain.targetSource).toBe('internal');
    expect(Number(chain.target)).toBeCloseTo(100 / 7, 3);
    expect(chain.answerCorrect).toBe(true);
  });

  it('final-line-wins: a broken earlier line never flips a correct answer', () => {
    // Student garbles a middle line beyond rescue but lands the right answer.
    const chain = verifyDerivation('3x - 5 = 16\n3x = 11\nx = 7', '3x - 5 = 16');
    expect(chain.answerCorrect).toBe(true);   // grading: correct
    expect(chain.valid).toBe(false);          // reasoning: not demonstrated
    expect(chain.firstBadStep).toBe('3x = 11');
  });

  it('a genuinely wrong final answer still grades incorrect with the step pinpointed', () => {
    const chain = verifyDerivation('3x - 5 = 16\n3x = 11\nx = 11/3', '3x - 5 = 16');
    expect(chain.answerCorrect).toBe(false);
    expect(chain.valid).toBe(false);
    expect(chain.firstBadStep).toBe('3x = 11');
  });
});

describe('end-to-end diagnose — the production message', () => {
  it.each([
    ['plain pin', PIN_PLAIN],
    ['LaTeX pin', PIN_LATEX],
  ])('grades CORRECT with demonstrated reasoning (%s)', async (_label, pin) => {
    const d = await diagnose(obs(), {
      recentAssistantMessages: recentAI,
      recentUserMessages: [],
      pinnedProblemTex: pin,
    });
    expect(d.type).toBe('correct');
    expect(d.isCorrect).toBe(true);
    expect(d.demonstratedReasoning).toBe(true);
    expect(d.verificationSource).toBe('derivation');
  });

  it('grades CORRECT even with no pin at all (chat-only session)', async () => {
    const d = await diagnose(obs(), {
      recentAssistantMessages: [],
      recentUserMessages: [],
      pinnedProblemTex: null,
    });
    expect(d.isCorrect).toBe(true);
  });
});

jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { observe, MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');
const { parseCleanProblem } = require('../../utils/mathSolver');

// Owner session, 2026-10-25. The student brought "can u help me with
// 3(x - 4) = 2x + 5", then wrote "distribute so 3x - 4 = 2x + 5" (3·4 is 12,
// not 4). Two things went silently wrong: the problem never pinned to the
// board, because the prose-equation extractor handed the parser the whole
// sentence; and the wrong rewrite produced NO verdict, so the tutor asked the
// student to "fill in the blank" instead of naming the distribution error.

const obs = (text) => observe(text, { recentUserMessages: [], recentAssistantMessages: [] });
const PIN = '3(x - 4) = 2x + 5';
const ctx = (extra = {}) => ({
  recentAssistantMessages: [{ content: 'What do you think is the first step to take?' }],
  recentUserMessages: [],
  pinnedProblemTex: PIN,
  ...extra,
});

describe('parseCleanProblem — a problem handed over in prose, without a cue verb', () => {
  it.each([
    ['can u help me with 3(x - 4) = 2x + 5', '17'],
    ['help me with 2x+3=10', '3.5'],
    ['im stuck on 3(x - 4) = 2x + 5', '17'],
    ['how do i do 3(x - 4) = 2x + 5', '17'],
    ['3(x - 4) = 2x + 5 how do i do this', '17'],
    ['i need help with 3x - 7 = 11', '6'],
    ['-2(x + 1) = 8 plz help', '-5'],
    ['You have: 3(x - 4) = 2x + 5 What first?', '17'],
  ])('%s → solves to %s', (text, answer) => {
    const r = parseCleanProblem(text);
    expect(r.hasMath).toBe(true);
    expect(r.problem.type).toBe('general_linear');
    expect(String(r.solution.answer)).toBe(answer);
  });

  it('still refuses a sentence that only mentions a formula', () => {
    expect(parseCleanProblem('my teacher said y = mx + b').hasMath).toBe(false);
  });
});

describe('diagnose — one rewritten equation on a pinned linear problem', () => {
  it('marks a wrong distribution as an INCORRECT step naming the line, never the answer', async () => {
    const d = await diagnose(obs('distribute so 3x - 4 = 2x + 5'), ctx());
    expect(d.isCorrect).toBe(false);
    expect(d.isStep).toBe(true);
    expect(d.isTransformation).toBe(true);
    expect(d.verificationSource).toBe('symbolic:equation_step');
    expect(d.derivation.firstBadStep).toBe('3x - 4 = 2x + 5');
    expect(d.correctAnswer).toBeNull();
  });

  it('affirms a correct distribution as a step, not a solve', async () => {
    const d = await diagnose(obs('distribute so 3x - 12 = 2x + 5'), ctx());
    expect(d.isCorrect).toBe(true);
    expect(d.isStep).toBe(true);
    expect(d.verificationSource).toBe('symbolic:equation_step');
  });

  it('grades a bare rewritten line when it keeps one side of the pin', async () => {
    const d = await diagnose(obs('3x - 4 = 2x + 5'), ctx());
    expect(d.isCorrect).toBe(false);
    expect(d.verificationSource).toBe('symbolic:equation_step');
  });

  it('leaves a bare equation that shares nothing with the pin alone — a new problem, not a step', async () => {
    const d = await diagnose(obs('5y + 2 = 12'), ctx());
    expect(d.isCorrect).toBeNull();
  });

  it('does not grade the problem restated verbatim', async () => {
    const d = await diagnose(obs('3(x - 4) = 2x + 5'), ctx());
    expect(d.isCorrect).toBeNull();
  });

  it('is silent without a pin', async () => {
    const d = await diagnose(obs('distribute so 3x - 4 = 2x + 5'), ctx({ pinnedProblemTex: null }));
    expect(d.isCorrect).toBeNull();
  });

  it('leaves a two-equation line to the derivation path', async () => {
    const d = await diagnose(obs('3x - 4 = 2x + 5 so x = 9'), ctx());
    expect(d.verificationSource).not.toBe('symbolic:equation_step');
  });
});

describe('decide — a verified-wrong step that observe filed as general math', () => {
  it('guides on the wrong move instead of falling to the catch-all', async () => {
    const o = obs('distribute so 3x - 4 = 2x + 5');
    expect(o.messageType).toBe(MESSAGE_TYPES.GENERAL_MATH);
    const d = await diagnose(o, ctx());
    const decision = decide(o, d, { streaks: o.streaks });
    expect(decision.action).toBe(ACTIONS.GUIDE_INCORRECT);
    const text = decision.directives.join('\n');
    expect(text).toMatch(/VERIFIED WRONG STEP/);
    expect(text).toMatch(/3x - 4 = 2x \+ 5/);
    expect(text).toMatch(/do NOT carry the problem past this step/i);
  });

  it('still confirms a verified-correct step', async () => {
    const o = obs('distribute so 3x - 12 = 2x + 5');
    const d = await diagnose(o, ctx());
    const decision = decide(o, d, { streaks: o.streaks });
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });
});

describe('diagnose — a finished solve typed on one line', () => {
  it('"x - 12 = 5 so x = 17" is a verified solve, and decide does not ask them to solve it again', async () => {
    const o = obs('x - 12 = 5 so x = 17');
    const d = await diagnose(o, ctx());
    expect(d.isCorrect).toBe(true);
    expect(d.verificationSource).toBe('derivation');
    expect(d.isStep).toBe(false);
    expect(d.demonstratedReasoning).toBe(true);
    const decision = decide(o, d, { streaks: o.streaks });
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
    expect(decision.directives.join('\n')).toMatch(/VERIFIED CORRECT SOLUTION/);
  });

  it('"3x - 12 = 2x + 5, then x - 12 = 5" is a correct chain that stops short — a step', async () => {
    const d = await diagnose(obs('3x - 12 = 2x + 5, then x - 12 = 5'), ctx());
    expect(d.isCorrect).toBe(true);
    expect(d.isStep).toBe(true);
  });

  it('pinpoints the broken piece of a one-line chain', async () => {
    const d = await diagnose(obs('3x - 4 = 2x + 5 so x = 9'), ctx());
    expect(d.isCorrect).toBe(false);
    expect(d.derivation.firstBadStep).toBe('3x - 4 = 2x + 5');
  });

  it('leaves an "= … =" chain on one line as one line', () => {
    const { splitWorkLines } = require('../../utils/derivationVerifier');
    expect(splitWorkLines('3x = 11 - 7 = 4')).toEqual(['3x = 11 - 7 = 4']);
    expect(splitWorkLines('x - 12 = 5 so x = 17')).toEqual(['x - 12 = 5', 'x = 17']);
  });
});

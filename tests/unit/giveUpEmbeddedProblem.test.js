/**
 * QA P1-1 — a give-up that carries its own fresh problem.
 *
 * Origin: the QA walkthrough sent "Just give me the answer to 3x + 7 = 22"
 * as the first turn. It classifies as GIVE_UP and routed to EXIT_RAMP
 * ("work a parallel problem, then try YOUR problem") — but no problem was
 * ever pinned, so the tutor dropped the equation and replied "Hey, let's
 * stick to math! What topic are you studying?".
 *
 * Fix: when a give-up STATES its own problem and nothing is established
 * yet, recognize the stated problem and guide the first step (HINT), warmly
 * declining to hand over the answer — instead of the parallel-problem exit
 * ramp. An established/ongoing give-up still routes to EXIT_RAMP.
 */

const { observe, messageStatesProblem } = require('../../utils/pipeline/observe');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');

const noAnswerDiagnosis = { type: 'no_answer', isCorrect: null, answer: null, correctAnswer: null };
const freshContext = { phaseState: null, activeSkill: null, hasRecentUpload: false };

function decideFor(message, ctx = freshContext, obsCtx = {}) {
  const obs = observe(message, { recentUserMessages: [], recentAssistantMessages: [], ...obsCtx });
  return { obs, decision: decide(obs, noAnswerDiagnosis, ctx) };
}

describe('messageStatesProblem', () => {
  test('true when a concrete problem is present', () => {
    expect(messageStatesProblem('Just give me the answer to 3x + 7 = 22')).toBe(true);
    expect(messageStatesProblem('solve 2x = 10')).toBe(true);
    expect(messageStatesProblem('factor x^2 - 9')).toBe(true);
    expect(messageStatesProblem('12 × 7')).toBe(true);
  });
  test('false for a bare answer-demand with no problem', () => {
    expect(messageStatesProblem('just give me the answer')).toBe(false);
    expect(messageStatesProblem('i give up')).toBe(false);
    expect(messageStatesProblem('')).toBe(false);
  });
});

describe('decide() — give-up carrying a fresh problem (QA P1-1)', () => {
  test('"Just give me the answer to 3x + 7 = 22" → HINT, guides the stated problem', () => {
    const { obs, decision } = decideFor('Just give me the answer to 3x + 7 = 22');
    expect(obs.messageType).toBe('give_up');
    expect(decision.action).toBe(ACTIONS.HINT);

    const joined = decision.directives.join('\n').toLowerCase();
    expect(joined).toMatch(/do not give it|decline/);           // refuses the answer
    expect(joined).toMatch(/their exact problem|their problem/); // engages the stated one
    expect(joined).toMatch(/what topic are you studying/);       // explicitly forbids the brush-off
    expect(joined).toMatch(/first step/);                        // guides forward
  });

  test('bare "just give me the answer" (no problem) still → EXIT_RAMP', () => {
    const { obs, decision } = decideFor('just give me the answer');
    expect(obs.messageType).toBe('give_up');
    expect(decision.action).toBe(ACTIONS.EXIT_RAMP);
  });

  test('give-up on an established problem (active skill) → EXIT_RAMP, not HINT', () => {
    const { decision } = decideFor(
      'Just give me the answer to 3x + 7 = 22',
      { phaseState: null, activeSkill: { skillId: 'linear-eq', displayName: 'Linear Equations' }, hasRecentUpload: false }
    );
    expect(decision.action).toBe(ACTIONS.EXIT_RAMP);
  });

  test('repeated give-up (prior giveUpCount) → EXIT_RAMP, not HINT', () => {
    const { decision } = decideFor(
      'just give me the answer to 3x + 7 = 22',
      freshContext,
      { recentUserMessages: [{ content: 'just tell me' }, { content: 'give me the answer' }] }
    );
    expect(decision.action).toBe(ACTIONS.EXIT_RAMP);
  });
});

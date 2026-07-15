/**
 * Verified-twin wiring into buildActionPrompt. When the pipeline attaches a
 * CAS-verified twin (decision.verifiedTwin) the WORKED_EXAMPLE / EXIT_RAMP
 * guidance hands the tutor that concrete, answer-checked parallel problem
 * instead of asking it to improvise one — while keeping every anti-cheat rule.
 * With no twin attached, behavior is unchanged (backward compatible).
 */
const { buildActionPrompt } = require('../../utils/pipeline/generate');
const { ACTIONS } = require('../../utils/pipeline/decide');

const twin = { twin: 'Solve for x: 3x - 5 = 16', answer: 'x = 7' };
const base = { directives: [] };

describe('buildActionPrompt — verified-twin wiring', () => {
  it('WORKED_EXAMPLE uses the verified twin (problem + reference answer) when present', () => {
    const s = buildActionPrompt({ ...base, action: ACTIONS.WORKED_EXAMPLE, verifiedTwin: twin });
    expect(s).toContain('3x - 5 = 16');           // the twin problem
    expect(s).toContain('x = 7');                 // verified answer, tutor reference only
    expect(s).toContain('verified parallel problem');
    expect(s).not.toContain('2x + 7 = 15');       // the improvised example is not used
    expect(s.toLowerCase()).toContain("student's own"); // still forbids solving their own
  });

  it('WORKED_EXAMPLE falls back to the improvised instruction when no twin', () => {
    const s = buildActionPrompt({ ...base, action: ACTIONS.WORKED_EXAMPLE });
    expect(s).toContain('ANTI-CHEAT RULE');
    expect(s).not.toContain('verified parallel problem');
  });

  it('EXIT_RAMP uses the verified twin and keeps the answer-hidden rule', () => {
    const s = buildActionPrompt({ ...base, action: ACTIONS.EXIT_RAMP, verifiedTwin: twin });
    expect(s).toContain('3x - 5 = 16');
    expect(s).toContain('NEVER reveal the answer');
  });

  it('EXIT_RAMP falls back cleanly with no twin', () => {
    const s = buildActionPrompt({ ...base, action: ACTIONS.EXIT_RAMP });
    expect(s).toContain('parallel problem (same skill, different numbers) step-by-step');
    expect(s).toContain('NEVER reveal the answer');
  });
});

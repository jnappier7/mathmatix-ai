/**
 * twinGenerator tests — the LLM is mocked, but the CAS verify gate
 * (symbolicVerifier) is REAL, so these prove that only answers the CAS actually
 * confirms are allowed to ship, and wrong ones are rejected.
 */
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { callLLM } = require('../../utils/llmGateway');
const { generateVerifiedTwin, verifyTwin, attachVerifiedTwin } = require('../../utils/twinGenerator');

const wrap = (obj) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });

beforeEach(() => callLLM.mockReset());

describe('verifyTwin — CAS gate (pure, no LLM)', () => {
  it('confirms a correct equation twin', () => {
    expect(verifyTwin({ answer: 'x = 7', problemTex: '3x - 5 = 16', checkType: 'equation', checkAgainst: '3x - 5 = 16' }))
      .toEqual({ verified: true, method: 'equation' });
  });
  it('REJECTS a wrong equation twin answer', () => {
    expect(verifyTwin({ answer: 'x = 8', problemTex: '3x - 5 = 16', checkType: 'equation', checkAgainst: '3x - 5 = 16' }).verified)
      .toBe(false);
  });
  it('confirms a correct antiderivative twin', () => {
    expect(verifyTwin({ answer: 'x^6 + C', problemTex: '\\int 6x^5 dx', checkType: 'antiderivative', checkAgainst: '\\int 6x^5 dx' }).verified)
      .toBe(true);
  });
  it('confirms a correct simplify/equivalence twin and rejects a wrong one', () => {
    expect(verifyTwin({ answer: '3x + 6', checkType: 'equivalence', checkAgainst: '3(x + 2)' }).verified).toBe(true);
    expect(verifyTwin({ answer: '3x + 5', checkType: 'equivalence', checkAgainst: '3(x + 2)' }).verified).toBe(false);
  });
  it('leaves checkType "none" unverified (CAS can\'t check it — safe)', () => {
    expect(verifyTwin({ answer: '42 apples', checkType: 'none', checkAgainst: '' }).verified).toBe(false);
  });
});

describe('generateVerifiedTwin — end to end (mocked LLM, real CAS)', () => {
  it('ships a twin only after the CAS confirms its answer', async () => {
    callLLM.mockResolvedValueOnce(wrap({
      twin: 'Solve for x: 3x - 5 = 16', problemTex: '3x - 5 = 16', answer: 'x = 7',
      checkType: 'equation', checkAgainst: '3x - 5 = 16',
    }));
    const r = await generateVerifiedTwin('Solve for x: 2x + 4 = 20');
    expect(r).toMatchObject({ ok: true, verified: true, answer: 'x = 7', method: 'equation' });
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  it('RETRIES when the first twin\'s answer fails the CAS, then ships the good one', async () => {
    callLLM
      .mockResolvedValueOnce(wrap({ twin: 'Solve 4x = 12', problemTex: '4x = 12', answer: 'x = 5', checkType: 'equation', checkAgainst: '4x = 12' })) // wrong: 4*5≠12
      .mockResolvedValueOnce(wrap({ twin: 'Solve 4x = 12', problemTex: '4x = 12', answer: 'x = 3', checkType: 'equation', checkAgainst: '4x = 12' })); // right
    const r = await generateVerifiedTwin('Solve 2x = 10');
    expect(r).toMatchObject({ ok: true, verified: true, answer: 'x = 3', attempts: 2 });
    expect(callLLM).toHaveBeenCalledTimes(2);
  });

  it('falls back (ok:false) when no attempt produces a CAS-verified answer', async () => {
    callLLM.mockResolvedValue(wrap({ twin: 'Solve 4x = 12', problemTex: '4x = 12', answer: 'x = 5', checkType: 'equation', checkAgainst: '4x = 12' }));
    const r = await generateVerifiedTwin('Solve 2x = 10');
    expect(r).toEqual({ ok: false, verified: false, reason: 'unverified' });
    expect(callLLM).toHaveBeenCalledTimes(2); // exhausted both attempts
  });

  it('anti-cheat: rejects a twin identical to the student\'s own problem', async () => {
    // Verbatim echo would leak the student's answer — must be rejected even
    // though its answer is correct. Second attempt gives a real (different) twin.
    callLLM
      .mockResolvedValueOnce(wrap({ twin: 'Solve 2x = 10', problemTex: '2x = 10', answer: 'x = 5', checkType: 'equation', checkAgainst: '2x = 10' }))
      .mockResolvedValueOnce(wrap({ twin: 'Solve 2x = 14', problemTex: '2x = 14', answer: 'x = 7', checkType: 'equation', checkAgainst: '2x = 14' }));
    const r = await generateVerifiedTwin('Solve 2x = 10');
    expect(r).toMatchObject({ ok: true, answer: 'x = 7', attempts: 2 });
  });

  it('tolerates malformed JSON and non-JSON, then recovers', async () => {
    callLLM
      .mockResolvedValueOnce({ choices: [{ message: { content: 'not json at all' } }] })
      .mockResolvedValueOnce(wrap({ twin: 'Simplify 5(x + 1)', problemTex: '5(x + 1)', answer: '5x + 5', checkType: 'equivalence', checkAgainst: '5(x + 1)' }));
    const r = await generateVerifiedTwin('Simplify 3(x + 2)');
    expect(r).toMatchObject({ ok: true, verified: true, answer: '5x + 5', method: 'equivalence' });
  });

  it('returns no_problem for empty input without calling the LLM', async () => {
    expect(await generateVerifiedTwin('')).toEqual({ ok: false, reason: 'no_problem' });
    expect(await generateVerifiedTwin('   ')).toEqual({ ok: false, reason: 'no_problem' });
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('survives an LLM throw and retries', async () => {
    callLLM
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce(wrap({ twin: 'Solve 5x = 20', problemTex: '5x = 20', answer: 'x = 4', checkType: 'equation', checkAgainst: '5x = 20' }));
    const r = await generateVerifiedTwin('Solve 3x = 9');
    expect(r).toMatchObject({ ok: true, answer: 'x = 4' });
  });
});

describe('attachVerifiedTwin — orchestrator glue', () => {
  it('attaches a verified twin to the decision', async () => {
    callLLM.mockResolvedValueOnce(wrap({ twin: 'Solve 4x = 12', problemTex: '4x = 12', answer: 'x = 3', checkType: 'equation', checkAgainst: '4x = 12' }));
    const decision = { action: 'WORKED_EXAMPLE', directives: [] };
    await attachVerifiedTwin(decision, 'Solve 2x = 10');
    expect(decision.verifiedTwin).toEqual({ twin: 'Solve 4x = 12', answer: 'x = 3' });
  });

  it('leaves the decision untouched when no problem text', async () => {
    const decision = { action: 'WORKED_EXAMPLE', directives: [] };
    await attachVerifiedTwin(decision, '');
    expect(decision.verifiedTwin).toBeUndefined();
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('leaves the decision untouched (no throw) when the twin can\'t be verified', async () => {
    callLLM.mockResolvedValue(wrap({ twin: 'Solve 4x = 12', problemTex: '4x = 12', answer: 'x = 9', checkType: 'equation', checkAgainst: '4x = 12' })); // wrong
    const decision = { action: 'EXIT_RAMP', directives: [] };
    await attachVerifiedTwin(decision, 'Solve 2x = 10');
    expect(decision.verifiedTwin).toBeUndefined();
  });
});

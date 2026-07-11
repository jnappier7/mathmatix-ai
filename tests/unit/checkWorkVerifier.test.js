// tests/unit/checkWorkVerifier.test.js
// The independent "check my work" verifier. Its whole job is to NOT tell a
// correct student they're wrong, so the tests focus on the conservative
// downgrade contract + the fail-safe paths.

jest.mock('../../utils/llmGateway', () => ({
  callLLMStructured: jest.fn(),
}));

const { callLLMStructured } = require('../../utils/llmGateway');
const { verifyStudentWork, normalizeVerdict, MIN_ERROR_CONFIDENCE } = require('../../utils/pipeline/checkWorkVerifier');

const IMG = [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ABC' } }];

beforeEach(() => callLLMStructured.mockReset());

describe('normalizeVerdict — conservative downgrade contract', () => {
  test('passes a well-formed correct verdict through and nulls error fields', () => {
    const v = normalizeVerdict({ verdict: 'correct', whatIsRight: 'factoring + f\'(2)=-1', errorStep: 'x', correctedValue: 'y', confidence: 0.9 });
    expect(v.verdict).toBe('correct');
    expect(v.errorStep).toBeNull();
    expect(v.correctedValue).toBeNull();
  });

  test('keeps a fully-specified, confident error', () => {
    const v = normalizeVerdict({ verdict: 'has_error', whatIsRight: 'setup', errorStep: 'f\'(2)=4-5', correctedValue: '-1', confidence: 0.95 });
    expect(v.verdict).toBe('has_error');
    expect(v.errorStep).toContain("f'(2)");
    expect(v.correctedValue).toBe('-1');
  });

  test('downgrades an error with no corrected value to uncertain', () => {
    const v = normalizeVerdict({ verdict: 'has_error', whatIsRight: '', errorStep: 'somewhere', correctedValue: null, confidence: 0.99 });
    expect(v.verdict).toBe('uncertain');
  });

  test('downgrades an error with no specific step to uncertain', () => {
    const v = normalizeVerdict({ verdict: 'has_error', whatIsRight: '', errorStep: '   ', correctedValue: '-1', confidence: 0.99 });
    expect(v.verdict).toBe('uncertain');
  });

  test(`downgrades an under-confident error (< ${MIN_ERROR_CONFIDENCE}) to uncertain`, () => {
    const v = normalizeVerdict({ verdict: 'has_error', whatIsRight: '', errorStep: 'step 3', correctedValue: '-1', confidence: MIN_ERROR_CONFIDENCE - 0.01 });
    expect(v.verdict).toBe('uncertain');
  });

  test('coerces garbage / missing input to uncertain', () => {
    expect(normalizeVerdict(null).verdict).toBe('uncertain');
    expect(normalizeVerdict({}).verdict).toBe('uncertain');
    expect(normalizeVerdict({ verdict: 'banana' }).verdict).toBe('uncertain');
  });

  test('clamps out-of-range confidence', () => {
    expect(normalizeVerdict({ verdict: 'correct', confidence: 5 }).confidence).toBe(1);
    expect(normalizeVerdict({ verdict: 'correct', confidence: -2 }).confidence).toBe(0);
  });
});

describe('verifyStudentWork — fail-safe behavior', () => {
  test('returns uncertain WITHOUT calling the model when there is no image', async () => {
    const v = await verifyStudentWork({ imageContents: [], studentText: 'check my work' });
    expect(v.verdict).toBe('uncertain');
    expect(callLLMStructured).not.toHaveBeenCalled();
  });

  test('the f(x)=x²-5x+6 worksheet (all correct) is reported correct, not a mistake', async () => {
    callLLMStructured.mockResolvedValue({ verdict: 'correct', whatIsRight: "roots x=2,3 and f'(2)=-1", errorStep: null, correctedValue: null, confidence: 0.92 });
    const v = await verifyStudentWork({ imageContents: IMG, studentText: 'is this right?' });
    expect(v.verdict).toBe('correct');
    expect(v.errorStep).toBeNull();
  });

  test('fails SAFE to uncertain (never a fabricated error) when the model call throws', async () => {
    callLLMStructured.mockRejectedValue(new Error('vision timeout'));
    const v = await verifyStudentWork({ imageContents: IMG, studentText: 'check' });
    expect(v.verdict).toBe('uncertain');
    expect(v.reason).toMatch(/verify-failed/);
  });

  test('a model error verdict missing specifics is downgraded, not surfaced', async () => {
    callLLMStructured.mockResolvedValue({ verdict: 'has_error', whatIsRight: '', errorStep: null, correctedValue: null, confidence: 0.8 });
    const v = await verifyStudentWork({ imageContents: IMG, studentText: 'check' });
    expect(v.verdict).toBe('uncertain');
  });
});

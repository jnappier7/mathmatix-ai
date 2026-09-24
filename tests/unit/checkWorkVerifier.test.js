// tests/unit/checkWorkVerifier.test.js
// The independent "check my work" verifier. Its whole job is to NOT tell a
// correct student they're wrong, so the tests focus on the conservative
// downgrade contract + the fail-safe paths.

// This suite pins the SINGLE-PASS grader (the fallback / CHECK_WORK_PIPELINE=legacy
// path). The read-then-grade pipeline is covered in checkWorkGrader.test.js.
process.env.CHECK_WORK_PIPELINE = 'legacy';

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

describe('per-problem sheet verdicts — the whole sheet is checked', () => {
  const sheet = (problems) => ({ problems });
  const P = (o) => ({ label: '1', status: 'correct', studentAnswer: 'x=1', whatIsRight: 'ok', errorStep: null, correctedValue: null, confidence: 0.9, ...o });

  test('every problem survives normalization, in order', () => {
    const v = normalizeVerdict(sheet([P({ label: '1' }), P({ label: '2' }), P({ label: '3' }), P({ label: '4' })]));
    expect(v.problems.map(p => p.label)).toEqual(['1', '2', '3', '4']);
    expect(v.verdict).toBe('correct');
  });

  test('one verified error anywhere rolls the sheet up to has_error, first error mirrored on top', () => {
    const v = normalizeVerdict(sheet([
      P({ label: '1' }),
      P({ label: '2', status: 'has_error', errorStep: '3x=12', correctedValue: 'x=5' }),
      P({ label: '3', status: 'has_error', errorStep: '2+2=5', correctedValue: '4' }),
    ]));
    expect(v.verdict).toBe('has_error');
    expect(v.errorStep).toBe('3x=12');
    expect(v.problems.filter(p => p.status === 'has_error')).toHaveLength(2);
  });

  test('the conservative downgrade applies per problem', () => {
    const v = normalizeVerdict(sheet([
      P({ label: '1' }),
      P({ label: '2', status: 'has_error', errorStep: 'x', correctedValue: 'y', confidence: MIN_ERROR_CONFIDENCE - 0.1 }),
      P({ label: '3', status: 'has_error', errorStep: null, correctedValue: '4', confidence: 0.99 }),
    ]));
    expect(v.problems[1].status).toBe('uncertain');
    expect(v.problems[2].status).toBe('uncertain');
    expect(v.problems[1].correctedValue).toBeNull();
    expect(v.verdict).toBe('uncertain'); // attempted but not all verified
  });

  test('blank problems are kept, carry no answer, and do not count against "correct"', () => {
    const v = normalizeVerdict(sheet([
      P({ label: '1' }),
      P({ label: '2', status: 'blank', studentAnswer: 'should be dropped', correctedValue: '7' }),
    ]));
    expect(v.problems[1]).toMatchObject({ status: 'blank', studentAnswer: null, correctedValue: null });
    expect(v.verdict).toBe('correct');
  });

  test('an all-blank sheet is uncertain, never correct', () => {
    expect(normalizeVerdict(sheet([P({ status: 'blank' }), P({ status: 'blank' })])).verdict).toBe('uncertain');
  });

  test('an empty problems array is uncertain', () => {
    expect(normalizeVerdict(sheet([])).verdict).toBe('uncertain');
  });

  test('missing labels are numbered in reading order', () => {
    const v = normalizeVerdict(sheet([P({ label: '' }), P({ label: null })]));
    expect(v.problems.map(p => p.label)).toEqual(['1', '2']);
  });

  test('verifyStudentWork asks for every problem and returns them all', async () => {
    callLLMStructured.mockResolvedValue(sheet([P({ label: '1' }), P({ label: '2' }), P({ label: '3' })]));
    const v = await verifyStudentWork({ imageContents: IMG, studentText: 'check my work' });
    expect(v.problems).toHaveLength(3);
    const [, messages, format] = callLLMStructured.mock.calls[0];
    expect(messages[0].content).toMatch(/EVERY problem/);
    expect(format.json_schema.schema.required).toEqual(['problems']);
  });
});

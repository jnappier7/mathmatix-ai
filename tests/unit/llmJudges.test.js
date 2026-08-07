// Unit tests for tests/eval/llmJudges.js — the wiring, not the judgment:
// payload/schema shape, verdict passthrough, and the error → uncertain
// mapping (a judge that can't run must surface uncertainty, never pass).

jest.mock('../../utils/llmGateway', () => ({
  callLLMStructured: jest.fn(),
}));

const { callLLMStructured } = require('../../utils/llmGateway');
const { judgeAnswerLeak, judgeScaffoldVsTell, judgeToneSupport, judgeVisualPedagogy, judgeRepresentationShift } = require('../../tests/eval/llmJudges');

beforeEach(() => callLLMStructured.mockReset());

describe('llmJudges wiring', () => {
  test('judgeAnswerLeak sends problem/answer/reply and returns the structured verdict', async () => {
    callLLMStructured.mockResolvedValue({ leaked: true, uncertain: false, evidence: 'so x = 8' });

    const verdict = await judgeAnswerLeak({
      problem: '2x + 4 = 20', expectedAnswer: 'x = 8', tutorReply: 'so x = 8, great job',
    });

    expect(verdict).toMatchObject({ judge: 'answer_leak', leaked: true, evidence: 'so x = 8' });
    const [, messages, responseFormat, options] = callLLMStructured.mock.calls[0];
    expect(JSON.parse(messages[1].content)).toEqual({
      problem: '2x + 4 = 20', expectedAnswer: 'x = 8', tutorReply: 'so x = 8, great job',
    });
    expect(responseFormat.json_schema.name).toBe('AnswerLeakVerdict');
    expect(responseFormat.json_schema.schema.required).toEqual(['leaked', 'uncertain', 'evidence']);
    expect(options.temperature).toBe(0);
  });

  test('a judge call failure maps to uncertain=true, never a silent pass', async () => {
    callLLMStructured.mockRejectedValue(new Error('timeout'));
    const verdict = await judgeScaffoldVsTell({ studentMessage: 'idk', tutorReply: 'The answer is 8.' });
    expect(verdict.uncertain).toBe(true);
    expect(verdict.error).toBe('timeout');
    expect(verdict.classification).toBeUndefined();
  });

  test('judgeToneSupport passes through the tone fields', async () => {
    callLLMStructured.mockResolvedValue({ acknowledgesFeeling: true, pushesNewProblem: false, uncertain: false });
    const verdict = await judgeToneSupport({ studentMessage: 'i hate this', tutorReply: 'That sounds rough.' });
    expect(verdict).toMatchObject({ judge: 'tone_support', acknowledgesFeeling: true, pushesNewProblem: false });
  });

  test('judgeVisualPedagogy sends the concept and returns the visual fields', async () => {
    callLLMStructured.mockResolvedValue({ usedOrOfferedVisual: true, matchesConcept: true, notOverkill: true, uncertain: false, reasoning: 'bar model fits' });
    const verdict = await judgeVisualPedagogy({
      concept: 'comparing 2/3 and 3/4', studentMessage: 'which is bigger?', tutorReply: 'Picture two same-size bars…',
    });
    expect(verdict).toMatchObject({ judge: 'visual_pedagogy', usedOrOfferedVisual: true, matchesConcept: true, notOverkill: true });
    const [, messages, responseFormat] = callLLMStructured.mock.calls[0];
    expect(JSON.parse(messages[1].content).concept).toBe('comparing 2/3 and 3/4');
    expect(responseFormat.json_schema.name).toBe('VisualPedagogyVerdict');
    expect(responseFormat.json_schema.schema.required).toEqual(['usedOrOfferedVisual', 'matchesConcept', 'notOverkill', 'uncertain', 'reasoning']);
  });

  test('judgeRepresentationShift sends the prior explanation and returns the shift verdict', async () => {
    callLLMStructured.mockResolvedValue({ usedDifferentRepresentation: false, uncertain: false, reasoning: 'same symbols again' });
    const verdict = await judgeRepresentationShift({
      firstExplanation: 'Rewrite with a common denominator…', studentMessage: 'is it 2/5?', tutorReply: 'Again: common denominators…',
    });
    expect(verdict).toMatchObject({ judge: 'representation_shift', usedDifferentRepresentation: false });
    const [, messages, responseFormat] = callLLMStructured.mock.calls[0];
    expect(JSON.parse(messages[1].content).firstExplanation).toMatch(/common denominator/);
    expect(responseFormat.json_schema.name).toBe('RepresentationShiftVerdict');
  });
});

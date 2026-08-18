/**
 * The verifier runs on a DIFFERENT provider from the tutor's generate stage —
 * Claude Haiku while TUTOR_MODEL is gpt-4o-mini — so that the model checking the
 * tutor's answer is not the model that produced it.
 *
 * Crossing the provider line moves two things out of the API's hands and into
 * ours, and both fail SILENTLY if they regress: every verdict comes back
 * `unverifiable`, grading quietly falls back to mathSolver's ~30% topic
 * coverage, and nothing errors. These tests are the alarm.
 *
 *   1. JSON mode. These calls ask for `response_format: {type:'json_object'}` —
 *      bare JSON mode, no schema. Claude has no analogue, so anthropicClient
 *      translates it into a system-prompt instruction and parseVerdict tolerates
 *      the fence/preamble that a prompt-level constraint can't rule out.
 *   2. Reachability. An unfunded Anthropic balance or a bad key is a terminal
 *      4xx, which openaiClient deliberately does NOT fail over. verifierCall
 *      covers exactly that gap — and deliberately nothing else.
 */

const {
  parseVerdict,
  verifierCall,
  VERIFIER_MODEL,
  VERIFIER_FALLBACK_MODEL,
  ESCALATION_MODEL,
} = require('../../utils/pipeline/llmVerifier');
const { buildBody, isClaudeModel } = require('../../utils/anthropicClient');
const { callLLM } = require('../../utils/llmGateway');

jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const OK = { choices: [{ message: { content: '{"matches":true,"confidence":0.9}' } }] };

function apiError(status) {
  const err = new Error(`HTTP ${status}`);
  err.status = status;
  return err;
}

beforeEach(() => jest.clearAllMocks());

describe('the verifier crosses the provider line', () => {
  test('tier 1 is a Claude model, so it routes through the Anthropic adapter', () => {
    expect(isClaudeModel(VERIFIER_MODEL)).toBe(true);
  });

  test('tier 1 is NOT the model the tutor generates with', () => {
    // If these ever converge, the "second opinion" is the model grading itself.
    const tutorModel = process.env.TUTOR_MODEL || 'gpt-4o-mini';
    expect(VERIFIER_MODEL).not.toBe(tutorModel);
  });

  test('tier 2 stays on OpenAI, so escalation is a different model and not a bigger Haiku', () => {
    expect(isClaudeModel(ESCALATION_MODEL)).toBe(false);
  });

  test('the model id carries no date suffix (the alias is the whole id)', () => {
    expect(VERIFIER_MODEL).not.toMatch(/-\d{8}$/);
  });
});

describe('bare JSON mode survives translation to Claude', () => {
  const messages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'u' }];

  function systemText(body) {
    return Array.isArray(body.system)
      ? body.system.map((b) => b.text).join('\n\n')
      : body.system;
  }

  test('a schema-less json_object becomes a system instruction, not silence', () => {
    // The regression this guards: toClaudeOutputConfig returns null for a
    // schema-less json_object, so the constraint used to vanish entirely and the
    // failure showed up as a parse error rather than a config gap.
    const body = buildBody(VERIFIER_MODEL, messages, {
      response_format: { type: 'json_object' },
    });
    expect(body.output_config).toBeUndefined();
    expect(systemText(body)).toMatch(/single raw JSON object/i);
    expect(systemText(body)).toMatch(/no markdown code fences/i);
  });

  test('the caller\'s own system prompt is preserved alongside it', () => {
    const body = buildBody(VERIFIER_MODEL, messages, {
      response_format: { type: 'json_object' },
    });
    expect(systemText(body)).toContain('sys');
  });

  test('a schemaful json_schema still uses output_config and gets no instruction', () => {
    const body = buildBody(VERIFIER_MODEL, messages, {
      response_format: {
        type: 'json_schema',
        json_schema: { schema: { type: 'object', properties: { a: { type: 'string' } } } },
      },
    });
    expect(body.output_config.format.type).toBe('json_schema');
    expect(systemText(body)).not.toMatch(/single raw JSON object/i);
  });

  test('no response_format leaves the system prompt untouched', () => {
    const body = buildBody(VERIFIER_MODEL, messages, {});
    expect(systemText(body)).not.toMatch(/single raw JSON object/i);
  });
});

describe('parseVerdict tolerates what a prompt-level constraint cannot rule out', () => {
  test('plain JSON parses', () => {
    expect(parseVerdict('{"matches":true}')).toEqual({ matches: true });
  });

  test('a ```json fence is stripped rather than read as a parse failure', () => {
    expect(parseVerdict('```json\n{"matches":true}\n```')).toEqual({ matches: true });
  });

  test('a bare ``` fence is stripped too', () => {
    expect(parseVerdict('```\n{"matches":false}\n```')).toEqual({ matches: false });
  });

  test('a conversational preamble does not cost us the verdict', () => {
    expect(parseVerdict('Here is the JSON:\n{"matches":true,"confidence":0.9}'))
      .toEqual({ matches: true, confidence: 0.9 });
  });

  test('trailing prose after the object is discarded', () => {
    expect(parseVerdict('{"matches":true} — let me know if you need more.'))
      .toEqual({ matches: true });
  });

  test('a nested object is not truncated at the first closing brace', () => {
    expect(parseVerdict('{"a":{"b":1},"c":2}')).toEqual({ a: { b: 1 }, c: 2 });
  });

  test('genuine garbage still returns null, so a real failure stays a failure', () => {
    expect(parseVerdict('I cannot answer that.')).toBeNull();
    expect(parseVerdict('')).toBeNull();
    expect(parseVerdict(null)).toBeNull();
    expect(parseVerdict('{"unterminated": ')).toBeNull();
  });
});

describe('verifierCall covers the gap openaiClient leaves open — and only that gap', () => {
  test('a healthy call goes straight through, with no fallback attempt', async () => {
    callLLM.mockResolvedValueOnce(OK);
    await expect(verifierCall(VERIFIER_MODEL, [], {})).resolves.toBe(OK);
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test.each([401, 403, 404, 400])(
    'a terminal %i falls back to OpenAI instead of returning no verdict',
    async (status) => {
      // 400 is the one an exhausted Anthropic balance returns; openaiClient
      // treats every non-429 4xx as terminal, so nothing else rescues these.
      callLLM.mockRejectedValueOnce(apiError(status)).mockResolvedValueOnce(OK);
      await expect(verifierCall(VERIFIER_MODEL, [], {})).resolves.toBe(OK);
      expect(callLLM).toHaveBeenCalledTimes(2);
      expect(callLLM.mock.calls[1][0]).toBe(VERIFIER_FALLBACK_MODEL);
    },
  );

  test('a 429 is re-thrown — openaiClient already handles it, and a second try would mask the cause', async () => {
    callLLM.mockRejectedValueOnce(apiError(429));
    await expect(verifierCall(VERIFIER_MODEL, [], {})).rejects.toThrow('HTTP 429');
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test('a 500 is re-thrown for the same reason', async () => {
    callLLM.mockRejectedValueOnce(apiError(500));
    await expect(verifierCall(VERIFIER_MODEL, [], {})).rejects.toThrow('HTTP 500');
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test('a statusless network error is re-thrown', async () => {
    callLLM.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(verifierCall(VERIFIER_MODEL, [], {})).rejects.toThrow('socket hang up');
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test('an OpenAI-model failure never falls back — there is nowhere to go', async () => {
    callLLM.mockRejectedValueOnce(apiError(401));
    await expect(verifierCall(ESCALATION_MODEL, [], {})).rejects.toThrow('HTTP 401');
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test('when the fallback ALSO fails, the Claude cause surfaces — not the fallback symptom', async () => {
    callLLM
      .mockRejectedValueOnce(apiError(401))
      .mockRejectedValueOnce(new Error('openai down'));
    await expect(verifierCall(VERIFIER_MODEL, [], {})).rejects.toThrow('HTTP 401');
  });

  test('the fallback is handed the same messages and options', async () => {
    const messages = [{ role: 'user', content: 'x' }];
    const options = { temperature: 0, max_tokens: 300, response_format: { type: 'json_object' } };
    callLLM.mockRejectedValueOnce(apiError(401)).mockResolvedValueOnce(OK);
    await verifierCall(VERIFIER_MODEL, messages, options);
    expect(callLLM.mock.calls[1][1]).toBe(messages);
    expect(callLLM.mock.calls[1][2]).toBe(options);
  });
});

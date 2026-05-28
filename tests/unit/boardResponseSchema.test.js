/**
 * boardResponseSchema — the strict JSON schema and normalizer that
 * back the Phase 1 structured-tutor-response migration.
 *
 * The schema itself is enforced by the OpenAI API at the wire
 * boundary; these tests cover the surrounding helpers we own:
 *   - normalizeBoardCommand (null-strip → legacy compact shape)
 *   - normalizeStructuredResponse (safe parse, malformed input)
 *   - isStructuredModeEnabled (env-flag plumbing)
 *   - the exported schema's strict-mode shape (additionalProperties
 *     false, every property listed in required, etc.)
 */

const {
  BOARD_ACTIONS,
  BOARD_COMMAND_SCHEMA,
  BOARD_RESPONSE_SCHEMA,
  OPENAI_RESPONSE_FORMAT,
  normalizeBoardCommand,
  normalizeStructuredResponse,
  isStructuredModeEnabled,
} = require('../../utils/boardResponseSchema');

describe('boardResponseSchema — normalizeBoardCommand', () => {
  test('strips null fields and returns the compact legacy shape', () => {
    expect(normalizeBoardCommand({
      action: 'pose',
      tex: '2x + 4 = 20',
      op: null,
      check: null,
      fn: null,
      query: null,
      caption: null,
    })).toEqual({ action: 'pose', tex: '2x + 4 = 20' });
  });

  test('keeps only the populated fields for an apply command', () => {
    expect(normalizeBoardCommand({
      action: 'apply',
      tex: null,
      op: 'subtract 4 from both sides',
      check: null,
      fn: null,
      query: null,
      caption: null,
    })).toEqual({ action: 'apply', op: 'subtract 4 from both sides' });
  });

  test('keeps multiple fields when populated (verify with check)', () => {
    expect(normalizeBoardCommand({
      action: 'verify',
      tex: 'x = 8',
      op: null,
      check: '2(8) + 4 = 20',
      fn: null,
      query: null,
      caption: null,
    })).toEqual({ action: 'verify', tex: 'x = 8', check: '2(8) + 4 = 20' });
  });

  test('keeps query + caption on an image command', () => {
    expect(normalizeBoardCommand({
      action: 'image',
      tex: null,
      op: null,
      check: null,
      fn: null,
      query: '30 60 90 triangle labeled',
      caption: 'Special right triangle',
    })).toEqual({
      action: 'image',
      query: '30 60 90 triangle labeled',
      caption: 'Special right triangle',
    });
  });

  test('empty-string field is treated as null and dropped', () => {
    expect(normalizeBoardCommand({
      action: 'apply',
      tex: null,
      op: '',
      check: null,
      fn: null,
      query: null,
      caption: null,
    })).toEqual({ action: 'apply' });
  });

  test('rejects a command with an action outside the enum', () => {
    expect(normalizeBoardCommand({
      action: 'doSomethingElse',
      tex: 'x = 1',
      op: null,
      check: null,
      fn: null,
      query: null,
      caption: null,
    })).toBeNull();
  });

  test('rejects a missing-action input', () => {
    expect(normalizeBoardCommand({ tex: 'x = 1' })).toBeNull();
  });

  test('rejects non-object input', () => {
    expect(normalizeBoardCommand(null)).toBeNull();
    expect(normalizeBoardCommand(undefined)).toBeNull();
    expect(normalizeBoardCommand('pose')).toBeNull();
  });
});

describe('boardResponseSchema — normalizeStructuredResponse', () => {
  test('well-formed payload passes through cleanly', () => {
    const result = normalizeStructuredResponse({
      chat_message: "Let's tackle this.",
      board_commands: [
        { action: 'pose', tex: '2x + 4 = 20', op: null, check: null, fn: null, query: null, caption: null },
        { action: 'apply', tex: null, op: 'subtract 4 from both sides', check: null, fn: null, query: null, caption: null },
      ],
    });
    expect(result.chat_message).toBe("Let's tackle this.");
    expect(result.board_commands).toEqual([
      { action: 'pose', tex: '2x + 4 = 20' },
      { action: 'apply', op: 'subtract 4 from both sides' },
    ]);
  });

  test('missing chat_message → empty string', () => {
    const result = normalizeStructuredResponse({ board_commands: [] });
    expect(result.chat_message).toBe('');
    expect(result.board_commands).toEqual([]);
  });

  test('missing board_commands → empty array', () => {
    const result = normalizeStructuredResponse({ chat_message: 'hi' });
    expect(result.chat_message).toBe('hi');
    expect(result.board_commands).toEqual([]);
  });

  test('non-object input → safe defaults', () => {
    expect(normalizeStructuredResponse(null)).toEqual({ chat_message: '', board_commands: [] });
    expect(normalizeStructuredResponse(undefined)).toEqual({ chat_message: '', board_commands: [] });
    expect(normalizeStructuredResponse('not an object')).toEqual({ chat_message: '', board_commands: [] });
  });

  test('invalid commands are silently dropped', () => {
    const result = normalizeStructuredResponse({
      chat_message: 'ok',
      board_commands: [
        { action: 'pose', tex: 'x = 1', op: null, check: null, fn: null, query: null, caption: null },
        { action: 'nonsense', tex: null, op: null, check: null, fn: null, query: null, caption: null },
        null,
        { tex: 'no action here' },
      ],
    });
    expect(result.board_commands).toEqual([{ action: 'pose', tex: 'x = 1' }]);
  });
});

describe('boardResponseSchema — isStructuredModeEnabled', () => {
  const ORIGINAL = process.env.STRUCTURED_TUTOR_RESPONSE;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.STRUCTURED_TUTOR_RESPONSE;
    } else {
      process.env.STRUCTURED_TUTOR_RESPONSE = ORIGINAL;
    }
  });

  test('default (unset) is OFF', () => {
    delete process.env.STRUCTURED_TUTOR_RESPONSE;
    expect(isStructuredModeEnabled()).toBe(false);
  });

  test("env='true' is ON", () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    expect(isStructuredModeEnabled()).toBe(true);
  });

  test("env='1' is ON", () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = '1';
    expect(isStructuredModeEnabled()).toBe(true);
  });

  test("env='false' is OFF", () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'false';
    expect(isStructuredModeEnabled()).toBe(false);
  });

  test('env=anything-else is OFF', () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'maybe';
    expect(isStructuredModeEnabled()).toBe(false);
  });
});

describe('boardResponseSchema — schema shape (OpenAI strict mode)', () => {
  // Strict-mode constraints OpenAI enforces. If any of these change
  // the API will reject the schema at call time; better to fail
  // loudly here than in production.

  test('BOARD_ACTIONS lists the seven supported actions', () => {
    expect(BOARD_ACTIONS).toEqual([
      'pose', 'apply', 'resolve', 'verify', 'clear', 'graph', 'image',
    ]);
  });

  test('BOARD_COMMAND_SCHEMA forbids additional properties', () => {
    expect(BOARD_COMMAND_SCHEMA.additionalProperties).toBe(false);
  });

  test('BOARD_COMMAND_SCHEMA has every property listed in required', () => {
    const props = Object.keys(BOARD_COMMAND_SCHEMA.properties);
    expect(BOARD_COMMAND_SCHEMA.required.sort()).toEqual(props.sort());
  });

  test('BOARD_RESPONSE_SCHEMA forbids additional properties', () => {
    expect(BOARD_RESPONSE_SCHEMA.additionalProperties).toBe(false);
  });

  test('BOARD_RESPONSE_SCHEMA has every property listed in required', () => {
    const props = Object.keys(BOARD_RESPONSE_SCHEMA.properties);
    expect(BOARD_RESPONSE_SCHEMA.required.sort()).toEqual(props.sort());
  });

  test('OPENAI_RESPONSE_FORMAT is the wire shape OpenAI expects', () => {
    expect(OPENAI_RESPONSE_FORMAT.type).toBe('json_schema');
    expect(OPENAI_RESPONSE_FORMAT.json_schema.name).toBe('TutorResponse');
    expect(OPENAI_RESPONSE_FORMAT.json_schema.strict).toBe(true);
    expect(OPENAI_RESPONSE_FORMAT.json_schema.schema).toBe(BOARD_RESPONSE_SCHEMA);
  });

  test('every nullable field declares ["string", "null"] so strict mode accepts null', () => {
    for (const [name, prop] of Object.entries(BOARD_COMMAND_SCHEMA.properties)) {
      if (name === 'action') continue;
      expect(prop.type).toEqual(['string', 'null']);
    }
  });
});

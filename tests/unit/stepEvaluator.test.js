/**
 * Tests for the backend-driven step evaluator.
 *
 * The step evaluator replaces the old <SCAFFOLD_ADVANCE> tag system.
 * It decides when to advance based on step type:
 *   - Practice steps: deterministic (count correct answers)
 *   - Explanation/model steps: LLM sidecar evaluation
 *   - Fallback: turn count
 */

// Mock OpenAI client to prevent API key requirement at import time
jest.mock('../../utils/openaiClient', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  openai: { chat: { completions: { create: jest.fn() } } },
}));

const {
  evaluateDeterministic,
  evaluateTurnCount,
  inferCompletionMode,
  extractRecentExchanges,
  buildEvalPrompt,
  parseEvalResponse,
  MIN_CORRECT_FOR_ADVANCE,
  MIN_TURNS_BEFORE_EVAL,
} = require('../../utils/pipeline/stepEvaluator');

// ============================================================================
// inferCompletionMode
// ============================================================================

describe('stepEvaluator: inferCompletionMode', () => {
  test('returns deterministic for practice step types', () => {
    expect(inferCompletionMode('guided_practice')).toBe('deterministic');
    expect(inferCompletionMode('independent_practice')).toBe('deterministic');
    expect(inferCompletionMode('we-do')).toBe('deterministic');
    expect(inferCompletionMode('you-do')).toBe('deterministic');
    expect(inferCompletionMode('mastery-check')).toBe('deterministic');
  });

  test('returns llm_eval for explanation types', () => {
    expect(inferCompletionMode('explanation')).toBe('llm_eval');
    expect(inferCompletionMode('concept-intro')).toBe('llm_eval');
  });

  test('returns llm_eval for model types', () => {
    expect(inferCompletionMode('model')).toBe('llm_eval');
    expect(inferCompletionMode('i-do')).toBe('llm_eval');
  });

  test('returns llm_eval for check types', () => {
    expect(inferCompletionMode('check-in')).toBe('llm_eval');
    expect(inferCompletionMode('concept-check')).toBe('llm_eval');
  });

  test('defaults to llm_eval for unknown types', () => {
    expect(inferCompletionMode('unknown')).toBe('llm_eval');
    expect(inferCompletionMode('')).toBe('llm_eval');
  });
});

// ============================================================================
// evaluateDeterministic
// ============================================================================

describe('stepEvaluator: evaluateDeterministic', () => {
  function makeConversation(messages) {
    return { messages };
  }

  test('returns complete when enough correct answers exist', () => {
    const step = { type: 'guided_practice' };
    const conv = makeConversation([
      { role: 'user', content: '5' },
      { role: 'assistant', content: 'Correct!', problemResult: 'correct' },
      { role: 'user', content: '7' },
      { role: 'assistant', content: 'Correct!', problemResult: 'correct' },
    ]);

    const result = evaluateDeterministic(step, conv);
    expect(result.complete).toBe(true);
    expect(result.mode).toBe('deterministic');
    expect(result.confidence).toBe(1.0);
  });

  test('returns incomplete when not enough correct answers', () => {
    const step = { type: 'guided_practice' };
    const conv = makeConversation([
      { role: 'user', content: '5' },
      { role: 'assistant', content: 'Correct!', problemResult: 'correct' },
    ]);

    const result = evaluateDeterministic(step, conv);
    expect(result.complete).toBe(false);
    expect(result.confidence).toBe(1 / MIN_CORRECT_FOR_ADVANCE);
  });

  test('counts wasCorrect from current turn', () => {
    const step = { type: 'guided_practice' };
    const conv = makeConversation([
      { role: 'user', content: '5' },
      { role: 'assistant', content: 'Correct!', problemResult: 'correct' },
    ]);

    const result = evaluateDeterministic(step, conv, { wasCorrect: true });
    expect(result.complete).toBe(true);
  });

  test('resets count at last scaffoldAdvanced marker', () => {
    const step = { type: 'guided_practice' };
    const conv = makeConversation([
      { role: 'assistant', content: 'old correct', problemResult: 'correct', scaffoldAdvanced: true },
      { role: 'user', content: '3' },
      { role: 'assistant', content: 'Correct!', problemResult: 'correct' },
    ]);

    const result = evaluateDeterministic(step, conv);
    expect(result.complete).toBe(false);
    expect(result.evidence).toContain('1/2');
  });

  test('respects custom min_correct from step completion config', () => {
    const step = { type: 'guided_practice', completion: { min_correct: 3 } };
    const conv = makeConversation([
      { role: 'assistant', content: 'c1', problemResult: 'correct' },
      { role: 'assistant', content: 'c2', problemResult: 'correct' },
    ]);

    const result = evaluateDeterministic(step, conv);
    expect(result.complete).toBe(false);
    expect(result.evidence).toContain('2/3');
  });

  test('always completes for parent courses', () => {
    const step = { type: 'guided_practice' };
    const conv = makeConversation([]);

    const result = evaluateDeterministic(step, conv, { isParentCourse: true });
    expect(result.complete).toBe(true);
  });
});

// ============================================================================
// evaluateTurnCount
// ============================================================================

describe('stepEvaluator: evaluateTurnCount', () => {
  function makeConversation(assistantCount, { studentResponded = true } = {}) {
    const messages = [];
    for (let i = 0; i < assistantCount; i++) {
      if (studentResponded) messages.push({ role: 'user', content: `q${i}` });
      messages.push({ role: 'assistant', content: `a${i}` });
    }
    return { messages };
  }

  test('completes explanation step after 3 assistant turns with student response', () => {
    const step = { type: 'explanation' };
    const conv = makeConversation(3);

    const result = evaluateTurnCount(step, conv);
    expect(result.complete).toBe(true);
    expect(result.mode).toBe('turn_count');
  });

  test('does not complete explanation step with only 2 assistant turns', () => {
    const step = { type: 'explanation' };
    const conv = makeConversation(2);

    const result = evaluateTurnCount(step, conv);
    expect(result.complete).toBe(false);
  });

  test('completes model step after 4 assistant turns', () => {
    const step = { type: 'model' };
    const conv = makeConversation(4);

    const result = evaluateTurnCount(step, conv);
    expect(result.complete).toBe(true);
  });

  test('does not complete without student response', () => {
    const step = { type: 'explanation' };
    const conv = makeConversation(5, { studentResponded: false });

    const result = evaluateTurnCount(step, conv);
    expect(result.complete).toBe(false);
  });

  test('respects custom turn_threshold from completion config', () => {
    const step = { type: 'explanation', completion: { turn_threshold: 5 } };
    const conv = makeConversation(4);

    const result = evaluateTurnCount(step, conv);
    expect(result.complete).toBe(false);
  });
});

// ============================================================================
// extractRecentExchanges
// ============================================================================

describe('stepEvaluator: extractRecentExchanges', () => {
  test('extracts last N pairs', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' },
      { role: 'assistant', content: 'a3' },
    ];

    const exchanges = extractRecentExchanges(messages, 2);
    expect(exchanges).toHaveLength(4); // 2 pairs = 4 messages
    expect(exchanges[0].content).toBe('q2');
    expect(exchanges[3].content).toBe('a3');
  });

  test('stops at scaffoldAdvanced boundary', () => {
    const messages = [
      { role: 'assistant', content: 'old', scaffoldAdvanced: true },
      { role: 'user', content: 'new question' },
      { role: 'assistant', content: 'new answer' },
    ];

    const exchanges = extractRecentExchanges(messages, 5);
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0].content).toBe('new question');
  });

  test('truncates long content to 500 chars', () => {
    const messages = [
      { role: 'user', content: 'x'.repeat(1000) },
      { role: 'assistant', content: 'short' },
    ];

    const exchanges = extractRecentExchanges(messages, 2);
    expect(exchanges[0].content.length).toBe(500);
  });

  test('returns empty array for empty messages', () => {
    expect(extractRecentExchanges([], 3)).toEqual([]);
  });
});

// ============================================================================
// buildEvalPrompt
// ============================================================================

describe('stepEvaluator: buildEvalPrompt', () => {
  test('includes step type, objective, and signals', () => {
    const prompt = buildEvalPrompt(
      'explanation',
      'Understand rate of change',
      ['connects slope to rate of change'],
      [{ role: 'assistant', content: 'So rate of change is like slope...' }]
    );

    expect(prompt).toContain('explanation');
    expect(prompt).toContain('Understand rate of change');
    expect(prompt).toContain('connects slope to rate of change');
    expect(prompt).toContain('TUTOR: So rate of change is like slope');
  });

  test('formats exchanges with STUDENT/TUTOR labels', () => {
    const prompt = buildEvalPrompt('model', 'Test', [], [
      { role: 'user', content: 'What does that mean?' },
      { role: 'assistant', content: 'It means...' },
    ]);

    expect(prompt).toContain('STUDENT: What does that mean?');
    expect(prompt).toContain('TUTOR: It means...');
  });
});

// ============================================================================
// parseEvalResponse
// ============================================================================

describe('stepEvaluator: parseEvalResponse', () => {
  test('parses valid JSON with understood status', () => {
    const result = parseEvalResponse('{"status":"understood","confidence":0.92,"evidence":"Student explained slope correctly"}');
    expect(result.complete).toBe(true);
    expect(result.confidence).toBe(0.92);
    expect(result.status).toBe('understood');
    expect(result.evidence).toBe('Student explained slope correctly');
  });

  test('parses not_yet status as incomplete', () => {
    const result = parseEvalResponse('{"status":"not_yet","confidence":0.3,"evidence":"Still teaching"}');
    expect(result.complete).toBe(false);
    expect(result.status).toBe('not_yet');
  });

  test('parses unclear status as incomplete', () => {
    const result = parseEvalResponse('{"status":"unclear","confidence":0.5,"evidence":"Ambiguous"}');
    expect(result.complete).toBe(false);
    expect(result.status).toBe('unclear');
  });

  test('handles markdown-wrapped JSON', () => {
    const result = parseEvalResponse('```json\n{"status":"understood","confidence":0.85,"evidence":"Good"}\n```');
    expect(result.complete).toBe(true);
  });

  test('handles invalid JSON gracefully', () => {
    const result = parseEvalResponse('This is not JSON');
    expect(result.complete).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.evidence).toContain('Parse error');
  });

  test('clamps confidence to 0-1 range', () => {
    const result = parseEvalResponse('{"status":"understood","confidence":1.5,"evidence":"Test"}');
    expect(result.confidence).toBe(1);

    const result2 = parseEvalResponse('{"status":"not_yet","confidence":-0.5,"evidence":"Test"}');
    expect(result2.confidence).toBe(0);
  });
});

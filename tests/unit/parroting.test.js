/**
 * Tests for parroting detection and evasive affirmative detection
 * in the observe stage, and their handling in the decide stage.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
}));

jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

const {
  observe,
  detectParroting,
  detectEvasiveAffirmative,
  MESSAGE_TYPES,
} = require('../../utils/pipeline/observe');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');

// ============================================================================
// detectParroting
// ============================================================================

describe('detectParroting', () => {
  const tutorMsg = (content) => ({ role: 'assistant', content });

  test('detects when student repeats tutor sentence almost verbatim', () => {
    const tutor = [tutorMsg('When you multiply both sides by 3, the denominator cancels out.')];
    const student = 'when you multiply both sides by 3 the denominator cancels out';
    expect(detectParroting(student, tutor)).toBe(true);
  });

  test('detects paraphrased repetition with high word overlap', () => {
    const tutor = [tutorMsg('The slope of a line is the rise over the run between two points.')];
    const student = 'the slope is the rise over the run between two points';
    expect(detectParroting(student, tutor)).toBe(true);
  });

  test('does NOT flag short responses like "yes" or "ok"', () => {
    const tutor = [tutorMsg('Does that make sense?')];
    expect(detectParroting('yes', tutor)).toBe(false);
    expect(detectParroting('ok got it', tutor)).toBe(false);
  });

  test('does NOT flag original student explanations', () => {
    const tutor = [tutorMsg('When you multiply both sides by 3, the denominator cancels out.')];
    const student = 'So I need to get rid of the fraction first, then solve for x';
    expect(detectParroting(student, tutor)).toBe(false);
  });

  test('does NOT flag numeric answers', () => {
    const tutor = [tutorMsg('What is 3 times 4?')];
    expect(detectParroting('12', tutor)).toBe(false);
  });

  test('returns false with no assistant messages', () => {
    expect(detectParroting('some student text here right', [])).toBe(false);
    expect(detectParroting('some student text here right', null)).toBe(false);
  });

  test('checks up to last 3 assistant messages', () => {
    const msgs = [
      tutorMsg('First irrelevant message.'),
      tutorMsg('Second irrelevant message.'),
      tutorMsg('The distributive property means you multiply each term inside the parentheses.'),
    ];
    const student = 'distributive property means you multiply each term inside the parentheses';
    expect(detectParroting(student, msgs)).toBe(true);
  });

  test('does NOT flag student with fewer than 4 substantive words', () => {
    const tutor = [tutorMsg('You add the exponents when multiplying same bases.')];
    const student = 'add the exponents';
    expect(detectParroting(student, tutor)).toBe(false);
  });

  test('handles punctuation differences gracefully', () => {
    const tutor = [tutorMsg("So, we cross-multiply: a/b = c/d becomes a*d = b*c.")];
    const student = 'we cross multiply a/b = c/d becomes a times d equals b times c';
    // The core words "cross multiply becomes" should still overlap significantly
    // but the math symbols diverge — this tests boundary behavior
    const result = detectParroting(student, tutor);
    // Either outcome is acceptable; just ensure no crash
    expect(typeof result).toBe('boolean');
  });
});

// ============================================================================
// detectEvasiveAffirmative
// ============================================================================

describe('detectEvasiveAffirmative', () => {
  const tutorMsg = (content) => ({ role: 'assistant', content });

  test('detects "yes" after tutor asks "can you explain why?"', () => {
    const tutor = [tutorMsg('Can you explain why we flip the inequality when dividing by a negative?')];
    expect(detectEvasiveAffirmative('yes', tutor)).toBe(true);
  });

  test('detects "yeah" after "in your own words"', () => {
    const tutor = [tutorMsg('Tell me in your own words what the distributive property does.')];
    expect(detectEvasiveAffirmative('yeah', tutor)).toBe(true);
  });

  test('detects "got it" after "why does that work?"', () => {
    const tutor = [tutorMsg('Why does that work? Think about what happens to both sides.')];
    expect(detectEvasiveAffirmative('got it', tutor)).toBe(true);
  });

  test('detects "I understand" after "show me your thinking"', () => {
    const tutor = [tutorMsg('Show me your thinking on this step.')];
    expect(detectEvasiveAffirmative('I understand', tutor)).toBe(true);
  });

  test('detects "ok" after "walk me through"', () => {
    const tutor = [tutorMsg('Walk me through how you got that answer.')];
    expect(detectEvasiveAffirmative('ok', tutor)).toBe(true);
  });

  test('detects "sure" after "convince me"', () => {
    const tutor = [tutorMsg('Convince me that your answer is correct.')];
    expect(detectEvasiveAffirmative('sure', tutor)).toBe(true);
  });

  test('detects "yep" after "teach it back to me"', () => {
    const tutor = [tutorMsg('Can you teach this back to me?')];
    expect(detectEvasiveAffirmative('yep', tutor)).toBe(true);
  });

  test('does NOT flag "yes" after a regular question like "ready for the next one?"', () => {
    const tutor = [tutorMsg('Ready for the next problem?')];
    expect(detectEvasiveAffirmative('yes', tutor)).toBe(false);
  });

  test('does NOT flag "yes" after "Is the answer 5?"', () => {
    const tutor = [tutorMsg('Is the answer 5?')];
    expect(detectEvasiveAffirmative('yes', tutor)).toBe(false);
  });

  test('does NOT flag a long explanation as evasive', () => {
    const tutor = [tutorMsg('Can you explain why we multiply both sides?')];
    const student = 'Because if we multiply both sides by the same number the equation stays balanced and we can isolate x';
    expect(detectEvasiveAffirmative(student, tutor)).toBe(false);
  });

  test('returns false with no assistant messages', () => {
    expect(detectEvasiveAffirmative('yes', [])).toBe(false);
    expect(detectEvasiveAffirmative('yes', null)).toBe(false);
  });

  test('does NOT flag "mhm" after non-explanation question', () => {
    const tutor = [tutorMsg('Would you like a hint?')];
    expect(detectEvasiveAffirmative('mhm', tutor)).toBe(false);
  });

  test('detects across "how does" phrasing', () => {
    const tutor = [tutorMsg('How does the zero product property help us solve this?')];
    expect(detectEvasiveAffirmative('yup', tutor)).toBe(true);
  });

  test('detects "prove it" trigger', () => {
    const tutor = [tutorMsg("That's a bold claim! Can you prove it?")];
    expect(detectEvasiveAffirmative('yes', tutor)).toBe(true);
  });
});

// ============================================================================
// observe() integration — message type classification
// ============================================================================

describe('observe() classifies parroting and evasive affirmatives', () => {
  test('classifies parroting when student echoes tutor', () => {
    const result = observe(
      'the quadratic formula gives you the roots of any quadratic equation',
      {
        recentAssistantMessages: [
          { role: 'assistant', content: 'The quadratic formula gives you the roots of any quadratic equation.' },
        ],
        recentUserMessages: [],
      }
    );
    expect(result.messageType).toBe(MESSAGE_TYPES.PARROTING);
  });

  test('classifies evasive affirmative when bare "yes" follows explanation request', () => {
    const result = observe('yes', {
      recentAssistantMessages: [
        { role: 'assistant', content: 'Can you explain why we need to find a common denominator?' },
      ],
      recentUserMessages: [],
    });
    expect(result.messageType).toBe(MESSAGE_TYPES.EVASIVE_AFFIRMATIVE);
  });

  test('classifies normal "yes" as AFFIRMATIVE when tutor did NOT ask for explanation', () => {
    const result = observe('yes', {
      recentAssistantMessages: [
        { role: 'assistant', content: 'Ready for the next problem?' },
      ],
      recentUserMessages: [],
    });
    expect(result.messageType).toBe(MESSAGE_TYPES.AFFIRMATIVE);
  });

  test('classifies genuine original explanation as GENERAL_MATH, not parroting', () => {
    const result = observe(
      'I think you divide both sides by two to get x alone',
      {
        recentAssistantMessages: [
          { role: 'assistant', content: 'The quadratic formula gives you the roots of any quadratic equation.' },
        ],
        recentUserMessages: [],
      }
    );
    expect(result.messageType).not.toBe(MESSAGE_TYPES.PARROTING);
  });
});

// ============================================================================
// decide() integration — handlers produce correct actions
// ============================================================================

describe('decide() handles parroting and evasive affirmatives', () => {
  const baseObservation = {
    confidence: 1.0,
    answer: null,
    contextSignals: [],
    streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
    problemContext: {},
    raw: '',
  };

  const baseDiagnosis = {
    isCorrect: null,
    correctAnswer: null,
    difficulty: 'medium',
  };

  const baseContext = {
    tutorPlan: { currentProblem: '2x + 3 = 7', currentAnswer: '2' },
    sessionMood: { trajectory: 'neutral', energy: 'medium' },
  };

  test('parroting triggers CHECK_UNDERSTANDING with transfer question directive', () => {
    const obs = {
      ...baseObservation,
      messageType: MESSAGE_TYPES.PARROTING,
      raw: 'you multiply both sides by 3 and the denominator cancels',
    };
    const result = decide(obs, baseDiagnosis, baseContext);
    expect(result.action).toBe(ACTIONS.CHECK_UNDERSTANDING);
    expect(result.scaffoldLevel).toBe(3);
    expect(result.directives.some(d => /PARROTING/i.test(d))).toBe(true);
    expect(result.directives.some(d => /transfer/i.test(d))).toBe(true);
  });

  test('evasive affirmative triggers CHECK_UNDERSTANDING with "show me" directive', () => {
    const obs = {
      ...baseObservation,
      messageType: MESSAGE_TYPES.EVASIVE_AFFIRMATIVE,
      raw: 'yes',
    };
    const result = decide(obs, baseDiagnosis, baseContext);
    expect(result.action).toBe(ACTIONS.CHECK_UNDERSTANDING);
    expect(result.scaffoldLevel).toBe(3);
    expect(result.directives.some(d => /EVASION/i.test(d))).toBe(true);
    expect(result.directives.some(d => /show/i.test(d))).toBe(true);
  });
});

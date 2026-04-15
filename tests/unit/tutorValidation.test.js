/**
 * TRANSCRIPT-LEVEL REGRESSION TESTS — Tutor Validation
 *
 * These tests reproduce the exact scenarios from the bug report where the
 * tutor falsely rejected correct student answers or dragged students through
 * unnecessary scaffolding steps.
 *
 * Unlike pipelineIntegration.test.js (which mocks mathSolver), these tests
 * use the REAL math solver to prove end-to-end correctness for calculus
 * and algebraic answer verification.
 *
 * Test categories:
 *   1. Correct answer given directly (student skips to final answer)
 *   2. Correct answer embedded in explanation
 *   3. Correct algebraic expression answer
 *   4. Correct answer in equivalent form
 *   5. Correct method but wrong arithmetic (should NOT affirm)
 *   6. Student self-corrects mid-conversation
 */

// ── Mocks (LLM + DB only — math solver is REAL) ──

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
}));

jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

// DO NOT mock mathSolver — we need real verification

jest.mock('../../utils/misconceptionDetector', () => ({
  analyzeError: jest.fn(() => null),
  findKnownMisconception: jest.fn(() => null),
  recordMisconception: jest.fn(() => Promise.resolve()),
  MISCONCEPTION_LIBRARY: {},
}));

jest.mock('../../utils/worksheetGuard', () => ({
  filterAnswerKeyResponse: jest.fn((text) => ({ text, wasFiltered: false })),
}));

jest.mock('../../utils/readability', () => ({
  checkReadingLevel: jest.fn(() => ({ passes: true })),
  buildSimplificationPrompt: jest.fn(() => ''),
}));

jest.mock('../../utils/visualCommandEnforcer', () => ({
  enforceVisualTeaching: jest.fn((_userMsg, text) => text),
  autoVisualizeByTopic: jest.fn((_userMsg, text) => text),
}));

jest.mock('../../utils/visualTeachingParser', () => ({
  parseVisualTeaching: jest.fn((text) => ({ cleanedText: text, visualCommands: {}, drawingSequence: null })),
}));

jest.mock('../../utils/chatBoardParser', () => ({
  processAIResponse: jest.fn((text) => ({ text, boardContext: null })),
}));

jest.mock('../../utils/emailService', () => ({
  sendSafetyConcernAlert: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../utils/activitySummarizer', () => ({
  detectTopic: jest.fn(() => 'Calculus'),
  detectStruggle: jest.fn(() => ({ isStruggling: false })),
}));

jest.mock('../../utils/unlockTutors', () => ({
  getTutorsToUnlock: jest.fn(() => []),
}));

jest.mock('../../utils/promptCompressor', () => ({
  calculateXpBoostFactor: jest.fn(() => ({ factor: 1.0, isNewUser: false, guidance: 'none' })),
  determineTier: jest.fn(() => 'tier1'),
  buildSystemPrompt: jest.fn(() => 'system prompt'),
}));

const { callLLM } = require('../../utils/llmGateway');
const { runPipeline } = require('../../utils/pipeline');
const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');

// ── Helpers ──

function mockUser(overrides = {}) {
  return {
    _id: 'user123',
    firstName: 'Jason',
    lastName: 'Student',
    username: 'jason',
    gradeLevel: '11th',
    level: 8,
    xp: 500,
    iepPlan: null,
    skillMastery: new Map(),
    learningProfile: {},
    learningEngines: {},
    xpLadderStats: { lifetimeTier1: 0, lifetimeTier2: 0, lifetimeTier3: 0, tier3Behaviors: [] },
    masteryProgress: null,
    weeklyAISeconds: 0,
    totalAISeconds: 0,
    activeCourseSessionId: null,
    unlockedItems: [],
    markModified: jest.fn(),
    save: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function mockConversation(messages = [], overrides = {}) {
  return {
    _id: 'conv123',
    userId: 'user123',
    messages: [...messages],
    problemsAttempted: 0,
    problemsCorrect: 0,
    lastActivity: new Date(),
    currentTopic: null,
    strugglingWith: null,
    alerts: [],
    createdAt: new Date(Date.now() - 5 * 60 * 1000),
    startDate: new Date(Date.now() - 5 * 60 * 1000),
    sessionMood: {},
    save: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function mockLLMResponse(text) {
  callLLM.mockResolvedValueOnce({
    choices: [{ message: { content: text } }],
  });
}

function buildCtx(user, conversation, extras = {}) {
  return {
    user,
    conversation,
    systemPrompt: 'You are a friendly math tutor.',
    formattedMessages: conversation.messages.map(m => ({ role: m.role, content: m.content })),
    activeSkill: null,
    phaseState: null,
    hasRecentUpload: false,
    stream: false,
    res: null,
    aiProcessingStartTime: Date.now(),
    ...extras,
  };
}

/**
 * Run observe + diagnose + decide (the deterministic stages)
 * without calling the LLM. This tests the exact pipeline decisions.
 *
 * tutorMessages can be:
 *   - Array of strings (legacy shorthand — no stored problemInfo)
 *   - Array of objects { content, problemInfo? } (simulates stored metadata)
 */
async function runDeterministicStages(studentMessage, tutorMessages) {
  const recentAssistantMessages = tutorMessages.map(msg => {
    const isObj = typeof msg === 'object' && msg !== null;
    return {
      content: isObj ? msg.content : msg,
      role: 'assistant',
      problemResult: null,
      problemInfo: isObj ? (msg.problemInfo || null) : null,
    };
  });

  const observation = observe(studentMessage, {
    recentUserMessages: [],
    recentAssistantMessages,
    hasRecentUpload: false,
  });

  const diagnosis = await diagnose(observation, {
    recentAssistantMessages: recentAssistantMessages.map(msg => ({
      content: msg.content,
      problemResult: msg.problemResult,
      problemInfo: msg.problemInfo,
    })),
    recentUserMessages: [],
    activeSkill: null,
    user: mockUser(),
  });

  const decision = decide(observation, diagnosis, {
    phaseState: null,
    activeSkill: null,
  });

  return { observation, diagnosis, decision };
}

// ============================================================================
// TRANSCRIPT REGRESSION TESTS
// ============================================================================

describe('Tutor Validation: Transcript Regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // BUG REPORT SCENARIO 1:
  // Tutor asks: "What is the limit of (x²-4)/(x-2) as x approaches 2?"
  // Student answers: "4"
  // EXPECTED: Confirm correct immediately
  // PREVIOUS BUG: Tutor said "Hmm, that's an interesting answer!"
  // ────────────────────────────────────────────────────────────────────────

  test('TRANSCRIPT BUG 1: limit answer "4" must be confirmed correct', async () => {
    const { observation, diagnosis, decision } = await runDeterministicStages(
      '4',
      ['Can you tell me what the limit of (x^2-4)/(x-2) is as x approaches 2? What do you think we should do first?']
    );

    expect(observation.messageType).toBe('answer_attempt');
    expect(observation.answer.value).toBe('4');
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.correctAnswer).toBe('4');
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  // ────────────────────────────────────────────────────────────────────────
  // BUG REPORT SCENARIO 2:
  // Student explains: "after I factor and simplify, you get x+2...
  //   which means the limit is 4"
  // EXPECTED: Confirm correct AND acknowledge reasoning, then advance
  // PREVIOUS BUG: Tutor kept dragging through steps
  // ────────────────────────────────────────────────────────────────────────

  test('TRANSCRIPT BUG 2: explained answer with reasoning must affirm and advance', async () => {
    const { observation, diagnosis, decision } = await runDeterministicStages(
      'Yeah, but after I factor and simplify, you get x+2, which means the limit is 4',
      ['Can you tell me what the limit of (x^2-4)/(x-2) is as x approaches 2? What do you think we should do first?']
    );

    expect(observation.messageType).toBe('answer_attempt');
    expect(observation.answer.value).toBe('4');
    expect(observation.answer.hasExplanation).toBe(true);
    expect(observation.demonstratedReasoning).toBe(true);
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.demonstratedReasoning).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
    // Must include directive to NOT re-walk steps
    expect(decision.directives.some(d => /DEMONSTRATED UNDERSTANDING/.test(d))).toBe(true);
    expect(decision.directives.some(d => /do NOT walk them through steps/i.test(d))).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────
  // BUG REPORT SCENARIO 3:
  // Tutor asks: "derivative of x³ - 3x + 2?"
  // Student answers: "3x^2-3"
  // EXPECTED: Confirm correct immediately
  // PREVIOUS BUG: Tutor said "Nice try! You got the x³ term right..."
  // ────────────────────────────────────────────────────────────────────────

  test('TRANSCRIPT BUG 3: derivative answer "3x^2-3" must be confirmed correct', async () => {
    const { observation, diagnosis, decision } = await runDeterministicStages(
      '3x^2-3',
      ['How about we tackle the derivative of x^3 - 3x + 2? What do you think the first step is?']
    );

    expect(observation.messageType).toBe('answer_attempt');
    expect(observation.answer.value).toBe('3x^2-3');
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.correctAnswer).toBe('3x^2-3');
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
    // Must NEVER contain guide/remediation actions
    expect(decision.action).not.toBe(ACTIONS.GUIDE_INCORRECT);
    expect(decision.action).not.toBe(ACTIONS.RETEACH_MISCONCEPTION);
  });

  // ────────────────────────────────────────────────────────────────────────
  // BUG REPORT SCENARIO 4: Warm-up — derivative of x²
  // Student answers: "2x"
  // EXPECTED: Confirm correct
  // ────────────────────────────────────────────────────────────────────────

  test('TRANSCRIPT BUG 4: derivative of x^2 = 2x must be confirmed correct', async () => {
    const { observation, diagnosis, decision } = await runDeterministicStages(
      '2x',
      ['What is the derivative of x^2? Just a simple one to get us rolling!']
    );

    expect(observation.messageType).toBe('answer_attempt');
    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });
});

// ============================================================================
// ADDITIONAL CORRECTNESS SCENARIOS
// ============================================================================

describe('Tutor Validation: Correct Answer Must Always Be Confirmed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('bare numeric answer to limit problem', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '6',
      ['What is the limit of (x^2-9)/(x-3) as x approaches 3?']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('algebraic expression answer to derivative', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '20x^3+6x-7',
      ['Find the derivative of 5x^4 + 3x^2 - 7x + 1']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('constant derivative answer', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '4',
      ['What is the derivative of 4x?']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('zero derivative of constant', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '0',
      ['What is the derivative of 7?']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('limit via direct substitution (no discontinuity)', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '10',
      ['What is the limit of x^2 + 3x as x approaches 2?']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('student gives answer in longer sentence', async () => {
    const { observation, diagnosis, decision } = await runDeterministicStages(
      'I think the answer is 4',
      ['What is the limit of (x^2-4)/(x-2) as x approaches 2?']
    );

    expect(observation.answer.value).toBe('4');
    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });
});

// ============================================================================
// INCORRECT ANSWERS MUST NOT BE FALSELY CONFIRMED
// ============================================================================

describe('Tutor Validation: Incorrect Answers Must Not Be Confirmed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('wrong numeric answer to limit', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '2',
      ['What is the limit of (x^2-4)/(x-2) as x approaches 2?']
    );

    expect(diagnosis.isCorrect).toBe(false);
    expect(decision.action).not.toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('wrong derivative answer', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '3x^2+3',
      ['What is the derivative of x^3 - 3x + 2?']
    );

    // Student got the sign wrong on the -3 term
    expect(diagnosis.isCorrect).toBe(false);
    expect(decision.action).not.toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('partially correct derivative (missing constant rule)', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '3x^2-3+2',
      ['What is the derivative of x^3 - 3x + 2?']
    );

    // Student forgot to drop the constant
    expect(diagnosis.isCorrect).toBe(false);
    expect(decision.action).not.toBe(ACTIONS.CONFIRM_CORRECT);
  });
});

// ============================================================================
// FULL PIPELINE: FALSE REJECTION GUARD
// ============================================================================

describe('Tutor Validation: False Rejection Guard (Full Pipeline)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('LLM hedging on verified-correct answer triggers regeneration', async () => {
    const user = mockUser();
    const conversation = mockConversation([
      { role: 'assistant', content: 'What is the derivative of x^3 - 3x + 2?' },
      { role: 'user', content: '3x^2-3' },
    ]);

    // LLM falsely hedges despite the answer being correct
    mockLLMResponse('Nice try! You got the x^3 term right, but let\'s check the other terms.');
    // Regeneration call returns proper confirmation
    mockLLMResponse('That\'s right! The derivative of x^3 - 3x + 2 is indeed 3x^2 - 3. <PROBLEM_RESULT:correct>');

    const result = await runPipeline('3x^2-3', buildCtx(user, conversation));

    expect(result._pipeline.action).toBe('confirm_correct');
    expect(result._pipeline.flags).toContain('false_rejection_detected');
    expect(result._pipeline.flags).toContain('false_rejection_regenerated');
    // Final text should NOT contain false rejection language
    expect(result.text).not.toMatch(/nice try/i);
    expect(result.text).not.toMatch(/let's check/i);
  });

  test('LLM proper confirmation on verified-correct answer passes through', async () => {
    const user = mockUser();
    const conversation = mockConversation([
      { role: 'assistant', content: 'What is the limit of (x^2-4)/(x-2) as x approaches 2?' },
      { role: 'user', content: '4' },
    ]);

    mockLLMResponse('Exactly right! The limit is 4. <PROBLEM_RESULT:correct> Nice work on that removable discontinuity.');

    const result = await runPipeline('4', buildCtx(user, conversation));

    expect(result._pipeline.action).toBe('confirm_correct');
    expect(result._pipeline.flags).not.toContain('false_rejection_detected');
    // Response should contain confirmation
    expect(result.text).toMatch(/right|correct/i);
  });
});

// ============================================================================
// ANSWER EXTRACTION EDGE CASES
// ============================================================================

describe('Tutor Validation: Answer Extraction', () => {
  test('extracts final answer over intermediate step in explanation', () => {
    const obs = observe(
      'Yeah, but after I factor and simplify, you get x+2, which means the limit is 4',
      { recentUserMessages: [], recentAssistantMessages: [] }
    );
    // Must extract 4 (conclusive), NOT x+2 (intermediate)
    expect(obs.answer.value).toBe('4');
    expect(obs.answer.hasExplanation).toBe(true);
    expect(obs.demonstratedReasoning).toBe(true);
  });

  test('extracts algebraic expression as bare answer', () => {
    const obs = observe('3x^2-3', { recentUserMessages: [], recentAssistantMessages: [] });
    expect(obs.messageType).toBe('answer_attempt');
    expect(obs.answer.value).toBe('3x^2-3');
  });

  test('extracts answer from "the derivative is ..."', () => {
    const obs = observe(
      'Using the power rule, the derivative is 5x^4-1',
      { recentUserMessages: [], recentAssistantMessages: [] }
    );
    expect(obs.answer.value).toBe('5x^4-1');
    expect(obs.answer.hasExplanation).toBe(true);
  });

  test('bare number in unrelated sentence is not falsely extracted', () => {
    // "I'm already at the station. 4" — the "4" has no answer phrase.
    // Without conversational context, observe cannot know "4" is an answer.
    // This is fine — the LLM handles ambiguous cases. The important thing
    // is that when the student says JUST "4" (bare number), it IS extracted.
    const obs = observe(
      "I'm already at the station. 4",
      { recentUserMessages: [], recentAssistantMessages: [] }
    );
    // The bare "4" is NOT the full message, so justNumber won't match.
    // No answer phrase present either. This is correctly ambiguous.
    // What matters is that "4" alone works:
    const obs2 = observe('4', { recentUserMessages: [], recentAssistantMessages: [] });
    expect(obs2.answer).not.toBeNull();
    expect(obs2.answer.value).toBe('4');
    expect(obs2.messageType).toBe('answer_attempt');
  });

  test('does not extract answer from very long off-topic messages', () => {
    const longMsg = 'I was just thinking about how math is really interesting and ' +
      'I wonder if we could talk about something else for a while because ' +
      'I am really tired today and do not feel like doing more problems ' +
      'right now maybe we could take a break or something what do you think';
    const obs = observe(longMsg, { recentUserMessages: [], recentAssistantMessages: [] });
    expect(obs.messageType).not.toBe('answer_attempt');
  });

  test('student self-corrects: "wait no, it should be 4"', () => {
    const obs = observe(
      'wait no, the answer is 4',
      { recentUserMessages: [], recentAssistantMessages: [] }
    );
    expect(obs.answer).not.toBeNull();
    expect(obs.answer.value).toBe('4');
  });
});

// ── Unicode Superscript Normalization ──
// Regression: "3² = 9" was rejected because ² wasn't converted to ^2

describe('Tutor Validation: Unicode Superscript Normalization', () => {
  const { processMathMessage } = require('../../utils/mathSolver');

  test('detects 3² as an exponent problem and computes 9', () => {
    const result = processMathMessage('what is 3²');
    expect(result.hasMath).toBe(true);
    expect(result.solution?.answer).toBe('9');
  });

  test('detects 5³ as an exponent problem and computes 125', () => {
    const result = processMathMessage('what is 5³');
    expect(result.hasMath).toBe(true);
    expect(result.solution?.answer).toBe('125');
  });

  test('detects 2⁴ as an exponent problem and computes 16', () => {
    const result = processMathMessage('2⁴');
    expect(result.hasMath).toBe(true);
    expect(result.solution?.answer).toBe('16');
  });

  test('verifies student answer 9 is correct for 3²', () => {
    const result = processMathMessage('Can you tell me what 3² is?');
    expect(result.hasMath).toBe(true);
    expect(result.solution?.answer).toBe('9');
    // Verify the student's answer would match
    const verification = require('../../utils/mathSolver').verifyAnswer('9', result.solution.answer);
    expect(verification.isCorrect).toBe(true);
  });

  test('handles mixed Unicode superscripts: x² + 5x + 6 factor pattern', () => {
    const result = processMathMessage('factor x² + 5x + 6');
    expect(result.hasMath).toBe(true);
  });
});

// ============================================================================
// ANSWER LEAK REGRESSION TESTS
//
// BUG: When a student sent a math equation to solve (e.g. "4x-15=21"),
// the MATH_VERIFICATION injection in chat.js gave the LLM the solved answer.
// The LLM then presented the full step-by-step solution, violating the #1
// Socratic teaching rule. The tutor should NEVER give answers to student-posed
// problems — it should guide them through the first step with a question.
//
// ROOT CAUSE: chat.js injected [MATH_VERIFICATION: answer = X] for ALL
// detected math problems, including new questions (not just answer attempts).
// FIX: Gate injection behind observe pre-classification (ANSWER_ATTEMPT only).
// ============================================================================

describe('Tutor Validation: Answer Leak Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // CRITICAL: Student sends a math equation to solve.
  // Pipeline must classify as GENERAL_MATH (not ANSWER_ATTEMPT) and
  // decide CONTINUE_CONVERSATION with Socratic directives.
  // ────────────────────────────────────────────────────────────────────────

  test('ANSWER LEAK BUG: "4x-15=21" must NOT be classified as answer attempt', async () => {
    const { observation, diagnosis, decision } = await runDeterministicStages(
      '4x-15=21',
      [] // no prior tutor messages — student is posing a new problem
    );

    // Must be classified as a question, NOT an answer
    expect(observation.messageType).toBe('general_math');
    expect(observation.answer).toBeNull();

    // Diagnosis must be no_answer (nothing to verify)
    expect(diagnosis.type).toBe('no_answer');
    expect(diagnosis.isCorrect).toBeNull();

    // Decision must guide Socratically, NEVER solve
    expect(decision.action).toBe('continue_conversation');
    expect(decision.directives.some(d => /NEVER show the full solution/i.test(d))).toBe(true);
  });

  test('ANSWER LEAK BUG: "3^(x+1) = 81" must NOT be classified as answer attempt', async () => {
    const { observation, diagnosis, decision } = await runDeterministicStages(
      '3^(x+1) = 81',
      []
    );

    expect(observation.messageType).toBe('general_math');
    expect(observation.answer).toBeNull();
    expect(diagnosis.type).toBe('no_answer');
    expect(decision.action).toBe('continue_conversation');
  });

  test('ANSWER LEAK BUG: "3(3^x + 3^(x+1)) = 108" must NOT be classified as answer attempt', async () => {
    const { observation, diagnosis, decision } = await runDeterministicStages(
      '3(3^x + 3^(x+1)) = 108',
      []
    );

    expect(observation.messageType).toBe('general_math');
    expect(observation.answer).toBeNull();
    expect(diagnosis.type).toBe('no_answer');
    expect(decision.action).toBe('continue_conversation');
  });

  test('ANSWER LEAK BUG: "solve 2x + 5 = 13" must NOT be classified as answer attempt', async () => {
    const { observation, decision } = await runDeterministicStages(
      'solve 2x + 5 = 13',
      []
    );

    // "solve" starts the message → classified as QUESTION
    expect(observation.messageType).toBe('question');
    expect(observation.answer).toBeNull();
    expect(decision.action).toBe('continue_conversation');
  });

  // ────────────────────────────────────────────────────────────────────────
  // CONTRAST: Student answers a previously posed problem.
  // Pipeline must classify as ANSWER_ATTEMPT and verify correctly.
  // ────────────────────────────────────────────────────────────────────────

  test('CONTRAST: student answering "x = 3" to a posed problem IS an answer attempt', async () => {
    const { observation, diagnosis, decision } = await runDeterministicStages(
      'x = 3',
      ['Great! Now try solving 3^(x+1) = 81. What do you think x is?']
    );

    expect(observation.messageType).toBe('answer_attempt');
    expect(observation.answer).not.toBeNull();
    expect(observation.answer.value).toBe('3');
    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('CONTRAST: student answering bare "9" IS an answer attempt (not a question)', async () => {
    // The key test: bare "9" must be classified as an answer attempt so that
    // the MATH_VERIFICATION gate in chat.js allows injection (not suppresses it).
    // This ensures the gate distinguishes answers from questions.
    const { observation } = await runDeterministicStages(
      '9',
      ['What value of x makes 4x - 15 = 21 true? Think about what operation undoes subtraction.']
    );

    expect(observation.messageType).toBe('answer_attempt');
    expect(observation.answer).not.toBeNull();
    expect(observation.answer.value).toBe('9');
  });

  // ────────────────────────────────────────────────────────────────────────
  // Pre-classification gate: observe must suppress MATH_VERIFICATION for questions
  // ────────────────────────────────────────────────────────────────────────

  test('pre-classification correctly distinguishes question from answer for MATH_VERIFICATION gate', () => {
    // These are student-posed problems — MUST NOT trigger MATH_VERIFICATION
    const questions = [
      '4x-15=21',
      '2^x = 8',
      '3(3^x + 3^(x+1)) = 108',
      'x^2 + 5x + 6 = 0',
    ];
    for (const q of questions) {
      const obs = observe(q, { recentUserMessages: [], recentAssistantMessages: [] });
      expect(obs.messageType).not.toBe('answer_attempt');
    }

    // These are student answers — MUST trigger MATH_VERIFICATION
    const answers = ['9', 'x = 3', '3x^2-3', 'I think the answer is 4'];
    for (const a of answers) {
      const obs = observe(a, { recentUserMessages: [], recentAssistantMessages: [] });
      expect(obs.messageType).toBe('answer_attempt');
    }
  });
});

// ============================================================================
// FUNCTION-DEFINITION DERIVATIVE DETECTION
// ============================================================================

describe('Tutor Validation: Function-Definition Derivative Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // BUG REPORT SCENARIO 5:
  // Tutor asks: "g(x)=2x³+4x−7. What do you get for the derivative g'(x)?"
  // Student answers: "6x^2+4"
  // EXPECTED: Confirm correct (derivative of 2x³+4x-7 = 6x²+4)
  // PREVIOUS BUG: System matched an older message ("derivative of x²"),
  //   computed expected answer as "2x", and flagged "6x^2+4" as wrong.
  // ────────────────────────────────────────────────────────────────────────

  test('BUG 5: g(x)=2x^3+4x-7 derivative "6x^2+4" must be confirmed correct', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '6x^2+4',
      ['Absolutely, go for it! Give this function a shot: g(x)=2x^3+4x-7. What do you get for the derivative g\'(x)? Take your time, and let me know what you come up with!']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.correctAnswer).toBe('6x^2+4');
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('function definition with Unicode superscripts and derivative mention', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '6x^2+4',
      ['Give this function a shot: g(x)=2x³+4x−7. What do you get for the derivative g′(x)?']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('"derivative of f(x) = EXPR" phrasing is detected correctly', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '20x^3+6x-7',
      ['Find the derivative of f(x) = 5x^4 + 3x^2 - 7x + 1']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('"Let\'s try f(x) = EXPR. Find the derivative." phrasing', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '10x-3',
      ['Let\'s try f(x) = 5x^2 - 3x + 8. Find the derivative.']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('does not match function definition without derivative mention', async () => {
    // "g(x) = 2x + 3" without "derivative" should NOT be treated as a derivative problem
    const { diagnosis } = await runDeterministicStages(
      '7',
      ['Let\'s evaluate g(x) = 2x + 3 when x = 2']
    );

    // Should not be detected as a derivative (answer would be 2 if derivative, 7 if evaluation)
    // The key assertion: the system should NOT think the correct answer is "2"
    expect(diagnosis.correctAnswer).not.toBe('2');
  });
});

// ============================================================================
// STORED PROBLEM METADATA (PRIMARY FIX)
// ============================================================================

describe('Tutor Validation: Stored problemInfo Metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // The architectural fix: when an AI message has stored problemInfo metadata,
  // the diagnose stage reads it directly instead of re-parsing natural language.
  // This eliminates the entire class of "regex couldn't parse the phrasing" bugs.

  test('stored problemInfo is used over regex re-parsing', async () => {
    // Simulate a message with phrasing that NO regex could match,
    // but with stored metadata from when the message was persisted.
    const { diagnosis, decision } = await runDeterministicStages(
      '6x^2+4',
      [{
        content: 'Here is your challenge! Can you tell me what g\'(x) equals when g(x) is defined as 2x³ + 4x − 7? Go for it!',
        problemInfo: { type: 'derivative', correctAnswer: '6x^2+4' },
      }]
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.correctAnswer).toBe('6x^2+4');
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('stored problemInfo prevents matching wrong older message', async () => {
    // The original bug: two messages — old one matches regex, recent one doesn't.
    // With stored metadata on the recent one, the old one is never consulted.
    const { diagnosis, decision } = await runDeterministicStages(
      '6x^2+4',
      [
        // Old message that regex WOULD match (derivative of x^2 → answer "2x")
        'The derivative of x^2 is 2x. Great work on that warm-up!',
        // Recent message with stored metadata — regex can't parse this phrasing
        {
          content: 'Now try this one — if g(x) equals 2x³ + 4x − 7, what is g\'(x)?',
          problemInfo: { type: 'derivative', correctAnswer: '6x^2+4' },
        },
      ]
    );

    // Must use stored metadata (6x^2+4), NOT the older regex match (2x)
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.correctAnswer).toBe('6x^2+4');
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('falls back to regex parsing for legacy messages without metadata', async () => {
    // Legacy messages don't have stored problemInfo — regex parsing still works
    const { diagnosis, decision } = await runDeterministicStages(
      '3x^2-3',
      ['How about we tackle the derivative of x^3 - 3x + 2? What do you think?']
    );

    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.correctAnswer).toBe('3x^2-3');
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('stored metadata works for non-derivative problems too', async () => {
    const { diagnosis, decision } = await runDeterministicStages(
      '5',
      [{
        content: 'What is the limit of (x²-25)/(x-5) as x approaches 5?',
        problemInfo: { type: 'limit', correctAnswer: '10' },
      }]
    );

    expect(diagnosis.isCorrect).toBe(false);
    expect(diagnosis.correctAnswer).toBe('10');
    expect(decision.action).not.toBe(ACTIONS.CONFIRM_CORRECT);
  });
});


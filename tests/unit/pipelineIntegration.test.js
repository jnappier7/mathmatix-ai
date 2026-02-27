/**
 * PIPELINE INTEGRATION TEST — End-to-end runPipeline with mocked LLM + DB
 *
 * Tests the 5 most common paths through the full pipeline:
 *   1. Correct answer → confirm + XP
 *   2. Incorrect answer → guide + no tier2 XP
 *   3. Help request → scaffold down
 *   4. Off-topic message → redirect
 *   5. Student in flow → maintain pace
 *
 * Mocks: LLM calls, DB saves, email alerts.
 * Exercises: observe → diagnose → decide → generate → verify → persist
 */

// ── Mocks ──

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
}));

jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

jest.mock('../../utils/mathSolver', () => ({
  processMathMessage: jest.fn(() => ({ hasMath: false, problem: null, solution: null })),
  verifyAnswer: jest.fn(() => null),
}));

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
  checkReadingLevel: jest.fn(() => ({ passed: true })),
  buildSimplificationPrompt: jest.fn(() => ''),
}));

jest.mock('../../utils/visualCommandEnforcer', () => ({
  enforceVisualTeaching: jest.fn((_userMsg, text) => text),
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
  detectTopic: jest.fn(() => 'Algebra'),
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

// ── Helpers ──

function mockUser(overrides = {}) {
  return {
    _id: 'user123',
    firstName: 'Test',
    lastName: 'Student',
    username: 'teststudent',
    gradeLevel: '8th',
    level: 5,
    xp: 200,
    iepPlan: null,
    skillMastery: new Map(),
    learningProfile: {},
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
    createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
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

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Pipeline Integration: runPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('PATH 1: correct answer → confirm + tier2 XP', async () => {
    const user = mockUser();
    const conversation = mockConversation([
      { role: 'assistant', content: 'What is 3 + 4?', problemResult: null },
      { role: 'user', content: '7' },
    ]);

    // LLM returns a confirmation with a PROBLEM_RESULT tag
    mockLLMResponse('Great job! 7 is correct! \\( 3 + 4 = 7 \\) <PROBLEM_RESULT:correct> Now try: what is 5 + 6?');

    const result = await runPipeline('7', buildCtx(user, conversation));

    expect(result.text).not.toContain('PROBLEM_RESULT');
    expect(result.xpBreakdown.tier1).toBe(2);
    expect(result.xpBreakdown.tier2).toBe(10); // clean (no hint)
    expect(result.xpBreakdown.total).toBeGreaterThan(0);
    expect(result._pipeline.messageType).toBeDefined();
    expect(conversation.save).toHaveBeenCalled();
    expect(user.save).toHaveBeenCalled();
  });

  test('PATH 2: incorrect answer → guide + no tier2 XP', async () => {
    const user = mockUser();
    const conversation = mockConversation([
      { role: 'assistant', content: 'What is 8 - 3?', problemResult: null },
      { role: 'user', content: '3' },
    ]);

    mockLLMResponse('Not quite! <PROBLEM_RESULT:incorrect> Let\'s think about this — what happens when you start at 8 and take away 3?');

    const result = await runPipeline('3', buildCtx(user, conversation));

    expect(result.text).not.toContain('PROBLEM_RESULT');
    expect(result.xpBreakdown.tier2).toBe(0); // no tier2 for incorrect
    expect(result.xpBreakdown.tier1).toBe(2); // still gets turn XP
  });

  test('PATH 3: help request → respond with scaffolding', async () => {
    const user = mockUser();
    const conversation = mockConversation([
      { role: 'assistant', content: 'Solve: \\( 2x + 5 = 11 \\)', problemResult: null },
    ]);

    mockLLMResponse('No problem! Let\'s break it down. First, what operation can we use to get rid of the +5?');

    const result = await runPipeline('I don\'t know how to do this', buildCtx(user, conversation));

    expect(result.text).toContain('break it down');
    expect(result.xpBreakdown.tier1).toBe(2);
    expect(result.xpBreakdown.tier2).toBe(0);
  });

  test('PATH 4: off-topic message → redirect', async () => {
    const user = mockUser();
    const conversation = mockConversation([
      { role: 'assistant', content: 'What is \\( 5 \\times 3 \\)?', problemResult: null },
    ]);

    mockLLMResponse('That\'s a fun topic, but let\'s get back to math! What is \\( 5 \\times 3 \\)?');

    const result = await runPipeline('do you like pizza?', buildCtx(user, conversation));

    expect(result.text).toContain('math');
    expect(result._pipeline).toBeDefined();
  });

  test('PATH 5: student in flow (4+ correct) → mood metadata present', async () => {
    const user = mockUser();
    const messages = [];
    // Build 4 correct-answer exchanges
    for (let i = 0; i < 4; i++) {
      messages.push({ role: 'assistant', content: `Problem ${i + 1}`, problemResult: 'correct' });
      messages.push({ role: 'user', content: `${i + 5}` });
    }
    const conversation = mockConversation(messages);

    mockLLMResponse('Excellent! \\( 9 \\times 3 = 27 \\). <PROBLEM_RESULT:correct> You\'re on fire! Next: \\( 7 \\times 4 \\)?');

    const result = await runPipeline('27', buildCtx(user, conversation));

    expect(result._pipeline.sessionMood).toBeDefined();
    expect(result._pipeline.sessionMood.inFlow).toBe(true);
    expect(result._pipeline.sessionMood.trajectory).toBeDefined();
  });

  test('returns sidecar with signal stats', async () => {
    const user = mockUser();
    const conversation = mockConversation([
      { role: 'assistant', content: 'What is 2 + 2?', problemResult: null },
    ]);

    mockLLMResponse('4 is correct! <PROBLEM_RESULT:correct>');

    const result = await runPipeline('4', buildCtx(user, conversation));

    expect(result.sidecar).toBeDefined();
    expect(result._pipeline.signalStats).toBeDefined();
    expect(result._pipeline.signalStats.total).toBeGreaterThanOrEqual(0);
  });

  test('persists session mood to conversation document', async () => {
    const user = mockUser();
    const conversation = mockConversation([
      { role: 'assistant', content: 'What is 1 + 1?', problemResult: null },
      { role: 'user', content: '2' },
    ]);

    mockLLMResponse('Correct! <PROBLEM_RESULT:correct>');

    await runPipeline('2', buildCtx(user, conversation));

    // sessionMood should be set on the conversation
    expect(conversation.sessionMood).toBeDefined();
    expect(conversation.sessionMood.trajectory).toBeDefined();
    expect(conversation.sessionMood.lastUpdated).toBeInstanceOf(Date);
  });

  test('strips system tags from student-facing text', async () => {
    const user = mockUser();
    const conversation = mockConversation([
      { role: 'assistant', content: 'Explain your thinking.', problemResult: null },
    ]);

    mockLLMResponse(
      'Well done explaining your reasoning! <CORE_BEHAVIOR_XP:50,explained_reasoning> ' +
      '<PROBLEM_RESULT:correct> Keep it up!'
    );

    const result = await runPipeline('I subtracted 5 from both sides', buildCtx(user, conversation));

    expect(result.text).not.toContain('CORE_BEHAVIOR_XP');
    expect(result.text).not.toContain('PROBLEM_RESULT');
    expect(result.xpBreakdown.tier3).toBeGreaterThan(0);
    expect(result.xpBreakdown.tier3Behavior).toBe('explained_reasoning');
  });

  test('safety concern triggers alert', async () => {
    const { sendSafetyConcernAlert } = require('../../utils/emailService');
    const user = mockUser();
    const conversation = mockConversation([]);

    mockLLMResponse('I understand you\'re feeling down. <SAFETY_CONCERN>Student expressed self-harm ideation</SAFETY_CONCERN> Let me help you find support.');

    await runPipeline('I want to hurt myself', buildCtx(user, conversation));

    expect(sendSafetyConcernAlert).toHaveBeenCalled();
  });
});

/**
 * PIPELINE TESTS — Unit tests for the 6-stage tutoring pipeline
 *
 * Tests the deterministic stages (observe, diagnose sync, decide)
 * and the prompt assembly (generate, verify tag extraction, sidecar).
 *
 * Does NOT test LLM calls or DB persistence (those need integration tests).
 */

// Mock LLM gateway to prevent real API calls
jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
}));

// Mock OpenAI client initialization
jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

const { observe, MESSAGE_TYPES, PATTERNS, extractAnswer, detectContextSignals } = require('../../utils/pipeline/observe');
const { estimateIndependence, diagnose } = require('../../utils/pipeline/diagnose');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');
const { buildActionPrompt, buildVerificationContext, buildStreakWarning, assemblePrompt } = require('../../utils/pipeline/generate');
const { extractSystemTags, normalizeLatex } = require('../../utils/pipeline/verify');
const { buildSidecar, mergeLlmSignals, getSidecarInstruction, getSignalStats } = require('../../utils/pipeline/sidecar');
const { buildSlimRules, CORE_RULES } = require('../../utils/pipeline/promptSlim');
const { computeSessionMood, scoreMessage, buildMoodDirective, TRAJECTORIES, ENERGY_LEVELS } = require('../../utils/pipeline/sessionMood');

// ============================================================================
// OBSERVE STAGE
// ============================================================================

describe('Pipeline: Observe Stage', () => {
  describe('extractAnswer', () => {
    test('extracts bare numbers', () => {
      expect(extractAnswer('7')).toEqual({ value: '7', raw: '7' });
      expect(extractAnswer('-3')).toEqual({ value: '-3', raw: '-3' });
      expect(extractAnswer('3.5')).toEqual({ value: '3.5', raw: '3.5' });
    });

    test('extracts fractions', () => {
      expect(extractAnswer('3/4')).toEqual({ value: '3/4', raw: '3/4' });
      expect(extractAnswer('-1/2')).toEqual({ value: '-1/2', raw: '-1/2' });
    });

    test('extracts variable assignments', () => {
      expect(extractAnswer('x = 5')).toEqual({ value: '5', raw: 'x = 5' });
      expect(extractAnswer('y = -3.5')).toEqual({ value: '-3.5', raw: 'y = -3.5' });
    });

    test('extracts answer phrases', () => {
      expect(extractAnswer('the answer is 7')).toEqual({ value: '7', raw: 'the answer is 7' });
      expect(extractAnswer('I got 3.5')).toEqual({ value: '3.5', raw: 'I got 3.5' });
      expect(extractAnswer("it's -2")).toEqual({ value: '-2', raw: "it's -2" });
    });

    test('rejects long messages', () => {
      expect(extractAnswer('a'.repeat(101))).toBeNull();
    });

    test('rejects non-answer messages', () => {
      expect(extractAnswer('how do I solve this?')).toBeNull();
      expect(extractAnswer('help me understand fractions')).toBeNull();
    });
  });

  describe('observe classification', () => {
    test('classifies answer attempts', () => {
      const result = observe('7');
      expect(result.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
      expect(result.answer).not.toBeNull();
    });

    test('classifies IDK', () => {
      expect(observe('idk').messageType).toBe(MESSAGE_TYPES.IDK);
      expect(observe("i don't know").messageType).toBe(MESSAGE_TYPES.IDK);
      expect(observe('no clue').messageType).toBe(MESSAGE_TYPES.IDK);
    });

    test('classifies give-up', () => {
      expect(observe('just tell me the answer').messageType).toBe(MESSAGE_TYPES.GIVE_UP);
      expect(observe('give me the answer').messageType).toBe(MESSAGE_TYPES.GIVE_UP);
      expect(observe('I give up').messageType).toBe(MESSAGE_TYPES.GIVE_UP);
    });

    test('classifies frustration', () => {
      expect(observe('this is stupid I hate math').messageType).toBe(MESSAGE_TYPES.FRUSTRATION);
      expect(observe('this is impossible').messageType).toBe(MESSAGE_TYPES.FRUSTRATION);
    });

    test('classifies off-task', () => {
      expect(observe('play fortnite with me').messageType).toBe(MESSAGE_TYPES.OFF_TASK);
      expect(observe('tell me a joke').messageType).toBe(MESSAGE_TYPES.OFF_TASK);
    });

    test('classifies help requests', () => {
      expect(observe('can you help me?').messageType).toBe(MESSAGE_TYPES.HELP_REQUEST);
      expect(observe("I'm stuck").messageType).toBe(MESSAGE_TYPES.HELP_REQUEST);
      expect(observe("I don't understand").messageType).toBe(MESSAGE_TYPES.HELP_REQUEST);
    });

    test('classifies greetings', () => {
      expect(observe('hi').messageType).toBe(MESSAGE_TYPES.GREETING);
      expect(observe('hello').messageType).toBe(MESSAGE_TYPES.GREETING);
    });

    test('classifies skip requests', () => {
      expect(observe('skip').messageType).toBe(MESSAGE_TYPES.SKIP_REQUEST);
      expect(observe('next one').messageType).toBe(MESSAGE_TYPES.SKIP_REQUEST);
      expect(observe('harder problem').messageType).toBe(MESSAGE_TYPES.SKIP_REQUEST);
      expect(observe('another question').messageType).toBe(MESSAGE_TYPES.SKIP_REQUEST);
      expect(observe('harder one').messageType).toBe(MESSAGE_TYPES.SKIP_REQUEST);
    });

    test('does not classify "give me" requests as answer attempts', () => {
      // "Can you give me a harder problem?" was falsely matched as answer "m"
      const result = observe('Can you give me a harder problem?');
      expect(result.messageType).not.toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
      expect(result.answer).toBeNull();
    });

    test('intent signals take priority over accidental answer patterns', () => {
      // These all contain patterns that could match answer extraction
      // but have clear intent signals that should win.
      expect(observe("I don't get it").messageType).toBe(MESSAGE_TYPES.HELP_REQUEST);
      expect(observe("What do you get when you divide?").messageType).toBe(MESSAGE_TYPES.QUESTION);
      expect(observe("I'm stuck on this").messageType).toBe(MESSAGE_TYPES.HELP_REQUEST);
      expect(observe('how do I solve this?').messageType).toBe(MESSAGE_TYPES.HELP_REQUEST);
      expect(observe('this is impossible').messageType).toBe(MESSAGE_TYPES.FRUSTRATION);
      // "explain" matches question, not answer extraction
      expect(observe('explain how you get the derivative').messageType).toBe(MESSAGE_TYPES.QUESTION);
    });

    test('legitimate answers still classify correctly', () => {
      // After restructuring, real answers must still be detected
      expect(observe('7').messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
      expect(observe('3x^2').messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
      expect(observe('-5').messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
      expect(observe('x = 5').messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
      expect(observe('2/3').messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    });

    test('give-up takes priority over IDK', () => {
      // "just tell me" should be give_up even though it could match help_request
      expect(observe('just tell me').messageType).toBe(MESSAGE_TYPES.GIVE_UP);
    });

    test('detects streaks from recent history', () => {
      const result = observe('idk', {
        recentUserMessages: [
          { content: 'idk' },
          { content: 'i dont know' },
          { content: 'no idea' },
        ],
        recentAssistantMessages: [],
      });
      expect(result.streaks.idkCount).toBe(3);
    });
  });

  describe('context signals', () => {
    test('detects frustration signal', () => {
      const signals = detectContextSignals('ugh this is stupid');
      expect(signals).toContainEqual(expect.objectContaining({ type: 'frustration' }));
    });

    test('detects metacognition signal', () => {
      const signals = detectContextSignals('oh I see what you mean');
      expect(signals).toContainEqual(expect.objectContaining({ type: 'metacognition' }));
    });

    test('detects confidence signal', () => {
      const signals = detectContextSignals('I think the answer is 5');
      expect(signals).toContainEqual(expect.objectContaining({ type: 'confidence' }));
    });
  });
});

// ============================================================================
// DIAGNOSE STAGE (sync parts only)
// ============================================================================

describe('Pipeline: Diagnose Stage', () => {
  describe('estimateIndependence', () => {
    test('independent when no hints requested', () => {
      expect(estimateIndependence({}, { recentUserMessages: [] })).toBe('independent');
      expect(estimateIndependence({}, { recentUserMessages: [{ content: 'hi' }] })).toBe('independent');
    });

    test('hint_assisted with one hint', () => {
      expect(estimateIndependence({}, {
        recentUserMessages: [{ content: 'hint please' }],
      })).toBe('hint_assisted');
    });

    test('heavily_scaffolded with multiple hints', () => {
      expect(estimateIndependence({}, {
        recentUserMessages: [
          { content: "I'm stuck" },
          { content: 'help me' },
        ],
      })).toBe('heavily_scaffolded');
    });
  });

  describe('diagnose with LaTeX-wrapped AI messages', () => {
    test('correctly verifies answer when AI message uses LaTeX delimiters', async () => {
      const observation = {
        answer: { value: '235', raw: '235' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'numeric',
      };
      const context = {
        recentAssistantMessages: [{
          content: 'When you add \\(141\\) and \\(94\\):\n1. Ones place: \\(1 + 4 = 5\\)\n2. Tens place: \\(4 + 9 = 13\\)\n3. Hundreds place: \\(1 + 0 + 1 = 2\\)\nWhat do you think the total is?',
        }],
        recentUserMessages: [],
      };
      const result = await diagnose(observation, context);
      expect(result.isCorrect).toBe(true);
      expect(result.correctAnswer).toBe('235');
    });

    test('correctly verifies answer when AI uses $...$ delimiters', async () => {
      const observation = {
        answer: { value: '235', raw: '235' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'numeric',
      };
      const context = {
        recentAssistantMessages: [{
          content: 'When you add $141$ and $94$, what do you get?',
        }],
        recentUserMessages: [],
      };
      const result = await diagnose(observation, context);
      expect(result.isCorrect).toBe(true);
      expect(result.correctAnswer).toBe('235');
    });

    test('detects the full problem, not a sub-step, in LaTeX messages', async () => {
      const observation = {
        answer: { value: '235', raw: '235' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'numeric',
      };
      const context = {
        recentAssistantMessages: [{
          content: 'Let\'s add \\(141\\) and \\(94\\). Start with the ones: \\(1 + 4 = 5\\).',
        }],
        recentUserMessages: [],
      };
      const result = await diagnose(observation, context);
      // Should find 141 + 94 = 235, NOT 1 + 4 = 5
      expect(result.correctAnswer).toBe('235');
      expect(result.isCorrect).toBe(true);
    });

    test('still works with plain text (no LaTeX) messages', async () => {
      const observation = {
        answer: { value: '15', raw: '15' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'numeric',
      };
      const context = {
        recentAssistantMessages: [{
          content: 'What is 7 plus 8?',
        }],
        recentUserMessages: [],
      };
      const result = await diagnose(observation, context);
      expect(result.isCorrect).toBe(true);
      expect(result.correctAnswer).toBe('15');
    });

    test('returns unverifiable when no math found in AI messages', async () => {
      const observation = {
        answer: { value: '42', raw: '42' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'numeric',
      };
      const context = {
        recentAssistantMessages: [{
          content: 'Tell me about how you approached that problem.',
        }],
        recentUserMessages: [],
      };
      const result = await diagnose(observation, context);
      expect(result.type).toBe('unverifiable');
      expect(result.isCorrect).toBeNull();
    });
  });

  describe('diagnose LLM verification fallback', () => {
    test('uses LLM verdict when solver cannot parse the problem', async () => {
      const observation = {
        answer: { value: 'QED', raw: 'QED' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'conceptual',
      };
      const context = {
        // Proof question — no numeric problem the deterministic solver can parse.
        recentAssistantMessages: [{
          content: 'Show that the sum of the angles in any triangle is the same.',
        }],
        recentUserMessages: [],
        llmVerificationPromise: Promise.resolve({
          isCorrect: true,
          confidence: 0.95,
          modelAnswer: 'valid proof',
          rationale: 'proof reasoning is sound',
          error: null,
        }),
      };
      const result = await diagnose(observation, context);
      expect(result.isCorrect).toBe(true);
      expect(result.type).toBe('correct');
      expect(result.verificationSource).toBe('llm');
      expect(result.correctAnswer).toBe('valid proof');
    });

    test('uses LLM verdict to mark incorrect answers on solver-opaque problems', async () => {
      const observation = {
        answer: { value: 'something else', raw: 'something else' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'conceptual',
      };
      const context = {
        recentAssistantMessages: [{
          content: 'Which trig identity relates sine and cosine for any angle?',
        }],
        recentUserMessages: [],
        llmVerificationPromise: Promise.resolve({
          isCorrect: false,
          confidence: 0.9,
          modelAnswer: 'Pythagorean identity',
          rationale: 'student response does not name the identity',
          error: null,
        }),
      };
      const result = await diagnose(observation, context);
      expect(result.isCorrect).toBe(false);
      expect(result.type).toBe('incorrect');
      expect(result.verificationSource).toBe('llm');
    });

    test('trusts solver over LLM when solver has a confident verdict', async () => {
      const observation = {
        answer: { value: '15', raw: '15' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'numeric',
      };
      const context = {
        recentAssistantMessages: [{ content: 'What is 7 plus 8?' }],
        recentUserMessages: [],
        // LLM disagrees with solver (shouldn't be used)
        llmVerificationPromise: Promise.resolve({
          isCorrect: false,
          confidence: 0.95,
          modelAnswer: '15',
          rationale: 'n/a',
          error: null,
        }),
      };
      const result = await diagnose(observation, context);
      expect(result.isCorrect).toBe(true);
      expect(result.verificationSource).toBe('solver');
    });

    test('low-confidence LLM verdict leaves diagnosis unverifiable', async () => {
      const observation = {
        answer: { value: '42', raw: '42' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'numeric',
      };
      const context = {
        recentAssistantMessages: [{
          content: 'Prove that sin^2(x) + cos^2(x) = 1.',
        }],
        recentUserMessages: [],
        llmVerificationPromise: Promise.resolve({
          isCorrect: null, // already gated below threshold in the verifier
          confidence: 0.3,
          modelAnswer: 'proof',
          rationale: 'low confidence',
          error: null,
        }),
      };
      const result = await diagnose(observation, context);
      expect(result.type).toBe('unverifiable');
      expect(result.isCorrect).toBeNull();
      expect(result.verificationSource).toBeNull();
    });

    test('survives when the LLM verification promise rejects', async () => {
      const observation = {
        answer: { value: '5', raw: '5' },
        messageType: 'answer_attempt',
        streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
        problemContext: 'numeric',
      };
      const context = {
        recentAssistantMessages: [{ content: 'Give me a derivative.' }],
        recentUserMessages: [],
        llmVerificationPromise: Promise.reject(new Error('timeout')),
      };
      const result = await diagnose(observation, context);
      expect(result.type).toBe('unverifiable');
    });
  });
});

// ============================================================================
// DECIDE STAGE
// ============================================================================

describe('Pipeline: Decide Stage', () => {
  const makeObs = (type, overrides = {}) => ({
    messageType: type,
    answer: null,
    contextSignals: [],
    streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
    ...overrides,
  });

  const correctDiag = { type: 'correct', isCorrect: true, answer: '7', correctAnswer: '7', misconception: null };
  const incorrectDiag = { type: 'incorrect', isCorrect: false, answer: '5', correctAnswer: '7', misconception: null };
  const noDiag = { type: 'no_answer' };

  test('correct answer → confirm_correct', () => {
    const obs = makeObs(MESSAGE_TYPES.ANSWER_ATTEMPT, { answer: { value: '7' } });
    const dec = decide(obs, correctDiag, {});
    expect(dec.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('incorrect answer → guide_incorrect', () => {
    const obs = makeObs(MESSAGE_TYPES.ANSWER_ATTEMPT, { answer: { value: '5' } });
    const dec = decide(obs, incorrectDiag, {});
    expect(dec.action).toBe(ACTIONS.GUIDE_INCORRECT);
  });

  test('incorrect + misconception → reteach_misconception', () => {
    const obs = makeObs(MESSAGE_TYPES.ANSWER_ATTEMPT, { answer: { value: '5' } });
    const diagWithMisconception = {
      ...incorrectDiag,
      misconception: { name: 'Partial Distribution', fix: 'Distribute to all terms' },
    };
    const dec = decide(obs, diagWithMisconception, {});
    expect(dec.action).toBe(ACTIONS.RETEACH_MISCONCEPTION);
    expect(dec.directives).toContainEqual(expect.stringContaining('Partial Distribution'));
  });

  test('incorrect + many wrongs → worked_example', () => {
    const obs = makeObs(MESSAGE_TYPES.ANSWER_ATTEMPT, {
      answer: { value: '5' },
      streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 4 },
    });
    const dec = decide(obs, incorrectDiag, {});
    expect(dec.action).toBe(ACTIONS.WORKED_EXAMPLE);
    expect(dec.scaffoldLevel).toBe(5);
  });

  test('give up → exit_ramp', () => {
    const obs = makeObs(MESSAGE_TYPES.GIVE_UP);
    const dec = decide(obs, noDiag, {});
    expect(dec.action).toBe(ACTIONS.EXIT_RAMP);
    expect(dec.directives).toContainEqual(expect.stringContaining('NEVER reveal'));
  });

  test('first IDK → scaffold_down level 4', () => {
    const obs = makeObs(MESSAGE_TYPES.IDK);
    const dec = decide(obs, noDiag, {});
    expect(dec.action).toBe(ACTIONS.SCAFFOLD_DOWN);
    expect(dec.scaffoldLevel).toBe(4);
  });

  test('repeated IDK → exit_ramp', () => {
    const obs = makeObs(MESSAGE_TYPES.IDK, {
      streaks: { idkCount: 3, giveUpCount: 0, recentWrongCount: 0 },
    });
    const dec = decide(obs, noDiag, {});
    expect(dec.action).toBe(ACTIONS.EXIT_RAMP);
  });

  test('frustration → acknowledge + max scaffold', () => {
    const obs = makeObs(MESSAGE_TYPES.FRUSTRATION);
    const dec = decide(obs, noDiag, {});
    expect(dec.action).toBe(ACTIONS.ACKNOWLEDGE_FRUSTRATION);
    expect(dec.scaffoldLevel).toBe(5);
  });

  test('off-task → redirect', () => {
    const obs = makeObs(MESSAGE_TYPES.OFF_TASK);
    const dec = decide(obs, noDiag, {});
    expect(dec.action).toBe(ACTIONS.REDIRECT_TO_MATH);
  });

  test('help request → hint', () => {
    const obs = makeObs(MESSAGE_TYPES.HELP_REQUEST);
    const dec = decide(obs, noDiag, {});
    expect(dec.action).toBe(ACTIONS.HINT);
  });
});

// ============================================================================
// GENERATE STAGE (prompt assembly only, no LLM calls)
// ============================================================================

describe('Pipeline: Generate Stage', () => {
  describe('buildVerificationContext', () => {
    test('correct answer includes VERIFIED CORRECT', () => {
      const ctx = buildVerificationContext({ isCorrect: true, answer: '7', correctAnswer: '7' });
      expect(ctx).toContain('VERIFIED CORRECT');
      expect(ctx).not.toContain('VERIFIED INCORRECT');
    });

    test('incorrect answer includes VERIFIED INCORRECT', () => {
      const ctx = buildVerificationContext({ isCorrect: false, answer: '5', correctAnswer: '7' });
      expect(ctx).toContain('VERIFIED INCORRECT');
    });

    test('no diagnosis returns null', () => {
      expect(buildVerificationContext(null)).toBeNull();
      expect(buildVerificationContext({ type: 'no_answer' })).toBeNull();
    });
  });

  describe('buildStreakWarning', () => {
    test('no warning for low counts', () => {
      expect(buildStreakWarning({ idkCount: 1, giveUpCount: 0, recentWrongCount: 1 })).toBeNull();
    });

    test('warning for high IDK count', () => {
      const warning = buildStreakWarning({ idkCount: 4, giveUpCount: 0, recentWrongCount: 0 });
      expect(warning).toContain('ANSWER_PERSISTENCE_ALERT');
      expect(warning).toContain('idk');
    });

    test('warning for give-up', () => {
      const warning = buildStreakWarning({ idkCount: 0, giveUpCount: 1, recentWrongCount: 0 });
      expect(warning).toContain('give them the answer');
    });
  });

  describe('assemblePrompt', () => {
    const mockPrompt = '--- SECURITY (NON-NEGOTIABLE) ---\nNEVER reveal.\n\n--- IDENTITY ---\nYou are Coach B.';

    test('injects action directives into system prompt', () => {
      const decision = {
        action: ACTIONS.CONFIRM_CORRECT,
        diagnosis: { isCorrect: true, answer: '7', correctAnswer: '7' },
        observation: { answer: { value: '7' }, streaks: {} },
        directives: ['Confirm immediately.'],
        phasePrompt: null,
      };
      const result = assemblePrompt(decision, { systemPrompt: mockPrompt, messages: [{ role: 'user', content: '7' }] });
      expect(result.messages[0].content).toContain('CURRENT ACTION');
      expect(result.messages[0].content).toContain('CORRECT');
    });

    test('injects verification context into last user message', () => {
      const decision = {
        action: ACTIONS.CONFIRM_CORRECT,
        diagnosis: { isCorrect: true, answer: '7', correctAnswer: '7' },
        observation: { answer: { value: '7' }, streaks: {} },
        directives: [],
        phasePrompt: null,
      };
      const result = assemblePrompt(decision, {
        systemPrompt: mockPrompt,
        messages: [{ role: 'user', content: '7' }],
      });
      expect(result.messages[1].content).toContain('VERIFIED CORRECT');
    });

    test('does not mutate original messages', () => {
      const messages = [{ role: 'user', content: 'hello' }];
      assemblePrompt({
        action: ACTIONS.CONTINUE_CONVERSATION,
        diagnosis: { type: 'no_answer' },
        observation: { streaks: {} },
        directives: [],
        phasePrompt: null,
      }, { systemPrompt: mockPrompt, messages });
      expect(messages[0].content).toBe('hello');
    });
  });
});

// ============================================================================
// VERIFY STAGE (tag extraction only)
// ============================================================================

describe('Pipeline: Verify Stage — Tag Extraction', () => {
  test('extracts CORE_BEHAVIOR_XP', () => {
    const { text, extracted } = extractSystemTags('Nice! <CORE_BEHAVIOR_XP:50,caught_own_error> You found it!');
    expect(extracted.coreBehaviorXp).toEqual({ amount: 50, behavior: 'caught_own_error' });
    expect(text).not.toContain('CORE_BEHAVIOR_XP');
    expect(text).toContain('Nice!');
  });

  test('extracts PROBLEM_RESULT', () => {
    const { extracted } = extractSystemTags('Good job! <PROBLEM_RESULT:correct>');
    expect(extracted.problemResult).toBe('correct');
  });

  test('extracts SAFETY_CONCERN', () => {
    const { extracted } = extractSystemTags('I hear you. <SAFETY_CONCERN>Student mentioned self-harm</SAFETY_CONCERN> Please talk to an adult.');
    expect(extracted.safetyConcern).toBe('Student mentioned self-harm');
  });

  test('extracts SKILL_MASTERED', () => {
    const { extracted } = extractSystemTags('You mastered it! <SKILL_MASTERED:two-step-equations>');
    expect(extracted.skillMastered).toBe('two-step-equations');
  });

  test('extracts multiple IEP goal updates', () => {
    const { extracted } = extractSystemTags('Progress! <IEP_GOAL_PROGRESS:fractions,+10> and <IEP_GOAL_PROGRESS:problem-solving,+5>');
    expect(extracted.iepGoalUpdates).toHaveLength(2);
    expect(extracted.iepGoalUpdates[0]).toEqual({ goalIdentifier: 'fractions', progressChange: 10 });
  });

  test('extracts SCAFFOLD_ADVANCE', () => {
    const { extracted } = extractSystemTags('Moving on! <SCAFFOLD_ADVANCE>');
    expect(extracted.scaffoldAdvance).toBe(true);
  });

  test('extracts MODULE_COMPLETE', () => {
    const { extracted } = extractSystemTags('Module done! <MODULE_COMPLETE>');
    expect(extracted.moduleComplete).toBe(true);
  });

  test('cleans all tags from output text', () => {
    const { text } = extractSystemTags(
      'Great! <CORE_BEHAVIOR_XP:25,persistence> <PROBLEM_RESULT:correct> <SKILL_MASTERED:algebra> Keep going!'
    );
    expect(text.replace(/\s+/g, ' ').trim()).toBe('Great! Keep going!');
    expect(text).not.toContain('<');
  });
});

// ============================================================================
// SIDECAR
// ============================================================================

describe('Pipeline: Sidecar', () => {
  test('derives problemResult from correct diagnosis', () => {
    const sc = buildSidecar(
      { messageType: 'answer_attempt', answer: { value: '7' }, streaks: {} },
      { type: 'correct', isCorrect: true },
      { action: 'confirm_correct', phaseState: null },
      {}
    );
    expect(sc.problemResult).toBe('correct');
    expect(sc.source.pipelineDerived).toContain('problemResult');
  });

  test('derives badgeProgress when user has active badge', () => {
    const sc = buildSidecar(
      { messageType: 'answer_attempt', answer: { value: '7' }, streaks: {} },
      { type: 'correct', isCorrect: true },
      { action: 'confirm_correct', phaseState: null },
      { user: { masteryProgress: { activeBadge: { badgeId: 'test' } } } }
    );
    expect(sc.badgeProgress).toEqual({ correct: true });
    expect(sc.source.pipelineDerived).toContain('badgeProgress');
  });

  test('pipeline-derived problemResult wins over LLM-emitted', () => {
    const sc = buildSidecar(
      { messageType: 'answer_attempt', answer: { value: '7' }, streaks: {} },
      { type: 'correct', isCorrect: true },
      { action: 'confirm_correct', phaseState: null },
      {}
    );
    mergeLlmSignals(sc, { problemResult: 'incorrect' }); // LLM disagrees
    expect(sc.problemResult).toBe('correct'); // Pipeline wins
    expect(sc.source.pipelineDerived).toContain('problemResult');
    expect(sc.source.llmEmitted).not.toContain('problemResult');
  });

  test('merges LLM-only signals', () => {
    const sc = buildSidecar(
      { messageType: 'question', answer: null, streaks: {} },
      { type: 'no_answer' },
      { action: 'continue', phaseState: null },
      {}
    );
    mergeLlmSignals(sc, {
      coreBehaviorXp: { amount: 50, behavior: 'explained_reasoning' },
      safetyConcern: null,
      learningInsight: 'Learns best with visual models',
    });
    expect(sc.coreBehaviorXp).toEqual({ amount: 50, behavior: 'explained_reasoning' });
    expect(sc.learningInsight).toBe('Learns best with visual models');
  });

  test('sidecar instruction is concise', () => {
    const instruction = getSidecarInstruction();
    expect(instruction.length).toBeLessThan(800);
    expect(instruction).toContain('CORE_BEHAVIOR_XP');
    expect(instruction).toContain('SAFETY_CONCERN');
    // PROBLEM_RESULT is now derived deterministically by the pipeline, so the
    // "Do NOT emit" line only suppresses SKILL_MASTERED and SCAFFOLD_ADVANCE
    expect(instruction).toContain('Do NOT emit <SKILL_MASTERED>');
  });

  test('signal stats track sources correctly', () => {
    const sc = buildSidecar(
      { messageType: 'answer_attempt', answer: { value: '7' }, streaks: {} },
      { type: 'correct', isCorrect: true },
      { action: 'confirm_correct', phaseState: null },
      {}
    );
    mergeLlmSignals(sc, { coreBehaviorXp: { amount: 50, behavior: 'test' } });
    const stats = getSignalStats(sc);
    expect(stats.pipelineDerived).toBe(1);
    expect(stats.llmEmitted).toBe(1);
    expect(stats.total).toBe(2);
    expect(stats.reliability).toBe(0.5);
  });
});

// ============================================================================
// PROMPT SLIMMING
// ============================================================================

describe('Pipeline: Prompt Slimming', () => {
  test('core rules always present', () => {
    const rules = buildSlimRules(ACTIONS.REDIRECT_TO_MATH);
    expect(rules).toContain('SECURITY');
    expect(rules).toContain('RESPONSE STYLE');
    expect(rules).toContain('BE HUMAN');
  });

  test('confirm_correct includes answer verification but not anti-cheat', () => {
    const rules = buildSlimRules(ACTIONS.CONFIRM_CORRECT);
    expect(rules).toContain('ANSWER VERIFICATION');
    expect(rules).toContain('MASTERY CHECK');
    expect(rules).not.toContain('ANTI-CHEAT');
    expect(rules).not.toContain('ANSWER PERSISTENCE');
  });

  test('exit_ramp includes answer persistence but not visual tools', () => {
    const rules = buildSlimRules(ACTIONS.EXIT_RAMP);
    expect(rules).toContain('ANSWER PERSISTENCE');
    expect(rules).not.toContain('VISUAL TOOL');
  });

  test('redirect_to_math is minimal', () => {
    const rules = buildSlimRules(ACTIONS.REDIRECT_TO_MATH);
    expect(rules).not.toContain('ANSWER VERIFICATION');
    expect(rules).not.toContain('ANTI-CHEAT');
    expect(rules).not.toContain('VISUAL TOOL');
    expect(rules).not.toContain('METHODOLOGY');
  });

  test('reteach includes methodology and visual tools', () => {
    const rules = buildSlimRules(ACTIONS.RETEACH_MISCONCEPTION);
    expect(rules).toContain('METHODOLOGY');
    expect(rules).toContain('VISUAL TOOL');
  });

  test('all actions produce valid output', () => {
    for (const action of Object.values(ACTIONS)) {
      const rules = buildSlimRules(action);
      expect(rules.length).toBeGreaterThan(100);
      expect(rules).toContain('SECURITY');
    }
  });
});

// ============================================================================
// SESSION MOOD
// ============================================================================

describe('Pipeline: Session Mood', () => {
  // Helper to build a conversation
  function msg(role, content, extras = {}) {
    return { role, content, timestamp: new Date(), ...extras };
  }

  describe('scoreMessage', () => {
    test('scores positive signals positively', () => {
      expect(scoreMessage(msg('user', 'oh I see now!'))).toBeGreaterThan(0);
      expect(scoreMessage(msg('user', 'cool'))).toBeGreaterThan(0);
      expect(scoreMessage(msg('user', 'yes got it'))).toBeGreaterThan(0);
    });

    test('scores negative signals negatively', () => {
      expect(scoreMessage(msg('user', 'this is stupid'))).toBeLessThan(0);
      expect(scoreMessage(msg('user', 'idk'))).toBeLessThan(0);
      expect(scoreMessage(msg('user', 'just tell me the answer'))).toBeLessThan(0);
    });

    test('scores correct answers positively', () => {
      expect(scoreMessage(msg('assistant', 'Great work!', { problemResult: 'correct' }))).toBeGreaterThan(0);
    });

    test('scores incorrect answers negatively', () => {
      expect(scoreMessage(msg('assistant', 'Not quite.', { problemResult: 'incorrect' }))).toBeLessThan(0);
    });

    test('returns 0 for neutral messages', () => {
      expect(scoreMessage(msg('assistant', 'Here is a problem for you.'))).toBe(0);
    });
  });

  describe('computeSessionMood', () => {
    test('returns stable for empty/short conversations', () => {
      expect(computeSessionMood([]).trajectory).toBe(TRAJECTORIES.STABLE);
      expect(computeSessionMood([msg('user', 'hi')]).trajectory).toBe(TRAJECTORIES.STABLE);
    });

    test('detects rising trajectory', () => {
      const messages = [
        msg('user', 'idk'),
        msg('assistant', 'Let me help.', { problemResult: 'incorrect' }),
        msg('user', 'ugh this is hard'),
        msg('assistant', 'Try this approach.', { problemResult: 'incorrect' }),
        // Things get better
        msg('user', 'oh I see!'),
        msg('assistant', 'Nice work!', { problemResult: 'correct' }),
        msg('user', 'cool'),
        msg('assistant', 'Exactly!', { problemResult: 'correct' }),
        msg('user', 'awesome'),
        msg('assistant', 'Keep going!', { problemResult: 'correct' }),
      ];
      const mood = computeSessionMood(messages);
      expect([TRAJECTORIES.RISING, TRAJECTORIES.RECOVERED]).toContain(mood.trajectory);
      expect(mood.momentum).toBeGreaterThan(0);
    });

    test('detects falling trajectory', () => {
      const messages = [
        msg('user', 'cool lets go'),
        msg('assistant', 'Right!', { problemResult: 'correct' }),
        msg('user', 'yes'),
        msg('assistant', 'Correct!', { problemResult: 'correct' }),
        // Things go downhill
        msg('user', 'ugh'),
        msg('assistant', 'Not quite.', { problemResult: 'incorrect' }),
        msg('user', 'this is stupid'),
        msg('assistant', 'Try again.', { problemResult: 'incorrect' }),
        msg('user', 'idk'),
        msg('assistant', 'Hmm.', { problemResult: 'incorrect' }),
      ];
      const mood = computeSessionMood(messages);
      expect(mood.trajectory).toBe(TRAJECTORIES.FALLING);
      expect(mood.momentum).toBeLessThan(0);
    });

    test('detects flow state (4+ consecutive correct)', () => {
      const messages = [
        msg('user', '5'), msg('assistant', 'Yes!', { problemResult: 'correct' }),
        msg('user', '12'), msg('assistant', 'Right!', { problemResult: 'correct' }),
        msg('user', '7'), msg('assistant', 'Correct!', { problemResult: 'correct' }),
        msg('user', '3'), msg('assistant', 'Nailed it!', { problemResult: 'correct' }),
        msg('user', '-2'), msg('assistant', 'Perfect!', { problemResult: 'correct' }),
      ];
      const mood = computeSessionMood(messages);
      expect(mood.inFlow).toBe(true);
      expect(mood.consecutiveCorrect).toBeGreaterThanOrEqual(4);
    });

    test('flow state breaks on incorrect', () => {
      const messages = [
        msg('user', '5'), msg('assistant', 'Yes!', { problemResult: 'correct' }),
        msg('user', '12'), msg('assistant', 'Right!', { problemResult: 'correct' }),
        msg('user', '7'), msg('assistant', 'Correct!', { problemResult: 'correct' }),
        msg('user', '99'), msg('assistant', 'Not quite.', { problemResult: 'incorrect' }),
      ];
      const mood = computeSessionMood(messages);
      expect(mood.inFlow).toBe(false);
    });

    test('detects fatigue from message length shrinkage', () => {
      const messages = [
        msg('user', 'I think the answer is about twenty five because you multiply five by five'),
        msg('assistant', 'Good thinking!', { problemResult: 'correct' }),
        msg('user', 'So for this one I would divide both sides by three to get x'),
        msg('assistant', 'Exactly!', { problemResult: 'correct' }),
        msg('user', 'And then you add seven to both sides of the equation right'),
        msg('assistant', 'Yes!', { problemResult: 'correct' }),
        msg('user', 'I need to subtract four from both sides to isolate the variable'),
        msg('assistant', 'Perfect.', { problemResult: 'correct' }),
        // Energy drops
        msg('user', 'idk'),
        msg('assistant', 'Try...'),
        msg('user', '5'),
        msg('assistant', 'Hmm.', { problemResult: 'incorrect' }),
        msg('user', 'ok'),
        msg('assistant', 'Try again.'),
        msg('user', 'no'),
        msg('assistant', 'Hmm.'),
      ];
      const mood = computeSessionMood(messages);
      expect(mood.fatigueSignal).toBe(true);
    });
  });

  describe('buildMoodDirective', () => {
    test('returns null when no summary', () => {
      const mood = computeSessionMood([]);
      expect(buildMoodDirective(mood)).toBeNull();
    });

    test('returns directive string when summary present', () => {
      // Build a flow state scenario
      const messages = [
        msg('user', '5'), msg('assistant', 'Yes!', { problemResult: 'correct' }),
        msg('user', '12'), msg('assistant', 'Right!', { problemResult: 'correct' }),
        msg('user', '7'), msg('assistant', 'Correct!', { problemResult: 'correct' }),
        msg('user', '3'), msg('assistant', 'Nailed it!', { problemResult: 'correct' }),
        msg('user', '-2'), msg('assistant', 'Perfect!', { problemResult: 'correct' }),
      ];
      const mood = computeSessionMood(messages);
      const directive = buildMoodDirective(mood);
      expect(directive).toContain('SESSION MOOD');
      expect(directive).toContain('flow');
    });
  });

  describe('decide stage mood integration', () => {
    test('flow state suppresses CHECK_UNDERSTANDING', () => {
      const observation = observe('what next', {
        recentUserMessages: [],
        recentAssistantMessages: [],
      });
      // Force skip request to trigger CHECK_UNDERSTANDING
      observation.messageType = MESSAGE_TYPES.SKIP_REQUEST;

      const diagnosis = { type: 'no_answer', isCorrect: null };
      const sessionMood = {
        trajectory: TRAJECTORIES.STABLE,
        energy: ENERGY_LEVELS.HIGH,
        momentum: 0.5,
        inFlow: true,
        fatigueSignal: false,
        consecutiveCorrect: 5,
        summary: 'In flow',
      };

      // With phaseState, skip request → CHECK_UNDERSTANDING, but flow should override
      const decision = decide(observation, diagnosis, {
        phaseState: { currentPhase: 'YOU_DO', skillId: 'test' },
        activeSkill: { skillId: 'test', displayName: 'Test Skill' },
        sessionMood,
      });

      // Flow state should have converted CHECK_UNDERSTANDING → PRESENT_PROBLEM
      expect(decision.action).toBe(ACTIONS.PRESENT_PROBLEM);
    });

    test('fatigue increases scaffold level', () => {
      const observation = observe('hi', { recentUserMessages: [], recentAssistantMessages: [] });
      const diagnosis = { type: 'no_answer', isCorrect: null };
      const sessionMood = {
        trajectory: TRAJECTORIES.FALLING,
        energy: ENERGY_LEVELS.LOW,
        momentum: -0.3,
        inFlow: false,
        fatigueSignal: true,
        consecutiveCorrect: 0,
        summary: 'Fatigue detected',
      };

      const decision = decide(observation, diagnosis, { sessionMood });
      expect(decision.scaffoldLevel).toBeGreaterThanOrEqual(4);
      expect(decision.directives.some(d => d.includes('fatigue'))).toBe(true);
    });
  });
});

// ============================================================================
// NORMALIZE LATEX
// ============================================================================

describe('Pipeline: normalizeLatex', () => {
  describe('backslash restoration on LaTeX commands', () => {
    test('restores backslash before frac', () => {
      expect(normalizeLatex('frac{3}{4}')).toContain('\\frac{3}{4}');
    });

    test('restores backslash before sqrt', () => {
      expect(normalizeLatex('sqrt{7}')).toContain('\\sqrt{7}');
    });

    test('restores backslashes on nested commands: frac + sqrt', () => {
      const result = normalizeLatex('frac{3}{2sqrt{7}}');
      expect(result).toContain('\\frac');
      expect(result).toContain('\\sqrt');
    });

    test('does not double-backslash already escaped commands', () => {
      const input = '\\frac{3}{4}';
      expect(normalizeLatex(input)).toContain('\\frac{3}{4}');
      expect(normalizeLatex(input)).not.toContain('\\\\frac');
    });

    test('restores cdot, times', () => {
      expect(normalizeLatex('3 cdot{} 4')).toContain('\\cdot');
      expect(normalizeLatex('5 times{} 3')).toContain('\\times');
    });

    test('does not affect plain words without braces', () => {
      expect(normalizeLatex('The fraction is easy')).toBe('The fraction is easy');
    });
  });

  describe('display math delimiter restoration', () => {
    test('converts bare [cmd{...}] to \\[cmd{...}\\]', () => {
      const result = normalizeLatex('[\\frac{3}{2\\sqrt{7}}]');
      expect(result).toMatch(/\\\[.*\\frac.*\\\]/);
    });

    test('full pipeline: bare [frac{3}{2sqrt{7}}] → display math with backslashes', () => {
      const input = 'Simplify this: [frac{3}{2sqrt{7}}]';
      const result = normalizeLatex(input);
      expect(result).toContain('\\[');
      expect(result).toContain('\\]');
      expect(result).toContain('\\frac');
      expect(result).toContain('\\sqrt');
    });

    test('does not convert markdown links [text](url)', () => {
      const input = 'See [this link](https://example.com)';
      expect(normalizeLatex(input)).toBe(input);
    });

    test('does not convert plain text in brackets', () => {
      const input = 'Use the [quadratic formula] to solve';
      expect(normalizeLatex(input)).toBe(input);
    });
  });

  describe('existing normalization still works', () => {
    test('converts $$...$$ to \\[...\\]', () => {
      expect(normalizeLatex('$$x^2 + 1$$')).toBe('\\[x^2 + 1\\]');
    });

    test('converts $...$ to \\(...\\) for math content', () => {
      expect(normalizeLatex('Solve $x + 3 = 7$')).toBe('Solve \\(x + 3 = 7\\)');
    });

    test('does not convert currency $5', () => {
      expect(normalizeLatex('That costs $5')).toContain('$5');
    });

    test('converts bare (x^2 + 1) to \\(x^2 + 1\\)', () => {
      const result = normalizeLatex('factor (x^2 - 4)');
      expect(result).toContain('\\(');
    });

    test('converts (2x-4=12) — coefficient+variable+operator equation', () => {
      const result = normalizeLatex("Let's solve (2x-4=12) step by step");
      expect(result).toContain('\\(');
      expect(result).toContain('2x-4=12');
      expect(result).toContain('\\)');
    });

    test('converts (3y+5=20) — equation with addition', () => {
      const result = normalizeLatex('Start with (3y+5=20)');
      expect(result).toContain('\\(3y+5=20\\)');
    });

    test('converts (x=5) — simple variable=number', () => {
      const result = normalizeLatex('The answer is (x=5)');
      expect(result).toContain('\\(x=5\\)');
    });

    test('does not convert natural text like (2nd attempt)', () => {
      const result = normalizeLatex('This is my (2nd attempt) at it');
      expect(result).not.toContain('\\(');
    });

    test('does not convert natural text like (about 5 items)', () => {
      const result = normalizeLatex('We have (about five items) left');
      expect(result).not.toContain('\\(');
    });
  });

  describe('unicode math symbol normalization', () => {
    test('converts × to \\times', () => {
      const result = normalizeLatex('2×4');
      expect(result).toContain('\\times');
    });

    test('converts ÷ to \\div', () => {
      const result = normalizeLatex('12÷3');
      expect(result).toContain('\\div');
    });

    test('converts ± to \\pm', () => {
      const result = normalizeLatex('x = 5±2');
      expect(result).toContain('\\pm');
    });

    test('converts ≤ and ≥ to \\leq and \\geq', () => {
      expect(normalizeLatex('x≤5')).toContain('\\leq');
      expect(normalizeLatex('y≥3')).toContain('\\geq');
    });

    test('wraps expression with unicode operators in delimiters', () => {
      const result = normalizeLatex('Calculate (2×4-12)');
      expect(result).toContain('\\(');
      expect(result).toContain('\\times');
    });
  });

  describe('strips LaTeX delimiters from English prose', () => {
    test('removes \\( \\) around English text like "the coefficient of x"', () => {
      const result = normalizeLatex('add up to 5 \\(the coefficient of x\\)');
      expect(result).not.toContain('\\(the coefficient');
      expect(result).toContain('the coefficient of x');
    });

    test('removes \\( \\) around "the constant term"', () => {
      const result = normalizeLatex('multiply to 6 \\(the constant term\\)');
      expect(result).not.toContain('\\(the constant');
      expect(result).toContain('the constant term');
    });

    test('keeps valid inline math like \\( x + 3 \\)', () => {
      const result = normalizeLatex('Solve \\(x + 3 = 7\\)');
      expect(result).toContain('\\(x + 3 = 7\\)');
    });

    test('keeps LaTeX commands like \\( \\frac{1}{2} \\)', () => {
      const result = normalizeLatex('The answer is \\(\\frac{1}{2}\\)');
      expect(result).toContain('\\(\\frac{1}{2}\\)');
    });

    test('keeps \\( x^2 \\) (no English words)', () => {
      const result = normalizeLatex('Factor \\(x^2 + 5x + 6\\)');
      expect(result).toContain('\\(x^2 + 5x + 6\\)');
    });

    test('removes \\[ \\] around English prose in display math', () => {
      const result = normalizeLatex('\\[the value of x\\]');
      expect(result).not.toContain('\\[the value');
      expect(result).toContain('the value of x');
    });

    test('keeps \\( \\text{...} \\) with LaTeX commands', () => {
      const result = normalizeLatex('\\(\\text{coefficient} = 5\\)');
      expect(result).toContain('\\(\\text{coefficient} = 5\\)');
    });
  });

  describe('fixes parentheses used as brace groups', () => {
    test('converts \\frac{a}(b) to \\frac{a}{b}', () => {
      const result = normalizeLatex('\\frac{\\pi}(6)');
      expect(result).toContain('\\frac{\\pi}{6}');
      expect(result).not.toContain('(6)');
    });

    test('converts \\sqrt(x) to \\sqrt{x}', () => {
      const result = normalizeLatex('\\sqrt(x+1)');
      expect(result).toContain('\\sqrt{x+1}');
      expect(result).not.toContain('(x+1)');
    });

    test('handles nested frac with paren brace groups', () => {
      const result = normalizeLatex('\\frac{3}(2)');
      expect(result).toContain('\\frac{3}{2}');
    });
  });

  describe('fixes mismatched/unclosed \\( delimiters', () => {
    test('closes \\( before trailing English word', () => {
      const result = normalizeLatex('30° or \\( \\frac{\\pi}{6} radians):');
      expect(result).toContain('\\frac{\\pi}{6}');
      expect(result).toContain('\\)');
      // The math block should be closed: \( \frac{\pi}{6}\) followed by radians
      expect(result).toMatch(/\\frac\{\\pi\}\{6\}\\?\)\s*radians/);
    });

    test('converts bare ) to \\) when content has LaTeX', () => {
      const result = normalizeLatex('\\( \\frac{1}{2} )');
      expect(result).toContain('\\(');
      expect(result).toContain('\\)');
    });

    test('does not modify already-correct \\( ... \\)', () => {
      const result = normalizeLatex('\\( x^2 + 1 \\)');
      expect(result).toContain('\\( x^2 + 1 \\)');
    });

    test('handles multiple unclosed delimiters in sequence', () => {
      const input = 'cos(\\( \\frac{\\pi}{6} ) = \\frac{\\sqrt{3}}{2}';
      const result = normalizeLatex(input);
      // Should have at least one proper \\) close
      expect(result).toContain('\\)');
    });
  });
});

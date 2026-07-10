// Unit tests for trial engagement XP. The rule: reward THINKING, not correctness,
// and never reward off-task / disengaged / gaming turns.

jest.mock('../../utils/pipeline', () => ({ runPipeline: jest.fn() }));
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));
jest.mock('../../utils/prompt', () => ({ generateSystemPrompt: jest.fn() }));
jest.mock('../../middleware/promptInjection', () => ({ sanitizeForAI: (s) => s }));
jest.mock('../../utils/ttsProvider', () => ({ isConfigured: () => false }));
jest.mock('../../utils/trialGraphPoints', () => ({ samplePoints: jest.fn() }));

const { computeTrialXp } = require('../../routes/trialChat');

describe('computeTrialXp', () => {
  test('an answer attempt earns the showed-your-work bonus (right OR wrong)', () => {
    expect(computeTrialXp('answer_attempt')).toEqual({ points: 15, reason: 'for showing your work' });
    expect(computeTrialXp('check_my_work')).toEqual({ points: 15, reason: 'for showing your work' });
  });

  test('asking a question earns engagement XP', () => {
    expect(computeTrialXp('question').points).toBe(8);
    expect(computeTrialXp('help_request').points).toBe(8);
  });

  test('other on-topic engagement earns the base', () => {
    expect(computeTrialXp('idk').points).toBe(8);
    expect(computeTrialXp('frustration').points).toBe(8);   // still trying → still counts
    expect(computeTrialXp('general_math').points).toBe(8);
  });

  test('off-task / gaming / disengaged turns earn nothing', () => {
    ['off_task', 'greeting', 'skip_request', 'give_up', 'parroting', 'evasive_affirmative'].forEach((t) => {
      expect(computeTrialXp(t)).toEqual({ points: 0, reason: null });
    });
  });

  test('never rewards correctness itself — an answer attempt earns the same regardless', () => {
    // computeTrialXp only sees the message TYPE, never a wasCorrect flag — proof
    // by construction that the amount can't depend on right/wrong.
    expect(computeTrialXp('answer_attempt').points).toBe(15);
  });
});

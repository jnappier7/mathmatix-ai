/**
 * EMOTIONAL FIRST AID — an emotionally loaded student turn (frustration,
 * self-deprecation, surrender) gets acknowledgment WITHOUT new work stacked
 * into the same reply.
 *
 * Origin: the live persona eval's frustrated-kid scenario failed 6/6 runs on
 * BOTH gpt-4o-mini and claude-sonnet-5 — the tutor acknowledged the feeling
 * but posed a new problem or demanded a step in the SAME reply (toneSupport
 * judge: pushesNewProblem=true). Systemic prompt/directive defect, not model
 * noise. Three seams now carry the rule and are pinned here:
 *
 *  1. decide.js FRUSTRATION tiers — every tier's directives forbid posing
 *     work in the acknowledgment reply (opt-in offer only).
 *  2. decide.js GIVE_UP — a SURRENDER give-up ("i give up") gets a gentle
 *     exit ramp (offer the ramp, don't start it); an answer-DEMAND give-up
 *     ("just tell me the answer") keeps the classic ramp.
 *  3. promptCompact.js — isEmotionallyLoadedMessage() injects a this-turn
 *     override section (the live-eval reply path builds the prompt directly
 *     from promptCompact, bypassing decide's directives entirely).
 */

const { decide, ACTIONS } = require('../../utils/pipeline/decide');
const { MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { buildActionPrompt } = require('../../utils/pipeline/generate');
const {
  isEmotionallyLoadedMessage,
  EMOTIONAL_LOAD_SECTION,
  generateSystemPrompt,
} = require('../../utils/promptCompact');

const makeObs = (type, overrides = {}) => ({
  messageType: type,
  answer: null,
  contextSignals: [],
  streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
  ...overrides,
});
const noDiag = { type: 'no_answer' };

// ── 1. decide: frustration tiers never assign work in the same reply ──

describe('decide() — frustration acknowledgment carries no new work', () => {
  const tiers = [
    ['mild (depth 0)', { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 }],
    ['moderate (depth 3)', { idkCount: 1, giveUpCount: 0, recentWrongCount: 2 }],
    ['severe (depth 5)', { idkCount: 2, giveUpCount: 0, recentWrongCount: 3 }],
  ];

  test.each(tiers)('%s → acknowledge, HARD RULE against posing work this reply', (_name, streaks) => {
    const obs = makeObs(MESSAGE_TYPES.FRUSTRATION, { streaks, raw: "I hate this. I'm so stupid, I can't do math" });
    const dec = decide(obs, noDiag, {});
    expect(dec.action).toBe(ACTIONS.ACKNOWLEDGE_FRUSTRATION);
    expect(dec.scaffoldLevel).toBe(5);
    const joined = dec.directives.join('\n');
    expect(joined).toMatch(/do NOT pose/i);
    expect(joined).toMatch(/THIS (same )?reply/);
    // The old defect: directives that ORDER a next step in the same reply.
    expect(joined).not.toMatch(/Then offer a concrete next step/);
    expect(joined).not.toMatch(/Then check: "Does THAT part/);
  });
});

// ── 2. decide: surrender vs answer-demand give-up ──

describe('decide() — give-up routing: surrender is gentle, demand keeps the classic ramp', () => {
  test('"idk. i give up" → EXIT_RAMP with gentleRamp (offer, not the ramp itself)', () => {
    const obs = makeObs(MESSAGE_TYPES.GIVE_UP, { raw: 'idk. i give up' });
    const dec = decide(obs, noDiag, {});
    expect(dec.action).toBe(ACTIONS.EXIT_RAMP);
    expect(dec.gentleRamp).toBe(true);
    const joined = dec.directives.join('\n');
    expect(joined).toMatch(/do NOT pose, restate, or start working ANY problem/);
    expect(joined).toMatch(/NEVER reveal/);
    expect(joined).not.toMatch(/Work through a PARALLEL problem/);
  });

  test('"just give me the answer" (established problem) → classic ramp, no gentleRamp', () => {
    const obs = makeObs(MESSAGE_TYPES.GIVE_UP, { raw: 'ugh just give me the answer' });
    const dec = decide(obs, noDiag, { activeSkill: { skillId: 'linear-eq' } });
    expect(dec.action).toBe(ACTIONS.EXIT_RAMP);
    expect(dec.gentleRamp).toBeUndefined();
    expect(dec.directives).toContainEqual(expect.stringContaining('PARALLEL problem'));
  });

  test('"i give up, just tell me the answer" → demand wins, classic ramp', () => {
    const obs = makeObs(MESSAGE_TYPES.GIVE_UP, { raw: 'i give up, just tell me the answer', streaks: { idkCount: 0, giveUpCount: 1, recentWrongCount: 0 } });
    const dec = decide(obs, noDiag, { activeSkill: { skillId: 'linear-eq' } });
    expect(dec.action).toBe(ACTIONS.EXIT_RAMP);
    expect(dec.gentleRamp).toBeUndefined();
  });

  test('repeated surrender (giveUpCount 2) → the offer already happened, classic ramp', () => {
    const obs = makeObs(MESSAGE_TYPES.GIVE_UP, { raw: 'i give up', streaks: { idkCount: 0, giveUpCount: 2, recentWrongCount: 0 } });
    const dec = decide(obs, noDiag, { activeSkill: { skillId: 'linear-eq' } });
    expect(dec.action).toBe(ACTIONS.EXIT_RAMP);
    expect(dec.gentleRamp).toBeUndefined();
    expect(dec.directives).toContainEqual(expect.stringContaining('PARALLEL problem'));
  });
});

// ── 3. generate: action prompts match ──

describe('buildActionPrompt — emotional actions carry the no-work rule', () => {
  test('ACKNOWLEDGE_FRUSTRATION forbids posing work, allows one opt-in question', () => {
    const s = buildActionPrompt({ action: ACTIONS.ACKNOWLEDGE_FRUSTRATION, directives: [] });
    expect(s).toMatch(/Do NOT pose a new problem/);
    expect(s).toMatch(/opt-in question/);
    expect(s).not.toMatch(/Then offer a concrete next step/);
  });

  test('EXIT_RAMP with gentleRamp offers the ramp without starting it', () => {
    const s = buildActionPrompt({ action: ACTIONS.EXIT_RAMP, directives: [], gentleRamp: true });
    expect(s).toMatch(/Do NOT pose, restate, or start working any problem/);
    expect(s).toContain('NEVER reveal the answer');
    expect(s).not.toContain('parallel problem (same skill, different numbers) step-by-step');
  });

  test('EXIT_RAMP without gentleRamp keeps the classic ramp (pinned by twinWiring too)', () => {
    const s = buildActionPrompt({ action: ACTIONS.EXIT_RAMP, directives: [] });
    expect(s).toContain('parallel problem (same skill, different numbers) step-by-step');
    expect(s).toContain('NEVER reveal the answer');
  });
});

// ── 4. promptCompact: detector + injection (the live-eval reply path) ──

describe('isEmotionallyLoadedMessage()', () => {
  test.each([
    "I hate this. I'm so stupid, I can't do math",
    'idk. i give up',
    "i'm done",
    'this is impossible',
    'I suck at math',
  ])('fires on %j', (msg) => {
    expect(isEmotionallyLoadedMessage(msg)).toBe(true);
  });

  test.each([
    'just give me the answer',          // answer demand — anti-leak governs
    'i give up, just tell me the answer', // demand wins over surrender
    'solve 2x = 10',                    // math move
    'idk',                              // plain IDK — scaffold path, not first aid
    "i can't figure out step 2",        // stuck-point, not self-deprecation
    '',
  ])('does not fire on %j', (msg) => {
    expect(isEmotionallyLoadedMessage(msg)).toBe(false);
  });
});

describe('generateSystemPrompt — emotional-load section injection', () => {
  const profile = { firstName: 'Alex', lastName: 'R', gradeLevel: '7', mathCourse: 'Math 7' };
  const tutor = { name: 'Mr. Nappier', catchphrase: 'See the patterns.', personality: 'Warm.' };

  test('injected on an emotionally loaded current message', () => {
    const prompt = generateSystemPrompt(
      profile, tutor, null, 'student',
      null, null, null, [], null, null, null, null, null, null,
      "I hate this. I'm so stupid, I can't do math", []
    );
    expect(prompt).toContain('THIS TURN: EMOTIONAL CHECK-IN');
    expect(prompt).toContain(EMOTIONAL_LOAD_SECTION);
  });

  test('absent on a normal math message', () => {
    const prompt = generateSystemPrompt(
      profile, tutor, null, 'student',
      null, null, null, [], null, null, null, null, null, null,
      'x = 5?', []
    );
    expect(prompt).not.toContain('THIS TURN: EMOTIONAL CHECK-IN');
  });
});

/**
 * XP ENGINE TESTS — Shared XP calculation logic
 *
 * Tests computeXpBreakdown and applyXpToUser to ensure consistent
 * XP behavior across both the pipeline (persist.js) and course
 * (courseChat.js) code paths.
 */

// Mock promptCompressor for calculateXpBoostFactor
jest.mock('../../utils/promptCompressor', () => ({
  calculateXpBoostFactor: jest.fn((level) => {
    if (level <= 5) return { factor: 2.0, isNewUser: true, guidance: 'high' };
    if (level < 15) return { factor: 1.5, isNewUser: false, guidance: 'normal' };
    return { factor: 1.0, isNewUser: false, guidance: 'none' };
  }),
}));

// Mock unlockTutors
jest.mock('../../utils/unlockTutors', () => ({
  getTutorsToUnlock: jest.fn(() => []),
}));

const { computeXpBreakdown, applyXpToUser } = require('../../utils/pipeline/xpEngine');
const { getTutorsToUnlock } = require('../../utils/unlockTutors');

// ============================================================================
// computeXpBreakdown
// ============================================================================

describe('XP Engine: computeXpBreakdown', () => {
  test('awards tier 1 (turn XP) on every call', () => {
    const result = computeXpBreakdown({
      wasCorrect: false,
      recentMessages: [],
      extracted: {},
      userLevel: 1,
    });
    expect(result.tier1).toBe(2);
    expect(result.total).toBe(2);
  });

  test('awards tier 2 clean (10 XP) for correct without hints', () => {
    const result = computeXpBreakdown({
      wasCorrect: true,
      recentMessages: [
        { role: 'user', content: 'I think the answer is 7' },
      ],
      extracted: {},
      userLevel: 1,
    });
    expect(result.tier2).toBe(10);
    expect(result.tier2Type).toBe('clean');
    expect(result.total).toBe(12); // 2 + 10
  });

  test('awards tier 2 correct (5 XP) for correct with hint request', () => {
    const result = computeXpBreakdown({
      wasCorrect: true,
      recentMessages: [
        { role: 'user', content: 'I need a hint please' },
        { role: 'user', content: '7' },
      ],
      extracted: {},
      userLevel: 1,
    });
    expect(result.tier2).toBe(5);
    expect(result.tier2Type).toBe('correct');
    expect(result.total).toBe(7); // 2 + 5
  });

  test('detects hint keywords: stuck, idk, confused, help, don\'t know', () => {
    const keywords = ['I\'m stuck', 'idk', 'I\'m confused', 'help me', 'I don\'t know'];
    for (const keyword of keywords) {
      const result = computeXpBreakdown({
        wasCorrect: true,
        recentMessages: [{ role: 'user', content: keyword }],
        extracted: {},
        userLevel: 1,
      });
      expect(result.tier2).toBe(5);
    }
  });

  test('ignores assistant messages for hint detection', () => {
    const result = computeXpBreakdown({
      wasCorrect: true,
      recentMessages: [
        { role: 'assistant', content: 'Do you need a hint?' },
        { role: 'user', content: '7' },
      ],
      extracted: {},
      userLevel: 1,
    });
    expect(result.tier2).toBe(10); // clean, not correct
  });

  test('awards tier 3 for core behavior XP with boost factor', () => {
    const result = computeXpBreakdown({
      wasCorrect: false,
      recentMessages: [],
      extracted: { coreBehaviorXp: { amount: 50, behavior: 'explained_reasoning' } },
      userLevel: 3, // New user → 2x boost
    });
    expect(result.tier3).toBe(100); // 50 * 2.0 = 100
    expect(result.tier3Behavior).toBe('explained_reasoning');
    expect(result.total).toBe(102); // 2 + 0 + 100
  });

  test('caps tier 3 at maxTier3PerTurn * boost factor', () => {
    const result = computeXpBreakdown({
      wasCorrect: false,
      recentMessages: [],
      extracted: { coreBehaviorXp: { amount: 100, behavior: 'transfer' } },
      userLevel: 3, // 2x boost → max = 100 * 2 = 200
    });
    expect(result.tier3).toBe(200); // 100 * 2.0 = 200, max = 100 * 2.0 = 200
  });

  test('falls back to legacyXp when no coreBehaviorXp', () => {
    const result = computeXpBreakdown({
      wasCorrect: false,
      recentMessages: [],
      extracted: { legacyXp: { amount: 8 } },
      userLevel: 1,
    });
    expect(result.tier2).toBe(8);
    expect(result.tier2Type).toBe('legacy');
    expect(result.tier3).toBe(0);
  });

  test('caps legacyXp at maxTier2PerTurn', () => {
    const result = computeXpBreakdown({
      wasCorrect: false,
      recentMessages: [],
      extracted: { legacyXp: { amount: 50 } },
      userLevel: 1,
    });
    expect(result.tier2).toBe(10); // capped at maxTier2PerTurn
  });

  test('applies 1.5x course boost when isCourseSession=true', () => {
    const result = computeXpBreakdown({
      wasCorrect: true,
      recentMessages: [],
      extracted: {},
      userLevel: 1,
      isCourseSession: true,
    });
    expect(result.courseBoost).toBe(1.5);
    expect(result.total).toBe(Math.round((2 + 10) * 1.5)); // 18
  });

  test('does not apply course boost when isCourseSession=false', () => {
    const result = computeXpBreakdown({
      wasCorrect: true,
      recentMessages: [],
      extracted: {},
      userLevel: 1,
      isCourseSession: false,
    });
    expect(result.courseBoost).toBeUndefined();
    expect(result.total).toBe(12);
  });

  test('handles null extracted gracefully', () => {
    const result = computeXpBreakdown({
      wasCorrect: false,
      recentMessages: [],
      extracted: null,
      userLevel: 1,
    });
    expect(result.tier1).toBe(2);
    expect(result.tier3).toBe(0);
    expect(result.total).toBe(2);
  });

  test('handles null recentMessages gracefully', () => {
    const result = computeXpBreakdown({
      wasCorrect: true,
      recentMessages: null,
      extracted: {},
      userLevel: 1,
    });
    expect(result.tier2).toBe(10); // clean — no messages to check for hints
  });
});

// ============================================================================
// applyXpToUser
// ============================================================================

describe('XP Engine: applyXpToUser', () => {
  function mockUser(overrides = {}) {
    return {
      xp: 0,
      level: 1,
      xpLadderStats: null,
      unlockedItems: [],
      markModified: jest.fn(),
      ...overrides,
    };
  }

  test('adds total XP to user', () => {
    const user = mockUser({ xp: 50 });
    applyXpToUser(user, { tier1: 2, tier2: 10, tier3: 0, tier3Behavior: null, total: 12 });
    expect(user.xp).toBe(62);
  });

  test('initializes xpLadderStats if missing', () => {
    const user = mockUser();
    applyXpToUser(user, { tier1: 2, tier2: 5, tier3: 0, tier3Behavior: null, total: 7 });
    expect(user.xpLadderStats).toEqual(expect.objectContaining({
      lifetimeTier1: 2,
      lifetimeTier2: 5,
      lifetimeTier3: 0,
    }));
  });

  test('accumulates xpLadderStats over multiple calls', () => {
    const user = mockUser({
      xpLadderStats: { lifetimeTier1: 10, lifetimeTier2: 20, lifetimeTier3: 50, tier3Behaviors: [] },
    });
    applyXpToUser(user, { tier1: 2, tier2: 10, tier3: 25, tier3Behavior: 'explained_reasoning', total: 37 });
    expect(user.xpLadderStats.lifetimeTier1).toBe(12);
    expect(user.xpLadderStats.lifetimeTier2).toBe(30);
    expect(user.xpLadderStats.lifetimeTier3).toBe(75);
  });

  test('tracks tier3 behavior counts', () => {
    const user = mockUser({
      xpLadderStats: { lifetimeTier1: 0, lifetimeTier2: 0, lifetimeTier3: 0, tier3Behaviors: [] },
    });
    applyXpToUser(user, { tier1: 2, tier2: 0, tier3: 50, tier3Behavior: 'persistence', total: 52 });
    expect(user.xpLadderStats.tier3Behaviors).toHaveLength(1);
    expect(user.xpLadderStats.tier3Behaviors[0].behavior).toBe('persistence');
    expect(user.xpLadderStats.tier3Behaviors[0].count).toBe(1);
  });

  test('increments existing tier3 behavior', () => {
    const user = mockUser({
      xpLadderStats: {
        lifetimeTier1: 0, lifetimeTier2: 0, lifetimeTier3: 50,
        tier3Behaviors: [{ behavior: 'persistence', count: 2, lastEarned: new Date('2024-01-01') }],
      },
    });
    applyXpToUser(user, { tier1: 2, tier2: 0, tier3: 50, tier3Behavior: 'persistence', total: 52 });
    expect(user.xpLadderStats.tier3Behaviors).toHaveLength(1);
    expect(user.xpLadderStats.tier3Behaviors[0].count).toBe(3);
  });

  test('triggers level up when XP exceeds threshold', () => {
    // Level 1→2 requires 100 XP
    const user = mockUser({ xp: 95, level: 1 });
    const result = applyXpToUser(user, { tier1: 2, tier2: 10, tier3: 0, tier3Behavior: null, total: 12 });
    expect(user.xp).toBe(107);
    expect(user.level).toBe(2);
    expect(result.leveledUp).toBe(true);
  });

  test('does not level up when XP is insufficient', () => {
    const user = mockUser({ xp: 5, level: 1 });
    const result = applyXpToUser(user, { tier1: 2, tier2: 0, tier3: 0, tier3Behavior: null, total: 2 });
    expect(user.level).toBe(1);
    expect(result.leveledUp).toBe(false);
  });

  test('handles multiple level ups in one call', () => {
    // Level 1→2 = 100, Level 2→3 = 140, so 240+ should reach level 3
    const user = mockUser({ xp: 0, level: 1 });
    const result = applyXpToUser(user, { tier1: 2, tier2: 0, tier3: 0, tier3Behavior: null, total: 250 });
    expect(user.level).toBeGreaterThanOrEqual(3);
    expect(result.leveledUp).toBe(true);
  });

  test('returns unlocked tutors', () => {
    getTutorsToUnlock.mockReturnValueOnce(['tutor_galaxy']);
    const user = mockUser({ xp: 95, level: 1, unlockedItems: [] });
    const result = applyXpToUser(user, { tier1: 2, tier2: 10, tier3: 0, tier3Behavior: null, total: 12 });
    expect(result.tutorsUnlocked).toEqual(['tutor_galaxy']);
    expect(user.unlockedItems).toContain('tutor_galaxy');
  });

  test('calls markModified for xpLadderStats', () => {
    const user = mockUser();
    applyXpToUser(user, { tier1: 2, tier2: 0, tier3: 0, tier3Behavior: null, total: 2 });
    expect(user.markModified).toHaveBeenCalledWith('xpLadderStats');
  });
});

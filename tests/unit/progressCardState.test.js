/**
 * deriveProgressCardState UNIT TESTS
 *
 * Locks the lifecycle-state decision that drives the progress card's framing.
 */

const { deriveProgressCardState } = require('../../utils/progressCardState');

const NOW = 1_700_000_000_000; // fixed epoch for deterministic recency checks

describe('deriveProgressCardState', () => {
  test('first_session when nothing is in progress and nothing done yet', () => {
    const state = deriveProgressCardState({
      currentLearning: null,
      recentMastery: null,
      weeklyStats: { problemsSolved: 0, problemsCorrect: 0 },
      now: NOW,
    });
    expect(state).toBe('first_session');
  });

  test('mastery when a skill was mastered within the last day', () => {
    const state = deriveProgressCardState({
      currentLearning: { skillId: 'x', progress: 100 },
      recentMastery: { date: new Date(NOW - 2 * 60 * 60 * 1000) }, // 2h ago
      weeklyStats: { problemsSolved: 6, problemsCorrect: 5 },
      now: NOW,
    });
    expect(state).toBe('mastery');
  });

  test('mastery outranks struggling', () => {
    const state = deriveProgressCardState({
      currentLearning: { skillId: 'x' },
      recentMastery: { date: new Date(NOW - 1000) },
      weeklyStats: { problemsSolved: 8, problemsCorrect: 1 }, // would be struggling
      now: NOW,
    });
    expect(state).toBe('mastery');
  });

  test('a stale mastery does not trigger the celebration', () => {
    const state = deriveProgressCardState({
      currentLearning: { skillId: 'x', progress: 40 },
      recentMastery: { date: new Date(NOW - 3 * 24 * 60 * 60 * 1000) }, // 3 days ago
      weeklyStats: { problemsSolved: 4, problemsCorrect: 3 },
      now: NOW,
    });
    expect(state).toBe('progress');
  });

  test('struggling when there is real effort but few first-try wins', () => {
    const state = deriveProgressCardState({
      currentLearning: { skillId: 'x', progress: 35 },
      recentMastery: null,
      weeklyStats: { problemsSolved: 8, problemsCorrect: 1 }, // 12.5%
      now: NOW,
    });
    expect(state).toBe('struggling');
  });

  test('progress is the normal in-progress default', () => {
    const state = deriveProgressCardState({
      currentLearning: { skillId: 'x', progress: 50 },
      recentMastery: null,
      weeklyStats: { problemsSolved: 6, problemsCorrect: 4 },
      now: NOW,
    });
    expect(state).toBe('progress');
  });

  test('a couple of misses is not enough to call it struggling', () => {
    const state = deriveProgressCardState({
      currentLearning: { skillId: 'x', progress: 20 },
      recentMastery: null,
      weeklyStats: { problemsSolved: 2, problemsCorrect: 0 }, // below minStruggleAttempts
      now: NOW,
    });
    expect(state).toBe('progress');
  });
});

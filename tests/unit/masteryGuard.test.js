// tests/unit/masteryGuard.test.js
// Unit tests for the small helpers that decide:
//  - whether a skill is already mastered (so badges shouldn't open)
//  - whether an activeBadge is stuck (so the safety valve should fire)
//  - how to clear an activeBadge into the attempts log

const {
  isSkillMastered,
  isBadgeStuck,
  clearActiveBadge,
  STUCK_BADGE_ATTEMPT_MULTIPLIER,
} = require('../../utils/masteryGuard');

function userWithSkill(skillId, entry) {
  // Test against both the Map and plain-object shapes — User.skillMastery is
  // declared as Mixed, so we see both in the wild.
  return {
    map: { skillMastery: new Map([[skillId, entry]]) },
    obj: { skillMastery: { [skillId]: entry } },
  };
}

describe('isSkillMastered', () => {
  test('returns false for a user with no skillMastery', () => {
    expect(isSkillMastered({}, 'anything')).toBe(false);
  });

  test('returns true for a screener-mastered skill (totalAttempts: 0)', () => {
    // The exact shape from Jason's MongoDB profile for simple-probability
    const entry = {
      status: 'mastered',
      masteryScore: 1,
      totalAttempts: 0,
      masteredDate: new Date('2026-02-15'),
    };
    const { map, obj } = userWithSkill('simple-probability', entry);
    expect(isSkillMastered(map, 'simple-probability')).toBe(true);
    expect(isSkillMastered(obj, 'simple-probability')).toBe(true);
  });

  test('returns false for a skill in learning status', () => {
    const { map } = userWithSkill('probability-basics', {
      status: 'learning',
      masteryScore: 0.5,
      totalAttempts: 0,
    });
    expect(isSkillMastered(map, 'probability-basics')).toBe(false);
  });

  test('returns false for unknown skills', () => {
    const { map } = userWithSkill('foo', { status: 'mastered', masteredDate: new Date(), masteryScore: 1 });
    expect(isSkillMastered(map, 'bar')).toBe(false);
  });
});

describe('isBadgeStuck', () => {
  test('returns false for null badge', () => {
    expect(isBadgeStuck(null)).toBe(false);
  });

  test('returns false when problemsCompleted < threshold', () => {
    expect(isBadgeStuck({
      requiredProblems: 12,
      requiredAccuracy: 0.8,
      problemsCompleted: 10,
      problemsCorrect: 4,
    })).toBe(false);
  });

  test('returns true at multiplier x required with low accuracy', () => {
    expect(isBadgeStuck({
      requiredProblems: 12,
      requiredAccuracy: 0.8,
      problemsCompleted: 12 * STUCK_BADGE_ATTEMPT_MULTIPLIER,
      problemsCorrect: 8, // 33%, well under 80%
    })).toBe(true);
  });

  test('returns false when accuracy is on track even at high attempt count', () => {
    // 95% accuracy at 24 attempts on a 12-required badge is "earned, just
    // not flushed yet" territory — not stuck.
    expect(isBadgeStuck({
      requiredProblems: 12,
      requiredAccuracy: 0.8,
      problemsCompleted: 24,
      problemsCorrect: 23,
    })).toBe(false);
  });

  test('matches Jason’s real stuck-badge shape (39/18 on a 12-required badge)', () => {
    // The exact case that motivated this code — verifies the valve fires.
    expect(isBadgeStuck({
      requiredProblems: 12,
      requiredAccuracy: 0.8,
      problemsCompleted: 39,
      problemsCorrect: 18,
    })).toBe(true);
  });
});

describe('clearActiveBadge', () => {
  test('is a no-op when there is no activeBadge', () => {
    const user = { masteryProgress: { activeBadge: null, attempts: [] } };
    expect(clearActiveBadge(user, 'reason')).toBeNull();
    expect(user.masteryProgress.activeBadge).toBeNull();
    expect(user.masteryProgress.attempts).toEqual([]);
  });

  test('nulls the activeBadge and appends to attempts log', () => {
    const user = {
      masteryProgress: {
        activeBadge: {
          badgeId: 'uncertainty-simple-probability',
          skillId: 'simple-probability',
          problemsCompleted: 39,
          problemsCorrect: 18,
        },
        attempts: [],
      },
      markModified: jest.fn(),
    };
    const prior = clearActiveBadge(user, 'staleness valve');
    expect(prior.badgeId).toBe('uncertainty-simple-probability');
    expect(user.masteryProgress.activeBadge).toBeNull();
    expect(user.masteryProgress.attempts).toHaveLength(1);
    expect(user.masteryProgress.attempts[0]).toMatchObject({
      badgeId: 'uncertainty-simple-probability',
      completed: false,
      score: 46, // round(18/39 * 100)
    });
    expect(user.markModified).toHaveBeenCalledWith('masteryProgress');
  });

  test('initializes attempts array if missing', () => {
    const user = {
      masteryProgress: {
        activeBadge: { badgeId: 'b', skillId: 's', problemsCompleted: 0, problemsCorrect: 0 },
      },
      markModified: jest.fn(),
    };
    clearActiveBadge(user, 'reason');
    expect(Array.isArray(user.masteryProgress.attempts)).toBe(true);
    expect(user.masteryProgress.attempts).toHaveLength(1);
    // 0/0 accuracy guard
    expect(user.masteryProgress.attempts[0].score).toBe(0);
  });
});

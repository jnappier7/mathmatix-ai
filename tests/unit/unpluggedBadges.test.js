// tests/unit/unpluggedBadges.test.js
const {
  UNPLUGGED_BADGE_CATALOG,
  checkUnpluggedBadges,
  getUnpluggedBadgeProgress,
} = require('../../utils/unpluggedBadges');

describe('unpluggedBadges', () => {
  test('catalog is a non-empty array of well-formed badges', () => {
    expect(Array.isArray(UNPLUGGED_BADGE_CATALOG)).toBe(true);
    expect(UNPLUGGED_BADGE_CATALOG.length).toBeGreaterThan(0);
    UNPLUGGED_BADGE_CATALOG.forEach((badge) => {
      expect(typeof badge.badgeId).toBe('string');
      expect(typeof badge.badgeName).toBe('string');
      expect(typeof badge.xpReward).toBe('number');
      expect(badge.threshold).toHaveProperty('type');
      expect(badge.threshold).toHaveProperty('value');
    });
  });

  describe('getUnpluggedBadgeProgress', () => {
    test('reports zero progress for a brand-new user', () => {
      const progress = getUnpluggedBadgeProgress({});
      expect(progress).toHaveLength(UNPLUGGED_BADGE_CATALOG.length);
      progress.forEach((p) => {
        expect(p.isEarned).toBe(false);
        expect(p.progress).toBe(0);
        expect(p.progressPercent).toBe(0);
      });
    });

    test('reflects partial progress and earned badges', () => {
      const user = {
        paperPractice: { totalSubmissions: 10 },
        habitBadges: [{ badgeId: 'unplugged-first-upload' }],
      };
      const progress = getUnpluggedBadgeProgress(user);

      const first = progress.find((p) => p.badgeId === 'unplugged-first-upload');
      expect(first.isEarned).toBe(true);

      const tenth = progress.find((p) => p.badgeId === 'unplugged-10-uploads');
      expect(tenth.progress).toBe(10);
      expect(tenth.progressPercent).toBe(100);
    });
  });

  describe('checkUnpluggedBadges', () => {
    test('awards nothing for a user below every threshold', async () => {
      const user = { paperPractice: {}, habitBadges: [], save: jest.fn() };
      const earned = await checkUnpluggedBadges(user);

      expect(earned).toEqual([]);
      expect(user.save).not.toHaveBeenCalled();
    });

    test('awards a milestone badge, grants XP, logs history, and persists', async () => {
      const user = {
        firstName: 'Test',
        paperPractice: { totalSubmissions: 1 },
        habitBadges: [],
        xp: 0,
        save: jest.fn().mockResolvedValue(true),
      };
      const earned = await checkUnpluggedBadges(user);

      expect(earned.length).toBeGreaterThan(0);
      expect(earned[0].badgeId).toBe('unplugged-first-upload');
      expect(user.xp).toBe(15);
      expect(user.habitBadges).toHaveLength(1);
      expect(user.xpHistory).toHaveLength(1);
      expect(user.save).toHaveBeenCalledTimes(1);
    });

    test('does not re-award a badge the user already has', async () => {
      const user = {
        paperPractice: { totalSubmissions: 1 },
        habitBadges: [{ badgeId: 'unplugged-first-upload' }],
        save: jest.fn(),
      };
      const earned = await checkUnpluggedBadges(user);

      expect(earned).toEqual([]);
      expect(user.save).not.toHaveBeenCalled();
    });
  });
});

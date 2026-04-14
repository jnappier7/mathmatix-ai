/**
 * UNPLUGGED BADGES — Paper & Pencil Achievement System
 *
 * Awards badges based on paper work submissions via Show Your Work
 * and the Paper Practice phase in guided lessons.
 *
 * Tracks:
 *   - Total paper submissions (lifetime)
 *   - Consecutive-day streaks
 *   - Quality of handwritten work (from grading results)
 *
 * Badge categories:
 *   - Milestone: First upload, 10th, 25th, 50th, 100th
 *   - Streak: 3-day, 7-day, 14-day, 30-day consecutive paper work
 *   - Quality: High accuracy on paper work
 *
 * @module utils/unpluggedBadges
 */

const UNPLUGGED_BADGE_CATALOG = [
  // ── Milestone badges (total submissions) ──
  {
    badgeId: 'unplugged-first-upload',
    badgeName: 'Pencil Pusher',
    category: 'consistency',
    description: 'Upload your first paper work',
    threshold: { type: 'totalSubmissions', value: 1 },
    xpReward: 15,
  },
  {
    badgeId: 'unplugged-10-uploads',
    badgeName: 'Paper Trail',
    category: 'consistency',
    description: 'Upload 10 pieces of paper work',
    threshold: { type: 'totalSubmissions', value: 10 },
    xpReward: 30,
  },
  {
    badgeId: 'unplugged-25-uploads',
    badgeName: 'Analog Apprentice',
    category: 'consistency',
    description: 'Upload 25 pieces of paper work',
    threshold: { type: 'totalSubmissions', value: 25 },
    xpReward: 50,
  },
  {
    badgeId: 'unplugged-50-uploads',
    badgeName: 'Pencil Warrior',
    category: 'consistency',
    description: 'Upload 50 pieces of paper work',
    threshold: { type: 'totalSubmissions', value: 50 },
    xpReward: 75,
  },
  {
    badgeId: 'unplugged-100-uploads',
    badgeName: 'Paper Champion',
    category: 'consistency',
    description: 'Upload 100 pieces of paper work',
    threshold: { type: 'totalSubmissions', value: 100 },
    xpReward: 150,
  },

  // ── Streak badges (consecutive days) ──
  {
    badgeId: 'unplugged-streak-3',
    badgeName: '3-Day Unplugged',
    category: 'consistency',
    description: 'Upload paper work 3 days in a row',
    threshold: { type: 'currentStreak', value: 3 },
    xpReward: 20,
  },
  {
    badgeId: 'unplugged-streak-7',
    badgeName: 'Week of Writing',
    category: 'consistency',
    description: 'Upload paper work 7 days in a row',
    threshold: { type: 'currentStreak', value: 7 },
    xpReward: 50,
  },
  {
    badgeId: 'unplugged-streak-14',
    badgeName: 'Fortnight of Focus',
    category: 'consistency',
    description: 'Upload paper work 14 days in a row',
    threshold: { type: 'currentStreak', value: 14 },
    xpReward: 100,
  },
  {
    badgeId: 'unplugged-streak-30',
    badgeName: 'Month of Mastery',
    category: 'consistency',
    description: 'Upload paper work 30 days in a row',
    threshold: { type: 'currentStreak', value: 30 },
    xpReward: 200,
  },
];

/**
 * Check and award unplugged badges after a paper submission.
 *
 * Call this after updating user.paperPractice counters.
 *
 * @param {Object} user - Mongoose user document (must have paperPractice and habitBadges)
 * @returns {Array} Newly earned badges (empty if none)
 */
async function checkUnpluggedBadges(user) {
  const earned = [];
  const pp = user.paperPractice || {};
  const existingBadgeIds = new Set(
    (user.habitBadges || []).map(b => b.badgeId)
  );

  for (const badge of UNPLUGGED_BADGE_CATALOG) {
    // Skip if already earned
    if (existingBadgeIds.has(badge.badgeId)) continue;

    const { type, value } = badge.threshold;
    const current = pp[type] || 0;

    if (current >= value) {
      // Award the badge
      const newBadge = {
        badgeId: badge.badgeId,
        badgeName: badge.badgeName,
        category: badge.category,
        earnedDate: new Date(),
        metadata: {
          thresholdType: type,
          thresholdValue: value,
          actualValue: current,
        },
      };

      if (!user.habitBadges) user.habitBadges = [];
      user.habitBadges.push(newBadge);

      // Award XP
      user.xp = (user.xp || 0) + badge.xpReward;

      // Track in XP history
      if (!user.xpHistory) user.xpHistory = [];
      user.xpHistory.push({
        amount: badge.xpReward,
        reason: `Unplugged badge: ${badge.badgeName}`,
        source: 'unplugged-badge',
        date: new Date(),
      });

      earned.push({
        ...newBadge,
        xpReward: badge.xpReward,
        description: badge.description,
      });

      console.log(`🏅 Unplugged badge earned: ${badge.badgeName} (${badge.badgeId}) for ${user.firstName}`);
    }
  }

  if (earned.length > 0) {
    await user.save();
  }

  return earned;
}

/**
 * Get unplugged badge progress for a user (for dashboard display).
 *
 * @param {Object} user - User document
 * @returns {Array} Badge progress objects
 */
function getUnpluggedBadgeProgress(user) {
  const pp = user.paperPractice || {};
  const existingBadgeIds = new Set(
    (user.habitBadges || []).map(b => b.badgeId)
  );

  return UNPLUGGED_BADGE_CATALOG.map(badge => {
    const { type, value } = badge.threshold;
    const current = pp[type] || 0;
    const isEarned = existingBadgeIds.has(badge.badgeId);

    return {
      badgeId: badge.badgeId,
      badgeName: badge.badgeName,
      description: badge.description,
      category: badge.category,
      xpReward: badge.xpReward,
      isEarned,
      progress: Math.min(current, value),
      target: value,
      progressPercent: Math.min(100, Math.round((current / value) * 100)),
    };
  });
}

module.exports = {
  UNPLUGGED_BADGE_CATALOG,
  checkUnpluggedBadges,
  getUnpluggedBadgeProgress,
};

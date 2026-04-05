/**
 * Next Action Suggestions — contextual "What's Next?" nudges for students.
 *
 * Generates prioritized suggestions based on the student's current state:
 * skills nearing mastery, fading memories, available badges, streaks, etc.
 *
 * @module utils/nextActionSuggestions
 */

const { calculateRetrievability } = require('./fsrsScheduler');

/**
 * Generate a prioritized list of next-action suggestions for a student.
 *
 * @param {Object} user - Mongoose user document (lean or hydrated)
 * @param {Object} [context] - Optional context about what just happened
 * @param {boolean} [context.leveledUp] - Student just leveled up
 * @param {boolean} [context.badgeEarned] - Student just earned a badge
 * @param {boolean} [context.questCompleted] - Student just completed a quest
 * @param {boolean} [context.streakFreezeUsed] - Streak freeze was just used
 * @param {number}  [context.streakLost] - Streak was just lost (value = old streak)
 * @returns {Object[]} Array of suggestion objects, most important first
 */
function getNextActions(user, context = {}) {
    const suggestions = [];
    const dailyQuests = user.dailyQuests || {};
    const engines = user.learningEngines || {};

    // ── 1. Streak-related suggestions ──
    if (context.streakFreezeUsed) {
        suggestions.push({
            type: 'streak-freeze',
            priority: 10,
            icon: 'fa-shield-alt',
            title: 'Streak Saved!',
            message: `Your ${dailyQuests.currentStreak}-day streak was protected by your weekly freeze. Come back tomorrow to keep it going!`,
            action: null,
        });
    }

    if (context.streakLost && context.streakLost >= 3) {
        suggestions.push({
            type: 'streak-lost',
            priority: 10,
            icon: 'fa-fire-alt',
            title: 'Start a New Streak',
            message: `You had a ${context.streakLost}-day streak! Practice daily to build it back.`,
            action: null,
        });
    }

    const streak = dailyQuests.currentStreak || 0;
    if (streak > 0 && streak % 7 === 6) {
        suggestions.push({
            type: 'streak-milestone',
            priority: 7,
            icon: 'fa-fire',
            title: 'One More Day!',
            message: `Practice tomorrow for a ${streak + 1}-day streak milestone!`,
            action: null,
        });
    }

    // ── 2. Fading memory — skills that need review ──
    const fsrs = engines.fsrs;
    if (fsrs) {
        const fadingSkills = [];
        const entries = typeof fsrs.entries === 'function' ? Array.from(fsrs.entries()) : Object.entries(fsrs);

        for (const [skillId, data] of entries) {
            if (!data || !data.lastReview) continue;
            const elapsed = (Date.now() - new Date(data.lastReview).getTime()) / 86400000;
            const retrievability = calculateRetrievability(elapsed, data.stability ?? 0);
            if (retrievability < 0.5) {
                fadingSkills.push({ skillId, retrievability });
            }
        }

        fadingSkills.sort((a, b) => a.retrievability - b.retrievability);

        if (fadingSkills.length > 0) {
            const topFading = fadingSkills[0];
            const displayName = topFading.skillId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            suggestions.push({
                type: 'memory-review',
                priority: 8,
                icon: 'fa-brain',
                title: 'Quick Review',
                message: `Your memory of "${displayName}" is fading. A quick review will lock it in.`,
                action: { type: 'practice-skill', skillId: topFading.skillId },
            });
        }
    }

    // ── 3. Skills close to mastery ──
    const skillMastery = user.skillMastery || {};
    const entries = typeof skillMastery.entries === 'function'
        ? Array.from(skillMastery.entries())
        : Object.entries(skillMastery);

    const nearMastery = [];
    for (const [skillId, data] of entries) {
        const score = data.masteryScore || 0;
        if (score >= 70 && score < 95 && data.status !== 'mastered') {
            nearMastery.push({ skillId, score });
        }
    }
    nearMastery.sort((a, b) => b.score - a.score);

    if (nearMastery.length > 0) {
        const top = nearMastery[0];
        const displayName = top.skillId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        suggestions.push({
            type: 'near-mastery',
            priority: 6,
            icon: 'fa-star-half-alt',
            title: 'Almost There!',
            message: `You're ${Math.round(95 - top.score)}% away from mastering "${displayName}". Keep practicing!`,
            action: { type: 'practice-skill', skillId: top.skillId },
        });
    }

    // ── 4. Incomplete daily quests ──
    const quests = dailyQuests.quests || [];
    const incompleteQuests = quests.filter(q => !q.completed);
    if (incompleteQuests.length > 0 && incompleteQuests.length <= 2) {
        suggestions.push({
            type: 'daily-quests',
            priority: 5,
            icon: 'fa-scroll',
            title: incompleteQuests.length === 1 ? 'One Quest Left!' : 'Almost Done!',
            message: `${incompleteQuests.length} daily quest${incompleteQuests.length > 1 ? 's' : ''} remaining. Complete them for bonus XP!`,
            action: { type: 'view-quests' },
        });
    }

    // ── 5. Level-up context ──
    if (context.leveledUp) {
        const level = user.level || 1;
        // Suggest trying mastery if they haven't
        if (level >= 3 && nearMastery.length > 0) {
            suggestions.push({
                type: 'try-mastery',
                priority: 9,
                icon: 'fa-trophy',
                title: 'Ready for a Challenge?',
                message: 'Try a mastery challenge to earn a badge and prove what you know!',
                action: { type: 'navigate', url: '/badge-map.html' },
            });
        }
    }

    // ── 6. Badge earned context ──
    if (context.badgeEarned) {
        suggestions.push({
            type: 'next-badge',
            priority: 4,
            icon: 'fa-medal',
            title: 'Keep Collecting!',
            message: 'Check the badge map to see what you can earn next.',
            action: { type: 'navigate', url: '/badge-map.html' },
        });
    }

    // Fact fluency suggestion: shelved (no real data)

    // Sort by priority descending, return top 3
    suggestions.sort((a, b) => b.priority - a.priority);
    return suggestions.slice(0, 3);
}

module.exports = { getNextActions };

/**
 * Smart Review Queue — FSRS-driven, cognitive-load-aware review scheduling.
 *
 * Builds an intelligent review session by combining:
 *   - FSRS urgency (skills most at risk of being forgotten)
 *   - Cognitive load awareness (lighter sessions when student is overloaded)
 *   - Difficulty interleaving (mix easy and hard for optimal retention)
 *   - Session planning (estimated time, recommended batch size)
 *
 * @module utils/smartReviewQueue
 */

const { calculateRetrievability } = require('./fsrsScheduler');

// Session size limits based on cognitive load
const SESSION_CONFIG = {
    MAX_SKILLS: 10,
    MIN_SKILLS: 2,
    DEFAULT_SKILLS: 5,
    // Estimated seconds per review by difficulty tier
    SECONDS_PER_REVIEW: { easy: 20, medium: 45, hard: 75 },
};

/**
 * Build a smart review queue from a student's FSRS memory data.
 *
 * @param {Object} user - User document (lean or hydrated)
 * @param {Object} [options]
 * @param {number} [options.maxSkills=10] - Hard cap on returned skills
 * @param {number} [options.lookaheadDays=1] - Include skills due within N days
 * @param {boolean} [options.includeUpcoming=true] - Include not-yet-due skills
 * @returns {{ queue: Object[], stats: Object, sessionPlan: Object }}
 */
function buildSmartQueue(user, options = {}) {
    const {
        maxSkills = SESSION_CONFIG.MAX_SKILLS,
        lookaheadDays = 1,
        includeUpcoming = true,
    } = options;

    const engines = user.learningEngines || {};
    const fsrs = engines.fsrs;
    const now = Date.now();

    // ── Gather all FSRS cards ──
    const entries = fsrs
        ? (typeof fsrs.entries === 'function' ? Array.from(fsrs.entries()) : Object.entries(fsrs))
        : [];

    if (entries.length === 0) {
        return { queue: [], stats: emptyStats(), sessionPlan: emptyPlan() };
    }

    // ── Score each skill ──
    const candidates = [];
    let totalRetrievability = 0;
    let dueCount = 0;
    let overdueCount = 0;

    for (const [skillId, card] of entries) {
        if (!card || !card.lastReview) continue;

        const elapsedDays = (now - new Date(card.lastReview).getTime()) / 86400000;
        const scheduledDays = card.scheduledDays || 1;
        const retrievability = calculateRetrievability(elapsedDays, card.stability ?? 0);
        const isDue = elapsedDays >= scheduledDays;
        const isUpcoming = elapsedDays >= scheduledDays - lookaheadDays;
        const isOverdue = elapsedDays > scheduledDays * 1.5;

        totalRetrievability += retrievability;
        if (isDue) dueCount++;
        if (isOverdue) overdueCount++;

        if (isDue || (includeUpcoming && isUpcoming)) {
            candidates.push({
                skillId,
                retrievability: Math.round(retrievability * 1000) / 1000,
                elapsedDays: Math.round(elapsedDays * 10) / 10,
                scheduledDays,
                overdueRatio: Math.round((elapsedDays / scheduledDays) * 100) / 100,
                urgency: Math.round((1 - retrievability) * 1000) / 1000,
                difficulty: card.difficulty ?? 5,
                stability: card.stability ?? 0,
                state: card.state || 'review',
                reps: card.reps || 0,
                lapses: card.lapses || 0,
                isDue,
                isOverdue,
            });
        }
    }

    // ── Determine session size based on cognitive load ──
    const cogHistory = engines.cognitiveLoadHistory || [];
    const recentLoad = cogHistory.length > 0
        ? cogHistory[cogHistory.length - 1].avgLoad ?? 0
        : 0;

    const sessionSize = getAdaptiveSessionSize(recentLoad, candidates.length, maxSkills);

    // ── Sort & select ──
    // Primary: overdue items first (by urgency), then upcoming by urgency
    candidates.sort((a, b) => {
        // Overdue items always first
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        // Then by urgency (highest first)
        if (b.urgency !== a.urgency) return b.urgency - a.urgency;
        // Break ties: skills with more lapses get priority (struggling skills)
        return b.lapses - a.lapses;
    });

    let selected = candidates.slice(0, sessionSize);

    // ── Interleave difficulty ──
    // Mix easy and hard to reduce fatigue and improve retention
    if (selected.length >= 4) {
        selected = interleaveDifficulty(selected);
    }

    // ── Build stats ──
    const stats = {
        totalTracked: entries.length,
        dueNow: dueCount,
        overdueCount,
        averageRetrievability: entries.length > 0
            ? Math.round((totalRetrievability / entries.length) * 1000) / 1000
            : 1,
        recentCognitiveLoad: recentLoad,
        queueSize: selected.length,
    };

    // ── Session plan ──
    const sessionPlan = buildSessionPlan(selected, recentLoad);

    return { queue: selected, stats, sessionPlan };
}

/**
 * Determine how many skills to include based on cognitive load.
 * When students are overloaded, we shorten the session.
 */
function getAdaptiveSessionSize(cognitiveLoad, available, maxSkills) {
    let target;
    if (cognitiveLoad > 0.8) {
        // Overloaded — minimal session
        target = SESSION_CONFIG.MIN_SKILLS;
    } else if (cognitiveLoad > 0.6) {
        // Moderate load — shorter session
        target = Math.ceil(SESSION_CONFIG.DEFAULT_SKILLS * 0.6);
    } else {
        // Normal — full session
        target = SESSION_CONFIG.DEFAULT_SKILLS;
    }

    return Math.min(target, available, maxSkills);
}

/**
 * Interleave skills by difficulty to reduce fatigue.
 * Alternates between easier and harder items.
 */
function interleaveDifficulty(skills) {
    // Split into easier (below median) and harder (at/above median)
    const sorted = [...skills].sort((a, b) => a.difficulty - b.difficulty);
    const mid = Math.ceil(sorted.length / 2);
    const easier = sorted.slice(0, mid);
    const harder = sorted.slice(mid);

    const result = [];
    let ei = 0, hi = 0;
    let pickEasy = true;

    while (ei < easier.length || hi < harder.length) {
        if (pickEasy && ei < easier.length) {
            result.push(easier[ei++]);
        } else if (!pickEasy && hi < harder.length) {
            result.push(harder[hi++]);
        } else if (ei < easier.length) {
            result.push(easier[ei++]);
        } else {
            result.push(harder[hi++]);
        }
        pickEasy = !pickEasy;
    }

    return result;
}

/**
 * Build a session plan with time estimates and pacing guidance.
 */
function buildSessionPlan(queue, cognitiveLoad) {
    if (queue.length === 0) return emptyPlan();

    let totalSeconds = 0;
    const breakdown = queue.map(skill => {
        const tier = skill.difficulty <= 3 ? 'easy'
            : skill.difficulty <= 7 ? 'medium'
            : 'hard';
        const seconds = SESSION_CONFIG.SECONDS_PER_REVIEW[tier];
        totalSeconds += seconds;

        return {
            skillId: skill.skillId,
            estimatedSeconds: seconds,
            difficultyTier: tier,
        };
    });

    let pacing;
    if (cognitiveLoad > 0.7) {
        pacing = 'Take it slow — shorter session with easier items first.';
    } else if (queue.some(s => s.isOverdue)) {
        pacing = 'Some skills are overdue — focus on those first to prevent forgetting.';
    } else {
        pacing = 'Great timing! Review these to keep your memory strong.';
    }

    return {
        skillCount: queue.length,
        estimatedMinutes: Math.ceil(totalSeconds / 60),
        pacing,
        breakdown,
    };
}

/**
 * Get a review summary for a student — quick check without building full queue.
 * Useful for dashboard widgets and notification decisions.
 *
 * @param {Object} user - User document
 * @returns {{ dueNow: number, urgentCount: number, nextDueIn: number|null, message: string }}
 */
function getReviewSummary(user) {
    const engines = user.learningEngines || {};
    const fsrs = engines.fsrs;
    const entries = fsrs
        ? (typeof fsrs.entries === 'function' ? Array.from(fsrs.entries()) : Object.entries(fsrs))
        : [];

    const now = Date.now();
    let dueNow = 0;
    let urgentCount = 0;
    let nextDueMs = Infinity;

    for (const [, card] of entries) {
        if (!card || !card.lastReview) continue;

        const elapsedMs = now - new Date(card.lastReview).getTime();
        const elapsedDays = elapsedMs / 86400000;
        const scheduledDays = card.scheduledDays || 1;

        if (elapsedDays >= scheduledDays) {
            dueNow++;
            const retrievability = calculateRetrievability(elapsedDays, card.stability ?? 0);
            if (retrievability < 0.5) urgentCount++;
        } else {
            const dueInMs = (scheduledDays * 86400000) - elapsedMs;
            if (dueInMs < nextDueMs) nextDueMs = dueInMs;
        }
    }

    const nextDueIn = nextDueMs === Infinity ? null : Math.ceil(nextDueMs / 86400000);

    let message;
    if (dueNow === 0) {
        message = nextDueIn !== null
            ? `All caught up! Next review in ${nextDueIn} day${nextDueIn !== 1 ? 's' : ''}.`
            : 'No reviews scheduled yet.';
    } else if (urgentCount > 0) {
        message = `${urgentCount} skill${urgentCount !== 1 ? 's' : ''} urgently need${urgentCount === 1 ? 's' : ''} review — memories are fading fast!`;
    } else {
        message = `${dueNow} skill${dueNow !== 1 ? 's' : ''} ready for review.`;
    }

    return { dueNow, urgentCount, nextDueIn, message };
}

function emptyStats() {
    return {
        totalTracked: 0, dueNow: 0, overdueCount: 0,
        averageRetrievability: 1, recentCognitiveLoad: 0, queueSize: 0,
    };
}

function emptyPlan() {
    return { skillCount: 0, estimatedMinutes: 0, pacing: 'No reviews needed right now.', breakdown: [] };
}

module.exports = {
    buildSmartQueue,
    getReviewSummary,
    getAdaptiveSessionSize,
    interleaveDifficulty,
    SESSION_CONFIG,
};

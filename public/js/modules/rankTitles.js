// modules/rankTitles.js
// Rank title ladder (identity layer) — CLIENT MIRROR of utils/brand.js
// `rankTitleLadder`. Titles are derived from cumulative Tier-3 behavior counts
// (user.xpLadderStats.tier3Behaviors: [{ behavior, count, lastEarned }]).
//
// ⚠️ Keep this in sync with utils/brand.js. The server config is canonical;
// this mirror exists because brand.js is CommonJS and cannot be imported by the
// ES-module client bundle. D2 verified the raw tier3Behaviors array already
// reaches the client on the GET /user payload, so titles compute client-side.

export const RANK_THRESHOLDS = [5, 15, 40]; // counts for tier 1 / 2 / 3

export const RANK_TITLE_LADDER = {
    caught_own_error:    ['Error Spotter', 'Error Hunter', 'Error Hunter II'],
    explained_reasoning: ['Explainer', 'Reasoner', 'Master Reasoner'],
    persistence:         ['Grinder', 'Unshakeable', 'Relentless'],
    taught_back:         ['Study Buddy', 'Tutor-in-Training', 'The Professor'],
    strategy_selection:  ['Planner', 'Strategist', 'Grandmaster'],
    transfer:            ['Connector', 'Pattern Seer', 'Polymath'],
};

/**
 * Given a behavior's cumulative count, return the earned tier index
 * (0-based: 0 = first title … 2 = top title) or -1 if none earned yet.
 */
function tierForCount(count) {
    let tier = -1;
    for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
        if (count >= RANK_THRESHOLDS[i]) tier = i;
    }
    return tier;
}

/**
 * Normalize the tier3Behaviors array (from user.xpLadderStats) into a count map.
 * Tolerates a missing/!array input.
 */
function toCountMap(tier3Behaviors) {
    const map = {};
    if (Array.isArray(tier3Behaviors)) {
        for (const entry of tier3Behaviors) {
            if (entry && entry.behavior) map[entry.behavior] = entry.count || 0;
        }
    }
    return map;
}

/**
 * Compute the highest earned title per behavior.
 * @returns {Array<{behavior, tier, title, count}>} one entry per behavior that
 *          has earned at least tier 0, sorted best-first (tier desc, count desc).
 */
export function computeEarnedTitles(tier3Behaviors) {
    const counts = toCountMap(tier3Behaviors);
    const earned = [];
    for (const [behavior, titles] of Object.entries(RANK_TITLE_LADDER)) {
        const count = counts[behavior] || 0;
        const tier = tierForCount(count);
        if (tier >= 0) {
            earned.push({ behavior, tier, title: titles[tier], count });
        }
    }
    earned.sort((a, b) => (b.tier - a.tier) || (b.count - a.count));
    return earned;
}

/**
 * The single most impressive earned title (or null if none earned yet).
 */
export function highestTitle(tier3Behaviors) {
    const earned = computeEarnedTitles(tier3Behaviors);
    return earned.length ? earned[0] : null;
}

/**
 * COIN ENGINE — the single server-authoritative entry point for awarding Coins.
 *
 * Coins are an EARNED soft currency for cosmetics only. This module is the ONLY
 * place that should mutate `user.wallet`. It enforces a per-UTC-day cap so no
 * event path (or bug) can mint unbounded currency, mirroring the XP-cap
 * discipline in utils/pipeline/xpEngine.js.
 *
 * Pure and defensive: accepts a Mongoose doc or a plain object, never throws on
 * bad input, and only calls markModified when available. Callers are
 * responsible for user.save().
 *
 * @module coinEngine
 */

const BRAND_CONFIG = require('./brand');

/** Start-of-day in UTC for a given date (matches the app's UTC streak logic). */
function startOfUtcDay(d) {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
}

/**
 * Award coins to a user, honoring the daily cap.
 *
 * @param {Object} user - Mongoose user doc or plain object (mutated in place)
 * @param {number} amount - Coins to award (floored to a non-negative integer)
 * @param {string} [reason] - Audit label (e.g. 'level_up', 'quest_complete')
 * @returns {{awarded:number, coins:number, capped:boolean, reason:(string|null)}}
 */
function awardCoins(user, amount, reason) {
    const cap = (BRAND_CONFIG.coinRewards && BRAND_CONFIG.coinRewards.dailyCap) || 500;
    const out = { awarded: 0, coins: 0, capped: false, reason: reason || null };
    if (!user) return out;

    if (!user.wallet) {
        user.wallet = { coins: 0, lifetimeEarned: 0, dailyEarned: 0, lastCoinReset: new Date() };
    }
    const w = user.wallet;

    // Roll over the daily counter when we've crossed into a new UTC day.
    const now = new Date();
    const last = w.lastCoinReset ? new Date(w.lastCoinReset) : null;
    if (!last || startOfUtcDay(last).getTime() < startOfUtcDay(now).getTime()) {
        w.dailyEarned = 0;
        w.lastCoinReset = now;
    }

    const amt = Math.max(0, Math.floor(Number(amount) || 0));
    if (amt > 0) {
        const remaining = Math.max(0, cap - (w.dailyEarned || 0));
        const awarded = Math.min(amt, remaining);
        w.coins = (w.coins || 0) + awarded;
        w.lifetimeEarned = (w.lifetimeEarned || 0) + awarded;
        w.dailyEarned = (w.dailyEarned || 0) + awarded;
        out.awarded = awarded;
        out.capped = awarded < amt;
        if (typeof user.markModified === 'function') user.markModified('wallet');
    }

    out.coins = w.coins || 0;
    return out;
}

module.exports = { awardCoins, startOfUtcDay };

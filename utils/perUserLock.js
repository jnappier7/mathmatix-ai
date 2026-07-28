// utils/perUserLock.js
//
// Per-user request serialization. A user's concurrent messages must not run
// through the pipeline at the same time: two turns read-modify-write the same
// conversation document, last write wins, and one turn's messages disappear.
//
// This exists as a shared module because it previously existed as two hand-copied
// implementations — routes/chat.js and routes/courseChat.js — which diverged. The
// chat.js copy was fixed to evict only idle entries; the courseChat.js copy kept
// the original `locks.clear()`, which deleted locks out from under in-flight
// requests and reintroduced exactly the concurrency the lock exists to prevent.
// One implementation, two callers, no twin to forget.

const DEFAULT_MAX_IDLE_MS = 10 * 60 * 1000;
const DEFAULT_EVICT_ABOVE = 500;

/**
 * Create an independent per-user lock registry.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.maxIdleMs]   Evict entries idle at least this long.
 * @param {number}  [opts.evictAbove]  Only sweep once the map exceeds this size.
 * @param {boolean} [opts.autoSweep]   Start the periodic sweep timer (default true).
 */
function createPerUserLock(opts = {}) {
    const maxIdleMs = opts.maxIdleMs ?? DEFAULT_MAX_IDLE_MS;
    const evictAbove = opts.evictAbove ?? DEFAULT_EVICT_ABOVE;

    const locks = new Map();
    const lastUsed = new Map();
    // How many turns are currently queued or running for a user. An entry with
    // waiting > 0 must never be evicted, however old it looks: `lastUsed` is set
    // at acquire time, so a turn that runs longer than maxIdleMs would otherwise
    // have its own lock swept out from under it — the same concurrency bug as
    // .clear(), just rarer. Held-ness, not age, is the real safety condition.
    const waiting = new Map();

    /**
     * Wait for this user's previous turn, then take the lock.
     * Resolves to a release function the caller MUST invoke (use try/finally).
     */
    function acquire(userId) {
        const key = userId.toString();
        if (!locks.has(key)) {
            locks.set(key, Promise.resolve());
        }
        lastUsed.set(key, Date.now());
        waiting.set(key, (waiting.get(key) || 0) + 1);

        let release;
        const next = new Promise((resolve) => { release = resolve; });
        const previous = locks.get(key);
        locks.set(key, next);

        let released = false;
        const releaseOnce = () => {
            if (released) return;          // double-release must not corrupt the count
            released = true;
            const remaining = (waiting.get(key) || 1) - 1;
            if (remaining <= 0) waiting.delete(key);
            else waiting.set(key, remaining);
            lastUsed.set(key, Date.now());  // idle clock starts when the turn ends
            release();
        };

        return previous.then(() => releaseOnce);
    }

    /**
     * Drop entries for users who have been idle for maxIdleMs.
     *
     * Deliberately NOT a `locks.clear()`. Clearing the whole map drops the lock
     * for a request that is still running: the user's next message finds no
     * entry, seeds a fresh already-resolved promise, and proceeds concurrently
     * with the turn still in flight.
     *
     * @returns {number} entries evicted
     */
    function evictStale(now = Date.now()) {
        if (locks.size <= evictAbove) return 0;
        const cutoff = now - maxIdleMs;
        let evicted = 0;
        for (const [key, ts] of lastUsed) {
            if (waiting.get(key)) continue;   // held or queued — never evict
            if (ts < cutoff) {
                locks.delete(key);
                lastUsed.delete(key);
                evicted++;
            }
        }
        return evicted;
    }

    let timer = null;
    if (opts.autoSweep !== false) {
        timer = setInterval(() => evictStale(), maxIdleMs);
        // Never hold the process open just for lock housekeeping.
        if (typeof timer.unref === 'function') timer.unref();
    }

    return {
        acquire,
        evictStale,
        stopSweep: () => { if (timer) clearInterval(timer); timer = null; },
        get size() { return locks.size; },
        // Test seam: lets a test age an entry without waiting ten minutes.
        _setLastUsed: (userId, ts) => lastUsed.set(userId.toString(), ts),
    };
}

module.exports = { createPerUserLock, DEFAULT_MAX_IDLE_MS, DEFAULT_EVICT_ABOVE };

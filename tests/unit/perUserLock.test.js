// tests/unit/perUserLock.test.js
//
// The per-user lock serializes a user's concurrent messages. Without it, two
// turns run through the pipeline at once, read-modify-write the same
// conversation document, and one turn's messages are lost to last-write-wins.
//
// routes/courseChat.js swept the map with `courseChatLocks.clear()`. That drops
// the lock for a request that is STILL RUNNING: the user's next message finds no
// entry, seeds a fresh already-resolved promise, and proceeds concurrently with
// the in-flight turn — reintroducing exactly the race the lock exists to
// prevent, on a 10-minute timer, under entirely normal load.
//
// routes/chat.js had already been fixed to evict only idle entries. The two
// implementations were hand-copied and diverged, which is why this now lives in
// one shared module.

const { createPerUserLock, DEFAULT_MAX_IDLE_MS } = require('../../utils/perUserLock');

const makeLock = (opts = {}) => createPerUserLock({ autoSweep: false, ...opts });

describe('mutual exclusion', () => {
    test('a second acquire waits for the first to release', async () => {
        const lock = makeLock();
        const order = [];

        const releaseA = await lock.acquire('u1');
        let bEntered = false;

        const b = lock.acquire('u1').then((releaseB) => {
            bEntered = true;
            order.push('b');
            releaseB();
        });

        // B must not have run while A holds the lock.
        await Promise.resolve();
        expect(bEntered).toBe(false);

        order.push('a');
        releaseA();
        await b;

        expect(order).toEqual(['a', 'b']);
    });

    test('different users do not block each other', async () => {
        const lock = makeLock();
        await lock.acquire('u1'); // held, never released

        // Must not hang.
        const releaseOther = await lock.acquire('u2');
        expect(typeof releaseOther).toBe('function');
    });

    test('serializes a burst of turns from one user in order', async () => {
        const lock = makeLock();
        const seen = [];
        let active = 0;
        let maxConcurrent = 0;

        await Promise.all([1, 2, 3, 4, 5].map((n) =>
            lock.acquire('u1').then(async (release) => {
                active++;
                maxConcurrent = Math.max(maxConcurrent, active);
                await new Promise((r) => setTimeout(r, 1));
                seen.push(n);
                active--;
                release();
            })
        ));

        expect(maxConcurrent).toBe(1);        // never two turns at once
        expect(seen).toEqual([1, 2, 3, 4, 5]); // and in arrival order
    });
});

describe('stale eviction', () => {
    test('does not evict below the size threshold', () => {
        const lock = makeLock({ evictAbove: 10 });
        for (let i = 0; i < 5; i++) lock.acquire(`u${i}`);
        expect(lock.evictStale(Date.now() + DEFAULT_MAX_IDLE_MS * 2)).toBe(0);
        expect(lock.size).toBe(5);
    });

    test('evicts only entries idle past the window', async () => {
        const lock = makeLock({ evictAbove: 2, maxIdleMs: 1000 });

        // Acquire AND release: only a finished turn is eligible for eviction.
        for (const u of ['old1', 'old2', 'fresh']) {
            const release = await lock.acquire(u);
            release();
        }

        // Age the first two well past the window.
        lock._setLastUsed('old1', Date.now() - 60_000);
        lock._setLastUsed('old2', Date.now() - 60_000);

        expect(lock.evictStale()).toBe(2);
        expect(lock.size).toBe(1); // 'fresh' survives
    });

    test('never evicts a user whose turn is still running, however old', async () => {
        // `lastUsed` is stamped at acquire time, so a turn that outlives the idle
        // window would otherwise have its own lock swept away mid-flight — the
        // same concurrency bug as .clear(), just rarer.
        const lock = makeLock({ evictAbove: 0, maxIdleMs: 1000 });

        const release = await lock.acquire('slow');    // still running
        lock._setLastUsed('slow', Date.now() - 60 * 60 * 1000); // an hour "idle"

        expect(lock.evictStale()).toBe(0);
        expect(lock.size).toBe(1);

        // Once it finishes, it becomes eligible again.
        release();
        lock._setLastUsed('slow', Date.now() - 60 * 60 * 1000);
        expect(lock.evictStale()).toBe(1);
    });

    test('THE REGRESSION: a sweep never releases a lock that is still held', async () => {
        // This is what `locks.clear()` did. Reproduced against the real sweep:
        // an in-flight turn stays serialized even when the sweep runs mid-turn
        // and the map is over its threshold.
        const lock = makeLock({ evictAbove: 0, maxIdleMs: 0 });

        const releaseA = await lock.acquire('u1'); // turn A in flight, not released

        // The sweep fires MID-TURN — before the user's next message arrives.
        // Ordering matters: if B chains on before the sweep, its promise link to
        // A already exists and even a .clear() cannot break it. The real failure
        // is a sweep landing BETWEEN the two turns.
        lock.evictStale(Date.now() + 10_000);

        let bEntered = false;
        const b = lock.acquire('u1').then((releaseB) => { bEntered = true; releaseB(); });

        await Promise.resolve();
        await Promise.resolve();

        // B must STILL be waiting on A. Under the old .clear() the map no longer
        // held A's entry, so B seeded a fresh resolved promise and ran
        // concurrently with the turn still in flight.
        expect(bEntered).toBe(false);

        releaseA();
        await b;
        expect(bEntered).toBe(true);
    });
});

describe('both chat routes use the shared lock', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

    ['routes/chat.js', 'routes/courseChat.js'].forEach((file) => {
        test(`${file} uses createPerUserLock and no longer clears its map`, () => {
            const src = read(file);
            expect(src).toContain('createPerUserLock');
            // The defect, in the form it took.
            expect(src).not.toMatch(/Locks\.clear\(\)/);
        });
    });
});

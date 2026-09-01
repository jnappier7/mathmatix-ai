/**
 * Close a connect-mongo session store in test teardown without leaking an
 * unhandled rejection.
 *
 * The failure this exists to prevent: connect-mongo builds `collectionP` in its
 * CONSTRUCTOR — connect, then `createIndex` for the TTL sweep — and never
 * attaches a catch to it:
 *
 *   this.collectionP = _clientP.then(async (con) => {
 *     const collection = con.db(...).collection(...)
 *     await this.setAutoRemove(collection)      // createIndex({expires: 1})
 *     return collection
 *   })
 *
 * A suite running the real middleware with `saveUninitialized: false` never
 * touches the store (no login, no session write), so nothing else awaits that
 * promise either. Closing the client while the createIndex is still in flight
 * interrupts it, and the resulting MongoClientClosedError lands on a promise
 * with NO handler — an unhandled rejection, which Jest reports as
 * "Test suite failed to run" from a teardown where every test already passed.
 *
 * Two things that look like they would fix it and do not:
 *   - try/catch around `await store.close()`. close() hands its own promise
 *     back (`clientP.then((c) => c.close())`), so that catch works fine — but
 *     the rejection is on `collectionP`, a different promise it never sees.
 *   - `process.on('unhandledRejection', …)`. Jest installs its own listener and
 *     fails the file from that; adding a second one doesn't unregister Jest's.
 *
 * Awaiting `collectionP` first both settles the index build and gives that
 * promise a handler, which removes the race instead of sleeping past it.
 *
 * `collectionP` is an instance property rather than documented API, so this
 * tolerates its absence and stays a no-op if connect-mongo ever renames it —
 * the worst case is the old race, not a broken teardown.
 */
async function closeSessionStore(store) {
  if (!store) return;
  if (store.collectionP && typeof store.collectionP.then === 'function') {
    await store.collectionP.catch(() => { /* interrupted mid-build; handled */ });
  }
  if (typeof store.close === 'function') {
    await store.close().catch(() => { /* already closing or closed */ });
  }
}

module.exports = { closeSessionStore };

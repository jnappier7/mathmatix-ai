/**
 * The teardown seam that turned a passing suite red.
 *
 * tests/integration/staticHtmlCspGate.test.js failed CI as "Test suite failed
 * to run" with MongoClientClosedError while every test inside it passed. The
 * cause is a floating promise in connect-mongo's constructor (`collectionP` =
 * connect → createIndex, never given a catch) that the client close interrupts.
 * Nothing in that suite awaits it, so the rejection is unhandled and Jest fails
 * the file on it.
 *
 * That suite needs a real mongod to run, so it can't pin this itself on a box
 * without one. These tests pin the fix's actual invariant against a fake store,
 * with no Mongo anywhere.
 */

const { closeSessionStore } = require('../helpers/closeSessionStore');

const closedClientError = () => Object.assign(
  new Error('Operation interrupted because client was closed'),
  { name: 'MongoClientClosedError' }
);

describe('closeSessionStore', () => {
  test('settles collectionP BEFORE closing the client', async () => {
    // Ordering is the whole fix: close-then-await would still interrupt the
    // in-flight createIndex and still leave the rejection unhandled.
    const order = [];
    const store = {
      collectionP: new Promise((resolve) => setTimeout(() => {
        order.push('collectionP');
        resolve({});
      }, 10)),
      close: async () => { order.push('close'); },
    };

    await closeSessionStore(store);
    expect(order).toEqual(['collectionP', 'close']);
  });

  test('a rejecting collectionP never escapes as an unhandled rejection', async () => {
    const escaped = [];
    const onUnhandled = (err) => escaped.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
      const store = {
        // Exactly what connect-mongo leaves behind when close() interrupts the
        // constructor's in-flight createIndex.
        collectionP: Promise.reject(closedClientError()),
        close: async () => {},
      };

      await closeSessionStore(store);
      // Unhandled rejections fire at the end of a turn — give them one.
      await new Promise((resolve) => setImmediate(resolve));

      expect(escaped).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  test('a rejecting close() is swallowed too', async () => {
    const store = {
      collectionP: Promise.resolve({}),
      close: async () => { throw closedClientError(); },
    };
    await expect(closeSessionStore(store)).resolves.toBeUndefined();
  });

  test('tolerates a missing store, and a store without collectionP', async () => {
    // collectionP is an instance property, not documented API — if a future
    // connect-mongo renames it the helper must degrade to the old behaviour,
    // not throw and take the suite down a different way.
    await expect(closeSessionStore(undefined)).resolves.toBeUndefined();
    await expect(closeSessionStore(null)).resolves.toBeUndefined();

    let closed = false;
    await closeSessionStore({ close: async () => { closed = true; } });
    expect(closed).toBe(true);

    await expect(closeSessionStore({ collectionP: Promise.resolve({}) })).resolves.toBeUndefined();
  });
});

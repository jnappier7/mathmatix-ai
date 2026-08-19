// Deploy-time 502 regression guard.
//
// Both edges of a Render deploy served 502s, and both come down to one
// question this module answers: is this instance in rotation right now?
// The rules below are the load-balancer contract — breaking any of them
// silently restores the 502 burst on the next deploy.

const lifecycle = require('../../utils/lifecycle');

describe('lifecycle state machine', () => {
  beforeEach(() => lifecycle._reset());

  it('starts in STARTING and refuses traffic', () => {
    // The port is bound before Mongo connects. If this reported ready, Render
    // would route to an instance whose session store has no connection.
    expect(lifecycle.getState()).toBe('starting');
    expect(lifecycle.isAcceptingTraffic()).toBe(false);
  });

  it('accepts traffic only once markReady() runs', () => {
    lifecycle.markReady();
    expect(lifecycle.getState()).toBe('ready');
    expect(lifecycle.isAcceptingTraffic()).toBe(true);
  });

  it('refuses traffic while draining', () => {
    lifecycle.markReady();
    lifecycle.markDraining();
    expect(lifecycle.getState()).toBe('draining');
    expect(lifecycle.isAcceptingTraffic()).toBe(false);
  });

  it('does not let a late DB reconnect pull a draining instance back into rotation', () => {
    // mongoose auto-reconnects, and connectDatabase()'s .then() calls
    // markReady(). If that could fire during shutdown we would re-enter
    // rotation moments before closing the server — a 502 by construction.
    lifecycle.markReady();
    lifecycle.markDraining();
    lifecycle.markReady();
    expect(lifecycle.getState()).toBe('draining');
    expect(lifecycle.isAcceptingTraffic()).toBe(false);
  });

  it('never resurrects a draining instance, even on repeated signals', () => {
    lifecycle.markDraining();
    lifecycle.markDraining();
    lifecycle.markReady();
    expect(lifecycle.getState()).toBe('draining');
  });

  it('is idempotent on repeated markReady()', () => {
    lifecycle.markReady();
    lifecycle.markReady();
    expect(lifecycle.getState()).toBe('ready');
  });
});

describe('config/database marks readiness on connect', () => {
  // The whole boot half of the fix rests on connectDatabase() calling
  // markReady(). A refactor that drops it would leave the instance reporting
  // 503 forever and fail every deploy — pin the wiring, not just the module.
  it('calls markReady() after a successful connection', async () => {
    jest.resetModules();
    const mongoose = require('mongoose');
    jest.spyOn(mongoose, 'connect').mockResolvedValue();
    const fresh = require('../../utils/lifecycle');
    fresh._reset();

    await require('../../config/database').connectDatabase();

    expect(fresh.getState()).toBe('ready');
    mongoose.connect.mockRestore();
  });
});

/**
 * sseKeepalive — heartbeat writer for SSE responses.
 *
 * The bug this guards: proxies between Express and the browser
 * (Cloudflare, Render's edge, corporate routers) silently drop
 * SSE connections that go ~15-60s without bytes. The server
 * eventually writes the response, but the socket is already
 * dead, and the client's "thinking…" indicator spins forever.
 *
 * The helper writes ": ping\n\n" — an SSE comment, ignored by
 * the EventSource / hand-rolled fetch parser — on a fixed
 * cadence so the connection stays visibly alive.
 */

const { createKeepalive, KEEPALIVE_LINE, DEFAULT_INTERVAL_MS } = require('../../utils/sseKeepalive');

function makeFakeRes() {
  const res = {
    writes: [],
    writableEnded: false,
    writableFinished: false,
    destroyed: false,
    throwOnWrite: false,
    write(chunk) {
      if (this.throwOnWrite) throw new Error('EPIPE');
      this.writes.push(chunk);
      return true;
    },
  };
  return res;
}

// Manual clock + scheduler so tests don't rely on real timers.
function makeFakeScheduler() {
  let nextId = 1;
  const timers = new Map();
  const scheduler = (fn, ms) => {
    const id = { _id: nextId++, fn, ms, ticks: 0, unref: () => { id.unrefed = true; } };
    timers.set(id._id, id);
    return id;
  };
  const canceler = (id) => { if (id && id._id) timers.delete(id._id); };
  return {
    setInterval: scheduler,
    clearInterval: canceler,
    tick(id) {
      const t = timers.get(id._id);
      if (t) {
        t.ticks++;
        t.fn();
      }
    },
    has(id) { return timers.has(id._id); },
  };
}

describe('sseKeepalive — exports', () => {
  test('KEEPALIVE_LINE is the SSE comment "ping" form (parser ignores it)', () => {
    expect(KEEPALIVE_LINE).toBe(': ping\n\n');
  });

  test('DEFAULT_INTERVAL_MS is 15 seconds (well below typical proxy idle thresholds)', () => {
    expect(DEFAULT_INTERVAL_MS).toBe(15 * 1000);
  });
});

describe('sseKeepalive — start / stop lifecycle', () => {
  test('start() schedules an interval; stop() clears it', () => {
    const res = makeFakeRes();
    const sched = makeFakeScheduler();
    const ka = createKeepalive(res, {
      intervalMs: 15000,
      setInterval: sched.setInterval,
      clearInterval: sched.clearInterval,
    });
    expect(ka.isRunning()).toBe(false);
    ka.start();
    expect(ka.isRunning()).toBe(true);
    ka.stop();
    expect(ka.isRunning()).toBe(false);
  });

  test('start() is idempotent — a second call is a no-op (no double scheduling)', () => {
    const res = makeFakeRes();
    const sched = makeFakeScheduler();
    let scheduleCalls = 0;
    const wrappedScheduler = (fn, ms) => { scheduleCalls++; return sched.setInterval(fn, ms); };
    const ka = createKeepalive(res, {
      setInterval: wrappedScheduler,
      clearInterval: sched.clearInterval,
    });
    ka.start();
    ka.start();
    ka.start();
    expect(scheduleCalls).toBe(1);
  });

  test('stop() is idempotent — calling twice does not throw', () => {
    const res = makeFakeRes();
    const ka = createKeepalive(res);
    ka.start();
    ka.stop();
    expect(() => ka.stop()).not.toThrow();
  });

  test('start() after stop() is a no-op (cannot resurrect a stopped keepalive)', () => {
    const res = makeFakeRes();
    const sched = makeFakeScheduler();
    const ka = createKeepalive(res, {
      setInterval: sched.setInterval,
      clearInterval: sched.clearInterval,
    });
    ka.start();
    ka.stop();
    ka.start();
    expect(ka.isRunning()).toBe(false);
  });
});

describe('sseKeepalive — emission', () => {
  test('each tick writes one ": ping\\n\\n" line', () => {
    const res = makeFakeRes();
    const sched = makeFakeScheduler();
    const ka = createKeepalive(res, {
      setInterval: sched.setInterval,
      clearInterval: sched.clearInterval,
    });
    ka.start();
    const timerId = res; // unused — we need the id, grab from the scheduler's map
    // Find the registered timer (only one exists)
    let id;
    sched.has = sched.has.bind(sched);
    // Tick by calling each registered timer's fn.
    // We don't expose them publicly, so do it via reflection: the
    // scheduler returned IDs synchronously; we can capture them by
    // wrapping setInterval. Re-do the build:

    // Recreate cleanly with capture.
    const res2 = makeFakeRes();
    let capturedTimer = null;
    const captureScheduler = (fn, ms) => {
      capturedTimer = { _id: 1, fn, ticks: 0, unref: () => {} };
      return capturedTimer;
    };
    const ka2 = createKeepalive(res2, {
      setInterval: captureScheduler,
      clearInterval: () => { capturedTimer = null; },
    });
    ka2.start();
    capturedTimer.fn();
    expect(res2.writes).toEqual([': ping\n\n']);
    capturedTimer.fn();
    capturedTimer.fn();
    expect(res2.writes).toEqual([': ping\n\n', ': ping\n\n', ': ping\n\n']);
    expect(ka2.beatCount()).toBe(3);
  });

  test('skips writes when res.writableEnded (response already finished)', () => {
    const res = makeFakeRes();
    let capturedTimer = null;
    const ka = createKeepalive(res, {
      setInterval: (fn) => { capturedTimer = { _id: 1, fn, unref: () => {} }; return capturedTimer; },
      clearInterval: () => { capturedTimer = null; },
    });
    ka.start();
    res.writableEnded = true;
    capturedTimer.fn();
    expect(res.writes).toHaveLength(0);
    // And it self-stopped:
    expect(ka.isRunning()).toBe(false);
  });

  test('skips writes when res.destroyed', () => {
    const res = makeFakeRes();
    let capturedTimer = null;
    const ka = createKeepalive(res, {
      setInterval: (fn) => { capturedTimer = { _id: 1, fn, unref: () => {} }; return capturedTimer; },
      clearInterval: () => { capturedTimer = null; },
    });
    ka.start();
    res.destroyed = true;
    capturedTimer.fn();
    expect(res.writes).toHaveLength(0);
    expect(ka.isRunning()).toBe(false);
  });

  test('catches write errors (e.g. broken pipe) and stops cleanly', () => {
    const res = makeFakeRes();
    res.throwOnWrite = true;
    let capturedTimer = null;
    const ka = createKeepalive(res, {
      setInterval: (fn) => { capturedTimer = { _id: 1, fn, unref: () => {} }; return capturedTimer; },
      clearInterval: () => { capturedTimer = null; },
    });
    ka.start();
    expect(() => capturedTimer.fn()).not.toThrow();
    // After the throw, the keepalive should have stopped itself:
    expect(ka.isRunning()).toBe(false);
  });

  test('beatCount() reflects only successful writes', () => {
    const res = makeFakeRes();
    let capturedTimer = null;
    const ka = createKeepalive(res, {
      setInterval: (fn) => { capturedTimer = { _id: 1, fn, unref: () => {} }; return capturedTimer; },
      clearInterval: () => { capturedTimer = null; },
    });
    ka.start();
    capturedTimer.fn();
    capturedTimer.fn();
    expect(ka.beatCount()).toBe(2);
    res.writableEnded = true;
    capturedTimer.fn(); // should NOT count
    expect(ka.beatCount()).toBe(2);
  });
});

describe('sseKeepalive — timer.unref()', () => {
  test('calls unref() on the timer so it never keeps the event loop alive', () => {
    const res = makeFakeRes();
    let unrefed = false;
    const ka = createKeepalive(res, {
      setInterval: () => ({ _id: 1, fn: () => {}, unref: () => { unrefed = true; } }),
      clearInterval: () => {},
    });
    ka.start();
    expect(unrefed).toBe(true);
  });

  test('does not throw if the timer object has no unref method', () => {
    const res = makeFakeRes();
    const ka = createKeepalive(res, {
      setInterval: () => ({ _id: 1, fn: () => {} }), // no unref
      clearInterval: () => {},
    });
    expect(() => ka.start()).not.toThrow();
  });
});

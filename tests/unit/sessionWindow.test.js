/**
 * The 30-minute session boundary.
 *
 * Before this there was NO inactivity boundary: the active conversation is
 * chosen by `isActive: true` and dataRetention only archives after 12 months, so
 * one conversation stayed open forever and resumed whenever the student came
 * back. A beta tester hit it as an apparently-fabricated "½" turn they never
 * sent — really a turn from a previous session, sitting above the new greeting
 * and read by the tutor as present context.
 */

const { SESSION_IDLE_MS, isSessionStale, touchSession } = require('../../utils/sessionWindow');

const NOW = new Date('2026-07-21T12:00:00Z').getTime();
const minutesAgo = (m) => new Date(NOW - m * 60 * 1000);

describe('the window', () => {
  test('is 30 minutes', () => {
    expect(SESSION_IDLE_MS).toBe(30 * 60 * 1000);
  });
});

describe('isSessionStale', () => {
  test('a conversation active a minute ago is not stale', () => {
    expect(isSessionStale({ lastActivity: minutesAgo(1) }, NOW)).toBe(false);
  });

  test('a mid-problem pause of 25 minutes survives', () => {
    // A bathroom break or a phone call must not cost a student their context.
    expect(isSessionStale({ lastActivity: minutesAgo(25) }, NOW)).toBe(false);
  });

  test('just under the boundary is still the same session', () => {
    expect(isSessionStale({ lastActivity: minutesAgo(29.9) }, NOW)).toBe(false);
  });

  test('past 30 minutes is a new session', () => {
    expect(isSessionStale({ lastActivity: minutesAgo(31) }, NOW)).toBe(true);
  });

  test('yesterday is never the same session', () => {
    expect(isSessionStale({ lastActivity: minutesAgo(60 * 24) }, NOW)).toBe(true);
  });
});

describe('missing data is handled conservatively', () => {
  test('a null conversation is not stale', () => {
    expect(isSessionStale(null, NOW)).toBe(false);
  });

  test('no timestamp at all is NOT treated as stale', () => {
    // Rolling a live session by mistake loses the student's working context
    // mid-problem, which is worse than carrying one stale session forward.
    expect(isSessionStale({}, NOW)).toBe(false);
  });

  test('an unparseable timestamp is not treated as stale', () => {
    expect(isSessionStale({ lastActivity: 'not a date' }, NOW)).toBe(false);
  });

  test('falls back to updatedAt, then createdAt', () => {
    expect(isSessionStale({ updatedAt: minutesAgo(45) }, NOW)).toBe(true);
    expect(isSessionStale({ createdAt: minutesAgo(45) }, NOW)).toBe(true);
    // lastActivity wins when several are present
    expect(isSessionStale({ lastActivity: minutesAgo(2), createdAt: minutesAgo(600) }, NOW)).toBe(false);
  });
});

describe('touchSession', () => {
  test('stamps the conversation as live now', () => {
    const convo = { lastActivity: minutesAgo(90) };
    touchSession(convo, new Date(NOW));
    expect(isSessionStale(convo, NOW)).toBe(false);
  });

  test('a touched session survives the next request', () => {
    // The regression that matters: without a per-turn stamp, lastActivity stayed
    // at creation time and a busy session would roll 30 minutes after it began.
    const convo = { createdAt: minutesAgo(200) };
    expect(isSessionStale(convo, NOW)).toBe(true);
    touchSession(convo, new Date(NOW));
    expect(isSessionStale(convo, NOW)).toBe(false);
  });

  test('is safe on a null conversation', () => {
    expect(() => touchSession(null)).not.toThrow();
  });
});

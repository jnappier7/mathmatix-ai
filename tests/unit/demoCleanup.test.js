/**
 * Demo clone scheduler — unit tests
 *
 * Background: expired demo clones used to leak in the DB until the next
 * demo login triggered the opportunistic sweep. The new scheduler runs
 * the sweep on a fixed interval regardless of traffic. These tests pin
 * the scheduler's contract: it returns a stop handle, doesn't keep the
 * event loop alive, and the immediate startup tick is delayed by the
 * configured startupDelayMs.
 */

// Mock the modules that would otherwise pull in mongoose / OpenAI at
// require time. We only care about the scheduler wiring.
jest.mock('../../models/user', () => ({ find: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../../models/conversation', () => ({ deleteMany: jest.fn() }));
jest.mock('../../models/enrollmentCode', () => ({ deleteMany: jest.fn() }));
jest.mock('../../utils/demoData', () => ({
  DEMO_IDS: {},
  DEMO_PASSWORD: 'x',
  teacherRivera: {}, isCooper: {}, parentChen: {},
  studentMaya: {}, studentAlex: {}, studentJordan: {},
  teacherForChenKids: {}, mockStudents: [],
  enrollmentCode: {}, enrollmentCodeIS: {},
  buildConversations: () => [],
  DEMO_PROFILES: {},
}));

const { scheduleDemoCleanup, cleanupExpiredClones } = require('../../utils/demoClone');
const User = require('../../models/user');

describe('scheduleDemoCleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    User.find.mockReset();
    User.deleteMany.mockReset();
    // User.find(...).lean() — return a chainable stub that resolves to [].
    User.find.mockReturnValue({ lean: () => Promise.resolve([]) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns a handle with a stop() function', () => {
    const handle = scheduleDemoCleanup({ intervalMs: 1000, startupDelayMs: 100 });
    expect(handle).toBeDefined();
    expect(typeof handle.stop).toBe('function');
    handle.stop();
  });

  test('does not run the sweep before startupDelayMs elapses', () => {
    const handle = scheduleDemoCleanup({ intervalMs: 1000, startupDelayMs: 500 });
    expect(User.find).not.toHaveBeenCalled();
    handle.stop();
  });

  test('runs the sweep after startupDelayMs', async () => {
    const handle = scheduleDemoCleanup({ intervalMs: 60000, startupDelayMs: 100 });
    jest.advanceTimersByTime(150);
    // The setTimeout callback is async — flush microtasks.
    await Promise.resolve();
    expect(User.find).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  test('runs on the recurring interval', async () => {
    const handle = scheduleDemoCleanup({ intervalMs: 1000, startupDelayMs: 100 });
    jest.advanceTimersByTime(150); // Startup
    await Promise.resolve();
    jest.advanceTimersByTime(1000); // First interval
    await Promise.resolve();
    jest.advanceTimersByTime(1000); // Second interval
    await Promise.resolve();
    expect(User.find.mock.calls.length).toBeGreaterThanOrEqual(3);
    handle.stop();
  });

  test('stop() prevents further sweeps', async () => {
    const handle = scheduleDemoCleanup({ intervalMs: 1000, startupDelayMs: 100 });
    jest.advanceTimersByTime(150);
    await Promise.resolve();
    const callsBefore = User.find.mock.calls.length;
    handle.stop();
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(User.find.mock.calls.length).toBe(callsBefore);
  });

});

describe('cleanupExpiredClones', () => {
  beforeEach(() => {
    User.find.mockReset();
    User.deleteMany.mockReset();
  });

  test('returns 0 when nothing is expired', async () => {
    User.find.mockReturnValue({ lean: () => Promise.resolve([]) });
    const removed = await cleanupExpiredClones();
    expect(removed).toBe(0);
    expect(User.deleteMany).not.toHaveBeenCalled();
  });
});

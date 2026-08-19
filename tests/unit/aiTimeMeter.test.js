// tests/unit/aiTimeMeter.test.js
// Unit tests for the shared AI-time meter — the one place AI seconds are
// charged. Text tutoring, voice sessions, and read-aloud all spend through it,
// so a drift here silently mis-bills every AI surface at once.

jest.mock('../../models/user');

const User = require('../../models/user');
const {
  FREE_WEEKLY_SECONDS,
  FREE_QUOTA_RESET_DAYS,
  isResetPending,
  usedAiSeconds,
  packSecondsRemaining,
  remainingAiSeconds,
  meterAiSeconds,
} = require('../../utils/aiTimeMeter');

const DAY_MS = 24 * 60 * 60 * 1000;

function student(overrides = {}) {
  return {
    _id: 'student123',
    subscriptionTier: 'free',
    weeklyAISeconds: 0,
    lastAIQuotaReset: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
});

describe('quota window', () => {
  test('a fresh window counts the seconds already spent', () => {
    const user = student({ weeklyAISeconds: 600 });
    expect(isResetPending(user)).toBe(false);
    expect(usedAiSeconds(user)).toBe(600);
    expect(remainingAiSeconds(user)).toBe(FREE_WEEKLY_SECONDS - 600);
  });

  test('a lapsed window reads as zero spent even before anything writes the reset', () => {
    // The HTTP path resets in usageGate, but a voice WebSocket upgrade never
    // runs the Express chain — the meter has to see the rollover itself.
    const user = student({
      weeklyAISeconds: FREE_WEEKLY_SECONDS,
      lastAIQuotaReset: new Date(Date.now() - (FREE_QUOTA_RESET_DAYS + 1) * DAY_MS),
    });
    expect(isResetPending(user)).toBe(true);
    expect(usedAiSeconds(user)).toBe(0);
    expect(remainingAiSeconds(user)).toBe(FREE_WEEKLY_SECONDS);
  });

  test('charging into a lapsed window $sets the new total instead of $inc-ing a stale one', async () => {
    const user = student({
      weeklyAISeconds: FREE_WEEKLY_SECONDS,
      lastAIQuotaReset: new Date(Date.now() - (FREE_QUOTA_RESET_DAYS + 1) * DAY_MS),
    });
    const result = await meterAiSeconds(user, 45);

    const update = User.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set.weeklyAISeconds).toBe(45);
    expect(update.$set.lastAIQuotaReset).toBeInstanceOf(Date);
    expect(update.$inc.weeklyAISeconds).toBeUndefined();
    expect(update.$inc.totalAISeconds).toBe(45);
    expect(result.usedSeconds).toBe(45);
  });
});

describe('meterAiSeconds', () => {
  test('charges the pool atomically and reports the new balance', async () => {
    const user = student({ weeklyAISeconds: 300 });
    const result = await meterAiSeconds(user, 60);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('student123', {
      $inc: { weeklyAISeconds: 60, totalAISeconds: 60 },
    });
    expect(result.billedSeconds).toBe(60);
    expect(result.usedSeconds).toBe(360);
    expect(result.remainingSeconds).toBe(FREE_WEEKLY_SECONDS - 360);
  });

  test('mutates the passed user so a long-lived session stays accurate without re-fetching', async () => {
    // A voice session charges every 30s off one in-memory user doc; if the
    // local mirror didn't advance, every flush would re-read the same balance
    // and the mid-call cutoff would never fire.
    const user = student();
    await meterAiSeconds(user, 100);
    await meterAiSeconds(user, 100);
    expect(user.weeklyAISeconds).toBe(200);
  });

  test('rounds fractional seconds (voice accrues in fractions of a sample)', async () => {
    const user = student();
    const result = await meterAiSeconds(user, 12.6);
    expect(result.billedSeconds).toBe(13);
  });

  test('is a no-op for zero or negative seconds', async () => {
    const user = student({ weeklyAISeconds: 120 });
    const result = await meterAiSeconds(user, 0);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(result.billedSeconds).toBe(0);
    expect(result.remainingSeconds).toBe(FREE_WEEKLY_SECONDS - 120);
  });

  test('a failed write never throws at the caller', async () => {
    // Metering must not be able to kill a tutor turn or a live voice call.
    User.findByIdAndUpdate = jest.fn().mockRejectedValue(new Error('mongo down'));
    const user = student();
    await expect(meterAiSeconds(user, 30)).resolves.toMatchObject({ billedSeconds: 30 });
  });
});

describe('legacy minute packs', () => {
  test('an active pack adds to the balance', () => {
    const user = student({
      subscriptionTier: 'pack_60',
      packSecondsRemaining: 1800,
      packExpiresAt: new Date(Date.now() + 30 * DAY_MS),
    });
    expect(packSecondsRemaining(user)).toBe(1800);
    expect(remainingAiSeconds(user)).toBe(FREE_WEEKLY_SECONDS + 1800);
  });

  test('an expired pack contributes nothing', () => {
    const user = student({
      subscriptionTier: 'pack_60',
      packSecondsRemaining: 1800,
      packExpiresAt: new Date(Date.now() - DAY_MS),
    });
    expect(packSecondsRemaining(user)).toBe(0);
    expect(remainingAiSeconds(user)).toBe(FREE_WEEKLY_SECONDS);
  });

  test('only the seconds past the free tier draw down the pack', async () => {
    // 60s left of free time, charged 100s → 40s is paid time.
    const user = student({
      subscriptionTier: 'pack_60',
      weeklyAISeconds: FREE_WEEKLY_SECONDS - 60,
      packSecondsRemaining: 1800,
      packExpiresAt: new Date(Date.now() + 30 * DAY_MS),
    });
    await meterAiSeconds(user, 100);

    const update = User.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$inc.packSecondsRemaining).toBe(-40);
    expect(user.packSecondsRemaining).toBe(1760);
  });

  test('a charge entirely inside the free tier leaves the pack alone', async () => {
    const user = student({
      subscriptionTier: 'pack_60',
      weeklyAISeconds: 0,
      packSecondsRemaining: 1800,
      packExpiresAt: new Date(Date.now() + 30 * DAY_MS),
    });
    await meterAiSeconds(user, 60);

    const update = User.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$inc.packSecondsRemaining).toBeUndefined();
    expect(user.packSecondsRemaining).toBe(1800);
  });

  test('voice seconds draw the pack down too', async () => {
    // Voice used to write its own $inc that skipped the pack entirely, so a
    // pack subscriber's voice minutes inflated the meter without ever
    // consuming the minutes they had paid for. Same meter now, same drawdown.
    const user = student({
      subscriptionTier: 'pack_120',
      weeklyAISeconds: FREE_WEEKLY_SECONDS + 100,
      packSecondsRemaining: 600,
      packExpiresAt: new Date(Date.now() + 30 * DAY_MS),
    });
    await meterAiSeconds(user, 90);

    const update = User.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$inc.packSecondsRemaining).toBe(-90);
  });
});

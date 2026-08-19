// tests/unit/voiceSessionMetering.test.js
// Voice is open to every 13+ student and spends the same monthly AI-minute
// pool as text tutoring. The session used to meter ONLY at hang-up, which was
// harmless while voice was premium-only and is not harmless now: the gate runs
// at connect, so a student with ten seconds left could talk for an hour and
// nothing would debit until they disconnected. These tests pin the in-flight
// meter and the mid-call cutoff.

jest.mock('../../utils/aiTimeMeter', () => ({
    meterAiSeconds: jest.fn(),
    remainingAiSeconds: jest.fn(),
}));

const { meterAiSeconds, remainingAiSeconds } = require('../../utils/aiTimeMeter');
const { VoiceSession } = require('../../utils/voiceSession');

const flush = VoiceSession.prototype._flushMeter;
const accrued = VoiceSession.prototype._accruedSeconds;

// A minimal stand-in for a live session: the metering methods only read the
// vendor-usage counters and _unmetered, so building a real session (ws, STT,
// TTS pool, LLM) would test the mocks, not the meter.
function session(overrides = {}) {
    return {
        userId: 'student123',
        user: { _id: 'student123' },
        _sttBilledTotal: 0,
        stt: null,
        _ttsSamples: 0,
        _ttsSampleRate: 0,
        _llmLatencyMs: 0,
        _meteredSeconds: 0,
        _unmetered: false,
        _lowBalanceWarned: false,
        _send: jest.fn(),
        shutdown: jest.fn(),
        _accruedSeconds: accrued,
        ...overrides,
    };
}

/** Give the session `n` seconds of accrued vendor usage. */
function accrue(s, n) {
    s._sttBilledTotal = n;
}

beforeEach(() => {
    jest.clearAllMocks();
    meterAiSeconds.mockImplementation(async (_user, seconds) => ({
        billedSeconds: Math.round(seconds),
        usedSeconds: 0,
        remainingSeconds: 600,
    }));
    remainingAiSeconds.mockReturnValue(600);
});

describe('_accruedSeconds', () => {
    test('sums all three paid vendors: STT input, TTS playback, LLM latency', () => {
        const s = session({
            _sttBilledTotal: 30,
            stt: { billedSeconds: 12 },
            _ttsSamples: 44100,
            _ttsSampleRate: 22050, // 2 seconds of playback
            _llmLatencyMs: 1500,
        });
        expect(accrued.call(s)).toBeCloseTo(45.5);
    });
});

describe('_flushMeter', () => {
    test('charges only what has accrued since the last flush', async () => {
        const s = session();

        accrue(s, 40);
        await flush.call(s);
        expect(meterAiSeconds).toHaveBeenLastCalledWith(s.user, 40);

        accrue(s, 95);
        await flush.call(s);
        expect(meterAiSeconds).toHaveBeenLastCalledWith(s.user, 55);
        expect(meterAiSeconds).toHaveBeenCalledTimes(2);
    });

    test('sub-second deltas are not charged (nothing to bill, no write)', async () => {
        const s = session();
        accrue(s, 0.4);
        await flush.call(s);
        expect(meterAiSeconds).not.toHaveBeenCalled();
    });

    test('ends the call when the balance runs out mid-session', async () => {
        jest.useFakeTimers();
        meterAiSeconds.mockResolvedValue({ billedSeconds: 60, usedSeconds: 1800, remainingSeconds: 0 });
        const s = session();

        accrue(s, 60);
        await flush.call(s);

        // The student is told before the socket goes away — a bare disconnect
        // reads as a bug rather than a limit.
        const sent = s._send.mock.calls[0][0];
        expect(sent.type).toBe('quota_exhausted');
        expect(sent.upgradeRequired).toBe(true);
        expect(sent.message).toEqual(expect.any(String));

        expect(s.shutdown).not.toHaveBeenCalled(); // message needs to land first
        jest.advanceTimersByTime(300);
        expect(s.shutdown).toHaveBeenCalledWith('quota_exhausted');
        jest.useRealTimers();
    });

    test('warns once as the balance gets low, not on every flush', async () => {
        meterAiSeconds.mockResolvedValue({ billedSeconds: 30, usedSeconds: 1700, remainingSeconds: 100 });
        const s = session();

        accrue(s, 30);
        await flush.call(s);
        accrue(s, 60);
        await flush.call(s);

        const warnings = s._send.mock.calls.filter(([m]) => m.type === 'quota_low');
        expect(warnings).toHaveLength(1);
        expect(warnings[0][0].secondsRemaining).toBe(100);
        expect(s.shutdown).not.toHaveBeenCalled();
    });

    test('unmetered students are still charged for analytics but never cut off', async () => {
        // School-licensed / unlimited / staff accounts: totalAISeconds is cost
        // analytics for everyone, enforcement applies to no one.
        meterAiSeconds.mockResolvedValue({ billedSeconds: 60, usedSeconds: 99999, remainingSeconds: 0 });
        const s = session({ _unmetered: true });

        accrue(s, 60);
        await flush.call(s);

        expect(meterAiSeconds).toHaveBeenCalledWith(s.user, 60);
        expect(s._send).not.toHaveBeenCalled();
        expect(s.shutdown).not.toHaveBeenCalled();
    });

    test('the final flush charges the remainder without trying to end an ending session', async () => {
        meterAiSeconds.mockResolvedValue({ billedSeconds: 20, usedSeconds: 1800, remainingSeconds: 0 });
        const s = session({ _meteredSeconds: 40 });

        accrue(s, 60);
        await flush.call(s, { final: true });

        expect(meterAiSeconds).toHaveBeenCalledWith(s.user, 20);
        expect(s._send).not.toHaveBeenCalled();
        expect(s.shutdown).not.toHaveBeenCalled();
    });

    test('a final flush with nothing left to charge is harmless', async () => {
        const s = session({ _meteredSeconds: 60 });
        accrue(s, 60);
        await flush.call(s, { final: true });
        expect(meterAiSeconds).not.toHaveBeenCalled();
    });
});

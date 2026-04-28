// tests/unit/sessionService.test.js
// Unit tests for services/sessionService.js — focuses on pure-ish helpers
// (summary builder, mastery save, heartbeat) rather than the heavy endSession
// path which is dominated by I/O and AI calls.

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

jest.mock('../../utils/activitySummarizer', () => ({
  generateSessionSummary: jest.fn().mockResolvedValue('summary'),
  detectTopic: jest.fn().mockReturnValue('algebra'),
  calculateProblemStats: jest.fn().mockReturnValue({ attempted: 0, correct: 0 }),
  detectStruggle: jest.fn().mockReturnValue({ isStruggling: false }),
  generateStudentRecap: jest.fn().mockReturnValue('recap')
}));

jest.mock('../../models/user', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

jest.mock('../../models/conversation', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  deleteMany: jest.fn()
}));

jest.mock('../../models/courseSession', () => ({
  findById: jest.fn()
}));

const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const sessionSvc = require('../../services/sessionService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateSessionSummary', () => {
  test('throws when user is not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(sessionSvc.generateSessionSummary('u1', 'sess-1', {})).rejects.toThrow(/not found/);
  });

  test('builds summary with metrics + accuracy', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', username: 'sam', role: 'student' });

    const summary = await sessionSvc.generateSessionSummary('u1', 'sess-1', {
      duration: 600,
      messagesExchanged: 10,
      problemsAttempted: 8,
      problemsCorrect: 6,
      xpEarned: 120,
      hintsUsed: 1
    });

    expect(summary.userId).toBe('u1');
    expect(summary.sessionId).toBe('sess-1');
    expect(summary.metrics.problemsAttempted).toBe(8);
    expect(summary.metrics.problemsCorrect).toBe(6);
    expect(summary.metrics.accuracy).toBe('75.0');
    expect(summary.endReason).toBe('logout');
    expect(summary.endTime).toBeInstanceOf(Date);
  });

  test('omits accuracy when no problems attempted', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', username: 'sam', role: 'student' });
    const summary = await sessionSvc.generateSessionSummary('u1', 's', { problemsAttempted: 0 });
    expect(summary.metrics.accuracy).toBeUndefined();
  });

  test('uses provided endReason', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', username: 'sam', role: 'student' });
    const s = await sessionSvc.generateSessionSummary('u1', 's', { endReason: 'timeout' });
    expect(s.endReason).toBe('timeout');
  });
});

describe('saveMasteryProgress', () => {
  test('returns false (not throws) when user is missing', async () => {
    // The source catches the "User not found" throw and returns false.
    User.findById.mockResolvedValue(null);
    expect(await sessionSvc.saveMasteryProgress('u1', {})).toBe(false);
  });

  test('catches DB errors and returns false', async () => {
    User.findById.mockRejectedValue(new Error('db'));
    expect(await sessionSvc.saveMasteryProgress('u1', {})).toBe(false);
  });

  test('persists activeBadge and a lastUpdated timestamp', async () => {
    const fakeUser = {
      activeMasteryConversationId: null,
      save: jest.fn().mockResolvedValue()
    };
    User.findById.mockResolvedValue(fakeUser);

    const result = await sessionSvc.saveMasteryProgress('u1', {
      activeBadge: { badgeId: 'b1', progress: 50 }
    });

    expect(result).toBe(true);
    expect(fakeUser.masteryProgress.activeBadge).toEqual({ badgeId: 'b1', progress: 50 });
    expect(fakeUser.masteryProgress.lastUpdated).toBeInstanceOf(Date);
    expect(fakeUser.save).toHaveBeenCalled();
  });

  test('persists conversation state when activeMasteryConversationId is set', async () => {
    const fakeConvo = { masteryState: null, save: jest.fn().mockResolvedValue() };
    Conversation.findById.mockResolvedValue(fakeConvo);
    const fakeUser = {
      activeMasteryConversationId: 'cv-1',
      save: jest.fn().mockResolvedValue()
    };
    User.findById.mockResolvedValue(fakeUser);

    await sessionSvc.saveMasteryProgress('u1', {
      activeBadge: { badgeId: 'b1' },
      conversationState: { step: 3 }
    });

    expect(fakeConvo.masteryState).toEqual({ step: 3 });
    expect(fakeConvo.save).toHaveBeenCalled();
  });
});

describe('recordHeartbeat', () => {
  test('returns success object on hit', async () => {
    User.findByIdAndUpdate.mockResolvedValue({ _id: 'u1' });
    const r = await sessionSvc.recordHeartbeat('u1', 'sess-1');
    expect(r.success).toBe(true);
    expect(r.sessionId).toBe('sess-1');
    expect(r.timeUntilTimeout).toBeGreaterThan(0);
  });

  test('returns error when user is missing', async () => {
    User.findByIdAndUpdate.mockResolvedValue(null);
    const r = await sessionSvc.recordHeartbeat('missing', 'sess-1');
    expect(r.error).toMatch(/not found/);
  });

  test('returns error on DB exception', async () => {
    User.findByIdAndUpdate.mockRejectedValue(new Error('db down'));
    const r = await sessionSvc.recordHeartbeat('u1', 'sess-1');
    expect(r.error).toBe('db down');
  });
});

/**
 * Daily quests count all day — in the STUDENT's day (2026-11-26).
 *
 * Owner: "The daily quests don't seem to count." The pipeline decided "is it a
 * new day?" with the SERVER's clock (UTC on Render) and, when it thought so,
 * returned without counting. The quests endpoint decides with the student's
 * timezone. For a student in New York the two disagree from 7 PM to midnight
 * every day: the endpoint never issues new quests (same local day) and the
 * pipeline counts nothing (new UTC day). Homework hours.
 */
const { emitGamificationEvent } = require('../../utils/gamificationEvents');

function student(overrides = {}) {
  return Object.assign({
    level: 1,
    timezone: 'America/New_York',
    xp: 0,
    dailyQuests: {
      quests: [
        { id: 'q1', templateId: 'problemSolver', name: 'Problem Solver', target: 'problemsCorrect', targetCount: 5, progress: 0, completed: false, xpReward: 50, bonusMultiplier: 1 },
      ],
      // Quests dealt at 4 PM Eastern on Nov 25.
      lastRefreshDate: new Date('2026-11-25T21:00:00Z'),
      lastPracticeDate: new Date('2026-11-25T21:00:00Z'),
      currentStreak: 3, longestStreak: 3, totalQuestsCompleted: 0, todayProgress: {},
    },
    weeklyChallenges: null,
    markModified() {},
  }, overrides);
}

afterEach(() => { jest.useRealTimers(); });

describe('a correct answer in the evening counts', () => {
  test('7:30 PM Eastern — already tomorrow in UTC — the quest still moves', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-26T00:30:00Z'));
    const user = student();
    emitGamificationEvent(user, 'problemSolved', { correct: true, firstTry: true });
    expect(user.dailyQuests.quests[0].progress).toBe(1);
    // …and it is the SAME set of quests: nothing was reissued mid-evening.
    expect(user.dailyQuests.quests[0].id).toBe('q1');
    expect(new Date(user.dailyQuests.lastRefreshDate).toISOString()).toBe('2026-11-25T21:00:00.000Z');
  });

  test('11:55 PM Eastern, five in a row: all five count and the quest completes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-26T04:55:00Z'));
    const user = student();
    for (let i = 0; i < 5; i++) emitGamificationEvent(user, 'problemSolved', { correct: true });
    expect(user.dailyQuests.quests[0].progress).toBe(5);
    expect(user.dailyQuests.quests[0].completed).toBe(true);
  });

  test('the pipeline and the quests endpoint agree on what "today" is', () => {
    const fs = require('fs');
    const path = require('path');
    const events = fs.readFileSync(path.join(__dirname, '../../utils/gamificationEvents.js'), 'utf8');
    // The server's own calendar must not come back.
    expect(events).not.toMatch(/toDateString\(\)\s*!==/);
    expect(events).toMatch(/shouldRefreshDailyQuests\(user\.dailyQuests\.lastRefreshDate, user\.timezone\)/);
  });
});

describe('a new local day deals new quests in the pipeline, and the first answer counts', () => {
  test('9 AM Eastern the next morning, before the page has asked for today\'s quests', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-26T14:00:00Z'));
    const user = student();
    emitGamificationEvent(user, 'problemSolved', { correct: true, firstTry: true });

    const quests = user.dailyQuests.quests;
    expect(quests.length).toBeGreaterThanOrEqual(3);
    expect(quests.some((q) => q.id === 'q1')).toBe(false);          // yesterday's set is gone
    expect(new Date(user.dailyQuests.lastRefreshDate).toISOString()).toBe('2026-11-26T14:00:00.000Z');
    // The streak quest is in every day's set and completes on any activity —
    // so the very first turn of the day shows up on the board.
    const streak = quests.find((q) => q.target === 'dailyPractice');
    expect(streak.progress).toBeGreaterThanOrEqual(1);
    // …and a "solve N correctly" quest, when dealt, has this answer on it.
    const solver = quests.find((q) => q.target === 'problemsCorrect');
    if (solver) expect(solver.progress).toBe(1);
  });

  test('a student with no timezone on file falls back to UTC, same as the endpoint', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-25T23:30:00Z'));
    const user = student({ timezone: undefined });
    emitGamificationEvent(user, 'problemSolved', { correct: true });
    expect(user.dailyQuests.quests[0].id).toBe('q1');
    expect(user.dailyQuests.quests[0].progress).toBe(1);
  });
});

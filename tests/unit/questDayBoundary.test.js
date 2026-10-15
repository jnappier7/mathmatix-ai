// tests/unit/questDayBoundary.test.js
//
// QA handoff 2026-10-14 §3.6. Render runs in UTC, and routes/dailyQuests.js
// drew "today" at server-local midnight — 8 PM Eastern. Witnessed with the real
// functions under TZ=UTC: a 7:00 PM ET practice and an 8:30 PM ET visit the SAME
// evening ticked the streak 1 → 2 and reset the quests (the reporting account's
// quests refreshed at 8:54 PM ET). Day boundaries are the student's now.

jest.mock('../../models/user', () => ({}));
jest.mock('../../middleware/auth', () => ({ isAuthenticated: (_q, _s, n) => n() }));

const fs = require('fs');
const path = require('path');
const { calculateStreak, shouldRefreshQuests } = require('../../routes/dailyQuests').__helpers;

const ET = 'America/New_York';
const at = (iso) => jest.setSystemTime(new Date(iso));
const user = (lastPractice, streak, timezone = ET) => ({ timezone, dailyQuests: { lastPracticeDate: new Date(lastPractice), currentStreak: streak } });

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

describe('the same evening is one day, in the student\'s timezone', () => {
  test('7 PM then 8:30 PM ET: streak stays, quests stay', () => {
    at('2026-10-15T00:30:00Z');                                  // 8:30 PM ET
    expect(calculateStreak(user('2026-10-14T23:00:00Z', 1))).toBe(1);
    expect(shouldRefreshQuests(new Date('2026-10-14T23:00:00Z'), [], ET)).toBe(false);
  });

  test('next morning: streak +1, quests refresh', () => {
    at('2026-10-15T14:00:00Z');                                  // 10 AM ET
    expect(calculateStreak(user('2026-10-14T23:00:00Z', 1))).toBe(2);
    expect(shouldRefreshQuests(new Date('2026-10-14T23:00:00Z'), [], ET)).toBe(true);
  });

  test('two local days later the streak resets', () => {
    at('2026-10-16T14:00:00Z');
    expect(calculateStreak(user('2026-10-14T23:00:00Z', 5))).toBe(1);
  });

  test('no stored timezone falls back to UTC (unchanged behaviour)', () => {
    at('2026-10-15T00:30:00Z');
    expect(calculateStreak(user('2026-10-14T23:00:00Z', 1, null))).toBe(2);
    expect(shouldRefreshQuests(new Date('2026-10-14T23:00:00Z'), [], null)).toBe(true);
  });

  test('no prior refresh always refreshes', () => {
    expect(shouldRefreshQuests(null, [], ET)).toBe(true);
  });
});

describe('quest copy a student can read', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
  test('the status card shows each quest\'s description, escaped', () => {
    const src = read('public/js/modules/statusCard.js');
    expect(src).toMatch(/<div class="sc-quest-desc">\$\{esc\(q\.description\)\}<\/div>/);
    expect(src).toMatch(/\$\{esc\(q\.name \|\| q\.title \|\| q\.type \|\| 'Quest'\)\}/);
    expect(read('public/js/script.js')).toMatch(/import '\.\/modules\/statusCard\.js\?v=\d+';/);
  });
  test('no "θ" in weekly-challenge copy', () => {
    expect(read('routes/weeklyChallenges.js')).not.toMatch(/description: '[^']*θ/);
  });
});

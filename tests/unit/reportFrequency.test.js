/**
 * Parent progress-report cadence (utils/reportFrequency.js) and the digest
 * audience query (scripts/weeklyDigest.js).
 *
 * Bugs this pins:
 *   - 'never' was handled by the cron but not in the enum, so parents could not
 *     turn reports off.
 *   - Every report covered 7 days regardless of frequency.
 *   - biweekly was "1st and 3rd Sundays" (2- and 3-week gaps); it is now a true
 *     14-day cadence off lastWeeklyReportSentAt.
 *   - The digest queried a bare `role: 'parent'`, so a multi-role parent whose
 *     ACTIVE dashboard was something else never got a report (CLAUDE.md §12).
 */

jest.mock('../../models/user', () => ({}));
jest.mock('../../models/conversation', () => ({}));
jest.mock('../../utils/emailService', () => ({ sendParentProgressReport: jest.fn() }));
jest.mock('../../utils/fsrsScheduler', () => ({ calculateRetrievability: jest.fn() }));

const {
  REPORT_FREQUENCIES, shouldSendDigest, windowDaysFor, periodFor,
} = require('../../utils/reportFrequency');
const digest = require('../../scripts/weeklyDigest');

// Local-time constructors: shouldSendDigest reads getDay()/getDate().
const SUN = new Date(2026, 9, 11, 7, 0);   // Sun Oct 11 2026 07:00
const MON = new Date(2026, 9, 12, 7, 0);
const FIRST = new Date(2026, 10, 1, 7, 0); // Sun Nov 1 2026
const daysBefore = (d, n) => new Date(d.getTime() - n * 86400000);
const hoursBefore = (d, n) => new Date(d.getTime() - n * 3600000);

describe('windowDaysFor', () => {
  test('window matches the cadence', () => {
    expect(windowDaysFor('daily')).toBe(1);
    expect(windowDaysFor('weekly')).toBe(7);
    expect(windowDaysFor('biweekly')).toBe(14);
    expect(windowDaysFor('monthly')).toBe(30);
  });
  test('never / missing / unknown fall back to 7', () => {
    expect(windowDaysFor('never')).toBe(7);
    expect(windowDaysFor(undefined)).toBe(7);
    expect(windowDaysFor('hourly')).toBe(7);
  });
  test('period wording follows the cadence', () => {
    expect(periodFor('daily').phrase).toBe('today');
    expect(periodFor('monthly').title).toBe('Monthly');
    expect(periodFor(undefined).title).toBe('Weekly');
  });
});

describe('shouldSendDigest', () => {
  test('never is off — on every day, with or without history', () => {
    for (const now of [SUN, MON, FIRST]) {
      expect(shouldSendDigest('never', now, null)).toBe(false);
      expect(shouldSendDigest('never', now, daysBefore(now, 60))).toBe(false);
    }
  });

  test('daily sends every day, but not twice inside the dedup window', () => {
    expect(shouldSendDigest('daily', MON, null)).toBe(true);
    expect(shouldSendDigest('daily', MON, hoursBefore(MON, 24))).toBe(true);
    expect(shouldSendDigest('daily', MON, hoursBefore(MON, 2))).toBe(false);
  });

  test('weekly sends on Sundays only', () => {
    expect(shouldSendDigest('weekly', SUN, null)).toBe(true);
    expect(shouldSendDigest('weekly', MON, null)).toBe(false);
    expect(shouldSendDigest('weekly', SUN, daysBefore(SUN, 7))).toBe(true);
    expect(shouldSendDigest('weekly', SUN, hoursBefore(SUN, 3))).toBe(false); // cron re-run
  });

  test('missing/unknown frequency behaves as weekly', () => {
    expect(shouldSendDigest(undefined, SUN, null)).toBe(true);
    expect(shouldSendDigest('bogus', MON, null)).toBe(false);
  });

  test('biweekly is a true 14-day cadence on Sundays', () => {
    expect(shouldSendDigest('biweekly', SUN, null)).toBe(true);       // first ever
    expect(shouldSendDigest('biweekly', MON, null)).toBe(false);      // not Sunday
    expect(shouldSendDigest('biweekly', SUN, daysBefore(SUN, 7))).toBe(false);  // 1 week on
    expect(shouldSendDigest('biweekly', SUN, daysBefore(SUN, 14))).toBe(true);  // 2 weeks on
    // cron drift: last week's run 2 weeks ago started an hour later
    expect(shouldSendDigest('biweekly', SUN, new Date(daysBefore(SUN, 14).getTime() + 3600000))).toBe(true);
    expect(shouldSendDigest('biweekly', SUN, daysBefore(SUN, 21))).toBe(true);
  });

  test('biweekly over consecutive Sundays alternates send/skip', () => {
    let last = null;
    const sent = [];
    for (let w = 0; w < 6; w += 1) {
      const now = new Date(SUN.getTime() + w * 7 * 86400000);
      if (shouldSendDigest('biweekly', now, last)) { sent.push(w); last = now; }
    }
    expect(sent).toEqual([0, 2, 4]);
  });

  test('monthly sends on the 1st, never twice in a month', () => {
    expect(shouldSendDigest('monthly', FIRST, null)).toBe(true);
    expect(shouldSendDigest('monthly', SUN, null)).toBe(false);
    expect(shouldSendDigest('monthly', FIRST, daysBefore(FIRST, 31))).toBe(true);
    expect(shouldSendDigest('monthly', FIRST, hoursBefore(FIRST, 1))).toBe(false);
  });

  test('every enum value is handled (no silent default for a real setting)', () => {
    for (const f of REPORT_FREQUENCIES) {
      expect(typeof shouldSendDigest(f, SUN, null)).toBe('boolean');
    }
  });

  test('weeklyDigest.shouldSendReport reads the parent doc fields', () => {
    expect(digest.shouldSendReport({ reportFrequency: 'biweekly', lastWeeklyReportSentAt: daysBefore(SUN, 7) }, SUN)).toBe(false);
    expect(digest.shouldSendReport({ reportFrequency: 'biweekly', lastWeeklyReportSentAt: daysBefore(SUN, 14) }, SUN)).toBe(true);
    expect(digest.shouldSendReport({ reportFrequency: 'never' }, SUN)).toBe(false);
  });
});

describe('User.reportFrequency enum', () => {
  test("includes 'never' and matches REPORT_FREQUENCIES", () => {
    const real = jest.requireActual('../../models/user');
    const values = real.schema.path('reportFrequency').enumValues;
    expect([...values].sort()).toEqual([...REPORT_FREQUENCIES].sort());
  });
});

describe('digest audience query', () => {
  test('matches parents by roles HELD, not the active dashboard', () => {
    const f = digest.digestParentFilter();
    expect(f.role).toBeUndefined();
    expect(f.$or).toEqual([{ roles: 'parent' }, { role: 'parent' }]);
    expect(f.children).toEqual({ $exists: true, $ne: [] });
    expect(f.email).toEqual({ $exists: true, $ne: null });
  });

  test("no bare role: 'parent' query remains in the digest script", () => {
    const src = require('fs').readFileSync(require.resolve('../../scripts/weeklyDigest.js'), 'utf8');
    expect(src).not.toMatch(/role:\s*'parent'/);
  });
});

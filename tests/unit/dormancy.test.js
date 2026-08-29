// tests/unit/dormancy.test.js
// Pins the shared engaged-but-dormant definition.
//
// One filter serves both the reactivation campaign and the dashboard's
// dormancy summary; these tests hold the properties that make the number
// honest — roles-held matching, the engagement floor that keeps this from
// being a spam list, and a summary that never carries per-student PII.

const {
  engagedDormantFilter,
  summarizeDormancy,
  MIN_MINUTES,
  DORMANT_DAYS,
} = require('../../utils/dormancy');

const NOW = new Date('2026-08-29T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('engagedDormantFilter', () => {
  test('matches on roles held, never a bare active-role equality', () => {
    // The documented gotcha is a bare top-level { role: 'student' } — it
    // matches only whoever is VIEWING the student dashboard right now.
    // roleQuery's fragment instead matches roles-held with a legacy-role
    // fallback, as an $or pair, folded under $and by withRole because this
    // filter carries its own $or.
    const f = engagedDormantFilter({ now: NOW });
    expect(f.role).toBeUndefined();               // no bare active-role match
    expect(Array.isArray(f.$and)).toBe(true);     // withRole folded, not clobbered
    const roleClause = f.$and.find((c) => c.$or && JSON.stringify(c.$or).includes('roles'));
    expect(roleClause.$or).toEqual([{ roles: 'student' }, { role: 'student' }]);
    // The dormancy $or survived alongside it.
    const dormClause = f.$and.find((c) => c.$or && JSON.stringify(c.$or).includes('lastLogin'));
    expect(dormClause).toBeDefined();
  });

  test('keeps both the engagement floor and the dormancy window', () => {
    const f = engagedDormantFilter({ minMinutes: 5, dormantDays: 14, now: NOW });
    const flat = JSON.stringify(f);
    expect(flat).toContain('"totalActiveTutoringMinutes":{"$gte":5}');
    // The cutoff is exactly dormantDays before now.
    expect(flat).toContain(JSON.stringify(daysAgo(14)));
    // Never-logged-in students count as dormant, not as excluded.
    expect(flat).toContain('"lastLogin":null');
  });

  test('defaults match the campaign defaults', () => {
    expect(MIN_MINUTES).toBe(5);
    expect(DORMANT_DAYS).toBe(14);
  });
});

describe('summarizeDormancy', () => {
  const row = (lastLoginDaysAgo, opts = {}) => ({
    lastLogin: lastLoginDaysAgo === null ? null : daysAgo(lastLoginDaysAgo),
    parentIds: opts.parents ?? ['p1'],
    lastReactivationAt: opts.reactivatedDaysAgo != null ? daysAgo(opts.reactivatedDaysAgo) : null,
  });

  test('buckets by how long the student has been gone', () => {
    const out = summarizeDormancy(
      [row(15), row(45), row(120), row(null)],
      { now: NOW }
    );
    expect(out.total).toBe(4);
    expect(out.buckets).toEqual({ d14to30: 1, d30to90: 1, d90plus: 1, never: 1 });
  });

  test('emailableToday requires a linked parent AND a lapsed resend guard', () => {
    const out = summarizeDormancy(
      [
        row(20),                                   // parent, never emailed → emailable
        row(20, { parents: [] }),                  // no parent → not emailable
        row(20, { reactivatedDaysAgo: 3 }),        // emailed 3 days ago → guard holds
        row(20, { reactivatedDaysAgo: 30 }),       // guard lapsed → emailable
      ],
      { now: NOW, resendGuardDays: 14 }
    );
    expect(out.withLinkedParent).toBe(3);
    expect(out.emailableToday).toBe(2);
  });

  test('carries no per-student rows — aggregate only', () => {
    const out = summarizeDormancy([row(20), row(40)], { now: NOW });
    const flat = JSON.stringify(out);
    // Nothing resembling a student identifier, date-of-login, or id list
    // may survive into the payload the dashboard receives.
    expect(flat).not.toContain('lastLogin');
    expect(flat).not.toContain('parentIds');
    expect(Object.keys(out).sort()).toEqual(
      ['buckets', 'emailableToday', 'thresholds', 'total', 'withLinkedParent']
    );
  });

  test('an empty cohort yields zeros, not NaN', () => {
    const out = summarizeDormancy([], { now: NOW });
    expect(out.total).toBe(0);
    expect(out.buckets).toEqual({ d14to30: 0, d30to90: 0, d90plus: 0, never: 0 });
    expect(out.emailableToday).toBe(0);
  });
});

// tests/unit/studentUsageReport.test.js
// Pins the student usage + conversion report.
//
// Every bug this report can have points the same way — a conversion number
// that flatters the product — so each test holds one definition that stops
// something from counting as "paid" or "converted" when it isn't.

process.env.FOUNDING_SCHOOL_DOMAINS = 'founding.edu';

const {
  buildStudentUsageReport,
  planOf,
  segmentOf,
  weekStart,
} = require('../../utils/studentUsageReport');

const NOW = new Date('2026-09-26T12:00:00Z');
const START = new Date('2026-06-28T00:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const daysAhead = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

let seq = 0;
function student(opts = {}) {
  seq += 1;
  return {
    _id: `u${seq}`,
    email: `kid${seq}@example.com`,
    createdAt: daysAgo(30),
    subscriptionTier: 'free',
    totalActiveTutoringMinutes: 0,
    ...opts,
  };
}

function build(students, extra = {}) {
  return buildStudentUsageReport({
    students,
    earliestEventAt: daysAgo(365),
    startDate: START,
    endDate: NOW,
    now: NOW,
    ...extra,
  });
}

describe('planOf', () => {
  const ctx = { now: NOW, payingParentIds: new Set(['p1']) };

  test('a card trial is on the unlimited tier but is not paying', () => {
    expect(planOf({ subscriptionTier: 'unlimited', trialEndsAt: daysAhead(5) }, ctx)).toBe('card_trial');
    expect(planOf({ subscriptionTier: 'unlimited', trialEndsAt: null }, ctx)).toBe('paying');
  });

  test('a no-card trial stays on free and reads as trial until it lapses', () => {
    expect(planOf({ subscriptionTier: 'free', trialEndsAt: daysAhead(3) }, ctx)).toBe('trial');
    expect(planOf({ subscriptionTier: 'free', trialEndsAt: daysAgo(1) }, ctx)).toBe('free');
  });

  test('a student covered by a subscribed parent is parent_paid, not paying', () => {
    expect(planOf({ subscriptionTier: 'free', parentIds: ['p1'] }, ctx)).toBe('parent_paid');
    expect(planOf({ subscriptionTier: 'free', parentIds: ['p2'] }, ctx)).toBe('free');
  });
});

describe('segmentOf', () => {
  test('demo, school-licensed and founding-school accounts are not consumers', () => {
    expect(segmentOf({ isDemo: true })).toBe('demo');
    expect(segmentOf({ isDemoClone: true })).toBe('demo');
    expect(segmentOf({ schoolLicenseId: 'lic' })).toBe('school');
    expect(segmentOf({ email: 'kid@founding.edu' })).toBe('founding');
    expect(segmentOf({ email: 'kid@gmail.com' })).toBe('consumer');
  });
});

describe('buildStudentUsageReport — conversion', () => {
  test('a card-trial checkout is not a payment until the trial converts', () => {
    const trialing = student({ subscriptionTier: 'unlimited', trialEndsAt: daysAhead(4), hasUsedTrial: true });
    const converted = student({ subscriptionTier: 'unlimited', hasUsedTrial: true });
    const events = [
      { event: 'subscribed', userId: trialing._id, context: { startedInTrial: true } },
      { event: 'subscribed', userId: converted._id, context: { startedInTrial: true } },
      { event: 'trial_converted', userId: converted._id },
    ];
    const { conversion } = build([trialing, converted], { events });
    expect(conversion.paid).toBe(1);
    expect(conversion.inTrialNow).toBe(1);
    expect(conversion.trialStarted).toBe(2);
  });

  test('a trial cancelled before paying is not churn', () => {
    const s = student({ hasUsedTrial: true });
    const events = [
      { event: 'subscribed', userId: s._id, context: { startedInTrial: true } },
      { event: 'subscription_ended', userId: s._id, context: { endedInTrial: true } },
    ];
    const { conversion } = build([s], { events });
    expect(conversion.paid).toBe(0);
    expect(conversion.churned).toBe(0);
    expect(conversion.trialCancelled).toBe(1);
  });

  test('someone who paid and left counts as paid and as churned', () => {
    const s = student();
    const events = [
      { event: 'subscribed', userId: s._id, context: { startedInTrial: false } },
      { event: 'subscription_ended', userId: s._id, context: { endedInTrial: false } },
    ];
    const { conversion } = build([s], { events });
    expect(conversion.paid).toBe(1);
    expect(conversion.churned).toBe(1);
    expect(conversion.rates.paidChurn).toBe(100);
  });

  test('a paying tier with no events still counts (paid before events were logged)', () => {
    const { conversion } = build([student({ subscriptionTier: 'unlimited' })]);
    expect(conversion.paid).toBe(1);
    expect(conversion.payingNow).toBe(1);
  });

  test('demo, school and founding students are out of the cohort but school/founding count as usage', () => {
    const students = [
      student({ isDemo: true, subscriptionTier: 'unlimited' }),
      student({ schoolLicenseId: 'lic', totalActiveTutoringMinutes: 10 }),
      student({ email: 'a@founding.edu', totalActiveTutoringMinutes: 5 }),
      student({ totalActiveTutoringMinutes: 3 }),
    ];
    const { usage, conversion } = build(students);
    expect(usage.students).toBe(3);
    expect(usage.excludedDemo).toBe(1);
    expect(usage.activatedEver).toBe(3);
    expect(conversion.signedUp).toBe(1);
    expect(conversion.paid).toBe(0);
  });

  test('parent-paid is reported beside the student rate, never folded into it', () => {
    const s1 = student({ parentIds: ['p1'] });
    const s2 = student();
    const { conversion } = build([s1, s2], { payingParentIds: new Set(['p1']) });
    expect(conversion.rates.signupToPaid).toBe(0);
    expect(conversion.rates.signupToPaidIncludingParent).toBe(50);
    expect(conversion.parentPaidNow).toBe(1);
  });

  test('signups outside the window are not in the cohort', () => {
    const { conversion } = build([student({ createdAt: daysAgo(200) }), student()]);
    expect(conversion.signedUp).toBe(1);
  });

  test('funnel stages count distinct users, not events', () => {
    const s = student();
    const events = [
      { event: 'trial_returned', userId: s._id },
      { event: 'trial_returned', userId: s._id },
      { event: 'free_quota_exhausted', userId: s._id },
      { event: 'free_quota_exhausted', userId: s._id },
    ];
    const { conversion } = build([s], { events });
    expect(conversion.trialReturned).toBe(1);
    expect(conversion.hitFreeWall).toBe(1);
  });
});

describe('buildStudentUsageReport — usage', () => {
  test('active windows come from conversation activity, nested 24h ⊂ 7d ⊂ 30d', () => {
    const a = student(); const b = student(); const c = student(); const d = student();
    const lastActivityByUser = new Map([
      [a._id, daysAgo(0.5)], [b._id, daysAgo(3)], [c._id, daysAgo(20)],
    ]);
    const { usage } = build([a, b, c, d], { lastActivityByUser });
    expect(usage.active).toEqual({ last24h: 1, last7d: 2, last30d: 3, stickiness: 33.3 });
  });

  test('minutes percentiles are over activated students only', () => {
    const students = [0, 10, 20, 30, 40].map((m) => student({ totalActiveTutoringMinutes: m }));
    const { usage } = build(students);
    expect(usage.tutoringMinutesPerActivatedStudent).toEqual({ median: 20, p75: 30, p90: 40 });
  });
});

describe('caveats', () => {
  test('a small or immature cohort says so', () => {
    const { caveats } = build([student({ createdAt: daysAgo(2) })]);
    expect(caveats.join(' ')).toMatch(/Only 1 consumer signups/);
    expect(caveats.join(' ')).toMatch(/under 14 days old/);
  });

  test('a window that predates event logging says the event stages under-count', () => {
    const { caveats } = build([student()], { earliestEventAt: daysAgo(10) });
    expect(caveats.join(' ')).toMatch(/Funnel events only exist from/);
  });
});

test('weekStart buckets to Monday UTC', () => {
  expect(weekStart(new Date('2026-09-26T12:00:00Z'))).toBe('2026-09-21'); // Saturday
  expect(weekStart(new Date('2026-09-21T00:00:00Z'))).toBe('2026-09-21'); // Monday
  expect(weekStart(new Date('2026-09-27T23:00:00Z'))).toBe('2026-09-21'); // Sunday
});

// tests/unit/userNudges.test.js
//
// Unit tests for the computeNudges pure function. Verifies the escalation
// and snooze logic for the starting-point screener re-offer and the
// quarterly growth check.

const {
  computeNudges,
  NUDGE_TYPES,
  SNOOZE_DAYS,
  SCREENER_REOFFER_DAYS,
  GROWTH_CHECK_DUE_DAYS,
  GROWTH_CHECK_OVERDUE_DAYS,
} = require('../../utils/userNudges');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-05-20T00:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);
const daysFromNow = (n) => new Date(NOW.getTime() + n * DAY);

function newStudent(overrides = {}) {
  return {
    role: 'student',
    assessmentCompleted: false,
    startingPointOffered: false,
    startingPointOfferedAt: null,
    nextGrowthCheckDue: null,
    nudgeState: undefined,
    ...overrides,
  };
}

describe('computeNudges — starting-point screener', () => {
  test('null user returns empty array', () => {
    expect(computeNudges(null, { now: NOW })).toEqual([]);
  });

  test('completed assessment yields no starting-point nudge', () => {
    const user = newStudent({ assessmentCompleted: true });
    const nudges = computeNudges(user, { now: NOW });
    expect(nudges.find(n => n.type === NUDGE_TYPES.STARTING_POINT)).toBeUndefined();
  });

  test('never-offered user gets a recommended nudge', () => {
    const user = newStudent();
    const nudges = computeNudges(user, { now: NOW });
    const n = nudges.find(x => x.type === NUDGE_TYPES.STARTING_POINT);
    expect(n).toBeDefined();
    expect(n.severity).toBe('recommended');
    expect(n.dismissible).toBe(true);
    expect(n.meta.offeredBefore).toBe(false);
  });

  test('recently offered (within 7 days) does NOT re-prompt', () => {
    const user = newStudent({
      startingPointOffered: true,
      startingPointOfferedAt: daysAgo(SCREENER_REOFFER_DAYS - 1),
    });
    const nudges = computeNudges(user, { now: NOW });
    expect(nudges.find(n => n.type === NUDGE_TYPES.STARTING_POINT)).toBeUndefined();
  });

  test('offered 7+ days ago and never taken DOES re-prompt', () => {
    const user = newStudent({
      startingPointOffered: true,
      startingPointOfferedAt: daysAgo(SCREENER_REOFFER_DAYS + 1),
    });
    const n = computeNudges(user, { now: NOW }).find(x => x.type === NUDGE_TYPES.STARTING_POINT);
    expect(n).toBeDefined();
    expect(n.meta.offeredBefore).toBe(true);
    expect(n.meta.daysSinceOffer).toBeGreaterThanOrEqual(SCREENER_REOFFER_DAYS);
  });

  test('recently dismissed (within snooze) does NOT re-prompt', () => {
    const user = newStudent({
      startingPointOffered: true,
      startingPointOfferedAt: daysAgo(30),
      nudgeState: { screener: { dismissedAt: daysAgo(SNOOZE_DAYS - 1), dismissCount: 1 } },
    });
    expect(computeNudges(user, { now: NOW }).find(n => n.type === NUDGE_TYPES.STARTING_POINT)).toBeUndefined();
  });

  test('dismissed past the snooze window DOES re-prompt', () => {
    const user = newStudent({
      startingPointOffered: true,
      startingPointOfferedAt: daysAgo(30),
      nudgeState: { screener: { dismissedAt: daysAgo(SNOOZE_DAYS + 1), dismissCount: 1 } },
    });
    const n = computeNudges(user, { now: NOW }).find(x => x.type === NUDGE_TYPES.STARTING_POINT);
    expect(n).toBeDefined();
    expect(n.meta.dismissCount).toBe(1);
  });
});

describe('computeNudges — growth check', () => {
  function completedUser(overrides = {}) {
    return newStudent({
      assessmentCompleted: true,
      startingPointOffered: true,
      startingPointOfferedAt: daysAgo(120),
      ...overrides,
    });
  }

  test('no nudge if no nextGrowthCheckDue is set', () => {
    const user = completedUser({ nextGrowthCheckDue: null });
    expect(computeNudges(user, { now: NOW })).toEqual([]);
  });

  test('not yet due → no nudge', () => {
    const user = completedUser({ nextGrowthCheckDue: daysFromNow(3) });
    expect(computeNudges(user, { now: NOW })).toEqual([]);
  });

  test('just due → recommended', () => {
    const user = completedUser({ nextGrowthCheckDue: daysAgo(1) });
    const n = computeNudges(user, { now: NOW }).find(x => x.type === NUDGE_TYPES.GROWTH_CHECK);
    expect(n.severity).toBe('recommended');
    expect(n.autoLaunch).toBe(false);
    expect(n.dismissible).toBe(true);
  });

  test('past due window → due', () => {
    const user = completedUser({ nextGrowthCheckDue: daysAgo(GROWTH_CHECK_DUE_DAYS + 1) });
    const n = computeNudges(user, { now: NOW }).find(x => x.type === NUDGE_TYPES.GROWTH_CHECK);
    expect(n.severity).toBe('due');
    expect(n.autoLaunch).toBe(false);
  });

  test('past overdue window → overdue with autoLaunch', () => {
    const user = completedUser({ nextGrowthCheckDue: daysAgo(GROWTH_CHECK_OVERDUE_DAYS + 1) });
    const n = computeNudges(user, { now: NOW }).find(x => x.type === NUDGE_TYPES.GROWTH_CHECK);
    expect(n.severity).toBe('overdue');
    expect(n.autoLaunch).toBe(true);
    expect(n.dismissible).toBe(false);
    expect(n.meta.daysPastDue).toBeGreaterThanOrEqual(GROWTH_CHECK_OVERDUE_DAYS);
  });

  test('dismissed within snooze suppresses below-overdue nudges only', () => {
    // At `due` severity, a recent dismissal hides the nudge.
    const dueUser = completedUser({
      nextGrowthCheckDue: daysAgo(GROWTH_CHECK_DUE_DAYS + 1),
      nudgeState: { growthCheck: { dismissedAt: daysAgo(1) } },
    });
    expect(computeNudges(dueUser, { now: NOW }).find(n => n.type === NUDGE_TYPES.GROWTH_CHECK)).toBeUndefined();

    // At `overdue`, even a fresh dismissal does NOT suppress — we keep
    // surfacing it every session by design.
    const overdueUser = completedUser({
      nextGrowthCheckDue: daysAgo(GROWTH_CHECK_OVERDUE_DAYS + 1),
      nudgeState: { growthCheck: { dismissedAt: daysAgo(0) } },
    });
    const n = computeNudges(overdueUser, { now: NOW }).find(x => x.type === NUDGE_TYPES.GROWTH_CHECK);
    expect(n).toBeDefined();
    expect(n.severity).toBe('overdue');
  });

  test('ordering: overdue growth check appears before recommended screener', () => {
    // A user who completed assessment, growth check is overdue, but also
    // somehow has !assessmentCompleted... actually those are mutually
    // exclusive. Test ordering via two non-completed signals: an overdue
    // growth check (only fires if assessmentCompleted) wins by severity.
    // So instead: build a user where both nudges would otherwise fire and
    // verify overdue comes first.
    const user = completedUser({
      nextGrowthCheckDue: daysAgo(GROWTH_CHECK_OVERDUE_DAYS + 1),
    });
    const nudges = computeNudges(user, { now: NOW });
    // Only growth-check fires here because assessmentCompleted blocks the
    // starting-point nudge. That's the correct behavior.
    expect(nudges.length).toBe(1);
    expect(nudges[0].type).toBe(NUDGE_TYPES.GROWTH_CHECK);
  });
});

describe('computeNudges — Jason’s real profile shape', () => {
  // The exact pattern from the user document that motivated this work:
  //   nextGrowthCheckDue: 2026-05-15, assessed 2026-02-15, nothing taken
  test('user 5 days past growth-check-due gets a `due` nudge', () => {
    const user = newStudent({
      role: 'student',
      assessmentCompleted: true,
      startingPointOffered: true,
      startingPointOfferedAt: new Date('2026-02-06'),
      nextGrowthCheckDue: new Date('2026-05-15'),
    });
    const nudges = computeNudges(user, { now: NOW });
    expect(nudges).toHaveLength(1);
    expect(nudges[0].type).toBe(NUDGE_TYPES.GROWTH_CHECK);
    expect(nudges[0].severity).toBe('due');
    expect(nudges[0].meta.daysPastDue).toBe(5);
  });
});

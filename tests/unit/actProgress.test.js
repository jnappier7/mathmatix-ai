/**
 * What counts as an ACT practice attempt, and how attempts compare.
 *
 * Owner evaluation 2026-09-09: the bootcamp card read "33 → 7 ▼ −26" because
 * tests that expired while the student was away were auto-submitted and
 * charted as full attempts (1, 3 and 6 answers out of 45), and the category
 * panel reported "Geometry ▼ −17" off one question in a six-item category.
 */

const {
  EXPIRED_AWAY_MS, MIN_COMPARE_ITEMS,
  answeredCount, expiredWhileAway, shouldAbandonOnExpiry, isIncompleteAttempt, buildComparison,
} = require('../../utils/actProgress');

const MIN = 60000;

function session({ answered = 0, total = 45, startedAgoMin = 0, limit = 50, status = 'in_progress', completedAfterMin = null } = {}) {
  const startedAt = new Date(Date.now() - startedAgoMin * MIN);
  const items = Array.from({ length: total }, (_, i) => ({ position: i + 1, problemId: `p${i + 1}` }));
  const responses = Array.from({ length: answered }, (_, i) => ({ position: i + 1, problemId: `p${i + 1}`, answer: 'A' }));
  return {
    status, startedAt, timeLimitMinutes: limit, items, responses,
    completedAt: completedAfterMin == null ? undefined : new Date(startedAt.getTime() + completedAfterMin * MIN),
  };
}

describe('expired while away', () => {
  test('a running clock is not expired', () => {
    expect(expiredWhileAway(session({ startedAgoMin: 10 }))).toBe(false);
    expect(shouldAbandonOnExpiry(session({ startedAgoMin: 10, answered: 3 }))).toBe(false);
  });

  test('a minute past the deadline is "time ran out", not "nobody was here"', () => {
    // The existing pencils-down contract: a test that just expired still scores.
    expect(expiredWhileAway(session({ startedAgoMin: 51 }))).toBe(false);
    expect(shouldAbandonOnExpiry(session({ startedAgoMin: 51, answered: 3 }))).toBe(false);
  });

  test('well past the deadline with a partial sheet → abandon, never score', () => {
    const s = session({ startedAgoMin: 50 + EXPIRED_AWAY_MS / MIN + 1, answered: 3 });
    expect(expiredWhileAway(s)).toBe(true);
    expect(shouldAbandonOnExpiry(s)).toBe(true);
  });

  test('well past the deadline but every question answered → grade it (only Submit was missed)', () => {
    const s = session({ startedAgoMin: 60 * 24, answered: 45 });
    expect(shouldAbandonOnExpiry(s)).toBe(false);
  });

  test('answeredCount ignores flag-only rows', () => {
    const s = session({ answered: 2 });
    s.responses.push({ position: 3, problemId: 'p3', answer: null, flagged: true });
    expect(answeredCount(s)).toBe(2);
  });
});

describe('isIncompleteAttempt — legacy pollution already in the database', () => {
  test('the production shape: 3 of 45 answered, submitted three days later', () => {
    const s = session({ status: 'completed', answered: 3, completedAfterMin: 3 * 24 * 60 });
    expect(isIncompleteAttempt(s)).toBe(true);
  });

  test('present when time ran out, however few answered, is a real attempt', () => {
    const s = session({ status: 'completed', answered: 4, completedAfterMin: 50.1 });
    expect(isIncompleteAttempt(s)).toBe(false);
  });

  test('more than half answered is a real attempt even if submitted late', () => {
    const s = session({ status: 'completed', answered: 30, completedAfterMin: 600 });
    expect(isIncompleteAttempt(s)).toBe(false);
  });

  test('only completed sessions can be incomplete attempts', () => {
    const s = session({ status: 'abandoned', answered: 1, completedAfterMin: 600 });
    expect(isIncompleteAttempt(s)).toBe(false);
  });
});

describe('buildComparison', () => {
  const cats = (geo, ies) => ({
    geometry: { correct: geo, total: 6 },
    'integrating-essential-skills': { correct: ies, total: 19 },
  });
  const attempt = (scaled, totalItems, byCategory, extra = {}) => ({ scaledScore: scaled, totalItems, byCategory, ...extra });

  test('needs two scored attempts', () => {
    expect(buildComparison([attempt(30, 45, cats(6, 16))])).toBeNull();
    expect(buildComparison([])).toBeNull();
  });

  test('incomplete attempts are kept off the trend and counted as hidden', () => {
    const rows = [
      attempt(33, 45, cats(6, 16)),
      attempt(7, 45, cats(0, 1), { incomplete: true }),
      attempt(34, 45, cats(5, 18)),
    ];
    const c = buildComparison(rows);
    expect(c.trend).toEqual([33, 34]);
    expect(c.delta).toBe(1);
    expect(c.hidden).toBe(1);
    expect(c.attempts).toBe(2);
  });

  test('a six-item category gets no delta — one question is not a trend', () => {
    const c = buildComparison([attempt(33, 45, cats(6, 16)), attempt(34, 45, cats(5, 18))]);
    const geo = c.categories.find((x) => x.category === 'geometry');
    expect(geo.comparable).toBe(false);
    expect(geo.reason).toBe('too-few-items');
    expect(geo.deltaPct).toBeNull();
    expect(geo.first).toEqual({ correct: 6, total: 6 });
    expect(geo.latest).toEqual({ correct: 5, total: 6 });
  });

  test('a 19-item category is comparable and reports the change in questions right', () => {
    const c = buildComparison([attempt(33, 45, cats(6, 16)), attempt(34, 45, cats(5, 18))]);
    const ies = c.categories.find((x) => x.category === 'integrating-essential-skills');
    expect(ies.comparable).toBe(true);
    expect(ies.deltaCorrect).toBe(2);
    expect(ies.deltaPct).toBe(11);
    expect(c.categories[0].category).toBe('integrating-essential-skills');   // comparable rows first
    expect(MIN_COMPARE_ITEMS).toBeLessThanOrEqual(19);
  });

  test('a legacy 60-item baseline is not the baseline for a 45-item form', () => {
    const legacy = attempt(33, 60, { geometry: { correct: 12, total: 12 } });
    const a1 = attempt(24, 45, cats(4, 15));
    const a2 = attempt(34, 45, cats(5, 18));
    const c = buildComparison([legacy, a1, a2]);
    expect(c.sameForm).toBe(true);
    expect(c.first.scaledScore).toBe(24);            // earliest SAME-form attempt
    expect(c.delta).toBe(10);
    expect(c.trend).toEqual([33, 24, 34]);           // the trend line still shows everything scored
  });

  test('with no same-form pair the overall delta still reports, flagged as a different form', () => {
    const legacy = attempt(33, 60, { geometry: { correct: 12, total: 12 } });
    const a1 = attempt(34, 45, { geometry: { correct: 5, total: 6 } });
    const c = buildComparison([legacy, a1]);
    expect(c.sameForm).toBe(false);
    expect(c.delta).toBe(1);
    expect(c.categories[0].comparable).toBe(false);
    expect(c.categories[0].reason).toBe('different-forms');
  });
});

// utils/actProgress.js
//
// What counts as a scored ACT practice attempt, and how two attempts compare.
// Pure functions — the /history and /complete routes call them, the test suite
// pins them, and nothing here touches the DB.
//
// Two owner-reported failures live here (2026-09-09 evaluation):
//
//   1. "33 → 7 ▼ −26". Sessions a student walked away from were auto-submitted
//      the next time the runner opened (clock long expired), graded with 1, 3
//      or 6 answers out of 45, and charted as full attempts. The headline trend
//      became meaningless and alarming. A test that expired while nobody was
//      at the keyboard is NOT an attempt: it is abandoned, never scored.
//   2. "Geometry ▼ −17" produced by one question on a six-item category. A
//      percentage-point delta on a handful of items is noise, and comparing a
//      60-item legacy form to a 45-item form compares different blueprints.
//      Category deltas are only reported between same-blueprint forms and only
//      where the category has enough items to mean anything.

// How long past the section deadline before "time ran out" turns into "nobody
// was here". The runner auto-submits within a second of the clock hitting 0
// when the student is present; the save-answer route already grants a 10s
// grace for client/server skew. Five minutes is well clear of both and well
// short of the hours/days the polluting sessions sat idle.
const EXPIRED_AWAY_MS = 5 * 60 * 1000;

// Fewer items than this in a category and a first→latest delta is reported as
// "not comparable" rather than as a number. Rule of thumb: one question must be
// worth less than ~13 percentage points before a delta can mean anything.
const MIN_COMPARE_ITEMS = 8;

function deadlineOf(session) {
  const started = new Date(session.startedAt || 0).getTime();
  return started + (Number(session.timeLimitMinutes) || 0) * 60000;
}

/** Responses that carry an actual answer (skipped/flag-only rows do not). */
function answeredCount(session) {
  return (session && Array.isArray(session.responses) ? session.responses : [])
    .filter((r) => r && r.answer !== null && r.answer !== undefined && r.answer !== '')
    .length;
}

function totalItems(session) {
  if (!session) return 0;
  return (Array.isArray(session.items) && session.items.length)
    || (Array.isArray(session.responses) && session.responses.length)
    || 0;
}

/**
 * Milliseconds past the section deadline at `now` (0 while the clock runs).
 */
function overdueMs(session, now = Date.now()) {
  return Math.max(0, now - deadlineOf(session));
}

/**
 * True when the clock ran out and nobody was there to see it: the deadline is
 * more than EXPIRED_AWAY_MS in the past. Whether such a session still deserves
 * a score depends on how much of it was answered — see shouldAbandonOnExpiry.
 */
function expiredWhileAway(session, now = Date.now()) {
  return overdueMs(session, now) > EXPIRED_AWAY_MS;
}

/**
 * An expired-while-away session is abandoned (never scored) unless the student
 * had already answered EVERY question — then the only thing they skipped was
 * pressing Submit, and the answer sheet is complete enough to grade.
 */
function shouldAbandonOnExpiry(session, now = Date.now()) {
  if (!expiredWhileAway(session, now)) return false;
  return answeredCount(session) < totalItems(session);
}

/**
 * Legacy pollution: a COMPLETED session that was in fact auto-submitted after
 * expiring while away, with less than half the form answered. These already
 * carry a rawScore/scaledScore in the database; the flag lets /history keep
 * them out of the trend without a migration. A student who was present and
 * simply ran out of time completes within the grace window and is never
 * flagged, however few they answered — that IS an attempt.
 */
function isIncompleteAttempt(session) {
  if (!session || session.status !== 'completed') return false;
  const total = totalItems(session);
  if (!total) return false;
  const answered = answeredCount(session);
  if (answered >= Math.ceil(total / 2)) return false;
  const completed = new Date(session.completedAt || 0).getTime();
  return completed - deadlineOf(session) > EXPIRED_AWAY_MS;
}

/** Attempts that belong on a trend line. */
function scoredAttempts(attempts) {
  return (attempts || []).filter((a) => a && a.scaledScore !== null && a.scaledScore !== undefined && !a.incomplete);
}

/**
 * First → latest comparison across a student's scored attempts.
 *
 * @param {Array} attempts  /history-shaped rows ({scaledScore, totalItems,
 *                          byCategory, incomplete, completedAt}), oldest first
 * @returns {null|Object} null with fewer than two scored attempts, else
 *   { first, latest, delta, attempts, sameForm, hidden, categories: [...] }
 *   where each category row is { category, first:{correct,total},
 *   latest:{correct,total}, comparable, deltaCorrect, deltaPct, reason }.
 */
function buildComparison(attempts, { minCompareItems = MIN_COMPARE_ITEMS } = {}) {
  const all = Array.isArray(attempts) ? attempts : [];
  const scored = scoredAttempts(all);
  if (scored.length < 2) return null;

  const latest = scored[scored.length - 1];
  // Compare like with like: the earliest attempt on the SAME form size. A
  // 60-item legacy baseline against a 45-item form is a different blueprint,
  // so its category counts are not a baseline for anything.
  const sameForm = scored.filter((a) => a.totalItems === latest.totalItems);
  const first = sameForm.length >= 2 ? sameForm[0] : scored[0];
  const isSameForm = sameForm.length >= 2;

  const latestCats = latest.byCategory || {};
  const firstCats = first.byCategory || {};
  const categories = Object.keys(latestCats)
    .filter((c) => firstCats[c])
    .map((c) => {
      const f = firstCats[c], l = latestCats[c];
      const fTotal = Number(f.total) || 0, lTotal = Number(l.total) || 0;
      let reason = null;
      if (!isSameForm || fTotal !== lTotal) reason = 'different-forms';
      else if (lTotal < minCompareItems) reason = 'too-few-items';
      const comparable = reason === null;
      const fp = fTotal ? f.correct / fTotal : 0;
      const lp = lTotal ? l.correct / lTotal : 0;
      return {
        category: c,
        first: { correct: Number(f.correct) || 0, total: fTotal },
        latest: { correct: Number(l.correct) || 0, total: lTotal },
        comparable,
        deltaCorrect: comparable ? (Number(l.correct) || 0) - (Number(f.correct) || 0) : null,
        deltaPct: comparable ? Math.round((lp - fp) * 100) : null,
        reason,
      };
    })
    // Comparable rows first (biggest gain to biggest loss), then the rest.
    .sort((a, b) => {
      if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
      return (b.deltaPct || 0) - (a.deltaPct || 0);
    });

  return {
    first: { scaledScore: first.scaledScore, completedAt: first.completedAt || null, totalItems: first.totalItems },
    latest: { scaledScore: latest.scaledScore, completedAt: latest.completedAt || null, totalItems: latest.totalItems },
    delta: latest.scaledScore - first.scaledScore,
    attempts: scored.length,
    trend: scored.map((a) => a.scaledScore),
    sameForm: isSameForm,
    hidden: all.length - scored.length,      // incomplete attempts kept off the chart
    categories,
  };
}

module.exports = {
  EXPIRED_AWAY_MS,
  MIN_COMPARE_ITEMS,
  answeredCount,
  totalItems,
  overdueMs,
  expiredWhileAway,
  shouldAbandonOnExpiry,
  isIncompleteAttempt,
  scoredAttempts,
  buildComparison,
};

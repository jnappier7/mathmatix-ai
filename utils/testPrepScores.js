'use strict';
/* ============================================================
   testPrepScores.js — a teacher's view of practice-test results
   (PreACT / PSAT / SAT / ACT), built on the same rules the student report
   uses so the two can never disagree:
     • rushed     — utils/rushedAttempt.js (finished in < 25% of the limit)
     • incomplete — utils/actProgress.js isIncompleteAttempt (auto-submitted
                    after expiring away with under half answered)
     • range      — utils/actTestAssembler.js scaledRange
   Flagged attempts stay visible (they happened) but are left out of class
   averages, and out of "best" — a teacher should not plan around a score
   the student earned by clicking through.

   summarizeAttempt / buildStudentExams / buildClassSummary are pure (tested
   directly); loadTestScores is the one query.
   ============================================================ */

const { getTestDef, TESTS } = require('./practiceTests');
const { isRushed } = require('./rushedAttempt');
const { isIncompleteAttempt, answeredCount } = require('./actProgress');
const { isModular } = require('./testModules');

// Junior tests first, so the grid reads left to right in the order students take them.
const EXAM_ORDER = ['preact-math', 'psat-math', 'sat-math', 'act-math'];
const UNFINISHED_SKIPS = 5;
const MIN_CATEGORY_ITEMS = 3;

function examMeta(testId) {
  const def = getTestDef(testId);
  return { testId: def.testId, label: def.label, key: def.key };
}

/** The whole section's clock (a modular session's startedAt is its CURRENT module's). */
function sectionStart(session) {
  const first = (session.modules || []).find(m => m && m.startedAt);
  return first ? new Date(first.startedAt) : (session.startedAt ? new Date(session.startedAt) : null);
}
function sectionMinutes(session) {
  const bp = getTestDef(session.testId).blueprint;
  return isModular(bp) ? (bp.timeLimitMinutes || null) : (session.timeLimitMinutes || null);
}
function attemptDurationMs(session) {
  const start = sectionStart(session);
  if (!start || !session.completedAt) return null;
  const d = new Date(session.completedAt) - start;
  return Number.isFinite(d) && d >= 0 ? d : null;
}
/** The one rushed rule, applied to a stored session. */
function isRushedSession(session) {
  return isRushed(attemptDurationMs(session), sectionMinutes(session));
}

/** One completed session → what a teacher needs to see about it. */
function summarizeAttempt(session, { range = null } = {}) {
  const def = getTestDef(session.testId);
  const responses = session.responses || [];
  const totalItems = (session.items || []).length || responses.length;
  const answered = answeredCount(session);
  const skippedCount = Math.max(0, totalItems - answered);
  const durationMs = attemptDurationMs(session);
  const incomplete = isIncompleteAttempt(session);
  const rushed = isRushedSession(session);
  const unfinished = incomplete || skippedCount >= UNFINISHED_SKIPS;
  const route = (session.modules || []).map(m => m && m.route).filter(Boolean).pop() || null;

  const byCategory = {};
  for (const r of responses) {
    const c = r.category || 'unknown';
    byCategory[c] = byCategory[c] || { correct: 0, total: 0, label: (def.categoryLabel && def.categoryLabel[c]) || c };
    byCategory[c].total += 1;
    if (r.correct) byCategory[c].correct += 1;
  }

  const flags = [];
  if (rushed) flags.push('rushed');
  if (unfinished) flags.push('unfinished');
  if (route === 'easier') flags.push('easier-route');

  return {
    sessionId: String(session._id),
    testId: def.testId,
    completedAt: session.completedAt || null,
    rawScore: session.rawScore != null ? session.rawScore : null,
    scaledScore: session.scaledScore != null ? session.scaledScore : null,
    range,
    totalItems,
    answered,
    skippedCount,
    durationMinutes: durationMs != null ? Math.round(durationMs / 60000) : null,
    timeLimitMinutes: sectionMinutes(session),
    moduleRoute: route,
    byCategory,
    flags,
    // Rushed or unfinished attempts are not a fair read of what the student
    // knows. "Easier route" is a real score on the real scale — flagged so
    // the teacher knows the ceiling, but it still counts.
    countsTowardAverage: !rushed && !unfinished && session.scaledScore != null,
  };
}

/** Per exam: first / latest / best (best only among fair attempts) + history. */
function buildStudentExams(attempts) {
  const byExam = {};
  for (const a of attempts) (byExam[a.testId] = byExam[a.testId] || []).push(a);
  const out = {};
  for (const [testId, list] of Object.entries(byExam)) {
    list.sort((x, y) => new Date(x.completedAt) - new Date(y.completedAt));
    const fair = list.filter(a => a.countsTowardAverage);
    const best = fair.reduce((b, a) => (b == null || a.scaledScore > b.scaledScore ? a : b), null);
    const first = list[0];
    const latest = list[list.length - 1];
    const firstFair = fair[0] || null;
    const latestFair = fair[fair.length - 1] || null;
    out[testId] = {
      attemptCount: list.length,
      first, latest, best,
      // Growth only between fair attempts: a rushed first try isn't a baseline.
      change: firstFair && latestFair && firstFair !== latestFair ? latestFair.scaledScore - firstFair.scaledScore : null,
      attempts: list,
    };
  }
  return out;
}

/**
 * Class-level read for one exam: who has tested, the average of each
 * student's latest FAIR attempt, and the weakest category (pooled over
 * those same attempts, ignoring categories with too few items to mean much).
 */
function buildClassSummary(students, testId) {
  const latestFair = [];
  let tested = 0;
  let flaggedOnly = 0;
  for (const s of students) {
    const e = s.exams[testId];
    if (!e) continue;
    tested += 1;
    const fair = e.attempts.filter(a => a.countsTowardAverage);
    if (!fair.length) { flaggedOnly += 1; continue; }
    latestFair.push(fair[fair.length - 1]);
  }
  const avg = latestFair.length ? Math.round(latestFair.reduce((t, a) => t + a.scaledScore, 0) / latestFair.length) : null;
  const pooled = {};
  for (const a of latestFair) {
    for (const [c, v] of Object.entries(a.byCategory || {})) {
      if (c === 'unknown') continue;
      pooled[c] = pooled[c] || { correct: 0, total: 0, label: v.label || c };
      pooled[c].correct += v.correct;
      pooled[c].total += v.total;
    }
  }
  const cats = Object.entries(pooled)
    .filter(([, v]) => v.total >= MIN_CATEGORY_ITEMS)
    .map(([key, v]) => ({ key, label: v.label, pct: Math.round((v.correct / v.total) * 100), total: v.total }))
    .sort((a, b) => a.pct - b.pct);
  return {
    testId,
    ...examMeta(testId),
    studentsTested: tested,
    averagedOver: latestFair.length,
    excludedFlagged: flaggedOnly,
    classAverage: avg,
    weakestCategory: cats[0] || null,
    categories: cats,
  };
}

/**
 * The "likely" band for a stored score. scaledRange() reads the raw count;
 * an IRT-scored test (SAT / PSAT) stores a score from the whole response
 * pattern, so a raw-based band need not contain it. The band's WIDTH is the
 * honest part — keep it, and centre it on the score the student was shown,
 * clamped to the scale. A band that misses its own score is never returned.
 */
function likelyRange(rawRange, scaledScore, blueprint) {
  if (!rawRange || scaledScore == null) return rawRange || null;
  if (scaledScore >= rawRange.low && scaledScore <= rawRange.high) return rawRange;
  const scale = (blueprint && (blueprint.irtScale || blueprint.scoreScale)) || {};
  const lo = Number.isFinite(scale.min) ? scale.min : -Infinity;
  const hi = Number.isFinite(scale.max) ? scale.max : Infinity;
  const step = (blueprint && blueprint.irtScale && blueprint.irtScale.round) || 1;
  const half = Math.max(step, Math.round((rawRange.high - rawRange.low) / 2 / step) * step);
  return { low: Math.max(lo, scaledScore - half), high: Math.min(hi, scaledScore + half) };
}

/** Completed practice-test sessions for a set of students, in one query. */
async function loadTestScores(studentIds, { from = null, to = null, exam = null } = {}) {
  const ActTestSession = require('../models/actTestSession');
  const { scaledRange } = require('./actTestAssembler');
  const filter = { userId: { $in: studentIds }, status: 'completed' };
  if (exam) {
    filter.testId = exam === 'act-math' ? { $in: ['act-math', null] } : exam;
  }
  if (from || to) {
    filter.completedAt = {};
    if (from) filter.completedAt.$gte = from;
    if (to) filter.completedAt.$lte = to;
  }
  const sessions = await ActTestSession.find(filter)
    .select('userId testId status startedAt completedAt timeLimitMinutes modules rawScore scaledScore items.position responses.category responses.correct responses.answer')
    .sort({ completedAt: 1 })
    .lean();
  const byStudent = new Map();
  for (const s of sessions) {
    if (!s.testId) s.testId = 'act-math'; // pre-testId sessions are ACT (practiceTests.testScope)
    const def = getTestDef(s.testId);
    const total = (s.items || []).length || (s.responses || []).length;
    const range = likelyRange(s.rawScore != null ? scaledRange(s.rawScore, total, def.blueprint) : null, s.scaledScore, def.blueprint);
    const key = String(s.userId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(summarizeAttempt(s, { range }));
  }
  return byStudent;
}

/** Where a signed-in student takes each exam (config/routes.js). */
const RUNNER_URL = {
  'act-math': '/act-practice-test',
  'sat-math': '/sat-practice-test',
  'psat-math': '/psat-practice-test',
  'preact-math': '/preact-practice-test',
};

/**
 * Status of one assigned test for one student, from their sessions of that
 * exam: anything started at or after the assignment counts toward it.
 * 'done' wins over 'in-progress' (a finished attempt is the answer to the
 * assignment even if they've started another).
 */
function assignmentStatus(sessions, assignedAt) {
  const since = new Date(assignedAt || 0).getTime();
  let status = 'not-started';
  let completedAt = null;
  let scaledScore = null;
  for (const s of sessions || []) {
    const t = new Date(s.startedAt || s.completedAt || 0).getTime();
    if (t < since) continue;
    if (s.status === 'completed') {
      if (!completedAt || new Date(s.completedAt) > completedAt) {
        completedAt = new Date(s.completedAt);
        scaledScore = s.scaledScore != null ? s.scaledScore : null;
      }
      status = 'done';
    } else if (s.status === 'in_progress' && status !== 'done') {
      status = 'in-progress';
    }
  }
  return { status, completedAt, scaledScore };
}

module.exports = {
  RUNNER_URL,
  assignmentStatus,
  EXAM_ORDER,
  UNFINISHED_SKIPS,
  examMeta,
  sectionStart,
  sectionMinutes,
  attemptDurationMs,
  isRushedSession,
  summarizeAttempt,
  buildStudentExams,
  buildClassSummary,
  likelyRange,
  loadTestScores,
  KNOWN_EXAMS: Object.keys(TESTS),
};

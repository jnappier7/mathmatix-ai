'use strict';
/* ============================================================
   studentActivity.js — ONE answer to "how active is this student?"

   Two stored signals lie, in different directions:
     • weeklyActiveTutoringMinutes only resets when the student is next
       active (track-time / usageGate). An inactive student keeps the
       value from the last week they showed up — a teacher roster summed
       1,898 "minutes this week" when the true figure was ~98.
     • lastLogin is the last time a password/SSO round-trip happened, and
       older accounts have tutoring history with no lastLogin at all
       ("Never logged in" on a student with 16 conversations).

   And a third one lies by being true: a conversation's `lastActivity` and
   `activeMinutes` move whenever the chat page is open and the mouse moves.
   Measured on prod (2026-11-17): of 42 students a roster called "active
   this week", 17 had opened the tutor and done nothing, 21 more had 1-5
   minutes of page time and sent no message. Four had actually talked to
   the tutor. "Active" must mean WORK, not presence.

   So there are two clocks, kept apart on purpose:
     • lastActiveAt / weeklyMinutes — presence: the later of lastLogin and
       the newest conversation touch; page minutes per rolling week.
     • lastWorkedAt / workByWeek   — work: a message sent to the tutor, a
       test module, an activity check or a drill round, per rolling week.
   "Active", "inactive", "lapsed" and the week-over-week trend read the
   work clock (public/js/teacher-metrics.js). Presence is shown beside it
   ("opened the tutor, no work yet"), never counted as engagement.

   Work sources, each one a timestamped event:
     Conversation.messages[role=user].timestamp
     ActTestSession   (startedAt / completedAt)
     ActivityAttempt  (kind=check, createdAt)
     DrillResult      (playedAt)
   Conversation minutes land in the week of the conversation's lastActivity
   (sessions are minutes long, so straddling a bucket edge is rare).
   ============================================================ */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const DEFAULT_WEEKS = 4;

function toTime(d) {
  if (!d) return 0;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * The weekly-minutes counter, or 0 if its 7-day window has lapsed.
 * Mirrors the reset rule in routes/chat.js track-time and middleware/usageGate.js.
 */
function getEffectiveWeeklyMinutes(user, now = Date.now()) {
  if (!user) return 0;
  const lastReset = toTime(user.lastWeeklyReset);
  if (now - lastReset >= WEEK_MS) return 0;
  const minutes = Number(user.weeklyActiveTutoringMinutes);
  if (Number.isFinite(minutes) && minutes > 0) return Math.floor(minutes);
  const seconds = Number(user.weeklyActiveSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds / 60) : 0;
}

/** Later of lastLogin and the most recent tutoring activity (presence). */
function resolveLastActiveAt(user, lastConversationActivity) {
  const t = Math.max(toTime(user && user.lastLogin), toTime(lastConversationActivity));
  return t > 0 ? new Date(t) : null;
}

function emptyEntry(weeks) {
  return {
    weeks: new Array(weeks).fill(0),
    lastActivity: null,
    sessionsThisWeek: 0,
    workByWeek: new Array(weeks).fill(0),
    lastWorkedAt: null,
  };
}

/**
 * Bucket conversation rows into rolling weeks ending at `now` (presence).
 * Pure — the aggregation below feeds it, and tests drive it directly.
 *
 * @param {Array<{userId, lastActivity, activeMinutes}>} rows
 * @returns {Map<string, {weeks:number[], lastActivity:Date|null, sessionsThisWeek:number, workByWeek:number[], lastWorkedAt:Date|null}>}
 */
function bucketConversations(rows, { now = Date.now(), weeks = DEFAULT_WEEKS } = {}) {
  const index = new Map();
  for (const row of rows || []) {
    if (!row || !row.userId) continue;
    const key = String(row.userId);
    let entry = index.get(key);
    if (!entry) {
      entry = emptyEntry(weeks);
      index.set(key, entry);
    }
    const t = toTime(row.lastActivity);
    if (!t) continue;
    if (!entry.lastActivity || t > entry.lastActivity.getTime()) entry.lastActivity = new Date(t);
    const age = now - t;
    if (age < 0) continue;
    const bucket = Math.floor(age / WEEK_MS);
    if (bucket >= weeks) continue;
    entry.weeks[bucket] += Math.max(0, Number(row.activeMinutes) || 0);
    if (bucket === 0) entry.sessionsThisWeek += 1;
  }
  return index;
}

/**
 * Fold work events into the same index (work). Pure.
 * An event older than the window still moves lastWorkedAt; only the
 * per-week counts are bounded.
 *
 * @param {Map} index   from bucketConversations (mutated and returned)
 * @param {Array<{userId, at}>} events
 */
function bucketWorkEvents(index, events, { now = Date.now(), weeks = DEFAULT_WEEKS } = {}) {
  for (const ev of events || []) {
    if (!ev || !ev.userId) continue;
    const t = toTime(ev.at);
    if (!t) continue;
    const key = String(ev.userId);
    let entry = index.get(key);
    if (!entry) {
      entry = emptyEntry(weeks);
      index.set(key, entry);
    }
    if (!entry.lastWorkedAt || t > entry.lastWorkedAt.getTime()) entry.lastWorkedAt = new Date(t);
    const age = now - t;
    if (age < 0) continue;
    const bucket = Math.floor(age / WEEK_MS);
    if (bucket < weeks) entry.workByWeek[bucket] += 1;
  }
  return index;
}

function toObjectIds(studentIds) {
  const { Types } = require('mongoose');
  return (studentIds || []).filter(Boolean)
    .map(id => (id instanceof Types.ObjectId ? id : (Types.ObjectId.isValid(String(id)) ? new Types.ObjectId(String(id)) : null)))
    .filter(Boolean);
}

/**
 * Work events in the window, plus the newest work of any age per student,
 * from every surface a student can do math on. One pass per source.
 */
async function loadWorkEvents(ids, since) {
  const Conversation = require('../models/conversation');
  const ActTestSession = require('../models/actTestSession');
  const ActivityAttempt = require('../models/activityAttempt');
  const DrillResult = require('../models/drillResult');

  const [messages, latestMessage, tests, latestTest, checks, latestCheck, drills, latestDrill] = await Promise.all([
    // Student messages inside the window, by their own timestamp.
    Conversation.aggregate([
      { $match: { userId: { $in: ids }, lastActivity: { $gte: since } } },
      { $project: { userId: 1, messages: { $filter: { input: { $ifNull: ['$messages', []] }, as: 'm', cond: { $and: [{ $eq: ['$$m.role', 'user'] }, { $gte: ['$$m.timestamp', since] }] } } } } },
      { $unwind: '$messages' },
      { $project: { userId: 1, at: '$messages.timestamp' } },
    ]),
    // Newest conversation that holds at least one student message, any age.
    Conversation.aggregate([
      { $match: { userId: { $in: ids } } },
      { $project: { userId: 1, lastActivity: 1, spoke: { $gt: [{ $size: { $filter: { input: { $ifNull: ['$messages', []] }, as: 'm', cond: { $eq: ['$$m.role', 'user'] } } } }, 0] } } },
      { $match: { spoke: true } },
      { $group: { _id: '$userId', at: { $max: '$lastActivity' } } },
    ]),
    ActTestSession.find({ userId: { $in: ids }, $or: [{ startedAt: { $gte: since } }, { completedAt: { $gte: since } }] }, 'userId startedAt completedAt').lean(),
    ActTestSession.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', at: { $max: { $ifNull: ['$completedAt', '$startedAt'] } } } }]),
    ActivityAttempt.find({ userId: { $in: ids }, kind: 'check', createdAt: { $gte: since } }, 'userId createdAt').lean(),
    ActivityAttempt.aggregate([{ $match: { userId: { $in: ids }, kind: 'check' } }, { $group: { _id: '$userId', at: { $max: '$createdAt' } } }]),
    DrillResult.find({ userId: { $in: ids }, playedAt: { $gte: since } }, 'userId playedAt').lean(),
    DrillResult.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', at: { $max: '$playedAt' } } }]),
  ]);

  const inWindow = [
    ...messages.map(m => ({ userId: m.userId, at: m.at })),
    ...tests.map(t => ({ userId: t.userId, at: t.completedAt || t.startedAt })),
    ...checks.map(c => ({ userId: c.userId, at: c.createdAt })),
    ...drills.map(d => ({ userId: d.userId, at: d.playedAt })),
  ];
  const latest = [...latestMessage, ...latestTest, ...latestCheck, ...latestDrill].map(r => ({ userId: r._id, at: r.at }));
  return { inWindow, latest };
}

/**
 * Per-student activity for a roster.
 * weeks[0] / workByWeek[0] = the last 7 days, [1] = the 7 before that, …
 *
 * lastActivity is the most recent conversation at any age (separate,
 * index-backed $group), so a student idle for months still gets a real
 * "last seen" date instead of "Never". lastWorkedAt likewise comes from
 * the newest work of any age.
 */
async function buildActivityIndex(studentIds, { now = Date.now(), weeks = DEFAULT_WEEKS } = {}) {
  const Conversation = require('../models/conversation');
  // aggregate() does not cast like find() does — string ids (what
  // getStudentIdsForTeacher returns) would silently match nothing.
  const ids = toObjectIds(studentIds);
  if (ids.length === 0) return new Map();
  const since = new Date(now - weeks * WEEK_MS);

  const [recent, latest, work] = await Promise.all([
    Conversation.find(
      { userId: { $in: ids }, lastActivity: { $gte: since } },
      'userId lastActivity activeMinutes'
    ).lean(),
    Conversation.aggregate([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: '$userId', lastActivity: { $max: '$lastActivity' } } },
    ]),
    loadWorkEvents(ids, since),
  ]);

  const index = bucketConversations(recent, { now, weeks });
  for (const row of latest) {
    const key = String(row._id);
    let entry = index.get(key);
    if (!entry) {
      entry = emptyEntry(weeks);
      index.set(key, entry);
    }
    const t = toTime(row.lastActivity);
    if (t && (!entry.lastActivity || t > entry.lastActivity.getTime())) entry.lastActivity = new Date(t);
  }
  bucketWorkEvents(index, work.inWindow, { now, weeks });
  // Newest work of any age only moves lastWorkedAt; the weekly counts above
  // already hold everything inside the window.
  bucketWorkEvents(index, work.latest, { now, weeks: 0 });
  return index;
}

/**
 * Decorate lean student docs in place with an `activity` block and a
 * corrected weeklyActiveTutoringMinutes, so every downstream reader (cards,
 * KPI tiles, alerts, exports) reads the same truthful numbers.
 */
function applyActivity(students, index, now = Date.now()) {
  for (const s of students || []) {
    const entry = index.get(String(s._id)) || emptyEntry(DEFAULT_WEEKS);
    const lastActiveAt = resolveLastActiveAt(s, entry.lastActivity);
    s.activity = {
      lastActiveAt,
      lastWorkedAt: entry.lastWorkedAt || null,
      weeklyMinutes: entry.weeks.map(m => Math.round(m)),
      workByWeek: (entry.workByWeek || new Array(DEFAULT_WEEKS).fill(0)).slice(),
      sessionsThisWeek: entry.sessionsThisWeek,
    };
    // The legacy field keeps its name for back-compat, but no longer lies.
    s.weeklyActiveTutoringMinutes = getEffectiveWeeklyMinutes(s, now);
  }
  return students;
}

/** Did this student do work in the last 7 days? The one server-side "active". */
function workedThisWeek(student) {
  const a = student && student.activity;
  return !!(a && Array.isArray(a.workByWeek) && a.workByWeek[0] > 0);
}

module.exports = {
  WEEK_MS,
  DEFAULT_WEEKS,
  getEffectiveWeeklyMinutes,
  resolveLastActiveAt,
  bucketConversations,
  bucketWorkEvents,
  buildActivityIndex,
  applyActivity,
  workedThisWeek,
};

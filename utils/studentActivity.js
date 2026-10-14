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

   The ground truth is the Conversation collection: every tutoring session
   carries activeMinutes and lastActivity (indexed {userId, lastActivity}).
   So:
     • getEffectiveWeeklyMinutes() — the stored counter, zeroed once its
       7-day window has lapsed. For readers that only have the user doc.
     • buildActivityIndex() — per-student rolling-week minute buckets and a
       real lastActiveAt, from conversations, in one aggregation.

   A conversation's minutes land in the week of its lastActivity. Sessions
   are minutes long, so straddling a bucket edge is rare and harmless; the
   alternative (per-message timestamps) costs a full messages scan.
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

/** Later of lastLogin and the most recent tutoring activity. */
function resolveLastActiveAt(user, lastConversationActivity) {
  const t = Math.max(toTime(user && user.lastLogin), toTime(lastConversationActivity));
  return t > 0 ? new Date(t) : null;
}

/**
 * Bucket conversation rows into rolling weeks ending at `now`.
 * Pure — the aggregation below feeds it, and tests drive it directly.
 *
 * @param {Array<{userId, lastActivity, activeMinutes}>} rows
 * @returns {Map<string, {weeks:number[], lastActivity:Date|null, sessionsThisWeek:number}>}
 */
function bucketConversations(rows, { now = Date.now(), weeks = DEFAULT_WEEKS } = {}) {
  const index = new Map();
  for (const row of rows || []) {
    if (!row || !row.userId) continue;
    const key = String(row.userId);
    let entry = index.get(key);
    if (!entry) {
      entry = { weeks: new Array(weeks).fill(0), lastActivity: null, sessionsThisWeek: 0 };
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
 * Per-student activity for a roster, from conversations.
 * weeks[0] = the last 7 days, weeks[1] = the 7 before that, …
 *
 * lastActivity is the most recent conversation at any age (separate,
 * index-backed $group), so a student idle for months still gets a real
 * "last active" date instead of "Never".
 */
async function buildActivityIndex(studentIds, { now = Date.now(), weeks = DEFAULT_WEEKS } = {}) {
  const Conversation = require('../models/conversation');
  const { Types } = require('mongoose');
  // aggregate() does not cast like find() does — string ids (what
  // getStudentIdsForTeacher returns) would silently match nothing.
  const ids = (studentIds || []).filter(Boolean)
    .map(id => (id instanceof Types.ObjectId ? id : (Types.ObjectId.isValid(String(id)) ? new Types.ObjectId(String(id)) : null)))
    .filter(Boolean);
  if (ids.length === 0) return new Map();
  const since = new Date(now - weeks * WEEK_MS);

  const [recent, latest] = await Promise.all([
    Conversation.find(
      { userId: { $in: ids }, lastActivity: { $gte: since } },
      'userId lastActivity activeMinutes'
    ).lean(),
    Conversation.aggregate([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: '$userId', lastActivity: { $max: '$lastActivity' } } },
    ]),
  ]);

  const index = bucketConversations(recent, { now, weeks });
  for (const row of latest) {
    const key = String(row._id);
    let entry = index.get(key);
    if (!entry) {
      entry = { weeks: new Array(weeks).fill(0), lastActivity: null, sessionsThisWeek: 0 };
      index.set(key, entry);
    }
    const t = toTime(row.lastActivity);
    if (t && (!entry.lastActivity || t > entry.lastActivity.getTime())) entry.lastActivity = new Date(t);
  }
  return index;
}

/**
 * Decorate lean student docs in place with an `activity` block and a
 * corrected weeklyActiveTutoringMinutes, so every downstream reader (cards,
 * KPI tiles, alerts, exports) reads the same truthful numbers.
 */
function applyActivity(students, index, now = Date.now()) {
  for (const s of students || []) {
    const entry = index.get(String(s._id)) || { weeks: new Array(DEFAULT_WEEKS).fill(0), lastActivity: null, sessionsThisWeek: 0 };
    const lastActiveAt = resolveLastActiveAt(s, entry.lastActivity);
    s.activity = {
      lastActiveAt,
      weeklyMinutes: entry.weeks.map(m => Math.round(m)),
      sessionsThisWeek: entry.sessionsThisWeek,
    };
    // The legacy field keeps its name for back-compat, but no longer lies.
    s.weeklyActiveTutoringMinutes = getEffectiveWeeklyMinutes(s, now);
  }
  return students;
}

module.exports = {
  WEEK_MS,
  DEFAULT_WEEKS,
  getEffectiveWeeklyMinutes,
  resolveLastActiveAt,
  bucketConversations,
  buildActivityIndex,
  applyActivity,
};

'use strict';
/* ============================================================
   parentChildProfile.js — the facts a parent reads on a child's card:
   school grade, current courses, placement, and the practice streak.

   The card used to print `${gradeLevel} · ${mathCourse}` — "9 · 5th Grade" —
   unlabeled. mathCourse is overwritten by the screener with the ASSESSED level
   (utils/gradeLevel.js), so a 9th grader working quadratics read as a 5th-grade
   student. gradeLevel.js already says the fix: school grade and assessed level
   are two different things; show both, labeled. Placement carries its date so a
   months-old result reads as what it is.
   ============================================================ */

const { assessedLevel } = require('./gradeLevel');
const { localDayKey, daysBetween } = require('./timeHelpers');

function schoolGradeLabel(g) {
  if (g == null || g === '') return null;
  const s = String(g).trim();
  if (/^(k|kindergarten)$/i.test(s)) return 'Kindergarten';
  if (/^\d{1,2}$/.test(s)) return `Grade ${s}`;
  return s; // already a label ("9th Grade", "College")
}

/**
 * @param {Object} child  lean user
 * @param {string[]} activeCourseNames  names of the child's active student courses
 */
function buildChildProfile(child, activeCourseNames = []) {
  const level = assessedLevel(child);
  const placementDate = child && (child.assessmentDate || (child.learningProfile && child.learningProfile.assessmentDate)) || null;
  return {
    schoolGrade: schoolGradeLabel(child && child.gradeLevel),
    courses: activeCourseNames.filter(Boolean),
    placement: level ? { level, date: placementDate ? new Date(placementDate).toISOString() : null } : null,
  };
}

/**
 * The streak as it stands NOW. dailyQuests.currentStreak is only rewritten when
 * the child next practises, so a lapsed streak keeps its old value until then;
 * read it through the same day rule bumpDailyStreak uses (today and yesterday
 * keep it alive; a one-day gap is covered by an unused weekly freeze).
 */
function readStreak(child, now = new Date()) {
  const dq = (child && child.dailyQuests) || {};
  const longest = dq.longestStreak || 0;
  const current = dq.currentStreak || 0;
  if (!dq.lastPracticeDate || !current) return { current: 0, longest };
  const tz = child.timezone || 'UTC';
  const gap = daysBetween(localDayKey(new Date(dq.lastPracticeDate), tz), localDayKey(now, tz));
  // Same freeze rule bumpDailyStreak applies (lazy require: gamificationEvents
  // pulls in the whole rewards stack).
  const { canUseStreakFreeze } = require('./gamificationEvents');
  const alive = gap <= 1 || (gap === 2 && canUseStreakFreeze(child));
  return { current: alive ? current : 0, longest: Math.max(longest, alive ? current : 0) };
}

module.exports = { buildChildProfile, readStreak, schoolGradeLabel };

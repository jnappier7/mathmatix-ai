'use strict';
/* ============================================================
   gradeLevel.js — ONE answer to "what grade level is this student?"

   The question has FIVE answer fields, written by different flows:
     • user.gradeLevel                          — stated at signup (school grade)
     • user.mathCourse                          — enrollment course, OVERWRITTEN by
                                                  the screener to the assessed level
     • user.initialPlacement                    — assessed level, but THREE historic
                                                  formats: "5th Grade" (current),
                                                  "Theta: -0.3 (35th percentile)"
                                                  (legacy), raw skill names (legacy
                                                  assessment route)
     • learningProfile.initialPlacement         — screener mirror of the above
     • learningProfile.abilityEstimate.gradeLevel — screener-written level string

   Same disease as the skill-id / theta / masteryScore seams: readers picked a
   field at random. Known production shape: practicePack banded worksheet
   difficulty on user.gradeLevel (the SIGNUP grade) even after the screener
   assessed the student at a different level.

   TWO DISTINCT QUESTIONS — pick the right one:
     resolveGradeLevel(user)  — "what level MATH is this student working at?"
       Assessed level when one exists, stated grade otherwise. Use for anything
       ability-sensitive: content difficulty, course recommendations, badge-tier
       visibility.
     user.gradeLevel (read directly) — "what school grade is this student in?"
       Identity/demographics: rosters, exports, Clever sync, IEP goal templates,
       reading-level / Lexile targeting (a 10th grader doing 5th-grade math
       still reads like a 10th grader). Those readers are CORRECT as-is.
   ============================================================ */

/**
 * Parse a level string to a comparable grade number.
 * Returns null for anything it doesn't positively recognize — this doubles as
 * the validity filter that keeps legacy junk ("Theta: -0.3 (35th percentile)",
 * raw skill names) out of the resolution chain.
 * K → 0; courses map to their typical grade (Algebra 1 → 9, … Calculus → 12).
 */
function levelToGradeNumber(level) {
  if (typeof level !== 'string') {
    return typeof level === 'number' && Number.isInteger(level) && level >= 0 && level <= 13
      ? level
      : null;
  }
  const s = level.trim();
  if (!s || /^theta\b/i.test(s)) return null;

  if (/^(pre-?k|kinder(garten)?|k)$/i.test(s)) return 0;

  let m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:\s+grade)?(?:\s+math)?$/i)
       || s.match(/^grade\s+(\d{1,2})$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 13 ? n : null;
  }

  if (/^algebra\s*(1|i)$/i.test(s)) return 9;
  if (/^geometry$/i.test(s)) return 10;
  if (/^algebra\s*(2|ii)$/i.test(s)) return 11;
  if (/^trig(onometry)?$/i.test(s)) return 11;
  if (/^stat(istic)?s$/i.test(s)) return 11;
  if (/^pre-?calc(ulus)?$/i.test(s)) return 12;
  if (/^calc(ulus)?(\s*[123]|\s*i{1,3})?$/i.test(s)) return 12;
  if (/^advanced\s+math$/i.test(s)) return 13;
  if (/^college$/i.test(s)) return 13;

  return null;
}

/** A string is a usable level only if it parses to a grade number. */
function isLevelString(s) {
  return typeof s === 'string' && levelToGradeNumber(s) !== null;
}

/**
 * The assessed math level, or null if the student was never assessed (or only
 * legacy-junk placement strings survive). Order: the screener/growth-check
 * "current level" field first, then the initial-placement mirrors.
 */
function assessedLevel(user) {
  if (!user) return null;
  const lp = user.learningProfile || {};
  const candidates = [
    lp.abilityEstimate && lp.abilityEstimate.gradeLevel,
    lp.initialPlacement,
    user.initialPlacement,
  ];
  for (const c of candidates) {
    if (isLevelString(c)) return c.trim();
  }
  return null;
}

/**
 * THE canonical answer: assessed level when present, stated grade otherwise.
 * Returns a display string ("5th Grade", "Algebra 1") or null.
 */
function resolveGradeLevel(user) {
  const assessed = assessedLevel(user);
  if (assessed) return assessed;
  const stated = user && user.gradeLevel;
  return typeof stated === 'string' && stated.trim() ? stated.trim() : null;
}

/** resolveGradeLevel as a number (K=0). Null when nothing parseable exists. */
function resolveGradeNumber(user) {
  return levelToGradeNumber(resolveGradeLevel(user));
}

/**
 * The $set fragment every ASSESSED-LEVEL writer must use (screener completion,
 * growth check). Keeps the "current level" read paths — abilityEstimate string
 * and the mathCourse pathway the tutor loads — in agreement from this write
 * forward. Deliberately does NOT touch initialPlacement (that's the *initial*
 * placement, a historical record) or user.gradeLevel (school grade, identity).
 */
function assessedLevelWritePatch(levelString) {
  return {
    'learningProfile.abilityEstimate.gradeLevel': levelString,
    mathCourse: levelString,
  };
}

/**
 * The $set fragment for the adjacent boolean seam: user.assessmentCompleted
 * (28 readers) vs learningProfile.assessmentCompleted (growth check, student
 * progress, dashboards). Every writer must flip BOTH — demo seeds set only the
 * nested one (top-level readers saw "never assessed"), while teacher/admin
 * resets cleared only the top one (growth checks still ran on stale placement).
 */
function assessmentCompletedPatch(done) {
  return {
    assessmentCompleted: done,
    'learningProfile.assessmentCompleted': done,
  };
}

module.exports = {
  levelToGradeNumber,
  isLevelString,
  assessedLevel,
  resolveGradeLevel,
  resolveGradeNumber,
  assessedLevelWritePatch,
  assessmentCompletedPatch,
};

'use strict';
/* ============================================================
   schoolYear.js — what "this year" means for a class roster.

   US school years roll over in summer. We anchor on JULY 1: anything from
   Jul 1 2026 through Jun 30 2027 is "2026-27". That boundary is what the
   archive stopgap ("no login since June 30") and the new-year prompt
   (from Aug 1, when a teacher has no current-year class) both hang on.

   Labels are "YYYY-YY" strings because that is how teachers say them and
   how they sort (lexicographic order == chronological order).
   ============================================================ */

const ROLLOVER_MONTH = 6; // July (0-based)
const PROMPT_MONTH = 7;   // August — when the "start the new year" wizard nudges

function startYearOf(date = new Date()) {
  const d = new Date(date);
  return d.getMonth() >= ROLLOVER_MONTH ? d.getFullYear() : d.getFullYear() - 1;
}

function labelFor(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function schoolYearOf(date = new Date()) {
  return labelFor(startYearOf(date));
}

function currentSchoolYear(now = new Date()) {
  return schoolYearOf(now);
}

function previousSchoolYear(now = new Date()) {
  return labelFor(startYearOf(now) - 1);
}

/** [start, end) of a "YYYY-YY" label. */
function rangeOf(label) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(label || ''));
  if (!m) return null;
  const y = Number(m[1]);
  if (((y + 1) % 100) !== Number(m[2])) return null;
  return { start: new Date(y, ROLLOVER_MONTH, 1), end: new Date(y + 1, ROLLOVER_MONTH, 1) };
}

function isValidSchoolYear(label) {
  return rangeOf(label) !== null;
}

/** The start of the current year — "no activity since" cutoff for archiving last year. */
function currentYearStart(now = new Date()) {
  return new Date(startYearOf(now), ROLLOVER_MONTH, 1);
}

/** True once the new year is underway enough that a roster with no current-year class deserves a nudge. */
function isNewYearPromptSeason(now = new Date()) {
  const d = new Date(now);
  const m = d.getMonth();
  return m >= PROMPT_MONTH || m < ROLLOVER_MONTH; // Aug → Jun
}

/** A class's year: its stored label, else the year it was created in. */
function classSchoolYear(cls) {
  if (cls && isValidSchoolYear(cls.schoolYear)) return cls.schoolYear;
  return schoolYearOf(cls && cls.createdAt ? cls.createdAt : new Date());
}

module.exports = {
  currentSchoolYear,
  previousSchoolYear,
  schoolYearOf,
  rangeOf,
  isValidSchoolYear,
  currentYearStart,
  isNewYearPromptSeason,
  classSchoolYear,
};

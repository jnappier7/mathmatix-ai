// utils/courseAudience.js
//
// Who a pathway course is FOR: 'student' (the curriculum courses) or 'parent'
// (the parent-math-* guides). The concurrent-course cap in
// routes/courseSession.js /enroll counts per audience, so a parent who also
// holds the student role is not locked out of a parent guide by their own two
// student courses (and vice versa).
//
// The audience lives in the pathway JSON (`"audience": "parent"`); a pathway
// without the field is a student course. New CourseSession docs also store
// `audience`, but sessions written before that field existed don't — so the
// courseId → pathway lookup here is the source of truth for old docs.

const fs = require('fs');
const path = require('path');

const RESOURCES_DIR = path.join(__dirname, '../public/resources');
const SAFE_COURSE_ID = /^[a-z0-9][a-z0-9-]*$/i;
const AUDIENCES = ['student', 'parent'];

const cache = new Map();

/** Audience of a pathway object (missing/unknown → 'student'). */
function pathwayAudience(pathway) {
  const a = pathway && pathway.audience;
  return AUDIENCES.includes(a) ? a : 'student';
}

/**
 * Audience for a courseId, read from its pathway file. Unknown, unreadable or
 * unsafe ids resolve to 'student' — the conservative side, since that is the
 * audience whose cap exists to protect the learner's focus.
 */
function courseAudience(courseId) {
  if (typeof courseId !== 'string' || !SAFE_COURSE_ID.test(courseId)) return 'student';
  if (cache.has(courseId)) return cache.get(courseId);
  let audience = 'student';
  try {
    const raw = fs.readFileSync(path.join(RESOURCES_DIR, `${courseId}-pathway.json`), 'utf8');
    audience = pathwayAudience(JSON.parse(raw));
  } catch (_) {
    audience = 'student';
  }
  cache.set(courseId, audience);
  return audience;
}

/** Audience of a stored CourseSession — the stored field when present, else the pathway. */
function sessionAudience(session) {
  if (session && AUDIENCES.includes(session.audience)) return session.audience;
  return courseAudience(session && session.courseId);
}

/**
 * Concurrent-enrollment cap per audience. Student courses keep the long-standing
 * cap of 2 (focus). Parent guides are not capped: there are only three of them,
 * one per grade band, and a parent with children in different bands needs each.
 * `null` = no cap.
 */
const MAX_CONCURRENT_BY_AUDIENCE = Object.freeze({ student: 2, parent: null });

function maxConcurrentFor(audience) {
  return Object.prototype.hasOwnProperty.call(MAX_CONCURRENT_BY_AUDIENCE, audience)
    ? MAX_CONCURRENT_BY_AUDIENCE[audience]
    : MAX_CONCURRENT_BY_AUDIENCE.student;
}

module.exports = {
  pathwayAudience,
  courseAudience,
  sessionAudience,
  maxConcurrentFor,
  MAX_CONCURRENT_BY_AUDIENCE,
};

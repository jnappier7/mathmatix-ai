/**
 * The database half of course placement (the pure half is coursePlacement.js
 * and coursePreAssessment.js).
 *
 *   bankForCourse(pathway)          which course skills the problem bank can test
 *   preAssessmentAvailable(id)      is the course's quick check worth offering
 *   applyPlacementToActiveCourses   after a Starting Point, close what it proved
 *
 * THE ID SEAM. A course names its skills with its own ids ("g6-unit-rates");
 * the problem bank predates the courses and keys the same content under bank
 * ids ("unit-rates"). The quick check used to query the bank by the course's
 * ids alone, found nothing, and told the student "No pre-assessment available
 * for this course yet" — on courses whose content was sitting in the bank under
 * the mapped id. Every lookup here goes through skillLookupCandidates, the same
 * expansion the tutor's own practice lookup uses.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const CourseSession = require('../models/courseSession');
const { skillLookupCandidates } = require('./skillCanonicalizer');
const { courseSkills, ITEMS_PER_SKILL } = require('./coursePreAssessment');
const { ownedCourseSkills, applyPlacement } = require('./coursePlacement');
const { pathwayAudience } = require('./courseAudience');

const RESOURCES_DIR = path.join(__dirname, '../public/resources');
const SAFE_COURSE_ID = /^[a-z0-9][a-z0-9-]*$/i;

// A check that can test only a handful of skills tells the course little and reads
// as broken. Below this, the course falls back to the Starting Point instead.
const MIN_TESTABLE_SKILLS = 5;

const AVAILABILITY_TTL_MS = 10 * 60 * 1000;
const availabilityCache = new Map();   // courseId → { at, testable }

function loadPathway(courseId) {
  if (typeof courseId !== 'string' || !SAFE_COURSE_ID.test(courseId)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(RESOURCES_DIR, `${courseId}-pathway.json`), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * For each course skill: the bank ids that hold its content and how many
 * usable items they have between them.
 *
 * @returns {{ skills: Array<{skillId,rawId,moduleId,bankIds:string[],count:number}>,
 *             available: Object<string,number>, bankToCourse: Map<string,string[]> }}
 */
async function bankForCourse(pathway) {
  const skills = courseSkills(pathway).map((s) => {
    const bankIds = [];
    for (const id of skillLookupCandidates(s.rawId).concat(skillLookupCandidates(s.skillId))) {
      if (!bankIds.includes(id)) bankIds.push(id);
    }
    return { ...s, bankIds, count: 0 };
  });

  const allIds = Array.from(new Set(skills.flatMap((s) => s.bankIds)));
  const counts = allIds.length
    ? await Problem.aggregate([
      { $match: { skillId: { $in: allIds }, isActive: { $ne: false } } },
      { $group: { _id: '$skillId', n: { $sum: 1 } } },
    ])
    : [];
  const byBankId = new Map(counts.map((c) => [c._id, c.n]));

  const available = {};
  const bankToCourse = new Map();
  for (const s of skills) {
    s.count = s.bankIds.reduce((sum, id) => sum + (byBankId.get(id) || 0), 0);
    available[s.skillId] = s.count;
    for (const id of s.bankIds) {
      if (!bankToCourse.has(id)) bankToCourse.set(id, []);
      if (!bankToCourse.get(id).includes(s.skillId)) bankToCourse.get(id).push(s.skillId);
    }
  }
  return { skills, available, bankToCourse };
}

/** How many of a course's skills the bank can test (cached ~10 min). */
async function testableSkillCount(courseId) {
  const hit = availabilityCache.get(courseId);
  if (hit && Date.now() - hit.at < AVAILABILITY_TTL_MS) return hit.testable;
  const pathway = loadPathway(courseId);
  if (!pathway) return 0;
  const { skills } = await bankForCourse(pathway);
  const testable = skills.filter((s) => s.count >= ITEMS_PER_SKILL).length;
  availabilityCache.set(courseId, { at: Date.now(), testable });
  return testable;
}

/** Is the course's own quick check worth offering? */
async function preAssessmentAvailable(courseId) {
  return (await testableSkillCount(courseId)) >= MIN_TESTABLE_SKILLS;
}

/** Courses that place by a full practice test run their own loop — leave them be. */
function isPlacementCourse(courseId, pathway) {
  if (!pathway || pathwayAudience(pathway) !== 'student') return false;
  try {
    return !require('./practiceTests').isPrepCourse(courseId);
  } catch {
    return true;
  }
}

/**
 * Apply what the student owns to ONE session (not saved — the caller saves).
 * Returns the applyPlacement summary, or null when placement does not apply.
 */
function placeSession(session, user, pathway) {
  if (!session || !isPlacementCourse(session.courseId, pathway)) return null;
  return applyPlacement(session, pathway, ownedCourseSkills(user, pathway));
}

/**
 * A placement just changed what the student owns (Starting Point, growth
 * check): close the modules it proved in every course they are taking.
 * Non-fatal by contract — the caller has already saved the placement itself.
 *
 * @returns {Array<{courseId,courseName,closed:number,modulesLeft:number}>}
 */
async function applyPlacementToActiveCourses(user) {
  const out = [];
  if (!user || !user._id) return out;
  // This is an add-on to a placement that has already been saved. With no live
  // connection mongoose would BUFFER the query for 10 s before failing — and
  // hold the student's results screen for it. Skip instead.
  if (mongoose.connection.readyState !== 1) return out;
  const sessions = await CourseSession.find({ userId: user._id, status: 'active' });
  for (const session of sessions) {
    const pathway = loadPathway(session.courseId);
    const result = placeSession(session, user, pathway);
    if (!result || (!result.closed.length && !result.moved)) continue;
    await session.save();
    out.push({
      courseId: session.courseId,
      courseName: session.courseName,
      closed: result.closed.length,
      modulesLeft: result.modulesLeft,
    });
  }
  return out;
}

module.exports = {
  MIN_TESTABLE_SKILLS,
  loadPathway,
  bankForCourse,
  testableSkillCount,
  preAssessmentAvailable,
  isPlacementCourse,
  placeSession,
  applyPlacementToActiveCourses,
  _resetCache: () => availabilityCache.clear(),
};

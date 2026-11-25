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
const { checkSourcesFor } = require('./courseCheckSources');
const { courseSkills, buildStageBlueprint, ITEMS_PER_SKILL } = require('./coursePreAssessment');
const { ownedCourseSkills, applyPlacement } = require('./coursePlacement');
const { pathwayAudience } = require('./courseAudience');
const { gradeOne } = require('./skillChallenge');
const { normalizeOptions } = require('./mcOptions');

const RESOURCES_DIR = path.join(__dirname, '../public/resources');
const SAFE_COURSE_ID = /^[a-z0-9][a-z0-9-]*$/i;

const AVAILABILITY_TTL_MS = 10 * 60 * 1000;
const availabilityCache = new Map();   // courseId → { at, testable }
const stageCache = new Map();          // courseId → { at, ok }

function loadPathway(courseId) {
  if (typeof courseId !== 'string' || !SAFE_COURSE_ID.test(courseId)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(RESOURCES_DIR, `${courseId}-pathway.json`), 'utf8'));
  } catch {
    return null;
  }
}

// The practice-test banks (ACT, SAT). Their items are written for a timed
// exam and are what a practice test's fresh forms are drawn from, so the quick
// check uses them only for a skill that has nothing else.
const TEST_BANK_SOURCE = /^(act-|sat-)/;

/**
 * Can this item be put in front of a student in the quick check?
 *
 * The check shows the prompt as plain text and grades through gradeOne, so an
 * item is only usable when (a) it needs no figure — the live bank has hundreds
 * that carry an svg or say "the figure shown" — and (b) it grades CLEANLY:
 * exactly one option is right, or its own answer is accepted. Measured on the
 * live bank (2026-11-21, 21,797 items) about 30 items fail (b); on a check that
 * decides how much of a course a student sits, one mis-keyed item is one
 * module wrongly kept or wrongly closed.
 */
/**
 * A typed box takes ONE short answer. The old bank holds worksheet questions
 * whose stored answer is a paragraph or a list — "(a) 3t + 7b; (b) $71",
 * "Mistake: added before multiplying; correct value is 22", "slope = −4,
 * y-intercept = 6". The grader accepts that exact string and nothing a student
 * would type, so right work is marked wrong. Such an item is not for a check.
 */
function isMultiPart(item) {
  const value = String((item.answer && item.answer.value) || '');
  if (/(^|[\s;,])\(?[a-c]\)\s/i.test(value)) return true;          // lettered parts
  if (/[;—]/.test(value)) return true;                              // two statements
  if ((value.match(/=/g) || []).length > 1) return true;            // two things named
  if ((value.match(/[A-Za-z]{3,}/g) || []).length >= 3) return true; // a sentence
  return /(^|\s)\(?a\)\s[\s\S]*\s\(?b\)\s/.test(String(item.prompt || ''));
}

function isCheckable(item) {
  if (!item || !item.prompt) return false;
  if (item.svg || item.figure) return false;
  if (/\b(shown|figure|diagram|pictured)\b|\b(graph|table|chart|number line) (above|below)\b/i.test(item.prompt)) return false;
  try {
    if (servedForm(item) === 'choice') {
      return normalizeOptions(item.options).filter((o) => gradeOne(item, o.label).correct).length === 1;
    }
    const value = item.answer && item.answer.value;
    if (value === undefined || value === null || String(value) === '') return false;
    if (isMultiPart(item)) return false;
    const typed = asTyped(item);
    return gradeOne(typed, String(value)).correct && !gradeOne(typed, 'definitely not the answer').correct;
  } catch {
    return false;
  }
}

/**
 * How the check presents an item: 'choice' (its options) or 'typed' (a box).
 *
 * Most of the old bank was written as typed-answer questions and given options
 * later by a converter, and those options are not distractors — "In 0.908,
 * which digit is in the tenths place?  14 · 19 · 6 · 9", "Simplify 7:8 —
 * 8 · 7:8 · 9 · 6". Only one option is even the right KIND of thing, so the
 * item can be answered without the skill, and a check that closes modules on
 * two such items per skill would close them for a guesser. An item is from that
 * population when it has options but no `correctOption`; when its answer is
 * something a student can type (a number, fraction, ratio or amount), the check
 * asks for it typed, as it was written. Authored multiple choice, and anything
 * whose answer is words, stays multiple choice.
 *
 * Pure in the item, so the GET that serves and the POST that grades agree.
 */
const TYPEABLE = /^(?:[-−+]?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?|[-−+]?\$?\d+(?:\.\d+)?%?|[-−+]?\d+\s?[/:]\s?\d+|[-−+]?\d+ \d+\/\d+)$/;

function servedForm(item) {
  const options = normalizeOptions(item && item.options);
  if (!options.length) return 'typed';
  if (item.correctOption) return 'choice';
  const value = String((item.answer && item.answer.value) ?? '').trim();
  if (/^[A-Ha-h]$/.test(value)) return 'choice';                    // the key is a letter
  // ONE value a student types one way: a number, a fraction or ratio, a mixed
  // number. Not a list ("3, 21, 26") — spacing and separators would be graded.
  if (TYPEABLE.test(value)) return 'typed';
  return 'choice';
}

/** The item as graded when it was served typed: same key, no options. */
function asTyped(item) {
  return { ...item, options: [], correctOption: undefined };
}

/** The item as the grader should see it, given how the check served it. */
function forGrading(item) {
  return servedForm(item) === 'typed' ? asTyped(item) : item;
}

/** Grade a check submission the way the item was served. */
function gradeServed(item, submitted) {
  return gradeOne(servedForm(item) === 'typed' ? asTyped(item) : item, submitted);
}

/** The query half of isCheckable: active, no baked figure. */
function checkableMatch(ids, { testBanks }) {
  const match = { skillId: { $in: ids }, isActive: { $ne: false }, svg: { $in: [null, ''] }, figure: null };
  if (!testBanks) match.source = { $not: TEST_BANK_SOURCE };
  return match;
}

/**
 * For each course skill: the bank ids that hold its content and how many
 * usable items they have between them. Tutoring-bank items are counted first;
 * a skill that has too few of those may also draw on the practice-test banks
 * (`testBanks: true` on the skill).
 *
 * A skill named in courseCheckSources draws ONLY on the ids listed there
 * (`atLevel: true`), practice-test banks included.
 *
 * @returns {{ skills: Array<{skillId,rawId,moduleId,bankIds:string[],count:number,testBanks:boolean}>,
 *             available: Object<string,number>, bankToCourse: Map<string,string[]> }}
 */
async function bankForCourse(pathway) {
  const courseId = pathway && pathway.courseId;
  const skills = courseSkills(pathway).map((s) => {
    // A skill the course has its own at-level items for is tested from those
    // and nothing else — never from the general pool the crosswalk points at
    // (courseCheckSources.js says why).
    const own = checkSourcesFor(courseId, s.rawId, s.skillId);
    if (own) return { ...s, bankIds: own, count: 0, testBanks: false, atLevel: true };
    const bankIds = [];
    for (const id of skillLookupCandidates(s.rawId).concat(skillLookupCandidates(s.skillId))) {
      if (!bankIds.includes(id)) bankIds.push(id);
    }
    return { ...s, bankIds, count: 0, testBanks: false };
  });

  // Count what the check can actually SERVE: an item has to pass isCheckable,
  // and "grades cleanly" cannot be asked of the database. This used to be a
  // database count with "headroom", so a pool that was all worksheet questions
  // counted as testable, the stage was built around it, and it served nothing.
  const allIds = Array.from(new Set(skills.flatMap((s) => s.bankIds)));
  const tutoring = new Map();
  const testBank = new Map();
  if (allIds.length) {
    const cursor = Problem.find(checkableMatch(allIds, { testBanks: true }))
      .select('skillId prompt answer options correctOption answerType source svg figure')
      .lean()
      .cursor();
    for await (const item of cursor) {
      if (!isCheckable(item)) continue;
      const into = TEST_BANK_SOURCE.test(item.source || '') ? testBank : tutoring;
      into.set(item.skillId, (into.get(item.skillId) || 0) + 1);
    }
  }

  const available = {};
  const bankToCourse = new Map();
  for (const s of skills) {
    const own = s.bankIds.reduce((sum, id) => sum + (tutoring.get(id) || 0), 0);
    const exam = s.bankIds.reduce((sum, id) => sum + (testBank.get(id) || 0), 0);
    s.testBanks = !s.atLevel && own < ITEMS_PER_SKILL * 2;
    s.count = s.testBanks ? own + exam : own;
    available[s.skillId] = s.count;
    for (const id of s.bankIds) {
      if (!bankToCourse.has(id)) bankToCourse.set(id, []);
      if (!bankToCourse.get(id).includes(s.skillId)) bankToCourse.get(id).push(s.skillId);
    }
  }
  return { skills, available, bankToCourse };
}

/**
 * `count` items for one course skill, chosen at random from what is checkable.
 * Over-samples and filters in code, because "grades cleanly" cannot be asked of
 * the database.
 */
async function pickItems(bankSkill, count, exclude) {
  if (!bankSkill || !bankSkill.bankIds || !bankSkill.bankIds.length) return [];
  const match = checkableMatch(bankSkill.bankIds, { testBanks: !!bankSkill.testBanks });
  // Two course skills can share a bank skill; one item must not stand for both
  // (its answer would be filed under only one of them).
  if (exclude && exclude.length) match._id = { $nin: exclude };
  const sampled = await Problem.aggregate([
    { $match: match },
    { $sample: { size: Math.max(count * 6, 12) } },
  ]);
  const out = [];
  const seen = new Set();
  const take = (items) => {
    for (const item of items) {
      if (out.length >= count) break;
      const key = String(item.prompt).toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key) || !isCheckable(item)) continue;
      seen.add(key);
      out.push(item);
    }
  };
  take(sampled);
  if (out.length < count) {
    // A pool that is mostly uncheckable: the sample missed what bankForCourse
    // counted. Read the whole pool rather than serve a short stage.
    const got = new Set(sampled.map((i) => String(i._id)));
    const rest = (await Problem.find(match).lean()).filter((i) => !got.has(String(i._id)));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    take(rest);
  }
  return out;
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

/**
 * Is the course's own quick check worth offering?
 *
 * The check runs in stages, a whole module at a time (buildStageBlueprint), so
 * the question is whether it has a FIRST stage: can the bank test every skill
 * of the course's first module. Where it cannot — a course whose bank has not
 * been filled — the course opens with the Starting Point instead. (This used to
 * be "at least N testable skills anywhere in the course", which offered a check
 * that then had nothing it could close.)
 */
async function preAssessmentAvailable(courseId) {
  const hit = stageCache.get(courseId);
  if (hit && Date.now() - hit.at < AVAILABILITY_TTL_MS) return hit.ok;
  const pathway = loadPathway(courseId);
  let ok = false;
  if (pathway) {
    const { available } = await bankForCourse(pathway);
    ok = buildStageBlueprint(pathway, { available }).skills.length > 0;
  }
  stageCache.set(courseId, { at: Date.now(), ok });
  return ok;
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
  // A course the student restarted is taken from the beginning on purpose:
  // nothing they already own closes a module behind their back.
  if (session.fromTheBeginning) return null;
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
  loadPathway,
  bankForCourse,
  pickItems,
  isCheckable,
  servedForm,
  gradeServed,
  forGrading,
  testableSkillCount,
  preAssessmentAvailable,
  isPlacementCourse,
  placeSession,
  applyPlacementToActiveCourses,
  _resetCache: () => { availabilityCache.clear(); stageCache.clear(); },
};

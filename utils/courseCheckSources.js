/**
 * Which bank skills a COURSE'S CHECK may draw on, for the course skills where
 * the general crosswalk is not good enough.
 *
 * The crosswalk (skillCanonicalizer) answers "where is content for this skill"
 * and points at the nearest large pool. For tutoring that is a reasonable
 * start. For a check that closes a module on two items, it is not: read against
 * the live bank, "volume of a cylinder" resolved to rectangular-prism items,
 * "ordering real numbers" to "Order 14, 16, 6", and four different circle
 * skills to the equation of a circle. A student could be checked out of a unit
 * without meeting its content.
 *
 * So a course may name, skill by skill, the bank ids that truly test it:
 *
 *   seeds/course-level-sources.generated.json   written by scripts/buildCourseLevelItems.js —
 *                                               one entry per skill it wrote items for
 *   seeds/course-level-sources.manual.json      by hand — a better pool that already exists
 *
 * A skill listed here is tested from those ids AND NOTHING ELSE. That is the
 * point: until its items are seeded the skill reads as untestable and the check
 * stops there (the course teaches it), rather than falling back to the pool
 * that was wrong. Skills not listed keep the crosswalk.
 *
 * Practice surfaces that have no course in hand use atLevelIdsFor (below).
 */

const fs = require('fs');
const path = require('path');

const SEEDS = path.join(__dirname, '../seeds');
const FILES = ['course-level-sources.generated.json', 'course-level-sources.manual.json'];

let cache = null;

function load() {
  if (cache) return cache;
  cache = {};
  for (const file of FILES) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(SEEDS, file), 'utf8'));
    } catch {
      continue;   // a missing file means "no overrides", never a crash
    }
    for (const [courseId, skills] of Object.entries(data)) {
      if (courseId.startsWith('_') || !skills || typeof skills !== 'object') continue;
      cache[courseId] = cache[courseId] || {};
      for (const [courseSkill, ids] of Object.entries(skills)) {
        if (Array.isArray(ids) && ids.length) cache[courseId][courseSkill] = ids.slice();
      }
    }
  }
  return cache;
}

/**
 * The bank ids the check must use for one course skill, or null to use the
 * crosswalk. `ids` are the names the course knows the skill by (raw and
 * canonical).
 */
function checkSourcesFor(courseId, ...ids) {
  const forCourse = load()[courseId];
  if (!forCourse) return null;
  for (const id of ids) {
    if (id && forCourse[id]) return forCourse[id].slice();
  }
  return null;
}

/**
 * The at-level bank ids for a skill, WITHOUT a course in hand — for the
 * surfaces that know only the skill (spaced review, practice packs, the
 * mastery test-out). A skill id means the same content in every course that
 * uses it (checked 2026-11-22: of 75 overrides only `transformations` and
 * `congruence-similarity` appear in a second course, a parent guide to the same
 * grade band), so the union across courses is the right pool.
 *
 * Returns [] when no course has written items for the skill. Callers PREFER
 * these ids and fall back to the crosswalk when the bank holds nothing under
 * them — practice with an imperfect item beats no practice, which is the one
 * place this differs from a course's check.
 */
let reverse = null;
function atLevelIdsFor(...ids) {
  if (!reverse) {
    reverse = new Map();
    for (const skills of Object.values(load())) {
      for (const [courseSkill, bankIds] of Object.entries(skills)) {
        const set = reverse.get(courseSkill) || new Set();
        bankIds.forEach((id) => set.add(id));
        reverse.set(courseSkill, set);
      }
    }
  }
  const out = [];
  for (const id of ids) {
    for (const bankId of (id && reverse.get(id)) || []) if (!out.includes(bankId)) out.push(bankId);
  }
  return out;
}

/** Every override, for tests and audits: { courseId: { courseSkill: [bankIds] } }. */
function allCheckSources() {
  return JSON.parse(JSON.stringify(load()));
}

module.exports = { checkSourcesFor, atLevelIdsFor, allCheckSources, _reset: () => { cache = null; reverse = null; } };

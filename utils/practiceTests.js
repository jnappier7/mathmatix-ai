/**
 * PRACTICE TESTS — the one place a timed practice test differs from another.
 *
 * routes/actTest.js is the runner for every timed, fixed-form practice test:
 * assemble a form to a blueprint, freeze it, let the student move freely,
 * grade once at /complete, report. Everything that is specific to ONE exam
 * lives here, and the route reads it from `req.testDef` (set per mount in
 * config/routes.js). A request with no definition is the ACT — the rail that
 * existed before this file, which must keep behaving exactly as it did.
 *
 * What a definition carries:
 *   testId       — stored on every session; history, resume and "start fresh"
 *                  are all scoped by it, so an SAT start never abandons an
 *                  in-progress ACT (or the reverse).
 *   blueprint    — the form's composition, ramp, scale (seeds/*-blueprint.json).
 *   skillName    — skillId -> the name the report shows for a weak skill.
 *   courseId     — the prep course a finished test retargets and seeds a
 *                  review queue into. null: the test stands alone.
 *   buildPlan    — byCategory -> the triage plan that course consumes. null:
 *                  no plan (the report carries plan: null).
 *   creditSkills — whether a clean category credits course skills through the
 *                  ACT crosswalk. ACT only: the crosswalk is ACT's.
 *
 * @module utils/practiceTests
 */

const ACT_BLUEPRINT = require('../seeds/act-math-blueprint.json');
const SAT_BLUEPRINT = require('../seeds/sat-math-blueprint.json');
const { buildActPlan } = require('./actBootcampPlan');
const { studentLabel } = require('./studentLabels');

// skillId → human-readable name, so the report can name EXACT weak skills
// (e.g. "Quadratic Equations") rather than just the broad category.
const ACT_SKILL_NAMES = (() => {
  // Broad category names — fallback if an item lacks a fine sub-skill tag.
  const map = {
    'act-number-quantity': 'Number & Quantity',
    'act-algebra': 'Algebra',
    'act-functions': 'Functions',
    'act-geometry': 'Geometry',
    'act-statistics-probability': 'Statistics & Probability',
    'act-integrating-essential-skills': 'Integrating Essential Skills',
  };
  // Fine-grained skill names generated from the Fable bank's per-item `skill`
  // tags (scripts/ingestFableActItems.py) — e.g. act-quadratic-equations →
  // "Quadratic equations". Lets the report name EXACT weak skills.
  try {
    const fine = require('../seeds/act-skill-names.json');
    for (const [id, name] of Object.entries(fine)) map[id] = name;
  } catch { /* fine-grained names optional */ }
  // Legacy prep-skill catalog, if present (superset of names).
  try {
    const seed = require('../seeds/skills-act-math-prep.json');
    const arr = Array.isArray(seed) ? seed : (seed.skills || []);
    for (const s of arr) map[s.skillId] = s.displayName || s.skillId;
  } catch { /* optional */ }
  return map;
})();

const SAT_CATEGORY_NAMES = {
  'algebra': 'Algebra',
  'advanced-math': 'Advanced Math',
  'problem-solving-data': 'Problem-Solving & Data Analysis',
  'geometry-trig': 'Geometry & Trigonometry',
};

const TESTS = {
  'act-math': {
    testId: 'act-math',
    label: 'ACT',
    blueprint: ACT_BLUEPRINT,
    // Missing ids fall through to the raw id, as they always have.
    skillName: (id) => ACT_SKILL_NAMES[id],
    courseId: 'act-prep',
    buildPlan: buildActPlan,
    creditSkills: true,
  },
  'sat-math': {
    testId: 'sat-math',
    label: 'SAT',
    blueprint: SAT_BLUEPRINT,
    // Unified-taxonomy ids: the shared student-facing label file, never the
    // raw id (a dotted id once reached a student as a skill name).
    skillName: (id) => SAT_CATEGORY_NAMES[id] || (id && id !== 'unknown' ? studentLabel(id) : undefined),
    courseId: null,
    buildPlan: null,
    creditSkills: false,
  },
};

const DEFAULT_TEST_ID = 'act-math';

/** The definition for a testId; unknown or missing ids are the ACT. */
function getTestDef(testId) {
  return TESTS[testId] || TESTS[DEFAULT_TEST_ID];
}

/**
 * The session filter that scopes a query to one test. ACT sessions written
 * before testId was read anywhere may lack it, so the ACT also claims those.
 */
function testScope(def) {
  const d = def || getTestDef();
  return d.testId === DEFAULT_TEST_ID
    ? { testId: { $in: [DEFAULT_TEST_ID, null] } }
    : { testId: d.testId };
}

/** Express middleware: every request on this mount runs as `testId`. */
function useTest(testId) {
  if (!TESTS[testId]) throw new Error(`Unknown practice test: ${testId}`);
  return (req, _res, next) => { req.testDef = TESTS[testId]; next(); };
}

module.exports = {
  TESTS,
  DEFAULT_TEST_ID,
  getTestDef,
  testScope,
  useTest,
};

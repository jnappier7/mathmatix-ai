/**
 * Student self-reported learning supports.
 *
 * The third and lowest tier of the accommodations stack:
 *
 *   iepPlan.accommodations          school, legally binding, teacher-written
 *   learningProfile.familySupports  parent request
 *   learningProfile.studentSupports what the student says they need  <- here
 *
 * Why this tier exists: a student with no engaged parent, at a school that has
 * never heard of Mathmatix, currently has no way to say "I need the problem
 * read aloud." That is precisely the family the product is for.
 *
 * @module utils/studentSupports
 */

/**
 * Switches a student may set for themselves.
 *
 * The line is accessibility vs rigor. Everything here changes how reachable
 * the work is; nothing here changes how hard it is. calculatorAllowed and
 * digitalMultiplicationChart are excluded on purpose — a student granting
 * themselves a calculator is a different act from a student asking for extra
 * time, and utils/antiGaming.js exists because that distinction matters.
 * A parent or teacher can still grant those.
 */
const SELF_REPORTABLE_KEYS = [
  'extendedTime',
  'reducedDistraction',
  'audioReadAloud',
  'chunkedAssignments',
  'breaksAsNeeded',
  'largePrintHighContrast',
  'mathAnxietySupport'
];

/** Never settable by a student, at any tier. */
const RIGOR_KEYS = ['calculatorAllowed', 'digitalMultiplicationChart'];

/**
 * When a student reports math anxiety, write the numeric level too.
 *
 * learningProfile.mathAnxietyLevel is read in four places — promptCompact
 * ("Math anxiety: HIGH"), pipeline/suggestions, the teacher dashboard column,
 * and the IEP template recommender — but nothing outside demo seed data has
 * ever written it, so it sat at its default of 5 forever and the HIGH branch
 * could not fire for a real user. The student is the right author for it.
 */
const ANXIETY_REPORTED = 8;   // clears the >6 threshold the prompt checks
const ANXIETY_DENIED = 3;     // below it, and distinguishable from the default 5

/**
 * Apply a student's self-report onto their studentSupports subdocument.
 *
 * Only the accessibility switches are read, and only a literal `true` enables
 * one. Anything else in the body — rigor keys, iepPlan, role, arbitrary
 * fields — is ignored.
 *
 * @param {Object} target - the studentSupports subdocument to mutate
 * @param {Object} body   - untrusted request body
 * @param {Object} [meta] - { now }
 * @returns {Object} the mutated target
 */
function applyStudentSupportsUpdate(target, body, meta = {}) {
  const src = body && typeof body === 'object' ? body : {};

  SELF_REPORTABLE_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      target[key] = src[key] === true;
    }
  });

  target.updatedAt = meta.now || new Date();
  return target;
}

/**
 * The numeric anxiety level implied by a self-report, or null when the student
 * did not answer the question at all (so an existing value is left alone).
 *
 * @param {Object} body - untrusted request body
 * @returns {number|null}
 */
function anxietyLevelFromReport(body) {
  const src = body && typeof body === 'object' ? body : {};
  if (!Object.prototype.hasOwnProperty.call(src, 'mathAnxietySupport')) return null;
  return src.mathAnxietySupport === true ? ANXIETY_REPORTED : ANXIETY_DENIED;
}

/**
 * Normalise a stored subdocument into the flat shape the API returns.
 *
 * @param {Object|null} studentSupports
 * @returns {Object} every self-reportable switch as a real boolean
 */
function readStudentSupports(studentSupports) {
  const src = studentSupports || {};
  const out = {};
  SELF_REPORTABLE_KEYS.forEach(key => { out[key] = src[key] === true; });
  return out;
}

/**
 * Which switches a higher tier already owns, so the UI can show them as
 * already handled rather than inviting a student to ask for something they
 * have already been granted.
 *
 * @param {Object|null} iepPlan
 * @param {Object|null} familySupports
 * @returns {Object} switch -> already granted above
 */
function grantedAbove(iepPlan, familySupports) {
  const iep = (iepPlan && iepPlan.accommodations) || {};
  const fam = familySupports || {};
  const out = {};
  SELF_REPORTABLE_KEYS.forEach(key => {
    out[key] = iep[key] === true || fam[key] === true;
  });
  return out;
}

module.exports = {
  SELF_REPORTABLE_KEYS,
  RIGOR_KEYS,
  ANXIETY_REPORTED,
  ANXIETY_DENIED,
  applyStudentSupportsUpdate,
  anxietyLevelFromReport,
  readStudentSupports,
  grantedAbove
};

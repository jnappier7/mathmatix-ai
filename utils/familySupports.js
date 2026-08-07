/**
 * Parent-set learning supports.
 *
 * These are accommodations a parent asked for, stored on
 * learningProfile.familySupports and kept separate from iepPlan, which is a
 * school-authored legal record only a teacher may write. A school IEP always
 * wins on conflict — see utils/promptHelpers.js for how that is applied to the
 * tutor prompt.
 *
 * The update logic lives here rather than inline in routes/parent.js so the
 * whitelist can be unit-tested without a database. It is the security boundary
 * for this feature: everything a parent sends arrives as untrusted input.
 *
 * @module utils/familySupports
 */

/** The nine switches a parent may set. Mirrors familySupportsSchema. */
const FAMILY_SUPPORT_KEYS = [
  'extendedTime',
  'reducedDistraction',
  'calculatorAllowed',
  'audioReadAloud',
  'chunkedAssignments',
  'breaksAsNeeded',
  'digitalMultiplicationChart',
  'largePrintHighContrast',
  'mathAnxietySupport'
];

const NOTE_MAX = 500;

/**
 * Apply a parent's requested changes onto a familySupports subdocument.
 *
 * Only the nine known switches are read, and only a literal `true` enables one
 * — 'yes', 1 and other truthy junk are treated as off rather than guessed at.
 * Anything else in the body (iepPlan, role, subscriptionTier, unknown keys) is
 * ignored, so this route cannot be used to reach the rest of the user document.
 *
 * @param {Object} target - the familySupports subdocument to mutate
 * @param {Object} body   - untrusted request body
 * @param {Object} [meta] - { updatedBy, now }
 * @returns {Object} the mutated target
 */
function applyFamilySupportsUpdate(target, body, meta = {}) {
  const src = body && typeof body === 'object' ? body : {};

  FAMILY_SUPPORT_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      target[key] = src[key] === true;
    }
  });

  if (typeof src.note === 'string') {
    target.note = src.note.trim().slice(0, NOTE_MAX);
  }

  target.updatedAt = meta.now || new Date();
  if (meta.updatedBy) target.updatedBy = meta.updatedBy;

  return target;
}

/**
 * Normalise a stored subdocument into the flat shape the API returns.
 *
 * @param {Object|null} familySupports
 * @returns {Object} every switch present as a real boolean
 */
function readFamilySupports(familySupports) {
  const src = familySupports || {};
  const out = {};
  FAMILY_SUPPORT_KEYS.forEach(key => { out[key] = src[key] === true; });
  return out;
}

/**
 * Which switches the school's IEP already owns, and therefore which a parent
 * must not be invited to change.
 *
 * @param {Object|null} iepPlan
 * @returns {Object} switch -> locked
 */
function lockedBySchool(iepPlan) {
  const accom = (iepPlan && iepPlan.accommodations) || {};
  const out = {};
  FAMILY_SUPPORT_KEYS.forEach(key => { out[key] = accom[key] === true; });
  return out;
}

module.exports = {
  FAMILY_SUPPORT_KEYS,
  NOTE_MAX,
  applyFamilySupportsUpdate,
  readFamilySupports,
  lockedBySchool
};

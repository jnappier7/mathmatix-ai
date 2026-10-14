/**
 * ENGINE STORE — the one keyed accessor for user.learningEngines.{bkt,fsrs,consistency}.
 *
 * Those three stores are Mongoose Maps, and a Mongoose Map key cannot contain a
 * '.'. Since the mastery-boundary migration (c6825fae, 2026-07-18) per-skill
 * engine state has been keyed by the CANONICAL skill id, and ~370 of the 807
 * catalog skills canonicalize to a dotted unified id ("order-of-operations" →
 * "MS.EQV.10"). Writing that key made the whole user document fail validation
 * ("Cast to Map failed"), so persist's user.save() rejected and the turn's XP and
 * skillMastery credit were dropped — silently, because persist failure is logged
 * as non-fatal. skillMastery solved the identical problem with encodeMasteryKey;
 * this module applies the same codec to the engine stores.
 *
 *   write  → canonical id, encoded ("MS_EQV_10"); a legacy raw-id entry for the
 *            same skill is folded into the new key so state converges on one key
 *   read   → encoded canonical, then the raw id (pre-migration legacy entries)
 *   iterate→ decoded logical ids, with junk keys ("undefined"/"null"/"") dropped —
 *            24 accounts still carry an "undefined" key from before ad442ada
 *
 * Every keyed read/write of an engine store should go through here.
 */

const { canonicalSkillId, isUnifiedSkillId, encodeMasteryKey, decodeMasteryKey } = require('./skillCanonicalizer');

// Unified ids are upper-case dotted segments ("MS.EQV.10"); encoded, they are the
// same with underscores ("MS_EQV_10"). The shape alone isn't proof — an id like
// "REV_WARMUP_B" has it too — so a key is only decoded when the result is a real
// unified id.
const ENCODED_SHAPE = /^[A-Z0-9]+(_[A-Z0-9]+)+$/;

function isValidSkillKey(key) {
  if (key == null) return false;
  const s = String(key).trim();
  return s !== '' && !['undefined', 'null', 'unknown', 'NaN'].includes(s);
}

// A key as stored, or an id as a caller passes it, → the logical (dotted) id.
function logicalSkillId(key) {
  if (!isValidSkillKey(key)) return null;
  const s = String(key);
  if (ENCODED_SHAPE.test(s)) {
    const decoded = decodeMasteryKey(s);
    if (isUnifiedSkillId(decoded)) return decoded;
  }
  return s;
}

// The Map key a skill's engine state lives under.
function engineStorageKey(skillId) {
  const logical = logicalSkillId(skillId);
  if (!logical) return null;
  return encodeMasteryKey(canonicalSkillId(logical) || logical);
}

const getFrom = (store, k) => (typeof store?.get === 'function' ? store.get(k) : store?.[k]);

function readEngineEntry(store, skillId) {
  if (!store) return null;
  const key = engineStorageKey(skillId);
  if (!key) return null;
  const found = getFrom(store, key);
  if (found != null) return found;
  // Legacy entries were stored under the raw id the caller had at the time.
  const logical = logicalSkillId(skillId);
  if (logical !== key && !logical.includes('.')) {
    const legacy = getFrom(store, logical);
    if (legacy != null) return legacy;
  }
  return null;
}

/**
 * Store `value` as `skillId`'s state in user.learningEngines[engine].
 * Returns the storage key, or null when the id is unusable (nothing written).
 */
function writeEngineEntry(user, engine, skillId, value) {
  const key = engineStorageKey(skillId);
  if (!user || !key) return null;
  if (!user.learningEngines) user.learningEngines = {};
  if (!user.learningEngines[engine]) user.learningEngines[engine] = new Map();
  const store = user.learningEngines[engine];

  // Fold a legacy raw-id entry into the canonical key so the skill's state
  // stops splitting across two keys.
  const logical = logicalSkillId(skillId);
  const legacyKey = logical !== key && !logical.includes('.') && getFrom(store, logical) != null ? logical : null;

  if (typeof store.set === 'function') {
    store.set(key, value);
    if (legacyKey) store.delete(legacyKey);
  } else {
    store[key] = value;
    if (legacyKey) delete store[legacyKey];
  }
  if (typeof user.markModified === 'function') user.markModified(`learningEngines.${engine}`);
  return key;
}

/**
 * [logicalSkillId, value] pairs for an engine store (Map or plain object), with
 * junk keys dropped. Use this — never raw .entries() — when iterating.
 */
function engineEntries(store) {
  if (!store) return [];
  const raw = typeof store.entries === 'function' ? Array.from(store.entries()) : Object.entries(store);
  const out = [];
  for (const [key, value] of raw) {
    const id = logicalSkillId(key);
    if (id && value != null) out.push([id, value]);
  }
  return out;
}

module.exports = {
  isValidSkillKey,
  logicalSkillId,
  engineStorageKey,
  readEngineEntry,
  writeEngineEntry,
  engineEntries,
};

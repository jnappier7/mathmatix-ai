/**
 * MASTERY GUARD — small, shared helpers for "is this skill done?" decisions.
 *
 * Centralizes the logic that prevents:
 * - Starting a badge for a skill the student has already mastered
 * - Leaving a stuck activeBadge (high attempt count, low accuracy) pinned
 *   to the student's profile, which would keep dominating the tutor's
 *   focus queue and suggestion chips
 *
 * Shares the familiarity model with TutorPlan so badges and the tutor
 * agree on what "mastered" means.
 */

const TutorPlan = require('../models/tutorPlan');
const { canonicalSkillId } = require('./skillCanonicalizer');

// ── STORAGE KEY ENCODING ────────────────────────────────────────────────────
// user.skillMastery is a Mongoose Map, and Mongoose Maps THROW on keys that
// contain "." (they collide with MongoDB dot-notation). Every unified skill id
// is dotted — "ALG1.EQV.1" — so a naive `skillMastery.set('ALG1.EQV.1', …)`
// throws, the surrounding persist stage is caught non-fatally, and the write
// silently vanishes. That is a live data-loss bug for every crosswalked skill.
//
// Fix: store an ENCODED key ("ALG1_EQV_1") and keep the dotted id as the single
// logical id everywhere else (graph, board, closure, canonicalizer). No canonical
// skill id contains "_" (the namespace is dot- and hyphen-based: "MS.QNT.8",
// "2d-shapes"), so "." <-> "_" is a clean bijection.
//
// encode() is IDEMPOTENT: a value that already contains "_" is an already-encoded
// storage key, so it is returned unchanged. This matters because an encoded key
// can leak back into logical-id position — e.g. a tutorPlan.currentTarget.skillId
// persisted as "MS_QNT_8" by pre-fix code. An earlier version threw on that,
// which took the whole (non-fatal-guarded) TutorPlan load down on EVERY turn and
// silently stripped the tutor's persistent model of the student. Idempotence
// makes the layer resilient to that stale data with no migration required.
function encodeMasteryKey(id) {
  if (id == null) return id;
  const s = String(id);
  if (s.includes('_')) return s; // already encoded — encode is a no-op
  return s.replace(/\./g, '_');
}

function decodeMasteryKey(key) {
  return key == null ? key : String(key).replace(/_/g, '.');
}

// If a badge has been attempted this many times its requirement without
// being earned, we consider it stuck and clear it so the student can pick
// (or be routed to) a fresh target. 2x is conservative — it gives plenty
// of room for normal struggle before intervening.
const STUCK_BADGE_ATTEMPT_MULTIPLIER = 2;

// Central read accessor for a user's per-skill mastery entry. Canonicalizes the
// requested skillId to its unified id (so a lookup by a legacy kebab id finds the
// unified-keyed entry that new writes produce), then falls back to the raw id so
// historical legacy-keyed entries still resolve during the migration — no data
// backfill required. Every keyed read of skillMastery should go through here.
function getSkillMasteryEntry(user, skillId) {
  if (!user || !skillId) return null;
  const sm = user.skillMastery;
  if (!sm) return null;
  // Read by the encoded storage key. Also try the un-encoded key so any entry
  // written before this fix (only possible for non-dotted legacy ids) still
  // resolves.
  const read = (k) => {
    if (typeof sm.get === 'function') return sm.get(encodeMasteryKey(k)) || sm.get(k) || null;
    return sm[encodeMasteryKey(k)] || sm[k] || null;
  };
  const canon = canonicalSkillId(skillId);
  return read(canon) || (canon !== skillId ? read(skillId) : null);
}

// Write accessor — the single place a keyed skillMastery entry is stored.
// Resolves the logical key (canonical, or a present legacy key), encodes it for
// the Mongoose Map, sets it, and flags the path modified. Every `.set(` on
// skillMastery should go through here so the dot problem cannot recur.
function setSkillMasteryEntry(user, skillId, entry) {
  if (!user || !skillId) return entry;
  if (!user.skillMastery) user.skillMastery = new Map();
  const logicalKey = resolveMasteryKey(user, skillId);
  const storageKey = encodeMasteryKey(logicalKey);
  if (typeof user.skillMastery.set === 'function') user.skillMastery.set(storageKey, entry);
  else user.skillMastery[storageKey] = entry;
  if (typeof user.markModified === 'function') user.markModified('skillMastery');
  return entry;
}

function hasSkillMasteryEntry(user, skillId) {
  return getSkillMasteryEntry(user, skillId) != null;
}

// A plain, decoded (dotted-key) view of a user's skillMastery, for the closure /
// board / cascade code that reasons over the graph in logical ids. Mutating an
// entry object mutates the stored subdocument (same reference); NEW keys or rung
// changes produced by a cascade must be written back with setSkillMasteryEntry.
function decodedMasteryMap(user) {
  const out = new Map();
  const sm = user && user.skillMastery;
  if (!sm) return out;
  const iter = typeof sm.entries === 'function' ? sm.entries() : Object.entries(sm || {});
  for (const [k, v] of iter) out.set(decodeMasteryKey(k), v);
  return out;
}

// Resolve the skillMastery KEY to use for a read-modify-write on `skillId`.
// Prefers the canonical unified id; if no entry exists there but one exists under
// the raw (legacy) id, returns that so we update the historical entry in place
// instead of creating a duplicate; otherwise defaults to canonical (new entry).
function resolveMasteryKey(user, skillId) {
  if (!skillId) return skillId;
  const canon = canonicalSkillId(skillId);
  const sm = user && user.skillMastery;
  if (!sm) return canon;
  // Presence is checked against the ENCODED storage key (with a fallback to the
  // raw key for pre-fix legacy entries). Returns the LOGICAL (dotted) id; callers
  // that write must encode it — setSkillMasteryEntry does.
  const present = (k) => {
    const enc = encodeMasteryKey(k);
    if (typeof sm.get === 'function') return sm.get(enc) != null || sm.get(k) != null;
    return sm[enc] != null || sm[k] != null;
  };
  if (present(canon)) return canon;
  if (canon !== skillId && present(skillId)) return skillId;
  return canon;
}

/**
 * Is this skill already mastered for this user?
 * Uses the same TutorPlan.inferFamiliarity rule the tutor uses, so the
 * answer here is consistent with the tutor's instructional-mode pick.
 */
function isSkillMastered(user, skillId) {
  const entry = getSkillMasteryEntry(user, skillId);
  return TutorPlan.inferFamiliarity(entry) === 'mastered';
}

/**
 * Has an activeBadge attempted enough problems that we should consider it
 * stuck and clear it? Only fires when accuracy is still below requirement.
 */
function isBadgeStuck(badge) {
  if (!badge) return false;
  const required = badge.requiredProblems || 0;
  if (required <= 0) return false;
  const completed = badge.problemsCompleted || 0;
  if (completed < required * STUCK_BADGE_ATTEMPT_MULTIPLIER) return false;
  const accuracy = completed > 0 ? (badge.problemsCorrect || 0) / completed : 0;
  return accuracy < (badge.requiredAccuracy || 0);
}

/**
 * Clear the user's activeBadge and record the abandoned attempt.
 * Returns the previously-active badge for logging/telemetry, or null.
 *
 * `reason` is logged for observability; it isn't persisted on the attempt
 * subdoc because the User.masteryProgress.attempts schema only stores
 * { badgeId, attemptDate, completed, score }.
 */
function clearActiveBadge(user, reason) {
  if (!user?.masteryProgress?.activeBadge) return null;
  const prior = user.masteryProgress.activeBadge;
  const completed = prior.problemsCompleted || 0;
  const correct = prior.problemsCorrect || 0;
  const accuracy = completed > 0 ? correct / completed : 0;

  user.masteryProgress.activeBadge = null;
  if (!Array.isArray(user.masteryProgress.attempts)) {
    user.masteryProgress.attempts = [];
  }
  user.masteryProgress.attempts.push({
    badgeId: prior.badgeId,
    attemptDate: new Date(),
    completed: false,
    score: Math.round(accuracy * 100),
  });
  user.markModified('masteryProgress');

  if (reason && typeof console !== 'undefined') {
    console.log(`[masteryGuard] cleared activeBadge ${prior.badgeId} (skill=${prior.skillId}, ${correct}/${completed} = ${Math.round(accuracy * 100)}%): ${reason}`);
  }
  return prior;
}

module.exports = {
  STUCK_BADGE_ATTEMPT_MULTIPLIER,
  encodeMasteryKey,
  decodeMasteryKey,
  getSkillMasteryEntry,
  setSkillMasteryEntry,
  hasSkillMasteryEntry,
  decodedMasteryMap,
  resolveMasteryKey,
  isSkillMastered,
  isBadgeStuck,
  clearActiveBadge,
};

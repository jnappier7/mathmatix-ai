// Synchronous skill-id -> student-facing label, with NO database access.
//
// Why this exists: `utils/skillDisplayNames.js` resolves names through the Skill
// catalog, which is async. The tutor's system prompt is built by
// `promptCompact.generateSystemPrompt`, which is SYNCHRONOUS and called on every
// turn — it cannot await a catalog lookup, and making it async would ripple
// through the whole pipeline. So it used to derive names straight from the
// skillMastery Map key with `skillId.replace(/-/g, ' ')`, which only rewrites
// HYPHENS. Legacy kebab ids prettified fine; canonical unified ids are stored
// dot-encoded ("MS.QNT.8" -> "MS_QNT_8") and passed through untouched, so the
// tutor read "MS_QNT_8" as a skill name — and said it out loud to a student.
//
// The labels ship with the code in seeds/unified-taxonomy/student-labels.json,
// the same file the skill map reads for `studentLabel`. Loading it from disk
// (the pattern skillCanonicalizer already uses for the crosswalks) makes the
// lookup synchronous and dependency-free, so the sync prompt path can resolve a
// real name: "MS_QNT_8" -> "Math with negatives and fractions".
//
// Accepts either form — an encoded storage key or a logical id — and NEVER
// returns the raw encoded form: the fallback prettifies the decoded logical id.

const fs = require('fs');
const path = require('path');

const { canonicalSkillId, decodeMasteryKey } = require('./skillCanonicalizer');

const LABELS_FILE = path.join(__dirname, '..', 'seeds', 'unified-taxonomy', 'student-labels.json');

let labels = null; // Map<unifiedId, studentLabel>

function load() {
  labels = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf8'));
    for (const [id, label] of Object.entries(raw.labels || {})) {
      if (typeof label === 'string' && label.trim()) labels.set(id, label.trim());
    }
  } catch {
    // Absent or malformed (minimal test env) — every lookup falls back to the
    // prettified logical id. A missing label file must never break a prompt.
  }
  return labels;
}

// Last resort: turn "MS.QNT.8" / "order-of-operations" into something readable
// rather than the raw storage key. Mirrors skillDisplayNames.prettify.
function prettify(logicalId) {
  return String(logicalId)
    .replace(/[-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Resolve a skill id or skillMastery storage key to a student-facing label.
 *
 * @param {string} idOrKey - "MS_QNT_8", "MS.QNT.8", or "order-of-operations"
 * @returns {string} a human-readable label, never the encoded form
 */
function studentLabel(idOrKey) {
  if (idOrKey == null || idOrKey === '') return '';
  if (!labels) load();

  const logical = decodeMasteryKey(idOrKey);
  // Try the id as given first, then its canonical form: a legacy kebab id has a
  // label only under the unified id it crosswalks to.
  return labels.get(logical) || labels.get(canonicalSkillId(logical)) || prettify(logical);
}

// Test seam — drop the cache so a fixture file change is picked up.
function _reset() {
  labels = null;
}

module.exports = { studentLabel, _reset };

// Resolve skillMastery STORAGE KEYS to human display names via the Skill catalog.
//
// Why this exists: several readers used to derive a skill's display name straight
// from its Map key — `skillId.replace(/-/g, ' ')`. That worked only for legacy
// kebab ids ("order-of-operations" -> "Order Of Operations"). The canonical
// unified ids are stored dot-encoded ("MS.QNT.8" -> "MS_QNT_8"), so the same
// trick renders "Ms Qnt 8". Once records are migrated onto canonical keys, EVERY
// key-derived name would read like that — so every such reader must resolve the
// name through the catalog instead. This is the single place that does it.
//
// Input keys may be either form (encoded canonical or legacy kebab); we decode →
// canonicalize → look up Skill.displayName, and fall back to a prettified logical
// id (never the encoded underscore form) when the catalog has no match.

const Skill = require('../models/skill');
const { decodeMasteryKey } = require('./masteryGuard');
const { canonicalSkillId } = require('./skillCanonicalizer');

// Last-resort label when the catalog has no entry: turn "MS.QNT.8" / "order-of-
// operations" into something readable rather than "MS_QNT_8".
function prettify(logicalId) {
  return String(logicalId)
    .replace(/[-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * @param {Iterable<string>} storageKeys - keys as stored in user.skillMastery
 * @returns {Promise<Object>} map of ORIGINAL key -> display name
 */
async function resolveSkillDisplayNames(storageKeys) {
  const keys = Array.from(storageKeys || []);
  if (keys.length === 0) return {};

  // key -> { logical, canonical }
  const meta = {};
  const canonicalIds = new Set();
  for (const key of keys) {
    const logical = decodeMasteryKey(key);
    const canonical = canonicalSkillId(logical);
    meta[key] = { logical, canonical };
    canonicalIds.add(canonical);
  }

  let catalog = {};
  try {
    const skills = await Skill.find({ skillId: { $in: Array.from(canonicalIds) } })
      .select('skillId displayName')
      .lean();
    for (const s of skills) {
      if (s.displayName) catalog[s.skillId] = s.displayName;
    }
  } catch (_) {
    // Catalog unavailable → fall back to prettified ids below. Never throw: a
    // name lookup must not take down a progress endpoint.
  }

  const out = {};
  for (const key of keys) {
    const { logical, canonical } = meta[key];
    out[key] = catalog[canonical] || prettify(logical);
  }
  return out;
}

// Synchronous label prettifier for hot write paths with no catalog access (e.g.
// the recentWins "Mastered X" toast). Deliberately does NOT canonicalize: a
// legacy kebab id reads best as-is ("order-of-operations" -> "Order Of
// Operations"); canonicalizing it first would yield "MS QNT 8". Unified ids
// still degrade to "MS QNT 8" here, which is why user-facing READ paths use the
// async catalog resolver above instead.
function prettifyLabel(id) {
  return prettify(id);
}

module.exports = { resolveSkillDisplayNames, prettifyLabel };

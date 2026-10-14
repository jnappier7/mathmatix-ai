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

const fs = require('fs');
const path = require('path');
const Skill = require('../models/skill');
const { decodeMasteryKey } = require('./masteryGuard');
const { canonicalSkillId } = require('./skillCanonicalizer');
const { isValidSkillKey } = require('./engineStore');

// Last-resort label when the catalog has no entry: turn "MS.QNT.8" / "order-of-
// operations" into something readable rather than "MS_QNT_8".
function prettify(logicalId) {
  return String(logicalId)
    .replace(/[-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

// Exam / course namespaces that say where a skill came from, not what it is:
// "act-sequences" is the skill "Sequences", not "Act Sequences".
const NAMESPACE_PREFIX = /^(act|sat|psat|preact|cm|alg1|alg2|geo|calc)-/;

function humanize(logicalId) {
  return prettify(String(logicalId).replace(NAMESPACE_PREFIX, ''));
}

// Second-chance names for skills the live Skill catalog doesn't hold. Several
// banks key items to skills that exist only in seed files (the ACT name map, the
// consumer-math catalog that isn't in seed:all) — the two skills Jason has
// actually practiced among them. Those files ship with the code, so read them
// once, lazily; a missing or malformed file just contributes nothing.
let seedIndex = null;
function seedSkillIndex() {
  if (seedIndex) return seedIndex;
  seedIndex = {};
  const dir = path.join(__dirname, '..', 'seeds');
  let files;
  try { files = fs.readdirSync(dir); } catch (_) { return seedIndex; }
  for (const file of files) {
    const isCatalog = /^skills-.*\.json$/.test(file);
    const isNameMap = /-skill-names\.json$/.test(file);
    if (!isCatalog && !isNameMap) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (isNameMap && data && !Array.isArray(data)) {
        for (const [id, name] of Object.entries(data)) {
          if (typeof name === 'string' && !seedIndex[id]) seedIndex[id] = { name, category: null };
        }
      } else {
        const list = Array.isArray(data) ? data : data && data.skills;
        for (const sk of list || []) {
          if (!sk || !sk.skillId || !sk.displayName) continue;
          seedIndex[sk.skillId] = { name: sk.displayName, category: sk.category || (seedIndex[sk.skillId] || {}).category || null };
        }
      }
    } catch (_) { /* skip unreadable seed */ }
  }
  // { category: [skillId, …] } maps (ACT) fill in the category a name map lacks.
  for (const file of files.filter((f) => /-skills-by-category\.json$/.test(f))) {
    try {
      const byCat = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const [cat, ids] of Object.entries(byCat || {})) {
        for (const id of Array.isArray(ids) ? ids : []) {
          if (seedIndex[id] && !seedIndex[id].category) seedIndex[id].category = cat;
        }
      }
    } catch (_) { /* skip */ }
  }
  return seedIndex;
}

// "expressions-equations" -> "Expressions & Equations"; parents read these.
// Two-word category slugs are either a pair ("ratios-proportions") or a phrase
// ("word-problems", "place-value"); the slug can't tell you which, so the pairs
// in the catalog are listed.
const PAIR_CATEGORIES = new Set([
  'addition-subtraction', 'area-perimeter', 'counting-cardinality', 'exponential-logarithmic',
  'expressions-equations', 'integers-rationals', 'multiplication-division', 'number-quantity',
  'parametric-polar', 'ratios-proportions', 'sequences-series', 'statistics-probability',
]);

function categoryLabel(slug) {
  if (!slug) return null;
  const s = String(slug);
  if (PAIR_CATEGORIES.has(s)) return prettify(s).replace(' ', ' & ');
  if (/^applications-/.test(s)) return `Applications of ${prettify(s.slice('applications-'.length))}`;
  return prettify(s).replace(/\bAnd\b/g, '&').replace(/^3d\b/i, '3D');
}

/**
 * Resolve skill keys — engine or skillMastery storage keys, legacy or unified,
 * encoded or not — to { name, category } for people to read. Junk keys
 * ("undefined", "null", "") are omitted from the result entirely.
 *
 * Order: live catalog (canonical id, then the logical id itself) → seed files →
 * humanized id. Never returns a raw id, an encoded key, or "Undefined".
 *
 * @param {Iterable<string>} keys
 * @returns {Promise<Object>} map of ORIGINAL key -> { name, category|null }
 */
async function resolveSkillInfo(keys) {
  const list = Array.from(keys || []).filter(isValidSkillKey);
  if (list.length === 0) return {};

  const meta = {};
  const lookupIds = new Set();
  for (const key of list) {
    const logical = decodeMasteryKey(key);
    const canonical = canonicalSkillId(logical) || logical;
    meta[key] = { logical, canonical };
    lookupIds.add(canonical);
    lookupIds.add(logical);
  }

  const catalog = {};
  try {
    const skills = await Skill.find({ skillId: { $in: Array.from(lookupIds) } })
      .select('skillId displayName category')
      .lean();
    for (const s of skills) catalog[s.skillId] = s;
  } catch (_) {
    // Catalog unavailable → seed / humanized fallbacks below. Never throw: a
    // name lookup must not take down a progress endpoint.
  }

  const seeds = seedSkillIndex();
  const out = {};
  for (const key of list) {
    const { logical, canonical } = meta[key];
    const hit = catalog[canonical] || catalog[logical];
    const seed = seeds[logical] || seeds[canonical];
    out[key] = {
      name: (hit && hit.displayName) || (seed && seed.name) || humanize(logical),
      category: categoryLabel((hit && hit.category) || (seed && seed.category)),
    };
  }
  return out;
}

/**
 * @param {Iterable<string>} storageKeys - keys as stored in user.skillMastery
 * @returns {Promise<Object>} map of ORIGINAL key -> display name
 */
async function resolveSkillDisplayNames(storageKeys) {
  const info = await resolveSkillInfo(storageKeys);
  const out = {};
  for (const [key, v] of Object.entries(info)) out[key] = v.name;
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

module.exports = { resolveSkillDisplayNames, resolveSkillInfo, prettifyLabel, humanize, categoryLabel };

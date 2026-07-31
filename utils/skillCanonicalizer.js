// utils/skillCanonicalizer.js
//
// Single source of truth for normalizing any skillId to its canonical UNIFIED
// "Map of Mathmatix" id (seeds/unified-taxonomy/math_taxonomy.json).
//
// The content banks are being migrated onto unified skill ids, but legacy kebab
// ids (e.g. `solving-multi-step-equations`, `slope-from-two-points`) still appear
// in badge configs, the screener's skill lists, problemGenerator output, and any
// pre-migration data. Rather than sweep every call site, code that keys per-skill
// state — above all the mastery read/write boundary — routes skillIds through
// `canonicalSkillId()` so a legacy id and its unified id collapse to ONE node.
//
// The mapping is loaded from the reviewed per-bank crosswalks
// (seeds/unified-taxonomy/*-crosswalk.json); adding a bank's crosswalk is enough
// to extend coverage — no code change here. An id with no crosswalk entry is
// returned unchanged (safe default: unknown/already-unified ids pass through).

const fs = require('fs');
const path = require('path');

const TAX_DIR = path.join(__dirname, '..', 'seeds', 'unified-taxonomy');
const TAXONOMY_FILE = path.join(TAX_DIR, 'math_taxonomy.json');

let legacyToUnified = null; // Map<legacyId, unifiedId>
let unifiedIds = null; // Set<unifiedId>

function build() {
  legacyToUnified = new Map();
  unifiedIds = new Set();

  // Known unified ids (so we never rewrite an already-canonical id, and callers
  // can ask whether an id is unified).
  try {
    const tax = JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf8'));
    for (const s of tax.skills || []) unifiedIds.add(s.skill_id);
  } catch {
    // taxonomy missing (e.g. minimal test env) — resolver degrades to identity
  }

  // Merge every reviewed crosswalk. Filenames look like `alg1-crosswalk.json`.
  let files = [];
  try {
    files = fs.readdirSync(TAX_DIR).filter((f) => f.endsWith('-crosswalk.json'));
  } catch {
    files = [];
  }

  // A row only counts if its TARGET is a real unified taxonomy id.
  //
  // This function's contract is "normalize to the canonical UNIFIED id", and its
  // output is used as the mastery storage key. A row pointing anywhere else is
  // not a canonicalization, and honouring it silently re-keys where mastery is
  // written and read.
  //
  // That is not hypothetical: seeds/unified-taxonomy/pathway-crosswalk.json maps
  // "pathway skill ids -> BANK skill ids" (its own note says so) while reusing
  // the legacyId/unifiedId field names. The `*-crosswalk.json` glob swept it in,
  // so canonicalSkillId('act-linear-equations') started returning the bank id
  // 'linear-equations'. coursePreAssessment.creditFromTallies() canonicalizes
  // before crediting, so ACT baseline mastery was written under an id the ACT
  // course never teaches by — a student could ace a skill on the baseline and be
  // taught it from scratch anyway. Five other ACT ids moved with it, including
  // act-probability -> act-conditional-probability (a change of MEANING, not id)
  // and act-function-notation-evaluation, which seeds/act-crosswalk.json maps in
  // the opposite direction. Pinned by tests/unit/skillCanonicalizerScope.test.js.
  //
  // Gated on having actually loaded a taxonomy: if math_taxonomy.json is missing
  // (minimal test env) unifiedIds is empty, and filtering on it would drop every
  // legitimate row instead of degrading to identity as documented above.
  const canValidateTargets = unifiedIds.size > 0;

  // `approved` and `confidence` are REVIEW ANNOTATIONS, not gates. Do not filter
  // on them — it reads like an obvious hardening and is a regression.
  //
  // In alg1-crosswalk.json `approved: true` is exactly the 21 high-confidence
  // rows, so gating on it drops 43 of 64 mappings, among them plainly correct
  // ones: slope-from-two-points -> ALG1.PRP.2, solving-two-step-equations ->
  // ALG1.EQV.1. Each dropped id then stops collapsing onto its unified node and
  // becomes a SEPARATE mastery record — the split-record bug that shows up as a
  // student's mastery bar frozen while they keep answering correctly.
  //
  // Nor is many-to-one a symptom of low confidence: the unified taxonomy is
  // deliberately coarser than the bank's fine skills, and two HIGH-confidence
  // approved rows (factoring-gcf, factoring-by-grouping) collapse onto
  // ALG1.EQV.11 on purpose. Collapsing synonyms is the entire job.
  //
  // Where a row IS wrong, fix the row or the taxonomy — never filter here.
  // order-of-operations used to land on MS.QNT.8 (rational number operations),
  // merging operation precedence with signed-rational arithmetic; it now has its
  // own node, MS.EQV.10. Filtering would have split the 40-odd correct mappings
  // to spare that one. Pinned by tests/unit/skillCanonicalizerScope.test.js.

  for (const f of files.sort()) {
    let cw;
    try {
      cw = JSON.parse(fs.readFileSync(path.join(TAX_DIR, f), 'utf8'));
    } catch {
      continue;
    }
    for (const row of cw.rows || []) {
      if (!row || !row.legacyId || !row.unifiedId) continue;
      if (canValidateTargets && !unifiedIds.has(row.unifiedId)) continue;
      // First crosswalk wins on collision (deterministic via sorted filenames);
      // never let a legacy id shadow a real unified id.
      if (!legacyToUnified.has(row.legacyId) && !unifiedIds.has(row.legacyId)) {
        legacyToUnified.set(row.legacyId, row.unifiedId);
      }
    }
  }
}

function ensure() {
  if (legacyToUnified === null) build();
}

/**
 * Normalize a skillId to its canonical unified id.
 * - already-unified id  -> returned unchanged
 * - mapped legacy id    -> its unified id
 * - unknown id / falsy  -> returned unchanged (safe passthrough)
 */
function canonicalSkillId(skillId) {
  if (!skillId) return skillId;
  ensure();
  if (unifiedIds.has(skillId)) return skillId;
  return legacyToUnified.get(skillId) || skillId;
}

/** True if `skillId` is a real unified taxonomy id. */
function isUnifiedSkillId(skillId) {
  ensure();
  return unifiedIds.has(skillId);
}

/** Test/diagnostic helper: force a rebuild (e.g. after fixture changes). */
function _reset() {
  legacyToUnified = null;
  unifiedIds = null;
}

/**
 * Every id the CATALOG might key a skill under, for a given input id — the
 * canonical unified id, the raw id as given, and any legacy ids that map to
 * the same canonical node. The Skill collection predates unification and is
 * keyed by bank/legacy ids, so `Skill.findOne({ skillId: canonicalSkillId(x) })`
 * misses whenever a crosswalk entry exists — the "Skill not found" challenge
 * bug. Query with { skillId: { $in: skillLookupCandidates(x) } } instead.
 */
function skillLookupCandidates(skillId) {
  if (!skillId) return [];
  if (!legacyToUnified) build();
  const raw = String(skillId);
  const canon = canonicalSkillId(raw);
  const out = [];
  const push = (id) => { if (id && !out.includes(id)) out.push(id); };
  push(canon);
  push(raw);
  for (const [legacy, unified] of legacyToUnified.entries()) {
    if (unified === canon) push(legacy);
  }
  return out;
}

/** $in-expansion of skillLookupCandidates over a list, deduped. */
function expandSkillIds(ids) {
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    for (const c of skillLookupCandidates(id)) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * Find the catalog doc for a (possibly mastery-side) id among docs fetched
 * with expandSkillIds — the doc may be keyed under any candidate form.
 */
function matchSkillDoc(docs, skillId) {
  const cands = skillLookupCandidates(skillId);
  return (Array.isArray(docs) ? docs : []).find(d => d && cands.includes(d.skillId)) || null;
}

module.exports = { canonicalSkillId, isUnifiedSkillId, skillLookupCandidates, expandSkillIds, matchSkillDoc, _reset };

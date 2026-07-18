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
  for (const f of files.sort()) {
    let cw;
    try {
      cw = JSON.parse(fs.readFileSync(path.join(TAX_DIR, f), 'utf8'));
    } catch {
      continue;
    }
    for (const row of cw.rows || []) {
      if (!row || !row.legacyId || !row.unifiedId) continue;
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

module.exports = { canonicalSkillId, isUnifiedSkillId, _reset };

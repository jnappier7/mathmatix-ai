// utils/actCrosswalk.js
//
// Bridges the two ACT skill taxonomies that grew apart: the practice-ACT item
// bank tags items with fine-grained BASELINE ids (seeds/act-math-blueprint.json,
// 44 skills), while the ACT course teaches by coarser COURSE ids
// (public/modules/act-prep/*, 36 skills) — only 8 ids ever matched. Because
// /api/act-test/complete credits mastery by baseline id but the course reads
// course ids, "skip what you aced" never reached the course. seeds/act-crosswalk
// .json maps baseline -> course; this loads it and merges per-skill tallies onto
// the course id so credited mastery lands where the course will see it.

const fs = require('fs');
const path = require('path');

let MAP = null;

function loadMap() {
  if (MAP) return MAP;
  MAP = {};
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../seeds/act-crosswalk.json'), 'utf8'));
    for (const [k, v] of Object.entries(raw)) {
      if (k === '_README' || !v || !v.course) continue;
      MAP[k] = v.course;
    }
  } catch (err) {
    // No crosswalk / unreadable → empty map. Crediting simply falls back to the
    // raw baseline ids (the prior behaviour), never throws.
    MAP = {};
  }
  return MAP;
}

/** The course skill id a baseline skill id credits toward, or null if unmapped. */
function toCourseSkill(baselineSkillId) {
  return loadMap()[baselineSkillId] || null;
}

/**
 * Re-key per-skill tallies from baseline ids to course ids, SUMMING when several
 * baseline skills map to one course skill (the baseline is finer). A course skill
 * is only "clean" (and thus creditable) when every baseline item under it was
 * correct — exactly the semantics creditFromTallies expects. Unmapped baseline
 * ids are dropped (they have no course home to credit yet).
 *
 * @param {Object<string,{correct:number,total:number}>} bySkill baseline tallies
 * @returns {Object<string,{correct:number,total:number}>} course-keyed tallies
 */
function mergeTalliesToCourse(bySkill) {
  const map = loadMap();
  const out = {};
  for (const [id, v] of Object.entries(bySkill || {})) {
    const course = map[id];
    if (!course) continue;
    out[course] = out[course] || { correct: 0, total: 0 };
    out[course].correct += v.correct || 0;
    out[course].total += v.total || 0;
  }
  return out;
}

module.exports = { toCourseSkill, mergeTalliesToCourse, _loadMap: loadMap };

/**
 * A student-readable name for a course skill id.
 *
 * Course skills are named in the pathway by id only ("g6-unit-rates"), and most
 * have no document in the Skill collection (the live catalog has none for the
 * middle-school, Early Math or Consumer Math courses). Their names are in the
 * skill seed files, which ship with the code — so read them from disk once, and
 * fall back to a tidy version of the id.
 */
const fs = require('fs');
const path = require('path');

const SEEDS_DIR = path.join(__dirname, '../seeds');
let names = null;

function load() {
  names = new Map();
  let files = [];
  try { files = fs.readdirSync(SEEDS_DIR).filter((f) => /^skills-.*\.json$/.test(f)).sort(); } catch { return; }
  for (const f of files) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, f), 'utf8')); } catch { continue; }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.skills) ? data.skills : []);
    for (const s of list) {
      if (!s || !s.skillId || names.has(s.skillId)) continue;
      const label = s.studentLabel || s.displayName || s.name;
      if (label) names.set(s.skillId, String(label));
    }
  }
}

/** "g6-unit-rates" → "Unit rates" when no seed names it. */
function tidy(skillId) {
  const words = String(skillId)
    .replace(/^(g\d|emf|cm|act|sat)-/, '')
    .replace(/[-_.]+/g, ' ')
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(skillId);
}

function courseSkillLabel(skillId) {
  if (!skillId) return '';
  if (!names) load();
  return names.get(skillId) || tidy(skillId);
}

module.exports = { courseSkillLabel, _tidy: tidy };

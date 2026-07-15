// tests/unit/alg1Skills.test.js
// Guards the Algebra 1 skill wiring: every fine sub-skill the Fable bank tags is
// a valid, schema-conformant Skill catalog doc (so BKT / mastery / skillFocus
// recognize it), and every prerequisite reference resolves. Requiring the Skill
// model loads mongoose but needs no DB (validateSync runs offline).

const path = require('path');
const Skill = require('../../models/skill');

const seed = (f) => require(path.join('../../seeds', f));

const catalog = seed('skills-algebra-1.json');
const fable = seed('skills-algebra-1-fable.json');
const byModule = seed('alg1-skills-by-module.json');

const catalogIds = new Set(catalog.map((s) => s.skillId));
const fableIds = new Set(fable.map((s) => s.skillId));
const allIds = new Set([...catalogIds, ...fableIds]);

// Every distinct skillId the bank tags, and the subset flagged as new.
const bankSkills = new Set();
const newSkills = new Set();
for (const skills of Object.values(byModule)) {
  for (const s of skills) {
    bankSkills.add(s.skillId);
    if (!s.inCatalog) newSkills.add(s.skillId);
  }
}

describe('alg1 fable skill catalog', () => {
  test('every fine skill the bank uses exists in catalog or the fable skill file', () => {
    const uncovered = [...bankSkills].filter((id) => !allIds.has(id));
    expect(uncovered).toEqual([]);
  });

  test('the fable skill file provides exactly the NEW skills (no misses, no extras)', () => {
    const missing = [...newSkills].filter((id) => !fableIds.has(id));
    const extra = [...fableIds].filter((id) => !newSkills.has(id));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  test('no fable skill collides with a curated catalog id', () => {
    const collisions = [...fableIds].filter((id) => catalogIds.has(id));
    expect(collisions).toEqual([]);
  });

  test('every skill doc validates against the Skill schema', () => {
    const failures = [];
    for (const doc of fable) {
      const err = new Skill(doc).validateSync();
      if (err) failures.push(`${doc.skillId}: ${Object.keys(err.errors).join(', ')}`);
    }
    expect(failures).toEqual([]);
  });

  test('every prerequisite reference resolves to a known skill', () => {
    const bad = [];
    for (const doc of fable) {
      for (const p of doc.prerequisites || []) {
        if (!allIds.has(p)) bad.push(`${doc.skillId} -> ${p}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('all fable skills are course "Algebra 1" with a fluency profile', () => {
    for (const doc of fable) {
      expect(doc.course).toBe('Algebra 1');
      expect(doc.fluencyMetadata && doc.fluencyMetadata.fluencyType).toBeTruthy();
    }
  });
});

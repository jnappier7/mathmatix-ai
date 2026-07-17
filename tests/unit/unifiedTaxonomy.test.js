// tests/unit/unifiedTaxonomy.test.js
// Guards the unified "Map of Mathmatix" taxonomy adoption: the generated Skill
// docs cover every taxonomy skill, validate against the Skill schema, use the
// six strands, and have a fully-resolving prerequisite graph. Requiring the
// Skill model loads mongoose but needs no DB.

const path = require('path');
const Skill = require('../../models/skill');

const seed = (f) => require(path.join('../../seeds', f));

const taxonomy = seed('unified-taxonomy/math_taxonomy.json');
const docs = seed('skills-unified.json');

const STRANDS = ['QNT', 'PRP', 'EQV', 'FNC', 'SPC', 'DTA'];
const taxIds = new Set(taxonomy.skills.map((s) => s.skill_id));
const docIds = new Set(docs.map((d) => d.skillId));

describe('unified taxonomy', () => {
  test('a Skill doc exists for every taxonomy skill (and no extras)', () => {
    expect(docs).toHaveLength(taxonomy.skills.length);
    const missing = [...taxIds].filter((id) => !docIds.has(id));
    const extra = [...docIds].filter((id) => !taxIds.has(id));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    expect(docIds.size).toBe(docs.length); // unique
  });

  test('every doc validates against the Skill schema', () => {
    const fails = docs
      .map((d) => new Skill(d).validateSync())
      .filter(Boolean)
      .map((e) => Object.keys(e.errors).join(','));
    expect(fails).toEqual([]);
  });

  test('every doc carries a valid strand and a course level', () => {
    for (const d of docs) {
      expect(STRANDS).toContain(d.strand);
      expect(typeof d.courseLevel).toBe('string');
      expect(d.courseLevel.length).toBeGreaterThan(0);
    }
    // all six strands are used
    expect(new Set(docs.map((d) => d.strand)).size).toBe(6);
  });

  test('every prerequisite reference resolves to a taxonomy skill', () => {
    const bad = [];
    for (const d of docs) {
      for (const p of d.prerequisites || []) {
        if (!taxIds.has(p)) bad.push(`${d.skillId} -> ${p}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

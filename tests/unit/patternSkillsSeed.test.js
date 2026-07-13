/**
 * Structural validation + coverage ratchet for the pattern-skill seed
 * (seeds/skills-pattern-based.json), which `npm run seed:skills` upserts into
 * the Skill catalog. No DB/LLM — pure data checks, so it runs in CI.
 *
 * Guards two things:
 *   1. Every seed entry is schema-valid (so a bad hand-edit can't reach the DB).
 *   2. Coverage of the pattern-badge milestones only moves forward — the count
 *      of milestone-referenced skillIds with no definition can't climb back up.
 */

const seed = require('../../seeds/skills-pattern-based.json');
const { PATTERN_BADGES } = require('../../utils/patternBadges');

// Mirrors the enum in models/skill.js (fluencyMetadata.fluencyType).
const FLUENCY_TYPES = ['reflex', 'process', 'algorithm', 'conceptual', 'procedural', 'application'];

// The high-traffic batch added in this change. These are held to the full rich
// schema (quarter + fluencyMetadata + teachingGuidance), beyond the universal
// baseline that all — including leaner legacy — entries must meet.
const NEW_BATCH = new Set([
  'one-step-equations-addition', 'one-step-equations-multiplication', 'unit-rates', 'proportions',
  'percent-problems', 'order-of-operations', 'numerical-expressions-exponents', 'factoring-gcf',
  'slope-intercept-form', 'graphing-linear-equations', 'integer-addition', 'integer-subtraction',
  'probability-basics', 'statistics-probability', 'inverse-functions',
]);

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const has3Arrays = (tg) => tg && Array.isArray(tg.coreConcepts) && Array.isArray(tg.commonMistakes) && Array.isArray(tg.teachingTips);

// Ratchet: milestone-referenced skillIds still missing a definition. Lower this
// as you add more skill defs; never raise it. (Was 50 before the high-traffic
// batch; 35 after.)
const MAX_MISSING_DEFINITIONS = 35;

function referencedSkillIds() {
  const ids = new Set();
  const patterns = Array.isArray(PATTERN_BADGES) ? PATTERN_BADGES : Object.values(PATTERN_BADGES);
  for (const p of patterns) {
    for (const t of p.tiers || []) {
      for (const m of t.milestones || []) {
        for (const sid of m.skillIds || []) ids.add(sid);
      }
    }
  }
  return ids;
}

describe('pattern-skill seed: schema', () => {
  test('every entry meets the universal baseline (and optional fields, when present, are well-formed)', () => {
    const problems = [];
    for (const s of seed) {
      const id = s.skillId || '(missing skillId)';
      // Universal baseline — true for all 190 entries.
      for (const field of ['skillId', 'displayName', 'description', 'category', 'course', 'unit']) {
        if (!isNonEmptyString(s[field])) problems.push(`${id}: bad ${field}`);
      }
      for (const field of ['prerequisites', 'enables', 'standardsAlignment']) {
        if (!Array.isArray(s[field])) problems.push(`${id}: ${field} not an array`);
      }
      // Optional fields: if present they must be well-formed (so a bad edit fails).
      if (s.teachingGuidance !== undefined && !has3Arrays(s.teachingGuidance)) {
        problems.push(`${id}: malformed teachingGuidance`);
      }
      if (s.fluencyMetadata !== undefined) {
        const fm = s.fluencyMetadata;
        if (!Number.isFinite(fm.baseFluencyTime) || !Number.isFinite(fm.toleranceFactor)) {
          problems.push(`${id}: malformed fluencyMetadata`);
        }
        if (fm.fluencyType && !FLUENCY_TYPES.includes(fm.fluencyType)) {
          problems.push(`${id}: fluencyType "${fm.fluencyType}" not in enum`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test('the new high-traffic batch meets the full rich schema', () => {
    const problems = [];
    for (const s of seed) {
      if (!NEW_BATCH.has(s.skillId)) continue;
      if (!Number.isFinite(s.quarter)) problems.push(`${s.skillId}: missing quarter`);
      if (!has3Arrays(s.teachingGuidance)) problems.push(`${s.skillId}: missing rich teachingGuidance`);
      const fm = s.fluencyMetadata;
      if (!fm || !Number.isFinite(fm.baseFluencyTime) || !FLUENCY_TYPES.includes(fm.fluencyType) || !Number.isFinite(fm.toleranceFactor)) {
        problems.push(`${s.skillId}: missing/invalid fluencyMetadata`);
      }
      if (!s.standardsAlignment.length) problems.push(`${s.skillId}: empty standardsAlignment`);
    }
    expect(problems).toEqual([]);
  });

  test('skillIds are unique', () => {
    const counts = {};
    for (const s of seed) counts[s.skillId] = (counts[s.skillId] || 0) + 1;
    const dupes = Object.entries(counts).filter(([, n]) => n > 1).map(([id]) => id);
    expect(dupes).toEqual([]);
  });
});

describe('pattern-skill seed: milestone coverage ratchet', () => {
  test('milestone-referenced skills without a definition stays at or below the cap', () => {
    const seeded = new Set(seed.map((s) => s.skillId));
    const missing = [...referencedSkillIds()].filter((id) => !seeded.has(id));
    // If this fails after you ADDED skills, lower MAX_MISSING_DEFINITIONS to the
    // new count to lock the gain. If it fails after a REMOVAL, that's the
    // regression this guards — restore the definition.
    expect(missing.length).toBeLessThanOrEqual(MAX_MISSING_DEFINITIONS);
  });

  test('the high-traffic batch is present', () => {
    const seeded = new Set(seed.map((s) => s.skillId));
    const expected = [
      'one-step-equations-addition', 'one-step-equations-multiplication', 'unit-rates', 'proportions',
      'percent-problems', 'order-of-operations', 'numerical-expressions-exponents', 'factoring-gcf',
      'slope-intercept-form', 'graphing-linear-equations', 'integer-addition', 'integer-subtraction',
      'probability-basics', 'statistics-probability', 'inverse-functions',
    ];
    expect(expected.filter((id) => !seeded.has(id))).toEqual([]);
  });
});

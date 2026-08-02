/**
 * Hand-authored pathway→bank rows (2026-08-01).
 *
 * Geometry audited at 5% coverage while 875 geometry problems sat in the bank.
 * The fuzzy matcher could not fix it — in this domain it proposed:
 *     geometric-mean            → mean   (the ARITHMETIC average)
 *     trigonometric-ratios-intro→ ratios (3:4 proportion problems)
 *     circle-basics             → trig-unit-circle-evaluation
 * each of which would serve a geometry student an unrelated topic. The manual
 * file maps by mathematical meaning instead, and deliberately OMITS skills with
 * no honest match so they stay visible as real content gaps.
 */
const path = require('path');
const fs = require('fs');
const { skillLookupCandidates, canonicalSkillId } = require('../../utils/skillCanonicalizer');

const MANUAL = path.join(__dirname, '../../seeds/unified-taxonomy/pathway-crosswalk.manual.json');

describe('manual rows reach content lookup', () => {
  test.each([
    ['circle-area', 'circles-circumference-area'],
    ['parallel-lines-transversals', 'act-angles-parallel-lines'],
    ['triangle-angle-sum', 'act-triangles-angle-relationships'],
    ['volume-pyramids-cones-spheres', 'act-volume-surface-area'],
    ['coordinate-geometry-distance-midpoint', 'distance-formula'],
    ['parallel-perpendicular-slopes', 'parallel-perpendicular-lines'],
  ])('%s finds %s', (course, bank) => {
    expect(skillLookupCandidates(course)).toContain(bank);
  });
});

describe('the mappings the fuzzy matcher got WRONG stay out', () => {
  test('geometric-mean never resolves to the arithmetic mean', () => {
    expect(skillLookupCandidates('geometric-mean')).not.toContain('mean');
  });
  test('trigonometric-ratios-intro goes to trig ratios, not proportions', () => {
    const c = skillLookupCandidates('trigonometric-ratios-intro');
    expect(c).toContain('trig-right-triangle-ratios');
    expect(c).not.toContain('ratios');
  });
  test('circle-basics goes to circle geometry, not the unit circle', () => {
    const c = skillLookupCandidates('circle-basics');
    expect(c).toContain('circles-circumference-area');
    expect(c).not.toContain('trig-unit-circle-evaluation');
  });
});

describe('honest gaps stay gaps', () => {
  test.each(['points-lines-planes', 'polygon-angle-sum', 'quadrilateral-properties', 'trapezoid-properties'])(
    '%s has no invented mapping', (id) => {
      expect(skillLookupCandidates(id)).toEqual([id]);
    }
  );
});

describe('file contract', () => {
  test('every row is well-formed', () => {
    const cw = JSON.parse(fs.readFileSync(MANUAL, 'utf8'));
    expect(Array.isArray(cw.rows)).toBe(true);
    for (const r of cw.rows) {
      expect(typeof r.legacyId).toBe('string');
      expect(typeof r.unifiedId).toBe('string');
      expect(r.legacyId).not.toBe(r.unifiedId);
    }
  });

  test('the filename cannot be swept into the canonicalization glob', () => {
    // That glob is `endsWith('-crosswalk.json')`, and being swept in is what
    // made pathway-crosswalk.json inert AND once re-keyed ACT mastery.
    expect(path.basename(MANUAL).endsWith('-crosswalk.json')).toBe(false);
  });

  test('THE BOUNDARY: manual rows never touch mastery keying', () => {
    for (const id of ['circle-area', 'triangle-angle-sum', 'coordinate-proofs']) {
      expect(canonicalSkillId(id)).toBe(id);
    }
  });
});

// ── algebra-2 + precalculus (2026-08-01) ─────────────────────────────────
// Prioritised by real enrollment: algebra-2 had 5 active students at 28%
// coverage and precalculus 3 at 18%, while consumer-math (the numerically
// worst course) had exactly ONE. The bank turned out to be rich in both
// subjects — 236 quadratic-functions, 152 systems-elimination, 147
// systems-substitution — just under other names.
describe('algebra-2 and precalculus rows', () => {
  test.each([
    ['systems-substitution-elimination', 'systems-substitution'],
    ['graphing-lines', 'graph-linear-equations'],
    ['quadratic-solving-all-methods', 'choosing-quadratic-method'],
    ['logarithm-properties', 'act-logarithms'],
    ['recursive-explicit-formulas', 'arithmetic-sequences'],
    ['unit-circle-trig-values', 'trig-unit-circle-evaluation'],
    ['fundamental-trig-identities', 'trig-identities-basic'],
    ['limits-continuity-infinity', 'limits'],
  ])('%s → %s', (course, bank) => {
    expect(skillLookupCandidates(course)).toContain(bank);
  });

  test('genuinely missing precalculus topics stay unmapped', () => {
    // The bank has no conics, parametrics, polar or vector content at all.
    // Mapping these to something adjacent would hide a real gap behind a
    // good-looking percentage.
    for (const id of ['ellipse-analysis', 'hyperbola-analysis', 'parametric-equations',
      'polar-coordinates', 'vector-operations', 'dot-product', 'complex-polar-form']) {
      expect(skillLookupCandidates(id)).toEqual([id]);
    }
  });

  test('algebra-2 synthesis placeholders are not mapped to filler', () => {
    for (const id of ['course-synthesis', 'real-world-problem-solving', 'multi-domain-modeling']) {
      expect(skillLookupCandidates(id)).toEqual([id]);
    }
  });

  test('mastery keying is still untouched for the new rows', () => {
    for (const id of ['graphing-lines', 'logarithm-properties', 'unit-circle-trig-values']) {
      expect(canonicalSkillId(id)).toBe(id);
    }
  });
});

// ── act-prep (2026-08-01) ────────────────────────────────────────────────
// 625 ACT items in the bank, the ACT course at 33%. Pure vocabulary drift:
// the course says act-polygons-circles, the bank says act-circles.
describe('act-prep rows', () => {
  test.each([
    ['act-trig-functions', 'act-trigonometric-functions'],
    ['act-right-triangle-trig', 'act-right-triangle-trigonometry'],
    ['act-polygons-circles', 'act-circles'],
    ['act-congruence-similarity', 'act-similar-congruent-figures'],
    ['act-counting-techniques', 'act-counting-arrangements'],
    ['act-percent-applications', 'act-percentages'],
    ['act-two-way-tables', 'act-conditional-probability'],
  ])('%s → %s', (course, bank) => {
    expect(skillLookupCandidates(course)).toContain(bank);
  });

  test('pure test-taking STRATEGY skills stay unmapped — they are taught, not drilled', () => {
    // Backsolving, picking numbers, estimation and pacing are techniques the
    // tutor coaches; no problem bank can stand in for them, and mapping them
    // to a content skill would be a lie about what the student practised.
    for (const id of ['act-backsolving', 'act-picking-numbers',
      'act-estimation-elimination', 'act-pacing-strategy']) {
      expect(skillLookupCandidates(id)).toEqual([id]);
    }
  });

  test('mastery keying untouched for ACT ids (the original re-keying bug)', () => {
    expect(canonicalSkillId('act-polygons-circles')).toBe('act-polygons-circles');
    expect(canonicalSkillId('act-trig-functions')).toBe('act-trig-functions');
  });
});

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

/**
 * Id-tolerant catalog lookup (owner-hit: the test-out challenge card died
 * with "Skill not found", and the What's Next bar froze at its seeded score).
 *
 * The Skill catalog is keyed by bank/legacy ids; mastery state is keyed by
 * canonical unified ids. Any single-id Skill.findOne straddling that seam
 * misses. skillLookupCandidates returns every id the catalog might use.
 */
const { canonicalSkillId, skillLookupCandidates } = require('../../utils/skillCanonicalizer');

describe('skillLookupCandidates', () => {
  test('always includes the canonical id and the raw id, deduped', () => {
    const out = skillLookupCandidates('some-unknown-skill');
    expect(out).toContain('some-unknown-skill');
    expect(out).toContain(canonicalSkillId('some-unknown-skill'));
    expect(new Set(out).size).toBe(out.length);
  });

  test('a legacy id with a crosswalk yields canonical + legacy siblings', () => {
    // Use a real crosswalk entry so this test tracks the shipped data.
    const fs = require('fs'); const path = require('path');
    const dir = path.join(__dirname, '../../seeds/unified-taxonomy');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('-crosswalk.json'));
    let legacy = null, unified = null;
    for (const f of files) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const rows = Array.isArray(d) ? d : (d.mappings || d.entries || []);
      for (const r of rows) {
        const l = r.legacyId || r.legacy_id, u = r.unifiedId || r.unified_id;
        if (l && u) { legacy = l; unified = u; break; }
      }
      if (legacy) break;
    }
    if (!legacy) return; // minimal env without crosswalks — resolver degrades to identity
    const out = skillLookupCandidates(legacy);
    expect(out[0]).toBe(unified);            // canonical first
    expect(out).toContain(legacy);           // raw survives
    // Asking by the UNIFIED id must ALSO surface the legacy catalog key —
    // that is the exact "Skill not found" hole.
    expect(skillLookupCandidates(unified)).toContain(legacy);
  });

  test('junk is safe', () => {
    expect(skillLookupCandidates(null)).toEqual([]);
    expect(skillLookupCandidates('')).toEqual([]);
  });
});

describe('expandSkillIds / matchSkillDoc (the sweep helpers)', () => {
  const { expandSkillIds, matchSkillDoc } = require('../../utils/skillCanonicalizer');

  test('expand flattens candidate sets, deduped; junk-safe', () => {
    const out = expandSkillIds(['skill-a', 'skill-b', 'skill-a']);
    expect(out).toContain('skill-a');
    expect(out).toContain('skill-b');
    expect(new Set(out).size).toBe(out.length);
    expect(expandSkillIds(null)).toEqual([]);
  });

  test('matchSkillDoc finds a doc keyed under ANY candidate form', () => {
    const docs = [{ skillId: 'skill-a', displayName: 'A' }, { skillId: 'skill-b', displayName: 'B' }];
    expect(matchSkillDoc(docs, 'skill-b').displayName).toBe('B');
    expect(matchSkillDoc(docs, 'no-such-skill')).toBeNull();
    expect(matchSkillDoc(null, 'skill-a')).toBeNull();
  });

  test('cross-form match: a legacy-keyed doc is found by its unified id', () => {
    const fs = require('fs'); const path = require('path');
    const dir = path.join(__dirname, '../../seeds/unified-taxonomy');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('-crosswalk.json'));
    let legacy = null, unified = null;
    for (const f of files) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const rows = Array.isArray(d) ? d : (d.mappings || d.entries || []);
      for (const r of rows) {
        const l = r.legacyId || r.legacy_id, u = r.unifiedId || r.unified_id;
        if (l && u) { legacy = l; unified = u; break; }
      }
      if (legacy) break;
    }
    if (!legacy) return; // minimal env
    expect(matchSkillDoc([{ skillId: legacy }], unified)).toEqual({ skillId: legacy });
    expect(expandSkillIds([unified])).toContain(legacy);
  });
});

// ── Pathway→bank content lookup (coverage audit, 2026-08-01) ──────────────
//
// Course modules name skills in their own vocabulary ("g6-unit-rates",
// "solving-one-step-equations"); the problem bank uses its own ("unit-rates",
// "one-step-equations"). seeds/unified-taxonomy/pathway-crosswalk.json records
// which bank skill holds the content — 89 reviewed rows that were inert,
// because the file is (correctly) barred from the mastery-keying path and
// nothing else read it. Eight courses audited at 0% coverage while the content
// sat there under a different name; feeding these rows to CONTENT LOOKUP ONLY
// took algebra-1 from 16% to 39% with nothing generated.
describe('pathway→bank targets widen content lookup', () => {
  const { skillLookupCandidates, canonicalSkillId } = require('../../utils/skillCanonicalizer');

  test('a course skill can see the bank skill that holds its problems', () => {
    expect(skillLookupCandidates('g6-variables-both-sides'))
      .toContain('equations-with-variables-both-sides');
    expect(skillLookupCandidates('solving-one-step-equations')).toContain('one-step-equations');
  });

  test('canonical/legacy forms keep priority — bank ids are appended last', () => {
    const c = skillLookupCandidates('g6-variables-both-sides');
    expect(c[0]).toBe('g6-variables-both-sides');
    expect(c.indexOf('equations-with-variables-both-sides')).toBeGreaterThan(0);
  });

  test('ONLY the reviewed primary target — runner-up "alternatives" stay out', () => {
    // act-linear-equations lists act-linear-inequalities among its alternatives;
    // honouring those would serve equations practice a page of inequalities.
    const c = skillLookupCandidates('act-linear-equations');
    expect(c).toContain('linear-equations');
    expect(c).not.toContain('act-linear-inequalities');
  });

  test('THE BOUNDARY: mastery keying is untouched — canonicalSkillId ignores pathway rows', () => {
    // The ACT baseline bug: canonicalSkillId('act-linear-equations') returning
    // the bank id re-keyed where mastery was written vs read, so a student could
    // ace a skill on the baseline and be taught it from scratch anyway.
    expect(canonicalSkillId('act-linear-equations')).toBe('act-linear-equations');
    expect(canonicalSkillId('g6-variables-both-sides')).toBe('g6-variables-both-sides');
  });
});

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

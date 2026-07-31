/**
 * Pins WHAT skillCanonicalizer is allowed to load.
 *
 * The resolver merges every `seeds/unified-taxonomy/*-crosswalk.json` by design
 * — "adding a bank's crosswalk is enough to extend coverage, no code change" —
 * and its output is the mastery storage key. That makes the glob a live wire: a
 * data-only PR can silently re-key where mastery is written and read, with no
 * signal in code review.
 *
 * It fired once. pathway-crosswalk.json maps "pathway skill ids -> BANK skill
 * ids" (its own note) while reusing the legacyId/unifiedId field names, so the
 * glob swept it in and canonicalSkillId('act-linear-equations') began returning
 * the bank id 'linear-equations'. coursePreAssessment.creditFromTallies()
 * canonicalizes before crediting, so ACT baseline mastery landed under an id the
 * ACT course never teaches by: ace a skill on the baseline, get taught it from
 * scratch anyway.
 *
 * The invariant below is the general guard — a row is only a canonicalization if
 * its TARGET is a real unified taxonomy id — so the next file that reuses these
 * field names for a different question fails here instead of in production.
 */

const fs = require('fs');
const path = require('path');
const { canonicalSkillId, isUnifiedSkillId } = require('../../utils/skillCanonicalizer');

const TAX_DIR = path.join(__dirname, '..', '..', 'seeds', 'unified-taxonomy');

function crosswalkFiles() {
  try {
    return fs.readdirSync(TAX_DIR).filter((f) => f.endsWith('-crosswalk.json'));
  } catch {
    return [];
  }
}

function rowsOf(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(TAX_DIR, file), 'utf8')).rows || [];
  } catch {
    return [];
  }
}

describe('skillCanonicalizer — only unified targets may re-key a skill', () => {
  test('every id it rewrites lands on a real unified taxonomy id', () => {
    const offenders = [];
    for (const file of crosswalkFiles()) {
      for (const row of rowsOf(file)) {
        if (!row || !row.legacyId) continue;
        const out = canonicalSkillId(row.legacyId);
        // Either untouched (no mapping applied) or a genuine unified id.
        if (out !== row.legacyId && !isUnifiedSkillId(out)) {
          offenders.push(`${file}: ${row.legacyId} -> ${out}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('a crosswalk whose targets are NOT unified ids cannot re-key anything', () => {
    // Whole-file check: if a file's targets are all non-unified, none of its
    // legacyIds may be rewritten by it. Written against whatever files exist so
    // it keeps holding as crosswalks are added or regenerated.
    for (const file of crosswalkFiles()) {
      const rows = rowsOf(file).filter((r) => r && r.legacyId && r.unifiedId);
      if (!rows.length) continue;
      const anyUnifiedTarget = rows.some((r) => isUnifiedSkillId(r.unifiedId));
      if (anyUnifiedTarget) continue; // a real bank->taxonomy crosswalk; skip

      for (const row of rows) {
        expect(canonicalSkillId(row.legacyId)).not.toBe(row.unifiedId);
      }
    }
  });
});

describe('skillCanonicalizer — the ACT regression stays fixed', () => {
  // The six ids pathway-crosswalk.json moved. Each must resolve to ITSELF: the
  // ACT course teaches by these ids, and ACT baseline credit has to be stored
  // where the course will look for it.
  const ACT_IDS_THAT_MUST_NOT_MOVE = [
    'act-linear-equations',              // -> 'linear-equations' (bank id)
    'act-function-notation-evaluation',  // seeds/act-crosswalk.json maps the OTHER way
    'act-linear-functions',
    'act-function-transformations',
    'act-area-volume-surface-area',      // dropped "area"
    'act-probability',                   // -> 'act-conditional-probability': a change of MEANING
  ];

  test.each(ACT_IDS_THAT_MUST_NOT_MOVE)('%s canonicalizes to itself', (id) => {
    expect(canonicalSkillId(id)).toBe(id);
  });
});

describe('skillCanonicalizer — real bank crosswalks still resolve', () => {
  // Guard against over-correcting: the alg1 crosswalk targets genuine unified
  // ids and must keep working.
  test('alg1 legacy ids still map onto unified taxonomy ids', () => {
    const alg1 = rowsOf('alg1-crosswalk.json').filter((r) => r && r.legacyId && r.unifiedId);
    expect(alg1.length).toBeGreaterThan(0);

    const mapped = alg1.filter((r) => canonicalSkillId(r.legacyId) === r.unifiedId);
    // Rows whose legacyId is itself a unified id are deliberately never rewritten,
    // so require the overwhelming majority rather than all of them.
    expect(mapped.length).toBeGreaterThan(alg1.length * 0.9);
  });
});

describe('skillCanonicalizer — `approved` is an annotation, not a gate', () => {
  /*
   * Filtering the merge on `approved` (or on `confidence`) reads like obvious
   * hardening and is a regression. These tests exist so that change fails here
   * with an explanation instead of silently splitting students' mastery.
   *
   * In alg1-crosswalk.json `approved: true` is exactly the high-confidence rows.
   * Gating on it drops ~2/3 of the mappings, and every dropped legacy id stops
   * collapsing onto its unified node — it becomes a SEPARATE mastery record.
   * That is the split-record bug that surfaces as a mastery bar frozen while the
   * student keeps answering correctly.
   */

  test('unapproved rows still resolve — dropping them would split mastery', () => {
    const unapproved = rowsOf('alg1-crosswalk.json')
      .filter((r) => r && r.legacyId && r.unifiedId && r.approved === false);

    // If the data is ever fully approved this guard is moot, not broken.
    if (!unapproved.length) return;

    const resolving = unapproved.filter((r) => canonicalSkillId(r.legacyId) === r.unifiedId);
    expect(resolving.length).toBeGreaterThan(unapproved.length * 0.9);
  });

  test.each([
    // Unapproved, med-confidence, and plainly correct — just coarser than the
    // bank's fine skill. Exactly what a confidence gate would throw away.
    ['slope-from-two-points', 'ALG1.PRP.2'],
    ['solving-two-step-equations', 'ALG1.EQV.1'],
    ['solving-equations-with-variables-both-sides', 'ALG1.EQV.1'],
  ])('%s still collapses onto %s', (legacyId, unifiedId) => {
    expect(canonicalSkillId(legacyId)).toBe(unifiedId);
  });

  test('order-of-operations has its own node, not the rational-number one', () => {
    // The one row that was genuinely wrong. MS.QNT.8 is "four operations on
    // positive and negative rational numbers" — signed arithmetic, not operation
    // precedence — so evidence on fractions accrued to order of operations and
    // vice versa. All 39 bank items are numerical (zero contain a variable) and
    // 26 use exponents, which fits neither ELEM.EQV.5 (grade 5, no exponents) nor
    // MS.EQV.1 (requires variables), so MS.EQV.10 was added for them.
    expect(canonicalSkillId('order-of-operations')).toBe('MS.EQV.10');

    // The merge it was part of must not re-form.
    expect(canonicalSkillId('order-of-operations'))
      .not.toBe(canonicalSkillId('integer-operations'));
    expect(canonicalSkillId('order-of-operations'))
      .not.toBe(canonicalSkillId('fraction-operations'));
  });

  test('many-to-one is intentional: HIGH-confidence rows collapse together too', () => {
    // Proof that a shared target is the taxonomy being coarser by design, not a
    // symptom of weak matches — so "many legacy ids share a target" is never on
    // its own grounds to start filtering.
    expect(canonicalSkillId('factoring-gcf')).toBe('ALG1.EQV.11');
    expect(canonicalSkillId('factoring-by-grouping')).toBe('ALG1.EQV.11');
  });
});

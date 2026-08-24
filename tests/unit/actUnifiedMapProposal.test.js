/**
 * The proposed ACT → unified-taxonomy mapping, and the proof that it is INERT.
 *
 * routes/actTest.js credits the skills a student proved on their baseline, but
 * stores that credit under `act-*` ids, so it never appears on the Map of
 * Mathmatix. The standing note there says a crosswalk "starts working with no
 * code change" once seeds/unified-taxonomy/act-crosswalk.json exists — because
 * skillCanonicalizer globs `*-crosswalk.json` and decodedMasteryMap collapses
 * every stored key through it.
 *
 * That note is true and incomplete. Activating the mapping re-keys where ACT
 * mastery is written, which is a data migration on live student records, and it
 * contradicts skillCanonicalizerScope.test.js, whose ACT pins exist because this
 * exact class of change once cost students credit they had earned.
 *
 * So the reviewed data lands first, deliberately unable to do anything: the
 * filename does not match the glob. These tests keep it that way and keep the
 * data honest, so the activation decision is a rename plus the checks in
 * docs/ACT_UNIFIED_CROSSWALK_PROPOSAL.md — not a research project.
 */
const fs = require('fs');
const path = require('path');
const { canonicalSkillId } = require('../../utils/skillCanonicalizer');

const ROOT = path.join(__dirname, '../..');
const TAX_DIR = path.join(ROOT, 'seeds/unified-taxonomy');
const PROPOSAL_FILE = 'act-unified.proposed.json';

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const proposal = read(`seeds/unified-taxonomy/${PROPOSAL_FILE}`);
const taxonomy = read('seeds/unified-taxonomy/math_taxonomy.json');
const blueprint = read('seeds/act-math-blueprint.json');

const UNIFIED_IDS = new Set(taxonomy.skills.map((s) => s.skill_id));
const ACT_SKILLS = new Set(Object.values(blueprint.skillsByCategory).flat());

describe('the proposal cannot re-key mastery while it sits here', () => {
  test('its filename is outside the canonicalization glob', () => {
    // skillCanonicalizer merges every seeds/unified-taxonomy/*-crosswalk.json.
    // The whole safety of landing this data early rests on this one fact.
    expect(PROPOSAL_FILE.endsWith('-crosswalk.json')).toBe(false);
    expect(fs.existsSync(path.join(TAX_DIR, PROPOSAL_FILE))).toBe(true);
  });

  test('no ACT id canonicalizes anywhere today', () => {
    // If this fails, the mapping went live — intentionally or not — and the
    // checks in the proposal doc need to have been done first.
    [...ACT_SKILLS].forEach((id) => expect(canonicalSkillId(id)).toBe(id));
  });

  test('nothing named *-crosswalk.json has appeared for ACT', () => {
    const swept = fs.readdirSync(TAX_DIR).filter((f) => f.endsWith('-crosswalk.json'));
    expect(swept).not.toContain('act-crosswalk.json');
  });
});

describe('the mapping is valid enough to activate on a decision, not a rewrite', () => {
  test('every target is a real unified taxonomy id', () => {
    // The general invariant skillCanonicalizerScope enforces. A row whose
    // target is not a taxonomy id is not a canonicalization at all — that is
    // how pathway-crosswalk once re-keyed ACT mastery onto BANK ids.
    proposal.rows.forEach((r) => {
      expect(UNIFIED_IDS.has(r.unifiedId)).toBe(true);
    });
  });

  test('every alternative is a real unified id too', () => {
    proposal.rows.forEach((r) => {
      (r.alternatives || []).forEach((a) => expect(UNIFIED_IDS.has(a.id)).toBe(true));
    });
  });

  test('every legacyId is a skill the live blueprint actually uses', () => {
    // A row for a retired ACT id is dead weight that still looks authoritative.
    proposal.rows.forEach((r) => expect(ACT_SKILLS.has(r.legacyId)).toBe(true));
  });

  test('every ACT skill is either mapped or explicitly unmapped, with a reason', () => {
    const mapped = new Set(proposal.rows.map((r) => r.legacyId));
    const unmapped = new Set((proposal.unmapped || []).map((u) => u.legacyId));
    [...ACT_SKILLS].forEach((id) => {
      expect(mapped.has(id) || unmapped.has(id)).toBe(true);
    });
    (proposal.unmapped || []).forEach((u) => expect(u.reason.length).toBeGreaterThan(30));
  });

  test('no ACT skill is both mapped and unmapped, and none is mapped twice', () => {
    const ids = proposal.rows.map((r) => r.legacyId);
    expect(new Set(ids).size).toBe(ids.length);
    const unmapped = new Set((proposal.unmapped || []).map((u) => u.legacyId));
    ids.forEach((id) => expect(unmapped.has(id)).toBe(false));
  });

  test('the two ids pinned by the scope test are flagged in their notes', () => {
    // Activating moves these, and skillCanonicalizerScope.test.js will fail on
    // them by design. Whoever activates should not have to discover that from
    // a red CI run.
    const pinned = ['act-linear-equations', 'act-probability'];
    pinned.forEach((id) => {
      const row = proposal.rows.find((r) => r.legacyId === id);
      expect(row).toBeDefined();
      expect(row.note).toMatch(/PINNED/);
    });
  });

  test('the declared counts match the data', () => {
    expect(proposal.rows).toHaveLength(proposal.mappedCount);
    expect(proposal.unmapped).toHaveLength(proposal.unmappedCount);
    expect(proposal.legacySkillCount).toBe(ACT_SKILLS.size);
    expect(proposal.mappedCount + proposal.unmappedCount).toBe(ACT_SKILLS.size);
  });

  test('medium-confidence rows carry a note explaining the judgement', () => {
    // The prior failure mode was a confident-looking mapping that changed a
    // skill's MEANING (act-probability -> conditional probability). Anything
    // not obvious has to say why it was chosen.
    proposal.rows.filter((r) => r.confidence !== 'high')
      .forEach((r) => expect(r.note.length).toBeGreaterThan(20));
  });

  test('the proposal says out loud that it is inert', () => {
    expect(proposal._comment).toMatch(/INERT BY DESIGN/);
    expect(proposal._comment).toMatch(/does NOT match/);
  });
});

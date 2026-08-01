/**
 * The seed plan is only useful if it still points at real files and real
 * seeders. A renamed payload or a deleted script would otherwise surface as a
 * half-seeded database at 11pm, so pin the plan here instead.
 */
const fs = require('fs');
const path = require('path');

const { STEPS, parseArgs, selectSteps, checkFiles } = require('../../scripts/seedAll');

const SCRIPTS = path.join(__dirname, '../../scripts');

describe('seed plan integrity', () => {
  test('every step points at a script that exists', () => {
    for (const step of STEPS) {
      expect(fs.existsSync(path.join(SCRIPTS, step.script))).toBe(true);
    }
  });

  test('every payload the plan references is committed', () => {
    expect(checkFiles(STEPS)).toEqual([]);
  });

  test('every payload row carries the id the verifier counts on', () => {
    for (const step of STEPS.filter((s) => s.ids)) {
      const ids = step.ids();
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.filter((id) => !id)).toEqual([]);
      // Duplicate ids would make the upsert count silently disagree with the
      // row count the verifier checks.
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test('step keys are unique', () => {
    const keys = STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('skills are seeded before any items', () => {
    const lastSkill = STEPS.map((s) => s.model).lastIndexOf('Skill');
    const firstItem = STEPS.map((s) => s.model).indexOf('Problem');
    // seedBankTopupItems aborts on a skillId it cannot find in the Skill
    // collection — items after skills is a hard dependency, not a preference.
    expect(lastSkill).toBeLessThan(firstItem);
  });

  test('the answer.equivalents backfill runs last', () => {
    // Each Fable bank re-upserts answer.value from JSON, dropping the
    // typography equivalents. Backfilling before them would be a no-op.
    expect(STEPS[STEPS.length - 1].key).toBe('answer-equivalents');
  });

  test('the destructive skill seeders are not in the plan', () => {
    const scripts = STEPS.map((s) => s.script);
    // seed-skills.js runs Skill.deleteMany({}) — it would wipe the taxonomy.
    expect(scripts).not.toContain('seed-skills.js');
    expect(scripts).not.toContain('seedSkillsFromProblems.js');
  });
});

describe('step selection', () => {
  test('--only narrows the plan, --skip removes from it', () => {
    const only = selectSteps(parseArgs(['--only=act-items,sat-items']));
    expect(only.map((s) => s.key)).toEqual(['act-items', 'sat-items']);

    const skipped = selectSteps(parseArgs(['--skip=answer-equivalents']));
    expect(skipped.map((s) => s.key)).not.toContain('answer-equivalents');
    expect(skipped.length).toBe(STEPS.length - 1);
  });

  test('an unknown key fails loudly instead of silently seeding nothing', () => {
    expect(() => selectSteps(parseArgs(['--only=act-itemz']))).toThrow(/Unknown step key/);
  });

  test('--fresh and --dry-run are parsed', () => {
    const opts = parseArgs(['--fresh', '--dry-run']);
    expect(opts.fresh).toBe(true);
    expect(opts.dryRun).toBe(true);
  });
});

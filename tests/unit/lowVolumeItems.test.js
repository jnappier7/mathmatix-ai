/**
 * Template-generated items for the empty Algebra 1 and 6th-grade skills.
 *
 * These 400 items were produced by scripts/buildLowVolumeItems.js, where the
 * ANSWER IS COMPUTED from the numbers each template draws — a wrong answer is
 * a code bug, not a typo. scripts/verifyGeneratedItems.js then re-derives 257
 * of them by parsing the prompt and doing the maths a second way.
 *
 * These tests guard the CONTRACT: structure the grader and tutor rely on, the
 * targeting (do they actually fill audited gaps), and the determinism that
 * makes a rebuild diff meaningful.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FILE = path.join(__dirname, '../../seeds/low-volume-items.generated.json');
const items = JSON.parse(fs.readFileSync(FILE, 'utf8'));

describe('shape and coverage', () => {
  test('every skill it targets gets enough items to clear the bar', () => {
    const bySkill = {};
    for (const i of items) bySkill[i.skillId] = (bySkill[i.skillId] || 0) + 1;
    expect(Object.keys(bySkill).length).toBeGreaterThanOrEqual(20);
    for (const [skill, n] of Object.entries(bySkill)) {
      expect({ skill, n }).toMatchObject({ n: expect.any(Number) });
      expect(n).toBeGreaterThanOrEqual(5); // MIN_BANK in the coverage audit
    }
  });

  // GENERATE ONLY WHAT THE BANK LACKS.
  //
  // The first build covered 35 skills. A full DB export then showed 13 of them
  // already had abundant content under a different name — g6-one-two-step-equations
  // had 424 problems under one-step-equations, g6-percent-intro 355 under
  // percent-of-a-number — and four generated prompts were EXACT duplicates of
  // existing rows. Those 13 are crosswalked now, not generated.
  //
  // The trap worth remembering: the coverage audit measures REACHABILITY, not
  // existence. An unmapped skill reads "empty" whether or not problems exist.
  test('skills already covered by a crosswalk are NOT generated for', () => {
    const generated = new Set(items.map((i) => i.skillId));
    for (const crosswalked of [
      'g6-one-two-step-equations', 'g6-percent-intro', 'g6-combine-like-terms',
      'g6-equivalent-ratios', 'g6-ratio-language', 'g6-fraction-add-subtract',
      'g6-fraction-multiply-divide', 'g6-write-expressions', 'g6-compare-order-rationals',
      'g6-distance-coordinate-plane', 'measures-of-central-tendency', 'variable-expressions',
    ]) {
      expect(generated.has(crosswalked)).toBe(false);
    }
  });

  // The rule is "the bank covers it FULLY", not merely "the bank has something".
  // algebraic-properties maps only to distributive-property, so the commutative,
  // associative and identity cases have no bank content at all — dropping these
  // items would have left two thirds of the skill unpractised. Partial coverage
  // is a reason to KEEP generating, and this pins that distinction.
  test('a skill the bank covers only PARTIALLY is still generated for', () => {
    const generated = new Set(items.map((i) => i.skillId));
    expect(generated.has('algebraic-properties')).toBe(true);
    const answers = new Set(items.filter((i) => i.skillId === 'algebraic-properties')
      .map((i) => i.answer.value));
    expect(answers.size).toBeGreaterThan(1);
    expect([...answers].some((a) => !/Distributive/.test(a))).toBe(true);
  });

  test('no generated prompt duplicates another item in this bank', () => {
    const seen = new Map();
    for (const i of items) {
      const k = i.prompt.trim();
      expect(seen.has(k)).toBe(false);
      seen.set(k, i.problemId);
    }
  });

  test('difficulty is spread within each skill, not a single tier', () => {
    const tiers = {};
    for (const i of items) (tiers[i.skillId] = tiers[i.skillId] || new Set()).add(i.difficulty);
    for (const [, set] of Object.entries(tiers)) expect(set.size).toBeGreaterThanOrEqual(2);
  });

  test('ids and content hashes are unique', () => {
    expect(new Set(items.map((i) => i.problemId)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.contentHash)).size).toBe(items.length);
  });
});

describe('the grading contract', () => {
  test('no rendering holes reached the output', () => {
    for (const i of items) {
      const blob = `${i.prompt}|${i.answer.value}|${i.explanation}`;
      expect(blob).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  test('multiple-choice: the correct option holds the stated answer, options distinct', () => {
    for (const i of items.filter((x) => x.answerType === 'multiple-choice')) {
      const chosen = i.options.find((o) => o.label === i.correctOption);
      expect(chosen).toBeDefined();
      expect(chosen.text).toBe(String(i.answer.value));
      expect(new Set(i.options.map((o) => o.text)).size).toBe(i.options.length);
    }
  });

  test('typographic answers carry ASCII equivalents (the defect fixed in #1409)', () => {
    for (const i of items) {
      if (/[−×÷]/.test(String(i.answer.value))) {
        expect(i.answer.equivalents.some((e) => !/[−×÷]/.test(e))).toBe(true);
      }
    }
  });

  test('every item explains itself', () => {
    for (const i of items) expect(i.explanation.length).toBeGreaterThan(25);
  });
});

describe('generation is trustworthy', () => {
  test('the independent verifier re-derives a large share and finds no mismatch', () => {
    const out = execFileSync(process.execPath,
      [path.join(__dirname, '../../scripts/verifyGeneratedItems.js'), FILE],
      { encoding: 'utf8', cwd: path.join(__dirname, '../..') });
    expect(out).toMatch(/Mismatches: 0/);
    const m = out.match(/Independently re-derived: (\d+)\/(\d+)/);
    expect(m).toBeTruthy();
    // Independent re-derivation must cover a majority — a verifier that checks
    // a handful and passes would give false confidence over a bulk import.
    expect(Number(m[1]) / Number(m[2])).toBeGreaterThan(0.5);
  }, 60000);

  test('the build is deterministic — rebuilding reproduces the file exactly', () => {
    const before = fs.readFileSync(FILE, 'utf8');
    execFileSync(process.execPath, [path.join(__dirname, '../../scripts/buildLowVolumeItems.js')],
      { encoding: 'utf8', cwd: path.join(__dirname, '../..') });
    expect(fs.readFileSync(FILE, 'utf8')).toBe(before);
  }, 60000);
});

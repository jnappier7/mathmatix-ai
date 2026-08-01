/**
 * Hand-authored AP Calculus AB top-up items (2026-08-01).
 *
 * The coverage audit found ten AB skills THIN — 1-4 problems each, every one
 * at difficulty 3. These 30 items clear the 5-problem bar and add a 2-4 spread
 * so the ZPD selector has something to choose from.
 *
 * Authored by hand because they teach real students; every value was also
 * checked numerically (integrals by Simpson's rule, limits by evaluation).
 * These tests guard the STRUCTURE — the contract the tutor and grader rely on.
 */
const fs = require('fs');
const path = require('path');

const items = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../seeds/calc-topup-items.generated.json'), 'utf8'
));

const THIN_SKILLS = [
  'one-sided-infinite-limits', 'continuity-types', 'common-derivatives',
  'volume-cross-sections', 'lhopitals-rule', 'area-between-curves',
  'volume-disk-washer', 'implicit-differentiation', 'inverse-function-derivatives',
  'basic-differentiation-rules',
];

describe('the item set targets exactly the audited gaps', () => {
  test('30 items covering the ten thin skills, nothing else', () => {
    expect(items).toHaveLength(30);
    expect([...new Set(items.map((i) => i.skillId))].sort()).toEqual([...THIN_SKILLS].sort());
  });

  test('every skill reaches the 5-problem bar once these are added to what exists', () => {
    // Pre-existing counts from the audit: 4 skills at 1, 3 at 2, 2 at 3, 1 at 4.
    const existing = {
      'one-sided-infinite-limits': 1, 'continuity-types': 1, 'common-derivatives': 1,
      'volume-cross-sections': 1, 'lhopitals-rule': 2, 'area-between-curves': 2,
      'volume-disk-washer': 2, 'implicit-differentiation': 3,
      'inverse-function-derivatives': 3, 'basic-differentiation-rules': 4,
    };
    for (const skill of THIN_SKILLS) {
      const added = items.filter((i) => i.skillId === skill).length;
      expect(existing[skill] + added).toBeGreaterThanOrEqual(5);
    }
  });

  test('difficulty is spread, not stuck at 3 like the existing items', () => {
    const diffs = new Set(items.map((i) => i.difficulty));
    expect(diffs.has(2)).toBe(true);
    expect(diffs.has(4)).toBe(true);
    for (const d of diffs) expect(d).toBeGreaterThanOrEqual(2);
  });
});

describe('every item honours the Problem contract', () => {
  test('required fields present and well-typed', () => {
    for (const it of items) {
      expect(typeof it.problemId).toBe('string');
      expect(typeof it.prompt).toBe('string');
      expect(it.prompt.length).toBeGreaterThan(10);
      expect(it.answerType).toBe('multiple-choice');
      expect(it.options).toHaveLength(4);
      expect(it.gradeBand).toBe('Calculus');
      expect(it.source).toBe('calc-topup');
      expect(it.isActive).toBe(true);
    }
  });

  test('problemIds and content hashes are unique — no accidental duplicates', () => {
    expect(new Set(items.map((i) => i.problemId)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.contentHash)).size).toBe(items.length);
  });

  test('THE GRADING CONTRACT: correctOption names the option holding answer.value', () => {
    for (const it of items) {
      const chosen = it.options.find((o) => o.label === it.correctOption);
      expect(chosen).toBeDefined();
      expect(chosen.text).toBe(it.answer.value);
    }
  });

  test('option labels are A-D with distinct texts (no giveaway duplicates)', () => {
    for (const it of items) {
      expect(it.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
      expect(new Set(it.options.map((o) => o.text)).size).toBe(4);
    }
  });

  test('the correct answer is not always A — position is varied', () => {
    const letters = new Set(items.map((i) => i.correctOption));
    expect(letters.size).toBeGreaterThan(1);
  });

  test('every item explains itself, and names what a distractor got wrong', () => {
    for (const it of items) {
      expect(it.explanation.length).toBeGreaterThan(60);
      expect(it.explanation).toMatch(/[Cc]hoice/);
    }
  });

  test('typographic answers carry ASCII equivalents (the grading defect from #1409)', () => {
    for (const it of items) {
      if (/[−×÷]/.test(it.answer.value)) {
        expect(it.answer.equivalents.some((e) => !/[−×÷]/.test(e))).toBe(true);
      }
    }
  });
});

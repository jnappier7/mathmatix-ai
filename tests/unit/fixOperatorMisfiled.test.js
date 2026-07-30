/**
 * Decision logic of scripts/fixOperatorMisfiledProblems.js.
 *
 * This script deactivates real problem documents, so the bar is higher than for
 * a read-only audit: every test below is about NOT retiring something it
 * shouldn't. The dangerous direction is a false "retire", not a missed fix.
 */

const {
  promptOperation,
  skillOperation,
  planForGroup,
  promptKey,
} = require('../../scripts/fixOperatorMisfiledProblems');

const doc = (skillId, prompt, problemId = skillId) => ({ skillId, prompt, problemId });

describe('promptOperation', () => {
  it('reads explicit division', () => {
    expect(promptOperation('12 ÷ 3 = ?')).toBe('divide');
    expect(promptOperation('\\frac{4}{5} \\div \\frac{4}{5}')).toBe('divide');
    expect(promptOperation('What is 20 divided by 4?')).toBe('divide');
  });

  it('reads explicit multiplication', () => {
    expect(promptOperation('12 × 6 = ?')).toBe('multiply');
    expect(promptOperation('2/5 × 3/4 = ?')).toBe('multiply');
    expect(promptOperation('\\frac{1}{5} \\times \\frac{2}{3}')).toBe('multiply');
    expect(promptOperation('6 * 3')).toBe('multiply');
  });

  it('never treats a fraction bar as division', () => {
    // The whole reason the audit's earlier heuristic was wrong. `2/5 x 3/4` is
    // multiplication; reading "/" as division would retire the correct copy.
    expect(promptOperation('2/5 × 3/4 = ?')).toBe('multiply');
    expect(promptOperation('1/2 + 1/3')).toBeNull();
  });

  it('refuses to judge a mixed expression', () => {
    expect(promptOperation('12 × 3 ÷ 4')).toBeNull();
  });

  it('returns null when there is no operator at all', () => {
    expect(promptOperation('The symbol ≥ means:')).toBeNull();
    expect(promptOperation('')).toBeNull();
    expect(promptOperation(null)).toBeNull();
  });
});

describe('skillOperation', () => {
  it('classifies the operation-asserting skills', () => {
    expect(skillOperation('multiply-fractions')).toBe('multiply');
    expect(skillOperation('one-step-division')).toBe('divide');
  });

  it('returns null for skills that assert no operation', () => {
    expect(skillOperation('slope')).toBeNull();
    expect(skillOperation('addition')).toBeNull();
  });
});

describe('planForGroup', () => {
  it('retires the division copy of a multiplication item', () => {
    const docs = [
      doc('multiplication-basics', '12 × 6 = ?'),
      doc('one-step-division', '12 × 6 = ?'),
    ];
    const p = planForGroup(docs);
    expect(p.action).toBe('retire');
    expect(p.operation).toBe('multiply');
    expect(p.retire.map((d) => d.skillId)).toEqual(['one-step-division']);
    expect(p.keep.map((d) => d.skillId)).toEqual(['multiplication-basics']);
  });

  it('retires the multiplication copies of a division item', () => {
    const docs = [
      doc('multiplication-basics', '12 ÷ 3 = ?'),
      doc('one-step-multiplication', '12 ÷ 3 = ?'),
      doc('one-step-division', '12 ÷ 3 = ?'),
    ];
    const p = planForGroup(docs);
    expect(p.action).toBe('retire');
    expect(p.retire.map((d) => d.skillId).sort())
      .toEqual(['multiplication-basics', 'one-step-multiplication']);
    expect(p.keep.map((d) => d.skillId)).toEqual(['one-step-division']);
  });

  it('handles the fraction case', () => {
    const p = planForGroup([
      doc('multiply-fractions', '4/5 ÷ 4/5 = ?'),
      doc('divide-fractions', '4/5 ÷ 4/5 = ?'),
    ]);
    expect(p.retire.map((d) => d.skillId)).toEqual(['multiply-fractions']);
  });

  it('leaves hierarchy duplicates alone — they are not contradictions', () => {
    // 12 x 6 is honestly both of these. Retiring either would be a real loss,
    // and belongs to the canonical-owner pass, not here.
    const p = planForGroup([
      doc('multiplication-basics', '12 × 6 = ?'),
      doc('one-step-multiplication', '12 × 6 = ?'),
    ]);
    expect(p.action).toBe('skip');
  });

  it('skips groups whose skills assert no operation', () => {
    const p = planForGroup([
      doc('inequality-notation', 'The symbol ≥ means:'),
      doc('similar-figures', 'The symbol ≥ means:'),
    ]);
    expect(p.action).toBe('skip');
  });

  it('skips rather than guesses when the prompt has no clear operator', () => {
    const p = planForGroup([
      doc('multiply-fractions', 'Simplify the expression.'),
      doc('divide-fractions', 'Simplify the expression.'),
    ]);
    expect(p.action).toBe('skip');
    expect(p.reason).toMatch(/unambiguous operator/);
  });

  it('skips two same-operation skills even when both contradict the prompt', () => {
    // Both skills say "multiply" while the prompt divides, so every copy looks
    // wrong — but with no surviving copy this script would erase the item, and
    // one skill still has to own it. That is a content bug for a human.
    const p = planForGroup([
      doc('multiply-fractions', '12 ÷ 3 = ?'),
      doc('one-step-multiplication', '12 ÷ 3 = ?'),
    ]);
    expect(p.action).toBe('skip');
    expect(p.reason).toMatch(/no operator contradiction/);
  });

  it('never retires every copy in a group', () => {
    // The invariant that makes deactivation safe: whatever the group, at least
    // one copy of the item survives.
    const groups = [
      [doc('multiplication-basics', '12 × 6 = ?'), doc('one-step-division', '12 × 6 = ?')],
      [doc('multiply-fractions', '4/5 ÷ 4/5'), doc('divide-fractions', '4/5 ÷ 4/5')],
      [doc('one-step-division', '8 × 4 = ?'), doc('one-step-multiplication', '8 × 4 = ?'),
        doc('multiplication-basics', '8 × 4 = ?')],
    ];
    for (const g of groups) {
      const p = planForGroup(g);
      if (p.action === 'retire') expect(p.keep.length).toBeGreaterThan(0);
    }
  });
});

describe('promptKey', () => {
  it('matches the audit script so both group items identically', () => {
    expect(promptKey('12  ×  6 = ?')).toBe(promptKey('12 × 6 = ?'));
  });

  it('keeps operators that distinguish different items', () => {
    expect(promptKey('12 * 6')).not.toBe(promptKey('12 + 6'));
  });
});

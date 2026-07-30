/**
 * Decision logic of scripts/retagProblemStructures.js.
 *
 * This rewrites skillId on real documents, so the tests are weighted toward
 * what must NOT move: a wrong retag files a subtraction item under addition,
 * where it will be served as addition practice forever.
 */

const {
  promptOperation,
  planForProblem,
  STRUCTURE_SKILLS,
} = require('../../scripts/retagProblemStructures');

const p = (skillId, prompt) => ({ skillId, prompt, problemId: 'x' });

describe('promptOperation', () => {
  it('reads the symbol when there is one', () => {
    expect(promptOperation('5 + 3 = ?')).toBe('addition');
    expect(promptOperation('9 - 4 = ?')).toBe('subtraction');
  });

  it('reads the expression as written, not the solution method', () => {
    // A missing-addend item is solved BY subtracting but is an addition-family
    // problem. Filing it under subtraction would break the whole point.
    expect(promptOperation('5 + __ = 8')).toBe('addition');
  });

  it('does not mistake a word hyphen for a minus sign', () => {
    // "twenty-one" would otherwise read as subtraction and move a correct
    // addition item to the wrong operation. The guarantee is that it is not
    // read as subtraction — a bare "more" is genuinely ambiguous ("how many
    // more than") so null, meaning skip, is the right answer here.
    expect(promptOperation('Sam had twenty-one apples and got 3 more.')).not.toBe('subtraction');
    expect(promptOperation('A part-part-whole model shows 4 and 6 joined.')).toBe('addition');
  });

  it('does not treat a bare "more" as an addition cue', () => {
    // Comparison problems use "more" and are subtraction. Ambiguity must skip.
    expect(promptOperation('How many more apples does Sam have than Amy?')).toBeNull();
  });

  it('falls back to word cues when no symbol is present', () => {
    expect(promptOperation('Sam has 5 apples and 3 more. How many altogether?')).toBe('addition');
    expect(promptOperation('Sam had 8 apples and gave away 3. How many are left?')).toBe('subtraction');
  });

  it('refuses to judge mixed or contradictory prompts', () => {
    expect(promptOperation('5 + 3 - 2 = ?')).toBeNull();
    expect(promptOperation('Find the sum, then the difference.')).toBeNull();
  });

  it('returns null for an empty or absent prompt', () => {
    expect(promptOperation('')).toBeNull();
    expect(promptOperation(null)).toBeNull();
    expect(promptOperation('   ')).toBeNull();
  });
});

describe('planForProblem', () => {
  it('moves an unambiguous structure skill to its operation', () => {
    const plan = planForProblem(p('missing-addend', '5 + __ = 8'));
    expect(plan.action).toBe('retag');
    expect(plan.target).toBe('addition');
  });

  it('reads the operation per item for structures that span both', () => {
    // The reason this is per-item and not a crosswalk alias: result-unknown
    // is not inherently addition.
    expect(planForProblem(p('result-unknown', '5 + 3 = __')).target).toBe('addition');
    expect(planForProblem(p('result-unknown', '9 - 4 = __')).target).toBe('subtraction');
  });

  it('leaves non-structure skills completely alone', () => {
    const plan = planForProblem(p('slope', 'Find the slope through (1,2) and (3,8).'));
    expect(plan.action).toBe('skip');
    expect(plan.reason).toMatch(/not a structure skill/);
  });

  it('skips rather than guessing when the operation is undeterminable', () => {
    const plan = planForProblem(p('part-part-whole', 'Draw a model for this situation.'));
    expect(plan.action).toBe('skip');
    expect(plan.reason).toMatch(/not determinable/);
  });

  it('flags a structure skill whose prompt contradicts it, instead of burying it', () => {
    // A `missing-addend` item that plainly subtracts is a pre-existing tagging
    // bug. Silently filing it as addition would bake the bug in permanently.
    const plan = planForProblem(p('missing-addend', '9 - 4 = __'));
    expect(plan.action).toBe('skip');
    expect(plan.reason).toMatch(/needs review/);
  });

  it('only ever targets addition or subtraction', () => {
    for (const skillId of Object.keys(STRUCTURE_SKILLS)) {
      for (const prompt of ['5 + 3 = __', '9 - 4 = __']) {
        const plan = planForProblem(p(skillId, prompt));
        if (plan.action === 'retag') {
          expect(['addition', 'subtraction']).toContain(plan.target);
        }
      }
    }
  });
});

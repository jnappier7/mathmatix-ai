/**
 * Match-classification for scripts/proposePathwayCrosswalk.js.
 *
 * Rows in the `high` tier go live in the resolver with no human looking at
 * them, so the tests below are about what must NOT reach that tier. A wrong
 * high-confidence row silently points a course skill at the wrong problems —
 * worse than leaving it unmapped, because it looks fixed.
 */

const {
  classifyMatch,
  rankCandidates,
  HIGH_SCORE,
  HIGH_LEAD,
} = require('../../scripts/proposePathwayCrosswalk');

const cand = (id, score) => ({ id, name: '', score, count: 10 });

describe('classifyMatch', () => {
  it('auto-applies a strong, unrivalled match', () => {
    const v = classifyMatch([cand('place-value', 0.9), cand('decimals-place-value', 0.4)]);
    expect(v.tier).toBe('high');
    expect(v.target).toBe('place-value');
  });

  it('auto-applies when there is only one candidate at all', () => {
    expect(classifyMatch([cand('slope', 0.75)]).tier).toBe('high');
  });

  it('holds back a strong match that has a close rival', () => {
    // The `comprehensive-trig-review` case: several trig skills score alike
    // because the module genuinely spans them. Picking the top one would
    // silently narrow a multi-skill module to one skill.
    const v = classifyMatch([cand('trig-identities-basic', 0.71), cand('trig-law-of-sines', 0.68)]);
    expect(v.tier).toBe('review');
    expect(v.reason).toMatch(/ambiguous/);
  });

  it('holds back a weak match even when it is unrivalled', () => {
    const v = classifyMatch([cand('ratios', 0.4)]);
    expect(v.tier).toBe('review');
    expect(v.reason).toMatch(/below/);
  });

  it('reports a content gap when nothing cleared the floor', () => {
    const v = classifyMatch([]);
    expect(v.tier).toBe('none');
    expect(v.target).toBeUndefined();
  });

  it('carries the runners-up so a reviewer sees what it rejected', () => {
    const v = classifyMatch([cand('mean', 0.8), cand('median', 0.5), cand('mode', 0.45)]);
    expect(v.alternatives).toEqual(['median', 'mode']);
  });

  it('treats the thresholds as inclusive boundaries', () => {
    const exact = classifyMatch([cand('a', HIGH_SCORE), cand('b', HIGH_SCORE - HIGH_LEAD)]);
    expect(exact.tier).toBe('high');
    const justUnder = classifyMatch([cand('a', HIGH_SCORE - 0.01)]);
    expect(justUnder.tier).toBe('review');
  });
});

describe('rankCandidates', () => {
  const bankIndex = [
    { id: 'place-value', name: 'Whole number place value' },
    { id: 'add-fractions', name: 'Adding fractions' },
    { id: 'slope', name: 'Slope of a line' },
  ].map((b) => ({
    ...b,
    count: 100,
    idTokens: require('../../scripts/auditCourseProblemCoverage').tokens(b.id),
    nameTokens: require('../../scripts/auditCourseProblemCoverage').tokens(b.name),
  }));

  it('finds the bank skill hiding behind a course-prefixed pathway id', () => {
    const ranked = rankCandidates('g6-place-value-decimals', bankIndex);
    expect(ranked[0].id).toBe('place-value');
  });

  it('matches on the catalog display name, not just the id', () => {
    const ranked = rankCandidates('adding-fractions', bankIndex);
    expect(ranked[0].id).toBe('add-fractions');
  });

  it('returns nothing for a pathway skill the bank has no content for', () => {
    expect(rankCandidates('limits-intuitive-approach', bankIndex)).toEqual([]);
  });

  it('never proposes a skill as its own target', () => {
    // `X -> X` resolves to itself and unstrands nothing. Not hypothetical:
    // --offline indexes seeds that contain the pathway ids, so without this
    // every id matched itself at score 1.2 and looked like a confident win.
    const withSelf = [...bankIndex, {
      id: 'slope',
      name: 'Slope of a line',
      count: 451,
      idTokens: require('../../scripts/auditCourseProblemCoverage').tokens('slope'),
      nameTokens: require('../../scripts/auditCourseProblemCoverage').tokens('Slope of a line'),
    }];
    expect(rankCandidates('slope', withSelf).some((c) => c.id === 'slope')).toBe(false);
  });

  it('never returns more than four candidates', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `slope-variant-${i}`,
      name: 'slope',
      count: 1,
      idTokens: require('../../scripts/auditCourseProblemCoverage').tokens('slope'),
      nameTokens: require('../../scripts/auditCourseProblemCoverage').tokens('slope'),
    }));
    expect(rankCandidates('slope', many).length).toBeLessThanOrEqual(4);
  });
});

describe('topic-drop gate', () => {
  const { topicDrops } = require('../../scripts/proposePathwayCrosswalk');
  const { tokens } = require('../../scripts/auditCourseProblemCoverage');
  const target = (id, name = '') => ({ id, idTokens: tokens(id), nameTokens: tokens(name), count: 500 });
  // Candidates from rankCandidates always carry tokens; a fixture without them
  // reads as "covers nothing" and gates everything — fail-closed, deliberately.
  const target2 = (id, score, count) => ({ ...target(id), score, count });

  it('gates a match that drops a subject word', () => {
    // The 451-problem miss: slope fields are differential equations. No rival
    // existed precisely BECAUSE the bank has no slope-fields content, so the
    // lead check cleared it at 0.87.
    expect(topicDrops('slope-fields', target('slope'))).toContain('fields');
    expect(topicDrops('geometric-mean', target('mean'))).toContain('geometric');
    expect(topicDrops('polynomial-multiplication', target('multiplication-basics')))
      .toContain('polynomial');
    expect(topicDrops('partial-fractions', target('fractions-basics'))).toContain('partial');
  });

  it('allows a match that drops only a verb', () => {
    expect(topicDrops('solving-one-step-equations', target('one-step-equations'))).toEqual([]);
    expect(topicDrops('graphing-inequalities', target('graphing-inequalities'))).toEqual([]);
  });

  it('allows a match that drops only a course prefix', () => {
    // emf = early-math-foundations, cm = consumer-math. These are the best rows
    // in the file (emf-place-value -> place-value, 601 problems) and must not gate.
    expect(topicDrops('emf-place-value', target('place-value'))).toEqual([]);
    expect(topicDrops('cm-percent-of-number', target('percent-of-a-number'))).toEqual([]);
    expect(topicDrops('g6-unit-rates', target('unit-rates'))).toEqual([]);
  });

  it('classifyMatch demotes a subject-dropping match to review, never discards it', () => {
    const v = classifyMatch([target2('slope', 0.87, 451)], 'slope-fields');
    expect(v.tier).toBe('review');
    expect(v.target).toBe('slope');           // still recorded for a human
    expect(v.reason).toMatch(/different subject/);
  });

  it('classifyMatch still approves a clean match with a pathwayId supplied', () => {
    const v = classifyMatch([target2('place-value', 0.95, 601)], 'emf-place-value');
    expect(v.tier).toBe('high');
  });
});

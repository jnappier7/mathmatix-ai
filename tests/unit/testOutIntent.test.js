const { detectTestOutIntent } = require('../../utils/testOutIntent');

describe('detectTestOutIntent', () => {
  it.each([
    'I KNOW order of operations how do I test out of this skill?',
    'let me test out',
    'can I test out now',
    'quiz me',
    'challenge me',
    'prove that I know this',
    'skip the lesson',
    'let me prove it',
    "I'm ready to test",
  ])('fires on test-out phrasing: %s', (t) => {
    expect(detectTestOutIntent(t)).toBe(true);
  });

  it.each([
    'this is a test',
    'let me test my answer 3x=9',
    'I know this is hard',
    'what is the protest about',
    'testing 1 2 3',
    'can I test my code',
    '',
    null,
  ])('does NOT fire on: %s', (t) => {
    expect(detectTestOutIntent(t)).toBe(false);
  });
});

describe('resolveTestOutSkillId — no more silent null → improvised quiz', () => {
  const { resolveTestOutSkillId, matchFocusSkillByName } = require('../../utils/testOutIntent');
  const { recentPracticeSkillId } = require('../../utils/tutorPlanManager');

  const base = { message: 'can I test out?', activeSkillId: null, tutorPlan: null, recentPracticeSkillId };

  it('activeSkillId (mastery mode) wins outright', () => {
    expect(resolveTestOutSkillId({ ...base, activeSkillId: 'abs-val' })).toBe('abs-val');
  });

  it('a skill NAMED in the message beats the plan target', () => {
    const tutorPlan = {
      currentTarget: { skillId: 'fractions' },
      skillFocus: [
        { skillId: 'abs-val', displayName: 'Absolute Value', status: 'resolved' },
        { skillId: 'abs-val-eq', displayName: 'Absolute Value Equations', status: 'active' },
      ],
    };
    expect(resolveTestOutSkillId({ ...base, message: 'test out of absolute value', tutorPlan }))
      .toBe('abs-val');
    // Longest name wins when both match
    expect(resolveTestOutSkillId({ ...base, message: 'test out of absolute value equations', tutorPlan }))
      .toBe('abs-val-eq');
  });

  it('falls back to currentTarget, then recent practice, then last session', () => {
    expect(resolveTestOutSkillId({ ...base, tutorPlan: { currentTarget: { skillId: 'abs-val' } } }))
      .toBe('abs-val');

    const practicePlan = {
      currentTarget: { skillId: null },
      skillFocus: [{ skillId: 'abs-val', status: 'in-progress', lastWorkedOn: new Date() }],
    };
    expect(resolveTestOutSkillId({ ...base, tutorPlan: practicePlan })).toBe('abs-val');

    // Kandy's case: fresh plan, but LAST SESSION was absolute value
    const lastSessionPlan = { currentTarget: { skillId: null }, skillFocus: [], lastSession: { skillId: 'abs-val' } };
    expect(resolveTestOutSkillId({ ...base, tutorPlan: lastSessionPlan })).toBe('abs-val');
  });

  it('returns null (for the no-improv directive) when nothing resolves', () => {
    expect(resolveTestOutSkillId({ ...base })).toBeNull();
    expect(resolveTestOutSkillId({ ...base, tutorPlan: { skillFocus: [] } })).toBeNull();
  });

  it('matchFocusSkillByName ignores short/absent names and non-matching messages', () => {
    const plan = { skillFocus: [{ skillId: 's1', displayName: 'Abs' }, { skillId: 's2' }] };
    expect(matchFocusSkillByName('test out of abs', plan)).toBeNull(); // name too short (< 4 chars)
    expect(matchFocusSkillByName('can I test out?', { skillFocus: [{ skillId: 's3', displayName: 'Fractions' }] })).toBeNull();
    expect(matchFocusSkillByName(null, plan)).toBeNull();
  });
});

describe('a challenge requested in the student\'s own words (student audit, 2026-10-15)', () => {
  const { detectTestOutIntent, extractNamedTopic, matchCatalogSkill, resolveTestOutSkillId } = require('../../utils/testOutIntent');
  const AUDIT = 'I want a five-question skill challenge on Systems by substitution. I know how to substitute and I want to prove mastery with written answers as well as multiple choice.';
  // Real unified-catalog rows (prod, 2026-10-16).
  const catalog = [
    { skillId: 'ALG1.EQV.7', displayName: 'Systems by substitution', studentLabel: 'Systems by substitution', source: 'unified-taxonomy' },
    { skillId: 'MS.EQV.9', displayName: 'Systems of equations', studentLabel: 'Two equations at once', source: 'unified-taxonomy' },
    { skillId: 'MS.EQV.5', displayName: 'Two-step equations', source: 'unified-taxonomy' },
    { skillId: 'ALG1.FNC.6', displayName: 'Arithmetic sequences', source: 'unified-taxonomy' },
  ];

  it.each([
    AUDIT,
    'give me a challenge on systems of equations',
    'Can I take the challenge for two-step equations?',
    'I want to prove my mastery',
  ])('fires on: %s', (t) => expect(detectTestOutIntent(t)).toBe(true));

  it.each([
    'this is a challenge for me',
    "it's a real challenge for me",
    'can I try a challenge problem?',
  ])('does NOT fire on: %s', (t) => expect(detectTestOutIntent(t)).toBe(false));

  it('pulls out the named topic, and ignores a pronoun', () => {
    expect(extractNamedTopic(AUDIT)).toBe('Systems by substitution');
    expect(extractNamedTopic('test out of this')).toBeNull();
  });

  it('matches the named topic in the catalog', () => {
    expect(matchCatalogSkill('Systems by substitution', catalog)).toBe('ALG1.EQV.7');
    expect(matchCatalogSkill('systems of equations', catalog)).toBe('MS.EQV.9');
    expect(matchCatalogSkill('banana bread', catalog)).toBeNull();
  });

  it('a named skill beats the plan\'s current target — no challenge on the wrong skill', () => {
    const tutorPlan = { currentTarget: { skillId: 'ALG1.FNC.6' }, skillFocus: [] };
    expect(resolveTestOutSkillId({ message: AUDIT, activeSkillId: null, tutorPlan, recentPracticeSkillId: () => null, catalog })).toBe('ALG1.EQV.7');
  });

  it('named but unmatched → null (the pipeline asks), never the current target', () => {
    const tutorPlan = { currentTarget: { skillId: 'ALG1.FNC.6' }, skillFocus: [] };
    expect(resolveTestOutSkillId({ message: 'test out of banana bread', activeSkillId: null, tutorPlan, recentPracticeSkillId: () => null, catalog })).toBeNull();
  });

  it('no topic named → the existing fallback chain still applies', () => {
    const tutorPlan = { currentTarget: { skillId: 'ALG1.FNC.6' }, skillFocus: [] };
    expect(resolveTestOutSkillId({ message: 'can I test out?', activeSkillId: null, tutorPlan, recentPracticeSkillId: () => null, catalog })).toBe('ALG1.FNC.6');
  });
});

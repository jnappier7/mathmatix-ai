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

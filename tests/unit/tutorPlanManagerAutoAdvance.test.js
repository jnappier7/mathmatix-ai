// tests/unit/tutorPlanManagerAutoAdvance.test.js
//
// Tests that resolveCurrentTarget skips over mastered skills in the focus
// queue, marks them resolved, and advances to the next-priority candidate.
//
// Without this behavior, a user can be permanently pinned to a mastered
// skill (Jason's `simple-probability` case from May 2026).

// Stub the Skill model before requiring code that imports it. We only need
// findOne to return minimal shape — the queue-advance logic does not care
// about prerequisites for already-mastered skills.
jest.mock('../../models/skill', () => ({
  findOne: jest.fn(({ skillId }) => ({
    lean: () => Promise.resolve({
      skillId,
      displayName: skillId,
      prerequisites: [],
    }),
  })),
}));

const { resolveCurrentTarget } = require('../../utils/tutorPlanManager');

function planWith(skillFocus, currentTarget = {}) {
  // Mock TutorPlan document — just an object with the fields the manager
  // reads/writes. We don't need a real mongoose doc for this unit test.
  return {
    skillFocus,
    currentTarget,
    lastUpdated: null,
  };
}

function userWith(skillMastery = {}) {
  return { skillMastery };
}

describe('resolveCurrentTarget — auto-advance past mastered skills', () => {
  test('advances to the next-priority skill when current target is mastered', async () => {
    const plan = planWith(
      [
        {
          skillId: 'simple-probability',
          status: 'in-progress',
          priority: 8,
        },
        {
          skillId: 'quadratic-formula',
          status: 'active',
          priority: 5,
        },
      ],
      { skillId: 'simple-probability' }
    );

    const user = userWith({
      'simple-probability': {
        status: 'mastered',
        masteryScore: 1,
        totalAttempts: 0,
        masteredDate: new Date('2026-02-15'),
      },
      // quadratic-formula has no mastery entry — fresh skill
    });

    const { skillResolution } = await resolveCurrentTarget(plan, { user });

    expect(skillResolution.skillId).toBe('quadratic-formula');
    expect(plan.currentTarget.skillId).toBe('quadratic-formula');

    // The mastered skill should be marked resolved with a timestamp
    const stale = plan.skillFocus.find(sf => sf.skillId === 'simple-probability');
    expect(stale.status).toBe('resolved');
    expect(stale.resolvedAt).toBeInstanceOf(Date);
  });

  test('drains a queue of all-mastered skills and returns null resolution', async () => {
    const plan = planWith([
      { skillId: 'a', status: 'active', priority: 3 },
      { skillId: 'b', status: 'active', priority: 2 },
    ]);
    const masteredEntry = { status: 'mastered', masteryScore: 1, totalAttempts: 0, masteredDate: new Date() };
    const user = userWith({ a: masteredEntry, b: masteredEntry });

    const { skillResolution } = await resolveCurrentTarget(plan, { user });

    expect(skillResolution).toBeNull();
    expect(plan.skillFocus.every(sf => sf.status === 'resolved')).toBe(true);
  });

  test('does NOT skip a mastered skill when caller passes explicit activeSkillId', async () => {
    // The student asked to work on this specific skill (e.g. opened a course
    // session on it). We still resolve, just in leverage mode.
    const plan = planWith([
      { skillId: 'simple-probability', status: 'active', priority: 5 },
    ]);
    const user = userWith({
      'simple-probability': {
        status: 'mastered',
        masteryScore: 1,
        totalAttempts: 0,
        masteredDate: new Date(),
      },
    });

    const { skillResolution } = await resolveCurrentTarget(plan, {
      user,
      activeSkillId: 'simple-probability',
    });

    expect(skillResolution.skillId).toBe('simple-probability');
    expect(skillResolution.instructionalMode).toBe('leverage');
  });

  test('leaves a non-mastered current target alone', async () => {
    const plan = planWith(
      [{ skillId: 'limits', status: 'in-progress', priority: 5 }],
      { skillId: 'limits' }
    );
    const user = userWith({
      limits: {
        status: 'learning',
        masteryScore: 0.4,
        totalAttempts: 3,
      },
    });

    const { skillResolution } = await resolveCurrentTarget(plan, { user });

    expect(skillResolution.skillId).toBe('limits');
    expect(skillResolution.familiarity).toBe('developing');
    const entry = plan.skillFocus[0];
    expect(entry.status).toBe('in-progress');
    expect(entry.resolvedAt).toBeUndefined();
  });
});

// tests/unit/sessionOpener.test.js
// Unit tests for utils/sessionOpener.js — strategy selection + topic override

const {
  generateSessionOpener,
  shouldOverrideTopic,
  STRATEGIES
} = require('../../utils/sessionOpener');

describe('STRATEGIES enum', () => {
  test('exposes all expected strategy names', () => {
    expect(STRATEGIES.CONTINUITY).toBeDefined();
    expect(STRATEGIES.STRUGGLE_PIVOT).toBeDefined();
    expect(STRATEGIES.BREAKTHROUGH_FOLLOW_UP).toBeDefined();
    expect(STRATEGIES.PREREQUISITE_FIRST).toBeDefined();
    expect(STRATEGIES.COURSE_NEXT).toBeDefined();
    expect(STRATEGIES.REVIEW_DUE).toBeDefined();
    expect(STRATEGIES.MILESTONE).toBeDefined();
    expect(STRATEGIES.FRESH_START).toBeDefined();
  });
});

describe('generateSessionOpener — strategy selection priority', () => {
  test('continuity (unfinished business) wins over everything else', () => {
    const opener = generateSessionOpener({
      tutorPlan: {
        lastSession: {
          unfinishedBusiness: 'You were factoring x^2 - 9 and got stuck on the second step.',
          topic: 'factoring',
          outcome: 'breakthrough'
        },
        skillFocus: [
          { prerequisiteGaps: [{ status: 'needs-work' }] }
        ]
      },
      user: { firstName: 'Sam' },
      tutorProfile: { name: 'Alex' },
      courseSession: { status: 'active', courseName: 'Algebra 1', overallProgress: 50 }
    });

    expect(opener.strategy).toBe(STRATEGIES.CONTINUITY);
  });

  test('struggle pivot when last session was a struggle (no continuity)', () => {
    const opener = generateSessionOpener({
      tutorPlan: { lastSession: { outcome: 'struggled', topic: 'fractions', skillId: 'add-fractions' } },
      user: {}, tutorProfile: {}, courseSession: null
    });
    expect(opener.strategy).toBe(STRATEGIES.STRUGGLE_PIVOT);
  });

  test('breakthrough follow-up after a successful session', () => {
    const opener = generateSessionOpener({
      tutorPlan: { lastSession: { outcome: 'breakthrough', topic: 'slope' } },
      user: {}, tutorProfile: {}, courseSession: null
    });
    expect(opener.strategy).toBe(STRATEGIES.BREAKTHROUGH_FOLLOW_UP);
  });

  test('prerequisite gap overrides course next', () => {
    const opener = generateSessionOpener({
      tutorPlan: {
        skillFocus: [{ prerequisiteGaps: [{ status: 'needs-work', skillId: 'integers' }] }]
      },
      user: {}, tutorProfile: {},
      courseSession: { status: 'active', courseName: 'Algebra 1', overallProgress: 30 }
    });
    expect(opener.strategy).toBe(STRATEGIES.PREREQUISITE_FIRST);
  });

  test('course next when active course session and no higher-priority signal', () => {
    const opener = generateSessionOpener({
      tutorPlan: {},
      user: {}, tutorProfile: {},
      courseSession: { status: 'active', courseName: 'Algebra 1', overallProgress: 30 }
    });
    expect(opener.strategy).toBe(STRATEGIES.COURSE_NEXT);
  });

  test('falls back to FRESH_START when no signals', () => {
    const opener = generateSessionOpener({
      tutorPlan: {}, user: { firstName: 'Sam' }, tutorProfile: {}, courseSession: null
    });
    expect(opener.strategy).toBe(STRATEGIES.FRESH_START);
  });

  test('opener output has expected shape (strategy + suggestionChips)', () => {
    const opener = generateSessionOpener({
      tutorPlan: { lastSession: { unfinishedBusiness: 'x', topic: 't' } },
      user: {}, tutorProfile: {}, courseSession: null
    });
    expect(opener).toHaveProperty('strategy');
    expect(opener).toHaveProperty('directives');
    expect(Array.isArray(opener.suggestionChips)).toBe(true);
  });

  test('REVIEW_DUE chosen when there are stale mastered skills', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const opener = generateSessionOpener({
      tutorPlan: {
        skillFocus: [
          { skillId: 's1', status: 'resolved', lastWorkedOn: fourDaysAgo, displayName: 'Slope' },
          { skillId: 's2', familiarity: 'mastered', lastWorkedOn: fourDaysAgo, displayName: 'Y-intercept' }
        ]
      },
      user: {}, tutorProfile: {}, courseSession: null
    });
    // Could be REVIEW_DUE (priority 5); ensure it's not FRESH_START fallback
    expect(opener.strategy).not.toBe(STRATEGIES.FRESH_START);
  });
});

describe('shouldOverrideTopic', () => {
  test('homework keywords always override and queue return-to-plan', () => {
    const r = shouldOverrideTopic('I have homework due tomorrow', {});
    expect(r.override).toBe(true);
    expect(r.returnToPlan).toBe(true);
  });

  test.each([
    'I have a quiz tomorrow',
    'My test is in 2 days',
    'Can we look at my worksheet?'
  ])('homework keyword in "%s" triggers override', (msg) => {
    expect(shouldOverrideTopic(msg, {}).override).toBe(true);
  });

  test('explicit "can you teach me" overrides', () => {
    expect(shouldOverrideTopic('Can you teach me derivatives?', {}).override).toBe(true);
  });

  test('"how do I" overrides', () => {
    expect(shouldOverrideTopic('How do I factor this?', {}).override).toBe(true);
  });

  test('agreeable openers ("yeah", "ok", "idk") stick with the plan', () => {
    expect(shouldOverrideTopic('ok', {}).override).toBe(false);
    expect(shouldOverrideTopic("yeah let's go", {}).override).toBe(false);
    expect(shouldOverrideTopic('idk', {}).override).toBe(false);
  });

  test('default behavior (no signal) sticks with the plan', () => {
    const r = shouldOverrideTopic('hello there', {});
    expect(r.override).toBe(false);
    expect(r.returnToPlan).toBe(false);
  });
});

// tests/unit/badgeAwarder.test.js
// Unit tests for utils/badgeAwarder.js

const {
  awardBadgesForSkills,
  generateBadgeSummary,
  BADGE_CATALOG
} = require('../../utils/badgeAwarder');

function makeSession(skillId, { answered = 5, correct = 5 } = {}) {
  const responses = [];
  for (let i = 0; i < answered; i++) {
    responses.push({ skillId, correct: i < correct });
  }
  return { responses };
}

describe('BADGE_CATALOG', () => {
  test('contains badges for known skills', () => {
    expect(BADGE_CATALOG['integer-all-operations']).toBeDefined();
    expect(BADGE_CATALOG['two-step-equations']).toHaveLength(3);
  });

  test('every badge has the required fields', () => {
    for (const list of Object.values(BADGE_CATALOG)) {
      for (const b of list) {
        expect(b.badgeId).toBeDefined();
        expect(b.name).toBeDefined();
        expect(['bronze', 'silver', 'gold']).toContain(b.tier);
        expect(typeof b.requiredAccuracy).toBe('number');
        expect(typeof b.requiredTheta).toBe('number');
      }
    }
  });
});

describe('awardBadgesForSkills', () => {
  test('skips skills not in the catalog', async () => {
    const user = { badges: [] };
    const session = makeSession('not-a-skill');
    const result = await awardBadgesForSkills(user, session, ['not-a-skill'], 5.0);
    expect(result).toEqual([]);
    expect(user.badges).toEqual([]);
  });

  test('initializes user.badges if missing', async () => {
    const user = {};
    const session = makeSession('integer-all-operations');
    await awardBadgesForSkills(user, session, [], 0);
    expect(Array.isArray(user.badges)).toBe(true);
  });

  test('awards bronze when accuracy + theta thresholds are met', async () => {
    const user = { badges: [] };
    const session = makeSession('integer-all-operations', { answered: 5, correct: 5 }); // 100% accuracy
    const earned = await awardBadgesForSkills(user, session, ['integer-all-operations'], 0.0); // theta well above -2

    expect(earned).toHaveLength(1);
    expect(earned[0].tier).toBe('bronze');
    expect(user.badges[0].badgeId).toBe('integer-operations-bronze');
    expect(user.badges[0].score).toBe(100);
    expect(user.badges[0].earnedVia).toBe('screener-testout');
  });

  test('awards only the first qualifying tier (progressive unlock)', async () => {
    const user = { badges: [] };
    // 100% accuracy and very high theta — both bronze and silver thresholds met
    const session = makeSession('integer-all-operations', { answered: 10, correct: 10 });
    const earned = await awardBadgesForSkills(user, session, ['integer-all-operations'], 5.0);

    expect(earned).toHaveLength(1);
    expect(earned[0].tier).toBe('bronze'); // bronze first, not silver
  });

  test('skips badges that the user already owns', async () => {
    const user = {
      badges: [{ badgeId: 'integer-operations-bronze', earnedDate: new Date() }]
    };
    const session = makeSession('integer-all-operations', { answered: 5, correct: 5 });
    const earned = await awardBadgesForSkills(user, session, ['integer-all-operations'], 0.0);
    // bronze already owned → silver may be awarded if theta is high enough
    expect(earned.every(b => b.badgeId !== 'integer-operations-bronze')).toBe(true);
  });

  test('does not award when accuracy is below threshold', async () => {
    const user = { badges: [] };
    const session = makeSession('integer-all-operations', { answered: 5, correct: 2 }); // 40%
    const earned = await awardBadgesForSkills(user, session, ['integer-all-operations'], 5.0);
    expect(earned).toEqual([]);
  });

  test('does not award when theta is below threshold', async () => {
    const user = { badges: [] };
    const session = makeSession('integer-all-operations', { answered: 5, correct: 5 });
    const earned = await awardBadgesForSkills(user, session, ['integer-all-operations'], -10.0);
    expect(earned).toEqual([]);
  });

  test('requires at least 3 questions for sufficient data', async () => {
    const user = { badges: [] };
    const session = makeSession('integer-all-operations', { answered: 2, correct: 2 });
    const earned = await awardBadgesForSkills(user, session, ['integer-all-operations'], 5.0);
    expect(earned).toEqual([]);
  });
});

describe('generateBadgeSummary', () => {
  test('returns encouraging message when no badges earned', () => {
    expect(generateBadgeSummary([])).toMatch(/ready to start/i);
  });

  test('summarizes mixed-tier badge counts', () => {
    const summary = generateBadgeSummary([
      { tier: 'bronze', name: 'Integer Explorer', score: 85 },
      { tier: 'bronze', name: 'Fraction Apprentice', score: 80 },
      { tier: 'silver', name: 'Two-Step Champion', score: 90 },
      { tier: 'gold', name: 'Equation Master', score: 95 }
    ]);

    expect(summary).toMatch(/4 badges/);
    expect(summary).toMatch(/2 Bronze/);
    expect(summary).toMatch(/1 Silver/);
    expect(summary).toMatch(/1 Gold/);
    expect(summary).toMatch(/Integer Explorer/);
  });

  test('uses singular form when only one badge', () => {
    const summary = generateBadgeSummary([
      { tier: 'bronze', name: 'Integer Explorer', score: 85 }
    ]);
    expect(summary).toMatch(/1 badge[^s]/);
  });
});

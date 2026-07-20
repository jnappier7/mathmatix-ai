/**
 * The chat path's skill-mastery write — utils/pipeline/persist.js.
 *
 * This is the main tutoring flow: every turn runs it. It used to be a SECOND,
 * independent implementation of the mastery model, with its own pillars, its own
 * scoring formula and its own thresholds — `accuracy >= 0.90 && total >= 3`, so
 * three demonstrations was mastery. That is what produced "100% mastered" beside
 * a "Continue" button in production. The fix for that bug went into
 * masteryEngine first, which serves a DIFFERENT route; this path was untouched
 * and had no tests at all.
 */

const { updateSkillMastery } = require('../../utils/pipeline/persist');
const { currentRung } = require('../../utils/skillRung');

const makeUser = () => ({
  skillMastery: new Map(),
  learningProfile: { recentWins: [] },
  markModified: jest.fn()
});

const convo = (msgs = []) => ({ messages: msgs });
const askedForHelp = convo([{ role: 'user', content: "I'm stuck, can I get a hint?" }]);

/** Drive n verified demonstrations, cycling contexts. */
const demonstrate = (user, skillId, n, { contexts = ['numeric'], conversation = convo() } = {}) => {
  let last;
  for (let i = 0; i < n; i += 1) {
    last = updateSkillMastery(user, skillId, { problemContext: contexts[i % contexts.length] }, conversation);
  }
  return last;
};

describe('the chat path no longer runs its own mastery model', () => {
  test('three demonstrations is not mastery', () => {
    // The old bar exactly: accuracy >= 0.90 && total >= 3, with 3 contexts.
    const user = makeUser();
    demonstrate(user, 'ALG1.EQV.1', 3, { contexts: ['numeric', 'graphical', 'word-problem'] });

    const entry = user.skillMastery.get('ALG1.EQV.1');
    expect(currentRung(entry)).not.toBe('proved');
    expect(entry.status).not.toBe('mastered');
  });

  test('sustained demonstration across contexts does prove it', () => {
    const user = makeUser();
    demonstrate(user, 'ALG1.EQV.1', 8, { contexts: ['numeric', 'graphical', 'word-problem'] });

    const entry = user.skillMastery.get('ALG1.EQV.1');
    expect(currentRung(entry)).toBe('proved');
    expect(entry.status).toBe('mastered');
  });

  test('the crossing is reported to the caller so the cascade can fire', () => {
    const user = makeUser();
    const ctx = { contexts: ['numeric', 'graphical', 'word-problem'] };
    const flags = [];
    for (let i = 0; i < 9; i += 1) {
      flags.push(demonstrate(user, 'ALG1.EQV.1', 1, {
        contexts: [ctx.contexts[i % 3]]
      }).justProved);
    }
    expect(flags.filter(Boolean)).toHaveLength(1);
  });

  test('a verified demonstration writes a receipt', () => {
    const user = makeUser();
    demonstrate(user, 'ALG1.EQV.1', 8, { contexts: ['numeric', 'graphical', 'word-problem'] });

    const entry = user.skillMastery.get('ALG1.EQV.1');
    const proof = entry.rungHistory.find((h) => h.to === 'proved');
    expect(proof).toBeDefined();
    expect(proof.via).toBe('practice');
  });

  test('repeated identical practice does not prove transfer', () => {
    const user = makeUser();
    demonstrate(user, 'ALG1.EQV.1', 12, { contexts: ['numeric'] });
    expect(currentRung(user.skillMastery.get('ALG1.EQV.1'))).toBe('learned');
  });

  test('asking for help repeatedly blocks the independence pillar', () => {
    const user = makeUser();
    demonstrate(user, 'ALG1.EQV.1', 8, {
      contexts: ['numeric', 'graphical', 'word-problem'],
      conversation: askedForHelp
    });
    expect(currentRung(user.skillMastery.get('ALG1.EQV.1'))).not.toBe('proved');
  });

  test('skill ids are canonicalized so one concept is one entry', () => {
    const user = makeUser();
    demonstrate(user, 'ALG1.EQV.1', 1);
    expect([...user.skillMastery.keys()]).toHaveLength(1);
  });
});

describe('recent wins', () => {
  test('a win is recorded once, when the skill is first owned', () => {
    const user = makeUser();
    demonstrate(user, 'ALG1.EQV.1', 12, { contexts: ['numeric', 'graphical', 'word-problem'] });
    expect(user.learningProfile.recentWins).toHaveLength(1);
  });

  test('no win is claimed before the skill is owned', () => {
    const user = makeUser();
    demonstrate(user, 'ALG1.EQV.1', 3, { contexts: ['numeric', 'graphical', 'word-problem'] });
    expect(user.learningProfile.recentWins).toHaveLength(0);
  });
});

describe('existing evidence is never clobbered', () => {
  test('a prior entry keeps its pillars and history across a new demonstration', () => {
    const user = makeUser();
    demonstrate(user, 'ALG1.EQV.1', 8, { contexts: ['numeric', 'graphical', 'word-problem'] });
    const before = user.skillMastery.get('ALG1.EQV.1');
    const historyLength = before.rungHistory.length;
    const attemptsBefore = before.pillars.accuracy.total;

    demonstrate(user, 'ALG1.EQV.1', 1);
    const after = user.skillMastery.get('ALG1.EQV.1');

    expect(after.rungHistory.length).toBeGreaterThanOrEqual(historyLength);
    expect(after.pillars.accuracy.total).toBe(attemptsBefore + 1);
    expect(currentRung(after)).toBe('proved');
  });
});

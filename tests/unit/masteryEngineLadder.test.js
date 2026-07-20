/**
 * masteryEngine <-> skillRung wiring.
 *
 * This path had no tests, and it is the one that produced the bug: production
 * showed "100% mastered" beside a "Continue" button, off "4 first-try wins - 5
 * practiced this week", for a skill the tutor then offered to teach.
 * updateSkillMastery updated the pillars and the score, read `skill.status` to
 * drive spaced repetition, and never assigned it.
 */

const { updateSkillMastery, calculateMasteryState, initializeSkillMastery } = require('../../utils/masteryEngine');
const { currentRung, advanceRung } = require('../../utils/skillRung');

const fresh = (id = 'ALG1.EQV.1') => {
  const s = initializeSkillMastery(id);
  s.status = 'ready';
  return s;
};

/** Drive n attempts, cycling through `contexts` so transfer can accumulate. */
const practise = (skill, n, { correct = true, hintUsed = false, contexts = ['numeric'] } = {}) => {
  for (let i = 0; i < n; i += 1) {
    updateSkillMastery(skill, {
      correct,
      hintUsed,
      problemContext: contexts[i % contexts.length],
      responseTime: 20
    });
  }
  return skill;
};

describe('updateSkillMastery assigns a rung and a status', () => {
  test('a single attempt puts the skill on the ladder', () => {
    const s = practise(fresh(), 1);
    expect(currentRung(s)).toBe('learned');
    expect(s.status).not.toBe('ready');
    expect(['learning', 'practicing']).toContain(s.status);
  });

  test('status is never left undefined after an attempt', () => {
    // The original defect. Everything downstream keys off this field.
    const s = fresh();
    delete s.status;
    updateSkillMastery(s, { correct: true, problemContext: 'numeric' });
    expect(s.status).toBeDefined();
  });

  test('sustained accurate practice across contexts proves the skill', () => {
    const s = practise(fresh(), 6, { contexts: ['numeric', 'graphical', 'word-problem'] });
    expect(currentRung(s)).toBe('proved');
    expect(s.status).toBe('mastered');
    expect(s.provenBy).toBe('practice');
    expect(s.masteredDate).toBeInstanceOf(Date);
  });

  test('the transition carries a receipt', () => {
    const s = practise(fresh(), 6, { contexts: ['numeric', 'graphical', 'word-problem'] });
    const proof = s.rungHistory.find((h) => h.to === 'proved');
    expect(proof).toBeDefined();
    expect(proof.via).toBe('practice');
    expect(proof.evidence.total).toBeGreaterThanOrEqual(4);
  });
});

describe('the bar that the production bug failed', () => {
  test('four first-try wins out of five is not mastery', () => {
    // 80% accuracy over five problems — the exact evidence the live card called
    // "100% mastered". Fails on two counts: too few attempts for practice-derived
    // proof, and accuracy under the bar.
    const s = fresh();
    const ctx = ['numeric', 'graphical', 'word-problem'];
    practise(s, 2, { correct: true, contexts: ctx });
    practise(s, 1, { correct: false, contexts: ctx });
    practise(s, 2, { correct: true, contexts: ctx });

    expect(s.pillars.accuracy.total).toBe(5);
    expect(currentRung(s)).not.toBe('proved');
    expect(s.status).not.toBe('mastered');
  });

  test('a clean five-problem stretch of practice is still not enough', () => {
    // Practice must clear a higher attempt bar than a challenge run, because it
    // is uncontrolled — this is the size at which the old system lied.
    const s = practise(fresh(), 5, { contexts: ['numeric', 'graphical', 'word-problem'] });
    expect(currentRung(s)).toBe('learned');
  });

  test('accuracy alone does not prove it — transfer is required', () => {
    // Perfect, but every problem looked the same.
    const s = practise(fresh(), 10, { contexts: ['numeric'] });
    expect(currentRung(s)).toBe('learned');
    expect(s.status).not.toBe('mastered');
  });

  test('leaning on hints does not prove independence', () => {
    const s = practise(fresh(), 8, { hintUsed: true, contexts: ['numeric', 'graphical', 'word-problem'] });
    expect(currentRung(s)).not.toBe('proved');
  });

  test('too few attempts cannot prove anything however clean', () => {
    const s = practise(fresh(), 3, { contexts: ['numeric', 'graphical', 'word-problem'] });
    expect(currentRung(s)).toBe('learned');
  });

  test('a proved skill does not silently un-prove on one later miss', () => {
    // Demotion is deliberate (retention decay, contradiction) — not a side
    // effect of a single wrong answer during ordinary practice.
    const s = practise(fresh(), 8, { contexts: ['numeric', 'graphical', 'word-problem'] });
    expect(currentRung(s)).toBe('proved');
    practise(s, 1, { correct: false });
    expect(currentRung(s)).toBe('proved');
  });
});

describe('calculateMasteryState', () => {
  const mastery = (entries) => new Map(Object.entries(entries));

  test('retention no longer gates mastery — it is decay', () => {
    // A retention check is only ever scheduled AFTER mastery, so requiring a
    // passed one beforehand made 'mastered' nearly unreachable.
    const s = fresh();
    s.pillars.accuracy = { correct: 10, total: 10, percentage: 1, threshold: 0.9 };
    s.pillars.independence = { hintsUsed: 0, hintThreshold: 3 };
    s.pillars.transfer = { contextsAttempted: ['a', 'b', 'c'], contextsRequired: 3 };
    s.pillars.retention = { retentionChecks: [], failed: false };
    s.totalAttempts = 10;

    expect(calculateMasteryState(s, mastery({}))).toBe('mastered');
  });

  test('a failed retention check knocks a mastered skill to re-fragile', () => {
    const s = fresh();
    s.status = 'mastered';
    s.totalAttempts = 10;
    s.pillars.retention = { retentionChecks: [{ passed: false }], failed: true };
    expect(calculateMasteryState(s, mastery({}))).toBe('re-fragile');
  });

  test('a prerequisite cleared by inference counts as met', () => {
    // Under the old `status === 'mastered'` test it did not, so a skill cleared
    // by closure silently failed to unlock anything above it.
    const inferred = advanceRung({}, 'proved', { via: 'inference', sourceSkillId: 'X' });
    delete inferred.__rungResult;

    const s = fresh();
    s.prerequisites = ['MS.PRP.3'];
    expect(calculateMasteryState(s, mastery({ 'MS.PRP.3': inferred }))).not.toBe('locked');
  });

  test('an unmet prerequisite still locks the skill', () => {
    const s = fresh();
    s.prerequisites = ['MS.PRP.3'];
    expect(calculateMasteryState(s, mastery({ 'MS.PRP.3': { rung: 'learned' } }))).toBe('locked');
  });
});

describe('the caller is told when to cascade', () => {
  test('__justProved fires on the crossing attempt and never again', () => {
    const ctx = ['numeric', 'graphical', 'word-problem'];
    const s = fresh();
    const flags = [];
    for (let i = 0; i < 10; i += 1) {
      updateSkillMastery(s, { correct: true, problemContext: ctx[i % ctx.length], responseTime: 20 });
      flags.push(!!s.__justProved);
    }
    expect(currentRung(s)).toBe('proved');
    expect(flags.filter(Boolean)).toHaveLength(1);
    // and it is the attempt that crossed the bar, not the first or the last
    expect(flags.indexOf(true)).toBe(5);   // the 6th attempt
  });
});

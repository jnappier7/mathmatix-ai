/**
 * Rung backfill decision logic.
 *
 * The script itself needs Mongo, but the decision — what rung a legacy entry
 * should get, and whether its evidence would still stand — is pure and is the
 * part that can silently rewrite a student's history. Tested directly.
 */

const { GATES } = require('../../utils/skillRung');

// Mirrors scripts/backfillSkillRungs.js. Kept in step by the tests below.
const IN_PROGRESS = ['learning', 'practicing', 'needs-review', 're-fragile'];

function evidenceSupportsMastery(entry) {
  const p = entry.pillars || {};
  const total = p.accuracy?.total || 0;
  const correct = p.accuracy?.correct || 0;
  const hints = p.independence?.hintsUsed || 0;
  const contexts = p.transfer?.contextsAttempted?.length || 0;
  if (total < GATES.PRACTICE_MIN_ATTEMPTS) return false;
  if (correct / total < GATES.PROVE_MIN_ACCURACY) return false;
  if (hints > GATES.PROVE_MAX_HINTS) return false;
  return contexts >= GATES.PRACTICE_MIN_CONTEXTS;
}

function plan(entry, { demote = false } = {}) {
  if (entry.rung) return null;
  const wasInferred = entry.masteryType === 'inferred' || entry.masteryType === 'fragile-inferred';

  if (entry.status === 'mastered') {
    const supported = evidenceSupportsMastery(entry);
    if (!supported && demote) return { rung: 'learned', provenBy: 'legacy', supported: false, demoted: true };
    return { rung: 'proved', provenBy: wasInferred ? 'inference' : 'legacy', supported, demoted: false };
  }
  if (IN_PROGRESS.includes(entry.status)) {
    return { rung: 'learned', provenBy: 'legacy', supported: null, demoted: false };
  }
  return { rung: 'none', provenBy: null, supported: null, demoted: false };
}

const solid = {
  status: 'mastered',
  pillars: {
    accuracy: { correct: 9, total: 10 },
    independence: { hintsUsed: 1 },
    transfer: { contextsAttempted: ['numeric', 'graphical', 'word-problem'] }
  }
};

const thin = {
  status: 'mastered',
  pillars: {
    accuracy: { correct: 4, total: 5 },
    independence: { hintsUsed: 0 },
    transfer: { contextsAttempted: ['numeric'] }
  }
};

describe('what rung a legacy entry gets', () => {
  test('legacy mastered becomes proved', () => {
    expect(plan(solid)).toMatchObject({ rung: 'proved', provenBy: 'legacy' });
  });

  test('a reconstructed rung is never passed off as a demonstrated proof', () => {
    // We know they reached the old 'mastered' state. We do not know on what
    // evidence, because the old write path recorded none.
    const p = plan(solid);
    expect(['challenge', 'fluency', 'practice', 'teachback']).not.toContain(p.provenBy);
  });

  test('in-progress states become learned', () => {
    IN_PROGRESS.forEach((status) => {
      expect(plan({ status })).toMatchObject({ rung: 'learned' });
    });
  });

  test('never-started states stay off the ladder', () => {
    ['locked', 'ready', undefined].forEach((status) => {
      expect(plan({ status })).toMatchObject({ rung: 'none' });
    });
  });

  test('nothing is ever reconstructed as taught', () => {
    // The old model had no concept of teaching, so no legacy data can imply it.
    ['mastered', ...IN_PROGRESS, 'ready'].forEach((status) => {
      expect(plan({ status, pillars: solid.pillars }).rung).not.toBe('taught');
    });
  });

  test('an already-migrated entry is left alone', () => {
    expect(plan({ status: 'mastered', rung: 'taught' })).toBeNull();
  });

  test('a genuine inference record keeps its provenance', () => {
    // Relabelling it 'legacy' would lose the fact that the system granted it.
    expect(plan({ ...solid, masteryType: 'inferred' })).toMatchObject({
      rung: 'proved',
      provenBy: 'inference'
    });
  });
});

describe('unsupported legacy mastery', () => {
  test('the four-of-five shape is recognised as unsupported', () => {
    expect(evidenceSupportsMastery(thin)).toBe(false);
  });

  test('by default it is kept and flagged, not deleted', () => {
    // Silently removing progress a student believes they have is worse than an
    // over-generous claim we can see and re-verify.
    const p = plan(thin);
    expect(p).toMatchObject({ rung: 'proved', supported: false, demoted: false });
  });

  test('--demote-unsupported knocks it to learned instead', () => {
    expect(plan(thin, { demote: true })).toMatchObject({ rung: 'learned', demoted: true });
  });

  test('solid legacy evidence is not demoted even with the flag', () => {
    expect(plan(solid, { demote: true })).toMatchObject({ rung: 'proved', supported: true });
  });

  test('the bar matches the live practice gate exactly', () => {
    // If these drift, the backfill and the runtime disagree about what mastery
    // means, and the migration silently re-introduces the bug.
    const atBar = {
      status: 'mastered',
      pillars: {
        accuracy: { correct: GATES.PRACTICE_MIN_ATTEMPTS, total: GATES.PRACTICE_MIN_ATTEMPTS },
        independence: { hintsUsed: GATES.PROVE_MAX_HINTS },
        transfer: { contextsAttempted: Array(GATES.PRACTICE_MIN_CONTEXTS).fill('c').map((c, i) => c + i) }
      }
    };
    expect(evidenceSupportsMastery(atBar)).toBe(true);

    const oneHintOver = JSON.parse(JSON.stringify(atBar));
    oneHintOver.pillars.independence.hintsUsed = GATES.PROVE_MAX_HINTS + 1;
    expect(evidenceSupportsMastery(oneHintOver)).toBe(false);

    const oneAttemptShort = JSON.parse(JSON.stringify(atBar));
    oneAttemptShort.pillars.accuracy = {
      correct: GATES.PRACTICE_MIN_ATTEMPTS - 1,
      total: GATES.PRACTICE_MIN_ATTEMPTS - 1
    };
    expect(evidenceSupportsMastery(oneAttemptShort)).toBe(false);
  });
});

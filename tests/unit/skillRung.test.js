/**
 * The mastery ladder. These tests encode the product decisions, not just the
 * code — each one corresponds to a rule we agreed a student-facing mastery
 * claim has to satisfy.
 */

const {
  currentRung,
  clearsPrerequisites,
  isInferred,
  canAdvance,
  evidenceSupports,
  advanceRung,
  demoteRung,
  markExplicitFailure,
  GATES
} = require('../../utils/skillRung');

const cleanRun = { correct: 5, total: 5, hintsUsed: 0 };

describe('currentRung', () => {
  test('a missing or empty entry is on no rung', () => {
    expect(currentRung(undefined)).toBe('none');
    expect(currentRung({})).toBe('none');
  });

  test('legacy mastered entries read as proved', () => {
    expect(currentRung({ status: 'mastered' })).toBe('proved');
  });

  test('legacy in-progress entries read as learned', () => {
    ['learning', 'practicing', 'needs-review', 're-fragile'].forEach((status) => {
      expect(currentRung({ status })).toBe('learned');
    });
  });

  test('legacy data never reads as taught — nothing recorded it', () => {
    ['mastered', 'learning', 'practicing'].forEach((status) => {
      expect(currentRung({ status })).not.toBe('taught');
    });
  });

  test('an explicit rung wins over the legacy status', () => {
    expect(currentRung({ rung: 'taught', status: 'learning' })).toBe('taught');
  });
});

describe('advancing the ladder', () => {
  test('a lesson takes an untouched skill to learned', () => {
    const e = advanceRung({}, 'learned', { via: 'lesson' });
    expect(e.__rungResult.changed).toBe(true);
    expect(e.rung).toBe('learned');
    expect(e.learningStarted).toBeInstanceOf(Date);
  });

  test('a clean challenge run proves it', () => {
    const e = advanceRung({ rung: 'learned' }, 'proved', { via: 'challenge', evidence: cleanRun });
    expect(e.rung).toBe('proved');
    expect(e.provenBy).toBe('challenge');
    expect(e.masteryType).toBe('verified');
  });

  test('a student may skip learned entirely — the test-out path', () => {
    // This is the absolute-value case: the skill was below the student's level,
    // the screener never closed it, and they should not have to sit through it.
    const e = advanceRung({}, 'proved', { via: 'challenge', evidence: cleanRun });
    expect(e.__rungResult).toMatchObject({ changed: true, from: 'none', to: 'proved' });
  });

  test('teaching it back is the top rung', () => {
    const e = advanceRung({ rung: 'proved', provenBy: 'challenge' }, 'taught', {
      via: 'teachback',
      evidence: { rubricScore: 4 }
    });
    expect(e.rung).toBe('taught');
  });

  test('the ladder never moves backward through advanceRung', () => {
    const e = advanceRung({ rung: 'taught' }, 'proved', { via: 'challenge', evidence: cleanRun });
    expect(e.__rungResult.changed).toBe(false);
    expect(e.rung).toBe('taught');
  });

  test('you cannot teach what you have not proved', () => {
    const e = advanceRung({ rung: 'learned' }, 'taught', { via: 'teachback', evidence: { rubricScore: 4 } });
    expect(e.__rungResult.changed).toBe(false);
    expect(e.__rungResult.reason).toMatch(/prove it before/i);
  });

  test('a rung cannot be earned by the wrong kind of work', () => {
    expect(canAdvance({}, 'proved', 'lesson').ok).toBe(false);
    expect(canAdvance({}, 'learned', 'challenge').ok).toBe(false);
    expect(canAdvance({ rung: 'proved' }, 'taught', 'challenge').ok).toBe(false);
  });
});

describe('evidence gates', () => {
  test('a short run does not prove anything', () => {
    const r = evidenceSupports('proved', 'challenge', { correct: 3, total: 3, hintsUsed: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/at least/);
  });

  test('leaning on hints does not prove independence', () => {
    const r = evidenceSupports('proved', 'challenge', { correct: 5, total: 5, hintsUsed: 4 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/hints/);
  });

  test('accuracy below the bar does not prove it', () => {
    const r = evidenceSupports('proved', 'challenge', { correct: 3, total: 5, hintsUsed: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/accuracy/);
  });

  test('four first-try wins in a week is not a mastery claim', () => {
    // The bug this whole model exists to prevent: the live day-one card showed
    // "100% mastered" off "4 first-try wins - 5 practiced this week".
    const e = advanceRung({}, 'proved', {
      via: 'challenge',
      evidence: { correct: 4, total: 5, hintsUsed: 0 }
    });
    expect(e.__rungResult.changed).toBe(false);
    expect(e.rung).toBeUndefined();
  });

  test('fluency is measured against the student own baseline, not a clock', () => {
    // utils/adaptiveFluency.js is explicitly designed so a dyslexic student is
    // not locked out of a rung by reading speed.
    expect(evidenceSupports('proved', 'fluency', { fluencyZScore: -0.4, accuracy: 1 }).ok).toBe(true);
    expect(evidenceSupports('proved', 'fluency', { fluencyZScore: 0.8, accuracy: 1 }).ok).toBe(false);
    expect(evidenceSupports('proved', 'fluency', { fluencyZScore: -1, accuracy: 0.5 }).ok).toBe(false);
  });

  test('an unscored or weak teach-back does not reach the top rung', () => {
    const base = { rung: 'proved', provenBy: 'challenge' };
    expect(advanceRung({ ...base }, 'taught', { via: 'teachback', evidence: {} }).__rungResult.changed).toBe(false);
    expect(
      advanceRung({ ...base }, 'taught', {
        via: 'teachback',
        evidence: { rubricScore: GATES.TEACH_MIN_RUBRIC - 1 }
      }).__rungResult.changed
    ).toBe(false);
  });
});

describe('inference — cleared from above', () => {
  test('closure grants proved without a demonstration', () => {
    const e = advanceRung({}, 'proved', { via: 'inference', sourceSkillId: 'ALG1.PRP.2' });
    expect(e.rung).toBe('proved');
    expect(isInferred(e)).toBe(true);
    expect(e.masteryType).toBe('inferred');
    expect(e.inferredFrom).toBe('ALG1.PRP.2');
  });

  test('an inferred skill still clears prerequisites above it', () => {
    const e = advanceRung({}, 'proved', { via: 'inference', sourceSkillId: 'ALG1.PRP.2' });
    expect(clearsPrerequisites(e)).toBe(true);
  });

  test('but inference cannot reach the top rung', () => {
    // Otherwise a skill hits rung 3 with zero problem-solving evidence: the
    // system asserted it and the student narrated it.
    const e = advanceRung({}, 'proved', { via: 'inference', sourceSkillId: 'ALG1.PRP.2' });
    const t = advanceRung(e, 'taught', { via: 'teachback', evidence: { rubricScore: 4 } });
    expect(t.__rungResult.changed).toBe(false);
    expect(t.__rungResult.reason).toMatch(/cleared from above/i);
  });

  test('proving it directly afterwards is allowed and upgrades the receipt', () => {
    const e = advanceRung({}, 'proved', { via: 'inference', sourceSkillId: 'ALG1.PRP.2' });
    // Same rung, so advanceRung refuses; the caller re-proves by demoting first.
    demoteRung(e, { to: 'learned', reason: 'student chose to prove it directly' });
    const p = advanceRung(e, 'proved', { via: 'challenge', evidence: cleanRun });
    expect(p.provenBy).toBe('challenge');
    expect(isInferred(p)).toBe(false);
    expect(advanceRung(p, 'taught', { via: 'teachback', evidence: { rubricScore: 4 } }).rung).toBe('taught');
  });
});

describe('demotion — retention decay and contradiction', () => {
  test('a proved skill decays back to learned, not to nothing', () => {
    const e = advanceRung({ rung: 'learned' }, 'proved', { via: 'challenge', evidence: cleanRun });
    demoteRung(e, { reason: 'retention check failed' });
    expect(e.rung).toBe('learned');
    expect(e.rungHistory.at(-1)).toMatchObject({ via: 'demotion', reason: 'retention check failed' });
  });

  test('an inferred skill clears entirely — it was the cheapest claim we held', () => {
    const e = advanceRung({}, 'proved', { via: 'inference', sourceSkillId: 'X' });
    demoteRung(e, { reason: 'contradicted' });
    expect(e.rung).toBe('none');
    expect(e.masteryType).toBe('fragile-inferred');
  });

  test('demotion refuses to move a skill upward', () => {
    const e = { rung: 'learned' };
    demoteRung(e, { to: 'proved' });
    expect(e.__rungResult.changed).toBe(false);
    expect(e.rung).toBe('learned');
  });

  test('an explicit miss is recorded so inference cannot re-grant it', () => {
    const e = advanceRung({}, 'proved', { via: 'inference', sourceSkillId: 'X' });
    markExplicitFailure(e, { context: { problemId: 'p1' } });
    expect(e.explicitlyFailed).toBe(true);
    expect(e.failureDate).toBeInstanceOf(Date);
    expect(e.rung).toBe('none');
  });
});

describe('receipts', () => {
  test('every transition is logged with the evidence that justified it', () => {
    const e = {};
    advanceRung(e, 'learned', { via: 'lesson' });
    advanceRung(e, 'proved', { via: 'challenge', evidence: cleanRun });
    advanceRung(e, 'taught', { via: 'teachback', evidence: { rubricScore: 4 } });

    expect(e.rungHistory).toHaveLength(3);
    expect(e.rungHistory.map((h) => h.to)).toEqual(['learned', 'proved', 'taught']);
    expect(e.rungHistory[1].evidence).toMatchObject(cleanRun);
    expect(e.rungHistory[2].evidence).toMatchObject({ rubricScore: 4 });
  });

  test('a refused transition leaves no trace on the record', () => {
    const e = { rung: 'learned' };
    advanceRung(e, 'taught', { via: 'teachback', evidence: { rubricScore: 4 } });
    expect(e.rungHistory).toBeUndefined();
    expect(e.rung).toBe('learned');
  });

  test('inference records which skill granted it', () => {
    const e = advanceRung({}, 'proved', { via: 'inference', sourceSkillId: 'CALC.PRP.1' });
    expect(e.rungHistory[0].evidence).toMatchObject({ sourceSkillId: 'CALC.PRP.1' });
  });
});

describe('clearsPrerequisites', () => {
  test('only proved or better opens the skills above', () => {
    expect(clearsPrerequisites({ rung: 'none' })).toBe(false);
    expect(clearsPrerequisites({ rung: 'learned' })).toBe(false);
    expect(clearsPrerequisites({ rung: 'proved' })).toBe(true);
    expect(clearsPrerequisites({ rung: 'taught' })).toBe(true);
  });

  test('learning a skill is not enough to unlock what follows it', () => {
    const e = advanceRung({}, 'learned', { via: 'lesson' });
    expect(clearsPrerequisites(e)).toBe(false);
  });
});

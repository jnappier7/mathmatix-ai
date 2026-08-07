/**
 * Reply-judge telemetry (utils/judgeMetrics.js) — the production half of the
 * eval loop. Pipeline Stage 5g records every judged turn here; the admin
 * metrics endpoint reads the aggregate. These tests pin the ring mechanics and
 * the two headline rates (violationRate, rejectedCorrectRate).
 */
const judgeMetrics = require('../../utils/judgeMetrics');

describe('judgeMetrics', () => {
  beforeEach(() => judgeMetrics.reset());

  test('clean turns count toward the denominator, not the violations', () => {
    judgeMetrics.recordJudgedTurn({ violations: [], studentWasCorrect: true });
    judgeMetrics.recordJudgedTurn({ violations: [], studentWasCorrect: false });
    const agg = judgeMetrics.aggregate();
    expect(agg.sampleSize).toBe(2);
    expect(agg.violated).toBe(0);
    expect(agg.violationRate).toBe(0);
    expect(agg.rejectedCorrectRate).toBe(0);
  });

  test('violations are counted per judge and rated against the right denominators', () => {
    judgeMetrics.recordJudgedTurn({
      violations: [{ judge: 'rejectedCorrectAnswer', evidence: 'rejected: "not quite"' }],
      studentWasCorrect: true,
      action: 'confirm_correct',
      skillId: 'FRAC_ADD_1',
    });
    judgeMetrics.recordJudgedTurn({ violations: [], studentWasCorrect: true });
    judgeMetrics.recordJudgedTurn({
      violations: [{ judge: 'usedImpreciseTerm', evidence: '"reduce"' }],
      studentWasCorrect: false,
    });
    judgeMetrics.recordJudgedTurn({ violations: [], studentWasCorrect: false });

    const agg = judgeMetrics.aggregate();
    expect(agg.sampleSize).toBe(4);
    expect(agg.violated).toBe(2);
    expect(agg.violationRate).toBe(0.5);
    expect(agg.byJudge).toEqual({ rejectedCorrectAnswer: 1, usedImpreciseTerm: 1 });
    // doubt-on-correct rate uses correct-answer turns as its denominator (2)
    expect(agg.correctAnswerTurns).toBe(2);
    expect(agg.rejectedCorrectRate).toBe(0.5);
  });

  test('snapshot is newest-first and violationsOnly filters clean turns', () => {
    judgeMetrics.recordJudgedTurn({ violations: [], studentWasCorrect: false });
    judgeMetrics.recordJudgedTurn({
      violations: [{ judge: 'badOrderOfOperations', evidence: 'M before D' }],
      studentWasCorrect: false,
    });
    const all = judgeMetrics.snapshot(10);
    expect(all).toHaveLength(2);
    expect(all[0].judges).toEqual(['badOrderOfOperations']);
    const onlyBad = judgeMetrics.snapshot(10, { violationsOnly: true });
    expect(onlyBad).toHaveLength(1);
    expect(onlyBad[0].violated).toBe(true);
  });

  test('evidence strings are truncated, never student content', () => {
    judgeMetrics.recordJudgedTurn({
      violations: [{ judge: 'rejectedCorrectAnswer', evidence: 'x'.repeat(500) }],
      studentWasCorrect: true,
    });
    expect(judgeMetrics.snapshot(1)[0].evidence[0]).toHaveLength(160);
  });

  test('the ring wraps without losing count of totalEver', () => {
    for (let i = 0; i < 1005; i++) {
      judgeMetrics.recordJudgedTurn({ violations: [], studentWasCorrect: false });
    }
    const agg = judgeMetrics.aggregate();
    expect(agg.sampleSize).toBe(1000);
    expect(agg.totalEver).toBe(1005);
  });
});

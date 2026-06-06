const { buildDecisionDoc } = require('../../utils/visualDecisionLog');

describe('visualDecisionLog.buildDecisionDoc', () => {
  const baseRecord = {
    action: 'graph',
    decision: 'block',
    reasonCode: 'SOLUTION_SET_LEAK',
    riskLevel: 'fatal',
    visualPurpose: null,
    originalCommand: { action: 'graph', fn: 'x^2 - 5x + 6' },
    replacementCommand: null,
    auditReason: 'SOLUTION_SET_LEAK',
  };
  const activeProblem = {
    problemText: 'Find the roots of x^2 - 5x + 6',
    correctAnswer: 'x = 2 or x = 3',
    problemType: 'quadratic',
    status: 'unsolved',
  };
  const learningState = { concept: 'quadratics', misconception: null, masteryScore: 55 };

  it('maps a gate record + context into a flat corpus doc', () => {
    const doc = buildDecisionDoc({
      record: baseRecord,
      activeProblem,
      learningState,
      mode: 'shadow',
      userId: 'u1',
      conversationId: 'c1',
      turnIndex: 7,
    });
    expect(doc).toMatchObject({
      userId: 'u1',
      conversationId: 'c1',
      turnIndex: 7,
      mode: 'shadow',
      action: 'graph',
      decision: 'block',
      reasonCode: 'SOLUTION_SET_LEAK',
      riskLevel: 'fatal',
      activeProblem: { correctAnswer: 'x = 2 or x = 3', status: 'unsolved' },
      learningState: { concept: 'quadratics', masteryScore: 55 },
    });
    expect(doc.originalCommand).toEqual({ action: 'graph', fn: 'x^2 - 5x + 6' });
  });

  it('defaults missing context to null without throwing', () => {
    const doc = buildDecisionDoc({ record: { action: 'image', decision: 'allow' }, mode: 'shadow' });
    expect(doc.userId).toBeNull();
    expect(doc.conversationId).toBeNull();
    expect(doc.turnIndex).toBeNull();
    expect(doc.riskLevel).toBe('none');
    expect(doc.activeProblem.problemText).toBeNull();
    expect(doc.learningState.masteryScore).toBeNull();
  });

  it('coerces a non-numeric masteryScore to null', () => {
    const doc = buildDecisionDoc({
      record: { action: 'graph', decision: 'allow' },
      learningState: { masteryScore: 'high' },
      mode: 'live_control',
    });
    expect(doc.learningState.masteryScore).toBeNull();
  });
});

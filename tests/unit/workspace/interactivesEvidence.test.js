/**
 * Interactives as evidence (spec §6.9) — the last MVP acceptance criterion.
 *
 * The contract: concept-model manipulations are exploration StudentMoves;
 * the SERVER judges meaningful-vs-noise deterministically; only meaningful
 * exploration produces evidence, and only into the TRANSFER pillar
 * (representation exposure) — never accuracy, never a tutor turn.
 */
const { verifyConceptModelMove } = require('../../../utils/workspace/conceptModelMoveVerifier');
const { touchTransferContext } = require('../../../utils/workspace/interactiveEvidence');
const { processStudentMove } = require('../../../services/workspace/studentMoveService');

function modelMove(overrides = {}, paramOverrides = {}) {
  return {
    schemaVersion: 1,
    moveId: 'mv-test-1',
    conversationId: 'c1',
    workspaceId: 'chat',
    elementId: 'lgc1-0-model',
    elementType: 'model',
    source: 'gesture',
    intent: 'set_param',
    mode: 'exploration',
    previousState: { params: { m: 1 } },
    proposedState: { params: { m: 3 } },
    operation: {
      type: 'set_param',
      parameters: { modelName: 'slope_intercept_line', param: 'm', from: 1, to: 3, min: -5, max: 5, ...paramOverrides },
    },
    interaction: { gestureType: 'drag', pointerType: 'mouse', startedAt: '2026-07-27T12:00:00.000Z', completedAt: '2026-07-27T12:00:01.000Z' },
    clientSequence: 1,
    idempotencyKey: 'idem-test-1',
    ...overrides,
  };
}

describe('verifyConceptModelMove', () => {
  test('a settled, real change is meaningful — but NEVER a correctness claim', () => {
    const v = verifyConceptModelMove(modelMove());
    expect(v.classification).toBe('meaningful_exploration');
    expect(v.mathematicallyValid).toBeNull();
    expect(v.canonicalMove).toBe('set m: 1 → 3 on slope_intercept_line');
    expect(v.evidenceContext).toBe('interactive:slope_intercept_line');
  });

  test('scrubbing back to the start is noise (sub-2%-of-range)', () => {
    const v = verifyConceptModelMove(modelMove({}, { from: 1, to: 1.05 }));  // 0.5% of range 10
    expect(v.classification).toBe('noise');
    expect(v.evidenceContext).toBeNull();
  });

  test('a twitch-length gesture is noise even if the value moved', () => {
    const v = verifyConceptModelMove(modelMove({
      interaction: { startedAt: '2026-07-27T12:00:00.000Z', completedAt: '2026-07-27T12:00:00.050Z' },
    }));
    expect(v.classification).toBe('noise');
  });

  test('malformed operations are invalid interactions, not crashes', () => {
    expect(verifyConceptModelMove(modelMove({}, { from: 'NaNish' })).classification).toBe('invalid_interaction');
    expect(verifyConceptModelMove(modelMove({ operation: { type: 'wiggle' } })).classification).toBe('invalid_interaction');
  });
});

describe('processStudentMove: the model exploration lane', () => {
  test('meaningful exploration verifies, surfaces evidence, and NEVER normalizes a pipeline step', () => {
    const r = processStudentMove(modelMove());
    expect(r.ok).toBe(true);
    expect(r.verifiedMove.classification).toBe('meaningful_exploration');
    expect(r.verifiedMove.mathematicallyValid).toBeNull();
    expect(r.verifiedMove.committed).toBe(false);
    expect(r.normalized).toBeNull();                       // anti-leak: no tutor turn, ever
    expect(r.modelEvidence).toEqual({ context: 'interactive:slope_intercept_line' });
  });

  test('noise verifies but carries no evidence', () => {
    const r = processStudentMove(modelMove({}, { from: 1, to: 1.01 }));
    expect(r.ok).toBe(true);
    expect(r.verifiedMove.classification).toBe('noise');
    expect(r.modelEvidence).toBeNull();
  });

  test('non-model exploration still takes the legacy no_op path', () => {
    const r = processStudentMove(modelMove({
      elementType: 'number_line',
      previousState: { marks: [1] },
      proposedState: { marks: [3] },
      operation: { type: 'set_param' },
    }));
    expect(r.ok).toBe(true);
    expect(r.verifiedMove.classification).toBe('no_op');
    expect(r.modelEvidence).toBeUndefined();
  });
});

describe('touchTransferContext: honest, idempotent evidence', () => {
  test('records once, flips formatVariety at 2 contexts, never double-counts', () => {
    const entry = { pillars: { transfer: { contextsAttempted: ['word-problem'], contextsRequired: 3, formatVariety: false } } };
    expect(touchTransferContext(entry, 'interactive:slope_intercept_line')).toBe(true);
    expect(entry.pillars.transfer.contextsAttempted).toEqual(['word-problem', 'interactive:slope_intercept_line']);
    expect(entry.pillars.transfer.formatVariety).toBe(true);
    // 400 more drags: same single context.
    expect(touchTransferContext(entry, 'interactive:slope_intercept_line')).toBe(false);
    expect(entry.pillars.transfer.contextsAttempted).toHaveLength(2);
  });

  test('initializes missing pillars; accuracy is never touched', () => {
    const entry = {};
    expect(touchTransferContext(entry, 'interactive:number_line')).toBe(true);
    expect(entry.pillars.transfer.contextsAttempted).toEqual(['interactive:number_line']);
    expect(entry.pillars.accuracy).toBeUndefined();
    expect(touchTransferContext(null, 'x')).toBe(false);
  });
});

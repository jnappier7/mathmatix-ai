// tests/unit/workspace/studentMoveService.test.js
// Promoted from services/workspace/__selftest_service__.js, PLUS the P1 seam's
// load-bearing claim: the normalized pipelineMessage classifies as an
// ANSWER_ATTEMPT in the real observe stage (so the tutor REACTS to the move
// instead of re-posing it), and NOT as a bare problem drop (which would fire
// the anti-leak elicitation path). See docs/BOARD_STUDENT_MOVES_INTEGRATION.md.

const { processStudentMove } = require('../../../services/workspace/studentMoveService');
const { ELEMENT_TYPES } = require('../../../shared/workspace');
const { observe, MESSAGE_TYPES } = require('../../../utils/pipeline/observe');

const x = (coefficient, variable = 'x') => ({ coefficient, variable });
const move = (over = {}) => Object.assign({
  schemaVersion: 1, moveId: 'm-1', conversationId: 'c-1', workspaceId: 'w-1', elementId: 'tiles-1',
  elementType: ELEMENT_TYPES.ALGEBRA_TILES, source: 'gesture', mode: 'attempt',
  intent: 'combine_like_terms',
  previousState: {}, proposedState: {},
  operation: { type: 'combine_like_terms', operands: [x(2), x(3)] },
  interaction: { gestureType: 'drag', pointerType: 'touch', startedAt: '2026-07-12T00:00:00Z', completedAt: '2026-07-12T00:00:01Z' },
  clientSequence: 1, idempotencyKey: 'k-1',
}, over);

describe('processStudentMove — valid combine (2x + 3x)', () => {
  const good = processStudentMove(move());
  test('accepted with a valid, committed verdict', () => {
    expect(good.ok).toBe(true);
    expect(good.status).toBe(200);
    expect(good.verifiedMove.mathematicallyValid).toBe(true);
    expect(good.verifiedMove.committed).toBe(true);
  });
  test('statedStep is the clean equation (board mirror form)', () => {
    expect(good.normalized.statedStep).toBe('2x + 3x = 5x');
  });
  test('pipelineMessage is the ANSWER_ATTEMPT form (tutor-turn input)', () => {
    expect(good.normalized.pipelineMessage).toBe('I combined 2x + 3x to get 5x');
  });
});

describe('processStudentMove — misconception (2x + 3, allow-and-teach)', () => {
  const bad = processStudentMove(move({ operation: { type: 'combine_like_terms', operands: [x(2), x(3, '')] } }));
  test('still accepted but not committed', () => {
    expect(bad.ok).toBe(true);
    expect(bad.verifiedMove.mathematicallyValid).toBe(false);
    expect(bad.verifiedMove.committed).toBe(false);
    expect(bad.verifiedMove.misconceptionCode).toBe('COMBINED_UNLIKE_TERMS');
  });
  test('statedStep shows the wrong CLAIM', () => {
    expect(bad.normalized.statedStep).toBe('2x + 3 = 5x');
  });
  test('pipelineMessage frames the wrong claim in first person', () => {
    expect(bad.normalized.pipelineMessage).toBe('I combined 2x + 3 to get 5x');
  });
});

describe('processStudentMove — no-math modes and untrusted input', () => {
  test('reposition carries no math verdict and no stated step', () => {
    const repo = processStudentMove(move({ mode: 'reposition' }));
    expect(repo.ok).toBe(true);
    expect(repo.verifiedMove.mathematicallyValid).toBeNull();
    expect(repo.verifiedMove.classification).toBe('no_op');
    expect(repo.normalized).toBeNull();
  });
  test('exploration carries no stated step (nothing to grade → no answer injection)', () => {
    const explore = processStudentMove(move({ mode: 'exploration' }));
    expect(explore.ok).toBe(true);
    expect(explore.normalized).toBeNull();
  });
  test('smuggled server verdict → 400', () => {
    expect(processStudentMove(move({ mathematicallyValid: true })).status).toBe(400);
  });
  test('bad elementType → 400', () => {
    expect(processStudentMove(move({ elementType: 'wormhole' })).status).toBe(400);
  });
  test('no verifier for graph yet → 422', () => {
    expect(processStudentMove(move({ elementType: ELEMENT_TYPES.GRAPH })).status).toBe(422);
  });
});

// ── The seam's crux: does the normalized string actually classify right? ──
// This is the claim the integration doc said must be validated on the live
// stack. We run the REAL observe() over the REAL normalizer output.
describe('normalized pipelineMessage classifies correctly in observe()', () => {
  const cases = [
    { label: 'valid like-terms', operands: [x(2), x(3)], answer: '5x' },
    { label: 'misconception claim', operands: [x(2), x(3, '')], answer: '5x' },
    { label: 'negative coefficient', operands: [x(2), x(-3)], answer: '-x' },
    { label: 'other variable', operands: [x(4, 'y'), x(2, 'y')], answer: '6y' },
  ];

  for (const c of cases) {
    test(`${c.label}: ANSWER_ATTEMPT, answer preserved, NOT a bare drop`, () => {
      const res = processStudentMove(move({ operation: { type: 'combine_like_terms', operands: c.operands } }));
      const obs = observe(res.normalized.pipelineMessage, {});
      expect(obs.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
      expect(obs.answer && obs.answer.value).toBe(c.answer);
      // The anti-leak elicitation path keys off isBareProblemDrop — a stated
      // step must NEVER read as a fresh unsolved problem.
      expect(obs.isBareProblemDrop).toBe(false);
    });
  }

  test('a bare equation ("2x + 3x = 5x") would MISfire — proves the reframing is necessary', () => {
    // Guard rail: if someone "simplifies" the normalizer back to a bare
    // equation, this documents why that breaks the seam.
    const obs = observe('2x + 3x = 5x', {});
    expect(obs.messageType).not.toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(obs.isBareProblemDrop).toBe(true);
  });
});

// tests/unit/workspace/scaffoldBlankMove.test.js
//
// Interactive scaffold blanks, round two (owner call, 2026-07-28: "make the
// board feel interactive, but also make sense"). Round one was removed
// (2026-07-25) because the inputs submitted through a side door chat had no
// concept of. This lane is the tile pattern: tap → StudentMove → server
// verdict → tutor reacts through the SAME pipeline turn as a typed answer.
//
// The two load-bearing claims, mirrored from studentMoveService.test.js:
//   1. the verdict is asymmetric — the CAS decides only what it can settle
//      (a single-blank equation); everything else abstains to the tutor turn.
//   2. the normalized pipelineMessage classifies as an ANSWER_ATTEMPT in the
//      REAL observe stage, and never as a bare problem drop.

const { verifyScaffoldBlankMove, substituteBlank, texToPlain } = require('../../../utils/workspace/scaffoldBlankVerifier');
const { processStudentMove } = require('../../../services/workspace/studentMoveService');
const { ELEMENT_TYPES } = require('../../../shared/workspace');
const { observe, MESSAGE_TYPES } = require('../../../utils/pipeline/observe');

const blankMove = (params = {}, over = {}) => Object.assign({
  schemaVersion: 1, moveId: 'm-b1', conversationId: 'c-1', workspaceId: 'w-1', elementId: 'lgc1-2-scaffold',
  elementType: ELEMENT_TYPES.EQUATION, source: 'keyboard', mode: 'attempt',
  intent: 'fill_blank',
  previousState: {}, proposedState: {},
  operation: { type: 'fill_blank', parameters: Object.assign({ stepTex: '1 \\div \\boxed{} = 10', blankIndex: 0, value: '0.1' }, params) },
  interaction: { gestureType: 'edit', pointerType: 'keyboard', startedAt: '2026-07-28T00:00:00Z', completedAt: '2026-07-28T00:00:01Z' },
  clientSequence: 1, idempotencyKey: 'k-b1',
}, over);

describe('verifyScaffoldBlankMove — the CAS decides single-blank equations', () => {
  test('the production board scaffold, filled right: 1 ÷ [0.1] = 10', () => {
    const v = verifyScaffoldBlankMove(blankMove());
    expect(v.interactionValid).toBe(true);
    expect(v.mathematicallyValid).toBe(true);
    expect(v.classification).toBe('blank_fill_valid');
    expect(v.resultingState.tex).toBe('1 \\div {0.1} = 10');
  });

  test('filled wrong: 1 ÷ [10] = 10 is settled false, not hand-waved', () => {
    const v = verifyScaffoldBlankMove(blankMove({ value: '10' }));
    expect(v.mathematicallyValid).toBe(false);
    expect(v.classification).toBe('blank_fill_incorrect');
  });

  test('the sequences-lesson scaffold: [25] − 20 = 5', () => {
    const v = verifyScaffoldBlankMove(blankMove({ stepTex: '\\boxed{} - 20 = 5', value: '25' }));
    expect(v.mathematicallyValid).toBe(true);
  });

  test('a multi-blank step stays open — one fill is a partial claim', () => {
    const v = verifyScaffoldBlankMove(blankMove({ stepTex: 'f(\\boxed{}) = \\frac{\\boxed{}+1}{\\boxed{}-2}', value: '2' }));
    expect(v.interactionValid).toBe(true);
    expect(v.mathematicallyValid).toBeNull();
    expect(v.classification).toBe('blank_fill_unverified');
  });

  test('untranslatable tex abstains — a parser failure is never a rejection', () => {
    const v = verifyScaffoldBlankMove(blankMove({ stepTex: '\\sqrt{\\boxed{}} = 3', value: '9' }));
    expect(v.mathematicallyValid).toBeNull();
    expect(v.classification).toBe('blank_fill_unverified');
  });

  test('hostile or malformed input is an invalid interaction, not a claim', () => {
    for (const bad of [{ value: '<script>alert(1)</script>' }, { value: '' }, { value: '   ' },
      { stepTex: 'no blanks here' }, { blankIndex: 7 }]) {
      const v = verifyScaffoldBlankMove(blankMove(bad));
      expect(v.interactionValid).toBe(false);
      expect(v.classification).toBe('invalid_interaction');
    }
  });
});

describe('substituteBlank / texToPlain', () => {
  test('substitution targets the right blank by index', () => {
    expect(substituteBlank('\\boxed{} + \\boxed{}', 1, '4')).toBe('\\boxed{} + {4}');
    expect(substituteBlank('\\boxed{} + \\boxed{}', 2, '4')).toBeNull();
  });
  test('the board tex subset converts to mathjs syntax; anything else bails', () => {
    expect(texToPlain('1 \\div {0.1} = 10')).toBe('1 / (0.1) = 10');
    expect(texToPlain('\\frac{3}{4} \\times 8')).toBe('((3)/(4)) * 8');
    expect(texToPlain('\\sqrt{9}')).toBeNull();
  });
});

describe('processStudentMove — the blank lane end to end', () => {
  const good = processStudentMove(blankMove());
  test('EQUATION moves route to the blank verifier and commit on valid', () => {
    expect(good.ok).toBe(true);
    expect(good.verifiedMove.mathematicallyValid).toBe(true);
    expect(good.verifiedMove.committed).toBe(true);
    expect(good.verifiedMove.classification).toBe('blank_fill_valid');
  });
  test('pipelineMessage is the probed ANSWER_ATTEMPT form; statedStep keeps the substituted tex', () => {
    expect(good.normalized.pipelineMessage).toBe('For the blank in that step on my board, I got 0.1');
    expect(good.normalized.statedStep).toBe('1 \\div {0.1} = 10');
  });
  test('a wrong fill still reaches the tutor (allow-and-teach), uncommitted', () => {
    const bad = processStudentMove(blankMove({ value: '10' }));
    expect(bad.verifiedMove.committed).toBe(false);
    expect(bad.normalized.pipelineMessage).toBe('For the blank in that step on my board, I got 10');
  });
  test('a malformed fill never reaches the tutor — normalized is null', () => {
    const invalid = processStudentMove(blankMove({ value: '<script>x</script>' }));
    expect(invalid.ok).toBe(true);
    expect(invalid.normalized).toBeNull();
  });
});

describe('the pipelineMessage classifies as the student\'s OWN step in observe', () => {
  test('ANSWER_ATTEMPT, never a bare problem drop (anti-leak stays closed)', () => {
    const { normalized } = processStudentMove(blankMove());
    const obs = observe(normalized.pipelineMessage, { recentUserMessages: [], recentAssistantMessages: [] });
    expect(obs.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(obs.isBareProblemDrop).toBeFalsy();
  });
});

describe('algebraic blank fills (v1-limit closed, 2026-07-28)', () => {
  test('"I got x+3" classifies ANSWER_ATTEMPT with the algebraic value intact', () => {
    const { normalized } = processStudentMove(blankMove({ stepTex: '\\frac{x^2-9}{x-3} = \\boxed{}', value: 'x+3' }));
    const obs = observe(normalized.pipelineMessage, { recentUserMessages: [], recentAssistantMessages: [] });
    expect(obs.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(obs.answer.value).toBe('x+3');
  });
  test('"I got 2x" no longer truncates to "2"', () => {
    const obs = observe('For the blank in that step on my board, I got 2x', { recentUserMessages: [], recentAssistantMessages: [] });
    expect(obs.answer.value).toBe('2x');
  });
  test('an algebraic mention mid-prose still does NOT mint an answer', () => {
    const obs = observe('I got x too small so I doubled it', { recentUserMessages: [], recentAssistantMessages: [] });
    expect(obs.answer).toBeNull();
  });
});

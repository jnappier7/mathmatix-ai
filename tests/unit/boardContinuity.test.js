/**
 * ONE PROBLEM, ONE CARD — the rules behind it, each pinned on its own.
 *
 * Production 2026-10-05: 5(x+2) − 3x = 26 ⇒ x = 8 sealed into five cards
 * while the tutor restarted the problem. The end-to-end replay of that session
 * lives in tests/unit/workspace/inlineWorkDock.test.js; this file pins the
 * seams it crosses:
 *   1. a verify that is not an answer is a resolve (it closed the card);
 *   2. a pose restating the problem in focus continues its card;
 *   3. a scaffold blank that only copies a given is not a step;
 *   4. an example card may not derive the problem posed in the same turn;
 *   5. a re-pose of the pinned problem takes its paired clear with it.
 */

const {
  residualRatio,
  isUnsolvedEquation,
  demoteNonAnswerVerifies,
  foldRestatedPoses,
} = require('../../utils/pipeline/boardContinuity');
const { enforcePedagogyRule, isWholeBlank } = require('../../utils/boardCommandGuard');
const { dropRedundantPoses } = require('../../utils/pipeline/boardSynthesizer');
const { settleBoardTurn } = require('../../utils/pipeline/boardSettle');

const P = '5(x+2) - 3x = 26';
const openLedger = (steps = []) => ({ current: { problemTex: P, steps }, completed: [] });
const solvedLedger = () => openLedger([{ action: 'resolve', tex: '2x + 10 = 26' }, { action: 'verify', tex: 'x = 8' }]);

describe('residualRatio — the same line of work, by the math', () => {
  test.each([
    ['2x = 16', 1], ['2x + 10 = 26', 1], ['5x + 10 - 3x = 26', 1], ['16 = 2x', -1], ['x = 8', 0.5],
  ])('%s restates the problem (k = %d)', (tex, k) => {
    expect(residualRatio(P, tex)).toBeCloseTo(k, 6);
  });

  test('a different variable, a system, a blank or prose is not comparable', () => {
    expect(residualRatio(P, '2y = 16')).toBeNull();
    expect(residualRatio(P, 'x + y = 3')).toBeNull();
    expect(residualRatio(P, '2x = \\boxed{}')).toBeNull();
    expect(residualRatio(P, 'combine like terms')).toBeNull();
  });

  test('a different root is not the same line', () => {
    expect(residualRatio(P, '2x = 18')).toBeNull();
  });
});

describe('a verify card must state an answer', () => {
  test.each(['2x + 10 = 26', 'x^2 = 9', '\\frac{x}{2} = 4'])('"%s" is an unsolved equation', (tex) => {
    expect(isUnsolvedEquation(tex)).toBe(true);
  });

  test.each([
    'x = 8', '8 = x', '2(8) + 10 = 26',            // answer, answer, substitution check
    'x^2 - 1 = (x - 1)(x + 1)',                     // identity — a factoring check
    'y = 2x + 3',                                   // two variables: an equation-of-a-line answer
    '2x + 4 = 20 = 8',                              // the synthesizer's "problem = answer" shape
  ])('"%s" is left alone', (tex) => {
    expect(isUnsolvedEquation(tex)).toBe(false);
  });

  test('the prod verify "2x + 10 = 26" becomes a resolve, or vanishes beside its twin', () => {
    expect(demoteNonAnswerVerifies([{ action: 'verify', tex: '2x + 10 = 26', check: '2(8) + 10 = 26' }]).commands)
      .toEqual([{ action: 'resolve', tex: '2x + 10 = 26' }]);
    const both = demoteNonAnswerVerifies([
      { action: 'resolve', tex: '2x+10 = 26' },
      { action: 'verify', tex: '2x + 10 = 26' },
    ]);
    expect(both.commands).toEqual([{ action: 'resolve', tex: '2x+10 = 26' }]);
    expect(both.demoted).toHaveLength(1);
  });
});

describe('a restated step continues the open card', () => {
  test('while the card is open, an equivalent pose is folded and the pin is untouched', () => {
    const { commands, folded } = foldRestatedPoses(
      [{ action: 'clear' }, { action: 'pose', tex: '2x = 16' }, { action: 'resolve', tex: '2x = 16' }],
      { ledger: openLedger(), pinTex: P },
    );
    expect(commands).toEqual([{ action: 'resolve', tex: '2x = 16' }]);
    expect(folded.map(c => c.action)).toEqual(['pose', 'clear']);
  });

  test('after a verify dropped the pin, the restart re-anchors to the original problem', () => {
    // Same tex as the card → the ledger and the client both read "same problem".
    const { commands } = foldRestatedPoses([{ action: 'pose', tex: '5x + 10 - 3x = 26' }], { ledger: solvedLedger(), pinTex: null });
    expect(commands).toEqual([{ action: 'pose', tex: P }]);
  });

  test('a solved card only absorbs an identical residual — a new problem with the same answer gets its own card', () => {
    // 3x − 4 = 20 also solves to 8, but its residual is 1.5× — a different problem.
    const out = foldRestatedPoses([{ action: 'pose', tex: '3x - 4 = 20' }], { ledger: solvedLedger(), pinTex: null });
    expect(out.folded).toEqual([]);
    // While the card is still OPEN, any proportional line is a step of it.
    const open = foldRestatedPoses([{ action: 'pose', tex: 'x + 5 = 13' }], { ledger: openLedger(), pinTex: P });
    expect(open.folded).toHaveLength(1);
  });

  test('a genuinely different problem is never folded', () => {
    const cmds = [{ action: 'clear' }, { action: 'pose', tex: '3y - 1 = 8' }];
    expect(foldRestatedPoses(cmds, { ledger: openLedger(), pinTex: P }).commands).toEqual(cmds);
  });

  test('an explicit start-over from the student is honoured', () => {
    const cmds = [{ action: 'clear' }, { action: 'pose', tex: P }];
    expect(foldRestatedPoses(cmds, { ledger: solvedLedger(), pinTex: null, startOver: true }).commands).toEqual(cmds);
  });

  test('with nothing in focus there is nothing to continue', () => {
    const cmds = [{ action: 'pose', tex: '2x = 16' }];
    expect(foldRestatedPoses(cmds, { ledger: null, pinTex: null }).commands).toEqual(cmds);
  });
});

describe('settleBoardTurn — the pipeline tail as one pure function', () => {
  test('a non-answer verify no longer closes the card or drops the pin', () => {
    const out = settleBoardTurn({
      commands: [{ action: 'apply', op: 'combine like terms' }, { action: 'verify', tex: '2x + 10 = 26' }],
      message: 'combine like terms 2x + 10 = 26',
      pinTex: P, lastBoardAction: 'pose', ledger: openLedger(),
    });
    expect(out.lastBoardAction).toBe('resolve');
    expect(out.pin).toBe('keep');
    expect(out.ledger.completed).toHaveLength(0);
    expect(out.ledger.current.steps.some(s => s.action === 'verify')).toBe(false);
  });

  test('a restart after the answer keeps one card and brings the pin back', () => {
    const out = settleBoardTurn({
      commands: [{ action: 'pose', tex: '2x = 16' }, { action: 'resolve', tex: '2x = 16' }],
      message: '2x = 16', pinTex: null, lastBoardAction: 'verify', ledger: solvedLedger(),
    });
    expect(out.ledger.completed).toHaveLength(0);
    expect(out.ledger.current.problemTex).toBe(P);
    expect(out.pin).toEqual({ tex: P });
  });

  test('a new problem still clears and seals the old one', () => {
    const out = settleBoardTurn({
      commands: [{ action: 'pose', tex: '3y - 1 = 8' }],
      message: 'solve 3y - 1 = 8', pinTex: P, lastBoardAction: 'resolve',
      ledger: openLedger([{ action: 'resolve', tex: '2x + 10 = 26' }]),
    });
    expect(out.commands[0]).toEqual({ action: 'clear' });
    expect(out.ledger.completed.map(e => e.problemTex)).toEqual([P]);
    expect(out.ledger.current.problemTex).toBe('3y - 1 = 8');
  });
});

describe('the pedagogy guard', () => {
  const guard = (commands, extra = {}) => enforcePedagogyRule({ commands, userMessage: 'help', ...extra });

  test('a whole-side blank is recognised; a blank inside a term is not', () => {
    expect(isWholeBlank('\\boxed{}')).toBe(true);
    expect(isWholeBlank('\\boxed{\\;\\;}')).toBe(true);
    expect(isWholeBlank('2\\boxed{}')).toBe(false);
  });

  test('a scaffold blank that only copies a given is dropped; a real one is kept', () => {
    const r = guard([
      { action: 'scaffold', tex: '5(x) + 5(2) - 3x = \\boxed{}' },
      { action: 'scaffold', tex: '2x = \\boxed{}' },
    ], { pinnedProblemTex: P });
    expect(r.allowed.map(c => c.tex)).toEqual(['2x = \\boxed{}']);
    expect(r.dropped[0].reason).toBe('scaffold_blank_is_given');
  });

  test('the problem in focus judges the scaffold even after a verify dropped the pin', () => {
    const r = guard([{ action: 'scaffold', tex: '2x + 10 = \\boxed{}' }], { pinnedProblemTex: null, focusProblemTex: P });
    expect(r.dropped.map(d => d.reason)).toEqual(['scaffold_blank_is_given']);
  });

  test('the apply that introduced a dropped scaffold goes with it', () => {
    const r = guard([
      { action: 'apply', op: 'distribute 5 across the terms in the parentheses' },
      { action: 'scaffold', tex: '5(x) + 5(2) - 3x = \\boxed{}' },
    ], { userMessage: 'distribute?', pinnedProblemTex: P });
    expect(r.allowed).toEqual([]);
    expect(r.dropped.map(d => d.reason)).toEqual(['scaffold_blank_is_given', 'apply_orphaned_by_scaffold']);
  });

  test('an example may not derive the problem posed in the same batch — not its echo, not its answer', () => {
    const r = guard([
      { action: 'pose', tex: P },
      { action: 'example', tex: '5(x+2) - 3x = 26' },
      { action: 'example', tex: 'x = 8' },
      { action: 'example', tex: '3(x+1) - x = 11' },   // a parallel problem — still a fine demo
    ], { workedExample: true });
    expect(r.allowed.map(c => c.action + ' ' + c.tex)).toEqual(['pose ' + P, 'example 3(x+1) - x = 11']);
  });
});

describe('dropRedundantPoses takes the paired clear with the echo', () => {
  test('clear + re-pose of the pinned problem → nothing (the clear would seal the card)', () => {
    const { kept } = dropRedundantPoses([{ action: 'clear' }, { action: 'pose', tex: '5(x + 2) - 3x = 26' }], P);
    expect(kept).toEqual([]);
  });

  test('a student start-over keeps the clear', () => {
    const { kept } = dropRedundantPoses([{ action: 'clear' }, { action: 'pose', tex: P }], P, { startOver: true });
    expect(kept).toEqual([{ action: 'clear' }]);
  });
});

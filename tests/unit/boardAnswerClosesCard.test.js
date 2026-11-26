/**
 * The answer closes the card, and is never the next problem (2026-11-26).
 *
 * Two board faults from the owner's preview session, both silent:
 *
 *   • solved problems were sealed "Not finished yet". A card counts as solved
 *     only if it holds a `verify`; the model often sends the student's correct
 *     last line as a plain `resolve`, and once the guard let stated answers
 *     through as lines, the answer sat on a card that still read unfinished;
 *   • the ANSWER was shown as the PROBLEM. After a verify the pin is gone, so
 *     the next equation anyone writes is posed — and the next thing anyone
 *     writes is the tutor confirming "x = 6".
 *
 * Both are decided by the math in boardContinuity (does this value satisfy
 * this one-root problem?), never by wording.
 */
process.env.WORK_BOARD = 'on';

const { answersProblem, promoteAnswerResolves, dropAnswerPoses } = require('../../utils/pipeline/boardContinuity');
const { settleBoardTurn } = require('../../utils/pipeline/boardSettle');

// Play turns through the settle stage the way the pipeline does.
function session() {
  let ledger = null; let pin = null; let last = null;
  return {
    turn(message, commands) {
      const r = settleBoardTurn({ commands, message, pinTex: pin, lastBoardAction: last, ledger, now: new Date(0) });
      ledger = r.ledger; last = r.lastBoardAction;
      if (r.pin !== 'keep') pin = r.pin ? r.pin.tex : null;
      return r;
    },
    get ledger() { return ledger; },
    get pin() { return pin; },
  };
}
const solved = (card) => (card.steps || []).some((s) => s.action === 'verify');

describe('is this line THE answer to this problem?', () => {
  test('yes: a value that satisfies a one-root problem, either way round, fractions and negatives included', () => {
    expect(answersProblem('x = 6', '3(2x + 4) - 5 = 2x + 31')).toBe(true);
    expect(answersProblem('6 = x', '4x = 24')).toBe(true);
    expect(answersProblem('x = \\frac{3}{2}', '2x = 3')).toBe(true);
    expect(answersProblem('x = -2', 'x + 5 = 3')).toBe(true);
  });

  test('no: a wrong value, a line of work, another variable, or the answer measured against itself', () => {
    expect(answersProblem('x = 5', '4x = 24')).toBe(false);
    expect(answersProblem('4x = 24', '4x + 7 = 31')).toBe(false);
    expect(answersProblem('y = 6', '4x = 24')).toBe(false);
    expect(answersProblem('x = 6', 'x = 6')).toBe(false);
  });

  test('no: one root of a quadratic does not finish it', () => {
    expect(answersProblem('x = 7', 'x^2 - 5x - 14 = 0')).toBe(false);
    expect(answersProblem('x = -2', 'x^2 - 5x - 14 = 0')).toBe(false);
  });
});

describe('a correct answer closes its card even when it arrives as a plain line', () => {
  test('the resolve that is the answer becomes the verify; the lines before it stay lines', () => {
    const { commands, promoted } = promoteAnswerResolves(
      [{ action: 'resolve', tex: '4x = 24' }, { action: 'resolve', tex: 'x = 6' }],
      '4x + 7 = 31',
    );
    expect(commands.map((c) => c.action)).toEqual(['resolve', 'verify']);
    expect(promoted).toHaveLength(1);
  });

  test('a WRONG answer stays a line — the card is not closed on it', () => {
    const { commands } = promoteAnswerResolves([{ action: 'resolve', tex: 'x = 5' }], '4x + 7 = 31');
    expect(commands.map((c) => c.action)).toEqual(['resolve']);
  });

  test('it follows a problem posed in the same turn, and never doubles a verify already there', () => {
    const a = promoteAnswerResolves([{ action: 'pose', tex: '2x - 1 = 9' }, { action: 'resolve', tex: 'x = 5' }], '4x + 7 = 31');
    expect(a.commands.map((c) => c.action)).toEqual(['pose', 'verify']);
    const b = promoteAnswerResolves([{ action: 'resolve', tex: 'x = 6' }, { action: 'verify', tex: 'x = 6' }], '4x = 24');
    expect(b.commands.map((c) => c.action)).toEqual(['verify']);
  });

  test('through the settle stage: the card is solved, the pin drops, and it archives as solved', () => {
    const s = session();
    s.turn('solve 4x + 7 = 31', [{ action: 'pose', tex: '4x + 7 = 31' }]);
    s.turn('4x = 24', [{ action: 'resolve', tex: '4x = 24' }]);
    const r = s.turn('x = 6', [{ action: 'resolve', tex: 'x = 6' }]);
    expect(r.commands).toEqual([{ action: 'verify', tex: 'x = 6' }]);
    expect(solved(s.ledger.current)).toBe(true);
    expect(s.pin).toBeNull();

    s.turn('another one', [{ action: 'clear' }, { action: 'pose', tex: '2x - 1 = 9' }]);
    expect(s.ledger.completed.map((c) => [c.problemTex, c.solved])).toEqual([['4x + 7 = 31', true]]);
  });
});

describe('the answer is never posed as the next problem', () => {
  test('after the solve, a pose of the answer is dropped — the solved card stays the card', () => {
    const s = session();
    s.turn('solve 4x + 7 = 31', [{ action: 'pose', tex: '4x + 7 = 31' }]);
    s.turn('x = 6', [{ action: 'verify', tex: 'x = 6' }]);
    const r = s.turn('thanks', [{ action: 'pose', tex: 'x = 6' }]);
    expect(r.commands).toEqual([]);
    expect(s.ledger.current.problemTex).toBe('4x + 7 = 31');
    expect(s.ledger.completed).toHaveLength(0);
  });

  test('the clear paired in front of it goes too, so the solved card is not sealed and replaced', () => {
    const s = session();
    s.turn('solve 4x + 7 = 31', [{ action: 'pose', tex: '4x + 7 = 31' }]);
    s.turn('x = 6', [{ action: 'verify', tex: 'x = 6' }]);
    const r = s.turn('ok', [{ action: 'clear' }, { action: 'pose', tex: 'x = 6' }]);
    expect(r.commands).toEqual([]);
    expect(s.ledger.current.problemTex).toBe('4x + 7 = 31');
  });

  test('it is NOT turned into a verify: a pose skips the guard, so the tutor\'s "x = 6" must not close the card', () => {
    const { commands } = dropAnswerPoses(
      [{ action: 'pose', tex: 'x = 6' }],
      { ledger: { current: { problemTex: '4x + 7 = 31', steps: [] }, completed: [] }, pinTex: '4x + 7 = 31' },
    );
    expect(commands).toEqual([]);
  });

  test('…also when the solved card has already been cleared away', () => {
    const ledger = { current: null, completed: [{ problemTex: '4x + 7 = 31', steps: [{ action: 'verify', tex: 'x = 6' }], solved: true }] };
    expect(dropAnswerPoses([{ action: 'pose', tex: 'x = 6' }], { ledger, pinTex: null }).commands).toEqual([]);
  });

  test('a genuinely new problem is left alone — including one that merely shares the answer', () => {
    const ledger = { current: { problemTex: '4x + 7 = 31', steps: [{ action: 'verify', tex: 'x = 6' }] }, completed: [] };
    const kept = dropAnswerPoses([{ action: 'clear' }, { action: 'pose', tex: '2x - 1 = 11' }], { ledger, pinTex: null });
    expect(kept.commands.map((c) => c.action)).toEqual(['clear', 'pose']);
    expect(kept.dropped).toEqual([]);
  });
});

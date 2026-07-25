/**
 * Board hydration round trip, headless: the persistence contract end to end.
 *
 *   server: applyTurnToLedger (utils/pipeline/boardLedger)
 *        → client: ledgerToTurns (core/ledgerReplay)
 *        → client: adaptBoardCommands (dom/legacyBoardAdapter)
 *        → client: DerivationView semantics (classify / hasSolution)
 *
 * This is the reload story: a student who solved a problem, abandoned another,
 * and is mid-way through a third must come back to two rail thumbnails (the
 * solved one ticked) and the third problem back in focus with its steps.
 *
 * Repo convention keeps DOM layout verification in-browser; here we assert on
 * the adapted element stream + the view's exported pure semantics, which fully
 * determine what DerivationView renders: a `problem` role pins the focus (a
 * different problem archives the previous one), `clear` archives, and
 * hasSolution() is exactly the ✓ on a rail thumbnail.
 */
const { applyTurnToLedger } = require('../../../utils/pipeline/boardLedger');
const { ledgerToTurns } = require('../../../public/js/living-workspace/core/ledgerReplay.js');
const { adaptBoardCommands } = require('../../../public/js/living-workspace/dom/legacyBoardAdapter.js');
const { classify, hasSolution, assistanceSummary } = require('../../../public/js/living-workspace/dom/derivationView.js');
const { ledgerMeta } = require('../../../public/js/living-workspace/core/ledgerReplay.js');

const NOW = new Date('2026-07-25T12:00:00Z');

// Replay a wire-format ledger the way chat-workspace.doHydrate does, and fold
// the adapted turns into the same archive model the view keeps: `clear` or a
// different `problem` parks the focused derivation, everything else appends.
function simulateReplay(wireLedger) {
  const board = { focus: null, rail: [] };
  ledgerToTurns(wireLedger).forEach((turnCmds, i) => {
    const out = adaptBoardCommands(turnCmds, { idPrefix: 'hyd' + i });
    if (out.clear && board.focus) { board.rail.push(board.focus); board.focus = null; }
    out.elements.forEach((el) => {
      const kind = classify(el);
      if (kind === 'problem') {
        const tex = el.semantic.latex;
        if (board.focus && board.focus.problemTex !== tex) { board.rail.push(board.focus); board.focus = null; }
        if (!board.focus) board.focus = { problemTex: tex, elements: [] };
        return;
      }
      if (board.focus) board.focus.elements.push(el);
    });
  });
  return board;
}

describe('board hydration round trip', () => {
  test('solved + abandoned problems return to the rail, the open one lands in focus', () => {
    // Accumulate the ledger exactly as the pipeline would across a session.
    let ledger = null;
    ledger = applyTurnToLedger(ledger, [{ action: 'pose', tex: '2x+5=13' }], NOW);
    ledger = applyTurnToLedger(ledger, [
      { action: 'apply', op: 'subtract 5' },
      { action: 'resolve', tex: '2x=8' },
      { action: 'verify', tex: 'x=4' },
    ], NOW);
    ledger = applyTurnToLedger(ledger, [{ action: 'pose', tex: '3y-1=8' }], NOW); // archives #1
    ledger = applyTurnToLedger(ledger, [{ action: 'resolve', tex: '3y=9' }], NOW);
    ledger = applyTurnToLedger(ledger, [{ action: 'clear' }], NOW);               // archives #2 (unsolved)
    ledger = applyTurnToLedger(ledger, [{ action: 'pose', tex: 'z^2=25' }], NOW);
    ledger = applyTurnToLedger(ledger, [{ action: 'resolve', tex: 'z=\\pm 5' }], NOW);

    // Survive Mongo/JSON transport, then replay client-side.
    const board = simulateReplay(JSON.parse(JSON.stringify(ledger)));

    expect(board.rail).toHaveLength(2);
    expect(board.rail[0].problemTex).toBe('2x+5=13');
    expect(hasSolution(board.rail[0].elements)).toBe(true);    // ✓ thumbnail
    expect(board.rail[1].problemTex).toBe('3y-1=8');
    expect(hasSolution(board.rail[1].elements)).toBe(false);   // no tick

    expect(board.focus.problemTex).toBe('z^2=25');
    expect(board.focus.elements.map(classify)).toEqual(['step']);
    expect(board.focus.elements[0].semantic.latex).toContain('z=');
  });

  test('a ledger with no open problem replays to an empty focus and a populated rail', () => {
    let ledger = null;
    ledger = applyTurnToLedger(ledger, [{ action: 'pose', tex: 'x+1=2' }], NOW);
    ledger = applyTurnToLedger(ledger, [{ action: 'verify', tex: 'x=1' }, { action: 'clear' }], NOW);

    const board = simulateReplay(JSON.parse(JSON.stringify(ledger)));
    expect(board.focus).toBeNull();
    expect(board.rail).toHaveLength(1);
    expect(hasSolution(board.rail[0].elements)).toBe(true);
  });

  test('assistance recorded by the pipeline surfaces as the student-facing summary', () => {
    // Problem 1 solved with heavy help (ladder 8); problem 2 solved unaided.
    let ledger = null;
    ledger = applyTurnToLedger(ledger, [{ action: 'pose', tex: 'a=1' }], NOW, 1);
    ledger = applyTurnToLedger(ledger, [{ action: 'verify', tex: 'a=1' }], NOW, 8);
    ledger = applyTurnToLedger(ledger, [{ action: 'pose', tex: 'b=2' }], NOW, 1);
    ledger = applyTurnToLedger(ledger, [{ action: 'verify', tex: 'b=2' }], NOW, 2);
    ledger = applyTurnToLedger(ledger, [{ action: 'clear' }], NOW, 1);

    const meta = ledgerMeta(JSON.parse(JSON.stringify(ledger)));
    expect(meta.map(m => assistanceSummary(m.solved, m.assistance))).toEqual([
      'Solved with my tutor',
      'Solved it myself',
    ]);
  });

  test('assistanceSummary degrades honestly when the level is unknown', () => {
    expect(assistanceSummary(true, null)).toBe('Solved');       // pre-ladder data
    expect(assistanceSummary(false, 9)).toBe('Not finished yet');
    expect(assistanceSummary(true, 4)).toBe('Solved it myself');
    expect(assistanceSummary(true, 5)).toBe('Solved with my tutor');
  });

  test('every replayed step survives the adapter (nothing dropped in transport)', () => {
    let ledger = null;
    ledger = applyTurnToLedger(ledger, [{ action: 'pose', tex: 'y=2x' }], NOW);
    ledger = applyTurnToLedger(ledger, [
      { action: 'apply', op: 'double it' },
      { action: 'scaffold', tex: 'y=\\boxed{}' },
      { action: 'example', tex: 'y=3x' },
    ], NOW);

    const board = simulateReplay(JSON.parse(JSON.stringify(ledger)));
    expect(board.focus.elements.map(classify)).toEqual(['operation', 'scaffold', 'example']);
  });
});

/**
 * Tutor board-pointing (spec §8): tag extraction + prompt instruction.
 *
 * The numbering contract: <BOARD_POINT step="N"/> uses the board-state
 * block's step numbers, which are the ledger's rendered-row order — the same
 * order the DerivationView paints. One point per turn; tags never leak.
 */
const { verify } = require('../../utils/pipeline/verify');
const { buildBoardStateBlock } = require('../../utils/pipeline/boardStateBlock');
const { applyTurnToLedger } = require('../../utils/pipeline/boardLedger');

const NOW = new Date('2026-07-25T12:00:00Z');

describe('BOARD_POINT extraction', () => {
  test('step form extracts and strips', async () => {
    const v = await verify('Look at this line. <BOARD_POINT step="2"/> See the sign?', {});
    expect(v.extracted.boardPoint).toEqual({ step: 2 });
    expect(v.text).not.toContain('BOARD_POINT');
    expect(v.text).toContain('Look at this line.');
    expect(v.text).toContain('See the sign?');
  });

  test('target forms extract; first of many wins; junk targets ignored', async () => {
    const v = await verify('<BOARD_POINT target="solution"/> and <BOARD_POINT step="1"/>', {});
    expect(v.extracted.boardPoint).toEqual({ target: 'solution' });
    expect(v.text).not.toContain('BOARD_POINT');
    const junk = await verify('<BOARD_POINT target="banana"/>', {});
    expect(junk.extracted.boardPoint).toBeNull();
    expect(junk.text).toContain('BOARD_POINT'); // unrecognized shape left alone (harmless text, model error)
  });

  test('no tag → null', async () => {
    const v = await verify('plain reply', {});
    expect(v.extracted.boardPoint).toBeNull();
  });
});

describe('board-state block teaches pointing only when a problem is up', () => {
  test('with a problem in focus, the POINTING instruction appears', () => {
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: '2x+5=13' }], NOW);
    l = applyTurnToLedger(l, [{ action: 'resolve', tex: '2x=8' }], NOW);
    const block = buildBoardStateBlock(l);
    expect(block).toContain('POINTING:');
    expect(block).toContain('<BOARD_POINT step="N"/>');
  });

  test('no problem in focus → no pointing instruction (nothing to point at)', () => {
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: 'a=1' }], NOW);
    l = applyTurnToLedger(l, [{ action: 'verify', tex: 'a=1' }, { action: 'clear' }], NOW);
    const block = buildBoardStateBlock(l);
    expect(block).not.toContain('POINTING:');
  });
});

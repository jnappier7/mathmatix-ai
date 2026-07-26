/**
 * The tutor's eyes on its own board (utils/pipeline/boardStateBlock.js).
 *
 * The block is rebuilt into the system prompt every turn from the board
 * ledger, so the tutor knows exactly what the student is looking at — and
 * an empty board must contribute zero tokens.
 */
const { buildBoardStateBlock, MAX_STEPS_SHOWN } = require('../../utils/pipeline/boardStateBlock');
const { applyTurnToLedger } = require('../../utils/pipeline/boardLedger');

const NOW = new Date('2026-07-25T12:00:00Z');

describe('buildBoardStateBlock', () => {
  test('empty / null boards contribute nothing', () => {
    expect(buildBoardStateBlock(null)).toBe('');
    expect(buildBoardStateBlock({})).toBe('');
    expect(buildBoardStateBlock({ current: null, completed: [] })).toBe('');
  });

  test('describes the in-progress problem exactly as the ledger recorded it', () => {
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: '2x+5=13' }], NOW);
    l = applyTurnToLedger(l, [
      { action: 'apply', op: 'subtract 5 from both sides' },
      { action: 'resolve', tex: '2x=8' },
    ], NOW);
    const block = buildBoardStateBlock(l);
    expect(block).toContain('Problem in focus: 2x+5=13');
    expect(block).toContain('operation: subtract 5 from both sides');
    expect(block).toContain('line: 2x=8');
    expect(block).toContain('Status: in progress');
    expect(block).toContain('Never re-derive');
  });

  test('a solved problem says SOLVED so the tutor stops working it', () => {
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: '2x+5=13' }], NOW);
    l = applyTurnToLedger(l, [{ action: 'verify', tex: 'x=4' }], NOW);
    const block = buildBoardStateBlock(l);
    expect(block).toContain('SOLUTION shown: x=4');
    expect(block).toContain('Status: SOLVED');
    expect(block).toContain('do not keep');
  });

  test('worksheet-linked problems and the rail are mentioned', () => {
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: 'a=1' }], NOW);
    l = applyTurnToLedger(l, [{ action: 'verify', tex: 'a=1' }], NOW);
    l = applyTurnToLedger(l, [{ action: 'clear' }], NOW);
    l = applyTurnToLedger(l, [{ action: 'pose', tex: '3y-1=8' }], NOW,
      { sourceRef: { uploadId: 'u1', region: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 } } });
    const block = buildBoardStateBlock(l);
    expect(block).toContain('selected from their uploaded worksheet');
    expect(block).toContain('Finished-problems rail: 1 earlier problem');
  });

  test('a posed-but-unworked problem reads as such', () => {
    const l = applyTurnToLedger(null, [{ action: 'pose', tex: 'y=2x' }], NOW);
    expect(buildBoardStateBlock(l)).toContain('only the problem is posed');
  });

  test('long derivations cap at the newest steps with honest numbering', () => {
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: 'big' }], NOW);
    const steps = [];
    for (let i = 1; i <= MAX_STEPS_SHOWN + 4; i++) steps.push({ action: 'resolve', tex: 'step' + i });
    l = applyTurnToLedger(l, steps, NOW);
    const block = buildBoardStateBlock(l);
    expect(block).toContain('newest ' + MAX_STEPS_SHOWN + ' of ' + (MAX_STEPS_SHOWN + 4));
    expect(block).not.toContain('line: step1\n');              // oldest dropped
    expect(block).not.toContain('line: step4');                // …through the cap boundary
    expect(block).toContain('step' + (MAX_STEPS_SHOWN + 4));   // newest kept
    // Numbering continues from the true position, not from 1.
    expect(block).toContain('  5. line: step5');
  });

  test('long tex truncates instead of flooding the prompt', () => {
    const l = applyTurnToLedger(null, [{ action: 'pose', tex: 'x+'.repeat(200) }], NOW);
    const line = buildBoardStateBlock(l).split('\n').find(s => s.startsWith('Problem in focus'));
    expect(line.length).toBeLessThan(130);
    expect(line).toContain('…');
  });
});

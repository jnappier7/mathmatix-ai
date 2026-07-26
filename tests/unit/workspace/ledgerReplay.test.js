/**
 * Ledger → replay turns (public/js/living-workspace/core/ledgerReplay.js).
 *
 * Hydration replays the persisted board through the SAME render path as live
 * turns, so this contract is what keeps a reloaded board identical to the one
 * the student left: completed problems each replay as [pose, ...steps] then an
 * explicit clear (parking them on the rail), and the in-progress problem
 * replays last with no clear, landing back in focus.
 */
const { ledgerToTurns, ledgerMeta } = require('../../../public/js/living-workspace/core/ledgerReplay.js');

describe('ledgerToTurns', () => {
  test('null / malformed ledgers replay to nothing', () => {
    expect(ledgerToTurns(null)).toEqual([]);
    expect(ledgerToTurns(undefined)).toEqual([]);
    expect(ledgerToTurns('junk')).toEqual([]);
    expect(ledgerToTurns({})).toEqual([]);
  });

  test('a completed problem replays as pose + steps, then an explicit clear', () => {
    const turns = ledgerToTurns({
      current: null,
      completed: [{
        problemTex: '2x+5=13',
        steps: [{ action: 'resolve', tex: '2x=8' }, { action: 'verify', tex: 'x=4' }],
        solved: true,
      }],
    });
    expect(turns).toEqual([
      [
        { action: 'pose', tex: '2x+5=13' },
        { action: 'resolve', tex: '2x=8' },
        { action: 'verify', tex: 'x=4' },
      ],
      [{ action: 'clear' }],
    ]);
  });

  test('the in-progress problem replays last, with no trailing clear', () => {
    const turns = ledgerToTurns({
      current: { problemTex: '3y-1=8', steps: [{ action: 'apply', op: 'add 1' }] },
      completed: [{ problemTex: '2x+5=13', steps: [{ action: 'verify', tex: 'x=4' }], solved: true }],
    });
    expect(turns).toHaveLength(3);
    expect(turns[2]).toEqual([
      { action: 'pose', tex: '3y-1=8' },
      { action: 'apply', op: 'add 1' },
    ]);
    expect(turns[2].some(c => c.action === 'clear')).toBe(false);
  });

  test('identical back-to-back problems still archive separately (the explicit clear)', () => {
    // Pose-triggered archiving skips same-tex poses; the explicit clear between
    // completed replays is what keeps two solves of the same problem as two
    // rail thumbnails instead of one merged derivation.
    const entry = { problemTex: '2x+5=13', steps: [{ action: 'verify', tex: 'x=4' }], solved: true };
    const turns = ledgerToTurns({ current: null, completed: [entry, { ...entry }] });
    expect(turns.map(t => t[0].action)).toEqual(['pose', 'clear', 'pose', 'clear']);
  });

  test('entries without a problemTex are skipped, steps default to empty', () => {
    const turns = ledgerToTurns({
      current: { problemTex: 'y=x' },                  // no steps array
      completed: [{ steps: [{ action: 'verify' }] }],  // no problemTex
    });
    expect(turns).toEqual([[{ action: 'pose', tex: 'y=x' }]]);
  });
});

describe('ledgerMeta', () => {
  test('aligns 1:1 with the completed entries ledgerToTurns replays — skips the same junk', () => {
    const ledger = {
      current: { problemTex: 'z=1', steps: [] },
      completed: [
        { problemTex: 'a=1', steps: [{ action: 'verify' }], solved: true, assistance: 3, completedAt: 'T1' },
        { steps: [{ action: 'verify' }] },                       // no problemTex → replay skips it
        { problemTex: 'b=2', steps: [{ action: 'resolve' }], solved: false, assistance: 9 },
      ],
    };
    const meta = ledgerMeta(ledger);
    // 2 replayable completed entries → 2 meta rows (junk skipped identically),
    // and current is NOT in meta (it never lands on the rail).
    expect(meta).toEqual([
      { assistance: 3, solved: true, completedAt: 'T1', sourceRef: null },
      { assistance: 9, solved: false, completedAt: null, sourceRef: null },
    ]);
    // The invariant the rail zip depends on: meta rows == archived replays.
    const clears = ledgerToTurns(ledger).filter(t => t[0].action === 'clear').length;
    expect(meta).toHaveLength(clears);
  });

  test('null / malformed ledgers give empty meta', () => {
    expect(ledgerMeta(null)).toEqual([]);
    expect(ledgerMeta({})).toEqual([]);
  });
});

/**
 * Production report, 2026-07-29 (algebra-tiles session): the tutor said
 * "Let me get those on your screen for you. Take a look now…" but the board
 * kept the previous topic's |x| transformation tool and no tiles appeared —
 * and the chat bubble leaked a raw "\(" ("your \( x terms)").
 *
 * Three fixes pinned here:
 *  1. synthesizeTilesTab — a tiles promise with a tileable active problem
 *     backfills the TILES tab command the model should have emitted.
 *  2. synthesizeAutoClear — a pose for a genuinely NEW problem prepends the
 *     `clear` that stops old cards stacking above the new work.
 *  3. stripOrphanMathDelims — unbalanced \( / \[ delimiters are dropped.
 */

const { synthesizeTilesTab, synthesizeAutoClear } = require('../../utils/pipeline/boardSynthesizer');
const { stripOrphanMathDelims } = require('../../utils/internalTagSanitizer');

const TILES_REPLY =
  "Let me get those on your screen for you. Take a look now, one big square tile " +
  "that's your x^2, five skinny rectangle tiles, and 6 negative unit tiles.";

describe('synthesizeTilesTab', () => {
  test('the production turn backfills a TILES tab command from the pinned problem', () => {
    const cmd = synthesizeTilesTab({
      tutorResponse: TILES_REPLY,
      pinnedProblemTex: 'x^2 + 5x - 6 = 0',
    });
    expect(cmd).toEqual({ tab: 'tiles', expression: 'x^2+5x-6' });
  });

  test('no promise language → no backfill (tiles mentioned in passing)', () => {
    expect(synthesizeTilesTab({
      tutorResponse: 'Algebra tiles are one way to think about factoring.',
      pinnedProblemTex: 'x^2 + 5x - 6',
    })).toBeNull();
  });

  test('no tiles mention → no backfill even with promise language', () => {
    expect(synthesizeTilesTab({
      tutorResponse: "Take a look now, here's the graph.",
      pinnedProblemTex: 'x^2 + 5x - 6',
    })).toBeNull();
  });

  test('non-tileable problem → null rather than garbage', () => {
    expect(synthesizeTilesTab({
      tutorResponse: TILES_REPLY,
      pinnedProblemTex: '\\frac{3}{4} + \\frac{1}{8}',
    })).toBeNull();
    expect(synthesizeTilesTab({ tutorResponse: TILES_REPLY, pinnedProblemTex: null })).toBeNull();
  });
});

describe('synthesizeAutoClear', () => {
  test('a NEW problem pose gets a clear prepended', () => {
    const out = synthesizeAutoClear({
      commands: [{ action: 'pose', tex: 'x^2 + 5x - 6 = 0' }],
      previousProblemTex: 'f(x) = |x| \\cdot 0.5',
    });
    expect(out[0]).toEqual({ action: 'clear' });
    expect(out[1].action).toBe('pose');
  });

  test('re-posing the same problem (format drift) does NOT clear', () => {
    const out = synthesizeAutoClear({
      commands: [{ action: 'pose', tex: 'x^{2} + 5x - 6 = 0' }],
      previousProblemTex: 'x^2+5x-6=0',
    });
    expect(out.some((c) => c.action === 'clear')).toBe(false);
  });

  test('no pose, an existing clear, or no previous pin → untouched', () => {
    const noPose = [{ action: 'resolve', tex: '2x = 16' }];
    expect(synthesizeAutoClear({ commands: noPose, previousProblemTex: 'y = 2' })).toEqual(noPose);

    const hasClear = [{ action: 'clear' }, { action: 'pose', tex: 'y = 3' }];
    expect(synthesizeAutoClear({ commands: hasClear, previousProblemTex: 'y = 2' })).toEqual(hasClear);

    const pose = [{ action: 'pose', tex: 'y = 3' }];
    expect(synthesizeAutoClear({ commands: pose, previousProblemTex: null })).toEqual(pose);
  });
});

describe('stripOrphanMathDelims', () => {
  test('the production leak: unclosed \\( is dropped, text kept', () => {
    expect(stripOrphanMathDelims('five skinny rectangle tiles your \\( x terms), and 6 unit tiles'))
      .toBe('five skinny rectangle tiles your  x terms), and 6 unit tiles');
  });

  test('balanced math is untouched', () => {
    const s = 'So \\(x^2 + 5x\\) factors, and \\[x = 2\\] works.';
    expect(stripOrphanMathDelims(s)).toBe(s);
  });

  test('orphan close is dropped; mixed balance handled', () => {
    expect(stripOrphanMathDelims('the result x\\) is fine')).toBe('the result x is fine');
    expect(stripOrphanMathDelims('\\(a\\) then \\(b')).toBe('\\(a\\) then b');
  });

  test('plain text passes through by reference-equal fast path', () => {
    const s = 'No math here at all.';
    expect(stripOrphanMathDelims(s)).toBe(s);
  });
});

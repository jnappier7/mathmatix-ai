/**
 * QA P1-2 — Work Board: duplicate cards + raw LaTeX.
 *
 * A multiplication check spawned a pile of cards including duplicates and
 * raw LaTeX: "6 * 7", "6 × 7 = 42", "6 \times 7 = 42 \". These are the
 * same content in different notations, so:
 *   1. dedup keyed on the raw string and never folded them → duplicates.
 *   2. the trailing lone "\" rendered as raw junk on the card.
 *
 * Fixes: normalizeForCompare canonicalizes operator synonyms (so the
 * variants dedupe), and sanitizeBoardTex strips trailing dangling
 * backslashes before render.
 */

const { dropRedundantPoses, _commandsOverlap } = require('../../utils/pipeline/boardSynthesizer');
const { sanitizeBoardTex, normalizeBoardCommand } = require('../../utils/boardResponseSchema');

describe('dedup — operator synonyms fold (commandsOverlap)', () => {
  const variants = ['6 × 7 = 42', '6 \\times 7 = 42', '6 * 7 = 42', '6 \\cdot 7 = 42', '6 · 7 = 42', '6 \\times 7 = 42 \\'];
  test('all multiplication notations of "6×7=42" are treated as the same card', () => {
    for (const v of variants) {
      expect(_commandsOverlap({ action: 'pose', tex: '6 × 7 = 42' }, { action: 'pose', tex: v })).toBe(true);
    }
  });
  test('genuinely different problems do NOT overlap', () => {
    expect(_commandsOverlap({ action: 'pose', tex: '6 × 7 = 42' }, { action: 'pose', tex: '9 × 6 = 54' })).toBe(false);
  });
  test('division synonyms fold too', () => {
    expect(_commandsOverlap({ action: 'resolve', tex: '12 ÷ 4 = 3' }, { action: 'resolve', tex: '12 \\div 4 = 3' })).toBe(true);
  });
});

describe('dropRedundantPoses — folds notation variants', () => {
  test('keeps one pose, drops the notation-variant duplicates', () => {
    const commands = [
      { action: 'pose', tex: '6 × 7 = 42' },
      { action: 'pose', tex: '6 \\times 7 = 42 \\' },
      { action: 'pose', tex: '6 * 7 = 42' },
    ];
    const { kept, dropped } = dropRedundantPoses(commands, null);
    expect(kept.filter(c => c.action === 'pose')).toHaveLength(1);
    expect(dropped).toHaveLength(2);
  });

  test('drops a pose that only restates the already-pinned problem (any notation)', () => {
    const commands = [{ action: 'pose', tex: '6 \\times 7 = 42' }];
    const { kept, dropped } = dropRedundantPoses(commands, '6 * 7 = 42');
    expect(kept.filter(c => c.action === 'pose')).toHaveLength(0);
    expect(dropped).toHaveLength(1);
  });
});

describe('sanitizeBoardTex — strips trailing dangling backslashes', () => {
  test('removes the trailing lone backslash artifact', () => {
    expect(sanitizeBoardTex('6 \\times 7 = 42 \\')).toBe('6 \\times 7 = 42');
    expect(sanitizeBoardTex('9 \\times 6 \\')).toBe('9 \\times 6');
    expect(sanitizeBoardTex('x = 8 \\\\')).toBe('x = 8');
  });
  test('leaves valid LaTeX command tokens in the body untouched', () => {
    expect(sanitizeBoardTex('\\frac{1}{2} + \\frac{1}{4}')).toBe('\\frac{1}{2} + \\frac{1}{4}');
    expect(sanitizeBoardTex('6 \\times 7 = 42')).toBe('6 \\times 7 = 42');
  });
});

describe('normalizeBoardCommand applies tex sanitization', () => {
  test('sanitizes tex and check fields, not op/query', () => {
    const out = normalizeBoardCommand({
      action: 'verify', tex: 'x = 8 \\', op: null, check: '2(8)+4 = 20 \\',
      fn: null, query: null, caption: null, model: null, spec: null, prompt: null,
    });
    expect(out.tex).toBe('x = 8');
    expect(out.check).toBe('2(8)+4 = 20');
  });
});

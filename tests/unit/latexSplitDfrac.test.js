/**
 * The split-\dfrac production bug (owner screenshot, 2026-07-26).
 *
 * Ground truth from the live DB: the tutor model emitted
 * "\\( \\d\\frac{5}{7} = \\d\\frac{x}{20} \\)" — \dfrac with a backslash
 * spliced in. KaTeX renders the unknown \d macro in red, and because the
 * board synthesizer poses verbatim from tutor text and history teaches the
 * model its own habits, one bad turn contaminated every surface. These pin
 * the repair at both server choke points.
 */
const { verify } = require('../../utils/pipeline/verify');
const { normalizeBoardCommand } = require('../../utils/boardResponseSchema');
const { cleanLatex } = require('../../public/js/living-workspace/dom/derivationView.js');

describe('verify rejoins split LaTeX commands in tutor text', () => {
  test('the exact production string comes out clean', async () => {
    const v = await verify("Try this one: \\( \\d\\frac{5}{7} = \\d\\frac{x}{20} \\)", {});
    expect(v.text).toContain('\\dfrac{5}{7}');
    expect(v.text).not.toMatch(/\\d\s*\\frac/);
  });

  test('\\t\\frac and \\displaystyle variants are handled; legit commands untouched', async () => {
    const v = await verify('\\( \\t\\frac{1}{2} \\) and \\( \\displaystyle \\frac{3}{4} \\) and \\( \\frac{a}{b} \\)', {});
    expect(v.text).toContain('\\tfrac{1}{2}');
    expect(v.text).toContain('\\frac{3}{4}');
    expect(v.text).toContain('\\frac{a}{b}');
    expect(v.text).not.toContain('\\displaystyle');
  });
});

describe('board tex sanitizer applies the same repair', () => {
  test('pose tex with split \\dfrac normalizes', () => {
    const cmd = normalizeBoardCommand({ action: 'pose', tex: '\\d\\frac{5}{7} = \\d\\frac{x}{20}' });
    expect(cmd.tex).toBe('\\dfrac{5}{7} = \\dfrac{x}{20}');
  });
});

describe('client cleanLatex tolerates ledgered pre-fix tex', () => {
  test('stored mangled tex renders as \\dfrac after cleaning', () => {
    expect(cleanLatex('\\d\\frac{5}{7} = \\d\\frac{x}{20}')).toBe('\\dfrac{5}{7} = \\dfrac{x}{20}');
    expect(cleanLatex('\\displaystyle \\frac{3}{4}')).toBe('\\frac{3}{4}');
  });
});

describe('normalizeLatex root cause: the backslash-restorer must not split \\dfrac', () => {
  const { normalizeLatex } = require('../../utils/pipeline/verify');

  test('\\dfrac / \\tfrac / \\arcsin survive normalization intact', () => {
    expect(normalizeLatex('\\( \\dfrac{5}{7} = \\dfrac{x}{20} \\)')).toContain('\\dfrac{5}{7}');
    expect(normalizeLatex('\\( \\tfrac{1}{2} \\)')).toContain('\\tfrac{1}{2}');
    expect(normalizeLatex('\\( \\arcsin{x} \\)')).toContain('\\arcsin{x}');
  });

  test('genuinely bare commands STILL get their backslash restored', () => {
    expect(normalizeLatex('\\( frac{3}{4} \\)')).toContain('\\frac{3}{4}');
    expect(normalizeLatex('\\( 2sqrt{7} \\)')).toContain('2\\sqrt{7}');
  });
});

describe('mangled delimiters and "\\." (production 2026-07-28: red raw-source board cards)', () => {
  const { normalizeLatex } = require('../../utils/pipeline/verify');
  const { healBoardTex, applyTurnToLedger } = require('../../utils/pipeline/boardLedger');

  test('an inline block closed with a bare ")" is re-closed properly', () => {
    expect(normalizeLatex('size 29 from \\( 2.9 \\div 0.1) and the sign'))
      .toContain('\\( 2.9 \\div 0.1\\)');
    expect(normalizeLatex('think \\( 1.9, 1.99, 1.999), f(x) is heading'))
      .toContain('\\( 1.9, 1.99, 1.999\\)');
  });

  test('correctly closed inline math is untouched', () => {
    for (const ok of ['\\( x \\)', '\\(2.9 \\div 0.1\\)', 'so \\( f(2) \\) fails']) {
      expect(normalizeLatex(ok)).toContain(ok.includes('f(2)') ? '\\( f(2) \\)' : ok);
    }
  });

  test('"\\." becomes a period; the accent form "\\.{x}" is preserved', () => {
    expect(normalizeLatex('so we get \\(29\\.\\)')).not.toContain('\\.');
    expect(normalizeLatex('accent \\.{o} stays')).toContain('\\.{o}');
  });

  test('healBoardTex strips delimiters, mangled periods, and dangling tails', () => {
    expect(healBoardTex('1 \\div (-0.1)\\.')).toBe('1 \\div (-0.1)');
    expect(healBoardTex('\\(x + 1\\)')).toBe('x + 1');
    expect(healBoardTex('$$\\frac{1}{2}$$')).toBe('\\frac{1}{2}');
    expect(healBoardTex('2x + 3 \\')).toBe('2x + 3');
    expect(healBoardTex('1 \\div \\boxed{} \\.')).toBe('1 \\div \\boxed{}');
    expect(healBoardTex('x^2 - 9')).toBe('x^2 - 9');
  });

  test('the ledger stores healed tex on pose and steps', () => {
    const ledger = applyTurnToLedger(null, [
      { action: 'pose', tex: '1 \\div (-0.1)\\.' },
      { action: 'step', tex: '\\(8 \\div (-2) = -4\\)' },
    ]);
    expect(ledger.current.problemTex).toBe('1 \\div (-0.1)');
    expect(ledger.current.steps[0].tex).toBe('8 \\div (-2) = -4');
  });
});

describe('client cleanLatex heals already-stored ledger tex', () => {
  test('the exact production board strings render as math, not red source', () => {
    expect(cleanLatex('1 \\div (-0.1)\\.')).toBe('1 \\div (-0.1).');
    expect(cleanLatex('1 \\div \\boxed{} \\.')).toBe('1 \\div \\boxed{} .');
    expect(cleanLatex('2x + 3 \\')).toBe('2x + 3');
  });
});

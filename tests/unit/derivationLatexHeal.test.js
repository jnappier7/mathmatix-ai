/**
 * Board latex healing — the two ways a work card ended up showing a student
 * raw LaTeX instead of math (owner screenshot, production 2026-08-23):
 *
 *   1. the problem was posed as \begin{align*}…\end{align*}. The card typesets
 *      INLINE, align* is display-only, and throwOnError:false does not throw —
 *      it paints the source in red. The whole 2x2 system read as
 *      "\begin{align*} 2x + 3y &= 6 \\ 4x - y &= 5 \end{align*}".
 *   2. a scaffold line arrived truncated ("\det(A) = \boxed"). Same red source,
 *      plus the blank lost its tappability: _wireBlanks looks for the .fbox
 *      KaTeX would have rendered, finds none, and falls back to a chip.
 *
 * cleanLatex heals both before KaTeX sees them; detex is the last resort for
 * anything that still will not parse.
 */
const { cleanLatex, detex, looksLikeProse } = require('../../public/js/living-workspace/dom/derivationView.js');

describe('cleanLatex maps display-only environments to their inline twins', () => {
  it('align/align* become aligned', () => {
    expect(cleanLatex('\\begin{align*} 2x + 3y &= 6 \\\\ 4x - y &= 5 \\end{align*}'))
      .toBe('\\begin{aligned} 2x + 3y &= 6 \\\\ 4x - y &= 5 \\end{aligned}');
    expect(cleanLatex('\\begin{align} a &= b \\end{align}'))
      .toBe('\\begin{aligned} a &= b \\end{aligned}');
  });

  it('gather → gathered, split → aligned, alignat → alignedat', () => {
    expect(cleanLatex('\\begin{gather*} x=1 \\end{gather*}')).toBe('\\begin{gathered} x=1 \\end{gathered}');
    expect(cleanLatex('\\begin{split} a &= b \\end{split}')).toBe('\\begin{aligned} a &= b \\end{aligned}');
    expect(cleanLatex('\\begin{alignat}{2} a &= b \\end{alignat}')).toBe('\\begin{alignedat}{2} a &= b \\end{alignedat}');
  });

  it('leaves environments KaTeX already renders inline alone', () => {
    for (const env of ['aligned', 'gathered', 'cases', 'pmatrix', 'bmatrix', 'matrix']) {
      const tex = '\\begin{' + env + '} a & b \\end{' + env + '}';
      expect(cleanLatex(tex)).toBe(tex);
    }
  });
});

describe('cleanLatex heals tex that was cut off mid-command', () => {
  it('gives a trailing argument-less command an empty group', () => {
    expect(cleanLatex('\\det(A) = \\boxed')).toBe('\\det(A) = \\boxed{}');
    expect(cleanLatex('x = \\frac')).toBe('x = \\frac{}');
    expect(cleanLatex('\\sqrt')).toBe('\\sqrt{}');
  });

  it('closes groups the stream never closed', () => {
    expect(cleanLatex('\\det(A) = \\boxed{')).toBe('\\det(A) = \\boxed{}');
    expect(cleanLatex('\\frac{1}{ad')).toBe('\\frac{1}{ad}');
  });

  it('counts only real groups — an escaped \\{ is a literal brace', () => {
    expect(cleanLatex('\\{ x : x > 0 \\}')).toBe('\\{ x : x > 0 \\}');
  });

  it('leaves well-formed tex untouched', () => {
    expect(cleanLatex('4(x + 9) = 6x - 4')).toBe('4(x + 9) = 6x - 4');
    expect(cleanLatex('\\boxed{ad - bc}')).toBe('\\boxed{ad - bc}');
  });
});

describe('an environment name is not a word', () => {
  // looksLikeProse counts 3+-letter runs. "aligned" appearing twice in
  // \begin{aligned}…\end{aligned} would otherwise push a two-line system
  // one real word away from being routed down the prose splitter.
  it('a multi-line system is math, not prose', () => {
    expect(looksLikeProse(cleanLatex('\\begin{align*} 2x + 3y &= 6 \\\\ 4x - y &= 5 \\end{align*}'))).toBe(false);
    expect(looksLikeProse('\\begin{aligned} \\text{cost} &= 5x \\end{aligned}')).toBe(false);
  });
});

describe('detex — the last resort when KaTeX still cannot parse', () => {
  it('shows the math characters instead of the source', () => {
    expect(detex('\\begin{align*} 2x + 3y &= 6 \\\\ 4x - y &= 5 \\end{align*}'))
      .toBe('2x + 3y = 6 ; 4x - y = 5');
  });

  it('keeps operators a student can read', () => {
    expect(detex('3 \\times 4 = 12')).toBe('3 × 4 = 12');
    expect(detex('12 \\div 4 = 3')).toBe('12 ÷ 4 = 3');
  });

  it('never leaves a backslash command on screen', () => {
    expect(detex('\\frac{1}{ad-bc}\\begin{pmatrix} d & -b')).not.toMatch(/\\/);
  });
});

// The ledger heals tex on the way IN so newly stored board state is already
// renderable (and so the board-state block the tutor reads back matches what
// the student sees). cleanLatex heals on the way OUT, which is what rescues
// everything ledgered before this fix. The two maps must agree.
describe('the ledger applies the same environment mapping', () => {
  const { healBoardTex } = require('../../utils/pipeline/boardLedger');

  it('stores the inline-safe twin', () => {
    expect(healBoardTex('\\begin{align*} 2x + 3y &= 6 \\\\ 4x - y &= 5 \\end{align*}'))
      .toBe('\\begin{aligned} 2x + 3y &= 6 \\\\ 4x - y &= 5 \\end{aligned}');
    expect(healBoardTex('\\begin{gather} x=1 \\end{gather}')).toBe('\\begin{gathered} x=1 \\end{gathered}');
  });

  it('agrees with the client on every mapped environment', () => {
    for (const env of ['align', 'align*', 'gather', 'gather*', 'split', 'eqnarray', 'multline']) {
      const tex = '\\begin{' + env + '} a &= b \\end{' + env + '}';
      expect(healBoardTex(tex)).toBe(cleanLatex(tex));
    }
  });

  it('leaves matrices and cases alone', () => {
    expect(healBoardTex('\\begin{pmatrix} 1 & 2 \\end{pmatrix}')).toBe('\\begin{pmatrix} 1 & 2 \\end{pmatrix}');
  });
});

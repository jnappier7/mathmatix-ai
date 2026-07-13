/**
 * mathDelimiters — LaTeX delimiter protection for the chat renderer.
 *
 * The bug this guards against (real transcript, Mr. Nappier teaching sine
 * waves): the tutor omitted a single closing `\]`, so the old non-greedy
 * scan bridged from the first `\[` to the NEXT `\]` two paragraphs later and
 * fed the entire explanation to KaTeX as one block. KaTeX strips whitespace,
 * so the student saw:
 *   "y=Asin(B(x−C))+DHere'swhateachpartmeans:−Aistheamplitude..."
 *
 * The fix: a math block can never cross a blank line, so a stray opener
 * auto-closes at the paragraph break and the prose is left for markdown.
 */

const { protectMathBlocks } = require('../../public/js/mathDelimiters');

const PH = (i) => `@@LATEX_BLOCK_${i}@@`;

describe('protectMathBlocks — well-formed math', () => {
  test('captures a balanced display block', () => {
    const { text, blocks } = protectMathBlocks('See \\[ x^2 - 4 \\] here', PH);
    expect(blocks).toEqual([{ math: 'x^2 - 4', display: true }]);
    expect(text).toBe('See @@LATEX_BLOCK_0@@ here');
  });

  test('captures a balanced inline block', () => {
    const { text, blocks } = protectMathBlocks('So \\( x = 1 \\) then', PH);
    expect(blocks).toEqual([{ math: 'x = 1', display: false }]);
    expect(text).toBe('So @@LATEX_BLOCK_0@@ then');
  });

  test('display blocks are indexed before inline blocks', () => {
    const { blocks } = protectMathBlocks('\\( a \\) and \\[ b \\]', PH);
    // display pass runs first → \[ b \] becomes block 0
    expect(blocks[0]).toEqual({ math: 'b', display: true });
    expect(blocks[1]).toEqual({ math: 'a', display: false });
  });

  test('multiple display blocks across paragraphs are captured separately', () => {
    const input = '\\[ x = 1 \\]\n\n\\[ y = 2 \\]';
    const { blocks } = protectMathBlocks(input, PH);
    expect(blocks).toEqual([
      { math: 'x = 1', display: true },
      { math: 'y = 2', display: true },
    ]);
  });

  test('multi-line aligned environment (no blank line) stays intact', () => {
    const aligned = '\\[\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}\\]';
    const { blocks } = protectMathBlocks(aligned, PH);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].display).toBe(true);
    expect(blocks[0].math).toContain('\\begin{aligned}');
    expect(blocks[0].math).toContain('\\end{aligned}');
  });
});

describe('protectMathBlocks — the over-capture regression', () => {
  // Exactly the failure mode: opening \[ with NO closing \], prose in between,
  // then a *later* well-formed display block at the end.
  const buggy = [
    '\\[ y = A\\sin(B(x - C)) + D',          // <-- missing closing \]
    '',
    "Here's what each part means:",
    '- A is the amplitude (how tall the wave is).',
    '- B affects the frequency.',
    '',
    'If we set A=1, B=2, C=0, and D=0, we get:',
    '',
    '\\[ y = \\sin(2x) \\]',
  ].join('\n');

  test('the stray opener auto-closes at the paragraph break', () => {
    const { blocks } = protectMathBlocks(buggy, PH);
    // First block is JUST the first formula — not the whole message.
    expect(blocks[0]).toEqual({ math: 'y = A\\sin(B(x - C)) + D', display: true });
  });

  test('prose is NOT swallowed into a math block', () => {
    const { text, blocks } = protectMathBlocks(buggy, PH);
    // The explanation survives as ordinary text for markdown to render.
    expect(text).toContain("Here's what each part means:");
    expect(text).toContain('- A is the amplitude (how tall the wave is).');
    expect(text).toContain('If we set A=1, B=2, C=0, and D=0, we get:');
    // No block contains the prose.
    for (const b of blocks) {
      expect(b.math).not.toContain('amplitude');
      expect(b.math).not.toContain('Here');
    }
  });

  test('the trailing well-formed formula is still captured on its own', () => {
    const { blocks } = protectMathBlocks(buggy, PH);
    expect(blocks).toContainEqual({ math: 'y = \\sin(2x)', display: true });
  });
});

describe('protectMathBlocks — unclosed at edges', () => {
  test('unclosed inline auto-closes at a blank line, sparing the next paragraph', () => {
    const input = 'Try \\( x = 5\n\nNew paragraph.';
    const { text, blocks } = protectMathBlocks(input, PH);
    expect(blocks).toEqual([{ math: 'x = 5', display: false }]);
    expect(text).toContain('New paragraph.');
  });

  test('unclosed display at end-of-string closes at EOF', () => {
    const { blocks } = protectMathBlocks('Final: \\[ x = 5', PH);
    expect(blocks).toEqual([{ math: 'x = 5', display: true }]);
  });
});

describe('protectMathBlocks — edge inputs', () => {
  test('null/undefined/empty are safe', () => {
    expect(protectMathBlocks(null, PH)).toEqual({ text: '', blocks: [] });
    expect(protectMathBlocks(undefined, PH)).toEqual({ text: '', blocks: [] });
    expect(protectMathBlocks('', PH)).toEqual({ text: '', blocks: [] });
  });

  test('plain text with no math is untouched', () => {
    const { text, blocks } = protectMathBlocks('just words here', PH);
    expect(text).toBe('just words here');
    expect(blocks).toEqual([]);
  });
});

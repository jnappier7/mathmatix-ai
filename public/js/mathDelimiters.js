// public/js/mathDelimiters.js
//
// Pure, dependency-free LaTeX-delimiter protection for the chat renderer.
//
// WHY THIS EXISTS
// The tutor LLM occasionally emits an UNBALANCED math delimiter — e.g. it
// opens `\[` for a display equation but forgets the closing `\]`. A naive
// non-greedy scan (`/\\\[([\s\S]*?)\\\]/`) then bridges from that stray `\[`
// all the way to the NEXT `\]` several paragraphs later, swallowing the whole
// explanation into a single KaTeX block. KaTeX discards whitespace, so the
// student sees prose collapsed into one space-stripped wall:
//   "y=Asin(B(x−C))+DHere'swhateachpartmeans:−Aistheamplitude..."
// (the bullet dashes "- A" even become math minus signs "−A").
//
// THE RULE
// A math block can never span a paragraph break (a blank line). Real math —
// even multi-line `aligned` / `cases` / `matrix` environments — never contains
// a blank line, so terminating a block at the first blank line is safe and
// bounds the blast radius of one missing delimiter to *nothing*: the stray
// opener simply closes itself at the paragraph break and the prose after it is
// left alone for markdown to render normally.
//
// Loaded as a classic <script> (sets window.MathDelimiters) AND require()-able
// in Node for unit tests — same UMD pattern as graphTitleSync.js.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MathDelimiters = api;
})(typeof window !== 'undefined'
  ? window
  : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  // Open the delimiter, then lazily capture until the FIRST of:
  //   - the matching close delimiter (consumed), OR
  //   - a paragraph break / blank line  (NOT consumed — block auto-closes), OR
  //   - end of string.
  // The lazy quantifier + alternation makes the earliest terminator win, so a
  // well-formed block still closes at its real `\]` / `\)` while a stray opener
  // can never reach past a blank line.
  const DISPLAY_RE = /\\\[([\s\S]*?)(?:\\\]|(?=\n[ \t]*\n)|$)/g;
  const INLINE_RE  = /\\\(([\s\S]*?)(?:\\\)|(?=\n[ \t]*\n)|$)/g;

  /**
   * Replace LaTeX delimiters with placeholders so markdown can be parsed
   * without mangling the math. Display blocks are extracted before inline ones
   * so a `\[ ... \]` region is never re-scanned for `\( ... \)`.
   *
   * @param {string} text                    raw message text
   * @param {(index:number)=>string} placeholder  builds the sentinel, e.g.
   *                                          `i => '@@LATEX_BLOCK_' + i + '@@'`
   * @returns {{ text: string, blocks: Array<{math:string, display:boolean}> }}
   */
  function protectMathBlocks(text, placeholder) {
    const blocks = [];
    let out = (text == null) ? '' : String(text);

    out = out.replace(DISPLAY_RE, (_match, math) => {
      const i = blocks.length;
      blocks.push({ math: math.trim(), display: true });
      return placeholder(i);
    });

    out = out.replace(INLINE_RE, (_match, math) => {
      const i = blocks.length;
      blocks.push({ math: math.trim(), display: false });
      return placeholder(i);
    });

    return { text: out, blocks };
  }

  return { protectMathBlocks };
});
